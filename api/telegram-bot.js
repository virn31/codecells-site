// api/telegram-bot.js
// Webhook de Telegram para @Dr_victor_ivan_bot (CODE CELLS®).
// Propósito único: vincular el chat_id de Telegram de cada médico con su
// registro en la tabla MÉDICOS de Airtable, para que NOVA y los procesos
// internos (crons de certificación / Diplomado) puedan enviarle alertas.
//
// Este endpoint reemplaza cualquier lógica anterior del bot (historia clínica
// NOM-004) — ya no se usa esa funcionalidad.

const { sendTelegramMessage } = require('../lib/telegram');

const AIRTABLE_BASE_ID = 'app6jyD9pDlTLpknA';
const MEDICOS_TABLE_ID = 'tbl87DsuBMmb4DjFM';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

// Campo primario de la tabla MÉDICOS (confirmado en sesiones previas: "Código de médico")
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
        '👋 Hola, soy el bot de notificaciones de *CODE CELLS® Red Médica*.\n\n' +
          'Para vincular tu cuenta y recibir alertas (certificaciones, recordatorios, avisos de NOVA), ' +
          'envíame tu código de médico (formato `CCMED-XXXXXX`).'
      );
      return res.status(200).json({ ok: true });
    }

    // Mensaje con código CCMED-
    const match = texto.match(/CCMED-[A-Za-z0-9]+/i);
    if (match) {
      const codigo = match[0].toUpperCase();
      const medico = await buscarMedicoPorCodigo(codigo);

      if (!medico) {
        await sendTelegramMessage(
          chatId,
          `No encontré el código *${codigo}* en la Red CODE CELLS®. Verifica que esté bien escrito o contacta a Víctor.`
        );
        return res.status(200).json({ ok: true });
      }

      await vincularChatId(medico.id, chatId);

      const nombre = medico.fields[CAMPO_NOMBRE] || 'Doctor(a)';
      await sendTelegramMessage(
        chatId,
        `✅ Cuenta vinculada correctamente, *${nombre}*.\n\nA partir de ahora recibirás aquí tus notificaciones de CODE CELLS® (certificaciones, recordatorios del Diplomado, avisos de NOVA).`
      );
      return res.status(200).json({ ok: true });
    }

    // Cualquier otro mensaje
    await sendTelegramMessage(
      chatId,
      'Este bot solo gestiona notificaciones de la Red CODE CELLS®. Si aún no vinculaste tu cuenta, envíame tu código `CCMED-XXXXXX`.'
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error en telegram-bot webhook:', err);
    return res.status(200).json({ ok: true }); // Siempre 200 para que Telegram no reintente en loop
  }
};
