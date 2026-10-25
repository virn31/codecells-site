// lib/telegram.js
// Utilidad compartida para enviar mensajes vía Telegram Bot API.
// Usada por api/telegram-bot.js (webhook) y api/telegram-alert.js (alertas internas).

// En Preview puede haber un bot de PRUEBA (TELEGRAM_BOT_TOKEN_PRUEBA, solo
// rama feat/directorio): Vercel no permite sobrescribir por rama una variable
// compartida con producción. En producción siempre se usa el bot real.
const TOKEN_BOT = (process.env.VERCEL_ENV !== 'production' && process.env.TELEGRAM_BOT_TOKEN_PRUEBA) || process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN_BOT}`;
const TELEGRAM_MAX_LENGTH = 4000; // margen bajo el límite real de 4096

// Los mensajes se arman con *negritas* estilo Markdown (y NOVA responde en
// Markdown), pero antes se mandaban sin parse_mode y llegaban con los
// asteriscos crudos. Markdown de Telegram exige escapar cada carácter
// especial del contenido dinámico (nombres, motivos) o rechaza el mensaje
// entero. En su lugar: TODO el texto se escapa para HTML (solo &, < y >
// importan ahí) y luego solo las *negritas* se vuelven <b>. Un nombre con
// "_" o "*" ya no puede romper el formato.
function escaparHTML(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// **x** o *x* (en una sola línea, sin espacio pegado a los asteriscos — así
// "5 * 3 * 2" no se vuelve negrita) → <b>x</b>.
function markdownATelegramHTML(texto) {
  return escaparHTML(texto)
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<b>$1</b>')
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, '<b>$1</b>');
}

// Respaldo si Telegram aun así rechaza el HTML: texto plano sin los
// marcadores, para que el mensaje llegue de todos modos.
function quitarMarcadoresMarkdown(texto) {
  return String(texto)
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '$1')
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, '$1');
}

async function enviarATelegram(body) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Envía un mensaje de texto a un chat_id de Telegram.
 * @param {string|number} chatId
 * @param {string} text - Texto con *negritas* estilo Markdown (opcional); se envía como HTML escapado.
 * @param {object} [replyMarkup] - Opcional: { inline_keyboard: [[{text, callback_data}, ...]]] } para botones reales.
 */
async function sendTelegramMessage(chatId, text, replyMarkup) {
  const body = { chat_id: chatId, text: markdownATelegramHTML(text), parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;

  let data = await enviarATelegram(body);
  if (!data.ok && /parse entities/i.test(data.description || '')) {
    console.error('[telegram] HTML rechazado, reenvío como texto plano:', data.description);
    const plano = { chat_id: chatId, text: quitarMarcadoresMarkdown(text) };
    if (replyMarkup) plano.reply_markup = replyMarkup;
    data = await enviarATelegram(plano);
  }
  if (!data.ok) {
    console.error('Error enviando mensaje de Telegram:', data);
    throw new Error(`Telegram API error: ${data.description || 'unknown'}`);
  }
  return data;
}

/**
 * Confirma al usuario que su toque en un botón inline fue recibido — sin
 * esto, Telegram deja el botón "cargando" indefinidamente en su pantalla.
 * @param {string} callbackQueryId
 * @param {string} [textoToast] - Aviso corto opcional que aparece como notificación flotante.
 */
async function answerCallbackQuery(callbackQueryId, textoToast) {
  const body = { callback_query_id: callbackQueryId };
  if (textoToast) body.text = textoToast;
  const res = await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Reemplaza el texto de un mensaje ya enviado (y opcionalmente sus botones)
 * — se usa para mostrar el resultado ("✅ Autorizado — CCMED-CGT01") y
 * quitar los botones una vez que ya se tomó la decisión, evitando que se
 * pueda volver a pulsar "Autorizar" dos veces sobre la misma solicitud.
 * @param {string|number} chatId
 * @param {number} messageId
 * @param {string} nuevoTexto
 * @param {object} [replyMarkup] - Opcional: botones nuevos; sin él, el mensaje queda sin botones.
 */
async function editarMensaje(chatId, messageId, nuevoTexto, replyMarkup) {
  const editar = async (extra) => {
    const body = { chat_id: chatId, message_id: messageId, ...extra };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const res = await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  };
  const data = await editar({ text: markdownATelegramHTML(nuevoTexto), parse_mode: 'HTML' });
  if (!data.ok && /parse entities/i.test(data.description || '')) {
    return editar({ text: quitarMarcadoresMarkdown(nuevoTexto) });
  }
  return data;
}

/**
 * Envía un texto largo dividido en varios mensajes, cortando por saltos de línea
 * para no partir palabras ni secciones a la mitad. Los manda en orden secuencial.
 * @param {string|number} chatId
 * @param {string} text
 */
async function sendTelegramMessageChunked(chatId, text) {
  if (text.length <= TELEGRAM_MAX_LENGTH) {
    return sendTelegramMessage(chatId, text);
  }

  const lines = text.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > TELEGRAM_MAX_LENGTH) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    await sendTelegramMessage(chatId, chunk);
  }
}

module.exports = { TOKEN_BOT, sendTelegramMessage, sendTelegramMessageChunked, answerCallbackQuery, editarMensaje, markdownATelegramHTML, quitarMarcadoresMarkdown };
