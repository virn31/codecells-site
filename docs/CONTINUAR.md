# CONTINUAR — recordatorio de sesión

> **Protocolo.** Al decir "continúa", Claude lee este archivo PRIMERO y retoma
> desde "Siguiente paso". Al cerrar cada sesión, Claude lo REESCRIBE (no
> agrega al final): este archivo es el estado actual, no un diario. El
> historial vive en git (`git log`) y en la memoria del proyecto.

**Última actualización:** 2026-10-04 (cierre de sesión)
**Rama de trabajo:** `feat/paciente-unico` — **pusheada** (último commit `7265991`; Víctor hizo el push). Sale de `chore/ambiente-preview` ← `feat/kiosco-antecedentes-go`. Nada fusionado a `main`.
**Pruebas:** `node --test test/*.test.js` → **197/197 en verde**.
**Servidor local:** detenido (se cerró por falta de memoria). Arrancar con `node scripts/servidor-local.js` solo si se necesita revisar en navegador.

---

## 1. Siguiente paso (empezar aquí): DIRECTORIO MÉDICO + AGENDA AUTOMÁTICA

### Decidido por Víctor (2026-10-04, al cerrar)
1. **El directorio ya tiene motor de búsqueda** (ciudad, especialidad, etc.) → se REUTILIZA, no se rehace.
2. **Se muestran todos los datos del médico** en su tarjeta. Excepción que no cambia: el **nivel interno** (Asociado/Certificado/Senior/Partner) nunca se muestra a pacientes (CLAUDE.md §10) — confirmarlo con Víctor al revisar la tarjeta.
3. **Botón "Agenda automática"** en cada médico: el médico **vincula su correo-agenda (Google Calendar)** y define **días y horarios disponibles**; el paciente ve SOLO esos espacios libres y **NOVA le ayuda a hacer su cita**.
4. **Botón al directorio en la página principal de CODE CELLS** (`index.html`, home de codecells.mx — hoy no lo enlaza).
5. Esto **resuelve la decisión pendiente desde 2026-08-24** (memoria "Módulo Agenda no funcional"): se COMPLETA la integración con Google Calendar, no se retira.

### Lo que YA existe (verificar primero, no rehacer)
- `/directorio` (`directorio/index.html`, ~900 líneas) con su buscador; `/buscar-medico.html` redirige ahí.
- Tabla `directorio_medico` (`tblkUNPwu1sQgZBPJ`) en `api/airtable.js`: GET público con lista blanca + `{Publicado}=1`; `accion=ciudades`; lead con aviso de privacidad → token de visitante para ver contactos.
- Portal → **"Mi directorio"** (perfil que edita el propio médico). NOVA público: herramienta `buscar_medicos_directorio`.
- **Google OAuth funciona**: `api/google-oauth-callback.js` guarda `Google Calendar Refresh Token` / `Google Calendar Email` en MÉDICOS (VIRN01 ya conectado en producción). Pero `api/google-calendar.js` está a medias (actualizar/eliminar son stubs; crear espera un header que nadie manda).
- Módulo Agenda (`api/agenda.js`, `agenda/`): auth correcta pero **tabla AGENDA es el esqueleto vacío de Airtable**, la UI no crea citas, cron desactivado, bug `cc_medico_session` vs `cc_medico_token` en `agenda/js/agenda-api.js:49`.
- Base de prueba: **1 solo perfil** en el directorio (VIRN01). Cargar perfiles ficticios.

### ⚠️ Primero (seguridad, antes de usar los tokens de Google)
- **`api/auth-login.js` devuelve TODOS los campos del médico** (`fields: registro.fields`) → el `Google Calendar Refresh Token` viaja en texto plano en cada login. Filtrar la respuesta a una lista blanca. El refresh token solo debe leerlo el servidor.

### Plan por etapas (presentar a Víctor antes de construir cada una)
1. **Fuga del refresh token** en auth-login (arriba).
2. **Revisar** el directorio actual (campos, buscador, celular) y la home; botón "Directorio médico" en `index.html`.
3. **Directorio dentro de la app del paciente** (`mi-nivel.html`), reusando el buscador; con sesión no pide formulario de lead. Tarjeta con todos los datos (menos el nivel interno) + "Compartir mi expediente" (llave existente) + "Agendar".
4. **Disponibilidad del médico**: en el portal, conectar Google Calendar (ya existe) + definir días/horarios/duración de consulta. Nueva tabla en prueba (p. ej. `DISPONIBILIDAD_MEDICO`) o campos en MÉDICOS — decidir.
5. **Espacios libres** = horario definido − eventos ocupados de Google Calendar (API freeBusy, desde el servidor con el refresh token). Nunca mostrar detalles de los eventos del médico, solo libre/ocupado.
6. **Reservar**: reconstruir AGENDA con campos reales; crear la cita + evento en Google Calendar del médico; volver a verificar que el espacio siga libre justo antes de confirmar (dos pacientes, mismo horario). Confirmación al paciente solo si ambos guardados se confirmaron.
7. **NOVA ayuda a agendar** (herramientas: ver espacios, reservar) — NOVA propone, el paciente confirma; NOVA nunca dice "agendada" sin confirmación del servidor (CLAUDE.md §6).
8. Pruebas + navegador + Preview con Galván.

### Preguntas para Víctor
- Duración de consulta y anticipación mínima/máxima para reservar (¿por médico?).
- ¿La cita se confirma sola o el médico la aprueba?
- ¿Cancelar/reprogramar desde la app?
- ¿Qué ve un paciente demo (sin reservar, solo demostración)?
- Google Calendar: hay que revisar la pantalla de consentimiento OAuth (verificación de Google si el scope es sensible).

## 2. También pendiente (después del directorio)

1. **Probar en Preview (celular real) con el Dr. Galván** todo lo de hoy: identidad/PIN, Biological Map, idioma, Mi equipo, Progreso, Plan (nutrición publicada), **Medicamentos** (receta → "Hoy" → "Tomado"), suplementos, **embarazo con semanas+días**.
2. **No revisado visualmente en navegador:** modal de receta nuevo del portal; tarjeta "Hoy" y sección medicamentos/suplementos de la app; línea de embarazo. (Probados con pruebas y en vivo contra la base vía handler.)
3. Mejora: "Tu última receta" muestra la más reciente de cualquier médico (las indicaciones de una receta anterior de otro médico quedan ocultas).
4. **Fase 3 de SPEC-PACIENTE-UNICO:** retiro de VIP (portal-vip, dezawavip, vip-activar, DZW, tipo 'vip', pre-auth pacientes_vip, REFERIDOS_VIP) + redirecciones.
5. Documentos en la app, fases del protocolo.

## 3. Ambientes (desde 2026-10-04)

| Ambiente | Base Airtable | Congelado | Llave |
|---|---|---|---|
| Local (`node scripts/servidor-local.js`, 127.0.0.1:3077) | prueba `appCQ0RdhqFMGxWL5` | no | `.env.local` (solo ve PRUEBAS) |
| Preview Vercel (URL por rama) | prueba (`AIRTABLE_BASE_ID` solo en Preview) | no | Preview: solo ve PRUEBAS |
| Producción `codecells.mx` | "CODE CELLS CRM" `app6jyD9pDlTLpknA` | **sí** hasta `DESCONGELAR_PRODUCCION=true` | `codecells-produccion`: solo ve CRM |

- Preview protegido con **Vercel Authentication**. Para un externo: enlace temporal (`get_access_to_vercel_url`, 23 h) sobre `codecells-site-git-<rama>-codecells.vercel.app`.
- **Dr. Galván (`CCMED-JCG01`)** en prueba (Clínico, plantilla Control prenatal) con Mariana y PBA Preeclampsia vinculadas. Su enlace temporal anterior (rama `chore/ambiente-preview`) vence 2026-10-05 12:59 → generar uno nuevo para `feat/paciente-unico`.
- Médico ficticio `CCMED-QACARD` (cardiología) vinculado al paciente QA `CC-PAC-9999901`.
- Embarazadas de prueba con datación: `CC-PAC-200001` (31+5 al 2026-10-04) y `CC-PAC-200003` (34+6); `CC-PAC-123456` tiene "Embarazo" sin datación.
- Base de prueba sin datos personales reales. Contiene registros de PRUEBA de hoy (planes, recetas, medicamentos, tomas, suplementos del QA).

## 4. Hecho — NO repetir

| Tema | Commit |
|---|---|
| Kiosco B1–B3; llave → VINCULACIONES; notas privadas por autor; autoría de consultas | `1e4ec05`, `7a0be91` |
| Ambientes (congelamiento = base de producción); NOVA acepta Preview | `6214dda`, `9229df6` |
| SPEC paciente único; Fase 1 identidad (PIN, liga de activación, bloqueo) | `eb7ccf0`, `c0bc957`, `de1c263` |
| MVP-1: Biological Map (servidor, app, kiosco, portal), Día X de 90, NOVA un solo modo | `dd9469c` … `7a84a45` |
| i18n de la app ES/EN/PT; selector lejos de WhatsApp | `566321e` |
| Nutrición: cerrado acceso sin sesión; generador arreglado (TDZ) | `7db9519` |
| App: Mi equipo + Tu progreso (peso, presión) | `55a4869` |
| Nutrición: el médico edita y **publica** el plan → pestaña Plan | `eac538e` |
| **MVP-2 Medicamentos**: receta estructurada = único acto médico; "Hoy" + adherencia 7 d; suplementos del paciente (medicamento → "pregúntale a tu médico"); suspender solo quien recetó; receta bloqueada para demos; impresión escapada | `1445cfe` |
| **Embarazo** bajo "Tu protocolo actual": semanas + días desde la datación del médico, FPP; protocolo escapado | `7265991` |

## 5. Antes de fusionar a `main` (crear en producción "CODE CELLS CRM")

Tablas (copiar campos de la base de prueba; se usan por NOMBRE): `ANTECEDENTES_OBSTETRICOS`, `LLAVES_ACCESO`, `VINCULACIONES`, `CREDENCIALES_PACIENTE`, `EVALUACIONES_BIOLOGICAS`, `RECETAS`, `MEDICAMENTOS_PACIENTE`, `TOMAS_MEDICAMENTO`, `SUPLEMENTOS_PACIENTE`.
Campos: `Registrado por` en HISTORIA CLÍNICA; `Fecha inicio protocolo` en PACIENTES; en CONSULTAS Edema, Proteinuria, Movimientos fetales, Placenta — localización/grado, Interpretación Doppler; en PLANES_NUTRICIONALES `Código de paciente ref`, `Plan publicado (texto)`, `Kcal objetivo`, `Proteína (g)`, `Carbohidratos (g)`, `Grasa (g)`, `Publicado`, `Publicado por` (liga a MÉDICOS), `Fecha publicación`.
Al fusionar, los pacientes de producción ya no entran con su código (necesitan enlace de activación) — aceptable porque no hay nada lanzado.

## 6. Decisiones abiertas para Víctor

1. **Capas de la consulta:** A (resumen) / B (nota del médico) / C (criterio privado). ¿El paciente ve B? ¿Pronóstico va a A? ¿"Mi evolución" en la app?
2. FEVI/FEV1/PSA: ¿antecedentes o LAB_VALORES? (recomendación: LAB_VALORES).
3. Plantillas al dar de alta un médico (sin plantilla activa no aparece la pestaña prenatal, sin aviso).
4. Datos reales de la auditoría en producción: qué hacer antes del lanzamiento (con el abogado).
5. Entrevistas: `SPEC-PLANTILLAS-LISTA-ENTREVISTAS.md`.

**Ya decidido — no volver a discutir:** app por etapas MVP-1/2/3 con la paleta actual; Biological Map función 0–10; NOVA no da consejos clínicos personalizados; VIP se fusiona en el paciente normal; el código CC-PAC- es identificador, no credencial; el paciente es dueño del expediente, no del criterio médico; colegas no ven notas privadas; producción congelada hasta el interruptor; **la receta es el único acto médico que crea medicamentos; el paciente solo registra suplementos (aparte)**; publicar el plan nutricional es acto del médico; embarazo solo con "Embarazo" en Patologías activas y EG solo desde la datación del médico.

## 7. Pendientes (no bloquean)

- `medico_*` de `nova.js` no revisan `Tipo de acceso` (un Revisor podría guardar labs).
- Telegram de Preview usa el bot real.
- Kiosco: no carga antecedentes existentes; historia sin salida en pregunta 1; fecha de signos en UTC; idioma persiste en la tablet.
- Tarjeta GO a pacientes hombres; duplicación `GO_K_*`/`GO_TIPOS_*`; `f-ago` texto libre.
- Portal en móvil desborda horizontalmente.
- Recordatorios de medicamentos con la app cerrada (push) — fuera de MVP-2, la app lo dice así.
- `Clasificación cie10.pdf` (30 MB) y `SPEC-NOVA-DICTACION-BIDIRECCIONAL.md` sin rastrear (no son de Claude).

## 8. Trampas técnicas ya resueltas

- `127.0.0.1`, no `localhost`. 1ª llamada a Airtable de cada proceso: ~10 s o falla, reintentar.
- `git push` lo corre Víctor con `! cd /c/Users/virn3/Documents/codecells-site && git push`.
- Si el servidor local no está, se puede probar en vivo llamando al handler directo (`require('api/nova.js')` con req/res falsos y `.env.local`), abortando si `AIRTABLE_BASE_ID` no es la base de prueba.
- `core.autocrlf=true`. Scripts de Node que escriben archivos: escribirlos con el editor (los `\d`, `\/`, `\n` se pierden en heredocs).
- Airtable: el GET de un registro por id **ignora `fields[]`** → para limitar campos usar lista con `filterByFormula=RECORD_ID()=...`.
- Fechas `date` de Airtable ("2026-12-01") en el navegador: añadir `T12:00:00` antes de formatear o salen un día antes en Culiacán.
- Al revisar archivos con secretos: ocultar valores sin importar el separador (`=` o `:`).
- Chrome en segundo plano: capturas se cuelgan; usar JS/`find` o reintentar.
- Variables de Vercel: cambiar una exige redeploy; revisar qué ambientes quedan marcados.
- El portal guarda los datos del médico al iniciar sesión: cambios en MÉDICOS requieren salir y entrar.
