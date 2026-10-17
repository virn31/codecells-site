// SPEC de dictado — Fase 3: Telegram usa el mismo motor que el portal
// (lib/dictado.js). "Entendí:" campo por campo, "sí" guarda con origen
// Telegram, "cancelar" descarta, lo demás se agrega y se re-estructura.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.TELEGRAM_WEBHOOK_SECRET = 'secreto-de-prueba-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');

const PACIENTES = 'tblyUcCfueFLJuvIv';
const MEDICOS = 'tbl87DsuBMmb4DjFM';
const PENDIENTES = 'tbl7J1G8slqB8r0xu';
const CONSULTAS = 'tbl1Xp2IGxdV178Ky';
const HISTORIA = 'tblm2xUADazitHisR';
const DEDUPE = 'tblehEMlnMhPNVEBq';
const REC_MED = 'recMED0000000001';
const CHAT = 778;

const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const falla = (status = 422) => ({ ok: false, status, json: async () => ({ error: 'X' }), text: async () => 'x' });

const DICTADO = 'dolor de cabeza desde ayer. Presión 130 sobre 85. Su madre tiene migraña.';
const toolDictado = () => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', name: 'estructurar_dictado', input: {
    campos: [
      { campo: 'motivo_consulta', valor: 'x', cita: 'dolor de cabeza desde ayer' },
      { campo: 'presion', valor: '130/85', cita: 'Presión 130 sobre 85' },
      { campo: 'antecedentes_heredofamiliares', valor: 'x', cita: 'Su madre tiene migraña' },
      { campo: 'alergias', valor: 'Niega', cita: 'niega alergias' },
    ],
    sin_ubicar: [],
  } }],
});

function pendienteV2({ horas = 0, codigo = 'CC-PAC-9001', transcripcion = DICTADO } = {}) {
  return {
    id: 'recPEND',
    fields: {
      'Chat ID': String(CHAT),
      'Paciente': ['recPAC9001'],
      'Código de paciente': codigo,
      'Fecha': new Date(Date.now() - horas * 3600 * 1000).toISOString(),
      'Ficha JSON': JSON.stringify({
        v: 2,
        transcripcion,
        resultado: {
          campos: { motivo_consulta: 'dolor de cabeza desde ayer', presion: '130/85', antecedentes_heredofamiliares: 'Su madre tiene migraña' },
          detalle: [
            { campo: 'motivo_consulta', etiqueta: 'Motivo de consulta', valor: 'dolor de cabeza desde ayer', cita: 'dolor de cabeza desde ayer' },
            { campo: 'presion', etiqueta: 'Presión arterial', valor: '130/85', cita: 'Presión 130 sobre 85' },
            { campo: 'antecedentes_heredofamiliares', etiqueta: 'Antecedentes heredofamiliares', valor: 'Su madre tiene migraña', cita: 'Su madre tiene migraña' },
          ],
          descartados: [], sinUbicar: [], faltantes: [], receta: null,
        },
      }),
    },
  };
}

function fresco(ruta) { delete require.cache[require.resolve(ruta)]; return require(ruta); }
function fakeRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
}

// pendiente: registro de PENDIENTES (o null); reglas(u, metodo) sobrescribe.
const DICTADO_DX = 'dolor torácico al esfuerzo. Diagnóstico angina estable probable.';
const toolDictadoConDx = () => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', name: 'estructurar_dictado', input: {
    campos: [
      { campo: 'motivo_consulta', valor: 'x', cita: 'dolor torácico al esfuerzo' },
      { campo: 'diagnostico', valor: 'x', cita: 'angina estable probable' },
    ],
    sin_ubicar: [],
  } }],
});
const toolCie10 = () => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', name: 'proponer_cie10', input: { diagnosticos: [{ frase: 'angina estable probable', codigos: ['I20', 'I25', 'K94'] }] } }],
});

async function webhook(message, { pendiente = null, reglas = () => null, historia = null, dictadoTool = toolDictado } = {}) {
  const original = global.fetch;
  const cap = { posts: [], telegram: [], llamadas: [], anthropic: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    cap.llamadas.push(`${metodo} ${u}`);
    if (metodo !== 'GET' && opts.body) { try { cap.posts.push({ u, metodo, body: JSON.parse(opts.body) }); } catch { cap.posts.push({ u, metodo }); } }
    const especial = reglas(u, metodo);
    if (especial) return especial;
    if (u.includes('api.telegram.org')) { cap.telegram.push(JSON.parse(opts.body).text); return ok({ ok: true, result: { message_id: 1 } }); }
    if (u.startsWith('https://api.anthropic.com/')) {
      const b = JSON.parse(opts.body);
      cap.anthropic.push(b);
      return ok(b.tool_choice && b.tool_choice.name === 'proponer_cie10' ? toolCie10() : dictadoTool());
    }
    if (u.includes(DEDUPE)) return ok(metodo === 'GET' ? { records: [] } : { id: 'recD' });
    if (u.includes(PENDIENTES)) return ok(metodo === 'GET' ? { records: pendiente ? [pendiente] : [] } : { id: 'recPEND' });
    if (u.includes(`/${MEDICOS}`)) {
      if (metodo !== 'GET') return ok({ id: REC_MED });
      return ok({ id: REC_MED, records: [{ id: REC_MED, fields: { 'Código de médico': 'CCMED-TEST01', 'Nombre completo': 'Dr. Prueba', 'Tipo de acceso': 'Clinico', 'Telegram Chat ID': String(CHAT) } }], fields: { 'Código de médico': 'CCMED-TEST01' } });
    }
    if (u.includes(`/${PACIENTES}`)) {
      if (metodo !== 'GET') return ok({ id: 'recPAC9001' });
      return ok({ id: 'recPAC9001', records: [{ id: 'recPAC9001', fields: { 'Código de paciente': 'CC-PAC-9001', 'Nombre completo': 'Ana', 'Médico_principal': [REC_MED] } }], fields: { 'Código de paciente': 'CC-PAC-9001', 'Nombre completo': 'Ana' } });
    }
    if (u.includes(HISTORIA) && metodo === 'GET') return ok({ records: historia ? [historia] : [] });
    if (u.includes(CONSULTAS) && metodo === 'POST') return ok({ records: [{ id: 'recCONS' }] });
    if (metodo !== 'GET') return ok({ id: 'recX', records: [{ id: 'recX' }] });
    return ok({ records: [] });
  };
  try {
    const handler = fresco('../api/telegram-bot.js');
    const res = fakeRes();
    await handler({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'secreto-de-prueba-no-es-real' },
      body: { update_id: Date.now() + Math.random(), message: { chat: { id: CHAT }, ...message } },
    }, res);
    return cap;
  } finally { global.fetch = original; }
}

const postsA = (cap, tabla, metodo) => cap.posts.filter((p) => p.u.includes(tabla) && (!metodo || p.metodo === metodo));

test('Telegram dictado: usa el motor compartido y responde "Entendí" campo por campo; nada inventado', async () => {
  const cap = await webhook({ text: `CC-PAC-9001 ${DICTADO}` });
  assert.strictEqual(cap.anthropic.length, 1);
  assert.match(cap.anthropic[0].messages[0].content, /dolor de cabeza desde ayer/);
  assert.ok(!cap.anthropic[0].messages[0].content.includes('CC-PAC-9001'), 'el código del paciente no va al modelo');
  const final = cap.telegram.at(-1);
  assert.match(final, /Entendí para Ana \(CC-PAC-9001\)/);
  assert.match(final, /Presión arterial:.*130\/85.*Presión 130 sobre 85/);
  assert.match(final, /Descartado/); // "niega alergias" no se dijo
  assert.ok(!postsA(cap, CONSULTAS).length, 'guardó la consulta sin "sí"');
  const pend = postsA(cap, PENDIENTES).at(-1);
  const ficha = JSON.parse(pend.body.fields['Ficha JSON']);
  assert.strictEqual(ficha.v, 2);
  assert.strictEqual(ficha.transcripcion, DICTADO);
  assert.strictEqual(ficha.resultado.campos.alergias, undefined);
});

test('Telegram dictado: "sí" guarda la consulta con origen Telegram, transcripción y detalle; retira el pendiente ANTES', async () => {
  const cap = await webhook({ text: 'sí' }, { pendiente: pendienteV2() });
  const cons = postsA(cap, CONSULTAS, 'POST');
  assert.strictEqual(cons.length, 1);
  const f = cons[0].body.records[0].fields;
  assert.strictEqual(f['Origen del registro'], 'Dictado NOVA — Telegram');
  assert.strictEqual(f['Método'], 'Texto');
  assert.strictEqual(f['Transcripción dictada'], DICTADO);
  assert.match(f['Detalle del dictado'], /Presión arterial: colocado por NOVA desde «Presión 130 sobre 85»/);
  assert.strictEqual(f['Presión arterial en consulta'], '130/85');
  assert.strictEqual(f['Código de médico ref'], 'CCMED-TEST01');
  const iPend = cap.llamadas.findIndex((l) => l.startsWith('PATCH') && l.includes(`${PENDIENTES}/recPEND`));
  const iCons = cap.llamadas.findIndex((l) => l.startsWith('POST') && l.includes(CONSULTAS));
  assert.ok(iPend >= 0 && iPend < iCons, 'el pendiente debe retirarse antes de crear la consulta');
  const limpio = postsA(cap, `${PENDIENTES}/recPEND`, 'PATCH')[0].body.fields;
  assert.strictEqual(limpio['Código de paciente'], '');
  assert.match(cap.telegram.at(-1), /Consulta guardada en el expediente de Ana/);
});

test('Telegram dictado: si la consulta no se crea, se dice y el pendiente se repone', async () => {
  const reglas = (u, m) => (u.includes(CONSULTAS) && m === 'POST' ? falla(422) : null);
  const cap = await webhook({ text: 'sí' }, { pendiente: pendienteV2(), reglas });
  assert.match(cap.telegram.at(-1), /No se guardó la consulta.*sigue pendiente/s);
  const repuesto = postsA(cap, PENDIENTES).filter((p) => p.body && p.body.fields && p.body.fields['Ficha JSON']);
  assert.ok(repuesto.length, 'no repuso el pendiente');
  assert.ok(!/✅/.test(cap.telegram.join(' ')));
});

test('Telegram dictado: los antecedentes se AGREGAN a la Historia Clínica, no la reemplazan', async () => {
  const historia = { id: 'recHIST', fields: { 'Código de paciente ref': 'CC-PAC-9001', 'AHF — Heredo-familiares': 'Padre con DM2' } };
  const cap = await webhook({ text: 'sí' }, { pendiente: pendienteV2(), historia });
  const patch = postsA(cap, `${HISTORIA}/recHIST`, 'PATCH')[0];
  assert.strictEqual(patch.body.fields['AHF — Heredo-familiares'], 'Padre con DM2\nSu madre tiene migraña');
});

test('Telegram dictado: si la Historia Clínica falla, la consulta se guarda y se dice qué faltó', async () => {
  const reglas = (u, m) => (u.includes(HISTORIA) && m !== 'GET' ? falla(429) : null);
  const cap = await webhook({ text: 'sí' }, { pendiente: pendienteV2(), reglas });
  assert.match(cap.telegram.at(-1), /Consulta guardada[\s\S]*NO se guardó: antecedentes en Historia Clínica/);
});

test('Telegram dictado: un "sí" a un dictado vencido no guarda nada', async () => {
  const cap = await webhook({ text: 'sí' }, { pendiente: pendienteV2({ horas: 13 }) });
  assert.ok(!postsA(cap, CONSULTAS).length);
  assert.match(cap.telegram.at(-1), /más de 12 horas/);
});

test('Telegram dictado: un pendiente con el formato anterior no se guarda', async () => {
  const viejo = { id: 'recPEND', fields: { 'Chat ID': String(CHAT), 'Código de paciente': 'CC-PAC-9001', 'Fecha': new Date().toISOString(), 'Ficha JSON': JSON.stringify({ motivo_consulta: 'x' }) } };
  const cap = await webhook({ text: 'sí' }, { pendiente: viejo });
  assert.ok(!postsA(cap, CONSULTAS).length);
  assert.match(cap.telegram.at(-1), /versión anterior/);
});

test('Telegram dictado: "cancelar" descarta sin guardar', async () => {
  const cap = await webhook({ text: 'cancelar' }, { pendiente: pendienteV2() });
  assert.ok(!postsA(cap, CONSULTAS).length);
  assert.strictEqual(postsA(cap, `${PENDIENTES}/recPEND`, 'PATCH')[0].body.fields['Ficha JSON'], '');
  assert.match(cap.telegram.at(-1), /Descartado/);
});

test('Telegram dictado: seguir escribiendo AGREGA al dictado y se re-estructura todo junto', async () => {
  const cap = await webhook({ text: 'temperatura 37.2' }, { pendiente: pendienteV2() });
  assert.strictEqual(cap.anthropic.length, 1);
  assert.match(cap.anthropic[0].messages[0].content, /dolor de cabeza desde ayer[\s\S]*temperatura 37\.2/);
  const ficha = JSON.parse(postsA(cap, PENDIENTES).at(-1).body.fields['Ficha JSON']);
  assert.strictEqual(ficha.transcripcion, `${DICTADO}\ntemperatura 37.2`);
  assert.ok(!postsA(cap, CONSULTAS).length);
});

test('Telegram dictado: un dictado de OTRO paciente descarta el pendiente anterior y lo dice', async () => {
  const cap = await webhook({ text: `CC-PAC-9001 ${DICTADO}` }, { pendiente: pendienteV2({ codigo: 'CC-PAC-9003' }) });
  assert.match(cap.telegram.at(-1), /Descarté el dictado sin confirmar de CC-PAC-9003/);
  assert.strictEqual(JSON.parse(postsA(cap, PENDIENTES).at(-1).body.fields['Ficha JSON']).transcripcion, DICTADO);
});

test('Telegram dictado: "sí" cuando solo se dio el código no llama al modelo ni guarda', async () => {
  const esperando = { id: 'recPEND', fields: { 'Chat ID': String(CHAT), 'Paciente': ['recPAC9001'], 'Código de paciente': 'CC-PAC-9001', 'Fecha': new Date().toISOString(), 'Ficha JSON': '' } };
  const cap = await webhook({ text: 'sí' }, { pendiente: esperando });
  assert.strictEqual(cap.anthropic.length, 0);
  assert.ok(!postsA(cap, CONSULTAS).length);
  assert.match(cap.telegram.at(-1), /Aún no me has dictado nada para CC-PAC-9001/);
});

function pendienteConPaciente(campos) {
  const p = pendienteV2();
  const f = JSON.parse(p.fields['Ficha JSON']);
  Object.assign(f.resultado.campos, campos);
  const etiquetas = { grupo_sanguineo: 'Grupo sanguíneo', escolaridad: 'Escolaridad' };
  for (const [campo, valor] of Object.entries(campos)) f.resultado.detalle.push({ campo, etiqueta: etiquetas[campo], valor, cita: `dictado de ${valor}` });
  p.fields['Ficha JSON'] = JSON.stringify(f);
  return p;
}

test('Telegram dictado: grupo sanguíneo y escolaridad se guardan en PACIENTES si no había grupo', async () => {
  const cap = await webhook({ text: 'sí' }, { pendiente: pendienteConPaciente({ grupo_sanguineo: 'O+', escolaridad: 'Preparatoria' }) });
  const patch = postsA(cap, `${PACIENTES}/recPAC9001`, 'PATCH')[0];
  assert.strictEqual(patch.body.fields['Grupo sanguíneo'], 'O+');
  assert.strictEqual(patch.body.fields['Escolaridad'], 'Preparatoria');
  assert.ok(!/No cambié/.test(cap.telegram.at(-1)));
});

test('Telegram dictado: un grupo sanguíneo distinto al del expediente NO se sobrescribe y se avisa', async () => {
  const reglas = (u, m) => (u.includes(`/${PACIENTES}`) && m === 'GET'
    ? ok({ records: [{ id: 'recPAC9001', fields: { 'Código de paciente': 'CC-PAC-9001', 'Nombre completo': 'Ana', 'Médico_principal': [REC_MED], 'Grupo sanguíneo': 'A+' } }] })
    : null);
  const cap = await webhook({ text: 'sí' }, { pendiente: pendienteConPaciente({ grupo_sanguineo: 'O+' }), reglas });
  const patches = postsA(cap, `${PACIENTES}/recPAC9001`, 'PATCH');
  assert.ok(patches.every((p) => !('Grupo sanguíneo' in p.body.fields)), 'sobrescribió el grupo sanguíneo');
  assert.match(cap.telegram.at(-1), /No cambié el grupo sanguíneo: el expediente dice A\+ y dictaste O\+/);
  const cons = postsA(cap, CONSULTAS, 'POST');
  assert.ok(cons.length === 1, 'la consulta sí debe guardarse');
  assert.match(cons[0].body.records[0].fields['Detalle del dictado'], /NO aplicado, el expediente ya dice A\+/);
});

test('Telegram CIE-10: con diagnóstico dictado, "Entendí" muestra códigos numerados y verificados', async () => {
  const cap = await webhook({ text: `CC-PAC-9001 ${DICTADO_DX}` }, { dictadoTool: toolDictadoConDx });
  assert.strictEqual(cap.anthropic.length, 2);
  assert.strictEqual(cap.anthropic[1].tool_choice.name, 'proponer_cie10');
  assert.match(cap.anthropic[1].messages[0].content, /angina estable probable/);
  const final = cap.telegram.at(-1);
  assert.match(final, /1\) I20 — Angina de pecho \(«angina estable probable»\)/);
  assert.match(final, /2\) I25 — /);
  assert.ok(!/K94/.test(final), 'mostró un código que no está en el catálogo');
  assert.match(final, /sí 1/);
  const ficha = JSON.parse(postsA(cap, PENDIENTES).at(-1).body.fields['Ficha JSON']);
  assert.deepStrictEqual(ficha.resultado.cie10.opciones.map((o) => o.codigo), ['I20', 'I25']);
});

function pendienteConCie10() {
  const p = pendienteV2();
  const f = JSON.parse(p.fields['Ficha JSON']);
  f.resultado.campos.diagnostico = 'angina estable probable';
  f.resultado.detalle.push({ campo: 'diagnostico', etiqueta: 'Diagnóstico', valor: 'angina estable probable', cita: 'angina estable probable' });
  f.resultado.cie10 = { opciones: [
    { n: 1, codigo: 'I20', descripcion: 'Angina de pecho', frase: 'angina estable probable' },
    { n: 2, codigo: 'I25', descripcion: 'Enfermedad isquémica crónica del corazón', frase: 'angina estable probable' },
  ] };
  p.fields['Ficha JSON'] = JSON.stringify(f);
  return p;
}

test('Telegram CIE-10: "sí 1" guarda el diagnóstico con el código elegido y su frase', async () => {
  const cap = await webhook({ text: 'sí 1' }, { pendiente: pendienteConCie10() });
  const f = postsA(cap, CONSULTAS, 'POST')[0].body.records[0].fields;
  assert.strictEqual(f['Diagnóstico (CIE-10)'], 'I20 — Angina de pecho (angina estable probable)');
  assert.match(f['Detalle del dictado'], /elegido por el médico: I20/);
  assert.match(cap.telegram.at(-1), /Diagnóstico: I20 — Angina de pecho/);
});

test('Telegram CIE-10: "sí 1 y 2" guarda los dos códigos', async () => {
  const cap = await webhook({ text: 'sí 1 y 2' }, { pendiente: pendienteConCie10() });
  const f = postsA(cap, CONSULTAS, 'POST')[0].body.records[0].fields;
  assert.match(f['Diagnóstico (CIE-10)'], /^I20 — .*; I25 — /);
});

test('Telegram CIE-10: con dos diagnósticos, "sí 1" codifica uno y NO borra el otro', async () => {
  const p = pendienteV2();
  const f = JSON.parse(p.fields['Ficha JSON']);
  f.resultado.campos.diagnostico = 'angina estable probable. Hipertensión arterial sistémica';
  f.resultado.cie10 = { opciones: [
    { n: 1, codigo: 'I20.8', descripcion: 'Otras formas especificadas de angina de pecho', frase: 'angina estable probable' },
    { n: 2, codigo: 'I10', descripcion: 'Hipertensión esencial (primaria)', frase: 'Hipertensión arterial sistémica' },
  ] };
  p.fields['Ficha JSON'] = JSON.stringify(f);
  const cap = await webhook({ text: 'sí 1' }, { pendiente: p });
  const campos = postsA(cap, CONSULTAS, 'POST')[0].body.records[0].fields;
  assert.strictEqual(campos['Diagnóstico (CIE-10)'], 'I20.8 — Otras formas especificadas de angina de pecho (angina estable probable). Hipertensión arterial sistémica');
});

test('Telegram CIE-10: "sí" a secas guarda el diagnóstico dictado sin código', async () => {
  const cap = await webhook({ text: 'sí' }, { pendiente: pendienteConCie10() });
  const f = postsA(cap, CONSULTAS, 'POST')[0].body.records[0].fields;
  assert.strictEqual(f['Diagnóstico (CIE-10)'], 'angina estable probable');
});

test('Telegram CIE-10: un número que no está en la lista no guarda nada', async () => {
  const cap = await webhook({ text: 'sí 5' }, { pendiente: pendienteConCie10() });
  assert.ok(!postsA(cap, CONSULTAS).length);
  assert.ok(!postsA(cap, `${PENDIENTES}/recPEND`, 'PATCH').length, 'retiró el pendiente');
  assert.match(cap.telegram.at(-1), /No hay opción 5/);
});

test('Telegram: guardar ya no llama a la sugerencia CIE-10 que escribía sola', async () => {
  const cap = await webhook({ text: 'sí' }, { pendiente: pendienteV2() });
  assert.ok(!cap.llamadas.some((l) => l.includes('nova-asistente-clinico')));
});

test('Telegram: una nota de voz recibe instrucciones en vez de silencio', async () => {
  const cap = await webhook({ voice: { file_id: 'x', duration: 3 } });
  assert.match(cap.telegram.at(-1), /notas de voz/);
  assert.ok(!cap.anthropic.length);
});
