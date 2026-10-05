# CONTINUAR — recordatorio de sesión

> **Protocolo.** Al decir "continúa", Claude lee este archivo PRIMERO y retoma
> desde "Siguiente paso". Al cerrar cada sesión, Claude lo REESCRIBE (no
> agrega al final): este archivo es el estado actual, no un diario. El
> historial vive en git (`git log`) y en la memoria del proyecto.

**Última actualización:** 2026-10-05 (sesión de corrección de errores)
**Rama de trabajo:** `feat/paciente-unico` — 12 commits nuevos hoy (`a72c134` … `ea71139`), **sin push** (lo corre Víctor). Nada fusionado a `main`.
**Pruebas:** `node --test test/*.test.js` → **305/305 en verde**.
**Servidor local:** detenido. `node scripts/servidor-local.js` solo si se necesita navegador.

---

## 1. Siguiente paso (empezar aquí): SPEC-NOVA-DICTACION-BIDIRECCIONAL

Víctor ordenó (2026-10-05): **primero eliminar errores conforme aparezcan, después implementar `SPEC-NOVA-DICTACION-BIDIRECCIONAL.md`** (copia en la raíz del repo, sin rastrear, igual a la de Descargas). El directorio médico + agenda automática queda DESPUÉS de la SPEC (ver §2).

Antes de construir, leer la SPEC completa y presentar a Víctor el plan por fases. Ya está hecho el terreno que la SPEC pisa:
- Dictado por Telegram con puerta de autorización (`autorizarDictadoTelegram`, Clínico + `autorizarPaciente` con escritura, al dictar y al confirmar).
- Chat del médico: herramientas solo para `Tipo de acceso=Clinico`; series de labs autorizan al paciente, enlazan al catálogo (exacto) y son idempotentes (fecha+analito+valor); alta por dictado con anti-duplicado (nombre/teléfono/fecha de nacimiento, sin revelar pacientes ajenos).
- Telegram con negritas reales (HTML escapado, respaldo a texto plano).
- Tope discreto de NOVA (paciente 20/día, médico 40; con expediente abierto no cuenta) — el dictado con paciente abierto NO se limita.

## 2. Pendientes (después de la SPEC)

1. **Directorio médico + agenda automática** (decidido 2026-10-04): reutilizar el buscador de `/directorio`; tarjeta con todos los datos menos el nivel interno; botón "Agenda automática" (Google Calendar del médico + días/horarios; el paciente ve solo espacios libres; NOVA ayuda a agendar); botón al directorio en `index.html`. Etapa 1 (fuga del refresh token) **YA HECHA**. Plan de etapas 2–8 y preguntas abiertas: ver memoria "Siguiente: directorio + agenda automática".
2. **Revocar y reconectar el Google Calendar de VIRN01** al pasar a producción (su refresh token estuvo expuesto; sin el client secret no se usa, pero hay que rotarlo). Decisión de Víctor: al entrar a producción.
3. **Probar en Preview (celular real) con el Dr. Galván** lo de ayer y hoy: identidad/PIN, Biological Map, Mi equipo, Progreso, Plan, Medicamentos, embarazo, **aviso de cita en la app, tope de NOVA, dictado por Telegram, negritas de Telegram, conexión de Google Calendar (state firmado), tabla de labs con categorías y "no graficable"**. Su enlace temporal venció 2026-10-05 12:59 → generar uno nuevo para `feat/paciente-unico`.
4. Rama de labs de agosto: solo falta portar `dd357f0` (estado vacío real en Historia Clínica + scroll a Consultas, UI).
5. Mejora: "Tu última receta" muestra la más reciente de cualquier médico.
6. **Fase 3 de SPEC-PACIENTE-UNICO:** retiro de VIP + redirecciones.
7. Documentos en la app, fases del protocolo.

## 3. Ambientes

| Ambiente | Base Airtable | Congelado | Llave |
|---|---|---|---|
| Local (`node scripts/servidor-local.js`, 127.0.0.1:3077) | prueba `appCQ0RdhqFMGxWL5` | no | `.env.local` (solo ve PRUEBAS) |
| Preview Vercel (URL por rama) | prueba (`AIRTABLE_BASE_ID` solo en Preview) | no | Preview: solo ve PRUEBAS |
| Producción `codecells.mx` | "CODE CELLS CRM" `app6jyD9pDlTLpknA` | **sí** hasta `DESCONGELAR_PRODUCCION=true` | `codecells-produccion`: solo ve CRM |

- Preview protegido con **Vercel Authentication**. Para un externo: enlace temporal (`get_access_to_vercel_url`, 23 h) sobre `codecells-site-git-<rama>-codecells.vercel.app`.
- Preview usa el **bot real de Telegram** y `TELEGRAM_CHAT_ID` (chat de Víctor): las alertas de la bitácora en prueba dicen "Ambiente: prueba".
- **Dr. Galván (`CCMED-JCG01`)** en prueba (Clínico, plantilla Control prenatal) con Mariana y PBA Preeclampsia vinculadas. OJO: es fundador → en el chat de NOVA entra al perfil 'ceo' (sin herramientas); para probar herramientas de NOVA usar `CCMED-QACARD`.
- Médico ficticio `CCMED-QACARD` (cardiología) vinculado al paciente QA `CC-PAC-9999901`.
- Embarazadas de prueba con datación: `CC-PAC-200001` (31+5 al 2026-10-04) y `CC-PAC-200003`; `CC-PAC-123456` tiene "Embarazo" sin datación.
- Catálogo de PRUEBA corregido 2026-10-05 (ALT = perfil_hepatico, Hemoglobina = biometria); producción ya estaba bien.
- Directorio en prueba: 1 perfil sin publicar → ciudades/contactos vacíos.

## 4. Hecho — NO repetir

| Tema | Commit |
|---|---|
| Kiosco B1–B3; llave → VINCULACIONES; notas privadas por autor; autoría de consultas | `1e4ec05`, `7a0be91` |
| Ambientes (congelamiento = base de producción); NOVA acepta Preview | `6214dda`, `9229df6` |
| SPEC paciente único; Fase 1 identidad (PIN, liga de activación, bloqueo) | `eb7ccf0`, `c0bc957`, `de1c263` |
| MVP-1: Biological Map, Día X de 90, NOVA un solo modo | `dd9469c` … `7a84a45` |
| i18n de la app ES/EN/PT | `566321e` |
| Nutrición: acceso con sesión; el médico publica el plan | `7db9519`, `eac538e` |
| App: Mi equipo + Tu progreso | `55a4869` |
| MVP-2 Medicamentos (receta = único acto médico) | `1445cfe` |
| Embarazo: semanas + días desde la datación del médico | `7265991` |
| **2026-10-05** Secretos de MÉDICOS nunca salen del servidor (refresh token, passphrase); proxy tabla=medicos con lista blanca; `airtable_lookup` retirado | `a72c134` |
| Labs y calendario exigen Clínico; calendario sin demos | `82b7d33` |
| Auditoría r.ok: 5 CRÍTICOS + herramientas del chat solo Clínico; series autorizan paciente; alta no crea huérfanos | `2ded143` |
| Telegram/memoria NOVA no borran datos tras lectura fallida; negritas Telegram | `7285673` |
| Tope discreto de NOVA (`lib/usoNova.js`, tabla `USO_NOVA`) | `cee9b77` |
| ALTOS r.ok: cita honesta, puerta del dictado Telegram, NOM-004, preconsulta cerrada (410) | `8e3feba` |
| MEDIOS r.ok + state firmado de Google OAuth; `api/buscar-medicos` cerrado (410) | `5cbd3d9` |
| Labs: categoría por catálogo; conteo honesto + lotes de 10 en dictado de series | `92bd900` |
| Bitácora ACCESOS_EXPEDIENTE: reintento + alerta Telegram (siempre hay registro) | `1ae0b4a` |
| Anti-duplicado del alta por dictado; series enlazadas al catálogo + idempotentes; "no graficable"; formatDate sin corrimiento | `ea71139` |

## 5. Antes de fusionar a `main` (crear en producción "CODE CELLS CRM")

Tablas (copiar campos de la base de prueba; se usan por NOMBRE): `ANTECEDENTES_OBSTETRICOS`, `LLAVES_ACCESO`, `VINCULACIONES`, `CREDENCIALES_PACIENTE`, `EVALUACIONES_BIOLOGICAS`, `RECETAS`, `MEDICAMENTOS_PACIENTE`, `TOMAS_MEDICAMENTO`, `SUPLEMENTOS_PACIENTE`, `USO_NOVA` (Clave, Código, Fecha, Tipo, Mensajes — tope diario de NOVA).
Campos: `Registrado por` en HISTORIA CLÍNICA; `Fecha inicio protocolo` en PACIENTES; en CONSULTAS Edema, Proteinuria, Movimientos fetales, Placenta — localización/grado, Interpretación Doppler; en PLANES_NUTRICIONALES `Código de paciente ref`, `Plan publicado (texto)`, `Kcal objetivo`, `Proteína (g)`, `Carbohidratos (g)`, `Grasa (g)`, `Publicado`, `Publicado por` (liga a MÉDICOS), `Fecha publicación`.
Al fusionar, los pacientes de producción ya no entran con su código (necesitan enlace de activación) — aceptable porque no hay nada lanzado.
Revocar/reconectar Google Calendar de VIRN01 (§2.2).

## 6. Decisiones abiertas para Víctor

1. **Capas de la consulta:** A (resumen) / B (nota del médico) / C (criterio privado). ¿El paciente ve B? ¿Pronóstico va a A? ¿"Mi evolución" en la app?
2. FEVI/FEV1/PSA: ¿antecedentes o LAB_VALORES? (recomendación: LAB_VALORES).
3. Plantillas al dar de alta un médico (sin plantilla activa no aparece la pestaña prenatal, sin aviso).
4. Datos reales de la auditoría en producción: qué hacer antes del lanzamiento (con el abogado).
5. Entrevistas: `SPEC-PLANTILLAS-LISTA-ENTREVISTAS.md`.
6. ¿Tope por persona para el chat público de la landing (sin sesión)? Hoy no tiene.

**Ya decidido — no volver a discutir:** app por etapas MVP-1/2/3; Biological Map 0–10; NOVA no da consejos clínicos personalizados; VIP se fusiona en el paciente normal; el código CC-PAC- es identificador, no credencial; el paciente es dueño del expediente, no del criterio médico; colegas no ven notas privadas; producción congelada hasta el interruptor; la receta es el único acto médico que crea medicamentos; publicar el plan nutricional es acto del médico; embarazo solo con "Embarazo" en Patologías activas; **(2026-10-05)** NOVA no es chat prolongado: paciente 20/día, médico 40, con expediente abierto no cuenta, cierre cordial sin contadores; bitácora: reintento + Telegram, siempre hay registro; duplicados por nombre/teléfono/fecha de nacimiento y fecha+analito+valor; cada médico conecta su propio Google Calendar (state firmado de 15 min).

## 7. Pendientes (no bloquean)

- Kiosco: no carga antecedentes existentes; historia sin salida en pregunta 1; fecha de signos en UTC; idioma persiste en la tablet.
- Tarjeta GO a pacientes hombres; duplicación `GO_K_*`/`GO_TIPOS_*`; `f-ago` texto libre.
- Portal en móvil desborda horizontalmente.
- Regex `pacienteCode` duplicada en ~14 sitios (extraer a constante).
- Recordatorios de medicamentos con la app cerrada (push).
- `Clasificación cie10.pdf` y `SPEC-NOVA-DICTACION-BIDIRECCIONAL.md` sin rastrear (no son de Claude).
- `package.json` aún lista `@anthropic-ai/sdk` (solo lo usaba el `buscar-medicos` retirado).

## 8. Trampas técnicas ya resueltas

- `127.0.0.1`, no `localhost`. 1ª llamada a Airtable de cada proceso: ~10 s o falla, reintentar.
- `git push` lo corre Víctor con `! cd /c/Users/virn3/Documents/codecells-site && git push`.
- Probar en vivo llamando al handler directo (`require('./api/nova.js')` con req/res falsos y `.env.local`), abortando si `AIRTABLE_BASE_ID` no es la base de prueba. `nova.js` exige `content-type: application/json`.
- `core.autocrlf=true`. Ediciones grandes con scripts de Python: escribir el script con el editor en el scratchpad (los heredocs de bash rompen con ciertos caracteres) y usar cadenas `r'''…'''` cuando el código lleva `\n`.
- Airtable: el GET de un registro por id **ignora `fields[]`**; POST acepta **máximo 10 registros**; `get_table_schema` no da nombres de campo (usar `returnFieldsByFieldId=true`).
- Fechas `date` de Airtable en el navegador: `formatDate` del portal ya las arma en hora local (antes salían un día antes).
- Fundadores (`CEO_CODIGOS` en nova.js: VIRN01, JCG01, JORGE01) entran al chat como 'ceo' sin herramientas — en pruebas usar un médico ordinario.
- Comparar ramas por CONTENIDO, no por hash: main reaplicó commits con otros hashes (ver memoria "Rama de labs divergente").
- Al revisar archivos con secretos: ocultar valores sin importar el separador.
- Chrome en segundo plano: capturas se cuelgan; usar JS/`find` o reintentar.
- Variables de Vercel: cambiar una exige redeploy.
- El portal guarda los datos del médico al iniciar sesión: cambios en MÉDICOS requieren salir y entrar.
