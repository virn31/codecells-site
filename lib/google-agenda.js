// lib/google-agenda.js
// Conexión de la agenda de Google del médico (etapa 2b, 2026-10-23).
//
// El médico NUNCA le da su contraseña a CODE CELLS: toca un enlace, entra a
// su cuenta en la página de Google y toca "Permitir". Google nos entrega un
// permiso revocable (refresh token) que se guarda solo en el servidor
// (lib/camposMedico.js: nunca sale al navegador).
//
// Con ese permiso:
//   - se leen los bloques OCUPADOS de su calendario (freeBusy: solo horas,
//     no títulos ni detalles) para no ofrecer espacios encimados;
//   - cada cita agendada se escribe como evento en su calendario.
//
// El "state" del enlace va firmado (HMAC con una llave derivada, distinta a
// la de las sesiones): nadie puede conectar SU cuenta de Google al registro
// de otro médico cambiando el código en la URL.

const crypto = require('crypto');

// Permisos mínimos (más fácil de verificar ante Google y menos invasivo):
//   calendar.freebusy → solo saber qué horas están ocupadas (no títulos ni detalles)
//   calendar.events   → crear y borrar los eventos de las citas
// Antes se pedía 'calendar' completo (incluye compartir y borrar calendarios).
const SCOPE_CALENDARIO_COMPLETO = 'https://www.googleapis.com/auth/calendar';
const SCOPES_NECESARIOS = Object.freeze([
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events',
]);
const SCOPES = ['https://www.googleapis.com/auth/userinfo.email', ...SCOPES_NECESARIOS].join(' ');

// ¿El permiso que dio Google alcanza? (Google deja desmarcar casillas.) Las
// conexiones hechas antes con 'calendar' completo siguen valiendo.
function permisosSuficientes(scopeConcedido) {
  const s = String(scopeConcedido || '').split(/\s+/);
  return s.includes(SCOPE_CALENDARIO_COMPLETO) || SCOPES_NECESARIOS.every(x => s.includes(x));
}
const ZONA_DEFECTO = 'America/Mexico_City';
const ZONAS = Object.freeze({
  'America/Mexico_City': 'Centro (CDMX, Guadalajara, Monterrey…)',
  'America/Mazatlan': 'Pacífico (Sinaloa, Nayarit, BCS)',
  'America/Hermosillo': 'Sonora',
  'America/Tijuana': 'Baja California',
  'America/Cancun': 'Quintana Roo',
});
const MINUTOS_ENLACE = 30;

// ── Estado firmado ────────────────────────────────────────────────────
const b64 = s => Buffer.from(s, 'utf-8').toString('base64url');
const llave = () => {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET no configurado.');
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update('conexion-google-v1').digest();
};
const firma = p => crypto.createHmac('sha256', llave()).update(p).digest('base64url');

function firmarEstado({ codigo, chat = null, minutos = MINUTOS_ENLACE }, ahora = Date.now()) {
  const p = b64(JSON.stringify({ c: codigo, t: chat ? String(chat) : null, e: ahora + minutos * 60000, n: crypto.randomBytes(6).toString('hex') }));
  return `${p}.${firma(p)}`;
}

function leerEstado(state, ahora = Date.now()) {
  const [p, f] = String(state || '').split('.');
  if (!p || !f) return null;
  const esperada = firma(p);
  if (f.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(f), Buffer.from(esperada))) return null;
  let d;
  try { d = JSON.parse(Buffer.from(p, 'base64url').toString('utf-8')); } catch (e) { return null; }
  if (!d || !/^CCMED-[A-Z0-9]+$/.test(String(d.c || '')) || !(d.e > ahora)) return null;
  return { codigo: d.c, chat: d.t || null };
}

function urlAutorizacion(state) {
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
}

// URL pública de este despliegue. En Preview (protegido con Vercel
// Authentication) se agrega el bypass de automatización y se pide la cookie,
// para que el regreso desde Google también pase.
function urlPublica(ruta) {
  const base = process.env.VERCEL_ENV === 'production' || !process.env.VERCEL_BRANCH_URL
    ? 'https://www.codecells.mx'
    : 'https://' + process.env.VERCEL_BRANCH_URL;
  const u = new URL(ruta, base);
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    u.searchParams.set('x-vercel-protection-bypass', process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
    u.searchParams.set('x-vercel-set-bypass-cookie', 'true');
  }
  return u.toString();
}

// Enlace que se manda por Telegram: abre nuestro callback, que redirige a Google.
function enlaceConexion({ codigo, chat }) {
  return urlPublica('/api/google-oauth-callback?iniciar=' + encodeURIComponent(firmarEstado({ codigo, chat })));
}

// ── API de Google ─────────────────────────────────────────────────────
async function obtenerAccessToken(refreshToken, fetchImpl = fetch) {
  const r = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.error === 'invalid_grant'
      ? 'Google retiró el permiso de la agenda (se revocó o expiró). Hay que volver a conectarla.'
      : 'No se pudo renovar el acceso a Google Calendar.');
    e.revocado = d.error === 'invalid_grant';
    throw e;
  }
  return d.access_token;
}

// Desfase de la zona (en minutos, p. ej. -420) en un instante dado.
function desfaseMinutos(zona, fecha) {
  const t = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'shortOffset' })
    .formatToParts(fecha).find(p => p.type === 'timeZoneName').value; // "GMT-7"
  const m = t.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

// "YYYY-MM-DD" + minutos locales de la zona → instante UTC.
function instante(ymd, minutosLocal, zona) {
  const aprox = new Date(`${ymd}T12:00:00Z`);
  const off = desfaseMinutos(zona, aprox);
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + (minutosLocal - off) * 60000);
}

// Instante → { fecha, minutos } en la zona.
function local(fecha, zona) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

// Bloques ocupados [{start,end}] → { 'YYYY-MM-DD': [[ini, fin], …] } en minutos
// locales, partiendo los que cruzan medianoche.
function ocupadosPorDia(busy, zona) {
  const mapa = {};
  for (const b of busy || []) {
    let ini = new Date(b.start);
    const fin = new Date(b.end);
    if (!(fin > ini)) continue;
    for (let guarda = 0; ini < fin && guarda < 400; guarda++) {
      const a = local(ini, zona);
      const finDia = instante(a.fecha, 24 * 60, zona);
      const corte = fin < finDia ? fin : finDia;
      const z = corte === fin ? local(fin, zona).minutos || 24 * 60 : 24 * 60;
      (mapa[a.fecha] = mapa[a.fecha] || []).push([a.minutos, z]);
      ini = corte;
    }
  }
  return mapa;
}

async function ocupadoGoogle(refreshToken, { desde, hasta, zona = ZONA_DEFECTO }, fetchImpl = fetch) {
  const access = await obtenerAccessToken(refreshToken, fetchImpl);
  const r = await fetchImpl('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: instante(desde, 0, zona).toISOString(),
      timeMax: instante(hasta, 24 * 60, zona).toISOString(),
      items: [{ id: 'primary' }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  const cal = d.calendars && d.calendars.primary;
  if (!r.ok || !cal || (cal.errors && cal.errors.length)) {
    throw new Error('Google Calendar no respondió: ' + JSON.stringify((cal && cal.errors) || d.error || r.status).slice(0, 200));
  }
  return ocupadosPorDia(cal.busy, zona);
}

const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

async function crearEventoCita(refreshToken, { fecha, hora, duracion, zona = ZONA_DEFECTO, titulo, descripcion }, fetchImpl = fetch) {
  const access = await obtenerAccessToken(refreshToken, fetchImpl);
  const ini = Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
  const r = await fetchImpl('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: titulo,
      description: descripcion || '',
      start: { dateTime: `${fecha}T${hora}:00`, timeZone: zona },
      end: { dateTime: `${fecha}T${hhmm(ini + duracion)}:00`, timeZone: zona },
      reminders: { useDefault: true },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) throw new Error('No se pudo crear el evento en Google Calendar: ' + ((d.error && d.error.message) || r.status));
  return d.id;
}

async function borrarEvento(refreshToken, eventoId, fetchImpl = fetch) {
  const access = await obtenerAccessToken(refreshToken, fetchImpl);
  const r = await fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventoId)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${access}` },
  });
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error('No se pudo borrar el evento de Google Calendar (' + r.status + ').');
}

module.exports = {
  SCOPES, ZONAS, ZONA_DEFECTO, permisosSuficientes,
  firmarEstado, leerEstado, urlAutorizacion, urlPublica, enlaceConexion,
  obtenerAccessToken, ocupadoGoogle, ocupadosPorDia, crearEventoCita, borrarEvento,
  instante, local,
};
