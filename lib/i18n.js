/**
 * CODE CELLS(R) - Sistema i18n v3.0
 * =================================
 * Traduccion automatica de TODA la plataforma sin editar cada pagina.
 *
 * POR QUE v3: v2.0 requeria marcar cada elemento con data-i18n="clave". Con 28 paginas
 * (varias de mas de 6 MB) eso nunca se completo: el commit de migracion solo inserto el
 * <script> y dejo 0 elementos marcados, por eso no traducia nada.
 * v3.0 recorre el DOM y traduce por COINCIDENCIA EXACTA contra el diccionario.
 * Basta con incluir: <script src="/lib/i18n.js"></script>
 *
 * SEGURIDAD DE DATOS: solo se traduce texto cuya version normalizada existe EXACTA en el
 * diccionario. Nombres de pacientes, codigos (CC-PAC-, CCMED-), diagnosticos escritos por
 * el medico, cifras y notas clinicas NUNCA coinciden, por lo tanto NUNCA se traducen.
 * Se ignora todo lo que este dentro de script/style/code/pre/textarea, [contenteditable]
 * y cualquier elemento con data-no-i18n.
 *
 * API: setLanguage('en') | getLanguage() | t(texto) | i18nAddLanguage(cod,dict) | i18nMissing()
 */

(function () {
  'use strict';

  var DICT_EN = {
    // ---------- Navegacion / global ----------
    'Inicio': 'Home',
    'Volver': 'Back',
    'Salir': 'Log out',
    'Cerrar sesion': 'Log out',
    'Cerrar sesión': 'Log out',
    'Acceso médico': 'Physician access',
    'Portal Médico': 'Physician Portal',
    'Portal Paciente': 'Patient Portal',
    'Buscar Médico': 'Find a Physician',
    'Capacitación': 'Training',
    'Contacto': 'Contact',
    'Cancelar': 'Cancel',
    'Guardar': 'Save',
    'Guardar cambios': 'Save changes',
    'Enviar': 'Send',
    'Continuar': 'Continue',
    'Siguiente': 'Next',
    'Anterior': 'Previous',
    'Cerrar': 'Close',
    'Copiar': 'Copy',
    'Ver': 'View',
    'Buscar': 'Search',
    'Seleccionar…': 'Select…',
    'Selecciona': 'Select',
    'Todos': 'All',
    'Ninguno': 'None',
    'Cargando...': 'Loading...',
    'Cargando…': 'Loading…',
    '✏️ Editar': '✏️ Edit',
    'Editar': 'Edit',
    'Imprimir': 'Print',
    'Descargar': 'Download',
    'Descargar PDF': 'Download PDF',
    'Actualizar': 'Refresh',
    'Confirmar': 'Confirm',
    'Aceptar': 'Accept',
    'Opcional': 'Optional',
    'Requerido': 'Required',
    'Código': 'Code',
    'Ingresar': 'Sign in',

    // ---------- Marca / home ----------
    'Medicina Regenerativa Avanzada': 'Advanced Regenerative Medicine',
    'Evaluación y optimización biológica': 'Biological assessment and optimization',
    'No envejeces de': 'You do not age in',
    'una sola forma': 'a single way',
    'No envejecemos de una sola forma. Cada persona sigue una ruta distinta.': 'We do not all age the same way. Each person follows a different path.',
    'Conoce los 5 sistemas': 'Explore the 5 systems',
    'Los cinco sistemas': 'The five systems',
    'Desplázate': 'Scroll',
    'El problema': 'The problem',
    'La biología pierde eficiencia mucho antes del diagnóstico.': 'Biology loses efficiency long before a diagnosis appears.',
    'La mayoría de las personas interpreta estos cambios como algo inevitable.': 'Most people read these changes as something inevitable.',
    'Comenzar evaluación': 'Start assessment',
    'Realiza tu evaluación': 'Take your assessment',
    'Ver señales': 'See signs',
    'Señales de pérdida': 'Signs of decline',
    'Incluye': 'Includes',
    'Menos energía': 'Less energy',
    'Más fatiga': 'More fatigue',
    'Menor recuperación': 'Slower recovery',
    'Más estrés': 'More stress',
    'Problemas de memoria': 'Memory problems',
    'Menor capacidad regenerativa': 'Reduced regenerative capacity',

    // ---------- Sistemas CODE ----------
    'La capacidad del organismo para producir energía utilizable.': 'The capacity of the body to produce usable energy.',
    'La capacidad biológica de reparar daño.': 'The biological capacity to repair damage.',
    'La capacidad de adaptación del organismo.': 'The capacity of the body to adapt.',
    'La función neurológica superior.': 'Higher neurological function.',
    'Función mitocondrial': 'Mitochondrial function',
    'Metabolismo': 'Metabolism',
    'Vitalidad física': 'Physical vitality',
    'Resistencia': 'Endurance',
    'Producción energética celular': 'Cellular energy production',
    'Fatiga': 'Fatigue',
    'Baja productividad': 'Low productivity',
    'Aumento de peso': 'Weight gain',
    'Lentitud física': 'Physical sluggishness',
    'Reparación celular': 'Cellular repair',
    'Recuperación tisular': 'Tissue recovery',
    'Control inflamatorio': 'Inflammatory control',
    'Mantenimiento estructural': 'Structural maintenance',
    'Recuperación lenta': 'Slow recovery',
    'Inflamación persistente': 'Persistent inflammation',
    'Lesiones recurrentes': 'Recurring injuries',
    'Cicatrización deficiente': 'Poor wound healing',
    'Regulación neuroendocrina': 'Neuroendocrine regulation',
    'Manejo del estrés': 'Stress management',
    'Resiliencia biológica': 'Biological resilience',
    'Ansiedad': 'Anxiety',
    'Insomnio': 'Insomnia',
    'Irritabilidad': 'Irritability',
    'Sobrecarga fisiológica': 'Physiological overload',
    'Atención': 'Attention',
    'Memoria': 'Memory',
    'Concentración': 'Focus',
    'Claridad mental': 'Mental clarity',

    // ---------- Niveles / protocolos ----------
    'Nivel': 'Level',
    'Nivel clínico': 'Clinical level',
    'Nivel Clínico': 'Clinical Level',
    'Protocolo': 'Protocol',
    'Protocolo actual': 'Current protocol',
    'Protocolos': 'Protocols',
    'Básico': 'Basic',
    'Intermedio': 'Intermediate',
    'Avanzado': 'Advanced',
    'Mantenimiento': 'Maintenance',

    // ---------- Portal medico ----------
    'MODO MÉDICO': 'PHYSICIAN MODE',
    'Mis pacientes': 'My patients',
    'Mis Pacientes': 'My Patients',
    'Paciente:': 'Patient:',
    'Paciente': 'Patient',
    'Pacientes': 'Patients',
    'Expediente': 'Medical record',
    'Expediente completo': 'Complete medical record',
    'Datos generales': 'General information',
    'Historia clínica': 'Medical history',
    'Consultas': 'Consultations',
    'Nueva consulta': 'New consultation',
    'Consulta': 'Consultation',
    'Motivo de consulta': 'Chief complaint',
    'Diagnóstico (CIE-10)': 'Diagnosis (ICD-10)',
    'Diagnóstico': 'Diagnosis',
    'Exploración física': 'Physical examination',
    'Plan terapéutico': 'Treatment plan',
    'Notas internas': 'Internal notes',
    'Próxima cita': 'Next appointment',
    'Tipo de consulta': 'Consultation type',
    'Número de sesión': 'Session number',
    'Fecha de consulta': 'Consultation date',
    'Guardar consulta': 'Save consultation',
    'Interconsulta': 'Referral',
    'Interconsultas': 'Referrals',
    'Solicitar interconsulta': 'Request referral',
    'Receta': 'Prescription',
    'Receta digital': 'Digital prescription',
    'Medicamentos': 'Medications',
    'Indicaciones': 'Instructions',
    'Dosis': 'Dosage',
    'Frecuencia': 'Frequency',
    'Duración': 'Duration',
    'Estudios': 'Studies',
    'Estudios subidos': 'Uploaded studies',
    'Subir estudio': 'Upload study',
    'Nutrición': 'Nutrition',
    'Plan nutricional': 'Nutrition plan',
    'Médico': 'Physician',
    'Médicos': 'Physicians',
    'Cédula': 'License number',
    'Cédula profesional': 'Professional license',
    'Especialidad': 'Specialty',
    'Firma': 'Signature',

    // ---------- Datos clinicos / formularios ----------
    'Nombre': 'Name',
    'Nombre completo': 'Full name',
    'Edad': 'Age',
    'Sexo': 'Sex',
    'Sexo biológico': 'Biological sex',
    'Femenino': 'Female',
    'Masculino': 'Male',
    'Fecha de nacimiento': 'Date of birth',
    'Teléfono': 'Phone',
    'Correo electrónico': 'Email',
    'Ciudad': 'City',
    'Estado': 'State',
    'Dirección': 'Address',
    'Estado civil': 'Marital status',
    'Ocupación': 'Occupation',
    'Grupo sanguíneo': 'Blood type',
    'Escolaridad': 'Education',
    'Primaria': 'Primary school',
    'Secundaria': 'Middle school',
    'Preparatoria': 'High school',
    'Licenciatura trunca': 'Some college',
    'Licenciatura terminada': 'Bachelor degree',
    'Posgrado': 'Postgraduate',
    'Antecedentes heredofamiliares': 'Family medical history',
    'Antecedentes personales patológicos': 'Personal medical history',
    'Antecedentes': 'Medical background',
    'Alergias': 'Allergies',
    'Medicamentos actuales': 'Current medications',
    'Peso': 'Weight',
    'Talla': 'Height',
    'Presión arterial': 'Blood pressure',
    'Temperatura': 'Temperature',
    'Signos vitales': 'Vital signs',

    // ---------- Capacitacion ----------
    'Centro de Capacitación': 'Training Center',
    'Iniciar módulo →': 'Start module →',
    'Repasar módulo ↻': 'Review module ↻',
    'Módulo': 'Module',
    'Módulos': 'Modules',
    'CERTIFICADO': 'CERTIFIED',
    'PENDIENTE': 'PENDING',
    'COMPLETADO': 'COMPLETED',
    'EN CURSO': 'IN PROGRESS',
    'Evaluación': 'Assessment',
    'Pregunta': 'Question',
    'Respuesta': 'Answer',
    'Finalizar': 'Finish',
    'Resultado': 'Score',
    'Aprobado': 'Passed',
    'Reprobado': 'Not passed',
    'Reintentar': 'Retry',
    'Calificación': 'Grade',
    'Certificación': 'Certification',
    'Certificado': 'Certificate',
    'Progreso': 'Progress',

    // ---------- Afiliacion ----------
    'Únete a la Red CODE CELLS®': 'Join the CODE CELLS Network',
    'Únete': 'Join us',
    'Solicitud': 'Application',
    'Enviar solicitud': 'Submit application',
    'Aviso de privacidad': 'Privacy notice',
    'Política de privacidad': 'Privacy policy',
    'Términos y condiciones': 'Terms and conditions',

    // ---------- NOVA ----------
    'Escribiendo...': 'Typing...',
    'Escribe tu mensaje...': 'Type your message...',
    'Escribe tu mensaje…': 'Type your message…',
    'Nueva conversación': 'New conversation',
    'HABLA CON NOVA': 'TALK WITH NOVA',
    'HABLA CON NOVA LLM': 'CHAT WITH NOVA',
    'Hola Efraín, soy NOVA. ¿En qué te puedo apoyar hoy?': 'Hi Efraín, I\'m NOVA. How can I support you today?',
    'Bienvenido a CODE CELLS®, Efraín. Soy NOVA, su copiloto clínico digital.': 'Welcome to CODE CELLS®, Efraín. I\'m NOVA, your digital clinical copilot.',
    '¿En qué puedo apoyarle el día de hoy — agendar una cita, resolver una duda sobre su proceso, o algo más?': 'How can I support you today—schedule an appointment, answer a question about your process, or something else?',
    '¿Cómo voy con mi protocolo?': 'How am I doing with my protocol?',
    'Tengo una duda sobre mi tratamiento': 'I have a question about my treatment',
    'Agendar mi próxima cita': 'Schedule my next appointment',

    // ---------- PACIENTE / MI-NIVEL ----------
    'TUS LABORATORIOS': 'YOUR LABS',
    'Aún no tienes estudios con datos extraídos.': 'You do not yet have studies with extracted data.',
    'Estudios subidos': 'Uploaded studies',
    'Subir PDF o foto': 'Upload PDF or photo',

    // ---------- PWA ----------
    '"Agregar a pantalla de inicio"': '"Add to Home Screen"',
    '"Instalar app"': '"Install app"',
    'Instalar': 'Install',

    // ---------- Tiempos ----------
    'minutos': 'minutes',
    'semanas': 'weeks',
    'Fecha': 'Date',
    'Hora': 'Time',
    '~3 min': '~3 min',
    '~3 MIN': '~3 MIN',

    // ---------- TEST QUESTIONS (10 preguntas clínicas) ----------
    '¿Te sientes cansado o con baja energía la mayor parte del día?': 'Do you feel tired or low energy most of the day?',
    '¿Tus heridas o lesiones tardan más en sanar de lo normal?': 'Do your wounds or injuries take longer to heal than normal?',
    '¿Te cuesta conciliar o mantener el sueño?': 'Do you struggle to fall asleep or stay asleep?',
    '¿Sientes niebla mental o dificultad para concentrarte?': 'Do you experience mental fog or difficulty concentrating?',
    '¿Sientes que tu cuerpo se ve o se siente más envejecido de lo que esperarías para tu edad?': 'Do you feel your body looks or feels older than you would expect for your age?',
    '¿Te cuesta recuperarte después de un esfuerzo físico o mental?': 'Do you struggle to recover after physical or mental effort?',
    '¿Sientes inflamación o molestias que no terminan de resolverse?': 'Do you experience inflammation or discomfort that does not fully resolve?',
    '¿Te sientes irritable o ansioso sin una causa clara?': 'Do you feel irritable or anxious without clear cause?',
    '¿Notas que tu memoria reciente falla más de lo que recuerdas?': 'Do you notice your recent memory failing more than you remember?',
    '¿Sientes que tu capacidad de recuperación general ha disminuido con el tiempo?': 'Do you feel your overall recovery capacity has decreased over time?',

    // ---------- TEST RESPONSE OPTIONS ----------
    'Nunca': 'Never',
    'Rara vez': 'Rarely',
    'A veces': 'Sometimes',
    'Frecuentemente': 'Frequently',
    'Siempre': 'Always',

    // ---------- TEST SYSTEM HEADERS ----------
    'CODE ENERGY™ · PREGUNTA 1 DE 10': 'CODE ENERGY™ · QUESTION 1 OF 10',
    'CODE REPAIR™ · PREGUNTA 1 DE 10': 'CODE REPAIR™ · QUESTION 1 OF 10',
    'CODE BALANCE™ · PREGUNTA 1 DE 10': 'CODE BALANCE™ · QUESTION 1 OF 10',
    'CODE NEURO™ · PREGUNTA 1 DE 10': 'CODE NEURO™ · QUESTION 1 OF 10',
    'CODE REGEN™ · PREGUNTA 1 DE 10': 'CODE REGEN™ · QUESTION 1 OF 10',

    // ---------- TEST UI ----------
    'PREGUNTA': 'QUESTION',
    'DE': 'OF',
    'PREGUNTAS': 'QUESTIONS',
    'Evaluación Cronodegenerativa CODE CELLS™': 'CODE CELLS™ Chronodegenerative Assessment',
    'Responde con honestidad. Esto te ayudará a descubrir qué sistema biológico está perdiendo función primero.': 'Answer honestly. This will help you discover which biological system is losing function first.',
    'COMENZAR': 'START',
    '10 PREGUNTAS': '10 QUESTIONS',
    '5 SISTEMAS': '5 SYSTEMS',
    'EXPLORA LOS 5 SISTEMAS': 'EXPLORE THE 5 SYSTEMS',
    '19 PREGUNTAS': '19 QUESTIONS',
    'Pregunta': 'Question',
    'de': 'of',

    // ---------- Acciones comunes faltantes ----------
    'Agregar': 'Add',
    'Nuevo': 'New',
    'Acceder al portal →': 'Access portal →',
    'Acceso': 'Access',
    'Acceso a': 'Access to',
    'Integración': 'Integration',
    'Integración con Google Calendar': 'Google Calendar Integration',
    'Completados': 'Completed',
    'completados': 'completed',
    'módulos': 'modules',
    'módulo': 'module',

    // ---------- Privacidad / Legal (frase corta) ----------
    'Responsable del tratamiento': 'Data controller',
    'Datos que recopilamos': 'Data we collect',
    'Seguridad': 'Security',
    'Derechos': 'Rights',
    'Cambios a este aviso': 'Changes to this notice',

    // ---------- Biológicos / Protocolos especiales ----------
    'Acceso a biológicos regenerativos de Regene Global': 'Access to Regene Global regenerative biologics',
    'Acceso a células madre autólogas': 'Access to autologous stem cells',
    'Acceso a los 17 protocolos': 'Access to all 17 protocols',
    'con indicaciones detalladas': 'with detailed indications',

    // ---------- UI CRÍTICA AGREGADA (ago 2026) ----------
    // Secciones principales
    'REALICE SU EVALUACIÓN': 'START YOUR ASSESSMENT',
    'EXPLORA LOS 5 SISTEMAS': 'EXPLORE THE 5 SYSTEMS',
    'CINCO sistemas biológicos sostienen tu energía': 'FIVE biological systems support your energy',
    'EL PROBLEMA': 'THE PROBLEM',
    'LA SOLUCIÓN': 'THE SOLUTION',
    'CÓMO FUNCIONA': 'HOW IT WORKS',
    'LOS 5 SISTEMAS': 'THE 5 SYSTEMS',
    
    // Acceso
    'ACCESO AL MÉDICO': 'PHYSICIAN ACCESS',
    'ACCESO MÉDICO': 'MEDICAL ACCESS',
    
    // Paciente
    'TUS LABORATORIOS': 'YOUR LABS',
    'HABLA CON NOVA': 'TALK WITH NOVA',
    'Aún no hay estudios cargados': 'No studies uploaded yet',
    
    // Botones principales
    'COMENZAR': 'BEGIN',
    'SIGUIENTE': 'NEXT',
    'ANTERIOR': 'PREVIOUS',
    'SALIR': 'EXIT',
    'ENVIAR': 'SEND',
    'GUARDAR': 'SAVE',
    
    // Test/Assessment
    'PREGUNTA': 'QUESTION',
    'RESPUESTA': 'ANSWER',
    'RESULTADO': 'RESULT',
    'PUNTUACIÓN': 'SCORE',
    
    // Mensajes
    'Error de conexión': 'Connection error',
    'Intenta de nuevo': 'Try again',
    'Por favor espera': 'Please wait',
    'Cargando...': 'Loading...',
    
    // Sistemas CODE
    'ENERGY': 'ENERGY',
    'REPAIR': 'REPAIR',
    'BALANCE': 'BALANCE',
    'NEURO': 'NEURO',
    'REGEN': 'REGEN',
    
    // Protocolos
    'RESTORE™': 'RESTORE™',
    'ACTIVATE™': 'ACTIVATE™',
    'GENESIS™': 'GENESIS™',
    'CONTINUUM™': 'CONTINUUM™',
    'DEZAWA PROTOCOL™': 'DEZAWA PROTOCOL™',
    'DEZAWA': 'DEZAWA',
    
    // Niveles médicos
    'Asociado': 'Associate',
    'Certificado': 'Certified',
    'Senior': 'Senior',
    'Diplomado': 'Diploma',
    
    // Campos de formulario
    'Email': 'Email',
    'Cédula': 'Professional License',
    'Especialidad': 'Specialty',
    'Teléfono': 'Phone',
    'Ciudad': 'City',
    'Nombre': 'Name',
    
    // Navegación
    'Inicio': 'Home',
    'Acerca de': 'About',
    'Afiliarse': 'Join Us',
    'Portal': 'Portal',
    'Capacitación': 'Training',
    'Contacto': 'Contact',
    
    // Saludos
    'Bienvenido': 'Welcome',
    'Hola': 'Hello',
    'Gracias': 'Thank you',
    'Hasta luego': 'Goodbye'
  };

  var LANGUAGES = { es: null, en: DICT_EN };
  var STORAGE_KEY = 'codecells_lang';
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1 };
  var originals = new WeakMap();
  var current = 'es';
  var observer = null;

  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  function lookup(text, lang) {
    var dict = LANGUAGES[lang];
    if (!dict) return null;
    var key = norm(text);
    if (!key) return null;
    if (dict[key]) return dict[key];
    var bare = key.replace(/[:.]+$/, '');
    if (bare !== key && dict[bare]) return dict[bare] + key.slice(bare.length);
    return null;
  }

  function skip(node) {
    var el = node.parentElement;
    while (el) {
      if (SKIP_TAGS[el.tagName]) return true;
      if (el.hasAttribute && el.hasAttribute('data-no-i18n')) return true;
      if (el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  function translateTextNodes(root, lang) {
    if (!root || !root.ownerDocument && root.nodeType !== 1 && root.nodeType !== 9) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var batch = [], n;
    while ((n = walker.nextNode())) batch.push(n);
    for (var i = 0; i < batch.length; i++) {
      var node = batch[i];
      if (skip(node)) continue;
      if (!originals.has(node)) {
        if (!norm(node.nodeValue)) continue;
        originals.set(node, node.nodeValue);
      }
      var original = originals.get(node);
      if (lang === 'es') {
        if (node.nodeValue !== original) node.nodeValue = original;
        continue;
      }
      var hit = lookup(original, lang);
      if (hit) {
        var lead = original.match(/^\s*/)[0];
        var trail = original.match(/\s*$/)[0];
        node.nodeValue = lead + hit + trail;
      } else if (node.nodeValue !== original) {
        node.nodeValue = original;
      }
    }
  }

  function translateAttributes(root, lang) {
    if (!root.querySelectorAll) return;
    var attrs = ['placeholder', 'title', 'alt', 'aria-label'];
    var els = root.querySelectorAll('[placeholder],[title],[alt],[aria-label]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.hasAttribute('data-no-i18n')) continue;
      for (var a = 0; a < attrs.length; a++) {
        var name = attrs[a];
        if (!el.hasAttribute(name)) continue;
        var store = 'i18nOrig' + name.replace('-', '');
        if (!el.dataset[store]) el.dataset[store] = el.getAttribute(name);
        var original = el.dataset[store];
        var hit = lang === 'es' ? null : lookup(original, lang);
        el.setAttribute(name, hit || original);
      }
    }
    var btns = root.querySelectorAll('input[type=button],input[type=submit]');
    for (var b = 0; b < btns.length; b++) {
      var btn = btns[b];
      if (!btn.dataset.i18nOrigValue) btn.dataset.i18nOrigValue = btn.value;
      var h = lang === 'es' ? null : lookup(btn.dataset.i18nOrigValue, lang);
      btn.value = h || btn.dataset.i18nOrigValue;
    }
  }

  function apply(lang) {
    if (!document.body) return;
    if (observer) observer.disconnect();
    translateTextNodes(document.body, lang);
    translateAttributes(document.body, lang);
    document.documentElement.lang = lang;
    if (observer) observer.observe(document.body, { childList: true, subtree: true });
  }

  function startObserver() {
    if (!document.body) return;
    
    // MOTOR v4: MutationObserver RADICAL — CERO debounce, CERO delays, INSTANTÁNEO
    observer = new MutationObserver(function (mutations) {
      if (current === 'es') return;
      // CRÍTICO: traducir SIN DELAYS, SIN disconnect
      for (var i = 0; i < mutations.length; i++) {
        var mut = mutations[i];
        if (mut.type === 'childList') {
          for (var j = 0; j < mut.addedNodes.length; j++) {
            var node = mut.addedNodes[j];
            if (node.nodeType === 1) {
              translateTextNodes(node, current);
              translateAttributes(node, current);
            } else if (node.nodeType === 3 && node.parentNode && !skip(node)) {
              translateTextNodes(node.parentNode, current);
            }
          }
        }
        if (mut.type === 'characterData' && mut.target && !skip(mut.target.parentNode)) {
          var text = mut.target.nodeValue || '';
          if (text.trim().length > 0) {
            var parent = mut.target.parentNode;
            if (parent && !skip(parent)) {
              translateTextNodes(parent, current);
            }
          }
        }
      }
    });
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      characterData: true
    });

    // AGRESIVIDAD 1: Interval cada 80ms (era 250ms)
    setInterval(function () {
      if (current !== 'es' && document.body) {
        translateTextNodes(document.body, current);
        translateAttributes(document.body, current);
      }
    }, 80);

    // AGRESIVIDAD 2: Scroll
    window.addEventListener('scroll', function() {
      if (current !== 'es' && document.body) {
        translateTextNodes(document.body, current);
        translateAttributes(document.body, current);
      }
    }, { passive: true });

    // AGRESIVIDAD 3: Visibility change
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden && current !== 'es' && document.body) {
        translateTextNodes(document.body, current);
        translateAttributes(document.body, current);
      }
    });

    // AGRESIVIDAD 4: requestAnimationFrame CONTINUO
    function continuousTranslate() {
      if (current !== 'es' && document.body) {
        translateTextNodes(document.body, current);
        translateAttributes(document.body, current);
      }
      requestAnimationFrame(continuousTranslate);
    }
    requestAnimationFrame(continuousTranslate);

    // AGRESIVIDAD 5: Click (muchos dinámicos se genera al interactuar)
    document.addEventListener('click', function() {
      if (current !== 'es') {
        setTimeout(function () {
          if (document.body) {
            translateTextNodes(document.body, current);
            translateAttributes(document.body, current);
          }
        }, 10);
      }
    }, true);
  }

  function buildSelector() {
    if (document.getElementById('i18n-switch')) return;
    var css = document.createElement('style');
    css.textContent =
      '#i18n-switch{position:fixed !important;bottom:16px !important;left:12px !important;z-index:99999 !important;display:flex;gap:3px;' +
      'background:rgba(14,20,16,.95);border:1px solid rgba(232,163,61,.5);border-radius:999px;' +
      'padding:5px 6px;backdrop-filter:blur(12px);font-family:"IBM Plex Sans",system-ui,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.4)}' +
      '#i18n-switch button{border:0;background:transparent;color:#cfd6d0;cursor:pointer;' +
      'font-size:11px;font-weight:700;letter-spacing:.1em;padding:6px 12px;border-radius:999px;transition:.2s;text-transform:uppercase}' +
      '#i18n-switch button:hover{color:#E8A33D;background:rgba(232,163,61,.1)}' +
      '#i18n-switch button[aria-current="true"]{background:#E8A33D;color:#0E1410;box-shadow:0 2px 8px rgba(232,163,61,.3)}' +
      '@media print{#i18n-switch{display:none}}' +
      '@media (max-width:600px){#i18n-switch{bottom:12px;left:8px;padding:4px 5px}' +
      '#i18n-switch button{font-size:10px;padding:5px 10px}}';
    document.head.appendChild(css);

    var box = document.createElement('div');
    box.id = 'i18n-switch';
    box.setAttribute('data-no-i18n', '');
    box.innerHTML = '<button data-lang="es">ES</button><button data-lang="en">EN</button>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-lang]');
      if (b) setLanguage(b.getAttribute('data-lang'));
    });
    document.body.appendChild(box);
    paintSelector();
  }

  function paintSelector() {
    var box = document.getElementById('i18n-switch');
    if (!box) return;
    var bs = box.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute('aria-current', String(bs[i].getAttribute('data-lang') === current));
    }
  }

  function setLanguage(lang) {
    if (!(lang in LANGUAGES)) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    apply(lang);
    // Usar requestAnimationFrame para pintar selector después del repaint
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(paintSelector);
    } else {
      paintSelector();
    }
    window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: lang } }));
  }

  function getLanguage() { return current; }

  function t(text) { return lookup(text, current) || text; }

  function i18nAddLanguage(code, dict) { LANGUAGES[code] = dict; }

  function i18nMissing(lang) {
    lang = lang || 'en';
    var dict = LANGUAGES[lang] || {};
    var seen = {};
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      if (skip(n)) continue;
      var s = norm(originals.has(n) ? originals.get(n) : n.nodeValue);
      if (s.length >= 2 && s.length <= 80 && /[a-zA-Z\u00C0-\u017F]/.test(s) && !dict[s]) seen[s] = 1;
    }
    var list = Object.keys(seen).sort();
    console.log('%c[i18n] ' + list.length + ' textos sin traduccion (' + lang + ')',
      'color:#E8A33D;font-weight:700');
    console.log(list.map(function (s) { return "  '" + s.replace(/'/g, "\\'") + "': '',"; }).join('\n'));
    return list;
  }

  function init() {
    try { current = localStorage.getItem(STORAGE_KEY) || 'es'; } catch (e) { current = 'es'; }
    if (!(current in LANGUAGES)) current = 'es';
    buildSelector();
    startObserver();
    if (current !== 'es') apply(current);
  }

  window.setLanguage = setLanguage;
  window.getLanguage = getLanguage;
  window.t = t;
  window.i18nAddLanguage = i18nAddLanguage;
  window.i18nMissing = i18nMissing;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
