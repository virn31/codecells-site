// api/sugerir-cie10.js
// Se llama automáticamente después de guardar una consulta (desde el portal
// o desde el dictado por Telegram) SOLO si el médico no especificó un
// diagnóstico CIE-10 explícito. Cruza el cuadro clínico (motivo, exploración,
// patologías activas del paciente, valores de laboratorio fuera de rango) y
// propone el código más probable — nunca lo impone: el campo se guarda con
// el prefijo "Sugerido por NOVA" para que quede clarísimo que requiere
// confirmación o corrección del médico, nunca se trata como diagnóstico
// definitivo.

const { verificarToken, tokenDesdeRequest } = require('../lib/auth');

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_ID = 'app6jyD9pDlTLpknA';
const CONSULTAS_TABLE_ID = 'tbl1Xp2IGxdV178Ky';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!AIRTABLE_TOKEN || !ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Configuración incompleta en el servidor.' });
  }

  // Solo médicos autenticados pueden disparar esto — nunca se llama desde
  // fuera de un guardado real de consulta ya autorizado.
  const sesion = verificarToken(tokenDesdeRequest(req));
  if (!sesion || sesion.tipo !== 'medico') {
    return res.status(401).json({ error: 'Sesión de médico no válida.' });
  }

  try {
    const { consultaRecordId, motivo, exploracion, patologiasActivas, valoresFueraDeRango } = req.body || {};
    if (!consultaRecordId) return res.status(400).json({ error: 'Falta consultaRecordId.' });

    const partes = [];
    if (motivo) partes.push(`Motivo de consulta: ${motivo}`);
    if (exploracion) partes.push(`Exploración física: ${exploracion}`);
    if (patologiasActivas) partes.push(`Patologías activas del paciente: ${patologiasActivas}`);
    if (valoresFueraDeRango) partes.push(`Valores de laboratorio fuera de rango: ${valoresFueraDeRango}`);

    if (partes.length === 0) {
      return res.status(200).json({ ok: true, sugerido: false, motivo: 'Sin información clínica suficiente en esta consulta.' });
    }

    const promptClinico = partes.join('\n');

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 200,
        system:
          'Eres un asistente clínico que sugiere códigos CIE-10 a partir de un cuadro clínico. ' +
          'Responde ÚNICAMENTE en este formato exacto, sin texto adicional: "CÓDIGO — Descripción breve". ' +
          'Si la información es insuficiente para una sugerencia razonable, responde exactamente: "INSUFICIENTE". ' +
          'Nunca inventes certeza donde no la hay — esto es una sugerencia que el médico va a revisar, no un diagnóstico definitivo.',
        messages: [{ role: 'user', content: promptClinico }],
      }),
    });
    const claudeData = await claudeRes.json();
    const texto = claudeRes.ok && Array.isArray(claudeData.content)
      ? claudeData.content.find(b => b?.type === 'text')?.text?.trim()
      : null;

    if (!texto || texto === 'INSUFICIENTE' || !/^[A-Z]\d/.test(texto)) {
      return res.status(200).json({ ok: true, sugerido: false, motivo: 'NOVA no encontró suficiente claridad clínica para sugerir un código.' });
    }

    const valorGuardado = `Sugerido por NOVA: ${texto} (confirmar o corregir)`;

    const patchRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${CONSULTAS_TABLE_ID}/${consultaRecordId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Diagnóstico (CIE-10)': valorGuardado } }),
    });

    if (!patchRes.ok) {
      return res.status(200).json({ ok: true, sugerido: true, guardado: false, sugerencia: texto });
    }

    return res.status(200).json({ ok: true, sugerido: true, guardado: true, sugerencia: texto });
  } catch (err) {
    console.error('[sugerir-cie10] error:', err.message);
    return res.status(500).json({ error: 'Error interno al sugerir CIE-10.' });
  }
};
