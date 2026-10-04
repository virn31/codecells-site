// Cobertura del POST a ANTECEDENTES_OBSTETRICOS que hace kiosco.html
// (pantalla "Antecedentes gineco-obstétricos") a través de api/airtable.js.
// Verifica que:
//   1) un médico principal escribe, y el servidor FUERZA Paciente, Código de
//      paciente ref y Registrado por (aunque el cliente mande otros),
//   2) un médico ajeno recibe 403 sin que nada llegue a la tabla,
//   3) un paciente demo es de solo lectura (403),
//   4) sin sesión → 401,
//   5) con CONGELADO=true (producción) → 503 sin tocar la tabla.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';

const test = require('node:test');
const assert = require('node:assert');

const { generarToken } = require('../lib/auth');

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const TBL_INTERCONSULTAS = 'tbl9PS3KNBxbRVriV';
const TBL_ANTECEDENTES = 'tblkoqYv4ASLFkzsp';
const TBL_ACCESOS = 'tblSpORAqLKxYOI6W';

const MED_PROPIO = 'CCMED-PROP01';
const MED_AJENO = 'CCMED-AJEN01';
const PAC_REAL = 'CC-PAC-200001';
const PAC_DEMO = 'CC-PAC-DEMO01';

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

// CONGELADO se fija en la prueba, no por variables de entorno: así el
// resultado no depende de cómo esté configurado el congelamiento en el repo
// (hoy `true` fijo en producción). Se conserva la respuestaCongelada real.
function cargarHandler({ congelado }) {
  const rutaCongelamiento = require.resolve('../lib/congelamientoDatosPersonales.js');
  delete require.cache[rutaCongelamiento];
  const real = require(rutaCongelamiento);
  require.cache[rutaCongelamiento].exports = { ...real, CONGELADO: congelado };
  delete require.cache[require.resolve('../api/airtable.js')];
  return require('../api/airtable.js');
}

function instalarFetchMock(capturas) {
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const metodo = opts.method || 'GET';
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.includes(TBL_MEDICOS)) {
      if (u.includes(MED_PROPIO)) return ok({ records: [{ id: 'recMEDPROP', fields: { 'Código de médico': MED_PROPIO, 'Tipo de acceso': 'Clinico' } }] });
      if (u.includes(MED_AJENO)) return ok({ records: [{ id: 'recMEDAJEN', fields: { 'Código de médico': MED_AJENO, 'Tipo de acceso': 'Clinico' } }] });
      return ok({ records: [] });
    }
    if (u.includes(TBL_PACIENTES)) {
      if (u.includes(PAC_REAL)) return ok({ records: [{ id: 'recPACREAL', fields: { 'Código de paciente': PAC_REAL, 'Médico_principal': ['recMEDPROP'] } }] });
      if (u.includes(PAC_DEMO)) return ok({ records: [{ id: 'recPACDEMO', fields: { 'Código de paciente': PAC_DEMO, 'Es demo': true, 'Médico_principal': ['recMEDPROP'] } }] });
      return ok({ records: [] });
    }
    // VINCULACIONES (vía 'vinculado'): sin vínculos salvo que la prueba diga otra cosa.
    if (u.includes('VINCULACIONES')) return ok({ records: [] });
    if (u.includes(TBL_INTERCONSULTAS)) return ok({ records: [] });
    if (u.includes(TBL_ACCESOS)) return ok({ records: [{ id: 'recACC' }] });
    if (metodo === 'POST' && u.includes(TBL_ANTECEDENTES)) {
      capturas.postAntecedentes = JSON.parse(opts.body);
      return ok({ id: 'recNUEVO', fields: capturas.postAntecedentes.fields });
    }
    throw new Error(`fetch no mockeado en esta prueba: ${metodo} ${u}`);
  };
  return () => { global.fetch = original; };
}

function reqPost({ codigoMedico, pacienteBuscado, fields }) {
  const headers = codigoMedico ? { authorization: `Bearer ${generarToken({ tipo: 'medico', codigo: codigoMedico, horas: 1 })}` } : {};
  return {
    method: 'POST',
    headers,
    query: { tabla: 'antecedentes_obstetricos', pacienteBuscado },
    body: { fields },
  };
}

const FIELDS_KIOSCO = {
  'Categoría': 'Evento obstétrico',
  'Tipo de evento': 'Cesárea',
  'Fecha del evento': '2021-05-02',
  'Complicaciones': 'Preeclampsia',
};

test('kiosco antecedentes GO: médico principal → llega a ANTECEDENTES_OBSTETRICOS con Paciente, Código ref y Registrado por forzados', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock(capturas);
  try {
    const handler = cargarHandler({ congelado: false });
    const res = fakeRes();
    // El cliente intenta imponer otro paciente y otro autor — el servidor debe ignorarlo.
    await handler(reqPost({
      codigoMedico: MED_PROPIO,
      pacienteBuscado: PAC_REAL,
      fields: { ...FIELDS_KIOSCO, 'Paciente': ['recOTRO'], 'Registrado por': ['recMEDAJEN'] },
    }), res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    const f = capturas.postAntecedentes.fields;
    assert.deepStrictEqual(f['Paciente'], ['recPACREAL']);
    assert.strictEqual(f['Código de paciente ref'], PAC_REAL);
    assert.deepStrictEqual(f['Registrado por'], ['recMEDPROP']);
    assert.ok(f['Fecha de registro'], 'Fecha de registro la pone el servidor');
    assert.strictEqual(f['Tipo de evento'], 'Cesárea');
    assert.strictEqual(f['Complicaciones'], 'Preeclampsia');
    assert.strictEqual(capturas.postAntecedentes.typecast, undefined, 'sin typecast: una opción desconocida debe fallar, no crearse');
  } finally { restaurar(); }
});

test('kiosco antecedentes GO: médico ajeno → 403 y nada llega a la tabla', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock(capturas);
  try {
    const handler = cargarHandler({ congelado: false });
    const res = fakeRes();
    await handler(reqPost({ codigoMedico: MED_AJENO, pacienteBuscado: PAC_REAL, fields: FIELDS_KIOSCO }), res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(capturas.postAntecedentes, undefined);
  } finally { restaurar(); }
});

test('kiosco antecedentes GO: paciente demo → 403 (solo lectura), aunque el médico sea su principal', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock(capturas);
  try {
    const handler = cargarHandler({ congelado: false });
    const res = fakeRes();
    await handler(reqPost({ codigoMedico: MED_PROPIO, pacienteBuscado: PAC_DEMO, fields: FIELDS_KIOSCO }), res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(capturas.postAntecedentes, undefined);
  } finally { restaurar(); }
});

test('kiosco antecedentes GO: sin sesión → 401', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock(capturas);
  try {
    const handler = cargarHandler({ congelado: false });
    const res = fakeRes();
    await handler(reqPost({ codigoMedico: null, pacienteBuscado: PAC_REAL, fields: FIELDS_KIOSCO }), res);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(capturas.postAntecedentes, undefined);
  } finally { restaurar(); }
});

test('kiosco antecedentes GO: CONGELADO (producción) → 503 y nada llega a la tabla', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock(capturas);
  try {
    const handler = cargarHandler({ congelado: true });
    const res = fakeRes();
    await handler(reqPost({ codigoMedico: MED_PROPIO, pacienteBuscado: PAC_REAL, fields: FIELDS_KIOSCO }), res);
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(capturas.postAntecedentes, undefined);
  } finally { restaurar(); }
});

// Bajo carga Airtable responde 429. Verificar el tipo de acceso NO puede
// convertir eso en "tu tipo de acceso no permite..." (403 falso) ni dejar un
// "Denegado" en ACCESOS_EXPEDIENTE: es 502 y nada se escribe.
test('kiosco antecedentes GO: Airtable 429 al verificar tipo de acceso → 502 honesto, sin "Denegado" en bitácora', async () => {
  const capturas = {};
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    if (u.includes(TBL_MEDICOS)) return { ok: false, status: 429, json: async () => ({ errors: [{ error: 'RATE_LIMIT_REACHED' }] }) };
    if (u.includes(TBL_ACCESOS)) { capturas.bitacora = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ records: [{ id: 'recACC' }] }) }; }
    if ((opts.method || 'GET') === 'POST' && u.includes(TBL_ANTECEDENTES)) { capturas.postAntecedentes = true; }
    throw new Error(`fetch no mockeado: ${u}`);
  };
  try {
    const handler = cargarHandler({ congelado: false });
    const res = fakeRes();
    await handler(reqPost({ codigoMedico: MED_PROPIO, pacienteBuscado: PAC_REAL, fields: FIELDS_KIOSCO }), res);
    assert.strictEqual(res.statusCode, 502, JSON.stringify(res.body));
    assert.doesNotMatch(res.body.error, /tipo de acceso no permite/);
    assert.strictEqual(capturas.bitacora, undefined, 'un 429 no es una denegación: no debe registrarse como "Denegado"');
    assert.strictEqual(capturas.postAntecedentes, undefined);
  } finally { global.fetch = original; }
});

test('kiosco antecedentes GO: médico con Tipo de acceso ≠ Clinico sigue recibiendo 403 (la corrección del 429 no abre nada)', async () => {
  const capturas = {};
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    if (u.includes(TBL_MEDICOS)) return { ok: true, status: 200, json: async () => ({ records: [{ id: 'recMEDPROP', fields: { 'Código de médico': MED_PROPIO, 'Tipo de acceso': 'Revisor' } }] }) };
    if (u.includes(TBL_ACCESOS)) { capturas.bitacora = true; return { ok: true, status: 200, json: async () => ({ records: [{ id: 'recACC' }] }) }; }
    throw new Error(`fetch no mockeado: ${u}`);
  };
  try {
    const handler = cargarHandler({ congelado: false });
    const res = fakeRes();
    await handler(reqPost({ codigoMedico: MED_PROPIO, pacienteBuscado: PAC_REAL, fields: FIELDS_KIOSCO }), res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(capturas.bitacora, true, 'una denegación real sí se registra');
  } finally { global.fetch = original; }
});
