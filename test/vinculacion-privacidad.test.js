// El paciente es dueño del expediente, no del criterio médico (decisión de
// Víctor, 2026-10-04):
//  - El paciente entrega su expediente a otro médico con una LLAVE temporal
//    (el código CC-PAC- solo no basta: es secuencial). El médico queda
//    vinculado de forma permanente (vía 'vinculado' en autorizarPaciente).
//  - Todo médico autorizado ve diagnóstico y manejo de sus colegas, pero NO
//    sus notas privadas (Razonamiento clínico, Notas internas, Pronóstico,
//    Adherencia — observaciones). El paciente tampoco las ve.
//  - Una consulta solo la modifica quien la firmó; el paciente no la escribe.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.NODE_ENV = 'development';

const test = require('node:test');
const assert = require('node:assert');

const { generarToken } = require('../lib/auth');
const { filtrarConsultasParaLector, CAMPOS_PRIVADOS_AUTOR } = require('../lib/privacidadConsultas');
const { generarLlave, normalizarLlave, hashLlave } = require('../lib/vinculacion');

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const TBL_INTERCONSULTAS = 'tbl9PS3KNBxbRVriV';
const TBL_ACCESOS = 'tblSpORAqLKxYOI6W';
const TBL_CONSULTAS = 'tbl1Xp2IGxdV178Ky';

const MED_A = 'CCMED-GINE01';   // principal (ginecología)
const MED_B = 'CCMED-CARD01';   // cardiólogo al que el paciente entrega el expediente
const MED_C = 'CCMED-NEUM01';   // neumólogo sin vínculo
const MED_REV = 'CCMED-REVI01'; // Tipo de acceso Revisor
const MEDICOS = {
  [MED_A]: { id: 'recMEDA', tipo: 'Clinico', esp: 'Ginecología' },
  [MED_B]: { id: 'recMEDB', tipo: 'Clinico', esp: 'Cardiología' },
  [MED_C]: { id: 'recMEDC', tipo: 'Clinico', esp: 'Neumología' },
  [MED_REV]: { id: 'recMEDR', tipo: 'Revisor', esp: '' },
};
const PAC = 'CC-PAC-200001';
const REC_PAC = 'recPACREAL';
const PACIENTE = { id: REC_PAC, fields: { 'Código de paciente': PAC, 'Médico_principal': ['recMEDA'] } };

const NOTAS_PRIVADAS = {
  'Razonamiento clínico': 'Sospecho X por Y',
  'Notas internas': 'nota interna',
  'Pronóstico': 'Reservado',
  'Adherencia — observaciones': 'Camina 3d/semana',
};
const CONSULTA_DE_A = { id: 'recCONA', fields: {
  'Código de paciente ref': PAC, 'Código de médico ref': MED_A, 'Médico': ['recMEDA'],
  'Diagnóstico principal': 'Hipertensión gestacional', 'CIE-10': 'O13', 'Plan terapéutico': 'Labetalol 100 mg c/12h',
  'Padecimiento actual': 'Cefalea', ...NOTAS_PRIVADAS,
} };
const CONSULTA_DE_B = { id: 'recCONB', fields: {
  'Código de paciente ref': PAC, 'Código de médico ref': MED_B, 'Médico': ['recMEDB'],
  'Diagnóstico principal': 'Soplo funcional', ...NOTAS_PRIVADAS,
} };

function fakeRes() {
  return {
    statusCode: null, body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    setHeader() {}, end() { return this; },
  };
}

// mundo: { vinculos: [codigoMedico...], llaves: [{id, hash, vence, usada}], fallaVinc, fallaPostVinc, vigentes }
function instalarFetchMock(mundo, capturas) {
  const original = global.fetch;
  capturas.bitacora = [];
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const metodo = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    const falla = (s) => ({ ok: false, status: s, json: async () => ({}), text: async () => 'falla simulada' });

    if (u.includes(TBL_ACCESOS)) { capturas.bitacora.push(body); return ok({ records: [{ id: 'recACC' }] }); }
    if (u.includes(TBL_INTERCONSULTAS)) return ok({ records: [] });
    if (u.includes('VINCULACIONES')) {
      if (metodo === 'POST') { capturas.postVinc = body; return mundo.fallaPostVinc ? falla(422) : ok({ records: [{ id: 'recVINC' }] }); }
      if (mundo.fallaVinc) return falla(503);
      const vinc = (mundo.vinculos || []);
      const conMedico = vinc.filter(c => u.includes(`{Médico}="${c}"`));
      return ok({ records: conMedico.map(c => ({ id: 'recV' + c, fields: { Paciente: PAC, 'Médico': c } })) });
    }
    if (u.includes('LLAVES_ACCESO')) {
      if (metodo === 'POST') { capturas.postLlave = body; return ok({ records: [{ id: 'recLLNUEVA' }] }); }
      if (metodo === 'PATCH') { capturas.patchLlave = body; return ok({ id: 'recLL' }); }
      if (u.includes('IS_AFTER')) return ok({ records: Array.from({ length: mundo.vigentes || 0 }, (_, i) => ({ id: 'recV' + i })) });
      const ll = (mundo.llaves || []).find(l => u.includes(l.hash) && u.includes(PAC) && !l.usada);
      return ok({ records: ll ? [{ id: ll.id, fields: { 'Vence': ll.vence, 'Paciente': [REC_PAC] } }] : [] });
    }
    if (u.includes(`${TBL_MEDICOS}/`)) {
      const m = Object.values(MEDICOS).find(x => u.includes(x.id));
      return m ? ok({ id: m.id, fields: { 'Especialidad': m.esp } }) : falla(404);
    }
    if (u.includes(`${TBL_MEDICOS}?`)) {
      const cod = Object.keys(MEDICOS).find(c => u.includes(`"${c}"`));
      return ok({ records: cod ? [{ id: MEDICOS[cod].id, fields: { 'Código de médico': cod, 'Tipo de acceso': MEDICOS[cod].tipo } }] : [] });
    }
    if (u.includes(`${TBL_PACIENTES}?`) && metodo === 'GET') {
      if (u.includes('{Código de paciente}=') && !u.includes('OR(')) return ok({ records: u.includes(`"${PAC}"`) ? [PACIENTE] : [] });
      capturas.listaPacientes = u.replace(/\+/g, ' '); // URLSearchParams codifica espacios como '+'
      return ok({ records: [PACIENTE] });
    }
    if (u.includes(`${TBL_CONSULTAS}/`) && metodo === 'GET') {
      const c = [CONSULTA_DE_A, CONSULTA_DE_B].find(x => u.includes(x.id));
      return c ? ok(c) : falla(404);
    }
    if (u.includes(TBL_CONSULTAS)) {
      if (metodo === 'GET') return ok({ records: [CONSULTA_DE_A, CONSULTA_DE_B] });
      if (metodo === 'POST') { capturas.postConsulta = body; return ok({ id: 'recNUEVA', fields: body.fields }); }
      if (metodo === 'PATCH') { capturas.patchConsulta = body; return ok({ id: 'recX', fields: body.fields }); }
    }
    throw new Error(`fetch no mockeado en esta prueba: ${metodo} ${u}`);
  };
  return () => { global.fetch = original; };
}

function sinCongelar(rutaApi) {
  const ruta = require.resolve('../lib/congelamientoDatosPersonales.js');
  delete require.cache[ruta];
  const real = require(ruta);
  require.cache[ruta].exports = { ...real, CONGELADO: false };
  delete require.cache[require.resolve(rutaApi)];
  return require(rutaApi);
}

const tokenMed = (c) => generarToken({ tipo: 'medico', codigo: c, horas: 1 });
const tokenPac = (c) => generarToken({ tipo: 'paciente', codigo: c, horas: 1 });

async function airtable({ token, method = 'GET', query, body }, mundo = {}) {
  const capturas = {};
  const restaurar = instalarFetchMock(mundo, capturas);
  try {
    const res = fakeRes();
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    await sinCongelar('../api/airtable.js')({ method, headers, query, body: body || {} }, res);
    return { res, capturas };
  } finally { restaurar(); }
}

async function nova({ token, body }, mundo = {}) {
  const capturas = {};
  const restaurar = instalarFetchMock(mundo, capturas);
  try {
    const res = fakeRes();
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    await sinCongelar('../api/nova.js')({ method: 'POST', headers, body }, res);
    return { res, capturas };
  } finally { restaurar(); }
}

const FUTURO = new Date(Date.now() + 3600e3).toISOString();
const PASADO = new Date(Date.now() - 3600e3).toISOString();
const LLAVE = 'K7P4-QX9M';
const HASH = hashLlave(normalizarLlave(LLAVE));

// ─── lib/privacidadConsultas.js ─────────────────────────────────────

test('privacidad: el autor ve sus notas; el colega y el paciente no — diagnóstico y plan sí', () => {
  const [propia] = filtrarConsultasParaLector([CONSULTA_DE_A], { codigoMedico: MED_A, medicoRecId: 'recMEDA' });
  assert.strictEqual(propia.fields['Razonamiento clínico'], 'Sospecho X por Y');

  for (const lector of [{ codigoMedico: MED_B, medicoRecId: 'recMEDB' }, null]) {
    const [ajena] = filtrarConsultasParaLector([CONSULTA_DE_A], lector);
    for (const c of CAMPOS_PRIVADOS_AUTOR) assert.ok(!(c in ajena.fields), `${c} no debe salir`);
    assert.strictEqual(ajena.fields['Diagnóstico principal'], 'Hipertensión gestacional');
    assert.strictEqual(ajena.fields['Plan terapéutico'], 'Labetalol 100 mg c/12h');
    assert.strictEqual(ajena.fields['Padecimiento actual'], 'Cefalea');
  }
  assert.strictEqual(CONSULTA_DE_A.fields['Pronóstico'], 'Reservado', 'no muta el registro original');
});

test('privacidad: consulta histórica con ref "—" — el autor se reconoce por el link Médico', () => {
  const vieja = { id: 'r', fields: { 'Código de médico ref': '—', 'Médico': ['recMEDA'], ...NOTAS_PRIVADAS } };
  const [r] = filtrarConsultasParaLector([vieja], { codigoMedico: MED_A, medicoRecId: 'recMEDA' });
  assert.strictEqual(r.fields['Notas internas'], 'nota interna');
});

// ─── lib/vinculacion.js ────────────────────────────────────────────

test('llave: formato XXXX-XXXX sin caracteres ambiguos; normalizar acepta minúsculas y espacios', () => {
  for (let i = 0; i < 50; i++) assert.match(generarLlave(), /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  assert.strictEqual(normalizarLlave('k7p4 qx9m'), 'K7P4QX9M');
  assert.strictEqual(normalizarLlave('K7P4-QX9'), null);
  assert.strictEqual(normalizarLlave('O0I1-LLLL'), null);
});

// ─── autorizarPaciente: vía 'vinculado' ────────────────────────────

test('autorizarPaciente: médico vinculado → via "vinculado" con escritura; sin vínculo → 403', async () => {
  const capturas = {};
  let restaurar = instalarFetchMock({ vinculos: [MED_B] }, capturas);
  const { autorizarPaciente, ErrorAutorizacion } = require('../lib/autorizacion');
  try {
    const auth = await autorizarPaciente(MED_B, PAC, { requiereEscritura: true });
    assert.strictEqual(auth.via, 'vinculado');
    assert.strictEqual(auth.escritura, true);
    assert.strictEqual(auth.medicoRecId, 'recMEDB');
    await assert.rejects(() => autorizarPaciente(MED_C, PAC), (e) => e instanceof ErrorAutorizacion);
  } finally { restaurar(); }
});

test('autorizarPaciente: VINCULACIONES no responde → 502 explícito, nunca un 403 disfrazado', async () => {
  const restaurar = instalarFetchMock({ fallaVinc: true }, {});
  const { autorizarPaciente, ErrorAutorizacion } = require('../lib/autorizacion');
  try {
    await assert.rejects(() => autorizarPaciente(MED_B, PAC), (e) => !(e instanceof ErrorAutorizacion) && e.status === 502);
  } finally { restaurar(); }
});

// ─── /api/airtable: consultas ──────────────────────────────────────

test('consultas GET por el cardiólogo vinculado: ve diagnóstico y plan de ginecología, no sus notas; las suyas completas', async () => {
  const { res } = await airtable({ token: tokenMed(MED_B), query: { tabla: 'consultas', pacienteBuscado: PAC } }, { vinculos: [MED_B] });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  const deA = res.body.records.find(r => r.id === 'recCONA');
  const deB = res.body.records.find(r => r.id === 'recCONB');
  assert.strictEqual(deA.fields['Diagnóstico principal'], 'Hipertensión gestacional');
  assert.strictEqual(deA.fields['Plan terapéutico'], 'Labetalol 100 mg c/12h');
  for (const c of CAMPOS_PRIVADOS_AUTOR) assert.ok(!(c in deA.fields), `${c} de ginecología no debe llegar a cardiología`);
  assert.strictEqual(deB.fields['Razonamiento clínico'], 'Sospecho X por Y', 'sus propias notas sí');
});

test('consultas GET por el neumólogo SIN vínculo → 403 (el código solo no abre nada)', async () => {
  const { res } = await airtable({ token: tokenMed(MED_C), query: { tabla: 'consultas', pacienteBuscado: PAC } });
  assert.strictEqual(res.statusCode, 403);
});

test('consultas GET por el paciente: ve diagnósticos y planes, ninguna nota privada de ningún médico', async () => {
  const { res } = await airtable({ token: tokenPac(PAC), query: { tabla: 'consultas' } });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  for (const r of res.body.records) for (const c of CAMPOS_PRIVADOS_AUTOR) assert.ok(!(c in r.fields));
  assert.ok(res.body.records.some(r => r.fields['Diagnóstico principal']));
});

test('consultas: el paciente no puede crear ni modificar consultas (son registro del médico)', async () => {
  for (const method of ['POST', 'PATCH']) {
    const { res, capturas } = await airtable({ token: tokenPac(PAC), method, query: { tabla: 'consultas', recordId: 'recCONA' }, body: { fields: { 'Diagnóstico principal': 'otro' } } });
    assert.strictEqual(res.statusCode, 403, method);
    assert.strictEqual(capturas.postConsulta || capturas.patchConsulta, undefined);
  }
});

test('consultas PATCH: el cardiólogo vinculado NO modifica la consulta de ginecología; la suya sí', async () => {
  let r = await airtable({ token: tokenMed(MED_B), method: 'PATCH', query: { tabla: 'consultas', recordId: 'recCONA', pacienteBuscado: PAC }, body: { fields: { 'Plan terapéutico': 'x' } } }, { vinculos: [MED_B] });
  assert.strictEqual(r.res.statusCode, 403);
  assert.strictEqual(r.capturas.patchConsulta, undefined);
  r = await airtable({ token: tokenMed(MED_B), method: 'PATCH', query: { tabla: 'consultas', recordId: 'recCONB', pacienteBuscado: PAC }, body: { fields: { 'Plan terapéutico': 'x' } } }, { vinculos: [MED_B] });
  assert.strictEqual(r.res.statusCode, 200, JSON.stringify(r.res.body));
});

test('consultas POST: la autoría la fija el servidor desde el token, aunque el cliente mande otra', async () => {
  const { res, capturas } = await airtable({
    token: tokenMed(MED_B), method: 'POST', query: { tabla: 'consultas', pacienteBuscado: PAC },
    body: { fields: { 'Diagnóstico principal': 'Soplo', 'Código de médico ref': MED_A, 'Médico': ['recMEDA'] } },
  }, { vinculos: [MED_B] });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  assert.strictEqual(capturas.postConsulta.fields['Código de médico ref'], MED_B);
  assert.deepStrictEqual(capturas.postConsulta.fields['Médico'], ['recMEDB']);
});

// ─── /api/airtable: cartera del médico ─────────────────────────────

test('lista de pacientes: incluye a los vinculados por llave', async () => {
  const { res, capturas } = await airtable({ token: tokenMed(MED_B), query: { tabla: 'pacientes' } }, { vinculos: [MED_B] });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(capturas.listaPacientes.includes(`{Código de paciente}="${PAC}"`), capturas.listaPacientes);
});

test('lista de pacientes: si VINCULACIONES no responde → 502, nunca una cartera incompleta en silencio', async () => {
  const { res } = await airtable({ token: tokenMed(MED_B), query: { tabla: 'pacientes' } }, { fallaVinc: true });
  assert.strictEqual(res.statusCode, 502);
});

// ─── nova: paciente_generar_llave ──────────────────────────────────

test('generar llave: sin sesión o con sesión de médico → 401', async () => {
  for (const token of [null, tokenMed(MED_A)]) {
    const { res, capturas } = await nova({ token, body: { action: 'paciente_generar_llave' } });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(capturas.postLlave, undefined);
  }
});

test('generar llave: el paciente recibe la llave UNA vez; en Airtable solo queda el HMAC y vence en 24 h', async () => {
  const { res, capturas } = await nova({ token: tokenPac(PAC), body: { action: 'paciente_generar_llave' } });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  assert.match(res.body.llave, /^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  const f = capturas.postLlave.records[0].fields;
  assert.ok(!JSON.stringify(f).includes(res.body.llave.replace('-', '')), 'la llave en claro no se guarda');
  assert.strictEqual(f['Llave (hash)'], hashLlave(normalizarLlave(res.body.llave)));
  assert.deepStrictEqual(f['Paciente'], [REC_PAC]);
  const horas = (new Date(f['Vence']) - new Date(f['Creada'])) / 3600e3;
  assert.strictEqual(horas, 24);
});

test('generar llave: con 3 llaves vigentes sin usar → 429, no se crea otra', async () => {
  const { res, capturas } = await nova({ token: tokenPac(PAC), body: { action: 'paciente_generar_llave' } }, { vigentes: 3 });
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(capturas.postLlave, undefined);
});

// ─── nova: medico_vincular_paciente ────────────────────────────────

const vincular = (medico, llave, mundo) => nova({ token: tokenMed(medico), body: { action: 'medico_vincular_paciente', pacienteCode: PAC, llave } }, mundo);

test('vincular: llave correcta → se marca usada y se crea el vínculo con la especialidad', async () => {
  const { res, capturas } = await vincular(MED_B, 'k7p4 qx9m', { llaves: [{ id: 'recLL1', hash: HASH, vence: FUTURO }] });
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  assert.strictEqual(capturas.patchLlave.fields['Usada'], true);
  assert.strictEqual(capturas.patchLlave.fields['Usada por'], MED_B);
  const v = capturas.postVinc.records[0].fields;
  assert.strictEqual(v['Paciente'], PAC);
  assert.strictEqual(v['Médico'], MED_B);
  assert.deepStrictEqual(v['Médico (link)'], ['recMEDB']);
  assert.strictEqual(v['Especialidad'], 'Cardiología');
  assert.ok(capturas.bitacora.some(b => JSON.stringify(b).includes('Exitoso')));
});

test('vincular: llave equivocada, vencida o ya usada → mismo 403, no se consume nada ni se crea vínculo', async () => {
  const casos = [
    { llave: 'AAAA-BBBB', mundo: { llaves: [{ id: 'recLL1', hash: HASH, vence: FUTURO }] } },
    { llave: LLAVE, mundo: { llaves: [{ id: 'recLL1', hash: HASH, vence: PASADO }] } },
    { llave: LLAVE, mundo: { llaves: [{ id: 'recLL1', hash: HASH, vence: FUTURO, usada: true }] } },
  ];
  const mensajes = new Set();
  for (const c of casos) {
    const { res, capturas } = await vincular(MED_C, c.llave, c.mundo);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(capturas.patchLlave, undefined);
    assert.strictEqual(capturas.postVinc, undefined);
    mensajes.add(res.body.error);
  }
  assert.strictEqual(mensajes.size, 1, 'no se distingue qué falló');
});

test('vincular: sin llave (solo el código) → 400, el código no abre nada', async () => {
  const { res, capturas } = await vincular(MED_C, '', {});
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(capturas.postVinc, undefined);
});

test('vincular: el médico principal no gasta la llave del paciente', async () => {
  const { res, capturas } = await vincular(MED_A, LLAVE, { llaves: [{ id: 'recLL1', hash: HASH, vence: FUTURO }] });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.yaTeniaAcceso, true);
  assert.strictEqual(capturas.patchLlave, undefined);
});

test('vincular: Tipo de acceso Revisor → 403 y la llave queda intacta', async () => {
  const { res, capturas } = await vincular(MED_REV, LLAVE, { llaves: [{ id: 'recLL1', hash: HASH, vence: FUTURO }] });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(capturas.patchLlave, undefined);
});

test('vincular: si el vínculo no se guarda → 502 que dice que la llave se gastó (nunca "listo")', async () => {
  const { res } = await vincular(MED_B, LLAVE, { llaves: [{ id: 'recLL1', hash: HASH, vence: FUTURO }], fallaPostVinc: true });
  assert.strictEqual(res.statusCode, 502);
  assert.match(res.body.error, /NO se guardó/);
});
