// Biological Map (MVP-1): el cuestionario se califica en el servidor,
// escala función 0–10 (más = mejor), sin rellenar respuestas faltantes,
// 14 días entre reevaluaciones desde la app, kiosco con el médico como autor.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const cuestionario = require('../lib/cuestionarioBiologico');
const evalBio = require('../lib/evaluacionesBiologicas');

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv', TBL_MEDICOS = 'tbl87DsuBMmb4DjFM', TBL_ACCESOS = 'tblSpORAqLKxYOI6W';
const PAC = 'CC-PAC-200001', DEMO = 'CC-PAC-DEMO01';
const MED = 'CCMED-PROP01', MED_AJENO = 'CCMED-AJEN01';
const PACIENTES = [
  { id: 'recPACREAL', fields: { 'Código de paciente': PAC, 'Médico_principal': ['recMEDPROP'] } },
  { id: 'recPACDEMO', fields: { 'Código de paciente': DEMO, 'Es demo': true, 'Médico_principal': ['recMEDPROP'] } },
];

// Todas las respuestas en un valor dado (0 = sin riesgo, máximo = riesgo total).
function respuestasTodas(nivel) {
  const r = {};
  for (const s of cuestionario.DATOS.systems) for (const q of s.questions) {
    const vals = q.options.map(o => o.value);
    r[`${s.id}_${q.id}`] = nivel === 'max' ? Math.max(...vals) : 0;
  }
  return r;
}

function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

function mundo({ evaluaciones = [], falla = false } = {}) {
  const guardadas = [...evaluaciones];
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const metodo = opts.method || 'GET';
    const ok = d => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) });
    if (u.includes(TBL_ACCESOS)) return ok({ records: [{ id: 'recACC' }] });
    if (u.includes('tbl9PS3KNBxbRVriV') || u.includes('VINCULACIONES')) return ok({ records: [] });
    if (u.includes('EVALUACIONES_BIOLOGICAS')) {
      if (falla) return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
      if (metodo === 'POST') { const rec = { id: 'recEV' + guardadas.length, fields: JSON.parse(opts.body).records[0].fields }; guardadas.push(rec); return ok({ records: [rec] }); }
      const cod = (u.match(/\{Código de paciente ref\}="([^"]+)"/) || [])[1];
      return ok({ records: guardadas.filter(g => g.fields['Código de paciente ref'] === cod) });
    }
    if (u.includes(`${TBL_MEDICOS}?`)) {
      const c = [MED, MED_AJENO].find(k => u.includes(`"${k}"`));
      return ok({ records: c ? [{ id: c === MED ? 'recMEDPROP' : 'recMEDAJEN', fields: { 'Código de médico': c, 'Tipo de acceso': 'Clinico' } }] : [] });
    }
    if (u.includes(`${TBL_PACIENTES}?`)) {
      const p = PACIENTES.find(x => u.includes(`"${x.fields['Código de paciente']}"`));
      return ok({ records: p ? [p] : [] });
    }
    throw new Error(`fetch no mockeado: ${metodo} ${u}`);
  };
  return { guardadas, restaurar: () => { global.fetch = original; } };
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
const tPac = c => generarToken({ tipo: 'paciente', codigo: c, horas: 1 });
const tDemo = c => generarToken({ tipo: 'demo', codigo: c, horas: 1 });
const tMed = c => generarToken({ tipo: 'medico', codigo: c, horas: 1 });

// ─── escala ──────────────────────────────────────────────────────

test('escala: sin riesgo → 10 en todo; riesgo total → 0; estado general = promedio', () => {
  const sano = cuestionario.calificar(respuestasTodas(0));
  assert.strictEqual(sano.estadoGeneral, 10);
  for (const s of Object.values(sano.sistemas)) assert.strictEqual(s.funcion, 10);
  const mal = cuestionario.calificar(respuestasTodas('max'));
  assert.strictEqual(mal.estadoGeneral, 0);
  assert.strictEqual(mal.version, cuestionario.VERSION);
});

test('escala: un caso intermedio — energía con 2+2 de 8 → riesgo 50 % → función 5.0', () => {
  const r = respuestasTodas(0); r.energy_q1 = 2; r.energy_q2 = 2;
  const c = cuestionario.calificar(r);
  assert.strictEqual(c.sistemas.energy.riesgoPct, 50);
  assert.strictEqual(c.sistemas.energy.funcion, 5);
  assert.strictEqual(c.estadoGeneral, 9);
});

test('escala: test incompleto o con un valor que no es opción → null (nunca se rellena con 0)', () => {
  const falta = respuestasTodas(0); delete falta.neuro_q2;
  assert.strictEqual(cuestionario.calificar(falta), null);
  const raro = respuestasTodas(0); raro.repair_q1 = 2; // repair_q1 solo admite 0 o 4
  assert.strictEqual(cuestionario.calificar(raro), null);
  assert.strictEqual(cuestionario.calificar(null), null);
});

test('etiquetas amables con los cortes del test (≤3 / ≤6 / >6)', () => {
  assert.strictEqual(cuestionario.etiqueta(3), 'Necesita atención');
  assert.strictEqual(cuestionario.etiqueta(3.1), 'Puede mejorar');
  assert.strictEqual(cuestionario.etiqueta(6), 'Puede mejorar');
  assert.strictEqual(cuestionario.etiqueta(6.1), 'Buen funcionamiento');
  assert.strictEqual(cuestionario.etiqueta(null), null);
});

test('14 días entre reevaluaciones desde la app; las del kiosco no cuentan', () => {
  const hace3 = new Date(Date.now() - 3 * 864e5).toISOString();
  assert.ok(evalBio.proximaPermitida([{ origen: 'App del paciente', fecha: hace3 }]));
  assert.strictEqual(evalBio.proximaPermitida([{ origen: 'Kiosco de consultorio', fecha: hace3 }]), null);
  assert.strictEqual(evalBio.proximaPermitida([{ origen: 'App del paciente', fecha: new Date(Date.now() - 15 * 864e5).toISOString() }]), null);
});

// ─── paciente ────────────────────────────────────────────────────

test('paciente: guarda calificando en el servidor (ignora puntajes que mande el cliente)', async () => {
  const w = mundo();
  try {
    const r = await nova(tPac(PAC), { action: 'paciente_guardar_evaluacion', respuestas: respuestasTodas(0), estadoGeneral: 0.1, sistemas: { energy: 0 } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    const f = w.guardadas[0].fields;
    assert.strictEqual(f['Estado general'], 10);
    assert.strictEqual(f['Función ENERGY'], 10);
    assert.strictEqual(f['Origen'], 'App del paciente');
    assert.deepStrictEqual(f['Paciente'], ['recPACREAL']);
    assert.strictEqual(f['Registrado por'], undefined);
    assert.strictEqual(f['Versión cuestionario'], cuestionario.VERSION);
  } finally { w.restaurar(); }
});

test('paciente: sin sesión → 401; sesión demo → 401 (solo lectura); test incompleto → 400', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(null, { action: 'paciente_guardar_evaluacion', respuestas: respuestasTodas(0) })).statusCode, 401);
    assert.strictEqual((await nova(tDemo(DEMO), { action: 'paciente_guardar_evaluacion', respuestas: respuestasTodas(0) })).statusCode, 401);
    const inc = respuestasTodas(0); delete inc.regen_q1;
    assert.strictEqual((await nova(tPac(PAC), { action: 'paciente_guardar_evaluacion', respuestas: inc })).statusCode, 400);
    assert.strictEqual(w.guardadas.length, 0);
  } finally { w.restaurar(); }
});

test('paciente: reevaluarse antes de 14 días → 429 con la fecha permitida, no se guarda', async () => {
  const w = mundo({ evaluaciones: [{ id: 'recV', fields: { 'Código de paciente ref': PAC, 'Fecha': new Date(Date.now() - 2 * 864e5).toISOString(), 'Origen': 'App del paciente' } }] });
  try {
    const r = await nova(tPac(PAC), { action: 'paciente_guardar_evaluacion', respuestas: respuestasTodas(0) });
    assert.strictEqual(r.statusCode, 429);
    assert.ok(r.body.proximaPermitida);
    assert.strictEqual(w.guardadas.length, 1);
  } finally { w.restaurar(); }
});

// ─── kiosco / médico ─────────────────────────────────────────────

test('kiosco: médico principal guarda con su autoría; médico ajeno → 403; demo → 403', async () => {
  const w = mundo();
  try {
    const ok = await nova(tMed(MED), { action: 'medico_guardar_evaluacion', pacienteCode: PAC, respuestas: respuestasTodas('max') });
    assert.strictEqual(ok.statusCode, 200, JSON.stringify(ok.body));
    assert.deepStrictEqual(w.guardadas[0].fields['Registrado por'], ['recMEDPROP']);
    assert.strictEqual(w.guardadas[0].fields['Origen'], 'Kiosco de consultorio');
    assert.strictEqual((await nova(tMed(MED_AJENO), { action: 'medico_guardar_evaluacion', pacienteCode: PAC, respuestas: respuestasTodas(0) })).statusCode, 403);
    assert.strictEqual((await nova(tMed(MED), { action: 'medico_guardar_evaluacion', pacienteCode: DEMO, respuestas: respuestasTodas(0) })).statusCode, 403);
    assert.strictEqual(w.guardadas.length, 1);
  } finally { w.restaurar(); }
});

// ─── listar ──────────────────────────────────────────────────────

test('listar: el paciente ve las suyas (sin respuestas crudas); el médico ajeno → 403', async () => {
  const w = mundo();
  try {
    await nova(tPac(PAC), { action: 'paciente_guardar_evaluacion', respuestas: respuestasTodas(0) });
    const r = await nova(tPac(PAC), { action: 'evaluaciones_listar' });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.body.evaluaciones.length, 1);
    assert.strictEqual(r.body.evaluaciones[0].estadoGeneral, 10);
    assert.strictEqual(r.body.evaluaciones[0].respuestas, undefined);
    assert.ok(r.body.proximaPermitida, 'acaba de evaluarse: la próxima es en 14 días');
    assert.strictEqual((await nova(tMed(MED_AJENO), { action: 'evaluaciones_listar', pacienteCode: PAC })).statusCode, 403);
    assert.strictEqual((await nova(tMed(MED), { action: 'evaluaciones_listar', pacienteCode: PAC })).statusCode, 200);
  } finally { w.restaurar(); }
});

test('listar: si Airtable falla → 502, nunca una lista vacía ("aún no tienes evaluación")', async () => {
  const w = mundo({ falla: true });
  try {
    const r = await nova(tPac(PAC), { action: 'evaluaciones_listar' });
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.evaluaciones, undefined);
  } finally { w.restaurar(); }
});
