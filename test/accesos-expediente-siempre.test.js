// Bitácora de accesos (ACCESOS_EXPEDIENTE): decidido por Víctor 2026-10-05 —
// "siempre debe haber registro": reintento + alerta por Telegram con el
// registro completo; si Telegram también falla, log de Vercel.
// Corre con: node --test

process.env.AIRTABLE_TOKEN = 'test-airtable-token-no-es-real';
process.env.TELEGRAM_CHAT_ID = '424242';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';

const test = require('node:test');
const assert = require('node:assert');

const ACCESOS = 'tblSpORAqLKxYOI6W';
const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const falla = (status) => ({ ok: false, status, json: async () => ({}), text: async () => `error ${status}` });

function instalar({ respuestasAirtable, telegramFalla = false }) {
  const original = global.fetch;
  const cap = { airtable: 0, telegram: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes(ACCESOS)) {
      const r = respuestasAirtable[Math.min(cap.airtable, respuestasAirtable.length - 1)];
      cap.airtable++;
      if (r === 'red') throw new Error('ECONNRESET');
      return r;
    }
    if (u.includes('api.telegram.org')) {
      const body = JSON.parse(opts.body);
      cap.telegram.push(body);
      return ok(telegramFalla ? { ok: false, description: 'Forbidden' } : { ok: true, result: { message_id: 1 } });
    }
    throw new Error(`fetch no mockeado: ${u}`);
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

function fresco() {
  delete require.cache[require.resolve('../lib/accesosExpediente')];
  delete require.cache[require.resolve('../lib/telegram')];
  return require('../lib/accesosExpediente');
}

const ACCESO = { pacienteCode: 'CC-PAC-9001', codigoMedico: 'CCMED-TEST01', accion: 'Lectura de expediente', resultado: 'Exitoso', endpoint: 'airtable:pacientes:GET' };

test('bitácora: si Airtable acepta al primer intento, no hay reintento ni alerta', async () => {
  const { cap, restaurar } = instalar({ respuestasAirtable: [ok({ records: [{ id: 'rec1' }] })] });
  try {
    await fresco().registrarAccesoExpediente(ACCESO);
    assert.strictEqual(cap.airtable, 1);
    assert.strictEqual(cap.telegram.length, 0);
  } finally { restaurar(); }
});

test('bitácora: un 429 y un fallo de red se reintentan; al tercer intento queda guardado sin alerta', async () => {
  const { cap, restaurar } = instalar({ respuestasAirtable: [falla(429), 'red', ok({ records: [{ id: 'rec1' }] })] });
  try {
    await fresco().registrarAccesoExpediente(ACCESO);
    assert.strictEqual(cap.airtable, 3);
    assert.strictEqual(cap.telegram.length, 0);
  } finally { restaurar(); }
});

test('bitácora: si los 3 intentos fallan, llega a Telegram el registro completo', async () => {
  const { cap, restaurar } = instalar({ respuestasAirtable: [falla(503)] });
  try {
    await fresco().registrarAccesoExpediente(ACCESO);
    assert.strictEqual(cap.airtable, 3);
    assert.strictEqual(cap.telegram.length, 1);
    const m = cap.telegram[0];
    assert.strictEqual(m.chat_id, '424242');
    for (const dato of ['CC-PAC-9001', 'CCMED-TEST01', 'Lectura de expediente', 'Exitoso', 'airtable:pacientes:GET', 'Airtable 503', 'prueba']) {
      assert.ok(m.text.includes(dato), `falta "${dato}" en la alerta`);
    }
  } finally { restaurar(); }
});

test('bitácora: un 422 (campo inválido) no se reintenta en vano — alerta de inmediato', async () => {
  const { cap, restaurar } = instalar({ respuestasAirtable: [falla(422)] });
  try {
    await fresco().registrarAccesoExpediente(ACCESO);
    assert.strictEqual(cap.airtable, 1);
    assert.strictEqual(cap.telegram.length, 1);
  } finally { restaurar(); }
});

test('bitácora: si Telegram también falla, el registro completo queda en el log y no lanza', async () => {
  const { restaurar } = instalar({ respuestasAirtable: [falla(422)], telegramFalla: true });
  const originalError = console.error;
  const logs = [];
  console.error = (...a) => logs.push(a.join(' '));
  try {
    await fresco().registrarAccesoExpediente(ACCESO);
    assert.ok(logs.some((l) => l.includes('REGISTRO PERDIDO') && l.includes('CC-PAC-9001') && l.includes('CCMED-TEST01')), logs.join('\n'));
  } finally { console.error = originalError; restaurar(); }
});
