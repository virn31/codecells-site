# SPEC — NOVA Dictación Bidireccional: Portal + Telegram → Expediente

**Versión:** 1.0  
**Fecha:** 2026-10-04  
**Para:** CODE CELLS médicos  
**Requisito:** Opción C + Sincronización Telegram  

---

## VISIÓN

**Un médico, dos caminos, un expediente:**

```
┌─────────────────────────────────────────────────────────┐
│                   EXPEDIENTE PACIENTE                   │
│  (CONSULTAS, ANTECEDENTES_*, SIGNOS, NOTAS CLÍNICAS)   │
└──────────────────┬──────────────────────────────────────┘
                   ▲
        ┌──────────┴──────────┐
        │                     │
    ┌───▼──────┐          ┌──▼────────┐
    │  PORTAL  │          │ TELEGRAM  │
    │  (web)   │          │@Drvirnbot │
    │          │          │           │
    │ 🎤 Dicta │          │  /dictar  │
    │ Notas    │          │  Consulta │
    │ Datos    │          │  Completa │
    └──────────┘          └───────────┘
        │                     │
        └──────────┬──────────┘
                   │
            ┌──────▼─────────┐
            │  NOVA (NLP)    │
            │                │
            │ - Voz → Texto  │
            │ - Extrae datos │
            │ - Llena campos │
            └────────────────┘
```

---

## 1. ENTRADA: DOS PUERTAS

### Puerta 1: PORTAL (web) — `portal-medico.html`

**Ubicación física:** Expediente abierto, lado derecho (flotante o en sidebar)

**Interfaz:**
```
┌─────────────────────────────────┐
│ 🎤 DICTACIÓN A NOVA             │
├─────────────────────────────────┤
│                                 │
│ [🎙️  NOTAS CLÍNICAS]           │
│ (presiona, habla, suelta)      │
│                                 │
│ [📊 SIGNOS VITALES]            │
│ (presiona, habla: "Presión     │
│  120 80, Freq 88, Temp 37")   │
│                                 │
│ [📋 HISTORIA CLÍNICA]          │
│ (presiona, dicta el motivo,    │
│  diagnóstico, plan)            │
│                                 │
│ [📤 Enviar a NOVA]             │
│                                 │
└─────────────────────────────────┘
```

**Flujo:**
1. Médico presiona botón [🎤 NOTAS] / [📊 SIGNOS] / [📋 HISTORIA]
2. Navegador accede a micrófono (Web Audio API + permisos)
3. Graba audio mientras médico habla
4. Al soltar o presionar [Enviar], envía audio a `/api/nova-dictacion`
5. NOVA procesa → extrae datos → devuelve JSON
6. Formulario se llena automáticamente
7. Médico revisa, edita si necesario, guarda

### Puerta 2: TELEGRAM — `@Drvirnbot` (ya existe)

**Interfaz existente:**
```
/dictar [CCMED-XXXX] [CCPAC-YYYY] 
Médico envía audio o texto
NOVA procesa
Bot confirma: ¿Guardar en expediente?
Sí → Se guarda en Airtable
```

**Cambio:** Ahora también maneja:
- Audio directo (voz a texto)
- Comandos específicos: `/notas`, `/signos`, `/historia`
- Integración con mismo `/api/nova-dictacion`

---

## 2. PROCESAMIENTO: NOVA (NLP)

### Endpoint: `POST /api/nova-dictacion`

**Input:**
```json
{
  "tipo": "notas|signos|historia",
  "audio": "base64_encoded_audio_file",
  "formato": "wav|mp3|webm",
  "pacienteRecId": "recXXX",
  "medicoRecId": "recYYY",
  "origen": "portal|telegram",
  "especialidad": "ginecologia|cardiologia|etc"
}
```

**Proceso:**
1. **Transcripción:** Audio → texto (voz a texto API)
2. **Análisis NOVA:**
   - Si `tipo: "notas"` → Formatea como nota clínica natural
   - Si `tipo: "signos"` → Extrae números (presión, frecuencia, temp, O2, etc)
   - Si `tipo: "historia"` → Estructura: motivo, síntomas, diagnóstico, plan
3. **Extracción de datos:** NLP para campos estructurados
4. **Validación:** Verifica que los datos tengan sentido médico
5. **Respuesta:** JSON con datos extraídos

**Output:**
```json
{
  "success": true,
  "tipo": "signos",
  "datos_extraidos": {
    "presion_sistolica": 120,
    "presion_diastolica": 80,
    "frecuencia_cardiaca": 88,
    "temperatura": 37.0,
    "saturacion_o2": 98,
    "texto_original": "Presión 120 80, frecuencia 88, temperatura 37"
  },
  "nota_procesada": "[2026-10-04] Signos vitales (NOVA): PA 120/80, FC 88, T 37°C, SatO2 98%",
  "confianza": 0.95,
  "requiere_revision": false
}
```

### Ejemplo 1: Dictación de NOTAS

**Médico dice:**
```
"Paciente presenta dolor abdominal cólico desde ayer, 
sin fiebre, sin sangrado. Antecedente de migraña. 
Diagnóstico: gastroenteritis probable. 
Plan: hidratación, dieta bland, metoclopramida, control 24 horas."
```

**NOVA responde:**
```json
{
  "tipo": "notas",
  "nota_procesada": "[2026-10-04 09:30] (Dictada NOVA) Paciente presenta dolor abdominal cólico desde ayer, sin fiebre, sin sangrado. Antecedente: migraña. Dx probable: gastroenteritis. Plan: hidratación, dieta blanda, metoclopramida, control 24h.",
  "diagnostico_sugerido": "K59.1 (Diarrea)",
  "planes": ["Hidratación oral", "Dieta bland", "Metoclopramida 10mg c/8h"],
  "confianza": 0.92
}
```

### Ejemplo 2: Dictación de SIGNOS VITALES

**Médico dice:**
```
"Presión ciento veinte, ochenta. Frecuencia cardíaca noventa y dos.
Temperatura treinta y siete punto dos. Saturación noventa y nueve."
```

**NOVA responde:**
```json
{
  "tipo": "signos",
  "datos_extraidos": {
    "presion_sistolica": 120,
    "presion_diastolica": 80,
    "frecuencia_cardiaca": 92,
    "temperatura": 37.2,
    "saturacion_o2": 99
  },
  "campos_completos": ["PA", "FC", "T", "SatO2"],
  "campos_faltantes": ["peso", "talla", "IMC"],
  "confianza": 0.98
}
```

---

## 3. LLENADO: FORMULARIO → AIRTABLE

### En PORTAL (portal-medico.html)

**Flujo automático:**
1. Recibe JSON de NOVA
2. Llena campos en el formulario (`input`, `textarea`, `select`)
3. Muestra resumen de lo que NOVA entendió
4. Médico puede editar cualquier campo
5. Presiona [Guardar] → POST a `/api/airtable?tabla=consultas` o `tablas=antecedentes_*`

**Ejemplo HTML:**
```html
<div id="dictacion-signos" style="display:none;">
  <input id="presion_sistolica" placeholder="Sistólica" />
  <input id="presion_diastolica" placeholder="Diastólica" />
  <input id="frecuencia_cardiaca" placeholder="Frec cardíaca" />
  <input id="temperatura" placeholder="Temperatura" />
  <button onclick="NOVA_llenarSignos()">Dictar signos</button>
  <button onclick="guardarSignos()">Guardar</button>
</div>
```

**JavaScript:**
```javascript
async function NOVA_llenarSignos() {
  const audio = await grabarAudio(); // Web Audio API
  const response = await fetch('/api/nova-dictacion', {
    method: 'POST',
    body: JSON.stringify({
      tipo: 'signos',
      audio: audioToBase64(audio),
      pacienteRecId: currentPaciente.recId,
      medicoRecId: currentMedico.recId,
      origen: 'portal'
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    document.getElementById('presion_sistolica').value = result.datos_extraidos.presion_sistolica;
    document.getElementById('presion_diastolica').value = result.datos_extraidos.presion_diastolica;
    document.getElementById('frecuencia_cardiaca').value = result.datos_extraidos.frecuencia_cardiaca;
    // ... etc
    
    mostrarResumen(result); // "NOVA entendió: PA 120/80, FC 92, T 37.2, SatO2 99"
  }
}
```

### En TELEGRAM (@Drvirnbot)

**Flujo:**
1. Médico envía `/notas` + audio
2. Bot transcribe y envía a `/api/nova-dictacion` con `origen: telegram`
3. NOVA responde con datos extraídos
4. Bot muestra: "Entendí: [resumen]"
5. Médico confirma: "✅ Guardar"
6. Bot hace POST a `/api/airtable` directamente (sin UI, solo API)
7. Confirma: "✅ Guardado en expediente de [Paciente]"

---

## 4. SEGURIDAD Y VALIDACIÓN

### Verificaciones por NOVA

```
✓ Audio válido (formato, duración, calidad)
✓ Sesión del médico válida (token)
✓ Acceso al paciente (autorizarPaciente)
✓ Datos coherentes médicamente (rango PA, temp, FC)
✓ Campos requeridos presentes
✗ Rechaza si: audio corrupto, sesión expirada, acceso denegado, datos incoherentes
```

### Campo de Auditoría

```
CONSULTAS.notas_generales agrega:
"[2026-10-04 09:30] (Dictada por NOVA, revisada médico) [Nota clínica]"

Traza de origen:
- origen: "portal" | "telegram"
- metodo: "voz" (vs "manual")
- confianza_nova: 0.92
- tiempo_procesamiento: 1.2s
```

---

## 5. FLUJOS ESPECÍFICOS

### Flujo A: Médico dicta NOTAS desde Portal

```
1. Abre expediente de paciente
2. Ve botón [🎤 Dictar nota clínica] en panel lado derecho
3. Presiona → acceso a micrófono
4. Graba mientras dicta (máx 2 min)
5. Suelta → NOVA transcribe y formatea
6. Ve: "Nota procesada: [texto formateado]"
7. Puede editar el texto si quiere
8. Presiona [Guardar en expediente]
9. Se guarda en CONSULTAS.notas_generales
10. Confirmación: "✅ Nota guardada a las 09:35"
```

### Flujo B: Médico dicta SIGNOS desde Portal

```
1. Ve botón [📊 Dictar signos vitales]
2. Presiona → grabador
3. Dicta: "Presión 120 80, frecuencia 88, temperatura 37"
4. NOVA extrae números
5. Campos se llenan automáticamente
6. Muestra: "Entendí: PA 120/80, FC 88, T 37°C"
7. Puede ajustar si fue mal entendido
8. Presiona [Guardar]
9. Se guarda en CONSULTAS (tabla de signos) o ANTECEDENTES según contexto
```

### Flujo C: Médico dicta via Telegram

```
1. Abre chat @Drvirnbot
2. Envía: /dictar [CCMED-VIRN01] [CCPAC-0001]
3. Bot responde: "¿Qué tipo? [notas] [signos] [historia]"
4. Envía: /notas (+ audio)
5. Bot: "Transcribiendo..."
6. Bot: "Entendí: [resumen nota]"
7. Envía: ✅ (emoji de confirmación)
8. Bot: "✅ Guardado en expediente de Mariana"
9. Expediente en portal ya muestra la nota (sincronizado)
```

---

## 6. REQUISITOS TÉCNICOS

### Frontend (Portal)

**Necesita:**
- Web Audio API (grabador de voz)
- Web Speech API (reconocimiento de voz) O servicio externo
- Permisos de micrófono (HTTPS requerido)

**Librerías opcionales:**
- `recordrtc.js` (grabación audio)
- `google-cloud-speech` o `whisper-api` (transcripción)

### Backend (nova.js + nueva ruta)

**Nueva ruta:**
```
POST /api/nova-dictacion
  - Recibe audio en base64
  - Transcribe a texto
  - Procesa con NOVA (NLP)
  - Extrae datos
  - Devuelve JSON estructurado
```

**Integración con NOVA existente:**
- Reutilizar lógica de procesamiento de NOVA
- Usar mismo token de autenticación
- Guardar en CONSULTAS/ANTECEDENTES igual que otras fuentes

### Telegram (@Drvirnbot)

**Mejoras:**
- Aceptar audio directo (no solo texto)
- Comandos `/notas`, `/signos`, `/historia`
- Sincronización con Airtable en tiempo real

---

## 7. IMPLEMENTACIÓN: ORDEN

### Fase 1: Backend (1 semana)
- [ ] Crear `/api/nova-dictacion` endpoint
- [ ] Integrar servicio de voz a texto (Google, Azure, Whisper)
- [ ] Implementar NLP para extraer datos (NOVA)
- [ ] Validación y auditoría
- [ ] Tests

### Fase 2: Portal (1 semana)
- [ ] Agregar UI de grabación
- [ ] Integrar Web Audio API
- [ ] Llenar formularios dinámicamente
- [ ] Edición y revisión
- [ ] Tests en navegador

### Fase 3: Telegram (3 días)
- [ ] Extender @Drvirnbot para aceptar audio
- [ ] Nuevos comandos
- [ ] Sincronización con Airtable
- [ ] Tests

### Fase 4: Pulir (3 días)
- [ ] Accesibilidad
- [ ] Manejo de errores
- [ ] UX fluida
- [ ] Documentación

**Total: ~3 semanas (con MVP en 1 semana)**

---

## 8. CASOS DE USO REALES

### Caso 1: Médico en consultorio
```
Médico ve paciente, dicta rápido mientras atiende:
- Presiona [🎤 SIGNOS] → "Presión 140 90, frecuencia 72"
- Presiona [🎤 NOTAS] → "Dolor torácico atípico, EKG normal"
- Presiona [Guardar]
- Datos listos en expediente sin escribir nada manualmente
```

### Caso 2: Médico en pasillos/emergencia
```
En emergencia, sin tiempo de escribir:
- Dicta via Telegram: @Drvirnbot /notas [paciente] [audio]
- Bot: "Entendí: [resumen]"
- Confirma: ✅
- Sigue atendiendo otros pacientes
- Expediente ya está actualizado
```

### Caso 3: Médico en casa (después de consulta)
```
Después de ver pacientes:
- Abre portal
- Para cada paciente, presiona [🎤 HISTORIA]
- Dicta: "Motivo: seguimiento. Hallazgos: mejor. Plan: continuar medicamento"
- NOVA llena formulario
- Revisa y guarda en lote
- 5 expedientes listos en 5 minutos
```

---

## 9. CHECKLIST IMPLEMENTACIÓN

- [ ] Web Audio API grabador funcional
- [ ] Servicio de voz a texto integrado
- [ ] NOVA NLP extrayendo datos correctamente
- [ ] Validación de datos médicos
- [ ] Formularios llenándose automáticamente
- [ ] Auditoría registrando origen y confianza
- [ ] Telegram aceptando audio y comandos
- [ ] Sincronización bidireccional Telegram ↔ Portal
- [ ] Tests end-to-end con casos reales
- [ ] Accesibilidad WCAG (atajos teclado, etc)
- [ ] Documentación para médicos
- [ ] Capacitación/tutoriales

---

**SIGUIENTE PASO:** ¿Aprobado este plan? ¿O hay ajustes en el flujo?
