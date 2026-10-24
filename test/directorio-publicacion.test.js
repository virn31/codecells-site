// Etapa 1 del directorio: el médico solicita con consentimiento, un
// administrador aprueba; el médico nunca se publica por su cuenta.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS'; // no es producción → sin congelamiento
delete process.env.ADMIN_DIRECTORIO;
delete process.env.TELEGRAM_CHAT_ID;

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const D = require('../lib/directorio');

const TBL_DIR = 'tblkUNPwu1sQgZBPJ';
const TBL_MED = 'tbl87DsuBMmb4DjFM';
const REC_MED = 'recMEDICO00000001';
const REC_PERFIL = 'recPERFIL00000001';
const COD = 'CCMED-PRUEBA01';

// ── Reglas puras ──────────────────────────────────────────────────────
test('quitarCamposProtegidos: el médico no puede mandar Publicado, consentimiento ni revisión', () => {
  const limpio = D.quitarCamposProtegidos({
    'Name': 'Dr. X', 'Publicado': true, 'Estado de publicación': 'Publicado', 'Médico': ['recX'],
    'Consentimiento — huella': 'falsa', 'Revisado por': 'yo', 'Fecha de alta': '2020-01-01',
  });
  assert.deepStrictEqual(limpio, { 'Name': 'Dr. X' });
});

test('estadoEfectivo: un perfil viejo publicado sin estado sigue publicado pero sin consentimiento', () => {
  assert.strictEqual(D.estadoEfectivo({ 'Publicado': true }), 'Publicado');
  assert.strictEqual(D.tieneConsentimiento({ 'Publicado': true }), false);
  assert.strictEqual(D.estadoEfectivo({}), 'Borrador');
  assert.strictEqual(D.estadoEfectivo({ 'Estado de publicación': 'Rechazado', 'Publicado': false }), 'Rechazado');
});

test('faltantesParaPublicar exige nombre, ciudad y especialidad', () => {
  assert.deepStrictEqual(D.faltantesParaPublicar({}), ['Nombre público', 'Ciudad de consulta', 'Al menos una especialidad']);
  assert.deepStrictEqual(D.faltantesParaPublicar({ 'Name': 'Dr. X', 'Ciudad de consulta': 'Culiacán', 'Especialidades visibles': ['Cardiología'] }), []);
});

test('la huella cambia si cambia el texto, la versión, el médico o la fecha', () => {
  const base = { version: 'v1', texto: 't', codigo: 'A', fechaISO: '2026-10-21T00:00:00.000Z' };
  const h = D.huellaConsentimiento(base);
  assert.match(h, /^[0-9a-f]{64}$/);
  for (const k of Object.keys(base)) assert.notStrictEqual(D.huellaConsentimiento({ ...base, [k]: base[k] + 'x' }), h, k);
});

test('administradores: por defecto VIRN01 y JCG01; ADMIN_DIRECTORIO los reemplaza', () => {
  assert.ok(D.esAdminDirectorio('CCMED-VIRN01', {}));
  assert.ok(D.esAdminDirectorio('CCMED-JCG01', {}));
  assert.ok(!D.esAdminDirectorio('CCMED-JORGE01', {}), 'Jorge no es médico: no aprueba médicos');
  assert.ok(D.esAdminDirectorio('CCMED-OTRO', { ADMIN_DIRECTORIO: 'CCMED-OTRO' }));
  assert.ok(!D.esAdminDirectorio('CCMED-VIRN01', { ADMIN_DIRECTORIO: 'CCMED-OTRO' }));
});

// ── Endpoint con Airtable simulada ───────────────────────────────────
function airtableFalsa(perfil, { fallarPatch = false } = {}) {
  const estado = { perfil: JSON.parse(JSON.stringify(perfil)), patches: [] };
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const metodo = opts.method || 'GET';
    const ok = data => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname.includes(TBL_MED)) {
      if (u.pathname.endsWith(REC_MED)) return ok({ id: REC_MED, fields: { 'Código de médico': COD } });
      return ok({ records: [{ id: REC_MED, fields: { 'Código de médico': COD, 'Nombre completo': 'Médico de Prueba', 'Cédula profesional': '1234567' } }] });
    }
    if (u.pathname.includes(TBL_DIR)) {
      if (metodo === 'PATCH') {
        if (fallarPatch) return { ok: false, status: 422, json: async () => ({ error: 'UNKNOWN_FIELD_NAME' }) };
        const body = JSON.parse(opts.body);
        estado.patches.push(body.fields);
        Object.assign(estado.perfil.fields, body.fields);
        return ok(estado.perfil);
      }
      if (u.pathname.endsWith(REC_PERFIL)) return ok(estado.perfil);
      return ok({ records: [estado.perfil] });
    }
    throw new Error('URL no simulada: ' + url);
  };
  return estado;
}

function llamar(accion, { metodo = 'GET', body, codigo = COD } = {}) {
  delete require.cache[require.resolve('../api/directorio.js')];
  const handler = require('../api/directorio.js');
  const token = generarToken({ tipo: 'medico', codigo });
  return new Promise(resolve => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(d) { resolve({ status: this.statusCode, data: d }); return this; },
    };
    handler({ method: metodo, query: { accion }, body, headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.7', 'user-agent': 'prueba/1.0' } }, res);
  });
}

const perfilCompleto = extra => ({ id: REC_PERFIL, fields: { 'Médico': [REC_MED], 'Name': 'Dr. Prueba', 'Ciudad de consulta': 'Culiacán', 'Especialidades visibles': ['Cardiología'], ...extra } });

test('sin sesión médica → 401', async () => {
  delete require.cache[require.resolve('../api/directorio.js')];
  const handler = require('../api/directorio.js');
  const r = await new Promise(resolve => handler({ method: 'GET', query: { accion: 'mi_estado' }, headers: {} },
    { status(c) { this.c = c; return this; }, json(d) { resolve({ status: this.c, data: d }); } }));
  assert.strictEqual(r.status, 401);
});

test('solicitar sin aceptar el consentimiento vigente → 400 y no escribe', async () => {
  const at = airtableFalsa(perfilCompleto({}));
  const r = await llamar('solicitar_publicacion', { metodo: 'POST', body: { acepto: true, version: 'v0-vieja' } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(at.patches.length, 0);
});

test('solicitar con perfil incompleto → 400 con lo que falta', async () => {
  const at = airtableFalsa({ id: REC_PERFIL, fields: { 'Médico': [REC_MED], 'Name': 'Dr. Prueba' } });
  const r = await llamar('solicitar_publicacion', { metodo: 'POST', body: { acepto: true, version: D.VERSION_CONSENTIMIENTO } });
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.data.faltantes, ['Ciudad de consulta', 'Al menos una especialidad']);
  assert.strictEqual(at.patches.length, 0);
});

test('solicitar: estampa consentimiento del servidor, queda En revisión y NO publicado', async () => {
  const at = airtableFalsa(perfilCompleto({}));
  const r = await llamar('solicitar_publicacion', { metodo: 'POST', body: { acepto: true, version: D.VERSION_CONSENTIMIENTO } });
  assert.strictEqual(r.status, 200);
  const f = at.patches[0];
  assert.strictEqual(f['Publicado'], false);
  assert.strictEqual(f['Estado de publicación'], 'En revisión');
  assert.strictEqual(f['Consentimiento — versión'], D.VERSION_CONSENTIMIENTO);
  assert.strictEqual(f['Consentimiento — IP'], '203.0.113.7');
  assert.strictEqual(f['Consentimiento — navegador'], 'prueba/1.0');
  assert.strictEqual(f['Consentimiento — huella'], D.huellaConsentimiento({
    version: D.VERSION_CONSENTIMIENTO, texto: D.TEXTO_CONSENTIMIENTO, codigo: COD, fechaISO: f['Consentimiento — fecha'],
  }));
  assert.match(f['Historial de publicación'], /Solicitud de publicación \| CCMED-PRUEBA01/);
});

test('un médico que no es administrador no puede aprobar → 403', async () => {
  const at = airtableFalsa(perfilCompleto({ 'Estado de publicación': 'En revisión' }));
  const r = await llamar('admin_aprobar', { metodo: 'POST', body: { recordId: REC_PERFIL } });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(at.patches.length, 0);
});

test('aprobar un perfil sin consentimiento registrado → 409 (no se publica a nadie sin su autorización)', async () => {
  const at = airtableFalsa(perfilCompleto({ 'Publicado': true }));
  const r = await llamar('admin_aprobar', { metodo: 'POST', body: { recordId: REC_PERFIL }, codigo: 'CCMED-VIRN01' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(at.patches.length, 0);
});

test('aprobar con consentimiento → publicado, con revisor, fecha de alta e historial', async () => {
  const consentido = D.sellarConsentimiento({ codigo: COD, ip: '1.1.1.1', navegador: 'x', fechaISO: '2026-10-21T10:00:00.000Z' });
  const at = airtableFalsa(perfilCompleto({ ...consentido, 'Estado de publicación': 'En revisión' }));
  const r = await llamar('admin_aprobar', { metodo: 'POST', body: { recordId: REC_PERFIL }, codigo: 'CCMED-VIRN01' });
  assert.strictEqual(r.status, 200);
  const f = at.patches[0];
  assert.strictEqual(f['Publicado'], true);
  assert.strictEqual(f['Estado de publicación'], 'Publicado');
  assert.strictEqual(f['Revisado por'], 'CCMED-VIRN01');
  assert.ok(f['Fecha de alta']);
  assert.match(f['Historial de publicación'], /Aprobado y publicado/);
});

test('aprobar asigna la liga pública una sola vez (no cambia si ya existe)', async () => {
  const consentido = D.sellarConsentimiento({ codigo: COD, ip: '1.1.1.1', navegador: 'x', fechaISO: '2026-10-21T10:00:00.000Z' });
  let at = airtableFalsa(perfilCompleto({ ...consentido, 'Estado de publicación': 'En revisión' }));
  let r = await llamar('admin_aprobar', { metodo: 'POST', body: { recordId: REC_PERFIL }, codigo: 'CCMED-VIRN01' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(at.patches[0]['Liga pública'], 'dr-prueba');
  assert.strictEqual(r.data.perfil.liga, 'dr-prueba');
  at = airtableFalsa(perfilCompleto({ ...consentido, 'Name': 'Dr. Nombre Nuevo', 'Liga pública': 'dr-prueba' }));
  r = await llamar('admin_aprobar', { metodo: 'POST', body: { recordId: REC_PERFIL }, codigo: 'CCMED-VIRN01' });
  assert.strictEqual(at.patches[0]['Liga pública'], 'dr-prueba', 'editar el nombre no rompe la liga ya compartida');
});

test('rechazar exige motivo', async () => {
  const at = airtableFalsa(perfilCompleto({ 'Estado de publicación': 'En revisión' }));
  const r = await llamar('admin_rechazar', { metodo: 'POST', body: { recordId: REC_PERFIL, motivo: '  ' }, codigo: 'CCMED-JCG01' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(at.patches.length, 0);
});

test('el médico despublica de inmediato, aun estando publicado', async () => {
  const at = airtableFalsa(perfilCompleto({ 'Publicado': true, 'Estado de publicación': 'Publicado' }));
  const r = await llamar('despublicar', { metodo: 'POST' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(at.patches[0]['Publicado'], false);
  assert.strictEqual(at.patches[0]['Estado de publicación'], 'Despublicado');
});

test('si Airtable rechaza la escritura → 502, nunca "ok"', async () => {
  airtableFalsa(perfilCompleto({}), { fallarPatch: true });
  const r = await llamar('solicitar_publicacion', { metodo: 'POST', body: { acepto: true, version: D.VERSION_CONSENTIMIENTO } });
  assert.strictEqual(r.status, 502);
  assert.notStrictEqual(r.data.ok, true);
});

// ── Proxy genérico (api/airtable.js): el médico edita, no publica ─────
function llamarProxy({ metodo, query, body, codigo = COD }) {
  delete require.cache[require.resolve('../api/airtable.js')];
  const handler = require('../api/airtable.js');
  const token = generarToken({ tipo: 'medico', codigo });
  return new Promise(resolve => {
    const res = {
      statusCode: 200, headers: {},
      setHeader() {}, status(c) { this.statusCode = c; return this; },
      json(d) { resolve({ status: this.statusCode, data: d }); return this; },
      end() { resolve({ status: this.statusCode }); },
    };
    handler({ method: metodo, query, body, headers: { authorization: `Bearer ${token}` } }, res);
  });
}

test('proxy PATCH: el médico manda Publicado=true → se ignora; editar un perfil publicado lo marca para revisión', async () => {
  const at = airtableFalsa(perfilCompleto({ 'Publicado': true, 'Estado de publicación': 'Publicado' }));
  const r = await llamarProxy({ metodo: 'PATCH', query: { tabla: 'directorio_medico', recordId: REC_PERFIL },
    body: { fields: { 'Bio corta': 'Nueva bio', 'Publicado': true, 'Consentimiento — huella': 'inventada' } } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const f = at.patches[0];
  assert.ok(!('Publicado' in f), 'Publicado no viaja desde el médico');
  assert.ok(!('Consentimiento — huella' in f));
  assert.strictEqual(f['Bio corta'], 'Nueva bio');
  assert.strictEqual(f['Cambios sin revisar'], true);
  assert.match(f['Historial de publicación'], /Cambios en perfil publicado .*Bio corta/);
});

test('proxy PATCH en borrador: no marca cambios sin revisar', async () => {
  const at = airtableFalsa(perfilCompleto({ 'Estado de publicación': 'Borrador' }));
  const r = await llamarProxy({ metodo: 'PATCH', query: { tabla: 'directorio_medico', recordId: REC_PERFIL },
    body: { fields: { 'Bio corta': 'Otra' } } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.ok(!('Cambios sin revisar' in at.patches[0]));
});

// ── Foto de perfil ────────────────────────────────────────────────────
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(60)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(60)]);

test('validarFoto: acepta JPEG y PNG por sus bytes reales', () => {
  const j = D.validarFoto({ contentType: 'image/jpeg', base64: JPEG.toString('base64') });
  assert.strictEqual(j.ok, true); assert.strictEqual(j.extension, 'jpg');
  const p = D.validarFoto({ base64: 'data:image/png;base64,' + PNG.toString('base64') });
  assert.strictEqual(p.ok, true); assert.strictEqual(p.tipo, 'image/png');
});

test('validarFoto: rechaza lo que no es imagen, tipos que no coinciden y archivos grandes', () => {
  assert.strictEqual(D.validarFoto({ base64: Buffer.from('<svg onload=alert(1)>xxxxxxxxx').toString('base64') }).ok, false);
  assert.strictEqual(D.validarFoto({ contentType: 'image/png', base64: JPEG.toString('base64') }).ok, false);
  assert.strictEqual(D.validarFoto({}).ok, false);
  assert.strictEqual(D.validarFoto({ base64: 'no es base64 !!' }).ok, false);
  const grande = Buffer.concat([JPEG, Buffer.alloc(D.FOTO_MAX_BYTES)]);
  assert.strictEqual(D.validarFoto({ base64: grande.toString('base64') }).ok, false);
});

test('urlFotoPublica: solo https, prefiere la miniatura grande', () => {
  assert.strictEqual(D.urlFotoPublica(null), null);
  assert.strictEqual(D.urlFotoPublica([{ url: 'javascript:alert(1)' }]), null);
  assert.strictEqual(D.urlFotoPublica([{ url: 'https://x/orig.jpg', thumbnails: { large: { url: 'https://x/l.jpg' } } }]), 'https://x/l.jpg');
  assert.strictEqual(D.urlFotoPublica([{ url: 'https://x/orig.jpg' }]), 'https://x/orig.jpg');
});

test('la foto no se puede mandar por el proxy genérico (solo por subir_foto)', () => {
  assert.deepStrictEqual(D.quitarCamposProtegidos({ 'Name': 'Dr. X', 'Foto de perfil': [{ url: 'https://stock/x.jpg' }] }), { 'Name': 'Dr. X' });
  assert.ok(D.CAMPOS_PUBLICOS.includes('Foto de perfil'));
  assert.ok(/fotografía/.test(D.TEXTO_CONSENTIMIENTO));
});

// ── Redes sociales (2026-10-23) ───────────────────────────────────────
test('normalizarRed: @usuario y ligas sin https se guardan como liga https completa', () => {
  const casos = [
    ['Instagram', '@dr.rodriguez', 'https://www.instagram.com/dr.rodriguez'],
    ['Instagram', 'instagram.com/dr.rodriguez/', 'https://instagram.com/dr.rodriguez/'],
    ['Instagram', 'https://www.instagram.com/dr.rodriguez?igsh=abc#x', 'https://www.instagram.com/dr.rodriguez?igsh=abc'],
    ['Facebook', 'fb.com/consultorio', 'https://fb.com/consultorio'],
    ['Facebook', 'm.facebook.com/consultorio', 'https://m.facebook.com/consultorio'],
    ['TikTok', '@consultorio', 'https://www.tiktok.com/@consultorio'],
    ['YouTube', 'canal', 'https://www.youtube.com/@canal'],
    ['YouTube', 'http://youtu.be/abc', 'https://youtu.be/abc'],
    ['LinkedIn', 'linkedin.com/in/dr-x', 'https://linkedin.com/in/dr-x'],
    ['Sitio web', 'consultorio.mx', 'https://consultorio.mx/'],
    ['Sitio web', '  ', ''],
  ];
  for (const [campo, entrada, esperado] of casos) {
    const r = D.normalizarRed(campo, entrada);
    assert.strictEqual(r.ok, true, `${campo} ${entrada}: ${r.error}`);
    assert.strictEqual(r.valor, esperado, `${campo} ${entrada}`);
  }
});

test('normalizarRed: rechaza ligas de otra red, esquemas peligrosos, IPs y credenciales', () => {
  const malos = [
    ['Instagram', 'https://instagram.com.sitio-falso.com/x'],
    ['Instagram', 'https://facebook.com/x'],
    ['Facebook', 'https://notfacebook.com/x'],
    ['Instagram', 'javascript:alert(1)'],
    ['Sitio web', 'javascript:alert(1)'],
    ['Sitio web', 'data:text/html,hola'],
    ['Sitio web', 'http://192.168.0.1/admin'],
    ['Sitio web', 'http://localhost:3000'],
    ['Sitio web', 'https://usuario:clave@consultorio.mx'],
    ['LinkedIn', '@dr-x'],
    ['Twitter', 'https://x.com/dr'],
  ];
  for (const [campo, entrada] of malos) {
    assert.strictEqual(D.normalizarRed(campo, entrada).ok, false, `${campo} ${entrada} debió rechazarse`);
  }
});

test('las redes son campos públicos (editarlas en un perfil publicado pide revisión) y el consentimiento las menciona', () => {
  for (const c of D.CAMPOS_REDES) assert.ok(D.CAMPOS_PUBLICOS.includes(c), c);
  assert.ok(/redes sociales/.test(D.TEXTO_CONSENTIMIENTO));
});

test('proxy PATCH: un @usuario se guarda como liga completa', async () => {
  const at = airtableFalsa(perfilCompleto({ 'Estado de publicación': 'Borrador' }));
  const r = await llamarProxy({ metodo: 'PATCH', query: { tabla: 'directorio_medico', recordId: REC_PERFIL },
    body: { fields: { 'Instagram': '@dr.prueba' } } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(at.patches[0]['Instagram'], 'https://www.instagram.com/dr.prueba');
  assert.strictEqual(r.data.fields['Instagram'], 'https://www.instagram.com/dr.prueba', 'el portal recibe el valor guardado');
});

test('proxy PATCH: una liga que no es de su red → 400 con mensaje y no escribe nada', async () => {
  const at = airtableFalsa(perfilCompleto({ 'Estado de publicación': 'Borrador' }));
  const r = await llamarProxy({ metodo: 'PATCH', query: { tabla: 'directorio_medico', recordId: REC_PERFIL },
    body: { fields: { 'Facebook': 'https://sitio-falso.com/facebook' } } });
  assert.strictEqual(r.status, 400);
  assert.match(r.data.error, /no es de Facebook/);
  assert.strictEqual(at.patches.length, 0);
});

test('directorio público: las redes válidas salen; una liga mala escrita directo en Airtable no sale', async () => {
  airtableFalsa(perfilCompleto({ 'Publicado': true, 'Instagram': 'https://www.instagram.com/dr.prueba', 'Facebook': 'javascript:alert(1)', 'Sitio web': 'https://otro.com' }));
  delete require.cache[require.resolve('../api/airtable.js')];
  const handler = require('../api/airtable.js');
  const r = await new Promise(resolve => handler({ method: 'GET', query: { tabla: 'directorio_medico', id: REC_PERFIL }, headers: {} }, {
    statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; },
    json(d) { resolve({ status: this.statusCode, data: d }); return this; }, end() { resolve({ status: this.statusCode }); },
  }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const f = r.data.records[0].fields;
  assert.strictEqual(f['Instagram'], 'https://www.instagram.com/dr.prueba');
  assert.ok(!('Facebook' in f), 'javascript: nunca sale al público');
  assert.strictEqual(f['Sitio web'], 'https://otro.com/');
});

// ── Ciudad y filtros (2026-10-23) ─────────────────────────────────────
test('normalizarCiudad: "Culiacan", "  culiacán " y "CULIACAN" son Culiacán; alias CDMX; ciudad desconocida se respeta', () => {
  for (const x of ['Culiacan', '  culiacán ', 'CULIACAN', 'Culiacán']) assert.strictEqual(D.normalizarCiudad(x), 'Culiacán', x);
  assert.strictEqual(D.normalizarCiudad('cdmx'), 'Ciudad de México');
  assert.strictEqual(D.normalizarCiudad('Mazatlan'), 'Mazatlán');
  assert.strictEqual(D.normalizarCiudad('  Pueblo   Mágico  '), 'Pueblo Mágico', 'no se inventa una ciudad');
  assert.strictEqual(D.normalizarCiudad(''), '');
  assert.strictEqual(D.claveCiudad('Culiacán'), D.claveCiudad('culiacan'));
});

test('opcionesFiltros: solo lo publicado, con conteo y ciudades agrupadas', () => {
  const o = D.opcionesFiltros([
    { fields: { 'Ciudad de consulta': 'Culiacan', 'Especialidades visibles': ['Cardiología'], 'Tratamientos que ofrece': ['Exosomas'] } },
    { fields: { 'Ciudad de consulta': 'Culiacán', 'Especialidades visibles': ['Cardiología', 'Nutriología'] } },
    { fields: { 'Ciudad de consulta': 'Mazatlán' } },
  ]);
  assert.deepStrictEqual(o.ciudades, [{ nombre: 'Culiacán', n: 2 }, { nombre: 'Mazatlán', n: 1 }]);
  assert.deepStrictEqual(o.especialidades, [{ nombre: 'Cardiología', n: 2 }, { nombre: 'Nutriología', n: 1 }]);
  assert.deepStrictEqual(o.tratamientos, [{ nombre: 'Exosomas', n: 1 }]);
});

test('palabrasBusqueda: sin acentos, sin palabras vacías, plural simple, máximo 8', () => {
  assert.deepStrictEqual(D.palabrasBusqueda('Busco un Dr. para la  RODILLA'), ['rodilla']);
  assert.deepStrictEqual(D.palabrasBusqueda('terapias hormonales'), ['terapia', 'hormonal']);
  assert.deepStrictEqual(D.palabrasBusqueda('Cardiología, Culiacán'), ['cardiologia', 'culiacan']);
  assert.deepStrictEqual(D.palabrasBusqueda('  '), []);
  assert.deepStrictEqual(D.palabrasBusqueda(undefined), []);
  assert.strictEqual(D.palabrasBusqueda('a1 b2 c3 d4 e5 f6 g7 h8 i9 j10').length, 8);
});

test('coincideBusqueda: cada palabra debe estar en lo publicado; no inventa sinónimos', () => {
  const f = {
    'Name': 'Dra. Ana Pérez', 'Especialidades visibles': ['Cardiología'], 'Tratamientos que ofrece': ['Exosomas'],
    'Otras terapias': 'Sueroterapia', 'Ciudad de consulta': 'Culiacan', 'Bio corta': 'Atiendo hipertensión y arritmias.',
  };
  const ok = q => D.coincideBusqueda(f, D.palabrasBusqueda(q));
  assert.ok(ok('perez'), 'nombre sin acento');
  assert.ok(ok('cardiologia culiacán'), 'especialidad + ciudad');
  assert.ok(ok('Hipertension'), 'bio');
  assert.ok(ok('arritmia'), 'singular encuentra plural');
  assert.ok(ok('exosomas'));
  assert.ok(ok(''), 'sin texto no filtra');
  assert.ok(!ok('rodilla'), 'lo que el médico no escribió no aparece');
  assert.ok(!ok('cardiologia mazatlan'), 'todas las palabras cuentan');
  assert.ok(D.coincideBusqueda({}, []), 'campos vacíos sin búsqueda');
  assert.ok(!D.coincideBusqueda({}, ['ana']));
});

function llamarPublico(query) {
  delete require.cache[require.resolve('../api/airtable.js')];
  const handler = require('../api/airtable.js');
  return new Promise(resolve => handler({ method: 'GET', query, headers: {} }, {
    statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; },
    json(d) { resolve({ status: this.statusCode, data: d }); return this; }, end() { resolve({ status: this.statusCode }); },
  }));
}

test('directorio público: buscar "Culiacán" encuentra al perfil que dice "Culiacan" y lo muestra con acento', async () => {
  airtableFalsa(perfilCompleto({ 'Publicado': true, 'Ciudad de consulta': 'Culiacan' }));
  const r = await llamarPublico({ tabla: 'directorio_medico', ciudad: 'Culiacán' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.records.length, 1);
  assert.strictEqual(r.data.records[0].fields['Ciudad de consulta'], 'Culiacán');
  airtableFalsa(perfilCompleto({ 'Publicado': true, 'Ciudad de consulta': 'Culiacan' }));
  const otra = await llamarPublico({ tabla: 'directorio_medico', ciudad: 'Mazatlán' });
  assert.strictEqual(otra.data.records.length, 0);
});

test('directorio público: ?q= filtra en el servidor sin acentos', async () => {
  airtableFalsa(perfilCompleto({ 'Publicado': true, 'Bio corta': 'Manejo de dolor articular y rodilla.' }));
  const r = await llamarPublico({ tabla: 'directorio_medico', q: 'Rodilla' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.records.length, 1);
  airtableFalsa(perfilCompleto({ 'Publicado': true, 'Bio corta': 'Manejo de dolor articular y rodilla.' }));
  const nada = await llamarPublico({ tabla: 'directorio_medico', q: 'migraña' });
  assert.strictEqual(nada.status, 200);
  assert.strictEqual(nada.data.records.length, 0);
});

test('directorio público: si Airtable falla → 502 con mensaje, nunca lista vacía', async () => {
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'caído' }) });
  const r = await llamarPublico({ tabla: 'directorio_medico' });
  assert.strictEqual(r.status, 502);
  assert.ok(!r.data.records);
  const f = await llamarPublico({ tabla: 'directorio_medico', accion: 'filtros' });
  assert.strictEqual(f.status, 502);
});

test('accion=filtros devuelve opciones con conteo', async () => {
  airtableFalsa(perfilCompleto({ 'Publicado': true, 'Ciudad de consulta': 'culiacan', 'Tratamientos que ofrece': ['DEZAWA (VIP)'] }));
  const r = await llamarPublico({ tabla: 'directorio_medico', accion: 'filtros' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.deepStrictEqual(r.data.ciudades, [{ nombre: 'Culiacán', n: 1 }]);
  assert.deepStrictEqual(r.data.especialidades, [{ nombre: 'Cardiología', n: 1 }]);
});

test('proxy PATCH: la ciudad se guarda con la ortografía del catálogo', async () => {
  const at = airtableFalsa(perfilCompleto({ 'Estado de publicación': 'Borrador' }));
  const r = await llamarProxy({ metodo: 'PATCH', query: { tabla: 'directorio_medico', recordId: REC_PERFIL },
    body: { fields: { 'Ciudad de consulta': ' culiacan ' } } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(at.patches[0]['Ciudad de consulta'], 'Culiacán');
});

test('normalizarTelefono: 10 dígitos o con +52; guarda solo dígitos; rechaza lo demás', () => {
  assert.deepStrictEqual(D.normalizarTelefono('667 123 4567'), { ok: true, valor: '6671234567' });
  assert.deepStrictEqual(D.normalizarTelefono('+52 (667) 123-4567'), { ok: true, valor: '+526671234567' });
  assert.deepStrictEqual(D.normalizarTelefono(''), { ok: true, valor: '' }, 'vacío borra');
  assert.strictEqual(D.normalizarTelefono('12345').ok, false);
  assert.strictEqual(D.normalizarTelefono('https://wa.me/5216671234567').ok, false, 'una liga no es teléfono');
});

test('normalizarContacto: valida el teléfono y deja el WhatsApp a normalizarRedes', () => {
  const r = D.normalizarContacto({ 'Teléfono de consultorio': '667-123-4567', 'Bio corta': 'x' });
  assert.deepStrictEqual(r, { fields: { 'Teléfono de consultorio': '6671234567', 'Bio corta': 'x' }, errores: [] });
  assert.strictEqual(D.normalizarContacto({ 'Teléfono de consultorio': '123' }).errores.length, 1);
});

test('WhatsApp del médico como red social: número o liga → https://wa.me/<número>, sin mensaje', () => {
  const wa = x => D.normalizarRed('WhatsApp público', x);
  assert.deepStrictEqual(wa('667 123 4567'), { ok: true, valor: 'https://wa.me/526671234567' });
  assert.deepStrictEqual(wa('+52 1 667 123 4567'), { ok: true, valor: 'https://wa.me/526671234567' }, 'quita el 1 viejo');
  assert.deepStrictEqual(wa('https://wa.me/5216671234567?text=Hola'), { ok: true, valor: 'https://wa.me/526671234567' }, 'sin texto pre-escrito');
  assert.deepStrictEqual(wa('https://api.whatsapp.com/send?phone=526671234567'), { ok: true, valor: 'https://wa.me/526671234567' });
  assert.deepStrictEqual(wa('wa.me/message/ABCDEF123'), { ok: true, valor: 'https://wa.me/message/ABCDEF123' });
  assert.deepStrictEqual(wa(''), { ok: true, valor: '' });
  for (const malo of ['123', 'instagram.com/dr', 'https://chat.whatsapp.com/abc', 'https://wa.me.evil.com/526671234567', 'javascript:alert(1)']) {
    assert.strictEqual(wa(malo).ok, false, malo);
  }
  assert.ok(D.CAMPOS_REDES.includes('WhatsApp público'));
  assert.ok(D.CAMPOS_PUBLICOS.includes('WhatsApp público'), 'editarlo en un perfil publicado marca revisión');
  assert.deepStrictEqual(D.redesPublicas({ 'WhatsApp público': 'https://wa.me/5216671234567' }), { 'WhatsApp público': 'https://wa.me/526671234567' }, 'lo viejo sale limpio');
});

// ── M6: liga pública y ficha con vista previa ──
test('ligaDisponible: sin acentos ni títulos raros, -2 si ya existe, nunca una palabra reservada', () => {
  assert.strictEqual(D.ligaDisponible('Dr. Víctor Iván Rodríguez Nava', []), 'dr-victor-ivan-rodriguez-nava');
  assert.strictEqual(D.ligaDisponible('Dr. Rodriguez', ['dr-rodriguez']), 'dr-rodriguez-2');
  assert.strictEqual(D.ligaDisponible('Dr. Rodriguez', ['dr-rodriguez', 'dr-rodriguez-2']), 'dr-rodriguez-3');
  assert.strictEqual(D.ligaDisponible('Médico', []), 'medico-2');
  assert.strictEqual(D.ligaDisponible('***', []), 'medico-2');
  assert.ok(D.ligaDisponible('x'.repeat(200), []).length <= 64);
  assert.ok(D.esLigaValida('dr-a-b') && !D.esLigaValida('Dr-A') && !D.esLigaValida('a--b') && !D.esLigaValida('../x'));
  assert.ok(D.CAMPOS_PROTEGIDOS.includes('Liga pública'), 'el médico no puede cambiar su liga');
});

test('htmlFicha: pone título, descripción y og: escapados; el JSON no puede cerrar el <script>', () => {
  const plantilla = '<html><head><title>Médico — Red CODE CELLS™</title>\n<meta name="description" content="x">\n</head><body></body></html>';
  const meta = D.metaFicha({ 'Name': 'Dr. <b>Ana</b> "Q"', 'Especialidades visibles': ['Cardiología'], 'Ciudad de consulta': 'Culiacán', 'Foto de perfil': 'https://img/x.jpg', 'Bio corta': 'Hola' }, 'https://www.codecells.mx/directorio/dr-ana');
  const html = D.htmlFicha(plantilla, meta, { id: 'recAAAAAAAAAAAAAA', liga: '</script><script>alert(1)' });
  assert.match(html, /<title>Dr\. &lt;b&gt;Ana&lt;\/b&gt; &quot;Q&quot; — Cardiología en Culiacán \| CODE CELLS™<\/title>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/img\/x\.jpg">/);
  assert.match(html, /<meta name="description" content="Hola">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.codecells\.mx\/directorio\/dr-ana">/);
  assert.ok(!html.includes('</script><script>alert'), 'el texto no cierra la etiqueta');
  assert.ok(!html.includes('<b>Ana'));
});

function llamarFicha(liga, host = 'www.codecells.mx') {
  delete require.cache[require.resolve('../api/ficha.js')];
  const handler = require('../api/ficha.js');
  return new Promise(resolve => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, headers: this.headers, html: b }); } };
    handler({ method: 'GET', query: { liga }, headers: { host } }, res);
  });
}

test('ficha /directorio/<liga>: perfil publicado → 200 con vista previa y window.FICHA', async () => {
  let formula = '';
  global.fetch = async url => { formula = new URL(url).searchParams.get('filterByFormula'); return { ok: true, status: 200, json: async () => ({ records: [perfilCompleto({ 'Publicado': true, 'Ciudad de consulta': 'Culiacan', 'Liga pública': 'dr-prueba' })] }) }; };
  const r = await llamarFicha('dr-prueba');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(formula, 'AND({Publicado}=1, {Liga pública}="dr-prueba")', 'solo publicados');
  assert.match(r.html, /<meta property="og:title" content="Dr\. Prueba — Cardiología en Culiacán">/);
  assert.match(r.html, /window\.FICHA = \{"id":"rec[A-Za-z0-9]+","liga":"dr-prueba"\}/);
  assert.match(r.headers['Cache-Control'], /s-maxage=300/);
});

test('ficha: liga inexistente → 404 noindex; liga inválida no consulta Airtable; Airtable caído → 502', async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ records: [] }) });
  let r = await llamarFicha('no-existe');
  assert.strictEqual(r.status, 404);
  assert.match(r.html, /noindex/);
  assert.match(r.html, /"noEncontrada":true/);
  let llamadas = 0;
  global.fetch = async () => { llamadas++; return { ok: true, status: 200, json: async () => ({ records: [] }) }; };
  r = await llamarFicha('x") , OR(1');
  assert.strictEqual(r.status, 404);
  assert.strictEqual(llamadas, 0, 'una liga con caracteres raros nunca llega a la fórmula');
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  r = await llamarFicha('dr-prueba');
  assert.strictEqual(r.status, 502, 'un fallo no se disfraza de "no existe"');
  assert.match(r.headers['Cache-Control'], /no-store/);
});
