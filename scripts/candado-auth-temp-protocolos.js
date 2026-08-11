// scripts/candado-auth-temp-protocolos.js
// CANDADO de la auditoría de seguridad (ago 2026): prueba que el fix del
// forwarder genérico cerró la fuga de PII de `temp` y la escritura indebida
// a `protocolos`, SIN romper la vía pre-auth de invitaciones DZW/referidos.
//
// Corre sin red: se stubea global.fetch. Los casos 403 retornan antes de
// cualquier fetch; los casos "sí pasa" se verifican interceptando la llamada
// a Airtable que HARÍA el forwarder (sin ejecutarla de verdad).
//
// Uso:  node scripts/candado-auth-temp-protocolos.js
// Sale con código 0 si TODOS los candados pasan; 1 si alguno falla.

process.env.SESSION_SECRET = 'candado-secret-solo-para-esta-prueba';
process.env.AIRTABLE_TOKEN = 'fake-airtable-token';

const { generarToken } = require('../lib/auth');
const handler = require('../api/airtable.js');

const TEMP_TABLE_ID = 'tblVOTed5MJSX1Vpy';       // alias `temp`
const PROTOCOLOS_TABLE_ID = 'tblMGnZxnEHHrjZl4'; // alias `protocolos`
const PACIENTES_TABLE_ID = 'tblyUcCfueFLJuvIv';  // alias `pacientes`

// ── Stub de fetch: registra cada URL pedida a Airtable y responde vacío ──
let fetchCalls = [];
global.fetch = async (url) => {
  fetchCalls.push(String(url));
  return {
    ok: true,
    status: 200,
    json: async () => ({ records: [] }),
  };
};

const tokenPaciente = generarToken({ tipo: 'paciente', codigo: 'CC-PAC-9999' });
const tokenVip = generarToken({ tipo: 'vip', codigo: 'DZW-TEST01' });

// ── Mock mínimo de req/res al estilo Vercel ──
function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
function run({ method = 'GET', query = {}, headers = {}, body }) {
  fetchCalls = [];
  const req = { method, query: { ...query }, headers, body };
  const res = mockRes();
  return Promise.resolve(handler(req, res)).then(() => res);
}
function authHeader(token) { return { authorization: `Bearer ${token}` }; }
// El forwarder arma la query con URLSearchParams (form-urlencoded: espacios
// como '+'). Normalizamos a texto plano para poder buscar el filtro tal cual.
function decodeUrl(u) { return decodeURIComponent(String(u).replace(/\+/g, ' ')); }
function algunaUrlContiene(txt) { return fetchCalls.some(u => decodeUrl(u).includes(txt)); }

// ── Aserciones ──
let fallos = 0;
function check(nombre, cond) {
  if (cond) {
    console.log(`  ✅ ${nombre}`);
  } else {
    console.log(`  ❌ ${nombre}`);
    fallos++;
  }
}

async function main() {
  console.log('CANDADO — fuga temp / escritura protocolos\n');

  // 1) GET ?tabla=temp con token de paciente → 403 (antes: volcaba PII)
  let r = await run({
    method: 'GET',
    query: { tabla: 'temp', filterByFormula: '{Nombre}!=""' },
    headers: authHeader(tokenPaciente),
  });
  check('GET temp + paciente → 403', r.statusCode === 403);
  check('  … y NO tocó Airtable (cortó antes del forwarder)', fetchCalls.length === 0);

  // 2) GET ?tabla=temp con token de vip → 403
  r = await run({
    method: 'GET',
    query: { tabla: 'temp', filterByFormula: '{Nombre}!=""' },
    headers: authHeader(tokenVip),
  });
  check('GET temp + vip → 403', r.statusCode === 403);
  check('  … y NO tocó Airtable', fetchCalls.length === 0);

  // 3) POST ?tabla=protocolos con token de paciente → 403 (catálogo read-only)
  r = await run({
    method: 'POST',
    query: { tabla: 'protocolos' },
    headers: authHeader(tokenPaciente),
    body: { fields: { 'Contraindicaciones': 'sabotaje' } },
  });
  check('POST protocolos + paciente → 403', r.statusCode === 403);
  check('  … y NO tocó Airtable', fetchCalls.length === 0);

  // 4) Vía PRE-AUTH de temp sigue viva (no romper autorregistro/dezawavip):
  //    GET sin token con match exacto de {Código invitación} debe pasar al
  //    forwarder y consultar la tabla temp con el filtro del cliente intacto.
  r = await run({
    method: 'GET',
    query: { tabla: 'temp', filterByFormula: '{Código invitación}="ABC123"', maxRecords: '1' },
    headers: {},
  });
  check('GET temp pre-auth (match exacto, sin token) → 200', r.statusCode === 200);
  check('  … reenvió a la tabla temp', algunaUrlContiene(TEMP_TABLE_ID));
  check('  … preservó el filterByFormula del cliente',
    algunaUrlContiene('{Código invitación}="ABC123"'));

  // ── Controles negativos: el 403 debe ser específico, no un bloqueo total ──

  // 5) GET ?tabla=protocolos con token de paciente → SIGUE permitido (lectura)
  r = await run({
    method: 'GET',
    query: { tabla: 'protocolos' },
    headers: authHeader(tokenPaciente),
  });
  check('GET protocolos + paciente → 200 (lectura sigue OK)', r.statusCode === 200);

  // 6) GET ?tabla=pacientes con token de paciente → OK y filtro forzado a SU código
  r = await run({
    method: 'GET',
    query: { tabla: 'pacientes' },
    headers: authHeader(tokenPaciente),
  });
  check('GET pacientes + paciente → 200 (acceso legítimo intacto)', r.statusCode === 200);
  check('  … con filtro forzado a su propio código',
    algunaUrlContiene(PACIENTES_TABLE_ID) &&
      algunaUrlContiene('{Código de paciente}="CC-PAC-9999"'));

  console.log('');
  if (fallos === 0) {
    console.log('TODOS LOS CANDADOS PASARON ✅');
    process.exit(0);
  } else {
    console.log(`${fallos} CANDADO(S) FALLARON ❌`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('Error inesperado en el candado:', e); process.exit(1); });
