# Análisis — directorio médico y app del paciente (2026-10-23)

> Pedido de Víctor: "como no podemos avanzar con la etapa 3, vamos a mejorar el
> directorio médico; haz un análisis de qué se podría mejorar y revisa la app del
> paciente, debe quedar súper genial".
>
> Revisado: `directorio/index.html`, `directorio/medico.html`, `directorio/solicitud.html`
> y `api/airtable.js` en `feat/directorio` (código + Preview en el navegador);
> `mi-nivel.html` y `panel-citas-mi-nivel.js` en `feat/paciente-unico` (solo código:
> la app pide PIN y los códigos demo no pueden entrar).
>
> Categorías (`docs/REGLAS-DE-DECISION.md`): **A** = lo hago y te informo · **B** = lo hago,
> tú puedes vetar · **C** = solo tú decides.

---

## Parte 1 — Directorio médico

### 1.1 Errores que hay que corregir (A)

| # | Qué pasa | Por qué importa |
|---|---|---|
| D1 | **"Culiacán" y "Culiacan" son ciudades distintas.** El filtro compara texto exacto; tu perfil dice "Culiacan" (sin acento). Un paciente que elige "Culiacán" **no te encuentra**. | Pierdes pacientes sin enterarte. Hay que normalizar la ciudad al guardar (catálogo de ciudades) y comparar sin acentos ni mayúsculas. |
| D2 | Los botones de días dicen "Sábado, 24 **De** Octubre" (el CSS pone mayúscula a cada palabra). | Se ve descuidado justo en el paso de agendar. |
| D3 | La ciudad sale **dos veces** en la tarjeta y en la ficha (debajo del nombre y en la fila con ícono). | Ocupa espacio y se ve repetido. |
| D4 | Si falla la lista de ciudades, el filtro se queda en "Todas las ciudades" sin avisar. | CLAUDE.md §6: un fallo debe verse como fallo. |
| D5 | Las listas de especialidades y herramientas están **fijas en el HTML**: el paciente puede elegir "Nefrología" y no encontrar a nadie, y una especialidad nueva de un médico no aparece en el filtro. | Hay que armarlas con lo que de verdad tienen los perfiles publicados, con su conteo ("Cirugía Plástica · 2"). |
| D6 | El directorio público devuelve **máximo 50 médicos** y no tiene paginación. | Con el piloto no importa; con Regene (cientos de médicos) sí. |
| D7 | La página guarda en el navegador las ligas de "mis solicitudes" (`cc_mis_solicitudes`), pero **ninguna pantalla las lee**. | Si el paciente pierde la liga, pierde su cita. Ver M3. |
| D8 | La opción "DEZAWA (VIP)" en Herramientas: el VIP ya se fusionó con el paciente normal. | Sobra el "(VIP)" de cara al paciente. |

### 1.2 Mejoras de experiencia: lo que lo haría "genial" (B)

| # | Mejora | Detalle |
|---|---|---|
| M1 | **"Próximo horario libre" en la tarjeta** | En los médicos con agenda automática: insignia "Agenda en línea · próximo: lun 26, 12:00". Es lo que más convierte en Doctoralia/Zocdoc, y CODE CELLS ya tiene el dato (`disponibilidad`). |
| M2 | **Agendar en 3 toques, el horario primero** | Hoy el paciente llena nombre, teléfono y correo **antes** de ver si hay horario. Mejor: tira de 7 días con horarios visibles → toca la hora → **después** nombre y teléfono → confirmar. Se quita el calendario nativo, que en el navegador sale en inglés ("mm/dd/yyyy"). |
| M3 | **"Mis citas" en este dispositivo** | Un botón en `/directorio/` que lista las solicitudes guardadas en el navegador (D7), cada una con su estado. Sin cuenta y sin datos nuevos. |
| M4 | **"Agregar a mi calendario" (.ics)** | Al confirmar la cita, un archivo de calendario con recordatorio 24 h y 2 h antes. Sirve en iPhone, Android y Outlook, sin SMS ni costo. Es el recordatorio que hoy no existe. |
| M5 | **Búsqueda por nombre o síntoma** | Una caja "Busca por nombre, especialidad o lo que quieres atender" arriba de los filtros. Hoy solo hay 3 menús. |
| M6 | **Ficha que se comparte bien** | Al mandar la liga de un médico por WhatsApp sale una vista previa genérica. Con vista previa propia (nombre, foto, especialidad) y una liga bonita (`/directorio/dr-rodriguez`), **el médico se anuncia solo**: es valor directo por lo que paga. |
| M7 | **Botón "Agendar" visible en la ficha** | En celular el formulario queda muy abajo. Un botón fijo "Agendar cita" al pie de la pantalla que baja al formulario. |
| M8 | **Liga de la cita más útil** | En `solicitud.html` faltan: dirección del consultorio, botón "Cómo llegar" (Google Maps), "Agregar a mi calendario" y el teléfono del consultorio cuando la cita ya está confirmada. |
| M9 | **"Únete a la red" para médicos** | El encabezado del directorio solo dice "Acceso médico". Un médico que entra como paciente no tiene por dónde pedir su alta (`unete.html`). |
| M10 | **Idiomas** | Las 3 páginas públicas del directorio no cargan el sistema de idiomas (`lib/i18n.js`); todo el panel "Mi directorio" del portal también está solo en español. Prioridad baja para el lanzamiento en México. |

### 1.3 Campos nuevos del perfil (B, salvo lo marcado C)

| # | Campo | Por qué |
|---|---|---|
| P1 | **Dirección del consultorio + mapa** | Hoy solo hay ciudad. El paciente con cita confirmada no sabe a dónde ir. |
| P2 | **Cédula profesional (y de especialidad) con liga de verificación** — **C, va al abogado** | Es la señal de confianza más fuerte para el paciente. Además, hasta donde sé, la regulación mexicana de publicidad de servicios de salud pide mostrar el número de cédula en los anuncios de médicos, y un perfil público lo es. **Hay que confirmarlo con el abogado** antes de abrir. También resuelve la decisión #8 ("Especialistas certificados" → "Cédula profesional verificada"). |
| P3 | **Costo de la consulta (opcional)** | Lo decide cada médico. Es de lo que más busca el paciente; no rompe "la plataforma no se mete en lo económico", solo lo informa. |
| P4 | **Idiomas que habla, consulta en línea sí/no, formas de pago** | Filtros útiles con costo bajo. |

### 1.4 Del lado del médico (B)

- **Resumen semanal por Telegram:** "Esta semana: 23 visitas a tu perfil, 4 citas agendadas". Es lo que justifica los $600 al mes. Requiere contar visitas sin datos personales (contador por perfil, sin IP guardada).
- **Ficha "como la ve el paciente"** desde el portal ("Ver mi perfil público") y una liga para compartir en sus redes.

---

## Parte 2 — App del paciente (`mi-nivel.html`, rama `feat/paciente-unico`)

### 2.1 La pestaña "Citas" está rota: hay que rehacerla (A)

`panel-citas-mi-nivel.js` es código viejo que no se actualizó con la seguridad nueva:

1. **Lee el código de paciente de una llave que la app no usa** (`pacienteCodigoActual`; la app guarda `ccpac_codigo`) y si no lo encuentra **usa `CC-PAC-DEMO01`**, un paciente ficticio. Hoy lo salva que el servidor ignora el filtro del navegador, pero es justo el patrón que CLAUDE.md §6 prohíbe.
2. **Rellena con datos inventados:** si la consulta no tiene sistema pone "CONTINUUM™"; si no tiene protocolo pone "Evaluación"; si no tiene médico pone "Por asignar" (CLAUDE.md §7).
3. **"✅ Confirmar" no funciona:** manda un PATCH a CONSULTAS y el servidor responde 403 ("Las consultas solo las registra el médico"), con una ventana `alert()`. El comentario del servidor dice que "ninguna pantalla del paciente escribe ahí": esta sí lo intenta.
4. **"Indicaciones" y "Receta" no hacen nada:** buscan un `data-cita-id` que nunca se escribe en la pantalla.
5. **Un error se ve como "No tienes citas agendadas"** (el `catch` solo escribe en la consola). Además, una cita de **hoy** desaparece después de las 6 p.m.: compara la fecha como medianoche UTC.
6. Se ve distinta al resto de la app: emojis, bordes gruesos, otros colores.
7. El estado vacío dice "Contacta a tu médico para agendar", sin un botón para hacerlo.

**Propuesta:** una pestaña Citas nueva que muestre (a) las consultas registradas por su médico, en solo lectura, y (b) un botón **"Agendar con mi médico"** que use la agenda automática del directorio para los médicos de "Mi equipo". Ligar las solicitudes del directorio al paciente con cuenta es tema de identidad → **C** (ver 2.4).

### 2.2 Lo que la haría "súper genial" (B)

| # | Mejora | Detalle |
|---|---|---|
| A1 | **Recordatorios de verdad (notificaciones)** | La app ya tiene manifest y service worker (`sw-paciente.js`), pero hoy dice "por ahora la app no te avisa si está cerrada". Notificaciones web para tomas de medicamento y citas. Es **la** función que hace que el paciente abra la app cada día. Requiere llaves VAPID (gratis) y una tarea programada en Vercel. |
| A2 | **Pantalla de inicio "Hoy"** | Arriba: tu próxima cita, tus tomas de hoy, el día X de 90 del protocolo. Hoy Inicio es una lista larga de tarjetas (protocolo, Biological Map, Mi equipo, llave, invitar). |
| A3 | **Un solo diseño para toda la red** | La app usa otra tipografía (Cormorant/DM Sans) y otro dorado (#C9A96E) que el directorio y la home (Fraunces/IBM Plex, #E8A33D). Se siente como dos productos. Unificar con la línea de `index.html`. |
| A4 | **Íconos en lugar de emojis** | La barra inferior usa 🏠📈📋📅💬: se ven distintos en cada teléfono y le restan seriedad médica. Íconos de línea como los del directorio. |
| A5 | **Música apagada y discreta** | El botón 🔇 fijo arriba a la derecha compite con el selector de idioma. Moverlo a un menú "Ajustes". |
| A6 | **Biological Map con evolución** | Hoy muestra la última evaluación. Una línea "antes / ahora" por sistema motiva más que un número suelto (sin interpretar: CLAUDE.md §7). |
| A7 | **Compartir expediente con QR** | La llave de 24 h se dicta a mano (código + llave). Un QR que el médico escanea desde su portal es más rápido y evita errores de dedo. |

### 2.3 Cosas que se ven bien y se conservan

PIN con teclado propio y liga de activación; "Mi equipo"; llave de un solo uso; medicamentos solo por receta y suplementos marcados "registrado por ti"; gráficas con el motor del portal; estados vacíos honestos en Biological Map, labs y plan; selector de idioma en su lugar.

### 2.4 Decisiones tuyas (C)

1. **Directorio ↔ app:** ¿un paciente que agenda en el directorio puede después "reclamar" esas citas en su app? Hoy es por teléfono, y ligarlo por teléfono contradice "teléfono = señal, no identidad" (memoria de identidad + CURP). Recomendación: liga con clave (la que ya tiene) → botón "Guardar en mi app" ya con sesión.
2. **Cédula en el perfil (P2):** confirmarlo con el abogado.
3. **La app sigue en fase 2** (tras acta + IMPI). Recomendación: arreglar ya la pestaña Citas (2.1) en `feat/paciente-unico` porque es un error, y dejar A1–A7 para cuando se retome la fase 2, salvo que quieras adelantar alguna.

---

## Orden propuesto

1. **Hoy, en `feat/directorio` (A):** D1–D5, D8. Son arreglos chicos con prueba.
2. **Siguiente (B):** M2 (agendar con el horario primero) + M1 (próximo horario en la tarjeta) + M4 (.ics) + M3 (mis citas). Es el paquete que más se nota para el paciente.
3. **Después (B):** M5, M6, M7, M8, M9, P1, P3, P4 y el resumen semanal del médico.
4. **En `feat/paciente-unico` (A):** rehacer la pestaña Citas (2.1).
5. **Fase 2:** A1–A7.
