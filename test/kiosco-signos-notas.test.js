// kiosco_guardar_signos (api/nova.js) AGREGA la línea de signos a
// 'Notas generales' en vez de reemplazar el campo completo. Antes, cada toma
// de signos en el kiosco borraba lo que hubiera en esas notas (edad dictada
// al dar de alta, notas previas, signos anteriores).
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.NODE_ENV = 'development'; // pasa el guard de origen CORS de nova.js

const test = require('node:test');
const assert = require('node:assert');

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const REC_PAC = 'recPAC0000000001';

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    setHeader() {},
    end() { return this; },
  };
}

function instalarFetchMock({ notasPrevias, lecturaFalla, capturas }) {
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    if (u.includes(`${TBL_PACIENTES}/${REC_PAC}`) && metodo === 'GET') {
      if (lecturaFalla) return { ok: false, status: 429, json: async () => ({ error: 'RATE_LIMIT' }) };
      const fields = notasPrevias === undefined ? {} : { 'Notas generales': notasPrevias };
      return { ok: true, status: 200, json: async () => ({ id: REC_PAC, fields }) };
    }
    if (u.includes(`${TBL_PACIENTES}/${REC_PAC}`) && metodo === 'PATCH') {
      capturas.patch = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ id: REC_PAC }) };
    }
    throw new Error(`fetch no mockeado en esta prueba: ${metodo} ${u}`);
  };
  return () => { global.fetch = original; };
}

// CONGELADO=false se fija en la prueba (no por variables de entorno), para
// que el resultado no dependa de cómo esté el congelamiento en el repo.
function requerirNovaFresco() {
  const rutaCongelamiento = require.resolve('../lib/congelamientoDatosPersonales.js');
  delete require.cache[rutaCongelamiento];
  const real = require(rutaCongelamiento);
  require.cache[rutaCongelamiento].exports = { ...real, CONGELADO: false };
  delete require.cache[require.resolve('../api/nova.js')];
  return require('../api/nova.js');
}

function reqSignos(extra) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { action: 'kiosco_guardar_signos', pacienteRecordId: REC_PAC, staffCodigo: 'CCMED-TEST01', presion: '120/80', frecuenciaCardiaca: 72, ...extra },
  };
}

test('kiosco_guardar_signos: conserva las Notas generales previas y agrega la línea de signos al final', async () => {
  const capturas = {};
  const previas = 'Edad dictada: 52 años (sin fecha de nacimiento)\nNota importante del médico';
  const restaurar = instalarFetchMock({ notasPrevias: previas, capturas });
  try {
    const res = fakeRes();
    await requerirNovaFresco()(reqSignos(), res);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    const notas = capturas.patch.fields['Notas generales'];
    assert.ok(notas.startsWith(previas), 'las notas previas deben quedar intactas al inicio');
    assert.match(notas, /\n\[\d{4}-\d{2}-\d{2}\] Signos vitales \(kiosco\): PA: 120\/80, FC: 72lpm$/);
  } finally { restaurar(); }
});

test('kiosco_guardar_signos: sin notas previas, escribe solo la línea de signos', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ notasPrevias: undefined, capturas });
  try {
    const res = fakeRes();
    await requerirNovaFresco()(reqSignos(), res);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.match(capturas.patch.fields['Notas generales'], /^\[\d{4}-\d{2}-\d{2}\] Signos vitales \(kiosco\): /);
  } finally { restaurar(); }
});

test('kiosco_guardar_signos: si no se pueden leer las notas actuales → 502 y NO se escribe nada', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ lecturaFalla: true, capturas });
  try {
    const res = fakeRes();
    await requerirNovaFresco()(reqSignos(), res);
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(capturas.patch, undefined, 'no debe escribir a ciegas');
  } finally { restaurar(); }
});

test('kiosco_guardar_signos: solo peso/talla (sin notas) → no lee notas y no toca Notas generales', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ lecturaFalla: true, capturas });
  try {
    const res = fakeRes();
    await requerirNovaFresco()(reqSignos({ presion: null, frecuenciaCardiaca: null, peso: 70.5 }), res);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(capturas.patch.fields['Peso actual (kg)'], 70.5);
    assert.ok(!('Notas generales' in capturas.patch.fields));
  } finally { restaurar(); }
});

test('kiosco_guardar_signos: nada capturado → 400', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const res = fakeRes();
    await requerirNovaFresco()(reqSignos({ presion: null, frecuenciaCardiaca: null }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(capturas.patch, undefined);
  } finally { restaurar(); }
});
