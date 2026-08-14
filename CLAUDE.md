# CODE CELLS® — The Biological Network

Contexto para trabajar en este repositorio. Léelo antes de proponer arquitectura o
tocar autorización, expedientes o datos clínicos.

---

## 1. Qué se está construyendo

Este repositorio es la plataforma clínica de CODE CELLS®, una red de medicina
regenerativa y biológica que opera bajo GALONAVA GROUP en Culiacán, Sinaloa.
Es la primera implementación de lo que internamente se llama **CCOS™** — el sistema
operativo de la red. El portal, NOVA, el expediente, el motor de gráficas y el
directorio son módulos de ese sistema, no características sueltas de un sitio web.

**No es una clínica digitalizada.** Es infraestructura para conectar médicos que hoy
trabajan aislados.

---

## 2. El problema que resuelve — esto determina el diseño

En la medicina actual un paciente es visto por tres, cuatro o más médicos que no se
comunican entre sí. Se repiten estudios, se contradicen tratamientos, y el paciente
es el que menos entiende cómo se le está manejando y por qué.

The Biological Network invierte eso:

- **El paciente decide con quién va.** No pertenece a un médico.
- **Su expediente lo acompaña** cuando cambia de médico.
- **El paciente es responsable de sus citas y medicamentos**, con NOVA ayudándole.
- **El médico responde por lo que le toca en cada consulta**, no por el paciente
  completo de forma indefinida.
- **El paciente llega educado.** NOVA le dio información, recabó sus datos, los
  documentó en el expediente y alertó al médico, que ya está preparado para recibirlo.

### Consecuencia directa para el código

Un modelo donde el paciente "pertenece" a un médico es **incorrecto** para este
sistema. Codifica justo lo que el producto existe para romper. La responsabilidad se
ancla a la **consulta** (que lleva firma y cédula), no al expediente.

---

## 3. Modelo económico

- La plataforma cobra **28 USD mensuales por uso** al médico afiliado.
- La consulta la cobra el médico en su consultorio, con su propio precio. La
  plataforma no se interpone entre médico y paciente en lo económico.
- Consultas en línea: esquema de comisiones por definir.

Esto explica por qué CODE CELLS® **no obliga** a ningún médico afiliado a ofrecer
tratamientos específicos ni a dominar los cinco sistemas. Se vende infraestructura,
no pacientes ni protocolos.

---

## 4. Autorización — la regla más importante del sistema

Un token de médico (`CCMED-`) puede ver **exactamente cuatro** conjuntos de pacientes:

1. Los que él generó (registró directamente).
2. Los que NOVA le asignó vía solicitud desde el directorio público.
3. Los que vio en interconsulta (atención conjunta registrada).
4. Los pacientes demo (`Es demo` = true), en **solo lectura**.

**Nada más.** Sin excepciones por nivel de certificación, por antigüedad ni por ser
fundador. Los cofundadores están sujetos a la misma regla que cualquier afiliado.

### Reglas de acceso

- El acceso es **acumulativo y no se revoca**. Un médico que atendió a un paciente
  conserva ese acceso; solo una orden judicial lo modifica.
- **Nunca se borra un expediente**, ni a petición del paciente. NOM-004 obliga a
  conservarlo mínimo cinco años y es evidencia médico-legal que protege al médico.
  La LFPDPPP reconoce que el derecho de cancelación cede ante obligación legal de
  conservación.
- **Enumerar la tabla de pacientes nunca es legítimo**, en ningún modelo ni para
  ningún rol.
- El `filterByFormula` que manda el cliente se **ignora y se reemplaza** en el
  servidor, nunca se concatena. Concatenar permite reabrir todo con un `OR()`.
  El bloque que ya hace esto bien para roles `paciente` y `vip` es el patrón a copiar.
- Las **escrituras** se acotan igual que las lecturas. Un modelo donde un médico no
  puede leer un expediente pero sí modificarlo es peor que uno abierto, porque nadie
  lo razona bien. Excepción: crear un paciente nuevo se asigna al médico del token.
- La intención viaja en **parámetros explícitos**, nunca inferida parseando el filtro
  del cliente.

---

## 5. Los datos son de personas reales

Los expedientes de este sistema corresponden a personas identificables bajo LFPDPPP,
incluidos familiares del médico tratante. No son datos de prueba aunque se usen para
probar.

- Retención mínima **cinco años** (NOM-004).
- `CC-PAC-714638` — caso único de verificación del motor de gráficas. No borrar.
- `CC-PAC-635281` (Abel) — familiar con consentimiento, caso control de la curva de
  peso. Su línea temporal debe quedar limpia.
- Los pacientes demo (`CC-PAC-DEMO01`–`DEMO07`, `CC-PAC-9900xx`) sí son ficticios,
  llevan `Es demo` = true, y deben excluirse de estadísticas, exportes, auditoría
  NOM-004, **recetas digitales**, Google Calendar y alertas de Telegram. Una receta
  con cédula profesional emitida sobre un paciente ficticio es un problema
  regulatorio, no una molestia de datos.
- Los códigos demo **no deben poder iniciar sesión** como paciente: aparecen en
  capturas y presentaciones, y un token de 24 h en una diapositiva es una credencial
  publicada.
- Los códigos de paciente pueden contener **letras** (`CC-PAC-DEMO03`). Cualquier
  validación nueva de `pacienteCode` debe contemplarlo.

---

## 6. El principio que más se viola en este repositorio

**Nunca presentes como confirmado lo que no lo está.**

Ha aparecido cuatro veces en sitios distintos:

- Un conteo que reportaba "5 de 5 fechas guardadas" contando cabeceras creadas, no
  valores escritos.
- Una pestaña que renderizaba antecedentes, alergias y medicamentos inventados cuando
  Airtable no respondía, contradiciendo al auditor NOM-004 en la misma pantalla.
- Una clasificación por categoría que adivinaba con `includes('alt')`, mandando
  "Altura de fondo uterino" a Función Hepática.
- NOVA reportando que guardó un estudio cuando el handler había devuelto 403.

Reglas que se derivan:

- Un fallo debe verse como fallo. **Falla ruidosamente.**
- Distingue "sin datos" de "error al leer". Un fallo de red mostrado como expediente
  limpio es una mentira silenciosa.
- No adivines por coincidencia de texto lo que puede resolverse por identificador.
- Un estado vacío se muestra vacío. Nunca lo rellenes con datos plausibles.
- Cuenta lo confirmado por la API, no lo intentado.

---

## 7. Reglas duras de datos clínicos

Estas ya están probadas en producción y no se negocian:

- **`Analito` nunca se sobrescribe.** Es el texto literal del laboratorio y constituye
  evidencia bajo NOM-004.
- **Si `Parametro` está vacío, no se grafica.** El registro existe en el expediente
  pero no entra al motor.
- Solo `Confianza` **Alta** o **Media** se grafican.
- **Preferir gráfica incompleta antes que gráfica incorrecta.** Un dato faltante es
  visible y recuperable; uno mal leído entra al expediente como dato clínico válido.
- Nunca inventar valores al extraer un estudio. Si algo está borroso o ilegible, se
  omite y se marca.
- Volcar un estudio al paciente equivocado es error clínico y violación LFPDPPP
  simultáneamente, y es invisible. Ante discrepancia de identidad **se detiene**, no
  se resuelve por similitud.

---

## 8. Airtable — lecciones que cuestan sesiones enteras

- Los campos `link` se pueblan **por API con record IDs**, nunca por CSV. Airtable
  parsea los link por coma, y un analito con coma en el nombre rompe el vínculo en
  silencio.
- **`ARRAYJOIN()` sobre un link devuelve el campo primario de la tabla vinculada, no
  el record ID.** `FIND(recId, ARRAYJOIN({Link}))` nunca hace match. Usar
  `OR(RECORD_ID()="rec...", ...)`.
- `date` ≠ `dateTime`. Comparar un string contra un campo `date` devuelve cero filas
  **sin error**. Envolver en `DATESTR()`.
- `get_table_schema` devuelve IDs y tipos, **nunca nombres** de campo. Para resolver
  un nombre: escribir un valor en un registro desechable y consultarlo por nombre en
  `resultFieldIds`. Un nombre inexistente se **ignora en silencio**, así que un
  resultado vacío es ambiguo — la prueba tiene que ser positiva.
- `search_records` hace match **difuso**, incluso con comillas. Nunca usarlo para
  verificar existencia o idempotencia: usar `filterByFormula` exacto.
- Referenciar campos **por ID**, no por nombre, para sobrevivir renombres.

---

## 9. Cómo se trabaja aquí

- Víctor es médico y aprende desarrollo sobre este proyecto. Explica el porqué, no
  solo el qué.
- **Cambios quirúrgicos con verificación antes de commitear.** Nada a medias.
- Prefiere honestidad directa sobre diplomacia. Si algo está mal planteado, dilo.
- Muestra el diff antes de commitear cuando el cambio toca autorización, datos
  clínicos o más de un archivo.
- No asumas que un cambio funciona porque pasa `node --check` y los tests. Si la
  función tocada no tiene cobertura, dilo explícitamente.
- Ramas separadas por tema. No montes cambios de autorización sobre una rama de
  ingesta a medio terminar.
- Los pendientes van a memoria de proyecto, no solo al mensaje del commit.

---

## 10. Aliados y contexto de negocio

**Regene Global** (Jorge Torres, CEO — `CCMED-JORGE01`) es la alianza biotecnológica
estructural del proyecto, no solo un proveedor. Aporta la capacidad regenerativa;
CODE CELLS® aporta la red clínica, la metodología y la tecnología. Jorge **no es
médico**: su acceso al portal es para demostrar el sistema a la red de Regene Global,
por lo que solo debe alcanzar pacientes demo, nunca expedientes reales.

Por eso los demos importan tanto: son material de demostración ante médicos, y deben
ser clínicamente creíbles. Uno de ellos muestra deterioro progresivo a propósito
(nefrología, ERC 3a→3b). Si los siete mostraran mejoría, el portal se leería como
folleto publicitario y perdería credibilidad justo ante la audiencia que importa.

**Cofundadores:** Dr. Víctor Iván Rodríguez Nava (`CCMED-VIRN01`, Director Médico),
Dr. Juan Carlos Galván López (`CCMED-JCG01`, Codirector Médico), Lic. Pavel Galván
López (Director Comercial y Representante Legal).

CODE CELLS® **no verifica** la competencia individual de cada médico por herramienta.
El médico declara bajo su propia responsabilidad clínica lo que ofrece. Su nivel
interno (Asociado / Certificado / Senior / Partner) **nunca se muestra a pacientes**
ni en el directorio público.
