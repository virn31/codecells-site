// MVP-2 Medicamentos (lib/medicamentos.js + acciones de api/nova.js).
// Decisiones de Víctor 2026-10-04: la receta es el único acto que crea
// medicamentos; el paciente solo registra suplementos. Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const M = require('../lib/medicamentos');

// ─── Reglas puras ─────────────────────────────────────────────────
const med = (o) => ({ id: 'recMED', estado: 'Activo', inicio: '2026-10-01', frecuencia: 'c8h', duracionDias: null, suspendidoDia: null, ...o });

test('tomas esperadas: frecuencia, inicio, duración, días alternos y suspensión', () => {
  assert.strictEqual(M.tomasEsperadasEnDia(med(), '2026-09-30'), 0, 'antes de empezar');
  assert.strictEqual(M.tomasEsperadasEnDia(med(), '2026-10-01'), 3);
  assert.strictEqual(M.tomasEsperadasEnDia(med({ duracionDias: 5 }), '2026-10-05'), 3, 'día 5 de 5');
  assert.strictEqual(M.tomasEsperadasEnDia(med({ duracionDias: 5 }), '2026-10-06'), 0, 'ya terminó');
  assert.strictEqual(M.tomasEsperadasEnDia(med({ frecuencia: 'c48h' }), '2026-10-02'), 0);
  assert.strictEqual(M.tomasEsperadasEnDia(med({ frecuencia: 'c48h' }), '2026-10-03'), 1);
  assert.strictEqual(M.tomasEsperadasEnDia(med({ frecuencia: 'semanal' }), '2026-10-08'), 1);
  assert.strictEqual(M.tomasEsperadasEnDia(med({ frecuencia: 'prn' }), '2026-10-02'), 0, 'PRN no genera tomas esperadas');
  assert.strictEqual(M.tomasEsperadasEnDia(med({ suspendidoDia: '2026-10-03' }), '2026-10-03'), 0);
  assert.strictEqual(M.tomasEsperadasEnDia(med({ frecuencia: 'inventada' }), '2026-10-02'), 0);
});

test('adherencia: solo días completos, sin pasar del 100%, null si no tocaba nada', () => {
  const m = med({ frecuencia: 'c12h', inicio: '2026-10-01' });
  // hoy = 10-04 → días completos 09-27..10-03; tocaban 10-01,02,03 = 6 tomas
  const tomas = [
    { medicamentoId: 'recMED', dia: '2026-10-01', numero: 1 }, { medicamentoId: 'recMED', dia: '2026-10-01', numero: 2 },
    { medicamentoId: 'recMED', dia: '2026-10-02', numero: 1 },
    { medicamentoId: 'recMED', dia: '2026-10-02', numero: 7 },   // no correspondía: no suma
    { medicamentoId: 'recMED', dia: '2026-10-04', numero: 1 },   // hoy: aún no cuenta
    { medicamentoId: 'recOTRO', dia: '2026-10-03', numero: 1 },
  ];
  const a = M.adherencia([m], tomas, '2026-10-04');
  assert.deepStrictEqual([a.esperadas, a.tomadas, a.porcentaje], [6, 3, 50]);
  const vacio = M.adherencia([med({ frecuencia: 'prn' })], [], '2026-10-04');
  assert.strictEqual(vacio.porcentaje, null, 'sin tomas esperadas no es 100%');
});

test('validar: nada se completa por defecto', () => {
  const ok = { nombre: 'Metformina', dosis: '850 mg', via: 'Oral', frecuencia: 'c12h', duracionDias: '30', indicaciones: 'con alimentos' };
  assert.deepStrictEqual(M.validarMedicamento(ok, 0).med.duracionDias, 30);
  assert.strictEqual(M.validarMedicamento({ ...ok, duracionDias: '' }, 0).med.duracionDias, null, 'vacío = hasta nuevo aviso');
  for (const malo of [{ nombre: '' }, { dosis: '' }, { via: 'Por la oreja' }, { frecuencia: '' }, { duracionDias: 0 }, { duracionDias: 2.5 }, { duracionDias: 400 }]) {
    assert.ok(M.validarMedicamento({ ...ok, ...malo }, 0).error, JSON.stringify(malo));
  }
});

test('hoy en Culiacán, no en UTC', () => {
  // 2026-10-05 03:00 UTC = 2026-10-04 20:00 en Culiacán (UTC-7)
  assert.strictEqual(M.hoyEnZona(new Date('2026-10-05T03:00:00Z')), '2026-10-04');
});

// ─── Acciones (Airtable simulado) ─────────────────────────────────
const TBL_PAC = 'tblyUcCfueFLJuvIv', TBL_MED = 'tbl87DsuBMmb4DjFM';
const PAC = 'CC-PAC-200001', OTRO = 'CC-PAC-200002', DEMO = 'CC-PAC-DEMO01';
const PACIENTES = {
  recPACREAL: { id: 'recPACREAL', fields: { 'Código de paciente': PAC, 'Médico_principal': ['recMEDPROP'] } },
  recPACOTRO: { id: 'recPACOTRO', fields: { 'Código de paciente': OTRO, 'Médico_principal': ['recMEDPROP'] } },
  recPACDEMO: { id: 'recPACDEMO', fields: { 'Código de paciente': DEMO, 'Es demo': true, 'Médico_principal': ['recMEDPROP'] } },
};
const MEDREC = 'recMEDICAMENTO001', MEDAJENO = 'recMEDICAMENTO002', MEDCOLEGA = 'recMEDICAMENTO003';

function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

function mundo({ loteFalla = false, cabeceraFalla = false } = {}) {
  const cap = { posts: {}, patches: [], deletes: [] };
  const hoy = M.hoyEnZona();
  const meds = {
    [MEDREC]: { id: MEDREC, fields: { 'Medicamento': 'Metformina', 'Código de paciente ref': PAC, 'Frecuencia': 'c12h', 'Fecha inicio': hoy, 'Estado': 'Activo', 'Código de médico ref': 'CCMED-PROP01', 'Prescrito por': ['recMEDPROP'] } },
    [MEDAJENO]: { id: MEDAJENO, fields: { 'Medicamento': 'Otro', 'Código de paciente ref': OTRO, 'Frecuencia': 'c24h', 'Fecha inicio': hoy, 'Estado': 'Activo', 'Código de médico ref': 'CCMED-PROP01' } },
    [MEDCOLEGA]: { id: MEDCOLEGA, fields: { 'Medicamento': 'Losartán', 'Código de paciente ref': PAC, 'Frecuencia': 'c24h', 'Fecha inicio': hoy, 'Estado': 'Activo', 'Código de médico ref': 'CCMED-COLEGA' } },
  };
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url)); const metodo = opts.method || 'GET';
    const ok = d => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
    const malo = { ok: false, status: 503, json: async () => ({}), text: async () => '' };
    if (u.includes('tblSpORAqLKxYOI6W')) return ok({ records: [{ id: 'recACC' }] });
    if (u.includes('tbl9PS3KNBxbRVriV') || u.includes('VINCULACIONES')) return ok({ records: [] });
    if (u.includes(`${TBL_MED}?`) && u.includes('RECORD_ID()')) return ok({ records: [{ id: 'recMEDPROP', fields: { 'Nombre completo': 'Dra. Prop' } }] });
    if (u.includes(`${TBL_MED}?`)) {
      const c = ['CCMED-PROP01', 'CCMED-AJEN01'].find(k => u.includes(`"${k}"`));
      return ok({ records: c ? [{ id: c === 'CCMED-PROP01' ? 'recMEDPROP' : 'recMEDAJEN', fields: { 'Código de médico': c, 'Tipo de acceso': 'Clinico' } }] : [] });
    }
    if (u.includes(`${TBL_PAC}?`)) { const p = Object.values(PACIENTES).find(x => u.includes(`"${x.fields['Código de paciente']}"`)); return ok({ records: p ? [p] : [] }); }
    for (const tabla of ['RECETAS', 'MEDICAMENTOS_PACIENTE', 'TOMAS_MEDICAMENTO', 'SUPLEMENTOS_PACIENTE']) {
      if (!u.includes(`/${tabla}`)) continue;
      const idm = u.match(new RegExp(`${tabla}/(rec[A-Za-z0-9]+)`));
      if (metodo === 'POST') {
        const body = JSON.parse(opts.body);
        (cap.posts[tabla] = cap.posts[tabla] || []).push(body);
        if (tabla === 'RECETAS' && cabeceraFalla) return malo;
        if (tabla === 'MEDICAMENTOS_PACIENTE' && loteFalla) return malo;
        return ok({ records: body.records.map((r, i) => ({ id: `recNUEVO${tabla.slice(0, 3)}${i}`.padEnd(17, 'X'), fields: r.fields })) });
      }
      if (metodo === 'PATCH') { cap.patches.push({ tabla, id: idm && idm[1], fields: JSON.parse(opts.body).fields }); return ok({}); }
      if (metodo === 'DELETE') { cap.deletes.push({ tabla, id: idm && idm[1] }); return ok({}); }
      if (idm && tabla === 'MEDICAMENTOS_PACIENTE') return meds[idm[1]] ? ok(meds[idm[1]]) : { ok: false, status: 404, json: async () => ({}) };
      if (idm && tabla === 'SUPLEMENTOS_PACIENTE') return ok({ id: idm[1], fields: { 'Código de paciente ref': idm[1].includes('AJENO') ? OTRO : PAC } });
      if (tabla === 'MEDICAMENTOS_PACIENTE') return ok({ records: Object.values(meds).filter(m => u.includes(`"${m.fields['Código de paciente ref']}"`)) });
      return ok({ records: [] });
    }
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
const demo = c => generarToken({ tipo: 'demo', codigo: c, horas: 1 });
const RX = { nombre: 'Metformina', dosis: '850 mg', via: 'Oral', frecuencia: 'c12h', duracionDias: 30, indicaciones: 'con alimentos' };
const receta = (extra = {}) => ({ action: 'medico_emitir_receta', pacienteCode: PAC, diagnostico: 'E11', medicamentos: [RX], ...extra });

test('emitir receta: sin sesión 401, paciente 401, médico ajeno 403, demo 403 — nada se escribe', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(null, receta())).statusCode, 401);
    assert.strictEqual((await nova(paciente(PAC), receta())).statusCode, 401);
    assert.strictEqual((await nova(medico('CCMED-AJEN01'), receta())).statusCode, 403);
    // El demo cae ya en autorizarPaciente (requiere escritura; demo es solo
    // lectura) — 403 en cualquier caso.
    assert.strictEqual((await nova(medico('CCMED-PROP01'), receta({ pacienteCode: DEMO }))).statusCode, 403);
    assert.deepStrictEqual(w.cap.posts, {});
  } finally { w.restaurar(); }
});

test('emitir receta: renglón incompleto o vacía → 400, nada se escribe', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(medico('CCMED-PROP01'), receta({ medicamentos: [{ ...RX, dosis: '' }] }))).statusCode, 400);
    assert.strictEqual((await nova(medico('CCMED-PROP01'), receta({ medicamentos: [] }))).statusCode, 400);
    assert.strictEqual((await nova(medico('CCMED-PROP01'), receta({ medicamentos: Array(11).fill(RX) }))).statusCode, 400);
    assert.deepStrictEqual(w.cap.posts, {});
  } finally { w.restaurar(); }
});

test('emitir receta: autor desde el token, un solo lote, cabecera Emitida con el conteo confirmado', async () => {
  const w = mundo();
  try {
    const r = await nova(medico('CCMED-PROP01'), receta({ medicamentos: [RX, { ...RX, nombre: 'Vitamina D3', frecuencia: 'c24h', duracionDias: '' }], 'Código de médico ref': 'CCMED-OTRO' }));
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.medicamentosGuardados, 2);
    const cab = w.cap.posts.RECETAS[0].records[0].fields;
    assert.strictEqual(cab['Código de médico ref'], 'CCMED-PROP01');
    assert.strictEqual(cab['Estado'], 'Emitiendo');
    assert.strictEqual(w.cap.posts.MEDICAMENTOS_PACIENTE.length, 1, 'un solo lote');
    const filas = w.cap.posts.MEDICAMENTOS_PACIENTE[0].records.map(x => x.fields);
    assert.ok(filas.every(f => f['Código de médico ref'] === 'CCMED-PROP01' && f['Código de paciente ref'] === PAC && f['Estado'] === 'Activo'));
    assert.strictEqual(filas[1]['Duración (días)'], undefined, 'sin duración = hasta nuevo aviso, no un valor inventado');
    const fin = w.cap.patches.find(p => p.tabla === 'RECETAS');
    assert.deepStrictEqual([fin.fields['Estado'], fin.fields['Medicamentos guardados']], ['Emitida', 2]);
  } finally { w.restaurar(); }
});

test('emitir receta: si el lote falla → 502, cabecera Fallida, nunca "emitida"', async () => {
  const w = mundo({ loteFalla: true });
  try {
    const r = await nova(medico('CCMED-PROP01'), receta());
    assert.strictEqual(r.statusCode, 502);
    assert.notStrictEqual(r.body.emitida, true);
    assert.strictEqual(w.cap.patches.find(p => p.tabla === 'RECETAS').fields['Estado'], 'Fallida');
  } finally { w.restaurar(); }
  const w2 = mundo({ cabeceraFalla: true });
  try {
    const r = await nova(medico('CCMED-PROP01'), receta());
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(w2.cap.posts.MEDICAMENTOS_PACIENTE, undefined, 'sin cabecera no se crean medicamentos');
  } finally { w2.restaurar(); }
});

test('suspender: solo quien lo recetó, solo del paciente autorizado, con motivo', async () => {
  const w = mundo();
  try {
    const base = { action: 'medico_suspender_medicamento', pacienteCode: PAC, motivo: 'Efecto adverso' };
    assert.strictEqual((await nova(medico('CCMED-PROP01'), { ...base, medicamentoId: MEDCOLEGA })).statusCode, 403, 'lo recetó un colega');
    assert.strictEqual((await nova(medico('CCMED-PROP01'), { ...base, medicamentoId: MEDAJENO })).statusCode, 403, 'es de otro paciente');
    assert.strictEqual((await nova(medico('CCMED-PROP01'), { ...base, medicamentoId: MEDREC, motivo: '' })).statusCode, 400);
    assert.strictEqual(w.cap.patches.length, 0);
    const r = await nova(medico('CCMED-PROP01'), { ...base, medicamentoId: MEDREC });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(w.cap.patches[0].fields['Estado'], 'Suspendido');
    assert.strictEqual(w.cap.deletes.length, 0, 'nunca se borra');
  } finally { w.restaurar(); }
});

test('marcar toma: solo el paciente dueño; demo 403; toma que no toca hoy 409', async () => {
  const w = mundo();
  try {
    const base = { action: 'paciente_marcar_toma', numero: 1 };
    assert.strictEqual((await nova(null, { ...base, medicamentoId: MEDREC })).statusCode, 401);
    assert.strictEqual((await nova(demo(DEMO), { ...base, medicamentoId: MEDREC })).statusCode, 403);
    assert.strictEqual((await nova(paciente(OTRO), { ...base, medicamentoId: MEDREC })).statusCode, 403, 'medicamento de otro paciente');
    assert.strictEqual((await nova(paciente(PAC), { ...base, medicamentoId: MEDREC, numero: 3 })).statusCode, 409, 'c12h solo tiene 2 tomas');
    assert.strictEqual(w.cap.posts.TOMAS_MEDICAMENTO, undefined);
    const r = await nova(paciente(PAC), { ...base, medicamentoId: MEDREC });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    const f = w.cap.posts.TOMAS_MEDICAMENTO[0].records[0].fields;
    assert.strictEqual(f['Día'], M.hoyEnZona(), 'el día lo pone el servidor');
    assert.strictEqual(f['Código de paciente ref'], PAC);
  } finally { w.restaurar(); }
});

test('suplementos: "medicamento" no se guarda y pide preguntar al médico; baja ajena 403; nunca DELETE', async () => {
  const w = mundo();
  try {
    const m = await nova(paciente(PAC), { action: 'paciente_agregar_suplemento', tipo: 'medicamento', nombre: 'Ibuprofeno' });
    assert.strictEqual(m.statusCode, 422);
    assert.strictEqual(m.body.preguntarMedico, true);
    assert.strictEqual(w.cap.posts.SUPLEMENTOS_PACIENTE, undefined);
    assert.strictEqual((await nova(demo(DEMO), { action: 'paciente_agregar_suplemento', tipo: 'suplemento', nombre: 'D3' })).statusCode, 403);
    const ok = await nova(paciente(PAC), { action: 'paciente_agregar_suplemento', tipo: 'suplemento', nombre: 'Vitamina D3', comoLoToma: '1 al día' });
    assert.strictEqual(ok.statusCode, 200, JSON.stringify(ok.body));
    assert.strictEqual(w.cap.posts.SUPLEMENTOS_PACIENTE[0].records[0].fields['Código de paciente ref'], PAC);
    assert.strictEqual((await nova(paciente(PAC), { action: 'paciente_baja_suplemento', suplementoId: 'recSUPAJENO000001' })).statusCode, 403);
    const b = await nova(paciente(PAC), { action: 'paciente_baja_suplemento', suplementoId: 'recSUPPROPIO00001' });
    assert.strictEqual(b.statusCode, 200);
    assert.strictEqual(w.cap.patches[0].fields['Activo'], false);
    assert.strictEqual(w.cap.deletes.length, 0);
  } finally { w.restaurar(); }
});

test('listar: el paciente ve los suyos (código de la sesión, no del body) sin datos internos; médico ve puedeSuspender', async () => {
  const w = mundo();
  try {
    const r = await nova(paciente(PAC), { action: 'medicamentos_listar', pacienteCode: OTRO });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.medicamentos.map(m => m.nombre).sort(), ['Losartán', 'Metformina']);
    const t = JSON.stringify(r.body);
    for (const x of ['CCMED-PROP01', 'CCMED-COLEGA', 'recMEDPROP', 'puedeSuspender', OTRO]) assert.ok(!t.includes(x), `no debe salir: ${x}`);
    const m = await nova(medico('CCMED-PROP01'), { action: 'medicamentos_listar', pacienteCode: PAC });
    const porNombre = Object.fromEntries(m.body.medicamentos.map(x => [x.nombre, x.puedeSuspender]));
    assert.deepStrictEqual(porNombre, { Metformina: true, 'Losartán': false });
    assert.strictEqual((await nova(medico('CCMED-AJEN01'), { action: 'medicamentos_listar', pacienteCode: PAC })).statusCode, 403);
  } finally { w.restaurar(); }
});
