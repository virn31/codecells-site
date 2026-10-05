// Cobertura de los ALTOS restantes de la auditoría de lecturas sin r.ok
// (2026-08-24) y de lo encontrado al corregirlos (2026-10-05):
//   A1  solicitud de cita / valoración: NOVA respondía "ya avisé a tu
//       médico" antes de intentarlo; si fallaba, el paciente no se enteraba
//       (y en producción, con el congelamiento, nunca se hacía).
//   A4+ dictado por Telegram: guardaba en CUALQUIER paciente con solo su
//       código (sin autorizarPaciente ni Tipo de acceso).
//   A6  comparativo de labs del paciente: un fallo se veía como "sin estudios".
//   A8  completitud NOM-004: un fallo se reportaba como "faltan antecedentes".
//   A9  guardar-preconsulta: sin sesión, sobrescribía antecedentes → cerrado.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.TELEGRAM_WEBHOOK_SECRET = 'secreto-de-prueba-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');

const PACIENTES = 'tblyUcCfueFLJuvIv';
const MEDICOS = 'tbl87DsuBMmb4DjFM';
const SOLICITUDES_CITA = 'tblIj7vRoMhLg9CsL';
const LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';
const PENDIENTES = 'tbl7J1G8slqB8r0xu';
const CONSULTAS = 'tbl1Xp2IGxdV178Ky';
const HISTORIA = 'tblm2xUADazitHisR';
const DEDUPE = 'tblehEMlnMhPNVEBq';
const REC_MED = 'recMED0000000001';
const CHAT = 777;

const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const falla = (status = 429) => ({ ok: false, status, json: async () => ({ error: 'X' }), text: async () => 'x' });

function fakeRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
}
function fresco(ruta) { delete require.cache[require.resolve(ruta)]; return require(ruta); }

// Mundo mínimo: médico (Tipo de acceso configurable), paciente propio
// CC-PAC-9001 y ajeno CC-PAC-9002. `reglas(u, metodo)` puede devolver una
// respuesta para sobrescribir el comportamiento por defecto.
function instalar({ reglas = () => null, tipoAcceso = 'Clinico', anthropic } = {}) {
  const original = global.fetch;
  const cap = { posts: [], telegram: [], llamadas: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    cap.llamadas.push(`${metodo} ${u}`);
    if (metodo !== 'GET' && opts.body) { try { cap.posts.push({ u, metodo, body: JSON.parse(opts.body) }); } catch { cap.posts.push({ u, metodo }); } }
    const especial = reglas(u, metodo);
    if (especial) return especial;
    if (u.includes('api.telegram.org')) { cap.telegram.push(JSON.parse(opts.body).text); return ok({ ok: true, result: { message_id: 1 } }); }
    if (u.startsWith('https://api.anthropic.com/')) {
      const body = JSON.parse(opts.body);
      return ok(anthropic ? anthropic(body) : { content: [{ type: 'text', text: 'Respuesta.' }] });
    }
    if (u.includes(`/${MEDICOS}`)) {
      if (metodo !== 'GET') return ok({ id: REC_MED });
      return ok({ id: REC_MED, records: [{ id: REC_MED, fields: { 'Código de médico': 'CCMED-TEST01', 'Nombre completo': 'Dr. Prueba', 'Tipo de acceso': tipoAcceso, 'Telegram Chat ID': String(CHAT) } }], fields: { 'Código de médico': 'CCMED-TEST01' } });
    }
    if (u.includes(`/${PACIENTES}`)) {
      if (metodo !== 'GET') return ok({ id: 'recPAC9001' });
      if (u.includes(encodeURIComponent('CC-PAC-9002'))) return ok({ records: [{ id: 'recPAC9002', fields: { 'Código de paciente': 'CC-PAC-9002', 'Médico_principal': ['recOTRO000000001'] } }] });
      return ok({ id: 'recPAC9001', records: [{ id: 'recPAC9001', fields: { 'Código de paciente': 'CC-PAC-9001', 'Nombre completo': 'Ana', 'Médico_principal': [REC_MED] } }], fields: { 'Código de paciente': 'CC-PAC-9001', 'Nombre completo': 'Ana', 'Ciudad': 'Culiacán' } });
    }
    if (metodo !== 'GET') return ok({ id: 'recX', records: [{ id: 'recX' }] });
    return ok({ records: [] });
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

async function nova(body, sesion) {
  const handler = fresco('../api/nova.js');
  const res = fakeRes();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(sesion ? { authorization: `Bearer ${generarToken({ horas: 1, ...sesion })}` } : {}) },
    body,
  }, res);
  return res;
}
const PACIENTE = { tipo: 'paciente', codigo: 'CC-PAC-9001' };
const texto = (res) => (res.body.content || []).map((b) => b.text).join(' ');
const pideCita = () => ({ content: [{ type: 'tool_use', name: 'respuesta_nova_paciente', input: { reply: 'Listo, ya avisé a tu médico.', crear_solicitud_cita: true, solicitud_motivo: 'Dolor' } }] });
const pideValoracion = () => ({ content: [{ type: 'tool_use', name: 'respuesta_nova_paciente', input: { reply: 'Le aviso a tu médico.', requiere_valoracion_medica: true, motivo_valoracion: 'Mareo' } }] });

// ── A1 ────────────────────────────────────────────────────────────────

test('A1 cita: si la solicitud no se crea, el paciente lo sabe', async () => {
  const { restaurar } = instalar({ anthropic: pideCita, reglas: (u, m) => (m === 'POST' && u.includes(SOLICITUDES_CITA) ? falla(422) : null) });
  try {
    const res = await nova({ messages: [{ role: 'user', content: 'Quiero cita' }] }, PACIENTE);
    assert.match(texto(res), /No pude registrar tu solicitud de cita/);
  } finally { restaurar(); }
});

test('A1 cita: si se crea pero el aviso al médico falla, se dice que quedó registrada sin aviso', async () => {
  const { restaurar } = instalar({ anthropic: pideCita, reglas: (u) => (u.includes('codecells.mx/api/telegram-bot') ? falla(500) : null) });
  try {
    const res = await nova({ messages: [{ role: 'user', content: 'Quiero cita' }] }, PACIENTE);
    assert.match(texto(res), /quedó registrada, pero no pude avisarle/);
  } finally { restaurar(); }
});

test('A1 cita: si todo sale bien, sin avisos extra', async () => {
  const { restaurar } = instalar({ anthropic: pideCita });
  try {
    const res = await nova({ messages: [{ role: 'user', content: 'Quiero cita' }] }, PACIENTE);
    assert.strictEqual(texto(res), 'Listo, ya avisé a tu médico.');
  } finally { restaurar(); }
});

test('A1 cita: si la lectura del paciente falla, no hay solicitud y se dice', async () => {
  const { cap, restaurar } = instalar({ anthropic: pideCita, reglas: (u, m) => (m === 'GET' && u.includes(`/${PACIENTES}/recPAC9001`) ? falla() : null) });
  try {
    const res = await nova({ messages: [{ role: 'user', content: 'Quiero cita' }] }, PACIENTE);
    assert.match(texto(res), /No pude registrar tu solicitud de cita/);
    assert.ok(!cap.posts.some((p) => p.u.includes(SOLICITUDES_CITA)));
  } finally { restaurar(); }
});

test('A1 valoración: si el aviso al médico falla, el paciente lo sabe', async () => {
  const { restaurar } = instalar({ anthropic: pideValoracion, reglas: (u) => (u.includes('codecells.mx/api/telegram-bot') ? falla(500) : null) });
  try {
    const res = await nova({ messages: [{ role: 'user', content: 'Me mareo' }] }, PACIENTE);
    assert.match(texto(res), /No pude avisarle a tu médico/);
  } finally { restaurar(); }
});

// ── A6 ────────────────────────────────────────────────────────────────

test('A6 comparativo del paciente: un 429 → 502, no "sin estudios"', async () => {
  const { restaurar } = instalar({ reglas: (u, m) => (m === 'GET' && u.includes(LAB_VALORES) ? falla() : null) });
  try {
    const res = await nova({ action: 'paciente_comparativo_labs' }, PACIENTE);
    assert.strictEqual(res.statusCode, 502, JSON.stringify(res.body));
    assert.match(res.body.error, /no significa que no tengas/);
  } finally { restaurar(); }
});

// ── A8 ────────────────────────────────────────────────────────────────

async function completitud(sesion) {
  const handler = fresco('../api/nova-asistente-clinico.js');
  const res = fakeRes();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${generarToken({ horas: 1, ...sesion })}` },
    body: { accion: 'completitud_expediente', codigoPaciente: 'CC-PAC-9001' },
  }, res);
  return res;
}

test('A8 completitud NOM-004: un 429 → 502, no "faltan antecedentes / consultas"', async () => {
  const { restaurar } = instalar({ reglas: (u, m) => (m === 'GET' && (u.includes(HISTORIA) || u.includes(CONSULTAS)) ? falla() : null) });
  try {
    const res = await completitud({ tipo: 'medico', codigo: 'CCMED-TEST01' });
    assert.strictEqual(res.statusCode, 502, JSON.stringify(res.body));
    assert.ok(!JSON.stringify(res.body).includes('no tiene ningún antecedente'));
  } finally { restaurar(); }
});

test('A8 completitud: un médico Revisor no lee el expediente', async () => {
  const { restaurar } = instalar({ tipoAcceso: 'Revisor' });
  try {
    const res = await completitud({ tipo: 'medico', codigo: 'CCMED-TEST01' });
    assert.strictEqual(res.statusCode, 403);
  } finally { restaurar(); }
});

// ── A9 ────────────────────────────────────────────────────────────────

test('A9 guardar-preconsulta: cerrado (410), no escribe nada', async () => {
  const { cap, restaurar } = instalar();
  try {
    const handler = fresco('../api/guardar-preconsulta.js');
    const res = fakeRes();
    await handler({ method: 'POST', headers: {}, body: { codigoPaciente: 'CC-PAC-9001', alergias: 'ninguna' } }, res);
    assert.strictEqual(res.statusCode, 410);
    assert.strictEqual(cap.llamadas.length, 0);
  } finally { restaurar(); }
});

// ── Dictado por Telegram ──────────────────────────────────────────────

async function webhook(text, reglas, tipoAcceso) {
  const ctx = instalar({ reglas, tipoAcceso });
  try {
    const handler = fresco('../api/telegram-bot.js');
    const res = fakeRes();
    await handler({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'secreto-de-prueba-no-es-real' },
      body: { update_id: Date.now(), message: { chat: { id: CHAT }, text } },
    }, res);
    return ctx.cap;
  } finally { ctx.restaurar(); }
}

const dedupe = (u, m) => (u.includes(DEDUPE) ? ok(m === 'GET' ? { records: [] } : { id: 'recD' }) : null);

test('Telegram: dictar sobre un paciente AJENO → se rechaza sin interpretar ni guardar', async () => {
  const cap = await webhook('CC-PAC-9002 dolor de cabeza desde ayer', dedupe);
  assert.match(cap.telegram.at(-1), /No tienes acceso de escritura al paciente CC-PAC-9002/);
  assert.ok(!cap.llamadas.some((l) => l.includes('codecells.mx/api/nova')), 'mandó el dictado a NOVA');
  assert.ok(!cap.posts.some((p) => p.u.includes(PENDIENTES) || p.u.includes(CONSULTAS)));
});

test('Telegram: un médico Revisor no puede dictar', async () => {
  const cap = await webhook('CC-PAC-9001 dolor de cabeza desde ayer', dedupe, 'Revisor');
  assert.match(cap.telegram.at(-1), /tipo de acceso no permite/);
  assert.ok(!cap.posts.some((p) => p.u.includes(PENDIENTES) || p.u.includes(CONSULTAS)));
});

test('Telegram: confirmar ("sí") un dictado pendiente de un paciente AJENO → no se guarda y el pendiente sigue', async () => {
  const reglas = (u, m) => {
    const d = dedupe(u, m);
    if (d) return d;
    if (m === 'GET' && u.includes(PENDIENTES)) {
      return ok({ records: [{ id: 'recPEND', fields: { 'Chat ID': String(CHAT), 'Código de paciente': 'CC-PAC-9002', 'Ficha JSON': JSON.stringify({ motivo: 'x' }) } }] });
    }
    return null;
  };
  const cap = await webhook('sí', reglas);
  assert.match(cap.telegram.at(-1), /No tienes acceso de escritura/);
  assert.ok(!cap.posts.some((p) => p.u.includes(CONSULTAS)), 'guardó la consulta');
  assert.ok(!cap.posts.some((p) => p.u.includes(`${PENDIENTES}/recPEND`)), 'borró el pendiente');
});

test('Telegram: dictar sobre un paciente PROPIO sí pasa la puerta (llega a interpretar)', async () => {
  const cap = await webhook('CC-PAC-9001 dolor de cabeza desde ayer', dedupe);
  assert.ok(!cap.telegram.some((m) => /No tienes acceso|tipo de acceso/.test(m)), cap.telegram.join(' | '));
  assert.ok(cap.llamadas.some((l) => l.includes('codecells.mx/api/nova')), 'no llegó a interpretar el dictado');
});
