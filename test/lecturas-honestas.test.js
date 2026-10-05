// Cobertura de los 5 CRÍTICOS de la auditoría de lecturas sin r.ok
// (2026-08-24) y de lo encontrado al corregirlos (2026-10-05):
//   C1/C2  chat de NOVA (paciente/médico): un 429 se mostraba como "no
//          disponible"/"médico no reconocido" → ahora 502.
//   C3/C4  labs del portal: un 429 se mostraba como "sin estudios" y dejaba
//          "Paciente no encontrado" en la bitácora → ahora 502; y se pagina
//          (más de 100 valores ya no se cortan).
//   C5     lib/codigos.js: un fallo de lectura daba el código por único sin
//          verificarlo → ahora lanza; el listado secuencial pagina.
//   +      chat médico: herramientas solo con Tipo de acceso=Clinico; la
//          herramienta de series de labs autoriza al paciente; el alta por
//          dictado no crea pacientes huérfanos ni oculta una HISTORIA fallida.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS'; // no producción → sin congelamiento
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const TBL_LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';
const TBL_LABS = 'tblhKp4uE1NdXXqLh';
const TBL_HIST = 'tblm2xUADazitHisR';
const TBL_ACCESOS = 'tblSpORAqLKxYOI6W';
const COD_MED = 'CCMED-TEST01'; // médico ordinario: los fundadores entran al perfil 'ceo' sin herramientas
const REC_MED = 'recMED0000000001';
const COD_PAC = 'CC-PAC-9001';
const COD_AJENO = 'CC-PAC-9002';

const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const falla = (status = 429) => ({ ok: false, status, json: async () => ({ errors: [{ error: 'RATE_LIMIT' }] }), text: async () => 'rate limit' });

function fakeRes() {
  return {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader() {}, end() { return this; },
  };
}

function requerirFresco(ruta) {
  delete require.cache[require.resolve(ruta)];
  return require(ruta);
}

// Router de fetch. `fallar(u, metodo)` decide qué llamada responde 429;
// `anthropic(body)` lo que "contesta" el modelo. Todo lo demás de Airtable
// responde con un mundo mínimo: el médico (Tipo de acceso configurable), un
// paciente propio y uno ajeno.
function instalar({ fallar = () => false, anthropic, tipoAcceso = 'Clinico', historiaFalla = false } = {}) {
  const original = global.fetch;
  const cap = { llamadas: [], posts: [], anthropicBodies: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    cap.llamadas.push(`${metodo} ${u}`);
    if (metodo !== 'GET') cap.posts.push({ u, metodo, body: opts.body ? JSON.parse(opts.body) : null });
    if (fallar(u, metodo)) return falla();

    if (u.startsWith('https://api.anthropic.com/')) {
      const body = JSON.parse(opts.body);
      cap.anthropicBodies.push(body);
      return ok(anthropic ? anthropic(body) : { content: [{ type: 'text', text: 'Respuesta de prueba.' }] });
    }
    if (u.includes('codecells.mx/api/telegram-bot')) return ok({ ok: true });
    if (u.includes(`/${TBL_MEDICOS}`)) {
      if (metodo !== 'GET') return ok({ id: REC_MED });
      return ok({ records: [{ id: REC_MED, fields: { 'Código de médico': COD_MED, 'Nombre completo': 'Dr. Prueba', 'Tipo de acceso': tipoAcceso } }] });
    }
    if (u.includes(`/${TBL_PACIENTES}`)) {
      if (metodo === 'POST') return ok({ records: [{ id: 'recNUEVO00000001' }] });
      if (u.includes(encodeURIComponent(COD_PAC))) {
        return ok({ records: [{ id: 'recPAC9001', fields: { 'Código de paciente': COD_PAC, 'Nombre completo': 'Paciente Prueba', 'Médico_principal': [REC_MED] } }] });
      }
      if (u.includes(encodeURIComponent(COD_AJENO))) {
        return ok({ records: [{ id: 'recPAC9002', fields: { 'Código de paciente': COD_AJENO, 'Médico_principal': ['recOTROMEDICO0001'] } }] });
      }
      return ok({ records: [] });
    }
    if (u.includes(`/${TBL_HIST}`) && metodo === 'POST' && historiaFalla) return falla(422);
    if (metodo !== 'GET') return ok({ id: 'recX', records: [{ id: 'recX' }] });
    return ok({ records: [] });
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

async function nova(body, sesion) {
  const handler = requerirFresco('../api/nova.js');
  const res = fakeRes();
  const token = sesion ? generarToken({ horas: 1, ...sesion }) : null;
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  }, res);
  return res;
}

const MEDICO = { tipo: 'medico', codigo: COD_MED };
const accesosNoEncontrado = (cap) => cap.posts.filter((p) => p.u.includes(TBL_ACCESOS) && JSON.stringify(p.body).includes('Paciente no encontrado'));

// ── C5: lib/codigos.js ────────────────────────────────────────────────

test('C5 generarCodigoUnico: si falla la verificación anti-colisión, NO devuelve un código', async () => {
  const { restaurar } = instalar({ fallar: (u) => u.includes('filterByFormula') });
  try {
    const { generarCodigoUnico } = requerirFresco('../lib/codigos');
    await assert.rejects(
      generarCodigoUnico({ AIRTABLE_TOKEN: 't', BASE_ID: 'appX', TABLE_ID: TBL_PACIENTES, CAMPO: 'Código de paciente', PREFIJO: 'CC-PAC-', esSecuencial: false }),
      /no se puede verificar/
    );
  } finally { restaurar(); }
});

test('C5 generarCodigoUnico: si falla el listado secuencial, NO empieza desde 000001', async () => {
  const { restaurar } = instalar({ fallar: (u) => u.includes('fields[]=') });
  try {
    const { generarCodigoUnico } = requerirFresco('../lib/codigos');
    await assert.rejects(
      generarCodigoUnico({ AIRTABLE_TOKEN: 't', BASE_ID: 'appX', TABLE_ID: TBL_PACIENTES, CAMPO: 'Código de paciente', PREFIJO: 'CC-PAC-', esSecuencial: true }),
      /no se puede verificar/
    );
  } finally { restaurar(); }
});

test('C5 generarCodigoUnico: el máximo se calcula sobre TODAS las páginas', async () => {
  const original = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('fields[]=') && !u.includes('offset=')) return ok({ records: [{ fields: { 'Código de paciente': 'CC-PAC-000005' } }], offset: 'pag2' });
    if (u.includes('fields[]=') && u.includes('offset=pag2')) return ok({ records: [{ fields: { 'Código de paciente': 'CC-PAC-000250' } }] });
    if (u.includes('filterByFormula')) return ok({ records: [] });
    throw new Error(`no mockeado: ${u}`);
  };
  try {
    const { generarCodigoUnico } = requerirFresco('../lib/codigos');
    const cod = await generarCodigoUnico({ AIRTABLE_TOKEN: 't', BASE_ID: 'appX', TABLE_ID: TBL_PACIENTES, CAMPO: 'Código de paciente', PREFIJO: 'CC-PAC-', esSecuencial: true });
    assert.strictEqual(cod, 'CC-PAC-000251');
  } finally { global.fetch = original; }
});

test('C5 generarCodigoPorIniciales: si falla la verificación, NO devuelve un código', async () => {
  const { restaurar } = instalar({ fallar: () => true });
  try {
    const { generarCodigoPorIniciales } = requerirFresco('../lib/codigos');
    await assert.rejects(
      generarCodigoPorIniciales({ AIRTABLE_TOKEN: 't', BASE_ID: 'appX', TABLE_ID: TBL_MEDICOS, CAMPO: 'Código de médico', PREFIJO: 'CCMED-', nombreCompleto: 'Carlos Gabriel Terrazas' }),
      /no se puede verificar/
    );
  } finally { restaurar(); }
});

// ── C3/C4: labs del portal ────────────────────────────────────────────

test('C3 medico_tabla_labs: LAB_VALORES con 429 → 502 (no "sin estudios") y sin "Paciente no encontrado" en la bitácora', async () => {
  const { cap, restaurar } = instalar({ fallar: (u, m) => m === 'GET' && u.includes(`/${TBL_LAB_VALORES}`) });
  try {
    const res = await nova({ action: 'medico_tabla_labs', pacienteCode: COD_PAC }, MEDICO);
    assert.strictEqual(res.statusCode, 502, JSON.stringify(res.body));
    assert.strictEqual(res.body.ok, false);
    assert.match(res.body.error, /NO significa que no tenga estudios/);
    assert.strictEqual(accesosNoEncontrado(cap).length, 0);
  } finally { restaurar(); }
});

test('C3 medico_tabla_labs: pagina LAB_VALORES (más de 100 valores no se cortan)', async () => {
  const original = global.fetch;
  let paginas = 0;
  const { restaurar } = instalar();
  const router = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes(`/${TBL_LAB_VALORES}`) && (!opts || !opts.method || opts.method === 'GET')) {
      paginas++;
      const fila = (fecha) => ({ id: `rec${fecha}`, fields: { 'Analito': 'Glucosa', 'Valor': '90', 'Fecha del estudio': fecha } });
      return u.includes('offset=p2') ? ok({ records: [fila('2026-02-01')] }) : ok({ records: [fila('2026-01-01')], offset: 'p2' });
    }
    return router(url, opts);
  };
  try {
    const res = await nova({ action: 'medico_tabla_labs', pacienteCode: COD_PAC }, MEDICO);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(paginas, 2);
    assert.deepStrictEqual(res.body.fechas, ['2026-01-01', '2026-02-01']);
  } finally { global.fetch = original; restaurar(); }
});

test('C4 medico_resumen_labs: una lectura con 429 → 502, no "sin historial"', async () => {
  const { restaurar } = instalar({ fallar: (u, m) => m === 'GET' && u.includes(`/${TBL_LABS}?`) });
  try {
    const res = await nova({ action: 'medico_resumen_labs', pacienteCode: COD_PAC }, MEDICO);
    assert.strictEqual(res.statusCode, 502, JSON.stringify(res.body));
    assert.strictEqual(res.body.ok, false);
  } finally { restaurar(); }
});

// ── C1/C2: chat de NOVA ───────────────────────────────────────────────

test('C2 chat médico: MÉDICOS con 429 → 502, no 401 "Médico no reconocido"', async () => {
  const { restaurar } = instalar({ fallar: (u) => u.includes(`/${TBL_MEDICOS}?`) });
  try {
    const res = await nova({ messages: [{ role: 'user', content: 'Hola' }] }, MEDICO);
    assert.strictEqual(res.statusCode, 502, JSON.stringify(res.body));
  } finally { restaurar(); }
});

test('C1 chat paciente: PACIENTES con 429 → 502, no 403 "no disponible"', async () => {
  const { restaurar } = instalar({ fallar: (u) => u.includes(`/${TBL_PACIENTES}?`) });
  try {
    const res = await nova({ messages: [{ role: 'user', content: 'Hola' }] }, { tipo: 'paciente', codigo: COD_PAC });
    assert.strictEqual(res.statusCode, 502, JSON.stringify(res.body));
  } finally { restaurar(); }
});

// ── Chat médico: Tipo de acceso y herramientas ────────────────────────

test('chat médico Revisor: NOVA responde pero SIN herramientas clínicas', async () => {
  const { cap, restaurar } = instalar({ tipoAcceso: 'Revisor' });
  try {
    const res = await nova({ messages: [{ role: 'user', content: 'Hola' }] }, MEDICO);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(cap.anthropicBodies.length > 0);
    assert.ok(cap.anthropicBodies.every((b) => !b.tools || b.tools.length === 0), JSON.stringify(cap.anthropicBodies[0].tools));
  } finally { restaurar(); }
});

test('chat médico Clinico: sí recibe las herramientas', async () => {
  const { cap, restaurar } = instalar({ tipoAcceso: 'Clinico' });
  try {
    await nova({ messages: [{ role: 'user', content: 'Hola' }] }, MEDICO);
    const nombres = (cap.anthropicBodies[0].tools || []).map((t) => t.name);
    assert.ok(nombres.includes('guardar_series_historicas_laboratorio'), nombres.join(','));
  } finally { restaurar(); }
});

const respuestaSeries = () => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', name: 'guardar_series_historicas_laboratorio', input: { mensaje: 'Guardo tus series.', series: [{ fecha: '2026-01-15', analitos: [{ nombre: 'Glucosa', valor: '90', unidad: 'mg/dL', bandera: 'normal' }] }] } }],
});

test('chat médico: series de labs en un paciente AJENO → no se escribe nada', async () => {
  const { cap, restaurar } = instalar({ anthropic: respuestaSeries });
  try {
    const res = await nova({ pacienteCode: COD_AJENO, messages: [{ role: 'user', content: 'Glucosa 90 el 15/01/2026' }] }, MEDICO);
    const texto = JSON.stringify(res.body);
    assert.match(texto, /No tienes acceso de escritura/);
    assert.ok(!cap.posts.some((p) => p.u.includes(`/${TBL_LABS}`) || p.u.includes(`/${TBL_LAB_VALORES}`)), 'escribió labs en un paciente ajeno');
  } finally { restaurar(); }
});

test('chat médico: series de labs en un paciente PROPIO → sí se escribe', async () => {
  const { cap, restaurar } = instalar({ anthropic: respuestaSeries });
  try {
    await nova({ pacienteCode: COD_PAC, messages: [{ role: 'user', content: 'Glucosa 90 el 15/01/2026' }] }, MEDICO);
    const post = cap.posts.find((p) => p.u.includes(`/${TBL_LABS}`));
    assert.ok(post, 'no escribió NOVA LABS');
    assert.deepStrictEqual(post.body.fields['Paciente'], ['recPAC9001']);
  } finally { restaurar(); }
});

const respuestaAlta = () => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', name: 'crear_paciente_dictado', input: { mensaje: 'Doy de alta.', nombre_completo: 'Paciente Nuevo', motivo_consulta: 'Cansancio', antecedentes_heredofamiliares: 'Madre con DM2' } }],
});

test('chat médico alta: si no se puede resolver al médico, NO se crea un paciente huérfano', async () => {
  // La lectura del alta es la única a MÉDICOS con maxRecords=1 y sin fields[].
  const { cap, restaurar } = instalar({
    anthropic: respuestaAlta,
    fallar: (u, m) => m === 'GET' && u.includes(`/${TBL_MEDICOS}?`) && u.includes('maxRecords=1') && !u.includes('fields'),
  });
  try {
    const nombreHerr = (cap.anthropicBodies[0] || {}).tools;
    const res = await nova({ messages: [{ role: 'user', content: 'Alta de Paciente Nuevo' }] }, MEDICO);
    assert.strictEqual(res.statusCode, 502, JSON.stringify(res.body) + JSON.stringify(nombreHerr));
    assert.ok(!cap.posts.some((p) => p.metodo === 'POST' && p.u.includes(`/${TBL_PACIENTES}`)), 'creó el paciente sin médico');
  } finally { restaurar(); }
});

test('chat médico alta: si HISTORIA no se guarda, NOVA lo dice (no solo "✅ registrado")', async () => {
  const { cap, restaurar } = instalar({ anthropic: respuestaAlta, historiaFalla: true });
  try {
    const res = await nova({ messages: [{ role: 'user', content: 'Alta de Paciente Nuevo' }] }, MEDICO);
    const pac = cap.posts.find((p) => p.metodo === 'POST' && p.u.includes(`/${TBL_PACIENTES}`));
    assert.ok(pac, 'no creó al paciente');
    assert.deepStrictEqual(pac.body.records[0].fields['Médico_principal'], [REC_MED]);
    assert.match(JSON.stringify(res.body), /NO se guardaron en la historia/);
  } finally { restaurar(); }
});
