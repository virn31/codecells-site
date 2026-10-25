// api/google-oauth-callback.js
// Conexión de la agenda de Google del médico (OAuth). Dos entradas:
//
//   ?iniciar=<estado firmado>  → redirige a la página de Google (es el enlace
//                                que manda el bot de Telegram o el portal).
//   ?code=…&state=…            → Google regresa aquí tras "Permitir": se
//                                cambia el code por el permiso, se guarda en
//                                MÉDICOS (solo servidor) y, si vino de
//                                Telegram, el bot sigue la conversación.
//
// El médico escribe su contraseña SOLO en la página de Google; CODE CELLS
// nunca la ve. El "state" va firmado (lib/google-agenda.js): antes era el
// código CCMED- en claro y cualquiera podía ligar SU cuenta de Google al
// registro de otro médico.

const G = require('../lib/google-agenda');
const { congelado } = require('../lib/congelamientoDatosPersonales');
const { despuesDeConectarGoogle } = require('../lib/agenda-telegram');

const AIRTABLE_BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA'); // base del ambiente (Preview = prueba)
const MEDICOS_TABLE_ID = 'tbl87DsuBMmb4DjFM';

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pagina(exito, mensaje, deTelegram) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">
    <title>CODE CELLS™ — Agenda de Google</title>
    <style>
      body{background:#0E1410;color:#F2EFE9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px;}
      .card{max-width:420px;}
      h1{font-size:1.3rem;color:${exito ? '#5FAE6E' : '#D4654A'};}
      p{color:#B8B2AA;font-size:0.95rem;line-height:1.5;}
      a{color:#C9A24B;}
    </style></head><body>
    <div class="card">
      <h1>${exito ? '✅ Agenda conectada' : '⚠️ No se pudo conectar'}</h1>
      <p>${mensaje}</p>
      <p>${deTelegram ? 'Ya puedes cerrar esta ventana y volver a Telegram.' : '<a href="/portal-medico.html">Regresar al Portal Médico</a>'}</p>
    </div>
    </body></html>`;
}

function responder(res, exito, mensaje, deTelegram) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(pagina(exito, mensaje, deTelegram));
}

async function at(ruta, opciones = {}) {
  const r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Airtable respondió ${r.status}`);
  return d;
}

module.exports = async (req, res) => {
  const { code, state, error, iniciar } = req.query || {};

  // 1) Enlace de Telegram/portal → página de Google.
  if (iniciar) {
    if (!G.leerEstado(iniciar)) {
      return responder(res, false, 'Este enlace ya caducó (dura 30 minutos) o está incompleto. Pide uno nuevo: en Telegram escribe /conectar.', true);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', G.urlAutorizacion(iniciar).toString());
    return res.status(302).end();
  }

  const datos = G.leerEstado(state);
  const deTelegram = !!(datos && datos.chat);

  if (error) {
    if (deTelegram) {
      try { await despuesDeConectarGoogle({ chat: datos.chat, ok: false, motivo: 'No tocaste "Permitir" en Google (o se canceló).' }); } catch (e) { /* el aviso es opcional */ }
    }
    return responder(res, false, 'No se completó el permiso en Google. Puedes intentarlo de nuevo cuando quieras.', deTelegram);
  }
  if (!code || !datos) {
    return responder(res, false, 'El enlace caducó o está incompleto. Pide uno nuevo: en Telegram escribe /conectar.', deTelegram);
  }
  // Guarda un permiso en el registro del médico: área 'directorio' del congelamiento.
  if (congelado('directorio')) {
    return responder(res, false, 'Estamos actualizando nuestro aviso de privacidad. La conexión de agendas no está disponible temporalmente.', deTelegram);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error('[google-oauth-callback] sin refresh_token:', tokenRes.status, tokenData.error || '');
      const motivo = tokenRes.ok
        ? 'Google no dio el permiso permanente (pasa si ya se había conectado antes). Entra a myaccount.google.com/permissions, quita "CODE CELLS", y vuelve a intentarlo.'
        : 'Google rechazó la conexión. Intenta de nuevo.';
      if (deTelegram) await despuesDeConectarGoogle({ chat: datos.chat, ok: false, motivo }).catch(() => {});
      return responder(res, false, motivo, deTelegram);
    }

    // Google deja desmarcar el permiso del calendario (casillas en la pantalla
    // de consentimiento): entonces da el correo pero no el calendario. No se
    // guarda nada y se pide repetir marcando la casilla.
    if (!G.permisosSuficientes(tokenData.scope)) {
      const motivo = 'Google no compartió tu calendario: en la pantalla de Google hay que MARCAR las casillas del calendario (ver disponibilidad y ver/editar eventos) antes de tocar "Continuar".';
      if (deTelegram) await despuesDeConectarGoogle({ chat: datos.chat, ok: false, motivo }).catch(() => {});
      return responder(res, false, motivo, deTelegram);
    }

    const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    }).then(r => r.json()).catch(() => ({}));
    const email = info.email || '';

    const busca = await at(`${MEDICOS_TABLE_ID}?${new URLSearchParams({ filterByFormula: `{Código de médico}="${datos.codigo}"`, maxRecords: '1' })}`);
    const medico = (busca.records || [])[0];
    if (!medico) return responder(res, false, 'No encontramos tu registro de médico. Contacta al equipo de CODE CELLS.', deTelegram);

    await at(`${MEDICOS_TABLE_ID}/${medico.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'Google Calendar Refresh Token': tokenData.refresh_token, 'Google Calendar Email': email } }),
    });

    if (deTelegram) {
      try { await despuesDeConectarGoogle({ chat: datos.chat, ok: true, email, refreshToken: tokenData.refresh_token }); }
      catch (e) { console.error('[google-oauth-callback] aviso a Telegram falló:', e.message); }
    }
    return responder(res, true, `Conectamos la agenda de <b>${esc(email)}</b>. NOVA no dará citas encima de lo que ya tienes y cada cita nueva aparecerá ahí.`, deTelegram);
  } catch (err) {
    console.error('[google-oauth-callback] error:', err.message);
    if (deTelegram) await despuesDeConectarGoogle({ chat: datos.chat, ok: false, motivo: 'Hubo un error de conexión al guardar el permiso.' }).catch(() => {});
    return responder(res, false, 'Hubo un error de conexión. Intenta de nuevo.', deTelegram);
  }
};
