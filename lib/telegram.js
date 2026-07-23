// lib/telegram.js
// Utilidad compartida para enviar mensajes vía Telegram Bot API.
// Usada por api/telegram-bot.js (webhook) y api/telegram-alert.js (alertas internas).

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const TELEGRAM_MAX_LENGTH = 4000; // margen bajo el límite real de 4096

/**
 * Envía un mensaje de texto a un chat_id de Telegram.
 * @param {string|number} chatId
 * @param {string} text - Texto plano (sin parse_mode, para evitar errores de escape con Markdown).
 */
async function sendTelegramMessage(chatId, text) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error('Error enviando mensaje de Telegram:', data);
    throw new Error(`Telegram API error: ${data.description || 'unknown'}`);
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

module.exports = { sendTelegramMessage, sendTelegramMessageChunked };
