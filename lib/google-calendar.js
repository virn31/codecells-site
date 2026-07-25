// lib/google-calendar.js
// Utilidades para crear eventos directo en el Google Calendar personal de
// cada médico, usando el refresh_token guardado tras la conexión OAuth.

/**
 * Cambia un refresh_token por un access_token temporal (1h).
 */
async function obtenerAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('[google-calendar] error refrescando token:', JSON.stringify(data));
    throw new Error(data.error_description || 'No se pudo renovar el acceso a Google Calendar.');
  }
  return data.access_token;
}

/**
 * Crea un evento en el calendario "primary" del médico.
 * @param {string} refreshToken
 * @param {object} evento - { titulo, descripcion, inicioISO, finISO, ubicacion }
 */
async function crearEvento(refreshToken, evento) {
  const accessToken = await obtenerAccessToken(refreshToken);

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: evento.titulo,
      description: evento.descripcion || '',
      location: evento.ubicacion || '',
      start: { dateTime: evento.inicioISO, timeZone: 'America/Mazatlan' },
      end: { dateTime: evento.finISO, timeZone: 'America/Mazatlan' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 24 * 60 },
        ],
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[google-calendar] error creando evento:', JSON.stringify(data));
    throw new Error(data.error?.message || 'No se pudo crear el evento en Google Calendar.');
  }
  return data; // incluye .id, .htmlLink
}

module.exports = { obtenerAccessToken, crearEvento };
