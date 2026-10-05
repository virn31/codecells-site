// generar_plan_semanal y actualizar_seguimiento_paciente (api/nova.js) no
// revisaban sesión: con un recordId cualquiera se leía el expediente o se
// cambiaba el peso. Ahora: sesión médica + Tipo de acceso + autorizarPaciente
// por CÓDIGO (el recordId del cliente se ignora). Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');

const TBL_PAC = 'tblyUcCfueFLJuvIv', TBL_MED = 'tbl87DsuBMmb4DjFM';
const PAC = 'CC-PAC-200001', DEMO = 'CC-PAC-DEMO01';
const PACIENTES = {
  recPACREAL: { id: 'recPACREAL', fields: { 'Código de paciente': PAC, 'Médico_principal': ['recMEDPROP'], 'Peso actual (kg)': 70 } },
  recPACDEMO: { id: 'recPACDEMO', fields: { 'Código de paciente': DEMO, 'Es demo': true, 'Médico_principal': ['recMEDPROP'] } },
};

function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

function mundo({ patchFalla = false } = {}) {
  const cap = { patches: [] };
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url)); const metodo = opts.method || 'GET';
    const ok = d => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
    if (u.includes('tblSpORAqLKxYOI6W')) return ok({ records: [{ id: 'recACC' }] });
    if (u.includes('tbl9PS3KNBxbRVriV') || u.includes('VINCULACIONES')) return ok({ records: [] });
    if (u.includes(`${TBL_MED}?`)) {
      const c = ['CCMED-PROP01', 'CCMED-AJEN01'].find(k => u.includes(`"${k}"`));
      return ok({ records: c ? [{ id: c === 'CCMED-PROP01' ? 'recMEDPROP' : 'recMEDAJEN', fields: { 'Código de médico': c, 'Tipo de acceso': 'Clinico' } }] : [] });
    }
    if (u.includes(`${TBL_PAC}?`)) { const p = Object.values(PACIENTES).find(x => u.includes(`"${x.fields['Código de paciente']}"`)); return ok({ records: p ? [p] : [] }); }
    const m = u.match(new RegExp(`${TBL_PAC}/(rec[A-Za-z0-9]+)`));
    if (m && metodo === 'GET') return ok(PACIENTES[m[1]]);
    if (m && metodo === 'PATCH') { cap.patches.push({ rec: m[1], body: JSON.parse(opts.body) }); return patchFalla ? { ok: false, status: 503, json: async () => ({}) } : ok({}); }
    throw new Error(`fetch no mockeado: ${metodo} ${u}`);
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

async function nova(codigoMedico, body) {
  const res = fakeRes();
  const headers = { 'content-type': 'application/json' };
  if (codigoMedico) headers.authorization = `Bearer ${generarToken({ tipo: 'medico', codigo: codigoMedico, horas: 1 })}`;
  delete require.cache[require.resolve('../api/nova.js')];
  delete require.cache[require.resolve('../lib/congelamientoDatosPersonales.js')];
  await require('../api/nova.js')({ method: 'POST', headers, body }, res);
  return res;
}

test('generar_plan_semanal: sin sesión → 401; médico ajeno → 403 (nada se lee del expediente)', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(null, { action: 'generar_plan_semanal', pacienteRecordId: 'recPACREAL', pacienteCode: PAC })).statusCode, 401);
    assert.strictEqual((await nova('CCMED-AJEN01', { action: 'generar_plan_semanal', pacienteCode: PAC })).statusCode, 403);
  } finally { w.restaurar(); }
});

test('actualizar_seguimiento_paciente: sin sesión → 401; ajeno → 403; demo → 403; nada se modifica', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(null, { action: 'actualizar_seguimiento_paciente', pacienteRecordId: 'recPACREAL', pesoNuevo: 60 })).statusCode, 401);
    assert.strictEqual((await nova('CCMED-AJEN01', { action: 'actualizar_seguimiento_paciente', pacienteCode: PAC, pesoNuevo: 60 })).statusCode, 403);
    assert.strictEqual((await nova('CCMED-PROP01', { action: 'actualizar_seguimiento_paciente', pacienteCode: DEMO, pesoNuevo: 60 })).statusCode, 403);
    assert.strictEqual(w.cap.patches.length, 0);
  } finally { w.restaurar(); }
});

test('actualizar_seguimiento_paciente: médico principal → modifica el registro AUTORIZADO, no el recordId del body', async () => {
  const w = mundo();
  try {
    const r = await nova('CCMED-PROP01', { action: 'actualizar_seguimiento_paciente', pacienteCode: PAC, pacienteRecordId: 'recOTRO', pesoNuevo: 68.5 });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(w.cap.patches[0].rec, 'recPACREAL');
    assert.strictEqual(w.cap.patches[0].body.fields['Peso actual (kg)'], 68.5);
  } finally { w.restaurar(); }
});

test('actualizar_seguimiento_paciente: si Airtable no guarda → 502, nunca "Peso actualizado"', async () => {
  const w = mundo({ patchFalla: true });
  try {
    const r = await nova('CCMED-PROP01', { action: 'actualizar_seguimiento_paciente', pacienteCode: PAC, pesoNuevo: 68.5 });
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.mensaje, undefined);
  } finally { w.restaurar(); }
});
