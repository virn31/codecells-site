// Decidido por Víctor 2026-10-05: resolver los duplicados "de manera
// inteligente, por coincidencia numérica, fecha y nombre".
//   - Alta por dictado: coincidencia por nombre / teléfono / fecha de
//     nacimiento antes de crear. De un paciente ajeno no se revela nada.
//     "Es este" pasa por autorizarPaciente con escritura.
//   - Dictado de series de labs: enlace EXACTO al catálogo (así grafica) e
//     idempotencia por fecha + analito + valor (ya estaba / conflicto).
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
const falla = (status = 429) => ({ ok: false, status, json: async () => ({}), text: async () => 'x' });

function fakeRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
}

// Pacientes del mundo de prueba: uno propio, uno de otro médico.
const PROPIO = { id: 'recPROPIO0000001', fields: { 'Código de paciente': 'CC-PAC-9001', 'Nombre completo': 'María Fernanda López Ruiz', 'Teléfono WhatsApp': '+52 667 111 2233', 'Fecha de nacimiento': '1990-05-10', 'Médico_principal': [REC_MED] } };
const AJENO = { id: 'recAJENO00000001', fields: { 'Código de paciente': 'CC-PAC-9002', 'Nombre completo': 'José Ramón Castro Peña', 'Teléfono WhatsApp': '6679998877', 'Fecha de nacimiento': '1985-01-01', 'Médico_principal': ['recOTRO000000001'] } };

function instalar({ anthropic, catalogo = [], previos = [], pacientesFalla = false }) {
  const original = global.fetch;
  const cap = { posts: [], patches: [], lotes: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const m = opts.method || 'GET';
    if (m === 'POST' && opts.body) cap.posts.push({ u, body: JSON.parse(opts.body) });
    if (m === 'PATCH' && opts.body) cap.patches.push({ u, body: JSON.parse(opts.body) });
    if (u.startsWith('https://api.anthropic.com/')) return ok(anthropic());
    if (u.includes('USO_NOVA')) return ok(m === 'GET' ? { records: [] } : { id: 'recUSO' });
    if (u.includes(`/${MEDICOS}`)) return ok({ records: [{ id: REC_MED, fields: { 'Código de médico': 'CCMED-TEST01', 'Nombre completo': 'Dr. Prueba', 'Tipo de acceso': 'Clinico' } }] });
    if (u.includes(CATALOGO)) return ok({ records: catalogo });
    if (u.includes(LAB_VALORES)) return m === 'GET' ? ok({ records: previos }) : ok({ records: [{ id: 'recLV' }] });
    if (u.includes(LABS)) return m === 'POST' ? ok({ id: 'recLAB00000000001' }) : ok({ deleted: true });
    if (u.includes(`/${PACIENTES}`)) {
      if (m === 'POST') return ok({ records: [{ id: 'recNUEVO00000001' }] });
      if (m === 'PATCH') return ok({ id: 'recX' });
      if (u.includes(`/${PACIENTES}/recPROPIO0000001`)) return ok(PROPIO);
      if (u.includes('filterByFormula')) {
        if (u.includes(encodeURIComponent('CC-PAC-9001'))) return ok({ records: [PROPIO] });
        if (u.includes(encodeURIComponent('CC-PAC-9002'))) return ok({ records: [AJENO] });
        return ok({ records: [] });
      }
      if (pacientesFalla) return falla();
      return ok({ records: [PROPIO, AJENO] }); // listado completo para el anti-duplicado
    }
    if (m !== 'GET') return ok({ id: 'recX', records: [{ id: 'recX' }] });
    return ok({ records: [] });
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

async function chat(body) {
  delete require.cache[require.resolve('../api/nova.js')];
  const handler = require('../api/nova.js');
  const res = fakeRes();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${generarToken({ tipo: 'medico', codigo: 'CCMED-TEST01', horas: 1 })}` },
    body: { messages: [{ role: 'user', content: 'Dictado' }], ...body },
  }, res);
  return { res, texto: (res.body.content || []).map((b) => b.text).join(' ') };
}

const alta = (input) => () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'crear_paciente_dictado', input: { mensaje: 'Alta.', ...input } }] });
const creoPaciente = (cap) => cap.posts.some((p) => p.u.includes(`/${PACIENTES}`));

// ── Alta por dictado ──────────────────────────────────────────────────

test('alta: mismo nombre que un paciente PROPIO (otro orden, sin acentos) → pregunta con su código, no crea', async () => {
  const { cap, restaurar } = instalar({ anthropic: alta({ nombre_completo: 'Lopez Ruiz Maria Fernanda' }) });
  try {
    const { texto } = await chat({});
    assert.match(texto, /CC-PAC-9001/);
    assert.match(texto, /coincide: nombre/);
    assert.ok(!creoPaciente(cap));
  } finally { restaurar(); }
});

test('alta: coincidencia con un paciente AJENO → se avisa sin revelar su código ni su nombre', async () => {
  const { cap, restaurar } = instalar({ anthropic: alta({ nombre_completo: 'José Ramón Castro Peña' }) });
  try {
    const { texto } = await chat({});
    assert.ok(!texto.includes('CC-PAC-9002'), 'reveló el código de un paciente ajeno');
    assert.match(texto, /En la red hay una persona/);
    assert.match(texto, /llave/);
    assert.ok(!creoPaciente(cap));
  } finally { restaurar(); }
});

test('alta: el mismo teléfono (otro formato) cuenta como coincidencia aunque el nombre sea distinto', async () => {
  const { cap, restaurar } = instalar({ anthropic: alta({ nombre_completo: 'Fernanda Ruiz', telefono_whatsapp: '667-111-2233' }) });
  try {
    const { texto } = await chat({});
    assert.match(texto, /CC-PAC-9001/);
    assert.match(texto, /teléfono/);
    assert.ok(!creoPaciente(cap));
  } finally { restaurar(); }
});

test('alta: solo la fecha de nacimiento NO basta para frenar el alta', async () => {
  const { cap, restaurar } = instalar({ anthropic: alta({ nombre_completo: 'Pedro Infante Cruz', fecha_nacimiento: '1990-05-10' }) });
  try {
    await chat({});
    assert.ok(creoPaciente(cap));
  } finally { restaurar(); }
});

test('alta: confirmar_nuevo crea aunque haya coincidencias (homónimo confirmado por el médico)', async () => {
  const { cap, restaurar } = instalar({ anthropic: alta({ nombre_completo: 'María Fernanda López Ruiz', confirmar_nuevo: true }) });
  try {
    const { texto } = await chat({});
    assert.ok(creoPaciente(cap));
    assert.match(texto, /Paciente registrado/);
  } finally { restaurar(); }
});

test('alta: si no se puede verificar duplicados, NO se crea (502)', async () => {
  const { cap, restaurar } = instalar({ anthropic: alta({ nombre_completo: 'Paciente Nuevo' }), pacientesFalla: true });
  try {
    const { res } = await chat({});
    assert.strictEqual(res.statusCode, 502);
    assert.ok(!creoPaciente(cap));
  } finally { restaurar(); }
});

test('alta: "es este" (codigo_paciente_existente PROPIO) agrega al expediente, no crea otro', async () => {
  const { cap, restaurar } = instalar({ anthropic: alta({ nombre_completo: 'María Fernanda López Ruiz', codigo_paciente_existente: 'CC-PAC-9001', peso_kg: 70, motivo_consulta: 'Control' }) });
  try {
    const { texto } = await chat({});
    assert.ok(!creoPaciente(cap));
    assert.ok(cap.patches.some((p) => p.u.includes('recPROPIO0000001') && p.body.fields['Peso actual (kg)'] === 70));
    assert.match(texto, /Agregado al expediente existente/);
  } finally { restaurar(); }
});

test('alta: "es este" con un paciente AJENO → rechazado, no se escribe nada', async () => {
  const { cap, restaurar } = instalar({ anthropic: alta({ nombre_completo: 'José Ramón Castro Peña', codigo_paciente_existente: 'CC-PAC-9002', peso_kg: 80 }) });
  try {
    const { texto } = await chat({});
    assert.match(texto, /No tienes acceso de escritura a CC-PAC-9002/);
    assert.strictEqual(cap.patches.filter((p) => p.u.includes(PACIENTES)).length, 0);
    assert.ok(!creoPaciente(cap));
  } finally { restaurar(); }
});

// ── Dictado de series de labs ─────────────────────────────────────────

const CATALOGO_PRUEBA = [
  { id: 'recGLU0000000001', fields: { fldc0AaVggOqucQl9: 'glucosa', fldrdbPLhWvCQEpGO: 'Glucosa en ayuno', fld2n3Kl3XLoCfQ9t: 'Glucemia;Glucosa sérica', fldmc8qdW3xGEqyfA: true } },
  { id: 'recALT0000000001', fields: { fldc0AaVggOqucQl9: 'alt', fldrdbPLhWvCQEpGO: 'ALT', fld2n3Kl3XLoCfQ9t: 'TGP', fldmc8qdW3xGEqyfA: true } },
];
const series = (lista) => () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'guardar_series_historicas_laboratorio', input: { mensaje: 'Guardo.', series: lista } }] });
const valoresEscritos = (cap) => cap.posts.filter((p) => p.u.includes(LAB_VALORES)).flatMap((p) => p.body.records.map((r) => r.fields));

test('series: nombre exacto del catálogo (sin acentos/mayúsculas) → Parametro + Confianza Alta; alias → Media', async () => {
  const { cap, restaurar } = instalar({ catalogo: CATALOGO_PRUEBA, anthropic: series([{ fecha: '2026-01-15', analitos: [{ nombre: 'GLUCOSA EN AYÚNO', valor: '95' }, { nombre: 'TGP', valor: '30' }] }]) });
  try {
    await chat({ pacienteCode: 'CC-PAC-9001' });
    const v = valoresEscritos(cap);
    const glu = v.find((f) => f.Analito === 'GLUCOSA EN AYÚNO');
    assert.deepStrictEqual(glu.Parametro, ['recGLU0000000001']);
    assert.strictEqual(glu.Confianza, 'Alta');
    assert.strictEqual(glu.Analito, 'GLUCOSA EN AYÚNO', 'el Analito literal nunca se reescribe');
    const tgp = v.find((f) => f.Analito === 'TGP');
    assert.strictEqual(tgp.Confianza, 'Media');
  } finally { restaurar(); }
});

test('series: sin match EXACTO no se enlaza (nada de substring: "Altura" no es ALT)', async () => {
  const { cap, restaurar } = instalar({ catalogo: CATALOGO_PRUEBA, anthropic: series([{ fecha: '2026-01-15', analitos: [{ nombre: 'Altura de fondo uterino', valor: '28' }, { nombre: 'Glucosa postprandial', valor: '140' }] }]) });
  try {
    const { texto } = await chat({ pacienteCode: 'CC-PAC-9001' });
    for (const f of valoresEscritos(cap)) assert.strictEqual(f.Parametro, undefined, `${f.Analito} se enlazó`);
    assert.match(texto, /Sin parámetro en el catálogo.*Altura de fondo uterino/);
  } finally { restaurar(); }
});

const previo = (fecha, analito, valor, param) => ({ id: `recP${analito}`, fields: { Analito: analito, 'Fecha del estudio': fecha, Valor: valor, 'Valor numérico': Number(valor), ...(param ? { Parametro: [param] } : {}) } });

test('series: redictar la misma fecha con el mismo valor → "ya estaba", sin cabecera ni duplicado', async () => {
  const { cap, restaurar } = instalar({ catalogo: CATALOGO_PRUEBA, previos: [previo('2026-01-15', 'Glucosa en ayuno', '95', 'recGLU0000000001')], anthropic: series([{ fecha: '2026-01-15', analitos: [{ nombre: 'Glucemia', valor: '95.0' }] }]) });
  try {
    const { texto } = await chat({ pacienteCode: 'CC-PAC-9001' });
    assert.strictEqual(valoresEscritos(cap).length, 0);
    assert.ok(!cap.posts.some((p) => p.u.includes(LABS) && !p.u.includes(LAB_VALORES)), 'creó cabecera sin nada nuevo');
    assert.match(texto, /Ya estaba registrado, no se duplicó: 2026-01-15/);
  } finally { restaurar(); }
});

test('series: misma fecha y analito con OTRO valor → conflicto, no se sobrescribe ni se duplica', async () => {
  const { cap, restaurar } = instalar({ catalogo: CATALOGO_PRUEBA, previos: [previo('2026-01-15', 'Glucosa en ayuno', '95', 'recGLU0000000001')], anthropic: series([{ fecha: '2026-01-15', analitos: [{ nombre: 'Glucosa en ayuno', valor: '120' }, { nombre: 'ALT', valor: '30' }] }]) });
  try {
    const { texto } = await chat({ pacienteCode: 'CC-PAC-9001' });
    const v = valoresEscritos(cap);
    assert.deepStrictEqual(v.map((f) => f.Analito), ['ALT']);
    assert.match(texto, /Conflicto.*2026-01-15 \(Glucosa en ayuno\)/);
  } finally { restaurar(); }
});

test('series: si no se puede leer el historial previo, no se escribe nada (502)', async () => {
  const { cap, restaurar } = instalar({ catalogo: CATALOGO_PRUEBA, anthropic: series([{ fecha: '2026-01-15', analitos: [{ nombre: 'ALT', valor: '30' }] }]) });
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => (String(url).includes(LAB_VALORES) && (opts.method || 'GET') === 'GET' ? falla() : original(url, opts));
  try {
    const { res } = await chat({ pacienteCode: 'CC-PAC-9001' });
    assert.strictEqual(res.statusCode, 502);
    assert.ok(!cap.posts.some((p) => p.u.includes(LABS)));
  } finally { global.fetch = original; restaurar(); }
});
