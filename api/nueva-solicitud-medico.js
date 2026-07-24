// api/nueva-solicitud-medico.js
// Recibe los datos que NOVA capturó conversacionalmente en unete.html de un
// médico interesado en afiliarse. Guarda la solicitud en Airtable y avisa
// por Telegram a los médicos maestros (Dr. Víctor y Dr. Juan Carlos Galván)
// para que revisen y den de alta manualmente en MÉDICOS con su código CCMED-.
//
// Este endpoint SÍ puede ser llamado directo desde el navegador (no requiere
// secreto interno) porque solo permite crear UNA solicitud a la vez con datos
// acotados — no expone lectura ni el secreto de alertas.

const { sendTelegramMessage } = require('../lib/telegram');

const AIRTABLE_BASE_ID = 'app6jyD9pDlTLpknA';
const SOLICITUDES_TABLE_ID = 'tblDpqi2XJqoR4QiE';
const MEDICOS_TABLE_ID = 'tbl87DsuBMmb4DjFM';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const CODIGOS_MAESTROS = ['CCMED-VIRN01', 'CCMED-JCG01'];

async function buscarChatId(codigoMedico) {
  const formula = encodeURIComponent(`{Código de médico}="${codigoMedico}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}?filterByFormula=${formula}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  const rec = data.records && data.records[0];
  return rec ? rec.fields['Telegram Chat ID'] : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { nombre, especialidad, cedula, ciudad, whatsapp, email } = req.body;

    if (!nombre || !whatsapp) {
      return res.status(400).json({ error: 'Faltan datos mínimos (nombre y WhatsApp).' });
    }

    const createRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SOLICITUDES_TABLE_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        typecast: true,
        records: [{
          fields: {
            'Nombre completo': nombre || '',
            'Especialidad': especialidad || '',
            'Cédula profesional': cedula || '',
            'Ciudad': ciudad || '',
            'WhatsApp': whatsapp || '',
            'Email': email || '',
            'Fecha solicitud': new Date().toISOString(),
            'Estado': 'Pendiente',
          },
        }],
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.text();
      console.error('[nueva-solicitud-medico] error creando registro:', errData);
      return res.status(502).json({ error: 'No se pudo guardar la solicitud.' });
    }

    // Alertar a los médicos maestros por Telegram (si ya vincularon su cuenta).
    const mensaje =
      `Nueva solicitud de afiliación a la Red CODE CELLS®\n\n` +
      `Nombre: ${nombre}\n` +
      `Especialidad: ${especialidad || '(no especificada)'}\n` +
      `Cédula: ${cedula || '(no especificada)'}\n` +
      `Ciudad: ${ciudad || '(no especificada)'}\n` +
      `WhatsApp: ${whatsapp}\n` +
      `Email: ${email || '(no especificado)'}\n\n` +
      `Revisa en Airtable (SOLICITUDES_MEDICO) y da de alta manualmente con su código CCMED- si procede.`;

    await Promise.all(
      CODIGOS_MAESTROS.map(async (codigo) => {
        try {
          const chatId = await buscarChatId(codigo);
          if (chatId) await sendTelegramMessage(chatId, mensaje);
        } catch (err) {
          console.error(`[nueva-solicitud-medico] error alertando a ${codigo}:`, err.message);
        }
      })
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[nueva-solicitud-medico] error:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
