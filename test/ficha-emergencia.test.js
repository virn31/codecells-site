// Ficha de emergencia (nova paciente_ficha_emergencia) y especialidad legible
// en la app del paciente. Solo lo que anotó el médico: lo vacío queda null,
// nunca "sin alergias" (CLAUDE.md §7). Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const { especialidadLegible, fichaEmergencia } = require('../lib/citasPaciente');

const PAC = 'CC-PAC-200001';

test('especialidad: conocida sin acentos/mayúsculas → bien escrita', () => {
  assert.strictEqual(especialidadLegible('CIRUGIA PLASTICA'), 'Cirugía Plástica');
  assert.strictEqual(especialidadLegible('cardiologia'), 'Cardiología');
  assert.strictEqual(especialidadLegible('GINECOLOGIA Y OBSTETRICIA'), 'Ginecología y Obstetricia');
  assert.strictEqual(especialidadLegible('  Medicina   Interna '), 'Medicina Interna');
});

test('especialidad: desconocida en MAYÚSCULAS → sin gritar y sin inventar acentos', () => {
  assert.strictEqual(especialidadLegible('MEDICINA DE LONGEVIDAD'), 'Medicina de Longevidad');
  assert.strictEqual(especialidadLegible('ESTETICA INTEGRAL'), 'Estetica Integral');
});

test('especialidad: escrita a mano por el médico se respeta; lista y vacío', () => {
  assert.strictEqual(especialidadLegible('Medicina antienvejecimiento'), 'Medicina antienvejecimiento');
  assert.strictEqual(especialidadLegible(['CARDIOLOGIA', 'Nefrología']), 'Cardiología, Nefrología');
  assert.strictEqual(especialidadLegible('CARDIOLOGIA, cardiología'), 'Cardiología');
  assert.strictEqual(especialidadLegible(''), null);
  assert.strictEqual(especialidadLegible(null), null);
  assert.strictEqual(especialidadLegible(undefined), null);
});

test('ficha: lo anotado se devuelve; lo vacío es null, nunca un negativo', () => {
  const llena = fichaEmergencia(
    { 'Grupo sanguíneo': ' O+ ', 'Patologías activas': ['Diabetes tipo 2', '', 'Hipertensión'] },
    [{ fields: { Alergias: 'Penicilina' } }, { fields: { Alergias: 'Penicilina' } }, { fields: { Alergias: '  ' } }, { fields: {} }]);
  assert.deepStrictEqual(llena, { grupoSanguineo: 'O+', alergias: ['Penicilina'], padecimientos: ['Diabetes tipo 2', 'Hipertensión'], contacto: null });

  const vacia = fichaEmergencia({}, []);
  assert.deepStrictEqual(vacia, { grupoSanguineo: null, alergias: null, padecimientos: [], contacto: null });
  assert.ok(!JSON.stringify(vacia).match(/niega|ningun|sin alerg/i));
});

function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

function mundo({ falla = null, sinPaciente = false } = {}) {
  const pedidos = [];
  const original = global.fetch;
  global.fetch = async (url) => {
    const u = decodeURIComponent(String(url)); pedidos.push(u);
    const ok = d => ({ ok: true, status: 200, json: async () => d });
    if (falla && u.includes(falla)) return { ok: false, status: 503, json: async () => ({}) };
    if (u.includes('tblyUcCfueFLJuvIv?')) return ok({ records: sinPaciente ? [] : [{ id: 'recPAC', fields: { 'Grupo sanguíneo': 'A-', 'Patologías activas': ['Embarazo'], 'Contacto de emergencia': 'Luis Pérez, mi esposo', 'Tel. emergencia': '6671234567' } }] });
    if (u.includes('tblm2xUADazitHisR?')) return ok({ records: [{ id: 'recH', fields: { Alergias: 'Sulfas' } }] });
    throw new Error('fetch no mockeado: ' + u);
  };
  return { pedidos, restaurar: () => { global.fetch = original; } };
}

async function nova(token) {
  const res = fakeRes();
  delete require.cache[require.resolve('../api/nova.js')];
  await require('../api/nova.js')({ method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: { action: 'paciente_ficha_emergencia' } }, res);
  return res;
}

test('ficha: paciente con sesión → solo sus datos, solo los campos de la lista blanca', async () => {
  const w = mundo();
  try {
    const r = await nova(generarToken({ tipo: 'paciente', codigo: PAC, horas: 1 }));
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { ok: true, grupoSanguineo: 'A-', alergias: ['Sulfas'], padecimientos: ['Embarazo'], contacto: { nombre: 'Luis Pérez, mi esposo', telefono: '6671234567' } });
    // Filtrado por el código de la SESIÓN y pidiendo solo esos campos.
    assert.ok(w.pedidos.every(u => u.includes(`"${PAC}"`)), 'cada lectura filtra por el paciente de la sesión');
    const camposPedidos = w.pedidos.flatMap(u => [...u.matchAll(/fields\[\]=([^&]+)/g)].map(m => m[1].replace(/\+/g, ' '))).sort();
    assert.deepStrictEqual(camposPedidos, ['Alergias', 'Contacto de emergencia', 'Grupo sanguíneo', 'Patologías activas', 'Tel. emergencia']);
  } finally { w.restaurar(); }
});

test('ficha: demo puede leerla (solo lectura)', async () => {
  const w = mundo();
  try {
    const r = await nova(generarToken({ tipo: 'demo', codigo: 'CC-PAC-200002', horas: 1 }));
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  } finally { w.restaurar(); }
});

test('ficha: sin sesión o con sesión de médico → 401', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(null)).statusCode, 401);
    assert.strictEqual((await nova(generarToken({ tipo: 'medico', codigo: 'CCMED-GINE01', horas: 1 }))).statusCode, 401);
    assert.strictEqual(w.pedidos.length, 0);
  } finally { w.restaurar(); }
});

test('ficha: si falla PACIENTES o HISTORIA → 502, nunca una ficha vacía', async () => {
  for (const tabla of ['tblyUcCfueFLJuvIv', 'tblm2xUADazitHisR']) {
    const w = mundo({ falla: tabla });
    try {
      const r = await nova(generarToken({ tipo: 'paciente', codigo: PAC, horas: 1 }));
      assert.strictEqual(r.statusCode, 502, tabla);
      assert.strictEqual(r.body.alergias, undefined);
      assert.strictEqual(r.body.grupoSanguineo, undefined);
    } finally { w.restaurar(); }
  }
});

test('ficha: paciente que no existe → 403', async () => {
  const w = mundo({ sinPaciente: true });
  try {
    assert.strictEqual((await nova(generarToken({ tipo: 'paciente', codigo: PAC, horas: 1 }))).statusCode, 403);
  } finally { w.restaurar(); }
});
