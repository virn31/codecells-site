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
// accion: "sugerir_cie10" | "completitud_expediente" | "traducir"
//
// "traducir" se agregó aquí, y no en un api/traducir.js propio, por la
// misma razón: el repo ya tiene 15 funciones contadas por Vercel y un
// archivo más solo empeora el problema. Ver la nota al final sobre el
// conteo actual de funciones.
//
// A diferencia de las otras dos acciones, "traducir" es PÚBLICA (la usa
// el landing, donde no hay sesión). Por eso la verificación de token se
// hace por acción y no de forma global, y "traducir" trae sus propios
// límites: origen permitido, tope de 60 textos, 400 caracteres por texto
// y límite por IP.

const { verificarToken, tokenDesdeRequest } = require('../lib/auth');

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_ID = 'app6jyD9pDlTLpknA';
const CONSULTAS_TABLE_ID = 'tbl1Xp2IGxdV178Ky';
const PACIENTES_TABLE_ID = 'tblyUcCfueFLJuvIv';
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
async function completitudExpediente(req, res) {
  const { codigoPaciente } = req.body || {};
  if (!codigoPaciente) return res.status(400).json({ error: 'Falta codigoPaciente.' });

  const faltantes = [];
  const [paciente, historia, ultimaConsulta] = await Promise.all([
    airtableGet(PACIENTES_TABLE_ID, `{Código de paciente}="${codigoPaciente}"`),
    airtableGet(HISTORIA_TABLE_ID, `{Código de paciente ref}="${codigoPaciente}"`),
    airtableGet(CONSULTAS_TABLE_ID, `{Código de paciente ref}="${codigoPaciente}"`, 'Fecha de consulta'),
  ]);

  if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado.' });

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

// ── accion: traducir ─────────────────────────────────────────────
// Relleno automático del sistema i18n. El diccionario de lib/i18n.js
// cubre lo que ya existe en el HTML; esto cubre lo que se agregue
// después, para que la página no se vuelva a ver mezclada en dos
// idiomas cada vez que alguien edita una plantilla.
//
// Lo que este endpoint NUNCA debe recibir son datos de paciente. El
// cliente ya lo impide (en portal-medico / mi-nivel / portal-vip /
// kiosco / autorregistro solo se manda el texto estático de la
// interfaz, nunca lo que se inyecta después con datos reales), pero
// aquí abajo hay un segundo filtro por si algo se escapa.

const IDIOMAS_TRADUCCION = {
  en: 'inglés', fr: 'francés', pt: 'portugués (de Brasil)', de: 'alemán'
};

// Límite por IP, best-effort. En serverless la memoria no se comparte
// entre instancias, así que esto frena el abuso casual, no un ataque
// decidido. Para eso está además el filtro de origen.
const golpesPorIp = new Map();
function limiteExcedido(ip) {
  const ahora = Date.now();
  const ventana = 60 * 1000;
  const maximo = 20;
  const lista = (golpesPorIp.get(ip) || []).filter(t => ahora - t < ventana);
  lista.push(ahora);
  golpesPorIp.set(ip, lista);
  if (golpesPorIp.size > 500) golpesPorIp.clear();
  return lista.length > maximo;
}

// Segundo filtro anti-datos-de-paciente.
const PATRON_SENSIBLE = /(CC-PAC-|CCMED-|DZW-|\b\d{10}\b|\b\d{4}-\d{2}-\d{2}\b|@[\w.-]+\.\w{2,})/;

async function traducir(req, res) {
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurado.' });

  const origen = req.headers.origin || '';
  const permitido = !origen ||
    origen.startsWith('https://codecells.mx') ||
    origen.startsWith('https://www.codecells.mx') ||
    origen.startsWith('http://localhost');
  if (!permitido) return res.status(403).json({ error: 'Origen no permitido.' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida';
  if (limiteExcedido(ip)) return res.status(429).json({ error: 'Demasiadas solicitudes.' });

  const { idioma, textos } = req.body || {};
  if (!IDIOMAS_TRADUCCION[idioma]) {
    return res.status(400).json({ error: 'Idioma no soportado.' });
  }
  if (!Array.isArray(textos) || textos.length === 0) {
    return res.status(400).json({ error: 'Falta el arreglo "textos".' });
  }

  const limpios = textos
    .filter(t => typeof t === 'string')
    .map(t => t.trim())
    .filter(t => t.length >= 2 && t.length <= 400 && !PATRON_SENSIBLE.test(t))
    .slice(0, 60);

  if (limpios.length === 0) return res.status(200).json({ ok: true, traducciones: {} });

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      system:
        'Eres el traductor de la interfaz de CODE CELLS®, una red de medicina regenerativa. ' +
        `Traduces del español al ${IDIOMAS_TRADUCCION[idioma]}.\n\n` +
        'REGLAS:\n' +
        '1. Registro clínico y profesional, tono sobrio. No coloquial, no publicitario de más.\n' +
        '2. Conserva EXACTAMENTE, sin traducir: marcas y símbolos (CODE CELLS®, CODE ENERGY™, ' +
        'CODE REPAIR™, CODE BALANCE™, CODE NEURO™, CODE REGEN™, DEZAWA PROTOCOL™, RESTORE™, ' +
        'ACTIVATE™, GENESIS™, CONTINUUM™, NOVA, Regene Global), unidades (kg, cm, mmHg, °C, lpm), ' +
        'códigos CIE-10, emojis, flechas y cualquier signo de puntuación decorativo.\n' +
        '3. Conserva la puntuación y el formato de origen: si el texto abre con emoji o flecha, ' +
        'la traducción también; si trae comillas tipográficas “ ”, se mantienen.\n' +
        '4. Usa terminología clínica estándar del idioma destino (por ejemplo "Historia clínica" → ' +
        '"Clinical history", no "Clinical story").\n' +
        '5. Mantén longitudes parecidas: son etiquetas de interfaz y no deben desbordar botones.\n' +
        '6. Si una cadena no tiene sentido traducirla (es un código, una sigla o ya está en el ' +
        'idioma destino), devuélvela idéntica.\n\n' +
        'FORMATO DE RESPUESTA: únicamente un objeto JSON válido cuyas llaves sean los textos ' +
        'originales exactos y cuyos valores sean las traducciones. Sin comentarios, sin markdown, ' +
        'sin ```json. Nada antes ni después del objeto.',
      messages: [{ role: 'user', content: JSON.stringify(limpios, null, 0) }],
    }),
  });

  if (!claudeRes.ok) {
    console.error('[traducir] Anthropic respondió', claudeRes.status);
    return res.status(502).json({ error: 'El servicio de traducción no respondió.' });
  }

  const data = await claudeRes.json();
  const bruto = Array.isArray(data.content)
    ? (data.content.find(b => b && b.type === 'text') || {}).text || ''
    : '';

  let traducciones = {};
  try {
    const limpio = bruto.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const inicio = limpio.indexOf('{');
    const fin = limpio.lastIndexOf('}');
    traducciones = JSON.parse(limpio.slice(inicio, fin + 1));
  } catch (err) {
    console.error('[traducir] No se pudo parsear la respuesta:', err.message);
    return res.status(200).json({ ok: true, traducciones: {} });
  }

  // Solo devolvemos llaves que pedimos: evita que una respuesta rara
  // meta texto que el cliente nunca solicitó.
  const salida = {};
  limpios.forEach(t => {
    const v = traducciones[t];
    if (typeof v === 'string' && v.trim() && v.length <= 600) salida[t] = v.trim();
  });

  return res.status(200).json({ ok: true, idioma, traducciones: salida });
}

// ── Enrutador ────────────────────────────────────────────────────
module.exports = async (req, res) => {
  const origen = req.headers.origin || '';
  if (origen.startsWith('https://codecells.mx') || origen.startsWith('https://www.codecells.mx')) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const accion = req.body && req.body.accion;

  try {
    // Pública: la usa el landing, donde no hay sesión iniciada.
    if (accion === 'traducir') return await traducir(req, res);

    // Todo lo demás sigue exigiendo sesión de médico, igual que antes.
    if (!AIRTABLE_TOKEN) return res.status(500).json({ error: 'AIRTABLE_TOKEN no configurado.' });
    const sesion = verificarToken(tokenDesdeRequest(req));
    if (!sesion || sesion.tipo !== 'medico') {
      return res.status(401).json({ error: 'Sesión de médico no válida.' });
    }

    if (accion === 'sugerir_cie10') return await sugerirCie10(req, res);
    if (accion === 'completitud_expediente') return await completitudExpediente(req, res);
    return res.status(400).json({ error: 'Falta "accion" válida (sugerir_cie10 | completitud_expediente | traducir).' });
  } catch (err) {
    console.error('[nova-asistente-clinico] error:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
