# CONTINUAR — recordatorio de sesión

> **Protocolo.** Al decir "continúa", Claude lee este archivo PRIMERO y retoma
> desde "Siguiente paso". Al cerrar cada sesión, Claude lo REESCRIBE (no
> agrega al final): este archivo es el estado actual, no un diario. El
> historial vive en git (`git log`) y en la memoria del proyecto.

**Última actualización:** 2026-10-03 (cierre del día)
**Rama:** `feat/kiosco-antecedentes-go` — 15 commits sobre `main`, **SIN PUSH**
**Base de trabajo:** prueba `appCQ0RdhqFMGxWL5` · producción `app6jyD9pDlTLpknA` (no tocar)

---

## 1. Siguiente paso (empezar aquí)

1. **Push de la rama** — a Claude se lo bloquea el clasificador de permisos;
   correrlo Víctor: `! git push -u origin feat/kiosco-antecedentes-go`
2. **Cerrar los 3 bloqueadores del kiosco** (B1–B3, abajo). Es lo que impide
   llevar el kiosco a producción y lo que no debe quedar debajo de la Fase 2.
3. Después, lo que Víctor priorice de la lista §4 o las entrevistas (§5).

## 2. Hecho — NO repetir

| Tema | Estado | Dónde |
|---|---|---|
| Kiosco: login por `auth-login` + búsqueda por `pacienteBuscado` | ✅ commit `4637af9` | `kiosco.html` |
| Kiosco: captura de antecedentes GO → ANTECEDENTES_OBSTETRICOS (pasa por `autorizarPaciente`, servidor fuerza Paciente/Código/Registrado por) | ✅ `a4ba8c5` | `kiosco.html`, `api/airtable.js`, `test/kiosco-antecedentes-go.test.js` |
| Signos vitales ya no borran `Notas generales` (agrega, lee antes) | ✅ `9269b5a` | `api/nova.js`, `test/kiosco-signos-notas.test.js` |
| 429 de Airtable ya no se disfraza de 403 (502 honesto, sin "Denegado" falso) | ✅ `f998907` | `api/airtable.js` |
| Motor de gráficas movido a `lib/motor-graficas.js` (idéntico byte a byte) | ✅ `3d8897a` | `lib/motor-graficas.js`, `test/motor-graficas.test.js` |
| Estética Visme en el motor (tarjeta blanca, Inter, tooltip, leyenda, responsive, AA) — aprobada por Víctor tal cual, incluido tema oscuro | ✅ `f25862e` | `lib/motor-graficas.js`, `SPEC-ESTETICA-GRAFICAS-VISME.md` |
| BASE_ID por variable de entorno + descongelado local (doble señal) | ✅ `ee8180b` | 6 archivos api/lib, `lib/congelamientoDatosPersonales.js` |
| Telegram: `notas_internas` → "Razonamiento clínico" (campo existe en prod) | ✅ `32d5d63` | `api/telegram-bot.js` |
| Gráficas: reglas de tendencia + split de TA "130/85" | ✅ `8a6c856` | `api/airtable.js` |
| NOVA: labs desde texto pegado (extraer → confirmar, con `autorizarPaciente`) | ✅ `e2cc267` | `api/nova.js` |
| Portal: panel Control prenatal + antecedentes GO + labs por texto + cálculos en lib | ✅ `c0bb15b` | `portal-medico.html`, `control-prenatal.html` |
| `package.json` (buscar-medicos.js usa `@anthropic-ai/sdk` y no había) | ✅ `db957cb` | raíz |
| SPEC Fase 2 (plantillas por especialidad) + SPEC para entrevistas | ✅ `1b80a03`, `7b28b0a` | raíz |
| Airtable prueba: tablas ANTECEDENTES_GENERALES / _CARDIOLOGICOS / _PULMONARES / _UROLOGICOS; campos `Bloques` y `Requiere` en PLANTILLAS_ESPECIALIDAD ("Control prenatal" ya los tiene) | ✅ (no son git) | base de prueba |
| Servidor local para pruebas | ✅ | `scripts/servidor-local.js` |

Pruebas al cierre: **98 tests, 91 pasan, 7 fallan** — las 7 son pruebas
antiguas que esperan escritura y reciben 503 del congelamiento legal. No es
regresión.

## 3. Bloqueadores (antes de fusionar a `main` o abrir el kiosco)

- **B1** — `kiosco_crear_paciente`, `kiosco_guardar_signos`, `kiosco_guardar_historia`
  (`api/nova.js` ~2029–2220) **no revisan sesión ni `autorizarPaciente()`** ni `Es demo`;
  solo validan el formato `CCMED-`. Hoy los tapa el congelamiento en prod.
  Propuesta: que pasen por el mismo camino que antecedentes (`/api/airtable` + token).
- **B2** — `HISTORIA CLÍNICA` del kiosco se guarda **sin autor** (ni médico ni personal).
- **B3** — Paso 2 del kiosco acepta **cualquier** paciente por código exacto y
  manda su registro completo a la tablet (rama `pacienteBuscado` de `pacientes`
  en `api/airtable.js` no revisa propiedad).
- **Producción no tiene** ANTECEDENTES_OBSTETRICOS ni, en CONSULTAS: Edema,
  Proteinuria, Movimientos fetales, Placenta — localización, Placenta — grado,
  Interpretación Doppler. Crearlos antes de fusionar.
- En Vercel, `AIRTABLE_BASE_ID` **no debe existir** o debe ser producción.

## 4. Pendientes (no bloquean)

- Kiosco no carga los antecedentes que ya existen → aviso G/P/C/A falso y riesgo de duplicar.
- Historia del kiosco sin salida en la pregunta 1 (no hay Atrás/Cancelar).
- Fecha de la línea de signos en UTC (después de las 17:00 Mazatlán queda con fecha de mañana).
- Idioma del kiosco persiste en la tablet (`localStorage codecells_lang`) para el siguiente paciente.
- QR del kiosco usa api.qrserver.com (tercero) y apunta a prod.
- `ID Antecedente` vacío en registros del kiosco.
- Tarjeta de antecedentes GO se muestra también a pacientes hombres.
- Duplicación `GO_K_*` (kiosco) vs `GO_TIPOS_*` (portal) → pasar a config compartida (SPEC Fase 2).
- Campo de texto libre `f-ago` en historia del portal = segunda fuente de G/P/C/A.
- 9 endpoints con base de producción fija (lista en `scripts/servidor-local.js`).
- Portal en móvil desborda horizontalmente (cabecera + panel NOVA) — no es de las gráficas.
- 4 registros "Denegado" falsos en ACCESOS_EXPEDIENTE de la base de prueba (de antes del fix 429).
- `Clasificación cie10.pdf` (30 MB) se dejó fuera de git a propósito.

## 5. Decisiones abiertas para Víctor

1. ¿Un especialista ve las consultas de los demás? (recomendación: sí, salvo
   Razonamiento clínico del autor y consultas "sensibles" con consentimiento).
2. ¿FEVI / FEV1 / PSA viven en las tablas de antecedentes o en LAB_VALORES? (recomendación: LAB_VALORES).
3. ¿Cuál es la 2ª especialidad real? (la del siguiente médico afiliado).
4. Entrevistas: llenar `SPEC-PLANTILLAS-LISTA-ENTREVISTAS.md`. Huecos: falta
   `hombre` en `Requiere`; rangos de edad se tocan en 40 y 65; `Tipo de evento`
   libre vs lista cerrada.

**Ya decidido — no volver a discutir:** no hay bypass de autorización en la
base de prueba (se prueba el producto real); G/P/C/A se calcula, nunca se
captura; la estética Visme se queda como está (también en tema oscuro);
plantillas por link explícito `MÉDICOS.Plantillas activas`, no por el texto
de `Especialidad`; el motor sigue siendo un script clásico con la misma firma
`renderGrafica(config)`.

## 6. Cómo retomar el entorno

```bash
node scripts/servidor-local.js          # http://127.0.0.1:3077 (base de prueba)
node --test test/*.test.js              # esperado: 91 pasan, 7 fallan (congelamiento)
```

- Kiosco `/kiosco.html` · Portal `/portal-medico.html` (entrar con `irAPortal()`
  o "Acceder al portal") · App paciente `/mi-nivel.html?codigo=CC-PAC-200001`
- Médico: `CCMED-VIRN01` (Clínico, recooxtSa45MYl7OR)
- Pacientes de prueba (todos de VIRN01, ninguno demo):
  Mariana `CC-PAC-200001` (recW2kzxzUcQnK6nK, G2 P1 C0 A0) ·
  PBA Preeclampsia `CC-PAC-200003` (recAhtolCCnuUgGUm, G1) ·
  QA Automatizado `CC-PAC-9999901` (recxJHYhGX8opQZmN, para escrituras)
- Tablas: ANTECEDENTES_OBSTETRICOS `tblkoqYv4ASLFkzsp` (¡no `tblVOTed5MJSX1Vpy`,
  esa es TEMP!) · PLANTILLAS_ESPECIALIDAD `tbl1cpvSQkzo5r9UA`

## 7. Trampas técnicas ya resueltas (no volver a perder tiempo)

- Usar `127.0.0.1`, no `localhost` (IPv6 se cuelga). La 1ª llamada de cada
  proceso Node a Airtable tarda ~10 s o falla: reintentar.
- `git push` lo bloquea el clasificador → lo corre Víctor con `!`.
- `core.autocrlf=true`: el working tree es CRLF, el repo LF. Para commits
  parciales se usó `git apply --cached --recount` por bloques.
- Chrome controlado en segundo plano pausa animaciones, `requestAnimationFrame`
  y ResizeObserver: verificar con captura (trae la pestaña al frente).
- ResizeObserver sobre un `<svg>` reporta su caja interna, no el ancho en
  pantalla → el motor observa la tarjeta.
- El portal muestra un modal "Instalar en tu celular": cerrar con "Ahora no".
- `curl` en Git Bash de Windows manda mal los acentos; para pruebas con
  campos acentuados usar un script de Node.
