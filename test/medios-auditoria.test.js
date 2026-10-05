// Cobertura de los MEDIOS de la auditoría de lecturas sin r.ok (2026-08-24)
// y de lo encontrado al corregirlos (2026-10-05):
//   - Google OAuth: el state era el código CCMED- en texto plano → cualquiera
//     enlazaba SU calendario al registro de otro médico. Ahora state firmado.
//   - M9/M10 calendario: un fallo se veía como "no conectado" / "no
//     encontramos tu registro"; "Conectado" sin haber guardado.
//   - M2 VIP: un fallo de Airtable se veía como "invitación no disponible".
//   - M3/M4 capacitación: progreso en cero / registro duplicado.
//   - M11 log de conversaciones de NOVA: un fallo partía el día en dos.
//   - Directorio: contactos/ciudades vacíos ante un fallo (y sin paginar).
//   - api/buscar-medicos: público, con nivel interno y teléfonos → cerrado.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken, verificarToken, generarTokenVisitante } = require('../lib/auth');

const MEDICOS = 'tbl87DsuBMmb4DjFM';
const PACIENTES = 'tblyUcCfueFLJuvIv';
const CAPACITACION = 'tbldxB4GK1vpnj7JR';
const CONVERSACIONES = 'tblYMr2lpmLQhw6GS';
const DIRECTORIO = 'tblkUNPwu1sQgZBPJ';

const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const falla = (status = 429) => ({ ok: false, status, json: async () => ({ error: 'X' }), text: async () => 'x' });

function fakeRes() {
  return { statusCode: null, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, end() { return this; } };
}
function fresco(ruta) { delete require.cache[require.resolve(ruta)]; return require(ruta); }

function instalar(manejar) {
  const original = global.fetch;
  const cap = { llamadas: [], escrituras: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    cap.llamadas.push(`${metodo} ${u}`);
    if (metodo !== 'GET' && opts.body && typeof opts.body === 'string') {
      try { cap.escrituras.push({ u, metodo, body: JSON.parse(opts.body) }); } catch { cap.escrituras.push({ u, metodo }); }
    }
    const r = manejar(u, metodo, opts);
    if (r) return r;
    throw new Error(`fetch no mockeado: ${metodo} ${u}`);
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

// ── Google OAuth ──────────────────────────────────────────────────────

async function callback(state, manejar) {
  const { cap, restaurar } = instalar((u, m) => {
    if (u.includes('oauth2.googleapis.com/token')) return ok({ access_token: 'at', refresh_token: 'rt' });
    if (u.includes('googleapis.com/oauth2/v2/userinfo')) return ok({ email: 'medico@ejemplo.test' });
    return manejar(u, m);
  });
  try {
    const handler = fresco('../api/google-oauth-callback.js');
    const res = fakeRes();
    await handler({ method: 'GET', query: { code: 'c', state } }, res);
    return { res, cap };
  } finally { restaurar(); }
}
const medicoOk = (u, m) => (u.includes(`/${MEDICOS}`) ? ok(m === 'GET' ? { records: [{ id: 'recMED', fields: {} }] } : { id: 'recMED' }) : null);
const stateFirmado = () => generarToken({ tipo: 'google_oauth', codigo: 'CCMED-VIRN01', horas: 0.25 });

test('OAuth: un state en texto plano (CCMED-VIRN01) se rechaza sin canjear ni guardar nada', async () => {
  const { res, cap } = await callback('CCMED-VIRN01', medicoOk);
  assert.match(res.body, /no es válido o ya venció/);
  assert.strictEqual(cap.llamadas.length, 0);
});

test('OAuth: un token de SESIÓN de médico no sirve como state', async () => {
  const { res, cap } = await callback(generarToken({ tipo: 'medico', codigo: 'CCMED-VIRN01', horas: 1 }), medicoOk);
  assert.match(res.body, /no es válido/);
  assert.strictEqual(cap.escrituras.length, 0);
});

test('OAuth: con state firmado se guarda en el médico del state y dice "Conectado"', async () => {
  const { res, cap } = await callback(stateFirmado(), medicoOk);
  assert.match(res.body, /Conectado/);
  assert.ok(cap.llamadas.some((l) => l.includes(encodeURIComponent('"CCMED-VIRN01"'))));
  assert.strictEqual(cap.escrituras.find((e) => e.u.includes(MEDICOS)).body.fields['Google Calendar Refresh Token'], 'rt');
});

test('OAuth (M10): un 429 al buscar al médico NO dice "no encontramos tu registro"', async () => {
  const { res } = await callback(stateFirmado(), (u) => (u.includes(`/${MEDICOS}`) ? falla() : null));
  assert.ok(!/No encontramos tu registro/.test(res.body));
  assert.match(res.body, /problema temporal/);
});

test('OAuth: si el guardado falla, NO dice "Conectado"', async () => {
  const { res } = await callback(stateFirmado(), (u, m) => (u.includes(`/${MEDICOS}`) ? (m === 'GET' ? ok({ records: [{ id: 'recMED', fields: {} }] }) : falla(422)) : null));
  assert.ok(!/✅ Conectado/.test(res.body));
  assert.match(res.body, /no pudimos guardarla/);
});

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

test('OAuth: medico_google_oauth_state exige sesión médica y firma el código de la sesión', async () => {
  const sin = await nova({ action: 'medico_google_oauth_state' });
  assert.strictEqual(sin.statusCode, 401);
  const pac = await nova({ action: 'medico_google_oauth_state' }, { tipo: 'paciente', codigo: 'CC-PAC-9001' });
  assert.strictEqual(pac.statusCode, 401);
  const med = await nova({ action: 'medico_google_oauth_state' }, { tipo: 'medico', codigo: 'CCMED-TEST01' });
  const p = verificarToken(med.body.state);
  assert.strictEqual(p.tipo, 'google_oauth');
  assert.strictEqual(p.codigo, 'CCMED-TEST01');
  assert.ok(p.exp - p.iat <= 15 * 60 * 1000);
});

// ── M9 calendario ─────────────────────────────────────────────────────

test('M9 calendario: un 429 al leer la configuración NO es "sin_conectar"', async () => {
  const { restaurar } = instalar((u, m) => {
    if (u.includes(`/${MEDICOS}?`)) {
      // verificarAccesoClinicoMedico pide fields[]; la lectura del token no.
      if (u.includes('fields')) return ok({ records: [{ id: 'recMED', fields: { 'Código de médico': 'CCMED-TEST01', 'Tipo de acceso': 'Clinico' } }] });
      if (u.includes('maxRecords=1')) return ok({ records: [{ id: 'recMED', fields: { 'Código de médico': 'CCMED-TEST01' } }] });
      return falla();
    }
    if (u.includes(`/${PACIENTES}`)) return ok({ records: [{ id: 'recPAC', fields: { 'Código de paciente': 'CC-PAC-9001', 'Médico_principal': ['recMED'] } }] });
    if (m !== 'GET') return ok({ id: 'x' });
    return null;
  });
  try {
    const res = await nova({ action: 'medico_crear_evento_calendario', pacienteCode: 'CC-PAC-9001', fecha: '2026-10-10' }, { tipo: 'medico', codigo: 'CCMED-TEST01' });
    assert.notStrictEqual(res.body.motivo, 'sin_conectar', JSON.stringify(res.body));
    assert.strictEqual(res.statusCode, 502);
  } finally { restaurar(); }
});

// ── M2 VIP ────────────────────────────────────────────────────────────

test('M2 VIP: un 429 al verificar la invitación NO es "Invitación no disponible"', async () => {
  const { restaurar } = instalar((u) => (u.includes('/temp?') ? falla() : null));
  try {
    const handler = fresco('../api/vip-activar.js');
    const res = fakeRes();
    await handler({ method: 'POST', headers: {}, body: { inviteCode: 'INV-12345678', nombre: 'Ana', whatsapp: '+526671234567' } }, res);
    assert.strictEqual(res.statusCode, 503, JSON.stringify(res.body));
    assert.ok(!/no disponible/.test(res.body.error));
  } finally { restaurar(); }
});

// ── M3/M4 capacitación ────────────────────────────────────────────────

async function capacitacion(req) {
  const handler = fresco('../api/capacitacion-progreso.js');
  const res = fakeRes();
  await handler({ headers: { authorization: `Bearer ${generarToken({ tipo: 'medico', codigo: 'CCMED-TEST01', horas: 1 })}` }, ...req }, res);
  return res;
}

test('M3 capacitación: un 429 NO se muestra como progreso en cero', async () => {
  const { restaurar } = instalar((u) => (u.includes(CAPACITACION) ? falla() : null));
  try {
    const res = await capacitacion({ method: 'GET' });
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.progreso, undefined);
  } finally { restaurar(); }
});

test('M4 capacitación: si no puede verificar el registro previo, NO crea un duplicado', async () => {
  const { cap, restaurar } = instalar((u, m) => (u.includes(CAPACITACION) ? (m === 'GET' ? falla() : ok({ id: 'recNUEVO' })) : null));
  try {
    const res = await capacitacion({ method: 'POST', body: { modulo: 'Farmacia', puntaje: 0.9 } });
    assert.ok(res.statusCode >= 500, JSON.stringify(res.body));
    assert.ok(!cap.escrituras.some((e) => e.metodo === 'POST' && e.u.includes(CAPACITACION)), 'creó un registro duplicado');
  } finally { restaurar(); }
});

// ── M11 log de conversaciones ─────────────────────────────────────────

test('M11 log de NOVA: si falla la búsqueda del día, NO crea un registro nuevo (no parte la conversación)', async () => {
  const { cap, restaurar } = instalar((u, m) => {
    if (u.startsWith('https://api.anthropic.com/')) return ok({ content: [{ type: 'tool_use', name: 'respuesta_nova_paciente', input: { reply: 'Hola.' } }] });
    if (u.includes(CONVERSACIONES)) return m === 'GET' ? falla() : ok({ id: 'recCONV' });
    if (u.includes(`/${PACIENTES}`)) return ok(m === 'GET' ? { records: [{ id: 'recPAC', fields: { 'Código de paciente': 'CC-PAC-9001', 'Nombre completo': 'Ana' } }] } : { id: 'recPAC' });
    if (u.includes('USO_NOVA')) return ok(m === 'GET' ? { records: [] } : { id: 'recUSO' });
    return null;
  });
  try {
    const res = await nova({ messages: [{ role: 'user', content: 'Hola' }] }, { tipo: 'paciente', codigo: 'CC-PAC-9001' });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(!cap.escrituras.some((e) => e.metodo === 'POST' && e.u.includes(CONVERSACIONES)), 'creó un registro de conversación duplicado');
  } finally { restaurar(); }
});

// ── Directorio público ────────────────────────────────────────────────

async function directorio(query, headers = {}) {
  const handler = fresco('../api/airtable.js');
  const res = fakeRes();
  await handler({ method: 'GET', headers, query: { tabla: 'directorio_medico', ...query } }, res);
  return res;
}

test('directorio: contactos con 429 → 502 (no "sin teléfonos")', async () => {
  const { restaurar } = instalar((u) => (u.includes(DIRECTORIO) ? falla() : null));
  try {
    const res = await directorio({ accion: 'contactos' }, { authorization: `Bearer ${generarTokenVisitante()}` });
    assert.strictEqual(res.statusCode, 502);
  } finally { restaurar(); }
});

test('directorio: contactos y ciudades leen TODAS las páginas', async () => {
  const { restaurar } = instalar((u) => {
    if (!u.includes(DIRECTORIO)) return null;
    const pag2 = u.includes('offset=p2');
    return ok({ records: [{ id: pag2 ? 'rec2' : 'rec1', fields: { 'Teléfono de consultorio': pag2 ? '222' : '111', 'Ciudad de consulta': pag2 ? 'Mazatlán' : 'Culiacán' } }], ...(pag2 ? {} : { offset: 'p2' }) });
  });
  try {
    const c = await directorio({ accion: 'contactos' }, { authorization: `Bearer ${generarTokenVisitante()}` });
    assert.deepStrictEqual(c.body.contactos, { rec1: '111', rec2: '222' });
    const ci = await directorio({ accion: 'ciudades' });
    assert.deepStrictEqual(ci.body.ciudades, ['Culiacán', 'Mazatlán']);
  } finally { restaurar(); }
});

test('directorio: ciudades con 429 → 502 (no lista vacía)', async () => {
  const { restaurar } = instalar((u) => (u.includes(DIRECTORIO) ? falla() : null));
  try {
    const res = await directorio({ accion: 'ciudades' });
    assert.strictEqual(res.statusCode, 502);
  } finally { restaurar(); }
});

// ── api/buscar-medicos ────────────────────────────────────────────────

test('buscar-medicos: cerrado (410), sin leer médicos ni llamar al modelo', async () => {
  const { cap, restaurar } = instalar(() => null);
  try {
    const handler = fresco('../api/buscar-medicos.js');
    const res = fakeRes();
    await handler({ method: 'POST', headers: {}, body: { accion: 'listar' } }, res);
    assert.strictEqual(res.statusCode, 410);
    assert.strictEqual(cap.llamadas.length, 0);
  } finally { restaurar(); }
});
