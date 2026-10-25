# CONTINUAR — recordatorio de sesión (rama ÚNICA `feat/paciente-unico`)

> **Protocolo.** Al decir "continúa", Claude lee este archivo PRIMERO y retoma
> desde "Siguiente paso". Al cerrar cada sesión, Claude lo REESCRIBE (no
> agrega al final): este archivo es el estado actual, no un diario. El
> historial vive en git (`git log`) y en la memoria del proyecto.
>
> **Rama única desde 2026-10-24** (decisión de Víctor): `feat/directorio` se fusionó
> dentro de `feat/paciente-unico` y de aquí en adelante TODO se trabaja aquí
> (directorio + portal del médico + app del paciente). `feat/directorio` queda
> como referencia histórica; no se le agregan commits. El congelamiento por
> áreas protege producción: el directorio se abre y lo clínico sigue cerrado.

**Última actualización:** 2026-10-24 (noche) — rama única (`ad6020b`); hotfix de inyección en login (`hotfix/auth-login-inyeccion`, falta push + merge a main); **PIN para médicos + entrada única `entrar.html`** (ver §1). Tablas `VISITAS_DIRECTORIO` y `CREDENCIALES_MEDICO` ya creadas en producción (vacías, §4b).

---

## 1. Siguiente paso (empezar aquí)

1. ~~Hotfix de inyección~~ EN PRODUCCIÓN (PR #7, `3d951df`, verificado 401 en codecells.mx, 2026-10-24). Falta `git push origin feat/paciente-unico` (rama única).
   - Vercel (2026-10-24): los 4 ajustes de Preview por rama (`TELEGRAM_BOT_TOKEN_PRUEBA`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_PRUEBA`, `GOOGLE_REDIRECT_URI`) se MOVIERON de `feat/directorio` a `feat/paciente-unico` (no se copiaron: los secretos no pasan por Claude). `GOOGLE_REDIRECT_URI` = `https://codecells-site-git-feat-paciente-unico-codecells.vercel.app/api/google-oauth-callback` → Víctor la agrega en Google Cloud (Credenciales → cliente OAuth → URIs de redireccionamiento).
   - Tras el primer Preview: abrir `https://codecells-site-git-feat-paciente-unico-codecells.vercel.app/api/telegram-bot?accion=registrar_webhook` (registra el webhook del bot de prueba en el Preview nuevo y confirma que el token movido es el del bot de prueba).
2. **PIN para médicos + entrada única (2026-10-24, decisión de Víctor):**
   - `entrar.html`: "¿Eres médico o paciente?" → código → PIN → portal (`#selector`) o `mi-nivel.html`. Recibe las ligas `?activar=…&t=medico|paciente`. El portal sin sesión y "Salir" mandan aquí; se quitó el auto-login de 90 días por dispositivo (entraba sin nada). La app del paciente sin código recordado manda aquí.
   - Servidor: `lib/credenciales.js` (antes `credencialesPaciente.js`) sirve a los dos; tabla `CREDENCIALES_MEDICO` (prueba `tbl2bkJUptlAM6Ghe`). `auth-login` exige PIN al médico (mismas reglas: scrypt, 5 fallos → 15 min, 10 → solo liga nueva).
   - Ligas de médico: `node scripts/liga-activacion-medico.js CCMED-XXXX` (arranque; en producción con `--url https://www.codecells.mx --produccion` y el `SESSION_SECRET` de producción en `.env.local`, p. ej. con `vercel env pull`) o panel `admin-directorio.html` → "Enlace de acceso para un médico" (`api/directorio?accion=admin_liga_acceso`).
   - Probado en navegador local con `CCMED-QACARD` (ficticio): liga → PIN trivial rechazado → PIN creado → selector → portal con pacientes → Salir → código recordado → PIN incorrecto (quedan 4) → PIN correcto. Panel: código inexistente da error; enlace generado. 489/489 pruebas (10 nuevas en `test/pin-medico.test.js`). PIN de prueba de QACARD: en `.env.local` del worktree (no en el repo).
   - **Arranque del PIN = Telegram `/pin`** (2026-10-24): el médico con Telegram vinculado escribe `/pin` al bot y recibe SU liga (firmada en el servidor del ambiente: Preview → liga de Preview, producción → codecells.mx). El script `liga-activacion-medico.js` solo sirve en local: `SESSION_SECRET` de Vercel es "sensitive" y no se puede leer.
   - **AL LANZAR: ningún médico entra hasta tener su liga** (Víctor con `/pin`, los demás con `/pin` o desde el panel). `CCMED-DEMO01` también necesita PIN.
   - Hotfix Telegram EN PRODUCCIÓN (PR #8, `05e467d`): un vínculo de Telegram ya no se reemplaza mandando el código de otro médico. Falta: el PRIMER vínculo de un médico sin Telegram sigue siendo solo con código → hacerlo con liga de un solo uso desde el portal (con PIN).
   - **Hallazgo (pre-existente, no lo causó esto):** con un paciente demo la app pide PIN ("Tu sesión venció") porque la pestaña Citas consulta con `CC-PAC-DEMO01` FIJO (análisis §2.1) y un 401 dispara el aviso de sesión vencida. Siguiente arreglo: rehacer la pestaña Citas.
3. **Revisar en Preview, desde un celular** (lo de hoy se probó en local contra la base de prueba; la ficha y la búsqueda también en navegador):
   - `/directorio/`: caja **Buscar** ("cardiología", "Culiacan", "rodriguez", algo que no exista → «Ningún médico menciona…»; queda en `?q=`). Las tarjetas ya abren `/directorio/<liga>`.
   - **Liga bonita**: `/directorio/prueba-dr-qa-cardiologia` y `/directorio/dr-rodriguez`. **Pegar la liga de Preview en un chat de WhatsApp contigo mismo** y ver que salgan nombre, especialidad y ciudad. Ojo: Preview tiene Vercel Authentication, así que WhatsApp probablemente NO podrá leerla (verá la pantalla de acceso de Vercel); la prueba de la vista previa de verdad es en producción o con el bypass. En local no se puede probar (WhatsApp no llega a 127.0.0.1).
   - **Dirección**: ficha del Dr. QA (`/directorio/prueba-dr-qa-cardiologia`) ya tiene dirección ficticia `[PRUEBA] Av. Álvaro Obregón 123…` y teléfono `6670000000` (base de prueba) → renglón con "Cómo llegar" (abre mapas). Pedir una cita ahí → en la liga de la cita: "Dónde", "Cómo llegar", y con cita confirmada "Teléfono" + "Llamar al consultorio"; el archivo de calendario debe traer el lugar.
   - Portal → Mi directorio: capturar tu **dirección** ("Cómo te contactan"); una liga de Maps debe dar error. **Teléfono del consultorio: antes no se guardaba** (autosave ignoraba `type=tel`, arreglado en `d4fa945`) — confirmar que ahora sí.
   - **Costo** (P3): el Dr. QA tiene $800 de prueba → ficha "Consulta: $800 MXN · se paga en el consultorio", tarjeta "Consulta: $800 MXN", y renglón Costo en la liga de la cita. En el portal ("Cómo te contactan") probar "$1,200" (se guarda 1200), "500-800" (error) y vaciarlo (desaparece de la ficha). Admin: la tarjeta de revisión ahora muestra dirección y costo.
   - **Consulta en línea** (`97b64a5`): el Dr. QA (base de prueba) la tiene marcada con $600 → tarjeta "En línea: $600 MXN", ficha con la nota "Horario y pago se acuerdan directamente con el médico… CODE CELLS no cobra ni interviene", y en `/directorio/` el filtro **Modalidad → Solo en línea** deja solo a él (probado en navegador local). Portal: casilla "Ofrezco consulta en línea" (se guarda al marcar) + costo en línea; desmarcarla oculta el costo de la ficha.
   - **Solicitud presencial / en línea** (`9dd5eac`): en la ficha del Dr. QA aparece "¿Cómo quieres tu consulta?"; "En línea" cambia a "Solicitar consulta en línea" (fecha y turno preferidos, sin horas aunque tenga agenda automática; costo $600 y nota de pago directo). Probado en navegador local SIN enviar (enviar manda Telegram real). En Preview: enviar una en línea → aviso de Telegram dice "EN LÍNEA", queda Pendiente; en el portal sale la etiqueta "En línea"; la liga de la cita no muestra "Dónde" ni "Cómo llegar".
   - **NOVA** (`9a8a6cb`): preguntarle "¿cuánto cuesta la consulta con el Dr. QA?" (debe decir $800 / en línea $600 y que se paga directo al médico) y por un médico sin precio (debe decir que no lo publicó). **No probado con la IA real**: solo la herramienta, con pruebas automáticas. Ya NO dice "$1,500".
   - **Foto** (`65672ea`, lo pidió Víctor): "Cambiar imagen" abre "Centra tu imagen"; arrastrar con el dedo, acercar con el control, Guardar → la ficha muestra ese encuadre. Probado en navegador local con imagen generada (centro, arrastre hasta el borde, acercar, cancelar); falta probarlo con el dedo en un celular. Una foto ya subida no se puede reencuadrar: hay que volver a elegir el archivo.
   - Portal → Mi directorio: aparece "Tu liga para compartir" + Copiar (perfil publicado). Campo **Teléfono del consultorio** (10 dígitos; "123" debe dar error). En "Redes sociales", **WhatsApp** (número o liga wa.me) → sale como botón en la ficha.
   - Ficha: con datos dejados, botón **"Llamar al consultorio"** (tel:). Ya no hay "Enviármela por WhatsApp".
   - Home: "Encuentra a tu médico" lleva al directorio; al terminar la evaluación **NOVA debe abrirse sola** (antes la abría un parche que interceptaba WhatsApp; ahora se llama directo) y al final de la plática sale "Encuentra a tu médico en el directorio".
   - `code-cells-network`: el botón final dice "Solicitar afiliación" y va a `unete.html`.
   - Ojo: una cita real en Preview manda aviso de Telegram real.
   - **M9** (`5e4e004`): en `/directorio/` el encabezado dice "Únete a la red" (en celular "Únete") junto a "Acceso médico" → `unete.html`. Medido sin desbordar en 320/360/375/414/700 px. En `unete.html`, si la solicitud no se guarda, NOVA ya NO dice "quedó registrada": dice que no se pudo y por qué (probado con respuestas simuladas 503 / sin red / 200, sin crear registros).
   - **Resumen semanal**: abrir una ficha en Preview cuenta una visita (una por semana por navegador; en Airtable de prueba, tabla `VISITAS_DIRECTORIO`). El cron NO corre en Preview (solo en producción). Para ver los textos sin mandar nada: `curl -H "Authorization: Bearer <CRON_SECRET>" "<preview>/api/resumen-semanal?prueba=1"` (Preview además pide el bypass de Vercel Authentication). Sin `prueba=1` manda Telegram real a los médicos de prueba con Telegram (hoy solo VIRN01) y el control a Víctor.
4. **Siguiente trabajo** (orden del análisis, `docs/ANALISIS-DIRECTORIO-Y-APP-PACIENTE-2026-10-23.md`): ~~M5~~ ~~M6~~ ~~P1~~ ~~M8~~ ~~P3~~ ~~consulta en línea (parte de P4)~~ · ~~M9~~ · ~~resumen semanal~~ · **siguiente: M7 botón "Agendar" fijo** (ya existe `vigilarBotonFijo` en la ficha: revisar si M7 ya está hecho) o M10 idiomas (baja), o pasar a la pestaña Citas de la app del paciente.
5. **App del paciente** (`mi-nivel.html`, rama `feat/paciente-unico`): la pestaña **Citas está rota** (análisis §2.1). Rehacerla es categoría A. Lo demás de la app es fase 2.

### Lo hecho el 2026-10-24
- `3241ff7` **M5 búsqueda**: `?q=` en la lectura pública; `palabrasBusqueda()` / `coincideBusqueda()` en `lib/directorio.js` (sin acentos, cada palabra debe estar en lo publicado). **Sin sinónimos a propósito** ("rodilla" no encuentra "Ortopedia" salvo que el médico lo escriba). Decisión posible (B): tabla de sinónimos revisada a mano.
- `0d13bcd` **WhatsApp fuera de la plataforma** (Víctor: "no depender de otras empresas"). No había Twilio en el código; eran ligas `wa.me`. Directorio: teléfono del consultorio validado (`normalizarTelefono`) con botón Llamar (tel:); home → directorio; NOVA del test se activa directo (`window.novaActivar`) y se quitó el parche de `window.open`; afiliación → `unete.html`, se pide "teléfono celular". Campos de Airtable NO renombrados (`WhatsApp`, `Teléfono/WhatsApp` siguen guardando un teléfono).
- `d797fae` **WhatsApp del médico como red social** (Víctor lo pidió así): opcional y **público**, en "Redes sociales"; se guarda `https://wa.me/<número>` sin mensaje pre-escrito (`normalizarWhatsApp`); editarlo en un perfil publicado marca revisión. Campo `WhatsApp público` (ya existía en ambas bases). Consentimiento **v1.3-borrador 2026-10-24** (menciona WhatsApp). La plataforma sigue sin pedir ni mandar nada por WhatsApp.
- `66345ea` **M6 liga bonita + vista previa**: `/directorio/<liga>` → `api/ficha.js` (vercel.json, con `includeFiles`) arma `directorio/medico.html` con título, descripción, `og:*` y canonical; la página recibe el id en `window.FICHA`. `Liga pública` se asigna UNA vez al aprobar (`ligaDisponible`, -2 si existe) y es campo protegido (no cambia si el médico edita su nombre). Lista blanca pública movida a `lib/directorio.js` (`CAMPOS_LECTURA_PUBLICA`, `limpiarPerfilPublico`). 404 noindex si no existe, 502 si Airtable falla. Caché 5 min (un cambio o despublicación tarda eso en verse en la liga bonita). `scripts/asignar-ligas-directorio.js` (solo muestra; `--aplicar`; `--produccion` para prod) — ya aplicado en la base de prueba (10 perfiles).
- `d4fa945` **P1 + M8**: `Dirección del consultorio` (opcional, pública, `normalizarDireccion` rechaza ligas, máx. 300; editarla publicado marca revisión); ficha y liga de la cita con "Cómo llegar" (`enlaceMapa`: liga normal a Google Maps, sin llave); `/api/citas?accion=estado` devuelve `consultorio {direccion, ciudad, mapa, telefono, liga}`; con cita confirmada se ve teléfono + Llamar; `.ics` con `LOCATION`. Consentimiento **v1.4-borrador 2026-10-24** (menciona dirección). Arreglo: autosave del portal no escuchaba `input[type=tel]` → el teléfono del consultorio de `0d13bcd` no se guardaba.
- `6c12e6b` **P3 costo de consulta**: `Costo de consulta` (moneda, pesos enteros, opcional, público; `normalizarCosto`/`costoLegible`; vacío lo borra; rangos/centavos/0 se rechazan). Ficha, tarjeta y liga de la cita (`consultorio.costo`). Solo informa: "se paga en el consultorio". NOVA no lo conoce todavía (su lista pública en `api/nova.js` es aparte; agregarlo es decisión B). Admin muestra dirección (faltaba desde P1) y costo. Consentimiento **v1.5-borrador 2026-10-24**. Probado en navegador local: ficha y tarjeta; portal y admin solo con pruebas automáticas.
- `97b64a5` **Consulta en línea** (Víctor 2026-10-24: algunos médicos la dan; precio, horario y pago los arregla el médico, **cobro directo por transferencia personal, CODE CELLS no interviene**): `Consulta en línea` (casilla) + `Costo de consulta en línea`; el costo solo se publica con la casilla marcada; filtro `?enlinea=1`. La solicitud de cita NO tiene campo de modalidad: el paciente lo escribe en "¿Qué te gustaría atender?". Si se quiere una opción "presencial / en línea" en la solicitud, hace falta un campo nuevo en SOLICITUDES (decisión B). Arreglo de paso: el teléfono del consultorio (`type=tel`) no tenía estilo en el portal.
- `9dd5eac` **Modalidad en la solicitud**: campo `Modalidad` (Presencial / En línea) en SOLICITUDES (`tblUsc72JO2BaqT6d`; prueba `fldW0hLhSp3myFeb8`, prod `fldCn4y6dWnLnmylM`). Se escribe SIEMPRE (también "Presencial"); vacío en solicitudes viejas = presencial. En línea nunca usa la agenda automática; 400 si el médico no la ofrece.
- `9a8a6cb` **NOVA con precios**: se quitó del prompt "Primera consulta: $1,500 MXN" y la cobertura escrita a mano; la herramienta `buscar_medicos_directorio` devuelve costos (null = no publicado), consulta en línea y liga; filtro `en_linea`; ciudad sin acentos. Botón del home ahora aparece cuando NOVA menciona el directorio.
- `5e4e004` **M9 "Únete a la red"** en el encabezado del directorio; `unete.html` ya no dice "registrada" si el guardado falló (antes se tragaba el error; en producción, con `afiliacion` congelada, TODA solicitud se perdía en silencio).
- **Resumen semanal al médico**: `lib/resumen-semanal.js` (reglas puras) + `api/citas.js` `?accion=visita` (público, POST) y `?accion=resumen_semanal` (cron, `Authorization: Bearer CRON_SECRET`, `&prueba=1` no manda nada). `vercel.json`: rewrite `/api/resumen-semanal` + cron `0 16 * * 1` (lunes 9:00 Culiacán). Semana lunes–domingo en `America/Mazatlan`, nombrada por su lunes. Visitas en tabla `VISITAS_DIRECTORIO` (`Clave` perfil|lunes, `Perfil`, `Semana`, `Visitas`), sin IP ni cookie; el navegador marca en localStorage `cc_visita_<id>`; bots fuera por User-Agent (incluye la vista previa de WhatsApp/Telegram). Lee TODO antes de mandar: si una lectura falla, ningún médico recibe nada y Víctor recibe "NO se envió". Sin Telegram → no se le manda (no hay respaldo por médico); Víctor recibe un control con quién no lo recibió. La lectura de SOLICITUDES pide solo campos sin datos del paciente. Probado en local contra la base de prueba: visita real (crea fila, no duplica, suma), `prueba=1` con datos reales, 401 sin secreto. **No probado: el envío real por Telegram ni el cron de Vercel** (solo con red simulada). Trampa encontrada: el GET de un registro por id en Airtable NO acepta `fields[]` (422).
- Pruebas: **204/204**.
- **WhatsApp que queda fuera de esta rama** (fase 2, `feat/paciente-unico`): portal VIP y `dezawavip.html` (verificación con "últimos 4 dígitos de tu WhatsApp", botones "Enviar por WhatsApp"), portal clínico ("Enviar por WhatsApp"/"Copiar para WhatsApp" de planes y recetas), `api/nova.js` (Canal 'WhatsApp' en solicitudes de cita, firma "📲 WhatsApp"). `aviso-privacidad.html` dice "Número telefónico o de WhatsApp": cambiarlo con la revisión del abogado.

### Lo hecho el 2026-10-23 (tarde)
- `7e86b85` redes sociales y sitio web en la ficha: el médico pega liga o `@usuario`; el servidor solo acepta el dominio de cada red y guarda https completo; lo público se revalida (`lib/directorio.js` `normalizarRed`). Cambiarlas en un perfil publicado lo marca para revisión. Consentimiento sube a **v1.2-borrador 2026-10-23** (menciona redes). Errores al guardar en "Mi directorio" ya se muestran al médico.
- `c2aac06` ciudad: se compara por clave sin acentos y se guarda/muestra con un catálogo (`normalizarCiudad`; ciudad desconocida se respeta). Filtros con lo publicado y conteo (`/api/airtable?tabla=directorio_medico&accion=filtros`). Búsqueda pública lee todas las páginas y falla con 502. Días "de octubre", ciudad sin repetir, "DEZAWA" sin "(VIP)".
- `15a05ec` agendar: tira de 7 días → hora → datos; `directorio/calendario.js` (.ics con alarmas 24 h y 2 h; hora convertida con la zona del consultorio, flotante si no se conoce); `/api/citas?accion=proximos&ids=` (insignia; si la agenda no se lee, no se promete nada); `disponibilidad` devuelve `primero` y `zona`; `estado` devuelve `agenda {zona, duracion}`; "Tus citas en este teléfono" lee `cc_mis_solicitudes`; botón fijo en celular.
- **Airtable responde 403 `INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND` (no 404) a un id que no existe**: `api/citas.js` ahora lo trata como "no existe" (`noExiste()`); el simulador de `test/citas.test.js` responde igual que Airtable.
- **Campos del directorio creados en PRODUCCIÓN** con autorización de Víctor (ver §4b).
- Pruebas: **166/166**.

### Estado general de la rama
- Etapas 0, 1, 2 y 2b hechas (Preview, base de prueba). Producción congelada en `main@66cd2ed`.
- **⏸ Etapa 3 (cobro) DETENIDA** (Víctor, 2026-10-23): sin acta constitutiva de GALONAVA GROUP no hay cuentas bancarias ni de pagos. Al retomarla decidir: quién cobra/factura, medio (Mercado Pago recomendado; Stripe; SPEI), CFDI (automático recomendado), qué pasa si no paga (7 días de gracia y se oculta, recomendado). Precio decidido: Red $600/mes con IVA.
- **Reglas de Víctor:** nada a producción hasta que TODO esté listo y probado (ni el PR chico de privacidad). Lanzamiento con `DESCONGELAR_AREAS=directorio` (y `,afiliacion` si se abren altas por unete.html); NO `DESCONGELAR_PRODUCCION=true`. El directorio no se abre hasta cumplir LFPDPPP: `aviso-privacidad.html` sigue "BORRADOR — NO PUBLICAR" (falta domicilio fiscal + abogado) y cada solicitud estampa "v1.0 2026-08-11".
- **Agenda automática + Google Calendar:** prueba real OK el 2026-10-23 con la agenda de Víctor vía **@CodeCellsPruebaBot** (`TELEGRAM_BOT_TOKEN_PRUEBA`, Preview, webhook con bypass de Vercel). Falta probar en vivo: cancelar desde la liga del paciente (debe borrar el evento) y un bloqueo por texto libre. El evento lleva nombre y teléfono del paciente (pendiente legal).
- **Verificación de Google** (`docs/VERIFICACION-GOOGLE.md`, `795ae88`): permisos `calendar.freebusy` + `calendar.events` confirmados. Bloquea: publicar en `main` privacidad.html + enlace + `c8184fe` (producción aún devuelve el refresh token al navegador) — espera a "todo listo"; quitar el redirect de Preview del cliente OAuth; TXT de Search Console en GoDaddy. Sin verificar: aviso "app no verificada" y tope de 100 usuarios. Al terminar pruebas, revocar el bypass de Vercel o dejarlo solo para Preview.
- **Para el abogado / Víctor:** cédula profesional en el perfil público (confianza + posible requisito de publicidad médica; resuelve decisión #8); consentimiento v1.2-borrador; evento de Google con datos del paciente.
- Datos de prueba: Víctor publicó su perfil en la base de prueba (`rec1upfZfkftncHii`, "Dr. Rodriguez", guarda "Culiacan" sin acento — se muestra "Culiacán"). Su primera solicitud (`recudd3onYdDJJHYY`) quedó ligada al perfil ficticio de Bruno (`recDk9rLagIn3PVyK`). Su registro de médico no tiene `Telegram Chat ID` (avisos al chat de respaldo). Perfil QA `[PRUEBA] Dr. QA Cardiología` (CCMED-QACARD, `recVNUCiwPAxNR4w0`): agenda Lun/Mié/Vie 9–14 y 16–18, bloqueo 4–6 nov, Instagram y sitio web de prueba.

### Cómo probar
- Preview: https://codecells-site-git-feat-directorio-codecells.vercel.app (Vercel Authentication). `/directorio/` → ficha `/directorio/medico.html?id=…` → liga `/directorio/solicitud.html#id=…&c=…`. Portal → "◉ Mi directorio" (solicitudes, agenda, redes). Admin: `admin-directorio.html`.
- Local: `node scripts/servidor-local.js` → http://127.0.0.1:3077 (base de prueba; sin llaves de Google: la agenda de Víctor responde 503, lo cual es correcto). Reiniciar el servidor tras cambiar archivos de `api/` (cachea módulos).

### Pendientes conocidos del directorio
- `api/nova.js` (~línea 3790) tiene su propia lista de campos públicos (ya sin WhatsApp); podría usar `CAMPOS_LECTURA_PUBLICA` de `lib/directorio.js`.
- `mis_solicitudes` y `proximos` leen toda la tabla SOLICITUDES_PACIENTE de citas que ocupan (la liga no se filtra por id en fórmula, CLAUDE.md §8): bien para el piloto, no para miles.
- `proximos` consulta Google por cada médico con agenda en cada carga del directorio: bien para el piloto; con muchos médicos, poner caché.
- El directorio público devuelve máximo 50 médicos (sin paginación).
- El paciente no recibe aviso activo (SMS/correo); el .ics cubre el recordatorio.
- Textos EN/PT: las páginas públicas del directorio no cargan `lib/i18n.js` y el panel "Mi directorio" del portal no está traducido (prioridad baja).

### Valuación y precios (contexto, 2026-10-19)
Documentos: `docs/INVENTARIO-2026-10-19.md`, `docs/PRECIOS-MERCADO-2026-10-19.md`, `docs/VALUACION-2026-10-19.md`, `docs/MODELO-FINANCIERO-2026-10-19.xlsx` (`scripts/modelo-financiero.py`). `code_cells_auditoria_integral.json` (raíz, sin rastrear) es solo referencia. Decisiones: Red **$600**, Clínico **$1 100** (con IVA); tope de NOVA por paciente; migración se cobra aparte; almacenamiento por GB (propuesta en el modelo); arrancar SOLOS; Regene Global (~2 500 médicos) entra cuando haya infraestructura para 1 000 médicos y personal de migración, **sin comisión**; migración manual con constancia y consentimiento → `SPEC-MIGRACION-EXPEDIENTES.md` (sin implementar). Pendiente de su visto bueno: fundador $800 congelado (decisión #2), migración ~$50 + IVA por paciente, supuestos (contador, abogado, adquisición, sueldo).
Hallazgos técnicos de la valuación (sin arreglar, ramas de código): NOVA sin caché de instrucciones; `medico_subir_estudio` no guarda el original ("ver archivo adjunto" falso, CLAUDE.md §6); Airtable Team (50 000 registros/base) no aguanta migraciones.

## 1b. Bandeja de decisiones (ver `docs/REGLAS-DE-DECISION.md`)

Víctor contesta con número y opción ("3: A"). Las B no vetadas quedan aprobadas en su siguiente revisión.

| # | Decisión | Opciones (recomendada primero) | Bloquea | Cat. |
|---|---|---|---|---|
| 1 | Aprobar `docs/REGLAS-DE-DECISION.md` | A) Aprobar tal cual · B) Aprobar con cambios | Todo el ritmo de trabajo | C |
| 2 | Precio fundador con portal clínico | A) $800 congelado 24/36 meses · B) $600 (contribución 28 %) · C) Otro | Etapa de cobro del directorio | C |
| 3 | Regla de migración en CLAUDE.md §7 (texto en `SPEC-MIGRACION-EXPEDIENTES.md` §2) | A) Agregarla · B) Cambiarla | Implementar la migración (fase 2) | C |
| 4 | Plan del directorio (§3) | A) Aprobar etapas 0–4 · B) Ajustar fechas | Etapa 0 del directorio | C |
| 5 | Teléfonos del directorio | A) Visibles para todos · B) Tras enviar solicitud | Etapa 2 del directorio | B |
| 6 | Congelamiento por flujo (abrir solo el directorio en dic) | A) Sí, interruptor por flujo · B) Interruptor global | Etapa 4 del directorio | C |
| 8 | El directorio dice "Especialistas certificados" y "3 niveles de certificación": CODE CELLS no verifica competencias y el nivel nunca se muestra (CLAUDE.md §10) | A) Cambiar a "Médicos con cédula profesional verificada" (cuando exista esa verificación en el alta) · B) Dejarlo | Etapa 1–2 del directorio | C |
| 9 | ¿El directorio público debe exigir consentimiento registrado además de `Publicado`? (hoy los perfiles viejos, como el tuyo en producción, siguen visibles sin consentimiento) | A) Sí: solo aparece con consentimiento; tú re-aceptas antes de lanzar · B) No | Lanzamiento | C |
| 10 | Si un médico edita su perfil publicado | A) Sigue visible y queda marcado para revisión (así está hecho) · B) Se oculta hasta re-aprobar | Nada (ya implementado A) | B |
| 7 | Supuestos del modelo por cotizar: contador, abogado, pentest, sueldo de migración, adquisición | Víctor da montos o se dejan los estimados | Nada (el modelo ya corre) | C |

## 2. Inventario de lo que YA existe en `main` (2026-10-19)

- **`directorio/index.html`** (910 líneas): búsqueda por ciudad / especialidad / tratamiento, orden aleatorio por sesión, modal "Solicitar contacto" (nombre, teléfono, email, ciudad, motivo opcional + casilla de consentimiento con liga a `/aviso-privacidad`).
- **Proxy `api/airtable.js`**:
  - `GET tabla=directorio_medico` sin sesión → solo `{Publicado}=1` y lista blanca `DIRECTORIO_CAMPOS_PUBLICOS` (Name, especialidades, tratamientos, otras terapias, ciudad, bio, horarios, WhatsApp público). Máx. 50.
  - `accion=ciudades` público; `accion=contactos` solo con token de **visitante** (teléfono de consultorio).
  - `POST tabla=solicitudes_paciente&accion=registrar` → crea lead en SOLICITUDES_PACIENTE (motivo SOLO con consentimiento; estampa "Versión aviso de privacidad v1.0 2026-08-11"), emite token de visitante de 2 h que **desbloquea teléfonos**, y avisa por Telegram al médico (o a Víctor). **Congelado** en producción.
  - Médico con sesión: GET/POST/PATCH de SU perfil (`Publicado` lo pone el propio médico; `Fecha de alta` al primer publish).
- **Portal médico** (`portal-medico.html` ~7375–7710): sección "Mi directorio" con formulario y toggle "Publicar en el directorio" + modal de confirmación.
- **Alta de médicos:** `unete.html` / `code-cells-network` → `api/nueva-solicitud-medico.js` → SOLICITUDES_MEDICO + Telegram a los maestros; alta manual en MÉDICOS (botones del bot). Congelado.
- **`api/buscar-medicos.js` + `buscar-medico.html`**: buscador viejo (usa la API de Anthropic) SIGUE VIVO en `main`; en `feat/paciente-unico` se cerró (410).
- **Home `index.html`**: solo `nav-cta` "Acceso médico" (línea ~751). No hay acceso al directorio.
- **Producción (CRM):** DIRECTORIO_MEDICO tiene 2 perfiles: VIRN01 publicado (2026-08-10), JCG01 sin publicar. SOLICITUDES_PACIENTE tiene Estado (Nueva/Notificada/Contactada/Convertida/Cerrada/Descartada), Origen, consentimiento y "Alerta enviada a".

### Hallazgos que cambian el plan

1. **`main` tiene la base de PRODUCCIÓN fija en ~15 archivos** y `CONGELADO = true` fijo. Un Preview de esta rama leería producción y no podría probar escrituras. Hay que portar `6214dda` (ambientes) + `lib/congelamientoDatosPersonales.js` antes de cualquier prueba en Preview.
2. **El médico se publica solo** (toggle). No hay revisión administrativa ni registro verificable de consentimiento → contradice el MVP (§ decisiones 1 y 3).
3. **Los teléfonos se "pagan" con datos personales** (dejar datos → token → ver teléfonos). Un consentimiento condicionado así es débil frente a LFPDPPP; y búsqueda pública y tratamiento de datos deben ser flujos separados.
4. **El motivo de salud viaja por Telegram** (texto en el aviso al médico/Víctor) → dato sensible a un tercero. Va contra "el motivo nunca se convierte en lead clínico".
5. La solicitud no tiene ciclo médico (aceptar / proponer horario / rechazar) ni horario solicitado.
6. Mejoras ya hechas en `feat/paciente-unico` que conviene traer: lecturas honestas de contactos/ciudades (`airtableLeerTodo` + 502), aviso de error en la tarjeta, `buscar-medicos` 410, `nueva-solicitud-medico` con base del ambiente, `scripts/servidor-local.js`, `test/congelamiento.test.js`.

## 3. Plan por etapas (propuesto 2026-10-19, pendiente de aprobación)

| Etapa | Fechas | Qué |
|---|---|---|
| 0. Base | 20–24 oct | Portar ambientes + congelamiento por base; lecturas honestas; cerrar `buscar-medicos`; servidor local; botón **"Directorio médico"** en la home; Preview contra base de prueba con 5–10 perfiles **ficticios marcados** |
| 1. Alta → revisión → consentimiento | 27 oct–7 nov | El médico ya no publica: **solicita publicación** y firma consentimiento (texto versionado, fecha, código, IP). Panel admin mínimo: revisar cédula/datos, aprobar → `Publicado`, rechazar con motivo, despublicar |
| 2. Ficha + solicitud de cita | 10–21 nov | Ficha pública por médico (URL propia); teléfono/WhatsApp visibles sin pedir datos (o decisión de Víctor); solicitud con finalidad informada antes de capturar; médico acepta / propone otro horario / rechaza; "solicitud", nunca "cita confirmada"; motivo fuera de Telegram |
| 3. Cobro + cierre | 24 nov–5 dic | Cobro de 28 USD según decisión; pruebas de punta a punta; revisión del aviso de privacidad con el abogado |
| 4. Piloto | 8–15 dic | Cargar 5–10 médicos reales autorizados; descongelar **solo** los flujos del directorio; validar alta → revisión → consentimiento → publicación → búsqueda → solicitud |

## 4. Decisiones abiertas (Víctor)

1. Cobro de 28 USD: quién paga, concepto, medio (Stripe / Mercado Pago / transferencia), recurrente, factura.
2. Consentimiento "verificable" del médico: casilla con registro (fecha/IP/versión) vs firma vs contrato de afiliación.
3. ¿Teléfonos visibles para todos o detrás de la solicitud? (hoy: detrás de dejar datos).
4. ¿Descongelar solo el directorio en producción? Hoy el interruptor es global (`DESCONGELAR_PRODUCCION`); habría que hacerlo por flujo.
5. Los 5–10 médicos piloto.

## 4b. Antes de fusionar a `main`

**Tabla `CREDENCIALES_MEDICO` — YA CREADA EN PRODUCCIÓN** (2026-10-24, autorizada por Víctor; prod `tblr2DDj55hHWKwhn`, prueba `tbl2bkJUptlAM6Ghe`): `Código de médico ref` (texto primario), `Médico` (liga a MÉDICOS), `PIN (hash)`, `Cuenta activada` (casilla), `Fecha activación`, `Intentos fallidos` (número), `Bloqueado hasta`, `Liga (hash)`, `Liga vence` (fechas con hora), `Liga emitida por` (texto). Vacía: cada médico necesita su liga para crear su PIN.

**Tabla `VISITAS_DIRECTORIO` — YA CREADA EN PRODUCCIÓN** (2026-10-24, prod `tblZ5A4m2PqFtQzb0`). Víctor la autorizó el 2026-10-24, pero el permiso de Claude Code bloqueó la creación por MCP: crearla a mano en Airtable o dar el permiso. En prueba: `tbl9SwedUiu9uBzKs` (`Clave` texto primario, `Perfil` texto, `Semana` texto, `Visitas` número entero). El código la llama por NOMBRE (los ids de tabla nuevos difieren entre bases). Sin ella en producción: cada visita responde 502 (la ficha no se afecta) y el resumen del lunes no se manda y avisa a Víctor.

**Campo `Modalidad` (SOLICITUDES) YA CREADO EN PRODUCCIÓN** (2026-10-24, autorizado por Víctor; `fldCn4y6dWnLnmylM`). Sin él, crear CUALQUIER solicitud daría 422.

**Campos `Costo de consulta`, `Consulta en línea` y `Costo de consulta en línea` YA CREADOS EN PRODUCCIÓN** (2026-10-24, autorizados por Víctor; prod `fld2o194je2Ts4NkT`, `fldSPAh4CM5l8Eb4y`, `fldbZ502g3XpvMxeE`; prueba `fldkRPbdEGtyV4puu`, `fld81if2lMX7xpdzL`, `fldgaYL5ZWypD8j9H`). Vacíos. Regla: cualquier campo nuevo en `CAMPOS_LECTURA_PUBLICA` debe existir en producción antes de fusionar, o el directorio da 422.

**Campo `Dirección del consultorio` YA CREADO EN PRODUCCIÓN** (2026-10-24, autorizado por Víctor; `fldNyzNu4dDGVP8Xo`; en prueba `fld0CGoXHJeZC0MJI`). Vacío.

**Campo `Liga pública` YA CREADO EN PRODUCCIÓN** (2026-10-24, autorizado por Víctor; `fld6Ea6HyTvWeelPF` en prod, `fldsLC3D0dcf3d4yb` en prueba — los ids de campo difieren entre bases, el código usa el nombre). Víctor pidió NO tocar datos de producción aún: **al lanzar**, correr `node scripts/asignar-ligas-directorio.js --aplicar --produccion` con la base de producción en `.env.local` (asigna liga a VIRN01 y a cualquier publicado).

**Campos de Airtable del directorio — YA CREADOS EN PRODUCCIÓN (2026-10-23, autorizado por Víctor).** DIRECTORIO_MEDICO (16: publicación, consentimiento, revisión, `Foto de perfil`, `Agenda — *`; más las 6 redes) y SOLICITUDES_PACIENTE (8: `Fecha preferida`, `Turno preferido`, `Estado de cita`, `Horario acordado`, `Mensaje del médico`, `Clave de seguimiento — huella`, `Historial de la solicitud`, `Evento Google`). Verificado comparando el esquema de ambas bases: mismos nombres y tipos. No borrar ni renombrar: el directorio público pide varios por `fields[]` y uno faltante da 422 (el directorio entero deja de cargar). Los perfiles viejos de producción (VIRN01, JCG01) no tienen `Estado de publicación`: `estadoEfectivo()` los trata como Publicado/Borrador según `Publicado`.
Las diferencias restantes entre bases son del portal clínico (fase 2: antecedentes, recetas, medicamentos, planes nutricionales, etc.) y NO se crearon.
En Google Cloud el redirect de producción ya existe (`https://www.codecells.mx/api/google-oauth-callback`).
- Cerrar en el mismo cambio: `api/buscar-medicos` ya está en 410 en esta rama.
- Producción sigue congelada: NO definir `DESCONGELAR_PRODUCCION` al fusionar.
- **DECIDIDO por Víctor (2026-10-24): lanzar con `DESCONGELAR_AREAS=directorio,afiliacion`** (así "Únete a la red" de M9 sí registra médicos).

## 5. Trampas técnicas


- `127.0.0.1`, no `localhost`. 1ª llamada a Airtable de cada proceso: ~10 s o falla, reintentar.
- `git push` lo corre Víctor: `! cd /c/Users/virn3/Documents/codecells-site && git push -u origin feat/directorio`.
- Comparar ramas por CONTENIDO, no por hash.
- Airtable: GET por id ignora `fields[]`; POST máx. 10 registros.
- Variables de Vercel: cambiar una exige redeploy. Preview protegido con Vercel Authentication.

## 6. Portal clínico y app del paciente — FASE 2 (traído de `feat/paciente-unico` al unificar ramas) (EN PAUSA hasta acta constitutiva + IMPI)

Al retomar: **Fase 4 de la SPEC de dictado** — enlace temporal de Preview para `feat/paciente-unico` y prueba con el Dr. Galván en celular real (dictado por voz, micrófono de NOVA, CIE-10 con varios diagnósticos, Guardar consulta, Telegram; además identidad/PIN, Biological Map, Mi equipo, Progreso, Medicamentos, embarazo, tope de NOVA, negritas Telegram, Google Calendar con state firmado, tabla de labs). Después: guía para médicos, revisión de campos de auditoría, fusión a `main`.

**Pendiente legal (Víctor):** Web Speech de Chrome manda el audio a Google → abogado. Aviso de privacidad clínico.
**Decisión abierta:** ¿emitir receta desde Telegram? Hoy NO (borrador → portal).
**Al pasar a producción:** revocar y reconectar el Google Calendar de VIRN01; `DESCONGELAR_PRODUCCION`.

Otros pendientes del portal: portar `dd357f0` (estado vacío de Historia Clínica, UI); "Tu última receta" de cualquier médico; Fase 3 de SPEC-PACIENTE-UNICO (retiro de VIP + redirecciones); documentos en la app; CIE-10 V–Y y quintos caracteres; peso del catálogo (~870 KB); limpiar consultas de prueba de `CC-PAC-9999901`.

### Estado del dictado y CIE-10 (referencia para la fase 2)

**Decisiones de Víctor (2026-10-05):** 1) voz por el **navegador** (Web Speech API) en el portal; voz en Telegram solo cuando el abogado apruebe un proveedor en servidor; 2) lo dictado llena los **campos de la consulta** (no un texto suelto); 3) Telegram con **dictado libre** (comandos solo como atajo opcional).
**Cambios a la SPEC:** sin dosis completadas; sin "confianza" numérica; médico siempre del token/chat. **CIE-10: CAMBIÓ el 2026-10-16** — Víctor pidió que NOVA sugiera CIE-10 acertados y el médico elija uno o varios (antes: "nada de CIE-10 sugerido").

**Fases 1, 1b, 2 y 3 HECHAS** (ver §4): motor `lib/dictado.js` con verificación por cita literal (portal y Telegram), borrador de receta, voz en Nueva consulta con marcas NOVA/editado y campos de auditoría, Telegram con "Entendí:" + "sí"/"cancelar"/agregar, grupo sanguíneo y escolaridad.

**CIE-10 (2026-10-16):** `lib/cie10.js` + acción `medico_sugerir_cie10` (nova.js). Solo codifica lo que el médico escribió/dictó como diagnóstico (frase literal verificada); cada código se comprueba contra `lib/cie10-catalogo.js` y se muestra la descripción DEL CATÁLOGO; prefiere subcategoría de 4 caracteres cuando el texto la sustenta, si no ".9"/categoría; subcategoría inexistente → se ofrece su categoría. Portal: panel con casillas (ninguna marcada), sale solo tras dictar un diagnóstico o con "🔎 Sugerir CIE-10"; el campo queda "I20.8 — … (angina estable probable); E11.2 — …". Telegram: códigos numerados en "Entendí:", "sí 1" / "sí 1 y 3" / "sí" sin código; número inexistente no guarda. Auditoría: línea "CIE-10: sugerido por NOVA y elegido por el médico: …". **Varios diagnósticos (2026-10-16, reporte de Víctor):** el campo es textarea; diagnósticos separados con «;»; el autocompletado busca y reemplaza SOLO el tramo donde está el cursor; "Usar los seleccionados" y Telegram "sí N" sustituyen cada frase codificada DENTRO del texto (`integrarCodigosEnDiagnostico`, lib/cie10.js + copia en el portal) y lo no codificado se conserva (antes se borraba en silencio). RETIRADA `nova-asistente-clinico` accion `sugerir_cie10` (410): escribía códigos sin elección, sin verificar y sobre CUALQUIER consulta por id.
**Catálogo CIE-10 regenerado (2026-10-16) desde `Clasificación cie10.pdf`:** 1666 categorías + 8867 subcategorías = 10 533. `pdftotext -simple2` (Git trae xpdf; `-layout` separa códigos y títulos en ese PDF), verificado contra `-table`; títulos multirrenglón unidos con reglas estrictas; listas comunes de cuarto carácter (E10–E14, F10–F19, F70–F79, K25–K28, N00–N07, O03–O06, R83–R89) como "categoría, subdivisión"; 76 títulos de 3 caracteres truncados reparados (solo si el PDF EXTIENDE el texto). Excluidos: capítulos V–Y, H54.1, P59.2. El archivo sirve al navegador (`var`) y a Node (`module.exports`). Scripts de extracción NO están en el repo (vivían en el scratchpad de la sesión).
