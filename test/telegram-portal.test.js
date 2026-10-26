// "Vincular Telegram" del portal (nova medico_telegram): la liga se emite
// solo para el médico de la SESIÓN, nunca devuelve el chat id, y un fallo de
// Airtable o de Telegram se ve como fallo. Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '123:token-de-prueba';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const vinculo = require('../lib/vinculoTelegram');

function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

function mundo({ medico, fallaAirtable = false, fallaTelegram = false }) {
  const pedidos = [];
  const original = global.fetch;
  global.fetch = async (url) => {
    const u = decodeURIComponent(String(url)); pedidos.push(u);
    const ok = d => ({ ok: true, status: 200, json: async () => d });
    if (u.includes('api.telegram.org')) return fallaTelegram ? { ok: false, status: 502, json: async () => ({}) } : ok({ ok: true, result: { username: 'CodeCellsPruebaBot' } });
    if (u.includes('tbl87DsuBMmb4DjFM?')) return fallaAirtable ? { ok: false, status: 503, json: async () => ({}) } : ok({ records: medico ? [medico] : [] });
    throw new Error('fetch no mockeado: ' + u);
  };
  return { pedidos, restaurar: () => { global.fetch = original; } };
}

async function nova(token, body) {
  const res = fakeRes();
  delete require.cache[require.resolve('../api/nova.js')];
  await require('../api/nova.js')({ method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: { action: 'medico_telegram', ...body } }, res);
  return res;
}
const tokenVirn = () => generarToken({ tipo: 'medico', codigo: 'CCMED-VIRN01', horas: 1 });

test('sin Telegram: liga t.me del bot del ambiente con token del médico de la SESIÓN', async () => {
  const w = mundo({ medico: { id: 'recV', fields: {} } });
  try {
    const r = await nova(tokenVirn(), { modo: 'liga', codigo: 'CCMED-JCG01' });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    const m = /^https:\/\/t\.me\/CodeCellsPruebaBot\?start=(\S+)$/.exec(r.body.url);
    assert.ok(m, r.body.url);
    assert.deepStrictEqual(vinculo.verificarToken(m[1]), { ok: true, codigo: 'CCMED-VIRN01' });
    assert.ok(w.pedidos.some(u => u.includes('{Código de médico}="CCMED-VIRN01"')));
    assert.ok(!w.pedidos.some(u => u.includes('JCG01')), 'ignora el código del cuerpo');
  } finally { w.restaurar(); }
});

test('ya vinculado: no emite liga ni devuelve el chat id', async () => {
  const w = mundo({ medico: { id: 'recV', fields: { 'Telegram Chat ID': '987654' } } });
  try {
    const r = await nova(tokenVirn(), { modo: 'liga' });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.body.vinculado, true);
    assert.strictEqual(r.body.url, undefined);
    assert.ok(!JSON.stringify(r.body).includes('987654'));
  } finally { w.restaurar(); }
});

test('modo estado: solo dice si está vinculado, sin liga', async () => {
  const w = mundo({ medico: { id: 'recV', fields: {} } });
  try {
    const r = await nova(tokenVirn(), { modo: 'estado' });
    assert.deepStrictEqual(r.body, { ok: true, vinculado: false });
  } finally { w.restaurar(); }
});

test('sin sesión, sesión de paciente → 401; médico desactivado → 403', async () => {
  const w = mundo({ medico: { id: 'recV', fields: { Activo: false } } });
  try {
    assert.strictEqual((await nova(null, { modo: 'liga' })).statusCode, 401);
    assert.strictEqual((await nova(generarToken({ tipo: 'paciente', codigo: 'CC-PAC-200001', horas: 1 }), { modo: 'liga' })).statusCode, 401);
    assert.strictEqual((await nova(tokenVirn(), { modo: 'liga' })).statusCode, 403);
  } finally { w.restaurar(); }
});

test('Airtable o Telegram fallan → 502, nunca "vinculado"', async () => {
  let w = mundo({ medico: null, fallaAirtable: true });
  try {
    const r = await nova(tokenVirn(), { modo: 'estado' });
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.vinculado, undefined);
  } finally { w.restaurar(); }
  w = mundo({ medico: { id: 'recV', fields: {} }, fallaTelegram: true });
  try {
    const r = await nova(tokenVirn(), { modo: 'liga' });
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.url, undefined);
  } finally { w.restaurar(); }
});
