/**
 * CODE CELLS® — Sistema i18n v5.0
 * BUILD-MARKER: i18n-v5-2026-08-03 — busca esta cadena en el raw de
 * GitHub y en codecells.mx/lib/i18n.js para confirmar que el deploy sí subió.
 * ================================================================
 * REEMPLAZA por completo a lib/i18n.js v4.0.
 *
 * POR QUÉ v4.0 NO TRADUCÍA NADA (bug raíz, verificado en el repo):
 *   Las llaves del diccionario venían envueltas en comillas literales:
 *       '"Es la edad."': '"It\'s just aging."'
 *   ...pero el nodo de texto real del DOM es:  “Es la edad.”
 *   Dos errores encimados: (1) las comillas envolventes formaban parte
 *   de la llave, (2) el HTML usa comillas tipográficas “ ” (U+201C/201D)
 *   y el diccionario usaba comillas rectas ASCII " ".
 *   Resultado: de ~55 entradas, solo 3 podían coincidir. Por eso la
 *   página se veía mezclada: el <script> sí cargaba, pero no traducía.
 *
 * QUÉ CAMBIA EN v5.0:
 *   1. Llaves = texto EXACTO tal como aparece en el DOM (sin envolver,
 *      con las comillas tipográficas reales). Extraídas del HTML real.
 *   2. Coincidencia a nivel de ELEMENTO además de nodo de texto, para
 *      frases partidas por <br>/<span> ("No envejeces de" + "una sola forma").
 *   3. Traduce atributos: placeholder, title, alt, aria-label + <title>.
 *      NUNCA traduce value= (rompería los <option> y lo que se guarda
 *      en Airtable: value="diabetica" debe seguir siendo "diabetica").
 *   4. Cambio de idioma SIN recargar: guarda el original de cada nodo
 *      tocado y lo restaura al volver a ES.
 *   5. Relleno automático: lo que no esté en el diccionario se traduce
 *      con Claude vía /api/nova-asistente-clinico (accion: "traducir")
 *      y se cachea en localStorage. Esto es lo que evita que la página
 *      se vuelva a "mezclar" cada vez que alguien edita el HTML.
 *   6. BLINDAJE DE DATOS CLÍNICOS: en portal-medico / mi-nivel /
 *      portal-vip / kiosco / autorregistro, el contenido inyectado
 *      dinámicamente (= datos de paciente) NUNCA sale hacia la API de
 *      traducción. Solo se traduce con diccionario local.
 *   7. Selector de idioma autoconstruido con CSS propio (arregla el bug
 *      de "el botón está mal posicionado": ya no depende del CSS de cada
 *      página).
 *
 * API pública:
 *   setLanguage('es'|'en'|'fr'|'pt'|'de')  ·  getLanguage()  ·  t(texto)
 *   translateNow()  ·  i18nExport()  ·  i18nStats()
 */

(function () {
  'use strict';

  var VERSION = '5.0';
  var LANG_KEY = 'code_cells_lang';
  var CACHE_KEY = 'cc_i18n_cache_';
  var ENDPOINT = '/api/nova-asistente-clinico';

  var SUPPORTED = {
    es: 'ES',
    en: 'EN',
    fr: 'FR',
    pt: 'PT',
    de: 'DE'
  };

  // ================================================================
  // 1. TÉRMINOS BLOQUEADOS — nunca se traducen
  // ================================================================
  // Marcas, unidades, códigos, tipos de sangre, protocolos de ayuno.
  var LOCKED = {};
  [
    'CODE CELLS', 'CODE CELLS®', 'CODE CELLS™', '🔬 CODE CELLS®',
    'CODE ENERGY™', 'CODE REPAIR™', 'CODE BALANCE™', 'CODE NEURO™', 'CODE REGEN™',
    'DEZAWA PROTOCOL™', 'Panel DEZAWA™', 'NOVA', 'NOVA LABS', 'RESTORE™',
    'ACTIVATE™', 'GENESIS™', 'CONTINUUM™', 'REGENESIS CONTINUUM™',
    'Code Cells', 'Code Cells logo', 'DASH', 'dash',
    'kg', 'cm', '°C', 'mmHg', 'lpm', 'rpm', 'USG', 'RX', 'CC', 'ID:',
    'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-',
    '16_8', '18_6', '20_4', '12_12', '14_10',
    'Sat. O2', 'Safari', 'Email', 'WhatsApp', 'Airtable', 'Google Calendar'
  ].forEach(function (s) { LOCKED[s] = true; });

  // Patrones que jamás se envían a traducir ni se tocan.
  var LOCKED_RE = [
    /^(CC-PAC-|CCMED-|DZW-|FOUNDER-|INV-|CIE-|ICD-)/i,
    /^[\W\d\s_·—–\-+.:,%/()]+$/,          // solo símbolos/números
    /^https?:\/\//i,
    /@[\w.-]+\.\w+/,                       // correos
    /^\{\{|\$\{/,                          // plantillas
    /^[A-Z]\d{2}(\.\d)?$/                  // códigos CIE-10 sueltos (E11.9)
  ];

  // Páginas que manejan datos de paciente: su contenido dinámico
  // nunca se manda a la API de traducción.
  var PHI_PAGES = ['portal-medico', 'mi-nivel', 'portal-vip', 'kiosco', 'autorregistro'];

  function esPaginaConDatosClinicos() {
    var p = (location.pathname || '').toLowerCase();
    return PHI_PAGES.some(function (n) { return p.indexOf(n) !== -1; });
  }

  // ================================================================
  // 2. DICCIONARIO SEMILLA — EN
  // ================================================================
  // Llaves = texto exacto extraído del HTML de producción.
  // Estas se aplican al instante, sin llamar a la API (cero latencia,
  // cero costo) y garantizan la voz de marca en lo más visible.
  var SEED_EN = {
    // ── Landing: narrativa principal ───────────────────────────────
    'No envejeces de': 'You don’t age in',
    'una sola forma': 'just one way',
    'CODE CELLS™ — No envejeces de una sola forma': 'CODE CELLS™ — You don’t age in just one way',
    'Evaluación Cronodegenerativa CODE CELLS': 'CODE CELLS Chronodegenerative Assessment',
    'Evaluación y optimización biológica': 'Biological assessment and optimization',
    '“Escucha el lenguaje silencioso de tu biología.”': '“Listen to the silent language of your biology.”',
    'Un viaje de descubrimiento, no un trámite médico.': 'A journey of discovery, not medical paperwork.',
    'No ofrecemos consultas. Ofrecemos comprensión de tu biología.': 'We don’t offer appointments. We offer an understanding of your biology.',
    'No envejecemos de una sola forma. Cada persona sigue una ruta distinta.': 'We don’t age in a single way. Each person follows a different path.',
    'Cinco sistemas biológicos sostienen tu energía, tu reparación, tu equilibrio, tu mente y tu capacidad de renovarte. Cada persona pierde función en uno de ellos primero. CODE CELLS™ te ayuda a descubrir cuál.': 'Five biological systems sustain your energy, your repair, your balance, your mind and your capacity to renew. Each person loses function in one of them first. CODE CELLS™ helps you discover which one.',
    'La biología pierde eficiencia mucho antes del diagnóstico.': 'Biology loses efficiency long before any diagnosis.',
    'La medicina tradicional suele intervenir cuando la enfermedad ya es visible. Pero años antes del diagnóstico, los sistemas biológicos ya comenzaron a perder rendimiento.': 'Conventional medicine usually steps in once disease is already visible. But years before a diagnosis, biological systems have already begun to lose performance.',
    'La mayoría de las personas interpreta estos cambios como algo inevitable.': 'Most people read these changes as something inevitable.',
    'Toca cada sistema para conocer qué representa y qué señales indican que está perdiendo función. O mejor — responde la evaluación y descúbrelo directamente.': 'Tap each system to see what it represents and which signals indicate it is losing function. Better still — take the assessment and find out directly.',
    'Descubres que no envejeces de una sola forma, y empiezas a preguntarte cómo estás envejeciendo tú.': 'You discover that you don’t age in a single way, and you begin to ask how you are aging.',
    'Te identificas con uno o varios sistemas. Dejas de leer sobre CODE CELLS™ y empiezas a pensar en ti.': 'You recognize yourself in one or more systems. You stop reading about CODE CELLS™ and start thinking about yourself.',
    'La consulta se convierte en el siguiente paso lógico — por comprensión, no por presión.': 'The consultation becomes the logical next step — through understanding, not pressure.',
    'Da el primer paso para entender qué sistema de tu biología necesita atención primero.': 'Take the first step toward understanding which system of your biology needs attention first.',
    'Recibes un mapa biológico simplificado: una narrativa, no solo una puntuación.': 'You receive a simplified biological map: a narrative, not just a score.',
    'No envejeces de una sola forma. Identificación temprana de patrones de pérdida funcional.': 'You don’t age in a single way. Early identification of functional decline patterns.',
    '5 sistemas · 9 preguntas · menos de 3 minutos.': '5 systems · 9 questions · under 3 minutes.',
    'Responde con honestidad. Esto te ayudará a descubrir qué sistema biológico está perdiendo función primero.': 'Answer honestly. This will help you discover which biological system is losing function first.',

    // ── Landing: citas del recorrido emocional ────────────────────
    '“Es la edad.”': '“It’s just age.”',
    '“Yo tengo poca energía.”': '“I just have low energy.”',
    '“Ahora entiendo.”': '“Now I understand.”',
    '“Esto es diferente.”': '“This is different.”',
    '“Existe una oportunidad.”': '“There is an opportunity.”',
    'El problema': 'The problem',
    'La idea central': 'The core idea',
    'Los cinco sistemas': 'The five systems',
    'El primer paso': 'The first step',
    'Cómo funciona': 'How it works',
    'Curiosidad': 'Curiosity',
    'Reconocimiento': 'Recognition',
    'Revelación': 'Revelation',
    'Acción': 'Action',
    'Incluye': 'Includes',
    'Señales de pérdida': 'Signs of decline',
    'Desplázate': 'Scroll',
    'Ver señales': 'View signals',
    'Conoce los 5 sistemas': 'Explore the 5 systems',
    'Realiza tu evaluación': 'Take your assessment',
    'Comenzar evaluación': 'Start assessment',
    'Cerrar evaluación': 'Close assessment',
    'La evaluación escucha': 'The assessment listens',
    'Los resultados interpretan': 'The results interpret',
    'La consulta profundiza': 'The consultation goes deeper',
    'Los protocolos optimizan': 'The protocols optimize',
    'Agenda por WhatsApp': 'Book via WhatsApp',
    'Reproducir música': 'Play music',
    '© 2026 CODE CELLS™': '© 2026 CODE CELLS™',

    // ── Los 5 sistemas: definiciones y señales ────────────────────
    'La capacidad del organismo para producir energía utilizable.': 'The body’s capacity to produce usable energy.',
    'La capacidad biológica de reparar daño.': 'The biological capacity to repair damage.',
    'La capacidad de adaptación del organismo.': 'The body’s capacity to adapt.',
    'La función neurológica superior.': 'Higher neurological function.',
    'La capacidad de regeneración y renovación.': 'The capacity for regeneration and renewal.',
    'Producción energética celular': 'Cellular energy production',
    'Función mitocondrial': 'Mitochondrial function',
    'Metabolismo': 'Metabolism',
    'Vitalidad física': 'Physical vitality',
    'Reparación celular': 'Cellular repair',
    'Recuperación tisular': 'Tissue recovery',
    'Control inflamatorio': 'Inflammatory control',
    'Cicatrización deficiente': 'Impaired wound healing',
    'Homeostasis': 'Homeostasis',
    'Regulación neuroendocrina': 'Neuroendocrine regulation',
    'Resiliencia biológica': 'Biological resilience',
    'Manejo del estrés': 'Stress management',
    'Claridad mental': 'Mental clarity',
    'Velocidad cognitiva': 'Cognitive speed',
    'Concentración': 'Focus',
    'Memoria': 'Memory',
    'Atención': 'Attention',
    'Renovación tisular': 'Tissue renewal',
    'Potencial regenerativo': 'Regenerative potential',
    'Plasticidad biológica': 'Biological plasticity',
    'Recuperación global': 'Global recovery',
    'Fatiga': 'Fatigue',
    'Más fatiga': 'More fatigue',
    'Más estrés': 'More stress',
    'Menos energía': 'Less energy',
    'Insomnio': 'Insomnia',
    'Ansiedad': 'Anxiety',
    'Irritabilidad': 'Irritability',
    'Niebla mental': 'Brain fog',
    'Distracción': 'Distraction',
    'Lentitud física': 'Physical sluggishness',
    'Lentitud cognitiva': 'Cognitive slowing',
    'Aumento de peso': 'Weight gain',
    'Baja productividad': 'Low productivity',
    'Menor recuperación': 'Reduced recovery',
    'Recuperación lenta': 'Slow recovery',
    'Recuperación limitada': 'Limited recovery',
    'Pérdida de enfoque': 'Loss of focus',
    'Problemas de memoria': 'Memory problems',
    'Lesiones recurrentes': 'Recurring injuries',
    'Inflamación persistente': 'Persistent inflammation',
    'Sobrecarga fisiológica': 'Physiological overload',
    'Envejecimiento acelerado': 'Accelerated aging',
    'Resistencia': 'Endurance',
    'Menor capacidad adaptativa': 'Reduced adaptive capacity',
    'Menor capacidad regenerativa': 'Reduced regenerative capacity',
    'Pérdida progresiva de función': 'Progressive loss of function',

    // ── NOVA (widget público) ─────────────────────────────────────
    'NOVA — Asistente de CODE CELLS®': 'NOVA — CODE CELLS® Assistant',
    'Asistente IA · CODE CELLS®': 'AI Assistant · CODE CELLS®',
    'NOVA prepara tu consulta. No reemplaza diagnóstico médico.': 'NOVA prepares your consultation. It does not replace a medical diagnosis.',
    'Escribe tu mensaje…': 'Write your message…',
    'Mensaje para NOVA': 'Message for NOVA',
    'Cerrar NOVA': 'Close NOVA',
    'Consultar NOVA': 'Ask NOVA',

    // ── Navegación y acciones comunes ─────────────────────────────
    'Acceso médico': 'Physician access',
    'Portal Médico': 'Physician Portal',
    'MODO MÉDICO': 'PHYSICIAN MODE',
    'Enviar': 'Send',
    'Guardar': 'Save',
    'Cancelar': 'Cancel',
    'Cerrar': 'Close',
    'Limpiar': 'Clear',
    'Copiar': 'Copy',
    'Compartir': 'Share',
    'Ingresar': 'Sign in',
    'Salir': 'Log out',
    'Ver': 'View',
    'Toca': 'Tap',
    'Hoy': 'Today',
    'Ahora no': 'Not now',
    'Otro': 'Other',
    'Otros': 'Other',
    'Todos': 'All',
    'todos': 'all',
    'Ninguno': 'None',
    'Opcional': 'Optional',
    'Selecciona': 'Select',
    'Seleccionar…': 'Select…',
    'Seleccionar...': 'Select...',
    'Personalizado': 'Custom',
    'Total': 'Total',
    'Fecha': 'Date',
    'Hora': 'Time',
    'Ciudad': 'City',
    'Cambiar tema': 'Switch theme',
    'Instalar app': 'Install app',
    '"Instalar app"': '"Install app"',
    '"Agregar"': '"Add"',
    'Toca el botón': 'Tap the button',
    'Toca el ícono de': 'Tap the icon for',
    'de abajo.': 'below.',
    'Elegir archivo…': 'Choose file…',
    '+ Nuevo': '+ New',
    '+ Agregar valor': '+ Add value',
    '✏️ Editar': '✏️ Edit',
    '🗑️ Eliminar': '🗑️ Delete',
    '↓ PDF': '↓ PDF',
    '🔗 Mi link': '🔗 My link',
    '📋 Ver Detalles': '📋 View details',
    '📋 Copiar resumen': '📋 Copy summary',
    'Ordenar fechas': 'Sort by date',
    'Rango de fechas': 'Date range',
    'Fecha inicial': 'Start date',
    'Fecha final': 'End date',
    'asc': 'asc',
    'desc': 'desc',

    // ── Días de la semana ─────────────────────────────────────────
    'Lunes': 'Monday',
    'Martes': 'Tuesday',
    'Miércoles': 'Wednesday',
    'Jueves': 'Thursday',
    'Viernes': 'Friday',
    'MARZO': 'MARCH',

    // ── Portal médico: estructura clínica ─────────────────────────
    'Mis pacientes': 'My patients',
    'Buscar paciente…': 'Search patient…',
    'Buscar parámetro': 'Search parameter',
    'Nueva consulta': 'New consultation',
    'Consulta general': 'General consultation',
    'Guardar consulta': 'Save consultation',
    'Datos generales': 'General information',
    'Historia clínica': 'Clinical history',
    'Consultas': 'Consultations',
    'Laboratorios': 'Laboratory',
    'Nutrición': 'Nutrition',
    'Plan nutricional': 'Nutrition plan',
    'Receta médica': 'Prescription',
    '✦ Receta': '✦ Prescription',
    'Imprimir receta': 'Print prescription',
    '⇄ Interconsulta': '⇄ Referral',
    'Enviar solicitud': 'Send request',
    '📅 Mi Calendario': '📅 My calendar',
    '📅 Citas del día': '📅 Today’s appointments',
    '+ Nueva Cita': '+ New appointment',
    'Agendar Cita': 'Schedule appointment',
    'Próxima cita': 'Next appointment',
    'Guardar Horarios': 'Save schedule',
    '◈ Capacitación': '◈ Training',
    'Capacitación': 'Training',
    'Panel básico': 'Basic panel',
    'Panel hormonal': 'Hormone panel',
    'Panel DEZAWA™': 'DEZAWA™ Panel',
    'Signos vitales': 'Vital signs',
    'Peso': 'Weight',
    'Talla': 'Height',
    'Presión': 'Blood pressure',
    'Temperatura': 'Temperature',
    'Frec. cardiaca': 'Heart rate',
    'Cintura': 'Waist',
    'Grasa visceral': 'Visceral fat',
    'Grupo sanguíneo': 'Blood type',
    'Sexo': 'Sex',
    'Sexo biológico': 'Biological sex',
    'Masculino': 'Male',
    'Femenino': 'Female',
    'Nombre completo': 'Full name',
    'Nombre Apellido': 'First name Last name',
    'Código de médico': 'Physician code',
    'Ocupación': 'Occupation',
    'Escolaridad': 'Education',
    'Estado civil': 'Marital status',
    'Primaria': 'Primary school',
    'Secundaria': 'Middle school',
    'Preparatoria': 'High school',
    'Posgrado': 'Postgraduate',
    'Alergias': 'Allergies',
    'Tabaco': 'Tobacco',
    'Alcohol': 'Alcohol',
    'Actividad física': 'Physical activity',
    'Sesión #': 'Session #',
    'Paciente:': 'Patient:',
    'PACIENTE:': 'PATIENT:',
    'FECHA:': 'DATE:',
    'HORA:': 'TIME:',
    'SISTEMA:': 'SYSTEM:',
    'NOTAS:': 'NOTES:',
    'Notas (opcional)': 'Notes (optional)',
    'Activo': 'Active',
    'activo': 'active',
    'Activos': 'Active',
    'Pendiente': 'Pending',
    'pendiente': 'pending',
    'Completado': 'Completed',
    'completado': 'completed',
    'Suspendido': 'Suspended',
    'suspendido': 'suspended',
    'fuera': 'out of range',

    // ── Dietas y nutrición ────────────────────────────────────────
    'Tipo de dieta': 'Diet type',
    'Alimentación': 'Nutrition',
    'Días del plan': 'Plan duration (days)',
    'Vegana': 'Vegan',
    'Vegetariana': 'Vegetarian',
    'Cetogénica': 'Ketogenic',
    'Mediterránea': 'Mediterranean',
    'Hipocalórica': 'Low-calorie',
    'Normocalórica': 'Normocaloric',
    'Hiperproteica': 'High-protein',
    'Diabética': 'Diabetic',
    'Hepática': 'Hepatic',
    'Renal': 'Renal',
    'Antiinflamatorio': 'Anti-inflammatory',
    'Saciedad': 'Satiety',
    'Energía': 'Energy',
    'Mejorar energia': 'Improve energy',
    'Mejorar saciedad': 'Improve satiety',
    'ej. Glucosa…': 'e.g. Glucose…',

    // ── Portal médico: acceso y sesión ────────────────────────────
    'Medicina Regenerativa Avanzada': 'Advanced Regenerative Medicine',
    'Accede a expedientes clínicos, consultas, recetas e interconsultas de tus pacientes.': 'Access your patients’ medical records, consultations, prescriptions and referrals.',
    'Acceder al portal →': 'Enter the portal →',
    'Programa de certificación médica CODE CELLS®. 9 módulos en 3 niveles clínicos.': 'CODE CELLS® physician certification program. 9 modules across 3 clinical levels.',
    'Programa de certificación médica': 'Physician certification program',
    'Ir a capacitación →': 'Go to training →',
    'Bienvenido de nuevo': 'Welcome back',
    'Verificando acceso…': 'Verifying access…',
    'No soy yo — usar otro código': 'Not me — use another code',
    'Ingresa tu código de identificación para continuar.': 'Enter your identification code to continue.',
    'Tiempo restante de sesión': 'Session time remaining',

    // ── Portal médico: agenda y NOVA ──────────────────────────────
    'Agendar nueva cita': 'Schedule new appointment',
    'Conectar mi Google Calendar': 'Connect my Google Calendar',
    '⚙️ Configurar Horarios': '⚙️ Configure schedule',
    '🕐 10:00 AM': '🕐 10:00 AM',
    'Hola, soy NOVA en modo médico. Puedo ayudarte con protocolos CODE CELLS®, consultas clínicas, sugerencias de tratamiento y más. ¿En qué te apoyo?': 'Hello, I’m NOVA in physician mode. I can help you with CODE CELLS® protocols, clinical questions, treatment suggestions and more. How can I support you?',
    'Escribe tu consulta…': 'Write your question…',

    // ── Portal médico: pacientes y expediente ─────────────────────
    'Link para que el paciente se registre solo': 'Link for patients to self-register',
    'Registrar nuevo paciente': 'Register new patient',
    'Paciente compartido': 'Shared patient',
    'Cargando pacientes…': 'Loading patients…',
    'Selecciona un paciente del panel izquierdo para ver su expediente clínico completo.': 'Select a patient from the left panel to view their complete medical record.',
    'Volver a la lista de pacientes': 'Back to patient list',
    'Solicitar interconsulta a especialista de la red': 'Request a referral to a network specialist',
    'Exportar expediente completo en PDF': 'Export full medical record as PDF',
    'Generar receta médica': 'Generate prescription',
    'NOVA detectó elementos incompletos del expediente (NOM-004):': 'NOVA detected incomplete items in this record (NOM-004):',
    'Información personal': 'Personal information',
    'Fecha de nacimiento': 'Date of birth',
    'Teléfono WhatsApp': 'WhatsApp phone',
    'Licenciatura trunca': 'Some university',
    'Licenciatura terminada': 'University degree',
    'Antecedentes y diagnóstico': 'History and diagnosis',
    'Motivo de la entrevista': 'Reason for the interview',
    'Antecedentes heredofamiliares': 'Family medical history',
    'Medicamentos actuales': 'Current medications',
    'Guardar corrección': 'Save correction',
    'Ej. Nunca, Antes ya no, Sí actualmente': 'e.g. Never, Formerly, Currently yes',
    'Ej. Nunca, Rara vez, Socialmente': 'e.g. Never, Rarely, Socially',
    'Ej. Sedentario, 3x semana, Diario': 'e.g. Sedentary, 3x per week, Daily',

    // ── Portal médico: consultas y laboratorio ────────────────────
    'Historial de consultas (tuyas)': 'Consultation history (yours)',
    '⇄ Ver interconsultas': '⇄ View referrals',
    'Más antigua primero': 'Oldest first',
    'Más reciente primero': 'Newest first',
    'Todos los resultados': 'All results',
    'Solo fuera de rango': 'Out of range only',
    '⇄ Comparar fechas': '⇄ Compare dates',
    'Estudios en orden cronológico': 'Studies in chronological order',

    // ── Portal médico: plan nutricional ───────────────────────────
    'Automático (según diagnóstico)': 'Automatic (based on diagnosis)',
    'Cetogénica estricta': 'Strict ketogenic',
    'Ayuno intermitente': 'Intermittent fasting',
    'Peso actual (kg) — si no está en el expediente': 'Current weight (kg) — if not in the record',
    'Objetivos de la semana': 'Goals for the week',
    'Preservar músculo': 'Preserve muscle',
    'Controlar glucosa': 'Control blood glucose',
    'Controlar hipertensión': 'Control hypertension',
    'Evitar estreñimiento': 'Prevent constipation',
    'Generar plan alimenticio': 'Generate meal plan',
    'Este paciente aún no tiene un plan nutricional generado.': 'This patient does not have a nutrition plan yet.',
    '📋 Copiar para WhatsApp': '📋 Copy for WhatsApp'
  };

  var SEED = { es: null, en: SEED_EN, fr: {}, pt: {}, de: {} };

  // ================================================================
  // 3. ESTADO
  // ================================================================
  var currentLang = 'es';
  try { currentLang = localStorage.getItem(LANG_KEY) || 'es'; } catch (e) {}
  if (!SUPPORTED[currentLang]) currentLang = 'es';

  var remoteCache = {};   // texto -> traducción (idioma actual)
  var originals = [];     // [{node,tipo,attr,valor}] para restaurar a ES
  var pendientes = {};    // textos sin traducción, esperando la API
  var enviando = false;

  function cargarCache() {
    remoteCache = {};
    if (currentLang === 'es') return;
    try {
      var raw = localStorage.getItem(CACHE_KEY + currentLang);
      if (raw) remoteCache = JSON.parse(raw) || {};
    } catch (e) { remoteCache = {}; }
  }

  function guardarCache() {
    if (currentLang === 'es') return;
    try {
      localStorage.setItem(CACHE_KEY + currentLang, JSON.stringify(remoteCache));
    } catch (e) {
      // Cuota llena: el cache es prescindible, seguimos sin él.
      try { localStorage.removeItem(CACHE_KEY + currentLang); } catch (e2) {}
    }
  }

  cargarCache();

  // ================================================================
  // 4. TRADUCCIÓN DE UNA CADENA
  // ================================================================
  function dic() { return SEED[currentLang] || {}; }

  function esTraducible(txt) {
    if (!txt) return false;
    var t = txt.trim();
    if (t.length < 2 || t.length > 400) return false;
    if (LOCKED[t]) return false;
    for (var i = 0; i < LOCKED_RE.length; i++) {
      if (LOCKED_RE[i].test(t)) return false;
    }
    return true;
  }

  window.t = function (texto) {
    if (currentLang === 'es' || !texto) return texto;
    var t = texto.trim();
    if (!esTraducible(t)) return texto;
    var d = dic();
    if (d[t]) return texto.replace(t, d[t]);
    if (remoteCache[t]) return texto.replace(t, remoteCache[t]);
    return texto;
  };

  function traducirCadena(t, permitirRemoto) {
    var d = dic();
    if (d[t]) return d[t];
    if (remoteCache[t]) return remoteCache[t];
    if (permitirRemoto && esTraducible(t)) pendientes[t] = true;
    return null;
  }

  // ================================================================
  // 5. RECORRIDO DEL DOM
  // ================================================================
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, CODE: 1, PRE: 1, TEXTAREA: 1, SVG: 1, PATH: 1, NOSCRIPT: 1, CANVAS: 1 };
  var ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];
  // Nota deliberada: "value" NO está en la lista. Traducirlo rompería
  // los <option value="diabetica"> y guardaría texto en inglés en Airtable.

  function debeSaltar(el) {
    if (!el || !el.tagName) return true;
    if (SKIP_TAGS[el.tagName.toUpperCase()]) return true;
    if (el.hasAttribute && el.hasAttribute('data-no-i18n')) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function registrarOriginal(node, tipo, attr, valor) {
    originals.push({ node: node, tipo: tipo, attr: attr, valor: valor });
  }

  // ¿El elemento solo contiene texto e inline simples? Entonces podemos
  // tratar su textContent completo como una sola frase (arregla las
  // frases partidas por <br> o <span>).
  function esHojaDeTexto(el) {
    if (!el.children || el.children.length === 0) return true;
    if (el.children.length > 3) return false;
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      var tag = c.tagName.toUpperCase();
      if (tag !== 'BR' && tag !== 'SPAN' && tag !== 'B' && tag !== 'STRONG' &&
          tag !== 'I' && tag !== 'EM' && tag !== 'SMALL') return false;
      if (c.children && c.children.length) return false;
    }
    return true;
  }

  function traducirElemento(el, permitirRemoto) {
    if (debeSaltar(el)) return;

    // Atributos
    for (var a = 0; a < ATTRS.length; a++) {
      var attr = ATTRS[a];
      if (el.hasAttribute && el.hasAttribute(attr)) {
        var v = el.getAttribute(attr);
        var vt = (v || '').trim();
        if (esTraducible(vt)) {
          var tr = traducirCadena(vt, permitirRemoto);
          if (tr && tr !== vt) {
            registrarOriginal(el, 'attr', attr, v);
            el.setAttribute(attr, tr);
          }
        }
      }
    }

    // Frase completa del elemento (para frases partidas)
    if (esHojaDeTexto(el)) {
      var full = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (esTraducible(full)) {
        var d = dic();
        var trFull = d[full] || remoteCache[full];
        if (trFull && el.children.length === 0) {
          if (trFull !== full) {
            registrarOriginal(el, 'html', null, el.innerHTML);
            el.textContent = trFull;
          }
          return;
        }
      }
    }

    // Nodos de texto hijos
    var hijos = el.childNodes;
    for (var i = 0; i < hijos.length; i++) {
      var n = hijos[i];
      if (n.nodeType === 3) {
        var raw = n.nodeValue;
        var txt = raw.replace(/\s+/g, ' ').trim();
        if (!esTraducible(txt)) continue;
        var t2 = traducirCadena(txt, permitirRemoto);
        if (t2 && t2 !== txt) {
          registrarOriginal(n, 'text', null, raw);
          // Conservamos el espacio de los extremos para no pegar palabras.
          var pre = raw.match(/^\s*/)[0];
          var post = raw.match(/\s*$/)[0];
          n.nodeValue = pre + t2 + post;
        }
      } else if (n.nodeType === 1) {
        traducirElemento(n, permitirRemoto);
      }
    }
  }

  function traducirDocumento(root, permitirRemoto) {
    if (currentLang === 'es') return;
    traducirElemento(root || document.body, permitirRemoto !== false);

    // <title> del documento
    var tt = (document.title || '').trim();
    if (esTraducible(tt)) {
      var trt = traducirCadena(tt, permitirRemoto !== false);
      if (trt && trt !== tt) document.title = trt;
    }

    programarEnvio();
  }

  function restaurarEspanol() {
    for (var i = originals.length - 1; i >= 0; i--) {
      var o = originals[i];
      try {
        if (o.tipo === 'text') o.node.nodeValue = o.valor;
        else if (o.tipo === 'attr') o.node.setAttribute(o.attr, o.valor);
        else if (o.tipo === 'html') o.node.innerHTML = o.valor;
      } catch (e) {}
    }
    originals = [];
  }

  // ================================================================
  // 6. RELLENO AUTOMÁTICO VÍA API
  // ================================================================
  // Esto es lo que impide que la página vuelva a quedar "mezclada"
  // cuando alguien agrega texto nuevo al HTML sin tocar el diccionario.
  var envioTimer = null;

  function programarEnvio() {
    if (currentLang === 'es') return;
    if (window.I18N_AUTO === false) return;
    clearTimeout(envioTimer);
    envioTimer = setTimeout(enviarPendientes, 250);
  }

  function enviarPendientes() {
    if (enviando) return;
    var textos = Object.keys(pendientes).filter(function (t) {
      return !remoteCache[t] && !dic()[t];
    });
    if (textos.length === 0) return;

    enviando = true;
    var lote = textos.slice(0, 60);

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'traducir', idioma: currentLang, textos: lote })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        enviando = false;
        if (!data || !data.traducciones) return;
        var hubo = false;
        lote.forEach(function (orig) {
          delete pendientes[orig];
          var tr = data.traducciones[orig];
          if (tr && tr !== orig) { remoteCache[orig] = tr; hubo = true; }
        });
        if (hubo) {
          guardarCache();
          traducirElemento(document.body, false);
          document.dispatchEvent(new CustomEvent('i18n:updated'));
        }
        if (Object.keys(pendientes).length) programarEnvio();
      })
      .catch(function () {
        enviando = false;
        // Falla silenciosa a propósito: sin traducción remota la página
        // sigue funcionando con el diccionario local.
      });
  }

  // ================================================================
  // 7. API PÚBLICA
  // ================================================================
  window.getLanguage = function () { return currentLang; };
  window.getCurrentLanguage = window.getLanguage;

  window.setLanguage = function (lang) {
    if (!SUPPORTED[lang] || lang === currentLang) return false;
    restaurarEspanol();
    currentLang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    pendientes = {};
    cargarCache();
    if (lang !== 'es') traducirDocumento(document.body, true);
    pintarSelector();
    document.documentElement.setAttribute('lang', lang);
    document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: lang } }));
    return true;
  };

  window.translateNow = function () { traducirDocumento(document.body, true); };

  // Vuelca todo lo que la API tradujo, listo para pegarlo en SEED_EN
  // y volverlo permanente (y gratis).
  window.i18nExport = function () {
    var out = {};
    Object.keys(remoteCache).sort().forEach(function (k) { out[k] = remoteCache[k]; });
    var txt = JSON.stringify(out, null, 2);
    console.log(txt);
    try { navigator.clipboard.writeText(txt); console.log('[i18n] Copiado al portapapeles.'); } catch (e) {}
    return out;
  };

  window.i18nStats = function () {
    var s = {
      version: VERSION,
      idioma: currentLang,
      diccionarioSemilla: Object.keys(SEED_EN).length,
      cacheRemoto: Object.keys(remoteCache).length,
      pendientes: Object.keys(pendientes).length,
      nodosTocados: originals.length,
      paginaConDatosClinicos: esPaginaConDatosClinicos()
    };
    console.table(s);
    return s;
  };

  // ================================================================
  // 8. SELECTOR DE IDIOMA (autoconstruido, CSS propio)
  // ================================================================
  // Se construye solo para no depender del CSS de cada página — ese era
  // el bug de "el botón aparece en la posición equivocada".
  function pintarSelector() {
    var cont = document.getElementById('cc-i18n-switcher');
    if (!cont) return;
    Array.prototype.forEach.call(cont.querySelectorAll('button'), function (b) {
      if (b.getAttribute('data-lang') === currentLang) {
        b.classList.add('cc-i18n-on');
      } else {
        b.classList.remove('cc-i18n-on');
        if (!b.className) b.removeAttribute('class');
      }
    });
  }

  function construirSelector() {
    if (document.getElementById('cc-i18n-switcher')) return;
    if (window.I18N_SWITCHER === false) return;

    var css = document.createElement('style');
    css.textContent =
      '#cc-i18n-switcher{position:fixed;top:14px;right:14px;z-index:2147483000;' +
      'display:flex;gap:2px;padding:3px;border-radius:999px;' +
      'background:rgba(14,20,16,.72);backdrop-filter:blur(10px);' +
      '-webkit-backdrop-filter:blur(10px);border:1px solid rgba(232,163,61,.28);' +
      'font-family:"IBM Plex Mono",ui-monospace,monospace;box-shadow:0 4px 18px rgba(0,0,0,.35)}' +
      '#cc-i18n-switcher button{all:unset;cursor:pointer;padding:5px 9px;border-radius:999px;' +
      'font-size:11px;letter-spacing:.06em;color:rgba(255,255,255,.62);' +
      'transition:background .18s,color .18s;line-height:1}' +
      '#cc-i18n-switcher button:hover{color:#fff}' +
      '#cc-i18n-switcher button.cc-i18n-on{background:#E8A33D;color:#0E1410;font-weight:600}' +
      '@media(max-width:640px){#cc-i18n-switcher{top:auto;bottom:12px;right:12px;' +
      'transform:scale(.92);transform-origin:bottom right}}' +
      '@media print{#cc-i18n-switcher{display:none}}';
    document.head.appendChild(css);

    var box = document.createElement('div');
    box.id = 'cc-i18n-switcher';
    box.setAttribute('data-no-i18n', '');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Idioma / Language');

    Object.keys(SUPPORTED).forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = SUPPORTED[code];
      b.setAttribute('data-lang', code);
      b.setAttribute('aria-label', SUPPORTED[code]);
      b.addEventListener('click', function () { window.setLanguage(code); });
      box.appendChild(b);
    });

    document.body.appendChild(box);
    pintarSelector();
  }

  // ================================================================
  // 9. OBSERVADOR DE DOM
  // ================================================================
  // En páginas con datos de paciente, lo que se inyecta después de la
  // carga son datos clínicos: se traduce SOLO con diccionario local,
  // nunca se manda a la API.
  var permitirRemotoDinamico = !esPaginaConDatosClinicos();
  var pendingNodes = [];
  var obsTimer = null;

  var observer = new MutationObserver(function (mutations) {
    if (currentLang === 'es') return;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.addedNodes && m.addedNodes.length) {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType === 1 || n.nodeType === 3) pendingNodes.push(n);
        }
      }
    }
    if (!pendingNodes.length) return;
    clearTimeout(obsTimer);
    obsTimer = setTimeout(function () {
      var lote = pendingNodes.splice(0, pendingNodes.length);
      lote.forEach(function (n) {
        if (n.nodeType === 1) {
          if (n.id === 'cc-i18n-switcher') return;
          traducirElemento(n, permitirRemotoDinamico);
        } else if (n.nodeType === 3 && n.parentNode) {
          traducirElemento(n.parentNode, permitirRemotoDinamico);
        }
      });
      if (permitirRemotoDinamico) programarEnvio();
    }, 60);
  });

  // ================================================================
  // 10. ARRANQUE
  // ================================================================
  function iniciar() {
    document.documentElement.setAttribute('lang', currentLang);
    construirSelector();

    if (currentLang !== 'es') {
      // Primera pasada: el contenido estático del HTML sí puede ir a la
      // API — es texto de interfaz escrito por el equipo, no datos de
      // paciente.
      traducirDocumento(document.body, true);
    }

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  window.i18nVersion = VERSION;
})();
