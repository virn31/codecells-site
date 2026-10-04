# SPEC — Paciente único con identidad fuerte (fusión VIP)

**Estado:** borrador para revisión de Víctor · 2026-10-04
**Rama:** `feat/paciente-unico` (sale de `chore/ambiente-preview`)
**Decisiones ya tomadas (no re-litigar):** VIP se fusiona con el paciente normal — una tabla, una app, la red es para todos (2026-10-04). No hay pacientes reales: los 7 registros VIP son de prueba, no se migran.

---

## 1. Problema

1. **El código del paciente es una contraseña adivinable.** `api/auth-login.js` da sesión de paciente con solo el código, y `mi-nivel.html` entra sola con `?codigo=` de la URL. Los códigos son secuenciales (`lib/codigos.js`). Quien adivine `CC-PAC-000123` lee ese expediente y, desde el 2026-10-04, puede generar una llave y entregárselo a un médico. La llave hereda esta debilidad.
2. **Hay dos mundos de paciente.** VIP (`PACIENTES_VIP`, `portal-vip.html`, códigos DZW) duplica el camino del paciente normal. Su seguridad es solo de navegador: el PIN se compara contra `localStorage`, `?codigo=DZW-…` abre el panel sin PIN, la liga de activación nunca vence, y con un código DZW sin sesión se lee y modifica cualquier campo del registro.
3. **Lo bueno de VIP no lo tiene nadie más:** la experiencia de activación con liga + PIN, el anillo de estado con los 5 sistemas, el plan de 90 días, "Invita a un amigo", instalación como app.

## 2. Principios

- **El código `CC-PAC-` es un identificador, nunca una credencial.** Puede aparecer en recetas, QR, capturas.
- **La credencial se verifica en el servidor.** Nada de seguridad en `localStorage`.
- **La credencial no vive en PACIENTES.** El proxy (`/api/airtable`) y `auth-login` devuelven el registro completo de PACIENTES a médicos y pacientes; un hash de PIN ahí se filtraría. Va en una tabla fuera de `TABLAS_PERMITIDAS`, que solo toca el servidor.
- **Un fallo se ve como fallo** (CLAUDE.md §6): Airtable caído ≠ PIN incorrecto ≠ cuenta bloqueada.

## 3. Identidad

### 3.1 Tabla nueva `CREDENCIALES_PACIENTE` (una fila por paciente)

| Campo | Tipo | Notas |
|---|---|---|
| Código de paciente ref | texto | match exacto |
| Paciente | link PACIENTES | |
| PIN (hash) | texto | `scrypt` con sal de 16 bytes, formato `scrypt$N$r$p$sal$hash` |
| Cuenta activada | checkbox | |
| Fecha activación | fecha-hora | |
| Intentos fallidos | número | se reinicia al acertar |
| Bloqueado hasta | fecha-hora | |
| Liga (hash) | texto | HMAC de la liga vigente; una sola vigente por paciente |
| Liga vence | fecha-hora | |
| Liga emitida por | link MÉDICOS | quién la generó |

Referenciada por **nombre** (como `LLAVES_ACCESO`), nunca en `TABLAS_PERMITIDAS`.

### 3.2 Activación (liga de un solo uso)

1. **Quién la emite:** un médico con acceso de escritura al paciente (principal, vinculado o interconsulta con escritura), desde el portal o desde el kiosco. Pasa por `autorizarPaciente(..., {requiereEscritura:true})` + `Tipo de acceso=Clinico`.
2. **Qué es:** 32 bytes aleatorios (`crypto.randomBytes`), en base64url. Se guarda solo su HMAC. Emitir una nueva invalida la anterior.
3. **Vence:** 72 h *(D1)*.
4. **Cómo llega al paciente:**
   - Kiosco: la pantalla final muestra un QR con la liga. Reemplaza el QR actual a `mi-nivel.html?codigo=`.
   - Portal: botón "Enviar acceso" → abre WhatsApp con el mensaje armado (`wa.me`). El médico lo manda; el sistema no envía mensajes por su cuenta.
5. **Uso:** `mi-nivel.html?activar=<liga>` → el servidor verifica hash, vencimiento y que no se haya usado → el paciente crea su PIN (dos veces) → se guarda el hash, se marca la liga como usada (se borra su hash), `Cuenta activada = true` → se emite la sesión.
6. **Recuperación (olvidó el PIN):** su médico o el kiosco emiten una liga nueva; al usarla, el paciente crea un PIN nuevo. Sin médico no hay recuperación en esta fase *(D6)*.

### 3.3 PIN

- 6 dígitos *(D2)*. Se rechazan los triviales (`000000`, `123456`, `111111`…, secuencias).
- Verificación en el servidor con comparación de tiempo constante.
- **Bloqueo:** 5 fallos → bloqueado 15 min; 10 fallos acumulados → bloqueado hasta nueva liga. El contador está en `CREDENCIALES_PACIENTE`, no en el navegador.
- Mensajes: "PIN incorrecto" / "Cuenta bloqueada por intentos, intenta en N min" / "No pudimos verificar ahora (Airtable)" — los tres distintos.

### 3.4 Login

- `api/auth-login.js`, `tipo:'paciente'` exige `codigo` + `pin`. Sin cuenta activada → 401 "Pide a tu médico tu enlace de activación". El login solo con código desaparece.
- `mi-nivel.html`: el teléfono recuerda el código (no el PIN) y muestra "Hola, Mariana" + teclado de PIN, igual que VIP hoy. `?codigo=` en la URL ya no da sesión: solo rellena el código.
- Sesión: 24 h; el PIN se pide al abrir la app si la sesión venció *(D3)*.
- **Demos sin cambio:** códigos demo siguen dando sesión `tipo:'demo'` de solo lectura (0.5 h), sin PIN. Son ficticios y aparecen en presentaciones.
- Bitácora `ACCESOS_EXPEDIENTE`: activación, login fallido, bloqueo.

### 3.5 Lo que se cierra de paso

- `mi-nivel.html?codigo=CCMED-…` (lista maestra con candado solo en el navegador) → se retira.
- La llave de entrega (`paciente_generar_llave`) ya exige sesión de paciente; con esto esa sesión por fin prueba que es el paciente.

## 4. Una sola app (`mi-nivel.html`)

Se trae de `portal-vip.html` a `mi-nivel.html`, para todos:

| Viene de VIP | Fuente de datos en el modelo único |
|---|---|
| Anillo "Estado general" + barras de los 5 sistemas | Tabla nueva `EVALUACIONES_BIOLOGICAS` (§5), la más reciente |
| Plan de 90 días (día X de 90) | `Protocolo actual` + campo nuevo `Fecha inicio protocolo` en PACIENTES |
| Equipo / especialista | `Médico_principal` + vinculados |
| Invita a un amigo | Sistema único de referidos (§6) |
| Perfil, cerrar sesión, instalar como app | igual |

Se queda lo que ya tiene `mi-nivel`: laboratorios, citas, NOVA con herramientas, "Compartir con un médico".

NOVA: lo "exclusivo del nivel VIP" (recordatorios, invitar amigos, prioridad alta en citas) pasa a ser para todos; se quita el texto del prompt que lo presenta como exclusivo. `Es VIP (DEZAWA)` deja de existir como nivel. DEZAWA sigue existiendo como **protocolo** (opción de tratamiento), no como tipo de cuenta.

## 5. Base para la reevaluación: `EVALUACIONES_BIOLOGICAS`

Una fila por evaluación del Biological Map: Paciente (link), Código ref, Fecha, Score ENERGY/REPAIR/BALANCE/NEURO/REGEN, Origen (kiosco / consulta / app), Versión del cuestionario, Registrado por. El anillo muestra la última; la trayectoria (punto 4 del plan: reevaluación longitudinal) sale de todas. **Solo se escriben desde flujos con sesión.** El test público sigue sin crear expedientes hasta resolver el consentimiento (pausado desde 2026-08-15).

## 6. Referidos: un solo sistema

Hoy hay dos (`temp` con códigos `INV-` desde `portal-vip.html`, y `REFERIDOS_VIP` desde NOVA). Queda uno, `REFERIDOS` (renombrar `REFERIDOS_VIP`), escrito solo por el servidor con sesión de paciente. Se retira la escritura pública a `temp` para invitaciones de paciente.

## 7. Lo que se retira

`portal-vip.html`, `dezawavip.html`, `api/vip-activar.js`, `sw-vip.js`, `manifest-vip.json`; `tipo:'vip'` en `auth-login`/`airtable`/`nova`; `pacientes_vip` en `TABLAS_PERMITIDAS`, `CAMPO_DUENIO` y credenciales pre-auth; códigos `DZW-`/`SETUP-`; la herramienta de NOVA `autorizar_invitacion_dzw`. Las URLs viejas (`/portal-vip.html`, `/dezawavip.html`) redirigen a `/mi-nivel.html` en `vercel.json`. Las entradas de marketing que apuntan a `dezawavip.html?demo=1` (index, regene-alianza, capacitación) pasan al test público. La tabla `PACIENTES_VIP` se archiva (se renombra, no se borra) *(D5)*.

## 8. Fases (cada una en su commit, probada en Preview con el Dr. Galván)

1. **F1 Identidad:** `CREDENCIALES_PACIENTE`, emitir liga (portal + kiosco), activar, PIN, login con PIN, bloqueo, retiro del login solo-código. Pruebas: liga vencida/usada/ajena, PIN trivial, bloqueo 5/10, fallo de Airtable ≠ PIN incorrecto, demo sin cambio, médico sin escritura no emite liga.
2. **F2 App única:** `EVALUACIONES_BIOLOGICAS`, anillo + 5 sistemas, plan 90 días, referidos únicos, NOVA sin "exclusivo VIP".
3. **F3 Retiro VIP:** borrar archivos y rutas, redirecciones, archivar tabla, actualizar CLAUDE.md y README.

Antes de producción: crear en la base de producción `CREDENCIALES_PACIENTE`, `EVALUACIONES_BIOLOGICAS`, `Fecha inicio protocolo`, más lo ya pendiente (`LLAVES_ACCESO`, `VINCULACIONES`, `Registrado por` en HISTORIA CLÍNICA, `ANTECEDENTES_OBSTETRICOS`, campos prenatales en CONSULTAS).

## 9. Decisiones para Víctor

| # | Pregunta | Recomendación |
|---|---|---|
| D1 | ¿Cuánto vive la liga de activación? | 72 h |
| D2 | ¿PIN de 4 o 6 dígitos? | 6 (4 dígitos = 10 000 combinaciones) |
| D3 | ¿Cada cuánto pide PIN? | Al abrir la app si la sesión (24 h) venció |
| D4 | ¿Quién emite ligas? | Médico con escritura al paciente (principal, vinculado o interconsulta con escritura) y el kiosco |
| D5 | ¿Tabla `PACIENTES_VIP`? | Archivar (renombrar), no borrar |
| D6 | ¿Recuperación sin médico (código por WhatsApp)? | Después; en F1 solo vía médico/kiosco |
