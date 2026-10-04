// Identidad del paciente (SPEC-PACIENTE-UNICO.md §3): el código CC-PAC- es
// solo un identificador; la credencial es un PIN verificado en el servidor,
// creado con una liga de activación de un solo uso que emite el médico.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS'; // no producción → sin congelamiento
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');

const { generarToken, verificarToken } = require('../lib/auth');
const cred = require('../lib/credencialesPaciente');

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const TBL_ACCESOS = 'tblSpORAqLKxYOI6W';

const PAC = 'CC-PAC-200001', REC_PAC = 'recPACREAL';
const DEMO = 'CC-PAC-DEMO01', REC_DEMO = 'recPACDEMO';
const MED = 'CCMED-PROP01', MED_AJENO = 'CCMED-AJEN01', MED_REV = 'CCMED-REVI01';
const MEDICOS = { [MED]: ['recMEDPROP', 'Clinico'], [MED_AJENO]: ['recMEDAJEN', 'Clinico'], [MED_REV]: ['recMEDREVI', 'Revisor'] };
const PACIENTES = {
  [REC_PAC]: { id: REC_PAC, fields: { 'Código de paciente': PAC, 'Nombre completo': 'Mariana Estrada', 'Médico_principal': ['recMEDPROP'] } },
  [REC_DEMO]: { id: REC_DEMO, fields: { 'Código de paciente': DEMO, 'Es demo': true, 'Médico_principal': ['recMEDPROP'] } },
};

function fakeRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } };
}

// Base en memoria: CREDENCIALES_PACIENTE se lee/escribe de verdad (como
// Airtable), para probar el ciclo completo emitir → activar → entrar.
function mundo({ credFalla = false } = {}) {
  const creds = {}; // recId → { id, fields }
  let n = 0;
  const bitacora = [];
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const metodo = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    const ok = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) });
    if (u.includes(TBL_ACCESOS)) { bitacora.push(body); return ok({ records: [{ id: 'recACC' }] }); }
    if (u.includes('INTERCONSULTAS') || u.includes('tbl9PS3KNBxbRVriV') || u.includes('VINCULACIONES')) return ok({ records: [] });
    if (u.includes('CREDENCIALES_PACIENTE')) {
      if (credFalla) return { ok: false, status: 429, json: async () => ({}), text: async () => '' };
      const m = u.match(/CREDENCIALES_PACIENTE\/(rec\w+)/);
      if (metodo === 'POST') { const id = 'recCRED' + (++n); creds[id] = { id, fields: { ...body.records[0].fields } }; return ok({ records: [creds[id]] }); }
      if (metodo === 'PATCH' && m) { Object.assign(creds[m[1]].fields, body.fields); return ok(creds[m[1]]); }
      const porCodigo = u.match(/\{Código de paciente ref\}="([^"]+)"/);
      const porLiga = u.match(/\{Liga \(hash\)\}="([^"]+)"/);
      const r = Object.values(creds).find(c => (porCodigo && c.fields['Código de paciente ref'] === porCodigo[1]) || (porLiga && porLiga[1] && c.fields['Liga (hash)'] === porLiga[1]));
      return ok({ records: r ? [r] : [] });
    }
    if (u.includes(`${TBL_MEDICOS}?`)) {
      const c = Object.keys(MEDICOS).find(k => u.includes(`"${k}"`));
      return ok({ records: c ? [{ id: MEDICOS[c][0], fields: { 'Código de médico': c, 'Tipo de acceso': MEDICOS[c][1] } }] : [] });
    }
    const recPac = u.match(new RegExp(`${TBL_PACIENTES}/(rec\\w+)`));
    if (recPac) return PACIENTES[recPac[1]] ? ok(PACIENTES[recPac[1]]) : { ok: false, status: 404, json: async () => ({}) };
    if (u.includes(`${TBL_PACIENTES}?`)) {
      const p = Object.values(PACIENTES).find(x => u.includes(`"${x.fields['Código de paciente']}"`));
      return ok({ records: p ? [p] : [] });
    }
    throw new Error(`fetch no mockeado: ${metodo} ${u}`);
  };
  return { creds, bitacora, restaurar: () => { global.fetch = original; } };
}

function cargar(ruta) {
  const rc = require.resolve('../lib/congelamientoDatosPersonales.js');
  delete require.cache[rc];
  delete require.cache[require.resolve(ruta)];
  return require(ruta);
}

async function login(body) {
  const res = fakeRes();
  await cargar('../api/auth-login.js')({ method: 'POST', body }, res);
  return res;
}

async function emitir(codigoMedico, pacienteCode, extra = {}) {
  const res = fakeRes();
  const headers = { 'content-type': 'application/json', origin: 'https://www.codecells.mx' };
  if (codigoMedico) headers.authorization = `Bearer ${generarToken({ tipo: 'medico', codigo: codigoMedico, horas: 1 })}`;
  await cargar('../api/nova.js')({ method: 'POST', headers, body: { action: 'medico_emitir_activacion', pacienteCode, ...extra } }, res);
  return res;
}

const ligaDe = (res) => new URL(res.body.url).searchParams.get('activar');

async function activarConPin(pin = '482917') {
  const e = await emitir(MED, PAC);
  assert.strictEqual(e.statusCode, 200, JSON.stringify(e.body));
  const a = await login({ modo: 'activar', liga: ligaDe(e), pin });
  assert.strictEqual(a.statusCode, 200, JSON.stringify(a.body));
  return a;
}

// ─── lib ─────────────────────────────────────────────────────────

test('PIN: hash con sal (dos hashes distintos del mismo PIN), verificación correcta e incorrecta', () => {
  const h1 = cred.hashPin('482917'), h2 = cred.hashPin('482917');
  assert.notStrictEqual(h1, h2);
  assert.ok(!h1.includes('482917'));
  assert.strictEqual(cred.verificarPin('482917', h1), true);
  assert.strictEqual(cred.verificarPin('482918', h1), false);
  assert.strictEqual(cred.verificarPin('482917', 'basura'), false);
});

test('PIN trivial: iguales, escaleras y repetidos se rechazan; uno normal no', () => {
  for (const p of ['000000', '111111', '123456', '654321', '890123', '121212', '123123']) assert.strictEqual(cred.pinTrivial(p), true, p);
  for (const p of ['482917', '305861']) assert.strictEqual(cred.pinTrivial(p), false, p);
});

// ─── emitir liga ─────────────────────────────────────────────────

test('emitir: sin sesión → 401; médico ajeno → 403; Revisor → 403; demo → 403 (nunca se crea liga)', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await emitir(null, PAC)).statusCode, 401);
    assert.strictEqual((await emitir(MED_AJENO, PAC)).statusCode, 403);
    assert.strictEqual((await emitir(MED_REV, PAC)).statusCode, 403);
    assert.strictEqual((await emitir(MED, DEMO)).statusCode, 403);
    assert.strictEqual(Object.keys(w.creds).length, 0);
  } finally { w.restaurar(); }
});

test('emitir: médico principal → URL con liga de 43 caracteres; en la tabla solo queda el HMAC y vence en 72 h', async () => {
  const w = mundo();
  try {
    const r = await emitir(MED, PAC);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.match(r.body.url, /^https:\/\/www\.codecells\.mx\/mi-nivel\.html\?activar=[A-Za-z0-9_-]{43}$/);
    const c = Object.values(w.creds)[0].fields;
    assert.strictEqual(c['Liga (hash)'], cred.hashLiga(ligaDe(r)));
    assert.ok(!JSON.stringify(c).includes(ligaDe(r)), 'la liga en claro no se guarda');
    const horas = (new Date(c['Liga vence']) - Date.now()) / 3600e3;
    assert.ok(horas > 71.9 && horas <= 72);
    assert.deepStrictEqual(c['Liga emitida por'], ['recMEDPROP']);
  } finally { w.restaurar(); }
});

test('emitir de nuevo invalida la liga anterior', async () => {
  const w = mundo();
  try {
    const vieja = ligaDe(await emitir(MED, PAC));
    await emitir(MED, PAC);
    const r = await login({ modo: 'activar', liga: vieja, pin: '482917' });
    assert.strictEqual(r.statusCode, 403);
  } finally { w.restaurar(); }
});

// ─── activar ─────────────────────────────────────────────────────

test('activar: consultar saluda por primer nombre; activar guarda solo el hash, emite sesión de 24 h y la liga ya no sirve', async () => {
  const w = mundo();
  try {
    const liga = ligaDe(await emitir(MED, PAC));
    const c = await login({ modo: 'consultar_activacion', liga });
    assert.strictEqual(c.statusCode, 200);
    assert.strictEqual(c.body.nombre, 'Mariana');
    assert.strictEqual(c.body.codigo, PAC);

    const a = await login({ modo: 'activar', liga, pin: '482917' });
    assert.strictEqual(a.statusCode, 200, JSON.stringify(a.body));
    const p = verificarToken(a.body.token);
    assert.strictEqual(p.tipo, 'paciente');
    assert.strictEqual(p.codigo, PAC);
    assert.strictEqual(p.exp - p.iat, 24 * 3600e3);

    const f = Object.values(w.creds)[0].fields;
    assert.strictEqual(f['Cuenta activada'], true);
    assert.ok(cred.verificarPin('482917', f['PIN (hash)']));
    assert.strictEqual(f['Liga (hash)'], '');

    assert.strictEqual((await login({ modo: 'activar', liga, pin: '305861' })).statusCode, 403, 'un solo uso');
  } finally { w.restaurar(); }
});

test('activar: liga inválida, vencida o con forma rara → mismo 403', async () => {
  const w = mundo();
  try {
    const liga = ligaDe(await emitir(MED, PAC));
    Object.values(w.creds)[0].fields['Liga vence'] = new Date(Date.now() - 1000).toISOString();
    const mensajes = new Set();
    for (const l of [liga, 'x'.repeat(43), 'corta', undefined]) {
      const r = await login({ modo: 'activar', liga: l, pin: '482917' });
      assert.strictEqual(r.statusCode, 403);
      mensajes.add(r.body.error);
    }
    assert.strictEqual(mensajes.size, 1);
  } finally { w.restaurar(); }
});

test('activar: PIN trivial o mal formado → 400 y la liga sigue sirviendo', async () => {
  const w = mundo();
  try {
    const liga = ligaDe(await emitir(MED, PAC));
    assert.strictEqual((await login({ modo: 'activar', liga, pin: '123456' })).body.motivo, 'pin_trivial');
    assert.strictEqual((await login({ modo: 'activar', liga, pin: '12345' })).body.motivo, 'pin_formato');
    assert.strictEqual((await login({ modo: 'activar', liga, pin: '482917' })).statusCode, 200);
  } finally { w.restaurar(); }
});

// ─── entrar con PIN ──────────────────────────────────────────────

test('login: el código solo ya no da sesión — "pin_requerido" tras activar, "sin_activar" antes', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await login({ tipo: 'paciente', codigo: PAC })).body.motivo, 'sin_activar');
    await activarConPin();
    const r = await login({ tipo: 'paciente', codigo: PAC });
    assert.strictEqual(r.statusCode, 401);
    assert.strictEqual(r.body.motivo, 'pin_requerido');
    assert.strictEqual(r.body.token, undefined);
  } finally { w.restaurar(); }
});

test('login: PIN correcto → sesión paciente de 24 h; incorrecto → 401 y cuenta el intento', async () => {
  const w = mundo();
  try {
    await activarConPin('482917');
    const mal = await login({ tipo: 'paciente', codigo: PAC, pin: '000001' });
    assert.strictEqual(mal.statusCode, 401);
    assert.strictEqual(mal.body.motivo, 'pin_incorrecto');
    assert.strictEqual(Object.values(w.creds)[0].fields['Intentos fallidos'], 1);
    const bien = await login({ tipo: 'paciente', codigo: PAC, pin: '482917' });
    assert.strictEqual(bien.statusCode, 200);
    assert.strictEqual(verificarToken(bien.body.token).tipo, 'paciente');
    assert.strictEqual(Object.values(w.creds)[0].fields['Intentos fallidos'], 0, 'acertar reinicia el contador');
  } finally { w.restaurar(); }
});

test('login: 5 fallos → bloqueo de 15 min (ni el PIN correcto entra); 10 → solo una liga nueva desbloquea', async () => {
  const w = mundo();
  try {
    await activarConPin('482917');
    for (let i = 0; i < 5; i++) await login({ tipo: 'paciente', codigo: PAC, pin: '000001' });
    let r = await login({ tipo: 'paciente', codigo: PAC, pin: '482917' });
    assert.strictEqual(r.statusCode, 429);
    assert.strictEqual(r.body.motivo, 'bloqueado');
    assert.ok(w.bitacora.some(b => JSON.stringify(b).includes('Bloqueo por intentos de PIN')));

    const f = Object.values(w.creds)[0].fields;
    f['Bloqueado hasta'] = null; f['Intentos fallidos'] = 9;
    await login({ tipo: 'paciente', codigo: PAC, pin: '000001' });
    r = await login({ tipo: 'paciente', codigo: PAC, pin: '482917' });
    assert.strictEqual(r.body.motivo, 'bloqueado_definitivo');

    const liga = ligaDe(await emitir(MED, PAC));
    assert.strictEqual((await login({ modo: 'activar', liga, pin: '305861' })).statusCode, 200, 'una liga nueva desbloquea');
    assert.strictEqual((await login({ tipo: 'paciente', codigo: PAC, pin: '305861' })).statusCode, 200);
  } finally { w.restaurar(); }
});

test('login: si Airtable no responde → 503 explícito, nunca "sin activar" ni "PIN incorrecto"', async () => {
  const w = mundo({ credFalla: true });
  try {
    const r = await login({ tipo: 'paciente', codigo: PAC, pin: '482917' });
    assert.strictEqual(r.statusCode, 503);
    assert.strictEqual(r.body.motivo, undefined);
  } finally { w.restaurar(); }
});

test('login: los demo siguen entrando sin PIN, como sesión "demo" de solo lectura', async () => {
  const w = mundo();
  try {
    const r = await login({ tipo: 'paciente', codigo: DEMO });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.body.tipo, 'demo');
  } finally { w.restaurar(); }
});

test('kiosco: soloSiNoActivada con la app ya activa → no genera liga nueva', async () => {
  const w = mundo();
  try {
    await activarConPin();
    const r = await emitir(MED, PAC, { soloSiNoActivada: true });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.body.yaActivada, true);
    assert.strictEqual(r.body.url, null);
    assert.strictEqual(Object.values(w.creds)[0].fields['Liga (hash)'], '', 'no se emitió liga');
  } finally { w.restaurar(); }
});
