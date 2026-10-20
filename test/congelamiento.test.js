// Regla del congelamiento legal (lib/congelamientoDatosPersonales.js):
// producción congelada salvo interruptor explícito; la base de prueba
// (local y Preview de Vercel) nunca congelada.
// Corre con: node --test

const test = require('node:test');
const assert = require('node:assert');

const RUTA = require.resolve('../lib/congelamientoDatosPersonales.js');
const PROD = 'app6jyD9pDlTLpknA';

function congeladoCon(env) {
  const guardado = { AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID, DESCONGELAR_PRODUCCION: process.env.DESCONGELAR_PRODUCCION };
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try {
    delete require.cache[RUTA];
    return require(RUTA).CONGELADO;
  } finally {
    for (const [k, v] of Object.entries(guardado)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    delete require.cache[RUTA];
  }
}

test('producción sin AIRTABLE_BASE_ID (como en Vercel hoy) → congelado', () => {
  assert.strictEqual(congeladoCon({ AIRTABLE_BASE_ID: undefined, DESCONGELAR_PRODUCCION: undefined }), true);
});

test('producción con su base explícita → congelado', () => {
  assert.strictEqual(congeladoCon({ AIRTABLE_BASE_ID: PROD, DESCONGELAR_PRODUCCION: undefined }), true);
});

test('el interruptor solo vale con el valor exacto "true"', () => {
  for (const v of ['1', 'TRUE', 'yes', '']) {
    assert.strictEqual(congeladoCon({ AIRTABLE_BASE_ID: undefined, DESCONGELAR_PRODUCCION: v }), true, `"${v}" no descongela`);
  }
  assert.strictEqual(congeladoCon({ AIRTABLE_BASE_ID: undefined, DESCONGELAR_PRODUCCION: 'true' }), false);
});

test('base de prueba (local / Preview) → nunca congelado', () => {
  assert.strictEqual(congeladoCon({ AIRTABLE_BASE_ID: 'appCQ0RdhqFMGxWL5', DESCONGELAR_PRODUCCION: undefined }), false);
});
