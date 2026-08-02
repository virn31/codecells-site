/**
 * API: Búsqueda de Médicos + Triage NOVA (BILINGÜE)
 * Endpoint: /api/buscar-medicos (POST)
 * 
 * Acciones:
 * 1. "listar" — lista todos los médicos activos
 * 2. "triage" — NOVA sugiere médicos basado en síntomas (español/inglés)
 */

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Proxy a Airtable para obtener médicos
async function obtenerMedicosDeAirtable() {
  const baseId = "app6jyD9pDlTLpknA";
  const tableId = "tbl87DsuBMmb4DjFM";
  const token = process.env.AIRTABLE_TOKEN;

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${tableId}?pageSize=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      console.error("Error Airtable:", response.statusText);
      return [];
    }

    const data = await response.json();
    return data.records.map((r) => ({
      id: r.id,
      codigo: r.fields["Código de médico"] || "",
      nombre: r.fields["Nombre completo"] || "",
      especialidades: r.fields["Especialidad CODE"] || [],
      estado: r.fields["Estado"] || "Desconocido",
      ciudad: r.fields["Ciudad"] || "Desconocido",
      nivel: r.fields["Nivel CODE CELLS®"] || "Asociado",
      activo: r.fields["Activo"] !== false,
      telefono: r.fields["Teléfono/WhatsApp"] || "",
      bio: r.fields["Biografía breve"] || "",
    }));
  } catch (error) {
    console.error("Error conectando Airtable:", error);
    return [];
  }
}

// Triage inteligente con NOVA (BILINGÜE)
async function triageNova(mensaje, historial, medicos, idioma = 'es') {
  const isEnglish = idioma === 'en';
  
  const systemPromptES = `Eres NOVA, asistente médico inteligente de CODE CELLS®. Tu rol es:

1. ESCUCHAR el problema clínico del paciente (síntomas, condición, duración).
2. IDENTIFICAR el sistema CODE más relevante:
   - ENERGY: fatiga, baja energía, cansancio crónico
   - REPAIR: lesiones, traumas, cicatrización, heridas
   - BALANCE: equilibrio hormonal, estrés, ansiedad, sueño
   - NEURO: neurología, migrañas, neuropatía, memoria
   - REGEN: regeneración celular, osteoartritis, cartílago, tejidos
   - DEZAWA: protocolo premium, envejecimiento, resultados estéticos

3. SUGERIR médicos de la red que sean especialistas en ese sistema.
4. USAR un tono empático, científico, elegante (Mayo Clinic + Apple).
5. NUNCA diagnosticar — solo orientar hacia el especialista correcto.

Médicos disponibles en la Red CODE CELLS®:
${medicos
  .filter((m) => m.activo)
  .map(
    (m) => `
- Dr. ${m.nombre} (${m.codigo})
  Especialidades: ${m.especialidades.join(", ")}
  Ubicación: ${m.ciudad}, ${m.estado}
  Nivel: ${m.nivel}
  ${m.bio ? "Bio: " + m.bio : ""}
`
  )
  .join("")}

Responde SIEMPRE en español, con empatía. Si el paciente describe un problema específico, sugiere el médico más adecuado por especialidad + ubicación. Mantén la conversación conversacional y amable.`;

  const systemPromptEN = `You are NOVA, an intelligent medical assistant for CODE CELLS®. Your role is:

1. LISTEN to the patient's clinical problem (symptoms, condition, duration).
2. IDENTIFY the most relevant CODE system:
   - ENERGY: fatigue, low energy, chronic tiredness
   - REPAIR: injuries, trauma, scarring, wounds
   - BALANCE: hormonal balance, stress, anxiety, sleep
   - NEURO: neurology, migraines, neuropathy, memory
   - REGEN: cellular regeneration, osteoarthritis, cartilage, tissues
   - DEZAWA: premium protocol, aging, cosmetic results

3. SUGGEST doctors from the network who are specialists in that system.
4. USE an empathetic, scientific, elegant tone (Mayo Clinic + Apple).
5. NEVER diagnose — only guide toward the right specialist.

Available doctors in the CODE CELLS® Network:
${medicos
  .filter((m) => m.activo)
  .map(
    (m) => `
- Dr. ${m.nombre} (${m.codigo})
  Specialties: ${m.especialidades.join(", ")}
  Location: ${m.ciudad}, ${m.estado}
  Level: ${m.nivel}
  ${m.bio ? "Bio: " + m.bio : ""}
`
  )
  .join("")}

Always respond in English, with empathy. If the patient describes a specific problem, suggest the most appropriate doctor by specialty + location. Keep the conversation conversational and friendly.`;

  const systemPrompt = isEnglish ? systemPromptEN : systemPromptES;

  const messages = [
    ...historial.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.mensaje,
    })),
    { role: "user", content: mensaje },
  ];

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system: systemPrompt,
      messages,
    });

    const respuesta = response.content[0].type === "text" ? response.content[0].text : "";

    // Extraer códigos de médicos sugeridos
    const codigosMatch = respuesta.match(/CCMED-[A-Z0-9]+/g) || [];
    const medicosIds = [...new Set(codigosMatch)];

    return {
      respuesta,
      medicos_sugeridos: medicosIds,
    };
  } catch (error) {
    console.error("Error NOVA:", error);
    const fallbackES = "Disculpa, hubo un error procesando tu solicitud. Intenta describir tus síntomas de nuevo.";
    const fallbackEN = "Sorry, there was an error processing your request. Please try describing your symptoms again.";
    return {
      respuesta: isEnglish ? fallbackEN : fallbackES,
      medicos_sugeridos: [],
    };
  }
}

// Handler principal
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { accion, mensaje, historial, idioma = 'es' } = req.body;

  // Cargar médicos
  const medicos = await obtenerMedicosDeAirtable();

  if (accion === "listar") {
    return res.status(200).json({
      medicos: medicos.filter((m) => m.activo),
    });
  }

  if (accion === "triage") {
    if (!mensaje) {
      return res.status(400).json({ error: "Mensaje requerido" });
    }

    const resultado = await triageNova(mensaje, historial || [], medicos, idioma);
    return res.status(200).json(resultado);
  }

  return res.status(400).json({ error: "Acción no reconocida" });
}
