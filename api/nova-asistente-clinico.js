// api/nova-asistente-clinico.js
// Consolida dos funciones que antes vivían en archivos separados
// (api/sugerir-cie10.js y api/expediente-completitud.js) en un solo
// endpoint — Vercel Hobby permite máximo 12 funciones serverless por
// deployment, y con 14 archivos en api/ los últimos deployments empezaron
// a fallar (errorCode: exceeded_serverless_functions_per_deployment).
// Cada archivo .js dentro de /api cuenta como una función, sin importar
// su tamaño — por eso consolidar dos endpoints pequeños y relacionados
// en uno solo, enrutando por "accion", es la forma correcta de resolverlo
// sin perder funcionalidad ni pagar por el plan Pro.
//
// accion: "sugerir_cie10" | "completitud_expediente"

const { verificarToken, tokenDesdeRequest } = require('../lib/auth');
const { autorizarPaciente, ErrorAutorizacion } = require('../lib/autorizacion');

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_ID = 'app6jyD9pDlTLpknA';
const CONSULTAS_TABLE_ID = 'tbl1Xp2IGxdV178Ky';
const HISTORIA_TABLE_ID = 'tblm2xUADazitHisR';

async function airtableGet(tableId, formula, sort) {
  const params = new URLSearchParams({ filterByFormula: formula });
  if (sort) { params.set('sort[0][field]', sort); params.set('sort[0][direction]', 'desc'); }
  const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params.toString()}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await r.json();
  return (data.records && data.records[0]) || null;
}

// ── accion: sugerir_cie10 ──────────────────────────────────────────
async function sugerirCie10(req, res) {
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurado.' });

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

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 200,
      system:
        'Eres un asistente clínico que sugiere códigos CIE-10 a partir de un cuadro clínico. ' +
        'Responde ÚNICAMENTE en este formato exacto, sin texto adicional: "CÓDIGO — Descripción breve". ' +
        'Si la información es insuficiente para una sugerencia razonable, responde exactamente: "INSUFICIENTE". ' +
        'Nunca inventes certeza donde no la hay — esto es una sugerencia que el médico va a revisar, no un diagnóstico definitivo.',
      messages: [{ role: 'user', content: partes.join('\n') }],
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

  if (!patchRes.ok) return res.status(200).json({ ok: true, sugerido: true, guardado: false, sugerencia: texto });
  return res.status(200).json({ ok: true, sugerido: true, guardado: true, sugerencia: texto });
}

// ── accion: completitud_expediente ───────────────────────────────
async function completitudExpediente(req, res, sesion) {
  const { codigoPaciente } = req.body || {};
  if (!codigoPaciente) return res.status(400).json({ error: 'Falta codigoPaciente.' });

  // Antes solo comprobaba que el código existiera — cualquier médico con
  // sesión válida podía pedir la completitud del expediente de CUALQUIER
  // paciente (hueco de autorización), y el 404 distinguía "no existe" de
  // "sí existe", oráculo de enumeración. autorizarPaciente() cierra ambos:
  // solo el médico dueño (o demo) puede pedirlo, y el error es uniforme.
  let auth;
  try {
    auth = await autorizarPaciente(sesion.codigo, codigoPaciente);
  } catch (errAuth) {
    if (errAuth instanceof ErrorAutorizacion) {
      return res.status(errAuth.status).json({ error: errAuth.message });
    }
    console.error('[nova-asistente-clinico] completitud_expediente autorizarPaciente:', errAuth.message);
    return res.status(errAuth.status || 502).json({ error: 'No se pudo verificar el acceso al paciente.' });
  }

  const faltantes = [];
  const [historia, ultimaConsulta] = await Promise.all([
    airtableGet(HISTORIA_TABLE_ID, `{Código de paciente ref}="${auth.codigo}"`),
    airtableGet(CONSULTAS_TABLE_ID, `{Código de paciente ref}="${auth.codigo}"`, 'Fecha de consulta'),
  ]);

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

  return res.status(200).json({ ok: true, completo: faltantes.length === 0, faltantes });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!AIRTABLE_TOKEN) return res.status(500).json({ error: 'AIRTABLE_TOKEN no configurado.' });

  const sesion = verificarToken(tokenDesdeRequest(req));
  if (!sesion || sesion.tipo !== 'medico') {
    return res.status(401).json({ error: 'Sesión de médico no válida.' });
  }

  try {
    const accion = req.body && req.body.accion;
    if (accion === 'sugerir_cie10') return await sugerirCie10(req, res);
    if (accion === 'completitud_expediente') return await completitudExpediente(req, res, sesion);
    return res.status(400).json({ error: 'Falta "accion" válida (sugerir_cie10 | completitud_expediente).' });
  } catch (err) {
    console.error('[nova-asistente-clinico] error:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
