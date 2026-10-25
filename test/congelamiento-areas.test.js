// Congelamiento por área (decisión de Víctor 2026-10-23): en producción se
// puede abrir el directorio sin abrir el expediente ni la capacitación.
// Corre con: node --test

const test = require('node:test');
const assert = require('node:assert');
const { congelado, BASE_PRODUCCION } = require('../lib/congelamientoDatosPersonales');

const PROD = { AIRTABLE_BASE_ID: BASE_PRODUCCION };

test('producción sin interruptores: todo congelado', () => {
  assert.equal(congelado(null, PROD), true);
  assert.equal(congelado('directorio', PROD), true);
  assert.equal(congelado('afiliacion', PROD), true);
  assert.equal(congelado('directorio', {}), true); // sin AIRTABLE_BASE_ID = producción
});

test('DESCONGELAR_AREAS=directorio abre SOLO el directorio', () => {
  const env = { ...PROD, DESCONGELAR_AREAS: 'directorio' };
  assert.equal(congelado('directorio', env), false);
  assert.equal(congelado('afiliacion', env), true);
  assert.equal(congelado(null, env), true); // expediente, kiosco, capacitación…
});

test('áreas mal escritas o inventadas no abren nada (falla cerrado)', () => {
  assert.equal(congelado('directorio', { ...PROD, DESCONGELAR_AREAS: 'directorios' }), true);
  assert.equal(congelado('expediente', { ...PROD, DESCONGELAR_AREAS: 'expediente' }), true);
  assert.equal(congelado(null, { ...PROD, DESCONGELAR_AREAS: 'directorio,expediente' }), true);
});

test('espacios y mayúsculas en la lista se toleran', () => {
  const env = { ...PROD, DESCONGELAR_AREAS: ' Directorio , afiliacion ' };
  assert.equal(congelado('directorio', env), false);
  assert.equal(congelado('afiliacion', env), false);
});

test('DESCONGELAR_PRODUCCION=true sigue abriendo todo; Preview (base de prueba) nunca congela', () => {
  assert.equal(congelado(null, { ...PROD, DESCONGELAR_PRODUCCION: 'true' }), false);
  assert.equal(congelado(null, { AIRTABLE_BASE_ID: 'appCQ0RdhqFMGxWL5' }), false);
});
