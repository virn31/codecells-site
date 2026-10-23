# CONTINUAR — recordatorio de sesión (rama `feat/directorio`)

> **Protocolo.** Al decir "continúa", Claude lee este archivo PRIMERO y retoma
> desde "Siguiente paso". Al cerrar cada sesión, Claude lo REESCRIBE (no
> agrega al final): este archivo es el estado actual, no un diario. El
> historial vive en git (`git log`) y en la memoria del proyecto.
>
> Esta es la rama EXCLUSIVA del directorio (creada desde `main` el 2026-10-19).
> El portal clínico vive en `feat/paciente-unico` (intacta, fase 2) con su
> propio `docs/CONTINUAR.md`.

**Última actualización:** 2026-10-23 — etapa 2 del directorio hecha y revisada por Víctor en Preview ("todo quedó muy bien").

---

## 1. Siguiente paso (empezar aquí)

**Estado al 2026-10-22 — etapas 0, 1 y 2 del directorio HECHAS en esta rama (Preview, base de prueba). Producción sigue congelada y en `main@66cd2ed`.**

Siguiente: **Etapa 3** (cobro + pruebas de punta a punta + abogado). Víctor ya revisó la etapa 2 en Preview (2026-10-23) y la aprobó. Para arrancar la etapa 3 hacen falta sus decisiones #2 (precio fundador; recomendación $800 congelado) y la forma de cobro (Stripe / Mercado Pago / transferencia, ¿factura?) (§4.1).

Nota: el perfil de Víctor en la base de prueba (`rec1upfZfkftncHii`, "Dr. Rodriguez") está en **Borrador**: le falta especialidad y su consentimiento. No se publicó por él (no se fabrica consentimiento ni especialidad); si quiere probar como médico con su código, lo hace él desde "Mi directorio" → Solicitar publicación → aprobar en `/admin-directorio.html`.

Cómo probar en Preview (https://codecells-site-git-feat-directorio-codecells.vercel.app):
- `/directorio/` → nombre o "Solicitar cita" → ficha `/directorio/medico.html?id=…` → formulario → liga de seguimiento `/directorio/solicitud.html#id=…&c=…`.
- Portal → botón "◉ Mi directorio" (barra superior) → bloque "Solicitudes de cita": Aceptar (hora exacta) / Proponer otro horario / No puedo atenderle; insignia con pendientes.
- El perfil ficticio `[PRUEBA] Dr. QA Cardiología` (CCMED-QACARD, `recVNUCiwPAxNR4w0`) quedó **Publicado** en la base de prueba con 3 solicitudes ficticias.
- OJO: en Preview los avisos de Telegram son reales (bot real → chat de Víctor o del médico).

**Lo hecho, por etapa:**
- **Etapa 0** (`4131ad9`): base de Airtable por ambiente, congelamiento por base, `buscar-medicos` 410, lecturas honestas (502), botón "Directorio médico" en la home, servidor local, 8 perfiles "[PRUEBA]".
- **Etapa 1** (`2eb18d5`): el médico ya no se publica solo. Solicita con consentimiento versionado (fecha, IP, navegador, huella SHA-256), un administrador (VIRN01/JCG01) aprueba/rechaza/despublica en `admin-directorio.html`. `api/directorio.js` + `lib/directorio.js`.
- **Tarjeta y foto** (`fce8e46`, `69d4ddf`, `3dc0ec6`): tarjeta con círculo dorado, filas con ícono y barra píldora; foto/avatar/logo (`subir_foto`/`quitar_foto`, recorte 400 px sin metadatos, validación por bytes), iniciales si no hay foto; consentimiento `v1.1-borrador` menciona la foto; botón visible "Mi directorio" en el portal (antes solo un engrane oculto en celular) y panel legible en modo claro.
- **Etapa 2** (2026-10-22):
  - Ficha pública por médico `directorio/medico.html?id=rec…` (lectura pública de UN perfil publicado: `GET /api/airtable?tabla=directorio_medico&id=`).
  - Solicitud de cita `api/citas.js` + `lib/citas.js`: fecha preferida (mañana a +90 días, hora de México) y turno; el médico acepta con hora exacta, propone otro horario o rechaza; el paciente confirma la propuesta o cancela desde su liga. Nunca se muestra como cita confirmada mientras esté Pendiente. Historial por solicitud.
  - Paciente sin cuenta: clave aleatoria en el fragmento `#` de la liga; solo se guarda su huella SHA-256; la vista del paciente no expone teléfono ni motivo.
  - **El motivo ya no viaja por Telegram** (ni en el formulario viejo): el aviso al médico solo dice que hay una solicitud.
  - **El WhatsApp público ya no viaja en el JSON público**: sale con el teléfono, solo con token de visitante (decisión #5 sigue abierta).
  - Se quitó el modal viejo "Solicitar contacto" de `/directorio/`; la tarjeta lleva a la ficha. `accion=registrar` sigue en el API (sin uso desde la página).
  - Pruebas: **116/116** (15 nuevas en `test/citas.test.js`). Punta a punta en la base de prueba OK.

**Pendientes conocidos del directorio:**
- `api/nova.js` (~línea 3830) tiene su propia lista de campos públicos con `WhatsApp público` (recomendación de NOVA): revisar con la decisión #5.
- `mis_solicitudes` lee toda la tabla SOLICITUDES_PACIENTE y filtra por id en el servidor (la liga no se puede filtrar por id en fórmula, CLAUDE.md §8): está bien para el piloto, no para miles de solicitudes.
- El paciente no recibe aviso activo (SMS/correo): ve la respuesta en su liga o el médico lo contacta. Decidir si se agrega correo en la etapa 3.
- Textos EN/PT de la ficha, la liga del paciente y el bloque de citas: no traducidos.

### Valuación y precios (contexto)

**Valuación y precios (Víctor, 2026-10-19).** `code_cells_auditoria_integral.json` (raíz, sin rastrear) es solo REFERENCIA para un orden propio. Víctor duda de que 28 USD/mes sea competitivo y quiere **precios estables** que no cambien con el mercado ni el tipo de cambio. Orden acordado:
1. Inventario de lo construido — **HECHO**: `docs/INVENTARIO-2026-10-19.md`.
2. Costos y horas — **DADOS** (Airtable, Vercel y Anthropic 20 USD/mes c/u; dominio 100 USD/año; ~6 meses a 8–10 h/semana). Falta aclarar si Anthropic es suscripción o API.
3. Investigación de mercado — **HECHA**: `docs/PRECIOS-MERCADO-2026-10-19.md` (con propuesta de planes Red $390 / Clínico $890 MXN y fundadores).
4. Valuación, costo de IA por médico, migración y costos no contemplados — **HECHO**: `docs/VALUACION-2026-10-19.md` (Anthropic = API, confirmado por Víctor).
5. Modelo financiero 12/24 meses — **HECHO**: `docs/MODELO-FINANCIERO-2026-10-19.xlsx` (generado con `scripts/modelo-financiero.py`; 2 866 fórmulas verificadas sin errores con pycel).

**Decisiones de Víctor (2026-10-19):** plan Red **$600** y plan Clínico **$1 100** (incluye todo), con IVA; tope de NOVA **por paciente** (se queda como está); la **migración se cobra aparte**.
**Propuestas en el modelo, pendientes de su visto bueno:** fundador $600 mientras solo hay Red y **$800 congelado** cuando tenga el Clínico (a $600 su contribución cae al 28 %); migración ~$50 + IVA por paciente; clínico en mayo-2027.
**Agregado 2026-10-19 (Víctor):** almacenamiento **cobrado por GB** (propuesta: 20 GB incluidos en Clínico, 1 GB en Red, $2/GB adicional con IVA; paquete 1 TB ~$990; costo real ~0.022 USD/GB con 2 copias R2 + Backblaze; se conserva 5 años aunque el médico se vaya). **Canal Regene Global: ~2 500 médicos afiliados** (dato de Víctor) — en el modelo entran desde mayo-2027+1 con 15 % de descuento/comisión; 5/10/20 % de afiliación según escenario. Requisito previo: base clínica fuera de Airtable.
**Decisiones de Víctor (2026-10-19, cierre):** arrancamos SOLOS; Regene entra solo cuando haya infraestructura para **1 000 médicos** y personal de migración contratado y capacitado (modelo: dic-2027). **Regene no cobra, solo refiere** (sin comisión). La migración asistida la hace personal contratado; además el médico puede **migrar manualmente** desde un botón exclusivo, con constancia, consentimiento firmado y metadatos → `SPEC-MIGRACION-EXPEDIENTES.md` (sin implementar; propone una regla nueva para CLAUDE.md §7 que Víctor debe aprobar; preguntas para el abogado en §7).
**Siguiente:** que Víctor revise supuestos (contador, abogado, adquisición, sueldo); luego retomar el directorio (plan §3) — la etapa de cobro usa estos precios.

**Hallazgos técnicos de la valuación (no arreglados, ramas de código):** NOVA sin caché de instrucciones (duplica el costo de IA); `medico_subir_estudio` no guarda el original y escribe "ver archivo adjunto" sin adjunto (viola CLAUDE.md §6); Airtable Team (50 000 registros/base) no aguanta migraciones de expedientes.

**Decisión de Víctor (2026-10-19):** se trabaja ACTUALIZANDO codecells.mx **sin quitar el congelamiento**. Implica: al fusionar a `main`, traer `6214dda` (congelamiento por base + `DESCONGELAR_PRODUCCION`) y NO definir ese interruptor; cerrar `api/buscar-medicos` (410) en el mismo cambio.

Propuesta original (referencia): niveles (directorio / directorio + portal clínico), precio en MXN con colchón cambiario, revisión anual con regla pública, pago anual, oferta para 100 fundadores con plazo definido, punto de equilibrio.

Después se retoma el directorio (plan en §3, aprobado; la etapa de cobro depende del paso 4).

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

**Directorio (etapa 1) — crear en producción DIRECTORIO_MEDICO antes de fusionar** (ya existen en prueba, mismos nombres): `Estado de publicación` (selección: Borrador, En revisión, Publicado, Rechazado, Despublicado), `Cambios sin revisar` (casilla), `Consentimiento — versión`, `Consentimiento — fecha` (fecha y hora), `Consentimiento — IP`, `Consentimiento — navegador`, `Consentimiento — huella`, `Revisado por`, `Fecha de revisión` (fecha y hora), `Motivo de rechazo` (texto largo), `Historial de publicación` (texto largo). Sin ellos, crear o editar un perfil en producción falla (UNKNOWN_FIELD_NAME).
**Etapa 2 — crear en producción SOLICITUDES_PACIENTE** (ya existen en prueba): `Fecha preferida` (fecha ISO), `Turno preferido` (selección: Mañana, Tarde, Cualquiera), `Estado de cita` (selección: Pendiente, Aceptada, Otro horario propuesto, Confirmada por el paciente, Rechazada, Cancelada por el paciente), `Horario acordado` (texto de una línea), `Mensaje del médico` (texto largo), `Clave de seguimiento — huella` (texto de una línea), `Historial de la solicitud` (texto largo). Sin ellos, solicitar cita falla con 502.
**Y `Foto de perfil` (adjunto) — CRÍTICO:** el directorio público lo pide con `fields[]`; si no existe en producción, Airtable responde 422 y **el directorio entero deja de cargar**.
- Cerrar en el mismo cambio: `api/buscar-medicos` ya está en 410 en esta rama.
- Producción sigue congelada: NO definir `DESCONGELAR_PRODUCCION` al fusionar.

## 5. Trampas técnicas


- `127.0.0.1`, no `localhost`. 1ª llamada a Airtable de cada proceso: ~10 s o falla, reintentar.
- `git push` lo corre Víctor: `! cd /c/Users/virn3/Documents/codecells-site && git push -u origin feat/directorio`.
- Comparar ramas por CONTENIDO, no por hash.
- Airtable: GET por id ignora `fields[]`; POST máx. 10 registros.
- Variables de Vercel: cambiar una exige redeploy. Preview protegido con Vercel Authentication.
