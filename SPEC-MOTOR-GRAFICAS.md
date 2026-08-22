# SPEC — Motor de gráficas configurable

**Proyecto:** CODE CELLS® · Portal Médico
**Repo:** github.com/virn31/codecells-site
**Base Airtable:** `app6jyD9pDlTLpknA`
**Fecha:** 12 ago 2026
**Estado de datos:** ✅ capa de datos ya creada y verificada en producción

---

## 0. Contexto: por qué existe esto

Hoy cada gráfica del portal es código a medida. El documento de especialidades
lista ~80 gráficas distintas para 14 especialidades. Escribirlas una por una es
deuda técnica garantizada.

Pero esas ~80 gráficas se reducen a **6 primitivas**. Si el motor recibe un JSON
de configuración, agregar una especialidad nueva deja de ser código y pasa a ser
un registro en Airtable.

**Objetivo de esta tarea:** construir el motor y probarlo replicando una gráfica
que YA existe y funciona (curva de peso). Si sale idéntica, el motor sirve.

---

## 1. Lo que YA existe (no crear, no duplicar)

### Tablas nuevas, ya pobladas y verificadas

| Tabla | ID | Contenido |
|---|---|---|
| `CATALOGO_PARAMETROS` | `tblA51aUeYypWQMQV` | 53 parámetros graficables |
| `PLANTILLAS_ESPECIALIDAD` | `tbl1cpvSQkzo5r9UA` | 8 plantillas |

### Campos de `CATALOGO_PARAMETROS`

| Campo | ID | Tipo | Notas |
|---|---|---|---|
| Codigo | `fldc0AaVggOqucQl9` | text | **PRIMARIO**. snake_case. Llave del sistema |
| Nombre | `fldrdbPLhWvCQEpGO` | text | Etiqueta de la gráfica |
| Alias | `fld2n3Kl3XLoCfQ9t` | long text | Variantes separadas por `;` |
| Categoria | `fld9YT0GXWhSYyxy5` | select | Laboratorio · Antropometria · Signos vitales · Escala clinica · Obstetrico · Score calculado |
| Unidad | `fldH6KTUMjmCeZtR7` | select | |
| Tipo de grafica | `fldFdbBjOZWK6nNtP` | select | linea_zonas · linea_dual · multi_linea · barras_agrupadas · barras_apiladas · timeline · gauge |
| Grupo de grafica | `fldemBWZPe4F6oCo8` | select | Agrupa series en un canvas |
| Zonas | `fldLsHrXArCu8GG6j` | long text | JSON de umbrales |
| Origen | `fldtmQQu61Rkg3jnH` | select | Capturado · Calculado · Derivado |
| Formula | `fldrUPyxRuPxVAgfg` | long text | Solo si Origen ≠ Capturado |
| Decimales | `fldzb1jkzs8USvk7w` | number | |
| Fuente actual | `fldalASz6j8as2auj` | select | LAB_VALORES · CONSULTAS · PACIENTES · No existe aun |
| Activo | `fldmc8qdW3xGEqyfA` | checkbox | |

### Campos de `PLANTILLAS_ESPECIALIDAD`

| Campo | ID | Tipo |
|---|---|---|
| Nombre | `fldCci2EttxnhYNhg` | text (primario) |
| Especialidad sugerida | `fldpKJfbjsRS3EvO4` | text |
| Parametros | `fldRY1MIqcqr4uc59` | **link → CATALOGO_PARAMETROS** |
| Descripcion | `fldLFjqzQQCdayyZe` | long text |
| Orden | `fldT6lySoTkraOjWY` | number |
| Activo | `fldAOEQzOo14BcEDA` | checkbox |

### Campos NUEVOS en tablas existentes

`LAB_VALORES` (`tbl6y1ZfsmPPhrlFk`):

| Campo | ID | Tipo |
|---|---|---|
| Parametro | `fldcciqoaVr3ZKGdQ` | link → CATALOGO_PARAMETROS |
| Confianza | `fldX2fj9uQl2smDYB` | select: Alta · Media · Requiere revision |
| Origen del dato | `fldhxDOtqdsGosB0h` | select: Laboratorio · Consulta · Dictado · Paciente · Calculado |

`MÉDICOS` (`tbl87DsuBMmb4DjFM`):

| Campo | ID | Tipo |
|---|---|---|
| Plantillas activas | `fld00htOHBxQgAyWA` | link → PLANTILLAS_ESPECIALIDAD |

### Campos preexistentes de LAB_VALORES que el motor usa

| Campo | ID |
|---|---|
| Analito | `fldOCskUJcaJZPo42` (primario, texto libre del médico) |
| Valor numérico | `fldRNTAVcXemcQ9Ri` |
| Unidad | `fldMj2f7O87YHXH34` |
| Fecha del estudio | `fldXzMqyF96HhCFUG` |
| Código de paciente ref | `fldcPnsLc7QHbkHVg` |

**Estado del backfill:** 48 registros del paciente `CC-PAC-714638` ya enlazados
a su `Parametro` con `Confianza = Alta`. 16 analitos × 3 fechas.

---

## 2. Reglas que NO se negocian

1. **`Analito` nunca se sobreescribe.** Es lo que el médico escribió — evidencia
   NOM-004. `Parametro` es lo que el sistema entendió. Coexisten.

2. **Si `Parametro` está vacío, ese registro NO grafica.** No se adivina. Va a
   bandeja de revisión.

3. **Solo grafican `Confianza` = Alta o Media.** "Requiere revision" se excluye
   de la serie y se reporta aparte.

4. **`Origen = Calculado` nunca se le pide al médico.** El motor lo deriva.

5. **`Origen = Derivado`**: un campo compuesto produce N registros. Caso vivo:
   `CONSULTAS.Presión arterial en consulta` (`fldxXMSzDGqFNbKuM`, texto "145/92")
   → `ta_sistolica` = 145 y `ta_diastolica` = 92, dos registros separados.

6. **Preferir gráfica incompleta sobre gráfica equivocada.** Menos puntos es
   aceptable; un punto en la serie incorrecta no lo es.

---

## 3. Endpoint — despacho por `accion` en `api/airtable.js`

**Decisión: NO crear archivo nuevo.** Se extiende el dispatcher existente,
consistente con el patrón ya definido para consentimiento informado.

### `accion: "graficas_catalogo"`
Devuelve el catálogo completo (53 registros activos). Cachear en cliente:
cambia muy poco.

```json
{
  "parametros": [
    {
      "codigo": "hba1c",
      "nombre": "Hemoglobina glucosilada",
      "unidad": "%",
      "tipoGrafica": "linea_zonas",
      "grupo": "metabolico",
      "zonas": [
        {"max": 5.6, "color": "verde"},
        {"min": 5.7, "max": 6.4, "color": "amarillo"},
        {"min": 6.5, "color": "rojo"}
      ],
      "origen": "Capturado",
      "formula": null,
      "decimales": 1
    }
  ]
}
```

`zonas` viene como string JSON en Airtable → parsear en el servidor, no en el
cliente. Si el parseo falla, devolver `zonas: []` y loguear — nunca reventar
la respuesta completa por un JSON mal escrito en un registro.

### `accion: "graficas_plantillas"`
Devuelve las plantillas con sus códigos resueltos.

```json
{
  "plantillas": [
    {
      "id": "recUTnkQJ5itBC1KX",
      "nombre": "Metabólico / Endocrinología",
      "especialidad": "Endocrinología",
      "orden": 1,
      "codigos": ["glucosa", "hba1c", "insulina", "..."]
    }
  ]
}
```

⚠️ **Trampa conocida:** `Parametros` es un link. El primario de
`CATALOGO_PARAMETROS` es `Codigo`, así que `ARRAYJOIN({Parametros})` **sí**
devuelve los códigos — es la excepción a la regla que ya nos mordió antes con
`MÉDICOS`. Aun así, preferir resolver por record ID y hacer lookup contra el
catálogo ya cargado. Más explícito, menos frágil.

### `accion: "graficas_series"`
El corazón. Entrada:

```json
{
  "accion": "graficas_series",
  "codigoPaciente": "CC-PAC-714638",
  "codigos": ["hba1c", "glucosa", "peso"]
}
```

Salida:

```json
{
  "series": {
    "hba1c": {
      "puntos": [
        {"fecha": "2026-04-15", "valor": 6.1},
        {"fecha": "2026-05-18", "valor": 5.8},
        {"fecha": "2026-06-21", "valor": 5.5}
      ],
      "unidad": "%"
    }
  },
  "excluidos": [
    {"analito": "Glucosa en ayuno post-carga", "motivo": "sin_parametro", "fecha": "2026-06-21"}
  ]
}
```

**Reglas de la consulta:**
- Filtrar por `Código de paciente ref` (`fldcPnsLc7QHbkHVg`), texto plano.
  **NO** usar `ARRAYJOIN` sobre el link `Paciente` — bug documentado dos veces
  en este proyecto.
- Excluir registros sin `Parametro` o con `Confianza = Requiere revision`, y
  reportarlos en `excluidos`.
- Ordenar por `Fecha del estudio` ascendente.
- Descartar puntos sin `Valor numérico` (ej. resultados "Positivo").
- Respetar el scoping por rol que `api/airtable.js` ya aplica. El motor **no**
  introduce una ruta de lectura que se salte la autorización existente.

---

## 4. Función de render — `renderGrafica(config)`

Ubicación sugerida: `portal-medico.html`, junto a las funciones de Chart.js
existentes. **No** dentro del bloque `<script>` sagrado de NOVA LABS.

```js
/**
 * @param {Object} config
 * @param {HTMLCanvasElement} config.canvas
 * @param {string}  config.tipo       - linea_zonas | linea_dual | multi_linea |
 *                                      barras_agrupadas | barras_apiladas | timeline | gauge
 * @param {Array}   config.series     - [{codigo, nombre, unidad, decimales, puntos:[{fecha,valor}]}]
 * @param {Array}   config.zonas      - [{min?, max?, color}] (solo linea_zonas)
 * @param {string}  config.titulo
 * @returns {Chart}
 */
function renderGrafica(config) { ... }
```

### Prioridad de implementación

Implementar **solo dos primitivas** en esta pasada:

1. `linea_zonas` — cubre la mayoría del catálogo
2. `multi_linea` — para grupos (`perfil_lipidico`, `perfil_tiroideo`, `electrolitos`)

Las otras cuatro se dejan como `default:` que loguea "tipo no implementado" y
no dibuja. **No inventar implementaciones a medias.**

### Colores
Usar el sistema existente: fondo `#0E1410`, dorado `#E8A33D`.
La serie principal va en dorado. Las zonas de color son bandas de fondo
semitransparentes, nunca colorean la línea.

---

## 5. Prueba de aceptación — la curva de peso

**Esta es la validación, no un extra.**

El tab Nutrición ya tiene una curva de peso funcionando con Chart.js, construida
con el paciente [paciente real 635281] (`recc9S87wcXhtRARc` / `CC-PAC-635281`,
7 consultas semanales, protocolo GLP-1).

**Criterio de aceptación:** reimplementar esa misma curva llamando a
`renderGrafica()` con `tipo: "linea_zonas"` y `codigo: "peso"`, y que se vea
**idéntica** a la actual. Misma forma, mismos puntos, mismo color.

Si sale idéntica → el motor sirve, se procede.
Si sale distinta → el motor está mal, se corrige antes de seguir.

⚠️ **Obstáculo esperado:** el peso de [paciente real 635281] NO está en `LAB_VALORES`. Vive en
`CONSULTAS.Peso en consulta (kg)` (`fldqn4q0ClVIqdO24`) y en
`PACIENTES.Historial de peso` (`fldmu90vCBBSP2uEF`, texto libre).

Para esta prueba: que `graficas_series` lea `peso` desde `CONSULTAS`
(por `Código de paciente ref` = `fldF3lTZFljoO7qjI`, fecha = `Fecha de consulta`
`fldOGukIHMdLAKggt`). El campo `Fuente actual` del catálogo indica de dónde leer
cada código — el motor debe respetarlo.

**NO migrar `Historial de peso` en esta tarea.** Es texto libre con datos
clínicos reales. Se hace después, con respaldo, como tarea propia.

---

## 6. Integridad — verificaciones obligatorias

Antes de dar por terminado:

```bash
# El bloque <script> de NOVA LABS debe quedar byte-idéntico
awk '/<!-- NOVA-LABS-START -->/,/<!-- NOVA-LABS-END -->/' portal-medico.html > /tmp/after.txt
diff -q /tmp/before.txt /tmp/after.txt

# Las 11 funciones sagradas de NOVA LABS siguen presentes
grep -c "function nova" portal-medico.html   # debe seguir igual

# Conteo de referencias a la API estable
grep -c "accion:" portal-medico.html
```

Reportar los tres números antes y después. Si alguno cambia sin razón
explicable, revertir.

---

## 7. Fuera de alcance (NO hacer en esta tarea)

- Migrar `PACIENTES.Historial de peso` a registros
- El normalizador de alias (NOVA resolviendo `Hb` → `hemoglobina`)
- Split automático de tensión arterial al capturar
- Cálculo de scores derivados (FIB-4, TFG, IMC, HOMA-IR)
- Las otras 4 primitivas de gráfica
- UI de selección de plantillas para el médico
- Alertas inteligentes por umbral

Cada uno es tarea propia. Meter dos de estos en la misma pasada es cómo se
rompen las cosas.

---

## 8. Entregable

1. `api/airtable.js` con las 3 acciones nuevas
2. `renderGrafica()` en `portal-medico.html` con 2 primitivas
3. Curva de peso de [paciente real 635281] reimplementada con el motor
4. Los tres conteos de integridad, antes y después
5. Captura o descripción de la curva nueva vs la vieja
