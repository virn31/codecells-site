# CONTINUAR — recordatorio de sesión

> **Protocolo.** Al decir "continúa", Claude lee este archivo PRIMERO y retoma
> desde "Siguiente paso". Al cerrar cada sesión, Claude lo REESCRIBE (no
> agrega al final): este archivo es el estado actual, no un diario. El
> historial vive en git (`git log`) y en la memoria del proyecto.

**Última actualización:** 2026-10-04
**Rama de trabajo:** `feat/paciente-unico` (sale de `chore/ambiente-preview`, que sale de `feat/kiosco-antecedentes-go`). **Sin push** los commits de `feat/paciente-unico`.
**Pruebas:** `node --test test/*.test.js` → **197/197 en verde**.

---

## 1. Siguiente paso (empezar aquí)

1. **Push de `feat/paciente-unico`** (lo corre Víctor con `!`) y probar en su Preview (celular real) con el Dr. Galván: MVP-1, idioma, Mi equipo, Progreso, Plan (nutrición) y **MVP-2 Medicamentos** (receta → app → "Tomado").
2. **MVP-2 sin revisar en navegador**: el modal de receta nuevo del portal y la tarjeta "Hoy"/sección de medicamentos y suplementos de la app solo se probaron con pruebas y en vivo contra la base (handler directo), NO visualmente. Mejora pendiente: "Tu última receta" muestra la más reciente de cualquier médico (las indicaciones de otra receta quedan ocultas).
3. **Fase 3 de SPEC-PACIENTE-UNICO:** retiro de VIP (portal-vip, dezawavip, vip-activar, DZW, tipo 'vip', pre-auth de pacientes_vip, tabla REFERIDOS_VIP sin uso) + redirecciones.
4. Pendiente de Víctor: **capas A/B/C** de las consultas (§5).
5. Después: documentos en la app, fases del protocolo, pedir cita desde la app, liga al directorio.

## 2. Ambientes (desde 2026-10-04)

| Ambiente | Base Airtable | Congelado | Llave |
|---|---|---|---|
| Local (`node scripts/servidor-local.js`, 127.0.0.1:3077) | prueba `appCQ0RdhqFMGxWL5` | no | `.env.local` (solo ve PRUEBAS) |
| Preview Vercel (URL por rama) | prueba (`AIRTABLE_BASE_ID` solo en Preview) | no | Preview: solo ve PRUEBAS |
| Producción `codecells.mx` | "CODE CELLS CRM" `app6jyD9pDlTLpknA` | **sí** hasta `DESCONGELAR_PRODUCCION=true` | `codecells-produccion`: solo ve CRM |

- Preview protegido con **Vercel Authentication**. Para un externo: enlace temporal (`get_access_to_vercel_url`, 23 h) sobre la URL fija de la rama `codecells-site-git-<rama>-codecells.vercel.app`.
- **Dr. Galván (`CCMED-JCG01`)** registrado en la base de prueba (Clínico, plantilla Control prenatal) con Mariana y PBA Preeclampsia vinculadas ("Carga directa (solo base de prueba)"). Su enlace de la rama `chore/ambiente-preview` vence 2026-10-05 12:59.
- Médico ficticio `CCMED-QACARD` (cardiología) en prueba, vinculado al QA.
- Base de prueba sin datos personales reales (limpiada 2026-10-04).

## 3. Hecho — NO repetir

| Tema | Commit | Rama |
|---|---|---|
| Kiosco B1–B3: escrituras con sesión + `autorizarPaciente` + autor en HISTORIA; B3 pacientes GET/PATCH | `1e4ec05` | kiosco |
| Llave del paciente → VINCULACIONES (vía `vinculado`); notas privadas por autor; consultas: autoría del servidor, solo el autor modifica, paciente no escribe | `7a0be91` | kiosco |
| Ambientes: congelamiento = base de producción; 9 endpoints sin base fija | `6214dda` | ambiente-preview |
| NOVA acepta URLs de Preview; origen exacto (antes `startsWith`) | `9229df6` | ambiente-preview |
| SPEC paciente único (decisiones D1–D6 aceptadas como recomendadas) | `eb7ccf0` | paciente-unico |
| Fase 1 identidad: PIN en servidor, liga de activación (portal "Acceso app", kiosco QR local), bloqueo 5/10, fin del login solo-código, fin del modo médico de mi-nivel | `c0bc957`, `de1c263` | paciente-unico |

| Visión de la app médica (Víctor) con nota de alcance por etapas | `c65a819` | paciente-unico |
| MVP-1: cuestionario compartido + EVALUACIONES_BIOLOGICAS calificadas en servidor (escala función 0–10) | `dd9469c` | paciente-unico |
| MVP-1: app con pestañas, anillo, "Reevaluarme" (14 días), "Día X de 90" | `b843993` | paciente-unico |
| MVP-1: Biological Map en el kiosco (✓ solo si se guardó) | `960cf91` | paciente-unico |
| MVP-1: portal — pestaña Biological Map + fecha de inicio del protocolo + fix guardado sin verificar | `dbd286d` | paciente-unico |
| MVP-1: NOVA un solo modo (sin consejos clínicos, sin recordatorios falsos, sin datos de terceros) + compartir invitación | `7a84a45` | paciente-unico |
| i18n de la app ES/EN/PT; selector reubicado (lejos de WhatsApp); sin traductor del navegador | `566321e` | paciente-unico |
| Nutrición: cerrado el acceso sin sesión a generar plan y a cambiar peso; arreglado el generador (fallaba siempre, TDZ) | `7db9519` | paciente-unico |
| App: "Mi equipo" (solo nombre/especialidad) y "Tu progreso" (peso, presión) | `55a4869` | paciente-unico |
| Nutrición: el médico edita y PUBLICA el plan → pestaña Plan en la app (Inicio · Salud · Plan · Citas · NOVA) | `eac538e` | paciente-unico |
| MVP-2 Medicamentos: receta estructurada = único acto médico; "Hoy" + adherencia 7 d; suplementos del paciente (medicamento → "pregúntale a tu médico"); suspender solo quien recetó; receta bloqueada para demos; impresión escapada | `1445cfe` | paciente-unico |

Verificado en Chrome (local + base de prueba): identidad completa, app (evaluación de Mariana 6.8), kiosco (PBA 4.8 y 7.5), portal (gráfica + tabla). **Sin probar en celular real.** Plan nutricional verificado en Chrome (portal publica → app lo muestra; EN correcto). Sin probar en navegador: formulario de fecha de inicio del protocolo; el modal del portal ocultando el selector de idioma.

## 4. Antes de fusionar a `main` (crear en producción "CODE CELLS CRM")

Tablas: `ANTECEDENTES_OBSTETRICOS`, `LLAVES_ACCESO`, `VINCULACIONES`, `CREDENCIALES_PACIENTE`, `EVALUACIONES_BIOLOGICAS`, `RECETAS`, `MEDICAMENTOS_PACIENTE`, `TOMAS_MEDICAMENTO`, `SUPLEMENTOS_PACIENTE` (copiar campos de la base de prueba; las nuevas se usan por NOMBRE). Campos: `Registrado por` en HISTORIA CLÍNICA; `Fecha inicio protocolo` en PACIENTES; en CONSULTAS Edema, Proteinuria, Movimientos fetales, Placenta — localización/grado, Interpretación Doppler; en PLANES_NUTRICIONALES `Código de paciente ref`, `Plan publicado (texto)`, `Kcal objetivo`, `Proteína (g)`, `Carbohidratos (g)`, `Grasa (g)`, `Publicado` (casilla), `Publicado por` (liga a MÉDICOS), `Fecha publicación`. Y: al fusionar, los pacientes de producción ya no entran con su código (necesitan enlace) — aceptable porque no hay nada lanzado.

## 5. Decisiones abiertas para Víctor

1. **Capas de la consulta:** A (resumen: lo ven paciente y médicos autorizados) / B (nota del médico: padecimiento, exploración) / C (criterio privado). ¿El paciente ve B? ¿Pronóstico va a A? ¿"Mi evolución" en la app?
2. FEVI/FEV1/PSA: ¿antecedentes o LAB_VALORES? (recomendación: LAB_VALORES).
3. Plantillas al dar de alta un médico: hoy sin plantilla activa no aparece la pestaña prenatal, sin aviso.
4. Datos reales de pacientes de la auditoría en producción: qué hacer antes del lanzamiento (con el abogado).
5. Entrevistas: `SPEC-PLANTILLAS-LISTA-ENTREVISTAS.md`.

**Ya decidido — no volver a discutir:** construir la app por etapas MVP-1/2/3 con la paleta actual; escala del Biological Map = función 0–10 (más = mejor); NOVA no da consejos clínicos personalizados a nadie; VIP se fusiona en el paciente normal (red para todos); el código CC-PAC- es identificador, no credencial; el paciente es dueño del expediente, no del criterio médico; los colegas no ven las notas privadas del autor; producción congelada hasta el interruptor; G/P/C/A se calcula; estética Visme se queda; plantillas por `MÉDICOS.Plantillas activas`.

## 6. Pendientes (no bloquean)

- `medico_*` de `nova.js` no revisan `Tipo de acceso` (un Revisor podría guardar labs).
- Telegram de Preview usa el bot real (manda mensajes de prueba reales).
- Kiosco: no carga antecedentes existentes (aviso G/P/C/A falso); historia sin salida en pregunta 1; fecha de signos en UTC; idioma persiste en la tablet.
- Tarjeta GO a pacientes hombres; duplicación `GO_K_*`/`GO_TIPOS_*`; `f-ago` texto libre.
- Portal en móvil desborda horizontalmente.
- `Clasificación cie10.pdf` (30 MB) y `SPEC-NOVA-DICTACION-BIDIRECCIONAL.md` sin rastrear (no son de Claude).

## 7. Trampas técnicas ya resueltas

- `127.0.0.1`, no `localhost`. 1ª llamada a Airtable de cada proceso: ~10 s o falla, reintentar.
- `git push` lo corre Víctor con `! cd /c/Users/virn3/Documents/codecells-site && git push …`.
- `core.autocrlf=true`. Para escribir archivos con scripts de Node desde bash: los `\\d`, `\\/` y `\\n` dentro de template literals se pierden — preferir el editor o `String.raw`.
- Al revisar archivos con secretos: ocultar valores sin importar el separador (`=` o `:`). Una llave quedó impresa una vez y se revocó.
- Chrome en segundo plano: capturas se cuelgan; usar `find`/`read_page` o reintentar.
- Las variables de Vercel solo se leen al desplegar: cambiar una exige redeploy. Al editar una, revisar qué ambientes quedan marcados (producción se cayó ~30 min por eso).
- El portal guarda los datos del médico al iniciar sesión: cambios en MÉDICOS (p. ej. plantillas) requieren salir y entrar.
