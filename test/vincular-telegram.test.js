// Hallazgo 2026-10-24: para vincular Telegram bastaba mandar al bot el código
// CCMED- de cualquier médico. Desde 2026-10-25 (decisión de Víctor) el primer
// vínculo solo se hace con la liga firmada que da el portal (/start <token>);
// un vínculo existente no se reemplaza y un chat no se vincula a dos médicos.
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
  const m = { parches: [], mensajes: [], credenciales: [] };
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    if (u.includes('api.telegram.org')) { m.mensajes.push(JSON.parse(opts.body).text); return ok({ ok: true }); }
    if (u.includes('CREDENCIALES_MEDICO')) {
      if (opts.method === 'POST') { m.credenciales.push(JSON.parse(opts.body).records[0].fields); return ok({ records: [{ id: 'recCRED' }] }); }
      return ok({ records: [] });
    }
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

// ── Vínculo desde el portal: /start <token> (2026-10-25) ──────────────
const vinculo = require('../lib/vinculoTelegram');
const liga = (codigo = 'CCMED-VIRN01', ahora) => '/start ' + vinculo.emitirToken(codigo, ahora);

test('el código CCMED- solo ya NO vincula (ni a un médico sin Telegram)', async () => {
  const m = mundo({ porCodigo: VIRN(null) });
  await mensaje(777, 'CCMED-VIRN01');
  assert.strictEqual(m.parches.length, 0, 'mandar el código no escribe nada');
  assert.match(m.mensajes.join(' '), /ya no vincula/);
});

test('el código propio desde el Telegram ya vinculado: solo confirma', async () => {
  const m = mundo({ porCodigo: VIRN('111'), porChat: VIRN('111') });
  await mensaje(111, 'CCMED-VIRN01');
  assert.strictEqual(m.parches.length, 0);
  assert.match(m.mensajes.join(' '), /ya estaba vinculada/);
});

test('liga del portal: médico sin Telegram se vincula, y solo dice "vinculada" si se guardó', async () => {
  let m = mundo({ porCodigo: VIRN(null) });
  await mensaje(777, liga());
  assert.deepStrictEqual(m.parches, [{ 'Telegram Chat ID': '777' }]);
  assert.match(m.mensajes.join(' '), /vinculada correctamente/);

  m = mundo({ porCodigo: VIRN(null), fallaGuardar: true });
  await mensaje(777, liga());
  assert.ok(!/vinculada correctamente/.test(m.mensajes.join(' ')), 'no puede decir vinculada si Airtable falló');
  assert.match(m.mensajes.join(' '), /No pude guardar/);
});

test('liga del portal: un vínculo existente con OTRO Telegram no se reemplaza', async () => {
  const m = mundo({ porCodigo: VIRN('111') });
  await mensaje(999, liga());
  assert.strictEqual(m.parches.length, 0, 'no debe tocar el vínculo existente');
  assert.match(m.mensajes.join(' '), /ya está vinculada a otro Telegram/);
});

test('liga del portal: mismo Telegram que ya estaba vinculado → solo confirma', async () => {
  const m = mundo({ porCodigo: VIRN('111') });
  await mensaje(111, liga());
  assert.strictEqual(m.parches.length, 0);
  assert.match(m.mensajes.join(' '), /ya estaba vinculada/);
});

test('liga del portal: un Telegram de otro médico no se vincula a un segundo', async () => {
  const m = mundo({ porCodigo: VIRN(null), porChat: { id: 'recJCG', fields: { 'Código de médico': 'CCMED-JCG01' } } });
  await mensaje(555, liga());
  assert.strictEqual(m.parches.length, 0);
  assert.match(m.mensajes.join(' '), /solo puede pertenecer a un médico/);
});

test('liga vencida, alterada o de otro médico con firma ajena → no vincula', async () => {
  let m = mundo({ porCodigo: VIRN(null) });
  await mensaje(777, liga('CCMED-VIRN01', Date.now() - 31 * 60 * 1000));
  assert.strictEqual(m.parches.length, 0);
  assert.match(m.mensajes.join(' '), /venció/);

  // Se cambia el código dentro del token conservando la firma de VIRN01.
  const t = vinculo.emitirToken('CCMED-VIRN01');
  m = mundo({ porCodigo: VIRN(null) });
  await mensaje(777, '/start ' + t.replace(/^VIRN01_/, 'JCG01_'));
  assert.strictEqual(m.parches.length, 0);
  assert.match(m.mensajes.join(' '), /no es válido/);
});

test('liga de un médico desactivado → no vincula', async () => {
  const m = mundo({ porCodigo: { id: 'recVIRN', fields: { 'Código de médico': 'CCMED-VIRN01', 'Activo': false } } });
  await mensaje(777, liga());
  assert.strictEqual(m.parches.length, 0);
});

test('token: cabe en el /start de Telegram (≤64, [A-Za-z0-9_-]) y la firma depende del secreto', () => {
  const t = vinculo.emitirToken('CCMED-ABCDEFGHIJKLMNOPQRSTUVWX');
  assert.ok(t.length <= 64 && /^[A-Za-z0-9_-]+$/.test(t), t);
  assert.deepStrictEqual(vinculo.verificarToken(vinculo.emitirToken('CCMED-VIRN01')), { ok: true, codigo: 'CCMED-VIRN01' });
  assert.throws(() => vinculo.emitirToken('CC-PAC-123456'));
});

// ── /pin: liga de PIN enviada solo al Telegram ya vinculado ───────────
const { hashLiga } = require('../lib/credenciales');

test('/pin desde el Telegram vinculado → liga de activación de ESE médico', async () => {
  const m = mundo({ porCodigo: null, porChat: VIRN('111') });
  await mensaje(111, '/pin');
  assert.strictEqual(m.credenciales.length, 1);
  const c = m.credenciales[0];
  assert.strictEqual(c['Código de médico ref'], 'CCMED-VIRN01');
  assert.deepStrictEqual(c['Médico'], ['recVIRN']);
  // Telegram recibe HTML (parse_mode): "&amp;" se ve como "&".
  const texto = m.mensajes.join(' ').replace(/&amp;/g, '&');
  const liga = (texto.match(/activar=([A-Za-z0-9_-]{43})&t=medico/) || [])[1];
  assert.ok(liga, texto);
  assert.strictEqual(c['Liga (hash)'], hashLiga(liga), 'en Airtable solo queda el HMAC de la liga enviada');
  assert.ok(!JSON.stringify(c).includes(liga), 'la liga en claro no se guarda');
});

test('/pin desde un Telegram NO vinculado → no se emite nada', async () => {
  const m = mundo({ porCodigo: null, porChat: null });
  await mensaje(999, '/pin');
  assert.strictEqual(m.credenciales.length, 0);
  assert.ok(!/activar=/.test(m.mensajes.join(' ')));
});

test('/pin de un médico desactivado → no se emite nada', async () => {
  const m = mundo({ porCodigo: null, porChat: { id: 'recVIRN', fields: { 'Código de médico': 'CCMED-VIRN01', 'Telegram Chat ID': '111', 'Activo': false } } });
  await mensaje(111, '/pin');
  assert.strictEqual(m.credenciales.length, 0);
  assert.match(m.mensajes.join(' '), /desactivado/);
});
