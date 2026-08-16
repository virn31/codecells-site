// Suite del guard anti-duplicado del alta por dictado (crear_paciente_dictado).
// Prueba buscarPacientesPorNombre con fetch mockeado (sin red): que atrape al
// paciente existente (Abel), NO sobre-marque nombres distintos, y devuelva los
// dos homónimos (Diana Samano) para que el médico decida — nunca bloquear.
// Correr con:  node --test

const test = require('node:test');
const assert = require('node:assert');
const { buscarPacientesPorNombre } = require('../api/nova.js');

const PACIENTES = [
  { id: 'rec1', fields: { 'Código de paciente': 'CC-PAC-635281', 'Nombre completo': 'Abel Otero Beltrán', 'Fecha de nacimiento': '1980-01-01' } },
  { id: 'rec2', fields: { 'Código de paciente': 'CC-PAC-990010', 'Nombre completo': 'Diana Sámano García', 'Fecha de nacimiento': '1987-05-10' } },
  { id: 'rec3', fields: { 'Código de paciente': 'CC-PAC-990011', 'Nombre completo': 'Diana Samano Ruiz', 'Fecha de nacimiento': '1989-03-02' } },
  { id: 'rec4', fields: { 'Código de paciente': 'CC-PAC-990012', 'Nombre completo': 'Juan Pérez López', 'Fecha de nacimiento': '1975-07-07' } },
];

// Mock de fetch: PACIENTES devuelve la lista (sin offset); CONSULTAS devuelve vacío.
function instalarFetchMock() {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('tblyUcCfueFLJuvIv')) return { ok: true, json: async () => ({ records: PACIENTES }) };
    if (u.includes('tbl1Xp2IGxdV178Ky')) return { ok: true, json: async () => ({ records: [] }) };
    return { ok: true, json: async () => ({ records: [] }) };
  };
}

test('atrapa al paciente existente dictado como abreviatura ("Otero B., Abel")', async () => {
  instalarFetchMock();
  const c = await buscarPacientesPorNombre('base', 'tok', 'Otero B., Abel');
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].codigo, 'CC-PAC-635281');
  assert.strictEqual(c[0].edad >= 40, true); // edad derivada de la fecha de nacimiento
});

test('homónimos: devuelve las DOS Diana Samano (el médico decide, no se bloquea)', async () => {
  instalarFetchMock();
  const c = await buscarPacientesPorNombre('base', 'tok', 'Diana Samano');
  assert.strictEqual(c.length, 2);
  const codigos = c.map(x => x.codigo).sort();
  assert.deepStrictEqual(codigos, ['CC-PAC-990010', 'CC-PAC-990011']);
});

test('nombre distinto: sin candidatos (no sobre-marca)', async () => {
  instalarFetchMock();
  const c = await buscarPacientesPorNombre('base', 'tok', 'Ricardo Fuentes Mora');
  assert.strictEqual(c.length, 0);
});

test('comparte un solo apellido: no alcanza para candidato', async () => {
  instalarFetchMock();
  const c = await buscarPacientesPorNombre('base', 'tok', 'Marcos Otero Villa');
  assert.strictEqual(c.length, 0); // solo "Otero" en común con Abel -> no coincide
});
