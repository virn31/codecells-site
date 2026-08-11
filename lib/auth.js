// lib/auth.js
// Tokens de sesión firmados (HMAC-SHA256), sin base de datos de sesiones —
// el propio token contiene tipo+código+expiración, y su firma garantiza que
// nadie pudo fabricarlo ni alterarlo sin conocer SESSION_SECRET (env var,
// agregar en Vercel — nunca debe ser el mismo valor que AIRTABLE_TOKEN).
//
// Formato del token: "<payload_base64url>.<firma_hmac_hex>"
// Payload: { tipo: 'medico'|'paciente'|'vip', codigo: 'CCMED-...'|'CC-PAC-...'|'DZW-...', iat, exp }

const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET;

function base64url(str) {
  return Buffer.from(str, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf-8');
}

function firmar(payloadStr) {
  return crypto.createHmac('sha256', SECRET).update(payloadStr).digest('hex');
}

function generarToken({ tipo, codigo, horas = 6 }) {
  if (!SECRET) throw new Error('SESSION_SECRET no configurado en Vercel — no se pueden emitir tokens.');
  const iat = Date.now();
  const exp = iat + horas * 60 * 60 * 1000;
  const payload = base64url(JSON.stringify({ tipo, codigo, iat, exp }));
  const firma = firmar(payload);
  return `${payload}.${firma}`;
}

// Token de VISITANTE del directorio público: acredita "esta sesión ya dejó
// sus datos" para desbloquear los teléfonos por 2h — SIN ligarse a ninguna
// persona (no lleva código ni identificador). Reusa EXACTAMENTE el mismo
// firmador HMAC que generarToken: no hay criptografía nueva aquí.
function generarTokenVisitante({ horas = 2 } = {}) {
  if (!SECRET) throw new Error('SESSION_SECRET no configurado en Vercel — no se pueden emitir tokens.');
  const iat = Date.now();
  const exp = iat + horas * 60 * 60 * 1000;
  const payload = base64url(JSON.stringify({ rol: 'visitante', iat, exp }));
  const firma = firmar(payload);
  return `${payload}.${firma}`;
}

// Devuelve { tipo, codigo, iat, exp } si el token es válido y no ha expirado,
// o null si es inválido, fue alterado, o ya expiró.
function verificarToken(token) {
  if (!SECRET) return null;
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const idx = token.lastIndexOf('.');
  const payload = token.slice(0, idx);
  const firma = token.slice(idx + 1);
  const firmaEsperada = firmar(payload);

  // Comparación en tiempo constante — evita timing attacks sobre la firma.
  const a = Buffer.from(firma, 'hex');
  const b = Buffer.from(firmaEsperada, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let datos;
  try {
    datos = JSON.parse(base64urlDecode(payload));
  } catch {
    return null;
  }
  if (!datos.exp || Date.now() > datos.exp) return null;
  return datos;
}

// Extrae el token del header Authorization: Bearer <token>
function tokenDesdeRequest(req) {
  const header = req.headers['authorization'] || req.headers['Authorization'];
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

module.exports = { generarToken, generarTokenVisitante, verificarToken, tokenDesdeRequest };
