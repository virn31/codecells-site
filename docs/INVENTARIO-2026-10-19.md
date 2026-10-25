# Inventario de lo construido — CODE CELLS™ (2026-10-19)

> Revisión de solo lectura del repositorio, el historial de Git, Vercel y el esquema de Airtable.
> Etiquetas: **verificado** (comprobado hoy), **reportado** (dicho en notas o commits previos, sin volver a comprobar hoy), **no existe**.
> Base para la valuación y los precios. Referencia: `code_cells_auditoria_integral.json`.

## 0. Datos generales (verificado)

| Dato | Valor |
|---|---|
| Producción `codecells.mx` | Despliegue de `main` @ `66cd2ed` (2026-09-01). **Sin cambios en producción desde hace 7 semanas.** |
| Historial `main` | 746 commits del 2026-06-28 al 2026-09-01 (517 en julio). Casi todo de una sola persona (Víctor), con IA. |
| Trabajo sin publicar | `feat/paciente-unico`: **+63 commits** sobre `main` (hasta 2026-10-16), +10 635 / −1 638 líneas en 41 archivos. |
| Volumen de código propio | `main`: ~27 400 líneas HTML/CSS + ~12 100 JS + ~2 000 de pruebas. Rama clínica: ~31 600 + ~16 900 + ~7 000 de pruebas. |
| Base de datos | Airtable "CODE CELLS CRM": **30 tablas**. Base de prueba aparte (solo en la rama). |
| Pruebas `main` | 76 pruebas: 69 pasan y **7 fallan** porque el congelamiento está escrito fijo en `main`. No son fallas nuevas: el commit `6214dda` de la rama lo explica. |
| Pruebas rama | ~360 pruebas en 35 archivos, todas en verde al 2026-10-16 (**reportado**, no se volvieron a correr hoy). |
| Infraestructura | Vercel (funciones Node), Airtable, API de Anthropic (NOVA), bot de Telegram, Google Calendar (OAuth). Sin `package.json` en `main`. |

## 1. EN PRODUCCIÓN (en `main` y desplegado)

Producción está **congelada**: el sistema se puede ver y leer, pero no registra datos personales nuevos.

| Módulo | Qué hay | Estado |
|---|---|---|
| Sitio público | `index.html` (1 982 líneas), presentación `code-cells-network` con audio, `descubre`, `bienestar`, `regene-alianza`, `unete` | Funciona (contenido) |
| Directorio médico | Búsqueda con filtros y lista blanca de campos; solicitud de contacto | La búsqueda funciona. La solicitud está congelada. **1 perfil publicado** (Víctor). El médico se publica solo, sin revisión ni consentimiento registrado. |
| Portal médico | `portal-medico.html` (7 788 líneas): pacientes con acceso restringido, expediente, consultas, laboratorios, gráficas, "Mi directorio" | Funciona en lectura; escrituras de datos personales congeladas |
| Portal del paciente (VIP) | `portal-vip`, `dezawavip`, `mi-nivel` | Versión anterior al "paciente único" |
| NOVA | `api/nova.js` (4 199 líneas, 21 acciones): chat de la página, asistente del médico, lectura de estudios | Funciona; depende de la API de Anthropic |
| Bot de Telegram | Avisos, alta de médicos con botones | Funciona |
| Kiosco | `kiosco.html` (alta delegada en consultorio) | Versión básica |
| Autorización | Acceso médico→pacientes restringido, interconsultas, bitácora `ACCESOS_EXPEDIENTE` | **Reportado** como cerrado (agosto) |
| Privacidad | Aviso de privacidad v1.0 (borrador sin revisión del abogado), congelamiento | Parcial |
| CRM / leads | Tablas `LEADS`, `SOLICITUDES_PACIENTE`, `SOLICITUDES_MEDICO` | Solo datos; se gestionan a mano en Airtable, sin pantalla propia |
| Academia | `capacitacion/` con índice; los 10 módulos dicen "Módulo en actualización" (contenido retirado en espera de dictamen) | **En pausa** |
| Agenda | `api/agenda.js`, cron, Google Calendar | **No funciona**: tabla vacía y la pantalla no permite crear citas (reportado) |

## 2. CONSTRUIDO PERO SIN PUBLICAR (`feat/paciente-unico`)

Todo esto existe y tiene pruebas, pero **ningún médico ni paciente lo ha usado en producción**.

- **Ambientes** prueba / Preview / producción, con congelamiento por base de datos (`6214dda`).
- **Paciente único:** identidad con PIN, liga de activación, bloqueo; VIP fusionado con el paciente normal.
- **App del paciente:** Biological Map, Día X de 90, Mi equipo, Tu progreso, medicamentos (la receta es el único acto médico), suplementos, plan nutricional publicado por el médico, embarazo con semanas y días.
- **Control prenatal** (`control-prenatal.html`, 671 líneas) y antecedentes obstétricos en el kiosco.
- **Dictado por voz o texto** en Nueva consulta y en Telegram, con verificación por cita literal y autoría rastreable.
- **CIE-10:** catálogo de 10 533 códigos; NOVA sugiere y el médico elige, también con varios diagnósticos.
- **Motor de gráficas** como librería, y laboratorios clasificados por catálogo.
- **Tope de uso de NOVA** (controla el costo de la IA), vinculación por llave, notas privadas por autor.
- **Correcciones de auditoría:** 5 críticos, altos y medios; los secretos de los médicos ya no salen del servidor.
- **Traducción** al español, inglés y portugués.

Además hay una rama que no está en `main` ni en la rama clínica: `fix/nova-idioma-y-consentimiento` (+24 commits, agosto).

## 3. NO EXISTE (solo aparece como texto o idea)

Comprobado buscando en todo el código de `main`:

| Módulo del ecosistema | Hallazgo |
|---|---|
| Cobro / membresías / facturación | **Cero integración de pago** (ni Stripe ni Mercado Pago). "Membresía" solo aparece en textos comerciales. |
| Hospitales | Solo se mencionan en un módulo de capacitación en pausa |
| Proveedores, pedidos, trazabilidad | Solo en textos de capacitación; no hay módulo |
| Investigación | Solo en textos de capacitación |
| Laboratorios como red | No hay. Lo que existe es la **lectura de estudios** dentro del expediente. |
| Referencias profesionales | Solo la interconsulta interna entre médicos de la red |
| Telemedicina | No existe |
| Pantalla de CRM | No existe (se usa Airtable directo) |

## 4. Hallazgos que afectan valor o riesgo

1. **El trabajo más valioso no está en producción.** Lo que hoy puede usar un médico es la versión del 1 de septiembre.
2. **Endpoint viejo `api/buscar-medicos`** (verificado): devuelve **error 500** en producción, así que hoy no expone nada. Pero su código lee la tabla MÉDICOS completa (teléfono, nivel interno, médicos no publicados) sin pedir sesión, y llama a la API de Anthropic sin límite. Si un día `main` recibe un `package.json` con el SDK sin el cierre (410) que ya está en la rama, quedaría abierto. Se debe cerrar antes de cualquier fusión.
3. **La base de producción está escrita a mano en unos 15 archivos de `main`**: no hay forma segura de probar esa versión en Preview.
4. **Datos de salud en servicios de terceros** que necesitan revisión legal: Airtable (EUA), Telegram (el motivo de consulta en las alertas), Anthropic (NOVA) y Web Speech de Google (dictado en la rama).
5. **Depende de una sola persona más IA.** No hay un segundo desarrollador que conozca el sistema.
6. **La rama trae un PDF de 30 MB** (`Clasificación cie10.pdf`) en el historial: pesa en el repositorio y hay que confirmar los derechos de la fuente.
7. Pendientes legales: acta constitutiva, IMPI, aviso de privacidad clínico, revisión del abogado.

## 5. Qué se puede vender hoy

- **Hoy:** nada se puede cobrar. No hay medio de pago y producción está congelada.
- **Diciembre (si se cumple el plan del directorio):** directorio con ficha, solicitud de cita y panel de aprobación.
- **Fase 2:** portal clínico y app del paciente. Ya están construidos, falta publicarlos, la parte legal y la prueba con médicos reales.

## 6. Datos que faltan para valuar (Víctor)

- Costos mensuales reales: Vercel, Airtable (plan), Anthropic, dominio, Telegram y otros.
- Horas o meses de trabajo invertidos y en qué perfil (médico-diseñador, desarrollo, contenido).
- Pagos a terceros (abogado, diseño, audio/voz de la presentación).
