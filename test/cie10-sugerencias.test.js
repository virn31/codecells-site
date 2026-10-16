// Sugerencia CIE-10 (lib/cie10.js + nova.js medico_sugerir_cie10): NOVA
// propone, el servidor verifica contra el catálogo, el médico elige.
// Y la escritura automática vieja (nova-asistente-clinico sugerir_cie10)
// queda retirada.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const { categoriaCie10, procesarSugerenciasCie10, diagnosticoConCodigos } = require('../lib/cie10');

const MEDICOS = 'tbl87DsuBMmb4DjFM';
const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
function fakeRes() {
  return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
}
function fresco(ruta) { delete require.cache[require.resolve(ruta)]; return require(ruta); }

test('cie10: el código se normaliza a la categoría de 3 caracteres', () => {
  assert.strictEqual(categoriaCie10('i20.8'), 'I20');
  assert.strictEqual(categoriaCie10(' E11 '), 'E11');
  assert.strictEqual(categoriaCie10('E119'), 'E11');
  assert.strictEqual(categoriaCie10('angina'), null);
  assert.strictEqual(categoriaCie10('I2'), null);
});

test('cie10: solo códigos del catálogo, con la descripción OFICIAL (no la del modelo)', () => {
  const r = procesarSugerenciasCie10('Angina estable probable. DM2 descontrolada.', [
    { frase: 'Angina estable probable', codigos: ['K94.1', 'ANGINA', 'I20.8', 'I25.9'] },
    { frase: 'DM2 descontrolada', codigos: ['e11.9', 'ZZ9'] },
  ]);
  assert.deepStrictEqual(r.grupos[0].candidatos.map((c) => c.codigo), ['I20.8', 'I25.9']);
  assert.strictEqual(r.grupos[0].candidatos[0].descripcion, 'Otras formas especificadas de angina de pecho');
  assert.strictEqual(r.grupos[1].candidatos[0].codigo, 'E11.9');
  assert.strictEqual(r.grupos[1].candidatos[0].descripcion, 'Diabetes mellitus no insulinodependiente, sin mención de complicación');
  assert.ok(r.descartados.some((d) => d.codigo === 'K94.1' && /catálogo/.test(d.motivo)), JSON.stringify(r.descartados));
  assert.ok(r.descartados.some((d) => /formato/.test(d.motivo)));
});

test('cie10: una subcategoría inexistente se ofrece como su categoría (nunca un código inventado)', () => {
  const r = procesarSugerenciasCie10('Hipertensión arterial', [{ frase: 'Hipertensión arterial', codigos: ['I10.5'] }]);
  assert.deepStrictEqual(r.grupos[0].candidatos, [{ codigo: 'I10', descripcion: 'Hipertensión esencial (primaria)' }]);
  assert.match(r.descartados[0].motivo, /I10\.5 no existe en el catálogo; se ofrece la categoría I10/);
});

test('cie10: el catálogo trae subcategorías verificadas contra el PDF (incluidas las de lista común)', () => {
  const cat = new Map(require('../lib/cie10-catalogo').map((e) => [e.codigo, e.descripcion]));
  assert.strictEqual(cat.get('I20.1'), 'Angina de pecho con espasmo documentado');
  assert.strictEqual(cat.get('A00.1'), 'Cólera debido a Vibrio cholerae O1, biotipo El Tor');
  assert.strictEqual(cat.get('E11.2'), 'Diabetes mellitus no insulinodependiente, con complicaciones renales');
  assert.strictEqual(cat.get('O14.1'), 'Preeclampsia severa');
  assert.strictEqual(cat.get('C14'), 'Tumor maligno de otros sitios y de los mal definidos del labio, de la cavidad bucal y de la faringe');
  assert.ok(![...cat.keys()].some((c) => /^[VWXY]/.test(c)), 'capítulos V–Y deben seguir excluidos');
  assert.ok(![...cat.values()].some((d) => /[,\-]$/.test(d)), 'hay descripciones truncadas');
});

test('cie10: un diagnóstico que el médico NO escribió se descarta (no se deduce)', () => {
  const r = procesarSugerenciasCie10('Gonartrosis derecha', [
    { frase: 'Gonartrosis derecha', codigos: ['M17'] },
    { frase: 'Obesidad', codigos: ['E66'] },
  ]);
  assert.deepStrictEqual(r.grupos.map((g) => g.frase), ['Gonartrosis derecha']);
  assert.match(r.descartados[0].motivo, /no está en tu diagnóstico/);
});

test('cie10: máximo 3 candidatos por diagnóstico y sin repetidos', () => {
  const r = procesarSugerenciasCie10('Lumbalgia', [{ frase: 'Lumbalgia', codigos: ['M54', 'M54.5', 'M51', 'M47', 'M48'] }]);
  assert.deepStrictEqual(r.grupos[0].candidatos.map((c) => c.codigo), ['M54', 'M54.5', 'M51']);
});

test('cie10: el diagnóstico final conserva la frase del médico junto al código', () => {
  assert.strictEqual(
    diagnosticoConCodigos([{ codigo: 'I20', descripcion: 'Angina de pecho', frase: 'angina estable probable' }, { codigo: 'E11', descripcion: 'Diabetes mellitus no insulinodependiente', frase: 'DM2' }]),
    'I20 — Angina de pecho (angina estable probable); E11 — Diabetes mellitus no insulinodependiente (DM2)'
  );
});

function instalar(anthropic) {
  const original = global.fetch;
  const cap = { anthropic: [], escrituras: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = opts.method || 'GET';
    if (u.startsWith('https://api.anthropic.com/')) { const b = JSON.parse(opts.body); cap.anthropic.push(b); return ok(anthropic(b)); }
    if (metodo !== 'GET' && u.includes('api.airtable.com')) cap.escrituras.push(u);
    if (u.includes(`/${MEDICOS}`)) return ok({ records: [{ id: 'recMED', fields: { 'Código de médico': 'CCMED-TEST01', 'Tipo de acceso': 'Clinico' } }] });
    return ok({ records: [] });
  };
  return { cap, restaurar: () => { global.fetch = original; } };
}

async function nova(body, sesion) {
  const handler = fresco('../api/nova.js');
  const res = fakeRes();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json', ...(sesion ? { authorization: `Bearer ${generarToken({ horas: 1, ...sesion })}` } : {}) }, body }, res);
  return res;
}

test('medico_sugerir_cie10: sin sesión médica → 401 y no llama al modelo', async () => {
  const { cap, restaurar } = instalar(() => ({}));
  try {
    const res = await nova({ action: 'medico_sugerir_cie10', texto: 'Angina' });
    assert.strictEqual(res.statusCode, 401);
    const res2 = await nova({ action: 'medico_sugerir_cie10', texto: 'Angina' }, { tipo: 'paciente', codigo: 'CC-PAC-9001' });
    assert.strictEqual(res2.statusCode, 401);
    assert.strictEqual(cap.anthropic.length, 0);
  } finally { restaurar(); }
});

test('medico_sugerir_cie10: devuelve candidatos verificados y no escribe nada en Airtable', async () => {
  const { cap, restaurar } = instalar(() => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'proponer_cie10', input: { diagnosticos: [{ frase: 'angina estable probable', codigos: ['I20', 'X00'] }] } }] }));
  try {
    const res = await nova({ action: 'medico_sugerir_cie10', texto: 'Diagnóstico angina estable probable', pacienteCode: 'CC-PAC-9001' }, { tipo: 'medico', codigo: 'CCMED-TEST01' });
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.grupos[0].candidatos, [{ codigo: 'I20', descripcion: 'Angina de pecho' }]);
    assert.strictEqual(cap.anthropic[0].tool_choice.name, 'proponer_cie10');
    assert.ok(!cap.anthropic[0].messages[0].content.includes('CC-PAC'), 'el código del paciente no va al modelo');
    assert.strictEqual(cap.escrituras.length, 0);
  } finally { restaurar(); }
});

test('nova-asistente-clinico sugerir_cie10: retirada (410), ya no escribe en consultas', async () => {
  const { cap, restaurar } = instalar(() => ({ content: [{ type: 'text', text: 'I20 — Angina' }] }));
  try {
    const handler = fresco('../api/nova-asistente-clinico.js');
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: `Bearer ${generarToken({ horas: 1, tipo: 'medico', codigo: 'CCMED-TEST01' })}` }, body: { accion: 'sugerir_cie10', consultaRecordId: 'recAJENA', motivo: 'dolor' } }, res);
    assert.strictEqual(res.statusCode, 410);
    assert.strictEqual(cap.escrituras.length, 0);
    assert.strictEqual(cap.anthropic.length, 0);
  } finally { restaurar(); }
});
