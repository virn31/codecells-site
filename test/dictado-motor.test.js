// Motor de dictado (SPEC-NOVA-DICTACION-BIDIRECCIONAL, Fase 1).
// CLAUDE.md §7: NOVA transcribe y estructura, nunca redacta. Cada campo trae
// su cita literal; el servidor la verifica contra la transcripción y
// descarta lo que no está. La acción no guarda nada. Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const { procesarDictado } = require('../api/nova.js');

const MEDICOS = 'tbl87DsuBMmb4DjFM';
const PACIENTES = 'tblyUcCfueFLJuvIv';
const REC_MED = 'recMED0000000001';

const DICTADO = 'Paciente con dolor abdominal cólico desde ayer, sin fiebre. Presión 120 80, frecuencia cardíaca 92, temperatura 37,2. Madre con diabetes. Diagnóstico: gastroenteritis probable. Plan: hidratación, dieta blanda, metoclopramida.';

// ── Verificación (procesarDictado) ────────────────────────────────────

test('dictado: el texto queda LITERAL — NOVA no puede reescribirlo ni completarlo', () => {
  const r = procesarDictado(DICTADO, [{ campo: 'plan_terapeutico', valor: 'Metoclopramida 10 mg c/8h, dieta blanda', cita: 'hidratación, dieta blanda, metoclopramida' }]);
  assert.strictEqual(r.campos.plan_terapeutico, 'hidratación, dieta blanda, metoclopramida');
});

test('dictado: lo que no se dijo se descarta (CIE-10 inventado, negativo clínico no dictado)', () => {
  const r = procesarDictado(DICTADO, [
    { campo: 'diagnostico', valor: 'K59.1', cita: 'K59.1 diarrea' },
    { campo: 'alergias', valor: 'Niega alergias', cita: 'niega alergias' },
    { campo: 'diagnostico', valor: 'x', cita: 'gastroenteritis probable' },
  ]);
  assert.strictEqual(r.campos.diagnostico, 'gastroenteritis probable');
  assert.strictEqual(r.campos.alergias, undefined);
  assert.strictEqual(r.descartados.length, 2);
  assert.ok(r.descartados.every((d) => /no aparece/.test(d.motivo)));
});

test('dictado: números verificados contra la cita (incluida coma decimal y presión con dos cifras)', () => {
  const r = procesarDictado(DICTADO, [
    { campo: 'presion', valor: '120/80', cita: 'Presión 120 80' },
    { campo: 'frecuencia_cardiaca', valor: 92, cita: 'frecuencia cardíaca 92' },
    { campo: 'temperatura', valor: 37.2, cita: 'temperatura 37,2' },
  ]);
  assert.deepStrictEqual(r.campos, { presion: '120/80', frecuencia_cardiaca: 92, temperatura: 37.2 });
});

test('dictado: un número que no está en su cita se descarta (NOVA "redondeó" o inventó)', () => {
  const r = procesarDictado(DICTADO, [
    { campo: 'frecuencia_cardiaca', valor: 90, cita: 'frecuencia cardíaca 92' },
    { campo: 'presion', valor: '120/85', cita: 'Presión 120 80' },
    { campo: 'saturacion_oxigeno', valor: 98, cita: 'saturación 98' },
  ]);
  assert.deepStrictEqual(r.campos, {});
  assert.strictEqual(r.descartados.length, 3);
});

test('dictado: fuera de rango plausible se conserva pero se marca para revisar', () => {
  const r = procesarDictado('frecuencia cardiaca 9 y temperatura 45', [
    { campo: 'frecuencia_cardiaca', valor: 9, cita: 'frecuencia cardiaca 9' },
    { campo: 'temperatura', valor: 45, cita: 'temperatura 45' },
  ]);
  assert.strictEqual(r.campos.frecuencia_cardiaca, 9);
  assert.ok(r.detalle.every((d) => /revisa/.test(d.aviso || '')));
});

test('dictado: dos valores distintos para el mismo signo → conflicto, no se elige uno', () => {
  const r = procesarDictado('frecuencia 80 y luego frecuencia 96', [
    { campo: 'frecuencia_cardiaca', valor: 80, cita: 'frecuencia 80' },
    { campo: 'frecuencia_cardiaca', valor: 96, cita: 'frecuencia 96' },
  ]);
  assert.strictEqual(r.campos.frecuencia_cardiaca, undefined);
  assert.match(r.descartados[0].motivo, /dos valores distintos/);
});

test('dictado: campo desconocido se descarta; faltantes y sin_ubicar verificados', () => {
  const r = procesarDictado(DICTADO, [{ campo: 'receta', valor: 'x', cita: 'metoclopramida' }], ['Madre con diabetes', 'texto que nunca se dijo']);
  assert.strictEqual(Object.keys(r.campos).length, 0);
  assert.deepStrictEqual(r.sinUbicar, ['Madre con diabetes']);
  assert.ok(r.faltantes.includes('Peso (kg)'));
});

// ── Acción medico_dictado ─────────────────────────────────────────────

function fakeRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
}
const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

function instalar({ tipoAcceso = 'Clinico', modelo, modeloFalla = false } = {}) {
  const original = global.fetch;
  const cap = { escrituras: [], anthropic: 0 };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const m = opts.method || 'GET';
    if (m !== 'GET' && !u.includes('tblSpORAqLKxYOI6W') && !u.startsWith('https://api.anthropic.com/')) cap.escrituras.push(u);
    if (u.startsWith('https://api.anthropic.com/')) {
      cap.anthropic++;
      if (modeloFalla) return { ok: false, status: 529, json: async () => ({}), text: async () => 'overloaded' };
      return ok({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'estructurar_dictado', input: modelo || { campos: [] } }] });
    }
    if (u.includes(`/${MEDICOS}`)) return ok({ records: [{ id: REC_MED, fields: { 'Código de médico': 'CCMED-TEST01', 'Tipo de acceso': tipoAcceso } }] });
    if (u.includes(`/${PACIENTES}`)) {
      if (u.includes(encodeURIComponent('CC-PAC-9002'))) return ok({ records: [{ id: 'recAJENO', fields: { 'Código de paciente': 'CC-PAC-9002', 'Médico_principal': ['recOTRO'] } }] });
      if (u.includes(encodeURIComponent('CC-PAC-DEMO01'))) return ok({ records: [{ id: 'recDEMO', fields: { 'Código de paciente': 'CC-PAC-DEMO01', 'Es demo': true } }] });
      return ok({ records: [{ id: 'recPAC', fields: { 'Código de paciente': 'CC-PAC-9001', 'Médico_principal': [REC_MED] } }] });
    }
    if (m !== 'GET') return ok({ id: 'recX', records: [{ id: 'recX' }] });
    return ok({ records: [] });
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

async function dictar(body, sesion = { tipo: 'medico', codigo: 'CCMED-TEST01' }) {
  delete require.cache[require.resolve('../api/nova.js')];
  const handler = require('../api/nova.js');
  const res = fakeRes();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(sesion ? { authorization: `Bearer ${generarToken({ horas: 1, ...sesion })}` } : {}) },
    body: { action: 'medico_dictado', pacienteCode: 'CC-PAC-9001', texto: DICTADO, ...body },
  }, res);
  return res;
}

test('medico_dictado: flujo completo — verifica, descarta lo inventado y NO escribe nada en Airtable', async () => {
  const { cap, restaurar } = instalar({ modelo: { campos: [
    { campo: 'motivo_consulta', valor: 'Dolor abdominal', cita: 'dolor abdominal cólico desde ayer, sin fiebre' },
    { campo: 'diagnostico', valor: 'K59.1', cita: 'K59.1' },
    { campo: 'antecedentes_heredofamiliares', valor: 'Madre: DM2', cita: 'Madre con diabetes' },
  ], sin_ubicar: [] } });
  try {
    const res = await dictar({ metodo: 'voz' });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.campos.motivo_consulta, 'dolor abdominal cólico desde ayer, sin fiebre');
    assert.strictEqual(res.body.campos.antecedentes_heredofamiliares, 'Madre con diabetes');
    assert.strictEqual(res.body.campos.diagnostico, undefined);
    assert.strictEqual(res.body.descartados.length, 1);
    assert.strictEqual(res.body.transcripcion, DICTADO);
    assert.strictEqual(res.body.metodo, 'voz');
    assert.deepStrictEqual(cap.escrituras, [], 'el motor de dictado no debe guardar nada');
  } finally { restaurar(); }
});

test('medico_dictado: sin sesión 401; Revisor 403; paciente ajeno o demo → rechazado sin llamar al modelo', async () => {
  for (const [desc, opts, body, sesion, status] of [
    ['sin sesión', {}, {}, null, 401],
    ['Revisor', { tipoAcceso: 'Revisor' }, {}, undefined, 403],
    ['ajeno', {}, { pacienteCode: 'CC-PAC-9002' }, undefined, 403],
    ['demo', {}, { pacienteCode: 'CC-PAC-DEMO01' }, undefined, 403],
  ]) {
    const { cap, restaurar } = instalar(opts);
    try {
      const res = await dictar(body, sesion === undefined ? { tipo: 'medico', codigo: 'CCMED-TEST01' } : sesion);
      assert.strictEqual(res.statusCode, status, `${desc}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(cap.anthropic, 0, `${desc}: llamó al modelo`);
    } finally { restaurar(); }
  }
});

test('medico_dictado: si el modelo falla → 502 que dice que el texto no se perdió', async () => {
  const { restaurar } = instalar({ modeloFalla: true });
  try {
    const res = await dictar({});
    assert.strictEqual(res.statusCode, 502);
    assert.match(res.body.error, /no se perdió/);
  } finally { restaurar(); }
});

test('medico_dictado: texto vacío o demasiado largo → 400', async () => {
  const { restaurar } = instalar();
  try {
    assert.strictEqual((await dictar({ texto: '   ' })).statusCode, 400);
    assert.strictEqual((await dictar({ texto: 'x'.repeat(8001) })).statusCode, 400);
  } finally { restaurar(); }
});

// ── Números en palabras y encabezados dictados ────────────────────────

const { numerosEnPalabras, normalizarDictado } = require('../api/nova.js');

test('dictado: números en palabras se convierten de forma determinista (0–999 y decimales con "punto")', () => {
  const casos = {
    'ciento veinte ochenta': [120, 80], 'noventa y dos': [92], 'treinta y siete punto dos': [37.2],
    'setenta y dos punto cinco': [72.5], 'ciento sesenta y cinco': [165], 'veintidos': [22],
    'dieciocho': [18], 'ciento uno': [101], 'cien': [100], 'doscientos treinta': [230],
  };
  for (const [t, esperado] of Object.entries(casos)) assert.deepStrictEqual(numerosEnPalabras(normalizarDictado(t)), esperado, t);
});

test('dictado: signos dichos en palabras se aceptan si coinciden y se descartan si NOVA cambió el número', () => {
  const t = 'Presión ciento veinte, ochenta. Frecuencia cardíaca noventa y dos. Temperatura treinta y siete punto dos.';
  const r = procesarDictado(t, [
    { campo: 'presion', valor: '120/80', cita: 'Presión ciento veinte, ochenta' },
    { campo: 'frecuencia_cardiaca', valor: 90, cita: 'Frecuencia cardíaca noventa y dos' },
    { campo: 'temperatura', valor: 37.2, cita: 'Temperatura treinta y siete punto dos' },
  ]);
  assert.deepStrictEqual(r.campos, { presion: '120/80', temperatura: 37.2 });
  assert.strictEqual(r.descartados[0].campo, 'frecuencia_cardiaca');
});

test('dictado: se quita solo el encabezado dicho del propio campo ("Diagnóstico: …")', () => {
  const t = 'Diagnóstico: gastroenteritis probable. Plan: hidratación. Motivo: el plan es bajar de peso.';
  const r = procesarDictado(t, [
    { campo: 'diagnostico', valor: '', cita: 'Diagnóstico: gastroenteritis probable' },
    { campo: 'plan_terapeutico', valor: '', cita: 'Plan: hidratación' },
    { campo: 'motivo_consulta', valor: '', cita: 'Motivo: el plan es bajar de peso' },
  ]);
  assert.strictEqual(r.campos.diagnostico, 'gastroenteritis probable');
  assert.strictEqual(r.campos.plan_terapeutico, 'hidratación');
  assert.strictEqual(r.campos.motivo_consulta, 'el plan es bajar de peso');
});
