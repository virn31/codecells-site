// Suite de autorizarPaciente() (CLAUDE.md §4) y de los cuatro endpoints
// que deben pasar por ella tras 630c106 Pendiente 3: 630c106 cerró la
// enumeración de PACIENTES, pero historia/consultas/labs, medico_tabla_labs,
// medico_resumen_labs y graficas_series seguían leyendo el expediente de
// CUALQUIER paciente. Sin dependencias: runner nativo de Node.
// Correr con: node --test
//
// Escenario real (datos verificados contra Airtable antes de escribir esto):
// CC-PAC-635281 (Abel Otero Beltrán) es paciente de CCMED-VIRN01
// (Médico_principal -> recDQBB7QxgWdZVeB). CCMED-JCG01 (recZRwNiyIuBbBYJy)
// NO es su médico principal, aunque SÍ tiene "Ver todos los pacientes"=true
// en MÉDICOS — ese flag es, desde 630c106, solo permiso admin del bot de
// Telegram, no visibilidad de expediente (ver comentario en
// lib/autorizacion.js). Si algún día ese flag empezara a colar aquí, este
// test lo detectaría: JCG01 dejaría de recibir 403 en las cuatro vías.

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.NODE_ENV = 'development'; // pasa el guard de origen CORS de nova.js sin pelear con ALLOWED_ORIGINS

const test = require('node:test');
const assert = require('node:assert');

const { generarToken } = require('../lib/auth');
const { autorizarPaciente, ErrorAutorizacion, MENSAJE_NO_DISPONIBLE } = require('../lib/autorizacion');

const REC_ABEL = 'recc9S87wcXhtRARc';
const REC_VIRN01 = 'recDQBB7QxgWdZVeB';
const REC_JCG01 = 'recZRwNiyIuBbBYJy';
const REC_DEMO01 = 'recDEMO00000000001';

const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';

// Fixture mínima: solo lo que autorizarPaciente() en verdad lee de cada
// tabla (record id + los campos que usa). Nada de datos clínicos reales.
function registroAbel() {
  return {
    records: [{
      id: REC_ABEL,
      fields: { 'Código de paciente': 'CC-PAC-635281', 'Médico_principal': [REC_VIRN01] },
    }],
  };
}
function registroDemo() {
  return {
    records: [{
      id: REC_DEMO01,
      fields: { 'Código de paciente': 'CC-PAC-DEMO01', 'Es demo': true },
    }],
  };
}
function registroMedico(codigo, recId) {
  return { records: [{ id: recId, fields: { 'Código de médico': codigo } }] };
}

// Mock de fetch: enruta por tabla + código exacto pedido en filterByFormula,
// nunca por coincidencia parcial — si el código no está mapeado, responde
// "no encontrado" (fetch real de Airtable ante un filtro sin match), no un
// error de red. Así un bug de prefijo (CCMED-JORGE calzando CCMED-JORGE01)
// se vería como "no encontrado" y el test lo atraparía como 403 correcto,
// no como falso positivo por accidente del mock.
function instalarFetchMock() {
  const original = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.includes(TBL_PACIENTES)) {
      if (u.includes(encodeURIComponent('CC-PAC-635281'))) return ok(registroAbel());
      if (u.includes(encodeURIComponent('CC-PAC-DEMO01'))) return ok(registroDemo());
      return ok({ records: [] });
    }
    if (u.includes(TBL_MEDICOS)) {
      if (u.includes(encodeURIComponent('CCMED-VIRN01'))) return ok(registroMedico('CCMED-VIRN01', REC_VIRN01));
      if (u.includes(encodeURIComponent('CCMED-JCG01'))) return ok(registroMedico('CCMED-JCG01', REC_JCG01));
      return ok({ records: [] }); // incluye CCMED-JORGE: no existe tal médico
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

// ─── autorizarPaciente() — unidad ──────────────────────────────────

test('autorizarPaciente: JCG01 NO autoriza al paciente de VIRN01 (403, mensaje único)', async () => {
  const restaurar = instalarFetchMock();
  try {
    await assert.rejects(
      () => autorizarPaciente('CCMED-JCG01', 'CC-PAC-635281'),
      (err) => {
        assert.ok(err instanceof ErrorAutorizacion);
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.message, MENSAJE_NO_DISPONIBLE);
        return true;
      }
    );
  } finally { restaurar(); }
});

test('autorizarPaciente: paciente inexistente da EXACTAMENTE el mismo error que paciente ajeno', async () => {
  const restaurar = instalarFetchMock();
  try {
    await assert.rejects(
      () => autorizarPaciente('CCMED-JCG01', 'CC-PAC-NOEXISTE'),
      (err) => {
        assert.ok(err instanceof ErrorAutorizacion);
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.message, MENSAJE_NO_DISPONIBLE);
        return true;
      }
    );
  } finally { restaurar(); }
});

test('autorizarPaciente: VIRN01 SÍ autoriza a su propio paciente (vía principal, escritura permitida)', async () => {
  const restaurar = instalarFetchMock();
  try {
    const auth = await autorizarPaciente('CCMED-VIRN01', 'CC-PAC-635281', { requiereEscritura: true });
    assert.strictEqual(auth.recId, REC_ABEL);
    assert.strictEqual(auth.via, 'principal');
    assert.strictEqual(auth.escritura, true);
  } finally { restaurar(); }
});

test('autorizarPaciente: demo se lee (vía demo) pero requiereEscritura da 403, SIN excepción', async () => {
  const restaurar = instalarFetchMock();
  try {
    const auth = await autorizarPaciente('CCMED-JCG01', 'CC-PAC-DEMO01');
    assert.strictEqual(auth.via, 'demo');
    assert.strictEqual(auth.escritura, false);

    await assert.rejects(
      () => autorizarPaciente('CCMED-JCG01', 'CC-PAC-DEMO01', { requiereEscritura: true }),
      (err) => { assert.ok(err instanceof ErrorAutorizacion); return true; }
    );
  } finally { restaurar(); }
});

test('autorizarPaciente: "CCMED-JORGE" no cala como prefijo de "CCMED-JORGE01"', async () => {
  const restaurar = instalarFetchMock();
  try {
    // CC-PAC-635281 es de VIRN01, no de JORGE01 — pero la prueba real del
    // prefijo es que "CCMED-JORGE" (que no existe como médico) nunca
    // resuelve a ningún recordId, así que jamás puede calzar por substring
    // contra el link de ningún paciente, sea o no el correcto.
    await assert.rejects(
      () => autorizarPaciente('CCMED-JORGE', 'CC-PAC-635281'),
      (err) => { assert.ok(err instanceof ErrorAutorizacion); return true; }
    );
  } finally { restaurar(); }
});

// ─── Los cuatro call sites — extremo a extremo, mismo mensaje ─────

test('Los cuatro endpoints devuelven 403 "Paciente no disponible" para CCMED-JCG01 pidiendo CC-PAC-635281', async () => {
  const restaurar = instalarFetchMock();
  const tokenJCG01 = generarToken({ tipo: 'medico', codigo: 'CCMED-JCG01' });
  const resultados = [];

  try {
    // 1) /api/airtable — tabla=historia (representa historia/consultas/labs,
    //    los tres pasan por el mismo bloque TABLAS_EXPEDIENTE_MEDICO).
    {
      delete require.cache[require.resolve('../api/airtable.js')];
      const airtableHandler = require('../api/airtable.js');
      const req = {
        method: 'GET',
        headers: { authorization: `Bearer ${tokenJCG01}` },
        query: { tabla: 'historia', pacienteBuscado: 'CC-PAC-635281' },
        body: {},
      };
      const res = fakeRes();
      await airtableHandler(req, res);
      resultados.push({ sitio: 'airtable:historia', status: res.statusCode, body: res.body });
    }

    // 2) /api/airtable — accion=graficas_series
    {
      const airtableHandler = require('../api/airtable.js');
      const req = {
        method: 'GET',
        headers: { authorization: `Bearer ${tokenJCG01}` },
        query: { tabla: 'consultas', accion: 'graficas_series', codigoPaciente: 'CC-PAC-635281', codigos: 'peso' },
        body: {},
      };
      const res = fakeRes();
      await airtableHandler(req, res);
      resultados.push({ sitio: 'airtable:graficas_series', status: res.statusCode, body: res.body });
    }

    // 3) /api/nova — medico_tabla_labs
    {
      delete require.cache[require.resolve('../api/nova.js')];
      const novaHandler = require('../api/nova.js');
      const req = {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenJCG01}` },
        body: { action: 'medico_tabla_labs', pacienteCode: 'CC-PAC-635281' },
      };
      const res = fakeRes();
      await novaHandler(req, res);
      resultados.push({ sitio: 'nova:medico_tabla_labs', status: res.statusCode, body: res.body });
    }

    // 4) /api/nova — medico_resumen_labs
    {
      const novaHandler = require('../api/nova.js');
      const req = {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenJCG01}` },
        body: { action: 'medico_resumen_labs', pacienteCode: 'CC-PAC-635281' },
      };
      const res = fakeRes();
      await novaHandler(req, res);
      resultados.push({ sitio: 'nova:medico_resumen_labs', status: res.statusCode, body: res.body });
    }
  } finally {
    restaurar();
  }

  assert.strictEqual(resultados.length, 4, 'se probaron los cuatro call sites');
  for (const r of resultados) {
    assert.strictEqual(r.status, 403, `${r.sitio} debería dar 403, dio ${r.status}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body && r.body.error, MENSAJE_NO_DISPONIBLE, `${r.sitio} debería dar el mensaje único "${MENSAJE_NO_DISPONIBLE}", dio: ${JSON.stringify(r.body)}`);
  }
});
