// Plan nutricional en la app del paciente (api/nova.js):
// - medico_publicar_plan: solo el médico con ESCRITURA sobre el paciente, y
//   solo un plan que pertenezca a ese paciente. Un fallo al guardar es 502.
// - paciente_plan_actual: el paciente ve su último plan publicado; sin plan
//   es 200 con plan:null y un error de lectura es 502 (nunca "sin plan").
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');

const TBL_PAC = 'tblyUcCfueFLJuvIv', TBL_MED = 'tbl87DsuBMmb4DjFM', TBL_PLANES = 'tblghlpLnwMNosqhd';
const PAC = 'CC-PAC-200001', OTRO = 'CC-PAC-200002', DEMO = 'CC-PAC-DEMO01';
const PLAN_PROPIO = 'recPLANPROPIO0001', PLAN_AJENO = 'recPLANAJENO00001';
const PACIENTES = {
  recPACREAL: { id: 'recPACREAL', fields: { 'Código de paciente': PAC, 'Médico_principal': ['recMEDPROP'] } },
  recPACOTRO: { id: 'recPACOTRO', fields: { 'Código de paciente': OTRO, 'Médico_principal': ['recMEDPROP'] } },
  recPACDEMO: { id: 'recPACDEMO', fields: { 'Código de paciente': DEMO, 'Es demo': true, 'Médico_principal': ['recMEDPROP'] } },
};
const PLANES = {
  [PLAN_PROPIO]: { id: PLAN_PROPIO, fields: { Paciente: ['recPACREAL'] } },
  [PLAN_AJENO]: { id: PLAN_AJENO, fields: { Paciente: ['recPACOTRO'] } },
};

function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

function mundo({ patchFalla = false, listaFalla = false, publicados = [] } = {}) {
  const cap = { patches: [], listas: [] };
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url)); const metodo = opts.method || 'GET';
    const ok = d => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
    if (u.includes('tblSpORAqLKxYOI6W')) return ok({ records: [{ id: 'recACC' }] });
    if (u.includes('tbl9PS3KNBxbRVriV') || u.includes('VINCULACIONES')) return ok({ records: [] });
    // Airtable ignora fields[] en el GET por id: el nombre del médico se pide
    // como lista filtrada, y solo se devuelve lo que se pidió.
    if (u.includes(`${TBL_MED}?`) && u.includes('RECORD_ID()="recMEDPROP"')) {
      cap.medico = u;
      const todo = { 'Nombre completo': 'Dra. Prop', 'Teléfono': '6670000000' };
      return ok({ records: [{ id: 'recMEDPROP', fields: Object.fromEntries(Object.entries(todo).filter(([k]) => u.includes(`fields[]=${k}`))) }] });
    }
    if (u.includes(`${TBL_MED}?`)) {
      const c = ['CCMED-PROP01', 'CCMED-AJEN01'].find(k => u.includes(`"${k}"`));
      return ok({ records: c ? [{ id: c === 'CCMED-PROP01' ? 'recMEDPROP' : 'recMEDAJEN', fields: { 'Código de médico': c, 'Tipo de acceso': 'Clinico' } }] : [] });
    }
    if (u.includes(`${TBL_PAC}?`)) { const p = Object.values(PACIENTES).find(x => u.includes(`"${x.fields['Código de paciente']}"`)); return ok({ records: p ? [p] : [] }); }
    if (u.includes(`${TBL_PLANES}?`)) {
      cap.listas.push(u);
      if (listaFalla) return { ok: false, status: 503, json: async () => ({}) };
      return ok({ records: publicados.filter(p => u.includes(`"${p.codigo}"`)).map(p => ({ id: 'recX', fields: p.fields })) });
    }
    const mp = u.match(new RegExp(`${TBL_PLANES}/(rec[A-Za-z0-9]+)`));
    if (mp && metodo === 'GET') return PLANES[mp[1]] ? ok(PLANES[mp[1]]) : { ok: false, status: 404, json: async () => ({}) };
    if (mp && metodo === 'PATCH') { cap.patches.push({ rec: mp[1], body: JSON.parse(opts.body) }); return patchFalla ? { ok: false, status: 503, json: async () => ({}) } : ok({}); }
    throw new Error(`fetch no mockeado: ${metodo} ${u}`);
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

async function nova(token, body) {
  const res = fakeRes();
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  delete require.cache[require.resolve('../api/nova.js')];
  delete require.cache[require.resolve('../lib/congelamientoDatosPersonales.js')];
  await require('../api/nova.js')({ method: 'POST', headers, body }, res);
  return res;
}
const medico = c => generarToken({ tipo: 'medico', codigo: c, horas: 1 });
const paciente = c => generarToken({ tipo: 'paciente', codigo: c, horas: 1 });
const publicar = (extra = {}) => ({ action: 'medico_publicar_plan', pacienteCode: PAC, planId: PLAN_PROPIO, texto: '*Lunes*\nAvena', macros: { kcal: 1800, proteina_g: 120, carbohidratos_g: 180, grasa_g: 60 }, ...extra });

test('publicar: sin sesión 401; sesión de paciente 401; médico ajeno 403; demo 403 — nada se escribe', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(null, publicar())).statusCode, 401);
    assert.strictEqual((await nova(paciente(PAC), publicar())).statusCode, 401);
    assert.strictEqual((await nova(medico('CCMED-AJEN01'), publicar())).statusCode, 403);
    assert.strictEqual((await nova(medico('CCMED-PROP01'), publicar({ pacienteCode: DEMO }))).statusCode, 403);
    assert.strictEqual(w.cap.patches.length, 0);
  } finally { w.restaurar(); }
});

test('publicar: un plan de OTRO paciente se rechaza aunque el médico tenga acceso a ambos', async () => {
  const w = mundo();
  try {
    const r = await nova(medico('CCMED-PROP01'), publicar({ planId: PLAN_AJENO }));
    assert.strictEqual(r.statusCode, 403);
    assert.strictEqual(w.cap.patches.length, 0);
  } finally { w.restaurar(); }
});

test('publicar: planId inválido o texto vacío → 400', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(medico('CCMED-PROP01'), publicar({ planId: 'x' }))).statusCode, 400);
    assert.strictEqual((await nova(medico('CCMED-PROP01'), publicar({ texto: '   ' }))).statusCode, 400);
  } finally { w.restaurar(); }
});

test('publicar: médico principal → guarda texto, macros, autor del token y marca Publicado', async () => {
  const w = mundo();
  try {
    const r = await nova(medico('CCMED-PROP01'), publicar());
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.publicado, true);
    const f = w.cap.patches[0].body.fields;
    assert.strictEqual(w.cap.patches[0].rec, PLAN_PROPIO);
    assert.strictEqual(f['Plan publicado (texto)'], '*Lunes*\nAvena');
    assert.strictEqual(f['Publicado'], true);
    assert.deepStrictEqual(f['Publicado por'], ['recMEDPROP']);
    assert.strictEqual(f['Código de paciente ref'], PAC);
    assert.strictEqual(f['Kcal objetivo'], 1800);
  } finally { w.restaurar(); }
});

test('publicar: si Airtable no guarda → 502, nunca "publicado"', async () => {
  const w = mundo({ patchFalla: true });
  try {
    const r = await nova(medico('CCMED-PROP01'), publicar());
    assert.strictEqual(r.statusCode, 502);
    assert.notStrictEqual(r.body.publicado, true);
  } finally { w.restaurar(); }
});

test('plan actual: el paciente ve SU último plan publicado con el nombre del médico', async () => {
  const w = mundo({ publicados: [{ codigo: PAC, fields: { 'Plan publicado (texto)': 'Plan de Ana', 'Kcal objetivo': 1800, 'Fecha publicación': '2026-10-04T10:00:00.000Z', 'Publicado por': ['recMEDPROP'] } }, { codigo: OTRO, fields: { 'Plan publicado (texto)': 'Plan ajeno' } }] });
  try {
    const r = await nova(paciente(PAC), { action: 'paciente_plan_actual', pacienteCode: OTRO });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.plan.texto, 'Plan de Ana');
    assert.strictEqual(r.body.plan.medico, 'Dra. Prop');
    assert.strictEqual(r.body.plan.macros.kcal, 1800);
    assert.ok(!JSON.stringify(r.body).includes('6670000000'), 'nunca el teléfono del médico');
    assert.ok(w.cap.listas.every(u => u.includes(`"${PAC}"`) && !u.includes(OTRO)), 'el código sale de la sesión, no del body');
    assert.ok(w.cap.listas.every(u => u.includes('{Publicado}')), 'solo planes publicados');
  } finally { w.restaurar(); }
});

test('plan actual: sin plan publicado → 200 plan:null; error de lectura → 502; sin sesión o médico → 401', async () => {
  let w = mundo();
  try {
    const r = await nova(paciente(PAC), { action: 'paciente_plan_actual' });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.body.plan, null);
    assert.strictEqual((await nova(null, { action: 'paciente_plan_actual' })).statusCode, 401);
    assert.strictEqual((await nova(medico('CCMED-PROP01'), { action: 'paciente_plan_actual' })).statusCode, 401);
  } finally { w.restaurar(); }
  w = mundo({ listaFalla: true });
  try {
    const r = await nova(paciente(PAC), { action: 'paciente_plan_actual' });
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.plan, undefined);
  } finally { w.restaurar(); }
});
