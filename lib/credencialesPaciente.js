// lib/credencialesPaciente.js
// Identidad del paciente (SPEC-PACIENTE-UNICO.md §3). El código CC-PAC- es
// un IDENTIFICADOR, nunca una credencial: los códigos son secuenciales y
// aparecen en recetas, QR y capturas. La credencial es un PIN de 6 dígitos
// que el paciente crea al usar una liga de activación de un solo uso que le
// da su médico (portal o kiosco). Todo se verifica en el servidor.
//
// La credencial vive en CREDENCIALES_PACIENTE, una tabla que NO está en
// TABLAS_PERMITIDAS de api/airtable.js: el proxy y auth-login devuelven el
// registro completo de PACIENTES a médicos y pacientes, así que un hash de
// PIN ahí se filtraría. Se referencia por NOMBRE (su ID cambia entre bases).

const crypto = require('crypto');

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');
const TABLA = 'CREDENCIALES_PACIENTE';

const HORAS_LIGA = 72;            // D1
const LARGO_PIN = 6;              // D2
const FALLOS_POR_BLOQUEO = 5;     // cada 5 fallos seguidos → bloqueo temporal
const MINUTOS_BLOQUEO = 15;
const FALLOS_MAXIMOS = 10;        // al llegar aquí solo una liga nueva desbloquea

// scrypt: ~16 MB y unas decenas de ms por intento — barato para el servidor,
// caro para quien tenga una copia de la tabla y quiera probar los 10^6 PINs.
const SCRYPT = { N: 16384, r: 8, p: 1, largo: 32 };

function url(sufijo = '') {
  return `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLA)}${sufijo}`;
}

function cabeceras() {
  return { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
}

function escaparFormula(v) { return String(v).replace(/"/g, '\\"'); }

// ── PIN ────────────────────────────────────────────────────────────
function pinValido(pin) {
  return typeof pin === 'string' && new RegExp(`^\\d{${LARGO_PIN}}$`).test(pin);
}

// Rechaza los PIN que se prueban primero: todos iguales, escaleras, y
// patrones repetidos (121212, 123123).
function pinTrivial(pin) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = pin.split('').map(Number);
  const sube = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10);
  const baja = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10);
  if (sube || baja) return true;
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d\d\d)\1$/.test(pin)) return true;
  return false;
}

function hashPin(pin) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(pin, sal, SCRYPT.largo, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('base64')}$${h.toString('base64')}`;
}

function verificarPin(pin, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, 'base64');
  const calculado = crypto.scryptSync(String(pin), Buffer.from(salB64, 'base64'), esperado.length, { N: Number(N), r: Number(r), p: Number(p) });
  return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
}

// ── Liga de activación ─────────────────────────────────────────────
function generarLiga() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashLiga(liga) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) throw new Error('SESSION_SECRET no configurado — no se pueden manejar ligas de activación.');
  return crypto.createHmac('sha256', secreto).update(`liga-activacion:${liga}`).digest('hex');
}

function ligaConForma(liga) {
  return typeof liga === 'string' && /^[A-Za-z0-9_-]{43}$/.test(liga);
}

// ── Estado de bloqueo ──────────────────────────────────────────────
// Devuelve null si puede intentar, o { definitivo, minutos }.
function estadoBloqueo(fields, ahora = Date.now()) {
  const fallos = Number(fields['Intentos fallidos'] || 0);
  if (fallos >= FALLOS_MAXIMOS) return { definitivo: true, minutos: null };
  const hasta = fields['Bloqueado hasta'] ? new Date(fields['Bloqueado hasta']).getTime() : 0;
  if (hasta > ahora) return { definitivo: false, minutos: Math.ceil((hasta - ahora) / 60000) };
  return null;
}

// Campos a escribir tras un PIN incorrecto.
function camposTrasFallo(fields, ahora = Date.now()) {
  const fallos = Number(fields['Intentos fallidos'] || 0) + 1;
  const out = { 'Intentos fallidos': fallos };
  if (fallos < FALLOS_MAXIMOS && fallos % FALLOS_POR_BLOQUEO === 0) {
    out['Bloqueado hasta'] = new Date(ahora + MINUTOS_BLOQUEO * 60000).toISOString();
  }
  return out;
}

// ── Airtable ───────────────────────────────────────────────────────
// Un fallo de lectura se lanza con status 502 — nunca se traduce a "no
// existe" (CLAUDE.md §6: Airtable caído no es lo mismo que cuenta sin activar).
async function leerPorCodigo(codigoPaciente) {
  const formula = `{Código de paciente ref}="${escaparFormula(codigoPaciente)}"`;
  const r = await fetch(`${url()}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`, { headers: cabeceras() });
  if (!r.ok) { const e = new Error(`CREDENCIALES_PACIENTE respondió ${r.status}`); e.status = 502; throw e; }
  return ((await r.json()).records || [])[0] || null;
}

async function leerPorLiga(hash) {
  const formula = `{Liga (hash)}="${escaparFormula(hash)}"`;
  const r = await fetch(`${url()}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`, { headers: cabeceras() });
  if (!r.ok) { const e = new Error(`CREDENCIALES_PACIENTE respondió ${r.status}`); e.status = 502; throw e; }
  return ((await r.json()).records || [])[0] || null;
}

async function actualizar(recordId, fields) {
  const r = await fetch(url(`/${recordId}`), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ fields }) });
  if (!r.ok) { const e = new Error(`CREDENCIALES_PACIENTE PATCH ${r.status}`); e.status = 502; throw e; }
  return r.json();
}

async function crear(fields) {
  const r = await fetch(url(), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ records: [{ fields }] }) });
  if (!r.ok) { const e = new Error(`CREDENCIALES_PACIENTE POST ${r.status}`); e.status = 502; throw e; }
  return ((await r.json()).records || [])[0];
}

module.exports = {
  TABLA, HORAS_LIGA, LARGO_PIN, FALLOS_POR_BLOQUEO, MINUTOS_BLOQUEO, FALLOS_MAXIMOS,
  pinValido, pinTrivial, hashPin, verificarPin,
  generarLiga, hashLiga, ligaConForma,
  estadoBloqueo, camposTrasFallo,
  leerPorCodigo, leerPorLiga, actualizar, crear,
};
