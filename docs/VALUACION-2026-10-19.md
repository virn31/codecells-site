# Valuación, costo por médico y lo que falta contemplar — CODE CELLS™ (2026-10-19)

> Paso 4 del orden de valuación. Se apoya en `docs/INVENTARIO-2026-10-19.md` y `docs/PRECIOS-MERCADO-2026-10-19.md`.
> Etiquetas: **verificado** (comprobado en código o fuente oficial hoy) · **secundario** (blog/comparativa) · **dato de Víctor** · **estimado** (juicio de Claude, con supuestos explícitos) · **cotizar** (no hay dato confiable; pedir precio).
> Tipo de cambio de referencia: 18.49 MXN/USD (FIX Banxico 16-oct-2026).

---

## 1. Valor de reposición (cuánto costaría rehacer lo construido)

No es el valor de la empresa: hoy no hay ingresos ni usuarios. Es lo que costaría pagar a un equipo tradicional para construir lo mismo.

**Horas estimadas (estimado, por módulo, equipo tradicional sin IA):**

| Módulo | Horas | Dónde está |
|---|---|---|
| Sitio público, presentación con audio, traducción ES/EN/PT | 120–200 | Producción |
| Directorio + lectura pública con lista blanca | 60–100 | Producción |
| Portal médico (expediente, consultas, labs, gráficas) | 400–700 | Producción |
| Autenticación, roles, acceso restringido, bitácora | 120–200 | Producción |
| NOVA (21 acciones, chat, lectura de estudios) | 250–400 | Producción |
| Bot de Telegram | 80–150 | Producción |
| Kiosco y portal del paciente (VIP / mi-nivel) | 150–250 | Producción |
| Modelo de datos (30 tablas) | 60–100 | Producción |
| Agenda (no funciona) y capacitación (en pausa) | 80–160 | Producción, crédito parcial |
| **Subtotal en producción** | **1 320–2 260** | |
| App del paciente: identidad/PIN, medicamentos, nutrición, embarazo, control prenatal | 300–500 | Rama sin publicar |
| Dictado (portal + Telegram) y CIE-10 (10 533 códigos) | 200–350 | Rama sin publicar |
| Motor de gráficas y catálogo de labs | 100–180 | Rama sin publicar |
| Auditorías de seguridad, ambientes, ~360 pruebas | 200–350 | Rama sin publicar |
| **Subtotal sin publicar** | **800–1 380** | |
| **Total** | **2 120–3 640 h** | |

**Tarifas:** desarrollador senior en México, mediana freelance **38 USD/h** ([Lemon.io](https://lemon.io/rate-calculator/mexico/), secundario); agencia **65–95 USD/h** ([Axented](https://www.axented.com/blog-posts/mexico-software-developer-salaries-2026), secundario, vende el servicio).

| Escenario | Cálculo | USD | MXN |
|---|---|---|---|
| Bajo | 2 120 h × 38 | ~80 600 | ~1.49 M |
| Base | 2 880 h × 50 | ~144 000 | ~2.66 M |
| Alto | 3 640 h × 65 | ~236 600 | ~4.37 M |

Sin incluir gestión de proyecto, diseño y QA (en un equipo tradicional suman 20–30 % más).

**Contraste (dato de Víctor):** el trabajo real fue **~210–260 horas** en 6 meses, con IA. Esa diferencia (10–15 veces) es el valor del método, y también un riesgo: depende de ti.

**Ajuste honesto:** lo que está en producción vale más que lo que está en la rama, porque la rama no la ha probado ningún médico real. Para inversionistas conviene presentar los dos subtotales por separado.

---

## 2. Costo de IA por médico al mes

### Supuestos (verificado en el código de `feat/paciente-unico`)
- NOVA usa **`claude-sonnet-5`**: 2 USD por millón de tokens de entrada y 10 USD por millón de salida.
- **No usa caché de instrucciones** (`cache_control` no aparece). Cada mensaje vuelve a mandar todas las instrucciones de NOVA (~19 000 caracteres en total para todos los roles, unos 5–6 mil tokens por mensaje).
- Topes vigentes: médico 40 mensajes/día; **cada paciente 20/día**.

### Costo por acción (estimado)
| Acción | Entrada | Salida | USD por acción | Con caché (estimado) |
|---|---|---|---|---|
| Mensaje del médico a NOVA | ~10 000 tokens | ~500 | 0.025 | ~0.011 |
| Mensaje del paciente a NOVA | ~6 000 | ~400 | 0.016 | ~0.007 |
| Consulta dictada (dictado + CIE-10) | ~6 000 | ~2 000 | 0.030 | 0.030 |
| Lectura de un estudio (2–3 páginas) | ~6 000 | ~1 500 | 0.035 | 0.035 |
| Plan nutricional | ~5 000 | ~5 000 | 0.060 | 0.060 |

### Uso por médico al mes (estimado)
| Perfil | Consultas dictadas | Estudios | Mensajes del médico | Pacientes activos × mensajes | **USD/mes sin caché** | **con caché** |
|---|---|---|---|---|---|---|
| Bajo | 40 | 20 | 100 | 20 × 10 | **~8** | ~4 |
| Medio | 100 | 60 | 300 | 50 × 15 | **~26** | ~13 |
| Alto | 200 | 150 | 800 | 100 × 20 | **~67** | ~32 |

**Lo que dice esto:**
- El costo que más crece es **el chat de los pacientes**: depende de cuántos pacientes tiene cada médico, no del médico.
- Con el Plan Clínico de **$890 MXN** con IVA (~41.5 USD sin IVA), un médico medio sin caché deja ~13 USD de margen y un médico alto **genera pérdida**.
- **La caché de instrucciones reduce el costo de IA a la mitad** y es un cambio técnico chico. Debe hacerse antes de lanzar el portal clínico.
- Otras palancas (decisión de Víctor): tope de NOVA para pacientes **compartido por médico** en vez de por paciente; un modelo más económico solo para el chat del paciente; o un plan Clínico Plus para consultorios de alto volumen.
- Todo esto es estimado: **medir el uso real en el piloto** (la API reporta los tokens de cada llamada).

---

## 3. Migración de expedientes (costo único por médico)

Ejemplo: un médico trae 300 pacientes con ~10 páginas cada uno = **3 000 páginas**.

| Concepto | Cálculo | Costo |
|---|---|---|
| Lectura con IA | ~0.013 USD/página (0.0065 en modo por lotes, 50 % menos) | **20–39 USD** (estimado) |
| Guardar los originales | ~300 KB/página → ~0.9 GB | ~0.01 USD/mes en Cloudflare R2 |
| **Revisión humana** | 1–2 min por página (identidad y valores) | **50–100 horas** (estimado) |

**Conclusión:** la IA es barata. **El costo real es la revisión humana**, obligatoria por la regla de no inventar datos y por la verificación de identidad. Hay que venderla como servicio aparte ("migración asistida", con precio por paciente o por página), o limitarla (por ejemplo, solo pacientes activos de los últimos 12 meses).

---

## 4. Lo que todavía no está contemplado

### A. Problemas estructurales (verificado)
1. **Los estudios originales no se guardan.** `medico_subir_estudio` manda el archivo a la IA y guarda solo el texto extraído. Peor: cuando no extrae valores escribe *"Estudio de imagen — ver archivo adjunto"* y **no hay ningún adjunto**. Eso viola la regla de CLAUDE.md §6 (no presentar como existente lo que no existe), y la NOM-004 pide conservar la evidencia. Hace falta almacenamiento de archivos.
2. **Airtable no alcanza para 100 médicos con migración.** El plan Team permite **50 000 registros por base** y **~20 GB de adjuntos** ([JetAdmin](https://www.jetadmin.io/blog/airtable-pricing-in-2026-plans-real-costs-and-when-to-upgrade/amp/), secundario). Un solo médico migrado puede generar ~20 000 valores de laboratorio, así que **2 o 3 migraciones llenan la base**. El plan Business (125 000) solo retrasa el problema. A mediano plazo, la base clínica tiene que pasar a una base de datos de verdad (PostgreSQL administrado).

### B. Costos mensuales nuevos
| Concepto | Para qué | Costo | Etiqueta |
|---|---|---|---|
| Almacenamiento de archivos (Cloudflare R2) | Originales de estudios y expedientes migrados | 0.015 USD/GB/mes, 10 GB gratis, sin cargo por descarga → ~1–2 USD/mes con 100 médicos | verificado ([Cloudflare](https://cloudflare.com/en-ca/products/r2)) |
| Base de datos PostgreSQL administrada | Reemplazo de Airtable para lo clínico | ~25 USD/mes (orden de magnitud) | estimado, cotizar |
| Respaldos externos automáticos | Conservación de 5 años (NOM-004) | Pocos USD/mes en el mismo almacenamiento | estimado |
| Monitoreo de errores y alertas | Enterarse antes que el médico | 0–26 USD/mes | estimado |
| Correo para avisos | Activación de pacientes, avisos de cita | 0–20 USD/mes | estimado |
| Comisión de cobro | Stripe ~3.6 % + $3 MXN por cobro | ~$35 MXN por cobro de $890 | secundario |
| Facturas (CFDI) | Timbrado | ~$0.50–2 MXN por factura | secundario |
| Segundo miembro en Vercel | Si entra otro desarrollador | 20 USD/mes | secundario |

### C. Costos únicos o profesionales (cotizar)
- **Abogado:** aviso de privacidad clínico, contrato de afiliación del médico, términos de uso, revisión de transferencias a EUA (Airtable, Anthropic, Telegram, Google).
- **Prueba de penetración externa** antes de abrir el portal clínico.
- **Contador:** facturación, régimen fiscal, cobro en pesos.
- **IMPI** y acta constitutiva (en curso).
- **Seguro de responsabilidad cibernética** (opcional, recomendable con datos de salud).

### D. Trabajo técnico pendiente (estimado)
| Tarea | Horas |
|---|---|
| Caché de instrucciones de NOVA + registro de tokens por médico | 10–20 |
| Guardar originales de estudios (R2) y corregir el texto de "archivo adjunto" | 20–40 |
| Migración de la base clínica de Airtable a PostgreSQL | 120–250 |
| Respaldos automáticos y prueba de restauración | 20–40 |
| Herramienta de migración por lotes con revisión humana | 60–120 |
| Cobro (pasarela + facturas) | 40–80 |
| Segundo factor de autenticación para médicos | 15–30 |
| **Total** | **285–580 h** |

---

## 5. Costo total por médico al mes con 100 médicos (estimado, plan Clínico)

| Concepto | USD por médico |
|---|---|
| Costos fijos (~68 actuales + ~80 nuevos = ~150 USD) ÷ 100 | ~1.5 |
| IA, uso medio, con caché | ~13 |
| Comisión de cobro | ~1.9 |
| Almacenamiento y facturas | ~0.2 |
| **Costo variable + fijo** | **~16.6** |
| Ingreso neto plan Clínico ($890 con IVA → $767 sin IVA) | ~41.5 |
| **Margen de contribución** | **~25 USD (~60 %)** |

No incluye tu tiempo, soporte, abogado, contador ni publicidad. Con esas cifras se calcula el punto de equilibrio real en el modelo a 12 y 24 meses (siguiente paso).

---

## 6. Recomendaciones para la decisión de precios

1. **Activar la caché de instrucciones antes de lanzar el plan Clínico.** Sin ella, $890 es un precio arriesgado para médicos de alto volumen.
2. **Separar la migración** como servicio de pago único; no regalarla dentro de la mensualidad.
3. **Decidir el tope de NOVA para pacientes** por médico (no por paciente), o el modelo del chat del paciente.
4. **Planear la salida de Airtable para la parte clínica** antes de aceptar migraciones grandes. El directorio puede seguir en Airtable sin problema.
5. Mantener el principio de precio estable: los costos en dólares son pequeños (~150 USD/mes fijos); el riesgo está en el **uso de IA**, que se controla con caché y topes, no subiendo el precio.

## Fuentes
- Precios de la API de Anthropic: documentación de Claude (caché de la skill `claude-api`, 2026-10-06): Sonnet 5 a 2 / 10 USD por millón de tokens.
- [Lemon.io — tarifas México](https://lemon.io/rate-calculator/mexico/) · [Axented — salarios 2026](https://www.axented.com/blog-posts/mexico-software-developer-salaries-2026)
- [JetAdmin — Airtable 2026](https://www.jetadmin.io/blog/airtable-pricing-in-2026-plans-real-costs-and-when-to-upgrade/amp/)
- [Cloudflare R2](https://cloudflare.com/en-ca/products/r2)
- [Vercel — límites](https://vercel.com/docs/limits) · [Vercel — precios](https://vercel.com/pricing?gad=1)
- [Calculadora CFDI](https://hacecuentas.com/mx/calculadora-cfdi-version-4-mexico-emitir-coste-validacion) · [Comisiones de pasarelas 2026](https://hacecuentas.com/mx/calculadora-comisiones-pasarelas-pago-mexico-2026)
- [Banxico — FIX](https://www.banxico.org.mx/apps/dao-web/4/52/Fix48.html)
