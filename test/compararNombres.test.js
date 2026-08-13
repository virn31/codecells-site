// Suite del núcleo de la doble validación de identidad (Fase C §3).
// Sin dependencias: runner nativo de Node. Correr con:  node --test
//
// compararNombres(registrado, documento) tolera acentos, mayúsculas, orden de
// tokens y abreviaturas de laboratorio ("Otero B., Abel"); NO usa similitud
// difusa. Umbral: 2 tokens significativos en común (un solo apellido no alcanza).
// No distingue homónimos — eso lo hace el código CC-, no el nombre.

const test = require('node:test');
const assert = require('node:assert');
const { compararNombres } = require('../api/nova.js');

const coincide = (reg, doc) => compararNombres(reg, doc).coincide;

test('coincide: abreviatura de laboratorio "Otero B., Abel"', () => {
  assert.strictEqual(coincide('Abel Otero Beltrán', 'Otero B., Abel'), true);
});

test('coincide: acento + nombre parcial (Diana Sámano García / Diana Samano)', () => {
  assert.strictEqual(coincide('Diana Sámano García', 'Diana Samano'), true);
});

test('coincide: acentos y minúsculas', () => {
  assert.strictEqual(coincide('José María Gutiérrez', 'jose maria gutierrez'), true);
});

test('coincide: conectores de/la ignorados, orden invertido', () => {
  assert.strictEqual(coincide('Juan de la Cruz Pérez', 'de la Cruz, Juan'), true);
});

test('coincide: homónimos — dos "Diana Samano" coinciden por nombre (los distingue el código)', () => {
  assert.strictEqual(coincide('Diana Samano', 'Diana Samano'), true);
});

test('NO coincide: persona totalmente distinta', () => {
  assert.strictEqual(coincide('Juan Pérez López', 'María González Ruiz'), false);
});

test('NO coincide: comparten un solo apellido (insuficiente)', () => {
  assert.strictEqual(coincide('Juan Pérez López', 'Ana Pérez Ruiz'), false);
});

test('NO coincide: SIN_NOMBRE (el endpoint lo trata como ilegible)', () => {
  assert.strictEqual(coincide('Abel Otero Beltrán', 'SIN_NOMBRE'), false);
});

test('NO coincide: cero tokens en común', () => {
  assert.strictEqual(coincide('Abel Otero', 'Beltrán Cortés'), false);
});
