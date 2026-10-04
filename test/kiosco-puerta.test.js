// Bloqueadores del kiosco B1–B3 (docs/CONTINUAR.md, cerrados 2026-10-04).
//  B1 — kiosco_crear_paciente / kiosco_guardar_signos / kiosco_guardar_historia
//       (api/nova.js) exigen sesión médica, Tipo de acceso=Clinico y
//       autorizarPaciente() con escritura. Antes bastaba un "CCMED-..." en el body.
//  B2 — HISTORIA CLÍNICA del kiosco lleva 'Registrado por' = médico del token.
//  B3 — /api/airtable?tabla=pacientes&pacienteBuscado= (GET y PATCH) ya no
//       entrega ni deja modificar a un paciente ajeno por saber su código.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.NODE_ENV = 'development'; // pasa el guard de origen CORS de nova.js

const test = require('node:test');
const assert = require('node:assert');

const { generarToken } = require('../lib/auth');

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const TBL_INTERCONSULTAS = 'tbl9PS3KNBxbRVriV';
const TBL_ACCESOS = 'tblSpORAqLKxYOI6W';
const TBL_HISTORIA = 'tblm2xUADazitHisR';

const MED_PROPIO = 'CCMED-PROP01';
const MED_AJENO = 'CCMED-AJEN01';
const MED_REVISOR = 'CCMED-REVI01';
const MEDICOS = {
  [MED_PROPIO]: { id: 'recMEDPROP', tipo: 'Clinico' },
  [MED_AJENO]: { id: 'recMEDAJEN', tipo: 'Clinico' },
  [MED_REVISOR]: { id: 'recMEDREVI', tipo: 'Revisor' },
};
const PAC_REAL = 'CC-PAC-200001';
const PAC_DEMO = 'CC-PAC-DEMO01';
const PACIENTES = {
  [PAC_REAL]: { id: 'recPACREAL', fields: { 'Código de paciente': PAC_REAL, 'Médico_principal': ['recMEDPROP'], 'Nombre completo': 'Mariana' } },
  [PAC_DEMO]: { id: 'recPACDEMO', fields: { 'Código de paciente': PAC_DEMO, 'Médico_principal': ['recMEDPROP'], 'Es demo': true } },
};
const porRecId = (rec) => Object.values(PACIENTES).find(p => p.id === rec);

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

// Un mundo pequeño y explícito: médicos y pacientes de arriba. `capturas`
// recibe toda escritura que llegaría a Airtable — el criterio de "no se
// escribió nada" es que no haya captura.
function instalarFetchMock(capturas, { medicos429 = false } = {}) {
  const original = global.fetch;
  capturas.bitacora = [];
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const metodo = opts.method || 'GET';
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

    if (u.includes(TBL_ACCESOS)) { capturas.bitacora.push(JSON.parse(opts.body || '{}')); return ok({ records: [{ id: 'recACC' }] }); }
    // VINCULACIONES (vía 'vinculado'): sin vínculos salvo que la prueba diga otra cosa.
    if (u.includes('VINCULACIONES')) return ok({ records: [] });
    if (u.includes(TBL_INTERCONSULTAS)) return ok({ records: [] });
    if (u.includes(`${TBL_MEDICOS}?`)) {
      if (medicos429) return { ok: false, status: 429, json: async () => ({}) };
      const cod = Object.keys(MEDICOS).find(c => u.includes(`"${c}"`));
      return ok({ records: cod ? [{ id: MEDICOS[cod].id, fields: { 'Código de médico': cod, 'Tipo de acceso': MEDICOS[cod].tipo } }] : [] });
    }
    if (u.includes(`${TBL_PACIENTES}?`) && metodo === 'GET') {
      const m = u.match(/RECORD_ID\(\)="(rec\w+)"/);
      if (m) { capturas.reenvioGet = u; const p = porRecId(m[1]); return ok({ records: p ? [p] : [] }); }
      const cod = Object.keys(PACIENTES).find(c => u.includes(`"${c}"`));
      if (u.includes('{Código de paciente}=')) return ok({ records: cod ? [PACIENTES[cod]] : [] });
      capturas.reenvioGet = u;
      return ok({ records: [] }); // generarCodigoUnico / listado: nada previo
    }
    const recMatch = u.match(new RegExp(`${TBL_PACIENTES}/(rec\\w+)`));
    if (recMatch && metodo === 'GET') {
      const p = porRecId(recMatch[1]);
      return p ? ok(p) : { ok: false, status: 404, json: async () => ({}) };
    }
    if (recMatch && metodo === 'PATCH') {
      (capturas.patches = capturas.patches || []).push({ rec: recMatch[1], body: JSON.parse(opts.body) });
      return ok({ id: recMatch[1] });
    }
    if (metodo === 'PATCH' && u.includes(`${TBL_PACIENTES}`)) {
      // PATCH reenviado por api/airtable.js (recordId en query)
      (capturas.patches = capturas.patches || []).push({ url: u, body: JSON.parse(opts.body) });
      return ok({ id: 'recX', fields: {} });
    }
    if (metodo === 'POST' && u.includes(TBL_PACIENTES)) { capturas.postPaciente = JSON.parse(opts.body); return ok({ records: [{ id: 'recNUEVO' }] }); }
    if (metodo === 'POST' && u.includes(TBL_HISTORIA)) { capturas.postHistoria = JSON.parse(opts.body); return ok({ records: [{ id: 'recHIST' }] }); }
    throw new Error(`fetch no mockeado en esta prueba: ${metodo} ${u}`);
  };
  return () => { global.fetch = original; };
}

function sinCongelar(rutaApi) {
  const rutaCongelamiento = require.resolve('../lib/congelamientoDatosPersonales.js');
  delete require.cache[rutaCongelamiento];
  const real = require(rutaCongelamiento);
  require.cache[rutaCongelamiento].exports = { ...real, CONGELADO: false };
  delete require.cache[require.resolve(rutaApi)];
  return require(rutaApi);
}

const token = (codigo) => generarToken({ tipo: 'medico', codigo, horas: 1 });
function reqNova(codigoMedico, body) {
  const headers = { 'content-type': 'application/json' };
  if (codigoMedico) headers.authorization = `Bearer ${token(codigoMedico)}`;
  return { method: 'POST', headers, body };
}

async function correrNova(codigoMedico, body, opts) {
  const capturas = {};
  const restaurar = instalarFetchMock(capturas, opts);
  try {
    const res = fakeRes();
    await sinCongelar('../api/nova.js')(reqNova(codigoMedico, body), res);
    return { res, capturas };
  } finally { restaurar(); }
}

const RESPUESTAS = { motivo: 'Dolor de cabeza', tabaco: 'No, nunca' };

// ─── B1: kiosco_crear_paciente ────────────────────────────────────

test('B1 crear_paciente: sin token, aunque el body traiga staffCodigo → 401 y no se crea nada', async () => {
  const { res, capturas } = await correrNova(null, { action: 'kiosco_crear_paciente', staffCodigo: MED_PROPIO, nombreCompleto: 'ZZ Prueba' });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(capturas.postPaciente, undefined);
});

test('B1 crear_paciente: Médico_principal sale del TOKEN, no del staffCodigo del body', async () => {
  const { res, capturas } = await correrNova(MED_PROPIO, { action: 'kiosco_crear_paciente', staffCodigo: MED_AJENO, nombreCompleto: 'ZZ Prueba' });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepStrictEqual(capturas.postPaciente.records[0].fields['Médico_principal'], ['recMEDPROP']);
});

test('B1 crear_paciente: Tipo de acceso ≠ Clinico → 403, "Denegado" en bitácora, no se crea', async () => {
  const { res, capturas } = await correrNova(MED_REVISOR, { action: 'kiosco_crear_paciente', nombreCompleto: 'ZZ Prueba' });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(capturas.postPaciente, undefined);
  assert.ok(capturas.bitacora.some(b => JSON.stringify(b).includes('Denegado')));
});

test('B1 crear_paciente: Airtable 429 al verificar al médico → 502 honesto, no se crea paciente huérfano', async () => {
  const { res, capturas } = await correrNova(MED_PROPIO, { action: 'kiosco_crear_paciente', nombreCompleto: 'ZZ Prueba' }, { medicos429: true });
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(capturas.postPaciente, undefined);
});

// ─── B1: kiosco_guardar_signos ────────────────────────────────────

test('B1 signos: sin token → 401 y nada se modifica', async () => {
  const { res, capturas } = await correrNova(null, { action: 'kiosco_guardar_signos', pacienteCodigo: PAC_REAL, staffCodigo: MED_PROPIO, peso: 70 });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(capturas.patches, undefined);
});

test('B1 signos: médico ajeno → 403 y nada se modifica', async () => {
  const { res, capturas } = await correrNova(MED_AJENO, { action: 'kiosco_guardar_signos', pacienteCodigo: PAC_REAL, peso: 70 });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(capturas.patches, undefined);
});

test('B1 signos: paciente demo → 403 (solo lectura) aunque el médico sea su principal', async () => {
  const { res, capturas } = await correrNova(MED_PROPIO, { action: 'kiosco_guardar_signos', pacienteCodigo: PAC_DEMO, peso: 70 });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(capturas.patches, undefined);
});

// ─── B1 + B2: kiosco_guardar_historia ─────────────────────────────

test('B2 historia: médico principal → Registrado por, Paciente y Código ref los fija el servidor', async () => {
  const { res, capturas } = await correrNova(MED_PROPIO, {
    action: 'kiosco_guardar_historia', pacienteCodigo: PAC_REAL, respuestas: RESPUESTAS,
    pacienteRecordId: 'recOTRO', staffCodigo: MED_AJENO, // el cliente miente; se ignora
  });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  const f = capturas.postHistoria.records[0].fields;
  assert.deepStrictEqual(f['Registrado por'], ['recMEDPROP']);
  assert.deepStrictEqual(f['Paciente'], ['recPACREAL']);
  assert.strictEqual(f['Código de paciente ref'], PAC_REAL);
  assert.strictEqual(f['Motivo de consulta'], 'Dolor de cabeza');
  assert.ok(capturas.bitacora.some(b => JSON.stringify(b).includes('kiosco_guardar_historia')), 'escritura exitosa queda en bitácora');
});

test('B1 historia: médico ajeno → 403 y no se crea historia', async () => {
  const { res, capturas } = await correrNova(MED_AJENO, { action: 'kiosco_guardar_historia', pacienteCodigo: PAC_REAL, respuestas: RESPUESTAS });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(capturas.postHistoria, undefined);
  assert.strictEqual(capturas.patches, undefined, 'tampoco toca Última actividad');
});

test('B1 historia: sin token → 401 y no se crea historia', async () => {
  const { res, capturas } = await correrNova(null, { action: 'kiosco_guardar_historia', pacienteCodigo: PAC_REAL, staffCodigo: MED_PROPIO, respuestas: RESPUESTAS });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(capturas.postHistoria, undefined);
});

// ─── B3: /api/airtable tabla=pacientes con pacienteBuscado ─────────

async function correrAirtable(codigoMedico, { method, query, body }) {
  const capturas = {};
  const restaurar = instalarFetchMock(capturas);
  try {
    const res = fakeRes();
    const headers = codigoMedico ? { authorization: `Bearer ${token(codigoMedico)}` } : {};
    await sinCongelar('../api/airtable.js')({ method, headers, query: { tabla: 'pacientes', ...query }, body: body || {} }, res);
    return { res, capturas };
  } finally { restaurar(); }
}

test('B3 GET: médico ajeno con el código exacto → 403 uniforme, nada se reenvía a Airtable', async () => {
  const { res, capturas } = await correrAirtable(MED_AJENO, { method: 'GET', query: { pacienteBuscado: PAC_REAL } });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(capturas.reenvioGet, undefined);
  assert.ok(capturas.bitacora.some(b => JSON.stringify(b).includes('Rechazado')));
});

test('B3 GET: código inexistente → mismo 403 que ajeno (no se distingue "no existe")', async () => {
  const { res } = await correrAirtable(MED_AJENO, { method: 'GET', query: { pacienteBuscado: 'CC-PAC-999999' } });
  assert.strictEqual(res.statusCode, 403);
});

test('B3 GET: médico principal → se reenvía atado al RECORD_ID autorizado', async () => {
  const { res, capturas } = await correrAirtable(MED_PROPIO, { method: 'GET', query: { pacienteBuscado: PAC_REAL } });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  assert.match(capturas.reenvioGet, /RECORD_ID\(\)="recPACREAL"/);
});

test('B3 GET: paciente demo sigue siendo legible para cualquier médico clínico', async () => {
  const { res } = await correrAirtable(MED_AJENO, { method: 'GET', query: { pacienteBuscado: PAC_DEMO } });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
});

test('B3 PATCH: médico ajeno que manda pacienteBuscado = código del registro → 403 (antes pasaba como "interconsulta")', async () => {
  const { res, capturas } = await correrAirtable(MED_AJENO, {
    method: 'PATCH', query: { recordId: 'recPACREAL', pacienteBuscado: PAC_REAL }, body: { fields: { 'Notas generales': 'x' } },
  });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(capturas.patches, undefined);
});

test('B3 PATCH: paciente demo → 403 aunque el médico sea su principal', async () => {
  const { res, capturas } = await correrAirtable(MED_PROPIO, {
    method: 'PATCH', query: { recordId: 'recPACDEMO', pacienteBuscado: PAC_DEMO }, body: { fields: { 'Notas generales': 'x' } },
  });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(capturas.patches, undefined);
});

test('B3 PATCH: médico principal → sí modifica', async () => {
  const { res, capturas } = await correrAirtable(MED_PROPIO, {
    method: 'PATCH', query: { recordId: 'recPACREAL' }, body: { fields: { 'Notas generales': 'x' } },
  });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(capturas.patches && capturas.patches.length === 1);
});
