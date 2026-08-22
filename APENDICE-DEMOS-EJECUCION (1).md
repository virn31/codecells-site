# APÉNDICE — Ejecución de pacientes demo

**Fecha:** 13 agosto 2026 (madrugada)
**Base:** `app6jyD9pDlTLpknA` · **Tabla:** LAB_VALORES `tbl6y1ZfsmPPhrlFk`
**Complementa:** `SPEC-PACIENTES-DEMO.md`

---

## 1. Estado

| Demo | Código | Record ID paciente | Registros | Estado |
|---|---|---|---|---|
| Nutrición | CC-PAC-DEMO03 | `recZlZn2RgCm9ZzAs` | 55 | **hecho** |
| Cardiología | CC-PAC-DEMO04 | `recIAaMd8pg4S3OrF` | 48 | **hecho** |
| Nefrología | CC-PAC-DEMO05 | `recPTSjR4cT4VerBk` | 36 | pendiente |
| Hepatología | CC-PAC-DEMO06 | `recgf9SLAIgFaefPg` | 36 | pendiente |
| Medicina interna | CC-PAC-DEMO07 | `recFA0bgrdQtHXZoQ` | 54 | pendiente |

Los cinco pacientes ya existen en PACIENTES, ligados a `recDQBB7QxgWdZVeB` (CCMED-VIRN01),
estatus Activo, con nombre `DEMO <ESPECIALIDAD> — PACIENTE FICTICIO, NO REAL`.

---

## 2. Checkboxes — RESUELTOS

Confirmados por API, no por inferencia. Ver §2.1 para la técnica.

| Tabla | Field ID | Nombre confirmado |
|---|---|---|
| PACIENTES | `fld390FMoPXf7oUJh` | **Es demo** |
| LAB_VALORES | `fldsHApnN6uJv3p1r` | **Relevante a patología** |
| LAB_VALORES | `fldq7n3GoSgwgjtLo` | **Es crítico** |

Las presunciones por color e icono resultaron correctas en los tres casos, pero eso se sabe
ahora, no antes.

`Es demo` ya está marcado en: DEMO03, DEMO04, DEMO05, DEMO06, DEMO07, CC-PAC-990001,
CC-PAC-990002. **Falta CC-PAC-DEMO01** (no se obtuvo su record ID en esta sesión).

Sin identificar aún, en PACIENTES: `fldy0r18Iw1LwQy4G` (check amarillo) y `fldtMqzwLPayO84uN`
(check verde). No se escriben hasta resolverlos con la misma técnica.

### 2.1 Cómo resolver el nombre de un campo por API

`get_table_schema` devuelve IDs, tipos y config, **nunca nombres**. `list_tables_for_base` no
carga vía `tool_search` (mismo comportamiento que `create_table`). El camino que sí funciona:

1. `search_records` acepta **nombres** en `resultFieldIds` y responde indexado por **ID**.
2. **Advertencia crítica:** un nombre inexistente se ignora en silencio — no da error. Un
   resultado vacío por lo tanto es ambiguo entre "el nombre no existe" y "el valor está vacío",
   porque Airtable omite los valores falsos o vacíos de la respuesta.
3. Por eso la prueba tiene que ser **positiva**: poner el campo en `true` en un registro
   desechable, consultar por nombre, y ver qué ID responde. Un ID de vuelta = nombre confirmado.
4. Revertir el valor de prueba.

Esto vale para cualquier campo del base, no solo checkboxes.

---

## 3. Campos de LAB_VALORES

| Field ID | Contenido |
|---|---|
| `fldOCskUJcaJZPo42` | Analito (texto literal) |
| `fld5rcAgx1Jti8aoN` | Valor como texto |
| `fldRNTAVcXemcQ9Ri` | Valor numérico |
| `fldMj2f7O87YHXH34` | Unidad |
| `fldFiixspvZOJvsy1` | Normal / Alto / Bajo / Indeterminado |
| `fldXzMqyF96HhCFUG` | Fecha (date ISO, sin zona) |
| `fldcPnsLc7QHbkHVg` | Código de paciente (texto) |
| `fldcciqoaVr3ZKGdQ` | Parametro → CATALOGO_PARAMETROS |
| `fldX2fj9uQl2smDYB` | Confianza → `Alta` |
| `fldhxDOtqdsGosB0h` | Origen → Laboratorio / Consulta / Calculado / Paciente |
| `flduQ8A26xO71hZOv` | Paciente → record ID |
| `fldygDaS9Nif42H5C` | Momento |

**No escribir** `fldRETxH1BWWlS725` (rango de referencia presunto, sin confirmar) ni los dos
checkboxes de LAB_VALORES. Máximo 50 registros por request.

---

## 4. DEMO05 — Nefrología · `recPTSjR4cT4VerBk`

Hombre 66 a, ERC 3a → 3b en 12 meses. **Único demo que muestra deterioro.**
Fechas: `2025-08-14` (Basal), `2025-11-13`, `2026-02-12`, `2026-05-14` (Seguimiento).

| Analito | Param ID | Unidad | Origen | D1 | D2 | D3 | D4 | Estado |
|---|---|---|---|---|---|---|---|---|
| Creatinina | `rec10ncCf6l3CjxjD` | mg/dL | Laboratorio | 1.42 | 1.51 | 1.63 | 1.74 | Alto ×4 |
| TFG estimada | `recU8KByU9C4GcgOl` | mL/min/1.73m2 | Calculado | 52 | 48 | 44 | 41 | Bajo ×4 |
| BUN | `recX0H3lm2y7HZNoR` | mg/dL | Laboratorio | 22 | 25 | 28 | 31 | Normal, Alto, Alto, Alto |
| Sodio | `recIbN2xy12kF251a` | mEq/L | Laboratorio | 140 | 139 | 138 | 137 | Normal ×4 |
| Potasio | `rec3qFAG5KOyJXYDs` | mEq/L | Laboratorio | 4.4 | 4.7 | 5.0 | 5.3 | Normal, Normal, Normal, Alto |
| Calcio | `recAqkvvIOU6KxFYh` | mg/dL | Laboratorio | 9.4 | 9.2 | 9.0 | 8.7 | Normal ×4 |
| Hemoglobina | `recLWNGhc09OiMRqT` | g/dL | Laboratorio | 13.8 | 13.1 | 12.4 | 11.6 | Normal, Normal, Bajo, Bajo |
| TA sistólica | `recRmiyNa6Vgvh1nb` | mmHg | Consulta | 148 | 144 | 142 | 138 | Alto ×4 |
| TA diastólica | `rec6vrGL6sE6HUUQI` | mmHg | Consulta | 88 | 86 | 86 | 84 | Normal ×4 |

Momento: D1 `Basal`, D2–D4 `Seguimiento`.

---

## 5. DEMO06 — Hepatología · `recgf9SLAIgFaefPg`

Mujer 49 a, MASLD con mejoría bajo tratamiento. FIB-4 2.10 → 1.28.
Fechas: `2025-09-05` (Basal), `2025-12-04`, `2026-03-05`, `2026-06-04`.

| Analito | Param ID | Unidad | Origen | D1 | D2 | D3 | D4 | Estado |
|---|---|---|---|---|---|---|---|---|
| ALT | `recILAvwGA2SLH3gK` | U/L | Laboratorio | 78 | 64 | 49 | 36 | Alto, Alto, Alto, Normal |
| AST | `recZcui5F4ddz0TFp` | U/L | Laboratorio | 66 | 55 | 43 | 32 | Alto, Alto, Alto, Normal |
| GGT | `recHldos7YiJLYnw4` | U/L | Laboratorio | 94 | 78 | 61 | 45 | Alto, Alto, Alto, Normal |
| Fosfatasa alcalina | `recB6Jog4sMngRYuE` | U/L | Laboratorio | 118 | 112 | 105 | 98 | Normal ×4 |
| Bilirrubina total | `recCmNaeyasikqoQv` | mg/dL | Laboratorio | 1.1 | 1.0 | 0.9 | 0.8 | Normal ×4 |
| Albúmina | `recyHFW6Uknrasoe6` | g/dL | Laboratorio | 4.0 | 4.1 | 4.2 | 4.3 | Normal ×4 |
| Plaquetas | `recXwNQGfIqPDglIB` | ×10³/µL | Laboratorio | 186 | 192 | 198 | 205 | Normal ×4 |
| FIB-4 | `rec1bV70LHlmj2LUI` | índice | Calculado | 2.10 | 1.82 | 1.53 | 1.28 | Alto, Alto, Normal, Normal |
| APRI | `rec5bt9DmfhLu4UE0` | índice | Calculado | 0.89 | 0.72 | 0.54 | 0.39 | Alto, Alto, Normal, Normal |

Momento: D1 `Basal`, D2–D4 `En tratamiento`.

---

## 6. DEMO07 — Medicina interna · `recFA0bgrdQtHXZoQ`

Hombre 45 a, tamizaje anual. Panel de 18 parámetros × 3 fechas.
Fechas: `2024-06-20`, `2025-06-19`, `2026-06-18`. Momento: `Seguimiento` en las tres.
Talla 1.78 m.

| Analito | Param ID | Unidad | Origen | 2024 | 2025 | 2026 | Estado |
|---|---|---|---|---|---|---|---|
| TA sistólica | `recRmiyNa6Vgvh1nb` | mmHg | Consulta | 126 | 130 | 132 | Normal ×3 |
| TA diastólica | `rec6vrGL6sE6HUUQI` | mmHg | Consulta | 80 | 82 | 84 | Normal ×3 |
| Frecuencia cardíaca | `rec4Ct7mKyC6K3dBm` | lpm | Consulta | 72 | 74 | 76 | Normal ×3 |
| Peso | `recIUpGdTW5YZoCqt` | kg | Consulta | 86.0 | 88.5 | 90.2 | Indeterminado ×3 |
| IMC | `recFuYxId6Rhay7Ck` | kg/m2 | Calculado | 27.2 | 27.9 | 28.5 | Alto ×3 |
| Glucosa | `recdoYFUadyXR1i25` | mg/dL | Laboratorio | 96 | 103 | 109 | Normal, Alto, Alto |
| HbA1c | `reciEoPTNVMvyyoBh` | % | Laboratorio | 5.4 | 5.7 | 5.9 | Normal, Alto, Alto |
| Colesterol total | `recaT2I5CkDjqKdRY` | mg/dL | Laboratorio | 192 | 208 | 216 | Normal, Alto, Alto |
| LDL | `recfSZL5Dy8hYtdZ6` | mg/dL | Laboratorio | 118 | 132 | 141 | Alto ×3 |
| HDL | `reckg5wZVt85aq9AM` | mg/dL | Laboratorio | 48 | 45 | 43 | Normal ×3 |
| Triglicéridos | `recMKhRBf1lK3YyCA` | mg/dL | Laboratorio | 130 | 155 | 172 | Normal, Alto, Alto |
| Creatinina | `rec10ncCf6l3CjxjD` | mg/dL | Laboratorio | 0.94 | 0.97 | 0.99 | Normal ×3 |
| TFG estimada | `recU8KByU9C4GcgOl` | mL/min/1.73m2 | Calculado | 98 | 95 | 92 | Normal ×3 |
| Hemoglobina | `recLWNGhc09OiMRqT` | g/dL | Laboratorio | 15.2 | 15.0 | 14.9 | Normal ×3 |
| Índice aterogénico | `rec9IRUMoorPuSDNr` | razón | Calculado | 4.0 | 4.6 | 5.0 | Normal, Alto, Alto |
| Colesterol no-HDL | `rec6r1Q61gG27gh8r` | mg/dL | Calculado | 144 | 163 | 173 | Alto ×3 |
| VPM | `recfUCoLv69UnvnBL` | fL | Laboratorio | 9.8 | 10.1 | 10.3 | Normal ×3 |
| RDW-SD | `recqI1DsaVvB3DlFE` | fL | Laboratorio | 42.1 | 42.8 | 43.4 | Normal ×3 |

> Este demo va en la dirección contraria a los otros: un paciente aparentemente sano que se
> deteriora lentamente en tres años sin cruzar ningún umbral dramático. Es el caso que mejor
> justifica la gráfica longitudinal — ningún valor aislado dispara alarma, la tendencia sí.

---

## 7. Después de cargar

1. Confirmar el checkbox `Es demo` y marcar los ocho expedientes
2. Backend: excepción de lectura, guarda de escritura por paciente destino, bloqueo de códigos
   demo en login (§4 del spec principal)
3. Verificar con un token CCMED- ajeno que se ven y no se editan
4. Revisar cada pestaña LABORATORIOS y una gráfica por especialidad

## 8. Hallazgo aparte

**CC-PAC-990003** existe con el nombre **"[paciente real 635281]"** — duplicado del nombre de un
paciente real (CC-PAC-635281), ligado a CCMED-VIRN01, creado el 12 de agosto. Es exactamente el
escenario de homónimo que la validación de identidad de Fase C existe para atrapar, y ahora
mismo está dentro de la base. Resolver antes de que alguien lo abra por nombre.

> **CERRADO — verificado 2026-08-22.** El registro ya no expone el homónimo: nombre actual
> `ZZ EVIDENCIA — NO ES PACIENTE REAL (incidente 2026-08-14)`, `Es demo` marcado, teléfono
> removido. Confirmado directo contra Airtable en producción. Este hallazgo no requiere ninguna
> acción adicional — se deja el párrafo de arriba solo como registro histórico de lo que se
> encontró, no como pendiente.
