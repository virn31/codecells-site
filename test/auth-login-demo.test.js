// Cobertura del hallazgo: api/auth-login.js emitía token tipo:'paciente' de
// 24h para códigos demo (CC-PAC-DEMO*/9900*, `Es demo`=true en PACIENTES) —
// una credencial de escritura publicada en cualquier captura/demo ante
// Regene Global (CLAUDE.md §5, §10). Decisión: no rechazar el login, emitir
// un tipo de sesión distinto ('demo') con TTL corto. Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';

const test = require('node:test');
const assert = require('node:assert');

const { verificarToken } = require('../lib/auth');

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const COD_DEMO = 'CC-PAC-DEMO01';
const COD_REAL = 'CC-PAC-9001';

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

function requerirAuthLoginFresco() {
  delete require.cache[require.resolve('../api/auth-login.js')];
  return require('../api/auth-login.js');
}

function instalarFetchMock() {
  const original = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.includes(`/${TBL_PACIENTES}?`)) {
      if (u.includes(encodeURIComponent(COD_DEMO))) {
        return ok({ records: [{ id: 'recDEMO01', fields: { 'Código de paciente': COD_DEMO, 'Es demo': true } }] });
      }
      if (u.includes(encodeURIComponent(COD_REAL))) {
        return ok({ records: [{ id: 'recREAL01', fields: { 'Código de paciente': COD_REAL } }] }); // sin `Es demo`
      }
      return ok({ records: [] });
    }
    throw new Error(`fetch no mockeado en esta prueba: ${u}`);
  };
  return () => { global.fetch = original; };
}

test('auth-login: código demo (Es demo=true) → tipo de sesión "demo", NUNCA "paciente"', async () => {
  const restaurar = instalarFetchMock();
  try {
    const handler = requerirAuthLoginFresco();
    const req = { method: 'POST', body: { tipo: 'paciente', codigo: COD_DEMO } };
    const res = fakeRes();
    await handler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.tipo, 'demo');
    assert.notStrictEqual(res.body.tipo, 'paciente');

    const payload = verificarToken(res.body.token);
    assert.ok(payload, 'el token debe verificar correctamente');
    assert.strictEqual(payload.tipo, 'demo');
    assert.strictEqual(payload.codigo, COD_DEMO);
  } finally { restaurar(); }
});

test('auth-login: código demo → TTL de 30 minutos, no 24 horas', async () => {
  const restaurar = instalarFetchMock();
  try {
    const handler = requerirAuthLoginFresco();
    const req = { method: 'POST', body: { tipo: 'paciente', codigo: COD_DEMO } };
    const res = fakeRes();
    const antes = Date.now();
    await handler(req, res);

    assert.strictEqual(res.body.horasValidez, 0.5);
    const payload = verificarToken(res.body.token);
    const duracionMs = payload.exp - payload.iat;
    assert.strictEqual(duracionMs, 30 * 60 * 1000);

    // A los 31 min (más allá del TTL) el token ya no debe verificar.
    const original = Date.now;
    Date.now = () => antes + 31 * 60 * 1000;
    try {
      assert.strictEqual(verificarToken(res.body.token), null, 'un token demo de 31 min debe rechazarse');
    } finally { Date.now = original; }
  } finally { restaurar(); }
});

test('auth-login: paciente REAL (sin `Es demo`) → sigue emitiendo tipo:"paciente" con 24h, sin regresión', async () => {
  const restaurar = instalarFetchMock();
  try {
    const handler = requerirAuthLoginFresco();
    const req = { method: 'POST', body: { tipo: 'paciente', codigo: COD_REAL } };
    const res = fakeRes();
    await handler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.tipo, 'paciente');
    assert.strictEqual(res.body.horasValidez, 24);

    const payload = verificarToken(res.body.token);
    assert.strictEqual(payload.tipo, 'paciente');
    assert.strictEqual(payload.exp - payload.iat, 24 * 60 * 60 * 1000);
  } finally { restaurar(); }
});
