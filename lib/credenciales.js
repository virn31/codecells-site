// lib/credenciales.js
// PIN de médicos y pacientes (SPEC-PACIENTE-UNICO.md §3; el médico desde
// 2026-10-24, decisión de Víctor: "su clave será el PIN, lo mismo para los
// pacientes"). El código (CC-PAC-, CCMED-) es un IDENTIFICADOR, nunca una
// credencial: los códigos son secuenciales o adivinables y aparecen en
// recetas, QR y capturas. La credencial es un PIN de 6 dígitos que se crea
// con una liga de activación de un solo uso. Todo se verifica en el servidor.
//
// Cada tipo tiene su tabla (CREDENCIALES_PACIENTE, CREDENCIALES_MEDICO), que
// NO está en TABLAS_PERMITIDAS de api/airtable.js: el proxy y auth-login
// devuelven el registro completo de PACIENTES / MÉDICOS, así que un hash de
// PIN ahí se filtraría. Se referencian por NOMBRE (su ID cambia entre bases).

const crypto = require('crypto');

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');

const HORAS_LIGA = 72;            // D1
const LARGO_PIN = 6;              // D2
const FALLOS_POR_BLOQUEO = 5;     // cada 5 fallos seguidos → bloqueo temporal
const MINUTOS_BLOQUEO = 15;
const FALLOS_MAXIMOS = 10;        // al llegar aquí solo una liga nueva desbloquea

// scrypt: ~16 MB y unas decenas de ms por intento — barato para el servidor,
// caro para quien tenga una copia de la tabla y quiera probar los 10^6 PINs.
const SCRYPT = { N: 16384, r: 8, p: 1, largo: 32 };

function cabeceras() {
  return { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
}

function escaparFormula(v) { return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

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
function tablaDeCredenciales({ tabla, campoCodigo }) {
  const url = (sufijo = '') => `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tabla)}${sufijo}`;
  async function buscarUno(formula) {
    const r = await fetch(`${url()}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`, { headers: cabeceras() });
    if (!r.ok) { const e = new Error(`${tabla} respondió ${r.status}`); e.status = 502; throw e; }
    return ((await r.json()).records || [])[0] || null;
  }
  return {
    TABLA: tabla,
    CAMPO_CODIGO: campoCodigo,
    leerPorCodigo: codigo => buscarUno(`{${campoCodigo}}="${escaparFormula(codigo)}"`),
    leerPorLiga: hash => buscarUno(`{Liga (hash)}="${escaparFormula(hash)}"`),
    async actualizar(recordId, fields) {
      const r = await fetch(url(`/${recordId}`), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ fields }) });
      if (!r.ok) { const e = new Error(`${tabla} PATCH ${r.status}`); e.status = 502; throw e; }
      return r.json();
    },
    async crear(fields) {
      const r = await fetch(url(), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ records: [{ fields }] }) });
      if (!r.ok) { const e = new Error(`${tabla} POST ${r.status}`); e.status = 502; throw e; }
      return ((await r.json()).records || [])[0];
    },
  };
}

// Liga de activación del MÉDICO (la del paciente la emite su médico en
// api/nova.js). Si ya tiene credencial, se reemplaza la liga — una liga nueva
// invalida la anterior y, al usarse, también sirve para recuperar un PIN
// olvidado o un bloqueo definitivo. Devuelve la liga en claro: solo su HMAC
// queda en Airtable.
async function emitirLigaMedico({ medicoRecId, codigo, emitidaPor }, ahora = Date.now()) {
  const c = module.exports.medico;
  const liga = generarLiga();
  const campos = {
    'Liga (hash)': hashLiga(liga),
    'Liga vence': new Date(ahora + HORAS_LIGA * 3600000).toISOString(),
    'Liga emitida por': String(emitidaPor || ''),
  };
  const existente = await c.leerPorCodigo(codigo);
  if (existente) await c.actualizar(existente.id, campos);
  else await c.crear({ [c.CAMPO_CODIGO]: codigo, 'Médico': [medicoRecId], ...campos });
  return liga;
}

const comunes = {
  HORAS_LIGA, LARGO_PIN, FALLOS_POR_BLOQUEO, MINUTOS_BLOQUEO, FALLOS_MAXIMOS,
  pinValido, pinTrivial, hashPin, verificarPin,
  generarLiga, hashLiga, ligaConForma,
  estadoBloqueo, camposTrasFallo,
};

module.exports = {
  ...comunes,
  paciente: { ...comunes, ...tablaDeCredenciales({ tabla: 'CREDENCIALES_PACIENTE', campoCodigo: 'Código de paciente ref' }) },
  medico: { ...comunes, ...tablaDeCredenciales({ tabla: 'CREDENCIALES_MEDICO', campoCodigo: 'Código de médico ref' }), emitirLiga: emitirLigaMedico },
};
