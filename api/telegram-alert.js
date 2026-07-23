// api/telegram-alert.js
// Endpoint interno (NO público) para que NOVA (api/nova.js) o los crons
// (certificación, recordatorios de Diplomado) disparen alertas a médicos
// vía Telegram, usando su Telegram Chat ID guardado en Airtable.
//
// Protegido con un secreto compartido (header x-internal-secret) para que
// no cualquiera pueda mandar mensajes a través de este endpoint.
//
// Si la alerta es sobre un paciente específico (pacienteRecordId), además
// crea un registro en TELEGRAM_HILOS_PACIENTE vinculando el message_id del
// mensaje enviado con ese paciente — así, cuando el médico "responda" (reply)
// ese mensaje en Telegram, el webhook (api/telegram-bot.js) sabe a qué
// paciente entregarle la respuesta.
//
// Uso desde otro endpoint del mismo proyecto (ej. api/nova.js):
//
//   await fetch('https://www.codecells.mx/api/telegram-alert', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_ALERT_SECRET },
//     body: JSON.stringify({
//       codigoMedico: 'CCMED-VIRN01',
//       mensaje: 'Paciente pregunta si puede tomar ibuprofeno con su protocolo...',
//       pacienteRecordId: 'recXXXXXXXXXXXXXX',   // opcional
//       preguntaPaciente: 'texto original de la pregunta',  // opcional
//     }),
//   });

const { sendTelegramMessage } = require('../lib/telegram');

const AIRTABLE_BASE_ID = 'app6jyD9pDlTLpknA';
const MEDICOS_TABLE_ID = 'tbl87DsuBMmb4DjFM';
const HILOS_TABLE_ID = 'tblTW5X6f2UkuUFPT';
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

async function crearHiloPaciente({ messageId, chatId, pacienteRecordId, preguntaPaciente }) {
  await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${HILOS_TABLE_ID}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      typecast: true,
      records: [{
        fields: {
          'Message ID': String(messageId),
          'Chat ID Médico': String(chatId),
          'Paciente': [pacienteRecordId],
          'Pregunta del paciente': preguntaPaciente || '',
          'Fecha': new Date().toISOString(),
          'Respondido': false,
        },
      }],
    }),
  });
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
    const { codigoMedico, chatId, mensaje, pacienteRecordId, preguntaPaciente } = req.body;

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

    const resultadoEnvio = await sendTelegramMessage(destinoChatId, mensaje);
    const messageId = resultadoEnvio?.result?.message_id;

    if (pacienteRecordId && messageId) {
      await crearHiloPaciente({ messageId, chatId: destinoChatId, pacienteRecordId, preguntaPaciente });
    }

    return res.status(200).json({ ok: true, messageId: messageId || null });
  } catch (err) {
    console.error('Error en telegram-alert:', err);
    return res.status(500).json({ error: 'Error interno enviando alerta' });
  }
};
