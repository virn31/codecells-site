# INSTRUCCIÓN PARA CLAUDE CODE — Sesión 2026-08-17

Repo: `virn31/codecells-site` · Base: `main` (commit actual `09f6a88`)
Rama de trabajo: `fix/nova-idioma-y-consentimiento`

**NO COMMITEAR HASTA QUE VICTOR VERIFIQUE.** Al terminar, entrega los cuatro
entregables del final de este documento y detente.

---

## ⚠️ CORRECCIÓN (agregada al ejecutar este documento, 2026-08-17)

El diagnóstico de la sección "Contexto del problema" de abajo es **falso** para
el estado real del código en ese momento. Se dejó constancia aquí para que no
vuelva a inducir el error en otra sesión.

**Lo que el documento asumía:** que `buildNovaSystem(idioma)` ya existía y
funcionaba, y que el único problema era la contaminación del primer turno por
`window.novaActivar`.

**Lo que realmente había:** `buildNovaSystem` no existe en ningún archivo del
repo. `index.html` nunca mandaba `idioma` en el body a `/api/nova`. El
`NOVA_SYSTEM` estático que armaba `index.html` era código muerto — `api/nova.js`
(línea ~3152 de ese momento) descarta a propósito el `system` que manda el
cliente, como protección contra inyección de prompt, y arma el suyo propio con
`buildSystemPrompt('publico')`. Esa función no tenía ninguna instrucción de
idioma. Es decir: **no existía ningún mecanismo, ni cliente ni servidor, que le
dijera a NOVA en qué idioma responder.** Aplicar solo CORTE 1-3 habría dejado a
NOVA respondiendo en español en EN/PT igual, porque nunca se le instruyó lo
contrario — el entregable 3 de este documento (probar los tres idiomas) habría
fallado sin excepción.

**Lo que se hizo en esta sesión, además de CORTE 1-3:**
- El cliente ahora manda `idioma` (de `getLanguage()`, `lib/i18n.js`) — nunca
  prosa — en el body a `/api/nova`, tanto para el chat como para
  `registrar_lead`.
- El servidor valida ese valor contra una whitelist cerrada (`idiomaValido()`,
  `es`/`en`/`pt` — cualquier otro valor cae a `es`) y lo pasa como parámetro a
  `buildSystemPrompt`, que antepone una instrucción explícita de idioma al
  prompt del modo público.
- El `system` que manda el cliente se sigue descartando exactamente igual que
  antes — esa protección no se tocó.
- `NOVA_SYSTEM` (el prompt estático muerto de `index.html`) se eliminó, en
  commit separado del fix de idioma.
- CORTE 4 y CORTE 5 de este documento ya estaban superados por una
  implementación más completa (`registrar_lead` a LEADS, commit `93c6ab7`,
  previo a esta sesión) — no se rehicieron tal cual están escritos abajo. Sí se
  agregó el campo `Idioma` a ese registro, que era lo único pendiente de CORTE 5.

**Lo que sigue sin confirmarse:** que el modelo obedece la instrucción de
idioma ahora que el contexto ya no la contradice — eso solo lo confirma una
prueba real en el preview de Vercel (ES/EN/PT), no la inspección de código ni
tests que interceptan la llamada a Anthropic.

---

## Contexto del problema (sección original — diagnóstico incorrecto, ver
## corrección arriba antes de confiar en esto)

El selector ES/EN/PT funciona: el cliente manda `idioma` correcto y
`buildNovaSystem(idioma)` instruye a NOVA a responder en ese idioma.

Pero NOVA responde en español de todos modos. Causa raíz: `window.novaActivar`
inyecta como PRIMER TURNO DE USUARIO una frase escrita en español duro
(`"Hola, me llamo Iván. Hice la evaluación..."`). El modelo recibe dos señales
contradictorias — la instrucción del system prompt y la evidencia del idioma en
que el usuario "acaba de escribir" — y le hace caso a la segunda.

Ese mensaje además se renderiza en pantalla, así que el paciente ve palabras que
nunca escribió. Es contexto disfrazado de diálogo.

**Solución:** convertirlo en un bloque de datos sin idioma, y no renderizarlo.

---

## CORTE 1 — `index.html` · `window.novaActivar` (línea ~2107)

### Código actual

```js
  window.novaActivar = function(nombre, sistemaTexto) {
    // Intentar recuperar nombre y teléfono del formulario si no vienen en los parámetros
    var nombreEl = document.getElementById('cf-nombre');
    var waEl     = document.getElementById('cf-wa');
    var nombreFinal = (nombre && nombre !== 'amigo') ? nombre : (nombreEl ? nombreEl.value.trim() : '');
    var telefono = waEl ? waEl.value.trim() : '';

    var msg = 'Hola';
    if (nombreFinal) msg += ', me llamo ' + nombreFinal;
    msg += '. Hice la evaluación CODE CELLS™ y mi sistema prioritario es ' + sistemaTexto + '.';
    if (telefono) msg += ' Mi WhatsApp es ' + telefono + '.';
    msg += ' Me gustaría que un especialista revise mi mapa biológico.';
    novaOpen(msg);
  };
```

### Reemplazar por

```js
  window.novaActivar = function(nombre, sistemaTexto) {
    // Intentar recuperar nombre y teléfono del formulario si no vienen en los parámetros
    var nombreEl = document.getElementById('cf-nombre');
    var waEl     = document.getElementById('cf-wa');
    var nombreFinal = (nombre && nombre !== 'amigo') ? nombre : (nombreEl ? nombreEl.value.trim() : '');
    var telefono = waEl ? waEl.value.trim() : '';

    // Guardamos el nombre en el closure: ya no se puede reparsear del historial
    // porque el primer turno dejó de ser una frase en español (ver CORTE 3).
    novaNombrePaciente = nombreFinal;

    // Bloque de DATOS, no una frase. Sin idioma, sin saludo, sin "me llamo".
    // Razón: cualquier prosa aquí contradice la instrucción de idioma del
    // system prompt y NOVA responde en el idioma de este texto en vez del
    // que eligió el paciente. Los datos no tienen idioma.
    var partes = [];
    if (nombreFinal)  partes.push('nombre=' + nombreFinal);
    if (sistemaTexto) partes.push('sistema_prioritario=' + sistemaTexto);
    if (telefono)     partes.push('whatsapp=' + telefono);
    var msg = '[CONTEXTO_TEST] ' + partes.join(' | ');

    novaOpen(msg);
  };
```

### Declarar la variable del closure

Junto a las otras variables de estado (línea ~1911, donde están `novaHistory`,
`novaIsOpen`, `novaIsLoading`, `novaInitMsg`), agregar:

```js
  var novaNombrePaciente = '';
```

---

## CORTE 2 — `index.html` · `novaOpen` (línea ~1940)

Quitar el render del mensaje inicial. **El `push` al historial se queda** — la
API necesita que el primer turno sea `user`, y ahí viajan los datos del test.

### Código actual

```js
      novaHistory.push({ role: 'user', content: initMessage });
      renderMessage(initMessage, 'user');
      novaRespond();
```

### Reemplazar por

```js
      novaHistory.push({ role: 'user', content: initMessage });
      // No se renderiza: es contexto del test, no un mensaje que el paciente escribió.
      novaRespond();
```

**Verificar en el preview:** que `showTyping()` aparezca de inmediato al abrir.
Si el chat parpadea vacío antes del indicador, reportarlo — habría que adelantar
`showTyping()` a `novaOpen`. No lo cambies sin confirmar que pasa.

---

## CORTE 3 — `index.html` · extracción del nombre (línea ~1979)

Este corte es OBLIGATORIO si se hace el CORTE 1: el regex busca una frase en
español que ya no existe. Alimenta el botón "Continuar en WhatsApp" que aparece
DENTRO del chat, y que **se conserva**.

### Código actual

```js
      // Buscar nombre en el historial si no está en el formulario
      if (!nombre && novaHistory.length > 0) {
        var primerMsg = novaHistory[0] ? (novaHistory[0].content || '') : '';
        var mNombre = primerMsg.match(/me llamo ([^.]+)/i);
        if (mNombre) nombre = mNombre[1].trim();
      }
```

### Reemplazar por

```js
      // El nombre viene del closure, no del historial: el primer turno ya no
      // es una frase en español parseable.
      if (!nombre && novaNombrePaciente) nombre = novaNombrePaciente;
```

---

> **SUPERADO antes de esta sesión.** CORTE 4 y CORTE 5 (abajo) describen un
> estado del código que ya no existía cuando se ejecutó este documento — el
> commit `93c6ab7` (previo a esta sesión) ya había implementado el checkbox de
> consentimiento y `registrar_lead` de forma más completa que lo descrito aquí,
> incluyendo bloqueo real de envío y pausa server-side mientras el aviso de
> privacidad siga siendo placeholder. `airtable_create_lead` (CORTE 5) quedó
> como código muerto, sin ningún caller. Ver la corrección al inicio del
> documento. Se dejan estas secciones tal cual por valor histórico, no como
> instrucciones vigentes.

## CORTE 4 — `index.html` · casilla de aviso de privacidad

En el formulario del test, junto a `cf-nombre` y `cf-wa`, antes del botón de
envío. Localiza el bloque y agrega:

```html
  <label class="cf-consent">
    <input type="checkbox" id="cf-consent" />
    <span>He leído y acepto el
      <a href="/aviso-privacidad.html" target="_blank" rel="noopener">aviso de privacidad</a>.
    </span>
  </label>
```

**SIN `checked`.** Vacía por defecto — decisión explícita de Victor: el
consentimiento debe ser un acto, no un default.

Y bloquear el envío: en el handler del botón, antes de cualquier otra cosa,

```js
    var consentEl = document.getElementById('cf-consent');
    if (!consentEl || !consentEl.checked) {
      // mostrar el aviso con el mismo mecanismo de error que ya usa el formulario
      return;
    }
```

Usa el estilo y el mecanismo de error que ya existan en ese formulario. No
inventes uno nuevo.

---

## CORTE 5 — `api/nova.js` · `airtable_create_lead` (línea ~607)

Hoy escribe a **PACIENTES** (`tblyUcCfueFLJuvIv`), mezclando leads comerciales
con expedientes clínicos. Debe escribir a **LEADS**.

### Tabla destino

`tblfX4f6Bq6OXsvs2` — misma base `app6jyD9pDlTLpknA`

### Mapeo de campos (IDs verificados contra el esquema)

| Campo | ID | Origen |
|---|---|---|
| Nombre | `fldytYe5kaBNFTiKR` | `req.body.nombre` |
| WhatsApp | `fldR99V4RkZeaAT4Q` | `req.body.telefono` |
| Email | `fldjjm5TlhtlK6msm` | `req.body.email` (si viene) |
| Origen | `fldNNr1VyFSs6RedB` | `Test biológico` / `Directorio` / `Otro` |
| Score ENERGY | `fldmprR0XtD8025PQ` | número |
| Score REPAIR | `fldaCwjq1Y9NcAuEf` | número |
| Score BALANCE | `fldgafNWJhOVd75NU` | número |
| Score NEURO | `fldY3ljE7PRMD8Fk8` | número |
| Score REGEN | `fldQNEj0OTXg3TV3P` | número |
| Sistema prioritario | `fldas8m7JPPMBspE0` | texto |
| Consentimiento | `fldlNqpVcefDLl8uv` | checkbox — `true` sólo si el cliente lo manda |
| Fecha de consentimiento | `fld7TaQVXOwG4nrrw` | `new Date().toISOString()` — **servidor, no cliente** |
| Versión del aviso | `fld1VEX4Dd5D5lhid` | constante, ver abajo |
| Estado | `fldzmnjLZIIfEsX90` | `Nuevo` |
| Fecha de creación | `fldqWlMNAaS6w0Na4` | `new Date().toISOString()` |
| Sexo | `fldnFrSrESa8pIraL` | `Femenino`/`Masculino`/`Prefiere no decir` |
| Fecha de nacimiento | `fldCCDTW2iKonMzpQ` | `YYYY-MM-DD` |
| País | `fldrovWZjjZWRV4Ak` | `México`/`Estados Unidos`/`Brasil`/`Otro` |
| Idioma | `fldw1WnA7sJYVKeM1` | `es`/`en`/`pt` |
| Notas generales | `fldJ9gxdIYzwnTvKw` | texto |
| Convertido a paciente | `fldp83rHA2egzyJaj` | **NO ESCRIBIR.** Sólo se llena en la promoción manual. |

### Reglas no negociables

1. **`Fecha de consentimiento` la escribe el servidor**, nunca el cliente. Un
   timestamp que viene del navegador no es constancia de nada.
2. **`Consentimiento` sólo en `true` si el cliente efectivamente lo mandó.**
   No lo pongas por defecto. Vacío = no consta, y eso es información válida.
3. **`Versión del aviso`:** usa una constante en el módulo, p.ej.
   `const VERSION_AVISO = '2026-08-v1';`. Sirve para saber a qué texto dio su
   consentimiento cada persona si el aviso cambia. Confirma el valor con Victor.
4. **`Convertido a paciente` nunca se escribe desde aquí.** La promoción a
   expediente es manual (kiosco o consulta médica). Ningún proceso automático
   crea expedientes — es exactamente el patrón que motivó el hotfix
   `hotfix/pausa-registro-publico-paciente`.
5. **Idioma:** el cliente ya manda `idioma` en el body para NOVA. Reutilízalo.
   Se fija al crear y **nunca se modifica ni se traduce**.
6. **Mantén `sanitize()`** tal como está en el handler actual.

### Cliente

`index.html` debe mandar en el body de `airtable_create_lead`: `consentimiento`
(bool del checkbox) e `idioma` (de `getLanguage()`). Los scores y demás campos
sólo si ya existen en el flujo — **no inventes captura que no existe**.

---

## LO QUE **NO** ENTRA EN ESTA SESIÓN

No lo toques aunque lo veas:

- **El `setTimeout` que abre WhatsApp** (`index.html`, ~línea 2141, dentro del
  patch que intercepta `window.open`). Es hoy la única notificación de leads
  nuevos que le llega a Victor. `enviarAlertaMedico` (Telegram) sólo se dispara
  desde `SOLICITUDES_CITA`, no desde leads. Se quita cuando exista el reemplazo.
- Ocultar el selector `#i18n-switch` mientras NOVA está abierta.
- Ampliar el formulario para capturar sexo, fecha de nacimiento, país, ciudad.
- Migrar los registros de PACIENTES que en realidad son leads.
- Derivación automática al médico más cercano.

---

## ENTREGABLES — obligatorios antes de cualquier commit

1. **Diff completo** de los dos archivos tocados.
2. **Confirmación explícita de que todos los call sites quedaron cubiertos.**
   En particular: los DOS que llaman a `novaActivar` (`fallbackToNova` en línea
   ~1346 y el patch de `window.open` en ~2140), y cualquier otro uso de
   `novaHistory[0]`.
3. **Salida cruda de las pruebas.** Sin resumir. Debe incluir la prueba manual
   en el preview con los tres idiomas: abrir el test en ES, EN y PT y confirmar
   que NOVA responde en el idioma correspondiente.
4. **Qué NO quedó cubierto.** Explícito, con motivo.

**No commitear. Reportar y esperar.**
