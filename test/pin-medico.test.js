// PIN del médico (2026-10-24, decisión de Víctor): el código CCMED- ya no
// basta para entrar al portal; se exige PIN contra CREDENCIALES_MEDICO, y la
// cuenta se activa con una liga de un solo uso que emite administración.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';

const test = require('node:test');
const assert = require('node:assert');
const { verificarToken } = require('../lib/auth');
const credenciales = require('../lib/credenciales');

const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const PIN = '482917';

function fakeRes() {
  return {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader() {}, end() { return this; },
  };
}
const ok = d => ({ ok: true, status: 200, json: async () => d });

// medico: campos del registro de MÉDICOS; cred: campos de CREDENCIALES_MEDICO (null = no existe).
function mundo({ medico = { 'Código de médico': 'CCMED-QACARD', 'Nombre completo': 'QA Cardiólogo' }, cred = {}, falla = false } = {}) {
  const m = { parches: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('CREDENCIALES_MEDICO')) {
      if (falla) return { ok: false, status: 429, json: async () => ({}) };
      if (opts.method === 'PATCH') { m.parches.push(JSON.parse(opts.body).fields); return ok({}); }
      return ok({ records: cred ? [{ id: 'recCRED', fields: { 'Médico': ['recMED'], ...cred } }] : [] });
    }
    if (u.includes(`/${TBL_MEDICOS}/recMED`)) return ok({ id: 'recMED', fields: medico });
    if (u.includes(`/${TBL_MEDICOS}?`)) return ok({ records: [{ id: 'recMED', fields: medico }] });
    throw new Error('fetch no mockeado: ' + u);
  };
  return m;
}

function login(body) {
  delete require.cache[require.resolve('../api/auth-login.js')];
  const res = fakeRes();
  return require('../api/auth-login.js')({ method: 'POST', body }, res).then(() => res);
}

const activada = () => ({ 'Cuenta activada': true, 'PIN (hash)': credenciales.hashPin(PIN) });

test('médico sin PIN ni credencial → 401 sin_activar, sin token', async () => {
  mundo({ cred: null });
  const r = await login({ tipo: 'medico', codigo: 'CCMED-QACARD' });
  assert.strictEqual(r.statusCode, 401);
  assert.strictEqual(r.body.motivo, 'sin_activar');
  assert.match(r.body.error, /administración/);
  assert.ok(!r.body.token);
});

test('médico activado sin PIN → 401 pin_requerido', async () => {
  mundo({ cred: activada() });
  const r = await login({ tipo: 'medico', codigo: 'CCMED-QACARD' });
  assert.deepStrictEqual([r.statusCode, r.body.motivo, !!r.body.token], [401, 'pin_requerido', false]);
});

test('médico con PIN incorrecto → 401 y el fallo se cuenta', async () => {
  const m = mundo({ cred: activada() });
  const r = await login({ tipo: 'medico', codigo: 'CCMED-QACARD', pin: '111222' });
  assert.deepStrictEqual([r.statusCode, r.body.motivo], [401, 'pin_incorrecto']);
  assert.deepStrictEqual(m.parches, [{ 'Intentos fallidos': 1 }]);
});

test('médico con PIN correcto → token de médico', async () => {
  mundo({ cred: activada() });
  const r = await login({ tipo: 'medico', codigo: 'CCMED-QACARD', pin: PIN });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  const s = verificarToken(r.body.token);
  assert.deepStrictEqual([s.tipo, s.codigo], ['medico', 'CCMED-QACARD']);
});

test('médico bloqueado por intentos → 429 aunque traiga el PIN correcto', async () => {
  mundo({ cred: { ...activada(), 'Intentos fallidos': 5, 'Bloqueado hasta': new Date(Date.now() + 600000).toISOString() } });
  const r = await login({ tipo: 'medico', codigo: 'CCMED-QACARD', pin: PIN });
  assert.deepStrictEqual([r.statusCode, r.body.motivo, !!r.body.token], [429, 'bloqueado', false]);
});

test('si CREDENCIALES_MEDICO no responde → 503, nunca "no activada" ni token', async () => {
  mundo({ falla: true });
  const r = await login({ tipo: 'medico', codigo: 'CCMED-QACARD', pin: PIN });
  assert.strictEqual(r.statusCode, 503);
  assert.ok(!r.body.token);
});

test('médico dado de baja (Activo = false) no entra ni con PIN correcto', async () => {
  mundo({ medico: { 'Código de médico': 'CCMED-QACARD', 'Activo': false }, cred: activada() });
  const r = await login({ tipo: 'medico', codigo: 'CCMED-QACARD', pin: PIN });
  assert.strictEqual(r.statusCode, 401);
  assert.ok(!r.body.token);
});

// ── Activación con liga ───────────────────────────────────────────────
const LIGA = 'A'.repeat(43);
const ligaViva = () => ({ 'Liga (hash)': credenciales.hashLiga(LIGA), 'Liga vence': new Date(Date.now() + 3600000).toISOString() });

test('activación de médico: consultar saluda por nombre y activar guarda PIN, borra la liga y entrega token', async () => {
  let m = mundo({ cred: ligaViva() });
  let r = await login({ modo: 'consultar_activacion', tipo: 'medico', liga: LIGA });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepStrictEqual([r.body.tipo, r.body.nombre, r.body.codigo], ['medico', 'QA', 'CCMED-QACARD']);

  m = mundo({ cred: ligaViva() });
  r = await login({ modo: 'activar', tipo: 'medico', liga: LIGA, pin: PIN });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.strictEqual(verificarToken(r.body.token).tipo, 'medico');
  const p = m.parches[0];
  assert.strictEqual(p['Cuenta activada'], true);
  assert.ok(credenciales.verificarPin(PIN, p['PIN (hash)']));
  assert.deepStrictEqual([p['Liga (hash)'], p['Liga vence']], ['', null], 'la liga es de un solo uso');
});

test('activación de médico: PIN trivial se rechaza y la liga sigue sirviendo', async () => {
  const m = mundo({ cred: ligaViva() });
  const r = await login({ modo: 'activar', tipo: 'medico', liga: LIGA, pin: '123456' });
  assert.deepStrictEqual([r.statusCode, r.body.motivo], [400, 'pin_trivial']);
  assert.strictEqual(m.parches.length, 0);
});

test('activación de médico: liga vencida o de un médico dado de baja → mismo 403', async () => {
  mundo({ cred: { 'Liga (hash)': credenciales.hashLiga(LIGA), 'Liga vence': new Date(Date.now() - 1000).toISOString() } });
  let r = await login({ modo: 'activar', tipo: 'medico', liga: LIGA, pin: PIN });
  assert.deepStrictEqual([r.statusCode, r.body.motivo], [403, 'liga_invalida']);
  mundo({ medico: { 'Código de médico': 'CCMED-QACARD', 'Activo': false }, cred: ligaViva() });
  r = await login({ modo: 'activar', tipo: 'medico', liga: LIGA, pin: PIN });
  assert.deepStrictEqual([r.statusCode, r.body.motivo], [403, 'liga_invalida']);
});
