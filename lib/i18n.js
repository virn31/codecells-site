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
    '"Agregar a pantalla de inicio"': '"Add to Home Screen"',
    '"Ahora entiendo."': '"Now I understand."',
    '“Ahora entiendo.”': '“Now I understand.”',
    '"Es la edad."': '"It\'s just aging."',
    '“Es la edad.”': '“It’s just aging.”',
    '"Escucha el lenguaje silencioso de tu biología."': '"Listen to your body\'s silent language."',
    '“Escucha el lenguaje silencioso de tu biología.”': '“Listen to your body’s silent language.”',
    '"Esto es diferente."': '"This is different."',
    '“Esto es diferente.”': '“This is different.”',
    '"Existe una oportunidad."': '"There\'s an opportunity."',
    '“Existe una oportunidad.”': '“There’s an opportunity.”',
    '"Instalar app"': '"Install app"',
    '"Yo tengo poca energía."': '"I have low energy."',
    '“Yo tengo poca energía.”': '“I have low energy.”',
    '10 PREGUNTAS': '10 QUESTIONS',
    '10 preguntas': '10 questions',
    '19 PREGUNTAS': '19 QUESTIONS',
    '3. Integración con Google Calendar': '3. Google Calendar Integration',
    '4. Cómo usamos la información clínica': '4. How we use clinical information',
    '5 SISTEMAS': '5 SYSTEMS',
    '5 sistemas': '5 systems',
    '5 minutos, gratis, y te dice exactamente en qué sistema necesitas más atención.': '5 minutes, free, and it tells you exactly which system needs your most attention.',
    '5 minutos, gratis. Te dice justo en qué sistema necesitas más atención.': '5 minutes, free. Tells you exactly which system needs your most attention.',
    '5 sistemas · 9 preguntas · menos de 3 minutos.': '5 systems · 9 questions · under 3 minutes.',
    'A veces': 'Sometimes',
    'Acceder al portal →': 'Access portal →',
    'Acceso': 'Access',
    'Acceso a': 'Access to',
    'Acceso a biológicos regenerativos de Regene Global': 'Access to Regene Global regenerative biologics',
    'Acceso a biológicos regenerativos de Regene Global (MUSE Cells, Exosomas)': 'Access to Regene Global regenerative biologics (MUSE Cells, Exosomes)',
    'Acceso a células madre autólogas': 'Access to autologous stem cells',
    'Acceso a los 17 protocolos': 'Access to all 17 protocols',
    'Acceso médico': 'Physician access',
    'Acción': 'Action',
    'Aceptar': 'Accept',
    'Actividad física': 'Physical activity',
    'Actualizar': 'Refresh',
    'Agenda por WhatsApp': 'Schedule via WhatsApp',
    'Agendar mi próxima cita': 'Schedule my next appointment',
    'Agregar': 'Add',
    'Alergias': 'Allergies',
    'Alimentación': 'Nutrition',
    'Ansiedad': 'Anxiety',
    'Antecedentes': 'Medical background',
    'Antecedentes gineco-obstétricos': 'Gynecological-obstetrical history',
    'Antecedentes heredofamiliares': 'Family medical history',
    'Antecedentes personales patológicos': 'Personal medical history',
    'Antecedentes quirúrgicos': 'Surgical history',
    'Antecedentes y datos adicionales (opcional — se guarda en Historia Clínica)': 'Background and additional data (optional — saved in Clinical History)',
    'Antecedentes y diagnóstico': 'Background and diagnosis',
    'Anterior': 'Previous',
    'Aplicación práctica': 'Practical application',
    'Aprobado': 'Passed',
    'Asistente IA · CODE CELLS®': 'AI Assistant · CODE CELLS®',
    'Atención': 'Attention',
    'Atrás': 'Back',
    'Aumento de peso': 'Weight gain',
    'Automático (según diagnóstico)': 'Automatic (based on diagnosis)',
    'Avanzado': 'Advanced',
    'Aviso de privacidad': 'Privacy notice',
    'Aún no tienes estudios con datos extraídos.': 'You do not yet have studies with extracted data.',
    'Baja productividad': 'Low productivity',
    'Bastante': 'Quite a bit',
    'Biohacking y Optimización Biológica': 'Biohacking and Biological Optimization',
    'Botón Capacitación': 'Training button',
    'Botón NOVA': 'NOVA button',
    'Botón conectar Google Calendar': 'Connect Google Calendar button',
    'Buen funcionamiento': 'Good functioning',
    'Buscar': 'Search',
    'Buscar Médico': 'Find a Physician',
    'Buscar parámetro': 'Search parameter',
    'Básico': 'Basic',
    'Básico · 8–12 semanas': 'Basic · 8–12 weeks',
    'CERTIFICADO': 'CERTIFIED',
    'CODE BALANCE™': 'CODE BALANCE™',
    'CODE BALANCE™ · PREGUNTA 1 DE 10': 'CODE BALANCE™ · QUESTION 1 OF 10',
    'CODE CELLS® × Regene Global — Alianza Estratégica': 'CODE CELLS® × Regene Global — Strategic Alliance',
    'CODE CELLS® — Culiacán, Sinaloa': 'CODE CELLS® — Culiacán, Sinaloa',
    'CODE CELLS® — Tu cuerpo corre un código viejo': 'CODE CELLS® — Your body is running old code',
    'CODE CELLS™': 'CODE CELLS™',
    'CODE ENERGY™': 'CODE ENERGY™',
    'CODE ENERGY™ · PREGUNTA 1 DE 10': 'CODE ENERGY™ · QUESTION 1 OF 10',
    'CODE NEURO™': 'CODE NEURO™',
    'CODE NEURO™ · PREGUNTA 1 DE 10': 'CODE NEURO™ · QUESTION 1 OF 10',
    'CODE REGEN™': 'CODE REGEN™',
    'CODE REGEN™ · PREGUNTA 1 DE 10': 'CODE REGEN™ · QUESTION 1 OF 10',
    'CODE REPAIR™': 'CODE REPAIR™',
    'CODE REPAIR™ · PREGUNTA 1 DE 10': 'CODE REPAIR™ · QUESTION 1 OF 10',
    'COMENZAR': 'START',
    'COMPLETADO': 'COMPLETED',
    'Cada fila alimenta el comparativo automático de NOVA LABS — no es obligatorio llenar todas las columnas.': 'Each row feeds NOVA LABS automatic comparison — filling all columns is optional.',
    'Calificación': 'Grade',
    'Cambios a este aviso': 'Changes to this notice',
    'Cambios de peso o apetito difíciles de explicar': 'Unexplained weight or appetite changes',
    'Cancelar': 'Cancel',
    'Cansancio o baja energía la mayor parte del día': 'Fatigue or low energy most of the day',
    'Capacitación': 'Training',
    'Capacitación CODE CELLS®': 'CODE CELLS® Training',
    'Cargando tu información…': 'Loading your information…',
    'Cargando tu invitación…': 'Loading your invitation…',
    'Cargando...': 'Loading...',
    'Cargando…': 'Loading…',
    'Casos Clínicos Integradores': 'Integrative Clinical Cases',
    'Centro de Capacitación': 'Training Center',
    'Cerrar': 'Close',
    'Cerrar sesion': 'Log out',
    'Cerrar sesión': 'Log out',
    'Certificación': 'Certification',
    'Certificación y capacitación clínica incluida (RESTORE™ / ACTIVATE™ / GENESIS™)': 'Clinical certification and training included (RESTORE™ / ACTIVATE™ / GENESIS™)',
    'Certificado': 'Certificate',
    'Cetogénica': 'Ketogenic',
    'Cetogénica estricta': 'Strict ketogenic',
    'Cicatrización': 'Wound healing',
    'Cicatrización deficiente': 'Poor wound healing',
    'Ciudad': 'City',
    'Claridad mental': 'Mental clarity',
    'Clínico a 24-48h; laboratorio a la semana y al mes; escala funcional según enfermedad (Rankin/NIHSS, ASIA, fracción de eyección, calidad de vida/dolor).': 'Clinical at 24-48h; laboratory at 1 week and 1 month; functional scale according to disease (Rankin/NIHSS, ASIA, ejection fraction, quality of life/pain).',
    'Comenzar': 'Start',
    'Comenzar evaluación': 'Start assessment',
    'Completados': 'Completed',
    'Concentración': 'Focus',
    'Conecta con especialistas y comparte innovación clínica.': 'Connect with specialists and share clinical innovation.',
    'Confirma en el mensaje que aparece. El ícono de CODE CELLS® quedará en tu pantalla de inicio.': 'Confirm in the message that appears. The CODE CELLS® icon will stay on your home screen.',
    'Confirmar': 'Confirm',
    'Conoce los 5 sistemas': 'Explore the 5 systems',
    'Consulta': 'Consultation',
    'Consultas': 'Consultations',
    'Contacto': 'Contact',
    'Continuar': 'Continue',
    'Control inflamatorio': 'Inflammatory control',
    'Controlar hipertensión': 'Control hypertension',
    'Copiar': 'Copy',
    'Correo electrónico': 'Email',
    'Cuesta conciliar o mantener el sueño': 'Hard to fall or stay asleep',
    'Cuesta recuperarte tras un esfuerzo físico o mental': 'Hard to recover after physical or mental effort',
    'Curación completa del infarto en el 100% de los pacientes': 'Complete cure of the infarction in 100% of patients',
    'Curiosidad': 'Curiosity',
    'Cédula': 'License number',
    'Cédula profesional': 'Professional license',
    'Código': 'Code',
    'Código de médico': 'Physician code',
    'Código de paciente *': 'Patient code *',
    'Cómo es la experiencia': 'What the experience is like',
    'Cómo funciona': 'How it works',
    'Cómo nació esto': 'How this started',
    'DE': 'OF',
    'Da el primer paso para entender qué sistema de tu biología necesita atención primero.': 'Take the first step to understand which of your biological systems needs attention first.',
    'Datos generales': 'General information',
    'Datos que recopilamos': 'Data we collect',
    'Dependes de cafeína o estimulantes para rendir': 'You rely on caffeine or stimulants to perform',
    'Derechos': 'Rights',
    'Descargar': 'Download',
    'Descargar PDF': 'Download PDF',
    'Desliza hacia abajo en el menú y toca': 'Scroll down in the menu and tap',
    'Desplázate': 'Scroll',
    'Diabética': 'Diabetic',
    'Diagnóstico': 'Diagnosis',
    'Diagnóstico (CIE-10)': 'Diagnosis (ICD-10)',
    'Dirección': 'Address',
    'Distracción': 'Distraction',
    'Dosis': 'Dosage',
    'Duración': 'Duration',
    'Duración aproximada: 5 minutos': 'Approximate duration: 5 minutes',
    'Días del plan': 'Days of the plan',
    'EN CURSO': 'IN PROGRESS',
    'EXPLORA LOS 5 SISTEMAS': 'EXPLORE THE 5 SYSTEMS',
    'Edad': 'Age',
    'Editar': 'Edit',
    'El primer paso': 'The first step',
    'El problema': 'The problem',
    'El verdadero lujo ya no es poseer más cosas.': 'True luxury is no longer owning more things.',
    'Empeoramiento significativo de la función cardiaca': 'Significant worsening of cardiac function',
    'Encuentra tu Médico | CODE CELLS®': 'Find Your Physician | CODE CELLS®',
    'Energía': 'Energy',
    'Envejecimiento acelerado': 'Accelerated aging',
    'Enviar': 'Send',
    'Enviar solicitud': 'Submit application',
    'Enviar y continuar': 'Submit and continue',
    'Envía este link a': 'Send this link to',
    'Escolaridad': 'Education',
    'Escribe tu mensaje...': 'Type your message...',
    'Escribe tu mensaje…': 'Type your message…',
    'Escribiendo...': 'Typing...',
    'Español': 'Spanish',
    'Especialidad': 'Specialty',
    'Estado': 'State',
    'Estado civil': 'Marital status',
    'Estado vacío': 'Empty state',
    'Este enlace no es válido': 'This link is not valid',
    'Este link es tuyo — cualquier paciente que lo abra queda registrado automáticamente como tu paciente, sin que vea tu código. Sirve igual en tu celular, en el de él, o en la tablet del consultorio.': 'This link is yours — any patient who opens it is automatically registered as your patient without seeing your code. Works the same on your phone, theirs, or the clinic tablet.',
    'Este paciente aún no tiene un plan nutricional generado.': 'This patient does not yet have a generated nutrition plan.',
    'Esto es diferente': 'This is different',
    'Esto explica que': 'This explains that',
    'Esto va de actualizarlo. Toca para ver cómo →': 'This is about updating it. Tap to see how →',
    'Estrés oxidativo': 'Oxidative stress',
    'Estudios': 'Studies',
    'Estudios en orden cronológico': 'Studies in chronological order',
    'Estudios subidos': 'Uploaded studies',
    'Evaluación': 'Assessment',
    'Evaluación Cronodegenerativa CODE CELLS™': 'CODE CELLS™ Chronodegenerative Assessment',
    'Evaluación de los 5 sistemas CODE': 'Assessment of the 5 CODE systems',
    'Evaluación y optimización biológica': 'Biological assessment and optimization',
    'Evidencia clínica': 'Clinical evidence',
    'Evitar estreñimiento': 'Avoid constipation',
    'Expediente': 'Medical record',
    'Expediente completo': 'Complete medical record',
    'Exploración física': 'Physical examination',
    'Exploración física / Hallazgos': 'Physical examination / Findings',
    'Fase I/II, 3 pacientes con FEVI ≤45% post-intervención. Sin eventos adversos relacionados; mejoría en fracción de eyección y movimiento de pared a 12 semanas.': 'Phase I/II, 3 patients with LVEF ≤45% post-intervention. No related adverse events; improvement in ejection fraction and wall motion at 12 weeks.',
    'Fatiga': 'Fatigue',
    'Fecha': 'Date',
    'Fecha de consulta': 'Consultation date',
    'Fecha de nacimiento': 'Date of birth',
    'Femenino': 'Female',
    'Finalizar': 'Finish',
    'Firma': 'Signature',
    'Frecuencia': 'Frequency',
    'Frecuentemente': 'Frequently',
    'Función mitocondrial': 'Mitochondrial function',
    'Fundamentos de Regeneración Celular': 'Foundations of Cellular Regeneration',
    'Fórmula genérica': 'Generic formula',
    'Grupo sanguíneo': 'Blood type',
    'Guardar': 'Save',
    'Guardar cambios': 'Save changes',
    'Guardar consulta': 'Save consultation',
    'Guardar corrección': 'Save correction',
    'HABLA CON NOVA': 'TALK WITH NOVA',
    'HABLA CON NOVA LLM': 'CHAT WITH NOVA',
    'Hepática': 'Hepatic',
    'Heridas o lesiones que tardan más en sanar': 'Wounds or injuries that take longer to heal',
    'Hipocalórica': 'Hypocaloric',
    'Historia clínica': 'Medical history',
    'Homeostasis': 'Homeostasis',
    'Hora': 'Time',
    'Hábitos / estilo de vida': 'Habits / lifestyle',
    'Imprimir': 'Print',
    'Incluye': 'Includes',
    'Indicaciones': 'Instructions',
    'Inflamación persistente': 'Persistent inflammation',
    'Infarto agudo de miocardio': 'Acute myocardial infarction',
    'Información personal': 'Personal information',
    'Ingresa tu código de identificación para continuar.': 'Enter your identification code to continue.',
    'Ingresar': 'Sign in',
    'Incorrecto — la respuesta correcta está marcada.': 'Incorrect — the correct answer is marked.',
    'Iniciar conversación': 'Start conversation',
    'Iniciar módulo →': 'Start module →',
    'Inicio': 'Home',
    'Insomnio': 'Insomnia',
    'Instalar': 'Install',
    'Integración': 'Integration',
    'Integración con Google Calendar': 'Google Calendar Integration',
    'Interconsulta': 'Referral',
    'Interconsultas': 'Referrals',
    'Intermedio': 'Intermediate',
    'Invitación DEZAWA PROTOCOL™ — CODE CELLS®': 'DEZAWA PROTOCOL™ Invitation — CODE CELLS®',
    'Ir a capacitación →': 'Go to training →',
    'Irritabilidad': 'Irritability',
    'LADO IZQUIERDO: Búsqueda Filtrada': 'LEFT SIDE: Filtered Search',
    'La biología pierde eficiencia mucho antes del diagnóstico.': 'Biology loses efficiency long before a diagnosis appears.',
    'La capacidad biológica de reparar daño.': 'The biological capacity to repair damage.',
    'La capacidad de adaptación del organismo.': 'The capacity of the body to adapt.',
    'La capacidad de regeneración y renovación.': 'The capacity for regeneration and renewal.',
    'La capacidad del organismo para producir energía utilizable.': 'The capacity of the body to produce usable energy.',
    'La consulta profundiza': 'The consultation goes deeper',
    'La consulta se convierte en el siguiente paso lógico — por comprensión, no por presión.': 'The consultation becomes the logical next step — by understanding, not by pressure.',
    'La evaluación escucha': 'The assessment listens',
    'La filosofía': 'The philosophy',
    'La función neurológica superior.': 'Higher neurological function.',
    'La idea central': 'The core idea',
    'La mayoría de las personas interpreta estos cambios como algo inevitable.': 'Most people read these changes as something inevitable.',
    'La memoria reciente falla más de lo habitual': 'Recent memory fails more than usual',
    'Las voces se alternan automáticamente en cada pantalla': 'Voices alternate automatically on each screen',
    'Lentitud cognitiva': 'Cognitive slowness',
    'Lentitud física': 'Physical sluggishness',
    'Lesiones recurrentes': 'Recurring injuries',
    'Licenciatura terminada': 'Bachelor degree',
    'Licenciatura trunca': 'Some college',
    'Lo actualizamos desde la célula. Sin pastillas que solo tapan el problema, sin químicos que te intoxican — medicina real para que rindas, te veas y te sientas como la versión más nueva de ti.': 'We update it at the cellular level. No pills that just mask the problem, no chemicals that harm you — real medicine so you perform, look, and feel like the newest version of yourself.',
    'Los cinco sistemas': 'The five systems',
    'Los protocolos optimizan': 'The protocols optimize',
    'Los resultados interpretan': 'The results interpret',
    'MODO MÉDICO': 'PHYSICIAN MODE',
    'Manejo del estrés': 'Stress management',
    'Mantenimiento': 'Maintenance',
    'Mantenimiento estructural': 'Structural maintenance',
    'Masculino': 'Male',
    'Medicamentos': 'Medications',
    'Medicamentos actuales': 'Current medications',
    'Medicina Regenerativa Avanzada': 'Advanced Regenerative Medicine',
    'Medicina regenerativa de vanguardia, respaldada por Regene Global, con capacitación y certificación incluida. Platica con NOVA para conocer los detalles y dejar tu solicitud.': 'Cutting-edge regenerative medicine backed by Regene Global, with training and certification included. Chat with NOVA to learn details and submit your request.',
    'Mediterránea': 'Mediterranean',
    'Memoria': 'Memory',
    'Menor capacidad adaptativa': 'Reduced adaptive capacity',
    'Menor capacidad regenerativa': 'Reduced regenerative capacity',
    'Menor recuperación': 'Slower recovery',
    'Menos energía': 'Less energy',
    'Metabolismo': 'Metabolism',
    'Moderado': 'Moderate',
    'Mis Pacientes': 'My Patients',
    'Mis pacientes': 'My patients',
    'Modal: detalle de parámetro': 'Modal: Parameter detail',
    'Motivo de consulta': 'Chief complaint',
    'Mucho': 'A lot',
    'Más antigua primero': 'Oldest first',
    'Más estrés': 'More stress',
    'Más fatiga': 'More fatigue',
    'Más reciente primero': 'Most recent first',
    'Médico': 'Physician',
    'Médicos': 'Physicians',
    'Médicos disponibles': 'Available physicians',
    'Módulo': 'Module',
    'Módulos': 'Modules',
    'NOVA': 'NOVA',
    'NOVA detectó elementos incompletos del expediente (NOM-004):': 'NOVA detected incomplete record elements (NOM-004):',
    'NOVA prepara tu consulta. No reemplaza diagnóstico médico.': 'NOVA prepares your consultation. Does not replace medical diagnosis.',
    'NOVA — Asistente IA de CODE CELLS®': 'NOVA — CODE CELLS® AI Assistant',
    'Nada de protocolos genéricos. Todo empieza contigo.': 'No generic protocols. Everything starts with you.',
    'Niebla mental': 'Brain fog',
    'Ningún resultado, el ensayo fue suspendido por seguridad': 'No result, the trial was suspended for safety',
    'Ninguno': 'None',
    'No': 'No',
    'Nivel': 'Level',
    'Nivel Clínico': 'Clinical Level',
    'Nivel clínico': 'Clinical level',
    'Niveles de certificación': 'Certification levels',
    'No envejecemos de una sola forma. Cada persona sigue una ruta distinta.': 'We do not all age the same way. Each person follows a different path.',
    'No envejeces de': 'You do not age in',
    'No ofrecemos consultas. Ofrecemos comprensión de tu biología.': 'We don\'t offer consultations. We offer understanding of your biology.',
    'Nombre': 'Name',
    'Nombre completo': 'Full name',
    'Normocalórica': 'Normocaloric',
    'Notas internas': 'Internal notes',
    'Nueva consulta': 'New consultation',
    'Nueva conversación': 'New conversation',
    'Nuevo': 'New',
    'Nuevo León': 'Nuevo León',
    'Nunca': 'Never',
    'Nutrición': 'Nutrition',
    'Número de sesión': 'Session number',
    'O pregúntale a NOVA en el chat de la derecha qué médico es mejor para tu caso. NOVA te hará un triage inteligente.': 'Or ask NOVA in the right-side chat which physician is best for your case. NOVA will do intelligent triage for you.',
    'Ocupación': 'Occupation',
    'Opcional': 'Optional',
    'Optimización Biológica Intravenosa': 'Intravenous Biological Optimization',
    'Osteoporosis': 'Osteoporosis',
    'PENDIENTE': 'PENDING',
    'PREGUNTA': 'QUESTION',
    'PREGUNTAS': 'QUESTIONS',
    'Paciente': 'Patient',
    'Paciente:': 'Patient:',
    'Pacientes': 'Patients',
    'Panel básico': 'Basic panel',
    'Panel metabólico avanzado': 'Advanced metabolic panel',
    'Pantalla 1: Verificación de personal': 'Screen 1: Staff Verification',
    'Pantalla 3: Menú de la sesión': 'Screen 3: Session Menu',
    'Pantalla 5+: Historia clínica (wizard dinámico, un contenedor reutilizado)': 'Screen 5+: Clinical history (dynamic wizard, reusable container)',
    'Pantalla 6: Fin de sesión': 'Screen 6: Session End',
    'Pantalla: enlace inválido': 'Screen: invalid link',
    'Pantalla: lista de pacientes (modo médico maestro)': 'Screen: patient list (master physician mode)',
    'Pantalla: éxito': 'Screen: success',
    'Personal CODE CELLS®: ingresa tu código para iniciar la sesión': 'CODE CELLS® staff: enter your code to start your session',
    'Peso': 'Weight',
    'Peso actual (kg) — si no está en el expediente': 'Current weight (kg) — if not in the record',
    'Peso, talla, presión — lo captura el personal': 'Weight, height, blood pressure — staff captures it',
    'Pestañas': 'Tabs',
    'Pide a tu médico que te comparta el link de registro nuevamente.': 'Ask your physician to share the registration link with you again.',
    'Piel, cabello o uñas con menos firmeza que antes': 'Skin, hair, or nails less firm than before',
    'Plan nutricional': 'Nutrition plan',
    'Plan terapéutico': 'Treatment plan',
    'Plan terapéutico / Indicaciones': 'Treatment plan / Indications',
    'Plasticidad biológica': 'Biological plasticity',
    'Poco': 'A little',
    'Política de privacidad': 'Privacy policy',
    'Por favor completa tu nombre y WhatsApp.': 'Please enter your name and WhatsApp.',
    'Portal Médico': 'Physician Portal',
    'Portal Médico CODE CELLS®': 'CODE CELLS® Physician Portal',
    'Portal Médico — CODE CELLS®': 'Physician Portal — CODE CELLS®',
    'Portal Médico: expediente clínico, protocolos, y apoyo de NOVA': 'Physician Portal: clinical record, protocols, and NOVA support',
    'Portal Paciente': 'Patient Portal',
    'Portal de capacitación': 'Training portal',
    'Posgrado': 'Postgraduate',
    'Potencial regenerativo': 'Regenerative potential',
    'Prefiero completarlo después': 'I prefer to complete it later',
    'Pregunta': 'Question',
    'Preparatoria': 'High school',
    'Preservar músculo': 'Preserve muscle',
    'Presión': 'Pressure',
    'Presión arterial': 'Blood pressure',
    'Primaria': 'Primary school',
    'Problemas de memoria': 'Memory problems',
    'Producción energética celular': 'Cellular energy production',
    'Programa de Capacitación Online': 'Online Training Program',
    'Programa de certificación médica CODE CELLS®. 9 módulos en 3 niveles clínicos.': 'CODE CELLS® physician certification program. 9 modules across 3 clinical levels.',
    'Progreso': 'Progress',
    'Protocolo': 'Protocol',
    'Protocolo actual': 'Current protocol',
    'Protocolos': 'Protocols',
    'Próxima cita': 'Next appointment',
    'Pérdida de enfoque': 'Loss of focus',
    'Pérdida progresiva de función': 'Progressive loss of function',
    'Qué es': 'What is',
    'Qué tan profundo quieres ir': 'How deep do you want to go',
    'Químicos que te intoxican': 'Chemicals that harm you',
    'Rara vez': 'Rarely',
    'Reactivo': 'Question',
    'Realiza tu evaluación': 'Take your assessment',
    'Receta': 'Prescription',
    'Receta digital': 'Digital prescription',
    'Receta médica': 'Medical prescription',
    'Recibes un mapa biológico simplificado': 'You receive a simplified biological map',
    'Recibes un mapa biológico simplificado: una narrativa, no solo una puntuación.': 'You get a simplified biological map: a narrative, not just a score.',
    'Reconocimiento': 'Recognition',
    'Reconocimiento de dispositivo: se muestra en vez del login si ya hay un médico recordado en este dispositivo': 'Device recognition: shown instead of login if a physician is already remembered on this device',
    'Recomendación:': 'Recommendation:',
    'Recuperación global': 'Overall recovery',
    'Recuperación lenta': 'Slow recovery',
    'Recuperación limitada': 'Limited recovery',
    'Recuperación tisular': 'Tissue recovery',
    'Red Médica CODE CELLS®': 'CODE CELLS® Physician Network',
    'Regulación neuroendocrina': 'Neuroendocrine regulation',
    'Reintentar': 'Retry',
    'Renovación tisular': 'Tissue renewal',
    'Reparación celular': 'Cellular repair',
    'Repasar módulo ↻': 'Review module ↻',
    'Repetir evaluación': 'Repeat assessment',
    'Reprobado': 'Not passed',
    'Requerido': 'Required',
    'Resiliencia biológica': 'Biological resilience',
    'Resistencia': 'Endurance',
    'Respaldo institucional COFEPRIS vía convenio con Regene Global': 'COFEPRIS institutional backing via agreement with Regene Global',
    'Responde con honestidad. Esto te ayudará a descubrir qué sistema biológico está perdiendo función primero.': 'Answer honestly. This will help you discover which biological system is losing function first.',
    'Responsable del tratamiento': 'Data controller',
    'Respuesta': 'Answer',
    'Resultado': 'Score',
    'Resultados de búsqueda': 'Search results',
    'Reunión estratégica · Propuesta de alianza': 'Strategic meeting · Alliance proposal',
    'Revelación': 'Revelation',
    'SLIDE 2 : Quieres saber más? (gate)': 'SLIDE 2 : Want to know more? (gate)',
    'SLIDE 5 : Cuánto cuesta': 'SLIDE 5 : How much does it cost',
    'Saber más': 'Learn more',
    'Salir': 'Log out',
    'Se activa al terminar el test biológico': 'Activates when the biological assessment ends',
    'Secundaria': 'Middle school',
    'Seguridad': 'Security',
    'Seguridad sin eventos adversos relacionados, con mejoría en fracción de eyección a las 12 semanas': 'Safety with no related adverse events, with improvement in ejection fraction at 12 weeks',
    'Seguimiento recomendado': 'Recommended follow-up',
    'Selecciona': 'Select',
    'Selecciona un paciente del panel izquierdo para ver su expediente clínico completo.': 'Select a patient from the left panel to view their complete clinical record.',
    'Seleccionar…': 'Select…',
    'Sesión #': 'Session #',
    'Sexo': 'Sex',
    'Sexo biológico': 'Biological sex',
    'Señales de pérdida': 'Signs of decline',
    'Siempre': 'Always',
    'Signos vitales': 'Vital signs',
    'Siguiente': 'Next',
    'Siguiente reactivo →': 'Next question →',
    'Sobrecarga fisiológica': 'Physiological overload',
    'Solicitar interconsulta': 'Request referral',
    'Solicitud': 'Application',
    'Solo necesitamos tu nombre completo para crear tu expediente. Tu médico ya está enterado de este registro.': 'We only need your full name to create your record. Your physician is already aware of this registration.',
    'Subir PDF o foto': 'Upload PDF or photo',
    'Subir estudio': 'Upload study',
    'Sueros IV, antihomotóxicos y nutracéuticos de base.': 'IV serums, antihomotoxic agents, and nutraceuticals as foundation.',
    'Suma biológicos de última generación — el nivel de mayor profundidad.': 'Add next-generation biologics — the deepest level.',
    'Sí': 'Yes',
    'Sí. Respaldo': 'Yes. Backing',
    'Síntesis de Conocimiento Clínico': 'Clinical Knowledge Synthesis',
    'TUS LABORATORIOS': 'YOUR LABS',
    'Tab: Historia clínica': 'Tab: Clinical history',
    'Tab: Nutrición — generador conectado al Motor de Personalización': 'Tab: Nutrition — generator connected to the Personalization Engine',
    'Talla': 'Height',
    'Teléfono': 'Phone',
    'Teléfono / WhatsApp': 'Phone / WhatsApp',
    'Teléfono WhatsApp': 'WhatsApp Phone',
    'Telómeros': 'Telomeres',
    'Temperatura': 'Temperature',
    'Temporizador de sesión': 'Session timer',
    'Tengo una duda sobre mi tratamiento': 'I have a question about my treatment',
    'Terapias Avanzadas y Optimización Molecular': 'Advanced Therapies and Molecular Optimization',
    'Terapias ambulatorias, sin cirugía, sin tiempos de recuperación largos.': 'Outpatient therapies, no surgery, no long recovery times.',
    'Terminar sesión': 'End session',
    'Test biológico': 'Biological assessment',
    'Tipo de consulta': 'Consultation type',
    'Toca el botón': 'Tap the button',
    'Toca el ícono de': 'Tap the icon for',
    'Toca para que te lo expliquemos rápido →': 'Tap for a quick explanation →',
    'Todo empezó como una alianza exclusiva.': 'It all started as an exclusive alliance.',
    'Todo lo anterior, más péptidos de precisión.': 'All of the above, plus precision peptides.',
    'Todos': 'All',
    'Tratamientos médicos reales para que tu cuerpo se repare desde adentro. Nada de spa, nada de solo estética.': 'Real medical treatments so your body repairs itself from within. No spa, no cosmetics-only approach.',
    'Tu capacidad de recuperación general ha bajado': 'Your overall recovery capacity has declined',
    'Tu cuerpo se siente más envejecido de lo esperado': 'Your body feels older than it should',
    'Tu expediente ha sido creado correctamente. Tu médico ya podrá verlo antes de tu cita.': 'Your record was created successfully. Your physician can already see it before your appointment.',
    'Tu información quedó guardada de forma segura. Escanea el código para acceder a tu app personal, donde puedes ver tu progreso y hablar con NOVA cuando quieras. When done, return the tablet to staff.': 'Your information is securely saved. Scan the code to access your personal app, where you can view your progress and talk to NOVA anytime. When done, return the tablet to staff.',
    'Tu mapa biológico': 'Your biological map',
    'Tu sistema prioritario es': 'Your priority system is',
    'Tu test dice qué te hace falta.': 'Your test shows what you need.',
    'Tu nombre': 'Your name',
    'Tus datos solo se usan para contactarte.': 'Your data is only used to contact you.',
    'Términos y condiciones': 'Terms and conditions',
    'Un viaje de descubrimiento, no un trámite médico.': 'A journey of discovery, not a medical procedure.',
    'Una clínica de': 'A clinic for',
    'Una red de clínicas enfocada en una sola cosa: tu bienestar a nivel celular.': 'A network of clinics focused on one thing: your wellbeing at the cellular level.',
    'Una infusión IV simple, sin cirugía adicional, en pacientes que ya tuvieron daño miocárdico — el atractivo es la simplicidad del procedimiento frente a alternativas más invasivas.': 'A simple IV infusion, with no additional surgery, in patients who have already suffered myocardial damage — the appeal is the simplicity of the procedure compared to more invasive alternatives.',
    'Valores fuera de rango — texto libre (opcional, se genera solo desde los valores rápidos)': 'Out-of-range values — free text (optional, generates only from quick values)',
    'Valores rápidos — pruebas point-of-care (glucosa capilar, etc.)': 'Quick values — point-of-care tests (capillary glucose, etc.)',
    'Velocidad cognitiva': 'Cognitive speed',
    'Ver': 'View',
    'Ver resultado': 'See result',
    'Ver señales': 'See signs',
    'Vitalidad física': 'Physical vitality',
    'Volver': 'Back',
    'Yucatán': 'Yucatán',
    'arriba a la derecha. Listo — el ícono de CODE CELLS® quedará en tu pantalla de inicio.': 'at the top right. Done — the CODE CELLS® icon will be on your home screen.',
    'completados': 'completed',
    'con indicaciones detalladas': 'with detailed indications',
    'fracción de eyección': 'ejection fraction',
    'de': 'of',
    'minutos': 'minutes',
    'médico': 'physician',
    'módulo': 'module',
    'módulos': 'modules',
    'o ve a nuestra página principal →': 'or visit our main page →',
    'semanas': 'weeks',
    'un código viejo': 'old code',
    'una sola forma': 'a single way',
    'tu energía celular podría estar perdiendo eficiencia — esto suele traducirse en fatiga, menor rendimiento y recuperación lenta.': 'your cellular energy might be losing efficiency — this usually translates into fatigue, lower performance, and slow recovery.',
    'profundizar en tu metabolismo energético y función mitocondrial.': 'delving into your energy metabolism and mitochondrial function.',
    'tu capacidad de reparación tisular podría estar disminuida — esto se refleja en recuperación lenta e inflamación persistente.': 'your tissue repair capacity might be reduced — this is reflected in slow recovery and persistent inflammation.',
    'evaluar tus marcadores de reparación celular e inflamación.': 'evaluating your cellular repair and inflammation markers.',
    'tu capacidad de adaptación al estrés podría estar sobrecargada — esto se asocia con ansiedad, insomnio o irritabilidad.': 'your stress adaptation capacity might be overloaded — this is associated with anxiety, insomnia, or irritability.',
    'trabajar tu regulación neuroendocrina y resiliencia biológica.': 'working on your neuroendocrine regulation and biological resilience.',
    'tu función cognitiva podría estar perdiendo claridad — esto se asocia con niebla mental y menor capacidad de enfoque.': 'your cognitive function might be losing clarity — this is associated with brain fog and reduced capacity for focus.',
    'profundizar en tu salud neurológica y plasticidad cerebral.': 'delving into your neurological health and brain plasticity.',
    'tu capacidad regenerativa podría estar disminuyendo — esto acelera el envejecimiento percibido y limita tu recuperación global.': 'your regenerative capacity might be declining — this accelerates perceived aging and limits your overall recovery.',
    'evaluar tu potencial de renovación tisular y plasticidad biológica.': 'evaluating your tissue renewal potential and biological plasticity.',
    '~3 MIN': '~3 MIN',
    '~3 min': '~3 min',
    '© 2026 CODE CELLS™': '© 2026 CODE CELLS™',
    '¿Cuánto cuesta?': 'How much does it cost?',
    '¿Cómo empiezo?': 'How do I start?',
    '¿Cómo voy con mi protocolo?': 'How am I doing with my protocol?',
    '¿El paciente ya tiene código, o es su primera vez?': 'Does the patient already have a code, or is it their first time?',
    '¿En qué puedo apoyarle el día de hoy — agendar una cita, resolver una duda sobre su proceso, o algo más?': 'How can I support you today—schedule an appointment, answer a question about your process, or something else?',
    '¿Notas que tu memoria reciente falla más de lo que recuerdas?': 'Do you notice your recent memory failing more than you remember?',
    '¿Por qué interesa a cardiólogos?': 'Why does this interest cardiologists?',
    '¿Quieres que un especialista revise tu mapa biológico?': 'Would you like a specialist to review your biological map?',
    '¿Quieres saber más?': 'Want to know more?',
    '¿Qué es esto?': 'What is this?',
    '¿Qué es exactamente?': 'What exactly is it?',
    '¿Qué mostró el ensayo fase I/II en infarto agudo de miocardio con MUSE alogénicas?': 'What did the phase I/II trial in acute myocardial infarction with allogeneic MUSE show?',
    '¿Sientes inflamación o molestias que no terminan de resolverse?': 'Do you experience inflammation or discomfort that does not fully resolve?',
    '¿Sientes niebla mental o dificultad para concentrarte?': 'Do you experience mental fog or difficulty concentrating?',
    '¿Sientes que tu capacidad de recuperación general ha disminuido con el tiempo?': 'Do you feel your overall recovery capacity has decreased over time?',
    '¿Sientes que tu cuerpo se ve o se siente más envejecido de lo que esperarías para tu edad?': 'Do you feel your body looks or feels older than you would expect for your age?',
    '¿Te cuesta conciliar o mantener el sueño?': 'Do you struggle to fall asleep or stay asleep?',
    '¿Te cuesta recuperarte después de un esfuerzo físico o mental?': 'Do you struggle to recover after physical or mental effort?',
    '¿Te sientes cansado o con baja energía la mayor parte del día?': 'Do you feel tired or low energy most of the day?',
    '¿Te sientes irritable o ansioso sin una causa clara?': 'Do you feel irritable or anxious without clear cause?',
    '¿Tus heridas o lesiones tardan más en sanar de lo normal?': 'Do your wounds or injuries take longer to heal than normal?',
    'Únete': 'Join us',
    'Únete a la Red CODE CELLS®': 'Join the CODE CELLS Network',
    '← Atrás': '← Back',
    '◈ Capacitación': '◈ Training',
    '✏️ Editar': '✏️ Edit',
    '👉 Usa los filtros de la izquierda o pregúntale a NOVA': '👉 Use the filters on the left or ask NOVA',
    '🔍 Encuentra tu Médico': '🔍 Find Your Physician',
    '🩺 Fundada por médicos con más de 20 años de experiencia en medicina regenerativa — hoy construyendo una red de especialistas afiliados en todo México y Latinoamérica.': '🩺 Founded by physicians with 20+ years of regenerative medicine experience — today building a network of affiliated specialists across Mexico and Latin America.',
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
    var debounceTimer = null;
    observer = new MutationObserver(function (mutations) {
      if (current === 'es') return;
      observer.disconnect();
      // Debounce para evitar múltiples re-escaneos
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (node.nodeType === 1) {
              translateTextNodes(node, current);
              translateAttributes(node, current);
            } else if (node.nodeType === 3 && node.parentNode && !skip(node)) {
              translateTextNodes(node.parentNode, current);
            }
          }
        }
        observer.observe(document.body, { childList: true, subtree: true });
      }, 50); // Re-traducir después de 50ms de cambios
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Forzar re-traducción cuando se abren diálogos (modales, popovers, etc)
    document.addEventListener('show', function () {
      if (current !== 'es') {
        setTimeout(function () {
          translateTextNodes(document.body, current);
          translateAttributes(document.body, current);
        }, 100);
      }
    }, true);

    // Re-escanear TODO el DOM periodicamente para atrapar dinámico tarde (más frecuente)
    setInterval(function () {
      if (current !== 'es' && document.body) {
        translateTextNodes(document.body, current);
        translateAttributes(document.body, current);
      }
    }, 400); // Cada 400ms para atrapar modales, NOVA, y contenido dinámico rápidamente
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
