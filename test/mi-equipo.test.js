// "Mi equipo" (nova paciente_mi_equipo): médico principal + médicos a los que
// el paciente entregó su expediente. Solo nombre y especialidad: nunca
// teléfono, cédula ni el nivel interno (CLAUDE.md §10). Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');

const PAC = 'CC-PAC-200001';
const MEDICOS = [
  { id: 'recMEDA', fields: { 'Código de médico': 'CCMED-GINE01', 'Nombre completo': 'Dra. Ana Gine', 'Especialidad': 'Ginecología', 'Teléfono': '6670000000', 'Nivel CODE CELLS®': 'Partner', 'Cédula profesional': '123' } },
  { id: 'recMEDB', fields: { 'Código de médico': 'CCMED-CARD01', 'Nombre completo': 'Dr. Beto Card', 'Especialidad': 'Cardiología', 'Teléfono': '6671111111' } },
];

function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

function mundo({ falla = false } = {}) {
  const pedidos = [];
  const original = global.fetch;
  global.fetch = async (url) => {
    const u = decodeURIComponent(String(url)); pedidos.push(u);
    const ok = d => ({ ok: true, status: 200, json: async () => d });
    if (falla) return { ok: false, status: 503, json: async () => ({}) };
    if (u.includes('tblyUcCfueFLJuvIv?')) return ok({ records: [{ id: 'recPAC', fields: { 'Código de paciente': PAC, 'Médico_principal': ['recMEDA'] } }] });
    if (u.includes('VINCULACIONES')) return ok({ records: [{ id: 'recV', fields: { Paciente: PAC, 'Médico': 'CCMED-CARD01', 'Especialidad': 'Cardiología', 'Fecha de vinculación': '2026-10-01T10:00:00.000Z' } }] });
    if (u.includes('tbl87DsuBMmb4DjFM?')) {
      // Solo devuelve los campos pedidos, como Airtable con fields[].
      const pedidosCampos = [...u.matchAll(/fields\[\]=([^&]+)/g)].map(m => m[1]);
      return ok({ records: MEDICOS.map(m => ({ id: m.id, fields: Object.fromEntries(Object.entries(m.fields).filter(([k]) => pedidosCampos.includes(k))) })) });
    }
    throw new Error('fetch no mockeado: ' + u);
  };
  return { pedidos, restaurar: () => { global.fetch = original; } };
}

async function nova(token) {
  const res = fakeRes();
  delete require.cache[require.resolve('../api/nova.js')];
  await require('../api/nova.js')({ method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: { action: 'paciente_mi_equipo' } }, res);
  return res;
}

test('mi equipo: principal primero y el compartido con su fecha; solo nombre/especialidad/rol', async () => {
  const w = mundo();
  try {
    const r = await nova(generarToken({ tipo: 'paciente', codigo: PAC, horas: 1 }));
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.equipo.map(m => [m.nombre, m.rol]), [['Dra. Ana Gine', 'principal'], ['Dr. Beto Card', 'compartido']]);
    assert.strictEqual(r.body.equipo[1].desde, '2026-10-01T10:00:00.000Z');
    const texto = JSON.stringify(r.body);
    for (const prohibido of ['6670000000', 'Partner', 'Teléfono', 'Nivel', 'Cédula']) assert.ok(!texto.includes(prohibido), `no debe salir: ${prohibido}`);
    assert.ok(!w.pedidos.some(u => u.includes('fields[]=Teléfono') || u.includes('fields[]=Nivel')), 'ni siquiera se piden a Airtable');
  } finally { w.restaurar(); }
});

test('mi equipo: sin sesión o con sesión de médico → 401', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(null)).statusCode, 401);
    assert.strictEqual((await nova(generarToken({ tipo: 'medico', codigo: 'CCMED-GINE01', horas: 1 }))).statusCode, 401);
  } finally { w.restaurar(); }
});

test('mi equipo: si Airtable falla → 502, nunca "no tienes médico"', async () => {
  const w = mundo({ falla: true });
  try {
    const r = await nova(generarToken({ tipo: 'paciente', codigo: PAC, horas: 1 }));
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.equipo, undefined);
  } finally { w.restaurar(); }
});
