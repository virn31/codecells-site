# SPEC — Migración de expedientes existentes (manual y asistida)

**Estado:** especificación, NO implementada. Escrita 2026-10-19 a partir de las decisiones de Víctor.
**Fase:** portal clínico (fase 2). Requisito previo para el canal Regene Global.
**Validar con el abogado antes de construir:** §5 (consentimiento y firma) y §7 (preguntas abiertas).

---

## 1. Qué es y por qué

Un médico que se afilia ya tiene expedientes: en papel, en fotos, en PDF o en otro software. La migración los pasa al expediente de CODE CELLS sin perder lo que vale como evidencia: **el documento original, la fecha real del documento y quién lo migró, cuándo y cómo.**

Hay dos modalidades:

| Modalidad | Quién la hace | Costo para el médico |
|---|---|---|
| **Manual** | El propio médico o su personal, en su consultorio, desde un botón exclusivo | Incluida en el plan (solo cuenta el almacenamiento por GB) |
| **Asistida** | Personal de CODE CELLS contratado y capacitado | Servicio con costo extra (propuesta: ~$50 + IVA por paciente) |

Ambas usan **el mismo flujo y dejan la misma constancia**. Lo único que cambia es quién captura.

## 2. Relación con las reglas de CLAUDE.md

Hoy CLAUDE.md §7 dice que kiosco y consulta son las **dos únicas vías** de creación de expediente, y que el dictado es una tercera vía de **llenado**. La migración es una **vía nueva de creación** y necesita su propia regla.

**Texto propuesto para CLAUDE.md §7** (pendiente de aprobación de Víctor):

> **Regla dura — migración de expedientes: se conserva, no se reescribe.** La migración (manual o asistida) es la tercera vía autorizada de creación de expediente. El documento original se guarda sin modificar y con su huella digital (hash). Todo registro creado por migración lleva `Origen: Migración`, la fecha del documento original tal como aparece en él (vacía con aviso si no se lee; nunca la fecha de hoy) y la constancia de migración a la que pertenece. NOVA puede **proponer** valores leídos de un documento migrado, pero nada entra al expediente sin que el médico lo confirme. Ante discrepancia de identidad entre el documento y el paciente, la migración de ese documento **se detiene**.

## 3. El botón

- En el portal médico, dentro del expediente del paciente: **"Migrar expediente existente"**. Separado de "Nueva consulta" y de "Subir estudio", con su propio color e ícono, para que nunca se confunda una migración con un acto clínico de hoy.
- También desde la lista de pacientes: **"Migrar paciente nuevo"**, que primero da de alta la identidad del paciente (§4, paso 1).
- Solo médicos con `Tipo de acceso = Clínico`. El personal de migración entra con un rol propio (§6), nunca con la sesión del médico.

## 4. Flujo

1. **Identidad del paciente.** Nombre completo y fecha de nacimiento (obligatorios), CURP y teléfono (opcionales). Si se parece a un paciente que ya existe, se muestra y el médico decide; nunca se fusiona por parecido.
2. **Consentimiento de migración** (§5). Sin consentimiento firmado no se puede subir nada.
3. **Carga de documentos.** Cada archivo se clasifica:
   - Nota clínica / historia clínica
   - Estudio de laboratorio
   - Estudio de imagen
   - Receta
   - Consentimiento informado (de un procedimiento)
   - Foto clínica: preoperatoria / postoperatoria / seguimiento
   - Otro

   El médico captura la **fecha del documento original**. Si no la conoce, el campo queda vacío con aviso ("fecha desconocida"); nunca se pone la fecha de hoy.
4. **Lectura opcional con NOVA** (solo laboratorio y notas). NOVA propone valores con su cita literal del documento; el médico marca cuáles acepta. Lo no aceptado no se escribe. El documento original queda guardado aunque no se acepte nada.
5. **Revisión y cierre.** Pantalla de resumen: documentos, fechas, valores aceptados. El médico (o el capturista, en la asistida) confirma. Se genera la **constancia de migración** (§5.3).

Se puede pausar y continuar después: la migración queda "En curso" hasta el cierre, y sus documentos no aparecen en el expediente hasta entonces.

## 5. Consentimiento y constancia

### 5.1 Consentimiento del paciente
- Texto versionado (por ejemplo, "Consentimiento de migración v1.0"). Explica qué se migra, a dónde, para qué, quién tendrá acceso, cuánto tiempo se conserva (NOM-004) y cómo ejercer sus derechos ARCO.
- Se firma en el consultorio en pantalla (tableta o celular): trazo de la firma + nombre escrito.
- Si el paciente no está presente (expedientes antiguos), lo decide el abogado (§7.1).

### 5.2 Declaración del médico
Casilla obligatoria con texto versionado: *"Declaro que los documentos que migro son copia fiel de los que obran en mi poder y que el paciente autorizó su migración."*

### 5.3 Metadatos de la constancia (se guardan siempre)

| Campo | Contenido |
|---|---|
| Folio de migración | Identificador único |
| Paciente | Código CC-PAC- |
| Médico responsable | Código CCMED- y cédula |
| Modalidad | Manual / Asistida |
| Capturista | En la asistida: la persona de CODE CELLS que capturó |
| Inicio y cierre | Fecha y hora del **servidor**, zona America/Mazatlan |
| Dispositivo | Navegador y sistema (user agent) |
| Dirección IP | La de cada firma y del cierre |
| Consentimiento | Versión del texto, imagen de la firma, nombre escrito, fecha y hora, hash |
| Declaración del médico | Versión del texto, fecha y hora |
| Documentos | Por cada uno: tipo, nombre original, tamaño, **hash SHA-256**, fecha original capturada, quién lo subió |
| NOVA | Qué valores propuso y cuáles aceptó el médico |
| Resultado | Número de documentos y de registros creados (contados por lo que confirmó la base de datos, no por lo intentado) |

La constancia **no se edita ni se borra**. Una corrección posterior es un registro nuevo que apunta a la constancia original.

## 6. Personal de migración (modalidad asistida)

- Rol propio (`capturista`), con acceso **solo a las migraciones que el médico le asignó**, mientras estén "En curso". No ve el resto del expediente ni puede leer pacientes por su cuenta.
- Todo lo que hace queda en la constancia y en la bitácora `ACCESOS_EXPEDIENTE`.
- **Capacitación obligatoria antes de dar acceso:** NOM-004, LFPDPPP y confidencialidad (con carta firmada), verificación de identidad, clasificación de documentos, qué hacer ante una discrepancia (detenerse y avisar al médico).
- El cierre de una migración asistida lo confirma **el médico**, no el capturista.

## 7. Preguntas para el abogado

1. Expedientes de pacientes que ya no acuden: ¿se pueden migrar sin firma nueva del paciente, bajo la obligación de conservación del médico, o hace falta su consentimiento?
2. ¿Basta firma electrónica simple (trazo + metadatos + hash), o conviene una constancia de conservación con sello de tiempo de un prestador certificado (NOM-151-SCFI-2016)?
3. Fotos clínicas (rostro, cuerpo): ¿requieren un consentimiento específico aparte?
4. Contrato con el personal de migración (encargado del tratamiento) y transferencia a los proveedores de almacenamiento (Cloudflare, Backblaze).

## 8. Requisitos técnicos previos

- **Almacenamiento de originales** (Cloudflare R2 + respaldo en Backblaze B2), cifrado, con enlaces de acceso que caducan. Hoy no existe (ver `docs/VALUACION-2026-10-19.md` §4.A).
- **Base clínica fuera de Airtable** antes de migraciones a escala (50 000 registros por base).
- Tablas nuevas: `MIGRACIONES` (constancia) y `DOCUMENTOS_MIGRADOS` (un registro por archivo, con hash y enlace al original).
- El almacenamiento que ocupan los originales cuenta para los GB del plan del médico.

## 9. Pruebas mínimas antes de liberar

- Sin consentimiento firmado → no se puede subir ningún documento.
- Documento sin fecha legible → queda vacía con aviso; nunca la fecha de hoy.
- Valor propuesto por NOVA y no aceptado → no existe en el expediente.
- Hash guardado = hash del archivo descargado después.
- Capturista intenta abrir un paciente no asignado → 403 y registro en bitácora.
- Discrepancia de nombre entre el documento y el paciente → se detiene ese documento.
- El conteo final cuenta registros confirmados por la base de datos.
