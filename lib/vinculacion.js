// lib/vinculacion.js
// El paciente es dueño de su expediente (no del criterio médico) y decide a
// qué médico de la red se lo entrega (CLAUDE.md §2). La entrega se prueba con
// una LLAVE temporal que el paciente genera desde su sesión — nunca con el
// código CC-PAC- solo: los códigos son secuenciales (lib/codigos.js), así que
// "conozco el código" no prueba que el paciente lo haya entregado; aceptarlo
// permitiría a cualquier médico recorrer CC-PAC-000001, 000002… y leer a
// todos (justo la enumeración que §4 prohíbe).
//
// Flujo:
//   1. Paciente (token tipo 'paciente') → generarLlave() → se guarda SOLO el
//      HMAC en LLAVES_ACCESO, vence en 24 h, un solo uso. La llave en claro
//      se muestra una vez al paciente.
//   2. Médico (token, Tipo de acceso=Clinico) captura CC-PAC + llave → se
//      marca usada y se crea VINCULACIONES (permanente, acumulativa — no se
//      revoca, igual que el resto del acceso en §4).
//   3. autorizarPaciente() reconoce la vía 'vinculado'.
//
// Las tablas nuevas se referencian por NOMBRE en la URL (Airtable lo
// acepta): sus IDs serán distintos en la base de producción cuando se creen,
// y un ID de la base de prueba fijo aquí fallaría en silencio allá.

const crypto = require('crypto');

const TABLA_LLAVES = 'LLAVES_ACCESO';
const TABLA_VINCULACIONES = 'VINCULACIONES';
const HORAS_VIGENCIA_LLAVE = 24;
const MAX_LLAVES_VIGENTES = 3;

// Sin 0/O, 1/I/L: se dicta por teléfono o se copia de una pantalla.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LARGO_LLAVE = 8; // 31^8 ≈ 8.5e11 combinaciones, y además un solo uso y 24 h

function generarLlave() {
  let s = '';
  for (let i = 0; i < LARGO_LLAVE; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// Acepta "k7p4 qx9m", "K7P4-QX9M", etc. Devuelve null si no tiene forma de llave.
function normalizarLlave(texto) {
  const limpio = String(texto || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (limpio.length !== LARGO_LLAVE) return null;
  for (const c of limpio) if (!ALFABETO.includes(c)) return null;
  return limpio;
}

// HMAC con SESSION_SECRET: si la tabla se filtrara, las llaves vigentes no se
// pueden recuperar por fuerza bruta sin el secreto del servidor.
function hashLlave(llaveNormalizada) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) throw new Error('SESSION_SECRET no configurado — no se pueden manejar llaves de acceso.');
  return crypto.createHmac('sha256', secreto).update(`llave-acceso:${llaveNormalizada}`).digest('hex');
}

function urlTabla(baseId, tabla) {
  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tabla)}`;
}

module.exports = {
  TABLA_LLAVES, TABLA_VINCULACIONES, HORAS_VIGENCIA_LLAVE, MAX_LLAVES_VIGENTES,
  generarLlave, normalizarLlave, hashLlave, urlTabla,
};
