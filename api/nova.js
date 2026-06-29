
// api/nova.js — CODE CELLS® · Proxy seguro Anthropic + Airtable
// Vercel Serverless Function

export default async function handler(req, res) {

  // ─── CORS ────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { action } = req.body || {};

  // ─── ACCIÓN: CONSULTA AIRTABLE ────────────────────────────────────────────
  // El frontend pide verificar un código — el servidor hace la consulta
  // con el token seguro y devuelve solo los datos necesarios
  if (action === 'airtable_lookup') {
    try {
      const { tabla, filtro } = req.body;
      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TABLES = {
        pacientes : 'tblyUcCfueFLJuvIv',
        historia  : 'tblm2xUADazitHisR',
        consultas : 'tbl1Xp2IGxdV178Ky',
        medicos   : 'tbl87DsuBMmb4DjFM',
        protocolos: 'tblMGnZxnEHHrjZl4',
        novaLabs  : 'tblhKp4uE1NdXXqLh'
      };

      if (!TABLES[tabla]) return res.status(400).json({ error: 'Tabla inválida' });

      const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLES[tabla]}?filterByFormula=${encodeURIComponent(filtro)}`;
      const atRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
      });
      const atData = await atRes.json();
      const record = atData.records?.[0] || null;

      // Devolver solo campos seguros (no exponer campos internos sensibles)
      if (!record) return res.status(200).json({ found: false });

      const camposSegurosPaciente = [
        'Código de paciente','Nombre completo','Status','Protocolo activo',
        'Fecha de registro','Canal de entrada','Médico asignado'
      ];
      const camposSegurosMedico = [
        'Código de médico','Nombre completo','Especialidad',
        'Nivel CODE CELLS®','Protocolos habilitados'
      ];
      const esMedico = tabla === 'medicos';
      const campos = esMedico ? camposSegurosMedico : camposSegurosPaciente;
      const fieldsFiltrados = {};
      campos.forEach(c => { if (record.fields[c]) fieldsFiltrados[c] = record.fields[c]; });

      return res.status(200).json({ found: true, fields: fieldsFiltrados });

    } catch (err) {
      console.error('Airtable lookup error:', err);
      return res.status(500).json({ error: 'Error consultando Airtable' });
    }
  }

  // ─── ACCIÓN: CREAR LEAD EN AIRTABLE ──────────────────────────────────────
  if (action === 'airtable_create_lead') {
    try {
      const { nombre, telefono, motivo, canal } = req.body;
      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const url = `https://api.airtable.com/v0/app6jyD9pDlTLpknA/tblyUcCfueFLJuvIv`;

      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: {
          'Nombre completo'   : nombre || '',
          'Teléfono WhatsApp' : telefono || '',
          'Notas generales'   : motivo || '',
          'Status'            : 'Lead',
          'Canal de entrada'  : canal || 'codecells.mx',
          'Fecha de registro' : new Date().toISOString()
        }})
      });

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Airtable create error:', err);
      return res.status(500).json({ error: 'Error creando lead' });
    }
  }

  // ─── ACCIÓN: CHAT CON NOVA (Anthropic) ───────────────────────────────────
  try {
    const { messages, system, model, max_tokens } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing messages array' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type'      : 'application/json',
        'x-api-key'         : process.env.ANTHROPIC_API_KEY,
        'anthropic-version' : '2023-06-01'
      },
      body: JSON.stringify({
        model      : model      || 'claude-sonnet-4-6',
        max_tokens : max_tokens || 1024,
        system     : system     || '',
        messages
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    console.error('NOVA proxy error:', err);
    return res.status(500).json({ error: 'Internal proxy error', detail: err.message });
  }
}
