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

## 1. Siguiente paso (empezar aquí): DIRECTORIO MÉDICO en la app del paciente

Objetivo (docs/VISION-APP-MEDICA.md, MVP-3): que el paciente encuentre médicos
de la red desde su app y, si quiere, le entregue su expediente con la llave
que ya existe (vía `vinculado`). Es la pieza que cierra "el paciente decide
con quién va" (CLAUDE.md §2).

### Lo que YA existe (no rehacer — verificar primero)
- Página pública `/directorio` (`directorio/index.html`, ~900 líneas); `/buscar-medico.html` redirige ahí (`vercel.json`).
- Tabla `directorio_medico` (`tblkUNPwu1sQgZBPJ`) en `api/airtable.js`: GET público con lista blanca de campos y `{Publicado}=1`; `accion=ciudades`; registro de lead (`Origen: Formulario /directorio`, estampa versión del aviso de privacidad) que emite un token de visitante para ver contactos.
- Portal → sección **"Mi directorio"** (perfil público que edita el propio médico; `guardarCampoMiDir`).
- NOVA (modo público) tiene la herramienta `buscar_medicos_directorio`.
- Base de prueba: **solo 1 perfil** (VIRN01, Culiacán). Hay que cargar perfiles ficticios para probar.

### Plan propuesto (presentarlo a Víctor ANTES de construir)
1. **Revisar** `directorio/index.html` + ramas `directorio_medico` de `api/airtable.js`: qué campos son públicos, cómo se filtra, cómo se ve en celular.
2. **Pestaña/acceso en la app** (`mi-nivel.html`): buscar por especialidad y ciudad, tarjeta del médico (nombre, especialidad, ciudad, lo que declara ofrecer). Para un paciente con sesión NO debe pedir el formulario de lead (ya está identificado).
3. **"Compartir mi expediente con este médico"** desde la tarjeta: reutiliza `paciente_generar_llave` (8 caracteres, 24 h, un solo uso) — el código `CC-PAC-` solo nunca abre nada.
4. **Pedir cita** al médico del directorio: depende del módulo Agenda (no funcional, ver memoria) → probablemente solo "solicitud" que le llega al médico, sin disponibilidad real. Decidir con Víctor.
5. Pruebas + verificación en navegador + perfiles ficticios en base de prueba.

### Preguntas para Víctor (mañana, antes de construir)
- ¿El paciente ve el **teléfono/WhatsApp** del médico o solo un botón de solicitud? (hoy en `/directorio` el contacto exige dejar datos).
- ¿El directorio en la app muestra a **todos** los publicados o solo a médicos afiliados activos? ¿Algún orden (cercanía, especialidad)?
- ¿Qué pasa al pedir cita: mensaje al médico (Telegram/portal) o cita en AGENDA?
- Recordatorio CLAUDE.md §10: el **nivel interno** (Asociado/Certificado/Senior/Partner) nunca se muestra a pacientes.

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
