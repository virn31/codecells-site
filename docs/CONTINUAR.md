# CONTINUAR — recordatorio de sesión (rama `feat/directorio`)

> **Protocolo.** Al decir "continúa", Claude lee este archivo PRIMERO y retoma
> desde "Siguiente paso". Al cerrar cada sesión, Claude lo REESCRIBE (no
> agrega al final): este archivo es el estado actual, no un diario. El
> historial vive en git (`git log`) y en la memoria del proyecto.
>
> Esta es la rama EXCLUSIVA del directorio (creada desde `main` el 2026-10-19).
> El portal clínico vive en `feat/paciente-unico` (intacta, fase 2) con su
> propio `docs/CONTINUAR.md`.

**Última actualización:** 2026-10-24 (cierre) — M5 búsqueda, WhatsApp fuera de la plataforma (solo como red social del médico) y M6 liga bonita + vista previa. Push hecho por Víctor (`6d0a466`); solo este ajuste de docs queda sin push.

---

## 1. Siguiente paso (empezar aquí)

1. ~~Push~~ hecho (`6d0a466`, 2026-10-24). Vercel arma el Preview solo.
2. **Revisar en Preview, desde un celular** (lo de hoy se probó en local contra la base de prueba; la ficha y la búsqueda también en navegador):
   - `/directorio/`: caja **Buscar** ("cardiología", "Culiacan", "rodriguez", algo que no exista → «Ningún médico menciona…»; queda en `?q=`). Las tarjetas ya abren `/directorio/<liga>`.
   - **Liga bonita**: `/directorio/prueba-dr-qa-cardiologia` y `/directorio/dr-rodriguez`. **Pegar la liga de Preview en un chat de WhatsApp contigo mismo** y ver que salgan nombre, especialidad y ciudad. Ojo: Preview tiene Vercel Authentication, así que WhatsApp probablemente NO podrá leerla (verá la pantalla de acceso de Vercel); la prueba de la vista previa de verdad es en producción o con el bypass. En local no se puede probar (WhatsApp no llega a 127.0.0.1).
   - Portal → Mi directorio: aparece "Tu liga para compartir" + Copiar (perfil publicado). Campo **Teléfono del consultorio** (10 dígitos; "123" debe dar error). En "Redes sociales", **WhatsApp** (número o liga wa.me) → sale como botón en la ficha.
   - Ficha: con datos dejados, botón **"Llamar al consultorio"** (tel:). Ya no hay "Enviármela por WhatsApp".
   - Home: "Encuentra a tu médico" lleva al directorio; al terminar la evaluación **NOVA debe abrirse sola** (antes la abría un parche que interceptaba WhatsApp; ahora se llama directo) y al final de la plática sale "Encuentra a tu médico en el directorio".
   - `code-cells-network`: el botón final dice "Solicitar afiliación" y va a `unete.html`.
   - Ojo: una cita real en Preview manda aviso de Telegram real.
3. **Siguiente trabajo** (orden del análisis, `docs/ANALISIS-DIRECTORIO-Y-APP-PACIENTE-2026-10-23.md`): ~~M5~~ ~~M6~~ · **P1 dirección del consultorio + M8 "Cómo llegar" (empezar aquí)** — el paciente necesita saber a dónde ir; liga a mapas sin depender de una API de pago (una liga `https://www.google.com/maps/search/?api=1&query=…` no requiere cuenta ni llave) · P3 costo de consulta (opcional) · M9 "Únete a la red" en el encabezado · resumen semanal al médico por Telegram.
4. **App del paciente** (`mi-nivel.html`, rama `feat/paciente-unico`): la pestaña **Citas está rota** (análisis §2.1). Rehacerla es categoría A. Lo demás de la app es fase 2.

### Lo hecho el 2026-10-24
- `3241ff7` **M5 búsqueda**: `?q=` en la lectura pública; `palabrasBusqueda()` / `coincideBusqueda()` en `lib/directorio.js` (sin acentos, cada palabra debe estar en lo publicado). **Sin sinónimos a propósito** ("rodilla" no encuentra "Ortopedia" salvo que el médico lo escriba). Decisión posible (B): tabla de sinónimos revisada a mano.
- `0d13bcd` **WhatsApp fuera de la plataforma** (Víctor: "no depender de otras empresas"). No había Twilio en el código; eran ligas `wa.me`. Directorio: teléfono del consultorio validado (`normalizarTelefono`) con botón Llamar (tel:); home → directorio; NOVA del test se activa directo (`window.novaActivar`) y se quitó el parche de `window.open`; afiliación → `unete.html`, se pide "teléfono celular". Campos de Airtable NO renombrados (`WhatsApp`, `Teléfono/WhatsApp` siguen guardando un teléfono).
- `d797fae` **WhatsApp del médico como red social** (Víctor lo pidió así): opcional y **público**, en "Redes sociales"; se guarda `https://wa.me/<número>` sin mensaje pre-escrito (`normalizarWhatsApp`); editarlo en un perfil publicado marca revisión. Campo `WhatsApp público` (ya existía en ambas bases). Consentimiento **v1.3-borrador 2026-10-24** (menciona WhatsApp). La plataforma sigue sin pedir ni mandar nada por WhatsApp.
- `66345ea` **M6 liga bonita + vista previa**: `/directorio/<liga>` → `api/ficha.js` (vercel.json, con `includeFiles`) arma `directorio/medico.html` con título, descripción, `og:*` y canonical; la página recibe el id en `window.FICHA`. `Liga pública` se asigna UNA vez al aprobar (`ligaDisponible`, -2 si existe) y es campo protegido (no cambia si el médico edita su nombre). Lista blanca pública movida a `lib/directorio.js` (`CAMPOS_LECTURA_PUBLICA`, `limpiarPerfilPublico`). 404 noindex si no existe, 502 si Airtable falla. Caché 5 min (un cambio o despublicación tarda eso en verse en la liga bonita). `scripts/asignar-ligas-directorio.js` (solo muestra; `--aplicar`; `--produccion` para prod) — ya aplicado en la base de prueba (10 perfiles).
- Pruebas: **177/177**.
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

**⚠ FALTA EN PRODUCCIÓN: campo `Liga pública` (texto de una línea) en DIRECTORIO_MEDICO** (creado solo en la base de prueba el 2026-10-24, `fldsLC3D0dcf3d4yb`). El directorio público lo pide en `fields[]`: **sin él, el directorio entero da 422 y deja de cargar**. Crearlo en producción ANTES de fusionar (pedir autorización a Víctor) y después correr `node scripts/asignar-ligas-directorio.js --aplicar --produccion` con la base de producción en `.env.local` (asigna liga a VIRN01 y a cualquier publicado).

**Campos de Airtable del directorio — YA CREADOS EN PRODUCCIÓN (2026-10-23, autorizado por Víctor).** DIRECTORIO_MEDICO (16: publicación, consentimiento, revisión, `Foto de perfil`, `Agenda — *`; más las 6 redes) y SOLICITUDES_PACIENTE (8: `Fecha preferida`, `Turno preferido`, `Estado de cita`, `Horario acordado`, `Mensaje del médico`, `Clave de seguimiento — huella`, `Historial de la solicitud`, `Evento Google`). Verificado comparando el esquema de ambas bases: mismos nombres y tipos. No borrar ni renombrar: el directorio público pide varios por `fields[]` y uno faltante da 422 (el directorio entero deja de cargar). Los perfiles viejos de producción (VIRN01, JCG01) no tienen `Estado de publicación`: `estadoEfectivo()` los trata como Publicado/Borrador según `Publicado`.
Las diferencias restantes entre bases son del portal clínico (fase 2: antecedentes, recetas, medicamentos, planes nutricionales, etc.) y NO se crearon.
En Google Cloud el redirect de producción ya existe (`https://www.codecells.mx/api/google-oauth-callback`).
- Cerrar en el mismo cambio: `api/buscar-medicos` ya está en 410 en esta rama.
- Producción sigue congelada: NO definir `DESCONGELAR_PRODUCCION` al fusionar.

## 5. Trampas técnicas


- `127.0.0.1`, no `localhost`. 1ª llamada a Airtable de cada proceso: ~10 s o falla, reintentar.
- `git push` lo corre Víctor: `! cd /c/Users/virn3/Documents/codecells-site && git push -u origin feat/directorio`.
- Comparar ramas por CONTENIDO, no por hash.
- Airtable: GET por id ignora `fields[]`; POST máx. 10 registros.
- Variables de Vercel: cambiar una exige redeploy. Preview protegido con Vercel Authentication.
