// Tope discreto del chat con NOVA (decidido por Víctor 2026-10-05):
// paciente/VIP 20 mensajes al día, médico 40 (con expediente abierto nunca
// cuenta), cierre cordial sin contadores, ventana corta al modelo, cierre
// suave en conversaciones largas del paciente. El contador que falla no
// bloquea. Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const usoNova = require('../lib/usoNova');

const PACIENTES = 'tblyUcCfueFLJuvIv';
const MEDICOS = 'tbl87DsuBMmb4DjFM';
const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

function fakeRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
}

// usados: mensajes ya contados hoy (null = sin fila); usoFalla: el contador
// responde 429.
function instalar({ usados = null, usoFalla = false } = {}) {
  const original = global.fetch;
  const cap = { anthropic: [], uso: [], pacientesPatch: [], usoLeido: false };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    if (u.startsWith('https://api.anthropic.com/')) {
      const body = JSON.parse(opts.body);
      cap.anthropic.push(body);
      if (body.tool_choice && body.tool_choice.type === 'tool') {
        return ok({ content: [{ type: 'tool_use', name: body.tool_choice.name, input: { reply: 'Respuesta.' } }] });
      }
      return ok({ content: [{ type: 'text', text: 'Respuesta.' }] });
    }
    if (u.includes('USO_NOVA')) {
      if (usoFalla) return { ok: false, status: 429, json: async () => ({}) };
      if (metodo === 'GET') {
        cap.usoLeido = true;
        return ok({ records: usados === null ? [] : [{ id: 'recUSO', fields: { Mensajes: usados } }] });
      }
      cap.uso.push({ metodo, u, body: JSON.parse(opts.body) });
      return ok({ id: 'recUSO' });
    }
    if (u.includes(`/${PACIENTES}`)) {
      if (metodo !== 'GET') { cap.pacientesPatch.push(JSON.parse(opts.body)); return ok({ id: 'recPAC' }); }
      return ok({ records: [{ id: 'recPAC', fields: { 'Código de paciente': 'CC-PAC-9001', 'Nombre completo': 'Ana', 'Respuesta médico pendiente': '[2026-10-04] Tome con alimentos' } }] });
    }
    if (u.includes(`/${MEDICOS}`)) {
      if (metodo !== 'GET') return ok({ id: 'recMED' });
      return ok({ records: [{ id: 'recMED', fields: { 'Código de médico': 'CCMED-TEST01', 'Nombre completo': 'Dr. Prueba', 'Tipo de acceso': 'Clinico' } }] });
    }
    if (metodo !== 'GET') return ok({ id: 'recX', records: [{ id: 'recX' }] });
    return ok({ records: [] });
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

async function chat(sesion, extra = {}, n = 1) {
  delete require.cache[require.resolve('../api/nova.js')];
  const handler = require('../api/nova.js');
  const messages = [];
  for (let i = 0; i < n; i++) {
    messages.push({ role: 'user', content: `Pregunta ${i + 1}` });
    if (i < n - 1) messages.push({ role: 'assistant', content: `Respuesta ${i + 1}` });
  }
  const res = fakeRes();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${generarToken({ horas: 1, ...sesion })}` },
    body: { messages, ...extra },
  }, res);
  return res;
}

const PACIENTE = { tipo: 'paciente', codigo: 'CC-PAC-9001' };
const MEDICO = { tipo: 'medico', codigo: 'CCMED-TEST01' };
const texto = (res) => (res.body.content || []).map((b) => b.text).join(' ');

// ── lib ───────────────────────────────────────────────────────────────

test('recortarHistorial: deja los últimos n y siempre empieza con un mensaje del usuario', () => {
  const m = [];
  for (let i = 0; i < 10; i++) m.push({ role: i % 2 ? 'assistant' : 'user', content: String(i) });
  usoNova.recortarHistorial(m, 5);
  assert.strictEqual(m[0].role, 'user');
  assert.ok(m.length <= 5);
  assert.strictEqual(m.at(-1).content, '9');
});

test('fechaCuliacan: el día se cuenta en hora de Culiacán (UTC-7), no en UTC', () => {
  assert.strictEqual(usoNova.fechaCuliacan(new Date('2026-10-06T05:00:00Z')), '2026-10-05');
  assert.strictEqual(usoNova.fechaCuliacan(new Date('2026-10-06T08:00:00Z')), '2026-10-06');
});

// ── Paciente ──────────────────────────────────────────────────────────

test('paciente en el tope (20): cierre cordial, sin llamar al modelo y SIN borrar la respuesta pendiente del médico', async () => {
  const { cap, restaurar } = instalar({ usados: 20 });
  try {
    const res = await chat(PACIENTE);
    assert.strictEqual(res.statusCode, 200);
    assert.match(texto(res), /Mañana seguimos/);
    assert.ok(!/\d+\s*(de|\/)\s*20/.test(texto(res)), 'no debe mostrar contadores');
    assert.strictEqual(cap.anthropic.length, 0);
    assert.strictEqual(cap.pacientesPatch.length, 0, 'borró la respuesta pendiente del médico sin mostrarla');
  } finally { restaurar(); }
});

test('paciente en el tope con idioma EN: el cierre llega en inglés', async () => {
  const { restaurar } = instalar({ usados: 20 });
  try {
    const res = await chat(PACIENTE, { idioma: 'en' });
    assert.match(texto(res), /tomorrow/);
  } finally { restaurar(); }
});

test('paciente debajo del tope: se cuenta el mensaje (+1) y responde normal', async () => {
  const { cap, restaurar } = instalar({ usados: 5 });
  try {
    const res = await chat(PACIENTE);
    assert.strictEqual(texto(res), 'Respuesta.');
    assert.strictEqual(cap.uso[0].metodo, 'PATCH');
    assert.strictEqual(cap.uso[0].body.fields.Mensajes, 6);
  } finally { restaurar(); }
});

test('paciente, primer mensaje del día: crea la fila del día', async () => {
  const { cap, restaurar } = instalar({ usados: null });
  try {
    await chat(PACIENTE);
    assert.strictEqual(cap.uso[0].metodo, 'POST');
    assert.strictEqual(cap.uso[0].body.fields.Clave, `CC-PAC-9001|${usoNova.fechaCuliacan()}`);
    assert.strictEqual(cap.uso[0].body.fields.Mensajes, 1);
  } finally { restaurar(); }
});

test('paciente: al modelo solo le llega la ventana corta (12), y con 10+ mensajes se pide cerrar con naturalidad', async () => {
  const { cap, restaurar } = instalar({ usados: 1 });
  try {
    await chat(PACIENTE, {}, 15); // 29 mensajes en el historial
    const body = cap.anthropic[0];
    assert.ok(body.messages.length <= usoNova.VENTANA.paciente, `llegaron ${body.messages.length}`);
    assert.strictEqual(body.messages[0].role, 'user');
    assert.match(body.system, /CONVERSACIÓN LARGA/);
  } finally { restaurar(); }
});

test('paciente con conversación corta: sin instrucción de cierre', async () => {
  const { cap, restaurar } = instalar({ usados: 1 });
  try {
    await chat(PACIENTE, {}, 3);
    assert.ok(!/CONVERSACIÓN LARGA/.test(cap.anthropic[0].system));
  } finally { restaurar(); }
});

test('si el contador falla, NO se bloquea al paciente', async () => {
  const { cap, restaurar } = instalar({ usoFalla: true });
  try {
    const res = await chat(PACIENTE);
    assert.strictEqual(texto(res), 'Respuesta.');
    assert.strictEqual(cap.anthropic.length, 1);
  } finally { restaurar(); }
});

// ── Médico ────────────────────────────────────────────────────────────

test('médico SIN expediente abierto en el tope (40): cierre breve, sin llamar al modelo', async () => {
  const { cap, restaurar } = instalar({ usados: 40 });
  try {
    const res = await chat(MEDICO);
    assert.match(texto(res), /se reactiva mañana/);
    assert.strictEqual(cap.anthropic.length, 0);
  } finally { restaurar(); }
});

test('médico CON expediente abierto: nunca cuenta ni se bloquea, aunque esté en el tope', async () => {
  const { cap, restaurar } = instalar({ usados: 40 });
  try {
    const res = await chat(MEDICO, { pacienteCode: 'CC-PAC-9001' });
    assert.strictEqual(texto(res), 'Respuesta.');
    assert.strictEqual(cap.usoLeido, false);
    assert.strictEqual(cap.uso.length, 0);
  } finally { restaurar(); }
});

test('médico: historial de más de 100 mensajes ya no da 400; al modelo llega la ventana (20)', async () => {
  const { cap, restaurar } = instalar({ usados: 1 });
  try {
    const res = await chat(MEDICO, { pacienteCode: 'CC-PAC-9001' }, 60); // 119 mensajes
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(cap.anthropic[0].messages.length <= usoNova.VENTANA.medico);
  } finally { restaurar(); }
});

test('demo: sin tope diario (se usa en presentaciones)', async () => {
  const { cap, restaurar } = instalar({ usados: 999 });
  try {
    await chat({ tipo: 'demo', codigo: 'CC-PAC-DEMO01' });
    assert.strictEqual(cap.usoLeido, false);
    assert.strictEqual(cap.anthropic.length, 1);
  } finally { restaurar(); }
});
