# SPEC — Ingesta automática a LAB_VALORES

**Fecha:** 12 agosto 2026
**Autor:** Dr. Víctor Iván Rodríguez Nava (CCMED-VIRN01)
**Estado:** listo para ejecutar con Claude Code
**Base:** `app6jyD9pDlTLpknA`

---

## 1. Problema

Cuando NOVA procesa un estudio de laboratorio, lo guarda como **texto narrativo + adjunto** en
NOVA LABS (`tblhKp4uE1NdXXqLh`) y ahí termina. **Nunca escribe en LAB_VALORES**
(`tbl6y1ZfsmPPhrlFk`), que es la tabla que alimenta la vista estructurada y el motor de gráficas.

Consecuencia visible: el estudio aparece en la pestaña TODOS pero LABORATORIOS dice
"Este paciente aún no tiene resultados de laboratorio estructurados en este rango."

Los 48 registros de CC-PAC-714638 se crearon **manualmente** en julio 2026. Nunca ha existido
una ruta automática. Esto no es una regresión — es una funcionalidad que falta.

### Lo que NO es el problema

Se descartó durante el análisis (no volver a investigar):

- **No es la fecha.** `fldXzMqyF96HhCFUG` ya almacena la fecha del estudio, no la de captura.
  Verificado: registros de 714638 con fecha 2026-06-21 y 2026-05-18 y `createdTime` 2026-07-25.
- **No es el motor.** `renderGrafica()` ordena correctamente. No tiene datos de [paciente real 635281] que ordenar.
- **No hace falta un campo de fecha de captura.** Airtable ya expone `createdTime` por registro.

---

## 2. Mapa de campos — LAB_VALORES (`tbl6y1ZfsmPPhrlFk`)

Referenciar **siempre por ID**, no por nombre (protege contra renombres en Airtable).

| Field ID | Tipo | Contenido observado | Notas |
|---|---|---|---|
| `fldOCskUJcaJZPo42` | singleLineText | `"Glucosa"` | **Primary. Analito — texto literal del laboratorio. NUNCA sobrescribir (NOM-004).** |
| `fld5rcAgx1Jti8aoN` | singleLineText | `"94"` | Valor como texto (preserva `<`, `>`, `"negativo"`) |
| `fldRNTAVcXemcQ9Ri` | number (prec. 3) | `94` | Valor numérico — lo que grafica |
| `fldMj2f7O87YHXH34` | singleLineText | `"mg/dL"` | Unidad |
| `fldRETxH1BWWlS725` | singleLineText | vacío en muestra | Presunto rango de referencia — **CONFIRMAR** |
| `fldFiixspvZOJvsy1` | singleSelect | `Normal` / `Alto` / `Bajo` / `Indeterminado` | Estado |
| `fldXzMqyF96HhCFUG` | date (ISO) | `2026-06-21` | **Fecha del estudio** (toma de muestra) |
| `fldcPnsLc7QHbkHVg` | singleLineText | `"CC-PAC-714638"` | Código de paciente (denormalizado) |
| `fldcciqoaVr3ZKGdQ` | link → `tblA51aUeYypWQMQV` | `recdoYFUadyXR1i25` | **Parametro** (CATALOGO_PARAMETROS) |
| `fldX2fj9uQl2smDYB` | singleSelect | `Alta` / `Media` / `Requiere revision` | Confianza |
| `fldhxDOtqdsGosB0h` | singleSelect | `Laboratorio` / `Consulta` / `Dictado` / `Paciente` / `Calculado` | Origen del dato |
| `flduQ8A26xO71hZOv` | link → `tblyUcCfueFLJuvIv` | `rec5za2ERYUfzH4J5` | Paciente |
| `fldzypVKZBBQ6GQxz` | link → `tblhKp4uE1NdXXqLh` | `recPnvFbJLjORUtYQ` | Estudio origen en NOVA LABS |
| `fldygDaS9Nif42H5C` | singleSelect | `Basal` / `En tratamiento` / `Seguimiento` / `Sin clasificar` | **Momento** — creado 12 ago 2026 |
| `fld3w8IcuPAeQPyBi` | aiText | error `emptyDependency` | Depende del adjunto. Ignorar en escritura. |

### ⚠️ BLOQUEANTE — dos checkboxes sin identificar

| Field ID | Color / icono | Valor en muestra |
|---|---|---|
| `fldsHApnN6uJv3p1r` | verde, ✓ | `true` |
| `fldq7n3GoSgwgjtLo` | rojo, ✗ | vacío |

Presunción (**no verificada**): uno es "graficable"/"validado" y el otro "fuera de rango".
El MCP devuelve IDs y colores, no nombres.

**No escribir en estos campos hasta confirmar sus nombres en la UI de Airtable.**
Escribirlos al revés puede hacer que el motor grafique lo que no debe u oculte datos válidos.
Si no se confirman a tiempo: dejarlos vacíos. Un registro sin flag es recuperable; uno con
flag invertido es silenciosamente incorrecto.

---

## 3. Reglas inviolables

Estas reglas ya rigen el motor de gráficas y no se negocian:

1. **`Analito` (`fldOCskUJcaJZPo42`) nunca se sobrescribe.** Es el texto literal del médico /
   laboratorio y constituye evidencia bajo NOM-004.
2. **Si `Parametro` (`fldcciqoaVr3ZKGdQ`) está vacío, no se grafica.** El registro existe en
   expediente pero no entra al motor.
3. **Solo Confianza `Alta` o `Media` se grafican.** `Requiere revision` queda fuera.
4. **Preferir gráfica incompleta antes que gráfica incorrecta.**
5. **Los links se pueblan por API con record IDs.** Nunca por importación CSV — Airtable parsea
   los campos link **por coma, no por punto y coma**, y un analito con coma en el nombre rompe
   el vínculo en silencio.
6. **`ARRAYJOIN()` sobre un campo link devuelve el valor del campo primario de la tabla
   vinculada, no el record ID.** No usar `FIND(recId, ARRAYJOIN({Link}))` — nunca hace match.
   Usar `OR(RECORD_ID()="rec...", ...)`.

---

## 4. Fase A — Backfill de [paciente real 635281] (CC-PAC-635281)

### Datos del estudio

- **Fecha del estudio:** `2026-06-11` (11 junio 2026)
- **Valoración inicial de [paciente real 635281]:** 13 junio 2026 → el estudio es **previo al tratamiento**
- **Momento:** `Basal` para los ~45 registros
- **Origen del dato:** `Laboratorio`
- **Paciente:** CC-PAC-635281 — obtener record ID de `tblyUcCfueFLJuvIv` por API
- **Estudio origen:** registro de NOVA LABS fechado 11 ago 2026 (fecha de captura) — obtener su
  record ID y vincular en `fldzypVKZBBQ6GQxz`

> La fecha de captura (11 ago) y la del estudio (11 jun) difieren en dos meses. Es correcto y
> esperado: el paciente llegó con estudios previos. **No "corregir" esta diferencia.**

### Analitos a cargar

Química 45 elementos, perfil lipídico, función hepática, hierro, inmunoglobulinas, BH,
hormonas y EGO. Fuente: el texto narrativo del registro en NOVA LABS.

Marcar `Alto` / `Bajo` en `fldFiixspvZOJvsy1` según los flags que el propio texto ya declara
en su bloque "Fuera de rango".

### Clasificación de Parametro

**Catalogar en CATALOGO_PARAMETROS antes del backfill** (tienen valor de seguimiento
longitudinal en protocolo metabólico):

- Índice aterogénico
- Colesterol no-HDL
- sdLDL
- VPM (volumen plaquetario medio)
- RDW-SD

**Cargar sin `Parametro`** (no se repiten en seguimiento; quedan en expediente, no grafican):

- Fosfolípidos
- Lípidos totales
- UIBC
- Captación de hierro
- Inmunoglobulinas (IgG, IgA, IgM) — normales y no seriadas

**Confianza:**
- `Alta` — match exacto contra catálogo
- `Media` — match por sinónimo o abreviatura (ej. "TFGe" → tasa de filtrado glomerular)
- Sin `Parametro` → dejar Confianza vacía, no marcar `Requiere revision` (no requiere revisión;
  simplemente no está catalogado)

### Lote

`create_records_for_table` acepta **máximo 50 registros por request**. Los ~45 caben en uno,
pero validar el conteo real antes de enviar.

---

## 5. Fase B — Endpoint de ingesta

Objetivo: que esto no vuelva a pasar con el siguiente paciente que llegue con estudios viejos.

### Comportamiento requerido

1. Al procesar un estudio, NOVA extrae los analitos **además** de generar el resumen narrativo.
2. **Pregunta explícitamente la fecha del estudio.** No asumir la fecha de hoy. Es el caso
   frecuente, no la excepción: los pacientes llegan con laboratorios de meses atrás y ese es
   justamente el valor basal.
3. **Pregunta el Momento** (Basal / En tratamiento / Seguimiento), o lo infiere comparando la
   fecha del estudio contra la fecha de inicio de tratamiento del paciente — con confirmación
   del médico, nunca silencioso.
4. Crea los registros en LAB_VALORES vinculados al paciente y al estudio de NOVA LABS.
5. Los analitos sin match en catálogo se cargan igual, sin `Parametro`.

### Ambigüedad de formato de fecha

`11/06/2026` es ambiguo entre formato MX (11 junio) y US (6 noviembre). En este caso se resolvió
por contexto (6 nov 2026 sería fecha futura, y la valoración inicial fue el 13 jun).

El endpoint **no debe resolver esto por heurística**. Debe presentar la fecha interpretada al
médico para confirmación antes de guardar. Un basal con fecha equivocada corrompe toda la serie
temporal del protocolo.

---

## 6. Orden de ejecución

1. **Confirmar en Airtable** los nombres de `fldsHApnN6uJv3p1r` y `fldq7n3GoSgwgjtLo` ← bloqueante
2. Confirmar que `fldRETxH1BWWlS725` es el rango de referencia
3. Agregar los 5 parámetros nuevos a CATALOGO_PARAMETROS (`tblA51aUeYypWQMQV`)
4. Backfill de [paciente real 635281] — Fase A
5. Verificar en producción: pestaña LABORATORIOS de CC-PAC-635281 debe mostrar los valores;
   probar una gráfica (glucosa o perfil lipídico)
6. Endpoint de ingesta — Fase B

---

## 7. Notas de retención

- **CC-PAC-714638** — no borrar. Único caso de verificación del motor; NOM-004 exige 5 años.
- **CC-PAC-635281 ([paciente real 635281])** — caso control de la curva de peso. Su línea temporal debe quedar
  limpia. Familiar con consentimiento.

---

## 8. Pendiente clínico (fuera del alcance técnico)

El estudio basal de [paciente real 635281] reporta **cortisol sérico 0.7 µg/dL en horario matutino, verificado por
duplicado por el laboratorio** (referencia 6.02–18.4). Está muy por debajo del piso de
referencia, no marginalmente fuera de rango.

Se anota aquí solo para que no se pierda entre el trabajo de datos: la carga a LAB_VALORES lo
hace visible y graficable, pero no responde si hubo seguimiento desde junio.
