// Cobertura del cierre de la fuga del refresh token de Google Calendar
// (2026-10-05). El token da acceso permanente al calendario del médico y
// salía por tres vías:
//   1) api/auth-login.js devolvía el registro completo de MÉDICOS (y el
//      portal lo guarda en el dispositivo);
//   2) api/airtable.js, tabla=medicos: cualquier médico con sesión leía a
//      TODOS los médicos con TODOS sus campos, y con su propio
//      filterByFormula podía además adivinar el secreto letra por letra;
//   3) api/nova.js 'airtable_lookup': sin sesión, filtro libre, respuesta
//      found:true/false (retirado).
// Y medico_crear_evento_calendario no pedía sesión. Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS'; // no producción → sin congelamiento
process.env.NODE_ENV = 'development'; // pasa el guard de origen CORS de nova.js

const test = require('node:test');
const assert = require('node:assert');

const { generarToken } = require('../lib/auth');
const { CAMPOS_SOLO_SERVIDOR, camposParaSuDueno, camposParaColega } = require('../lib/camposMedico');

const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const SECRETO = '1//0g-refresh-token-de-prueba';

const MEDICO_COMPLETO = {
  'Código de médico': 'CCMED-VIRN01',
  'Nombre completo': 'Dr. Prueba',
  'Especialidad': 'Medicina interna',
  'Ciudad': 'Culiacán',
  'Nivel CODE CELLS®': 'Partner',
  'Activo': true,
  'Correo': 'medico@ejemplo.test',
  'Teléfono': '+520000000000',
  'Token de autorregistro': 'REG-ABC',
  'Telegram Chat ID': '123',
  'Memoria NOVA (médico)': 'privado',
  'Notas': 'nota de administración',
  'Passphrase NOVA': 'frase-secreta',
  'Google Calendar Refresh Token': SECRETO,
  'Google Calendar Email': 'medico@ejemplo.test',
};

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    setHeader() {},
    end() { return this; },
  };
}

function requerirFresco(ruta) {
  delete require.cache[require.resolve(ruta)];
  return require(ruta);
}

function instalarFetch(manejador) {
  const original = global.fetch;
  const llamadas = [];
  global.fetch = async (url, opts) => {
    llamadas.push(String(url));
    return manejador(String(url), opts);
  };
  return { llamadas, restaurar: () => { global.fetch = original; } };
}

const ok = (data) => ({ ok: true, status: 200, json: async () => data });

// ── lib ───────────────────────────────────────────────────────────────

test('camposParaSuDueno quita los secretos de servidor y conserva lo que usa el portal', () => {
  const f = camposParaSuDueno(MEDICO_COMPLETO);
  for (const campo of CAMPOS_SOLO_SERVIDOR) assert.ok(!(campo in f), `${campo} no debe salir`);
  assert.strictEqual(f['Google Calendar Email'], 'medico@ejemplo.test'); // el portal muestra "conectado"
  assert.strictEqual(f['Token de autorregistro'], 'REG-ABC');
  assert.strictEqual(MEDICO_COMPLETO['Google Calendar Refresh Token'], SECRETO, 'no muta la entrada');
});

test('camposParaColega es lista blanca: nada de contacto, tokens ni notas', () => {
  const f = camposParaColega(MEDICO_COMPLETO);
  assert.deepStrictEqual(Object.keys(f).sort(), [
    'Activo', 'Ciudad', 'Código de médico', 'Especialidad', 'Nivel CODE CELLS®', 'Nombre completo',
  ]);
});

// ── 1) auth-login ─────────────────────────────────────────────────────

test('auth-login médico: la respuesta NO trae el refresh token ni la passphrase', async () => {
  const { restaurar } = instalarFetch((u) => {
    if (u.includes(`/${TBL_MEDICOS}?`)) return ok({ records: [{ id: 'recMED1', fields: { ...MEDICO_COMPLETO } }] });
    throw new Error(`fetch no mockeado: ${u}`);
  });
  try {
    const handler = requerirFresco('../api/auth-login.js');
    const res = fakeRes();
    await handler({ method: 'POST', body: { tipo: 'medico', codigo: 'CCMED-VIRN01' } }, res);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(res.body.token);
    assert.ok(!JSON.stringify(res.body).includes(SECRETO), 'el refresh token viajó al navegador');
    assert.ok(!('Passphrase NOVA' in res.body.fields));
    assert.strictEqual(res.body.fields['Nombre completo'], 'Dr. Prueba');
  } finally { restaurar(); }
});

// ── 2) proxy tabla=medicos ────────────────────────────────────────────

test('proxy: un médico leyendo MÉDICOS recibe solo campos de colega', async () => {
  const { llamadas, restaurar } = instalarFetch((u) => {
    if (u.includes(`/${TBL_MEDICOS}?`)) return ok({ records: [{ id: 'recMED2', fields: { ...MEDICO_COMPLETO } }] });
    throw new Error(`fetch no mockeado: ${u}`);
  });
  try {
    const handler = requerirFresco('../api/airtable.js');
    const token = generarToken({ tipo: 'medico', codigo: 'CCMED-JCG01', horas: 1 });
    const res = fakeRes();
    await handler({
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      query: { tabla: 'medicos', filterByFormula: '{Activo}=TRUE()', maxRecords: '50' },
    }, res);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(!JSON.stringify(res.body).includes(SECRETO));
    const f = res.body.records[0].fields;
    assert.ok(!('Correo' in f) && !('Token de autorregistro' in f) && !('Passphrase NOVA' in f));
    assert.strictEqual(f['Especialidad'], 'Medicina interna');
    assert.ok(llamadas[0].includes('maxRecords=50'), 'la paginación se respeta');
  } finally { restaurar(); }
});

test('proxy: el filtro/orden del cliente sobre MÉDICOS se ignora (no hay oráculo para adivinar el token)', async () => {
  const { llamadas, restaurar } = instalarFetch((u) => {
    if (u.includes(`/${TBL_MEDICOS}?`)) return ok({ records: [] });
    throw new Error(`fetch no mockeado: ${u}`);
  });
  try {
    const handler = requerirFresco('../api/airtable.js');
    const token = generarToken({ tipo: 'medico', codigo: 'CCMED-JCG01', horas: 1 });
    const res = fakeRes();
    await handler({
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      query: {
        tabla: 'medicos',
        filterByFormula: 'FIND("1//0g",{Google Calendar Refresh Token})=1',
        'sort[0][field]': 'Google Calendar Refresh Token',
        'fields[]': 'Google Calendar Refresh Token',
      },
    }, res);
    assert.strictEqual(llamadas.length, 1);
    const enviado = decodeURIComponent(llamadas[0]);
    assert.ok(!enviado.includes('Refresh Token'), `se reenvió el parámetro del cliente: ${enviado}`);
    assert.ok(enviado.includes('filterByFormula={Activo}=1'));
  } finally { restaurar(); }
});

test('proxy: paciente y visitante siguen sin poder leer MÉDICOS', async () => {
  const { llamadas, restaurar } = instalarFetch((u) => { throw new Error(`no debió llamar a Airtable: ${u}`); });
  try {
    const handler = requerirFresco('../api/airtable.js');
    const tokenPac = generarToken({ tipo: 'paciente', codigo: 'CC-PAC-9001', horas: 1 });
    const resPac = fakeRes();
    await handler({ method: 'GET', headers: { authorization: `Bearer ${tokenPac}` }, query: { tabla: 'medicos' } }, resPac);
    assert.strictEqual(resPac.statusCode, 403);
    const resAnon = fakeRes();
    await handler({ method: 'GET', headers: {}, query: { tabla: 'medicos' } }, resAnon);
    assert.strictEqual(resAnon.statusCode, 401);
    assert.strictEqual(llamadas.length, 0);
  } finally { restaurar(); }
});

// ── 3) nova.js ────────────────────────────────────────────────────────

test("nova: 'airtable_lookup' ya no existe (no consulta Airtable ni responde found)", async () => {
  const { llamadas, restaurar } = instalarFetch(() => { throw new Error('sin red en esta prueba'); });
  try {
    const handler = requerirFresco('../api/nova.js');
    const res = fakeRes();
    await handler({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'airtable_lookup', tabla: 'medicos', filtro: 'FIND("1//0g",{Google Calendar Refresh Token})=1' },
    }, res);
    assert.ok(!(res.body && 'found' in res.body), JSON.stringify(res.body));
    assert.ok(!llamadas.some((u) => u.includes('api.airtable.com')), `consultó Airtable: ${llamadas.join(' | ')}`);
  } finally { restaurar(); }
});

test('nova medico_crear_evento_calendario: sin sesión → 401, sin tocar Airtable', async () => {
  const { llamadas, restaurar } = instalarFetch((u) => { throw new Error(`no debió llamar: ${u}`); });
  try {
    const handler = requerirFresco('../api/nova.js');
    const res = fakeRes();
    await handler({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'medico_crear_evento_calendario', medicoCode: 'CCMED-VIRN01', fecha: '2026-10-10', hora: '10:00' },
    }, res);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(llamadas.length, 0);
  } finally { restaurar(); }
});

// Router de Airtable para las acciones medico_* con paciente: el médico del
// token (con su Tipo de acceso), un paciente propio y uno demo. Cualquier
// otra escritura (ACCESOS_EXPEDIENTE) responde ok.
const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
function routerMedico(tipoAcceso) {
  return (u, opts) => {
    if (u.includes(`/${TBL_MEDICOS}?`)) {
      return ok({ records: [{ id: 'recMED3', fields: { 'Código de médico': 'CCMED-JCG01', 'Tipo de acceso': tipoAcceso } }] });
    }
    if (u.includes(`/${TBL_PACIENTES}?`)) {
      if (u.includes(encodeURIComponent('CC-PAC-DEMO01'))) {
        return ok({ records: [{ id: 'recPACDEMO', fields: { 'Código de paciente': 'CC-PAC-DEMO01', 'Es demo': true } }] });
      }
      return ok({ records: [{ id: 'recPAC9001', fields: { 'Código de paciente': 'CC-PAC-9001', 'Médico_principal': ['recMED3'] } }] });
    }
    if (opts && opts.method === 'POST') return ok({ id: 'recLOG', records: [{ id: 'recLOG' }] });
    throw new Error(`fetch no mockeado: ${u}`);
  };
}

async function llamarNova(body, token) {
  const handler = requerirFresco('../api/nova.js');
  const res = fakeRes();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  }, res);
  return res;
}

const tokenJCG = () => generarToken({ tipo: 'medico', codigo: 'CCMED-JCG01', horas: 1 });

test('nova medico_crear_evento_calendario: usa el calendario del médico del TOKEN, no el medicoCode del cliente', async () => {
  const { llamadas, restaurar } = instalarFetch(routerMedico('Clinico'));
  try {
    const res = await llamarNova({ action: 'medico_crear_evento_calendario', medicoCode: 'CCMED-VIRN01', pacienteCode: 'CC-PAC-9001', fecha: '2026-10-10', hora: '10:00' }, tokenJCG());
    assert.strictEqual(res.body.motivo, 'sin_conectar', JSON.stringify(res.body));
    const consultasMedicos = llamadas.filter((u) => u.includes(`/${TBL_MEDICOS}?`)).map(decodeURIComponent);
    assert.ok(consultasMedicos.length > 0);
    assert.ok(consultasMedicos.every((u) => !u.includes('CCMED-VIRN01')), 'usó el código que mandó el cliente');
  } finally { restaurar(); }
});

test('nova medico_crear_evento_calendario: paciente demo → no se crea evento (CLAUDE.md §5)', async () => {
  const { restaurar } = instalarFetch(routerMedico('Clinico'));
  try {
    const res = await llamarNova({ action: 'medico_crear_evento_calendario', pacienteCode: 'CC-PAC-DEMO01', fecha: '2026-10-10' }, tokenJCG());
    assert.strictEqual(res.body.ok, false);
    assert.notStrictEqual(res.body.motivo, 'sin_conectar', 'llegó hasta buscar el calendario con un demo');
    assert.strictEqual(res.statusCode, 403);
  } finally { restaurar(); }
});

for (const accion of ['medico_tabla_labs', 'medico_resumen_labs', 'medico_guardar_labs_rapidos', 'medico_subir_estudio', 'medico_extraer_labs_texto', 'medico_confirmar_labs_texto', 'medico_crear_evento_calendario']) {
  test(`nova ${accion}: un médico Revisor recibe 403 (Tipo de acceso)`, async () => {
    const { llamadas, restaurar } = instalarFetch(routerMedico('Revisor'));
    try {
      const res = await llamarNova({
        action: accion, pacienteCode: 'CC-PAC-9001', fecha: '2026-10-10', texto: 'Glucosa 90',
        fechaEstudio: '2026-10-01', filas: [{ nombreCrudo: 'Glucosa', codigoFinal: 'GLU' }], valores: [{ codigo: 'GLU', valor: 90 }],
      }, tokenJCG());
      assert.strictEqual(res.statusCode, 403, JSON.stringify(res.body));
      assert.match(res.body.error, /tipo de acceso/i);
      assert.ok(!llamadas.some((u) => u.includes(`/${TBL_PACIENTES}?`)), 'llegó a leer al paciente');
    } finally { restaurar(); }
  });
}

test('nova medico_tabla_labs: un médico Clinico sí pasa la puerta y llega a autorizar al paciente', async () => {
  const { llamadas, restaurar } = instalarFetch((u, opts) => {
    if (u.includes('tbl6y1ZfsmPPhrlFk')) return ok({ records: [] }); // LAB_VALORES vacío
    if (u.includes('tblA51aUeYypWQMQV')) return ok({ records: [] }); // CATALOGO_PARAMETROS
    return routerMedico('Clinico')(u, opts);
  });
  try {
    const res = await llamarNova({ action: 'medico_tabla_labs', pacienteCode: 'CC-PAC-9001' }, tokenJCG());
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(llamadas.some((u) => u.includes(`/${TBL_PACIENTES}?`)));
  } finally { restaurar(); }
});
