// api/telegram-notificaciones.js
// ─── ENDPOINT TELEGRAM - Enviar notificaciones a pacientes ─────────────────

export default async function handler(req, res) {
  // Verificar método
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  
  try {
    const { tipo, citaId, telefonoPaciente, mensaje, indicaciones, receta } = req.body;
    
    // Validación básica
    if (!telefonoPaciente || !mensaje) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    // Obtener token Telegram (debe estar en env var)
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ error: 'Bot token no configurado' });
    }
    
    // Convertir teléfono a Telegram ID (esto requiere mapeo previo)
    // Por ahora, usar el teléfono como referencia
    const telegramChatId = await obtenerTelegramIdDePaciente(telefonoPaciente);
    
    if (!telegramChatId) {
      return res.status(400).json({ error: 'Paciente no tiene Telegram ID' });
    }
    
    // Enviar mensaje a Telegram
    const urlTelegram = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const responseBot = await fetch(urlTelegram, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: mensaje,
        parse_mode: 'Markdown'
      })
    });
    
    if (!responseBot.ok) {
      const errorData = await responseBot.json();
      console.error('Error Telegram:', errorData);
      return res.status(500).json({ error: 'Error enviando mensaje Telegram' });
    }
    
    const botData = await responseBot.json();
    const messageId = botData.result.message_id;
    
    // Guardar registro en Airtable
    await guardarNotificacionEnAirtable({
      citaId,
      telefonoPaciente,
      tipo,
      messageId,
      indicaciones,
      receta,
      enviado: true
    });
    
    return res.status(200).json({
      success: true,
      messageId,
      tipo
    });
  } catch (err) {
    console.error('Error en telegram-notificaciones:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function obtenerTelegramIdDePaciente(telefonoPaciente) {
  try {
    // Buscar en tabla PACIENTES
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const baseId = 'app6jyD9pDlTLpknA';
    const tableId = 'tblyUcCfueFLJuvIv';
    
    const url = `https://api.airtable.com/v0/${baseId}/${tableId}?filterByFormula={Teléfono/WhatsApp}='${telefonoPaciente}'`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });
    
    const data = await res.json();
    
    if (data.records && data.records.length > 0) {
      return data.records[0].fields['Telegram ID'];
    }
    
    return null;
  } catch (err) {
    console.error('Error obtener Telegram ID:', err);
    return null;
  }
}

async function guardarNotificacionEnAirtable(datos) {
  try {
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const baseId = 'app6jyD9pDlTLpknA';
    const tableId = 'tblNOTIFICACIONES'; // ID de tabla NOTIFICACIONES_CITAS
    
    const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        records: [{
          fields: {
            'Cita ID': datos.citaId,
            'Teléfono Paciente': datos.telefonoPaciente,
            'Tipo': datos.tipo,
            'Message ID': datos.messageId,
            'Indicaciones': datos.indicaciones || '',
            'Receta': datos.receta || '',
            'Enviado': datos.enviado,
            'Fecha Envío': new Date().toISOString()
          }
        }]
      })
    });
    
    if (!res.ok) {
      console.error('Error guardando en Airtable');
    }
  } catch (err) {
    console.error('Error guardando notificación:', err);
  }
}

