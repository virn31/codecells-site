// lib/proteinaPlan.js — proteína del plan semanal por g/kg.
const test = require('node:test');
const assert = require('node:assert');
const { macrosDelPlan, pesoReferencia, etapaErc } = require('../lib/proteinaPlan');
const P = (proteina_pct, grasa_pct, carbo_pct) => ({ proteina_pct, grasa_pct, carbo_pct });

test('peso ajustado solo con IMC ≥ 30', () => {
  assert.deepStrictEqual(pesoReferencia(70, 175), { kg: 70, ajustado: false });
  const r = pesoReferencia(108, 175); // IMC 35.3; ideal 68.9 → 68.9 + 0.4·39.1 = 84.5
  assert.ok(r.ajustado); assert.strictEqual(r.kg, 84.5);
});

test('ERC 3 con diabetes (demo DEMO05): 0.8 g/kg, ya no 93 g', () => {
  const m = macrosDelPlan({ kcal: 1869, preset: P(0.20, 0.30, 0.50), presetNombre: 'renal', peso: 82, talla: 170, patologias: ['ERC 3', 'Hipertensión', 'Diabetes Tipo 2', 'Anemia'], severidadErc: 'Etapa 3' });
  assert.strictEqual(m.proteinaG, 66); assert.strictEqual(m.regla, 'ERC con diabetes');
});

test('ERC 3–5 sin diabetes: 0.6 g/kg; en diálisis: 1.1 g/kg; ERC 2 sin diabetes: 0.8', () => {
  assert.strictEqual(macrosDelPlan({ kcal: 1800, preset: P(0.2, 0.3, 0.5), peso: 70, talla: 170, patologias: ['ERC 4'] }).proteinaG, 42);
  assert.strictEqual(macrosDelPlan({ kcal: 1800, preset: P(0.2, 0.3, 0.5), peso: 70, talla: 170, patologias: ['ERC 5', 'Diálisis'] }).proteinaG, 77);
  assert.strictEqual(macrosDelPlan({ kcal: 1800, preset: P(0.2, 0.3, 0.5), peso: 70, talla: 170, patologias: ['ERC 2'] }).proteinaG, 56);
  assert.strictEqual(etapaErc([], 'Etapa 3'), 3);
});

test('hiperproteico en obesidad (demo DEMO01): 1.5 g/kg de peso ajustado, ya no 219 g', () => {
  const m = macrosDelPlan({ kcal: 2192, preset: P(0.40, 0.325, 0.275), presetNombre: 'hiperproteica', peso: 108, talla: 175, patologias: ['Obesidad'] });
  assert.strictEqual(m.proteinaG, 127); assert.ok(m.ajustado); assert.strictEqual(m.pesoRef, 84.5);
});

test('resto de planes: el % de siempre si queda bajo el tope de 1.8 g/kg', () => {
  const m = macrosDelPlan({ kcal: 1998, preset: P(0.25, 0.30, 0.45), presetNombre: 'diabetica', peso: 94, talla: 178, patologias: ['Prediabetes'] });
  assert.strictEqual(m.proteinaG, Math.round(1998 * 0.25 / 4)); assert.strictEqual(m.regla, null);
});

test('tope de 1.8 g/kg cuando el % daría más', () => {
  const m = macrosDelPlan({ kcal: 2600, preset: P(0.40, 0.30, 0.30), presetNombre: 'cetogenica_estricta', peso: 55, talla: 165, patologias: [] });
  assert.strictEqual(m.proteinaG, 99); assert.strictEqual(m.regla, 'tope de 1.8 g/kg');
});

test('las kcal totales se conservan (±10 por redondeo)', () => {
  for (const c of [{ peso: 82, talla: 170, patologias: ['ERC 3', 'Diabetes Tipo 2'] }, { peso: 108, talla: 175, patologias: [], presetNombre: 'hiperproteica' }]) {
    const m = macrosDelPlan({ kcal: 2000, preset: P(0.3, 0.3, 0.4), ...c });
    assert.ok(Math.abs(m.proteinaG * 4 + m.carboG * 4 + m.grasaG * 9 - 2000) <= 10, JSON.stringify(m));
  }
});
