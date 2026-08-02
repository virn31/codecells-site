/**
 * NOVA i18n SISTEMA COMPLETO v2.0
 * ================================
 * Sistema de internacionalización EXHAUSTIVO para toda la plataforma CODE CELLS®
 * 
 * Incluye: index, portal-medico, unete, capacitacion, influencer, admin, etc.
 * Idiomas: es (español), en (english)
 * 
 * ESTRUCTURA: Diccionario por MÓDULO/PÁGINA
 * Fácil de expandir a más idiomas (agregar bloque idioma = 300 líneas max)
 */

// ============================================
// DICCIONARIO GLOBAL COMPLETO - TODOS LOS MÓDULOS
// ============================================

const i18nDictionary = {
  es: {
    // ==========================================
    // 🌐 NAVEGACIÓN GLOBAL / HEADER
    // ==========================================
    volver: "← Volver",
    inicio: "Inicio",
    portal_medico: "Portal Médico",
    buscar_medico: "Buscar Médico",
    capacitacion: "Capacitación",
    afiliarse: "Afiliarse",
    logout: "Cerrar sesión",
    menu: "Menú",
    idioma: "Idioma",
    espanol: "Español",
    english: "English",
    
    // ==========================================
    // 🏠 INDEX.HTML - SITIO PRINCIPAL
    // ==========================================
    // Hero Section
    titulo_hero: "Medicina Regenerativa Precision",
    subtitulo_hero: "La Red CODE CELLS® conecta pacientes con especialistas en terapia celular",
    cta_paciente: "Soy Paciente",
    cta_medico: "Soy Médico",
    
    // Valor
    titulo_valor: "¿Por qué elegir CODE CELLS®?",
    valor_1_titulo: "Protocolos Científicos",
    valor_1_texto: "Basados en 17 protocolos clínicos validados en 5 sistemas biológicos",
    valor_2_titulo: "Red de Especialistas",
    valor_2_texto: "Médicos certificados en medicina regenerativa y terapia celular",
    valor_3_titulo: "Terapia Personalizada",
    valor_3_texto: "DEZAWA PROTOCOL™ adaptado a cada paciente VIP",
    valor_4_titulo: "Seguimiento Real",
    valor_4_texto: "Portal digital con expediente completo y citas online",
    
    // Sistemas CODE
    titulo_sistemas: "Nuestros 5 Sistemas",
    sistema_energy: "ENERGY — Revitalización",
    sistema_repair: "REPAIR — Regeneración",
    sistema_balance: "BALANCE — Equilibrio",
    sistema_neuro: "NEURO — Neuroprotección",
    sistema_regen: "REGEN — Regeneración Avanzada",
    
    // Niveles
    titulo_niveles: "3 Niveles de Intervención",
    nivel_restore: "RESTORE™ — Básico",
    nivel_activate: "ACTIVATE™ — Intermedio",
    nivel_genesis: "GENESIS™ — Avanzado",
    nivel_continuum: "CONTINUUM™ — Mantenimiento",
    
    // CTA
    titulo_cta_final: "Comienza tu Transformación",
    subtitulo_cta_final: "Conecta con un especialista CODE CELLS® hoy",
    boton_paciente: "Encuentra tu Médico",
    boton_medico: "Únete a la Red",
    
    // Footer
    footer_derechos: "© 2026 CODE CELLS®. Todos los derechos reservados.",
    footer_privacidad: "Privacidad",
    footer_terminos: "Términos",
    footer_contacto: "Contacto",
    
    // ==========================================
    // 🔍 BUSCAR-MEDICO.HTML
    // ==========================================
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
    senior: "Senior",
    buscar: "🔎 Buscar",
    limpiar: "Limpiar",
    tip: "Tip:",
    tip_mensaje: "O pregúntale a NOVA en el chat de la derecha qué médico es mejor para tu caso. NOVA te hará un triage inteligente.",
    medicos_disponibles: "Médicos disponibles",
    sin_resultados: "👉 Usa los filtros de la izquierda o pregúntale a NOVA",
    no_hay_medicos: "❌ No hay médicos que cumplan esos criterios. Intenta con otros filtros.",
    nova_titulo: "NOVA Triage Inteligente",
    nova_placeholder: "Describe tu condición (ej: 'tengo dolor en rodillas')",
    
    // Tarjeta médico
    medico_desde: "Médico desde",
    contactar: "📱 Contactar",
    agendar_cita: "Agendar cita",
    ver_perfil: "Ver perfil",
    protocolos: "Protocolos:",
    
    // ==========================================
    // 👨‍⚕️ PORTAL-MEDICO.HTML
    // ==========================================
    // Login
    titulo_login: "Acceso Médico",
    codigo_medico: "Código de Médico",
    codigo_placeholder: "Ej. CCMED-ABC01",
    ingresar: "Ingresar",
    codigo_invalido: "❌ Código inválido",
    
    // Dashboard
    titulo_dashboard: "Portal Médico",
    bienvenida_medico: "Bienvenido,",
    mis_pacientes: "Mis Pacientes",
    proximo_paciente: "Próximo paciente:",
    sin_citas: "No hay citas programadas",
    nuevos_pacientes: "Nuevos pacientes",
    pendientes: "Pendientes",
    
    // Expediente
    datos_paciente: "Datos del Paciente",
    nombre: "Nombre",
    edad: "Edad",
    sexo: "Sexo",
    telefono: "Teléfono",
    email: "Email",
    historia_clinica: "Historia Clínica",
    motivo_consulta: "Motivo de Consulta",
    diagnostico: "Diagnóstico (CIE-10)",
    plan_terapeutico: "Plan Terapéutico",
    exploracion_fisica: "Exploración Física",
    antecedentes: "Antecedentes",
    
    // Consulta
    nueva_consulta: "Nueva Consulta",
    fecha_consulta: "Fecha",
    tipo_consulta: "Tipo",
    inicial: "Inicial",
    seguimiento: "Seguimiento",
    evaluacion: "Evaluación",
    guardar_consulta: "Guardar Consulta",
    consulta_guardada: "✅ Consulta guardada",
    
    // Receta
    receta_digital: "Receta Digital",
    medicamentos: "Medicamentos",
    dosis: "Dosis",
    frecuencia: "Frecuencia",
    duracion: "Duración",
    indicaciones: "Indicaciones",
    imprimir_receta: "🖨️ Imprimir",
    descargar_pdf: "📥 Descargar PDF",
    
    // Interconsulta
    interconsultas: "Interconsultas",
    solicitar_interconsulta: "Solicitar Interconsulta",
    especialista: "Especialista",
    motivo: "Motivo",
    estado_pendiente: "Pendiente",
    estado_respondida: "Respondida",
    
    // Google Calendar
    calendar_link: "Vincular Google Calendar",
    calendar_vinculado: "✅ Calendar vinculado",
    proxima_cita: "Próxima cita",
    
    // Estudios
    estudios_paciente: "Estudios Subidos",
    subir_estudio: "Subir Estudio",
    tipo_archivo: "Tipo (laboratorio, imagenología, etc.)",
    fecha_estudio: "Fecha del Estudio",
    
    // ==========================================
    // 🎓 CAPACITACION - MÓDULOS E-LEARNING
    // ==========================================
    titulo_capacitacion: "Centro de Capacitación",
    modulos_disponibles: "Módulos Disponibles",
    modulo_1: "Módulo 1: Introducción a CODE CELLS®",
    modulo_2: "Módulo 2: Homotoxicología e Inmunidad",
    modulo_3: "Módulo 3: Marco Regulatorio Mexicano",
    modulo_4: "Módulo 4: Portal Médico",
    modulo_5: "Módulo 5: Protocolo DEZAWA",
    modulo_6: "Módulo 6: Células Madre y Biológicos",
    modulo_7: "Módulo 7: Exosomas y Nanopartículas",
    modulo_8: "Módulo 8: Sueroterapia Ortomolecular",
    modulo_9: "Módulo 9: Farmacia CODE CELLS®",
    modulo_10: "Módulo 10: Biohacking Regenerativo",
    modulo_11: "Módulo 11: Examen de Niveles",
    
    comenzar: "Comenzar",
    continuar: "Continuar",
    completado: "✅ Completado",
    
    // Evaluación
    evaluacion: "Evaluación",
    pregunta: "Pregunta",
    respuestas: "Respuestas",
    siguiente: "Siguiente",
    anterior: "Anterior",
    finalizar: "Finalizar",
    resultado: "Tu resultado",
    aprobado: "✅ Aprobado",
    reprobado: "❌ Reprobado - Intenta de nuevo",
    porcentaje: "Porcentaje",
    reintentar: "Reintentar",
    umbral_aprobacion: "Umbral de aprobación: 80%",
    
    // Certificado
    certificacion_obtenida: "🎓 Certificación Obtenida",
    nivel_restore_cert: "Certificado RESTORE™",
    nivel_activate_cert: "Certificado ACTIVATE™",
    nivel_genesis_cert: "Certificado GENESIS™",
    descargar_certificado: "Descargar Certificado",
    
    // ==========================================
    // 📋 UNETE.HTML - AFILIACIÓN DE MÉDICOS
    // ==========================================
    titulo_unete: "Únete a la Red CODE CELLS®",
    subtitulo_unete: "Expande tu práctica con la medicina regenerativa más avanzada",
    
    // Flujo de afiliación
    paso_1: "Paso 1: Tu Información",
    paso_2: "Paso 2: Especialidad",
    paso_3: "Paso 3: Ubicación",
    paso_4: "Paso 4: Confirmación",
    
    nombre_completo: "Nombre Completo",
    cedula_profesional: "Cédula Profesional",
    especialidad_medica: "Especialidad Médica",
    estado_ubicacion: "Estado de Ubicación",
    ciudad_ubicacion: "Ciudad",
    clinica_consultorio: "¿Clínica o Consultorio Privado?",
    experiencia_anos: "Años de Experiencia",
    telefono_contacto: "Teléfono de Contacto",
    whatsapp: "WhatsApp",
    
    terminos_acepto: "Acepto los términos y condiciones",
    politica_privacidad: "Política de Privacidad",
    enviar_solicitud: "Enviar Solicitud",
    solicitud_enviada: "✅ Solicitud enviada - Te contactaremos en 24h",
    
    // Beneficios
    titulo_beneficios: "Beneficios de Ser Partner",
    beneficio_1: "Acceso a 225 productos farmacéuticos",
    beneficio_2: "11 módulos de capacitación certificada",
    beneficio_3: "Portal médico exclusivo",
    beneficio_4: "Red de 500+ especialistas",
    beneficio_5: "Soporte 24/7 de NOVA IA",
    beneficio_6: "Certificaciones internacionales",
    
    // ==========================================
    // 💎 DEZAWAVIP.HTML - TOUR VIP
    // ==========================================
    titulo_dezawa: "DEZAWA PROTOCOL™ - Medicina de Élite",
    subtitulo_dezawa: "El programa más avanzado de medicina regenerativa",
    duracion: "Duración",
    resultado: "Resultado esperado",
    precio_desde: "Desde",
    
    // Niveles VIP
    nivel_1_vip: "Nivel I: Revitalización Premium",
    nivel_2_vip: "Nivel II: Regeneración Completa",
    nivel_3_vip: "Nivel III: Transformación Total",
    
    // CTA VIP
    ver_tour: "Ver Tour Interactivo",
    agendar_consulta_vip: "Agendar Consulta VIP",
    informacion_completa: "Información Completa",
    
    // ==========================================
    // 📱 INFLUENCER PAGES (descubre, bienestar)
    // ==========================================
    titulo_descubre: "Descubre CODE CELLS®",
    subtitulo_descubre: "La medicina regenerativa que cambia vidas",
    
    titulo_bienestar: "Tu Camino al Bienestar",
    que_es_medicina_regenerativa: "¿Qué es la Medicina Regenerativa?",
    sistemas_codigo: "Nuestros Sistemas CODE",
    testimonios: "Testimonios de Pacientes",
    faq: "Preguntas Frecuentes",
    
    pregunta_1: "¿Es seguro?",
    respuesta_1: "Sí, es un procedimiento médico aprobado y regulado por COFEPRIS",
    pregunta_2: "¿Cuánto tiempo tarda?",
    respuesta_2: "Los resultados se ven entre 4-12 semanas según el protocolo",
    pregunta_3: "¿Se puede combinar con otros tratamientos?",
    respuesta_3: "Sí, el médico especialista determina la mejor combinación",
    pregunta_4: "¿Hay efectos secundarios?",
    respuesta_4: "Mínimos - únicamente inflamación local leve que desaparece en 48h",
    
    // ==========================================
    // 🤖 NOVA - CHATBOT
    // ==========================================
    nova_bienvenida: "Hola, soy NOVA. ¿Cómo te puedo ayudar?",
    nova_espera: "Escribiendo...",
    nova_error: "Disculpa, algo salió mal. Intenta de nuevo.",
    enviar_mensaje: "Enviar",
    limpiar_chat: "Limpiar Chat",
    
    // Contextos NOVA
    nova_paciente: "Soy paciente buscando tratamiento",
    nova_medico: "Soy médico afiliado",
    nova_general: "Información general",
    
    // ==========================================
    // ✅ VALIDACIONES Y MENSAJES
    // ==========================================
    campo_requerido: "Este campo es requerido",
    email_invalido: "Email inválido",
    telefono_invalido: "Teléfono inválido",
    cargando: "Cargando...",
    exito: "✅ Éxito",
    error: "❌ Error",
    intentar_nuevamente: "Intentar de nuevo",
    cancelar: "Cancelar",
    confirmar: "Confirmar",
    
    // ==========================================
    // 🔒 SEGURIDAD Y PRIVACIDAD
    // ==========================================
    sesion_expirada: "Tu sesión expiró. Por favor inicia sesión de nuevo.",
    acceso_denegado: "Acceso denegado",
    datos_confidenciales: "Información confidencial - Solo para uso médico",
    protegido_hlpaa: "Protegido bajo HIPAA y NOM-004",
    
    // ==========================================
    // 📞 CONTACTO
    // ==========================================
    titulo_contacto: "Contáctanos",
    email_contacto: "contacto@codecells.mx",
    whatsapp_contacto: "WhatsApp: +52 (667) 123-4567",
    horario_atencion: "Lun-Vie 9am-6pm (Zona Mazatlán)",
    formulario_contacto: "Formulario de Contacto",
    mensaje: "Mensaje",
    enviar_contacto: "Enviar Mensaje",
  },
  
  // ============================================
  // ENGLISH TRANSLATION
  // ============================================
  en: {
    // ==========================================
    // 🌐 GLOBAL NAVIGATION / HEADER
    // ==========================================
    volver: "← Back",
    inicio: "Home",
    portal_medico: "Physician Portal",
    buscar_medico: "Find a Doctor",
    capacitacion: "Training",
    afiliarse: "Join Us",
    logout: "Logout",
    menu: "Menu",
    idioma: "Language",
    espanol: "Español",
    english: "English",
    
    // ==========================================
    // 🏠 INDEX.HTML - MAIN WEBSITE
    // ==========================================
    // Hero Section
    titulo_hero: "Precision Regenerative Medicine",
    subtitulo_hero: "CODE CELLS® Network connects patients with cell therapy specialists",
    cta_paciente: "I am a Patient",
    cta_medico: "I am a Physician",
    
    // Value
    titulo_valor: "Why Choose CODE CELLS®?",
    valor_1_titulo: "Scientific Protocols",
    valor_1_texto: "Based on 17 validated clinical protocols across 5 biological systems",
    valor_2_titulo: "Network of Specialists",
    valor_2_texto: "Physicians certified in regenerative medicine and cell therapy",
    valor_3_titulo: "Personalized Therapy",
    valor_3_texto: "DEZAWA PROTOCOL™ adapted to each VIP patient",
    valor_4_titulo: "Real Follow-up",
    valor_4_texto: "Digital portal with complete medical record and online appointments",
    
    // CODE Systems
    titulo_sistemas: "Our 5 Systems",
    sistema_energy: "ENERGY — Revitalization",
    sistema_repair: "REPAIR — Regeneration",
    sistema_balance: "BALANCE — Balance",
    sistema_neuro: "NEURO — Neuroprotection",
    sistema_regen: "REGEN — Advanced Regeneration",
    
    // Levels
    titulo_niveles: "3 Levels of Intervention",
    nivel_restore: "RESTORE™ — Basic",
    nivel_activate: "ACTIVATE™ — Intermediate",
    nivel_genesis: "GENESIS™ — Advanced",
    nivel_continuum: "CONTINUUM™ — Maintenance",
    
    // CTA
    titulo_cta_final: "Begin Your Transformation",
    subtitulo_cta_final: "Connect with a CODE CELLS® specialist today",
    boton_paciente: "Find Your Doctor",
    boton_medico: "Join the Network",
    
    // Footer
    footer_derechos: "© 2026 CODE CELLS®. All rights reserved.",
    footer_privacidad: "Privacy",
    footer_terminos: "Terms",
    footer_contacto: "Contact",
    
    // ==========================================
    // 🔍 FIND-DOCTOR.HTML (buscar-medico)
    // ==========================================
    titulo_busca: "🔍 Find Your Physician",
    especialidad: "CODE Systems Specialty",
    estado: "State",
    todos_estados: "All States",
    otros: "Other States",
    ciudad_label: "City (optional)",
    ciudad_placeholder: "E.g. Mexico City, Guadalajara",
    nivel: "Clinical Level",
    todos_niveles: "All Levels",
    asociado: "Associate",
    certificado: "Certified",
    senior: "Senior",
    buscar: "🔎 Search",
    limpiar: "Clear",
    tip: "Tip:",
    tip_mensaje: "Or ask NOVA in the chat on the right which doctor is best for your case. NOVA will do an intelligent triage.",
    medicos_disponibles: "Available Physicians",
    sin_resultados: "👉 Use the filters on the left or ask NOVA",
    no_hay_medicos: "❌ No physicians match those criteria. Try different filters.",
    nova_titulo: "NOVA Intelligent Triage",
    nova_placeholder: "Describe your condition (e.g. 'I have knee pain')",
    
    // Physician card
    medico_desde: "Physician since",
    contactar: "📱 Contact",
    agendar_cita: "Schedule Appointment",
    ver_perfil: "View Profile",
    protocolos: "Protocols:",
    
    // ==========================================
    // 👨‍⚕️ PHYSICIAN-PORTAL.HTML
    // ==========================================
    // Login
    titulo_login: "Physician Access",
    codigo_medico: "Physician Code",
    codigo_placeholder: "E.g. CCMED-ABC01",
    ingresar: "Login",
    codigo_invalido: "❌ Invalid code",
    
    // Dashboard
    titulo_dashboard: "Physician Portal",
    bienvenida_medico: "Welcome,",
    mis_pacientes: "My Patients",
    proximo_paciente: "Next patient:",
    sin_citas: "No scheduled appointments",
    nuevos_pacientes: "New Patients",
    pendientes: "Pending",
    
    // Medical Record
    datos_paciente: "Patient Data",
    nombre: "Name",
    edad: "Age",
    sexo: "Gender",
    telefono: "Phone",
    email: "Email",
    historia_clinica: "Medical History",
    motivo_consulta: "Chief Complaint",
    diagnostico: "Diagnosis (ICD-10)",
    plan_terapeutico: "Therapeutic Plan",
    exploracion_fisica: "Physical Examination",
    antecedentes: "Medical Background",
    
    // Consultation
    nueva_consulta: "New Consultation",
    fecha_consulta: "Date",
    tipo_consulta: "Type",
    inicial: "Initial",
    seguimiento: "Follow-up",
    evaluacion: "Evaluation",
    guardar_consulta: "Save Consultation",
    consulta_guardada: "✅ Consultation saved",
    
    // Prescription
    receta_digital: "Digital Prescription",
    medicamentos: "Medications",
    dosis: "Dosage",
    frecuencia: "Frequency",
    duracion: "Duration",
    indicaciones: "Instructions",
    imprimir_receta: "🖨️ Print",
    descargar_pdf: "📥 Download PDF",
    
    // Referral
    interconsultas: "Referrals",
    solicitar_interconsulta: "Request Referral",
    especialista: "Specialist",
    motivo: "Reason",
    estado_pendiente: "Pending",
    estado_respondida: "Responded",
    
    // Google Calendar
    calendar_link: "Link Google Calendar",
    calendar_vinculado: "✅ Calendar linked",
    proxima_cita: "Next appointment",
    
    // Studies
    estudios_paciente: "Patient Studies",
    subir_estudio: "Upload Study",
    tipo_archivo: "Type (lab, imaging, etc.)",
    fecha_estudio: "Study Date",
    
    // ==========================================
    // 🎓 TRAINING - E-LEARNING MODULES
    // ==========================================
    titulo_capacitacion: "Training Center",
    modulos_disponibles: "Available Modules",
    modulo_1: "Module 1: Introduction to CODE CELLS®",
    modulo_2: "Module 2: Homotoxicology and Immunity",
    modulo_3: "Module 3: Mexican Regulatory Framework",
    modulo_4: "Module 4: Physician Portal",
    modulo_5: "Module 5: DEZAWA Protocol",
    modulo_6: "Module 6: Stem Cells and Biologics",
    modulo_7: "Module 7: Exosomes and Nanoparticles",
    modulo_8: "Module 8: Orthomolecular Serotherapy",
    modulo_9: "Module 9: CODE CELLS® Pharmacy",
    modulo_10: "Module 10: Regenerative Biohacking",
    modulo_11: "Module 11: Level Exam",
    
    comenzar: "Start",
    continuar: "Continue",
    completado: "✅ Completed",
    
    // Evaluation
    evaluacion: "Assessment",
    pregunta: "Question",
    respuestas: "Answers",
    siguiente: "Next",
    anterior: "Previous",
    finalizar: "Finish",
    resultado: "Your score",
    aprobado: "✅ Passed",
    reprobado: "❌ Failed - Try again",
    porcentaje: "Percentage",
    reintentar: "Retry",
    umbral_aprobacion: "Passing threshold: 80%",
    
    // Certificate
    certificacion_obtenida: "🎓 Certification Obtained",
    nivel_restore_cert: "RESTORE™ Certificate",
    nivel_activate_cert: "ACTIVATE™ Certificate",
    nivel_genesis_cert: "GENESIS™ Certificate",
    descargar_certificado: "Download Certificate",
    
    // ==========================================
    // 📋 JOIN-US.HTML - PHYSICIAN AFFILIATION
    // ==========================================
    titulo_unete: "Join the CODE CELLS® Network",
    subtitulo_unete: "Expand your practice with the most advanced regenerative medicine",
    
    // Affiliation Flow
    paso_1: "Step 1: Your Information",
    paso_2: "Step 2: Specialty",
    paso_3: "Step 3: Location",
    paso_4: "Step 4: Confirmation",
    
    nombre_completo: "Full Name",
    cedula_profesional: "Professional License",
    especialidad_medica: "Medical Specialty",
    estado_ubicacion: "State Location",
    ciudad_ubicacion: "City",
    clinica_consultorio: "Clinic or Private Practice?",
    experiencia_anos: "Years of Experience",
    telefono_contacto: "Contact Phone",
    whatsapp: "WhatsApp",
    
    terminos_acepto: "I accept the terms and conditions",
    politica_privacidad: "Privacy Policy",
    enviar_solicitud: "Submit Application",
    solicitud_enviada: "✅ Application submitted - We'll contact you within 24h",
    
    // Benefits
    titulo_beneficios: "Benefits of Being a Partner",
    beneficio_1: "Access to 225 pharmaceutical products",
    beneficio_2: "11 certified training modules",
    beneficio_3: "Exclusive physician portal",
    beneficio_4: "Network of 500+ specialists",
    beneficio_5: "24/7 NOVA AI support",
    beneficio_6: "International certifications",
    
    // ==========================================
    // 💎 VIP-TOUR.HTML - VIP EXPERIENCE
    // ==========================================
    titulo_dezawa: "DEZAWA PROTOCOL™ - Elite Medicine",
    subtitulo_dezawa: "The most advanced regenerative medicine program",
    duracion: "Duration",
    resultado: "Expected Result",
    precio_desde: "From",
    
    // VIP Levels
    nivel_1_vip: "Level I: Premium Revitalization",
    nivel_2_vip: "Level II: Complete Regeneration",
    nivel_3_vip: "Level III: Total Transformation",
    
    // CTA VIP
    ver_tour: "View Interactive Tour",
    agendar_consulta_vip: "Schedule VIP Consultation",
    informacion_completa: "Complete Information",
    
    // ==========================================
    // 📱 INFLUENCER PAGES (discover, wellness)
    // ==========================================
    titulo_descubre: "Discover CODE CELLS®",
    subtitulo_descubre: "The regenerative medicine that changes lives",
    
    titulo_bienestar: "Your Path to Wellness",
    que_es_medicina_regenerativa: "What is Regenerative Medicine?",
    sistemas_codigo: "Our CODE Systems",
    testimonios: "Patient Testimonials",
    faq: "Frequently Asked Questions",
    
    pregunta_1: "Is it safe?",
    respuesta_1: "Yes, it is a medical procedure approved and regulated by COFEPRIS",
    pregunta_2: "How long does it take?",
    respuesta_2: "Results are visible between 4-12 weeks depending on the protocol",
    pregunta_3: "Can it be combined with other treatments?",
    respuesta_3: "Yes, the specialist physician determines the best combination",
    pregunta_4: "Are there side effects?",
    respuesta_4: "Minimal - only mild local inflammation that disappears within 48 hours",
    
    // ==========================================
    // 🤖 NOVA - CHATBOT
    // ==========================================
    nova_bienvenida: "Hi, I'm NOVA. How can I help you?",
    nova_espera: "Typing...",
    nova_error: "Sorry, something went wrong. Try again.",
    enviar_mensaje: "Send",
    limpiar_chat: "Clear Chat",
    
    // NOVA Contexts
    nova_paciente: "I am a patient looking for treatment",
    nova_medico: "I am an affiliated physician",
    nova_general: "General information",
    
    // ==========================================
    // ✅ VALIDATIONS AND MESSAGES
    // ==========================================
    campo_requerido: "This field is required",
    email_invalido: "Invalid email",
    telefono_invalido: "Invalid phone number",
    cargando: "Loading...",
    exito: "✅ Success",
    error: "❌ Error",
    intentar_nuevamente: "Try Again",
    cancelar: "Cancel",
    confirmar: "Confirm",
    
    // ==========================================
    // 🔒 SECURITY AND PRIVACY
    // ==========================================
    sesion_expirada: "Your session expired. Please login again.",
    acceso_denegado: "Access Denied",
    datos_confidenciales: "Confidential Information - Medical Use Only",
    protegido_hlpaa: "Protected under HIPAA and NOM-004",
    
    // ==========================================
    // 📞 CONTACT
    // ==========================================
    titulo_contacto: "Contact Us",
    email_contacto: "contacto@codecells.mx",
    whatsapp_contacto: "WhatsApp: +52 (667) 123-4567",
    horario_atencion: "Mon-Fri 9am-6pm (Mazatlan Time)",
    formulario_contacto: "Contact Form",
    mensaje: "Message",
    enviar_contacto: "Send Message",
  }
};

// ============================================
// FUNCIONES i18n
// ============================================

/**
 * Obtener texto traducido
 * @param {string} key - Clave del texto
 * @param {string} lang - Idioma (opcional, usa el actual)
 * @returns {string} Texto traducido
 */
function t(key, lang = null) {
  const currentLang = lang || localStorage.getItem('language') || 'es';
  return i18nDictionary[currentLang]?.[key] || i18nDictionary['es'][key] || key;
}

/**
 * Inicializar sistema i18n
 */
function i18nInit() {
  const savedLang = localStorage.getItem('language') || 'es';
  
  // Crear selector de idioma si no existe
  if (!document.getElementById('i18n-selector')) {
    crearSelectorIdioma();
  }
  
  // Aplicar traducción inicial
  aplicarTraduccion(savedLang);
  
  // Detectar cambios de idioma
  document.addEventListener('languagechange', (e) => {
    aplicarTraduccion(e.detail.language);
  });
}

/**
 * Crear selector de idioma visible
 */
function crearSelectorIdioma() {
  const navbar = document.querySelector('nav') || document.querySelector('header');
  
  if (navbar) {
    const selector = document.createElement('div');
    selector.id = 'i18n-selector';
    selector.style.cssText = `
      position: absolute;
      top: 10px;
      right: 20px;
      display: flex;
      gap: 10px;
      background: rgba(255, 255, 255, 0.1);
      padding: 8px 15px;
      border-radius: 25px;
      backdrop-filter: blur(10px);
      z-index: 1000;
    `;
    
    const btnEs = document.createElement('button');
    btnEs.textContent = t('espanol');
    btnEs.onclick = () => setLanguage('es');
    btnEs.style.cssText = obtenerEstiloBotonIdioma(true);
    
    const btnEn = document.createElement('button');
    btnEn.textContent = t('english');
    btnEn.onclick = () => setLanguage('en');
    btnEn.style.cssText = obtenerEstiloBotonIdioma(false);
    
    selector.appendChild(btnEs);
    selector.appendChild(btnEn);
    navbar.appendChild(selector);
  }
}

/**
 * Estilos para botón de idioma
 */
function obtenerEstiloBotonIdioma(isActive) {
  const currentLang = localStorage.getItem('language') || 'es';
  const isActiveLang = (isActive && currentLang === 'es') || (!isActive && currentLang === 'en');
  
  return `
    border: 2px solid ${isActiveLang ? '#E8A33D' : 'rgba(255, 255, 255, 0.3)'};
    background: ${isActiveLang ? '#E8A33D' : 'transparent'};
    color: ${isActiveLang ? '#0E1410' : '#fff'};
    padding: 5px 12px;
    border-radius: 15px;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.3s ease;
    font-size: 12px;
  `;
}

/**
 * Establecer idioma y aplicar traducción
 */
function setLanguage(lang) {
  if (['es', 'en'].includes(lang)) {
    localStorage.setItem('language', lang);
    aplicarTraduccion(lang);
    
    // Disparar evento
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { language: lang } }));
  }
}

/**
 * Aplicar traducción a toda la página
 */
function aplicarTraduccion(lang) {
  // Elementos con data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key, lang);
  });
  
  // Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key, lang);
  });
  
  // Valores (value)
  document.querySelectorAll('[data-i18n-value]').forEach(el => {
    const key = el.getAttribute('data-i18n-value');
    el.value = t(key, lang);
  });
  
  // Títulos (title)
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key, lang);
  });
  
  // Actualizar selector
  if (document.getElementById('i18n-selector')) {
    document.getElementById('i18n-selector').remove();
    crearSelectorIdioma();
  }
  
  // Actualizar idioma HTML
  document.documentElement.lang = lang;
  
  // Disparar evento personalizado
  window.dispatchEvent(new CustomEvent('i18nchange', { detail: { language: lang } }));
}

/**
 * Agregar nuevo idioma (para expandir en el futuro)
 */
function agregarIdioma(codigoIdioma, diccionario) {
  i18nDictionary[codigoIdioma] = diccionario;
  console.log(`✅ Idioma '${codigoIdioma}' agregado al diccionario i18n`);
}

// Auto-iniciar al cargar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', i18nInit);
} else {
  i18nInit();
}
