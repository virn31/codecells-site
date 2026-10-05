// Arreglos de labs de agosto que nunca llegaron a main (rama
// fix/lab-valores-fecha-idempotencia), portados el 2026-10-05:
//   - Categoría de la tabla de labs desde el catálogo, no por substring
//     ("Altura de fondo uterino" → Función Hepática, CLAUDE.md §6). Sin
//     catálogo → "Otros Estudios", nunca adivinado.
//   - Dictado de series: una fecha cuenta como guardada solo si Airtable
//     confirmó TODOS sus valores (antes: "5 de 5 fechas guardadas" aunque los
//     valores fallaran; >10 analitos fallaba siempre por el límite de lote).
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');

const MEDICOS = 'tbl87DsuBMmb4DjFM';
const PACIENTES = 'tblyUcCfueFLJuvIv';
const LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';
const LABS = 'tblhKp4uE1NdXXqLh';
const CATALOGO = 'tblA51aUeYypWQMQV';
const REC_MED = 'recMED0000000001';

const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const falla = (status = 422) => ({ ok: false, status, json: async () => ({ error: 'X' }), text: async () => 'rechazado' });

function fakeRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
}

function instalar(extra = () => null) {
  const original = global.fetch;
  const cap = { posts: [], deletes: [], lotes: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const m = opts.method || 'GET';
    if (m === 'DELETE') cap.deletes.push(u);
    if (m === 'POST' && u.includes(LAB_VALORES)) cap.lotes.push(JSON.parse(opts.body).records.length);
    const r = extra(u, m, opts, cap);
    if (r) return r;
    if (u.includes(`/${MEDICOS}`)) return ok({ records: [{ id: REC_MED, fields: { 'Código de médico': 'CCMED-TEST01', 'Tipo de acceso': 'Clinico' } }] });
    if (u.includes(`/${PACIENTES}`)) return ok({ records: [{ id: 'recPAC', fields: { 'Código de paciente': 'CC-PAC-9001', 'Médico_principal': [REC_MED] } }] });
    if (m === 'DELETE') return ok({ deleted: true });
    if (m !== 'GET') return ok({ id: 'recX', records: [{ id: 'recX' }] });
    return ok({ records: [] });
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

async function nova(body) {
  delete require.cache[require.resolve('../api/nova.js')];
  const handler = require('../api/nova.js');
  const res = fakeRes();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${generarToken({ tipo: 'medico', codigo: 'CCMED-TEST01', horas: 1 })}` },
    body,
  }, res);
  return res;
}

// ── Categorías ────────────────────────────────────────────────────────

const valor = (analito, parametro, fecha = '2026-09-01') => ({ id: `rec${analito.length}${fecha}`, fields: { Analito: analito, Valor: '30', 'Fecha del estudio': fecha, ...(parametro ? { Parametro: [parametro] } : {}) } });

function conCatalogo(valores, catalogoFalla = false) {
  return (u, m) => {
    if (u.includes(CATALOGO)) return catalogoFalla ? falla(429) : ok({ records: [{ id: 'recFU', fields: { fldemBWZPe4F6oCo8: 'control_prenatal' } }, { id: 'recALT', fields: { fldemBWZPe4F6oCo8: 'perfil_hepatico' } }] });
    if (u.includes(LAB_VALORES) && m === 'GET') return ok({ records: valores });
    return null;
  };
}

test('labs: "Altura de fondo uterino" con su parámetro va a Control prenatal, no a Función Hepática', async () => {
  const { restaurar } = instalar(conCatalogo([valor('Altura de fondo uterino', 'recFU'), valor('ALT', 'recALT')]));
  try {
    const res = await nova({ action: 'medico_tabla_labs', pacienteCode: 'CC-PAC-9001' });
    const cat = Object.fromEntries(res.body.filas.map((f) => [f.analito, f.categoria]));
    assert.strictEqual(cat['Altura de fondo uterino'], 'Control prenatal');
    assert.strictEqual(cat['ALT'], 'Perfil hepático');
  } finally { restaurar(); }
});

test('labs: un analito SIN catálogo va a "Otros Estudios" — nunca se adivina por texto', async () => {
  const { restaurar } = instalar(conCatalogo([valor('Altura de fondo uterino', null), valor('Glucosa', null)]));
  try {
    const res = await nova({ action: 'medico_tabla_labs', pacienteCode: 'CC-PAC-9001' });
    for (const f of res.body.filas) assert.strictEqual(f.categoria, 'Otros Estudios', `${f.analito} → ${f.categoria}`);
  } finally { restaurar(); }
});

test('labs: un corte posterior enlazado al catálogo corrige "Otros Estudios"', async () => {
  const { restaurar } = instalar(conCatalogo([valor('Fondo uterino', null, '2026-08-01'), valor('Fondo uterino', 'recFU', '2026-09-01')]));
  try {
    const res = await nova({ action: 'medico_tabla_labs', pacienteCode: 'CC-PAC-9001' });
    assert.strictEqual(res.body.filas[0].categoria, 'Control prenatal');
  } finally { restaurar(); }
});

test('labs: si el catálogo no se puede leer → 502, no se agrupa mal en silencio', async () => {
  const { restaurar } = instalar(conCatalogo([valor('ALT', 'recALT')], true));
  try {
    const res = await nova({ action: 'medico_tabla_labs', pacienteCode: 'CC-PAC-9001' });
    assert.strictEqual(res.statusCode, 502);
  } finally { restaurar(); }
});

// ── Dictado de series: conteo honesto ─────────────────────────────────

const analitos = (n) => Array.from({ length: n }, (_, i) => ({ nombre: `Analito ${i + 1}`, valor: String(i + 1), unidad: 'mg/dL', bandera: 'normal' }));

async function dictarSeries(series, extra) {
  const { cap, restaurar } = instalar((u, m, opts, c) => {
    if (u.startsWith('https://api.anthropic.com/')) {
      return ok({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'guardar_series_historicas_laboratorio', input: { mensaje: 'Guardo.', series } }] });
    }
    if (m === 'POST' && u.includes(LABS)) return ok({ id: `recLAB${c.posts.length++}` });
    return extra ? extra(u, m, opts, c) : null;
  });
  try {
    const res = await nova({ pacienteCode: 'CC-PAC-9001', messages: [{ role: 'user', content: 'Series 01/01/2026 y 01/02/2026' }] });
    return { res, cap, texto: (res.body.content || []).map((b) => b.text).join(' ') };
  } finally { restaurar(); }
}

test('series: 12 analitos se escriben en lotes de máximo 10 y la fecha cuenta como guardada', async () => {
  const { texto, cap } = await dictarSeries([{ fecha: '2026-01-01', analitos: analitos(12) }]);
  assert.deepStrictEqual(cap.lotes, [10, 2]);
  assert.match(texto, /Guardado completo en NOVA LABS: 1 de 1/);
});

test('series: si un lote de valores falla, la fecha NO se reporta como guardada (queda "incompleto X de Y")', async () => {
  let n = 0;
  const { texto, cap } = await dictarSeries([{ fecha: '2026-01-01', analitos: analitos(12) }], (u, m) => (m === 'POST' && u.includes(LAB_VALORES) && n++ === 1 ? falla() : null));
  assert.ok(!/Guardado completo/.test(texto), texto);
  assert.match(texto, /INCOMPLETO: 2026-01-01 \(10 de 12 valores\)/);
  assert.strictEqual(cap.deletes.length, 0, 'no se retira una cabecera que sí tiene valores');
});

test('series: si NINGÚN valor se escribe, la fecha es "NO se guardó" y la cabecera vacía se retira', async () => {
  const { texto, cap } = await dictarSeries([{ fecha: '2026-01-01', analitos: analitos(3) }], (u, m) => (m === 'POST' && u.includes(LAB_VALORES) ? falla() : null));
  assert.match(texto, /NO se guardó: 2026-01-01/);
  assert.ok(!/Guardado completo/.test(texto));
  assert.strictEqual(cap.deletes.length, 1);
  assert.ok(cap.deletes[0].includes(LABS));
});

test('series: dos fechas, una bien y otra mal → se dice exactamente cuál', async () => {
  const { texto } = await dictarSeries(
    [{ fecha: '2026-01-01', analitos: analitos(2) }, { fecha: '2026-02-01', analitos: analitos(2) }],
    (u, m, opts) => (m === 'POST' && u.includes(LAB_VALORES) && opts.body.includes('2026-02-01') ? falla() : null),
  );
  assert.match(texto, /Guardado completo en NOVA LABS: 1 de 2 fecha\(s\) \(2026-01-01\)/);
  assert.match(texto, /NO se guardó: 2026-02-01/);
});

test('labs: la tabla marca graficable=false solo para analitos sin parámetro en ningún corte', async () => {
  const { restaurar } = instalar(conCatalogo([valor('ALT', 'recALT'), valor('Glucosa postprandial', null), valor('Fondo uterino', null, '2026-08-01'), valor('Fondo uterino', 'recFU', '2026-09-01')]));
  try {
    const res = await nova({ action: 'medico_tabla_labs', pacienteCode: 'CC-PAC-9001' });
    const g = Object.fromEntries(res.body.filas.map((f) => [f.analito, f.graficable]));
    assert.deepStrictEqual(g, { ALT: true, 'Glucosa postprandial': false, 'Fondo uterino': true });
  } finally { restaurar(); }
});
