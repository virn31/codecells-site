// lib/telegram.js
// Utilidad compartida para enviar mensajes vía Telegram Bot API.
// Usada por api/telegram-bot.js (webhook) y api/telegram-alert.js (alertas internas).

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/**
 * Envía un mensaje de texto a un chat_id de Telegram.
 * @param {string|number} chatId
 * @param {string} text - Soporta Markdown (parse_mode Markdown).
 */
async function sendTelegramMessage(chatId, text) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error('Error enviando mensaje de Telegram:', data);
    throw new Error(`Telegram API error: ${data.description || 'unknown'}`);
  }
  return data;
}

module.exports = { sendTelegramMessage };
