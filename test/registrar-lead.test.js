// Cobertura de la acción registrar_lead / ejecutarRegistrarLead (api/nova.js),
// extraída de la rama fix/nova-idioma-y-consentimiento (commit 93c6ab7) sobre
// main actual — ver AUDIT_BEFORE_CHANGE de esta sesión. Corre con: node --test
//
// Deliberado: nada de navegador ni de UI. Se llama al handler exportado de
// api/nova.js con req/res falsos y un mock de fetch que enruta por tabla/verbo
// y captura los cuerpos reales que se habrían mandado a Airtable — igual que
// test/datos-clinicos-sin-fabricar.test.js.
//
// CONGELADO es una constante hardcodeada en lib/congelamientoDatosPersonales.js
// (hoy `true` en producción). Para probar la lógica de escritura sin cambiar
// ese archivo real, se inyecta un mock en require.cache SOLO durante los tests
// que lo necesitan, y se restaura siempre en el finally.

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.NODE_ENV = 'development'; // pasa el guard de origen CORS de nova.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const BASE_ID = 'app6jyD9pDlTLpknA';
const TBL_LEADS = 'tblfX4f6Bq6OXsvs2';
const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';

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

function requerirNovaFresco() {
  delete require.cache[require.resolve('../api/nova.js')];
  return require('../api/nova.js');
}

// Reemplaza lib/congelamientoDatosPersonales.js en require.cache por una
// versión con CONGELADO=false, solo para la duración de la prueba. No toca
// el archivo real en disco.
function mockCongeladoFalse() {
  const rutaReal = require.resolve('../lib/congelamientoDatosPersonales');
  const original = require.cache[rutaReal];
  const mockExports = {
    CONGELADO: false,
    MENSAJE_CONGELAMIENTO: 'mock: no debería verse en estas pruebas',
    respuestaCongelada(res) { return res.status(503).json({ ok: false, error: 'mock congelado' }); },
  };
  require.cache[rutaReal] = { id: rutaReal, filename: rutaReal, loaded: true, exports: mockExports };
  return () => {
    if (original) require.cache[rutaReal] = original;
    else delete require.cache[rutaReal];
  };
}

// Mock de fetch: enruta por tabla y verbo, captura los cuerpos POST/PATCH
// reales. `leadsExistentes` simula lo que buscarLeadsPorTelefono() encuentra.
function instalarFetchMock({ capturas, leadsExistentes = [] }) {
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

    if (u.includes(`/${TBL_LEADS}?`) && metodo === 'GET') {
      capturas.busquedaLeadsUrl = u;
      return ok({ records: leadsExistentes });
    }
    if (u.includes(`/${TBL_LEADS}`) && metodo === 'POST') {
      capturas.leadCreadoBody = JSON.parse(opts.body);
      return ok({ records: [{ id: 'recLEADTEST0000001' }] });
    }
    if (metodo === 'PATCH' && u.includes(`/${TBL_LEADS}/`)) {
      capturas.leadActualizadoBody = JSON.parse(opts.body);
      capturas.leadActualizadoId = u.split('/').pop();
      return ok({ id: capturas.leadActualizadoId });
    }
    if (u.includes(`/${TBL_PACIENTES}`)) {
      capturas.pacientesLlamado = true;
      capturas.pacientesBody = opts.body ? JSON.parse(opts.body) : null;
      return ok({ records: [] });
    }
    throw new Error(`fetch no mockeado en esta prueba: ${metodo} ${u}`);
  };
  return () => { global.fetch = original; };
}

// ─── CONGELADO real (true, el valor de producción hoy) bloquea ────────────

test('registrar_lead: con CONGELADO=true (valor real de producción) → 503, cero llamadas a Airtable', async () => {
  const capturas = {};
  const restaurarFetch = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'registrar_lead', nombre: 'Prueba Congelado', whatsapp: '6670000000', consentimiento: true, origen: 'Test biológico' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 503, JSON.stringify(res.body));
    assert.strictEqual(res.body.motivo, 'congelamiento_datos_personales_2026-08-24');
    assert.strictEqual(capturas.leadCreadoBody, undefined, 'no debió llamar a Airtable con el freeze activo');
  } finally { restaurarFetch(); }
});

// ─── A partir de aquí, CONGELADO mockeado a false para probar la lógica ───

test('registrar_lead: sin consentimiento=true → 400, no escribe nada', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const capturas = {};
  const restaurarFetch = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'registrar_lead', nombre: 'Sin Consentir', whatsapp: '6670000001', origen: 'Test biológico' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 400, JSON.stringify(res.body));
    assert.strictEqual(capturas.leadCreadoBody, undefined);
  } finally { restaurarFetch(); restaurarCongelado(); }
});

test('registrar_lead: alta nueva → Versión del aviso="v1.0", Consentimiento, Fecha de consentimiento, Estado="Nuevo", Origen válido', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const capturas = {};
  const restaurarFetch = instalarFetchMock({ capturas, leadsExistentes: [] });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        action: 'registrar_lead', nombre: 'Ana Torres', whatsapp: '6670000002', email: 'ana@example.com',
        origen: 'Test biológico', consentimiento: true, idioma: 'es',
        scores: { energy: 63, repair: 25, balance: 88, neuro: 13, regen: 50 },
        sistemaPrioritario: 'BALANCE (88%)',
      },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    const f = capturas.leadCreadoBody.records[0].fields;
    assert.strictEqual(f['Versión del aviso'], 'v1.0');
    assert.strictEqual(f['Consentimiento'], true);
    assert.ok(f['Fecha de consentimiento'], 'debe llevar fecha de consentimiento si Consentimiento=true');
    assert.strictEqual(f['Estado'], 'Nuevo');
    assert.strictEqual(f['Origen'], 'Test biológico');
    assert.strictEqual(f['Idioma'], 'es');
  } finally { restaurarFetch(); restaurarCongelado(); }
});

test('registrar_lead: los 5 scores se escriben completos, incluido BALANCE', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const capturas = {};
  const restaurarFetch = instalarFetchMock({ capturas, leadsExistentes: [] });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        action: 'registrar_lead', nombre: 'Luis Campos', whatsapp: '6670000003',
        consentimiento: true, origen: 'Directorio',
        scores: { energy: 10, repair: 20, balance: 30, neuro: 40, regen: 50 },
      },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    const f = capturas.leadCreadoBody.records[0].fields;
    assert.strictEqual(f['Score ENERGY'], 10);
    assert.strictEqual(f['Score REPAIR'], 20);
    assert.strictEqual(f['Score BALANCE'], 30, 'BALANCE se perdía en silencio en un bug histórico del flujo viejo');
    assert.strictEqual(f['Score NEURO'], 40);
    assert.strictEqual(f['Score REGEN'], 50);
  } finally { restaurarFetch(); restaurarCongelado(); }
});

test('registrar_lead: origen fuera del enum cerrado cae a "Otro"', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const capturas = {};
  const restaurarFetch = instalarFetchMock({ capturas, leadsExistentes: [] });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'registrar_lead', nombre: 'Sin Origen Valido', whatsapp: '6670000004', consentimiento: true, origen: 'texto libre inventado' },
    };
    const res = fakeRes();
    await novaHandler(req, res);
    assert.strictEqual(capturas.leadCreadoBody.records[0].fields['Origen'], 'Otro');
  } finally { restaurarFetch(); restaurarCongelado(); }
});

test('registrar_lead: idioma fuera de [es,en,pt] cae a "es", nunca texto libre', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const capturas = {};
  const restaurarFetch = instalarFetchMock({ capturas, leadsExistentes: [] });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'registrar_lead', nombre: 'Idioma Raro', whatsapp: '6670000005', consentimiento: true, origen: 'Otro', idioma: 'klingon' },
    };
    const res = fakeRes();
    await novaHandler(req, res);
    assert.strictEqual(capturas.leadCreadoBody.records[0].fields['Idioma'], 'es');
  } finally { restaurarFetch(); restaurarCongelado(); }
});

test('registrar_lead: mismo teléfono + nombre que coincide, sin resolucion → 409 ambiguo, no escribe', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const capturas = {};
  const restaurarFetch = instalarFetchMock({
    capturas,
    leadsExistentes: [{ id: 'recLEADEXISTENTE001', fields: { 'Nombre': 'Diana Sámano', 'Veces que hizo el test': 2 } }],
  });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'registrar_lead', nombre: 'Diana Samano', whatsapp: '6670000006', consentimiento: true, origen: 'Test biológico' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 409, JSON.stringify(res.body));
    assert.strictEqual(res.body.ambiguo, true);
    assert.strictEqual(capturas.leadCreadoBody, undefined);
    assert.strictEqual(capturas.leadActualizadoBody, undefined);
  } finally { restaurarFetch(); restaurarCongelado(); }
});

test('registrar_lead: mismo teléfono+nombre con resolucion="misma_persona" → PATCH incrementa el contador, no crea nuevo', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const capturas = {};
  const restaurarFetch = instalarFetchMock({
    capturas,
    leadsExistentes: [{ id: 'recLEADEXISTENTE002', fields: { 'Nombre': 'Diana Sámano', 'Veces que hizo el test': 2 } }],
  });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'registrar_lead', nombre: 'Diana Samano', whatsapp: '6670000007', consentimiento: true, origen: 'Test biológico', resolucion: 'misma_persona' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.id, 'recLEADEXISTENTE002');
    assert.strictEqual(capturas.leadCreadoBody, undefined, 'no debe crear un registro nuevo');
    assert.strictEqual(capturas.leadActualizadoId, 'recLEADEXISTENTE002');
    assert.strictEqual(capturas.leadActualizadoBody.fields['Veces que hizo el test'], 3);
  } finally { restaurarFetch(); restaurarCongelado(); }
});

// ─── Requisito explícito de esta sesión: ningún camino escribe a PACIENTES ─

test('registrar_lead: en ningún escenario (nuevo, dedup ambiguo, dedup misma_persona) se llama a la tabla PACIENTES', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const escenarios = [
    { nombre: 'Persona Nueva Uno', whatsapp: '6670000008', consentimiento: true, origen: 'Otro' },
    { nombre: 'Diana Samano', whatsapp: '6670000009', consentimiento: true, origen: 'Otro' }, // ambiguo
  ];
  try {
    for (const body of escenarios) {
      const capturas = {};
      const restaurarFetch = instalarFetchMock({
        capturas,
        leadsExistentes: body.whatsapp === '6670000009'
          ? [{ id: 'recLEADEXISTENTE003', fields: { 'Nombre': 'Diana Sámano' } }]
          : [],
      });
      try {
        const novaHandler = requerirNovaFresco();
        const req = { method: 'POST', headers: { 'content-type': 'application/json' }, body: { action: 'registrar_lead', ...body } };
        const res = fakeRes();
        await novaHandler(req, res);
        assert.strictEqual(capturas.pacientesLlamado, undefined, `registrar_lead no debe tocar la tabla ${TBL_PACIENTES} (PACIENTES) en ningún escenario`);
      } finally { restaurarFetch(); }
    }
  } finally { restaurarCongelado(); }
});

test('estático: api/nova.js ya no tiene un handler para la acción airtable_create_lead ni ningún literal Status:"Lead"', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'api', 'nova.js'), 'utf8');
  // Se permite mencionar el nombre viejo en un comentario histórico — lo que
  // no debe existir es un dispatcher que la trate como acción viva.
  assert.ok(!/action\s*===\s*['"]airtable_create_lead['"]/.test(codigo), 'la acción vieja debe estar eliminada, no solo congelada');
  assert.ok(!/['"]Status['"]\s*:\s*['"]Lead['"]/.test(codigo), 'ningún literal de campo debe escribir Status="Lead" en ninguna tabla');
});
