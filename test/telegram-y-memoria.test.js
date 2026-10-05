// Cobertura de los ALTOS de la auditoría de lecturas sin r.ok que perdían
// datos, y del formato de Telegram (2026-10-05):
//   - entregarRespuestaAlPaciente (telegram-bot): si la lectura previa fallaba
//     se borraban las respuestas pendientes anteriores; si el guardado
//     fallaba el hilo quedaba "Respondido" y el médico leía "Respuesta
//     enviada" aunque el paciente nunca la vería.
//   - airtableGet (telegram-bot): un 429 se leía como "no encontrado".
//   - Memoria NOVA (paciente): una lectura fallida borraba todo el historial.
//   - lib/telegram.js: *negritas* llegaban con asteriscos crudos.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.TELEGRAM_WEBHOOK_SECRET = 'secreto-de-prueba-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS'; // no producción → sin congelamiento
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');

const MEDICOS = 'tbl87DsuBMmb4DjFM';
const DEDUPE = 'tblehEMlnMhPNVEBq';
const HILOS = 'tblTW5X6f2UkuUFPT';
const PACIENTES = 'tblyUcCfueFLJuvIv';
const CHAT = 555;

const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const falla = (status = 429) => ({ ok: false, status, json: async () => ({ error: 'RATE_LIMIT' }), text: async () => 'x' });

function fakeRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
}
function fresco(ruta) { delete require.cache[require.resolve(ruta)]; return require(ruta); }

// ── lib/telegram.js ───────────────────────────────────────────────────

test('telegram: *negritas* → <b>, y el contenido dinámico se escapa', () => {
  const { markdownATelegramHTML } = fresco('../lib/telegram');
  assert.strictEqual(markdownATelegramHTML('*Solicitud* de Ana <M> & Co'), '<b>Solicitud</b> de Ana &lt;M&gt; &amp; Co');
  assert.strictEqual(markdownATelegramHTML('**Paciente:** CC-PAC-000123'), '<b>Paciente:</b> CC-PAC-000123');
  assert.strictEqual(markdownATelegramHTML('5 * 3 * 2 = 30'), '5 * 3 * 2 = 30');
  assert.strictEqual(markdownATelegramHTML('https://x.mx/a_b_c'), 'https://x.mx/a_b_c');
});

test('telegram: se envía con parse_mode HTML; si Telegram rechaza el formato, llega como texto plano', async () => {
  const original = global.fetch;
  const enviados = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    enviados.push(body);
    if (body.parse_mode === 'HTML') return ok({ ok: false, description: "Bad Request: can't parse entities" });
    return ok({ ok: true, result: { message_id: 1 } });
  };
  try {
    const { sendTelegramMessage } = fresco('../lib/telegram');
    const r = await sendTelegramMessage(CHAT, '*Hola* doctor');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(enviados[0].parse_mode, 'HTML');
    assert.strictEqual(enviados[0].text, '<b>Hola</b> doctor');
    assert.strictEqual(enviados[1].parse_mode, undefined);
    assert.strictEqual(enviados[1].text, 'Hola doctor');
  } finally { global.fetch = original; }
});

// ── telegram-bot: respuesta del médico al paciente ────────────────────

function instalarBot({ leerPacienteFalla = false, guardarFalla = false, medicoFalla = false } = {}) {
  const original = global.fetch;
  const cap = { mensajes: [], patches: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    if (u.includes('api.telegram.org')) {
      cap.mensajes.push(JSON.parse(opts.body).text);
      return ok({ ok: true, result: { message_id: 99 } });
    }
    if (metodo !== 'GET') cap.patches.push({ u, body: JSON.parse(opts.body) });
    if (u.includes(`/${DEDUPE}`)) return ok(metodo === 'GET' ? { records: [] } : { id: 'recDED' });
    if (u.includes(`/${MEDICOS}?`)) {
      if (medicoFalla) return falla();
      return ok({ records: [{ id: 'recMED', fields: { 'Código de médico': 'CCMED-TEST01', 'Nombre completo': 'Dr. Prueba', 'Telegram Chat ID': String(CHAT) } }] });
    }
    if (u.includes(`/${HILOS}?`)) return ok({ records: [{ id: 'recHILO', fields: { Paciente: ['recPAC'] } }] });
    if (u.includes(`/${HILOS}/recHILO`)) return ok({ id: 'recHILO' });
    if (u.includes(`/${PACIENTES}/recPAC`)) {
      if (metodo === 'GET') return leerPacienteFalla ? falla() : ok({ id: 'recPAC', fields: { 'Nombre completo': 'Ana', 'Respuesta médico pendiente': '[2026-10-01] Respuesta previa' } });
      return guardarFalla ? falla(422) : ok({ id: 'recPAC' });
    }
    throw new Error(`fetch no mockeado: ${metodo} ${u}`);
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

async function webhook(message) {
  const handler = fresco('../api/telegram-bot.js');
  const res = fakeRes();
  await handler({
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': 'secreto-de-prueba-no-es-real' },
    body: { update_id: Date.now(), message: { chat: { id: CHAT }, ...message } },
  }, res);
  return res;
}

const RESPUESTA = { text: 'Tome el medicamento con alimentos.', reply_to_message: { message_id: 77 } };
const hiloMarcado = (cap) => cap.patches.some((p) => p.u.includes(`/${HILOS}/recHILO`) && p.body.fields.Respondido === true);
const pacienteEscrito = (cap) => cap.patches.find((p) => p.u.includes(`/${PACIENTES}/recPAC`));

test('respuesta del médico: se conserva lo previo, se agrega la nueva y se marca el hilo', async () => {
  const { cap, restaurar } = instalarBot();
  try {
    await webhook(RESPUESTA);
    const escrito = pacienteEscrito(cap);
    assert.ok(escrito);
    assert.match(escrito.body.fields['Respuesta médico pendiente'], /Respuesta previa\n\[\d{4}-\d{2}-\d{2}\] Tome el medicamento/);
    assert.ok(hiloMarcado(cap));
    assert.match(cap.mensajes.at(-1), /Respuesta enviada/);
  } finally { restaurar(); }
});

test('respuesta del médico: si no se puede leer al paciente, NO se sobrescribe y el médico se entera', async () => {
  const { cap, restaurar } = instalarBot({ leerPacienteFalla: true });
  try {
    await webhook(RESPUESTA);
    assert.strictEqual(pacienteEscrito(cap), undefined, 'escribió sin haber leído lo previo');
    assert.ok(!hiloMarcado(cap));
    assert.match(cap.mensajes.at(-1), /problema temporal/);
  } finally { restaurar(); }
});

test('respuesta del médico: si el guardado falla, el hilo NO queda respondido ni se dice "enviada"', async () => {
  const { cap, restaurar } = instalarBot({ guardarFalla: true });
  try {
    await webhook(RESPUESTA);
    assert.ok(!hiloMarcado(cap));
    assert.ok(!cap.mensajes.some((m) => /Respuesta enviada/.test(m)));
    assert.match(cap.mensajes.at(-1), /problema temporal/);
  } finally { restaurar(); }
});

test('bot: un 429 al buscar al médico NO se lee como "no vinculado"', async () => {
  const { cap, restaurar } = instalarBot({ medicoFalla: true });
  try {
    await webhook({ text: 'hola' });
    assert.ok(!cap.mensajes.some((m) => /exclusivo para médicos/.test(m)), cap.mensajes.join(' | '));
    assert.match(cap.mensajes.at(-1), /problema temporal/);
  } finally { restaurar(); }
});

// ── Memoria NOVA del paciente ─────────────────────────────────────────

test('memoria NOVA: si la lectura previa falla, NO se sobrescribe el historial', async () => {
  const original = global.fetch;
  const patches = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    if (u.startsWith('https://api.anthropic.com/')) {
      return ok({ content: [{ type: 'tool_use', name: 'respuesta_nova_paciente', input: { reply: 'Anotado.', actualizar_memoria: 'Duerme mal desde hace un mes.' } }] });
    }
    if (metodo !== 'GET') { patches.push({ u, body: JSON.parse(opts.body) }); return ok({ id: 'recX', records: [{ id: 'recX' }] }); }
    if (u.includes(`/${PACIENTES}?`)) return ok({ records: [{ id: 'recPAC', fields: { 'Código de paciente': 'CC-PAC-9001', 'Nombre completo': 'Ana' } }] });
    if (u.includes(`/${PACIENTES}/recPAC`)) return falla(); // lectura previa de la memoria
    return ok({ records: [] });
  };
  try {
    const handler = fresco('../api/nova.js');
    const res = fakeRes();
    await handler({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${generarToken({ tipo: 'paciente', codigo: 'CC-PAC-9001', horas: 1 })}` },
      body: { messages: [{ role: 'user', content: 'Duermo mal' }] },
    }, res);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    const escribioMemoria = patches.some((p) => p.body && p.body.fields && 'Memoria NOVA (paciente)' in p.body.fields);
    assert.ok(!escribioMemoria, 'sobrescribió la memoria sin haber leído la previa');
  } finally { global.fetch = original; }
});
