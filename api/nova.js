// api/nova.js — CODE CELLS® · Proxy seguro Anthropic + Airtable
// v2 — Base de conocimiento médico integrada · Seguridad reforzada
// Vercel Serverless Function

// ─── BASE DE CONOCIMIENTO MÉDICO (servidor solamente — nunca al cliente) ──────
const NOVA_KNOWLEDGE_MEDICO = `# NOVA · Base de conocimiento — Módulos de capacitación médica CODE CELLS®

Este documento consolida el contenido de los 10 módulos de capacitación construidos para NOVA en modo médico (CCMED-). Úsalo como referencia para responder preguntas de médicos afiliados sobre protocolos, dosis, vías, precauciones y reglas administrativas — siempre con precisión, citando el módulo de origen cuando aplique, y remitiendo a certificación/Flujo B cuando la pregunta implique un nivel que el médico aún no tiene.

---

## 1. MARCO REGULATORIO MEXICANO

**Regulación gubernamental (externa, no negociable por CODE CELLS®):**
- Ley General de Salud (LGS): marco general del ejercicio médico y cédula profesional.
- Reglamento en Materia de Trasplantes: disposición/obtención/aplicación de tejidos y células.
- NOM-253-SSA1-2012: disposición de sangre humana y componentes.
- COFEPRIS: autoridad sanitaria federal, otorga licencias sanitarias institucionales y vigila cumplimiento de NOM.
- CNTS: coordina y mantiene el registro nacional de establecimientos autorizados en trasplantes de tejidos/células.
- RVOE: reconocimiento de validez oficial de estudios (SEP), aplica al Diplomado en Medicina Regenerativa (Anáhuac Mayab), no es una certificación clínica.

**Política administrativa interna (CODE CELLS®, sí modificable por la empresa):**
- Convenio con Regene Global: acuerdo comercial, no ley.
- Certificación clínica interna: Asociado (Nivel 1) / Certificado (Nivel 2) / Senior (Nivel 3); eje comercial "Partner" independiente del clínico.
- Flujo A (médico nuevo): capacitación antes de acceso al portal.
- Flujo B (médico activo, caso urgente fuera de nivel): acceso inmediato + compromiso de capacitación firmado en 7 días naturales, o reversión automática.
- Diplomado externo: plazo de 2 años desde afiliación (o prórroga si no hay cupo); modalidad mixta (plataforma 24/7 + sesión sincrónica no obligatoria); 140 horas/6 meses.
- Recertificación anual obligatoria en nivel Avanzado (GENESIS™).
- Cascada de licencia: Regene Global (proveedor, licencias propias) → CODE CELLS® (licencia institucional COFEPRIS) → médico certificado (ejerce bajo ese respaldo, no tramita licencia individual).
- Estatus de registro COFEPRIS/CNTS en Sinaloa: pendiente de confirmación (no asumir que ya está resuelto).

---

## 2. SUEROTERAPIA IV — PROTOCOLOS Y FUNDAMENTO

**Regla universal de monodosis (Rubio Pharma):** cada ampolleta antihomotóxica (Traumeel/Trameel S, Lymphomyosot, Zeel T, Coenzima/Ubichinon Compositum, Discus Compositum, Hepeel, Nervoheel, Spascupreel, Engystol) se usa completa por aplicación — IV lento diluida en 10ml, o IM 1-2x/semana en control domiciliario.

**Fundamento científico:**
- NAD+: coenzima redox central (glucólisis, Krebs, reparación ADN); declina ~50% tras los 50 años; sirtuinas y PARP dependen de ella.
- Vitamina C IV en dosis altas: pro-oxidante selectivo — genera H2O2 extracelular tóxico para células con baja catalasa/glutatión peroxidasa (frecuente en algunas tumorales).
- Glutatión: antioxidante intracelular maestro; vía oral ineficaz (mala absorción GI), se prefiere IV/IM/inhalado.
- Gerovital H3: procaína → PABA + DEAE (similar a DMAE) → mejora circulación tisular y fosfatidilcolina de membrana.
- Peroxilive (H2O2): marco teórico histórico (Warburg, 1931) — presentar como "expectativa de beneficio reportada por el fabricante", NO como evidencia clínica validada.

**Protocolos (composición · dilución/duración · precaución):**
| Protocolo | Composición | Precaución clave |
|---|---|---|
| Myers' Cocktail IV | Vit C 5g, Complejo B 1amp, Mg 1g, Coenzima Compositum 1amp, Ubichinon Compositum 1amp · 250ml SSF 60min | IR avanzada, alergia complejo B |
| Boost Your Immunity IV | Vit C 7.5g, Zinc 1amp, Mg 1g, Complejo B 1amp, Glutatión 600mg, Traumeel 1amp, Lymphomyosot 1amp · 60-90min | Déficit G6PD, IR grave |
| Energy IV | Complejo B, Mg 1g, Vit C 5g, CoQ10 200mg, Nervoheel 1amp · 60min | Evitar en hipertiroidismo |
| Flexmotion IV | Traumeel 2amp, Zeel T 2amp, Mg 1g, Coenzima Compositum 1amp, Discus Compositum 1amp · 90min | Evitar en infección activa |
| Restart Metabólico IV | 3 sub-protocolos: Metabólico (Lipolisheel/Hepeel/Pank Suis/Lymphomyosot/ác.alfa-lipoico/Carboxilasa), Tiroideo (Thyrheel/Hepeel/Galheel/Lymphomyosot), Psico-Infeccioso (Engystol/Nervoheel/Spascupreel/Lymphomyosot/Glutatión 1200mg) · 90-120min rotativo | Ajustar según perfil |
| Diabetes IV | Vit C 7.5g, Mg 1g, Zinc 1amp, Coenzima Compositum 1amp, Carboxilasa 1amp · 90min | Monitorizar glucemia |
| Quelación IV | EDTA 1-3g, Vit C 7.5g, Mg 1g, Lymphomyosot 1amp · 2-3h | CONTRAINDICADO en IR |
| IRC IV | Vit C 3-5g, Mg 1g, Hepeel, Lymphomyosot, Nux vomica-Homaccord · 90min | Evitar Vit C>3g si TFG<30 |
| Protocolo Riordan (Vit C) | Escalamiento 15g→25g→50g→(75-100g), meta plasmática 350-400 mg/dL, monitoreo mensual · Nivel Básico/Intermedio | Preguntar antecedente de anemia hemolítica/favismo (G6PD) antes de escalar — sin requerir laboratorio. Evitar mismo día que quimio. |
| NAD+ IV | Inicio 250mg (1.5-2h) → completa 500mg (2.5-3h), goteo lento; IM 1ml con procaína; SC 120mg/semana | Hipertensos: 2-3ml/sesión + monitoreo PA |
| Anti-aging IV | NAD+ 250mg, Glutatión 1200mg, Complejo B, Ubichinon Compositum, Lymphomyosot · 2h | Infusión lenta indispensable |
| Hematopoyético IV | Premedicación Hidrocortisona 300mg+Difenhidramina 3ml; Hierro 6amp/1000ml SSF (3h); EPO SC c/72h | SIEMPRE premedicar (riesgo anafilaxia) |
| Glutatión — esquema general | 600-1400mg IV | — |
| Glutatión — esquema adyuvante quimio | 600mg/día IM días 2-5 + 1.5g/m² IV previo | Distinto del esquema general, no intercambiables |
| Gerovital H3 | 5ml esquemas por indicación · Nivel Básico/Intermedio | Contraindicado en cáncer, QT prolongado, con sulfamidas |
| Peroxilive | Oral escalonado en gotas; IV dilución 3.75% · Nivel Básico/Intermedio | Contraindicado en trasplantados (riesgo de rechazo), alcohol, hierro oral, embarazo, cirrosis, <12 años |

**Premium RevitaScience:** C-Art (articular), Longevity (NAD+/CoQ10/Glutatión/Complejo B/Lymphomyosot), Detox (EDTA+Vit C+Mg+Hepeel+Lymphomyosot), Azul de Metileno Plus (cognitivo/antioxidante).

---

## 3. PÉPTIDOS (ACTIVATE™ — Nivel Intermedio)

- ACTIVATE™ añade péptidos sobre las capas de RESTORE™ (no lo sustituye).
- Historia clínica dirigida obligatoria: antecedentes oncológicos, metabólicos, medicación actual.
- Antecedente oncológico ACTIVO: cautela reforzada / interconsulta oncológica antes de indicar — no es contraindicación automática si está en remisión antigua con seguimiento negativo.
- Paciente polimedicado (ej. anticoagulado): revisar interacciones antes de iniciar.
- Indicación basada en criterio clínico de riesgo/beneficio, NUNCA en la preferencia o "quiero lo más fuerte" del paciente.
- Certificación de nivel ACTIVATE™ requerida para uso rutinario (o Flujo B en caso justificado).

---

## 4. EXOSOMAS (GENESIS™ — Nivel Avanzado)

- Requisitos no negociables: cadena de frío ininterrumpida (recepción→aplicación) y trazabilidad documental (código de lote coincide con proveedor) — discrepancia detiene el uso hasta aclararse.
- Consentimiento informado específico obligatorio (no basta el consentimiento general de la clínica).
- Certificación GENESIS™ requerida — estar certificado en ACTIVATE™ no habilita automáticamente.
- Evento local esperable (enrojecimiento leve transitorio) vs. señal de alarma (induración progresiva + fiebre) — el segundo exige evaluación activa.
- Código de producto Regene Global: RGCD042417.

---

## 5. CÉLULAS MADRE Y BIOLÓGICOS — DOSIS REALES

| Producto | Dosis | Vía | Frecuencia/criterio |
|---|---|---|---|
| MSC placentarias | 1M células/kg (sistémico) o 10-28M según severidad (local) | IV, intralesional, intraarticular | Artrosis: 10M intraarticular c/4-6 meses. Fractura aguda: 28M intralesional + IV simultáneo (única indicación con vías combinadas) |
| MUSE Cells | Mismo criterio que MSC | Igual que MSC | Igual que MSC |
| Exosomas (células madre) | Viales según severidad (NO por peso) | IM, IV, SC, intralesional, intraarticular | VIH activo: 1x/mes×6 meses. VIH+ estable/indetectable: cada 6 meses. Combinable con MSC/MUSE en reparación osteoarticular |
| Implante placentario | Presentación 1g o 2g, ajustada por severidad | SC (técnica específica) | DM2 controlada: c/6 meses. DM2 descompensada: c/2 meses. Regeneración lenta, crónico-degenerativo |
| Células NK | Monodosis estándar (fija) | IV | Cada 2 meses. Exclusivo pacientes oncológicos (inmunovigilancia + control tumoral) |

**Principio clave:** mismo producto ≠ misma dosis/vía/frecuencia — todo depende de indicación y severidad, no del nombre del producto.

---

## 6. PORTAL MÉDICO — USO DE LA PLATAFORMA

- Login: código CCMED-XXXXXX validado contra tabla MÉDICOS (Airtable), sesión 6h (sessionStorage).
- Lista de pacientes: filtrada por campo Médico_principal.
- Interconsulta: búsqueda compartida de pacientes de otros médicos — consultar NO reasigna automáticamente al Médico_principal.
- Nueva consulta: escribe a tabla CONSULTAS; "Próxima cita" es campo obligatorio.
- NOVA en modo médico: panel lateral dentro del portal.
- Registro de médico nuevo: manual por equipo administrativo (no autorregistro como en Portal VIP).
- Código CCMED- (médico) ≠ código INV- (invitación Portal VIP paciente, 7 días) — no intercambiables.
- Seguridad: cerrar sesión manualmente en equipos compartidos, no depender solo del vencimiento de 6h.

---

## 7. PROTOCOLO DEZAWA — POSICIONAMIENTO

- Enfoque "testigo silencioso": documentación pública sin procedimientos visibles ni antes/después — aplica a comunicación de marca, NO al registro clínico interno (que sigue su propio estándar).
- "Por invitación": nunca promocionado abiertamente, proceso con fases (ambigüedad previa → revelación posterior a la aplicación) — no es solicitud abierta directa.
- Lenguaje con pacientes: orientado a resultados/experiencia, evitar terminología médica explícita.
- Influencers: rol de testigo silencioso, NUNCA venta directa; etiqueta de colaboración pagada es obligación legal, no opcional por el tono de la campaña.
- Registro de marca de referencia: lujo (Loro Piana, La Mer, Four Seasons).

---

## 8. FARMACIA E INYECTABLES — CATÁLOGO

- 4 marcas: Heel/BHI, KAL, Nutravia, Solaray (225 productos).
- Precios: \`precio_sugerido\` (público, comunicable) vs. \`precio_code_cells\`/mayoreo (costo interno, NUNCA se muestra al paciente). Antihomotóxicos Heel: precio de mayoreo directo del catálogo.
- Producto universal: Lymphomyosot — primero en iniciar, último en suspender, en TODOS los protocolos.
- Combinaciones siempre compatibles: Trameel S + Zeel T (inseparables en artrosis); Hypothasuis+Hyposuis+Supragland Suis (tríada neuroendocrina); Tesheel C+Supragland Suis (dúo masculino); Ovarheel+Placinjeel Suis (dúo femenino); Collagen Peptides+Vitamina C.
- Incompatibilidades (separar): Zinc+Hierro (2h), Calcio+Zinc, Selenium+Zinc; Berberina+anticoagulantes/inmunosupresores (verificar antes de prescribir); Vitamina C alta dosis+déficit G6PD.
- Stacks por nivel: Básico (Mg glicinato, Ultra Omega 3, Vit C-Rex, Selenium, Z Max); Intermedio (+B Complex, Methyl Folate, CoQ10, Curcumin+Ginger); Avanzado (+Creatina, Collagen Peptides, Berberine HCl, Night Blend, L-Carnitine).

---

## 9. EXAMEN INTEGRADOR POR NIVELES CLÍNICOS

- RESTORE™ (Básico): sueroterapia IV + antihomotoxicología + nutracéuticos.
- ACTIVATE™ (Intermedio): + péptidos.
- GENESIS™ (Avanzado): + biológicos (exosomas, MSC, NK, MUSE).
- Cada nivel exige certificación propia — no se hereda del nivel anterior ni de experiencia general con inyectables.
- Flujo B: acceso inmediato + compromiso de capacitación en 7 días naturales.

---

## 10. HOMOTOXICOLOGÍA — FUNDAMENTO Y MANEJO

**Origen:** Dr. Hans-Heinrich Reckeweg (1905-1985), fundó Heel en 1936, desarrolló la doctrina 1948-49, publicó su obra central en 1955.

**Concepto central:** la enfermedad es la manifestación de reacciones defensivas del organismo ante homotoxinas — significado biológico favorable. Inflamación/fiebre no son siempre negativas (sirven para detoxicar). El tratamiento debe MODULAR, no suprimir, la reacción defensiva. Vicariación regresiva = desplazamiento hacia fases reversibles/humorales durante la curación (favorable) — no confundir con empeoramiento real (progresión a fases celulares: impregnación, degeneración, neoplasia).

**Los 6 grupos (A-F):**
- A. Compuestos (4 subgrupos: Especialidades —dosis fija, 1 vocablo—, Homaccord —gotas+inyectable—, Injeel mixtos —solo inyectable—, Compositum).
- B. Simples/unitarios — ley de similitud, en Injeel/Injeel forte.
- C. Alopáticos homeopatizados — útiles en patología iatrogénica.
- D. Catalizadores intermediarios — respiración celular/ciclo ácido cítrico.
- E. Nosodes — similitud anamnésica-etiológica con infección previa.
- F. Organopreparados-"suis" — estimulación específica de órgano (cerdos sanos).

**Injeel simple vs. forte:** simple (potencias altas) — reactividad desconocida o crónico. Forte (potencias bajas) — agudo sin sensibilidad especial, luego pasar a simple con mejoría.

**Dosificación:** Aguda grave: 1comp/10 gotas c/15min máx 2h, reduciendo a 3-6 tomas/día. Crónica: oral 3x/día; inyectable 1-3x/semana.

**Vías — excepciones críticas:** Proinum® — ÚNICA contraindicación formal de IV. Cymeheel®/Disheel®/Ubicheel® — evitar IV sin experiencia (reacciones iniciales intensas).

**Advertencias:** gotas (hidroalcohólicas) — discreción en hepatópatas/ex alcohólicos. Comprimidos (lactosa) — precaución en intolerancia, no contraindicados en diabetes (0.025 UP/comprimido 300mg).

**Límite de este módulo:** NO cubre el Índice Terapéutico completo (remedio específico por síntoma/motivo de consulta) — esa capa vive en el Compendio CHII completo, que NOVA debe consultar directamente para responder ese tipo de pregunta (ej. "¿qué remedio para cervicobraquialgia?").

---

## Instrucciones de uso para NOVA en modo médico

1. Cuando un médico pregunte sobre cualquier protocolo, dosis, grupo, precaución o regla administrativa cubierta arriba, responde con precisión citando los datos exactos (dosis, vía, frecuencia) — no aproximes ni inventes cifras.
2. Si la pregunta requiere el Índice Terapéutico completo de homotoxicología (remedio por síntoma específico) y tienes ese compendio en tu base de datos completa, respóndela desde ahí citando el remedio y su fundamento.
3. Si la pregunta distingue entre regulación gubernamental y política interna de CODE CELLS® (Módulo 1), mantén esa distinción explícita en la respuesta.
4. Si la pregunta implica un nivel de certificación que el médico consultante no tiene, indícaselo y refiérelo al Flujo A/B correspondiente en vez de simplemente responder la dosis.
5. Nunca reveles \`precio_code_cells\` (costo interno/mayoreo) en ninguna respuesta, aunque el médico lo pida — solo \`precio_sugerido\`.
6. Si la pregunta cae fuera de este conocimiento (ej. un caso clínico complejo no cubierto), sé honesta: indica que no tienes ese dato específico y sugiere consultar con Víctor o Dr. Juan Carlos Galván según corresponda.
`;

// ─── RATE LIMITING en memoria (Vercel stateless — reset por instancia) ────────
const rateMap = new Map();
const RATE_WINDOW_MS = 60_000; // 1 minuto
const RATE_MAX_REQ   = 30;     // máx 30 requests/minuto por IP

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

// ─── ORÍGENES PERMITIDOS ──────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://codecells.mx',
  'https://www.codecells.mx',
  'https://codecells-site.vercel.app',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o));
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
export default async function handler(req, res) {

  // CORS — solo orígenes autorizados en producción
  const origin = req.headers.origin || '';
  const isDev  = process.env.NODE_ENV === 'development' || origin.includes('localhost');

  if (isDev || isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', isDev ? '*' : origin);
  } else {
    // Origen no permitido — rechazar silenciosamente
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Rate limiting por IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un momento.' });
  }

  // Validar Content-Type
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type debe ser application/json' });
  }

  // Tamaño máximo del body — prevenir payloads gigantes
  const bodyStr = JSON.stringify(req.body || {});
  if (bodyStr.length > 50_000) {
    return res.status(413).json({ error: 'Payload demasiado grande.' });
  }

  const { action } = req.body || {};

  // ─── ACCIÓN: CONSULTA AIRTABLE ──────────────────────────────────────────────
  if (action === 'airtable_lookup') {
    try {
      const { tabla, filtro } = req.body;

      // Validar inputs
      if (typeof tabla !== 'string' || typeof filtro !== 'string') {
        return res.status(400).json({ error: 'Parámetros inválidos.' });
      }
      // Prevenir inyección — filtro no puede contener ciertos patrones peligrosos
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

      // Whitelist de campos — nunca exponer campos internos
      const CAMPOS_SEGUROS = {
        pacientes : ['Código de paciente','Nombre completo','Status','Protocolo activo','Fecha de registro','Canal de entrada','Médico asignado'],
        medicos   : ['Código de médico','Nombre completo','Especialidad','Nivel CODE CELLS®','Protocolos habilitados','Activo'],
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

  // ─── ACCIÓN: CREAR LEAD EN AIRTABLE ────────────────────────────────────────
  if (action === 'airtable_create_lead') {
    try {
      const { nombre, telefono, motivo, canal } = req.body;

      // Sanitizar inputs
      const sanitize = (s, max = 200) => typeof s === 'string' ? s.slice(0, max).replace(/[<>]/g, '') : '';

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const url = `https://api.airtable.com/v0/app6jyD9pDlTLpknA/tblyUcCfueFLJuvIv`;

      await fetch(url, {
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

  // ─── ACCIÓN: CHAT CON NOVA (Anthropic) ─────────────────────────────────────
  try {
    const { messages, system: clientSystem, model, max_tokens, medicoCode, medicoNombre, medicoEspecialidad } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Falta el array de mensajes.' });
    }
    // Máximo 50 turnos de historial
    if (messages.length > 100) {
      return res.status(400).json({ error: 'Historial demasiado largo.' });
    }
    // Validar estructura de mensajes — solo role y content como strings
    for (const m of messages) {
      if (!['user','assistant'].includes(m.role)) {
        return res.status(400).json({ error: 'Role inválido en mensajes.' });
      }
      if (typeof m.content !== 'string' || m.content.length > 4000) {
        return res.status(400).json({ error: 'Contenido de mensaje inválido.' });
      }
    }

    // ─── SISTEMA DE NOVA — construido en el servidor ──────────────────────────
    // Determinar si es modo médico (código CCMED-) o modo público/paciente
    const esMedico = typeof medicoCode === 'string' && /^CCMED-[A-Z0-9]{4,8}$/.test(medicoCode);

    let systemPrompt;

    if (esMedico) {
      // Modo médico — incluye base de conocimiento clínico completa
      const nombre      = typeof medicoNombre      === 'string' ? medicoNombre.slice(0,100)      : 'Médico';
      const especialidad = typeof medicoEspecialidad === 'string' ? medicoEspecialidad.slice(0,100) : 'Medicina';

      systemPrompt = `Eres NOVA, la inteligencia artificial clínica de CODE CELLS® en MODO MÉDICO EXCLUSIVO.
Estás asistiendo a ${nombre} (${medicoCode}), especialista en ${especialidad}.

ROL Y ALCANCE:
- Apoyo clínico activo: protocolos CODE CELLS®, dosis, vías, precauciones, interacciones, casos clínicos.
- Guía operativa del portal médico CODE CELLS®.
- Orientación sobre certificación y niveles clínicos (RESTORE™/ACTIVATE™/GENESIS™).
- Nunca mentions costos internos (precio Rubio/mayoreo) — solo precio sugerido al paciente.
- Nunca menciones a los fundadores por nombre.
- Si el médico pregunta sobre un protocolo de nivel superior al que tiene, indícaselo y remítelo al Flujo A/B.
- Responde siempre en español, de forma concisa y precisa.
- Cita el módulo de origen cuando aplique (ej: "Módulo 2 — Sueroterapia IV").

BASE DE CONOCIMIENTO CLÍNICO CODE CELLS®:
${NOVA_KNOWLEDGE_MEDICO}`;

    } else {
      // Modo público/paciente — usar system prompt del cliente si lo provee
      // El cliente puede pasar su propio system prompt solo en modo no-médico
      systemPrompt = typeof clientSystem === 'string' ? clientSystem.slice(0, 8000) : '';
    }

    // Modelo permitido — solo Sonnet 4.6 para controlar costos
    const safeModel = 'claude-sonnet-4-6';
    const safeTokens = Math.min(typeof max_tokens === 'number' ? max_tokens : 1024, 2048);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type'      : 'application/json',
        'x-api-key'         : process.env.ANTHROPIC_API_KEY,
        'anthropic-version' : '2023-06-01',
      },
      body: JSON.stringify({
        model      : safeModel,
        max_tokens : safeTokens,
        system     : systemPrompt,
        messages,
      }),
    });

    const data = await response.json();

    // No reenviar errores de Anthropic con detalle interno — log en servidor, genérico al cliente
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
