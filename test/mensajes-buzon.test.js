// Buzón de la app del paciente (lib/mensajes.js + acciones de api/nova.js):
// mensajes de UNA vía médico → paciente. Un mensaje no es expediente: cada
// médico ve solo los suyos; escribir pide el mismo permiso que el expediente
// (nunca a un demo). Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const { validarMensaje } = require('../lib/mensajes');

const TBL_PAC = 'tblyUcCfueFLJuvIv', TBL_MED = 'tbl87DsuBMmb4DjFM';
const PAC = 'CC-PAC-200001', DEMO = 'CC-PAC-DEMO01';
const PACIENTES = {
  recPACREAL: { id: 'recPACREAL', fields: { 'Código de paciente': PAC, 'Médico_principal': ['recMEDPROP'] } },
  recPACDEMO: { id: 'recPACDEMO', fields: { 'Código de paciente': DEMO, 'Es demo': true, 'Médico_principal': ['recMEDPROP'] } },
};
const MEDICOS = { 'CCMED-PROP01': { id: 'recMEDPROP', nombre: 'Dra. Propia' }, 'CCMED-AJEN01': { id: 'recMEDAJEN', nombre: 'Dr. Ajeno' }, 'CCMED-OTRO01': { id: 'recMEDOTRO', nombre: 'Dr. Otro' } };

test('validarMensaje: limpia, exige texto y respeta el máximo', () => {
  assert.deepStrictEqual(validarMensaje('  Hola  \r\n\r\n\r\n\r\nVen en ayunas.  '), { ok: true, valor: 'Hola\n\nVen en ayunas.' });
  assert.strictEqual(validarMensaje('   ').ok, false);
  assert.strictEqual(validarMensaje(null).ok, false);
  assert.strictEqual(validarMensaje('a'.repeat(1000)).ok, true);
  assert.strictEqual(validarMensaje('a'.repeat(1001)).ok, false);
});

function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

// Airtable de mentira con MENSAJES_PACIENTE en memoria (filtra por las
// fórmulas que manda lib/mensajes.js).
function mundo({ fallaMensajes = false, previos = [] } = {}) {
  const mensajes = previos.map(m => ({ ...m, fields: { ...m.fields } }));
  const cap = { posts: [], patches: [], lecturas: [] };
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url)); const metodo = opts.method || 'GET';
    const ok = d => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
    if (u.includes('tblSpORAqLKxYOI6W')) return ok({ records: [{ id: 'recACC' }] });
    if (u.includes('tbl9PS3KNBxbRVriV') || u.includes('VINCULACIONES')) return ok({ records: [] });
    if (u.includes(`${TBL_MED}?`)) {
      const c = Object.keys(MEDICOS).find(k => u.includes(`"${k}"`));
      return ok({ records: c ? [{ id: MEDICOS[c].id, fields: { 'Código de médico': c, 'Tipo de acceso': 'Clinico', 'Nombre completo': MEDICOS[c].nombre } }] : [] });
    }
    if (u.includes(`${TBL_PAC}?`)) { const p = Object.values(PACIENTES).find(x => u.includes(`"${x.fields['Código de paciente']}"`)); return ok({ records: p ? [p] : [] }); }
    if (u.includes('MENSAJES_PACIENTE')) {
      if (fallaMensajes) return { ok: false, status: 503, json: async () => ({}) };
      if (metodo === 'POST') {
        const f = JSON.parse(opts.body).records[0].fields; cap.posts.push(f);
        const rec = { id: 'recMSG' + String(mensajes.length + 1).padStart(11, '0'), fields: f };
        mensajes.push(rec); return ok({ records: [rec] });
      }
      if (metodo === 'PATCH') {
        const recs = JSON.parse(opts.body).records; cap.patches.push(...recs);
        return ok({ records: recs.map(r => { const m = mensajes.find(x => x.id === r.id); Object.assign(m.fields, r.fields); return m; }) });
      }
      cap.lecturas.push(u);
      const pac = (u.match(/\{Código de paciente ref\}="([^"]+)"/) || [])[1];
      const med = (u.match(/\{Código de médico ref\}="([^"]+)"/) || [])[1];
      const ids = [...u.matchAll(/RECORD_ID\(\)="(rec[A-Za-z0-9]+)"/g)].map(x => x[1]);
      return ok({ records: mensajes.filter(m => m.fields['Código de paciente ref'] === pac && (!med || m.fields['Código de médico ref'] === med) && (!ids.length || ids.includes(m.id))) });
    }
    throw new Error(`fetch no mockeado: ${metodo} ${u}`);
  };
  return { cap, mensajes, restaurar: () => { global.fetch = original; } };
}

async function nova(sesion, body) {
  const res = fakeRes();
  const headers = { 'content-type': 'application/json' };
  if (sesion) headers.authorization = `Bearer ${generarToken({ horas: 1, ...sesion })}`;
  delete require.cache[require.resolve('../api/nova.js')];
  await require('../api/nova.js')({ method: 'POST', headers, body }, res);
  return res;
}
const medico = codigo => ({ tipo: 'medico', codigo });
const paciente = { tipo: 'paciente', codigo: PAC };

test('enviar: el médico autorizado escribe; autor y nombre los fija el servidor, no el cuerpo', async () => {
  const w = mundo();
  try {
    const r = await nova(medico('CCMED-PROP01'), { action: 'medico_enviar_mensaje', pacienteCode: PAC, mensaje: ' Recuerda venir en ayunas. ', codigoMedico: 'CCMED-OTRO01', medico: 'Impostor' });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(w.cap.posts.length, 1);
    const f = w.cap.posts[0];
    assert.strictEqual(f['Código de paciente ref'], PAC);
    assert.strictEqual(f['Código de médico ref'], 'CCMED-PROP01');
    assert.strictEqual(f['Médico'], 'Dra. Propia');
    assert.strictEqual(f['Mensaje'], 'Recuerda venir en ayunas.');
    assert.ok(f['Fecha envío']);
    assert.strictEqual(r.body.mensaje.mensaje, 'Recuerda venir en ayunas.');
  } finally { w.restaurar(); }
});

test('enviar: médico ajeno → 403, demo → 403, sin sesión → 401, paciente → 401, vacío → 400; nada se escribe', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(medico('CCMED-AJEN01'), { action: 'medico_enviar_mensaje', pacienteCode: PAC, mensaje: 'Hola' })).statusCode, 403);
    assert.strictEqual((await nova(medico('CCMED-PROP01'), { action: 'medico_enviar_mensaje', pacienteCode: DEMO, mensaje: 'Hola' })).statusCode, 403);
    assert.strictEqual((await nova(null, { action: 'medico_enviar_mensaje', pacienteCode: PAC, mensaje: 'Hola' })).statusCode, 401);
    assert.strictEqual((await nova(paciente, { action: 'medico_enviar_mensaje', pacienteCode: PAC, mensaje: 'Hola' })).statusCode, 401, 'solo de ida: el paciente no escribe');
    assert.strictEqual((await nova(medico('CCMED-PROP01'), { action: 'medico_enviar_mensaje', pacienteCode: PAC, mensaje: '  ' })).statusCode, 400);
    assert.strictEqual(w.cap.posts.length, 0);
  } finally { w.restaurar(); }
});

test('enviar: si Airtable falla → 502, nunca "enviado"', async () => {
  const w = mundo({ fallaMensajes: true });
  try {
    const r = await nova(medico('CCMED-PROP01'), { action: 'medico_enviar_mensaje', pacienteCode: PAC, mensaje: 'Hola' });
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.mensaje, undefined);
  } finally { w.restaurar(); }
});

const PREVIOS = [
  { id: 'recMSG00000000001', fields: { 'Código de paciente ref': PAC, 'Código de médico ref': 'CCMED-PROP01', 'Médico': 'Dra. Propia', 'Mensaje': 'De la propia', 'Fecha envío': '2026-10-25T10:00:00.000Z' } },
  { id: 'recMSG00000000002', fields: { 'Código de paciente ref': PAC, 'Código de médico ref': 'CCMED-OTRO01', 'Médico': 'Dr. Otro', 'Mensaje': 'Del otro', 'Fecha envío': '2026-10-26T10:00:00.000Z' } },
  { id: 'recMSG00000000003', fields: { 'Código de paciente ref': 'CC-PAC-200009', 'Código de médico ref': 'CCMED-PROP01', 'Médico': 'Dra. Propia', 'Mensaje': 'De otro paciente', 'Fecha envío': '2026-10-26T11:00:00.000Z' } },
];

test('listar (médico): solo los que ÉL escribió a ese paciente; demo → vacío de solo lectura', async () => {
  const w = mundo({ previos: PREVIOS });
  try {
    const r = await nova(medico('CCMED-PROP01'), { action: 'medico_listar_mensajes', pacienteCode: PAC });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.mensajes.map(m => m.mensaje), ['De la propia']);
    const d = await nova(medico('CCMED-PROP01'), { action: 'medico_listar_mensajes', pacienteCode: DEMO });
    assert.deepStrictEqual(d.body, { ok: true, mensajes: [], soloLectura: true });
    assert.strictEqual((await nova(medico('CCMED-AJEN01'), { action: 'medico_listar_mensajes', pacienteCode: PAC })).statusCode, 403);
  } finally { w.restaurar(); }
});

test('buzón (paciente): todos los suyos, de todos sus médicos, nunca los de otro paciente; demo vacío', async () => {
  const w = mundo({ previos: PREVIOS });
  try {
    const r = await nova(paciente, { action: 'paciente_mis_mensajes', pacienteCode: 'CC-PAC-200009' });
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(r.body.mensajes.map(m => m.mensaje).sort(), ['De la propia', 'Del otro']);
    assert.deepStrictEqual(Object.keys(r.body.mensajes[0]).sort(), ['fecha', 'id', 'leido', 'medico', 'mensaje'], 'sin códigos internos');
    assert.deepStrictEqual((await nova({ tipo: 'demo', codigo: 'CC-PAC-200002' }, { action: 'paciente_mis_mensajes' })).body, { ok: true, mensajes: [] });
    assert.strictEqual((await nova(medico('CCMED-PROP01'), { action: 'paciente_mis_mensajes' })).statusCode, 401);
  } finally { w.restaurar(); }
});

test('buzón: fallo de lectura → 502, nunca "no tienes mensajes"', async () => {
  const w = mundo({ fallaMensajes: true });
  try {
    const r = await nova(paciente, { action: 'paciente_mis_mensajes' });
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.mensajes, undefined);
  } finally { w.restaurar(); }
});

test('marcar leídos: solo los suyos y solo los no leídos; ids ajenos se ignoran', async () => {
  const w = mundo({ previos: PREVIOS });
  try {
    const r = await nova(paciente, { action: 'paciente_marcar_leidos', ids: ['recMSG00000000001', 'recMSG00000000003', 'basura'] });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.marcados, 1);
    assert.deepStrictEqual(w.cap.patches.map(p => p.id), ['recMSG00000000001']);
    // Otra vez: ya estaba leído → nada.
    const r2 = await nova(paciente, { action: 'paciente_marcar_leidos', ids: ['recMSG00000000001'] });
    assert.strictEqual(r2.body.marcados, 0);
    assert.strictEqual(w.cap.patches.length, 1);
    assert.strictEqual((await nova({ tipo: 'demo', codigo: 'CC-PAC-200002' }, { action: 'paciente_marcar_leidos', ids: ['recMSG00000000002'] })).statusCode, 403);
  } finally { w.restaurar(); }
});

test('producción congelada: ni enviar ni marcar tocan Airtable', async () => {
  const w = mundo();
  const base = process.env.AIRTABLE_BASE_ID;
  try {
    delete process.env.AIRTABLE_BASE_ID;
    delete require.cache[require.resolve('../lib/congelamientoDatosPersonales')];
    assert.strictEqual((await nova(medico('CCMED-PROP01'), { action: 'medico_enviar_mensaje', pacienteCode: PAC, mensaje: 'Hola' })).statusCode, 503);
    assert.strictEqual((await nova(paciente, { action: 'paciente_marcar_leidos', ids: ['recMSG00000000001'] })).statusCode, 503);
    assert.strictEqual(w.cap.posts.length + w.cap.patches.length, 0);
  } finally {
    process.env.AIRTABLE_BASE_ID = base;
    delete require.cache[require.resolve('../lib/congelamientoDatosPersonales')];
    w.restaurar();
  }
});
