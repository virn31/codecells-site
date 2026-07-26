// api/auth-login.js
// Valida un código (CCMED-/CC-PAC-/DZW-) contra Airtable y, si existe, emite
// un token de sesión firmado. Este es el ÚNICO lugar donde un código se
// intercambia por un token — de aquí en adelante, api/airtable.js y demás
// endpoints sensibles exigen el token, no el código suelto.

const { generarToken } = require('../lib/auth');

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'app6jyD9pDlTLpknA';

const TABLAS = {
  medico:   { id: 'tbl87DsuBMmb4DjFM', campo: 'Código de médico' },
  paciente: { id: 'tblyUcCfueFLJuvIv', campo: 'Código de paciente' },
  vip:      { id: 'tblquF2fzFgUC5nll', campo: 'Código DZW' },
};

const HORAS_SESION = { medico: 6, paciente: 24, vip: 24 };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://codecells.mx');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { tipo, codigo } = req.body || {};
    if (!tipo || !TABLAS[tipo] || !codigo || typeof codigo !== 'string') {
      return res.status(400).json({ error: 'Falta un tipo válido (medico/paciente/vip) o el código.' });
    }
    if (!process.env.SESSION_SECRET) {
      console.error('[auth-login] SESSION_SECRET no configurado en Vercel.');
      return res.status(500).json({ error: 'Configuración de sesión incompleta en el servidor.' });
    }

    const { id: tableId, campo } = TABLAS[tipo];
    const formula = encodeURIComponent(`{${campo}}="${codigo.trim()}"`);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?filterByFormula=${formula}&maxRecords=1`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await r.json();

    if (!data.records || data.records.length === 0) {
      return res.status(401).json({ error: 'Código no encontrado o inválido.' });
    }

    const registro = data.records[0];

    // Para médicos, la cuenta debe estar activa.
    if (tipo === 'medico' && registro.fields['Activo'] === false) {
      return res.status(401).json({ error: 'Acceso desactivado. Contacta a administración.' });
    }
    // Para pacientes VIP, la cuenta ya debe estar activada.
    if (tipo === 'vip' && registro.fields['Activado'] !== true) {
      return res.status(401).json({ error: 'Esta cuenta VIP aún no ha sido activada.' });
    }

    const token = generarToken({ tipo, codigo: codigo.trim(), horas: HORAS_SESION[tipo] });
    return res.status(200).json({
      ok: true,
      token,
      horasValidez: HORAS_SESION[tipo],
      recordId: registro.id,
      fields: registro.fields,
    });
  } catch (err) {
    console.error('[auth-login] error interno:', err.message);
    return res.status(500).json({ error: 'Error interno validando el código.' });
  }
};
