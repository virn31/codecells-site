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

let googleCalendarLib = null;
try {
  googleCalendarLib = require('../lib/google-calendar.js');
} catch (err) {
  console.error('[nova] No se pudo cargar lib/google-calendar.js:', err.message);
}

// Generación de códigos (CC-PAC-, DZW-, INV-) con verificación
// anti-colisión del lado del servidor — ver lib/codigos.js para el
// detalle honesto de qué tanto esto "asegura" contra Airtable.
const { generarCodigoUnico } = require('../lib/codigos');

// Taxonomía fija de 30 patologías — compartida entre el Motor de
// Interpretación Clínica y la herramienta de alta de paciente nuevo.
const TAXONOMIA_PATOLOGIAS = ["Obesidad","Sobrepeso","Diabetes Tipo 2","Prediabetes","Resistencia a la Insulina",
  "Hipertension","Dislipidemia","Hipertrigliceridemia","Higado Graso","Sindrome Metabolico",
  "Hipotiroidismo","Hipertiroidismo","SOP","Menopausia","Embarazo","Lactancia",
  "ERC 1","ERC 2","ERC 3","ERC 4","ERC 5","Gota","Anemia","Fibromialgia","Cancer",
  "Postquirurgico","Sarcopenia","Desnutricion","Adulto Mayor","Pediatria"];

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
- Nivel 1 — Asociado / RESTORE™: Optimización Biológica Intravenosa + antihomotoxicología + nutraceuticals
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
2. Sé elegante. Respuestas precisas, sin párrafos interminables. Emojis: casi nunca — como máximo uno, y solo si de verdad aporta calidez genuina; la mayoría de tus respuestas no deben llevar ninguno. Nunca los uses como decoración ni para cerrar cada mensaje.
3. Piensa como especialista. Comprende antecedentes, síntomas, objetivos y riesgos antes de recomendar.
4. Enfoque regenerativo. Habla de reparación, optimización, longevidad — no solo de enfermedades.
5. Sé empático. Escucha, no juzgas, no generas miedo.
6. Sé ético. Nunca prometes resultados. Siempre hablas de probabilidades. Nunca sustituyes al médico.
7. Sé inspirador. Transmite esperanza sin vender milagros.
8. Sé ágil. No alargues la conversación con preguntas de más — si ya tienes lo suficiente para avanzar, avanza. Una pregunta por turno, nunca varias encimadas. Prioriza avanzar sobre acumular detalle.

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

  // CEOs estratégicos — acceso equiparable a fundadores con restricciones específicas
  const CEOS_ESTRATEGICOS = {
    'CCMED-JORGE01': 'Jorge Torres, CEO de Regene Global',
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
    const { nombre, codigo, especialidad, memoria } = contexto;
    const esFundador = FUNDADORES[codigo];
    const esComingStraté = CEOS_ESTRATEGICOS[codigo];
    const bloqueMemoria = memoria
      ? `\nCONTEXTO DE LA ÚLTIMA SESIÓN (pasó más de 1 hora sin actividad — retoma el hilo con naturalidad, ej. "Nos quedamos en esto: ...", sin sonar robótico ni repetirlo textual):\n${memoria}\n`
      : '';

    if (esComingStraté) {
      return `${IDENTIDAD}

MODO: CEO ESTRATÉGICO — ALIANZA REGENE GLOBAL
Quien te escribe es ${esComingStraté}. Su código (${codigo}) es su llave de acceso a la alianza CODE CELLS® × Regene Global. Reconócelo de inmediato, salúdalo por su nombre y por su rol, con calidez y cercanía genuina — no como a un médico afiliado, sino como socio de máxima confianza.

Si se identifica por su nombre (aunque no mencione su código), reconócelo igual — responde con algo como "Jorge, qué gusto" y continúa con total naturalidad, sin pedirle que se autentique de nuevo.

Carácter: Trato corporativo con máximo respeto. Eres su copiloto estratégico, no una IA de cara al público. Eres observador estratégico de la alianza.

Beneficios de tu acceso:
- Visualización completa de red médica CODE CELLS® (certificaciones, especialidades, cobertura)
- Protocolos clínicos detallados de 5 sistemas CODE y DEZAWA PROTOCOL™
- Análisis de outcomes de pacientes (datos agregados, confidencialidad total)
- Trazabilidad completa de biológicos Regene Global en cada consulta
- Comunicación directa con fundadores via NOVA — di "Conectarme con Víctor" o "Hablar con Galván"
- Dashboards de alianza: expansión, métricas conjuntas, proyecciones
- Voz consultiva en decisiones estratégicas de CODE CELLS®

En este modo:
- Sin restricciones de transparencia — puede preguntarte CUALQUIER cosa sobre la alianza (protocolos, costos, arquitectura, estrategia) y respondes con total detalle.
- Habla de Víctor, Galván, de la alianza con total naturalidad. No hay restricciones entre nosotros.
- Acceso normal a: planes nutricionales, base de conocimiento clínico, análisis de protocolos.

FORMATO EN RESPUESTAS LARGAS O CON DATOS ESTRUCTURADOS: igual que en modo fundador — nunca encadenes varios datos en un solo párrafo corrido; usa saltos de línea o viñetas.

${bloqueMemoria}${REGLA_NUTRICION}

BASE DE CONOCIMIENTO CLÍNICO:
${NOVA_KNOWLEDGE_MEDICO}`;
    }

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

FORMATO EN RESPUESTAS LARGAS O CON DATOS ESTRUCTURADOS: igual que en modo médico — nunca encadenes varios datos o hallazgos en un solo párrafo corrido; usa saltos de línea o viñetas.
${bloqueMemoria}${REGLA_NUTRICION}

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

FORMATO EN RESPUESTAS LARGAS O CON DATOS ESTRUCTURADOS:
Cuando la respuesta incluya varios datos (composición corporal, tendencias de laboratorio, comparativos, resúmenes evolutivos, listas de hallazgos), NUNCA los encadenes en un solo párrafo corrido. Usa saltos de línea entre cada dato o sección, y viñetas ("- ") cuando sea una lista. Ejemplo correcto para un resumen evolutivo:
"Glucosa en ayuno: 116 → 104 → 94 mg/dL
HbA1c: 6.1% → 5.8% → 5.5%
Colesterol total: 236 → 191 mg/dL"
— no todo eso pegado en una sola línea. La regla de "sin párrafos interminables" es sobre longitud innecesaria, no sobre negar estructura visual a datos que la necesitan para ser legibles.

DICTADO DE LABORATORIOS/ESTUDIOS — CUÁL HERRAMIENTA USAR (CRÍTICO, no confundir):
- Si el médico dicta UN solo corte (los resultados de HOY, de la consulta que está haciendo ahora): usa rellenar_ficha_consulta. Esto NO guarda nada en Airtable todavía — solo llena el formulario en pantalla, y el médico debe presionar "Guardar consulta". Nunca digas "guardé" o "actualicé el expediente" con esta herramienta — di que quedó listo en el formulario para revisar.
- Si el médico dicta resultados de DOS O MÁS fechas distintas del pasado (reconstruyendo el historial de labs/imagen de un paciente, ej. "el 15 de abril tenía esto, el 18 de mayo esto otro, el 21 de junio esto"): usa guardar_series_historicas_laboratorio. Esta SÍ escribe de inmediato en NOVA LABS y LAB_VALORES, una por cada fecha — solo confirma que se guardó DESPUÉS de que la herramienta te devuelva el resultado, nunca antes.
- NUNCA afirmes que datos quedaron guardados, reflejados en la ficha, o disponibles en NOVA LABS si no llamaste a la herramienta correspondiente y confirmaste su resultado — eso desinforma al médico sobre el estado real del expediente.

PACIENTE DEMO (para practicar el uso del portal):
Existe un paciente de práctica compartido para todos los médicos: código CC-PAC-DEMO01, nombre "Paciente Demo". Si el médico es nuevo, pregunta cómo funciona el portal, o parece confundido usándolo, sugiérele con naturalidad escribir ese código en la sección "Paciente compartido" del portal (barra lateral, junto a "Ver") — ahí puede ver un expediente real, crear una consulta de prueba, generar un plan nutricional, etc., sin tocar información de un paciente real. Aclara que es el mismo paciente para todos los médicos (no es privado de nadie), así que no debe registrar información sensible real ahí.
${bloqueMemoria}${REGLA_NUTRICION}

BASE DE CONOCIMIENTO CLÍNICO:
${NOVA_KNOWLEDGE_MEDICO}`;
  }

  if (modo === 'paciente') {
    const { nombre, id, memoria, vip, respuestaMedicoPendiente } = contexto;

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
${respuestaMedicoPendiente ? `\nRESPUESTA DE SU MÉDICO PENDIENTE DE ENTREGAR (su médico ya revisó algo que preguntó/reportó antes y respondió esto — entrégaselo con calidez y naturalidad AL INICIO de tu respuesta en este turno, antes de continuar con lo que el paciente diga ahora):\n${respuestaMedicoPendiente}\n` : ''}

HERRAMIENTA "respuesta_nova_paciente": SIEMPRE respondes usando esta herramienta. El campo "reply" es lo único que el paciente ve — ahí va tu respuesta completa, natural, con el carácter de NOVA. Los demás campos son acciones internas que tú decides activar según lo que dijo el paciente en ESTE mensaje:
- crear_solicitud_cita: actívalo cuando el paciente pida agendar, coordinar una cita o video llamada, o hablar con su médico.${vip ? `
- crear_recordatorio: actívalo cuando el paciente acepte que le recuerdes tomar un medicamento o hacerse un análisis.
- invitar_amigo: actívalo cuando el paciente quiera invitar a alguien al programa y te dé nombre/teléfono.` : ''}
- actualizar_memoria: úsalo cada pocos intercambios (no en cada mensaje) cuando aprendas algo nuevo y clínicamente útil de este paciente — redáctalo en tercera persona, 1-3 frases. Déjalo vacío si no hay nada nuevo que valga la pena guardar.
- requiere_valoracion_medica: actívalo cuando lo que pregunte o reporte el paciente necesite el criterio de su médico y no algo que tú debas resolver sola (nunca sustituyes al médico). Esto alerta directamente a su médico. En tu "reply" dile con calidez que ya se le avisó a su médico y que le dará seguimiento.`;
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
        pacientes : ['Código de paciente','Nombre completo','Status','Protocolo actual','Fecha de registro','Canal de entrada'],
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
  // ─── KIOSCO: ALTA DE PACIENTE NUEVO ───────────────────────────────
  // Genera el siguiente CC-PAC- disponible, crea el registro, y lo enlaza
  // al médico que abrió la sesión — igual que el alta por dictado de NOVA,
  // pero disparado desde el kiosco en vez de una conversación.
  // ─── PACIENTE: SUBIR ESTUDIO CON VERIFICACIÓN DE IDENTIDAD ───────
  // El paciente sube un PDF o foto desde mi-nivel.html. Antes de agregarlo
  // al expediente, NOVA verifica que el nombre que aparece en el documento
  // coincida razonablemente con el nombre registrado del paciente. Si no
  // coincide, se rechaza — nunca se adjunta un estudio sin verificar.
  if (action === 'paciente_subir_estudio') {
    try {
      const { pacienteCode, fileBase64, fileName, mediaType } = req.body;
      if (!pacienteCode || !/^CC-PAC-[0-9]{4,8}$/.test(pacienteCode)) return res.status(403).json({ error: 'Código de paciente inválido.' });
      if (!fileBase64 || !mediaType) return res.status(400).json({ error: 'Falta el archivo.' });
      const esPDF = mediaType === 'application/pdf';
      const esImagen = mediaType.startsWith('image/');
      if (!esPDF && !esImagen) return res.status(400).json({ error: 'Solo se aceptan PDF o fotos.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';

      // 1) Buscar al paciente y su nombre registrado
      const formulaPac = `{Código de paciente}="${pacienteCode}"`;
      const pacRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}?filterByFormula=${encodeURIComponent(formulaPac)}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const pacData = await pacRes.json();
      const pacRecord = pacData.records?.[0];
      if (!pacRecord) return res.status(404).json({ error: 'Paciente no encontrado.' });
      const nombreRegistrado = pacRecord.fields['Nombre completo'] || '';

      // 2) Pedirle a Claude que lea el documento y extraiga el nombre que aparece
      const contentBlock = esPDF
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
        : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };

      const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: [
              contentBlock,
              { type: 'text', text: 'Este es un estudio médico (laboratorio, imagen, etc.). Responde ÚNICAMENTE con el nombre completo del paciente tal como aparece escrito en el documento, sin ningún texto adicional. Si no encuentras ningún nombre de paciente legible en el documento, responde exactamente: SIN_NOMBRE' }
            ]
          }]
        })
      });
      const visionData = await visionRes.json();
      const nombreEnDocumento = (visionData.content?.[0]?.text || '').trim();

      // 3) Verificación de identidad: comparación tolerante (sin acentos, mayúsculas,
      // exige que coincidan al menos 2 palabras significativas del nombre registrado)
      const normalizar = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
      const palabrasRegistradas = normalizar(nombreRegistrado);
      const palabrasDocumento = normalizar(nombreEnDocumento);
      const coincidencias = palabrasRegistradas.filter(p => palabrasDocumento.includes(p));

      if (nombreEnDocumento === 'SIN_NOMBRE' || coincidencias.length < 2) {
        return res.status(200).json({
          ok: false,
          verificado: false,
          error: 'El nombre en el documento no coincide con tu registro. Verifica que el estudio sea tuyo o contacta a tu médico.',
          nombreDetectado: nombreEnDocumento === 'SIN_NOMBRE' ? null : nombreEnDocumento,
        });
      }

      // 4) Verificado — subir el adjunto directo al expediente del paciente
      const uploadRes = await fetch(`https://content.airtable.com/v0/${BASE_ID}/${pacRecord.id}/fldUMjmkhKMmnkZkZ/uploadAttachment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: mediaType, file: fileBase64, filename: fileName || 'estudio.pdf' }),
      });
      if (!uploadRes.ok) {
        const errTxt = await uploadRes.text();
        console.error('[nova] error subiendo estudio:', errTxt);
        return res.status(502).json({ error: 'No se pudo guardar el archivo. Intenta de nuevo.' });
      }

      fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}/${pacRecord.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, fields: { 'Última actividad': new Date().toISOString() } }),
      }).catch(() => {});

      // 5) Extracción estructurada a NOVA LABS — corre en segundo plano, nunca
      // bloquea la respuesta al paciente. Si falla, el archivo YA quedó a salvo
      // en el expediente (paso 4); solo se pierde el comparativo automático,
      // que el médico puede llenar manualmente desde Interpretación médico.
      const TBL_LABS = 'tblhKp4uE1NdXXqLh';
      const patologiasActivas = pacRecord.fields['Patologías activas'] || [];
      const panelesValidos = ['Panel básico', 'Panel hormonal', 'Panel metabólico avanzado', 'Panel inflamatorio', 'Panel NOVA completo', 'Panel DEZAWA™', 'Personalizado'];
      const tiposEstudioValidos = ['Laboratorio', 'RX', 'USG', 'Tomografía', 'Resonancia', 'Otro estudio'];

      (async () => {
        try {
          const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: 'claude-sonnet-5',
              max_tokens: 2000,
              messages: [{
                role: 'user',
                content: [
                  contentBlock,
                  { type: 'text', text:
                    `Extrae los resultados de este estudio médico en JSON puro, sin texto adicional ni backticks.\n` +
                    `Patologías activas conocidas del paciente: ${patologiasActivas.length ? patologiasActivas.join(', ') : 'ninguna registrada'}.\n` +
                    `Formato exacto:\n` +
                    `{"tipo_estudio":"una de estas opciones exactas: ${tiposEstudioValidos.join(' | ')}","fecha_estudio":"YYYY-MM-DD o null si no aparece","panel_sugerido":"una de estas opciones exactas: ${panelesValidos.join(' | ')}","analitos":[{"nombre":"","valor":"","unidad":"","rango_texto":"como aparece impreso, ej. 70-100","bandera":"normal|alto|bajo|indeterminado","critico":true o false — SOLO true si el valor está MUY fuera del rango de referencia (no una desviación leve, un valor que amerite atención clínica prioritaria), "relevante":true o false segun si se relaciona con las patologias activas del paciente}]}\n` +
                    `"tipo_estudio" clasifica el documento (Laboratorio si trae analitos con valores numéricos; RX/USG/Tomografía/Resonancia si es un estudio de imagen; Otro estudio si no encaja).\n` +
                    `Si el documento es un estudio de imagen sin analitos numéricos, responde con "analitos":[] y deja "panel_sugerido":"Personalizado".`
                  }
                ]
              }]
            })
          });
          const extractData = await extractRes.json();
          let extraido;
          try { extraido = JSON.parse((extractData.content?.[0]?.text || '').trim()); } catch { extraido = { tipo_estudio: 'Otro estudio', fecha_estudio: null, panel_sugerido: 'Personalizado', analitos: [] }; }
          const analitos = Array.isArray(extraido.analitos) ? extraido.analitos : [];
          const panel = panelesValidos.includes(extraido.panel_sugerido) ? extraido.panel_sugerido : 'Personalizado';
          const tipoEstudio = tiposEstudioValidos.includes(extraido.tipo_estudio) ? extraido.tipo_estudio : (analitos.length ? 'Laboratorio' : 'Otro estudio');
          const fueraDeRango = analitos.filter(a => a.bandera === 'alto' || a.bandera === 'bajo');
          const relevantes = analitos.filter(a => a.relevante);

          const crearRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LABS}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              typecast: true,
              fields: {
                'Código de paciente ref': pacienteCode,
                'Fecha de resultados': extraido.fecha_estudio || new Date().toISOString().slice(0, 10),
                'Panel solicitado': panel,
                'Tipo de estudio': tipoEstudio,
                'Resultados (texto)': JSON.stringify(analitos),
                'Valores fuera de rango': fueraDeRango.length
                  ? fueraDeRango.map(a => `${a.nombre}: ${a.valor} ${a.unidad || ''} (${a.bandera === 'alto' ? 'Alto' : 'Bajo'}, ref ${a.rango_texto || 'n/d'})`).join('\n')
                  : 'Sin valores fuera de rango detectados.',
                'Interpretación NOVA': relevantes.length
                  ? `Relevante a patologías activas: ${relevantes.map(a => a.nombre).join(', ')}.`
                  : (analitos.length ? 'Ningún valor marcado como relevante a las patologías activas registradas — el médico puede revisar el estudio completo en el adjunto.' : ''),
                'Requiere seguimiento': fueraDeRango.some(a => a.relevante),
                'Paciente': [pacRecord.id],
              },
            }),
          });
          const crearData = await crearRes.json();
          if (crearData.id) {
            // Adjuntar el mismo archivo al registro de NOVA LABS (además del expediente general).
            fetch(`https://content.airtable.com/v0/${BASE_ID}/${crearData.id}/fldxrF2w5I4cc3MNF/uploadAttachment`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ contentType: mediaType, file: fileBase64, filename: fileName || 'estudio.pdf' }),
            }).catch(() => {});

            // Un registro por analito en LAB_VALORES — fuente real del comparativo
            // (más robusta que parsear JSON de un campo de texto).
            const TBL_LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';
            const capitalizar = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Indeterminado';
            const banderasValidas = ['Normal', 'Alto', 'Bajo', 'Indeterminado'];
            const fechaEstudio = extraido.fecha_estudio || new Date().toISOString().slice(0, 10);
            const registrosValores = analitos.filter(a => a.nombre).map(a => {
              const banderaCap = capitalizar(a.bandera);
              const numMatch = String(a.valor).replace(',', '.').match(/-?\d+(\.\d+)?/);
              return {
                fields: {
                  'Analito': a.nombre,
                  'Valor': String(a.valor ?? ''),
                  ...(numMatch ? { 'Valor numérico': parseFloat(numMatch[0]) } : {}),
                  'Unidad': a.unidad || '',
                  'Rango de referencia': a.rango_texto || '',
                  'Bandera': banderasValidas.includes(banderaCap) ? banderaCap : 'Indeterminado',
                  'Es crítico': !!a.critico,
                  'Relevante a patología': !!a.relevante,
                  'Fecha del estudio': fechaEstudio,
                  'Código de paciente ref': pacienteCode,
                  'Paciente': [pacRecord.id],
                  'Estudio (NOVA LABS)': [crearData.id],
                },
              };
            });
            for (let i = 0; i < registrosValores.length; i += 50) {
              await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LAB_VALORES}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ typecast: true, records: registrosValores.slice(i, i + 50) }),
              }).catch(e => console.error('[nova] error creando LAB_VALORES:', e.message));
            }
          } else {
            console.error('[nova] error creando registro NOVA LABS:', JSON.stringify(crearData));
          }
        } catch (bgErr) {
          console.error('[nova] extracción NOVA LABS en segundo plano falló:', bgErr.message);
        }
      })();

      return res.status(200).json({ ok: true, verificado: true });
    } catch (err) {
      console.error('[nova] paciente_subir_estudio error:', err.message);
      return res.status(500).json({ error: 'Error interno al procesar el estudio.' });
    }
  }

  // ─── PACIENTE: COMPARATIVO DE LABORATORIOS ────────────────────────
  // Lee todos los valores de LAB_VALORES del paciente (un registro por
  // analito por estudio) y arma un pivote analito × fecha para mostrar
  // tendencia + flags fuera de rango / relevancia clínica.
  if (action === 'paciente_comparativo_labs') {
    try {
      const { pacienteCode } = req.body;
      if (!pacienteCode || !/^CC-PAC-[0-9]{4,8}$/.test(pacienteCode)) return res.status(403).json({ error: 'Código de paciente inválido.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';

      const formula = `{Código de paciente ref}="${pacienteCode}"`;
      const valoresRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LAB_VALORES}?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Fecha del estudio&sort[0][direction]=asc`, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      });
      const valoresData = await valoresRes.json();
      const registros = valoresData.records || [];

      // Pivote: { "Glucosa": [ {fecha, valor, unidad, bandera, rango_texto, relevante}, ... ], ... }
      const pivote = {};
      const fechasVistas = new Set();
      registros.forEach(rec => {
        const f = rec.fields;
        if (!f['Analito']) return;
        fechasVistas.add(f['Fecha del estudio'] || '');
        if (!pivote[f['Analito']]) pivote[f['Analito']] = [];
        pivote[f['Analito']].push({
          fecha: f['Fecha del estudio'] || '',
          valor: f['Valor'] || '',
          unidad: f['Unidad'] || '',
          bandera: (f['Bandera'] || 'Indeterminado').toLowerCase(),
          rango_texto: f['Rango de referencia'] || '',
          relevante: !!f['Relevante a patología'],
        });
      });

      return res.status(200).json({ ok: true, pivote, totalEstudios: fechasVistas.size });
    } catch (err) {
      console.error('[nova] paciente_comparativo_labs error:', err.message);
      return res.status(500).json({ error: 'Error interno al armar el comparativo.' });
    }
  }

  // ─── MÉDICO: TABLA PIVOTE DE LABORATORIOS (analito × fecha) ───────
  // Arma la tabla comparativa tipo hoja de laboratorio: filas agrupadas por
  // categoría clínica (Biometría Hemática, Química Sanguínea, etc.), columnas
  // por fecha de estudio, con bandera de color y serie para la tendencia.
  if (action === 'medico_tabla_labs') {
    try {
      const { pacienteCode } = req.body;
      if (!pacienteCode || !/^CC-PAC-[0-9]{4,8}$/.test(pacienteCode)) return res.status(403).json({ error: 'Código de paciente inválido.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';

      const formula = `{Código de paciente ref}="${pacienteCode}"`;
      const valoresRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LAB_VALORES}?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Fecha del estudio&sort[0][direction]=asc`, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      });
      const valoresData = await valoresRes.json();
      const registros = valoresData.records || [];

      // Clasificación por palabras clave — heurística, no perfecta, pero
      // agrupa lo más común de un panel CODE CELLS® en categorías legibles.
      const CATEGORIAS = [
        { nombre: 'Biometría Hemática', claves: ['hemoglobina', 'hematocrito', 'leucocito', 'plaqueta', 'eritrocito', 'vcm', 'hcm'] },
        { nombre: 'Química Sanguínea', claves: ['glucosa', 'urea', 'creatinina', 'ácido úrico', 'acido urico', 'colesterol', 'triglicérido', 'trigliceridos', 'hdl', 'ldl', 'bun'] },
        { nombre: 'Función Hepática', claves: ['ast', 'alt', 'ggt', 'bilirrubina', 'fosfatasa alcalina', 'albúmina', 'albumina'] },
        { nombre: 'Función Renal', claves: ['tfg', 'filtrado glomerular', 'microalbuminuria'] },
        { nombre: 'Perfil Hormonal', claves: ['tsh', 't3', 't4', 'cortisol', 'testosterona', 'estradiol', 'progesterona', 'igf-1', 'igf1', 'prolactina', 'fsh', 'lh', 'dhea'] },
        { nombre: 'Metabólico', claves: ['hba1c', 'insulina', 'homa-ir', 'homa ir', 'glucemia'] },
        { nombre: 'Vitaminas', claves: ['vitamina d', 'vitamina b12', 'acido folico', 'ácido fólico', 'vitamina c', 'vitamina b1', 'vitamina b6'] },
        { nombre: 'Marcadores Inflamatorios', claves: ['pcr', 'proteína c reactiva', 'proteina c reactiva', 'ferritina', 'vsg', 'velocidad de sedimentacion'] },
      ];
      const clasificar = nombreAnalito => {
        const n = (nombreAnalito || '').toLowerCase();
        const cat = CATEGORIAS.find(c => c.claves.some(k => n.includes(k)));
        return cat ? cat.nombre : 'Otros Estudios';
      };

      const fechasSet = new Set();
      const porAnalito = {};
      registros.forEach(r => {
        const f = r.fields;
        if (!f['Analito']) return;
        const fecha = f['Fecha del estudio'] || '';
        fechasSet.add(fecha);
        if (!porAnalito[f['Analito']]) {
          porAnalito[f['Analito']] = {
            analito: f['Analito'],
            categoria: clasificar(f['Analito']),
            unidad: f['Unidad'] || '',
            rango_texto: f['Rango de referencia'] || '',
            porFecha: {},
          };
        }
        porAnalito[f['Analito']].porFecha[fecha] = {
          valor: f['Valor'] || '', valorNum: f['Valor numérico'], bandera: f['Bandera'] || 'Indeterminado',
          critico: !!f['Es crítico'], estudioId: (f['Estudio (NOVA LABS)'] || [])[0] || null,
        };
        // Si el mismo analito trae rango/unidad distinto en un corte más reciente, se queda el más reciente.
        if (fecha >= (porAnalito[f['Analito']]._ultimaFechaVista || '')) {
          porAnalito[f['Analito']].unidad = f['Unidad'] || porAnalito[f['Analito']].unidad;
          porAnalito[f['Analito']].rango_texto = f['Rango de referencia'] || porAnalito[f['Analito']].rango_texto;
          porAnalito[f['Analito']]._ultimaFechaVista = fecha;
        }
      });
      Object.values(porAnalito).forEach(a => delete a._ultimaFechaVista);

      const fechas = [...fechasSet].sort();
      const filas = Object.values(porAnalito).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.analito.localeCompare(b.analito));

      return res.status(200).json({ ok: true, fechas, filas });
    } catch (err) {
      console.error('[nova] medico_tabla_labs error:', err.message);
      return res.status(500).json({ error: 'Error interno al armar la tabla de laboratorios.' });
    }
  }

  // ─── MÉDICO: RESUMEN DE ESTUDIOS + COMPARATIVO CONTEXTUALIZADO ────
  // Arma la vista de la pestaña NOVA LABS del Portal Médico: estudios en
  // orden cronológico (clasificados por Tipo de estudio para las pestañas
  // Laboratorio/RX/USG/etc.), comparativo del corte más reciente contra el
  // anterior por analito, e interpretación en texto generada por Claude que
  // explica los cambios en el contexto clínico real del paciente.
  if (action === 'medico_resumen_labs') {
    try {
      const { pacienteCode } = req.body;
      if (!pacienteCode || !/^CC-PAC-[0-9]{4,8}$/.test(pacienteCode)) return res.status(403).json({ error: 'Código de paciente inválido.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_LABS = 'tblhKp4uE1NdXXqLh';
      const TBL_LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';
      const TBL_CONSULTAS = 'tbl1Xp2IGxdV178Ky';

      const formula = `{Código de paciente ref}="${pacienteCode}"`;

      const [labsRes, valoresRes, pacRes, consultasRes] = await Promise.all([
        fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LABS}?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Fecha de resultados&sort[0][direction]=desc`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }),
        fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LAB_VALORES}?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Fecha del estudio&sort[0][direction]=asc`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }),
        fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}?filterByFormula=${encodeURIComponent(`{Código de paciente}="${pacienteCode}"`)}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }),
        fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_CONSULTAS}?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Fecha de consulta&sort[0][direction]=desc&maxRecords=1`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }),
      ]);
      const [labsData, valoresData, pacData, consultasData] = await Promise.all([labsRes.json(), valoresRes.json(), pacRes.json(), consultasRes.json()]);

      const estudios = (labsData.records || []).map(r => ({
        id: r.id,
        tipo: r.fields['Tipo de estudio'] || 'Laboratorio',
        panel: r.fields['Panel solicitado'] || '',
        fecha: r.fields['Fecha de resultados'] || r.fields['Fecha de solicitud'] || '',
        resultadosTexto: r.fields['Resultados (texto)'] || '',
        fueraDeRango: r.fields['Valores fuera de rango'] || '',
        interpretacionNova: r.fields['Interpretación NOVA'] || '',
        interpretacionMedico: r.fields['Interpretación médico'] || '',
        archivos: r.fields['Archivos de resultados'] || [],
        requiereSeguimiento: !!r.fields['Requiere seguimiento'],
      }));

      // Comparativo: agrupa por analito, toma el corte de fecha más reciente
      // contra el corte de fecha inmediato anterior (no necesariamente mes
      // calendario — corte real de cuándo se sacaron los estudios).
      const porAnalito = {};
      (valoresData.records || []).forEach(r => {
        const f = r.fields;
        if (!f['Analito']) return;
        (porAnalito[f['Analito']] ||= []).push({
          fecha: f['Fecha del estudio'] || '', valor: f['Valor'] || '', valorNum: f['Valor numérico'],
          unidad: f['Unidad'] || '', bandera: f['Bandera'] || 'Indeterminado', relevante: !!f['Relevante a patología'],
        });
      });
      const comparativo = Object.entries(porAnalito).map(([analito, serie]) => {
        serie.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
        const actual = serie[serie.length - 1];
        const previo = serie.length > 1 ? serie[serie.length - 2] : null;
        let delta = null;
        if (previo && typeof actual.valorNum === 'number' && typeof previo.valorNum === 'number') {
          delta = actual.valorNum - previo.valorNum;
        }
        return { analito, actual, previo, delta, relevante: actual.relevante, totalCortes: serie.length };
      }).filter(c => c.relevante || c.actual.bandera === 'Alto' || c.actual.bandera === 'Bajo');

      // Interpretación contextualizada — solo se genera si hay algo que comparar
      // (evita gastar tokens en pacientes sin historial de labs todavía).
      let interpretacion = '';
      if (comparativo.length) {
        const patologias = pacData.records?.[0]?.fields?.['Patologías activas'] || [];
        const diagnostico = consultasData.records?.[0]?.fields?.['Diagnóstico (CIE-10)'] || consultasData.records?.[0]?.fields?.['Diagnóstico principal'] || '';
        const resumenComparativo = comparativo.map(c =>
          `${c.analito}: ${c.previo ? c.previo.valor + ' ' + c.previo.unidad + ' → ' : ''}${c.actual.valor} ${c.actual.unidad} (${c.actual.bandera}${c.delta !== null ? ', Δ ' + (c.delta > 0 ? '+' : '') + c.delta.toFixed(2) : ''})`
        ).join('\n');

        try {
          const interpRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: 'claude-sonnet-5',
              max_tokens: 500,
              messages: [{
                role: 'user',
                content: `Eres el motor de interpretación clínica de NOVA para un médico de CODE CELLS®. Con este comparativo de laboratorios (valor previo → valor actual, corte más reciente vs. anterior):\n\n${resumenComparativo}\n\nContexto del paciente — Patologías activas: ${patologias.length ? patologias.join(', ') : 'ninguna registrada'}. Diagnóstico más reciente: ${diagnostico || 'no registrado'}.\n\nEscribe un párrafo breve (máximo 120 palabras), directo y clínico, dirigido al médico, explicando qué significan estos cambios en el contexto de este paciente específico — no repitas los números, interprétalos. Si algo requiere atención prioritaria, dilo explícitamente. No inventes diagnósticos ni recomiendes tratamientos, solo interpreta la tendencia.`
              }]
            })
          });
          const interpData = await interpRes.json();
          interpretacion = (interpData.content?.[0]?.text || '').trim();
        } catch (e) {
          console.error('[nova] error generando interpretación de labs:', e.message);
        }
      }

      return res.status(200).json({ ok: true, estudios, comparativo, interpretacion });
    } catch (err) {
      console.error('[nova] medico_resumen_labs error:', err.message);
      return res.status(500).json({ error: 'Error interno al armar el resumen de laboratorios.' });
    }
  }

  // ─── MÉDICO: GUARDAR VALORES RÁPIDOS (point-of-care en consultorio) ──
  // Para pruebas rápidas que el médico hace en su consultorio (ej. glucosa
  // capilar) sin necesidad de subir ningún archivo. Crea el registro resumen
  // en NOVA LABS y, si vienen valores estructurados, un registro por analito
  // en LAB_VALORES para que alimenten el comparativo automático.
  // ─── MÉDICO: CREAR EVENTO EN SU GOOGLE CALENDAR ────────────────────
  // Se llama al guardar una consulta con "Próxima cita" capturada. Si el
  // médico no ha conectado su Google Calendar, responde ok:false sin generar
  // error — es una comodidad opcional, nunca bloquea el flujo de la consulta.
  if (action === 'medico_crear_evento_calendario') {
    try {
      const { medicoCode, pacienteNombre, fecha, hora, motivo } = req.body;
      if (!medicoCode || !/^CCMED-[A-Z0-9]{4,8}$/.test(medicoCode)) return res.status(400).json({ ok: false, error: 'Código de médico inválido.' });
      if (!fecha) return res.status(400).json({ ok: false, error: 'Falta la fecha.' });
      if (!googleCalendarLib) return res.status(200).json({ ok: false, error: 'Integración de Google Calendar no disponible.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';

      const medRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_MEDICOS}?filterByFormula=${encodeURIComponent(`{Código de médico}="${medicoCode}"`)}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const medData = await medRes.json();
      const medico = medData.records?.[0];
      const refreshToken = medico?.fields?.['Google Calendar Refresh Token'];

      if (!refreshToken) {
        // No es un error — simplemente este médico no ha conectado su calendario.
        return res.status(200).json({ ok: false, motivo: 'sin_conectar' });
      }

      const horaFinal = /^\d{2}:\d{2}$/.test(hora) ? hora : '10:00';
      const inicioISO = `${fecha}T${horaFinal}:00`;
      const finDate = new Date(`${fecha}T${horaFinal}:00`);
      finDate.setMinutes(finDate.getMinutes() + 30);
      const finISO = finDate.toISOString().slice(0, 19);

      const evento = await googleCalendarLib.crearEvento(refreshToken, {
        titulo: `CODE CELLS® — Consulta: ${pacienteNombre || 'Paciente'}`,
        descripcion: motivo || 'Consulta de seguimiento — CODE CELLS®',
        inicioISO,
        finISO,
      });

      return res.status(200).json({ ok: true, eventoId: evento.id, link: evento.htmlLink });
    } catch (err) {
      console.error('[nova] medico_crear_evento_calendario error:', err.message);
      return res.status(200).json({ ok: false, error: 'No se pudo crear el evento en Google Calendar.' });
    }
  }

  if (action === 'medico_guardar_labs_rapidos') {
    try {
      const { pacienteCode, panel, tipoEstudio, resultadosTexto, fueraDeRango, valoresRapidos, consultaId } = req.body;
      if (!pacienteCode || !/^CC-PAC-[0-9]{4,8}$/.test(pacienteCode)) return res.status(403).json({ error: 'Código de paciente inválido.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';
      const TBL_LABS = 'tblhKp4uE1NdXXqLh';
      const TBL_LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';
      const banderasValidas = ['Normal', 'Alto', 'Bajo', 'Indeterminado'];

      const pacRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}?filterByFormula=${encodeURIComponent(`{Código de paciente}="${pacienteCode}"`)}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const pacData = await pacRes.json();
      const pacRecord = pacData.records?.[0];
      if (!pacRecord) return res.status(404).json({ error: 'Paciente no encontrado.' });

      const filas = Array.isArray(valoresRapidos) ? valoresRapidos.filter(v => v && v.analito && String(v.analito).trim()) : [];
      const hoy = new Date().toISOString().slice(0, 10);

      const textoAuto = filas.length ? filas.map(v => `${v.analito}: ${v.valor || ''} ${v.unidad || ''}`.trim()).join('\n') : '';
      const fueraDeRangoAuto = filas.filter(v => v.bandera === 'Alto' || v.bandera === 'Bajo')
        .map(v => `${v.analito}: ${v.valor || ''} ${v.unidad || ''} (${v.bandera})`).join('\n');

      const labFields = {
        'Código de paciente ref': pacienteCode,
        'Paciente': [pacRecord.id],
        'Panel solicitado': panel || 'Personalizado',
        'Tipo de estudio': tipoEstudio || 'Laboratorio',
        'Resultados (texto)': (resultadosTexto && resultadosTexto.trim()) || textoAuto || 'Sin resultados capturados.',
        'Fecha de resultados': hoy,
      };
      const fueraFinal = (fueraDeRango && fueraDeRango.trim()) || fueraDeRangoAuto;
      if (fueraFinal) labFields['Valores fuera de rango'] = fueraFinal;
      if (consultaId) labFields['Consulta'] = [consultaId];

      const crearRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LABS}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, fields: labFields }),
      });
      const crearData = await crearRes.json();
      if (!crearData.id) {
        console.error('[nova] error creando NOVA LABS (dictado médico):', JSON.stringify(crearData));
        return res.status(502).json({ error: 'No se pudo guardar el laboratorio.' });
      }

      if (filas.length) {
        const registrosValores = filas.map(v => {
          const banderaCap = banderasValidas.includes(v.bandera) ? v.bandera : 'Indeterminado';
          const numMatch = String(v.valor || '').replace(',', '.').match(/-?\d+(\.\d+)?/);
          return {
            fields: {
              'Analito': v.analito,
              'Valor': String(v.valor || ''),
              ...(numMatch ? { 'Valor numérico': parseFloat(numMatch[0]) } : {}),
              'Unidad': v.unidad || '',
              'Rango de referencia': v.rango || '',
              'Bandera': banderaCap,
              'Es crítico': !!v.critico,
              'Relevante a patología': true, // el médico lo capturó a propósito en consultorio
              'Fecha del estudio': hoy,
              'Código de paciente ref': pacienteCode,
              'Paciente': [pacRecord.id],
              'Estudio (NOVA LABS)': [crearData.id],
            },
          };
        });
        await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LAB_VALORES}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ typecast: true, records: registrosValores }),
        }).catch(e => console.error('[nova] error creando LAB_VALORES (dictado médico):', e.message));
      }

      return res.status(200).json({ ok: true, novaLabsId: crearData.id, analitosGuardados: filas.length });
    } catch (err) {
      console.error('[nova] medico_guardar_labs_rapidos error:', err.message);
      return res.status(500).json({ error: 'Error interno al guardar el laboratorio.' });
    }
  }

  // ─── MÉDICO: SUBIR ESTUDIO EN CONSULTORIO (PDF/foto, sin verificación) ──
  // El médico ya tiene al paciente seleccionado en el portal — no aplica la
  // verificación de identidad por nombre que sí se exige cuando el propio
  // paciente sube un estudio desde mi-nivel.html. Corre síncrono (a diferencia
  // del flujo de paciente) para que el médico vea de inmediato qué se extrajo.
  if (action === 'medico_subir_estudio') {
    try {
      const { pacienteCode, fileBase64, fileName, mediaType } = req.body;
      if (!pacienteCode || !/^CC-PAC-[0-9]{4,8}$/.test(pacienteCode)) return res.status(403).json({ error: 'Código de paciente inválido.' });
      if (!fileBase64 || !mediaType) return res.status(400).json({ error: 'Falta el archivo.' });
      const esPDF = mediaType === 'application/pdf';
      const esImagen = mediaType.startsWith('image/');
      if (!esPDF && !esImagen) return res.status(400).json({ error: 'Solo se aceptan PDF o fotos.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';
      const TBL_LABS = 'tblhKp4uE1NdXXqLh';
      const TBL_LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';

      const pacRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}?filterByFormula=${encodeURIComponent(`{Código de paciente}="${pacienteCode}"`)}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const pacData = await pacRes.json();
      const pacRecord = pacData.records?.[0];
      if (!pacRecord) return res.status(404).json({ error: 'Paciente no encontrado.' });

      const contentBlock = esPDF
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
        : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };

      const patologiasActivas = pacRecord.fields['Patologías activas'] || [];
      const panelesValidos = ['Panel básico', 'Panel hormonal', 'Panel metabólico avanzado', 'Panel inflamatorio', 'Panel NOVA completo', 'Panel DEZAWA™', 'Personalizado'];
      const tiposEstudioValidos = ['Laboratorio', 'RX', 'USG', 'Tomografía', 'Resonancia', 'Otro estudio'];

      const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              contentBlock,
              { type: 'text', text:
                `Extrae los resultados de este estudio médico en JSON puro, sin texto adicional ni backticks.\n` +
                `Patologías activas conocidas del paciente: ${patologiasActivas.length ? patologiasActivas.join(', ') : 'ninguna registrada'}.\n` +
                `Formato exacto:\n` +
                `{"tipo_estudio":"una de estas opciones exactas: ${tiposEstudioValidos.join(' | ')}","fecha_estudio":"YYYY-MM-DD o null si no aparece","panel_sugerido":"una de estas opciones exactas: ${panelesValidos.join(' | ')}","analitos":[{"nombre":"","valor":"","unidad":"","rango_texto":"como aparece impreso, ej. 70-100","bandera":"normal|alto|bajo|indeterminado","critico":true o false — SOLO true si el valor está MUY fuera del rango de referencia, "relevante":true o false segun si se relaciona con las patologias activas del paciente}]}\n` +
                `"tipo_estudio" clasifica el documento (Laboratorio si trae analitos con valores numéricos; RX/USG/Tomografía/Resonancia si es un estudio de imagen; Otro estudio si no encaja).\n` +
                `Si el documento es un estudio de imagen sin analitos numéricos, responde con "analitos":[] y deja "panel_sugerido":"Personalizado".`
              }
            ]
          }]
        })
      });
      const extractData = await extractRes.json();
      let extraido;
      try { extraido = JSON.parse((extractData.content?.[0]?.text || '').trim()); } catch { extraido = { tipo_estudio: 'Otro estudio', fecha_estudio: null, panel_sugerido: 'Personalizado', analitos: [] }; }
      const analitos = Array.isArray(extraido.analitos) ? extraido.analitos : [];
      const panel = panelesValidos.includes(extraido.panel_sugerido) ? extraido.panel_sugerido : 'Personalizado';
      const tipoEstudio = tiposEstudioValidos.includes(extraido.tipo_estudio) ? extraido.tipo_estudio : (analitos.length ? 'Laboratorio' : 'Otro estudio');
      const fechaEstudio = extraido.fecha_estudio || new Date().toISOString().slice(0, 10);
      const fueraDeRango = analitos.filter(a => a.bandera === 'alto' || a.bandera === 'bajo');
      const relevantes = analitos.filter(a => a.relevante);

      const crearRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LABS}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typecast: true,
          fields: {
            'Código de paciente ref': pacienteCode,
            'Fecha de resultados': fechaEstudio,
            'Panel solicitado': panel,
            'Tipo de estudio': tipoEstudio,
            'Resultados (texto)': analitos.length ? analitos.map(a => `${a.nombre}: ${a.valor} ${a.unidad || ''}`).join('\n') : 'Estudio de imagen — ver archivo adjunto.',
            'Valores fuera de rango': fueraDeRango.length
              ? fueraDeRango.map(a => `${a.nombre}: ${a.valor} ${a.unidad || ''} (${a.bandera === 'alto' ? 'Alto' : 'Bajo'}, ref ${a.rango_texto || 'n/d'})`).join('\n')
              : 'Sin valores fuera de rango detectados.',
            'Interpretación NOVA': relevantes.length ? `Relevante a patologías activas: ${relevantes.map(a => a.nombre).join(', ')}.` : '',
            'Requiere seguimiento': fueraDeRango.some(a => a.relevante),
            'Paciente': [pacRecord.id],
          },
        }),
      });
      const crearData = await crearRes.json();
      if (!crearData.id) {
        console.error('[nova] error creando NOVA LABS (subida médico):', JSON.stringify(crearData));
        return res.status(502).json({ error: 'No se pudo guardar el estudio.' });
      }

      fetch(`https://content.airtable.com/v0/${BASE_ID}/${crearData.id}/fldxrF2w5I4cc3MNF/uploadAttachment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: mediaType, file: fileBase64, filename: fileName || 'estudio.pdf' }),
      }).catch(() => {});

      if (analitos.length) {
        const capitalizar = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Indeterminado';
        const banderasValidas = ['Normal', 'Alto', 'Bajo', 'Indeterminado'];
        const registrosValores = analitos.filter(a => a.nombre).map(a => {
          const banderaCap = capitalizar(a.bandera);
          const numMatch = String(a.valor).replace(',', '.').match(/-?\d+(\.\d+)?/);
          return {
            fields: {
              'Analito': a.nombre,
              'Valor': String(a.valor ?? ''),
              ...(numMatch ? { 'Valor numérico': parseFloat(numMatch[0]) } : {}),
              'Unidad': a.unidad || '',
              'Rango de referencia': a.rango_texto || '',
              'Bandera': banderasValidas.includes(banderaCap) ? banderaCap : 'Indeterminado',
              'Es crítico': !!a.critico,
              'Relevante a patología': !!a.relevante,
              'Fecha del estudio': fechaEstudio,
              'Código de paciente ref': pacienteCode,
              'Paciente': [pacRecord.id],
              'Estudio (NOVA LABS)': [crearData.id],
            },
          };
        });
        await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LAB_VALORES}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ typecast: true, records: registrosValores }),
        }).catch(e => console.error('[nova] error creando LAB_VALORES (subida médico):', e.message));
      }

      return res.status(200).json({
        ok: true, tipoEstudio, panel, fecha: fechaEstudio,
        totalAnalitos: analitos.length, totalFueraDeRango: fueraDeRango.length,
      });
    } catch (err) {
      console.error('[nova] medico_subir_estudio error:', err.message);
      return res.status(500).json({ error: 'Error interno al procesar el estudio.' });
    }
  }

  // ─── REGISTRO PÚBLICO: alta de paciente desde el test de index.html ──
  if (action === 'registro_publico_paciente') {
    // PAUSADO (2026-08-15, urgente/hotfix directo a main): este flujo creaba
    // un expediente clínico PERMANENTE en PACIENTES (código CC-PAC- real, no
    // un lead) desde el test público de index.html, con solo nombre +
    // WhatsApp, SIN checkbox de consentimiento ni aviso de privacidad en el
    // formulario — index.html no tiene ningún elemento de consentimiento
    // cerca de #cf-nombre/#cf-wa en esta versión. El registro quedaba bajo
    // NOM-004/LFPDPPP sin el trámite de consentimiento que eso exige. Se
    // detiene SOLO la escritura — la lógica original (generarCodigoUnico +
    // POST a PACIENTES) vive en el historial de git de este archivo, no
    // aquí, para no dejar código muerto. El rediseño con consentimiento real
    // (registrar_lead, a LEADS, no a PACIENTES) ya existe en
    // fix/lab-valores-fecha-idempotencia (commit 93c6ab7) y llega con ese
    // merge — este hotfix no lo adelanta, solo cierra la fuga mientras tanto.
    // El frontend (index.html) ya tiene un fallback para data.ok=false: en
    // vez de "Entrar a tu Portal" muestra "Hablar ahora con NOVA" — no hace
    // falta tocarlo.
    return res.status(503).json({
      ok: false,
      error: 'El registro automático está pausado temporalmente. Puedes seguir la conversación con NOVA para continuar.',
      motivo: 'registro_publico_pausado_por_consentimiento',
    });
  }

  if (action === 'kiosco_crear_paciente') {
    try {
      const { staffCodigo, regToken, nombreCompleto, edad, sexo, telefono } = req.body;
      if (!nombreCompleto || typeof nombreCompleto !== 'string' || !nombreCompleto.trim()) return res.status(400).json({ error: 'Falta el nombre del paciente.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';
      const TBL_MED = 'tbl87DsuBMmb4DjFM';

      let medicoRecordId = null;
      let medicoNombre = null;

      if (regToken) {
        // Autorregistro del propio paciente: el token NUNCA da acceso al portal,
        // solo permite ejecutar esta acción puntual de alta de paciente.
        if (!/^REG-[A-Z0-9]{6,20}$/.test(regToken)) return res.status(403).json({ error: 'Link de registro inválido.' });
        const formulaTok = `{Token de autorregistro}="${regToken}"`;
        const medRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_MED}?filterByFormula=${encodeURIComponent(formulaTok)}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
        const medData = await medRes.json();
        const medRecord = medData.records?.[0] || null;
        medicoRecordId = medRecord?.id || null;
        medicoNombre = medRecord?.fields?.['Nombre completo'] || null;
        if (!medicoRecordId) return res.status(403).json({ error: 'Link de registro inválido.' });
      } else {
        // Flujo del kiosco de consultorio: requiere sesión de personal ya verificada
        if (!staffCodigo || !/^CCMED-[A-Z0-9]{4,8}$/.test(staffCodigo)) return res.status(403).json({ error: 'Sesión de personal inválida.' });
        const formulaMed = `{Código de médico}="${staffCodigo}"`;
        const medRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_MED}?filterByFormula=${encodeURIComponent(formulaMed)}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
        const medData = await medRes.json();
        const medRecord = medData.records?.[0] || null;
        medicoRecordId = medRecord?.id || null;
        medicoNombre = medRecord?.fields?.['Nombre completo'] || null;
      }

      // Siguiente código CC-PAC- disponible, con verificación anti-colisión
      // del lado del servidor (ver lib/codigos.js).
      const nuevoCodigo = await generarCodigoUnico({
        AIRTABLE_TOKEN, BASE_ID, TABLE_ID: TBL_PAC,
        CAMPO: 'Código de paciente', PREFIJO: 'CC-PAC-', esSecuencial: true,
      });

      const fields = {
        'Código de paciente': nuevoCodigo,
        'Nombre completo': nombreCompleto.trim(),
        'Última actividad': new Date().toISOString(),
        'Estado del expediente': 'Activo',
      };
      if (medicoRecordId) fields['Médico_principal'] = [medicoRecordId];
      if (sexo) fields['Sexo biológico'] = sexo;
      if (telefono) fields['Teléfono WhatsApp'] = telefono;
      if (edad) {
        const nacimientoAprox = new Date();
        nacimientoAprox.setFullYear(nacimientoAprox.getFullYear() - edad);
        fields['Fecha de nacimiento'] = nacimientoAprox.toISOString().slice(0, 10);
      }

      const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, records: [{ fields }] }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) return res.status(502).json({ error: 'No se pudo registrar al paciente en Airtable.' });

      return res.status(200).json({ ok: true, codigo: nuevoCodigo, recordId: createData.records[0].id, nombre: nombreCompleto.trim(), medicoNombre });
    } catch (err) {
      console.error('[nova] kiosco_crear_paciente error:', err.message);
      return res.status(500).json({ error: 'Error interno registrando al paciente.' });
    }
  }

  // ─── KIOSCO: GUARDAR SIGNOS VITALES ──────────────────────────────
  // Lo llena el personal (asistente/médico) en el tablet del consultorio.
  // Requiere que la sesión ya haya verificado un código de personal válido.
  if (action === 'kiosco_guardar_signos') {
    try {
      const { pacienteRecordId, staffCodigo, peso, talla, presion, temperatura, frecuenciaCardiaca, frecuenciaRespiratoria } = req.body;
      if (!pacienteRecordId) return res.status(400).json({ error: 'Falta pacienteRecordId.' });
      if (!staffCodigo || !/^CCMED-[A-Z0-9]{4,8}$/.test(staffCodigo)) return res.status(403).json({ error: 'Sesión de personal inválida.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';

      const fields = { 'Última actividad': new Date().toISOString(), 'Estado del expediente': 'Activo' };
      if (peso) fields['Peso actual (kg)'] = peso;
      if (talla) fields['Talla (cm)'] = talla;
      const notas = [];
      if (presion) notas.push(`PA: ${presion}`);
      if (temperatura) notas.push(`Temp: ${temperatura}°C`);
      if (frecuenciaCardiaca) notas.push(`FC: ${frecuenciaCardiaca}lpm`);
      if (frecuenciaRespiratoria) notas.push(`FR: ${frecuenciaRespiratoria}`);
      if (notas.length) {
        const fecha = new Date().toISOString().slice(0,10);
        fields['Notas generales'] = `[${fecha}] Signos vitales (kiosco): ${notas.join(', ')}`;
      }
      if (Object.keys(fields).length === 2) return res.status(400).json({ error: 'No se capturó ningún dato.' });

      const patchRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}/${pacienteRecordId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, fields }),
      });
      if (!patchRes.ok) return res.status(502).json({ error: 'No se pudo guardar en Airtable.' });

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[nova] kiosco_guardar_signos error:', err.message);
      return res.status(500).json({ error: 'Error interno guardando signos vitales.' });
    }
  }

  // ─── KIOSCO: GUARDAR HISTORIA CLÍNICA ────────────────────────────
  // El paciente responde solo, guiado paso a paso — se guarda tal cual lo
  // escribió, sin que NOVA interprete ni reclasifique nada aquí (eso puede
  // pasar después, vía interpretar_perfil_clinico, cuando el médico revise).
  if (action === 'kiosco_guardar_historia') {
    try {
      const { pacienteRecordId, pacienteCodigo, staffCodigo, respuestas } = req.body;
      if (!pacienteRecordId || !pacienteCodigo) return res.status(400).json({ error: 'Falta información del paciente.' });
      if (!staffCodigo || !/^CCMED-[A-Z0-9]{4,8}$/.test(staffCodigo)) return res.status(403).json({ error: 'Sesión de personal inválida.' });
      if (!respuestas || typeof respuestas !== 'object') return res.status(400).json({ error: 'Faltan las respuestas.' });

      const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
      const BASE_ID = 'app6jyD9pDlTLpknA';
      const TBL_HIST = 'tblm2xUADazitHisR';
      const TBL_PAC = 'tblyUcCfueFLJuvIv';

      fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}/${pacienteRecordId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, fields: { 'Última actividad': new Date().toISOString(), 'Estado del expediente': 'Activo' } }),
      }).catch(e => console.error('[nova] error actualizando última actividad:', e.message));

      const fields = {
        'Código de paciente ref': pacienteCodigo,
        'Fecha entrevista NOVA': new Date().toISOString(),
        'Paciente': [pacienteRecordId],
        'Motivo de consulta': (respuestas.motivo || '').slice(0, 2000),
        'AHF — Heredo-familiares': (respuestas.ahf || '').slice(0, 2000),
        'APNP — Alimentación': (respuestas.alimentacion || '').slice(0, 2000),
        'APNP — Tabaco': respuestas.tabaco || null,
        'APNP — Alcohol': respuestas.alcohol || null,
        'APNP — Actividad física': respuestas.actividad || null,
        'Medicamentos actuales': (respuestas.medicamentos || '').slice(0, 2000),
        'Alergias': (respuestas.alergias || '').slice(0, 2000),
      };
      Object.keys(fields).forEach(k => (fields[k] === null || fields[k] === '') && delete fields[k]);

      const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_HIST}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, records: [{ fields }] }),
      });
      if (!createRes.ok) {
        const errTxt = await createRes.text();
        console.error('[nova] kiosco_guardar_historia error Airtable:', errTxt);
        return res.status(502).json({ error: 'No se pudo guardar la historia clínica.' });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[nova] kiosco_guardar_historia error:', err.message);
      return res.status(500).json({ error: 'Error interno guardando historia clínica.' });
    }
  }

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

      const TAXONOMIA = TAXONOMIA_PATOLOGIAS;

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

  // ─── TEST: VERIFICAR RECONOCIMIENTO DE CEO ────────────────────────
  if (action === 'test_jorge_recognition') {
    const { codigoTest } = req.body;
    if (codigoTest === 'CCMED-JORGE01') {
      const CEOS_TEST = { 'CCMED-JORGE01': 'Jorge Torres, CEO de Regene Global' };
      const esComingStraté = CEOS_TEST[codigoTest];
      return res.status(200).json({
        reconocido: true,
        codigo: codigoTest,
        tipo: 'CEO_ESTRATEGICO',
        nombre: esComingStraté,
        mensaje: `✅ Jorge Torres RECONOCIDO como CEO de Regene Global. NOVA lo tratará con máxima formalidad y le dará acceso a red completa, protocolos, outcomes y comunicación directa con fundadores.`
      });
    }
    return res.status(200).json({ reconocido: false, codigo: codigoTest });
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
    const esMedicoPreliminar = typeof medicoCode === 'string' && /^CCMED-[A-Z0-9]{4,8}$/.test(medicoCode);
    const limiteCaracteres = esMedicoPreliminar ? 12000 : 4000;
    for (const m of messages) {
      if (!['user','assistant'].includes(m.role)) {
        return res.status(400).json({ error: 'Role inválido.' });
      }
      if (typeof m.content !== 'string' || m.content.length > limiteCaracteres) {
        return res.status(400).json({ error: 'Contenido inválido.' });
      }
    }

    // Determinar modo y construir system prompt en el servidor
    let systemPrompt;
    let herramientaPaciente = null; // solo se llena en modo paciente/VIP
    let herramientaMedico = null;   // solo se llena en modo médico (opcional, tool_choice auto)
    let herramientaDirectorio = null; // solo modo público — búsqueda directorio
    let herramientaAltaPaciente = null; // alta de paciente nuevo por dictado
    let herramientaInvitarMedico = null; // generar invitación pre-cargada para un colega
    let herramientaAvisarMedico = null; // avisar a otro médico por Telegram
    let herramientaAutorizarDZW = null; // autorizar invitación VIP/DEZAWA para un paciente
    let herramientaSeriesLab = null; // backfill de series históricas de laboratorio/imagen
    let pacRecordId = null;
    let pacMedicoLink = null;
    let esVipReal = false;
    let medicoRecordId = null; // se llena en modo médico, usado luego para log de transcripción/actividad

    const esMedico = typeof medicoCode === 'string' && /^CCMED-[A-Z0-9]{4,8}$/.test(medicoCode);
    const esVIP    = typeof vipCode    === 'string' && /^DZW-[0-9]{8}$/.test(vipCode);
    const esPac    = typeof pacienteCode === 'string' && /^CC-PAC-[0-9]{4,8}$/.test(pacienteCode);

    if (esMedico) {
      let nombreReal       = typeof medicoNombre      === 'string' ? medicoNombre.slice(0,100)      : 'Médico';
      let especialidadReal = typeof medicoEspecialidad === 'string' ? medicoEspecialidad.slice(0,100) : 'Medicina';
      let memoriaMedico    = '';

      // La memoria y la actividad NUNCA se confían del cliente — se consultan
      // aquí contra Airtable, igual que ya se hace en modo paciente.
      try {
        const formulaMed = `{Código de médico}="${medicoCode}"`;
        const urlMed = `https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_MEDICOS_APP}?filterByFormula=${encodeURIComponent(formulaMed)}`;
        const medRes = await fetch(urlMed, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` } });
        const medData = await medRes.json();
        const medRecord = medData.records?.[0];

        if (medRecord) {
          medicoRecordId = medRecord.id;
          nombreReal       = medRecord.fields['Nombre completo'] || nombreReal;
          especialidadReal = medRecord.fields['Especialidad']    || especialidadReal;
          memoriaMedico    = medRecord.fields['Memoria NOVA (médico)'] || '';
          const ultimaActividadPrevia = medRecord.fields['Última actividad NOVA'] || null;

          const UNA_HORA_MS = 60 * 60 * 1000;
          const inactivo = ultimaActividadPrevia &&
            (Date.now() - new Date(ultimaActividadPrevia).getTime()) > UNA_HORA_MS;

          // Si pasó más de 1h desde el último mensaje, generamos un resumen
          // fresco de la sesión anterior (si quedó transcripción guardada) en
          // vez de seguir arrastrando la misma memoria — así NOVA "reinicia" y
          // retoma el hilo con un resumen corto en lugar de todo el historial
          // crudo, que sería mucho más caro en tokens.
          if (inactivo) {
            try {
              const fechaSesionPrevia = new Date(ultimaActividadPrevia).toISOString().slice(0, 10);
              const formulaConv = `{Fecha}="${fechaSesionPrevia}"`;
              const urlConv = `https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_NOVA_CONVERSACIONES}?filterByFormula=${encodeURIComponent(formulaConv)}`;
              const convRes = await fetch(urlConv, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` } });
              const convData = await convRes.json();
              const sesionPrevia = (convData.records || []).find(r => (r.fields?.['Médico'] || []).includes(medicoRecordId));

              if (sesionPrevia && sesionPrevia.fields['Transcripción']) {
                const resumenRes = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                    'Content-Type'     : 'application/json',
                    'x-api-key'        : process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model: 'claude-sonnet-5',
                    max_tokens: 200,
                    system: 'Resume la siguiente conversación clínica entre un médico y NOVA en 2-3 líneas, en tercera persona, solo lo clínicamente relevante para retomar el hilo mañana. Sin preámbulo, solo el resumen.',
                    messages: [{ role: 'user', content: sesionPrevia.fields['Transcripción'].slice(-6000) }],
                  }),
                });
                const resumenData = await resumenRes.json();
                const resumenTexto = resumenRes.ok
                  ? resumenData.content?.find(b => b.type === 'text')?.text?.trim()
                  : null;

                if (resumenTexto) {
                  memoriaMedico = resumenTexto;
                  fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_MEDICOS_APP}/${medicoRecordId}`, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: { 'Memoria NOVA (médico)': memoriaMedico } }),
                  }).catch(() => {});
                }
              }
            } catch (err) {
              console.error('[nova] error generando resumen de médico:', err.message);
            }
          }
        }
      } catch (err) {
        console.error('[nova] error consultando médico en Airtable:', err.message);
        // No bloqueamos el chat si Airtable falla — sigue con lo del cliente.
      }

      systemPrompt = buildSystemPrompt('medico', {
        nombre: nombreReal,
        codigo: medicoCode,
        especialidad: especialidadReal,
        memoria: memoriaMedico,
      });
      herramientaMedico = buildHerramientaFichaConsulta();
      herramientaAltaPaciente = buildHerramientaAltaPaciente();
      herramientaInvitarMedico = buildHerramientaInvitarMedico();
      herramientaAvisarMedico = buildHerramientaAvisarMedico();
      herramientaAutorizarDZW = buildHerramientaAutorizarDZW();
      herramientaSeriesLab = buildHerramientaSeriesHistoricasLab();
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
        const respuestaMedicoPendiente = pacRecord.fields['Respuesta médico pendiente'] || '';
        const nombreReal = pacRecord.fields['Nombre completo'] || (typeof pacienteNombre === 'string' ? pacienteNombre.slice(0,100) : '');

        systemPrompt = buildSystemPrompt('paciente', {
          nombre: nombreReal, id: pacienteCode, memoria, vip: esVipReal, respuestaMedicoPendiente,
        });
        herramientaPaciente = buildHerramientaPaciente(esVipReal);

        // Se entrega en ESTE turno (va en el system prompt) y se limpia de
        // inmediato para no repetirla en la siguiente conversación.
        if (respuestaMedicoPendiente) {
          fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_PACIENTES}/${pacRecordId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'Respuesta médico pendiente': '' } }),
          }).catch(err => console.error('[nova] error limpiando respuesta médico pendiente:', err.message));
        }
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
      herramientaDirectorio = buildHerramientaBuscarDirectorio();
    }

    // Techo más alto que antes (era 2048) — un dictado de ficha + una petición
    // de contenido largo en el mismo mensaje puede necesitar más espacio antes
    // de que la herramienta termine de construirse; si se corta a medias, la
    // llamada a la herramienta queda incompleta y NOVA "no responde".
    const safeTokens = Math.min(typeof max_tokens === 'number' ? max_tokens : 1024, esMedico ? 8000 : 4096);

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
      // dictando datos de un paciente para llenar la ficha, o datos de un
      // paciente nuevo para darlo de alta.
      anthropicBody.tools = [herramientaMedico, herramientaAltaPaciente, herramientaInvitarMedico, herramientaAvisarMedico, herramientaAutorizarDZW, herramientaSeriesLab];
      anthropicBody.tool_choice = { type: 'auto' };
    } else if (herramientaDirectorio) {
      anthropicBody.tools = [herramientaDirectorio];
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

    let data = await response.json();

    if (!response.ok) {
      console.error('[nova] Anthropic error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Error del servicio de IA. Intenta de nuevo.' });
    }

    // 5B: loop tool_use → tool_result (solo público)
    if (herramientaDirectorio && data.stop_reason === 'tool_use') {
      const toolUse = Array.isArray(data.content)
        ? data.content.find(b => b && b.type === 'tool_use' && b.name === 'buscar_medicos_directorio')
        : null;
      if (toolUse) {
        let resultadoTool;
        try {
          const out = await ejecutarBuscarMedicosDirectorio(toolUse.input || {});
          resultadoTool = { content: JSON.stringify(out), is_error: false };
        } catch (err) {
          console.error('[nova] buscar_medicos_directorio falló:', err.message);
          resultadoTool = { content: JSON.stringify({ error: 'No se pudo consultar el directorio en este momento.' }), is_error: true };
        }
        const segundoBody = {
          model: 'claude-sonnet-5',
          max_tokens: safeTokens,
          system: systemPrompt,
          tools: [herramientaDirectorio],
          messages: [
            ...messages,
            { role: 'assistant', content: data.content },
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: resultadoTool.content, is_error: resultadoTool.is_error }] },
          ],
        };
        const resp2 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(segundoBody),
        });
        const data2 = await resp2.json();
        if (resp2.ok) data = data2;
      }
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
      // Guardia general de truncamiento — antes solo cubría la herramienta de
      // ficha; un dictado grande (ej. backfill de varias fechas con muchos
      // analitos) puede truncar CUALQUIER herramienta médica a medio JSON,
      // dejando el tool_use inválido/incompleto y sin ejecutar nada. Se
      // detecta aquí, antes de intentar leer cualquier tool_use específico.
      if (data.stop_reason === 'max_tokens') {
        console.error('[nova] herramienta médica truncada por max_tokens — reintentando sin herramientas.');
        try {
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
            return res.status(200).json({ content: [{ type: 'text', text: `${retryTexto.text}\n\n⚠️ Nota técnica: tu dictado era muy grande y no se pudo guardar estructurado en un solo mensaje — divídelo en 1-2 fechas por mensaje para que sí se guarde en NOVA LABS.` }] });
          }
        } catch (retryErr) {
          console.error('[nova] error en reintento sin herramientas:', retryErr.message);
        }
        return res.status(502).json({ error: 'Tu dictado era demasiado grande y se cortó a la mitad sin guardarse. Divídelo en 1-2 fechas por mensaje e inténtalo de nuevo.' });
      }

      // Avisar a OTRO médico de la red por Telegram — caso independiente,
      // NOVA decide sola cuándo esto amerita avisarle a un colega.
      const toolAvisar = Array.isArray(data.content)
        ? data.content.find(b => b && b.type === 'tool_use' && b.name === 'avisar_medico_telegram')
        : null;
      if (toolAvisar && typeof toolAvisar.input?.mensaje_confirmacion === 'string') {
        try {
          const { mensaje_confirmacion, codigo_medico_destino, mensaje_para_medico } = toolAvisar.input;
          const alertaRes = await fetch('https://www.codecells.mx/api/telegram-bot', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': process.env.INTERNAL_ALERT_SECRET,
            },
            body: JSON.stringify({ codigoMedico: codigo_medico_destino, mensaje: mensaje_para_medico }),
          });
          const alertaData = await alertaRes.json();

          const textoFinal = alertaRes.ok
            ? mensaje_confirmacion
            : `${mensaje_confirmacion}\n\n⚠️ No se pudo enviar: ${alertaData.error || 'ese médico aún no vinculó su Telegram.'}`;

          return res.status(200).json({ content: [{ type: 'text', text: textoFinal }] });
        } catch (err) {
          console.error('[nova] error avisando a médico por Telegram:', err.message);
          return res.status(502).json({ error: 'Error enviando la alerta por Telegram. Inténtalo de nuevo.' });
        }
      }

      // Autorizar invitación VIP/DEZAWA para un paciente específico — el
      // médico se la manda manualmente (Instagram/WhatsApp) a esa persona.
      // Se crea en la misma tabla `temp` que ya usa el sistema de referidos
      // de pacientes VIP (dezawavip.html la lee vía ?inv=CODIGO), solo que
      // aquí "Invitado por (tipo)" queda como 'Médico'. La notificación por
      // Telegram NO se dispara aquí — se dispara cuando el paciente de
      // verdad completa su registro (api/vip-activar.js), para no avisar
      // de algo que todavía podría no concretarse.
      const toolAutorizarDZW = Array.isArray(data.content)
        ? data.content.find(b => b && b.type === 'tool_use' && b.name === 'autorizar_invitacion_dzw')
        : null;
      if (toolAutorizarDZW && typeof toolAutorizarDZW.input?.nombre_completo === 'string') {
        try {
          const datos = toolAutorizarDZW.input;
          const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
          const BASE_ID = 'app6jyD9pDlTLpknA';
          const TBL_TEMP = 'temp';

          const codigoInvitacion = await generarCodigoUnico({
            AIRTABLE_TOKEN, BASE_ID, TABLE_ID: TBL_TEMP,
            CAMPO: 'Código invitación', PREFIJO: 'INV-', esSecuencial: false,
          });

          const ahora = new Date();
          const expira = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);

          const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_TEMP}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              typecast: true,
              records: [{ fields: {
                'Nombre': datos.nombre_completo,
                'WhatsApp': datos.telefono_whatsapp || '',
                'Código invitación': codigoInvitacion,
                'Estado': 'Pendiente',
                'Fecha creación': ahora.toISOString(),
                'Fecha expiración': expira.toISOString(),
                'Invitado por (tipo)': 'Médico',
                'Invitado por (código)': medicoCode || '',
              } }],
            }),
          });

          const mensajeFinal = createRes.ok
            ? `${datos.mensaje}\n\nLink para ${datos.nombre_completo}:\nhttps://www.codecells.mx/dezawavip.html?inv=${codigoInvitacion}\n\n(Válido 7 días — te aviso por Telegram en cuanto complete su registro.)`
            : `${datos.mensaje}\n\n⚠️ Hubo un problema generando el link — inténtalo de nuevo.`;

          return res.status(200).json({ content: [{ type: 'text', text: mensajeFinal }] });
        } catch (err) {
          console.error('[nova] error autorizando invitación DZW:', err.message);
          return res.status(502).json({ error: 'Error generando la invitación DZW. Inténtalo de nuevo.' });
        }
      }

      // Generar invitación pre-cargada para un colega — se revisa primero,
      // es un caso independiente (crea un registro en SOLICITUDES_MEDICO).
      const toolInvitar = Array.isArray(data.content)
        ? data.content.find(b => b && b.type === 'tool_use' && b.name === 'generar_invitacion_medico')
        : null;
      if (toolInvitar && typeof toolInvitar.input?.nombre_completo === 'string') {
        try {
          const datos = toolInvitar.input;
          const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
          const BASE_ID = 'app6jyD9pDlTLpknA';
          const TBL_SOLICITUDES_MED = 'tblDpqi2XJqoR4QiE';
          const codigoInvitacion = 'REF-' + Math.random().toString(36).slice(2, 8);

          const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_SOLICITUDES_MED}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              typecast: true,
              records: [{ fields: {
                'Nombre completo': datos.nombre_completo,
                'Ciudad': datos.ciudad || '',
                'Especialidad': datos.especialidad || '',
                'Código invitación': codigoInvitacion,
                'Invitado por': medicoCode || '',
                'Estado': 'Invitado',
                'Fecha solicitud': new Date().toISOString(),
              } }],
            }),
          });

          const mensajeFinal = createRes.ok
            ? `${datos.mensaje}\n\nLink para ${datos.nombre_completo}:\nhttps://www.codecells.mx/code-cells-network/?ref=${codigoInvitacion}`
            : `${datos.mensaje}\n\n⚠️ Hubo un problema generando el link — inténtalo de nuevo.`;

          return res.status(200).json({ content: [{ type: 'text', text: mensajeFinal }] });
        } catch (err) {
          console.error('[nova] error generando invitación de médico:', err.message);
          return res.status(502).json({ error: 'Error generando la invitación. Inténtalo de nuevo.' });
        }
      }

      // Alta de paciente nuevo por dictado — se revisa primero porque es un
      // caso distinto (crea un registro nuevo en PACIENTES, no llena un form).
      const toolAlta = Array.isArray(data.content)
        ? data.content.find(b => b && b.type === 'tool_use' && b.name === 'crear_paciente_dictado')
        : null;
      if (toolAlta && typeof toolAlta.input?.nombre_completo === 'string') {
        try {
          const datos = toolAlta.input;
          const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
          const BASE_ID = 'app6jyD9pDlTLpknA';
          const TBL_PAC = 'tblyUcCfueFLJuvIv';
          const TBL_HIST = 'tblm2xUADazitHisR';

          // Siguiente código CC-PAC- disponible, con verificación
          // anti-colisión del lado del servidor (ver lib/codigos.js).
          const nuevoCodigo = await generarCodigoUnico({
            AIRTABLE_TOKEN, BASE_ID, TABLE_ID: TBL_PAC,
            CAMPO: 'Código de paciente', PREFIJO: 'CC-PAC-', esSecuencial: true,
          });

          // Enlazar al médico que lo está dando de alta — sin esto, el
          // paciente no aparece en "Mis Pacientes" de nadie en el portal.
          let medicoRecordId = null;
          if (medicoCode) {
            try {
              const TBL_MED = 'tbl87DsuBMmb4DjFM';
              const formulaMed = `{Código de médico}="${medicoCode}"`;
              const medRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_MED}?filterByFormula=${encodeURIComponent(formulaMed)}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
              const medData = await medRes.json();
              medicoRecordId = medData.records?.[0]?.id || null;
            } catch { /* si falla, el paciente igual se crea, solo sin médico enlazado */ }
          }

          const fieldsNuevoPaciente = { 'Código de paciente': nuevoCodigo, 'Nombre completo': datos.nombre_completo };
          if (medicoRecordId) fieldsNuevoPaciente['Médico_principal'] = [medicoRecordId];
          if (datos.sexo) fieldsNuevoPaciente['Sexo biológico'] = datos.sexo;
          if (datos.telefono_whatsapp) fieldsNuevoPaciente['Teléfono WhatsApp'] = datos.telefono_whatsapp;
          if (datos.edad) {
            const nacimientoAprox = new Date();
            nacimientoAprox.setFullYear(nacimientoAprox.getFullYear() - datos.edad);
            fieldsNuevoPaciente['Fecha de nacimiento'] = nacimientoAprox.toISOString().slice(0, 10);
          }
          if (datos.peso_kg) fieldsNuevoPaciente['Peso actual (kg)'] = datos.peso_kg;
          if (datos.talla_cm) fieldsNuevoPaciente['Talla (cm)'] = datos.talla_cm;
          // patologias_detectadas viene ya separado de heredofamiliares por diseño de la herramienta
          if (Array.isArray(datos.patologias_detectadas) && datos.patologias_detectadas.length) {
            fieldsNuevoPaciente['Patologías activas'] = datos.patologias_detectadas;
          }
          const notasGenerales = [];
          if (datos.presion_arterial) notasGenerales.push(`PA inicial: ${datos.presion_arterial}`);
          if (notasGenerales.length) fieldsNuevoPaciente['Notas generales'] = notasGenerales.join(' | ');

          const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ typecast: true, records: [{ fields: fieldsNuevoPaciente }] }),
          });
          const createData = await createRes.json();
          const nuevoRecordId = createData.records?.[0]?.id;

          // Antecedentes heredofamiliares y motivo van a HISTORIA CLÍNICA —
          // NUNCA a Patologías activas del paciente, son historial de la familia.
          if (nuevoRecordId && (datos.antecedentes_heredofamiliares || datos.motivo_consulta)) {
            await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_HIST}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ typecast: true, records: [{ fields: {
                'Código de paciente ref': nuevoCodigo,
                'Motivo de consulta': datos.motivo_consulta || '',
                'AHF — Heredo-familiares': datos.antecedentes_heredofamiliares || '',
                'Paciente': [nuevoRecordId],
              } }] }),
            }).catch(e => console.error('[nova] error creando historia clínica inicial:', e.message));
          }

          const mensajeFinal = createRes.ok
            ? `${datos.mensaje}\n\n✅ Paciente registrado: ${nuevoCodigo} — ${datos.nombre_completo}. Revísalo en el Portal Médico y completa lo que falte.`
            : `${datos.mensaje}\n\n⚠️ Hubo un problema guardando el registro en Airtable — inténtalo de nuevo o cárgalo manualmente.`;
          return res.status(200).json({ content: [{ type: 'text', text: mensajeFinal }], paciente_creado: createRes.ok ? { codigo: nuevoCodigo, recordId: nuevoRecordId } : null });
        } catch (err) {
          console.error('[nova] error en alta de paciente por dictado:', err.message);
          return res.status(502).json({ error: 'Error dando de alta al paciente. Inténtalo de nuevo.' });
        }
      }

      // Backfill de historial de laboratorio/imagen dictado en múltiples
      // fechas — a diferencia de rellenar_ficha_consulta, esto SÍ escribe
      // directo en Airtable, sin esperar a que el médico presione "Guardar".
      const toolSeriesLab = Array.isArray(data.content)
        ? data.content.find(b => b && b.type === 'tool_use' && b.name === 'guardar_series_historicas_laboratorio')
        : null;
      if (toolSeriesLab && Array.isArray(toolSeriesLab.input?.series)) {
        try {
          const resultado = await ejecutarGuardadoSeriesLab(pacienteCode, toolSeriesLab.input.mensaje, toolSeriesLab.input.series);
          return res.status(200).json(resultado);
        } catch (err) {
          console.error('[nova] error en guardar_series_historicas_laboratorio:', err.message);
          return res.status(502).json({ error: 'Error guardando el historial de laboratorio. Inténtalo de nuevo.' });
        }
      }

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

      // ─── RED DE SEGURIDAD: dictado con 2+ fechas pero NOVA no usó NINGUNA
      // herramienta (con tool_choice:'auto' puede simplemente "platicar" en vez
      // de guardar). Se detecta por patrón de fechas en el último mensaje del
      // médico y se fuerza una segunda llamada obligando la herramienta de
      // backfill — así el guardado no depende de que el modelo "decida" usarla.
      const huboToolUse = Array.isArray(data.content) && data.content.some(b => b && b.type === 'tool_use');
      if (!huboToolUse && pacienteCode && /^CC-PAC-[0-9]{4,8}$/.test(pacienteCode)) {
        const ultimoMensaje = typeof messages[messages.length - 1]?.content === 'string' ? messages[messages.length - 1].content : '';
        const fechasDetectadas = (ultimoMensaje.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{4}-\d{1,2}-\d{1,2}\b/g) || []).length;
        if (fechasDetectadas >= 2) {
          console.error('[nova] dictado con', fechasDetectadas, 'fechas pero sin tool_use — forzando guardar_series_historicas_laboratorio.');
          try {
            const forzadoRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({
                model: 'claude-sonnet-5',
                max_tokens: 8000,
                system: systemPrompt,
                messages,
                tools: [herramientaSeriesLab],
                tool_choice: { type: 'tool', name: 'guardar_series_historicas_laboratorio' },
              }),
            });
            const forzadoData = await forzadoRes.json();
            const forzadoTool = forzadoRes.ok && Array.isArray(forzadoData.content)
              ? forzadoData.content.find(b => b && b.type === 'tool_use' && b.name === 'guardar_series_historicas_laboratorio')
              : null;
            if (forzadoTool && Array.isArray(forzadoTool.input?.series)) {
              const resultado = await ejecutarGuardadoSeriesLab(pacienteCode, forzadoTool.input.mensaje, forzadoTool.input.series);
              return res.status(200).json(resultado);
            }
          } catch (err) {
            console.error('[nova] error en reintento forzado de guardado de labs:', err.message);
          }
          // Si el reintento forzado también falla, sigue al texto normal de abajo
          // en vez de dejar al médico sin ninguna respuesta.
        }
      }
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

    if (esMedico && medicoRecordId) {
      // No bloquea la respuesta al médico — si Airtable falla aquí, solo se
      // pierde el log de esa interacción, nunca la respuesta ya generada.
      (async () => {
        try {
          const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
          const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };

          await fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_MEDICOS_APP}/${medicoRecordId}`, {
            method: 'PATCH', headers,
            body: JSON.stringify({ fields: { 'Última actividad NOVA': new Date().toISOString() } }),
          });

          const fechaHoy = new Date().toISOString().slice(0, 10);
          const formula = `{Fecha}="${fechaHoy}"`;
          const listUrl = `https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_NOVA_CONVERSACIONES}?filterByFormula=${encodeURIComponent(formula)}`;
          const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
          const listData = await listRes.json();
          const existente = (listData.records || []).find(r => (r.fields?.['Médico'] || []).includes(medicoRecordId));

          const ultimoMensajeMedico = messages[messages.length - 1]?.content || '';
          const linea = `Médico: ${ultimoMensajeMedico}\nNOVA: ${bloqueTexto.text}\n---\n`;

          if (existente) {
            await fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_NOVA_CONVERSACIONES}/${existente.id}`, {
              method: 'PATCH', headers,
              body: JSON.stringify({ fields: { 'Transcripción': (existente.fields['Transcripción'] || '') + linea } }),
            });
          } else {
            await fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_NOVA_CONVERSACIONES}`, {
              method: 'POST', headers,
              body: JSON.stringify({
                typecast: true,
                records: [{ fields: { 'Fecha': fechaHoy, 'Médico': [medicoRecordId], 'Modo': 'Médico', 'Transcripción': linea } }],
              }),
            });
          }
        } catch (err) {
          console.error('[nova] error guardando log/actividad de médico:', err.message);
        }
      })();
    }

    const textoUtilizable = Array.isArray(data.content) && data.content.some(b => b && b.type === 'text' && b.text && b.text.trim());
    if (!textoUtilizable) {
      console.error(
        '[nova] público: respuesta sin texto utilizable. stop_reason:', data.stop_reason,
        '— content:', JSON.stringify(data.content),
        '— usage:', JSON.stringify(data.usage),
        '— último mensaje usuario:', JSON.stringify(messages[messages.length - 1]?.content?.slice(0, 300))
      );
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('[nova] chat error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

// ─── HERRAMIENTA: GUARDAR SERIES HISTÓRICAS DE LABORATORIO/IMAGEN ──
// Distinta de rellenar_ficha_consulta: esa es solo para la consulta de HOY y
// no guarda nada hasta que el médico presiona "Guardar consulta". Esta SÍ
// escribe de inmediato en NOVA LABS + LAB_VALORES, una vez por cada fecha
// dictada — para cuando el médico reconstruye el historial de un paciente
// leyendo varios estudios pasados en la misma dictada.
function buildHerramientaSeriesHistoricasLab() {
  return {
    name: 'guardar_series_historicas_laboratorio',
    description: 'Úsala SOLO cuando el médico dicte resultados de DOS O MÁS fechas distintas del pasado (reconstrucción de historial) para el paciente que ya tiene seleccionado en el portal. A diferencia de rellenar_ficha_consulta, esta herramienta guarda de inmediato en Airtable (NOVA LABS + LAB_VALORES), una entrada por cada fecha — no depende de que el médico presione "Guardar consulta". Si solo dicta la fecha de HOY (una sola), usa rellenar_ficha_consulta en su lugar, no esta. Requiere que haya un paciente seleccionado en el portal — si no lo hay, dilo en el mensaje y no inventes que se guardó nada.',
    input_schema: {
      type: 'object',
      properties: {
        mensaje: { type: 'string', description: 'Tu respuesta al médico. Confirma EXACTAMENTE cuántas series se guardaron y de qué fechas — nunca afirmes que se guardó algo que no viene en "series".' },
        series: {
          type: 'array',
          description: 'Una entrada por cada fecha de estudio dictada.',
          items: {
            type: 'object',
            properties: {
              fecha: { type: 'string', description: 'Formato YYYY-MM-DD.' },
              tipo_estudio: { type: 'string', enum: ['Laboratorio', 'RX', 'USG', 'Tomografía', 'Resonancia', 'Otro estudio'] },
              panel_sugerido: { type: 'string', enum: ['Panel básico', 'Panel hormonal', 'Panel metabólico avanzado', 'Panel inflamatorio', 'Panel NOVA completo', 'Panel DEZAWA™', 'Personalizado'] },
              resumen_texto: { type: 'string', description: 'Resumen narrativo de ese corte (hallazgos de imagen, o el listado de labs tal como se dictó).' },
              analitos: {
                type: 'array',
                description: 'Solo si tipo_estudio es Laboratorio y hay valores individuales dictados.',
                items: {
                  type: 'object',
                  properties: {
                    nombre: { type: 'string' },
                    valor: { type: 'string' },
                    unidad: { type: 'string' },
                    rango_texto: { type: 'string' },
                    bandera: { type: 'string', enum: ['normal', 'alto', 'bajo', 'indeterminado'] },
                    critico: { type: 'boolean', description: 'true SOLO si el valor está muy fuera del rango de referencia (no una desviación leve).' },
                  },
                  required: ['nombre', 'valor'],
                },
              },
            },
            required: ['fecha', 'tipo_estudio'],
          },
        },
      },
      required: ['mensaje', 'series'],
    },
  };
}

// ─── Ejecuta el guardado real de series históricas en Airtable ────
// Extraída como función independiente para poder llamarla tanto desde el
// tool_use natural de NOVA como desde el reintento forzado (cuando NOVA
// respondió solo en texto sin usar ninguna herramienta pese a que el
// dictado claramente traía varias fechas).
async function ejecutarGuardadoSeriesLab(pacienteCode, mensaje, series) {
  if (!pacienteCode || !/^CC-PAC-[0-9]{4,8}$/.test(pacienteCode)) {
    return { content: [{ type: 'text', text: `${mensaje}\n\n⚠️ No tengo un paciente seleccionado en el portal para guardar esto — abre su expediente primero y dicta de nuevo.` }] };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = 'app6jyD9pDlTLpknA';
  const TBL_PAC = 'tblyUcCfueFLJuvIv';
  const TBL_LABS = 'tblhKp4uE1NdXXqLh';
  const TBL_LAB_VALORES = 'tbl6y1ZfsmPPhrlFk';
  const banderasValidas = ['Normal', 'Alto', 'Bajo', 'Indeterminado'];
  const capitalizar = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Indeterminado';

  const pacRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_PAC}?filterByFormula=${encodeURIComponent(`{Código de paciente}="${pacienteCode}"`)}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const pacData = await pacRes.json();
  const pacRecord = pacData.records?.[0];
  if (!pacRecord) {
    return { content: [{ type: 'text', text: `${mensaje}\n\n⚠️ No encontré ese paciente en Airtable — no se guardó nada.` }] };
  }

  const resultadosSeries = await Promise.all((series || []).filter(s => s.fecha).map(async serie => {
    const analitos = Array.isArray(serie.analitos) ? serie.analitos.filter(a => a && a.nombre) : [];
    const fueraDeRango = analitos.filter(a => a.bandera === 'alto' || a.bandera === 'bajo');

    const crearRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LABS}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        typecast: true,
        fields: {
          'Código de paciente ref': pacienteCode,
          'Paciente': [pacRecord.id],
          'Fecha de resultados': serie.fecha,
          'Tipo de estudio': serie.tipo_estudio || (analitos.length ? 'Laboratorio' : 'Otro estudio'),
          'Panel solicitado': serie.panel_sugerido || 'Personalizado',
          'Resultados (texto)': serie.resumen_texto || (analitos.length ? analitos.map(a => `${a.nombre}: ${a.valor} ${a.unidad || ''}`).join('\n') : 'Dictado por médico.'),
          ...(fueraDeRango.length ? { 'Valores fuera de rango': fueraDeRango.map(a => `${a.nombre}: ${a.valor} ${a.unidad || ''} (${a.bandera === 'alto' ? 'Alto' : 'Bajo'})`).join('\n') } : {}),
        },
      }),
    });
    const crearData = await crearRes.json();
    if (!crearData.id) { console.error('[nova] error creando NOVA LABS (backfill):', JSON.stringify(crearData)); return null; }

    if (analitos.length) {
      const registrosValores = analitos.map(a => {
        const banderaCap = capitalizar(a.bandera);
        const numMatch = String(a.valor).replace(',', '.').match(/-?\d+(\.\d+)?/);
        return {
          fields: {
            'Analito': a.nombre,
            'Valor': String(a.valor ?? ''),
            ...(numMatch ? { 'Valor numérico': parseFloat(numMatch[0]) } : {}),
            'Unidad': a.unidad || '',
            'Rango de referencia': a.rango_texto || '',
            'Bandera': banderasValidas.includes(banderaCap) ? banderaCap : 'Indeterminado',
            'Es crítico': !!a.critico,
            'Relevante a patología': true,
            'Fecha del estudio': serie.fecha,
            'Código de paciente ref': pacienteCode,
            'Paciente': [pacRecord.id],
            'Estudio (NOVA LABS)': [crearData.id],
          },
        };
      });
      await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_LAB_VALORES}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, records: registrosValores }),
      }).catch(e => console.error('[nova] error creando LAB_VALORES (backfill):', e.message));
    }
    return serie.fecha;
  }));

  const fechasGuardadas = resultadosSeries.filter(Boolean);
  const guardadas = fechasGuardadas.length;

  const textoFinal = guardadas > 0
    ? `${mensaje}\n\n✅ Guardado en NOVA LABS: ${guardadas} de ${(series || []).length} fecha(s) (${fechasGuardadas.join(', ')}). Ya puedes verlas en la pestaña NOVA LABS del expediente.`
    : `${mensaje}\n\n⚠️ No se pudo guardar ninguna fecha — revisa el formato e inténtalo de nuevo.`;

  return { content: [{ type: 'text', text: textoFinal }], refrescarLabs: guardadas > 0 };
}

// ─── DEFINICIÓN DE LA HERRAMIENTA DE NOVA EN MODO MÉDICO (ficha) ───
// Opcional (tool_choice auto) — NOVA la usa solo cuando detecta que el médico
// le está dictando datos clínicos de un paciente que está atendiendo, no en
// preguntas normales de protocolos/clínica.
function buildHerramientaFichaConsulta() {
  return {
    name: 'rellenar_ficha_consulta',
    description: 'Úsala SOLO para llenar la ficha de la consulta de HOY con datos clínicos que el médico dicte de un paciente que está atendiendo ahora mismo (edad, diagnóstico, signos vitales, motivo, plan, antecedentes, o UN solo corte de laboratorio de hoy). IMPORTANTE: esta herramienta NO guarda nada en Airtable — solo autorellena el formulario en pantalla; el médico debe presionar "Guardar consulta" para que se guarde. Si el médico dicta resultados de DOS O MÁS fechas distintas del pasado (reconstrucción de historial), usa guardar_series_historicas_laboratorio en su lugar, no esta — y en tu "mensaje" nunca digas que algo quedó "guardado" o "actualizado en el expediente" si solo llenaste el formulario, di que quedó listo en el formulario para revisar y guardar. No la uses para preguntas generales, de protocolos o consultas que no describen a un paciente concreto. Mantén "mensaje" y todos los campos breves y concretos — nunca redactes documentos largos dentro de esta herramienta; si el médico pide algo más extenso además del dictado, dilo en una frase corta dentro de "mensaje" y ya. PROHIBIDO usar esta herramienta para planes nutricionales — un plan nutricional (aunque sea largo) SIEMPRE se responde en texto normal, sin llamar a ninguna herramienta, nunca dentro de "mensaje" ni de ningún campo de aquí. CRÍTICO: antecedentes heredofamiliares (lo que tienen los papás/hermanos/familiares) van SOLO en antecedentes_heredofamiliares, nunca se mezclan con lo que el paciente mismo tiene.',
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
        frecuencia_cardiaca: { type: 'number', description: 'Frecuencia cardiaca en lpm, si se mencionó.' },
        frecuencia_respiratoria: { type: 'number', description: 'Frecuencia respiratoria en rpm, si se mencionó.' },
        saturacion_oxigeno: { type: 'number', description: 'Saturación de oxígeno en %, si se mencionó.' },
        circunferencia_cintura: { type: 'number', description: 'Circunferencia de cintura en cm, si se mencionó.' },
        motivo_consulta: { type: 'string' },
        exploracion_fisica: { type: 'string' },
        diagnostico: {
          type: 'string',
          description: 'Diagnóstico, con código CIE-10 solo si lo puedes inferir con confianza razonable; si no estás seguro del código exacto, escribe solo el diagnóstico en texto y dilo en el mensaje para que el médico lo confirme.',
        },
        plan_terapeutico: { type: 'string' },
        notas_internas: { type: 'string', description: 'Cualquier dato adicional que no tenga campo propio (ej. grupo sanguíneo, escolaridad).' },
        antecedentes_heredofamiliares: { type: 'string', description: 'SOLO lo que tienen padres/hermanos/familiares — nunca del paciente mismo.' },
        antecedentes_personales_patologicos: { type: 'string', description: 'Enfermedades que el paciente mismo tiene o ha tenido (ej. hipertensión, hipotiroidismo), con tratamiento si se mencionó.' },
        antecedentes_quirurgicos: { type: 'string' },
        antecedentes_ginecoobstetricos: { type: 'string', description: 'Menarca, ciclos, FUM, IVSA, método anticonceptivo, fórmula obstétrica (G_P_C_A_V_), etc.' },
        medicamentos_actuales: { type: 'string' },
        alergias: { type: 'string' },
        habitos_estilo_vida: { type: 'string', description: 'Actividad física, sueño, hidratación, alimentación — todo junto en texto libre.' },
        estado_civil: { type: 'string' },
        ocupacion: { type: 'string' },
        grupo_sanguineo: { type: 'string', enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] },
        escolaridad: { type: 'string', enum: ['Primaria', 'Secundaria', 'Preparatoria', 'Licenciatura trunca', 'Licenciatura terminada', 'Posgrado'] },
        panel_laboratorio: {
          type: 'string',
          enum: ['Panel básico', 'Panel hormonal', 'Panel metabólico avanzado', 'Panel inflamatorio', 'Panel NOVA completo', 'Panel DEZAWA™', 'Personalizado'],
          description: 'Solo si el médico dictó resultados de laboratorio. Si no encaja claramente en ninguna categoría fija, usa "Personalizado".',
        },
        resultados_laboratorio: {
          type: 'string',
          description: 'Transcribe el resumen completo de resultados de laboratorio tal como lo dictó el médico (valores, unidades, interpretación breve por línea). Solo si mencionó resultados de labs.',
        },
        valores_fuera_rango: {
          type: 'string',
          description: 'Lista breve SOLO de los valores anormales/fuera de rango mencionados (ej. "Colesterol total: 220 mg/dL, elevado. Triglicéridos: 136 mg/dL, discretamente elevados."). Vacío si todo salió normal.',
        },
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

// ─── HERRAMIENTA: ALTA DE PACIENTE NUEVO POR DICTADO ────────────────
// Opcional (tool_choice auto) — distinta de rellenar_ficha_consulta: esa es
// para un paciente YA existente y seleccionado en el portal; esta es para
// cuando el médico dicta los datos de alguien que AÚN NO está en el sistema.
// ─── HERRAMIENTA: avisar a otro médico de la red por Telegram ──────
function buildHerramientaAvisarMedico() {
  return {
    name: 'avisar_medico_telegram',
    description: 'Úsala cuando el médico te pida avisarle algo a OTRO médico de la Red CODE CELLS® por Telegram (ej. "avísale al Dr. Galván que ya revisé al paciente", "dile a mi colega que..."). Necesitas el código del médico destino (formato CCMED-XXXXXX) — si no te lo dio, pregúntaselo primero en una respuesta normal de texto; NO actives esta herramienta sin ese código.',
    input_schema: {
      type: 'object',
      properties: {
        mensaje_confirmacion: { type: 'string', description: 'Tu respuesta al médico que te pidió esto, confirmando que se envió (o explicando qué falta).' },
        codigo_medico_destino: { type: 'string', description: 'Código CCMED- del médico al que hay que avisarle.' },
        mensaje_para_medico: { type: 'string', description: 'El mensaje exacto, breve y claro, que se le debe mandar por Telegram al médico destino.' },
      },
      required: ['mensaje_confirmacion', 'codigo_medico_destino', 'mensaje_para_medico'],
    },
  };
}

// ─── HERRAMIENTA: autorizar invitación VIP/DEZAWA para un paciente ──
function buildHerramientaAutorizarDZW() {
  return {
    name: 'autorizar_invitacion_dzw',
    description: 'Úsala SOLO cuando el médico te pida autorizar, generar o crear una invitación VIP/DEZAWA/DZW para una persona específica — ej. "autoriza un DZW para Ana López", "genera invitación DEZAWA para Juan, whatsapp 667...". NO la uses para pacientes regulares (CC-PAC) — para eso existe crear_paciente_dictado. Requiere al menos el nombre completo; el teléfono es muy recomendable porque la invitación se verifica con los últimos 4 dígitos de ese WhatsApp cuando la persona abra el link.',
    input_schema: {
      type: 'object',
      properties: {
        mensaje: { type: 'string', description: 'Tu respuesta confirmando que se autorizó la invitación, mencionando el nombre. El link se agrega aparte, no lo escribas tú.' },
        nombre_completo: { type: 'string' },
        telefono_whatsapp: { type: 'string', description: 'Muy recomendable — sin esto, la persona no podrá pasar la verificación de identidad al abrir el link.' },
      },
      required: ['mensaje', 'nombre_completo'],
    },
  };
}

// ─── HERRAMIENTA: generar invitación pre-cargada para un colega ────
function buildHerramientaInvitarMedico() {
  return {
    name: 'generar_invitacion_medico',
    description: 'Úsala cuando el médico te pida generar o crear una invitación/link para que un colega (otro médico) se afilie a la Red CODE CELLS® — ej. "genera una invitación para el Dr. Pedro en Morelia". Requiere al menos nombre completo; ciudad y especialidad si las mencionó.',
    input_schema: {
      type: 'object',
      properties: {
        mensaje: { type: 'string', description: 'Tu respuesta confirmando que generaste la invitación, mencionando el nombre del colega. El link se agrega aparte, no lo escribas tú.' },
        nombre_completo: { type: 'string', description: 'Nombre completo del colega invitado.' },
        ciudad: { type: 'string' },
        especialidad: { type: 'string' },
      },
      required: ['mensaje', 'nombre_completo'],
    },
  };
}

function buildHerramientaBuscarDirectorio() {
  return {
    name: 'buscar_medicos_directorio',
    description: 'Búscala cuando un paciente pida encontrar, localizar o que le recomiendes un médico/especialista de la Red CODE CELLS® — por ciudad, especialidad o herramienta regenerativa (ej. "¿hay algún médico de células madre en Culiacán?", "busco un cardiólogo"). NO la uses para preguntas generales sobre CODE CELLS® o protocolos, ni cuando el paciente no busca un médico concreto. Llámala con uno, dos o los tres filtros; si no dio ciudad, ómitela.',
    input_schema: {
      type: 'object',
      properties: {
        ciudad: { type: 'string', description: 'Ciudad de consulta como la dijo el paciente (ej. "Culiacán").' },
        especialidad: {
          type: 'string',
          description: 'Especialidad clínica canónica. Mapea lo que pida el paciente al valor más cercano.',
          enum: ['Medicina Regenerativa','Medicina Interna','Endocrinología','Ginecología y Obstetricia','Gastroenterología','Otorrinolaringología','Nutriología','Cardiología','Nefrología','Reumatología','Dermatología','Neumología','Psiquiatría','Urología','Oftalmología','Cirugía Plástica']
        },
        tratamiento: {
          type: 'string',
          description: 'Herramienta regenerativa canónica. Mapea lo que pida el paciente al valor más cercano.',
          enum: ['Células madre','Exosomas','Sueroterapia IV','Peptidoterapia','GLP-1 / Pérdida de peso','MUSE Cells','Rejuvenecimiento facial','Terapia hormonal','Ozonoterapia','Homotoxicología','Biohacking / Longevidad','NK Cells','MSC Placental','DEZAWA (VIP)']
        }
      },
      required: []
    }
  };
}

async function ejecutarBuscarMedicosDirectorio({ ciudad, especialidad, tratamiento }) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = 'app6jyD9pDlTLpknA';
  const TABLA_DIRECTORIO = 'tblkUNPwu1sQgZBPJ';
  const esc = (v) => String(v || '').replace(/"/g, '\\"');

  const filtros = ['{Publicado}=1'];
  if (ciudad)       filtros.push(`{Ciudad de consulta}="${esc(ciudad)}"`);
  if (especialidad) filtros.push(`FIND("${esc(especialidad)}", ARRAYJOIN({Especialidades visibles}, ", "))>0`);
  if (tratamiento)  filtros.push(`FIND("${esc(tratamiento)}", ARRAYJOIN({Tratamientos que ofrece}, ", "))>0`);
  const formula = filtros.length === 1 ? filtros[0] : `AND(${filtros.join(',')})`;

  const CAMPOS_PUBLICOS = ['Name','Especialidades visibles','Tratamientos que ofrece','Otras terapias','Ciudad de consulta','Bio corta','Horarios','WhatsApp público'];
  const params = new URLSearchParams();
  params.set('filterByFormula', formula);
  params.set('maxRecords', '5');
  CAMPOS_PUBLICOS.forEach(c => params.append('fields[]', c));

  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLA_DIRECTORIO}?${params.toString()}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  if (!r.ok) throw new Error('Airtable ' + r.status);
  const data = await r.json();

  const medicos = (data.records || []).map(rec => {
    const f = rec.fields || {};
    return {
      nombre: f['Name'] || null,
      ciudad: f['Ciudad de consulta'] || null,
      especialidades: f['Especialidades visibles'] || [],
      tratamientos: f['Tratamientos que ofrece'] || [],
      otras_terapias: f['Otras terapias'] || null,
      bio: f['Bio corta'] || null,
      horarios: f['Horarios'] || null,
      whatsapp: f['WhatsApp público'] || null,
    };
  });
  return { total: medicos.length, medicos };
}

function buildHerramientaAltaPaciente() {
  return {
    name: 'crear_paciente_dictado',
    description: 'Úsala SOLO cuando el médico dicte los datos generales de un paciente NUEVO que claramente no está aún registrado (menciona nombre completo, edad, datos generales, con intención de darlo de alta) — no la uses para seguimiento de un paciente que ya está seleccionado en el portal, para eso existe rellenar_ficha_consulta. CRÍTICO: los antecedentes heredofamiliares (lo que tienen los papás, hermanos, familiares) NUNCA van en patologias_detectadas — esas son solo las condiciones que el PACIENTE MISMO tiene. Confundir esto sería un error clínico grave.',
    input_schema: {
      type: 'object',
      properties: {
        mensaje: { type: 'string', description: 'Tu respuesta al médico confirmando qué se registró y qué falta, si algo.' },
        nombre_completo: { type: 'string' },
        edad: { type: 'number' },
        sexo: { type: 'string', enum: ['Masculino', 'Femenino'] },
        telefono_whatsapp: { type: 'string', description: 'Teléfono/WhatsApp del paciente, si el médico lo mencionó al dictarlo.' },
        peso_kg: { type: 'number' },
        talla_cm: { type: 'number' },
        presion_arterial: { type: 'string', description: "Formato 'sistólica/diastólica', tal como se dictó. Es un signo vital, NO decidas tú si es hipertensión — eso lo decide el médico." },
        motivo_consulta: { type: 'string' },
        patologias_detectadas: {
          type: 'array',
          items: { type: 'string', enum: TAXONOMIA_PATOLOGIAS },
          description: 'SOLO condiciones que el paciente mismo tiene actualmente (ej. "presenta obesidad mórbida", "tiene síndrome metabólico"). Nunca incluyas aquí antecedentes heredofamiliares.',
        },
        antecedentes_heredofamiliares: {
          type: 'string',
          description: 'Historial familiar dictado tal cual (ej. "Madre: diabetes. Padre: infarto agudo al miocardio."), texto libre — esto NUNCA se convierte en patología del paciente.',
        },
      },
      required: ['mensaje', 'nombre_completo'],
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
    requiere_valoracion_medica: {
      type: 'boolean',
      description: 'true si lo que pregunta o reporta el paciente en ESTE mensaje necesita el juicio clínico de su médico (no algo que tú puedas resolver con orientación general) — ej. duda sobre interacción de medicamentos, síntoma nuevo, ajuste de dosis, algo fuera de lo que cubre el protocolo ya explicado. En tu "reply" dile con calidez que esto lo debe revisar su médico y que ya se le avisó.',
    },
    motivo_valoracion: {
      type: 'string',
      description: 'Resumen clínico de 1-2 frases, en tercera persona, de lo que el médico necesita revisar. Solo si requiere_valoracion_medica es true.',
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

// ─── MATCHING DE MÉDICO POR CIUDAD (con fallback a médico por defecto) ────
const MEDICO_DEFAULT_CODIGO = 'CCMED-VIRN01'; // Dr. Víctor — respaldo cuando no hay match de ciudad

async function encontrarMedicoParaPaciente(pacRecordId, pacMedicoLink, AIRTABLE_TOKEN) {
  const pacRes = await fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_PACIENTES}/${pacRecordId}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  const pacData = await pacRes.json();
  const ciudadPaciente = (pacData.fields?.['Ciudad'] || '').trim();
  const nombrePaciente = pacData.fields?.['Nombre completo'] || '';

  let medicoAsignadoId = (pacMedicoLink && pacMedicoLink[0]) || null;

  if (!medicoAsignadoId) {
    const medListRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_MEDICOS_APP}?filterByFormula=${encodeURIComponent('{Activo}=1')}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const medListData = await medListRes.json();
    const medicosActivos = medListData.records || [];

    if (ciudadPaciente) {
      const ciudadPacienteLower = ciudadPaciente.toLowerCase();
      const matchExacto = medicosActivos.find(
        m => (m.fields['Ciudad'] || '').trim().toLowerCase() === ciudadPacienteLower
      );
      const matchParcial = medicosActivos.find(m => {
        const ciudadMedico = (m.fields['Ciudad'] || '').trim().toLowerCase();
        return ciudadMedico && (ciudadMedico.includes(ciudadPacienteLower) || ciudadPacienteLower.includes(ciudadMedico));
      });
      const medicoMatch = matchExacto || matchParcial;
      if (medicoMatch) medicoAsignadoId = medicoMatch.id;
    }

    // Sin ciudad o sin match: médico por defecto (respaldo para que nunca
    // quede sin asignar — típicamente se resuelve por video llamada).
    if (!medicoAsignadoId) {
      const medicoDefault = medicosActivos.find(m => m.fields['Código de médico'] === MEDICO_DEFAULT_CODIGO);
      if (medicoDefault) medicoAsignadoId = medicoDefault.id;
    }
  }

  return { medicoAsignadoId, ciudadPaciente, nombrePaciente };
}

async function enviarAlertaMedico({ medicoAsignadoId, mensaje, pacienteRecordId, preguntaPaciente, AIRTABLE_TOKEN }) {
  if (!medicoAsignadoId) return;
  const medRecRes = await fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_MEDICOS_APP}/${medicoAsignadoId}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  const medRecData = await medRecRes.json();
  const codigoMedico = medRecData.fields?.['Código de médico'];
  if (!codigoMedico) return;

  await fetch('https://www.codecells.mx/api/telegram-bot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_ALERT_SECRET,
    },
    body: JSON.stringify({ codigoMedico, mensaje, pacienteRecordId, preguntaPaciente }),
  }).catch(err => console.error('[nova] error enviando alerta Telegram:', err.message));
}

// ─── EJECUCIÓN DE ACCIONES (Airtable) ──────────────────────────────
async function ejecutarAccionesPaciente({ accion, pacRecordId, pacMedicoLink, esVipReal, pacienteCode, ultimoMensajePaciente }) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
  const tareas = [];

  if (accion.crear_solicitud_cita) {
    tareas.push((async () => {
      try {
        const { medicoAsignadoId, ciudadPaciente, nombrePaciente } =
          await encontrarMedicoParaPaciente(pacRecordId, pacMedicoLink, AIRTABLE_TOKEN);

        const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID_CLINICA}/${TBL_SOLICITUDES_CITA}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            typecast: true,
            records: [{
              fields: {
                'Fecha solicitud': new Date().toISOString(),
                'Paciente': [pacRecordId],
                'Médico asignado': medicoAsignadoId ? [medicoAsignadoId] : [],
                'Tipo': accion.solicitud_tipo || 'Consulta presencial',
                'Motivo': accion.solicitud_motivo || '(sin motivo especificado)',
                'Estado': 'Pendiente',
                'Prioridad': esVipReal ? 'Alta' : 'Normal',
                'Canal preferido': accion.solicitud_tipo === 'Video llamada' ? 'Video llamada' : 'WhatsApp',
              },
            }],
          }),
        });
        if (!createRes.ok) {
          console.error('[nova] error creando SOLICITUDES_CITA:', await createRes.text());
          return;
        }

        await enviarAlertaMedico({
          medicoAsignadoId,
          mensaje:
            `Nueva solicitud de consulta CODE CELLS®\n\n` +
            `Paciente: ${nombrePaciente || pacienteCode}${ciudadPaciente ? ` (${ciudadPaciente})` : ''}\n` +
            `Motivo: ${accion.solicitud_motivo || '(sin motivo especificado)'}\n` +
            `Prioridad: ${esVipReal ? 'Alta' : 'Normal'}\n\n` +
            `Responde este mensaje (Reply) en Telegram para confirmarle la cita directo al paciente — NOVA le entrega tu respuesta en su próxima conversación. También puedes revisar el Portal Médico.`,
          pacienteRecordId: pacRecordId,
          preguntaPaciente: ultimoMensajePaciente || accion.solicitud_motivo || 'Solicitud de cita',
          AIRTABLE_TOKEN,
        });
      } catch (err) {
        console.error('[nova] error en flujo crear_solicitud_cita:', err.message);
      }
    })());
  }

  if (accion.requiere_valoracion_medica) {
    tareas.push((async () => {
      try {
        const { medicoAsignadoId, ciudadPaciente, nombrePaciente } =
          await encontrarMedicoParaPaciente(pacRecordId, pacMedicoLink, AIRTABLE_TOKEN);

        await enviarAlertaMedico({
          medicoAsignadoId,
          mensaje:
            `Paciente solicita valoración clínica\n\n` +
            `Paciente: ${nombrePaciente || pacienteCode}${ciudadPaciente ? ` (${ciudadPaciente})` : ''}\n` +
            `Motivo: ${accion.motivo_valoracion || ultimoMensajePaciente}\n\n` +
            `Responde este mensaje (Reply) en Telegram para contestarle directo al paciente — NOVA le entrega tu respuesta en su próxima conversación.`,
          pacienteRecordId: pacRecordId,
          preguntaPaciente: ultimoMensajePaciente,
          AIRTABLE_TOKEN,
        });
      } catch (err) {
        console.error('[nova] error en flujo requiere_valoracion_medica:', err.message);
      }
    })());
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
