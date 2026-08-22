# SPEC FASE C — Ingesta de laboratorios por PDF / fotografía

**Fecha:** 12 agosto 2026
**Autor:** Dr. Víctor Iván Rodríguez Nava (CCMED-VIRN01)
**Depende de:** `SPEC-INGESTA-LAB-VALORES.md` (Fases A y B)
**Base:** `app6jyD9pDlTLpknA` · **Tabla destino:** LAB_VALORES `tbl6y1ZfsmPPhrlFk`

---

## 0. Prerrequisitos — NO construir Fase C sobre estos bugs

Ambos vienen de Fase B y siguen abiertos. Fase C los amplifica: multiplican por
cada estudio subido.

1. **Fallback de fecha a `new Date()`** en los 4 write paths. Un estudio de junio
   subido hoy queda fechado hoy. Falla en silencio y corrompe la serie temporal.
2. **Sin idempotencia.** Resubir el mismo PDF duplica todos los registros.
   En Fase C esto es más probable, no menos: el médico reintenta cuando una foto
   sale mal.

Además: **`Relevante a patología` está hardcodeado a `true`.** Si todo registro
entra marcado, la bandera no distingue nada y se vuelve ruido.

---

## 1. Objetivo

El médico sube un PDF o una fotografía de un estudio de laboratorio. El sistema
extrae los analitos y los vuelca a LAB_VALORES, estructurados y listos para graficar,
sin transcripción manual.

**No objetivo:** interpretación clínica automática. El sistema extrae y estructura.
El juicio clínico es del médico.

---

## 2. Flujo

```
1. Médico selecciona AL PACIENTE explícitamente  ← nunca inferido del documento
2. Sube PDF o foto
3. Visión extrae: analitos, valores, unidades, rangos de referencia, fecha del estudio
4. PANTALLA DE CONFIRMACIÓN  ← obligatoria, no omitible
5. Médico corrige lo que haga falta y confirma
6. Escritura a LAB_VALORES
```

El paso 4 no se salta ni con opción de "recordar mi preferencia". Extracción no es
verificación.

---

## 3. Identidad del paciente — DOBLE VALIDACIÓN OBLIGATORIA

Volcar un estudio al paciente equivocado es error clínico y violación LFPDPPP
simultáneamente, y es invisible: los valores se ven perfectamente normales dentro
del expediente incorrecto. Nadie lo detecta hasta que alguien toma una decisión
clínica con ellos.

Dos pasos, ambos obligatorios, ninguno omitible:

### Paso 1 — NOVA siempre pide el código CC-PAC-

Antes de procesar cualquier documento, NOVA solicita el código del paciente
destinatario. **Siempre. Sin excepción y sin valor por defecto.**

- El código es identificador único: no admite ambigüedad como sí la admite un nombre.
- Nunca se infiere del documento, del nombre de archivo, ni del paciente abierto
  en pantalla.
- Sin código válido → no se procesa.

### Paso 2 — El nombre impreso debe coincidir con el del CC

La visión extrae el nombre del paciente tal como aparece impreso en el estudio y
se compara contra el nombre registrado bajo ese código CC-PAC-.

| Resultado | Acción |
|---|---|
| Coinciden | Continuar al flujo normal |
| **No coinciden** | **DETENER.** No escribir nada. Mostrar ambos nombres y el código. |
| Nombre ilegible o ausente en el documento | Detener y pedir confirmación explícita del médico |

**Ante discrepancia no se resuelve por similitud, ni se elige el más parecido, ni
se continúa con advertencia.** Se detiene.

Contexto que hace esto necesario: homónimos, apellidos compuestos, nombres
abreviados por el laboratorio ("Rodriguez N., V.I."), y pacientes con parentesco
que comparten apellidos. En este portal ya hay dos pacientes distintas homónimas
de [paciente real 000006] — precisamente el caso que esta validación existe para atrapar.

La validación es barata: dos comparaciones. El error que previene no es recuperable
una vez que un tercero tomó una decisión clínica sobre datos ajenos.

---

## 4. Extracción — reglas

### 4.1 Nunca inventar
Si un valor está borroso, cortado, tapado por un dedo o ilegible: **omitirlo y
marcarlo como no legible.** No inferir por contexto, no completar por rango típico,
no promediar.

> Regla §3.4 del spec base: preferir dato incompleto antes que dato incorrecto.
> Un analito faltante es visible y recuperable. Uno mal leído entra al expediente
> como dato clínico válido.

### 4.2 Fecha del estudio
Se extrae del documento. **Nunca `new Date()`.**

Formato ambiguo (`11/06/2026` → MX 11 junio vs US 6 noviembre): presentar la
interpretación al médico para confirmar. No resolver por heurística.

Es el caso normal que el paciente traiga estudios de meses atrás — ese es
justamente el valor basal.

### 4.3 Campos por analito
Extraer: nombre literal, valor, unidad, rango de referencia impreso, y si el propio
reporte lo marca fuera de rango.

`Analito` (`fldOCskUJcaJZPo42`) = **texto literal del laboratorio**, sin normalizar.
Es evidencia NOM-004 y nunca se sobrescribe.

### 4.4 Confianza
| Situación | Confianza |
|---|---|
| Match exacto contra catálogo + lectura nítida | `Alta` |
| Match por sinónimo, o lectura de foto | `Media` |
| Sin match en catálogo | vacía (y sin `Parametro`) |

**Default para todo lo extraído por visión: `Media`.** Sube a `Alta` solo tras
revisión del médico. Esto permite distinguir después qué revisó una persona y qué
salió de un parser — sin esto, en tres semanas no se pueden separar.

`Origen del dato` (`fldhxDOtqdsGosB0h`) = `Laboratorio`.

### 4.5 Banderas clínicas
- `fldsHApnN6uJv3p1r` = **Relevante a patología**
- `fldq7n3GoSgwgjtLo` = **Es crítico**

Son banderas clínicas, no flags del motor de gráficas. **No hardcodear a `true`.**
Marcar solo cuando el valor lo amerite; una bandera puesta en todo no informa nada.

---

## 5. PDF vs fotografía

No son el mismo problema.

**PDF nativo:** texto seleccionable, lectura confiable.

**Fotografía:** reflejos, sombras, enfoque parcial, páginas incompletas, recortes.
Requisitos adicionales:

- Si la imagen está borrosa o mal encuadrada → **pedir otra foto**, no adivinar.
- Detectar y avisar si el reporte parece tener más páginas de las subidas
  (numeración "1 de 3", secciones que cortan a media tabla).
- Toda extracción desde foto entra con `Confianza: Media` como mínimo, sin excepción.

**Nunca reportar éxito silencioso sobre una extracción parcial.** Si de 45 analitos
se leyeron 30, decirlo explícitamente: "30 de ~45 extraídos, 15 ilegibles".

---

## 6. Idempotencia

Antes de crear, verificar existencia por **paciente + fecha del estudio + analito**.

- Ya existe con el mismo valor → omitir.
- Ya existe con valor distinto → **no sobrescribir**; avisar al médico y dejar que decida.
- No existe → crear.

Sin esto, cada reintento (frecuente con fotos) duplica la serie y las gráficas salen
con puntos repetidos.

---

## 7. Datos reales

Los 22 pacientes en el portal se usan hoy para probar, pero **no son ficticios**:
son expedientes clínicos de personas identificables, bajo LFPDPPP. Incluyen
familiares del médico tratante.

Implicaciones:
- El adjunto original se conserva vinculado (`fldzypVKZBBQ6GQxz` → NOVA LABS) como
  evidencia NOM-004. La extracción no reemplaza al documento fuente.
- Retención mínima 5 años.
- `Confianza` es el mecanismo para distinguir dato verificado de salida de parser.

---

## 8. Orden de ejecución

1. Arreglar fecha (§0.1) — bloqueante
2. Arreglar idempotencia (§0.2) — bloqueante
3. Quitar hardcode de `Relevante a patología` (§0.3)
4. Smoke-test de claves mixtas nombre/ID con un estudio de prueba
5. Extracción por visión + pantalla de confirmación
6. Prueba con un PDF nítido de un solo paciente
7. Prueba con fotografía deliberadamente mala — **verificar que falle ruidosamente**
8. Ampliar al resto

El paso 7 no es opcional. El modo de fallo que importa no es que el sistema falle;
es que lea mal y no lo diga.
