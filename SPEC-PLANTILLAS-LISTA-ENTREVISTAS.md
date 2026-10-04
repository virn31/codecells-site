# SPEC — Plantillas por especialidad — Lista para entrevistas

**Fecha:** 2026-10-03
**Estado:** skeleton, a completar durante entrevistas de la próxima semana
**Base:** `appCQ0RdhqFMGxWL5` (prueba). Nada de esto existe aún en producción.
**Contexto:** `SPEC-FASE2-PLANTILLAS-ESPECIALIDAD.md` (arquitectura) y
`SPEC-MOTOR-GRAFICAS.md` (motor).

Cómo leer cada plantilla:
- **Bloques** = opciones del campo `Bloques` de `PLANTILLAS_ESPECIALIDAD`.
  Hoy solo `bloque_formula_gpca`, `bloque_semaforo` y `bloque_vigencias` tienen
  lógica existente (panel prenatal); los `grafica_*` nuevos están declarados
  pero sin implementar — una plantilla que los pida no dibuja nada hasta que
  se programen.
- **Requiere** = opciones del campo `Requiere`. Regla propuesta: tipos
  distintos con Y (mujer Y embarazada), rangos de edad entre sí con O.
- **Tabla** = dónde se guardan los antecedentes de esa especialidad. Las
  cuatro nuevas tienen el mismo esqueleto: ID Antecedente · Paciente ·
  Código de paciente ref · Categoría (Evento / Resultado / Antecedente) ·
  Tipo de evento · Fecha del evento · Resultado · Registrado por · Fecha de
  registro (automática) + campos propios.

---

## Plantilla 1: OBSTETRICOS (validada)

- **Bloques:** bloque_formula_gpca, bloque_semaforo, bloque_vigencias,
  grafica_presion_arterial (así quedó en Airtable)
- **Requiere:** mujer, embarazada
- **Parámetros:** G/P/C/A, embarazos, estudios de imagen
- **Tabla:** `ANTECEDENTES_OBSTETRICOS` (`tblkoqYv4ASLFkzsp`) — registrada en
  `api/airtable.js`, captura desde el kiosco, lectura en Control prenatal.
- **Estado real:** implementada y probada en la base de prueba (Mariana
  CC-PAC-200001, G2 P1 C0 A0). Validada por Víctor; conviene confirmarla con
  un ginecólogo afiliado en las entrevistas.
- **Preguntas abiertas para ginecología:**
  1. ¿La plantilla "Ginecología (no embarazada)" (sin `embarazada`) se usa?
     ¿Qué bloques llevaría?
  2. ¿Periodicidades correctas? Hoy: Papanicolaou 36 meses, VPH 60, mastografía
     12 desde los 40.
  3. ¿El intervalo intergenésico corto se alerta en < 18 meses?

## Plantilla 2: CARDIOLOGICOS (por llenar)

- **Bloques:** [a completar en entrevista]
- **Requiere:** [a completar en entrevista]
- **Parámetros clave esperados:** FEVI, presión arterial, frecuencia cardíaca
- **Tabla creada:** `ANTECEDENTES_CARDIOLOGICOS` (`tblcoKd7HTbOYwQH6`) —
  campos propios: FEVI (%), PA sistólica (mmHg), PA diastólica (mmHg).
  NO registrada en `api/airtable.js` todavía.
- **Preguntas para la entrevista:**
  1. ¿Qué eventos registra siempre? (infarto, stent/angioplastia, cirugía
     cardiaca, arritmia, marcapasos/DAI, insuficiencia cardiaca, EVC…) →
     lista cerrada para `Tipo de evento`.
  2. ¿Qué estudios y con qué periodicidad? (eco, prueba de esfuerzo, Holter…)
     → `bloque_vigencias`.
  3. FEVI: ¿umbrales de color? (ej. ≥ 50 verde, 41–49 amarillo, ≤ 40 rojo)
     → zonas de `grafica_fevi`.
  4. ¿La presión arterial la quiere de la consulta (ya existe) o de la tabla?
  5. ¿Qué luces debería tener su semáforo?

## Plantilla 3: PULMONARES (por llenar)

- **Bloques:** [a completar en entrevista]
- **Requiere:** [a completar en entrevista]
- **Parámetros clave esperados:** FEV1, FVC, paquetes-año
- **Tabla creada:** `ANTECEDENTES_PULMONARES` (`tblupTrtox6bw7I7I`) —
  campos propios: FEV1 (%), FVC (%), Paquetes-año. NO registrada en
  `api/airtable.js` todavía.
- **Preguntas para la entrevista:**
  1. FEV1 y FVC: ¿% del predicho, litros, o ambos? (hoy: % del predicho)
  2. ¿FEV1/FVC se calcula o se captura? (regla del motor: lo calculable no se
     le pide al médico).
  3. Eventos que importan: asma, EPOC (¿con GOLD?), tuberculosis, neumonías,
     COVID grave, oxígeno domiciliario…
  4. ¿Umbrales para colorear FEV1? ¿Cada cuánto repite la espirometría?

## Plantilla 4: UROLOGICOS (por llenar)

- **Bloques:** [a completar en entrevista]
- **Requiere:** [a completar en entrevista]
- **Parámetros clave esperados:** PSA, síntomas, estudios
- **Tabla creada:** `ANTECEDENTES_UROLOGICOS` (`tblrr4JvdHDCGmBsD`) —
  campo propio: PSA (ng/mL). NO registrada en `api/airtable.js` todavía.
- **Preguntas para la entrevista:**
  1. PSA: ¿umbral por edad? ¿le importa más la velocidad de cambio que el
     valor? (el motor ya soporta reglas de tendencia).
  2. ¿PSA libre / cociente libre/total?
  3. Síntomas: ¿usa IPSS? Si sí, es un score → va como parámetro calculado.
  4. Estudios: USG prostático (volumen), biopsia, uroflujometría…
  5. ¿Requiere "hombre"? → hoy no existe esa opción en `Requiere`.

---

## Antes de pasar cualquier plantilla nueva a la app

1. Registrar su tabla en `api/airtable.js` (`TABLAS_PERMITIDAS`,
   `CAMPO_DUENIO`, `TABLAS_EXPEDIENTE_MEDICO`, `NUCLEO_CLINICO_TABLAS`) y
   forzar `Registrado por` en el servidor, como en obstetricia.
2. Decidir dónde viven los valores graficables (FEVI, FEV1, PSA): en la tabla
   de antecedentes o en `LAB_VALORES` (recomendado en la SPEC Fase 2).
3. Crear sus códigos en `CATALOGO_PARAMETROS` (con zonas acordadas en la
   entrevista) y enlazarlos a la plantilla.
4. Cubrirla en el aviso de privacidad clínico (todavía no existe).

## Huecos detectados al armar esto

- `Requiere` no tiene `hombre` (urología) ni condiciones por patología fuera
  de embarazo (ej. "hipertenso", "EPOC").
- Los rangos de edad se tocan en 40 y 65: falta decidir a cuál pertenecen.
- `Categoría` (Evento / Resultado / Antecedente) es distinta de la de
  obstetricia (Evento obstétrico / Estudio ginecológico): el formulario
  genérico tendrá que leer las opciones de cada tabla, no asumirlas.
- La tabla obstétrica usa `Tipo de evento` como lista cerrada; las nuevas, como
  texto libre. Para graficar o contar eventos hace falta lista cerrada —
  definirla en cada entrevista (pregunta 1 de cada especialidad).
