// Red de seguridad para el gate de autenticación del webhook de Telegram
// (api/telegram-bot.js): un update sin X-Telegram-Bot-Api-Secret-Token, o con
// uno que no coincide, debe rechazarse con 401 antes de tocar Airtable/Telegram.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.TELEGRAM_WEBHOOK_SECRET = 'secreto-de-prueba-no-es-real';

const test = require('node:test');
const assert = require('node:assert');

const telegramBot = require('../api/telegram-bot');

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    send(obj) { this.body = obj; return this; },
    setHeader() {},
    end() { return this; },
  };
}

// Ningún caso de este archivo debe llegar a red — si algo cambia el gate y
// se cuela una llamada real, la prueba falla ruidosamente en vez de pasar
// por accidente contra un mock permisivo.
function instalarFetchQueBloqueaTodo() {
  const original = global.fetch;
  global.fetch = async (url) => {
    throw new Error(`fetch inesperado en test de gate de autenticación: ${url}`);
  };
  return () => { global.fetch = original; };
}

test('update de Telegram sin header secret_token -> 401, sin tocar red', async () => {
  const restaurar = instalarFetchQueBloqueaTodo();
  try {
    const req = { method: 'POST', headers: {}, body: { message: { chat: { id: 1 }, text: '/start' } } };
    const res = fakeRes();
    await telegramBot(req, res);
    assert.strictEqual(res.statusCode, 401);
  } finally {
    restaurar();
  }
});

test('update de Telegram con secret_token incorrecto -> 401, sin tocar red', async () => {
  const restaurar = instalarFetchQueBloqueaTodo();
  try {
    const req = {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'lo-que-sea-menos-el-real' },
      body: { message: { chat: { id: 1 }, text: '/start' } },
    };
    const res = fakeRes();
    await telegramBot(req, res);
    assert.strictEqual(res.statusCode, 401);
  } finally {
    restaurar();
  }
});

test('update de Telegram con secret_token correcto pasa el gate (no 401)', async () => {
  const restaurar = instalarFetchQueBloqueaTodo();
  try {
    // Update sin message.text: el handler responde 200 antes de tocar
    // Airtable, así que sirve para probar "pasó el gate" sin mockear red.
    const req = {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET },
      body: { update_id: 1, message: { chat: { id: 1 } } },
    };
    const res = fakeRes();
    await telegramBot(req, res);
    assert.notStrictEqual(res.statusCode, 401);
    assert.strictEqual(res.statusCode, 200);
  } finally {
    restaurar();
  }
});

test('alerta interna (x-internal-secret) sigue funcionando sin el secret de Telegram', async () => {
  // El gate nuevo va DESPUÉS del bloque de alerta interna — la alerta
  // interna nunca debe empezar a exigir TELEGRAM_WEBHOOK_SECRET.
  process.env.INTERNAL_ALERT_SECRET = 'internal-secret-no-es-real';
  const original = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('api.telegram.org')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) };
    }
    throw new Error(`fetch inesperado: ${url}`);
  };
  try {
    const req = {
      method: 'POST',
      headers: { 'x-internal-secret': 'internal-secret-no-es-real' },
      body: { chatId: 123, mensaje: 'hola' },
    };
    const res = fakeRes();
    await telegramBot(req, res);
    assert.notStrictEqual(res.statusCode, 401);
  } finally {
    global.fetch = original;
  }
});

test('sin TELEGRAM_WEBHOOK_SECRET configurado, falla cerrado (401) aunque no venga header', async () => {
  const previo = process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  const restaurar = instalarFetchQueBloqueaTodo();
  try {
    const req = { method: 'POST', headers: {}, body: { message: { chat: { id: 1 }, text: '/start' } } };
    const res = fakeRes();
    await telegramBot(req, res);
    assert.strictEqual(res.statusCode, 401);
  } finally {
    restaurar();
    process.env.TELEGRAM_WEBHOOK_SECRET = previo;
  }
});
