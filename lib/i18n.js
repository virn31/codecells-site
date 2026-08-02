/**
 * NOVA i18n System v1.0
 * Sistema global de internacionalización para CODE CELLS®
 * 
 * Uso:
 * 1. Importar: <script src="/lib/i18n.js"></script>
 * 2. Marcar elementos: <h1 data-i18n="titulo_principal">Español default</h1>
 * 3. Inicializar: i18nInit()
 * 4. Cambiar idioma: setLanguage('en')
 * 
 * Idiomas soportados: es (español), en (english)
 */

// ============================================
// DICCIONARIO GLOBAL COMPLETO
// ============================================

const i18nDictionary = {
  es: {
    // === NAVBAR / HEADER ===
    volver: "← Volver",
    inicio: "Inicio",
    portal_medico: "Portal Médico",
    buscar_medico: "Buscar Médico",
    capacitacion: "Capacitación",
    afiliarse: "Afiliarse",
    logout: "Cerrar sesión",
    
    // === BÚSQUEDA DE MÉDICOS ===
    titulo_busca: "🔍 Encuentra tu Médico",
    especialidad: "Especialidad CODE Systems",
    estado: "Estado",
    todos_estados: "Todos los estados",
    otros: "Otros estados",
    ciudad_label: "Ciudad (opcional)",
    ciudad_placeholder: "Ej. Culiacán, Guadalajara",
    nivel: "Nivel Clínico",
    todos_niveles: "Todos los niveles",
    asociado: "Asociado",
    certificado: "Certificado",
    buscar: "🔎 Buscar",
    limpiar: "Limpiar",
    tip: "Tip:",
    tip_mensaje: "O pregúntale a NOVA en el chat de la derecha qué médico es mejor para tu caso. NOVA te hará un triage inteligente.",
    medicos_disponibles: "Médicos disponibles",
    sin_resultados: "👉 Usa los filtros de la izquierda o pregúntale a NOVA",
    no_hay_medicos: "❌ No hay médicos que cumplan esos criterios. Intenta con otros filtros.",
    nova_titulo: "NOVA Triage Inteligente",
    nova_placeholder: "Describe tu condición (ej: 'tengo dolor en rodillas')",
    
    // === PORTAL MÉDICO ===
    bienvenida_medico: "Bienvenido a Portal Médico",
    mis_pacientes: "Mis Pacientes",
    nueva_consulta: "Nueva Consulta",
    expediente: "Expediente",
    receta_digital: "Receta Digital",
    pdf_expediente: "Descargar PDF",
    mi_perfil: "Mi Perfil",
    cerrar_sesion: "Cerrar Sesión",
    
    // === CAPACITACIÓN ===
    titulo_capacitacion: "Capacitación CODE CELLS®",
    modulos_disponibles: "Módulos Disponibles",
    restaurar: "RESTORE™ (Básico)",
    activar: "ACTIVATE™ (Intermedio)",
    genesis: "GENESIS™ (Avanzado)",
    continuum: "CONTINUUM™ (Mantenimiento)",
    completa_modulo: "Completa este módulo para acceso a protocolos",
    puntuacion_requerida: "Puntuación requerida: 80%",
    calificacion: "Calificación:",
    reintentos_ilimitados: "Reintentos ilimitados",
    
    // === AFILIACIÓN ===
    titulo_afiliacion: "Únete a la Red CODE CELLS®",
    descubre_red: "Descubre la red de medicina regenerativa más exclusiva",
    datos_personales: "Datos Personales",
    especialidad: "Especialidad",
    ubicacion: "Ubicación",
    experiencia: "Experiencia",
    acuerdo_terminos: "Acepto los términos y condiciones",
    enviar_solicitud: "Enviar Solicitud",
    solicitud_enviada: "✅ Solicitud enviada. Nos pondremos en contacto pronto.",
    
    // === ERRORES Y VALIDACIONES ===
    campo_requerido: "Este campo es requerido",
    email_invalido: "Email inválido",
    error_conexion: "Error de conexión. Intenta de nuevo.",
    error_servidor: "Error del servidor. Por favor intenta más tarde.",
    cargando: "Cargando...",
    procesando: "Procesando...",
    exito: "✅ Éxito",
    error: "❌ Error",
    
    // === NOVA / IA ===
    nova_bienvenida: "¡Hola! Soy NOVA, tu asistente de diagnóstico. 👋 Cuéntame qué síntomas o condición tienes, y te sugeriré el médico especialista ideal.",
    nova_error: "Disculpa, hubo un error procesando tu solicitud. Intenta de nuevo.",
    nova_sugerencia: "Te sugiero contactar al Dr.",
    medico_seleccionado: "Me gustaría agendar con el Dr.",
    
    // === ACCIONES ===
    aceptar: "Aceptar",
    cancelar: "Cancelar",
    guardar: "Guardar",
    continuar: "Continuar",
    siguiente: "Siguiente",
    anterior: "Anterior",
    descargar: "Descargar",
    compartir: "Compartir",
    ver_mas: "Ver más",
    ver_menos: "Ver menos",
    
    // === PÁGINA PRINCIPAL ===
    titulo_principal: "Medicina Regenerativa Premium",
    subtitulo_principal: "La red certificada de especialistas en biología regenerativa",
    conoce_medicos: "Conoce nuestros médicos",
    aprende_protocolos: "Aprende nuestros protocolos",
    sistemas_code: "Sistemas CODE",
    energy: "ENERGY",
    repair: "REPAIR",
    balance: "BALANCE",
    neuro: "NEURO",
    regen: "REGEN",
    dezawa: "DEZAWA PROTOCOL™",
  },
  
  en: {
    // === NAVBAR / HEADER ===
    volver: "← Back",
    inicio: "Home",
    portal_medico: "Doctor Portal",
    buscar_medico: "Find Doctor",
    capacitacion: "Training",
    afiliarse: "Join Us",
    logout: "Sign Out",
    
    // === BÚSQUEDA DE MÉDICOS ===
    titulo_busca: "🔍 Find Your Doctor",
    especialidad: "CODE Systems Specialty",
    estado: "State/Region",
    todos_estados: "All regions",
    otros: "Other states",
    ciudad_label: "City (optional)",
    ciudad_placeholder: "E.g. Culiacán, Guadalajara",
    nivel: "Clinical Level",
    todos_niveles: "All levels",
    asociado: "Associate",
    certificado: "Certified",
    buscar: "🔎 Search",
    limpiar: "Clear",
    tip: "Tip:",
    tip_mensaje: "Or ask NOVA in the chat on the right what doctor is best for your case. NOVA will perform an intelligent triage.",
    medicos_disponibles: "Available doctors",
    sin_resultados: "👉 Use the filters on the left or ask NOVA",
    no_hay_medicos: "❌ No doctors match those criteria. Try different filters.",
    nova_titulo: "NOVA Intelligent Triage",
    nova_placeholder: "Describe your condition (e.g. 'I have knee pain')",
    
    // === PORTAL MÉDICO ===
    bienvenida_medico: "Welcome to Doctor Portal",
    mis_pacientes: "My Patients",
    nueva_consulta: "New Consultation",
    expediente: "Medical Record",
    receta_digital: "Digital Prescription",
    pdf_expediente: "Download PDF",
    mi_perfil: "My Profile",
    cerrar_sesion: "Sign Out",
    
    // === CAPACITACIÓN ===
    titulo_capacitacion: "CODE CELLS® Training",
    modulos_disponibles: "Available Modules",
    restaurar: "RESTORE™ (Basic)",
    activar: "ACTIVATE™ (Intermediate)",
    genesis: "GENESIS™ (Advanced)",
    continuum: "CONTINUUM™ (Maintenance)",
    completa_modulo: "Complete this module for protocol access",
    puntuacion_requerida: "Required score: 80%",
    calificacion: "Score:",
    reintentos_ilimitados: "Unlimited retries",
    
    // === AFILIACIÓN ===
    titulo_afiliacion: "Join the CODE CELLS® Network",
    descubre_red: "Discover the most exclusive regenerative medicine network",
    datos_personales: "Personal Information",
    especialidad: "Specialty",
    ubicacion: "Location",
    experiencia: "Experience",
    acuerdo_terminos: "I agree to the terms and conditions",
    enviar_solicitud: "Submit Application",
    solicitud_enviada: "✅ Application submitted. We'll be in touch soon.",
    
    // === ERRORES Y VALIDACIONES ===
    campo_requerido: "This field is required",
    email_invalido: "Invalid email",
    error_conexion: "Connection error. Please try again.",
    error_servidor: "Server error. Please try later.",
    cargando: "Loading...",
    procesando: "Processing...",
    exito: "✅ Success",
    error: "❌ Error",
    
    // === NOVA / IA ===
    nova_bienvenida: "Hello! I'm NOVA, your diagnostic assistant. 👋 Tell me what symptoms or condition you have, and I'll suggest the ideal specialist from our network.",
    nova_error: "Sorry, there was an error processing your request. Please try again.",
    nova_sugerencia: "I suggest contacting Dr.",
    medico_seleccionado: "I would like to schedule with Dr.",
    
    // === ACCIONES ===
    aceptar: "Accept",
    cancelar: "Cancel",
    guardar: "Save",
    continuar: "Continue",
    siguiente: "Next",
    anterior: "Previous",
    descargar: "Download",
    compartir: "Share",
    ver_mas: "Show more",
    ver_menos: "Show less",
    
    // === PÁGINA PRINCIPAL ===
    titulo_principal: "Premium Regenerative Medicine",
    subtitulo_principal: "The certified network of regenerative biology specialists",
    conoce_medicos: "Meet our doctors",
    aprende_protocolos: "Learn our protocols",
    sistemas_code: "CODE Systems",
    energy: "ENERGY",
    repair: "REPAIR",
    balance: "BALANCE",
    neuro: "NEURO",
    regen: "REGEN",
    dezawa: "DEZAWA PROTOCOL™",
  }
};

// ============================================
// FUNCIONES DEL SISTEMA i18n
// ============================================

let currentLanguage = localStorage.getItem('i18n_language') || 'es';

function i18nInit() {
  document.documentElement.lang = currentLanguage;
  
  if (!document.getElementById('i18nLanguageSelector')) {
    crearSelectorIdioma();
  }
  
  i18nTranslatePage();
  
  const selector = document.getElementById('i18nLanguageSelector');
  if (selector) {
    selector.addEventListener('change', (e) => {
      setLanguage(e.target.value);
    });
  }
}

function crearSelectorIdioma() {
  let navbar = document.querySelector('.navbar') || document.querySelector('header') || document.body;
  
  let navbarRight = navbar.querySelector('.navbar-right');
  if (!navbarRight) {
    navbarRight = document.createElement('div');
    navbarRight.className = 'navbar-right';
    navbar.appendChild(navbarRight);
  }
  
  const selector = document.createElement('select');
  selector.id = 'i18nLanguageSelector';
  selector.className = 'language-selector';
  selector.innerHTML = `
    <option value="es">Español</option>
    <option value="en">English</option>
  `;
  selector.value = currentLanguage;
  
  navbarRight.insertBefore(selector, navbarRight.firstChild);
  
  if (!document.getElementById('i18nStyles')) {
    const style = document.createElement('style');
    style.id = 'i18nStyles';
    style.textContent = `
      .language-selector {
        padding: 0.6rem 0.8rem;
        border: 2px solid #E8A33D;
        background: rgba(14, 20, 16, 0.5);
        color: #E8A33D;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 600;
        transition: all 0.3s;
        font-family: 'IBM Plex Sans', sans-serif;
      }
      
      .language-selector:hover {
        background: rgba(232, 163, 61, 0.1);
      }
      
      .language-selector:focus {
        outline: none;
        box-shadow: 0 0 0 2px #E8A33D;
      }
    `;
    document.head.appendChild(style);
  }
}

function setLanguage(lang) {
  if (!i18nDictionary[lang]) {
    console.error(`Idioma ${lang} no soportado`);
    return;
  }
  
  currentLanguage = lang;
  localStorage.setItem('i18n_language', lang);
  document.documentElement.lang = lang;
  
  const selector = document.getElementById('i18nLanguageSelector');
  if (selector) {
    selector.value = lang;
  }
  
  i18nTranslatePage();
  
  window.dispatchEvent(new CustomEvent('i18n-changed', { detail: { language: lang } }));
}

function i18nTranslatePage() {
  const dict = i18nDictionary[currentLanguage];
  
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) {
      el.placeholder = dict[key];
    }
  });
  
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (dict[key]) {
      el.title = dict[key];
    }
  });
  
  document.querySelectorAll('[data-i18n-alt]').forEach(el => {
    const key = el.getAttribute('data-i18n-alt');
    if (dict[key]) {
      el.alt = dict[key];
    }
  });
}

function t(key, defaultValue = '') {
  return i18nDictionary[currentLanguage][key] || defaultValue;
}

function getCurrentLanguage() {
  return currentLanguage;
}

function addTranslations(newDict) {
  Object.keys(newDict).forEach(lang => {
    if (i18nDictionary[lang]) {
      Object.assign(i18nDictionary[lang], newDict[lang]);
    }
  });
}

document.addEventListener('DOMContentLoaded', i18nInit);

if (typeof window !== 'undefined') {
  window.i18n = {
    init: i18nInit,
    setLanguage,
    t,
    getCurrentLanguage,
    addTranslations,
    _dictionary: i18nDictionary
  };
}
