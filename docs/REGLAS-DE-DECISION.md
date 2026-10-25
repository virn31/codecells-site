# Reglas de decisión — qué se decide sin esperar a Víctor

> **Propósito.** Víctor trabaja solo y no puede revisar cada paso. Este documento dice qué decisiones ya están autorizadas de antemano, para que el trabajo (de Claude o de cualquier persona que entre al proyecto) no se detenga esperando su visto bueno.
> **Estado:** BORRADOR propuesto el 2026-10-20. Entra en vigor cuando Víctor lo apruebe. Él puede mover cualquier punto de categoría.
> Se apoya en `CLAUDE.md`, que siempre manda sobre este documento.

---

## Categoría A — Se decide y se hace; se informa al cierre

Lo técnico, reversible y que no cambia lo que ve un médico o un paciente en producción.

- Corregir errores, fallas de seguridad y lecturas que no distinguen "sin datos" de "error" (CLAUDE.md §6).
- Escribir y correr pruebas; refactorizar sin cambiar el comportamiento.
- Elegir librerías, estructura de código y nombres internos.
- Implementar lo que ya está en una SPEC aprobada, siguiendo esa SPEC.
- Crear tablas y campos en la **base de prueba**.
- Commits en ramas de trabajo (nunca en `main`).
- Documentación: CONTINUAR, inventarios, specs nuevas (como borrador).
- Investigación de mercado, proveedores y precios (con fuente y fecha).

**Cómo se informa:** un resumen al final de la sesión y en `docs/CONTINUAR.md`.

## Categoría B — Se propone, se sigue avanzando, y Víctor puede vetar

Decisiones con impacto en el producto, pero que se pueden cambiar después sin costo alto.

- Textos de pantallas y mensajes al médico o al paciente (sin promesas clínicas ni legales).
- Diseño visual que siga la línea de `index.html`.
- Orden de las tareas dentro de una etapa ya aprobada.
- Valores por defecto razonables cuando una SPEC no dice nada (se anotan en la SPEC).
- Proveedores técnicos de bajo costo (menos de 50 USD al mes) dentro de lo ya aprobado (por ejemplo, almacenamiento R2).

**Cómo funciona:** se anota en la **bandeja de decisiones** de `docs/CONTINUAR.md` con la opción elegida y el porqué. El trabajo sigue con esa opción. Si Víctor no la veta en su siguiente revisión, queda aprobada.

## Categoría C — Solo Víctor (el trabajo de ESA parte se detiene; lo demás sigue)

- **Producción:** fusionar a `main`, desplegar a codecells.mx, quitar el congelamiento (`DESCONGELAR_PRODUCCION`).
- **Dinero:** precios, descuentos, contratar personas o servicios de más de 50 USD al mes, pagos.
- **Legal:** aviso de privacidad, contratos, responsivas, consentimientos, todo lo que vaya al abogado.
- **Clínico:** reglas de qué ve o hace un médico o un paciente con el expediente; cambios a CLAUDE.md §4–§7.
- **Datos reales:** borrar, mover o corregir registros de producción; tocar pacientes reales.
- **Alianzas y terceros:** Regene Global, médicos piloto, comunicación con médicos.
- **Accesos:** dar o quitar acceso al sistema a una persona.

**Cómo funciona:** se anota en la bandeja como "esperando a Víctor". Mientras tanto se trabaja en otra tarea que no dependa de ella. Nunca se detiene todo por una sola decisión.

---

## La bandeja de decisiones

Vive en `docs/CONTINUAR.md`. Cada entrada lleva:
- **Qué hay que decidir**, en una línea.
- **Opciones** (máximo 3) con una **recomendación**.
- **Qué se bloquea** mientras no se decida.
- **Categoría** (B o C).

**Ritmo propuesto:** Víctor la revisa **dos veces por semana, 20–30 minutos**. Contesta con el número y la opción ("3: B"). Las decisiones B no vetadas quedan aprobadas.

## Si entra otra persona al proyecto

Recibe este documento, `CLAUDE.md` y `docs/CONTINUAR.md`. Puede trabajar sola en A y B. En C anota en la bandeja y sigue con otra cosa.

## Responsabilidades ya fijadas por Víctor (no se vuelven a preguntar)

- La migración de expedientes es responsabilidad total del médico: él informa a sus pacientes. CODE CELLS solo resguarda; el contenido es del médico (2026-10-20).
- Precios: Red $600 y Clínico $1,100 con IVA. El tope de NOVA es por paciente. La migración asistida se cobra aparte. El almacenamiento se cobra por GB (2026-10-19).
- Primero arrancamos solos. Regene entra solo con infraestructura para 1,000 médicos y no cobra comisión (2026-10-19).
- Producción sigue congelada mientras se actualiza codecells.mx (2026-10-19).
- Todo lo de CLAUDE.md y la sección "Ya decidido" del CONTINUAR del portal (`feat/paciente-unico`).
