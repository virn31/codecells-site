// Pestaña Citas de la app del paciente (nova paciente_mis_citas) y la liga
// "Agendar" de Mi equipo. Solo lectura, solo el paciente de la sesión, lista
// blanca de campos, y un fallo nunca se ve como "no tienes citas".
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const { proximasCitas, urlFichaDirectorio } = require('../lib/citasPaciente');

const PAC = 'CC-PAC-200001';

// ── Reglas puras ────────────────────────────────────────────────────
test('próxima cita: cuenta solo la consulta más reciente de cada médico', () => {
  const r = proximasCitas([
    { fecha: '2026-09-01T16:00:00.000Z', proximaCita: '2026-11-30', medicoClave: 'recA', medico: { nombre: 'A' } },
    // Consulta posterior del mismo médico SIN fecha: la anterior quedó superada.
    { fecha: '2026-10-01T16:00:00.000Z', proximaCita: null, medicoClave: 'recA', medico: { nombre: 'A' } },
    { fecha: '2026-10-02T16:00:00.000Z', proximaCita: '2026-11-05', medicoClave: 'recB', medico: { nombre: 'B' } },
    { fecha: '2026-08-02T16:00:00.000Z', proximaCita: '2026-12-01', medicoClave: 'recB', medico: { nombre: 'B' } },
  ], '2026-10-25');
  assert.deepStrictEqual(r, [{ fecha: '2026-11-05', medico: { nombre: 'B' }, anotadaEl: '2026-10-02T16:00:00.000Z' }]);
});

test('próxima cita: una fecha pasada no se muestra; la de hoy sí; ordenadas', () => {
  const r = proximasCitas([
    { fecha: '2026-10-01T10:00:00Z', proximaCita: '2026-10-24', medicoClave: 'recA' },
    { fecha: '2026-10-01T10:00:00Z', proximaCita: '2026-12-01', medicoClave: 'recB' },
    { fecha: '2026-10-01T10:00:00Z', proximaCita: '2026-10-25', medicoClave: 'recC' },
    { fecha: '2026-10-01T10:00:00Z', proximaCita: 'en 30 días', medicoClave: 'recD' },
  ], '2026-10-25');
  assert.deepStrictEqual(r.map(x => x.fecha), ['2026-10-25', '2026-12-01']);
});

test('ficha del directorio: solo perfiles publicados; liga bonita o id', () => {
  assert.strictEqual(urlFichaDirectorio({ id: 'recP', fields: { Publicado: true, 'Liga pública': 'dr-rodriguez' } }), '/directorio/dr-rodriguez');
  assert.strictEqual(urlFichaDirectorio({ id: 'recP', fields: { Publicado: true, 'Liga pública': '<script>' } }), '/directorio/medico.html?id=recP');
  assert.strictEqual(urlFichaDirectorio({ id: 'recP', fields: { 'Liga pública': 'dr-rodriguez' } }), null);
});

// ── Endpoint ────────────────────────────────────────────────────────
function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

const CONSULTAS = [
  { id: 'recC1', fields: { 'Código de paciente ref': PAC, 'Fecha de consulta': '2026-10-01T16:00:00.000Z', 'Tipo de consulta': 'Seguimiento', 'Plan terapéutico': 'Continuar manejo.', 'Próxima cita': '2099-01-15', 'Médico': ['recMEDA'], 'Código de médico ref': 'CCMED-GINE01', 'Razonamiento clínico': 'PRIVADO-RAZ', 'Diagnóstico (CIE-10)': 'O24.4' } },
  { id: 'recC2', fields: { 'Código de paciente ref': PAC, 'Fecha de consulta': '2026-08-01T16:00:00.000Z', 'Próxima cita': '2026-08-20', 'Médico': ['recMEDA'], 'Código de médico ref': 'CCMED-GINE01' } },
];
const MEDICOS = [
  { id: 'recMEDA', fields: { 'Código de médico': 'CCMED-GINE01', 'Nombre completo': 'Dra. Ana Gine', 'Especialidad': 'Ginecología', 'Teléfono': '6670000000', 'Nivel CODE CELLS®': 'Partner' } },
];

// Airtable simulado que respeta fields[] (como el real).
function soloCampos(u, records) {
  const pedidos = [...u.matchAll(/fields\[\]=([^&]+)/g)].map(m => m[1]);
  return records.map(r => ({ id: r.id, fields: Object.fromEntries(Object.entries(r.fields).filter(([k]) => pedidos.includes(k))) }));
}
function mundo({ fallaConsultas = false, fallaDirectorio = false } = {}) {
  const pedidos = [];
  const original = global.fetch;
  global.fetch = async (url) => {
    // URLSearchParams codifica el espacio como '+'; Airtable lo acepta igual.
    const u = decodeURIComponent(String(url).replace(/\+/g, ' ')); pedidos.push(u);
    const ok = d => ({ ok: true, status: 200, json: async () => d });
    const falla = { ok: false, status: 503, json: async () => ({}) };
    if (u.includes('tbl1Xp2IGxdV178Ky?')) return fallaConsultas ? falla : ok({ records: soloCampos(u, CONSULTAS) });
    if (u.includes('tbl87DsuBMmb4DjFM?')) return ok({ records: soloCampos(u, MEDICOS) });
    if (u.includes('tblyUcCfueFLJuvIv?')) return ok({ records: [{ id: 'recPAC', fields: { 'Código de paciente': PAC, 'Médico_principal': ['recMEDA'] } }] });
    if (u.includes('VINCULACIONES')) return ok({ records: [] });
    if (u.includes('tblkUNPwu1sQgZBPJ?')) return fallaDirectorio ? falla : ok({ records: [{ id: 'recPERF', fields: { 'Médico': ['recMEDA'], Publicado: true, 'Liga pública': 'dra-ana-gine' } }] });
    throw new Error('fetch no mockeado: ' + u);
  };
  return { pedidos, restaurar: () => { global.fetch = original; } };
}

async function nova(token, action) {
  const res = fakeRes();
  delete require.cache[require.resolve('../api/nova.js')];
  await require('../api/nova.js')({ method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: { action, pacienteCode: 'CC-PAC-999999' } }, res);
  return res;
}

test('mis citas: consultas del paciente de la SESIÓN, con lista blanca de campos', async () => {
  const w = mundo();
  try {
    const r = await nova(generarToken({ tipo: 'paciente', codigo: PAC, horas: 1 }), 'paciente_mis_citas');
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.consultas.length, 2);
    assert.deepStrictEqual(r.body.consultas[0], { fecha: '2026-10-01T16:00:00.000Z', tipo: 'Seguimiento', plan: 'Continuar manejo.', proximaCita: '2099-01-15', medico: { nombre: 'Dra. Ana Gine', especialidad: 'Ginecología' } });
    assert.deepStrictEqual(r.body.proximas.map(p => p.fecha), ['2099-01-15']);
    const texto = JSON.stringify(r.body);
    for (const prohibido of ['PRIVADO-RAZ', 'O24.4', '6670000000', 'Partner', 'CCMED-', 'rec']) assert.ok(!texto.includes(prohibido), `no debe salir: ${prohibido}`);
    const consulta = w.pedidos.find(u => u.includes('tbl1Xp2IGxdV178Ky?'));
    assert.ok(consulta.includes(`{Código de paciente ref}="${PAC}"`), 'filtra por el código del token');
    assert.ok(!consulta.includes('CC-PAC-999999'), 'ignora el pacienteCode del cuerpo');
    assert.ok(!consulta.includes('Razonamiento') && !consulta.includes('Diagn'), 'ni siquiera pide los campos privados');
  } finally { w.restaurar(); }
});

test('mis citas: la sesión demo lee (solo lectura); sin sesión o médico → 401', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(generarToken({ tipo: 'demo', codigo: PAC, horas: 1 }), 'paciente_mis_citas')).statusCode, 200);
    assert.strictEqual((await nova(null, 'paciente_mis_citas')).statusCode, 401);
    assert.strictEqual((await nova(generarToken({ tipo: 'medico', codigo: 'CCMED-GINE01', horas: 1 }), 'paciente_mis_citas')).statusCode, 401);
  } finally { w.restaurar(); }
});

test('mis citas: si Airtable falla → 502, nunca listas vacías', async () => {
  const w = mundo({ fallaConsultas: true });
  try {
    const r = await nova(generarToken({ tipo: 'paciente', codigo: PAC, horas: 1 }), 'paciente_mis_citas');
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.consultas, undefined);
    assert.strictEqual(r.body.proximas, undefined);
  } finally { w.restaurar(); }
});

test('mi equipo: liga a la ficha publicada del directorio para "Agendar"', async () => {
  const w = mundo();
  try {
    const r = await nova(generarToken({ tipo: 'paciente', codigo: PAC, horas: 1 }), 'paciente_mi_equipo');
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.equipo[0].fichaDirectorio, '/directorio/dra-ana-gine');
    assert.strictEqual(r.body.directorioError, false);
    assert.ok(w.pedidos.find(u => u.includes('tblkUNPwu1sQgZBPJ?')).includes('{Publicado}=1'), 'solo perfiles publicados');
  } finally { w.restaurar(); }
});

test('mi equipo: si el directorio falla, el equipo sale igual y se avisa', async () => {
  const w = mundo({ fallaDirectorio: true });
  try {
    const r = await nova(generarToken({ tipo: 'paciente', codigo: PAC, horas: 1 }), 'paciente_mi_equipo');
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.body.equipo[0].nombre, 'Dra. Ana Gine');
    assert.strictEqual(r.body.equipo[0].fichaDirectorio, null);
    assert.strictEqual(r.body.directorioError, true);
  } finally { w.restaurar(); }
});
