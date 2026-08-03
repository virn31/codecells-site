// api/nova-asistente.js
// ─── GENERADOR INDICACIONES + RECETA (NOVA) ──────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  
  try {
    const { accion, citaId, pacienteNombre, protocolo, sistema, medicoNombre, notasMedico } = req.body;
    
    if (accion === 'generar_indicaciones') {
      return generarIndicaciones(res, { pacienteNombre, protocolo, sistema, medicoNombre, notasMedico });
    } else if (accion === 'generar_receta') {
      return generarReceta(res, { pacienteNombre, protocolo, sistema, medicoNombre });
    }
    
    return res.status(400).json({ error: 'Acción no válida' });
  } catch (err) {
    console.error('Error en nova-asistente:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function generarIndicaciones(res, datos) {
  try {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    const prompt = `
Eres un asistente médico especializado en medicina regenerativa CODE CELLS®.

TAREA: Generar indicaciones médicas claras y completas para el paciente ANTES de su cita.

DATOS:
- Paciente: ${datos.pacienteNombre}
- Protocolo: ${datos.protocolo}
- Sistema CODE: ${datos.sistema}
- Médico: ${datos.medicoNombre}
- Notas del médico: ${datos.notasMedico || 'Ninguna'}

INDICACIONES DEBEN INCLUIR:
1. Ayuno (si aplica)
2. Medicamentos a suspender (si aplica)
3. Análisis previos requeridos
4. Cuidados generales 48h antes
5. Qué llevar a la cita
6. Duración estimada
7. Posibles efectos posteriores

FORMATO: Texto claro, amigable, sin jerga médica excesiva.
    `.trim();
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    if (!response.ok) {
      throw new Error('Error llamando Anthropic API');
    }
    
    const data = await response.json();
    const indicaciones = data.content[0].text;
    
    return res.status(200).json({
      success: true,
      indicaciones
    });
  } catch (err) {
    console.error('Error generando indicaciones:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function generarReceta(res, datos) {
  try {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    const prompt = `
Eres un asistente médico especializado en medicina regenerativa CODE CELLS®.

TAREA: Generar receta personalizada con medicamentos y suplementos para el paciente.

DATOS:
- Paciente: ${datos.pacienteNombre}
- Protocolo: ${datos.protocolo}
- Sistema CODE: ${datos.sistema}
- Médico: ${datos.medicoNombre}

LA RECETA DEBE INCLUIR:
1. Inyectables (si corresponde al protocolo)
2. Medicamentos (indicar dosis)
3. Suplementos (dosis y frecuencia)
4. Duración del tratamiento
5. Contraindicaciones importantes
6. Observaciones del médico

FORMATO: Claro, con dosis específicas, fácil de seguir.
Incluir recomendación de consultar al médico si hay dudas.
    `.trim();
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    if (!response.ok) {
      throw new Error('Error llamando Anthropic API');
    }
    
    const data = await response.json();
    const receta = data.content[0].text;
    
    return res.status(200).json({
      success: true,
      receta
    });
  } catch (err) {
    console.error('Error generando receta:', err);
    return res.status(500).json({ error: err.message });
  }
}

