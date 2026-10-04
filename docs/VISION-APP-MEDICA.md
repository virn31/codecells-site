# CODE CELLS™ — APP MÉDICA MVP
**Versión: 1.0 | Fecha: Oct 4, 2026 | Estado: Ready for Claude Code**

> **Nota de alcance (2026-10-04, acordado con Víctor).** Este documento es la
> **visión** de la app del paciente, no una especificación para codificar tal cual.
> Se construye por etapas según los datos que existen (ver docs/CONTINUAR.md):
>
> - **MVP-1** (= Fase 2 de SPEC-PACIENTE-UNICO): app mobile-first con navegación
>   inferior; Home con anillo (Biological Map), "Reevaluarme", protocolo con
>   día X de 90, laboratorios, citas, "Mi equipo", NOVA; trayectoria en el
>   portal; fuera todo lo VIP.
> - **MVP-2**: medicamentos estructurados (los prescribe el médico en el
>   portal) → adherencia real → avisos dentro de la app.
> - **MVP-3**: citas con disponibilidad (depende de la Agenda), directorio en
>   la app, segunda opinión vía llave, documentos.
> - **Después**: push/email/SMS, telemedicina, ratings reales.
>
> **Correcciones obligatorias al leer este documento:**
> 1. Se queda la paleta y tipografía actuales (no Poppins/Inter ni #D4AF37).
> 2. Arquitectura real: HTML sin framework + funciones de Vercel + Airtable.
>    Nada de React/Zustand, SQL/UUID ni WebSockets.
> 3. La identidad del paciente sale del TOKEN, nunca de `/api/paciente/{id}`.
> 4. Cero contenido clínico sin autor (CLAUDE.md §7): "para qué / efectos /
>    no mezclar" solo los escribe el médico; nada de proyecciones, ratings,
>    "cédula verificada" ni rachas de adherencia sin datos que las respalden.
>    El Biological Map es un cuestionario: no genera alertas clínicas.
> 5. "Notas del médico" visibles al paciente dependen de la decisión de capas
>    A/B/C (pendiente); las notas privadas del autor nunca se muestran.
> 6. Escala del anillo: función 0–10 (más = mejor) = (1 − riesgo) × 10 por
>    sistema; estado general = promedio; etiquetas "Buen funcionamiento" (>6),
>    "Puede mejorar" (3–6), "Necesita atención" (≤3). Se guardan respuestas y
>    versión del cuestionario.
> 7. Zoom/SendGrid/Twilio/push son transferencias de datos: requieren aviso de
>    privacidad antes de integrarse.

---

## 📋 VISIÓN GENERAL

APP MÉDICA mobile-first para pacientes en protocolos de medicina regenerativa/estética/metabolismo.

**Diferenciador:** No es fitness. Es ADHEREENCIA MÉDICA con avisos inteligentes, red de médicos, y sistema de citas integrado.

**Paciente objetivo:** Alguien pagando por protocolo de 90 días con seguimiento clínico, medicamentos prescritos, y laboratorios periódicos.

---

## 🎨 DESIGN SYSTEM

### Paleta Base (Dark Theme por defecto)
```css
/* Colores CODE CELLS */
--gold: #D4AF37
--teal: #20B2AA
--red-alert: #E74C3C
--bg-dark: #0F1419
--bg-card: #1A1F28
--fg-primary: #FFFFFF
--fg-secondary: #B8BCC4

/* Tipografía */
--font-display: 'Poppins' (headings)
--font-body: 'Inter' (body)
```

### Colores Dinámicos por Protocolo
El ANILLO cambia de color según protocolo actual:
```
- Prenatal/Embarazo → ROSA/MAGENTA (#E91E63)
- Regenerativa → GOLD (#D4AF37)
- Estética → VIOLET (#9C27B0)
- Metabolismo/Obesidad → ORANGE (#FF9800)
- Cardiovascular → RED (#E74C3C)
- Neurológica → CYAN (#20B2AA)
```

---

## 📱 NAVEGACIÓN & TABS

**Bottom Navigation (mobile) / Sidebar (desktop)**

```
1. 🏠 HOME
   ├─ Avisos inteligentes (HOY)
   ├─ Protocolo actual + progreso
   └─ Medicamentos de hoy

2. 📋 MI PROTOCOLO
   ├─ Nombre + médico + fechas
   ├─ Timeline de milestones
   ├─ Día X de 90 (contador)
   └─ Descargar plan PDF

3. 🩸 LABORATORIOS
   ├─ Últimos valores
   ├─ Trayectoria (gráficas)
   ├─ Tabs: Relevantes | Fuera de rango | Todos
   └─ Próximo lab programado

4. 💊 MEDICAMENTOS
   ├─ Medicamentos prescritos (hoy + calendario)
   ├─ Detalles: dosis, para qué, efectos
   ├─ Refills y alertas
   └─ Historial

5. 👨‍⚕️ MI EQUIPO
   ├─ Médicos asignados
   ├─ Teléfono, especialidad, horario
   ├─ "Chat directo" (→ NOVA)
   └─ "Solicitar cita"

6. 📊 PROGRESO
   ├─ Métrica principal (protocolo-específica)
   ├─ Otras métricas clínicas
   ├─ Notas del médico
   └─ Gráficas

7. 🥗 NUTRICIÓN
   ├─ Plan del médico (si aplica)
   ├─ Macros referencia
   └─ "Solo información, sigue indicaciones médicas"

8. 📁 DOCUMENTOS
   ├─ Consentimiento informado
   ├─ Plan de tratamiento
   ├─ Evaluación inicial
   ├─ Laboratorios previos
   └─ Reportes de progreso

9. 💬 NOVA
   ├─ Chat con IA médica
   ├─ Historial de conversaciones
   └─ "Contactar médico" (si urgente)

10. 🔍 DIRECTORIO MÉDICO
    ├─ Buscar médicos por especialidad/ubicación
    ├─ Rating, disponibilidad, telemedicina
    ├─ Segunda opinión
    └─ Cambiar médico

11. 📅 MIS CITAS
    ├─ Próximas citas
    ├─ Historial + notas
    ├─ Cambiar/cancelar
    └─ + AGENDAR NUEVA CITA
```

---

## 🏠 HOME — El Corazón

### Layout
```
HEADER
├─ Logo "CODE CELLS™"
├─ Avatar + Nombre paciente
└─ Botones: Settings, Menu

CONTENIDO
├─ 🎯 ANILLO ESTADO GENERAL
│  ├─ Color dinámico por protocolo
│  ├─ 5 sistemas (ENERGY, REPAIR, BALANCE, NEURO, REGEN)
│  ├─ Última evaluación + fecha
│  └─ "Reevaluarme" (botón)
│
├─ ⏰ AVISOS INTELIGENTES (HISENSE ALERTS)
│  ├─ Medicamento a tomar (con horario)
│  ├─ Cita próxima
│  ├─ Re-evaluación disponible
│  ├─ Laboratorio próximo
│  ├─ Alerta de valor fuera de rango
│  └─ [Dismissible si completado]
│
├─ 📋 TU PROTOCOLO ACTUAL
│  ├─ Nombre: "Control prenatal — segundo embarazo"
│  ├─ Médico: "Dr. Victor Rodríguez"
│  ├─ Día 24 de 90 [████░░░░░░]
│  └─ "Ver detalles"
│
└─ 💊 HOY TOMAS
   ├─ 06:00 - Multivitamínico [✓ Tomado]
   ├─ 14:00 - Metformina 500mg [⏰ En 2h]
   └─ 20:00 - Colágeno [○ Pendiente]
```

### Avisos Inteligentes (CRÍTICO)
```
TIPOS DE AVISOS
├─ ⏰ MEDICAMENTOS
│  ├─ "Toma [Medicamento] en [tiempo]"
│  ├─ "Próximo refill: [Med] en [X] días"
│  └─ [Silenciar si ya tomó]
│
├─ 📋 CITAS
│  ├─ "Tu cita es mañana a las [hora]"
│  ├─ "Recordar traer: [documentos]"
│  └─ "Enlace telemedicina: [link]" (1 hora antes)
│
├─ 🩸 LABORATORIOS
│  ├─ "Es hora de re-evaluarte (14 días desde última)"
│  ├─ "Próximo lab programado: [fecha]"
│  └─ "Traer ayuno de 12h"
│
├─ 📊 PROTOCOLO
│  ├─ "Completaste Fase X ✓"
│  └─ "Entra a Fase Y del protocolo"
│
├─ ⚠️ ALERTAS MÉDICAS
│  ├─ "[Valor] bajó/subió. Contacta médico"
│  ├─ "Valor fuera de rango: [Lab]"
│  └─ [ROJO, prominente]
│
└─ 🎯 MOTIVACIÓN
   ├─ "Llevas [X] días 100% en adherencia 🎉"
   └─ "[Métrica] mejoró: [valor] esta semana"

CONFIGURACIÓN
├─ On/off por tipo
├─ Horarios (no molestar después de 21h)
└─ Canales: Push + Email
```

---

## 💊 MEDICAMENTOS — Adherencia

```
MEDICAMENTOS PRESCRITOS (accordion)
├─ [Med 1] Metformina 500mg
│  ├─ DOSIS: 1 comp cada 12h (con comida)
│  ├─ PARA QUÉ: Metabolismo de glucosa
│  ├─ EFECTOS ESPERADOS: Mejor control glucémico
│  ├─ EFECTOS SECUNDARIOS: Náuseas leves (primeras 2 semanas)
│  ├─ ⚠️ NO MEZCLAR: Alcohol, metformina-incompatibles
│  ├─ PRÓXIMO REFILL: Nov 15
│  └─ [Ver detalles médicos]
│
├─ [Med 2] Colágeno marino 10g
│  └─ DOSIS: 1 sobre cada noche
│
└─ [+ Medicamentos adicionales]

HISTORIAL
├─ Medicamentos previos (archivados)
└─ Dejar de tomar: [Fecha]
```

---

## 🔍 DIRECTORIO MÉDICO — Red

```
FILTROS
├─ Especialidad: Regenerativa, Estética, Nutrición, Cardio, etc.
├─ Ubicación: Culiacán, Tijuana, Online, Otro
├─ Disponibilidad: Hoy, Esta semana, Próximas 2 semanas
└─ Ordenar por: Rating, Pacientes, Cercanía

RESULTADOS (Card por médico)
├─ Foto + Nombre + Cédula verificada
├─ Especialidad + Ubicación
├─ ⭐ Rating (ej: 4.9/5, 247 pacientes)
├─ Próxima disponibilidad
├─ "Telemedicina: ✓ Sí"
├─ [Botones]
│  ├─ "Agendar cita"
│  ├─ "Segunda opinión" (si no es tu médico)
│  └─ "Cambiar a este médico"
└─ [Si es tu médico actual: "Ya estoy con este médico"]
```

---

## 📅 MIS CITAS — Agendamiento

### Vista: Próximas + Historial
```
PRÓXIMAS CITAS
├─ [Cita 1] Oct 5 - 10:00 | Dr. Victor Rodríguez
│  ├─ Telemedicina (Zoom link disponible)
│  ├─ Duración: 30 min
│  ├─ Tipo: Seguimiento protocolo
│  ├─ [Botones: Cambiar | Cancelar | Recordar mañana]
│  └─ Aviso: "Te quedan 3 días"
│
└─ [+ más citas]

HISTORIAL
├─ [Cita] Sept 25 10:00 | Dr. Victor [Completada]
│  └─ "Ver notas de la cita"
└─ [+ más históricas]
```

### Flujo: + AGENDAR NUEVA CITA
```
STEP 1: ¿Con quién?
├─ "Mi médico: Dr. Victor" [default]
├─ "Otro médico (buscar en directorio)"
└─ "Laboratorios CODE CELLS"

STEP 2: ¿Tipo de cita?
├─ Seguimiento protocolo
├─ Pregunta urgente
├─ Segunda opinión
├─ Laboratorios
└─ Otro

STEP 3: ¿Formato?
├─ Telemedicina
└─ Presencial

STEP 4: ¿Cuándo?
├─ [Calendario con disponibilidad médico]
├─ Slots libres en VERDE
├─ Slots ocupados en GRIS
└─ Seleccionar horario

STEP 5: CONFIRMAR
├─ "Cita confirmada ✓"
├─ Email + Push confirmation
├─ Agregada a "Mis citas"
└─ Aviso: "Tu cita es [fecha] [hora]"
```

---

## 🎯 ANILLO ESTADO GENERAL (THE JEWEL)

### Concepto
- Círculo concéntrico con 5 anillos (5 sistemas)
- Color dinámico según PROTOCOLO del paciente
- Centro: métrica principal del día
- Tap en cada anillo → detalles

### Implementación
```
<svg viewBox="0 0 200 200">
  <!-- Fondo gris oscuro -->
  <circle cx="100" cy="100" r="95" fill="var(--bg-card)"/>
  
  <!-- 5 anillos (sistemas) -->
  <!-- Cada anillo es una sección de donut -->
  <!-- Anillo 1: ENERGY (20%) -->
  <path d="..." fill="[PROTOCOLO_COLOR]" opacity="0.8"/>
  
  <!-- Anillo 2: REPAIR (20%) -->
  <!-- ... (similar) -->
  
  <!-- Anillo 3: BALANCE (20%) -->
  <!-- ... -->
  
  <!-- Anillo 4: NEURO (20%) -->
  <!-- ... -->
  
  <!-- Anillo 5: REGEN (20%) -->
  <!-- ... -->
  
  <!-- Centro: Número + Etiqueta -->
  <text x="100" y="95" font-size="32" font-weight="bold">8.2</text>
  <text x="100" y="115" font-size="12">Estado General</text>
</svg>

/* Colores por protocolo */
--protocolo-prenatal: #E91E63 (Magenta)
--protocolo-regenerativa: #D4AF37 (Gold)
--protocolo-estetica: #9C27B0 (Violet)
--protocolo-metabolismo: #FF9800 (Orange)
--protocolo-cardio: #E74C3C (Red)
--protocolo-neurologia: #20B2AA (Cyan)
```

### Tap en anillo
```
Tap en "ENERGY" (ej)
├─ Muestra detalles del sistema
├─ Última evaluación: Oct 1
├─ Comparación vs anterior
├─ Gráfica 12 semanas
└─ "¿Cómo mejorar?" (educación)
```

---

## 🩸 LABORATORIOS — Trayectoria

```
HEADER
├─ Última evaluación: Sept 30
├─ Valores normales: 8/12
├─ Fuera de rango: 4/12
└─ ⚠️ "[X] valores requieren atención médica"

TABS
├─ Relevantes (protocolo-específicos)
├─ Fuera de rango (alerta)
└─ Todos

GRID de Labs
├─ [Lab Item]
│  ├─ Nombre: "Hemoglobina"
│  ├─ Última: 12.4 g/dL [fecha]
│  ├─ Anterior: 11.8 g/dL [fecha]
│  ├─ Comparativa: ↑ +0.6 (mejoró)
│  ├─ Status: [✓ Normal | ⚠️ Alerta]
│  ├─ Rango normal: 12.0-16.0
│  └─ [Tap para gráfica histórica]
│
└─ [+ más labs]

TAP LAB DETAIL
├─ Gráfica 12 semanas
├─ Tabla: fecha | valor | rango | status
├─ Notas médicas asociadas
└─ "Preguntar a NOVA" si dudas
```

---

## 📊 PROGRESO — Métricas Clínicas

```
MÉTRICA PRINCIPAL (según protocolo)
├─ [Gran card]
├─ Título: [Métrica] (ej: "Peso")
├─ Valor actual: 88kg
├─ Meta: 75kg
├─ Progreso: 75% [████░░░░░░]
├─ Proyección: "Meta en 4 semanas"
├─ Gráfica 12 semanas (área fill con color protocolo)
└─ Trend: ↓ -2kg esta semana 🎉

OTRAS MÉTRICAS (tabs)
├─ Circunferencia abdominal
├─ Presión arterial
├─ Glucemia en ayunas
├─ % Grasa corporal
├─ Adherencia %
└─ [Cada una con gráfica]

NOTAS DEL MÉDICO
├─ "Excelente progreso. Continuar igual." 
├─ Fecha: Oct 1 | Dr. Victor
└─ [Newest first]
```

---

## 🔧 BACKEND STRUCTURE (CRITICAL)

### Tablas necesarias
```
PACIENTES
├─ id, nombre, edad, peso, altura
├─ protocolo_id_actual
├─ color_protocolo (dinámico)
├─ medico_id_principal
└─ fecha_inicio_protocolo

PROTOCOLOS
├─ id, nombre, descripcion
├─ duracion_dias (default 90)
├─ color (ej: #E91E63)
├─ metricas_principales [array]
└─ fases [milestones]

MEDICAMENTOS_PRESCRITOS
├─ id, paciente_id, medicamento
├─ dosis, frecuencia, fecha_inicio
├─ para_que, efectos_secundarios
├─ no_mezclar [array]
├─ fecha_refill
└─ estado (activo/archivado)

EVALUACIONES_BIOLOGICAS
├─ id, paciente_id, fecha
├─ energy, repair, balance, neuro, regen (0-10)
├─ estado_general (promedio)
├─ source (kiosco/app/manual)
└─ medico_id

CITAS
├─ id, paciente_id, medico_id
├─ fecha, hora, duracion
├─ tipo (seguimiento/urgente/2da-opinion/lab)
├─ estado (pendiente/completada/cancelada)
├─ formato (telemedicina/presencial)
├─ notas_medico, receta_id
└─ rating_paciente

LABORATORIOS
├─ id, paciente_id, fecha
├─ valor_nombre, valor_numero, unidad
├─ rango_normal_min, rango_normal_max
├─ estado (normal/alerta)
└─ medico_id

DIRECTORIO_MEDICO
├─ id, nombre, cedula, foto
├─ especialidad, ubicacion, telemedicina
├─ horarios_disponibilidad (JSON)
├─ rating, num_pacientes
└─ bio_corta

AVISOS
├─ id, paciente_id, tipo, contenido
├─ fecha_programada, leído
└─ accion (medicamento/cita/lab/alerta)
```

### Endpoints críticos
```
GET /api/paciente/{id}/home
  → Avisos hoy + protocolo + medicamentos

GET /api/paciente/{id}/directorio?especialidad=&ubicacion=
  → Médicos filtrados

POST /api/paciente/{id}/cita
  → Crear cita
  
GET /api/medicamentos/{paciente_id}
  → Medicamentos prescritos

GET /api/laboratorios/{paciente_id}
  → Trayectoria labs

POST /api/evaluacion-biologica
  → Guardar evaluación anillo

GET /api/progreso/{paciente_id}
  → Métricas principales
```

---

## 🚀 PRIORIDAD MVP (Fase 1)

```
WEEK 1-2: Backend
├─ Tablas (PACIENTES, PROTOCOLOS, MEDICAMENTOS, CITAS, LABORATORIOS)
├─ Endpoints base
└─ Tests

WEEK 2-3: App - Core Screens
├─ HOME (avisos + anillo + protocolo + meds de hoy)
├─ MEDICAMENTOS (lista + detalles)
├─ MIS CITAS (agenda + agendar)
└─ LABORATORIOS (lista básica)

WEEK 3-4: App - Directorios
├─ DIRECTORIO MÉDICO (búsqueda + filtros)
├─ Cambiar médico flow
└─ Segunda opinión

WEEK 4: Polish + Preview
├─ Avisos inteligentes (push + email)
├─ NOVA integración
├─ Dark/light theme
└─ Testing en dispositivos reales
```

---

## 🔄 FASE 2 — BIOLOGICAL MAP & TRAYECTORIA

### El Problema (Fase 1)
El test biológico NO guarda sus resultados en ningún lado. El botón del kiosco abre el test público en otra pestaña, y ese test dejó de guardar puntajes cuando se pausó por falta de consentimiento. **Fase 2 necesita incluir de dónde salen los datos, no solo cómo se ven.**

### ✅ Decisiones Aprobadas

| D # | Pregunta | Visto Bueno |
|-----|----------|-------------|
| **D7** | ¿Paciente repite test desde app? | **Sí** — trayectoria clínica tiene sentido |
| **D8** | ¿Médico ve trayectoria en portal? | **Sí** — gráfica más en expediente (usa motor gráficas existente) |
| **D9** | ¿Test kiosco necesita consentimiento aparte? | **No** — mismo aviso que HC del kiosco. Abogado confirma con aviso privacidad pendiente |
| **D10** | ¿"Prioridad alta" en citas VIP? | **Eliminar** — todos con misma prioridad |

### FLUJO DE DATOS

#### 1. **Test del Kiosco** (Consultorio)
```
AHORA:
├─ Botón en kiosco abre test público
├─ Test se hace en otra pestaña
├─ Resultado: SE PIERDE ❌

FASE 2:
├─ Test corre DENTRO de sesión del consultorio
├─ Se guarda en EXPEDIENTE (como HC del kiosco)
├─ Médico es AUTOR automático
├─ → EVALUACIONES_BIOLOGICAS tabla
```

#### 2. **Test desde App del Paciente** (Casa)
```
NUEVO en Fase 2:
├─ Botón "Reevaluarme" en HOME
├─ Paciente abre test en app
├─ Completa 5 sistemas (ENERGY, REPAIR, BALANCE, NEURO, REGEN)
├─ Resultado guardado INMEDIATO
├─ → EVALUACIONES_BIOLOGICAS tabla
└─ Paciente ve: "Evaluación guardada [fecha]"
```

#### 3. **Test Manual** (Médico digita)
```
OPCIONAL:
├─ Médico en portal: "Registrar evaluación manual"
├─ Input 5 valores + fecha
├─ → EVALUACIONES_BIOLOGICAS tabla
└─ Médico es AUTOR
```

### NUEVA TABLA: EVALUACIONES_BIOLOGICAS

```sql
CREATE TABLE EVALUACIONES_BIOLOGICAS (
  id UUID PRIMARY KEY,
  paciente_id UUID REFERENCES PACIENTES(id),
  fecha TIMESTAMP,
  
  -- 5 sistemas (0-10)
  energy INT,
  repair INT,
  balance INT,
  neuro INT,
  regen INT,
  
  -- Derivado
  estado_general DECIMAL (promedio de los 5),
  
  -- Source (crítico)
  source ENUM('kiosco_consultorio', 'app_paciente', 'manual_medico'),
  
  -- Quién registró
  medico_id UUID REFERENCES DIRECTORIO_MEDICO(id),
  
  -- Timestamps
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Índices para trayectoria
CREATE INDEX idx_evaluaciones_paciente_fecha ON EVALUACIONES_BIOLOGICAS(paciente_id, fecha DESC);
```

### QUÉ VE EL PACIENTE EN APP (Fase 2)

```
HOME → ANILLO ESTADO GENERAL
├─ Última evaluación: [fecha]
├─ Valor: 8.2 (promedio de 5 sistemas)
├─ Color: dinámico por protocolo
├─ 5 anillos: ENERGY | REPAIR | BALANCE | NEURO | REGEN
├─ Comparación vs anterior: ↑ 0.3 (mejoró)
├─ Si no hay evaluación: "Aún no tienes tu evaluación" (NUNCA puntajes de ejemplo)
└─ [Botón "Reevaluarme"]

TAP EN "Reevaluarme"
├─ Abre test en modal/screen
├─ 5 preguntas simples (sistema por sistema)
├─ Al final: "Guardando..."
├─ Confirmación: "✓ Evaluación guardada [fecha actual]"
└─ Vuelve a HOME, ANILLO actualizado
```

### QUÉ VE EL MÉDICO EN PORTAL (Fase 2)

```
EXPEDIENTE PACIENTE
├─ Nueva sección: "Trayectoria Biological Map"
├─ Gráfica 12 semanas (área fill, color protocolo)
├─ Tabla histórica:
│  ├─ Fecha | ENERGY | REPAIR | BALANCE | NEURO | REGEN | Estado General | Source
│  ├─ Oct 4 | 7.2 | 8.1 | 7.8 | 8.5 | 7.9 | 7.9 | app_paciente
│  ├─ Sept 27 | 7.0 | 7.8 | 7.5 | 8.2 | 7.6 | 7.6 | kiosco_consultorio
│  └─ ...
├─ [Botón "Registrar evaluación manual"]
└─ Notas: indicar mejora/descenso por sistema
```

### ENDPOINTS FASE 2

```
POST /api/evaluacion-biologica
├─ Body: { paciente_id, energy, repair, balance, neuro, regen, source, medico_id }
├─ Response: { id, fecha, estado_general, success }
└─ Auth: app_paciente (si source=app) o medico (si source=kiosco/manual)

GET /api/evaluacion-biologica/{paciente_id}/ultima
├─ Response: { energia, repair, balance, neuro, regen, estado_general, fecha, source }
└─ Para mostrar ANILLO en HOME

GET /api/evaluacion-biologica/{paciente_id}/trayectoria
├─ Query: ?semanas=12 (default)
├─ Response: [ { fecha, energy, repair, balance, neuro, regen, estado_general, source }, ... ]
└─ Para gráfica 12 semanas (paciente + médico)

GET /api/evaluacion-biologica/{paciente_id}/comparativa
├─ Response: { ultima, anterior, cambios: { energy_delta, repair_delta, ... } }
└─ Para mostrar ↑↓ en HOME
```

### AVISOS INTELIGENTES QUE AGREGA Fase 2

```
NUEVOS:
├─ "Es hora de re-evaluarte (14 días desde última)"
├─ "Tu Biological Map mejoró en [SISTEMA] 🎉"
└─ "Valor fuera de rango en [SISTEMA] — contacta médico"
```

### ELIMINACIONES Fase 2

```
QUITAR:
├─ Etiqueta "DEZAWA VIP" (completamente)
├─ "Privilegio exclusivo" en recordatorios
├─ "Privilegio exclusivo" en invitar amigos
├─ Niveles/tiers de paciente
└─ "Prioridad alta" en citas (todos = mismo priority)
```

### ROADMAP FASE 2 (4 semanas)

```
WEEK 1: Backend
├─ Crear tabla EVALUACIONES_BIOLOGICAS
├─ Escribir migrations + seeds
├─ Tests unitarios
└─ Endpoints POST/GET

WEEK 2: Servidor + Tests
├─ Integración kiosco → guardar en sesión/expediente
├─ Endpoint trayectoria (gráfica)
├─ Comparativa (última vs anterior)
└─ E2E tests

WEEK 3: App
├─ Componente "Reevaluarme" (test modal)
├─ ANILLO actualizado (última fecha + comparativa)
├─ Remoción completa de "VIP"
└─ Avisos inteligentes biologícas

WEEK 4: Portal Médico
├─ Nueva sección "Trayectoria Biological Map"
├─ Gráfica + tabla histórica
├─ Botón "Registrar manual"
└─ Testing Preview + Producción
```

### NOTAS CRÍTICAS

1. **Source es OBLIGATORIO** — rastrear de dónde viene cada evaluación
2. **NUNCA mostrar datos de ejemplo** — si no hay evaluación: "Aún no tienes tu evaluación"
3. **Sin consentimiento aparte** — mismo aviso de privacidad clínico existente (abogado lo confirma)
4. **Abogado revisa** — aviso de privacidad clínico pendiente en kiosco
5. **Todos iguales** — remover cualquier referencia a VIP/tiers en Fase 2

---

## 📝 NOTAS PARA CLAUDE CODE

1. **Componentes Reutilizables:**
   - `<AvisoCard />` (medicamento, cita, alerta, motivación)
   - `<LabItem />` (valor + fecha + status)
   - `<MedicoCard />` (directorio + rating)
   - `<CitaCard />` (próxima + historial)
   - `<AnilloEstadoGeneral />` (SVG dinámico)

2. **Estado Global:**
   - Usa Context o Zustand para: paciente actual, protocolo, medicamentos, citas
   - Avisos como stream (WebSocket o polling cada 5min)

3. **Responsive:**
   - Mobile-first (400px min)
   - Desktop: sidebar + main content
   - Tablets: adaptable

4. **Colores:**
   - Token CSS dinámico `--protocolo-color` cambia según `protocolo.color`
   - Anillo usa ese color en SVG
   - Tema oscuro default, light mode en settings

5. **APIs Externas:**
   - Zoom (para telemedicina)
   - SendGrid (emails)
   - Twilio (SMS avisos opcionales)

---

## 📞 CONTACT & SUPPORT

**Creado por:** Dr. Víctor Iván Rodríguez Nava (CODE CELLS™)  
**Repo:** codecells-site (rama: `feat/app-medica-mvp`)  
**Status:** Ready for Claude Code  

---

**¡A CÓDIGO!** 🚀
