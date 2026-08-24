// Red de seguridad permanente para CLAUDE.md §7 ("cero contenido fabricado
// en el expediente clínico"): cuatro transformaciones de datos que antes
// rellenaban con un valor plausible cuando NOVA no tenía el dato real.
// Corre con: node --test
//
// Deliberado: nada de navegador ni de UI. Se llama a las funciones puras
// directamente, y para el pipeline de OCR se invoca el handler de
// api/nova.js pasando un `extraido` ya construido (mock del fetch a
// Anthropic) — nunca un archivo real ni una pantalla. El resultado se
// verifica leyendo el cuerpo que se habría mandado a Airtable (mock de
// fetch), no leyendo texto en pantalla.

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.NODE_ENV = 'development'; // pasa el guard de origen CORS de nova.js

const test = require('node:test');
const assert = require('node:assert');

const { generarToken } = require('../lib/auth');
const { notaEdadSinFecha } = require('../lib/datosPacienteNuevo');

const BASE_ID = 'app6jyD9pDlTLpknA';
const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const TBL_LABS = 'tblhKp4uE1NdXXqLh';
const TBL_LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';
const TBL_ACCESOS = 'tblSpORAqLKxYOI6W';

const REC_PAC = 'recPAC0000000001';
const REC_MED = 'recMED0000000001';
const COD_PAC = 'CC-PAC-9001';
const COD_MED = 'CCMED-TEST01';

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

// Mock de fetch compartido por los tests de endpoint — enruta por tabla y
// verbo, nunca por coincidencia parcial de URL sin verificar el resto.
// `extraido` controla lo que "leyó" el OCR (el mock de Anthropic); `capturas`
// recibe los cuerpos reales que el código habría mandado a Airtable, que es
// donde se verifica el resultado — nunca en una pantalla.
function instalarFetchMock({ extraido, capturas }) {
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

    if (u.startsWith('https://api.anthropic.com/')) {
      return ok({ content: [{ type: 'text', text: JSON.stringify(extraido) }] });
    }
    if (u.includes('content.airtable.com')) {
      return ok({}); // subida de adjunto, fire-and-forget
    }
    if (u.includes(`/${TBL_PACIENTES}?filterByFormula=`)) {
      // Dos llamadas distintas comparten esta forma de URL: autorizarPaciente()
      // busca EXACTAMENTE COD_PAC (debe encontrarlo); generarCodigoUnico()
      // pregunta si un candidato nuevo (CC-PAC-000001...) ya existe (nunca,
      // en este mock — así el primer candidato siempre se acepta).
      if (u.includes(encodeURIComponent(COD_PAC))) {
        return ok({ records: [{ id: REC_PAC, fields: { 'Código de paciente': COD_PAC, 'Médico_principal': [REC_MED] } }] });
      }
      return ok({ records: [] });
    }
    if (u.includes(`/${TBL_PACIENTES}?fields%5B%5D=`) || u.includes(`/${TBL_PACIENTES}?fields[]=`)) {
      return ok({ records: [] }); // generarCodigoUnico: sin pacientes previos, primer candidato libre
    }
    if (u.includes(`/${TBL_PACIENTES}/${REC_PAC}`)) {
      return ok({ id: REC_PAC, fields: { 'Código de paciente': COD_PAC, 'Patologías activas': [] } });
    }
    if (u.includes(`/${TBL_MEDICOS}?filterByFormula=`)) {
      return ok({ records: [{ id: REC_MED, fields: { 'Código de médico': COD_MED } }] });
    }
    if (metodo === 'POST' && u.includes(`/${TBL_LABS}`)) {
      capturas.labsBody = JSON.parse(opts.body);
      return ok({ id: 'recLABTEST00000001' });
    }
    if (metodo === 'POST' && u.includes(`/${TBL_LAB_VALORES}`)) {
      capturas.labValoresBody = JSON.parse(opts.body);
      return ok({ records: [] });
    }
    if (metodo === 'POST' && u.includes(`/${TBL_PACIENTES}`)) {
      capturas.pacienteCreadoBody = JSON.parse(opts.body);
      return ok({ records: [{ id: 'recNUEVO000000001' }] });
    }
    if (u.includes(`/${TBL_ACCESOS}`)) {
      return ok({ records: [{ id: 'recACC0000000001' }] });
    }
    throw new Error(`fetch no mockeado en esta prueba: ${metodo} ${u}`);
  };
  return () => { global.fetch = original; };
}

function requerirNovaFresco() {
  delete require.cache[require.resolve('../api/nova.js')];
  return require('../api/nova.js');
}

// ─── Caso 1 — fecha de estudio ausente ─────────────────────────────

test('medico_subir_estudio: OCR sin fecha_estudio → "Fecha de resultados" queda AUSENTE en Airtable, nunca la fecha de hoy', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({
    capturas,
    extraido: {
      tipo_estudio: 'Laboratorio', fecha_estudio: null, panel_sugerido: 'Personalizado',
      analitos: [{ nombre: 'Glucosa', valor: '95', unidad: 'mg/dL', rango_texto: '70-100', bandera: 'normal', critico: false, relevante: false }],
    },
  });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'medico', codigo: COD_MED });
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { action: 'medico_subir_estudio', pacienteCode: COD_PAC, fileBase64: 'ZmFrZQ==', fileName: 'estudio.jpg', mediaType: 'image/jpeg' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, `esperaba 200, dio ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.fechaConfirmada, false, 'la respuesta debe avisar que la fecha no se confirmó');
    assert.ok(capturas.labsBody, 'debió escribir un registro en NOVA LABS');
    assert.ok(!('Fecha de resultados' in capturas.labsBody.fields), 'NOVA LABS no debe llevar "Fecha de resultados" cuando el OCR no la extrajo');
    assert.ok(capturas.labValoresBody, 'debió escribir LAB_VALORES (sí hay analitos)');
    for (const registro of capturas.labValoresBody.records) {
      assert.ok(!('Fecha del estudio' in registro.fields), 'LAB_VALORES no debe llevar "Fecha del estudio" cuando el OCR no la extrajo');
    }
  } finally { restaurar(); }
});

test('medico_subir_estudio: OCR CON fecha_estudio válida → si se escribe en Airtable, es la fecha real, nunca la de hoy', async () => {
  const capturas = {};
  const FECHA_REAL = '2024-03-15'; // deliberadamente distinta de "hoy" para que un fallback a new Date() se note
  const restaurar = instalarFetchMock({
    capturas,
    extraido: { tipo_estudio: 'Laboratorio', fecha_estudio: FECHA_REAL, panel_sugerido: 'Personalizado', analitos: [] },
  });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'medico', codigo: COD_MED });
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { action: 'medico_subir_estudio', pacienteCode: COD_PAC, fileBase64: 'ZmFrZQ==', fileName: 'estudio.jpg', mediaType: 'image/jpeg' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.fechaConfirmada, true);
    assert.strictEqual(capturas.labsBody.fields['Fecha de resultados'], FECHA_REAL);
  } finally { restaurar(); }
});

// ─── Caso 2 — ningún analito leído vs. ninguno fuera de rango ──────

test('medico_subir_estudio: OCR sin analitos → mensaje explícito de "no se pudo leer", NUNCA "sin valores fuera de rango"', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({
    capturas,
    extraido: { tipo_estudio: 'Otro estudio', fecha_estudio: '2026-08-01', panel_sugerido: 'Personalizado', analitos: [] },
  });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'medico', codigo: COD_MED });
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { action: 'medico_subir_estudio', pacienteCode: COD_PAC, fileBase64: 'ZmFrZQ==', fileName: 'estudio.jpg', mediaType: 'image/jpeg' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    const texto = capturas.labsBody.fields['Valores fuera de rango'];
    assert.match(texto, /no se detectaron valores de laboratorio/i, `debe decir explícitamente que no se leyó nada, dijo: "${texto}"`);
    assert.doesNotMatch(texto, /^Sin valores fuera de rango detectados\.$/, 'no debe reusar el mensaje de "todo salió normal" cuando en realidad no se leyó nada');
  } finally { restaurar(); }
});

test('medico_subir_estudio: OCR CON analitos y ninguno fuera de rango → conserva el mensaje "Sin valores fuera de rango detectados."', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({
    capturas,
    extraido: {
      tipo_estudio: 'Laboratorio', fecha_estudio: '2026-08-01', panel_sugerido: 'Panel básico',
      analitos: [{ nombre: 'Glucosa', valor: '90', unidad: 'mg/dL', rango_texto: '70-100', bandera: 'normal', critico: false, relevante: false }],
    },
  });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'medico', codigo: COD_MED });
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { action: 'medico_subir_estudio', pacienteCode: COD_PAC, fileBase64: 'ZmFrZQ==', fileName: 'estudio.jpg', mediaType: 'image/jpeg' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(capturas.labsBody.fields['Valores fuera de rango'], 'Sin valores fuera de rango detectados.');
  } finally { restaurar(); }
});

// ─── Caso 3 — solo edad, sin fecha de nacimiento ───────────────────
// 'Edad' en PACIENTES es un campo fórmula sobre 'Fecha de nacimiento' — no
// es escribible (ver lib/datosPacienteNuevo.js). Por eso la edad dictada se
// conserva como nota, nunca como una fecha de nacimiento fabricada.

test('notaEdadSinFecha: con edad → texto que incluye el número, nunca algo con forma de fecha', () => {
  const nota = notaEdadSinFecha(45);
  assert.strictEqual(typeof nota, 'string');
  assert.match(nota, /45/);
  assert.doesNotMatch(nota, /^\d{4}-\d{2}-\d{2}$/);
});

test('notaEdadSinFecha: sin edad (undefined, null, 0) → null, no hay nada que anotar', () => {
  assert.strictEqual(notaEdadSinFecha(undefined), null);
  assert.strictEqual(notaEdadSinFecha(null), null);
  assert.strictEqual(notaEdadSinFecha(0), null);
});

test('kiosco_crear_paciente: solo edad dictada → "Fecha de nacimiento" AUSENTE en Airtable, la edad queda en Notas generales', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas, extraido: {} });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'kiosco_crear_paciente', staffCodigo: COD_MED, nombreCompleto: 'ZZ Prueba Unitaria', edad: 52 },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, `esperaba 200, dio ${res.statusCode}: ${JSON.stringify(res.body)}`);
    const fields = capturas.pacienteCreadoBody.records[0].fields;
    assert.ok(!('Fecha de nacimiento' in fields), 'no debe fabricarse una Fecha de nacimiento a partir de la edad');
    assert.match(fields['Notas generales'] || '', /52/, 'la edad dictada debe quedar registrada como texto en algún lugar del expediente');
  } finally { restaurar(); }
});

// ─── Caso 4 — dictado sin diagnóstico: CIE-10 nunca inferido ───────
// rellenar_ficha_consulta no transforma su resultado en el servidor (el
// campo "diagnostico" que dicta el médico se manda tal cual al formulario
// del portal) — lo que puede reintroducir la fabricación es el texto que le
// autoriza al modelo a inferir. Este test es el contrato permanente sobre
// ese texto: si alguien vuelve a redactarlo con lenguaje que autorice
// inferir un código CIE-10 no dictado, esto falla.

test('buildHerramientaFichaConsulta: la descripción de "diagnostico" prohíbe inferir CIE-10, no lo autoriza', () => {
  const nova = requerirNovaFresco();
  assert.strictEqual(typeof nova.buildHerramientaFichaConsulta, 'function', 'nova.js debe exponer buildHerramientaFichaConsulta para poder probar esto sin pasar por todo el chat');

  const herramienta = nova.buildHerramientaFichaConsulta();
  const desc = herramienta.input_schema.properties.diagnostico.description;

  assert.doesNotMatch(desc, /inferir/i, 'no debe autorizar inferir un código CIE-10 no dictado');
  assert.doesNotMatch(desc, /confianza razonable/i, 'no debe quedar la vieja frase que autorizaba inferir "con confianza razonable"');
  assert.match(desc, /nunca inventes|no lo agregues|sin código/i, 'debe prohibir explícitamente completar un código que el médico no dijo');
});
