// api/diag-whoami-temp.js
// DIAGNÓSTICO TEMPORAL — se retira en este mismo turno (handoff 2026-08-25).
// Confirma qué token de Airtable está configurado en AIRTABLE_TOKEN (Vercel)
// sin exponer su valor: solo reenvía los `scopes` que Airtable devuelve en
// GET /v0/meta/whoami. Protegido por un secreto de un solo uso, generado
// para esta prueba y descartado junto con el archivo.

const DIAG_SECRET = 'e3a60c2247efe8293dab0c6217016a4a785151c18b7e05a4';

module.exports = async (req, res) => {
  const secret = req.headers['x-diag-secret'] || req.query.secret;
  if (secret !== DIAG_SECRET) {
    return res.status(404).json({ error: 'Not found' });
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  if (!AIRTABLE_TOKEN) {
    return res.status(500).json({ error: 'AIRTABLE_TOKEN no configurado.' });
  }

  try {
    const r = await fetch('https://api.airtable.com/v0/meta/whoami', {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: 'Airtable no-ok', status: r.status, data });
    }
    // Nunca se reenvía el token — solo lo que Airtable ya considera metadato
    // seguro de exponer al propio dueño del token (id + scopes).
    return res.status(200).json({ id: data.id || null, scopes: data.scopes || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Error consultando whoami.', detail: String(err && err.message || err) });
  }
};
