// lib/vinculoTelegram.js
// Primer vínculo de Telegram desde el portal (2026-10-25, decisión de Víctor:
// se cierra la vía vieja de mandar el código CCMED- al bot).
//
// El portal (con sesión y PIN) pide una liga t.me/<bot>?start=<token>. El
// token va firmado con SESSION_SECRET: nadie lo fabrica sin el secreto, y
// lleva el código del médico de la SESIÓN, nunca uno que mande el navegador.
// Telegram limita el parámetro de /start a 64 caracteres [A-Za-z0-9_-], por
// eso no se usa el token de sesión (lib/auth.js), que es mucho más largo.
//
// Sin tabla nueva: el uso único lo da el propio vínculo. Una vez que el
// médico tiene 'Telegram Chat ID', el bot rechaza cualquier otro chat.

const crypto = require('crypto');

const MINUTOS_VIGENCIA = 30;
const PREFIJO = 'CCMED-';

function firma(codigo, exp) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) throw new Error('SESSION_SECRET no configurado — no se pueden emitir ligas de Telegram.');
  // Dominio propio: una firma de esta liga no sirve para nada más.
  return crypto.createHmac('sha256', secreto).update(`telegram-vinculo|${codigo}|${exp}`).digest('base64url').slice(0, 22);
}

// codigo: 'CCMED-VIRN01'. Devuelve el token para ?start=.
function emitirToken(codigo, ahora = Date.now()) {
  const c = String(codigo || '');
  if (!c.startsWith(PREFIJO)) throw new Error('Código de médico inválido.');
  const corto = c.slice(PREFIJO.length);
  if (!/^[A-Z0-9]{1,24}$/.test(corto)) throw new Error('Código de médico inválido.');
  const exp = Math.floor(ahora / 1000) + MINUTOS_VIGENCIA * 60;
  const expTxt = exp.toString(36);
  return `${corto}_${expTxt}_${firma(c, expTxt)}`;
}

// → { ok: true, codigo } | { ok: false, motivo: 'formato' | 'firma' | 'vencida' }
function verificarToken(token, ahora = Date.now()) {
  const m = /^([A-Z0-9]{1,24})_([0-9a-z]{1,10})_([A-Za-z0-9_-]{22})$/.exec(String(token || ''));
  if (!m) return { ok: false, motivo: 'formato' };
  const codigo = PREFIJO + m[1];
  const esperada = Buffer.from(firma(codigo, m[2]));
  const recibida = Buffer.from(m[3]);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return { ok: false, motivo: 'firma' };
  if (parseInt(m[2], 36) * 1000 < ahora) return { ok: false, motivo: 'vencida' };
  return { ok: true, codigo };
}

module.exports = { MINUTOS_VIGENCIA, emitirToken, verificarToken };
