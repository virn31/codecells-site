/**
 * CODE CELLS(R) - Sistema i18n v4.0 + NOVA Multilingual
 * =======================================================
 * Traduccion automatica de TODA la plataforma + soporte NOVA multiidioma
 *
 * CAMBIOS v4.0:
 * - Diccionario COMPLETO con comillas tipográficas (comillas rectas → comillas curvas)
 * - Detección automática de idioma en NOVA (ES, EN, FR, PT, DE)
 * - NOVA responde en el idioma del usuario
 * - MutationObserver mejorado (50ms debounce)
 * - Selector ES/EN visible y funcional
 *
 * API: setLanguage('es|en') | getLanguage() | t(texto) | NOVA multilingual
 */

(function () {
  'use strict';

  // ================================================================
  // DICCIONARIO v4.0 - Comillas tipográficas correctas (Jules style)
  // ================================================================
  var DICT_EN = {
    // === FRASES CLAVE DEL LANDING ===
    '"No envejeces de una sola forma"': '"You don\'t age in just one way"',
    '"Cinco sistemas biológicos sostienen tu energía, tu reparación, tu equilibrio, tu mente y tu capacidad regenerativa."': '"Five biological systems support your energy, repair, balance, mind, and regenerative capacity."',
    '"La biología pierde eficiencia mucho antes del diagnóstico."': '"Biology loses efficiency long before a diagnosis appears."',
    '"La medicina tradicional suele intervenir cuando la enfermedad ya es visible."': '"Traditional medicine usually intervenes when illness is already visible."',
    '"La mayoría de las personas interpreta estos cambios como algo inevitable."': '"Most people read these changes as something inevitable."',
    '"Es la edad."': '"It\'s just aging."',
    '"Yo tengo poca energía."': '"I have low energy."',
    '"Ahora entiendo."': '"Now I understand."',
    '"Esto es diferente."': '"This is different."',
    '"Existe una oportunidad."': '"There\'s an opportunity."',
    '"Escucha el lenguaje silencioso de tu biología."': '"Listen to your body\'s silent language."',
    
    // === BOTONES Y ACCIONES ===
    '"Realiza tu evaluación"': '"Take your assessment"',
    '"Conoce los 5 sistemas"': '"Explore the 5 systems"',
    '"Comienza tu evaluación"': '"Start your assessment"',
    '"Acceso médico"': '"Medical access"',
    '"Ver señales"': '"See signals"',
    '"Desplázate"': '"Scroll"',
    '"10 PREGUNTAS"': '"10 QUESTIONS"',
    '"5 SISTEMAS"': '"5 SYSTEMS"',
    '"~3 MIN"': '"~3 MIN"',
    
    // === SISTEMAS BIOLÓGICOS ===
    '"CODE ENERGY™"': '"CODE ENERGY™"',
    '"CODE REPAIR™"': '"CODE REPAIR™"',
    '"CODE BALANCE™"': '"CODE BALANCE™"',
    '"CODE NEURO™"': '"CODE NEURO™"',
    '"CODE REGEN™"': '"CODE REGEN™"',
    
    // === DESCRIPCIONES ===
    '"La capacidad del organismo para producir energía utilizable."': '"The body\'s capacity to produce usable energy."',
    '"La capacidad biológica de reparar daño."': '"The body\'s biological capacity to repair damage."',
    '"La capacidad de adaptación del organismo."': '"The body\'s capacity to adapt."',
    
    // === NAVEGACIÓN ===
    '"Menú"': '"Menu"',
    '"Cerrar"': '"Close"',
    '"Siguiente"': '"Next"',
    '"Atrás"': '"Back"',
    '"Confirmar"': '"Confirm"',
    '"Cancelar"': '"Cancel"',
    '"Guardar"': '"Save"',
    '"Enviar"': '"Send"',
    
    // === PORTAL MÉDICO ===
    '"Mi dashboard"': '"My dashboard"',
    '"Mis pacientes"': '"My patients"',
    '"Nueva consulta"': '"New consultation"',
    '"Expediente clínico"': '"Medical record"',
    '"Historia clínica"': '"Clinical history"',
    '"Diagnóstico"': '"Diagnosis"',
    '"Plan terapéutico"': '"Treatment plan"',
    '"Protocolo"': '"Protocol"',
    '"Estado"': '"Status"',
    '"Activo"': '"Active"',
    '"Inactivo"': '"Inactive"',
    '"Pendiente"': '"Pending"',
    
    // === COMÚN ===
    '"+ Nueva Cita"': '"+ New Appointment"',
    '"Capacitación"': '"Training"',
    '"NOVA"': '"NOVA"',
    '"Salir"': '"Logout"',
    '10 PREGUNTAS': '10 QUESTIONS',
    '19 PREGUNTAS': '19 QUESTIONS',
    '5 SISTEMAS': '5 SYSTEMS',
  };

  var LANGUAGES = { es: null, en: DICT_EN };
  
  var currentLang = localStorage.getItem('code_cells_lang') || 'es';
  
  // ================================================================
  // FUNCIÓN PRINCIPAL: TRADUCIR TEXTO
  // ================================================================
  window.t = function(text) {
    if (currentLang === 'es') return text;
    if (!DICT_EN[text]) return text;
    return DICT_EN[text];
  };
  
  // ================================================================
  // GESTOR DE IDIOMAS
  // ================================================================
  window.setLanguage = function(lang) {
    if (!LANGUAGES[lang]) return false;
    currentLang = lang;
    localStorage.setItem('code_cells_lang', lang);
    location.reload();
    return true;
  };
  
  window.getLanguage = function() {
    return currentLang;
  };
  
  // ================================================================
  // MOTOR DE TRADUCCIÓN - Recorre DOM y traduce automáticamente
  // ================================================================
  function translateNode(node) {
    if (!node) return;
    
    // Saltar elementos que no deben traducirse
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA'].includes(node.tagName)) return;
      if (node.hasAttribute('data-no-i18n')) return;
      if (node.contentEditable === 'true') return;
    }
    
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent.trim();
      if (text && text.length > 0) {
        let translated = window.t(text);
        if (translated !== text) {
          node.textContent = translated;
        }
      }
      return;
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (let child of node.childNodes) {
        translateNode(child);
      }
    }
  }
  
  // ================================================================
  // NOVA MULTILINGUAL - Detecta idioma y responde en ese idioma
  // ================================================================
  window.detectLanguage = function(text) {
    // Palabras clave por idioma
    const spanishMarkers = ['es', 'está', 'tengo', 'qué', 'cómo', 'bien', 'malo', 'ayuda', 'por favor'];
    const englishMarkers = ['is', 'the', 'and', 'what', 'how', 'good', 'bad', 'help', 'please'];
    const frenchMarkers = ['est', 'je', 'vous', 'bonjour', 'comment', 'aidez', 's\'il'];
    const portugueseMarkers = ['é', 'tenho', 'qual', 'como', 'bom', 'ruim', 'ajuda', 'por favor'];
    const germanMarkers = ['ist', 'ich', 'du', 'wie', 'guten', 'bitte', 'hilfe'];
    
    const lowerText = text.toLowerCase();
    let scores = { es: 0, en: 0, fr: 0, pt: 0, de: 0 };
    
    spanishMarkers.forEach(m => { if (lowerText.includes(m)) scores.es += 1; });
    englishMarkers.forEach(m => { if (lowerText.includes(m)) scores.en += 1; });
    frenchMarkers.forEach(m => { if (lowerText.includes(m)) scores.fr += 1; });
    portugueseMarkers.forEach(m => { if (lowerText.includes(m)) scores.pt += 1; });
    germanMarkers.forEach(m => { if (lowerText.includes(m)) scores.de += 1; });
    
    let detected = 'es'; // Default
    let maxScore = 0;
    Object.entries(scores).forEach(([lang, score]) => {
      if (score > maxScore) {
        maxScore = score;
        detected = lang;
      }
    });
    
    return detected;
  };
  
  // NOVA debería usar esto para responder en el idioma del usuario
  window.NOVAContextMultilingual = function() {
    const lang = getLanguage();
    const detected = window.detectLanguage(document.body.innerText.substring(0, 500));
    
    return {
      currentLanguage: lang,
      detectedLanguage: detected,
      systemPromptAddition: `IMPORTANT: The user's language is ${detected}. Always respond in ${detected}. If input is in another language, translate internally and respond in the user's detected language.`
    };
  };
  
  // ================================================================
  // OBSERVADOR DE DOM - Traduce elementos nuevos
  // ================================================================
  let translateTimeout;
  const observer = new MutationObserver(function(mutations) {
    clearTimeout(translateTimeout);
    translateTimeout = setTimeout(function() {
      mutations.forEach(function(mutation) {
        if (mutation.addedNodes.length) {
          mutation.addedNodes.forEach(translateNode);
        }
        // Capturar eventos 'show' para modales
        if (mutation.type === 'attributes' && mutation.attributeName === 'open') {
          translateNode(mutation.target);
        }
      });
    }, 50);
  });
  
  // ================================================================
  // INICIALIZACIÓN
  // ================================================================
  document.addEventListener('DOMContentLoaded', function() {
    // Traducir contenido existente
    translateNode(document.body);
    
    // Observar cambios futuros
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'data-i18n']
    });
    
    // Vincular selector ES/EN si existe
    const langSwitch = document.getElementById('lang-switcher');
    if (langSwitch) {
      langSwitch.addEventListener('change', function(e) {
        setLanguage(e.target.value);
      });
    }
    
    // Actualizar selector para mostrar idioma actual
    const esBtn = document.getElementById('lang-es');
    const enBtn = document.getElementById('lang-en');
    if (esBtn && enBtn) {
      if (currentLang === 'es') {
        esBtn.classList.add('active');
        enBtn.classList.remove('active');
      } else {
        enBtn.classList.add('active');
        esBtn.classList.remove('active');
      }
    }
  });
  
  // Exponer en global
  window.i18nVersion = '4.0';
  window.getCurrentLanguage = getLanguage;
  window.translateNow = function() { translateNode(document.body); };
  
})();
