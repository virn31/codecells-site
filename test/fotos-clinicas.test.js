// Fotos clínicas (lib/fotosClinicas.js + acciones de api/nova.js): las sube
// el MÉDICO al expediente; las ve todo médico autorizado; solo el autor las
// retira (nunca se borran); el paciente las ve en su app. Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const { validarFoto } = require('../lib/fotosClinicas');

const TBL_PAC = 'tblyUcCfueFLJuvIv', TBL_MED = 'tbl87DsuBMmb4DjFM';
const PAC = 'CC-PAC-200001', DEMO = 'CC-PAC-DEMO01';
const PACIENTES = {
  recPACREAL: { id: 'recPACREAL', fields: { 'Código de paciente': PAC, 'Médico_principal': ['recMEDPROP', 'recMEDOTRO'] } },
  recPACDEMO: { id: 'recPACDEMO', fields: { 'Código de paciente': DEMO, 'Es demo': true, 'Médico_principal': ['recMEDPROP'] } },
};
const MEDICOS = { 'CCMED-PROP01': { id: 'recMEDPROP' }, 'CCMED-OTRO01': { id: 'recMEDOTRO' }, 'CCMED-AJEN01': { id: 'recMEDAJEN' } };
// JPEG mínimo de verdad (firma FF D8) de ~2 KB.
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(2048, 7)]).toString('base64');

test('validarFoto: categoría, firma real del archivo, tamaño y nota', () => {
  assert.strictEqual(validarFoto({ categoria: 'rostro', imagen: 'data:image/jpeg;base64,' + JPEG }).ok, true);
  assert.strictEqual(validarFoto({ categoria: 'rostro', imagen: JPEG }).valor.tipo, 'image/jpeg');
  assert.strictEqual(validarFoto({ categoria: 'selfie', imagen: JPEG }).ok, false);
  // Un "jpeg" que en realidad es texto se rechaza aunque el encabezado diga image/jpeg.
  assert.strictEqual(validarFoto({ categoria: 'piel', imagen: 'data:image/jpeg;base64,' + Buffer.alloc(2048, 65).toString('base64') }).ok, false);
  assert.strictEqual(validarFoto({ categoria: 'piel', imagen: 'data:image/jpeg;base64,/9j/' }).ok, false, 'vacía');
  assert.strictEqual(validarFoto({ categoria: 'piel', imagen: JPEG, nota: 'x'.repeat(301) }).ok, false);
  const grande = Buffer.concat([Buffer.from([0xFF, 0xD8]), Buffer.alloc(3 * 1024 * 1024 + 10)]).toString('base64');
  assert.strictEqual(validarFoto({ categoria: 'piel', imagen: grande }).ok, false);
});

function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }

function mundo({ fallaSubida = false, previas = [] } = {}) {
  const fotos = previas.map(f => ({ ...f, fields: { ...f.fields } }));
  const cap = { posts: [], patches: [], subidas: [] };
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url)); const metodo = opts.method || 'GET';
    const ok = d => ({ ok: true, status: 200, json: async () => d, text: async () => '' });
    if (u.includes('tblSpORAqLKxYOI6W')) return ok({ records: [{ id: 'recACC' }] });
    if (u.includes('tbl9PS3KNBxbRVriV') || u.includes('VINCULACIONES')) return ok({ records: [] });
    if (u.includes(`${TBL_MED}?`)) {
      const c = Object.keys(MEDICOS).find(k => u.includes(`"${k}"`));
      return ok({ records: c ? [{ id: MEDICOS[c].id, fields: { 'Código de médico': c, 'Tipo de acceso': 'Clinico' } }] : [] });
    }
    if (u.includes(`${TBL_PAC}?`)) { const p = Object.values(PACIENTES).find(x => u.includes(`"${x.fields['Código de paciente']}"`)); return ok({ records: p ? [p] : [] }); }
    if (u.includes('content.airtable.com')) {
      cap.subidas.push({ u, body: JSON.parse(opts.body) });
      if (fallaSubida) return { ok: false, status: 422, json: async () => ({}) };
      const id = u.match(/\/(rec[A-Za-z0-9]+)\//)[1]; const f = fotos.find(x => x.id === id);
      f.fields['Imagen'] = [{ url: 'https://v5.airtableusercontent.com/' + id + '.jpg', width: 900, height: 1200, thumbnails: { large: { url: 'https://v5.airtableusercontent.com/' + id + '-l.jpg' } } }];
      return ok({ id });
    }
    if (u.includes('FOTOS_CLINICAS')) {
      if (metodo === 'POST') {
        const f = JSON.parse(opts.body).records[0].fields; cap.posts.push({ ...f });
        const rec = { id: 'recFOT' + String(fotos.length + 1).padStart(11, '0'), fields: f }; fotos.push(rec); return ok({ records: [rec] });
      }
      const id = (u.match(/FOTOS_CLINICAS\/(rec[A-Za-z0-9]+)/) || [])[1];
      if (metodo === 'PATCH') { const f = JSON.parse(opts.body).fields; cap.patches.push({ id, f }); const rec = fotos.find(x => x.id === id); Object.assign(rec.fields, f); return ok(rec); }
      if (id) { const rec = fotos.find(x => x.id === id); return rec ? ok(rec) : { ok: false, status: 404, json: async () => ({}) }; }
      const pac = (u.match(/\{Código de paciente ref\}="([^"]+)"/) || [])[1];
      return ok({ records: fotos.filter(f => f.fields['Código de paciente ref'] === pac && f.fields['Activa']).sort((a, b) => String(b.fields['Fecha']).localeCompare(String(a.fields['Fecha']))) });
    }
    throw new Error(`fetch no mockeado: ${metodo} ${u}`);
  };
  return { cap, fotos, restaurar: () => { global.fetch = original; } };
}

async function nova(sesion, body) {
  const res = fakeRes();
  const headers = { 'content-type': 'application/json' };
  if (sesion) headers.authorization = `Bearer ${generarToken({ horas: 1, ...sesion })}`;
  delete require.cache[require.resolve('../api/nova.js')];
  await require('../api/nova.js')({ method: 'POST', headers, body }, res);
  return res;
}
const PROP = { tipo: 'medico', codigo: 'CCMED-PROP01' }, OTRO = { tipo: 'medico', codigo: 'CCMED-OTRO01' }, AJENO = { tipo: 'medico', codigo: 'CCMED-AJEN01' };
const subirBody = (extra = {}) => ({ action: 'medico_subir_foto', pacienteCode: PAC, categoria: 'rostro', imagen: 'data:image/jpeg;base64,' + JPEG, nota: 'Control a 3 meses', ...extra });

test('subir: el médico tratante sube; la autoría y el paciente los fija el servidor; queda activa solo tras subir la imagen', async () => {
  const w = mundo();
  try {
    const r = await nova(PROP, subirBody({ codigoMedico: 'CCMED-FALSO', 'Código de médico ref': 'CCMED-FALSO' }));
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    const p = w.cap.posts[0];
    assert.strictEqual(p['Código de paciente ref'], PAC); assert.deepStrictEqual(p['Paciente'], ['recPACREAL']);
    assert.strictEqual(p['Código de médico ref'], 'CCMED-PROP01'); assert.deepStrictEqual(p['Subida por'], ['recMEDPROP']);
    assert.strictEqual(p['Activa'], false, 'nace inactiva');
    assert.strictEqual(w.cap.subidas[0].body.file, JPEG); assert.strictEqual(w.cap.subidas[0].body.contentType, 'image/jpeg');
    assert.deepStrictEqual(w.cap.patches.map(x => x.f['Activa']), [true]);
    assert.match(r.body.foto.url, /airtableusercontent/);
  } finally { w.restaurar(); }
});

test('subir: si la imagen no sube, la foto NO queda activa y se informa el fallo', async () => {
  const w = mundo({ fallaSubida: true });
  const err = console.error; console.error = () => {};
  try {
    const r = await nova(PROP, subirBody());
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(w.fotos[0].fields['Activa'], false);
    assert.strictEqual(w.cap.patches.length, 0);
  } finally { console.error = err; w.restaurar(); }
});

test('subir: nunca a un demo ni a un paciente ajeno; sin sesión, 401', async () => {
  const w = mundo();
  try {
    assert.strictEqual((await nova(PROP, subirBody({ pacienteCode: DEMO }))).statusCode, 403);
    assert.ok([403, 404].includes((await nova(AJENO, subirBody())).statusCode));
    assert.strictEqual((await nova(null, subirBody())).statusCode, 401);
    assert.strictEqual(w.cap.posts.length, 0);
  } finally { w.restaurar(); }
});

test('la foto viaja en el cuerpo: medico_subir_foto acepta >50 KB; las demás acciones no', async () => {
  const w = mundo();
  try {
    const grande = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(400 * 1024, 3)]).toString('base64');
    assert.strictEqual((await nova(PROP, subirBody({ imagen: grande }))).statusCode, 200);
    assert.strictEqual((await nova(PROP, { action: 'medico_listar_fotos', pacienteCode: PAC, relleno: 'x'.repeat(60000) })).statusCode, 413);
  } finally { w.restaurar(); }
});

const previas = [
  { id: 'recFOT00000000001', fields: { 'Código de paciente ref': PAC, 'Categoría': 'rostro', 'Fecha': '2026-08-01T10:00:00Z', 'Código de médico ref': 'CCMED-PROP01', 'Activa': true, 'Imagen': [{ url: 'https://x/1.jpg', thumbnails: { large: { url: 'https://x/1l.jpg' } } }] } },
  { id: 'recFOT00000000002', fields: { 'Código de paciente ref': PAC, 'Categoría': 'rostro', 'Fecha': '2026-10-01T10:00:00Z', 'Código de médico ref': 'CCMED-OTRO01', 'Activa': true, 'Imagen': [{ url: 'https://x/2.jpg' }] } },
  { id: 'recFOT00000000003', fields: { 'Código de paciente ref': PAC, 'Categoría': 'piel', 'Fecha': '2026-09-01T10:00:00Z', 'Código de médico ref': 'CCMED-PROP01', 'Activa': false, 'Imagen': [{ url: 'https://x/3.jpg' }] } },
  { id: 'recFOT00000000004', fields: { 'Código de paciente ref': 'CC-PAC-999999', 'Categoría': 'piel', 'Fecha': '2026-09-01T10:00:00Z', 'Código de médico ref': 'CCMED-PROP01', 'Activa': true, 'Imagen': [{ url: 'https://x/4.jpg' }] } },
];

test('listar (médico): todas las activas del expediente, de cualquier médico; nunca las retiradas', async () => {
  const w = mundo({ previas });
  try {
    const r = await nova(PROP, { action: 'medico_listar_fotos', pacienteCode: PAC });
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(r.body.fotos.map(f => f.id), ['recFOT00000000002', 'recFOT00000000001']);
    assert.strictEqual(r.body.fotos[1].miniatura, 'https://x/1l.jpg');
    assert.ok([403, 404].includes((await nova(AJENO, { action: 'medico_listar_fotos', pacienteCode: PAC })).statusCode));
  } finally { w.restaurar(); }
});

test('retirar: solo quien la subió; nunca se borra, queda inactiva con fecha', async () => {
  const w = mundo({ previas });
  try {
    const otro = await nova(OTRO, { action: 'medico_retirar_foto', pacienteCode: PAC, fotoId: 'recFOT00000000001' });
    assert.strictEqual(otro.statusCode, 403);
    const de_otro_paciente = await nova(PROP, { action: 'medico_retirar_foto', pacienteCode: PAC, fotoId: 'recFOT00000000004' });
    assert.strictEqual(de_otro_paciente.statusCode, 404);
    const r = await nova(PROP, { action: 'medico_retirar_foto', pacienteCode: PAC, fotoId: 'recFOT00000000001' });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(w.cap.patches.length, 1);
    assert.strictEqual(w.cap.patches[0].f['Activa'], false); assert.ok(w.cap.patches[0].f['Fecha retiro']);
    assert.ok(w.fotos.find(f => f.id === 'recFOT00000000001'), 'el registro sigue existiendo');
  } finally { w.restaurar(); }
});

test('paciente: ve solo las suyas y activas; el código lo pone la sesión, no el cuerpo', async () => {
  const w = mundo({ previas });
  try {
    const r = await nova({ tipo: 'paciente', codigo: PAC }, { action: 'paciente_mis_fotos', codigo: 'CC-PAC-999999' });
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(r.body.fotos.map(f => f.id), ['recFOT00000000002', 'recFOT00000000001']);
    assert.strictEqual(r.body.fotos[0].medicoCodigo, 'CCMED-OTRO01');
    assert.strictEqual((await nova(null, { action: 'paciente_mis_fotos' })).statusCode, 401);
  } finally { w.restaurar(); }
});
