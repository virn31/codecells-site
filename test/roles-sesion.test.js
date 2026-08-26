// Cobertura de los dos hallazgos críticos de la auditoría de roles
// (2026-08-26): modo paciente/VIP del chat principal sin verificación de
// sesión, y generar_codigos_adicionales/revisar_avisos_fundador confiando
// en un nombre de texto en vez de sesión real. Corre con: node --test
//
// Deliberado: nada de navegador ni de UI. Se llama al handler exportado de
// api/nova.js con req/res falsos, tokens de sesión REALES (generados con
// lib/auth.js, mismo SESSION_SECRET de prueba) y un mock de fetch que
// enruta por tabla/verbo — mismo patrón que el resto de la suite.

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.NODE_ENV = 'development'; // pasa el guard de origen CORS de nova.js

const test = require('node:test');
const assert = require('node:assert');

const { generarToken } = require('../lib/auth');

const BASE_ID = 'app6jyD9pDlTLpknA';
const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const TBL_CODIGOS = 'tblypndhtcurFwue6';

const COD_PAC = 'CC-PAC-9001';
const COD_PAC_AJENO = 'CC-PAC-9002';
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

function requerirNovaFresco() {
  delete require.cache[require.resolve('../api/nova.js')];
  return require('../api/nova.js');
}

// CONGELADO gatea generar_codigos_adicionales ANTES que la verificación de
// sesión (mismo orden que el resto del archivo: el freeze legal es el
// primer corte, siempre). Para aislar y probar el gate de sesión por sí
// solo, se mockea CONGELADO=false — el valor real (true) se prueba aparte.
function mockCongeladoFalse() {
  const rutaReal = require.resolve('../lib/congelamientoDatosPersonales');
  const original = require.cache[rutaReal];
  const mockExports = {
    CONGELADO: false,
    MENSAJE_CONGELAMIENTO: 'mock: no debería verse en estas pruebas',
    respuestaCongelada(res) { return res.status(503).json({ ok: false, error: 'mock congelado' }); },
  };
  require.cache[rutaReal] = { id: rutaReal, filename: rutaReal, loaded: true, exports: mockExports };
  return () => {
    if (original) require.cache[rutaReal] = original;
    else delete require.cache[rutaReal];
  };
}

// Mock de fetch: enruta por tabla/verbo. Captura si se consultó PACIENTES
// (evidencia de que esPac se activó) y qué se mandó a Anthropic (para leer
// qué `tools` se adjuntaron — la señal real de qué modo se resolvió).
function instalarFetchMock({ capturas }) {
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });

    if (u.startsWith('https://api.anthropic.com/')) {
      const sentBody = JSON.parse(opts.body);
      capturas.anthropicBody = sentBody;
      // En modo paciente/VIP, nova.js fuerza tool_choice a respuesta_nova_paciente
      // — Anthropic real respondería con un bloque tool_use, no texto plano.
      if (sentBody.tool_choice && sentBody.tool_choice.type === 'tool') {
        return ok({ content: [{ type: 'tool_use', name: sentBody.tool_choice.name, input: { reply: 'Respuesta de prueba.' } }] });
      }
      return ok({ content: [{ type: 'text', text: 'Respuesta de prueba.' }] });
    }
    if (u.includes(`/${TBL_PACIENTES}?filterByFormula=`)) {
      capturas.pacientesConsultado = true;
      capturas.pacientesUrl = u;
      if (u.includes(encodeURIComponent(COD_PAC)) && !u.includes(encodeURIComponent(COD_PAC_AJENO))) {
        return ok({ records: [{ id: REC_PAC, fields: { 'Código de paciente': COD_PAC, 'Nombre completo': 'Paciente de prueba', 'Es VIP (DEZAWA)': false } }] });
      }
      return ok({ records: [] });
    }
    if (u.includes(`/${TBL_MEDICOS}?filterByFormula=`)) {
      return ok({ records: [] });
    }
    if (metodo === 'POST' && u.includes(`/${TBL_CODIGOS}`)) {
      capturas.codigosCreadosBody = JSON.parse(opts.body);
      return ok({ records: (JSON.parse(opts.body).records || []).map((_, i) => ({ id: `recCOD${i}` })) });
    }
    if (metodo === 'GET' && u.includes(`/${TBL_CODIGOS}?filterByFormula=`)) {
      return ok({ records: [] });
    }
    throw new Error(`fetch no mockeado en esta prueba: ${metodo} ${u}`);
  };
  return () => { global.fetch = original; };
}

// ─── Hallazgo 1: modo paciente/VIP del chat principal ──────────────────

test('chat NOVA: pacienteCode real en el body SIN sesión → NO se consulta PACIENTES, NO se adjunta la herramienta de paciente', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { pacienteCode: COD_PAC, messages: [{ role: 'user', content: 'Hola' }] },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(capturas.pacientesConsultado, undefined, 'sin sesión, nunca debe consultarse el expediente del paciente');
    assert.ok(capturas.anthropicBody, 'debió llamar a Anthropic (modo público)');
    const nombresHerramientas = (capturas.anthropicBody.tools || []).map(t => t.name);
    assert.ok(!nombresHerramientas.includes('respuesta_nova_paciente'), 'no debe adjuntarse la herramienta de paciente sin sesión real');
  } finally { restaurar(); }
});

test('chat NOVA: pacienteCode real + sesión de paciente real y coincidente → SÍ se consulta PACIENTES y se adjunta la herramienta de paciente', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'paciente', codigo: COD_PAC });
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { pacienteCode: COD_PAC, messages: [{ role: 'user', content: 'Hola' }] },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(capturas.pacientesConsultado, true);
    const nombresHerramientas = (capturas.anthropicBody.tools || []).map(t => t.name);
    assert.ok(nombresHerramientas.includes('respuesta_nova_paciente'), 'con sesión real debe adjuntarse la herramienta de paciente');
  } finally { restaurar(); }
});

test('chat NOVA: sesión de paciente real, pero el body pide el expediente de OTRO paciente → se usa el código de la SESIÓN, nunca el del body', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'paciente', codigo: COD_PAC }); // sesión real: COD_PAC
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { pacienteCode: COD_PAC_AJENO, messages: [{ role: 'user', content: 'Hola' }] }, // body pide otro
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.ok(capturas.pacientesConsultado, 'debió consultar PACIENTES');
    assert.ok(capturas.pacientesUrl.includes(encodeURIComponent(COD_PAC)), 'la consulta debe usar el código de la sesión');
    assert.ok(!capturas.pacientesUrl.includes(encodeURIComponent(COD_PAC_AJENO)), 'nunca debe consultarse con el código ajeno del body');
  } finally { restaurar(); }
});

test('chat NOVA: vipCode con formato válido pero SIN sesión → no entra a modo VIP (ni demo)', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { vipCode: 'DZW-12345678', messages: [{ role: 'user', content: 'Hola' }] },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(capturas.anthropicBody, 'debió responder (cae a público)');
    assert.ok(!capturas.anthropicBody.system.includes('MODO: PACIENTE'), 'sin sesión no debe entrar al guion de paciente/VIP');
  } finally { restaurar(); }
});

test('chat NOVA: sesión VIP real (tipo vip) → entra al modo demo/tour, pero sigue sin herramientas ni datos reales (mapeo DZW pendiente, documentado)', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'vip', codigo: 'DZW-12345678' });
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { vipCode: 'DZW-12345678', messages: [{ role: 'user', content: 'Hola' }] },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(capturas.anthropicBody.system.includes('MODO: PACIENTE'), 'con sesión VIP real sí debe entrar al guion de paciente/VIP');
    const nombresHerramientas = (capturas.anthropicBody.tools || []).map(t => t.name);
    assert.ok(!nombresHerramientas.includes('respuesta_nova_paciente'), 'el modo VIP por sesión sigue sin herramientas reales — mapeo DZW→CC-PAC pendiente');
    assert.strictEqual(capturas.pacientesConsultado, undefined, 'no debe tocar PACIENTES — no hay mapeo implementado todavía');
  } finally { restaurar(); }
});

// ─── Hallazgo 2: generar_codigos_adicionales / revisar_avisos_fundador ──

test('generar_codigos_adicionales: sin sesión → 401, cero códigos creados', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'generar_codigos_adicionales', fundador: 'Dr. Víctor Iván Rodríguez Nava' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 401, JSON.stringify(res.body));
    assert.strictEqual(capturas.codigosCreadosBody, undefined);
  } finally { restaurar(); restaurarCongelado(); }
});

test('generar_codigos_adicionales: sesión de médico real pero NO fundador → 401, cero códigos creados', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'medico', codigo: 'CCMED-OTRO01' }); // médico real, no fundador
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { action: 'generar_codigos_adicionales', fundador: 'Dr. Víctor Iván Rodríguez Nava' }, // nombre falso en el body, ya no importa
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 401, JSON.stringify(res.body));
    assert.strictEqual(capturas.codigosCreadosBody, undefined, 'el nombre en el body ya no debe bastar para generar códigos');
  } finally { restaurar(); restaurarCongelado(); }
});

test('generar_codigos_adicionales: sesión real de fundador → 200, 10 códigos creados, atribuidos por el código de sesión (no por el body)', async () => {
  const restaurarCongelado = mockCongeladoFalse();
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'medico', codigo: 'CCMED-VIRN01' });
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { action: 'generar_codigos_adicionales', fundador: 'un nombre inventado que ya no se usa' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.cantidad, 10);
    assert.strictEqual(capturas.codigosCreadosBody.records.length, 10);
    assert.ok(capturas.codigosCreadosBody.records[0].fields.Notes.includes('Dr. Víctor Iván Rodríguez Nava'), 'la atribución debe salir de la sesión, no del body');
  } finally { restaurar(); restaurarCongelado(); }
});

test('generar_codigos_adicionales: sesión real de fundador pero CONGELADO=true (mock) → bloqueado, cero códigos creados', async () => {
  const rutaReal = require.resolve('../lib/congelamientoDatosPersonales');
  const original = require.cache[rutaReal];
  require.cache[rutaReal] = {
    id: rutaReal, filename: rutaReal, loaded: true,
    exports: { CONGELADO: true, MENSAJE_CONGELAMIENTO: 'mock', respuestaCongelada(res) { return res.status(503).json({ ok: false, error: 'mock congelado' }); } },
  };
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'medico', codigo: 'CCMED-VIRN01' });
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { action: 'generar_codigos_adicionales' },
    };
    const res = fakeRes();
    await novaHandler(req, res);

    assert.strictEqual(res.statusCode, 503, JSON.stringify(res.body));
    assert.strictEqual(capturas.codigosCreadosBody, undefined);
  } finally {
    restaurar();
    if (original) require.cache[rutaReal] = original; else delete require.cache[rutaReal];
  }
});

test('revisar_avisos_fundador: sin sesión → 401', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { action: 'revisar_avisos_fundador', fundador: 'Dr. Víctor Iván Rodríguez Nava' },
    };
    const res = fakeRes();
    await novaHandler(req, res);
    assert.strictEqual(res.statusCode, 401, JSON.stringify(res.body));
  } finally { restaurar(); }
});

test('revisar_avisos_fundador: sesión real de fundador → 200', async () => {
  const capturas = {};
  const restaurar = instalarFetchMock({ capturas });
  try {
    const novaHandler = requerirNovaFresco();
    const token = generarToken({ tipo: 'medico', codigo: 'CCMED-JCG01' });
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { action: 'revisar_avisos_fundador' },
    };
    const res = fakeRes();
    await novaHandler(req, res);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  } finally { restaurar(); }
});

test('estático: code-cells-network/index.html ya no declara ni usa FOUNDER_CODES/founderActivo como código vivo', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'code-cells-network', 'index.html'), 'utf8');
  // Se permite mencionar el nombre viejo en un comentario histórico — lo que
  // no debe existir es una declaración o uso real de la variable/objeto.
  assert.ok(!/const\s+FOUNDER_CODES/.test(codigo), 'los códigos de fundador ya no deben vivir en el HTML público');
  assert.ok(!/(let|const)\s+founderActivo|founderActivo\s*=|founderActivo\s*[.)\]]/.test(codigo), 'el mecanismo de reconocimiento por texto debe estar retirado del código, no solo mencionado en un comentario');
});
