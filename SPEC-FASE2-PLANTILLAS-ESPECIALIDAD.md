# SPEC — Fase 2: plantillas por especialidad sobre el motor de gráficas

**Estado:** diseño, NO implementado · **Fecha:** 2026-10-03
**Base de lectura:** `SPEC-MOTOR-GRAFICAS.md` (12 ago 2026) — esta Fase 2 lo
EXTIENDE; no lo reemplaza.

---

## 0. Conclusión de la auditoría (leer primero)

La mitad de lo pedido para la Fase 2 **ya existe** y funciona en producción:

| Pedido | Ya existe como | Dónde |
|---|---|---|
| Motor de gráficas agnóstico | `renderGrafica(config)` (SVG) | `portal-medico.html:6320` |
| Datos por parámetro | `accion=graficas_series` (con `autorizarPaciente`) | `api/airtable.js:684` |
| Catálogo de gráficas | `CATALOGO_PARAMETROS` (53 en prod) + `accion=graficas_catalogo` | `api/airtable.js:562` |
| Plantillas por especialidad | Tabla `PLANTILLAS_ESPECIALIDAD` (8 en prod, 1 en base de prueba) + `accion=graficas_plantillas` | `api/airtable.js:611` |
| "Plantilla según el médico" | Link `MÉDICOS.Plantillas activas` → `actualizarVisibilidadPrenatal()` | `portal-medico.html:5256` |

Por eso NO se crea `lib/plantillas-especializadas.js` como **segunda** fuente
de verdad de "qué gráficas tiene cada especialidad": Airtable ya lo es. Lo que
falta es (a) que la plantilla también declare **bloques no-gráfica** (fórmula
G/P/C/A, semáforo, tabla de vigencias), (b) las primitivas que faltan, y
(c) un casillero genérico en lugar del tab "Control prenatal" hecho a mano.

El paso 6 tal como se pidió (ocultar notas de otros especialistas) contradice
CLAUDE.md §2 — ver §6 y la decisión 1 para Víctor.

---

## 1. Dónde viven hoy los datos y las gráficas

### Expediente en el Portal (`portal-medico.html`)

Se abre con `seleccionarPaciente(recId)` (`:4997`), desde la lista
(cartera propia + demo) o por código exacto (`?pacienteBuscado=`, `:4926`).
Tabs (`:3299-3304`):

| Tab | Datos | Tabla(s) |
|---|---|---|
| Datos generales | identidad, patologías activas, peso/talla actuales, Notas generales | PACIENTES |
| Historia clínica | AHF, APP, APNP, alergias, medicamentos, `f-ago` (texto libre GO) | HISTORIA CLÍNICA |
| Consultas | signos en consulta, Dx, plan, Razonamiento clínico (no visible al paciente). `soloMias` por default | CONSULTAS |
| NOVA LABS | estudios + valores, tabla por categoría | NOVA LABS + LAB_VALORES |
| Nutrición | curva de peso → `renderGrafica` (`:5189`) | CONSULTAS / LAB_VALORES |
| Control prenatal | oculto salvo plantilla "Control prenatal" activa **y** paciente con "Embarazo" | todas + ANTECEDENTES_OBSTETRICOS |

### Motor existente

- `renderGrafica(config)` (`:6320`): SVG propio, sin Chart.js. Implementa **2 de
  7** primitivas: `linea_zonas`, `multi_linea`. Las otras (`linea_dual`,
  `barras_agrupadas`, `barras_apiladas`, `timeline`, `gauge`) hacen
  `console.warn('tipo no implementado')` y no dibujan — a propósito.
- Lógica pura reutilizable: `evaluarZona` (`:6143`), `evaluarTendencia` (`:6201`),
  `calcularFormulaEventos` (`:6234`), `evaluarVigenciaEstudio` (`:6252`),
  `calcularIntervaloMeses` (`:6265`).
- Consumidores: Nutrición (`:5189`), Control prenatal (`renderPnChart`, `:5863`).

### Antecedentes GO — NO son gráficas del motor

`renderPnAntecedentesGO()` (`:5629`) produce **HTML**, no SVG: fórmula
G/P/C/A, intervalo intergenésico, cronología, estudios con vigencia. Su
alerta alimenta la 7ª luz de `renderPnVeredictoYSemaforo()` (`:5723`).
Configuración en `GO_TIPOS_*` / `GO_PERIODICIDAD_ESTUDIOS` (`:5362-5391`),
duplicada en `kiosco.html` (`GO_K_*`).

### Especialidad del médico

`MÉDICOS.Especialidad` es **texto libre** (VIRN01 = "CIRUGIA PLASTICA").
Solo lo lee el chat de NOVA para su prompt (`api/nova.js:~3080`). No hay tabla
`PERSONAL_MEDICO` ni campo "Tipo" de especialidad. No sirve como llave.

### NOVA

No existe comando ni herramienta "abre expediente". NOVA del médico corre
dentro del Portal con el paciente que el Portal ya abrió; el médico se
resuelve del **token** (`sesion.codigo`), nunca de un parámetro.

---

## 2. Arquitectura propuesta

```
                    Airtable (datos, editables sin deploy)
 ┌───────────────────────────┐    ┌───────────────────────────┐
 │ CATALOGO_PARAMETROS        │◄───│ PLANTILLAS_ESPECIALIDAD    │
 │ codigo, tipo de gráfica,   │link│ nombre, parámetros (link), │
 │ zonas, fuente, tendencia   │    │ + Bloques (NUEVO, multi)   │
 └───────────────────────────┘    │ + Requiere (NUEVO, json)   │
                                   └─────────────▲─────────────┘
                                                 │ link
                                   ┌─────────────┴─────────────┐
                                   │ MÉDICOS.Plantillas activas │  ← el médico ELIGE
                                   └───────────────────────────┘    (no se infiere)

 Servidor (api/airtable.js — todo pasa por autorizarPaciente)
   graficas_plantillas ─► plantillas del MÉDICO DEL TOKEN (+ bloques)
   graficas_series     ─► series por código (ya existe)
   tabla=antecedentes_* ─► registros del paciente (ya existe, GO)

 Cliente (lib/motor-graficas.js, compartido Portal / app paciente)
   PRIMITIVAS[tipo](svg, cfg)      ← gráficas: linea_zonas, multi_linea, timeline…
   BLOQUES[id](contenedor, ctx)    ← no-gráficas: go-formula, go-estudios, semáforo…
   CALCULOS[id](datos, cfg)        ← lógica pura: formulaEventos, vigencia, intervalo

 Portal: casillero "Gráficas" en el expediente
   para cada plantilla activa del médico que APLICA al paciente:
     tarjeta [Abrir] → render de sus parámetros (PRIMITIVAS) y bloques (BLOQUES)
```

Regla de diseño: **Airtable dice QUÉ se muestra; el código dice CÓMO**. Un
parámetro nuevo de laboratorio = un registro. Un bloque nuevo con lógica
clínica (una fórmula, un score) = código revisado + su id en la plantilla.

---

## 3. Pseudo-código — `lib/motor-graficas.js`

Se MUEVE `renderGrafica` de `portal-medico.html` a un archivo compartido
(servido como `/lib/motor-graficas.js`, igual que `lib/i18n.js`) para que la
app del paciente y el kiosco puedan usarlo. La firma actual se conserva
(`renderGrafica(config)`) — no se cambia a `(tipo, datos, config)` porque
romper los 2 consumidores no aporta nada.

```js
// UMD: window.MotorGraficas en navegador, module.exports en Node (tests).
const PRIMITIVAS = {
  linea_zonas:  (svg, cfg) => { /* ya existe — mover tal cual */ },
  multi_linea:  (svg, cfg) => { /* ya existe — mover tal cual */ },
  linea_dual:   (svg, cfg) => { /* 2 ejes Y: FEV1 L vs FEV1/FVC % */ },
  timeline:     (svg, cfg) => { /* eventos en eje de fechas, sin eje Y */ },
  gauge:        (svg, cfg) => { /* valor único vs zonas */ },
  // barras_*: solo cuando una plantilla real las pida
};

function renderGrafica(cfg) {
  const fn = PRIMITIVAS[cfg.tipo];
  if (!fn) { console.warn(`[motor-graficas] tipo no implementado: ${cfg.tipo}`); return; }
  const series = (cfg.series || []).filter(s => s?.puntos?.length);
  if (!series.length) return mostrarVacio(cfg.svg);        // vacío ≠ error (CLAUDE.md §6)
  fn(cfg.svg, { ...cfg, series });
}

// Lógica pura, sin DOM — hoy dispersa en portal y kiosco.
const CALCULOS = {
  formulaEventos:  (tipos, hayActual, clases) => ({ G, P, C, A }),   // calcularFormulaEventos
  vigencia:        (fecha, meses, hasta) => ({ mesesTranscurridos, vencido }),
  intervaloMeses:  (desde, hasta) => n,
  zona:            evaluarZona,
  tendencia:       evaluarTendencia,
};

// Bloques NO-gráfica: reciben registros ya autorizados y la config del bloque.
const BLOQUES = {
  'go-formula':    (el, ctx) => { /* G/P/C/A + intervalo, CALCULOS.formulaEventos */ },
  'go-cronologia': (el, ctx) => { /* tabla de eventos obstétricos */ },
  'go-estudios':   (el, ctx) => { /* estudios con vigencia; luz roja si vencido */ },
  'semaforo':      (el, ctx) => { /* luces de riesgo — ver renderPnVeredictoYSemaforo */ },
  'tabla-valores': (el, ctx) => { /* última medición por código + zona */ },
};
// Cada bloque devuelve { alerta: 'ok'|'warn'|'crit'|'sin_datos' } para que el
// semáforo agregue sin conocer obstetricia. Error de lectura → 'sin_datos'
// visible, NUNCA un valor por defecto.

module.exports = { renderGrafica, PRIMITIVAS, CALCULOS, BLOQUES };
```

Mapeo de los tipos del pedido a lo existente: `trend` = `linea_zonas`
(1 serie) / `multi_linea` (varias, misma unidad) / `linea_dual` (unidades
distintas); `timeline` = `timeline`; `semaforo`, `tabla`, `eventos` = BLOQUES.

---

## 4. Configuración de plantillas

### 4.1 Lo que vive en Airtable (`PLANTILLAS_ESPECIALIDAD`) — 2 campos nuevos

| Campo nuevo | Tipo | Para qué |
|---|---|---|
| `Bloques` | multipleSelects (ids de `BLOQUES`) | qué bloques no-gráfica muestra la plantilla |
| `Requiere` | long text (JSON) | cuándo APLICA al paciente, ej. `{"sexo":["Femenino"],"patologia":"Embarazo"}` |

Hoy "aplica si Embarazo" está escrito a mano en `actualizarVisibilidadPrenatal`;
con `Requiere` deja de ser código.

### 4.2 Registros (gine completa, demás esqueleto)

```json
[
  {
    "Nombre": "Control prenatal",
    "Especialidad sugerida": "Ginecología y Obstetricia",
    "Orden": 1,
    "Requiere": { "sexo": ["Femenino"], "patologia": "Embarazo" },
    "Parametros": ["peso_fetal_estimado", "dbp_fetal", "hc_fetal", "ca_fetal", "longitud_femoral",
                   "crl_fetal", "percentil_peso_fetal", "umbilical_ip", "acm_ip", "rcp",
                   "ta_sistolica", "ta_diastolica", "peso", "plaquetas", "ast", "alt", "acido_urico", "…31 hoy"],
    "Bloques": ["go-formula", "go-cronologia", "go-estudios", "semaforo"]
  },
  {
    "Nombre": "Ginecología (no embarazada)",
    "Especialidad sugerida": "Ginecología y Obstetricia",
    "Orden": 2,
    "Requiere": { "sexo": ["Femenino"] },
    "Parametros": ["hemoglobina", "ferritina", "tsh", "glucosa"],
    "Bloques": ["go-formula", "go-cronologia", "go-estudios"]
  },
  {
    "Nombre": "Cardiología",
    "Especialidad sugerida": "Cardiología",
    "Requiere": {},
    "Parametros": ["fevi", "ta_sistolica", "ta_diastolica", "fc", "colesterol_ldl", "nt_probnp"],
    "Bloques": ["tabla-valores", "card-eventos"]
  },
  { "Nombre": "Neumología",  "Parametros": ["fev1", "fvc", "fev1_fvc", "spo2"], "Bloques": ["tabla-valores"] },
  { "Nombre": "Urología",    "Parametros": ["psa_total", "psa_libre", "creatinina", "tfg"], "Bloques": ["tabla-valores"] },
  { "Nombre": "Medicina general", "Parametros": ["peso", "imc", "ta_sistolica", "glucosa", "hba1c", "colesterol_total"],
    "Bloques": ["tabla-valores"] }
]
```

Códigos de cardio/neumo/uro que **no existen** en el catálogo (`fevi`, `fev1`,
`fvc`, `psa_*`, `nt_probnp`…) se crean primero en `CATALOGO_PARAMETROS` con su
`Fuente actual` — si su fuente es una tabla de antecedentes nueva, el motor
(`graficas_series`) aprende a leerla igual que aprendió `CONSULTAS`.

"Medicina General" aparece en varias especialidades del pedido: con el modelo
de link explícito no hay conflicto — el médico activa las plantillas que use.

---

## 5. Cómo se elige la plantilla (reemplaza "NOVA abre automático")

1. Login → `medicoActual['Plantillas activas']` (ya viene en `auth-login`).
2. `seleccionarPaciente()` → para cada plantilla activa, evaluar `Requiere`
   contra el paciente → tarjetas en el casillero, ordenadas por `Orden`.
3. Si el médico tiene **una** sola plantilla aplicable → se abre sola.
4. NOVA: herramienta futura `abrir_expediente(codigo)` que solo llama a
   `seleccionarPaciente` del Portal (misma autorización); NOVA no decide
   plantillas ni lee datos por su cuenta.
5. Onboarding: al dar de alta un médico, se le sugieren plantillas por
   `Especialidad sugerida` ≈ su `Especialidad`; él confirma. Nunca se infiere en
   caliente del texto libre.

---

## 6. Filtrado en backend

### 6.1 Lo que se pidió y por qué no se recomienda tal cual

> Cardiólogo abre a Juanito → NO recibe notas de urología.

Contradice CLAUDE.md §2: el producto existe porque "tres o cuatro médicos no
se comunican… se repiten estudios, se contradicen tratamientos". Un
cardiólogo que no ve la tamsulosina que indicó urología no puede detectar la
hipotensión ortostática. Ocultar por especialidad reproduce el problema que
la red resuelve.

Además: no existe `/api/expediente` (todo es `/api/airtable?tabla=…`), y
`medicoRecId=CCMED-XXX` como parámetro rompe la regla de §4 — el médico sale
del token, nunca del query string.

### 6.2 Lo que sí tiene sentido filtrar en servidor — por SENSIBILIDAD, no por especialidad

| Qué | Quién lo ve | Mecanismo |
|---|---|---|
| Consulta, antecedentes, labs | todo médico autorizado al paciente | ya existe (`autorizarPaciente`) |
| `Razonamiento clínico` | solo el autor | servidor elimina el campo si `Código de médico ref ≠ token` |
| Consulta marcada `Sensible` (salud sexual, mental, VIH, adicciones) | autor + médicos a los que el paciente la compartió | campo nuevo + consentimiento del paciente |
| Énfasis por especialidad | todos ven todo; la plantilla decide qué se ve PRIMERO | solo UI |

Implementación (cuando se decida): en `api/airtable.js`, bloque
`TABLAS_EXPEDIENTE_MEDICO`, después de `autorizarPaciente()`: post-filtrar la
respuesta de `consultas` quitando campos privados del autor. Se hace en el
servidor (no en la UI) porque un filtro de UI se salta con F12.

---

## 7. Tablas a crear

Esqueleto común (idéntico a ANTECEDENTES_OBSTETRICOS, para que el mismo bloque
de `api/airtable.js` y el mismo formulario genérico sirvan):
`ID · Paciente (link) · Código de paciente ref · Categoría · Tipo de evento ·
Fecha del evento · Resultado · Requiere seguimiento · Notas · Registrado por
(link MÉDICOS) · Fecha de registro` + campos tipados propios.

| Tabla | Campos propios | Prioridad |
|---|---|---|
| ANTECEDENTES_GENERALES | Diagnóstico CIE-10, Estado (activo/resuelto), Tratamiento | 1 — aplica a todos |
| ANTECEDENTES_CARDIOLOGICOS | FEVI (%), Vaso/Procedimiento, Dispositivo | según 2º médico afiliado |
| ANTECEDENTES_PULMONARES | FEV1 (L), FVC (L), FEV1/FVC (%), Paquetes-año | idem |
| ANTECEDENTES_UROLOGICOS | PSA total/libre, Volumen prostático (ml) | idem |

Por cada tabla: crearla primero en la base de prueba; agregarla a
`TABLAS_PERMITIDAS`, `CAMPO_DUENIO`, `TABLAS_EXPEDIENTE_MEDICO` y
`NUCLEO_CLINICO_TABLAS`; autoría forzada (`Registrado por`); cubrir en el aviso
de privacidad clínico (que aún no existe).

Valores graficables (FEVI, FEV1, PSA) — decisión abierta: ¿viven en la tabla de
antecedentes o en LAB_VALORES con su `Parametro`? Recomendación: LAB_VALORES
(el motor ya sabe graficarlo, con Confianza y evidencia NOM-004); la tabla de
antecedentes guarda el EVENTO (ecocardiograma del 2024-06) y enlaza.

---

## 8. Orden de implementación sugerido

1. Cerrar B1–B3 del kiosco (ver memoria de auditoría) — no construir encima.
2. Mover `renderGrafica` + cálculos a `lib/motor-graficas.js` sin cambiar
   comportamiento (prueba: curva de peso y Control prenatal idénticos).
3. Campos `Bloques`/`Requiere` en PLANTILLAS_ESPECIALIDAD; casillero genérico;
   "Control prenatal" migra a ser una plantilla más (prueba: se ve igual).
4. ANTECEDENTES_GENERALES + su plantilla.
5. Segunda especialidad real (la del siguiente médico afiliado).
6. Filtro por sensibilidad (§6.2), cuando Víctor decida.
