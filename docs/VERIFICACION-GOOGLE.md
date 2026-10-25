# Verificación de la app de Google (agenda de los médicos)

Preparado el 2026-10-23. Es para que Google deje de mostrar **"Google no ha
verificado esta app"** y quite el **tope de 100 usuarios** del permiso de
calendario. Mientras no esté verificada, la conexión **sí funciona** (así se
hizo la prueba real de Víctor); solo sale el aviso y existe ese tope.

**Tipo de verificación:** los permisos de calendario que usamos son
**"sensibles"**, no "restringidos". Eso significa **sin auditoría de
seguridad pagada (CASA)**: solo revisan la marca, el dominio, la política de
privacidad, la justificación de cada permiso y un video.
**Tiempo típico:** la marca tarda de 2 a 3 días hábiles; los permisos
sensibles, de unos días a algunas semanas, a veces con preguntas de ida y vuelta.

---

## 0. Antes de enviar (bloqueantes)

Google revisa **codecells.mx en vivo**. Hoy codecells.mx no cumple. Tres cosas
tienen que estar publicadas en producción (`main`) antes de enviar:

| # | Qué | Dónde está hoy |
|---|-----|----------------|
| 1 | `privacidad.html` actualizada: dice exactamente qué permisos pedimos y para qué, incluye la sección en inglés y la frase de "Limited Use" | rama `feat/directorio` |
| 2 | Enlace "Privacidad" en el pie de la página principal (Google exige que la home enlace la política) | rama `feat/directorio` |
| 3 | Arreglo de seguridad: el permiso de Google nunca sale del servidor (`c8184fe`). **Hoy en producción `auth-login` sí lo devuelve al navegador**, y la política dice que no. Publicar la política sin este arreglo sería afirmar algo falso | rama `feat/directorio` |

Fusionar toda la rama a `main` trae el directorio completo, que todavía no
está listo. La opción recomendada es **un PR chico a `main` solo con esos tres
cambios**. Ninguno captura datos personales nuevos, así que no rompe el
congelamiento. Decide Víctor (categoría C: producción).

Además:
- **Confirmar que `privacidad@codecells.mx` recibe correo.** Aparece en la
  política y Google o un médico pueden escribir ahí.
- **Quitar el redirect de la versión de prueba** del cliente OAuth
  (`https://codecells-site-git-feat-directorio-codecells.vercel.app/...`).
  Google exige que todos los dominios de redirect estén verificados, y
  `vercel.app` no se puede verificar como nuestro. Para seguir probando,
  crear después un **proyecto de Google aparte**, "CODE CELLS Pruebas",
  en modo prueba.
- **Logotipo:** PNG cuadrado de 120×120 px, sin fondo raro, igual al de la
  marca. Google rechaza logos que no coincidan con el sitio.

---

## 1. Verificar el dominio codecells.mx (Search Console, ~10 min)

El DNS de codecells.mx está en **GoDaddy** (`ns07/ns08.domaincontrol.com`).

1. Entra a <https://search.google.com/search-console> con la **cuenta dueña
   del proyecto de Google Cloud**.
2. **Agregar propiedad** → tipo **Dominio** → escribe `codecells.mx`.
3. Google te da un registro **TXT** (`google-site-verification=...`). Cópialo.
4. En GoDaddy → Mis productos → `codecells.mx` → **DNS** → **Agregar
   registro** → Tipo **TXT**, Nombre `@`, Valor: el texto copiado, TTL 1 hora.
   **No toques los registros A/CNAME existentes**, porque son los que apuntan
   a Vercel.
5. Vuelve a Search Console → **Verificar**. Si dice que no lo encuentra,
   espera 15–60 min y reintenta.

---

## 2. Google Cloud Console → "Plataforma de Google Auth" / "Pantalla de consentimiento de OAuth"

Entra con la cuenta dueña del proyecto. Los nombres de los menús cambian un
poco según la versión de la consola; los campos son estos.

### 2.1 Marca (Branding)

| Campo | Valor |
|---|---|
| Nombre de la app | `CODE CELLS` (igual al nombre visible en codecells.mx) |
| Correo de asistencia | `privacidad@codecells.mx` (o el correo dueño del proyecto) |
| Logotipo | el PNG de 120×120 |
| Página principal | `https://www.codecells.mx` |
| Política de privacidad | `https://www.codecells.mx/privacidad.html` |
| Condiciones del servicio | (opcional; dejar vacío si no hay página) |
| Dominios autorizados | `codecells.mx` |
| Contacto del desarrollador | correo de Víctor |

### 2.2 Acceso a datos (Data access → Scopes)

Deja **exactamente** estos tres. Si aparece `.../auth/calendar` (el
completo), **quítalo**: el código ya no lo pide desde este commit.

- `.../auth/userinfo.email` (no sensible)
- `.../auth/calendar.freebusy` (sensible)
- `.../auth/calendar.events` (sensible)

Justificación por permiso. Va en inglés porque los revisores trabajan en
inglés:

**calendar.freebusy**
```
CODE CELLS is a network of independent physicians in Mexico. Patients book appointments with a physician through our public directory (codecells.mx/directorio). When a physician chooses to connect their Google Calendar, we use calendar.freebusy only to know which time blocks are busy, so that the booking page never offers the patient a slot that overlaps something the physician already has. We only receive busy start/end times; we never read event titles, descriptions or attendees. Busy blocks are used in memory to compute free slots and are not stored.
```

**calendar.events**
```
When a patient books a confirmed appointment with the physician through CODE CELLS, we create one event in the physician's own calendar with the appointment time, the patient's name and phone number (so the physician knows whom they will see). If the appointment is cancelled by the patient or the physician, we delete that same event. We store only the IDs of the events we create, and we never read, modify or delete events that our app did not create. A narrower scope is not sufficient: calendar.freebusy cannot create events, and calendar.events.owned would also work for owned calendars but the physician's primary calendar is where they manage their day.
```
*(Si Google sugiere `calendar.events.owned`, se puede aceptar: el código solo
escribe en el calendario principal del médico. Habría que cambiar una línea
en `lib/google-agenda.js` y la comprobación de permisos.)*

**userinfo.email**
```
Used only to show the physician which Google account is connected.
```

### 2.3 Video de demostración (YouTube "No listado")

Google pide un video que muestre la pantalla de consentimiento real y el uso
de cada permiso. Unos 2–3 minutos, grabado en el celular o con pantalla de
computadora, **sobre codecells.mx en producción** (después del PR del punto 0).
Narración en español con subtítulos en inglés, o directamente en inglés.

Guion:
1. **(0:00)** Abrir `https://www.codecells.mx`, bajar al pie y abrir
   **Privacidad** para mostrar la sección "Google Calendar integration".
2. **(0:20)** En Telegram, con el bot de CODE CELLS, escribir `/conectar`,
   mostrar los mensajes paso a paso y tocar **"Conectar mi agenda de Google"**.
3. **(0:40)** Pantalla de Google: debe verse el **nombre de la app**, y en la
   barra de direcciones el **`client_id`** (Google lo revisa). Elegir la cuenta,
   **marcar las casillas** de calendario y tocar Continuar.
4. **(1:00)** Volver a Telegram: "✅ conecté la agenda… tienes N bloques
   ocupados". **Uso de calendar.freebusy:** abrir Google Calendar y mostrar
   un evento ocupado, por ejemplo lunes 10:00–11:00. Luego abrir la ficha del
   médico en `codecells.mx/directorio` y mostrar que ese lunes **no ofrece**
   10:00 ni 10:30.
5. **(1:40)** **Uso de calendar.events:** agendar una cita de prueba en un
   horario libre; mostrar "Cita confirmada" y luego el **evento creado** en
   Google Calendar a esa hora.
6. **(2:10)** Cancelar la cita desde la liga del paciente y mostrar que
   **el evento desaparece** del calendario.
7. **(2:30)** Mostrar cómo se revoca: `myaccount.google.com/permissions` →
   CODE CELLS → Quitar acceso.

Subir a YouTube como **No listado** y pegar la liga en el formulario.

---

## 3. Enviar

En la consola: **Verificación / "Verification Center"** → **Preparar para la
verificación** → revisar → **Enviar**. Llegan correos al contacto del
desarrollador; **hay que contestarlos en el mismo hilo**. Si piden cambios
del video o de la política, se ajusta y se responde.

## 4. Mientras se verifica

- Todo sigue funcionando con el aviso "no verificada" (el bot ya le explica
  al médico: Configuración avanzada → Ir a CODE CELLS).
- Tope: 100 usuarios nuevos en total con permisos sensibles hasta que se
  apruebe. Para el piloto alcanza.
- La app está "En producción" (no en "Prueba"): los permisos **no** caducan
  cada 7 días.

## Hecho en el código para facilitar la verificación (2026-10-23)

- Permisos mínimos: `calendar.freebusy` + `calendar.events` en lugar de
  `calendar` completo. Las conexiones anteriores con `calendar` siguen valiendo.
- `privacidad.html`: sección de Google reescrita con lo que la app hace hoy,
  resumen en inglés y la frase obligatoria de Limited Use.
- Enlace "Privacidad" en el pie de la página principal.
- El `state` de OAuth va firmado; el permiso nunca sale del servidor.
