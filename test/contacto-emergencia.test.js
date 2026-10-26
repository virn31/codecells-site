// Contacto de emergencia (nova paciente_guardar_contacto_emergencia): lo
// elige y lo escribe el paciente, solo en SU registro; el demo no escribe; en
// producción congelada no se toca Airtable. Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const { normalizarContactoEmergencia } = require('../lib/citasPaciente');

const PAC = 'CC-PAC-200001';

test('normalizar: nombre + teléfono válidos; espacios y guiones fuera', () => {
  assert.deepStrictEqual(normalizarContactoEmergencia({ nombre: '  Ana   López, mi hermana ', telefono: '667 123-4567' }),
    { ok: true, valor: { nombre: 'Ana López, mi hermana', telefono: '6671234567' } });
  assert.deepStrictEqual(normalizarContactoEmergencia({ nombre: 'Ana', telefono: '+52 667 123 4567' }).valor.telefono, '+526671234567');
});

test('normalizar: los dos vacíos = borrar; solo uno = error', () => {
  assert.deepStrictEqual(normalizarContactoEmergencia({ nombre: ' ', telefono: '' }), { ok: true, valor: null });
  assert.deepStrictEqual(normalizarContactoEmergencia({}), { ok: true, valor: null });
  assert.strictEqual(normalizarContactoEmergencia({ nombre: 'Ana', telefono: '' }).ok, false);
  assert.strictEqual(normalizarContactoEmergencia({ nombre: '', telefono: '6671234567' }).ok, false);
});

test('normalizar: teléfono corto, letras, ligas y nombres largos se rechazan', () => {
  for (const telefono of ['123', '667-ABC-4567', '66712345678901234']) assert.strictEqual(normalizarContactoEmergencia({ nombre: 'Ana', telefono }).ok, false, telefono);
  for (const nombre of ['https://x.com', 'www.algo.mx', '<b>Ana</b>', 'A'.repeat(101)]) assert.strictEqual(normalizarContactoEmergencia({ nombre, telefono: '6671234567' }).ok, false, nombre);
});

function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

function mundo({ fallaPatch = false } = {}) {
  const pedidos = [];
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    pedidos.push({ u, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    const ok = d => ({ ok: true, status: 200, json: async () => d });
    if (opts.method === 'PATCH') {
      if (fallaPatch) return { ok: false, status: 422, json: async () => ({}) };
      // Airtable devuelve el registro con lo guardado (sin los campos en null).
      const fields = Object.fromEntries(Object.entries(JSON.parse(opts.body).fields).filter(([, v]) => v !== null));
      return ok({ id: 'recPAC', fields });
    }
    if (u.includes('tblyUcCfueFLJuvIv?')) return ok({ records: [{ id: 'recPAC', fields: { 'Código de paciente': PAC } }] });
    throw new Error('fetch no mockeado: ' + u);
  };
  return { pedidos, restaurar: () => { global.fetch = original; } };
}

async function nova(token, body) {
  const res = fakeRes();
  delete require.cache[require.resolve('../api/nova.js')];
  await require('../api/nova.js')({ method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: { action: 'paciente_guardar_contacto_emergencia', ...body } }, res);
  return res;
}
const tokenPac = () => generarToken({ tipo: 'paciente', codigo: PAC, horas: 1 });

test('guardar: escribe SOLO en el registro del paciente de la sesión y responde lo confirmado', async () => {
  const w = mundo();
  try {
    const r = await nova(tokenPac(), { nombre: 'Ana López, mi hermana', telefono: '667 123 4567', pacienteCode: 'CC-PAC-999999' });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.contacto, { nombre: 'Ana López, mi hermana', telefono: '6671234567' });
    const lectura = w.pedidos.find(p => p.method === 'GET');
    assert.ok(lectura.u.includes(`"${PAC}"`) && !lectura.u.includes('999999'), 'busca por el código de la sesión, nunca el del cuerpo');
    const patch = w.pedidos.find(p => p.method === 'PATCH');
    assert.ok(patch.u.endsWith('/tblyUcCfueFLJuvIv/recPAC'));
    assert.deepStrictEqual(Object.keys(patch.body.fields).sort(), ['Contacto de emergencia', 'Tel. emergencia'], 'solo esos dos campos');
  } finally { w.restaurar(); }
});

test('guardar: los dos vacíos borran el contacto (null en Airtable)', async () => {
  const w = mundo();
  try {
    const r = await nova(tokenPac(), { nombre: '', telefono: '' });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.body.contacto, null);
    assert.deepStrictEqual(w.pedidos.find(p => p.method === 'PATCH').body.fields, { 'Contacto de emergencia': null, 'Tel. emergencia': null });
  } finally { w.restaurar(); }
});

test('guardar: dato inválido → 400 sin tocar Airtable', async () => {
  const w = mundo();
  try {
    const r = await nova(tokenPac(), { nombre: 'Ana', telefono: '123' });
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(w.pedidos.length, 0);
  } finally { w.restaurar(); }
});

test('guardar: demo → 403, médico o sin sesión → 401, sin tocar Airtable', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(generarToken({ tipo: 'demo', codigo: 'CC-PAC-200002', horas: 1 }), { nombre: 'Ana', telefono: '6671234567' })).statusCode, 403);
    assert.strictEqual((await nova(generarToken({ tipo: 'medico', codigo: 'CCMED-GINE01', horas: 1 }), { nombre: 'Ana', telefono: '6671234567' })).statusCode, 401);
    assert.strictEqual((await nova(null, { nombre: 'Ana', telefono: '6671234567' })).statusCode, 401);
    assert.strictEqual(w.pedidos.length, 0);
  } finally { w.restaurar(); }
});

test('guardar: si Airtable rechaza la escritura → 502, nunca "guardado"', async () => {
  const w = mundo({ fallaPatch: true });
  try {
    const r = await nova(tokenPac(), { nombre: 'Ana', telefono: '6671234567' });
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.contacto, undefined);
  } finally { w.restaurar(); }
});

test('guardar: producción congelada → 503 sin tocar Airtable', async () => {
  const w = mundo();
  const base = process.env.AIRTABLE_BASE_ID;
  try {
    delete process.env.AIRTABLE_BASE_ID; // sin base = producción
    delete require.cache[require.resolve('../lib/congelamientoDatosPersonales')];
    const r = await nova(tokenPac(), { nombre: 'Ana', telefono: '6671234567' });
    assert.strictEqual(r.statusCode, 503);
    assert.strictEqual(w.pedidos.length, 0);
  } finally {
    process.env.AIRTABLE_BASE_ID = base;
    delete require.cache[require.resolve('../lib/congelamientoDatosPersonales')];
    w.restaurar();
  }
});
