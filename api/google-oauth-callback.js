// api/google-oauth-callback.js
// Google redirige aquí después de que el médico autoriza el acceso a su
// Google Calendar. Intercambiamos el "code" por tokens, identificamos qué
// cuenta de Google conectó, y guardamos su refresh_token en su registro de
// MÉDICOS (identificado por el "state", que es su código CCMED-).

const AIRTABLE_BASE_ID = 'app6jyD9pDlTLpknA';
const MEDICOS_TABLE_ID = 'tbl87DsuBMmb4DjFM';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

module.exports = async (req, res) => {
  const { code, state, error } = req.query;

  function paginaResultado(exito, mensaje) {
    // Página simple que se cierra sola / regresa al Portal Médico.
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CODE CELLS™ — Google Calendar</title>
      <style>
        body{background:#0E1410;color:#F2EFE9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px;}
        .card{max-width:420px;}
        h1{font-size:1.3rem;color:${exito ? '#5FAE6E' : '#D4654A'};}
        p{color:#9a9590;font-size:0.95rem;line-height:1.5;}
        a{color:#C9A24B;}
      </style></head><body>
      <div class="card">
        <h1>${exito ? '✅ Conectado' : '⚠️ Algo salió mal'}</h1>
        <p>${mensaje}</p>
        <p><a href="/portal-medico.html">Regresar al Portal Médico</a></p>
      </div>
      </body></html>`;
  }

  if (error) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(paginaResultado(false, 'No se completó la autorización con Google. Puedes intentarlo de nuevo desde el Portal.'));
  }

  if (!code || !state) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(paginaResultado(false, 'Faltan datos en la respuesta de Google. Intenta de nuevo desde el Portal.'));
  }

  try {
    // Intercambiar el code por tokens
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
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error('[google-oauth-callback] error obteniendo tokens:', JSON.stringify(tokenData));
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(paginaResultado(
        false,
        !tokenData.refresh_token
          ? 'Google no envió permiso de acceso permanente — esto pasa si ya habías conectado antes. Ve a myaccount.google.com/permissions, quita el acceso de "CODE CELLS™ Agenda", y vuelve a intentarlo desde el Portal.'
          : 'No se pudo completar la conexión con Google. Intenta de nuevo.'
      ));
    }

    // Averiguar qué correo de Google es
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    // Guardar en el registro del médico (state = su código CCMED-)
    const formula = encodeURIComponent(`{Código de médico} = "${state}"`);
    const buscarRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}?filterByFormula=${formula}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const buscarData = await buscarRes.json();
    const medico = buscarData.records && buscarData.records[0];

    if (!medico) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(paginaResultado(false, 'No encontramos tu registro de médico. Contacta al equipo.'));
    }

    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}/${medico.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          'Google Calendar Refresh Token': tokenData.refresh_token,
          'Google Calendar Email': userInfo.email || '',
        },
      }),
    });

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(paginaResultado(true, `Tu Google Calendar (${userInfo.email || ''}) ya está conectado. Tus citas confirmadas se agregarán ahí automáticamente.`));
  } catch (err) {
    console.error('[google-oauth-callback] error:', err.message);
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(paginaResultado(false, 'Hubo un error de conexión. Intenta de nuevo desde el Portal.'));
  }
};

// trigger fresh deploy 1784947490
