// Red de seguridad de INTERCONSULTAS (CLAUDE.md §4 vía 3; cierra Pendiente 2
// de 630c106). Dos capas:
//
//  1) Unidad — los 10 casos pedidos, contra autorizarPaciente()/
//     viaInterconsulta() directamente (lib/autorizacion.js). Sin red, sin UI.
//  2) Extremo a extremo — la misma pareja de escenarios (sin interconsulta;
//     fallo de lectura de Airtable) contra los 7 call sites reales, para
//     probar el CABLEADO de cada endpoint, no la lógica de autorización (ya
//     cubierta en la capa 1). Los escenarios elegidos para el barrido son los
//     que NO requieren mockear el resto del pipeline de cada endpoint
//     (labs, OCR, etc.) porque autorizarPaciente() corta ANTES de llegar ahí
//     — así el barrido cubre los 7 sin necesitar 7 mocks distintos de "éxito".
//     El caso de escritura por método HTTP real (api/airtable.js:1029) tiene
//     su propia prueba dedicada, con mock de éxito solo para ese sitio.
//
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.NODE_ENV = 'development'; // pasa el guard de origen CORS de nova.js

const test = require('node:test');
const assert = require('node:assert');

const { generarToken } = require('../lib/auth');
const { autorizarPaciente, ErrorAutorizacion, MENSAJE_NO_DISPONIBLE } = require('../lib/autorizacion');

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const TBL_INTERCONSULTAS = 'tbl9PS3KNBxbRVriV';
const TBL_HISTORIA = 'tblm2xUADazitHisR';

const REC_PAC = 'recPAC0000000001';
const REC_PRINC = 'recPRINC000000001';
const REC_CONS = 'recCONS0000000001';
const COD_PAC = 'CC-PAC-900001';
const COD_PRINC = 'CCMED-PRINC01';
const COD_CONS = 'CCMED-CONS01';

const AHORA = Date.now();
const FUTURO = new Date(AHORA + 3600_000).toISOString();
const PASADO = new Date(AHORA - 3600_000).toISOString();

function registroPaciente() {
  return { records: [{ id: REC_PAC, fields: { 'Código de paciente': COD_PAC, 'Médico_principal': [REC_PRINC] } }] };
}
function registroMedico(codigo, recId) {
  return { records: [{ id: recId, fields: { 'Código de médico': codigo, 'Tipo de acceso': 'Clinico' } }] };
}
// Estado != "Activa" nunca llega mockeado con ese estado: la formula que
// arma viaInterconsulta() ya incluye {Estado}="Activa", así que un registro
// Solicitada/Cerrada/Revocada es justo lo que Airtable real NUNCA devuelve
// para esa consulta — se simula como lista vacía, igual que "sin
// interconsulta". Lo que SÍ puede devolver Airtable real con Estado="Activa"
// es un registro ya vencido por fecha (Airtable no filtra por fecha en esta
// formula) — ese caso sí trae un registro, con vencimiento en el pasado.
function registroInterconsulta({ permiteEscritura = false, vencimiento = FUTURO } = {}) {
  return {
    records: [{
      id: 'recIC0000000001',
      fields: {
        'Paciente': COD_PAC,
        'Médico consultado': COD_CONS,
        'Estado': 'Activa',
        'Permite escritura': permiteEscritura,
        'Fecha de vencimiento': vencimiento,
      },
    }],
  };
}

// interconsultaResp: { records:[...] } | { fallo:true, status:N } | undefined (= sin interconsulta)
function instalarFetchMock(interconsultaResp, extra) {
  const original = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (extra) {
      const r = extra(u, ok);
      if (r) return r;
    }
    if (u.includes(TBL_PACIENTES)) {
      if (u.includes(encodeURIComponent(COD_PAC))) return ok(registroPaciente());
      return ok({ records: [] });
    }
    if (u.includes(TBL_MEDICOS)) {
      if (u.includes(encodeURIComponent(COD_PRINC))) return ok(registroMedico(COD_PRINC, REC_PRINC));
      if (u.includes(encodeURIComponent(COD_CONS))) return ok(registroMedico(COD_CONS, REC_CONS));
      return ok({ records: [] });
    }
    if (u.includes(TBL_INTERCONSULTAS)) {
      if (interconsultaResp && interconsultaResp.fallo) {
        return { ok: false, status: interconsultaResp.status || 500, json: async () => ({}), text: async () => 'error simulado de Airtable' };
      }
      return ok(interconsultaResp || { records: [] });
    }
    throw new Error(`fetch no mockeado en esta prueba: ${u}`);
  };
  return () => { global.fetch = original; };
}

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

// ═══ CAPA 1 — unidad, los 10 casos, contra autorizarPaciente() ═══════

test('1) interconsulta Activa vigente + lectura -> concede acceso', async () => {
  const restaurar = instalarFetchMock(registroInterconsulta({ permiteEscritura: false, vencimiento: FUTURO }));
  try {
    const auth = await autorizarPaciente(COD_CONS, COD_PAC);
    assert.strictEqual(auth.via, 'interconsulta');
    assert.strictEqual(auth.escritura, false);
    assert.strictEqual(auth.medicoRecId, REC_CONS);
  } finally { restaurar(); }
});

test('2) interconsulta Activa + Permite escritura=false + requiereEscritura -> 403', async () => {
  const restaurar = instalarFetchMock(registroInterconsulta({ permiteEscritura: false, vencimiento: FUTURO }));
  try {
    await assert.rejects(
      () => autorizarPaciente(COD_CONS, COD_PAC, { requiereEscritura: true }),
      (err) => { assert.ok(err instanceof ErrorAutorizacion); assert.strictEqual(err.status, 403); return true; }
    );
  } finally { restaurar(); }
});

test('3) interconsulta Activa + Permite escritura=true + requiereEscritura -> concede, escritura=true', async () => {
  const restaurar = instalarFetchMock(registroInterconsulta({ permiteEscritura: true, vencimiento: FUTURO }));
  try {
    const auth = await autorizarPaciente(COD_CONS, COD_PAC, { requiereEscritura: true });
    assert.strictEqual(auth.via, 'interconsulta');
    assert.strictEqual(auth.escritura, true);
  } finally { restaurar(); }
});

test('4) interconsulta Activa pero vencida por fecha -> 403 (Airtable no filtra por fecha, lo filtra el código)', async () => {
  const restaurar = instalarFetchMock(registroInterconsulta({ permiteEscritura: true, vencimiento: PASADO }));
  try {
    await assert.rejects(
      () => autorizarPaciente(COD_CONS, COD_PAC),
      (err) => { assert.ok(err instanceof ErrorAutorizacion); return true; }
    );
  } finally { restaurar(); }
});

test('5) Estado Cerrada -> 403 (Airtable ya lo excluyó del filtro Estado="Activa")', async () => {
  const restaurar = instalarFetchMock({ records: [] }); // lo que Airtable real devuelve para Estado != Activa
  try {
    await assert.rejects(() => autorizarPaciente(COD_CONS, COD_PAC), (err) => { assert.ok(err instanceof ErrorAutorizacion); return true; });
  } finally { restaurar(); }
});

test('6) Estado Revocada -> 403', async () => {
  const restaurar = instalarFetchMock({ records: [] });
  try {
    await assert.rejects(() => autorizarPaciente(COD_CONS, COD_PAC), (err) => { assert.ok(err instanceof ErrorAutorizacion); return true; });
  } finally { restaurar(); }
});

test('7) Estado Solicitada -> 403', async () => {
  const restaurar = instalarFetchMock({ records: [] });
  try {
    await assert.rejects(() => autorizarPaciente(COD_CONS, COD_PAC), (err) => { assert.ok(err instanceof ErrorAutorizacion); return true; });
  } finally { restaurar(); }
});

test('8) sin interconsulta -> 403, mismo mensaje único', async () => {
  const restaurar = instalarFetchMock({ records: [] });
  try {
    await assert.rejects(
      () => autorizarPaciente(COD_CONS, COD_PAC),
      (err) => { assert.ok(err instanceof ErrorAutorizacion); assert.strictEqual(err.message, MENSAJE_NO_DISPONIBLE); return true; }
    );
  } finally { restaurar(); }
});

test('9) médico principal concede acceso SIEMPRE, sin siquiera consultar INTERCONSULTAS', async () => {
  const original = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes(TBL_INTERCONSULTAS)) throw new Error('regresión: no debería consultar INTERCONSULTAS para el médico principal');
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.includes(TBL_PACIENTES)) return ok(registroPaciente());
    if (u.includes(TBL_MEDICOS)) return ok(registroMedico(COD_PRINC, REC_PRINC));
    throw new Error(`fetch no mockeado: ${u}`);
  };
  try {
    const auth = await autorizarPaciente(COD_PRINC, COD_PAC, { requiereEscritura: true });
    assert.strictEqual(auth.via, 'principal');
    assert.strictEqual(auth.escritura, true);
  } finally { global.fetch = original; }
});

test('10) fallo de lectura de Airtable en INTERCONSULTAS -> error explícito, NUNCA 403/null', async () => {
  const restaurar = instalarFetchMock({ fallo: true, status: 500 });
  try {
    await assert.rejects(
      () => autorizarPaciente(COD_CONS, COD_PAC),
      (err) => {
        assert.ok(!(err instanceof ErrorAutorizacion), 'un fallo de infraestructura no debe disfrazarse de "no autorizado"');
        assert.strictEqual(err.status, 502);
        assert.match(err.message, /airtable respondió 500 al leer INTERCONSULTAS/);
        return true;
      }
    );
  } finally { restaurar(); }
});

// ═══ CAPA 2 — extremo a extremo, contra los 7 call sites reales ══════

function requestsPorSitio(token) {
  return [
    {
      sitio: 'airtable:historia (TABLAS_EXPEDIENTE_MEDICO)',
      async ejecutar() {
        delete require.cache[require.resolve('../api/airtable.js')];
        const h = require('../api/airtable.js');
        const req = { method: 'GET', headers: { authorization: `Bearer ${token}` }, query: { tabla: 'historia', pacienteBuscado: COD_PAC }, body: {} };
        const res = fakeRes();
        await h(req, res);
        return res;
      },
    },
    {
      sitio: 'airtable:graficas_series',
      async ejecutar() {
        const h = require('../api/airtable.js');
        const req = { method: 'GET', headers: { authorization: `Bearer ${token}` }, query: { tabla: 'consultas', accion: 'graficas_series', codigoPaciente: COD_PAC, codigos: 'peso' }, body: {} };
        const res = fakeRes();
        await h(req, res);
        return res;
      },
    },
    {
      sitio: 'nova:medico_tabla_labs',
      async ejecutar() {
        delete require.cache[require.resolve('../api/nova.js')];
        const h = require('../api/nova.js');
        const req = { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: { action: 'medico_tabla_labs', pacienteCode: COD_PAC } };
        const res = fakeRes();
        await h(req, res);
        return res;
      },
    },
    {
      sitio: 'nova:medico_resumen_labs',
      async ejecutar() {
        const h = require('../api/nova.js');
        const req = { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: { action: 'medico_resumen_labs', pacienteCode: COD_PAC } };
        const res = fakeRes();
        await h(req, res);
        return res;
      },
    },
    {
      sitio: 'nova:medico_guardar_labs_rapidos',
      async ejecutar() {
        const h = require('../api/nova.js');
        const req = { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: { action: 'medico_guardar_labs_rapidos', pacienteCode: COD_PAC, valoresRapidos: [] } };
        const res = fakeRes();
        await h(req, res);
        return res;
      },
    },
    {
      sitio: 'nova:medico_subir_estudio',
      async ejecutar() {
        const h = require('../api/nova.js');
        const req = { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: { action: 'medico_subir_estudio', pacienteCode: COD_PAC, fileBase64: 'AAAA', mediaType: 'application/pdf' } };
        const res = fakeRes();
        await h(req, res);
        return res;
      },
    },
    {
      sitio: 'nova-asistente-clinico:completitud_expediente',
      async ejecutar() {
        delete require.cache[require.resolve('../api/nova-asistente-clinico.js')];
        const h = require('../api/nova-asistente-clinico.js');
        const req = { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: { accion: 'completitud_expediente', codigoPaciente: COD_PAC } };
        const res = fakeRes();
        await h(req, res);
        return res;
      },
    },
  ];
}

test('Los 7 call sites dan 403 "Paciente no disponible" sin interconsulta (CCMED-CONS01 no es principal de CC-PAC-900001)', async () => {
  const restaurar = instalarFetchMock({ records: [] });
  const token = generarToken({ tipo: 'medico', codigo: COD_CONS });
  const resultados = [];
  try {
    for (const sitio of requestsPorSitio(token)) {
      const res = await sitio.ejecutar();
      resultados.push({ sitio: sitio.sitio, status: res.statusCode, body: res.body });
    }
  } finally { restaurar(); }

  assert.strictEqual(resultados.length, 7, 'se probaron los 7 call sites');
  for (const r of resultados) {
    assert.strictEqual(r.status, 403, `${r.sitio} debería dar 403, dio ${r.status}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body && r.body.error, MENSAJE_NO_DISPONIBLE, `${r.sitio}: ${JSON.stringify(r.body)}`);
  }
});

test('Los 7 call sites dan error explícito (NO 403) si Airtable falla leyendo INTERCONSULTAS', async () => {
  const restaurar = instalarFetchMock({ fallo: true, status: 500 });
  const token = generarToken({ tipo: 'medico', codigo: COD_CONS });
  const resultados = [];
  try {
    for (const sitio of requestsPorSitio(token)) {
      const res = await sitio.ejecutar();
      resultados.push({ sitio: sitio.sitio, status: res.statusCode, body: res.body });
    }
  } finally { restaurar(); }

  assert.strictEqual(resultados.length, 7, 'se probaron los 7 call sites');
  for (const r of resultados) {
    // El bug original que esto corrige: un fallo de infraestructura
    // disfrazado de "no autorizado" (403). Cada call site tiene su propio
    // catch (errAuth instanceof ErrorAutorizacion) -> else 502 genérico —
    // esta prueba confirma que los 7 respetan ese contrato, no solo uno.
    assert.notStrictEqual(r.status, 403, `${r.sitio}: un fallo de Airtable NO debe verse como 403, dio: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.status, 502, `${r.sitio}: se esperaba 502 (falla ruidosa), dio ${r.status}: ${JSON.stringify(r.body)}`);
  }
});

// ── api/airtable.js:1029 — la escritura se decide por el MÉTODO HTTP real,
//    nunca por algo que mande el cliente. Interconsulta de solo lectura:
//    GET debe pasar, POST debe caer, y un cliente que intente mandar una
//    bandera propia para simular "esto es lectura" no tiene ningún efecto
//    porque el código nunca lee tal bandera — requiereEscritura sale de
//    `req.method !== 'GET'`, punto.
test('api/airtable.js:1029 — GET pasa con interconsulta de solo lectura, POST el mismo par cae en 403', async () => {
  const token = generarToken({ tipo: 'medico', codigo: COD_CONS });

  // GET: requiereEscritura=false -> la interconsulta de solo lectura basta.
  {
    const restaurar = instalarFetchMock(registroInterconsulta({ permiteEscritura: false, vencimiento: FUTURO }), (u, ok) => {
      if (u.includes(TBL_HISTORIA)) return ok({ records: [] }); // reenvío genérico tras pasar el gate
      return null;
    });
    try {
      delete require.cache[require.resolve('../api/airtable.js')];
      const h = require('../api/airtable.js');
      const req = { method: 'GET', headers: { authorization: `Bearer ${token}` }, query: { tabla: 'historia', pacienteBuscado: COD_PAC }, body: {} };
      const res = fakeRes();
      await h(req, res);
      assert.notStrictEqual(res.statusCode, 403, `GET no debería caer en 403: ${JSON.stringify(res.body)}`);
    } finally { restaurar(); }
  }

  // POST del mismo par médico/paciente, misma interconsulta (sin permiso de
  // escritura): requiereEscritura=true (por ser POST) -> 403, aunque el
  // cliente mande un campo cualquiera pretendiendo indicar "esto es lectura".
  {
    const restaurar = instalarFetchMock(registroInterconsulta({ permiteEscritura: false, vencimiento: FUTURO }));
    try {
      const h = require('../api/airtable.js');
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        query: { tabla: 'historia', pacienteBuscado: COD_PAC, requiereEscritura: 'false' }, // el cliente miente; el código ni lo lee
        body: { fields: {} },
      };
      const res = fakeRes();
      await h(req, res);
      assert.strictEqual(res.statusCode, 403, `POST debería caer en 403 (interconsulta de solo lectura), dio ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body && res.body.error, MENSAJE_NO_DISPONIBLE);
    } finally { restaurar(); }
  }
});
