// api/capacitacion-progreso.js
// Progreso de capacitación ligado al código real del médico (tabla
// CAPACITACIONES_MEDICO), no al navegador. Reemplaza la dependencia
// exclusiva de localStorage en capacitacion/index.html — localStorage sigue
// usándose como caché local rápida, pero esta es la fuente de verdad.
//
// GET  -> progreso completo del médico autenticado (todos los módulos).
// POST -> marca un módulo como completado (o actualiza el intento) para el
//         médico autenticado — nunca para otro código, el código sale
//         siempre del token, jamás del body.

const { verificarToken, tokenDesdeRequest } = require('../lib/auth');

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'app6jyD9pDlTLpknA';
const TABLE_ID = 'tbldxB4GK1vpnj7JR'; // CAPACITACIONES_MEDICO

// Debe coincidir exactamente con las opciones reales del campo "Módulo" en
// Airtable y con los IDs 1-10 usados en capacitacion/index.html.
const MODULOS_VALIDOS = [
  'Marco Regulatorio', 'Optimización Biológica Intravenosa', 'Homotoxicología', 'Farmacia',
  'Portal Médico', 'Péptidos', 'Exosomas', 'Células madre', 'DEZAWA',
  'Examen integrador',
];

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

async function buscarRegistro(codigoMedico, modulo) {
  const formula = `AND({Médico}="${codigoMedico.replace(/"/g, '\\"')}", {Módulo}="${modulo.replace(/"/g, '\\"')}")`;
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await r.json();
  return (data.records && data.records[0]) || null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://codecells.mx');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!AIRTABLE_TOKEN) return res.status(500).json({ error: 'AIRTABLE_TOKEN no configurado.' });

  // Autenticación obligatoria — solo médicos, y solo para su propio código.
  const token = tokenDesdeRequest(req);
  const sesion = verificarToken(token);
  if (!sesion || sesion.tipo !== 'medico') {
    return res.status(401).json({ error: 'Sesión de médico no válida o expirada.' });
  }
  const codigoMedico = sesion.codigo;

  try {
    if (req.method === 'GET') {
      const formula = `{Médico}="${codigoMedico.replace(/"/g, '\\"')}"`;
      const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(formula)}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const data = await r.json();
      const progreso = (data.records || []).map(rec => ({
        modulo: rec.fields['Módulo'] || null,
        aprobado: rec.fields['Aprobado'] === true,
        puntaje: typeof rec.fields['Último puntaje'] === 'number' ? Math.round(rec.fields['Último puntaje'] * 100) : null,
        intentos: rec.fields['Intentos'] || 0,
        fechaAprobacion: rec.fields['Fecha de aprobación'] || null,
      }));
      return res.status(200).json({ ok: true, progreso });
    }

    if (req.method === 'POST') {
      const { modulo, puntaje } = req.body || {};
      if (!modulo || !MODULOS_VALIDOS.includes(modulo)) {
        return res.status(400).json({ error: 'Módulo no reconocido.' });
      }
      const puntajeNum = Number(puntaje);
      if (isNaN(puntajeNum) || puntajeNum < 0 || puntajeNum > 100) {
        return res.status(400).json({ error: 'Puntaje inválido (0-100).' });
      }
      const aprobado = puntajeNum >= 80;

      const existente = await buscarRegistro(codigoMedico, modulo);

      if (existente) {
        const intentosPrevios = existente.fields['Intentos'] || 0;
        const patchRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${existente.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              'Intentos': intentosPrevios + 1,
              'Último puntaje': puntajeNum / 100,
              'Aprobado': aprobado || existente.fields['Aprobado'] === true, // una vez aprobado, no se revierte por un reintento peor
              'Fecha de aprobación': aprobado ? hoyISO() : (existente.fields['Fecha de aprobación'] || null),
            },
          }),
        });
        const patchData = await patchRes.json();
        if (!patchRes.ok) return res.status(patchRes.status).json({ error: 'No se pudo actualizar el progreso.', detail: patchData });
        return res.status(200).json({ ok: true, actualizado: true });
      }

      const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            'Médico': codigoMedico,
            'Módulo': modulo,
            'Tipo de registro': ['Certificación interna'],
            'Estatus': aprobado ? 'Completado' : 'En curso',
            'Intentos': 1,
            'Último puntaje': puntajeNum / 100,
            'Aprobado': aprobado,
            'Fecha de aprobación': aprobado ? hoyISO() : null,
          },
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) return res.status(createRes.status).json({ error: 'No se pudo crear el registro de progreso.', detail: createData });
      return res.status(200).json({ ok: true, creado: true });
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error('[capacitacion-progreso] error:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
