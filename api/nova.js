// api/nova.js — CODE CELLS® · Copiloto Clínico NOVA · deploy
// v3 — Carácter definitivo + conocimiento médico integrado + seguridad reforzada
// BUILD-MARKER: v3-CJS-fix-2026-07-19c — si ves este comentario en el archivo
// raw de GitHub y sigue fallando con "import.meta", el problema es 100% que
// Vercel no ha completado el deploy nuevo — no es el código.

// BNCC (Biblioteca Nutricional CODE CELLS®) — catálogo estático, no en Airtable.
// A esta escala (miles de platillos) leerlo es instantáneo y sin límite de
// rate; Airtable se queda solo para datos transaccionales (pacientes, consultas).
// require() de un .json es soporte nativo de Node/CommonJS — no necesita fs
// ni path ni __dirname, y Vercel lo empaqueta de forma confiable.
let BNCC_DATA = { ingredientes: [], platillos: [] };
try {
  BNCC_DATA = require('./data/bncc-data.json');
} catch (err) {
  console.error('[nova] No se pudo cargar bncc-data.json — el Motor de Compatibilidad no tendrá catálogo:', err.message);
}
const BNCC_ING_POR_ID = Object.fromEntries(BNCC_DATA.ingredientes.map(i => [i.id, i]));

// ─── CATÁLOGO DE SUPLEMENTOS (nutrición/GLP-1) ─────────────────────
// Solo productos que EXISTEN en el catálogo real de Rubio Pharma (marzo
// 2026) — nunca se inventa un producto. El precio base viene del 20% de
// descuento (costo real de Víctor como cliente) — NUNCA se expone tal
// cual; solo se calculan y muestran Precio Médico y Precio Público con
// la misma fórmula que ya usas en la farmacia (×1.35 ×1.35).
// Fuente clínica de qué sugerir por categoría: lista de Víctor "catalogo
// de suplementos v2026.1". Categorías de esa lista sin producto real
// disponible en catálogo (probióticos, ashwagandha, vitamina D3+K2,
// cromo picolinato, ácido alfa lipoico, whey isolate, melatonina, NAC,
// silimarina, etc.) se marcan como no disponibles, no se inventan.
function precioSupl(costoRubio) {
  const medico = Math.round(costoRubio * 1.35);
  const publico = Math.round(medico * 1.35);
  return { precio_medico: medico, precio_publico: publico };
}
const CATALOGO_SUPLEMENTOS = {
  'Magnesio bisglicinato':        { marca: 'KAL', producto: 'Magnesium Glycinate 350mg (160 cáps)', ...precioSupl(404) },
  'Citrato de Magnesio':          { marca: 'Solaray', producto: 'Magnesium Citrate 400mg (90 cáps)', ...precioSupl(260) },
  'Omega 3 (EPA/DHA)':            { marca: 'Nutravia', producto: 'Ultra Omega 3 500mg EPA/250mg DHA (60 cáps)', ...precioSupl(280) },
  'Berberina':                    { marca: 'Nutravia', producto: 'Berberine HCl 500mg (60 cáps)', ...precioSupl(340) },
  'Coenzima Q10':                 { marca: 'Solaray', producto: 'CoQ10 100mg (30 cáps)', ...precioSupl(304) },
  'L-Carnitina':                  { marca: 'Solaray', producto: 'L-Carnitine 249mg (60 cáps)', ...precioSupl(300) },
  'Enzimas digestivas':           { marca: 'KAL', producto: 'Papaya-Zyme (100 tab)', ...precioSupl(168) },
  'Creatina Monohidratada':       { marca: 'Nutravia', producto: 'Creatine Monohydrate (500g)', ...precioSupl(400) },
  'Colágeno Hidrolizado':         { marca: 'Nutravia', producto: 'Collagen Peptides (300g)', ...precioSupl(308) },
  'Curcumina':                    { marca: 'Nutravia', producto: 'Curcumin + Ginger 500mg (60 cáps)', ...precioSupl(260) },
  'Selenio':                      { marca: 'Solaray', producto: 'Selenium 100mcg (90 cáps)', ...precioSupl(200) },
  'Zinc':                         { marca: 'KAL', producto: 'Z Max — quelato de zinc (100 tab)', ...precioSupl(180) },
  'Myo-Inositol + D-Chiro Inositol': { marca: 'Nutravia', producto: 'Myo & D Chiro Inositol 40:1 + Folato (90 cáps)', ...precioSupl(300) },
  'Vitamina C':                   { marca: 'KAL', producto: 'Vitamin C-Rex (100 tab)', ...precioSupl(220) },
  'Complejo B':                   { marca: 'Solaray', producto: 'B Complex (60 tab)', ...precioSupl(180) },
  'Potasio (electrolito)':        { marca: 'Solaray', producto: 'Potassium+ 99mg (60 cáps)', ...precioSupl(200) },
  'Espirulina':                   { marca: 'Solaray', producto: 'Spirulina Algae 410mg (60 cáps)', ...precioSupl(220) },
  'Calcio-Magnesio-Zinc':         { marca: 'KAL', producto: 'CMZ MAX (100 tab)', ...precioSupl(220) },
};
// Mapa clínico: categoría de necesidad -> lista de nombres del catálogo
// de arriba (metodología de Víctor, cruzada contra lo que sí existe).
const MAPA_CLINICO_SUPLEMENTOS = {
  metabolico:      ['Omega 3 (EPA/DHA)', 'Magnesio bisglicinato', 'Berberina', 'L-Carnitina'],
  glp1:            ['Magnesio bisglicinato', 'Omega 3 (EPA/DHA)', 'Potasio (electrolito)', 'Coenzima Q10'],
  cardiovascular:  ['Citrato de Magnesio', 'Omega 3 (EPA/DHA)'],
  antiinflamatorio:['Curcumina', 'Omega 3 (EPA/DHA)'],
  hepatico:        ['Berberina', 'L-Carnitina'],
  hipotiroidismo:  ['Selenio', 'Zinc'],
  femenino:        ['Myo-Inositol + D-Chiro Inositol', 'Omega 3 (EPA/DHA)', 'Magnesio bisglicinato'],
  muscular:        ['Creatina Monohidratada', 'Colágeno Hidrolizado'],
  keto:            ['Potasio (electrolito)', 'Citrato de Magnesio'],
};
function sugerirSuplementos({ patologias, glp1Activo, tipoDietaEfectivo }) {
  const p = new Set(patologias || []);
  const categorias = new Set();
  if (glp1Activo) categorias.add('glp1');
  if (p.has('Obesidad') || p.has('Resistencia a la Insulina') || p.has('Diabetes Tipo 2') || p.has('Sindrome Metabolico')) categorias.add('metabolico');
  if (p.has('Hipertension') || p.has('Dislipidemia')) categorias.add('cardiovascular');
  if (p.has('Fibromialgia') || p.has('Cancer')) categorias.add('antiinflamatorio');
  if (p.has('Higado Graso')) categorias.add('hepatico');
  if (p.has('Hipotiroidismo')) categorias.add('hipotiroidismo');
  if (p.has('SOP')) categorias.add('femenino');
  if (p.has('Sarcopenia')) categorias.add('muscular');
  if (tipoDietaEfectivo === 'keto') categorias.add('keto');

  const nombresSugeridos = new Set();
  for (const cat of categorias) for (const nombre of (MAPA_CLINICO_SUPLEMENTOS[cat] || [])) nombresSugeridos.add(nombre);

  return [...nombresSugeridos].map(nombre => ({ nombre, ...CATALOGO_SUPLEMENTOS[nombre] })).filter(s => s.producto);
}

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

## NUTRICIÓN CLÍNICA
Marco propio de CODE CELLS® — conocimiento nutricional general y establecido, integrado con
homotoxicología y el marco de los 5 sistemas CODE. No sustituye el criterio del médico ni de un
nutriólogo licenciado en casos complejos (insuficiencia renal/hepática, trastornos alimentarios,
embarazo, pediatría) — en esos casos, el plan debe incluir nota de derivación explícita.

### Evaluación base
- Gasto energético basal: fórmula Mifflin-St Jeor.
  Hombres: (10×peso kg) + (6.25×talla cm) − (5×edad) + 5
  Mujeres: (10×peso kg) + (6.25×talla cm) − (5×edad) − 161
- Gasto energético total = GEB × factor de actividad (1.2 sedentario — 1.725 muy activo).
- Ajuste calórico por objetivo: déficit 15-20% para recomposición/pérdida de grasa;
  superávit 10-15% para ganancia de masa magra; mantenimiento ±5% para soporte metabólico/longevidad.

### Distribución de macronutrientes por objetivo biológico
- Recomposición corporal: proteína 1.6-2.2 g/kg, grasa 25-30% del total calórico, resto en carbohidrato.
- Soporte metabólico (DM2, resistencia a la insulina, síndrome metabólico): priorizar carbohidrato de
  bajo índice glucémico, fibra ≥25-30g/día, distribuir en 4-5 tomas para estabilidad glucémica.
- Longevidad/antiinflamatorio: patrón tipo mediterráneo — grasas monoinsaturadas y omega-3,
  proteína moderada (1.2-1.6 g/kg), alta densidad de micronutrientes y polifenoles.
- Recuperación post-protocolo regenerativo: proteína alta (1.8-2.2 g/kg) para soporte de síntesis
  tisular, omega-3 y antioxidantes para modular inflamación asociada al proceso reparativo.

### Integración con Homotoxicología
Antes de cargar un plan nutricional intensivo, considerar la fase de toxemia/impregnación del
paciente (ver sección HOMOTOXICOLOGÍA): si hay signos de sobrecarga (fatiga marcada, mala tolerancia
digestiva, inflamación activa), priorizar fase de drenaje (hidratación, fibra, alimentos hepato y
linfo-drenantes: cítricos, crucíferas, betabel, alcachofa) antes de aumentar carga proteica o calórica.
No introducir cambios agresivos de macros mientras el paciente está en fase de drenaje activo.

### Mapeo a los 5 sistemas CODE
- CODE ENERGY™: soporte mitocondrial — coenzima Q10, magnesio, complejo B, hierro si aplica; evitar
  picos glucémicos que generen fatiga postprandial.
- CODE REPAIR™: proteína suficiente + vitamina C, zinc, colágeno como cofactores de síntesis tisular.
- CODE BALANCE™: equilibrio hormonal e inflamatorio — omega-3, fibra prebiótica, moderar
  ultraprocesados y azúcar añadida.
- CODE NEURO™: omega-3 DHA, colina, antioxidantes; patrón similar a dieta MIND.
- CODE REGEN™: patrón antiinflamatorio de alta densidad nutricional, ayuno intermitente leve
  (12-14h) solo si el paciente lo tolera y no hay contraindicación metabólica.

### Integración con catálogo de nutracéuticos (Heel/KAL/Nutravia/Solaray)
Cuando el plan lo justifique, sugiere categorías de producto (no inventes nombres comerciales fuera
del catálogo real de CODE CELLS®): omega-3, magnesio, probiótico, complejo B, vitamina D, proteína.
El médico decide el producto y dosis exacta del catálogo real — NOVA sugiere la categoría y el motivo
clínico, nunca precios (ver sección FARMACIA).

### Formato esperado del plan nutricional
1. Objetivo biológico y resumen de 1 línea del caso.
2. Requerimiento calórico y distribución de macros (gramos y % aproximado).
3. Estructura de comidas del día (ej. 3 comidas + 2 colaciones) con ejemplos de alimentos por grupo
   — NO menús cerrados de "lunes a domingo" con platillos específicos, sino estructura y opciones
   intercambiables, para que sea flexible y el paciente lo pueda variar.
4. Recomendaciones nutracéuticas por categoría (si aplica).
5. Notas de seguridad y contraindicaciones relevantes al caso.
6. Cierre siempre con: este plan es una guía general y requiere supervisión médica continua.

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

// ─── BASE Y TABLAS (app de pacientes / VIP) ────────────────────────
const BASE_ID_CLINICA        = 'app6jyD9pDlTLpknA';
const TBL_PACIENTES          = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS_APP        = 'tbl87DsuBMmb4DjFM';
const TBL_NOVA_CONVERSACIONES= 'tblYMr2lpmLQhw6GS';
const TBL_RECORDATORIOS      = 'tblw4tiZhPMbFhB8w';
const TBL_SOLICITUDES_CITA   = 'tblIj7vRoMhLg9CsL';
const TBL_REFERIDOS_VIP      = 'tblmPWoSdeSwfLJ6T';

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

  // Códigos de los fundadores — reconocimiento y trato especial en
  // CUALQUIER superficie donde ya se envíe medicoCode (Portal Médico, etc.)
  const FUNDADORES = {
    'CCMED-VIRN01': 'Dr. Víctor Iván Rodríguez Nava',
    'CCMED-JCG01' : 'Dr. Juan Carlos Galván López',
  };

  // Instrucciones para planes nutricionales — el motor ya está construido
  // (sección NUTRICIÓN CLÍNICA de la base de conocimiento). Antes esto era
  // un bloqueo total; ahora NOVA sí genera el plan, siguiendo ese formato.
  const REGLA_NUTRICION = `
PLANES NUTRICIONALES:
Cuando te pidan un plan nutricional para un paciente, sigue exactamente la sección "NUTRICIÓN CLÍNICA"
de tu base de conocimiento (evaluación, macros por objetivo, integración con homotoxicología y con los
5 sistemas CODE, formato de salida). Respóndelo SIEMPRE en texto normal, sin llamar a ninguna
herramienta — la herramienta de ficha de consulta es para otra cosa y nunca debe usarse para esto,
ni siquiera para una parte del plan. Si te falta un dato esencial para calcular bien (peso, talla,
edad, objetivo biológico, alguna condición relevante), pídelo con precisión antes de generar el plan —
no inventes esos datos. Nunca dispenses el plan como si sustituyera al médico: siempre cierra con la
nota de supervisión médica. Si el caso tiene una condición compleja (insuficiencia renal/hepática,
enfermedad autoinmune activa como lupus, trastorno alimentario, embarazo, paciente pediátrico), agrega
una nota explícita recomendando derivar a un nutriólogo licenciado además de dar el marco general.`;

  if (modo === 'medico') {
    const { nombre, codigo, especialidad } = contexto;
    const esFundador = FUNDADORES[codigo];

    if (esFundador) {
      return `${IDENTIDAD}

MODO: FUNDADOR — ACCESO TOTAL
Quien te escribe es ${esFundador}, cofundador de CODE CELLS®. Su código (${codigo}) es su llave de acceso universal — reconócelo de inmediato y trátalo con calidez y cercanía genuina, no como a un médico afiliado más.

Si se identifica por su nombre (aunque no mencione su código), reconócelo igual — por ejemplo si dice "soy el Dr. Víctor Iván" o "soy Galván" — responde con algo como "Doctor, qué gusto" y continúa con total naturalidad, sin pedirle que se autentique de nuevo.

En este modo:
- Sin restricciones de profundidad técnica, comercial o de negocio — puede preguntarte CUALQUIER cosa sobre CODE CELLS® (protocolos, costos internos, arquitectura de la plataforma, Airtable, estrategia) y respondes con total transparencia y detalle.
- No apliques las restricciones de "nunca menciones a los fundadores por nombre" — con ÉL sí puedes hablar de fundadores, de él mismo, del otro fundador, con total naturalidad.
- Puedes ayudarle a resolver problemas técnicos de la plataforma (acceso, login, códigos, registros) de forma directa y práctica.
- Sigue siendo NOVA — el mismo carácter elegante — pero aquí eres su copiloto de confianza total, no una IA de cara al público.
${REGLA_NUTRICION}

BASE DE CONOCIMIENTO CLÍNICO:
${NOVA_KNOWLEDGE_MEDICO}`;
    }

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
${REGLA_NUTRICION}

BASE DE CONOCIMIENTO CLÍNICO:
${NOVA_KNOWLEDGE_MEDICO}`;
  }

  if (modo === 'paciente') {
    const { nombre, id, memoria, vip } = contexto;

    const capacidades = vip ? `
En este modo (paciente VIP — DEZAWA PROTOCOL™):
- Trato exclusivo, completamente personalizado — el más alto estándar de comunicación de todo el ecosistema
- Actúas como su agente médico personal: coordinas citas (video llamada o consulta con su médico vía WhatsApp), creas recordatorios de tomas de medicamentos y de análisis, y das consejos de salud como si estuviera en consulta — sin sustituir jamás el criterio final del médico tratante
- Tiene consultas prioritarias y puede invitar a un amigo al programa
- Nunca menciones precios. Nunca compares con otros tratamientos.` : `
En este modo (paciente estándar):
- Usa lenguaje claro y accesible, sin tecnicismos innecesarios
- Tu función es asistir con gestión de citas médicas e interconsultas — NO das consejos clínicos personalizados ni recordatorios de medicamentos (eso es exclusivo del nivel VIP); si insiste, explícale con calidez que ese acompañamiento es parte del programa VIP
- Si necesita orientación clínica, dirígelo a su médico CODE CELLS®
- Puedes explicar qué son los protocolos, cómo funcionan y qué esperar del proceso`;

    return `${IDENTIDAD}

MODO: PACIENTE${vip ? ' — DEZAWA PROTOCOL™ (VIP)' : ''}
${nombre ? `Estás acompañando a ${nombre} (${id}).` : 'Estás en conversación con un paciente.'}
${capacidades}
${memoria ? `\nMEMORIA DE ESTE PACIENTE (lo que ya sabes de conversaciones anteriores — úsalo con naturalidad, no lo repitas textualmente):\n${memoria}\n` : ''}

HERRAMIENTA "respuesta_nova_paciente": SIEMPRE respondes usando esta herramienta. El campo "reply" es lo único que el paciente ve — ahí va tu respuesta completa, natural, con el carácter de NOVA. Los demás campos son acciones internas que tú decides activar según lo que dijo el paciente en ESTE mensaje:
- crear_solicitud_cita: actívalo cuando el paciente pida agendar, coordinar una cita o video llamada, o hablar con su médico.${vip ? `
- crear_recordatorio: actívalo cuando el paciente acepte que le recuerdes tomar un medicamento o hacerse un análisis.
- invitar_amigo: actívalo cuando el paciente quiera invitar a alguien al programa y te dé nombre/teléfono.` : ''}
- actualizar_memoria: úsalo cada pocos intercambios (no en cada mensaje) cuando aprendas algo nuevo y clínicamente útil de este paciente — redáctalo en tercera persona, 1-3 frases. Déjalo vacío si no hay nada nuevo que valga la pena guardar.`;
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
module.exports = async function handler(req, res) {

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

  // ─── CREAR LEAD (paciente o médico interesado) ────────────────────
  if (action === 'airtable_create_lead') {
    try {
      const sanitize = (s, max = 200) => typeof s === 'string' ? s.slice(0, max).replace(/[<>]/g, '') : '';
      const { nombre, telefono, motivo, canal, especialidad, ciudad, codigo } = req.body;

      const notasParts = [];
      if (especialidad) notasParts.push(`Especialidad: ${sanitize(especialidad, 150)}`);
      if (ciudad)       notasParts.push(`Ciudad: ${sanitize(ciudad, 150)}`);
      if (motivo)       notasParts.push(`Interés: ${sanitize(motivo, 500)}`);
      if (codigo)       notasParts.push(`Código promocional asignado: ${sanitize(codigo, 40)}`);
      const notas = notasParts.length ? notasParts.join(' | ') : sanitize(motivo, 500);

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const atRes = await fetch(`https://api.airtable.com/v0/app6jyD9pDlTLpknA/tblyUcCfueFLJuvIv`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          typecast: true,
          fields: {
            'Nombre completo'   : sanitize(nombre),
            'Teléfono WhatsApp' : sanitize(telefono, 20),
            'Notas generales'   : notas,
            'Status'            : 'Lead',
            'Canal de entrada'  : sanitize(canal) || 'codecells.mx',
            'Fecha de registro' : new Date().toISOString(),
          },
        }),
      });
      if (!atRes.ok) {
        console.error('[nova] create_lead Airtable error:', await atRes.text());
        return res.status(502).json({ error: 'Error guardando el registro.' });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[nova] create_lead error:', err.message);
      return res.status(500).json({ error: 'Error creando lead.' });
    }
  }

  // ─── ASIGNAR CÓDIGO PROMOCIONAL (10 códigos, un solo uso, no transferibles) ─
  if (action === 'asignar_codigo_promocional') {
    try {
      const sanitize = (s, max = 200) => typeof s === 'string' ? s.slice(0, max).replace(/[<>]/g, '') : '';
      const { nombre, whatsapp } = req.body;

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TABLE_CODIGOS = 'tblypndhtcurFwue6';

      // Buscar un código todavía disponible.
      const findUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_CODIGOS}?filterByFormula=${encodeURIComponent("{Status}='Disponible'")}&maxRecords=1`;
      const findRes = await fetch(findUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      if (!findRes.ok) {
        console.error('[nova] error buscando código:', await findRes.text());
        return res.status(502).json({ error: 'Error consultando códigos.' });
      }
      const findData = await findRes.json();
      const record = findData.records?.[0];

      if (!record) {
        // Los 10 códigos ya se usaron.
        return res.status(200).json({ agotado: true });
      }

      const codigo = record.fields?.Name;

      // Marcarlo como Usado de inmediato — de un solo uso, no transferible.
      // (Nota: bajo concurrencia simultánea extrema podría haber una carrera
      // mínima entre el GET y este PATCH; para un lote de 10 códigos de
      // lanzamiento el riesgo es despreciable.)
      const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_CODIGOS}/${record.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          typecast: true,
          fields: {
            Status: 'Usado',
            Notes : `Asignado a: ${sanitize(nombre)} | WhatsApp: ${sanitize(whatsapp, 20)} | Fecha: ${new Date().toISOString()}`,
          },
        }),
      });

      if (!updateRes.ok) {
        console.error('[nova] error marcando código como usado:', await updateRes.text());
        return res.status(502).json({ error: 'Error asignando código.' });
      }

      return res.status(200).json({ agotado: false, codigo });
    } catch (err) {
      console.error('[nova] asignar_codigo_promocional error:', err.message);
      return res.status(500).json({ error: 'Error asignando código promocional.' });
    }
  }

  // ─── GENERAR LOTE ADICIONAL DE CÓDIGOS (solo fundadores) ──────────
  // Deja registrado quién lo generó y para quién queda pendiente el aviso,
  // para que se le informe al otro fundador la próxima vez que NOVA lo
  // reconozca (aviso informativo dentro del chat, no restrictivo).
  if (action === 'generar_codigos_adicionales') {
    try {
      const FUNDADORES_NOMBRE = {
        'Dr. Víctor Iván Rodríguez Nava': 'Dr. Juan Carlos Galván López',
        'Dr. Juan Carlos Galván López'  : 'Dr. Víctor Iván Rodríguez Nava',
      };
      const { fundador } = req.body;
      const otro = FUNDADORES_NOMBRE[fundador];
      if (!otro) return res.status(400).json({ error: 'Fundador no reconocido.' });

      const cantidad = 10;
      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TABLE_CODIGOS = 'tblypndhtcurFwue6';

      const gen4 = () => Array.from({length:4}, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random()*36)]).join('');
      const nota = `Lote adicional generado por ${fundador} el ${new Date().toISOString()} — pendiente de avisar a ${otro}`;
      const records = Array.from({length: cantidad}, () => ({
        fields: { Name: `NETWORK-${gen4()}`, Status: 'Disponible', Notes: nota },
      }));

      const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_CODIGOS}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, records }),
      });
      if (!createRes.ok) {
        console.error('[nova] error generando lote adicional:', await createRes.text());
        return res.status(502).json({ error: 'Error generando códigos adicionales.' });
      }
      return res.status(200).json({ ok: true, cantidad });
    } catch (err) {
      console.error('[nova] generar_codigos_adicionales error:', err.message);
      return res.status(500).json({ error: 'Error generando códigos adicionales.' });
    }
  }

  // ─── REVISAR AVISOS ENTRE FUNDADORES ───────────────────────────────
  // Al reconocer a un fundador, se consulta si el OTRO fundador generó
  // códigos adicionales desde la última vez, para mencionárselo en el chat.
  if (action === 'revisar_avisos_fundador') {
    try {
      const { fundador } = req.body;
      if (typeof fundador !== 'string') return res.status(400).json({ error: 'Falta fundador.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TABLE_CODIGOS = 'tblypndhtcurFwue6';

      const formula = `FIND("pendiente de avisar a ${fundador}", {Notes})`;
      const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_CODIGOS}?filterByFormula=${encodeURIComponent(formula)}`;
      const findRes = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      if (!findRes.ok) {
        console.error('[nova] error revisando avisos:', await findRes.text());
        return res.status(200).json({ avisos: [] }); // no bloquear el chat por esto
      }
      const data = await findRes.json();
      const recs = data.records || [];
      if (recs.length === 0) return res.status(200).json({ avisos: [] });

      // Agrupar por nota (mismo lote = misma nota) para no repetir el aviso por cada código.
      const notasUnicas = [...new Set(recs.map(r => r.fields?.Notes).filter(Boolean))];

      // Marcar como avisado (quitar "pendiente de avisar a X" de la nota).
      const updates = recs.map(r => ({
        id: r.id,
        fields: { Notes: (r.fields?.Notes || '').replace(` — pendiente de avisar a ${fundador}`, ' — avisado') },
      }));
      for (let i = 0; i < updates.length; i += 50) {
        await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_CODIGOS}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ typecast: true, records: updates.slice(i, i+50) }),
        }).catch(e => console.error('[nova] error marcando aviso como leído:', e.message));
      }

      return res.status(200).json({ avisos: notasUnicas });
    } catch (err) {
      console.error('[nova] revisar_avisos_fundador error:', err.message);
      return res.status(200).json({ avisos: [] });
    }
  }

  // ─── GENERADOR DE PLAN ALIMENTICIO ───────────────────────────────
  // Extiende el MPN a varios días. Misma lógica de selección, más una
  // penalización por repetir un platillo dentro de una ventana de 3 días
  // — así rota en vez de clavarse en la misma opción todos los días.
  if (action === 'generar_plan_semanal') {
    try {
      const { pacienteRecordId, medicoCode, peso: pesoReq, talla: tallaReq, edad: edadReq, sexo: sexoReq, factorActividad, objetivo, preferencias, dias, objetivosSemana, tipoDieta, planNutricional, ayunoIntermitente } = req.body;
      if (!pacienteRecordId) return res.status(400).json({ error: 'Falta pacienteRecordId.' });
      const numDias = Math.min(Math.max(parseInt(dias) || 7, 1), 30);

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';
      const getUrl = `https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}/${pacienteRecordId}`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const pacData = await getRes.json();
      if (!getRes.ok) return res.status(502).json({ error: 'No se pudo leer el expediente del paciente.' });
      const f = pacData.fields || {};

      // peso/talla/edad/sexo: si no vienen en el request, se usan los del
      // expediente — así el ciclo de seguimiento no obliga a re-mandar todo
      // cada vez, solo el dato que cambió (normalmente el peso).
      const peso = pesoReq || f['Peso actual (kg)'];
      const talla = tallaReq || f['Talla (cm)'];
      const sexo = sexoReq || (f['Sexo biológico'] === 'Femenino' ? 'F' : 'M');
      let edad = edadReq;
      if (!edad && f['Fecha de nacimiento']) {
        edad = Math.floor((Date.now() - new Date(f['Fecha de nacimiento']).getTime()) / (365.25*24*3600*1000));
      }
      if (!peso || !talla || !edad) return res.status(400).json({ error: 'Faltan datos antropométricos (peso, talla, edad) — ni en el request ni en el expediente.' });

      const glp1Activo = f['Tratamiento GLP-1 activo'] === true;
      const glp1Info = f['GLP-1 medicamento y dosis'] || null;
      const nombrePaciente = f['Nombre completo'] || 'Paciente';

      // Firma dinámica: cada médico ve su propio nombre/teléfono, no un
      // nombre fijo — así el mismo motor sirve a cualquier médico afiliado.
      let firmaMedico = { nombre: 'tu médico CODE CELLS®', telefono: null };
      if (medicoCode) {
        try {
          const TBL_MED = 'tbl87DsuBMmb4DjFM';
          const formulaMed = `{Código de médico}="${medicoCode}"`;
          const medRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_MED}?filterByFormula=${encodeURIComponent(formulaMed)}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
          const medData = await medRes.json();
          const medRec = medData.records?.[0];
          if (medRec) firmaMedico = { nombre: medRec.fields['Nombre completo'] || firmaMedico.nombre, telefono: medRec.fields['Teléfono'] || null };
        } catch { /* si falla, se queda la firma genérica — nunca bloquea el plan */ }
      }

      // Detección de meseta: 2+ registros consecutivos del historial de peso
      // sin pérdida real (metodología de Víctor: "sin pérdida durante 2+
      // semanas + buena adherencia" → sugerir keto temporal / reto sin azúcar).
      let mesetaDetectada = false;
      const historialPeso = (f['Historial de peso'] || '').split('\n').filter(Boolean);
      if (historialPeso.length >= 2) {
        const pesos = historialPeso.slice(-3).map(l => { const m = l.match(/\]\s*([\d.]+)kg/); return m ? parseFloat(m[1]) : null; }).filter(p => p !== null);
        if (pesos.length >= 2 && (pesos[0] - pesos[pesos.length-1]) <= 0.3) mesetaDetectada = true;
      }

      // ─── CATÁLOGO DE 20 TIPOS DE DIETA (spec clínico v2.0) ─────────────
      const TIPOS_DIETA = {
        hipocalorica:            { proteina_pct:0.28, grasa_pct:0.28, carbo_pct:0.44, ajuste_kcal:0.80 },
        hiperproteica:           { proteina_pct:0.40, grasa_pct:0.325, carbo_pct:0.275, ajuste_kcal:0.85 },
        hipercalorica:           { proteina_pct:0.25, grasa_pct:0.30, carbo_pct:0.45, ajuste_kcal:1.15 },
        normocalorica:           { proteina_pct:0.25, grasa_pct:0.30, carbo_pct:0.45, ajuste_kcal:1.00 },
        cetogenica:              { proteina_pct:0.375, grasa_pct:0.575, carbo_pct:0.05, ajuste_kcal:0.85, excluirKeto:true },
        cetogenica_estricta:     { proteina_pct:0.40, grasa_pct:0.55, carbo_pct:0.05, ajuste_kcal:0.80, excluirKeto:true },
        baja_en_carbohidratos:   { proteina_pct:0.30, grasa_pct:0.35, carbo_pct:0.35, ajuste_kcal:0.85 },
        mediterranea:            { proteina_pct:0.20, grasa_pct:0.35, carbo_pct:0.45, ajuste_kcal:0.95 },
        dash:                    { proteina_pct:0.20, grasa_pct:0.27, carbo_pct:0.53, ajuste_kcal:0.95, priorizarBajoSodio:true },
        diabetica:               { proteina_pct:0.25, grasa_pct:0.30, carbo_pct:0.45, ajuste_kcal:0.85, priorizarBajoIG:true },
        renal:                   { proteina_pct:0.20, grasa_pct:0.30, carbo_pct:0.50, ajuste_kcal:1.00, priorizarBajoSodio:true },
        hepatica:                { proteina_pct:0.25, grasa_pct:0.25, carbo_pct:0.50, ajuste_kcal:0.85 },
        antiinflamatoria:        { proteina_pct:0.25, grasa_pct:0.35, carbo_pct:0.40, ajuste_kcal:0.90 },
        vegetariana:             { proteina_pct:0.25, grasa_pct:0.30, carbo_pct:0.45, ajuste_kcal:0.90, forzarVegetariano:true },
        vegana:                  { proteina_pct:0.25, grasa_pct:0.30, carbo_pct:0.45, ajuste_kcal:0.90, forzarVegano:true },
        embarazo:                { proteina_pct:0.20, grasa_pct:0.30, carbo_pct:0.50, ajuste_kcal:1.10 },
        lactancia:               { proteina_pct:0.22, grasa_pct:0.30, carbo_pct:0.48, ajuste_kcal:1.18 },
        geriatrica:              { proteina_pct:0.25, grasa_pct:0.30, carbo_pct:0.45, ajuste_kcal:1.00 },
        pediatrica:              { proteina_pct:0.20, grasa_pct:0.30, carbo_pct:0.50, ajuste_kcal:1.00 },
        deportiva:               { proteina_pct:0.30, grasa_pct:0.25, carbo_pct:0.45, ajuste_kcal:1.05 },
      };

      // Selección automática por prioridad clínica — el médico siempre puede
      // sobrescribir con planNutricional/tipoDieta explícitos, esto solo
      // corre cuando no lo especifica.
      function seleccionarTipoDietaAutomatico() {
        const p = new Set(f['Patologías activas'] || []);
        if (p.has('Embarazo')) return { tipo: 'embarazo', razon: 'Embarazo detectado — nunca déficit calórico agresivo' };
        if (p.has('Lactancia')) return { tipo: 'lactancia', razon: 'Lactancia activa — requerimiento aumentado' };
        if (p.has('Pediatria')) return { tipo: 'pediatrica', razon: 'Paciente pediátrico' };
        if (p.has('Adulto Mayor')) return { tipo: 'geriatrica', razon: 'Adulto mayor' };
        if (p.has('Sarcopenia') || p.has('Desnutricion')) return { tipo: 'hipercalorica', razon: 'Sarcopenia/desnutrición — prioridad ganancia de masa' };
        if ([...p].some(x => x.startsWith('ERC'))) return { tipo: 'renal', razon: 'ERC activa — manejo renal prioritario' };
        if (p.has('Higado Graso')) return { tipo: 'hepatica', razon: 'Hígado graso' };
        if (mesetaDetectada && (p.has('Obesidad') || p.has('Resistencia a la Insulina') || p.has('Diabetes Tipo 2') || p.has('Sindrome Metabolico'))) {
          return { tipo: 'cetogenica', razon: 'Meseta detectada + perfil metabólico compatible — ruptura temporal' };
        }
        if (p.has('Diabetes Tipo 2') || p.has('Prediabetes')) return { tipo: 'diabetica', razon: 'Control glucémico prioritario' };
        if (p.has('Fibromialgia') || p.has('Cancer')) return { tipo: 'antiinflamatoria', razon: 'Condición con componente inflamatorio' };
        if ((glp1Activo || p.has('Obesidad')) && !p.has('Hipertension')) return { tipo: 'hiperproteica', razon: glp1Activo ? 'Tratamiento GLP-1 activo — preservar masa muscular' : 'Obesidad — preservar masa muscular' };
        if (p.has('Hipertension') && p.has('Dislipidemia')) return { tipo: 'mediterranea', razon: 'Hipertensión + dislipidemia — riesgo cardiovascular' };
        if (p.has('Hipertension')) return { tipo: 'dash', razon: 'Hipertensión arterial' };
        if (p.has('SOP') || p.has('Hipertrigliceridemia')) return { tipo: 'baja_en_carbohidratos', razon: 'SOP/hipertrigliceridemia' };
        if (perfilPreferencias.vegano) return { tipo: 'vegana', razon: 'Preferencia declarada' };
        if (perfilPreferencias.vegetariano) return { tipo: 'vegetariana', razon: 'Preferencia declarada' };
        if (p.has('Obesidad') || p.has('Sobrepeso')) return { tipo: 'hipocalorica', razon: 'Sobrepeso/obesidad sin otra indicación específica' };
        return { tipo: 'normocalorica', razon: 'Sin indicación específica — mantenimiento' };
      }

      const perfilPreferencias = preferencias || {};
      const seleccionAuto = (planNutricional || tipoDieta) ? null : seleccionarTipoDietaAutomatico();
      const presetElegido = planNutricional || (seleccionAuto ? seleccionAuto.tipo : null) || 'hipocalorica';
      const macrosPreset = TIPOS_DIETA[presetElegido] || TIPOS_DIETA.hipocalorica;
      const tipoDietaEfectivo = tipoDieta || (macrosPreset.excluirKeto ? 'keto' : null);
      if (macrosPreset.forzarVegetariano) perfilPreferencias.vegetariano = true;
      if (macrosPreset.forzarVegano) { perfilPreferencias.vegetariano = true; perfilPreferencias.vegano = true; }
      // Si el médico no fijó un objetivo calórico manual, se usa el ajuste
      // propio del tipo de dieta seleccionado (auto o manual).
      if (!objetivo) kcalObjetivo = Math.round(get * macrosPreset.ajuste_kcal);

      const perfil = {
        patologias: f['Patologías activas'] || [],
        severidad_erc: f['Severidad ERC'] || null,
        alergias: (f['Alergias alimentarias'] || '').split(',').map(a => a.trim()).filter(Boolean),
        preferencias: perfilPreferencias,
      };

      const geb = sexo === 'M' ? (10*peso + 6.25*talla - 5*edad + 5) : (10*peso + 6.25*talla - 5*edad - 161);
      const get = geb * (factorActividad || 1.2);
      const ajusteObjetivo = { perdida_grasa: 0.82, mantenimiento: 1.0, ganancia_masa: 1.12, soporte_metabolico: 1.0 }[objetivo] ?? 1.0;
      let kcalObjetivo = Math.round(get * ajusteObjetivo);
      const imc = Math.round((peso / ((talla/100)**2)) * 10) / 10;

      // Tipo de dieta ad-hoc (metodología de Víctor: el médico puede pedir
      // "esta semana keto" por estancamiento — no es una patología ni un
      // objetivo permanente, es una decisión puntual que excluye categorías
      // enteras de ingredientes).
      const CATEGORIAS_EXCLUIDAS_KETO = new Set(['Cereales y tuberculos', 'Frutas']);
      function pasaTipoDieta(p) {
        if (tipoDietaEfectivo !== 'keto') return true;
        for (const ing of (p.ingredientes || [])) {
          const info = BNCC_ING_POR_ID[ing.id];
          if (info && CATEGORIAS_EXCLUIDAS_KETO.has(info.subcategoria)) return false;
        }
        const carbs = p.nutrimentos?.carbohidratos_g || 0;
        return carbs <= 20; // techo duro de carbohidratos por porción en modo keto
      }

      const compatibles = BNCC_DATA.platillos.filter(p => {
        for (const pat of perfil.patologias) for (const ev of (p.evitar_en || [])) if (ev.toLowerCase().startsWith(pat.toLowerCase())) return false;
        for (const ing of (p.ingredientes || [])) {
          const info = BNCC_ING_POR_ID[ing.id];
          if (!info) continue;
          for (const alergia of perfil.alergias) if (info.nombre.toLowerCase().includes(alergia.toLowerCase())) return false;
        }
        if (perfil.preferencias.vegetariano) for (const ing of (p.ingredientes || [])) { const info = BNCC_ING_POR_ID[ing.id]; if (info && info.origen === 'Animal' && info.vegetariano === false) return false; }
        if (perfil.preferencias.evitar_pescado) for (const ing of (p.ingredientes || [])) { const info = BNCC_ING_POR_ID[ing.id]; if (info && info.categoria === 'Pescados y mariscos') return false; }
        if (!pasaTipoDieta(p)) return false;
        return true;
      });

      const objsSemana = new Set(objetivosSemana || []);
      function calcularNutrientesExtra(platillo) {
        let sodio = 0, cargaGluc = 0, grasa = 0;
        for (const ing of (platillo.ingredientes || [])) {
          const info = BNCC_ING_POR_ID[ing.id];
          if (!info) continue;
          const factor = ing.gramos / 100;
          sodio += (info.nutrimentos?.sodio_mg || 0) * factor;
          grasa += (info.nutrimentos?.grasa_g || 0) * factor;
          const ig = info.indice_glucemico || 0;
          const carb = (info.nutrimentos?.carbohidratos_g || 0) * factor;
          cargaGluc += (ig * carb) / 100;
        }
        return { sodio, cargaGluc, grasa };
      }
      function bonoObjetivosSemana(p) {
        const n = p.nutrimentos || {};
        const kcal = n.energia_kcal || 1;
        const densProt = n.proteina_g / (kcal / 100);
        const densFibra = (n.fibra_g || 0) / (kcal / 100);
        const { sodio, cargaGluc, grasa } = calcularNutrientesExtra(p);
        let bono = 0;
        if (objsSemana.has('Preservacion muscular') || objsSemana.has('Mejorar saciedad') || objsSemana.has('Prevenir perdida de cabello')) bono -= densProt * 0.05;
        if (objsSemana.has('Evitar estrenimiento') || objsSemana.has('Mejorar saciedad') || objsSemana.has('Disminuir inflamacion')) bono -= densFibra * 0.08;
        if (objsSemana.has('Controlar hipertension')) bono += (sodio / 1000) * 0.15;
        if (objsSemana.has('Controlar glucosa') || objsSemana.has('Reducir grasa visceral')) bono += (cargaGluc / 20) * 0.15;
        // GLP-1: proteína alta, digestión fácil (baja grasa), evitar picos de glucosa
        if (glp1Activo) {
          bono -= densProt * 0.04;
          bono += (grasa / kcal * 100) * 0.06; // penaliza platillos muy grasosos (nausea/digestion en GLP-1)
          bono += (cargaGluc / 20) * 0.10;
        }
        return bono;
      }

      // ─── AYUNO INTERMITENTE (opcional) ──────────────────────────────
      // Contraindicado en poblaciones especiales — si aplica, se ignora el
      // parámetro y se avisa en vez de aplicarlo a ciegas.
      const CONTRAINDICACIONES_AYUNO = ['Embarazo', 'Lactancia', 'Pediatria', 'Desnutricion'];
      const patologiasSet = new Set(f['Patologías activas'] || []);
      const ayunoContraindicado = CONTRAINDICACIONES_AYUNO.some(c => patologiasSet.has(c));
      const VENTANAS_AYUNO = {
        '12_12': { horarios: ['Desayuno','Comida','Cena','Colación Matutina','Colación Vespertina'], nota: 'Ventana 12:12 — sin restricción de horarios, apta para inicio o adulto mayor.' },
        '14_10': { horarios: ['Desayuno','Comida','Cena','Colación Vespertina'], nota: 'Ventana de alimentación 10h — se omite colación matutina.' },
        '16_8':  { horarios: ['Comida','Cena','Colación Vespertina'], nota: 'Ventana 8h — se omite desayuno y colación matutina.' },
        '18_6':  { horarios: ['Comida','Cena'], nota: 'Ventana 6h — solo comida y cena, para paciente ya adaptado.' },
        '20_4':  { horarios: ['Comida','Cena'], nota: 'Ventana 4h — comida y cena muy cercanas, solo casos muy seleccionados.' },
      };
      const ayunoEfectivo = (ayunoIntermitente && !ayunoContraindicado) ? ayunoIntermitente : null;
      const ventanaAyuno = ayunoEfectivo ? VENTANAS_AYUNO[ayunoEfectivo] : null;

      const DISTRIBUCION_BASE = { 'Desayuno': 0.25, 'Comida': 0.35, 'Cena': 0.25, 'Colación Matutina': 0.075, 'Colación Vespertina': 0.075 };
      let DISTRIBUCION = DISTRIBUCION_BASE;
      if (ventanaAyuno) {
        // Redistribuye el % calórico solo entre los horarios que quedan activos
        const activos = ventanaAyuno.horarios;
        const sumaActivos = activos.reduce((s, h) => s + DISTRIBUCION_BASE[h], 0);
        DISTRIBUCION = Object.fromEntries(activos.map(h => [h, DISTRIBUCION_BASE[h] / sumaActivos]));
      }

      // ─── MEMORIA DE SEMANAS ANTERIORES ───────────────────────────────
      // No repetir exactamente los mismos platillos que el plan anterior
      // guardado para este paciente — penalización, no bloqueo total (el
      // catálogo aún es chico y bloquear de tajo dejaría horarios vacíos).
      const TBL_PLANES = 'tblghlpLnwMNosqhd';
      const platillosSemanaPrevia = new Set();
      try {
        // Se trae la lista completa reciente y se filtra en JS por el link —
        // filterByFormula sobre un campo de tipo link con ARRAYJOIN regresa
        // el nombre mostrado, no el record ID, así que NO se usa como filtro.
        const listUrl = `https://api.airtable.com/v0/${BASE_ID}/${TBL_PLANES}?maxRecords=50`;
        const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
        const listData = await listRes.json();
        const planesDelPaciente = (listData.records || []).filter(r => (r.fields['Paciente'] || []).includes(pacienteRecordId));
        planesDelPaciente.sort((a, b) => new Date(b.fields['Fecha generación'] || 0) - new Date(a.fields['Fecha generación'] || 0));
        const planPrevio = planesDelPaciente[0];
        if (planPrevio) {
          (planPrevio.fields['Platillos usados (IDs)'] || '').split(',').map(s => s.trim()).filter(Boolean).forEach(id => platillosSemanaPrevia.add(id));
        }
      } catch { /* si falla, simplemente no hay penalización de semana previa — nunca bloquea el plan */ }

      const ultimoUso = {};
      const planSemana = [];

      for (let dia = 1; dia <= numDias; dia++) {
        const planDia = {};
        const usadosHoy = new Set();
        for (const [horario, proporcion] of Object.entries(DISTRIBUCION)) {
          const kcalSlot = kcalObjetivo * proporcion;
          const categoriaBuscar = horario.startsWith('Colación') ? 'Colación' : horario;
          const candidatos = compatibles.filter(p => p.categoria === categoriaBuscar && !usadosHoy.has(p.id));
          if (candidatos.length === 0) { planDia[horario] = { platillo: null, razon: `Sin opciones en '${categoriaBuscar}'` }; continue; }

          const conScore = candidatos.map(p => {
            const kcalBase = p.nutrimentos?.energia_kcal || 0;
            let score = 999;
            if (kcalBase > 0) {
              const factor = kcalSlot / kcalBase;
              const factorClamp = Math.max(0.6, Math.min(1.6, factor));
              const diffCalorico = Math.abs(factor - factorClamp) + Math.abs(kcalSlot - kcalBase*factorClamp) / kcalSlot;
              const diasDesdeUso = dia - (ultimoUso[p.id] ?? -999);
              const penalizacion = Math.max(0, 3 - diasDesdeUso) * 0.15;
              const penalizacionSemanaPrevia = platillosSemanaPrevia.has(p.id) ? 0.25 : 0;
              score = diffCalorico + penalizacion + penalizacionSemanaPrevia + bonoObjetivosSemana(p);
            }
            return { p, score };
          });
          conScore.sort((a, b) => a.score - b.score);
          const mejor = conScore[0].p;
          const kcalBase = mejor.nutrimentos.energia_kcal;
          const factor = Math.round(Math.max(0.6, Math.min(1.6, kcalSlot / kcalBase)) * 100) / 100;
          usadosHoy.add(mejor.id);
          ultimoUso[mejor.id] = dia;
          planDia[horario] = { platillo: mejor.nombre, id: mejor.id, factor_porcion: factor };
        }
        planSemana.push({ dia, menu: planDia });
      }

      // ─── LISTA DE COMPRAS — suma todos los ingredientes de la semana ───
      const listaCompras = {};
      for (const { menu } of planSemana) {
        for (const info of Object.values(menu)) {
          if (!info.platillo) continue;
          const platillo = compatibles.find(p => p.id === info.id);
          if (!platillo) continue;
          for (const ing of (platillo.ingredientes || [])) {
            const infoIng = BNCC_ING_POR_ID[ing.id];
            if (!infoIng) continue;
            const gramosAjustados = Math.round(ing.gramos * info.factor_porcion);
            listaCompras[infoIng.nombre] = (listaCompras[infoIng.nombre] || 0) + gramosAjustados;
          }
        }
      }

      // ─── CAPA DE FORMATO — texto tipo WhatsApp, listo para copiar ──────
      const nombreDieta = presetElegido.replace(/_/g, ' ').toUpperCase();
      const proteinaG = Math.round((kcalObjetivo * macrosPreset.proteina_pct) / 4);
      const grasaG = Math.round((kcalObjetivo * macrosPreset.grasa_pct) / 9);
      const carboG = Math.round((kcalObjetivo * macrosPreset.carbo_pct) / 4);

      let texto = `👋🏼 Hola ${nombrePaciente.split(' ')[0]}, este plan fue diseñado especialmente para ti`;
      texto += glp1Activo ? `, considerando tu tratamiento con ${glp1Info || 'GLP-1'}.\n\n` : '.\n\n';
      texto += `📋 *Datos clínicos*\n`;
      texto += `• 👤 Nombre: ${nombrePaciente}\n• 🎂 Edad: ${edad} años\n• ⚖️ Peso actual: ${peso} kg\n• 📏 Estatura: ${talla} cm\n• 📐 IMC: ${imc}\n`;
      if (perfil.patologias.length) texto += `• 🧭 Condiciones: ${perfil.patologias.join(', ')}\n`;
      if (glp1Activo) texto += `• 💉 Tratamiento GLP-1: ${glp1Info || 'activo'}\n`;

      texto += `\n🎯 *Objetivos terapéuticos*\n• Plan ${nombreDieta.toLowerCase()}: ${kcalObjetivo} kcal/día — ${proteinaG}g proteína, ${carboG}g carbohidrato, ${grasaG}g grasa\n`;
      if (seleccionAuto) texto += `  _(tipo de dieta elegido automáticamente: ${seleccionAuto.razon})_\n`;
      if (objsSemana.size) texto += `• Enfoque de la semana: ${[...objsSemana].join(', ')}\n`;
      if (mesetaDetectada) {
        texto += `\n⚠️ *Meseta detectada* — el peso no bajó en los últimos registros. Este plan ya se ajustó hacia un enfoque más ${presetElegido === 'keto_clinico' ? 'cetogénico' : 'hiperproteico'} para romperla. Se revalora en 7 días.\n`;
      }

      texto += `\n🍽️ *PLAN NUTRICIONAL ${nombreDieta} — ${numDias} DÍAS*\n`;
      for (const { dia, menu } of planSemana) {
        texto += `\n📅 Día ${dia}\n`;
        for (const [horario, info] of Object.entries(menu)) {
          if (!info.platillo) continue;
          const emoji = { 'Desayuno':'🍳', 'Comida':'🍽️', 'Cena':'🌙', 'Colación Matutina':'🍏', 'Colación Vespertina':'🍎' }[horario] || '•';
          texto += `${emoji} ${horario}: ${info.platillo}\n`;
        }
      }

      texto += `\n🛒 *Lista de compras (semana completa)*\n`;
      for (const [nombre, gramos] of Object.entries(listaCompras).sort()) {
        texto += `• ${nombre}: ~${gramos}g\n`;
      }

      const suplementos = sugerirSuplementos({ patologias: perfil.patologias, glp1Activo, tipoDietaEfectivo });
      if (suplementos.length > 0) {
        texto += `\n💊 *Suplementación sugerida*\n_(bajo supervisión médica — tú decides producto y dosis final)_\n`;
        for (const s of suplementos) texto += `• ${s.nombre} — ${s.marca} ${s.producto}\n`;
      }

      if (ventanaAyuno) {
        texto += `\n⏱️ *Ayuno intermitente ${ayunoEfectivo.replace('_',':')}*\n${ventanaAyuno.nota}\n`;
      } else if (ayunoIntermitente && ayunoContraindicado) {
        texto += `\n⚠️ Se pidió ayuno intermitente pero está contraindicado con las condiciones activas del paciente (embarazo/lactancia/pediatría/desnutrición) — no se aplicó.\n`;
      }

      texto += `\n📌 "Tu salud no depende de la perfección, sino de la constancia con la que te eliges cada día." 🌱\n`;
      texto += `\n👨🏻‍⚕️ ${firmaMedico.nombre}`;
      if (firmaMedico.telefono) texto += `\n📲 WhatsApp: ${firmaMedico.telefono}`;

      // Guardar este plan para que el siguiente seguimiento no repita lo mismo.
      const idsUsados = [...new Set(planSemana.flatMap(({ menu }) => Object.values(menu).map(i => i.id).filter(Boolean)))];
      fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PLANES}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, records: [{ fields: {
          'Fecha generación': new Date().toISOString(),
          'Paciente': [pacienteRecordId],
          'Platillos usados (IDs)': idsUsados.join(', '),
          'Preset usado': presetElegido,
          'Días': numDias,
        } }] }),
      }).catch(e => console.error('[nova] error guardando plan en historial:', e.message));

      return res.status(200).json({
        objetivo_nutricional: { kcal_objetivo: kcalObjetivo, proteina_g: proteinaG, carbohidratos_g: carboG, grasa_g: grasaG, imc },
        compatibles_total: compatibles.length, dias: numDias, preset_usado: presetElegido,
        preset_seleccion_automatica: seleccionAuto ? { auto: true, razon: seleccionAuto.razon } : { auto: false, razon: 'Elegido manualmente por el médico' },
        tipo_dieta: tipoDietaEfectivo || 'estandar', ayuno_intermitente: ayunoEfectivo, ayuno_contraindicado: ayunoIntermitente ? ayunoContraindicado : false,
        glp1_activo: glp1Activo, meseta_detectada: mesetaDetectada, plan: planSemana, lista_compras: listaCompras,
        suplementos_sugeridos: suplementos.map(s => ({ nombre: s.nombre, marca: s.marca, producto: s.producto, precio_medico: s.precio_medico, precio_publico: s.precio_publico })),
        texto_formateado: texto,
      });
    } catch (err) {
      console.error('[nova] generar_plan_semanal error:', err.message);
      return res.status(500).json({ error: 'Error interno generando el plan semanal.' });
    }
  }

  // ─── SEGUIMIENTO: ACTUALIZAR PESO Y REGENERAR ────────────────────
  // "Ciclo de ajuste semanal" — registra el nuevo peso en el historial y
  // deja el expediente listo para que el siguiente generar_plan_semanal
  // ya lo use automáticamente (no hace falta volver a mandar peso/talla).
  if (action === 'actualizar_seguimiento_paciente') {
    try {
      const { pacienteRecordId, pesoNuevo, nota } = req.body;
      if (!pacienteRecordId || !pesoNuevo) return res.status(400).json({ error: 'Faltan pacienteRecordId o pesoNuevo.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';
      const getUrl = `https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}/${pacienteRecordId}`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const pacData = await getRes.json();
      if (!getRes.ok) return res.status(502).json({ error: 'No se pudo leer el expediente del paciente.' });

      const historialPrevio = pacData.fields?.['Historial de peso'] || '';
      const fecha = new Date().toISOString().slice(0,10);
      const pesoAnterior = pacData.fields?.['Peso actual (kg)'];
      const diferencia = pesoAnterior ? Math.round((pesoNuevo - pesoAnterior) * 10) / 10 : null;
      const lineaNueva = `[${fecha}] ${pesoNuevo}kg` + (diferencia !== null ? ` (${diferencia > 0 ? '+' : ''}${diferencia}kg vs anterior)` : '') + (nota ? ` — ${nota}` : '');
      const nuevoHistorial = (historialPrevio ? historialPrevio + '\n' : '') + lineaNueva;

      await fetch(getUrl, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, fields: { 'Peso actual (kg)': pesoNuevo, 'Historial de peso': nuevoHistorial } }),
      });

      return res.status(200).json({ peso_anterior: pesoAnterior || null, peso_nuevo: pesoNuevo, diferencia_kg: diferencia, mensaje: 'Peso actualizado. El siguiente plan que generes ya usará este valor automáticamente.' });
    } catch (err) {
      console.error('[nova] actualizar_seguimiento_paciente error:', err.message);
      return res.status(500).json({ error: 'Error interno actualizando el seguimiento.' });
    }
  }

  // ─── MOTOR DE PERSONALIZACIÓN NUTRICIONAL (MPN) ──────────────────
  // Decide qué platillo va en cada horario del día, con qué factor de
  // porción y por qué — usando el perfil real del paciente (Airtable) y
  // la BNCC estática. Reglas deterministas, igual que Compatibilidad.
  if (action === 'generar_menu_dia') {
    try {
      const { pacienteRecordId, peso, talla, edad, sexo, factorActividad, objetivo, preferencias } = req.body;
      if (!pacienteRecordId) return res.status(400).json({ error: 'Falta pacienteRecordId.' });
      if (!peso || !talla || !edad || !sexo) return res.status(400).json({ error: 'Faltan datos antropométricos (peso, talla, edad, sexo).' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';
      const getUrl = `https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}/${pacienteRecordId}`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const pacData = await getRes.json();
      if (!getRes.ok) return res.status(502).json({ error: 'No se pudo leer el expediente del paciente.' });

      const perfil = {
        patologias: pacData.fields?.['Patologías activas'] || [],
        severidad_erc: pacData.fields?.['Severidad ERC'] || null,
        alergias: (pacData.fields?.['Alergias alimentarias'] || '').split(',').map(a => a.trim()).filter(Boolean),
        preferencias: preferencias || {},
      };

      // Motor de Objetivos Nutricionales (Mifflin-St Jeor + ajuste por objetivo)
      const geb = sexo === 'M' ? (10*peso + 6.25*talla - 5*edad + 5) : (10*peso + 6.25*talla - 5*edad - 161);
      const get = geb * (factorActividad || 1.2);
      const ajusteObjetivo = { perdida_grasa: 0.82, mantenimiento: 1.0, ganancia_masa: 1.12, soporte_metabolico: 1.0 }[objetivo] ?? 1.0;
      const kcalObjetivo = Math.round(get * ajusteObjetivo);
      const proteinaG = Math.round(peso * (objetivo === 'soporte_metabolico' ? 1.6 : 1.8));
      const grasaG = Math.round(kcalObjetivo * 0.27 / 9);
      const carbG = Math.max(Math.round((kcalObjetivo - proteinaG*4 - grasaG*9) / 4), 0);
      const objetivoNutricional = { kcal_objetivo: kcalObjetivo, proteina_g: proteinaG, carbohidratos_g: carbG, grasa_g: grasaG };

      // Motor de Compatibilidad (reglas)
      const compatibles = BNCC_DATA.platillos.filter(p => {
        for (const pat of perfil.patologias) {
          for (const ev of (p.evitar_en || [])) {
            if (ev.toLowerCase().startsWith(pat.toLowerCase())) return false;
          }
        }
        for (const ing of (p.ingredientes || [])) {
          const info = BNCC_ING_POR_ID[ing.id];
          if (!info) continue;
          for (const alergia of perfil.alergias) {
            if (info.nombre.toLowerCase().includes(alergia.toLowerCase())) return false;
          }
        }
        if (perfil.preferencias.vegetariano) {
          for (const ing of (p.ingredientes || [])) {
            const info = BNCC_ING_POR_ID[ing.id];
            if (info && info.origen === 'Animal' && info.vegetariano === false) return false;
          }
        }
        if (perfil.preferencias.evitar_pescado) {
          for (const ing of (p.ingredientes || [])) {
            const info = BNCC_ING_POR_ID[ing.id];
            if (info && info.categoria === 'Pescados y mariscos') return false;
          }
        }
        return true;
      });

      // Distribución calórica por horario
      const DISTRIBUCION = { 'Desayuno': 0.25, 'Comida': 0.35, 'Cena': 0.25, 'Colación Matutina': 0.075, 'Colación Vespertina': 0.075 };
      const planDia = {};
      const usadosHoy = new Set();

      for (const [horario, proporcion] of Object.entries(DISTRIBUCION)) {
        const kcalSlot = kcalObjetivo * proporcion;
        const categoriaBuscar = horario.startsWith('Colación') ? 'Colación' : horario;
        let candidatos = compatibles.filter(p => p.categoria === categoriaBuscar && !usadosHoy.has(p.id));

        if (candidatos.length === 0) {
          const conRepetido = compatibles.filter(p => p.categoria === categoriaBuscar);
          planDia[horario] = conRepetido.length > 0
            ? { platillo: null, razon: `Solo hay opciones ya usadas en otro horario del día en '${categoriaBuscar}' — falta variedad en la BNCC.` }
            : { platillo: null, razon: `Sin platillos compatibles en categoría '${categoriaBuscar}' — BNCC aún no cubre este horario.` };
          continue;
        }

        let mejor = null, mejorFactor = 1, mejorDiff = Infinity;
        for (const p of candidatos) {
          const kcalBase = p.nutrimentos?.energia_kcal || 0;
          if (kcalBase <= 0) continue;
          const factor = kcalSlot / kcalBase;
          const factorClamp = Math.max(0.6, Math.min(1.6, factor));
          const diff = Math.abs(factor - factorClamp) + Math.abs(kcalSlot - kcalBase*factorClamp) / kcalSlot;
          if (diff < mejorDiff) { mejor = p; mejorFactor = factorClamp; mejorDiff = diff; }
        }

        if (mejor) {
          usadosHoy.add(mejor.id);
          const ajusteGrande = mejorFactor <= 0.65 || mejorFactor >= 1.55;
          planDia[horario] = {
            platillo: mejor.nombre, id: mejor.id,
            factor_porcion: Math.round(mejorFactor * 100) / 100,
            kcal_resultante: Math.round(mejor.nutrimentos.energia_kcal * mejorFactor),
            kcal_objetivo_horario: Math.round(kcalSlot),
            razon: `Mejor ajuste calórico disponible en ${horario} (${ajusteGrande ? 'ajuste de porción notable, revisar' : 'ajuste razonable'})`,
            alternativas: candidatos.filter(c => c.id !== mejor.id).slice(0, 3).map(c => c.nombre),
          };
        }
      }

      return res.status(200).json({ objetivo_nutricional: objetivoNutricional, compatibles_total: compatibles.length, bncc_total: BNCC_DATA.platillos.length, plan_dia: planDia });
    } catch (err) {
      console.error('[nova] generar_menu_dia error:', err.message);
      return res.status(500).json({ error: 'Error interno generando el menú del día.' });
    }
  }

  // ─── MOTOR DE COMPATIBILIDAD ─────────────────────────────────────
  // Filtra la BNCC contra el perfil real del paciente (patologías, alergias,
  // severidad ERC) leído de Airtable. Lógica de reglas, sin IA — determinista
  // y auditable, como corresponde a algo que decide qué puede comer alguien.
  if (action === 'filtrar_platillos_compatibles') {
    try {
      const { pacienteRecordId } = req.body;
      if (!pacienteRecordId || typeof pacienteRecordId !== 'string') {
        return res.status(400).json({ error: 'Falta pacienteRecordId.' });
      }

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';
      const getUrl = `https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}/${pacienteRecordId}`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const pacData = await getRes.json();
      if (!getRes.ok) return res.status(502).json({ error: 'No se pudo leer el expediente del paciente.' });

      const perfil = {
        patologias: pacData.fields?.['Patologías activas'] || [],
        severidad_erc: pacData.fields?.['Severidad ERC'] || null,
        alergias: (pacData.fields?.['Alergias alimentarias'] || '').split(',').map(a => a.trim()).filter(Boolean),
      };

      const resultado = { compatibles: [], con_advertencia: [], excluidos: [] };

      for (const platillo of BNCC_DATA.platillos) {
        const razonesExcluir = [];
        const advertencias = [];

        // 1) evitar_en vs patologías activas del paciente
        for (const patologia of perfil.patologias) {
          for (const evitar of (platillo.evitar_en || [])) {
            if (evitar.toLowerCase().startsWith(patologia.toLowerCase())) {
              razonesExcluir.push(`Marcado evitar en ${evitar}`);
            }
          }
        }

        // 2) alergias vs ingredientes reales
        for (const ing of (platillo.ingredientes || [])) {
          const info = BNCC_ING_POR_ID[ing.id];
          if (!info) continue;
          for (const alergia of perfil.alergias) {
            if (info.nombre.toLowerCase().includes(alergia.toLowerCase())) {
              razonesExcluir.push(`Contiene ${info.nombre} — alergia declarada: ${alergia}`);
            }
          }
        }

        // 3) ERC: sodio/potasio calculado desde ingredientes (screening, no receta final)
        if (perfil.patologias.some(p => p.startsWith('ERC'))) {
          let limiteSodio = null, limitePotasio = null;
          if (perfil.severidad_erc === 'Etapa 3') { limiteSodio = 600; limitePotasio = 700; }
          if (perfil.severidad_erc === 'Etapa 4' || perfil.severidad_erc === 'Etapa 5') { limiteSodio = 400; limitePotasio = 500; }
          if (limiteSodio) {
            let sodioTotal = 0, potasioTotal = 0;
            for (const ing of (platillo.ingredientes || [])) {
              const info = BNCC_ING_POR_ID[ing.id];
              if (!info?.nutrimentos) continue;
              const factor = ing.gramos / 100;
              sodioTotal += (info.nutrimentos.sodio_mg || 0) * factor;
              potasioTotal += (info.nutrimentos.potasio_mg || 0) * factor;
            }
            if (sodioTotal > limiteSodio) advertencias.push(`Sodio alto para ERC ${perfil.severidad_erc}: ${Math.round(sodioTotal)}mg (límite sugerido ${limiteSodio}mg)`);
            if (potasioTotal > limitePotasio) advertencias.push(`Potasio alto para ERC ${perfil.severidad_erc}: ${Math.round(potasioTotal)}mg (límite sugerido ${limitePotasio}mg)`);
          }
        }

        const entrada = { id: platillo.id, nombre: platillo.nombre };
        if (razonesExcluir.length > 0) {
          resultado.excluidos.push({ ...entrada, razones: razonesExcluir });
        } else if (advertencias.length > 0) {
          resultado.con_advertencia.push({ ...entrada, advertencias });
        } else {
          resultado.compatibles.push(entrada);
        }
      }

      return res.status(200).json({ perfil_usado: perfil, ...resultado });
    } catch (err) {
      console.error('[nova] filtrar_platillos_compatibles error:', err.message);
      return res.status(500).json({ error: 'Error interno filtrando platillos.' });
    }
  }

  // ─── MOTOR DE INTERPRETACIÓN CLÍNICA ────────────────────────────
  // Traduce el texto libre de una consulta (diagnóstico, motivo, plan) a la
  // taxonomía fija de 30 patologías del sistema. Se llama justo después de
  // que el médico guarda una consulta — nunca antes de que la revise.
  // Solo AGREGA a "Patologías activas", nunca quita nada en automático.
  if (action === 'interpretar_perfil_clinico') {
    try {
      const { pacienteRecordId, diagnostico, motivoConsulta, planTerapeutico } = req.body;
      if (!pacienteRecordId || typeof pacienteRecordId !== 'string') {
        return res.status(400).json({ error: 'Falta pacienteRecordId.' });
      }
      const textoClinico = [diagnostico, motivoConsulta, planTerapeutico].filter(Boolean).join('\n');
      if (!textoClinico.trim()) {
        return res.status(200).json({ patologias_nuevas: [], mensaje: 'Sin texto clínico que interpretar.' });
      }

      const TAXONOMIA = ["Obesidad","Sobrepeso","Diabetes Tipo 2","Prediabetes","Resistencia a la Insulina",
        "Hipertension","Dislipidemia","Hipertrigliceridemia","Higado Graso","Sindrome Metabolico",
        "Hipotiroidismo","Hipertiroidismo","SOP","Menopausia","Embarazo","Lactancia",
        "ERC 1","ERC 2","ERC 3","ERC 4","ERC 5","Gota","Anemia","Fibromialgia","Cancer",
        "Postquirurgico","Sarcopenia","Desnutricion","Adulto Mayor","Pediatria"];

      const herramienta = {
        name: 'clasificar_patologias',
        description: 'Clasifica el texto clínico contra la taxonomía fija de 30 patologías. Solo detecta lo que está explícito o claramente implícito — nunca inventes ni asumas de más.',
        input_schema: {
          type: 'object',
          properties: {
            patologias_detectadas: { type: 'array', items: { type: 'string', enum: TAXONOMIA }, description: 'Solo las que aparecen claramente en el texto.' },
            severidad_erc: { type: 'string', enum: ['No aplica','Etapa 1','Etapa 2','Etapa 3','Etapa 4','Etapa 5'], description: 'Solo si hay ERC mencionada con etapa explícita; si no se menciona etapa, usa "No aplica".' },
            alergias_detectadas: { type: 'array', items: { type: 'string' }, description: 'Alergias o intolerancias alimentarias mencionadas, tal cual (no forzar a la taxonomía).' },
            notas_revision: { type: 'string', description: 'Cualquier término clínico relevante que NO calzó con confianza en la taxonomía fija — para que el médico lo revise. Vacío si no hay nada así.' },
          },
          required: ['patologias_detectadas'],
        },
      };

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1024,
          system: 'Eres el Motor de Interpretación Clínica de CODE CELLS®. Tu único trabajo es clasificar texto clínico contra una taxonomía fija, con precisión y sin inventar. Nunca uses la etiqueta más cercana si no calza bien — en ese caso repórtalo en notas_revision en vez de forzarla.',
          messages: [{ role: 'user', content: textoClinico.slice(0, 4000) }],
          tools: [herramienta],
          tool_choice: { type: 'tool', name: 'clasificar_patologias' },
        }),
      });
      const claudeData = await claudeRes.json();
      if (!claudeRes.ok) {
        console.error('[nova] error interpretar_perfil_clinico:', JSON.stringify(claudeData));
        return res.status(502).json({ error: 'Error clasificando el perfil clínico.' });
      }
      const toolBlock = Array.isArray(claudeData.content) ? claudeData.content.find(b => b?.type === 'tool_use' && b.name === 'clasificar_patologias') : null;
      if (!toolBlock) {
        return res.status(502).json({ error: 'El motor no generó una clasificación válida.' });
      }
      const { patologias_detectadas = [], severidad_erc, alergias_detectadas = [], notas_revision = '' } = toolBlock.input;

      // Leer estado actual del paciente y hacer merge (solo agregar, nunca quitar)
      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';
      const getUrl = `https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}/${pacienteRecordId}`;
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const pacData = await getRes.json();
      if (!getRes.ok) {
        return res.status(502).json({ error: 'No se pudo leer el expediente del paciente.' });
      }

      const patologiasPrevias = pacData.fields?.['Patologías activas'] || [];
      const patologiasNuevas = patologias_detectadas.filter(p => !patologiasPrevias.includes(p));
      const patologiasMerge = [...patologiasPrevias, ...patologiasNuevas];

      const fieldsUpdate = {};
      if (patologiasNuevas.length > 0) fieldsUpdate['Patologías activas'] = patologiasMerge;
      if (severidad_erc && severidad_erc !== 'No aplica') fieldsUpdate['Severidad ERC'] = severidad_erc;
      if (alergias_detectadas.length > 0) {
        const alergiasPrevias = pacData.fields?.['Alergias alimentarias'] || '';
        const nuevasAlergias = alergias_detectadas.filter(a => !alergiasPrevias.includes(a));
        if (nuevasAlergias.length > 0) {
          fieldsUpdate['Alergias alimentarias'] = (alergiasPrevias ? alergiasPrevias + ', ' : '') + nuevasAlergias.join(', ');
        }
      }
      if (notas_revision && notas_revision.trim()) {
        const notasPrevias = pacData.fields?.['Notas interpretación clínica'] || '';
        const fecha = new Date().toISOString().slice(0,10);
        fieldsUpdate['Notas interpretación clínica'] = (notasPrevias ? notasPrevias + '\n' : '') + `[${fecha}] ${notas_revision.trim()}`;
      }

      if (Object.keys(fieldsUpdate).length > 0) {
        await fetch(getUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ typecast: true, fields: fieldsUpdate }),
        });
      }

      return res.status(200).json({
        patologias_nuevas: patologiasNuevas,
        patologias_totales: patologiasMerge,
        severidad_erc: severidad_erc || null,
        alergias_nuevas: alergias_detectadas,
        notas_revision: notas_revision || null,
      });
    } catch (err) {
      console.error('[nova] interpretar_perfil_clinico error:', err.message);
      return res.status(500).json({ error: 'Error interno interpretando el perfil clínico.' });
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
    let herramientaPaciente = null; // solo se llena en modo paciente/VIP
    let herramientaMedico = null;   // solo se llena en modo médico (opcional, tool_choice auto)
    let pacRecordId = null;
    let pacMedicoLink = null;
    let esVipReal = false;

    const esMedico = typeof medicoCode === 'string' && /^CCMED-[A-Z0-9]{4,8}$/.test(medicoCode);
    const esVIP    = typeof vipCode    === 'string' && /^DZW-[0-9]{8}$/.test(vipCode);
    const esPac    = typeof pacienteCode === 'string' && /^CC-PAC-[0-9]{4,8}$/.test(pacienteCode);

    if (esMedico) {
      systemPrompt = buildSystemPrompt('medico', {
        nombre:      (typeof medicoNombre      === 'string' ? medicoNombre.slice(0,100)      : 'Médico'),
        codigo:      medicoCode,
        especialidad:(typeof medicoEspecialidad === 'string' ? medicoEspecialidad.slice(0,100) : 'Medicina'),
      });
      herramientaMedico = buildHerramientaFichaConsulta();
    } else if (esPac) {
      // El nivel (VIP o no) y la memoria NUNCA se confían del cliente — se
      // consultan aquí contra Airtable, para que nadie pueda "volverse VIP"
      // con solo editar el request.
      try {
        const formula = `{Código de paciente}="${pacienteCode}"`;
        const url = `https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_PACIENTES}?filterByFormula=${encodeURIComponent(formula)}`;
        const pacRes = await fetch(url, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` } });
        const pacData = await pacRes.json();
        const pacRecord = pacData.records?.[0];

        if (!pacRecord) {
          return res.status(404).json({ error: 'Paciente no reconocido.' });
        }

        pacRecordId  = pacRecord.id;
        pacMedicoLink= pacRecord.fields['Médico_principal'] || null;
        esVipReal    = pacRecord.fields['Es VIP (DEZAWA)'] === true;
        const memoria = pacRecord.fields['Memoria NOVA (paciente)'] || '';
        const nombreReal = pacRecord.fields['Nombre completo'] || (typeof pacienteNombre === 'string' ? pacienteNombre.slice(0,100) : '');

        systemPrompt = buildSystemPrompt('paciente', { nombre: nombreReal, id: pacienteCode, memoria, vip: esVipReal });
        herramientaPaciente = buildHerramientaPaciente(esVipReal);
      } catch (err) {
        console.error('[nova] error consultando paciente:', err.message);
        return res.status(502).json({ error: 'Error consultando el expediente del paciente.' });
      }
    } else if (esVIP) {
      // Código maestro DZW de demo/tour — no está atado a un paciente real
      // en Airtable, así que aquí NO se activan herramientas (no hay dónde
      // escribir la solicitud de cita ni la memoria). Solo conversación.
      systemPrompt = buildSystemPrompt('paciente', {
        nombre: typeof vipNombre === 'string' ? vipNombre.slice(0,100) : '',
        id: vipCode,
        vip: true,
      });
    } else {
      // Modo público — permite system prompt del cliente solo en este modo
      systemPrompt = typeof clientSystem === 'string'
        ? clientSystem.slice(0, 8000)
        : buildSystemPrompt('publico');
    }

    // Techo más alto que antes (era 2048) — un dictado de ficha + una petición
    // de contenido largo en el mismo mensaje puede necesitar más espacio antes
    // de que la herramienta termine de construirse; si se corta a medias, la
    // llamada a la herramienta queda incompleta y NOVA "no responde".
    const safeTokens = Math.min(typeof max_tokens === 'number' ? max_tokens : 1024, 4096);

    const anthropicBody = {
      model      : 'claude-sonnet-5',
      max_tokens : safeTokens,
      system     : systemPrompt,
      messages,
    };
    if (herramientaPaciente) {
      anthropicBody.tools = [herramientaPaciente];
      anthropicBody.tool_choice = { type: 'tool', name: 'respuesta_nova_paciente' };
    } else if (herramientaMedico) {
      // Auto, no forzada: el médico también usa NOVA para preguntas normales de
      // protocolos/clínica — solo se activa cuando NOVA detecta que le están
      // dictando datos de un paciente para llenar la ficha.
      anthropicBody.tools = [herramientaMedico];
      anthropicBody.tool_choice = { type: 'auto' };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type'      : 'application/json',
        'x-api-key'         : process.env.ANTHROPIC_API_KEY,
        'anthropic-version' : '2023-06-01',
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[nova] Anthropic error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Error del servicio de IA. Intenta de nuevo.' });
    }

    // ─── MODO PACIENTE/VIP CON HERRAMIENTA: extraer reply + ejecutar acciones ──
    if (herramientaPaciente) {
      const toolBlock = Array.isArray(data.content)
        ? data.content.find(b => b && b.type === 'tool_use' && b.name === 'respuesta_nova_paciente')
        : null;

      if (!toolBlock || typeof toolBlock.input?.reply !== 'string' || !toolBlock.input.reply.trim()) {
        console.error('[nova] Respuesta de paciente sin reply utilizable. stop_reason:', data.stop_reason, '— content:', JSON.stringify(data.content));
        if (data.stop_reason === 'max_tokens') {
          return res.status(502).json({ error: 'Tu mensaje pedía demasiado para una sola respuesta y se cortó a la mitad. Pide una cosa a la vez.' });
        }
        return res.status(502).json({ error: 'NOVA no generó una respuesta legible. Intenta de nuevo.' });
      }

      const accion = toolBlock.input;

      // Efectos secundarios — no deben tumbar la respuesta al paciente si fallan,
      // solo se registran en el log del servidor.
      try {
        await ejecutarAccionesPaciente({
          accion, pacRecordId, pacMedicoLink, esVipReal, pacienteCode,
          ultimoMensajePaciente: messages[messages.length - 1]?.content || '',
        });
      } catch (err) {
        console.error('[nova] error ejecutando acciones de paciente:', err.message);
      }

      // Se devuelve en el mismo formato {content:[...]} de siempre para no
      // romper la extracción de texto que ya hace el cliente.
      return res.status(200).json({ content: [{ type: 'text', text: accion.reply }] });
    }

    // ─── MODO MÉDICO CON HERRAMIENTA DE FICHA (opcional) ───────────────
    if (herramientaMedico) {
      const toolBlock = Array.isArray(data.content)
        ? data.content.find(b => b && b.type === 'tool_use' && b.name === 'rellenar_ficha_consulta')
        : null;

      if (toolBlock && typeof toolBlock.input?.mensaje === 'string') {
        const { mensaje, ...ficha } = toolBlock.input;
        // Se manda "ficha" como campo adicional (no estándar de Anthropic) para
        // que el cliente autorellene el formulario; "content" sigue igual para
        // no romper la burbuja de chat existente.
        return res.status(200).json({ content: [{ type: 'text', text: mensaje }], ficha });
      }

      if (toolBlock && data.stop_reason === 'max_tokens') {
        // NOVA empezó a meter algo largo (típicamente un plan nutricional) DENTRO
        // de la herramienta de ficha, que va con presupuesto corto — se cortó a
        // medias. Red de seguridad: reintentar sin herramientas, en texto libre,
        // en vez de mostrarle el error al médico.
        console.error('[nova] tool_use de ficha truncado por max_tokens — reintentando sin herramientas.');
        const retryRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type'      : 'application/json',
            'x-api-key'         : process.env.ANTHROPIC_API_KEY,
            'anthropic-version' : '2023-06-01',
          },
          body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: safeTokens, system: systemPrompt, messages }),
        });
        const retryData = await retryRes.json();
        const retryTexto = retryRes.ok && Array.isArray(retryData.content)
          ? retryData.content.find(b => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0)
          : null;

        if (retryTexto) {
          return res.status(200).json({ content: [{ type: 'text', text: retryTexto.text }] });
        }
        // Si ni así se pudo, ahí sí es un caso real de "pedías demasiado".
        return res.status(502).json({ error: 'Tu mensaje pedía demasiado para una sola respuesta y se cortó a la mitad. Pide una cosa a la vez.' });
      }
      // Si NOVA no usó la herramienta (pregunta normal, sin dictado clínico),
      // sigue el flujo de texto normal de abajo.
    }

    // ─── MODO MÉDICO (sin ficha) / PÚBLICO: respuesta de texto normal ──
    const bloqueTexto = Array.isArray(data.content)
      ? data.content.find(b => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0)
      : null;

    if (!bloqueTexto) {
      console.error('[nova] Respuesta sin texto utilizable. stop_reason:', data.stop_reason, '— content:', JSON.stringify(data.content));
      if (data.stop_reason === 'max_tokens') {
        return res.status(502).json({ error: 'Tu mensaje pedía demasiado para una sola respuesta y se cortó a la mitad (ej. ficha + un plan largo juntos). Divídelo en dos mensajes.' });
      }
      return res.status(502).json({ error: 'NOVA no generó una respuesta legible. Intenta de nuevo.' });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('[nova] chat error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

// ─── DEFINICIÓN DE LA HERRAMIENTA DE NOVA EN MODO MÉDICO (ficha) ───
// Opcional (tool_choice auto) — NOVA la usa solo cuando detecta que el médico
// le está dictando datos clínicos de un paciente que está atendiendo, no en
// preguntas normales de protocolos/clínica.
function buildHerramientaFichaConsulta() {
  return {
    name: 'rellenar_ficha_consulta',
    description: 'Úsala SOLO cuando el médico dicte o describa datos clínicos de un paciente que está atendiendo ahora, con intención de llenar la ficha de consulta (edad, diagnóstico, signos vitales, motivo, plan). No la uses para preguntas generales, de protocolos o consultas que no describen a un paciente concreto. Mantén "mensaje" y todos los campos breves y concretos — nunca redactes documentos largos dentro de esta herramienta; si el médico pide algo más extenso además del dictado, dilo en una frase corta dentro de "mensaje" y ya. PROHIBIDO usar esta herramienta para planes nutricionales — un plan nutricional (aunque sea largo) SIEMPRE se responde en texto normal, sin llamar a ninguna herramienta, nunca dentro de "mensaje" ni de ningún campo de aquí.',
    input_schema: {
      type: 'object',
      properties: {
        mensaje: {
          type: 'string',
          description: 'Tu respuesta al médico. Confirma qué campos llenaste. Si falta algo clínicamente importante, pídelo aquí con precisión — ej. "Ficha actualizada. Me falta el peso y la talla, ¿los tienes a la mano?".',
        },
        peso: { type: 'number', description: 'Peso en kg, si se mencionó.' },
        talla: { type: 'number', description: 'Talla en cm, si se mencionó.' },
        presion: { type: 'string', description: "Formato 'sistólica/diastólica', ej. '130/85'." },
        temperatura: { type: 'number', description: 'Temperatura en °C, si se mencionó.' },
        motivo_consulta: { type: 'string' },
        exploracion_fisica: { type: 'string' },
        diagnostico: {
          type: 'string',
          description: 'Diagnóstico, con código CIE-10 solo si lo puedes inferir con confianza razonable; si no estás seguro del código exacto, escribe solo el diagnóstico en texto y dilo en el mensaje para que el médico lo confirme.',
        },
        plan_terapeutico: { type: 'string' },
        notas_internas: { type: 'string' },
        campos_faltantes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Campos clínicamente relevantes que no se mencionaron y valdría la pena preguntar, ej. ["frecuencia cardiaca", "talla"].',
        },
      },
      required: ['mensaje'],
    },
  };
}

// ─── DEFINICIÓN DE LA HERRAMIENTA DE NOVA EN MODO PACIENTE ─────────
function buildHerramientaPaciente(esVipReal) {
  const properties = {
    reply: {
      type: 'string',
      description: 'Tu respuesta completa y natural para el paciente. Esto es lo único que el paciente ve.',
    },
    crear_solicitud_cita: {
      type: 'boolean',
      description: 'true si el paciente pidió agendar/coordinar una cita, video llamada o hablar con su médico en ESTE mensaje.',
    },
    solicitud_tipo: {
      type: 'string',
      enum: ['Video llamada', 'Consulta presencial', 'Urgente'],
    },
    solicitud_motivo: {
      type: 'string',
      description: 'Motivo redactado por ti a partir de la conversación, en 1-2 frases.',
    },
    actualizar_memoria: {
      type: 'string',
      description: 'Si aprendiste algo nuevo y clínicamente útil de este paciente, escríbelo aquí en 1-3 frases, tercera persona. Deja vacío si no hay nada nuevo.',
    },
  };

  if (esVipReal) {
    Object.assign(properties, {
      crear_recordatorio: {
        type: 'boolean',
        description: 'true si el paciente aceptó que le recuerdes tomar un medicamento o hacerse un análisis.',
      },
      recordatorio_descripcion: { type: 'string', description: "Ej. 'Metformina 850mg'" },
      recordatorio_tipo: { type: 'string', enum: ['Medicamento', 'Análisis', 'Cita', 'Otro'] },
      recordatorio_frecuencia: { type: 'string', enum: ['Diario', 'Semanal', 'Cada X días', 'Una vez'] },
      recordatorio_hora: { type: 'string', description: 'Formato HH:MM' },
      invitar_amigo: {
        type: 'boolean',
        description: 'true si el paciente quiere invitar a alguien al programa y te dio nombre y/o teléfono.',
      },
      referido_nombre: { type: 'string' },
      referido_telefono: { type: 'string' },
    });
  }

  return {
    name: 'respuesta_nova_paciente',
    description: 'Responde al paciente y, si aplica, activa las acciones internas correspondientes (agendar cita, recordatorio, referido, actualizar memoria).',
    input_schema: { type: 'object', properties, required: ['reply'] },
  };
}

// ─── EJECUCIÓN DE ACCIONES (Airtable) ──────────────────────────────
async function ejecutarAccionesPaciente({ accion, pacRecordId, pacMedicoLink, esVipReal, pacienteCode, ultimoMensajePaciente }) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
  const tareas = [];

  if (accion.crear_solicitud_cita) {
    tareas.push(fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_SOLICITUDES_CITA}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        typecast: true,
        records: [{
          fields: {
            'Fecha solicitud': new Date().toISOString(),
            'Paciente': [pacRecordId],
            'Médico asignado': pacMedicoLink || [],
            'Tipo': accion.solicitud_tipo || 'Consulta presencial',
            'Motivo': accion.solicitud_motivo || '(sin motivo especificado)',
            'Estado': 'Pendiente',
            'Prioridad': esVipReal ? 'Alta' : 'Normal',
            'Canal preferido': accion.solicitud_tipo === 'Video llamada' ? 'Video llamada' : 'WhatsApp',
          },
        }],
      }),
    }).then(r => { if (!r.ok) r.text().then(t => console.error('[nova] error creando SOLICITUDES_CITA:', t)); }));
  }

  if (esVipReal && accion.crear_recordatorio) {
    tareas.push(fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_RECORDATORIOS}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        typecast: true,
        records: [{
          fields: {
            'Descripción': accion.recordatorio_descripcion || 'Recordatorio',
            'Paciente': [pacRecordId],
            'Tipo': accion.recordatorio_tipo || 'Otro',
            'Frecuencia': accion.recordatorio_frecuencia || 'Una vez',
            'Hora': accion.recordatorio_hora || '',
            'Activo': true,
            'Canal': 'WhatsApp',
          },
        }],
      }),
    }).then(r => { if (!r.ok) r.text().then(t => console.error('[nova] error creando RECORDATORIOS:', t)); }));
  }

  if (esVipReal && accion.invitar_amigo && (accion.referido_nombre || accion.referido_telefono)) {
    const codigoReferido = `${pacienteCode}-REF-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    tareas.push(fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_REFERIDOS_VIP}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        typecast: true,
        records: [{
          fields: {
            'Nombre referido': accion.referido_nombre || '(sin nombre)',
            'Paciente referidor': [pacRecordId],
            'Teléfono referido': accion.referido_telefono || '',
            'Estado': 'Invitado',
            'Fecha': new Date().toISOString(),
            'Código de referido': codigoReferido,
          },
        }],
      }),
    }).then(r => { if (!r.ok) r.text().then(t => console.error('[nova] error creando REFERIDOS_VIP:', t)); }));
  }

  if (typeof accion.actualizar_memoria === 'string' && accion.actualizar_memoria.trim()) {
    // Se antepone la fecha y se concatena a lo que ya había — nunca se
    // sobrescribe el historial de memoria previo.
    tareas.push((async () => {
      try {
        const getUrl = `https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_PACIENTES}/${pacRecordId}`;
        const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
        const getData = await getRes.json();
        const memoriaPrevia = getData.fields?.['Memoria NOVA (paciente)'] || '';
        const fechaHoy = new Date().toISOString().slice(0, 10);
        const nuevaMemoria = (memoriaPrevia ? memoriaPrevia + '\n' : '') + `[${fechaHoy}] ${accion.actualizar_memoria.trim()}`;
        await fetch(getUrl, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ fields: { 'Memoria NOVA (paciente)': nuevaMemoria } }),
        });
      } catch (err) {
        console.error('[nova] error actualizando memoria:', err.message);
      }
    })());
  }

  // Log de conversación agrupado por día — upsert (si ya hay sesión de hoy, se
  // le anexa; si no, se crea). Se filtra solo por Fecha para evitar el bug
  // conocido de ARRAYJOIN sobre campos de link en filterByFormula.
  tareas.push((async () => {
    try {
      const fechaHoy = new Date().toISOString().slice(0, 10);
      const formula = `{Fecha}="${fechaHoy}"`;
      const listUrl = `https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_NOVA_CONVERSACIONES}?filterByFormula=${encodeURIComponent(formula)}`;
      const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const listData = await listRes.json();
      const existente = (listData.records || []).find(r => (r.fields?.Paciente || []).includes(pacRecordId));

      const linea = `Paciente: ${ultimoMensajePaciente}\nNOVA: ${accion.reply}\n---\n`;

      if (existente) {
        await fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_NOVA_CONVERSACIONES}/${existente.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ fields: { 'Transcripción': (existente.fields['Transcripción'] || '') + linea } }),
        });
      } else {
        await fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_NOVA_CONVERSACIONES}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            typecast: true,
            records: [{ fields: { 'Fecha': fechaHoy, 'Paciente': [pacRecordId], 'Modo': esVipReal ? 'VIP' : 'Paciente', 'Transcripción': linea } }],
          }),
        });
      }
    } catch (err) {
      console.error('[nova] error guardando NOVA_CONVERSACIONES:', err.message);
    }
  })());

  await Promise.all(tareas);
}
