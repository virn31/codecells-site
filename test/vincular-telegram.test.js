// Hallazgo 2026-10-24: para vincular Telegram bastaba mandar al bot el código
// CCMED- de cualquier médico, y el vínculo anterior se REEMPLAZABA sin
// preguntar — quien supiera el código se quedaba con el Telegram del médico y
// actuaba como él ante el bot. Ahora un vínculo existente no se reemplaza desde
// el bot y un chat no se vincula a dos médicos.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.TELEGRAM_WEBHOOK_SECRET = 'secreto-de-prueba-no-es-real';

const test = require('node:test');
const assert = require('node:assert');

const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';

function fakeRes() {
  return {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    setHeader() {}, end() { return this; },
  };
}
const ok = d => ({ ok: true, status: 200, json: async () => d });

// porCodigo: registro de MÉDICOS que devuelve la búsqueda por código (null = no existe).
// porChat: registro que ya tiene ese chat vinculado (null = ninguno).
function mundo({ porCodigo, porChat = null, fallaGuardar = false }) {
  const m = { parches: [], mensajes: [] };
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    if (u.includes('api.telegram.org')) { m.mensajes.push(JSON.parse(opts.body).text); return ok({ ok: true }); }
    if (u.includes(`/${TBL_MEDICOS}/`) && opts.method === 'PATCH') {
      if (fallaGuardar) return { ok: false, status: 429, json: async () => ({}) };
      m.parches.push(JSON.parse(opts.body).fields); return ok({});
    }
    if (u.includes(`/${TBL_MEDICOS}?`) && u.includes('{Telegram Chat ID}')) return ok({ records: porChat ? [porChat] : [] });
    if (u.includes(`/${TBL_MEDICOS}?`)) return ok({ records: porCodigo ? [porCodigo] : [] });
    // Otras tablas (conversación de agenda, bitácora del chat): vacías / ok.
    if (u.includes('api.airtable.com')) return ok({ records: [], id: 'recOTRA' });
    throw new Error('fetch no mockeado: ' + u);
  };
  return m;
}

function mensaje(chatId, texto) {
  delete require.cache[require.resolve('../api/telegram-bot.js')];
  const res = fakeRes();
  return require('../api/telegram-bot.js')({
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET },
    body: { message: { chat: { id: chatId }, text: texto } },
  }, res).then(() => res);
}

const VIRN = (chat) => ({ id: 'recVIRN', fields: { 'Código de médico': 'CCMED-VIRN01', 'Nombre completo': 'Dr. Víctor', ...(chat ? { 'Telegram Chat ID': chat } : {}) } });

test('un código ya vinculado a OTRO Telegram no se reemplaza', async () => {
  const m = mundo({ porCodigo: VIRN('111') });
  await mensaje(999, 'CCMED-VIRN01');
  assert.strictEqual(m.parches.length, 0, 'no debe tocar el vínculo existente');
  assert.match(m.mensajes.join(' '), /ya está vinculado a otra cuenta/);
});

test('mismo Telegram que ya estaba vinculado: no reescribe, solo confirma', async () => {
  const m = mundo({ porCodigo: VIRN('111') });
  await mensaje(111, 'CCMED-VIRN01');
  assert.strictEqual(m.parches.length, 0);
  assert.match(m.mensajes.join(' '), /ya estaba vinculada/);
});

test('un Telegram vinculado a un médico no se vincula a otro código', async () => {
  const m = mundo({ porCodigo: VIRN(null), porChat: { id: 'recJCG', fields: { 'Código de médico': 'CCMED-JCG01' } } });
  await mensaje(555, 'CCMED-VIRN01');
  assert.strictEqual(m.parches.length, 0);
  assert.match(m.mensajes.join(' '), /solo puede pertenecer a un médico/);
});

test('médico sin Telegram se vincula, y solo dice "vinculada" si se guardó', async () => {
  let m = mundo({ porCodigo: VIRN(null) });
  await mensaje(777, 'CCMED-VIRN01');
  assert.deepStrictEqual(m.parches, [{ 'Telegram Chat ID': '777' }]);
  assert.match(m.mensajes.join(' '), /vinculada correctamente/);

  m = mundo({ porCodigo: VIRN(null), fallaGuardar: true });
  await mensaje(777, 'CCMED-VIRN01');
  assert.ok(!/vinculada correctamente/.test(m.mensajes.join(' ')), 'no puede decir vinculada si Airtable falló');
  assert.match(m.mensajes.join(' '), /No pude guardar/);
});
