# CODE CELLS™ — Plataforma Digital

Ecosistema digital de CODE CELLS™, plataforma de medicina regenerativa con sede en
Culiacán, Sinaloa. Sitio público, portal médico, portal de pacientes, centro de
capacitación y asistente clínico NOVA.

**Producción:** https://codecells.mx · **Hosting:** Vercel (plan Hobby)

---

## Estructura

```
/
├── index.html                  Sitio público + evaluación + NOVA
├── portal-medico.html          Portal del médico (login CCMED-)
├── portal-vip.html             Portal VIP (login DZW-)
├── mi-nivel.html               Portal del paciente (login CC-PAC-)
├── buscar-medico.html          Directorio público + triage NOVA
├── unete.html                  Afiliación de médicos
├── autorregistro.html          Autorregistro de pacientes por token
├── descubre.html               Campaña influencer (stories)
├── bienestar.html              Campaña influencer (one-pager)
├── dezawavip.html              Tour cinematográfico DEZAWA VIP
├── regene-alianza.html         Presentación alianza Regene
├── kiosco.html                 Kiosco en consultorio
├── privacidad.html             Aviso de privacidad
│
├── api/                        Funciones serverless (Vercel)
├── lib/                        Librerías compartidas (servidor y cliente)
├── capacitacion/               Centro de capacitación (11 módulos + examen)
├── code-cells-network/         Tour de afiliación "The Biological Network"
├── assets/                     Imágenes, audio, capturas
├── scripts/                    Utilidades de carga de datos (uso manual)
└── docs/                       Documentación interna
```

---

## ⚠️ Límite crítico: 12 funciones serverless

Vercel Hobby permite **máximo 12 funciones por deployment**. Cada archivo `.js`
directamente dentro de `api/` cuenta como una función. Los archivos que empiezan con
guion bajo (`_nova-knowledge-medico.js`) **no** cuentan.

Actualmente hay **exactamente 12**. Agregar un endpoint nuevo rompe el deployment con
`exceeded_serverless_functions_per_deployment` — y el síntoma es engañoso: Vercel sigue
sirviendo una versión vieja sin mostrar error visible.

**Para agregar funcionalidad nueva: consolidar dentro de un endpoint existente**
usando un parámetro de acción, como ya hace `api/nova-asistente-clinico.js`.

---

## Endpoints (`api/`)

| Archivo | Función |
|---|---|
| `nova.js` | NOVA — asistente principal, 5 modos (público, paciente, VIP, médico, fundadores) |
| `airtable.js` | Proxy de Airtable con autorización por token y whitelist de tablas |
| `auth-login.js` | Login: valida código contra Airtable y emite token firmado |
| `buscar-medicos.js` | Directorio público de médicos |
| `capacitacion-progreso.js` | Progreso y certificaciones de capacitación |
| `nova-asistente-clinico.js` | Sugerencia CIE-10 + auditoría de completitud (por `accion`) |
| `telegram-bot.js` | Bot @Drvirnbot + alertas internas (`x-internal-secret`) |
| `nueva-solicitud-medico.js` | Alta de solicitudes + aviso con botones inline |
| `google-oauth-callback.js` | OAuth de Google Calendar por médico |
| `guardar-preconsulta.js` | Captura previa a consulta |
| `vip-activar.js` | Activación de pacientes VIP |
| `cron-marcar-inactivos.js` | Marca pacientes inactivos (requiere bloque `crons` en `vercel.json`) |
| `_nova-knowledge-medico.js` | Base de conocimiento (no es función, empieza con `_`) |

---

## Librerías (`lib/`)

| Archivo | Función |
|---|---|
| `auth.js` | Tokens firmados HMAC-SHA256, sin base de datos de sesiones |
| `codigos.js` | Generación de códigos `CCMED-` a partir de iniciales |
| `google-calendar.js` | Creación de eventos y recordatorios |
| `telegram.js` | Envío de mensajes, botones inline, edición |
| `nutricion.js` | Generación de planes nutricionales |
| `i18n.js` | **Internacionalización (cliente)** — ver abajo |

---

## Internacionalización (i18n)

`lib/i18n.js` traduce la plataforma completa **sin necesidad de editar cada página**.
Recorre el DOM y traduce por coincidencia exacta contra su diccionario interno.

Para que una página sea traducible basta con:

```html
<script src="/lib/i18n.js"></script>
```

Las 28 páginas HTML ya lo incluyen. El selector ES/EN aparece solo, arriba a la derecha,
y la preferencia se guarda en `localStorage`.

**Seguridad de datos:** solo se traduce texto que exista **exacto** en el diccionario.
Nombres de pacientes, códigos, diagnósticos escritos por el médico y notas clínicas nunca
coinciden, por lo que nunca se traducen. Para excluir un bloque explícitamente:
`<div data-no-i18n>`.

**Completar traducciones:** abrir cualquier página, consola del navegador, ejecutar
`i18nMissing()`. Devuelve los textos visibles sin traducción, ya con formato listo para
pegar en el diccionario de `lib/i18n.js`.

**Agregar un idioma:** `i18nAddLanguage('fr', { 'Inicio': 'Accueil', ... })`.

---

## Variables de entorno (Vercel)

| Variable | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | NOVA |
| `AIRTABLE_TOKEN` | Acceso a la base CRM |
| `SESSION_SECRET` | Firma de tokens de sesión — **nunca igual a `AIRTABLE_TOKEN`** |
| `TELEGRAM_BOT_TOKEN` | Bot @Drvirnbot |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth de Calendar |

---

## Base de datos (Airtable `app6jyD9pDlTLpknA`)

PACIENTES · HISTORIA CLÍNICA · CONSULTAS · MÉDICOS · PROTOCOLOS · NOVA LABS ·
TEMP · PACIENTES_VIP · SOLICITUDES_MEDICO · CAPACITACIONES_MEDICO

**Trampa conocida:** `ARRAYJOIN()` sobre un campo vinculado devuelve el **campo primario**
de la tabla vinculada, no el ID. En MÉDICOS el campo primario es `Código de médico`.
Cualquier `filterByFormula` que compare `ARRAYJOIN` contra un ID nunca coincide.
Usar el campo de vínculo crudo (arreglo de IDs) y filtrar con
`OR(RECORD_ID()="...", ...)`.

---

## Despliegue

Push a `main` dispara el deployment automático en Vercel.

Antes de dar por buena una salida a producción:

1. Verificar el archivo en GitHub (vista *raw*) buscando una cadena única del cambio.
2. Confirmar que el deployment esté en estado *Ready* (no sirviendo una versión vieja).
3. Probar en una ventana limpia — el Service Worker cachea versiones anteriores.

---

## Notas de mantenimiento

- Los HTML de campañas (`index`, `bienestar`, `descubre`, `dezawavip`) pesan varios MB
  por multimedia embebida en base64. Conviene migrarlos a archivos en `assets/`.
- `scripts/load_jorge_data.py` es una utilidad de carga manual, no se ejecuta en producción.
