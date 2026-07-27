// api/expediente-completitud.js
// Se llama automáticamente cada vez que el portal abre el expediente de un
// paciente. Revisa la consulta más reciente y los datos base del paciente
// contra los elementos que exige NOM-004-SSA3-2012, y regresa qué falta —
// el portal muestra esto como un aviso, nunca bloquea nada.
//
// Es una revisión determinística (presencia/ausencia de campos), no una
// evaluación de calidad clínica — eso sigue siendo criterio exclusivo del
// médico.

const { verificarToken, tokenDesdeRequest } = require('../lib/auth');

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'app6jyD9pDlTLpknA';
const PACIENTES_TABLE_ID = 'tblyUcCfueFLJuvIv';
const HISTORIA_TABLE_ID = 'tblm2xUADazitHisR';
const CONSULTAS_TABLE_ID = 'tbl1Xp2IGxdV178Ky';

async function airtableGet(tableId, formula, sort) {
  const params = new URLSearchParams({ filterByFormula: formula });
  if (sort) { params.set('sort[0][field]', sort); params.set('sort[0][direction]', 'desc'); }
  const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params.toString()}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await r.json();
  return (data.records && data.records[0]) || null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!AIRTABLE_TOKEN) return res.status(500).json({ error: 'AIRTABLE_TOKEN no configurado.' });

  const sesion = verificarToken(tokenDesdeRequest(req));
  if (!sesion || sesion.tipo !== 'medico') {
    return res.status(401).json({ error: 'Sesión de médico no válida.' });
  }

  try {
    const { codigoPaciente } = req.body || {};
    if (!codigoPaciente) return res.status(400).json({ error: 'Falta codigoPaciente.' });

    const faltantes = [];

    const [paciente, historia, ultimaConsulta] = await Promise.all([
      airtableGet(PACIENTES_TABLE_ID, `{Código de paciente}="${codigoPaciente}"`),
      airtableGet(HISTORIA_TABLE_ID, `{Código de paciente ref}="${codigoPaciente}"`),
      airtableGet(CONSULTAS_TABLE_ID, `{Código de paciente ref}="${codigoPaciente}"`, 'Fecha de consulta'),
    ]);

    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado.' });

    // Antecedentes básicos (NOM-004: AHF, APP, APNP)
    if (!historia) {
      faltantes.push({ campo: 'Historia clínica', detalle: 'El paciente no tiene ningún antecedente capturado todavía.' });
    } else {
      if (!historia.fields['AHF — Heredo-familiares']) faltantes.push({ campo: 'Antecedentes heredo-familiares', detalle: 'No capturados.' });
      if (!historia.fields['APP — Enfermedades previas']) faltantes.push({ campo: 'Antecedentes personales patológicos', detalle: 'No capturados.' });
    }

    if (!ultimaConsulta) {
      faltantes.push({ campo: 'Consultas', detalle: 'El paciente todavía no tiene ninguna consulta registrada.' });
    } else {
      const f = ultimaConsulta.fields;
      if (!f['Firma / Cédula médico']) faltantes.push({ campo: 'Firma / Cédula del médico', detalle: 'La consulta más reciente no tiene identificación del médico que la generó — requisito de NOM-004.' });
      if (!f['Diagnóstico (CIE-10)'] && !f['Diagnóstico principal']) faltantes.push({ campo: 'Diagnóstico', detalle: 'La consulta más reciente no tiene diagnóstico registrado.' });
      if (!f['Plan terapéutico']) faltantes.push({ campo: 'Plan terapéutico', detalle: 'La consulta más reciente no especifica plan terapéutico.' });
      if (!f['Exploración física']) faltantes.push({ campo: 'Exploración física', detalle: 'La consulta más reciente no registra exploración física.' });
    }

    return res.status(200).json({
      ok: true,
      completo: faltantes.length === 0,
      faltantes,
    });
  } catch (err) {
    console.error('[expediente-completitud] error:', err.message);
    return res.status(500).json({ error: 'Error interno al revisar completitud.' });
  }
};
