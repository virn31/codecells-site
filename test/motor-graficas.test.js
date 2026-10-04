// lib/motor-graficas.js — lógica pura del motor, probada en Node (antes vivía
// dentro de portal-medico.html y no se podía probar sin navegador).
// renderGrafica necesita `document`; su verificación es visual (mismo SVG
// antes/después del movimiento a lib/). Las funciones que todavía no están
// en todas las versiones del archivo se saltan si no existen.
// Corre con: node --test

const test = require('node:test');
const assert = require('node:assert');
const motor = require('../lib/motor-graficas.js');

const ZONAS_HBA1C = [
  { max: 5.6, color: 'verde' },
  { min: 5.7, max: 6.4, color: 'amarillo' },
  { min: 6.5, color: 'rojo' },
];

test('motor: expone renderGrafica y evaluarZona como antes', () => {
  assert.strictEqual(typeof motor.renderGrafica, 'function');
  assert.strictEqual(typeof motor.evaluarZona, 'function');
});

test('evaluarZona: límites inclusivos sin solape (hba1c 6.4 → amarillo, 6.5 → rojo)', () => {
  assert.strictEqual(motor.evaluarZona(5.6, ZONAS_HBA1C).color, 'verde');
  assert.strictEqual(motor.evaluarZona(6.4, ZONAS_HBA1C).color, 'amarillo');
  assert.strictEqual(motor.evaluarZona(6.5, ZONAS_HBA1C).color, 'rojo');
});

test('evaluarZona: sin zonas o sin valor → null, nunca error ni zona inventada', () => {
  assert.strictEqual(motor.evaluarZona(6.0, []), null);
  assert.strictEqual(motor.evaluarZona(null, ZONAS_HBA1C), null);
  assert.strictEqual(motor.evaluarZona(6.0, undefined), null);
});

test('etiquetas: primer punto "Inicio", luego semana; sin semana cae a la fecha', () => {
  assert.strictEqual(motor.etiquetaEjeGrafica({ semana: 0 }, 0), 'Inicio');
  assert.strictEqual(motor.etiquetaEjeGrafica({ semana: 3 }, 1), 'S3');
  assert.strictEqual(motor.etiquetaEjeGrafica({ fecha: '2026-05-01' }, 1), '2026-05-01');
  assert.strictEqual(motor.etiquetaPuntoGrafica({ semana: 2 }), 'Semana 2');
});

const CLASIF_GO = {
  tiposParto: new Set(['Parto eutócico', 'Parto instrumentado', 'Cesárea']),
  tiposCesarea: new Set(['Cesárea']),
  tiposAborto: new Set(['Aborto espontáneo', 'Aborto provocado', 'Embarazo ectópico', 'Embarazo molar', 'Óbito']),
};

test('calcularFormulaEventos: Mariana (1 parto + embarazo actual) → G2 P1 C0 A0', { skip: !motor.calcularFormulaEventos }, () => {
  assert.deepStrictEqual(motor.calcularFormulaEventos(['Parto eutócico'], true, CLASIF_GO), { G: 2, P: 1, C: 0, A: 0 });
});

test('calcularFormulaEventos: cesárea cuenta en P y C; aborto en G y A; legrado no cuenta', { skip: !motor.calcularFormulaEventos }, () => {
  assert.deepStrictEqual(
    motor.calcularFormulaEventos(['Cesárea', 'Aborto espontáneo', 'Legrado'], false, CLASIF_GO),
    { G: 2, P: 1, C: 1, A: 1 }
  );
});

test('evaluarVigenciaEstudio: sin periodicidad configurada → vencido null (no se inventa umbral)', { skip: !motor.evaluarVigenciaEstudio }, () => {
  const v = motor.evaluarVigenciaEstudio('2024-03-10', undefined, '2026-09-10');
  assert.strictEqual(v.mesesTranscurridos, 30);
  assert.strictEqual(v.vencido, null);
  assert.strictEqual(motor.evaluarVigenciaEstudio('2024-03-10', 36, '2026-09-10').vencido, false);
  assert.strictEqual(motor.evaluarVigenciaEstudio('2022-03-10', 36, '2026-09-10').vencido, true);
});

test('evaluarTendencia: solo dispara si el cambio supera la magnitud y va en la dirección de la regla', { skip: !motor.evaluarTendencia }, () => {
  const reglas = [{ tipo: 'caida', magnitudMinima: 20, ventana: 'consecutiva', color: 'naranja' }];
  assert.strictEqual(motor.evaluarTendencia(40, 70, reglas).color, 'naranja');
  assert.strictEqual(motor.evaluarTendencia(60, 70, reglas), null);
  assert.strictEqual(motor.evaluarTendencia(90, 60, reglas), null);
  assert.strictEqual(motor.evaluarTendencia(40, null, reglas), null);
});
