# Precios de mercado y costos — CODE CELLS™ (2026-10-19)

> Paso 3 del orden de valuación (ver `docs/CONTINUAR.md` §1). Etiquetas: **verificado** (página oficial consultada hoy), **secundario** (blog o comparativa), **dato de Víctor**, **calculado**, **propuesta**.

## 1. Costos de operación (dato de Víctor, 2026-10-19)

| Concepto | USD | MXN al FIX 18.49 | MXN a 21.00 (pesimista) |
|---|---|---|---|
| Airtable | 20 / mes | 370 | 420 |
| Vercel | 20 / mes | 370 | 420 |
| Anthropic | 20 / mes | 370 | 420 |
| Dominio | 100 / año → 8.33 / mes | 154 | 175 |
| **Total** | **68.33 / mes (820 / año)** | **~1 264 / mes** | **~1 435 / mes** |

FIX de Banxico del 16-oct-2026: 18.4930 MXN/USD ([Banxico](https://www.banxico.org.mx/apps/dao-web/4/52/Fix48.html)).

**Pendiente de aclarar:**
- ¿Los 20 USD de Anthropic son la suscripción de Claude (desarrollo) o el consumo de la API que usa NOVA? El consumo de la API crece con cada médico y paciente; ese es el único costo que escala con el uso.
- Faltan costos: comisión de cobro (~3.5–4 % + IVA por cobro, **secundario**), timbrado de facturas CFDI, contador, abogado, publicidad y el tiempo de soporte.
- El plan de Airtable puede quedarse corto en registros cuando crezca la red (revisar al llegar a ~50 médicos activos).

**Tiempo invertido (dato de Víctor):** ~6 meses a tiempo parcial, 8–10 h/semana → **~210–260 horas** (calculado). Es para la valuación (paso posterior).

## 2. Competencia en México

### Directorios con agenda
| Producto | Precio | Incluye | Fuente |
|---|---|---|---|
| Doctoralia Starter | $1 740 MXN + IVA / mes, facturado anual | Perfil de pago, calendario, recordatorios, Reserva con Google | **verificado** — [pro.doctoralia.com.mx](https://pro.doctoralia.com.mx/precios/medicos-y-especialistas) |
| Doctoralia Plus | $2 340 MXN + IVA / mes | + episodios clínicos, WhatsApp/SMS, pagos en línea | **verificado** (misma fuente) |
| Doctoralia VIP | $2 970 MXN + IVA / mes | + perfil mejorado, recetas digitales | **verificado** (misma fuente) |
| Doctoralia Practice (software) | $720 MXN + IVA / mes | Software de consultorio, "NUEVO" | **verificado** (misma fuente) |
| Top Doctors | No publica precios; ingreso por selección | — | sin dato ([topdoctors.mx](https://www.topdoctors.mx/info/empresa-y-servicios/)) |

La página de Doctoralia no tiene fecha de vigencia y otras fuentes dan cifras distintas ([Saludiario](https://www.saludiario.com/cuales-son-los-precios-de-los-planes-para-medicos-que-ofrece-doctoralia/), [Turnito](https://turnito.app/blog/los-mejores-software-de-citas-medicas-en-mexico-2026/)). Se toma la oficial.

### Software de consultorio / expediente clínico
| Producto | Precio | Fuente |
|---|---|---|
| GestMédica | Gratis (20 pacientes) · $199 MXN/mes individual · $499 grupo (4 médicos), IVA incluido | **verificado** — [gestmedica.com](https://gestmedica.com/) |
| MediSystem | desde $399 MXN/mes + IVA | **secundario** — [medisystem.mx](https://medisystem.mx/) |
| Mi-Consultorio | desde $299 MXN/mes | **secundario** — [mi-consultorio.com](https://mi-consultorio.com/blog/mejores-software-expediente-clinico-electronico-mexico-2026) |
| Luna Salud | desde $350 MXN/mes | **secundario** — [lunasalud.mx](https://www.lunasalud.mx/blog/mejores-software-para-consultorios-medicos-mexico-2026) |
| Rango de mercado | $200–500 individual · $600–1 200 intermedio (notas, recetas, cobros) | **secundario** — [SaludTotal](https://saludtotal.mx/es/blog/cuanto-cuesta-expediente-clinico-electronico-mexico/), [Consultio](https://consultio.mx/blog/cuanto-cuesta-software-consultorio-medico-mexico) |

## 3. Lectura (calculado)

- **28 USD ≈ $518 MXN/mes** al FIX de hoy.
- **Como directorio solo** (lo que sale en diciembre): equivale al 30 % de Doctoralia Starter. Pero Doctoralia vende **tráfico de pacientes**, y el directorio de CODE CELLS empieza sin tráfico. Cobrar $518 por un directorio sin pacientes es difícil de sostener: el médico cancela si no le llegan solicitudes.
- **Como portal clínico completo** (fase 2: expediente, dictado con NOVA, CIE-10, app del paciente, gráficas, red e interconsulta): $518 cae en el rango intermedio del software de expediente, y por debajo de lo que vale el conjunto.
- **El tipo de cambio casi no afecta los costos:** todos los costos fijos suman ~68 USD/mes. Si el dólar sube de 18.5 a 23 (+24 %), el costo sube ~$300 MXN al mes **en total**, no por médico. Cobrando en pesos, el precio puede quedar fijo años sin poner en riesgo el margen. El riesgo real de costo es el consumo de la API de NOVA por médico (ya tiene tope diario), y hay que medirlo en el piloto.
- **Punto de equilibrio de los costos actuales:** 4 médicos a $390 netos cubren ~$1 435/mes. El equilibrio real depende de los costos que faltan (abogado, contador, tu tiempo) y se calcula cuando los tengamos.

## 4. Propuesta de precios (propuesta — para decisión de Víctor)

Principios: precio en **pesos**, con **IVA incluido** en lo que se publica; **una revisión al año** (enero) con tope de inflación (INPC), anunciada con 60 días; **el precio sube solo cuando sube lo que se entrega**.

| Plan | Qué incluye | Precio mensual | Anual (2 meses gratis) |
|---|---|---|---|
| **Red** (dic 2026) | Ficha verificada, búsqueda, solicitudes de cita con aceptar / proponer / rechazar | $390 MXN | $3 900 MXN |
| **Clínico** (fase 2) | Red + portal clínico, NOVA, dictado, CIE-10, app del paciente, gráficas, interconsulta | $890 MXN | $8 900 MXN |

**Médicos fundadores (100 lugares, numerados y públicos):**
- Pagan el plan **Red** ($390, o $3 900 al año) y reciben el plan **Clínico sin aumento** cuando se lance, con el precio **congelado 24 meses** desde que se inscriben.
- Lo que se promete es exactamente lo que existe hoy: "el portal clínico se activará cuando esté listo", sin fecha comprometida.
- Por tandas: los primeros 25 obtienen 36 meses congelados; del 26 al 100, 24 meses. Así se premia entrar pronto sin vender un precio de por vida.

Los montos son puntos de partida razonados contra el mercado, no cifras cerradas: se ajustan con la decisión de Víctor y con los costos que faltan.
