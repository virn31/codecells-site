// api/telegram-alert.js
// Endpoint interno (NO público) para que NOVA (api/nova.js) o los crons
// (certificación, recordatorios de Diplomado) disparen alertas a médicos
// vía Telegram, usando su Telegram Chat ID guardado en Airtable.
//
// Protegido con un secreto compartido (header x-internal-secret) para que
// no cualquiera pueda mandar mensajes a través de este endpoint.
//
// Uso desde otro endpoint del mismo proyecto (ej. api/nova.js):
//
//   await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''}/api/telegram-alert`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_ALERT_SECRET },
//     body: JSON.stringify({ codigoMedico: 'CCMED-VIRN01', mensaje: 'Tu certificación fue aprobada ✅' }),
//   });

const { sendTelegramMessage } = require('../lib/telegram');

const AIRTABLE_BASE_ID = 'app6jyD9pDlTLpknA';
const MEDICOS_TABLE_ID = 'tbl87DsuBMmb4DjFM';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const CAMPO_CODIGO = 'Código de médico';
const CAMPO_CHAT_ID = 'Telegram Chat ID';

async function buscarMedicoPorCodigo(codigo) {
  const formula = encodeURIComponent(`{${CAMPO_CODIGO}} = "${codigo}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}?filterByFormula=${formula}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  const data = await res.json();
  return data.records && data.records.length > 0 ? data.records[0] : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_ALERT_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const { codigoMedico, chatId, mensaje } = req.body;

    if (!mensaje) {
      return res.status(400).json({ error: 'Falta "mensaje"' });
    }

    let destinoChatId = chatId;

    if (!destinoChatId && codigoMedico) {
      const medico = await buscarMedicoPorCodigo(codigoMedico);
      if (!medico) {
        return res.status(404).json({ error: `Médico ${codigoMedico} no encontrado` });
      }
      destinoChatId = medico.fields[CAMPO_CHAT_ID];
      if (!destinoChatId) {
        return res.status(409).json({
          error: `Médico ${codigoMedico} aún no vinculó su Telegram (no tiene Telegram Chat ID)`,
        });
      }
    }

    if (!destinoChatId) {
      return res.status(400).json({ error: 'Falta "codigoMedico" o "chatId"' });
    }

    await sendTelegramMessage(destinoChatId, mensaje);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error en telegram-alert:', err);
    return res.status(500).json({ error: 'Error interno enviando alerta' });
  }
};
