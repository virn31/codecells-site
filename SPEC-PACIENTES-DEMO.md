# SPEC — Pacientes demo por especialidad

**Fecha:** 12 agosto 2026
**Autor:** Dr. Víctor Iván Rodríguez Nava (CCMED-VIRN01)
**Base:** `app6jyD9pDlTLpknA`
**Depende de:** `SPEC-MOTOR-GRAFICAS.md`, `SPEC-INGESTA-LAB-VALORES.md`
**Tablas:** PACIENTES `tblyUcCfueFLJuvIv` · LAB_VALORES `tbl6y1ZfsmPPhrlFk` · PLANTILLAS_ESPECIALIDAD `tbl1cpvSQkzo5r9UA`

---

## 1. Objetivo

Un expediente demo por plantilla de especialidad, visible para **cualquier médico afiliado**,
en **solo lectura**, con series temporales suficientes para que el motor de gráficas rinda algo
real.

**No objetivo:** práctica con escritura. Eso es trabajo de CC-PAC-DEMO01 y requiere copia
privada por médico, que es un mecanismo distinto y no está en este alcance.

**Sin cron de reset.** Solo lectura forzada en backend y cron de reset son mecanismos
alternativos, no complementarios. Tener ambos significa que las escrituras sí aterrizan y se
quedan hasta medianoche.

---

## 2. Cobertura

Las 8 plantillas existentes y su demo asignado:

| Orden | Plantilla | Especialidad | Params | Demo | Estado |
|---|---|---|---|---|---|
| 1 | Metabólico / Endocrinología | Endocrinología | 16 | CC-PAC-990001 | **reconvertir** |
| 2 | Nutrición / Bariatría | Nutriología | 11 | CC-PAC-DEMO03 | crear |
| 3 | Cardiología | Cardiología | 12 | CC-PAC-DEMO04 | crear |
| 4 | Nefrología | Nefrología | 9 | CC-PAC-DEMO05 | crear |
| 5 | Hepatología / Gastroenterología | Gastroenterología | 9 | CC-PAC-DEMO06 | crear |
| 6 | Control prenatal | Ginecología y Obstetricia | 8 | CC-PAC-990002 | **reconvertir** |
| 7 | Medicina interna / general | Medicina Interna | 18 | CC-PAC-DEMO07 | crear |
| 8 | Signos vitales básicos | Todas | 7 | — | no requiere |

La plantilla 8 es base mínima que aplica a cualquier consulta: se ejercita en los otros siete,
no necesita expediente propio.

**Total: 7 demos. Dos ya existen — no borrarlos.** CC-PAC-990001 (18 registros, 3 fechas) y
CC-PAC-990002 (22 registros, 6 controles SDG 12–36) son exactamente el contenido de un demo.
Reclasificarlos cuesta minutos; rehacerlos repite el backfill manual.

### Pacientes que NO son demo — no tocar

| Código | Motivo |
|---|---|
| CC-PAC-635281 ([paciente real 635281]) | Real. Familiar con consentimiento. Caso control de la curva de peso. |
| CC-PAC-714638 | Real. Único caso de verificación del motor. NOM-004, retención 5 años. |
| CC-PAC-000006 ([paciente real 000006]) | Real. |

---

## 3. Segregación — campo `Es demo`

Checkbox nuevo en PACIENTES `tblyUcCfueFLJuvIv`.

**No es cosmético.** Debe excluir el expediente de:

- Conteos, estadísticas y cualquier tablero de actividad
- Exportes y respaldos entregables
- Auditoría NOM-004 (`completitud_expediente` no debe reportar sobre ellos)
- **Recetas digitales** — una receta con cédula profesional y folio emitida sobre un paciente
  ficticio es un problema regulatorio, no una molestia de datos
- Google Calendar (`lib/google-calendar.js`) — nada de eventos por pacientes inexistentes
- Alertas de Telegram
- Cualquier reporte que llegue a Pavel o a un tercero

### `Es demo` no es escribible por el médico

Excluir el campo del whitelist de escritura para tokens CCMED-. Si un médico puede marcar
`Es demo` sobre su propio paciente, expone un expediente real a toda la red con un clic.
Solo se marca por API con token de administrador.

---

## 4. Autorización — `api/airtable.js`

### 4.1 Lectura

Al scoping actual por médico se agrega la excepción:

```
OR({Es demo} = 1, <scoping actual del médico>)
```

**La condición es `{Es demo} = 1`, nunca "sin médico asignado".** Lo segundo abre cualquier
paciente huérfano por error de captura, y es la misma forma del bug del 11 de agosto: token
autenticado cayendo a un handler sin whitelist.

### 4.2 Escritura — el bloqueo va por paciente destino, no por tabla

Bloquear PATCH sobre PACIENTES no basta. Un médico puede crear un registro en CONSULTAS,
LAB_VALORES, HISTORIA o RECETAS **vinculado** a un paciente demo y contaminarlo igual.

La guarda tiene que resolver el paciente referenciado en el payload y devolver 403 si es demo.
Aplica a toda escritura, en cualquier tabla, que apunte a un expediente demo.

Recordatorio del bug recurrente: `ARRAYJOIN()` sobre un campo link devuelve el valor del campo
primario, no el record ID. Para resolver el paciente destino usar record IDs crudos y
`OR(RECORD_ID()="rec...", ...)`.

### 4.3 Login — los códigos demo no emiten token de paciente

`api/auth-login.js` debe rechazar los códigos `CC-PAC-DEMO*` y `CC-PAC-9900*` en la ruta de
paciente.

Estos códigos van a aparecer en capturas de pantalla, videos de capacitación y presentaciones a
médicos prospecto. Si `CC-PAC-DEMO04` emite un token de paciente válido de 24 horas, es una
credencial publicada en una diapositiva.

---

## 5. Convención

**Códigos:** patrón fijo `CC-PAC-DEMO0N`, no semántico (`CC-PAC-DEMO-CARD` rompe cualquier
validación de longitud en auth). Continúa la numeración desde DEMO01, que ya existe.

**Nombres:** obviamente ficticios y con marcador visible, porque el nombre se renderiza en el
PDF del expediente y en cualquier captura. Formato:

```
DEMO Cardiología — paciente ficticio
```

Nada de nombres de personas del entorno. Ya existe el precedente de las dos personas homónimas de [paciente real 000006].

---

## 6. Contenido clínico

Cada demo cuenta una historia, no valores aleatorios. Una serie que oscila sin dirección se lee
como sistema roto.

**Uno de los siete debe mostrar deterioro.** Si los siete expedientes muestran mejoría, el
portal se lee como material de mercadotecnia y pierde credibilidad justo con la audiencia que
importa, que son médicos. Nefrología es el caso natural.

| Demo | Historia | Momentos | Registros aprox. |
|---|---|---|---|
| DEMO03 Nutrición | Mujer 41 a, obesidad grado II, protocolo GLP-1. Peso 98→84 kg, cintura descendente, masa muscular preservada, escalas hambre/saciedad/adherencia. | Basal → En tratamiento ×5 | 11 × 6 = 66 |
| DEMO04 Cardiología | Hombre 58 a, HAS + dislipidemia. TA 158/96 → 128/78, índice aterogénico descendente. | Basal → tratamiento ×3 | 12 × 4 = 48 |
| DEMO05 Nefrología | Hombre 66 a, ERC 3a → 3b en 12 meses. TFG 52 → 41, creatinina en ascenso lento, hemoglobina descendente. **Progresión, no mejoría.** | Basal → seguimiento ×3 | 9 × 4 = 36 |
| DEMO06 Hepatología | Mujer 49 a, MASLD. ALT/AST descendentes, FIB-4 2.1 → 1.3, plaquetas estables. | Basal → tratamiento ×3 | 9 × 4 = 36 |
| DEMO07 Medicina interna | Hombre 45 a, tamizaje anual, panel amplio. | 3 fechas anuales | 18 × 3 = 54 |

Aproximado: **240 registros nuevos** en LAB_VALORES, más los 40 que ya existen.
`create_records_for_table` acepta 50 por request — son 5 lotes mínimo.

### Campos por registro

- `Origen del dato` = `Laboratorio` (o `Consulta` para signos vitales y escalas)
- `Confianza` = `Alta` (son datos construidos, no extraídos)
- `Momento` según la columna de arriba
- `Parametro` vinculado por record ID desde CATALOGO_PARAMETROS — nunca por CSV
- Banderas `fldsHApnN6uJv3p1r` / `fldq7n3GoSgwgjtLo`: **dejar vacías** hasta confirmar sus
  nombres en la UI de Airtable

---

## 7. Orden de ejecución

1. Crear campo `Es demo` en PACIENTES
2. Marcar `Es demo` en CC-PAC-DEMO01, 990001 y 990002; renombrarlos según §5
3. Backend: excepción de lectura (§4.1)
4. Backend: guarda de escritura por paciente destino (§4.2) ← la parte que se olvida
5. Backend: bloqueo de códigos demo en login (§4.3)
6. Verificar con un token CCMED- que **no sea el tuyo** que los tres demos se ven y no se editan
7. Crear DEMO03–DEMO07 con sus series
8. Verificar cada pestaña LABORATORIOS y al menos una gráfica por especialidad

El paso 6 va **antes** de crear los cinco restantes. Si el modelo de autorización está mal, es
mejor descubrirlo con tres expedientes que con siete.

---

## 8. Verificación de exclusión

Con los demos ya marcados, confirmar que **no** aparecen en:

- [ ] Conteo de pacientes del tablero
- [ ] Auditoría NOM-004
- [ ] Generación de receta digital (debe rechazar)
- [ ] Eventos de Google Calendar
- [ ] Alertas de Telegram
- [ ] Exporte de expedientes
