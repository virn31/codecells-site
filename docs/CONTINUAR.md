# CONTINUAR — recordatorio de sesión (rama `feat/directorio`)

> **Protocolo.** Al decir "continúa", Claude lee este archivo PRIMERO y retoma
> desde "Siguiente paso". Al cerrar cada sesión, Claude lo REESCRIBE (no
> agrega al final): este archivo es el estado actual, no un diario. El
> historial vive en git (`git log`) y en la memoria del proyecto.
>
> Esta es la rama EXCLUSIVA del directorio (creada desde `main` el 2026-10-19).
> El portal clínico vive en `feat/paciente-unico` (intacta, fase 2) con su
> propio `docs/CONTINUAR.md`.

**Última actualización:** 2026-10-19 — el directorio quedó EN PAUSA para hacer primero la valuación y los precios.

---

## 1. Siguiente paso (empezar aquí)

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

Después se retoma el directorio (plan en §3, que espera aprobación; la etapa de cobro depende del paso 4).

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

## 5. Trampas técnicas

- `127.0.0.1`, no `localhost`. 1ª llamada a Airtable de cada proceso: ~10 s o falla, reintentar.
- `git push` lo corre Víctor: `! cd /c/Users/virn3/Documents/codecells-site && git push -u origin feat/directorio`.
- Comparar ramas por CONTENIDO, no por hash.
- Airtable: GET por id ignora `fields[]`; POST máx. 10 registros.
- Variables de Vercel: cambiar una exige redeploy. Preview protegido con Vercel Authentication.
