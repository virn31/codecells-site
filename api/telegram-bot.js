// api/telegram-bot.js
// Webhook de Telegram para @Dr_victor_ivan_bot (CODE CELLS®).
//
// Dos funciones:
// 1) Vincular el chat_id de Telegram de cada médico con su registro en la tabla
//    MÉDICOS de Airtable (para que NOVA y los crons puedan enviarle alertas).
// 2) Una vez vinculado, el médico puede escribir los datos de un paciente
//    (peso, talla, IMC, diagnósticos, labs, etc.) y el bot le regresa un plan
//    nutricional de 7 días en texto plano, listo para copiar/pegar y reenviar
//    por Telegram, WhatsApp o correo.

const { sendTelegramMessage, sendTelegramMessageChunked } = require('../lib/telegram');
const { generarPlanNutricional } = require('../lib/nutricion');

const AIRTABLE_BASE_ID = 'app6jyD9pDlTLpknA';
const MEDICOS_TABLE_ID = 'tbl87DsuBMmb4DjFM';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const CAMPO_CODIGO = 'Código de médico';
const CAMPO_CHAT_ID = 'Telegram Chat ID';
const CAMPO_NOMBRE = 'Nombre completo';

async function buscarMedicoPorCodigo(codigo) {
  const formula = encodeURIComponent(`{${CAMPO_CODIGO}} = "${codigo}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}?filterByFormula=${formula}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  const data = await res.json();
  return data.records && data.records.length > 0 ? data.records[0] : null;
}

async function buscarMedicoPorChatId(chatId) {
  const formula = encodeURIComponent(`{${CAMPO_CHAT_ID}} = "${chatId}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}?filterByFormula=${formula}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  const data = await res.json();
  return data.records && data.records.length > 0 ? data.records[0] : null;
}

async function vincularChatId(recordId, chatId) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}/${recordId}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: { [CAMPO_CHAT_ID]: String(chatId) },
    }),
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('CODE CELLS® Telegram bot activo.');
  }

  try {
    const update = req.body;
    const message = update.message;

    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const texto = message.text.trim();

    // /start sin código: instrucciones
    if (texto === '/start') {
      await sendTelegramMessage(
        chatId,
        'Hola, soy el bot de notificaciones y apoyo clínico de CODE CELLS® Red Médica.\n\n' +
          'Para vincular tu cuenta, envíame tu código de médico (formato CCMED-XXXXXX).\n\n' +
          'Una vez vinculado, puedes escribirme los datos de un paciente (peso, talla, IMC, diagnósticos, medicamentos, labs, etc.) y te genero un plan nutricional de 7 días listo para copiar y reenviar.'
      );
      return res.status(200).json({ ok: true });
    }

    // Mensaje con código CCMED- (vinculación)
    const matchCodigo = texto.match(/CCMED-[A-Za-z0-9]+/i);
    if (matchCodigo) {
      const codigo = matchCodigo[0].toUpperCase();
      const medico = await buscarMedicoPorCodigo(codigo);

      if (!medico) {
        await sendTelegramMessage(
          chatId,
          `No encontré el código ${codigo} en la Red CODE CELLS®. Verifica que esté bien escrito o contacta a Víctor.`
        );
        return res.status(200).json({ ok: true });
      }

      await vincularChatId(medico.id, chatId);

      const nombre = medico.fields[CAMPO_NOMBRE] || 'Doctor(a)';
      await sendTelegramMessage(
        chatId,
        `Cuenta vinculada correctamente, ${nombre}.\n\nA partir de ahora recibirás aquí tus notificaciones de CODE CELLS® (certificaciones, recordatorios del Diplomado, avisos de NOVA).\n\nTambién puedes escribirme los datos de un paciente cuando quieras generar un plan nutricional.`
      );
      return res.status(200).json({ ok: true });
    }

    // Cualquier otro mensaje: ¿el médico ya está vinculado?
    const medicoVinculado = await buscarMedicoPorChatId(chatId);

    if (!medicoVinculado) {
      await sendTelegramMessage(
        chatId,
        'Este bot es exclusivo para médicos de la Red CODE CELLS®. Si aún no vinculaste tu cuenta, envíame tu código CCMED-XXXXXX.'
      );
      return res.status(200).json({ ok: true });
    }

    // Médico vinculado y el mensaje no es un comando de vinculación:
    // se trata como solicitud de plan nutricional.
    await sendTelegramMessage(chatId, 'Generando el plan, un momento...');

    try {
      const plan = await generarPlanNutricional(texto);
      await sendTelegramMessageChunked(chatId, plan);
    } catch (errPlan) {
      console.error('[telegram-bot] Error generando plan nutricional:', errPlan);
      await sendTelegramMessage(
        chatId,
        'Hubo un error generando el plan. Intenta de nuevo en un momento.'
      );
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error en telegram-bot webhook:', err);
    return res.status(200).json({ ok: true }); // Siempre 200 para que Telegram no reintente en loop
  }
};
