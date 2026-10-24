# CONTINUAR — recordatorio de sesión (rama `feat/directorio`)

> **Protocolo.** Al decir "continúa", Claude lee este archivo PRIMERO y retoma
> desde "Siguiente paso". Al cerrar cada sesión, Claude lo REESCRIBE (no
> agrega al final): este archivo es el estado actual, no un diario. El
> historial vive en git (`git log`) y en la memoria del proyecto.
>
> Esta es la rama EXCLUSIVA del directorio (creada desde `main` el 2026-10-19).
> El portal clínico vive en `feat/paciente-unico` (intacta, fase 2) con su
> propio `docs/CONTINUAR.md`.

**Última actualización:** 2026-10-23 (cierre) — mejoras del directorio con el cobro detenido: redes sociales, ciudad sin acentos, agendar con el horario primero, calendario y "mis citas". Campos del directorio creados en producción. 8 commits SIN PUSH.

---

## 1. Siguiente paso (empezar aquí)

1. **Que Víctor haga push** (8 commits, `7e86b85`…`a02a96c` y este):
   `! cd /c/Users/virn3/Documents/codecells-site && git push origin feat/directorio`
2. **Revisar en Preview, desde un celular** (lo hecho hoy solo se probó en local contra la base de prueba):
   - `/directorio/`: menús con conteo, "Culiacán" agrupa a Víctor, insignia "Agenda en línea · próximo…" en las tarjetas (la de Víctor depende de Google: en local no hay llaves y no salía).
   - Ficha del Dr. QA (`recVNUCiwPAxNR4w0`): tira de días → hora → datos → "Cita confirmada" → "Agregar a mi calendario" (revisar que la hora salga bien en el teléfono) → "Tus citas en este teléfono" en `/directorio/`.
   - Ficha de Víctor (`rec1upfZfkftncHii`): redes sociales (capturarlas en portal → Mi directorio → "Redes sociales").
   - Ojo: una cita real en Preview manda aviso de Telegram real.
3. **Siguiente trabajo** (orden del análisis, `docs/ANALISIS-DIRECTORIO-Y-APP-PACIENTE-2026-10-23.md`): M5 búsqueda por nombre/síntoma · M6 ficha que se comparte bien (vista previa en WhatsApp + liga bonita `/directorio/dr-…`) · P1 dirección del consultorio + M8 "Cómo llegar" en la liga de la cita · P3 costo de consulta (opcional) · M9 "Únete a la red" en el encabezado · resumen semanal al médico por Telegram.
4. **App del paciente** (`mi-nivel.html`, rama `feat/paciente-unico`): la pestaña **Citas está rota** (análisis §2.1: usa `CC-PAC-DEMO01` si no encuentra el código, rellena "CONTINUUM™"/"Evaluación", "Confirmar" hace PATCH a CONSULTAS → 403, botones que no hacen nada, error = "no tienes citas"). Rehacerla es categoría A. Lo demás de la app (notificaciones, pantalla "Hoy", un solo diseño) es fase 2.

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
- `api/nova.js` (~línea 3830) tiene su propia lista de campos públicos con `WhatsApp público`: revisar con la decisión #5.
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
