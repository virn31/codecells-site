// lib/restriccionesAlimentarias.js — alergias/intolerancias del expediente →
// ingredientes que el plan semanal excluye.
const test = require('node:test');
const assert = require('node:assert');
const { GRUPOS, restriccionesAlimentarias } = require('../lib/restriccionesAlimentarias');
const CATALOGO = require('../api/data/bncc-data.json').ingredientes;
const nombres = set => [...set].map(id => CATALOGO.find(i => i.id === id).nombre).sort();

test('todos los IDs de la tabla existen en el catálogo', () => {
  const ids = new Set(CATALOGO.map(i => i.id));
  for (const [k, g] of Object.entries(GRUPOS)) for (const id of g.ids) assert.ok(ids.has(id), `${k}: ${id} no está en el catálogo`);
});

test('"Intolerancia a la lactosa" excluye TODOS los lácteos del catálogo (caso demo CC-PAC-200002)', () => {
  const r = restriccionesAlimentarias('Intolerancia a la lactosa', CATALOGO);
  assert.deepStrictEqual(nombres(r.excluir), ['Crema reducida en grasa', 'Leche descremada', 'Proteína de suero de leche (Whey Protein)', 'Queso fresco', 'Queso panela', 'Yogur griego natural', 'Yogur natural bajo en grasa']);
  assert.deepStrictEqual(r.noAplicadas, []);
  // Ningún lácteo del catálogo se queda fuera de la tabla.
  const lacteos = CATALOGO.filter(i => /leche|yogur|queso|crema|suero/i.test(i.nombre)).map(i => i.id);
  for (const id of lacteos) assert.ok(r.excluir.has(id), id);
});

test('"sin gluten" y "no lácteos" SÍ son restricciones (no se confunden con "sin alergias")', () => {
  assert.ok(restriccionesAlimentarias('sin gluten', CATALOGO).excluir.has('ING000034'));
  assert.ok(restriccionesAlimentarias('no lácteos', CATALOGO).excluir.has('ING000015'));
  assert.ok(restriccionesAlimentarias('Celiaquía', CATALOGO).excluir.has('ING000030'), 'avena por contaminación cruzada');
});

test('negaciones no excluyen nada ni se reportan como no aplicadas', () => {
  for (const t of ['Niega', 'Ninguna', 'sin alergias', 'Sin alergias conocidas', 'No refiere', 'N/A', '', null]) {
    const r = restriccionesAlimentarias(t, CATALOGO);
    assert.strictEqual(r.excluir.size, 0, String(t));
    assert.deepStrictEqual(r.noAplicadas, [], String(t));
  }
});

test('por nombre con prefijo y plural: "alergia a la fresa" excluye Fresas', () => {
  const r = restriccionesAlimentarias('Alergia a la fresa', CATALOGO);
  assert.deepStrictEqual(nombres(r.excluir), ['Fresas']);
  assert.deepStrictEqual(r.aplicadas, ['Alergia a la fresa']);
});

test('varias en un texto: comas, punto y coma, "y"', () => {
  const r = restriccionesAlimentarias('huevo; nueces y pescado, Alérgico al atún', CATALOGO);
  for (const id of ['ING000004', 'ING000038', 'ING000019', 'ING000029', 'ING000018', 'ING000056']) assert.ok(r.excluir.has(id), id);
  assert.deepStrictEqual(r.noAplicadas, []);
});

test('lo que no se reconoce ni coincide se devuelve para AVISARLO, no se ignora', () => {
  const r = restriccionesAlimentarias('Intolerancia a la lactosa, kiwi', CATALOGO);
  assert.deepStrictEqual(r.noAplicadas, ['kiwi']);
  assert.deepStrictEqual(r.aplicadas, ['Intolerancia a la lactosa']);
});

test('grupos sin ingredientes hoy (mariscos) se reconocen: no son "no aplicadas"', () => {
  const r = restriccionesAlimentarias('Alergia a mariscos', CATALOGO);
  assert.strictEqual(r.excluir.size, 0);
  assert.deepStrictEqual(r.noAplicadas, []);
});

test('"lechuga" o "nopal" no disparan grupos por accidente', () => {
  const r = restriccionesAlimentarias('lechuga', CATALOGO);
  assert.deepStrictEqual(nombres(r.excluir), ['Lechuga', 'Lechuga romana']);
  assert.ok(!r.excluir.has('ING000015'), 'lechuga no es leche');
});
