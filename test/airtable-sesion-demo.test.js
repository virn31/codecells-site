// Cobertura del bloque `tipo === 'demo'` en api/airtable.js — la mitad
// backend del cierre del hallazgo de api/auth-login.js (ver
// test/auth-login-demo.test.js para la emisión del token). Verifica que
// una sesión demo:
//   1) lee su propio expediente (GET) exactamente como 'paciente',
//   2) recibe 403 incondicional en CUALQUIER escritura, sin depender de
//      CONGELADO (que hoy es true en producción — el 403 de esta prueba
//      tiene que ser el de "sesión demo", no el del freeze legal),
//   3) deja constancia en ACCESOS_EXPEDIENTE marcada `Es demo`=true.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';

const test = require('node:test');
const assert = require('node:assert');

const { generarToken } = require('../lib/auth');

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_ACCESOS = 'tblSpORAqLKxYOI6W';
const COD_DEMO = 'CC-PAC-DEMO01';

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    setHeader() {},
    end() { return this; },
  };
}

function requerirAirtableFresco() {
  delete require.cache[require.resolve('../api/airtable.js')];
  return require('../api/airtable.js');
}

function instalarFetchMock({ capturas = {} } = {}) {
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.includes(TBL_PACIENTES)) {
      if (u.includes(encodeURIComponent(COD_DEMO))) {
        return ok({ records: [{ id: 'recDEMO01', fields: { 'Código de paciente': COD_DEMO, 'Es demo': true } }] });
      }
      return ok({ records: [] });
    }
    if (metodo === 'POST' && u.includes(TBL_ACCESOS)) {
      capturas.accesoRegistrado = JSON.parse(opts.body).records[0].fields;
      return ok({ records: [{ id: 'recACC01' }] });
    }
    throw new Error(`fetch no mockeado en esta prueba: ${metodo} ${u}`);
  };
  return () => { global.fetch = original; };
}

test('airtable.js: sesión demo, GET pacientes → lee su propio expediente (mismo patrón que paciente)', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const handler = requerirAirtableFresco();
    const token = generarToken({ tipo: 'demo', codigo: COD_DEMO, horas: 0.5 });
    const req = {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      query: { tabla: 'pacientes' },
      body: {},
    };
    const res = fakeRes();
    await handler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.records[0].fields['Código de paciente'], COD_DEMO);
    assert.strictEqual(capturas.accesoRegistrado['Es demo'], true, 'la lectura demo debe quedar marcada en ACCESOS_EXPEDIENTE');
  } finally { restaurar(); }
});

for (const tabla of ['pacientes', 'historia', 'consultas', 'labs']) {
  for (const metodo of ['POST', 'PATCH']) {
    test(`airtable.js: sesión demo, ${metodo} ${tabla} → 403 incondicional (nunca llega a Airtable ni depende de CONGELADO)`, async () => {
      const capturas = {};
      const restaurar = instalarFetchMock({ capturas });
      try {
        const handler = requerirAirtableFresco();
        const token = generarToken({ tipo: 'demo', codigo: COD_DEMO, horas: 0.5 });
        const req = {
          method: metodo,
          headers: { authorization: `Bearer ${token}` },
          query: { tabla, recordId: 'recCualquiera' },
          body: { fields: { 'Peso': 70 } },
        };
        const res = fakeRes();
        await handler(req, res);

        assert.strictEqual(res.statusCode, 403, JSON.stringify(res.body));
        assert.strictEqual(res.body.error, 'Las sesiones demo son de solo lectura.');
        assert.strictEqual(capturas.accesoRegistrado['Es demo'], true, 'el intento de escritura rechazado también debe quedar marcado en ACCESOS_EXPEDIENTE');
        assert.strictEqual(capturas.accesoRegistrado['Resultado'], 'Rechazado');
      } finally { restaurar(); }
    });
  }
}

test('airtable.js: sesión demo, GET de una tabla fuera de whitelist (ej. medicos) → 403', async () => {
  const restaurar = instalarFetchMock();
  try {
    const handler = requerirAirtableFresco();
    const token = generarToken({ tipo: 'demo', codigo: COD_DEMO, horas: 0.5 });
    const req = {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      query: { tabla: 'medicos' },
      body: {},
    };
    const res = fakeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 403, JSON.stringify(res.body));
  } finally { restaurar(); }
});
