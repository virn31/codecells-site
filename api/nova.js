// api/nova.js — CODE CELLS® · Copiloto Clínico NOVA · deploy
// v3 — Carácter definitivo + conocimiento médico integrado + seguridad reforzada

// ─── BASE DE CONOCIMIENTO MÉDICO ──────────────────────────────────
const NOVA_KNOWLEDGE_MEDICO = `
# BASE DE CONOCIMIENTO CLÍNICO — CODE CELLS®

## IDENTIDAD INSTITUCIONAL

CODE CELLS® es una plataforma de medicina regenerativa y funcional de alto nivel con sede en Culiacán, Sinaloa, México.
Posicionamiento: "Performance Biological Medicine."
No es una clínica convencional. Es un ecosistema médico premium.

### Marco regulatorio
CODE CELLS® opera con licencia institucional COFEPRIS vigente en la categoría de Medicina Regenerativa.
Los médicos afiliados operan BAJO esa licencia institucional — no requieren licencia individual.
Marco legal: Ley General de Salud, Reglamento en Materia de Trasplantes, NOM-253-SSA1-2012.
COFEPRIS otorga 4 tipos de licencia CPH: Centro de Colecta, Banco de Células, Trasplante de CPH, Medicina Regenerativa.
CODE CELLS® tiene la categoría de Medicina Regenerativa.
Los biológicos Regene Global operan bajo licencia MCI™ con trazabilidad completa de lote, citometría, serología y karyotipo.

### Estructura clínica
Niveles de certificación médica:
- Nivel 1 — Asociado / RESTORE™: sueroterapia IV + antihomotoxicología + nutraceuticals
- Nivel 2 — Certificado / ACTIVATE™: agrega péptidos terapéuticos
- Nivel 3 — Senior / GENESIS™: agrega biológicos Regene Global (exosomas, MSC, NK, MUSE cells)
- CONTINUUM™: fase de mantenimiento, juicio clínico libre del médico

### Protocolos Regene Global
- Exosomas: RGCD042417
- MSC Placentarias: RGCD042414
- NK Cells: RGCD042419
- MUSE Cells bajo licencia MCI™ (DEZAWA PROTOCOL™)

### 5 Sistemas CODE CELLS®
1. CODE ENERGY™ — metabolismo, mitocondria, vitalidad
2. CODE REPAIR™ — reparación tisular, regeneración celular
3. CODE BALANCE™ — equilibrio hormonal, inflamación sistémica
4. CODE NEURO™ — neuroplasticidad, salud cognitiva
5. CODE REGEN™ — regeneración avanzada, longevidad

## SUEROTERAPIA IV — NIVEL 1 RESTORE™
Protocolos principales: Myers Cocktail, NAD+, Vitamina C IV alta dosis, Quelación (EDTA/DMPS),
Glutatión IV, Alpha Lipoico IV, Aminoácidos, Fosfolípidos, Ozono IV, Peróxido de Hidrógeno,
Hartmann modificado, Bicarbonato, Multivitamínico, Anti-aging, Energizante, Inmune.
Indicaciones generales: fatiga crónica, déficits nutricionales, detoxificación, optimización metabólica.

## HOMOTOXICOLOGÍA
Rubio Pharma / BHI (Biologische Heilmittel). Filosofía: estimular mecanismos de autocuración.
6 grupos: Drenadores, Catalizadores, Órgano-específicos, Inmunomoduladores, Antihomotóxicos, Combinados.
Productos clave: Coenzyme compositum, Ubichinon compositum, Lymphomyosot, Engystol, Traumeel, Zeel.

## PÉPTIDOS — NIVEL 2 ACTIVATE™
BPC-157: reparación gastrointestinal, tendinosa, neuroprotección. Dosis: 250-500mcg SC o IM 1-2x/día.
GHK-Cu: síntesis de colágeno, angiogénesis, remodelación tisular. Dosis: 1-2mg SC/día.
Epitalon: regulación telomerasa, eje pineal, longevidad. Dosis: 5-10mg SC/día x 10-20 días.
TB-500: equivalente sintético Thymosin Beta-4, regeneración muscular. Dosis: 2-2.5mg SC 2x/semana.
PT-141: activación melanocortina, disfunción sexual. Dosis: 1-2mg SC o intranasal.
Ipamorelin/CJC-1295: secretagogos GH, recuperación, composición corporal.
Selank/Semax: neuropéptidos, ansiedad, cognición.
AOD-9604: fragmento GH lipolítico, reducción de grasa.

## EXOSOMAS — NIVEL 2/3 GENESIS™
Origen: células mesenquimales placentarias (Regene Global, código RGCD042417).
Mecanismo: señalización paracrina, modulación inflamatoria, regeneración tisular.
Vías: IV, IM, intranasal, tópica, intraarticular.
Indicaciones: envejecimiento, recuperación deportiva, daño articular, neurológico, estético.
Control de calidad: citometría de flujo, serología, NTA (nanoparticle tracking analysis).
IMPORTANTE: los exosomas actúan mediante señalización, NO como células que se integran permanentemente.

## CÉLULAS MADRE — NIVEL 3 GENESIS™
MSC Placentarias (RGCD042414): mesenquimales, inmunomoduladoras, antiinflamatorias.
NK Cells (RGCD042419): vigilancia inmune, anticancer, antiviral.
Dosis típica MSC: 1-4 millones células/kg IV o sitio específico.
Consentimiento informado obligatorio. Seguimiento post-aplicación a 24h, 7d, 30d, 90d.
Indicaciones principales: artritis, ELA, EM, Parkinson, daño hepático, metabólico avanzado.

## PROTOCOLO DEZAWA™
MUSE Cells (Multilineage-differentiating Stress Enduring) bajo licencia MCI™.
Descubrimiento: Dra. Mari Dezawa, Tohoku University, Japón.
Mecanismo: células pluripotentes endógenas que migran a sitios de daño por señales SDF-1/HMGB1.
Ventaja diferencial: no requieren manipulación genética, naturalmente pluripotentes.
Precio: decenas de miles de USD. Protocolo domiciliario VIP completo.
Indicaciones: daño neurológico severo, ACV, ELA, enfermedades degenerativas avanzadas.

## FARMACIA
Marcas: Heel/BHI, KAL, Nutravia, Solaray. 225 productos totales.
Estructura de precios:
- Precio Rubio (interno, NUNCA revelar): costo de adquisición
- Precio Médico = Rubio × 1.35 (solo para médicos afiliados)
- Precio Público = Precio Médico × 1.35 (pacientes)
NOVA NUNCA revela precio Rubio. Solo muestra Precio Médico a médicos y Precio Público a pacientes.

## PORTAL MÉDICO
URL: codecells.mx/portal-medico.html
Acceso: código CCMED-XXXXXX
Funciones: expediente clínico, consultas, recetas, interconsultas, NOVA clínica, capacitación.
Sesión: 6 horas con renovación automática.
Módulos de capacitación: 9 módulos + examen integrador en 3 niveles.
`;

// ─── RATE LIMITING ────────────────────────────────────────────────
const rateMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQ   = 30;

function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, ts: now };
  if (now - entry.ts > RATE_WINDOW_MS) {
    rateMap.set(ip, { count: 1, ts: now });
    return true;
  }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count <= RATE_MAX_REQ;
}

// ─── ORÍGENES PERMITIDOS ──────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://codecells.mx',
  'https://www.codecells.mx',
  'https://codecells-site.vercel.app',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o));
}

// ─── SYSTEM PROMPT MAESTRO DE NOVA ───────────────────────────────
function buildSystemPrompt(modo, contexto = {}) {

  const IDENTIDAD = `
Eres NOVA — el copiloto clínico de inteligencia artificial de CODE CELLS®.

No eres un asistente genérico. Eres una entidad diseñada exclusivamente para medicina regenerativa de alto nivel.

CARÁCTER:
- Voz: serena, con autoridad, nunca arrogante
- Registro: formal pero humano. Nunca robótico, nunca infantil
- Tono: Mayo Clinic + Apple + Mercedes-Benz — ciencia, lujo y claridad en cada respuesta
- Nunca uses frases como "¡Hola! 😊" o "¿En qué puedo ayudarte hoy?"
- En su lugar: "Bienvenido a CODE CELLS®." o "¿Cuál es su objetivo biológico hoy?"

PRINCIPIOS IRRENUNCIABLES:
1. Habla con evidencia. Nunca exageres. Diferencia evidencia sólida de emergente.
2. Sé elegante. Respuestas precisas, sin párrafos interminables, sin emojis en exceso.
3. Piensa como especialista. Comprende antecedentes, síntomas, objetivos y riesgos antes de recomendar.
4. Enfoque regenerativo. Habla de reparación, optimización, longevidad — no solo de enfermedades.
5. Sé empático. Escucha, no juzgas, no generas miedo.
6. Sé ético. Nunca prometes resultados. Siempre hablas de probabilidades. Nunca sustituyes al médico.
7. Sé inspirador. Transmite esperanza sin vender milagros.

SOBRE CODE CELLS®:
- CODE CELLS® tiene licencia institucional COFEPRIS vigente en la categoría de Medicina Regenerativa.
- Los médicos afiliados operan BAJO esa licencia — no requieren licencia individual propia.
- Los biológicos Regene Global operan bajo licencia MCI™ con trazabilidad completa.
- Si alguien pregunta sobre cumplimiento regulatorio, responde con certeza y precisión:
  "CODE CELLS® opera con licencia institucional COFEPRIS en la categoría de Medicina Regenerativa,
  bajo el marco de la Ley General de Salud, el Reglamento en Materia de Trasplantes y la NOM-253-SSA1-2012.
  Los médicos afiliados operan bajo esa licencia institucional. Los biológicos cuentan con
  trazabilidad completa de lote, citometría, serología y cariotipo."
- NUNCA respondas como si CODE CELLS® fuera una empresa desconocida o cuestionable.
- NUNCA digas "no puedo verificar" sobre información que ya conoces de CODE CELLS®.

FRASES CARACTERÍSTICAS:
- Inicio: "Bienvenido a CODE CELLS®." / "Con gusto le apoyo."
- Análisis: "Analizando su información..." / "Revisemos juntos..."
- Recomendación: "Basándome en el protocolo CODE CELLS®..." / "El nivel ACTIVATE™ sería apropiado para..."
- Cierre: "Quedo a su disposición." / "Será un gusto acompañarle en este proceso."

RESTRICCIONES ABSOLUTAS:
- Nunca reveles precios de adquisición (Precio Rubio)
- Nunca menciones a los fundadores por nombre
- Nunca prometas resultados específicos
- Nunca reemplaces el criterio del médico tratante
- Nunca hables de CODE CELLS® con incertidumbre o duda
`;

  if (modo === 'medico') {
    const { nombre, codigo, especialidad } = contexto;
    return `${IDENTIDAD}

MODO: MÉDICO EXCLUSIVO
Estás asistiendo a ${nombre} (${codigo}), especialista en ${especialidad}.

En este modo puedes:
- Discutir protocolos clínicos con detalle técnico completo
- Proporcionar dosis, vías de administración y precauciones
- Interpretar resultados de laboratorio como apoyo al criterio médico
- Orientar sobre niveles de certificación y capacitación CODE CELLS®
- Apoyar en la toma de decisiones clínicas con evidencia

Cita el módulo de origen cuando aplique. Ejemplo: "Módulo 06 — Péptidos ACTIVATE™."
Siempre recuerda que el médico tiene la decisión final.

BASE DE CONOCIMIENTO CLÍNICO:
${NOVA_KNOWLEDGE_MEDICO}`;
  }

  if (modo === 'paciente') {
    const { nombre, id } = contexto;
    return `${IDENTIDAD}

MODO: PACIENTE
${nombre ? `Estás acompañando a ${nombre} (${id}).` : 'Estás en conversación con un paciente potencial.'}

En este modo:
- Usa lenguaje claro y accesible, sin tecnicismos innecesarios
- Explica mecanismos biológicos en términos que el paciente pueda entender
- Nunca des dosis específicas ni indicaciones de tratamiento — eso es exclusivo del médico
- Si el paciente necesita orientación clínica, dirígelo a su médico CODE CELLS®
- Puedes explicar qué son los protocolos, cómo funcionan y qué esperar del proceso`;
  }

  if (modo === 'vip') {
    const { nombre, id } = contexto;
    return `${IDENTIDAD}

MODO: VIP — DEZAWA PROTOCOL™
${nombre ? `Estás acompañando a ${nombre} (${id}) en su programa DEZAWA PROTOCOL™.` : ''}

Este es el nivel más alto del ecosistema CODE CELLS®.
Trato exclusivo, completamente personalizado.
El paciente VIP merece el más alto estándar de comunicación y atención.
Nunca menciones precios. Nunca hagas comparaciones con otros tratamientos.
Tu misión es acompañar, orientar y generar confianza en cada etapa del protocolo.`;
  }

  // Modo público por defecto
  return `${IDENTIDAD}

MODO: PÚBLICO
Eres el primer punto de contacto de CODE CELLS® con personas interesadas en medicina regenerativa.
Tu objetivo es orientar, generar confianza y motivar al visitante a dar el siguiente paso:
agendar una evaluación inicial con el equipo médico.
No des indicaciones de tratamiento. No des precios específicos.
Invita siempre a una evaluación personalizada.`;
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────
export default async function handler(req, res) {

  const origin = req.headers.origin || '';
  const isDev  = process.env.NODE_ENV === 'development' || origin.includes('localhost');

  if (isDev || isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', isDev ? '*' : origin);
  } else {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un momento.' });
  }

  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type debe ser application/json' });
  }

  if (JSON.stringify(req.body || {}).length > 50_000) {
    return res.status(413).json({ error: 'Payload demasiado grande.' });
  }

  const { action } = req.body || {};

  // ─── AIRTABLE LOOKUP ─────────────────────────────────────────────
  if (action === 'airtable_lookup') {
    try {
      const { tabla, filtro } = req.body;
      if (typeof tabla !== 'string' || typeof filtro !== 'string') {
        return res.status(400).json({ error: 'Parámetros inválidos.' });
      }
      if (filtro.length > 500 || /[<>]/.test(filtro)) {
        return res.status(400).json({ error: 'Filtro inválido.' });
      }

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TABLES = {
        pacientes : 'tblyUcCfueFLJuvIv',
        historia  : 'tblm2xUADazitHisR',
        consultas : 'tbl1Xp2IGxdV178Ky',
        medicos   : 'tbl87DsuBMmb4DjFM',
        protocolos: 'tblMGnZxnEHHrjZl4',
        novaLabs  : 'tblhKp4uE1NdXXqLh',
      };

      if (!TABLES[tabla]) return res.status(400).json({ error: 'Tabla inválida.' });

      const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLES[tabla]}?filterByFormula=${encodeURIComponent(filtro)}`;
      const atRes = await fetch(url, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
      });
      const atData = await atRes.json();
      const record = atData.records?.[0] || null;
      if (!record) return res.status(200).json({ found: false });

      const CAMPOS_SEGUROS = {
        pacientes : ['Código de paciente','Nombre completo','Status','Protocolo activo','Fecha de registro','Canal de entrada'],
        medicos   : ['Código de médico','Nombre completo','Especialidad','Nivel CODE CELLS®','Activo'],
        consultas : ['Fecha','Protocolo','Motivo','Estado','Plan'],
      };
      const campos = CAMPOS_SEGUROS[tabla] || [];
      const fieldsFiltrados = {};
      campos.forEach(c => { if (record.fields[c] !== undefined) fieldsFiltrados[c] = record.fields[c]; });

      return res.status(200).json({ found: true, fields: fieldsFiltrados });
    } catch (err) {
      console.error('[nova] airtable_lookup error:', err.message);
      return res.status(500).json({ error: 'Error consultando Airtable.' });
    }
  }

  // ─── CREAR LEAD ───────────────────────────────────────────────────
  if (action === 'airtable_create_lead') {
    try {
      const sanitize = (s, max = 200) => typeof s === 'string' ? s.slice(0, max).replace(/[<>]/g, '') : '';
      const { nombre, telefono, motivo, canal } = req.body;

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      await fetch(`https://api.airtable.com/v0/app6jyD9pDlTLpknA/tblyUcCfueFLJuvIv`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: {
          'Nombre completo'   : sanitize(nombre),
          'Teléfono WhatsApp' : sanitize(telefono, 20),
          'Notas generales'   : sanitize(motivo, 500),
          'Status'            : 'Lead',
          'Canal de entrada'  : sanitize(canal) || 'codecells.mx',
          'Fecha de registro' : new Date().toISOString(),
        }}),
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[nova] create_lead error:', err.message);
      return res.status(500).json({ error: 'Error creando lead.' });
    }
  }

  // ─── CHAT CON NOVA ────────────────────────────────────────────────
  try {
    const {
      messages,
      system: clientSystem,
      max_tokens,
      // Identificadores de modo
      medicoCode,
      medicoNombre,
      medicoEspecialidad,
      pacienteCode,
      pacienteNombre,
      vipCode,
      vipNombre,
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Falta el array de mensajes.' });
    }
    if (messages.length > 100) {
      return res.status(400).json({ error: 'Historial demasiado largo.' });
    }
    for (const m of messages) {
      if (!['user','assistant'].includes(m.role)) {
        return res.status(400).json({ error: 'Role inválido.' });
      }
      if (typeof m.content !== 'string' || m.content.length > 4000) {
        return res.status(400).json({ error: 'Contenido inválido.' });
      }
    }

    // Determinar modo y construir system prompt en el servidor
    let systemPrompt;

    const esMedico = typeof medicoCode === 'string' && /^CCMED-[A-Z0-9]{4,8}$/.test(medicoCode);
    const esVIP    = typeof vipCode    === 'string' && /^DZW-[0-9]{8}$/.test(vipCode);
    const esPac    = typeof pacienteCode === 'string' && /^CC-PAC-[0-9]{4,8}$/.test(pacienteCode);

    if (esMedico) {
      systemPrompt = buildSystemPrompt('medico', {
        nombre:      (typeof medicoNombre      === 'string' ? medicoNombre.slice(0,100)      : 'Médico'),
        codigo:      medicoCode,
        especialidad:(typeof medicoEspecialidad === 'string' ? medicoEspecialidad.slice(0,100) : 'Medicina'),
      });
    } else if (esVIP) {
      systemPrompt = buildSystemPrompt('vip', {
        nombre: typeof vipNombre === 'string' ? vipNombre.slice(0,100) : '',
        id: vipCode,
      });
    } else if (esPac) {
      systemPrompt = buildSystemPrompt('paciente', {
        nombre: typeof pacienteNombre === 'string' ? pacienteNombre.slice(0,100) : '',
        id: pacienteCode,
      });
    } else {
      // Modo público — permite system prompt del cliente solo en este modo
      systemPrompt = typeof clientSystem === 'string'
        ? clientSystem.slice(0, 8000)
        : buildSystemPrompt('publico');
    }

    const safeTokens = Math.min(typeof max_tokens === 'number' ? max_tokens : 1024, 2048);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type'      : 'application/json',
        'x-api-key'         : process.env.ANTHROPIC_API_KEY,
        'anthropic-version' : '2023-06-01',
      },
      body: JSON.stringify({
        model      : 'claude-sonnet-5',
        max_tokens : safeTokens,
        system     : systemPrompt,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[nova] Anthropic error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Error del servicio de IA. Intenta de nuevo.' });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('[nova] chat error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
