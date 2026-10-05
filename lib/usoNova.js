// lib/usoNova.js
// Tope discreto del chat con NOVA, por ahorro de tokens (decidido por
// Víctor el 2026-10-05). NOVA no es un chat conversacional prolongado ni
// para el paciente ni para el médico. Tres capas:
//
//   1. Ventana corta (invisible): al modelo solo le llegan los últimos
//      VENTANA[tipo] mensajes. Antes cada turno reenviaba hasta 100 mensajes,
//      así que el costo de cada mensaje crecía con la conversación. La
//      memoria del paciente vive aparte (Memoria NOVA), no en el historial.
//   2. Conversación larga del paciente: a partir de CIERRE_SUAVE_PACIENTE
//      mensajes suyos, NOVA cierra con naturalidad (instrucción en el
//      system prompt), sin abrir temas nuevos.
//   3. Tope diario por persona (día en hora de Culiacán): paciente/VIP 20,
//      médico 40. Al llegar, un cierre cordial — sin contadores visibles.
//
// Médico: con un expediente abierto en el portal (pacienteCode) es trabajo
// clínico — dictar, guardar labs — y NUNCA cuenta ni se bloquea. Solo cuenta
// la plática sin paciente abierto.
// Demo: sin tope diario (comparte código y se usa en presentaciones).
//
// El contador vive en la tabla USO_NOVA (por NOMBRE; su ID cambia entre
// bases). Si el contador falla, NO se bloquea a nadie: el tope es ahorro, no
// seguridad. El fallo queda en el log.

const TABLA = 'USO_NOVA';

const LIMITE_DIARIO = Object.freeze({ paciente: 20, vip: 20, medico: 40 });
const VENTANA = Object.freeze({ paciente: 12, vip: 12, demo: 12, publico: 12, medico: 20 });
const CIERRE_SUAVE_PACIENTE = 10;

const MENSAJE_TOPE = Object.freeze({
  paciente: {
    es: 'Por hoy avanzamos bastante. Mañana seguimos con gusto. Si es algo urgente, contacta directamente a tu médico.',
    en: "We've covered a lot today. Let's pick this up tomorrow. If it's urgent, please contact your doctor directly.",
    pt: 'Hoje avançamos bastante. Amanhã seguimos com prazer. Se for urgente, entre em contato diretamente com seu médico.',
  },
  medico: 'Por hoy llegamos al límite de consultas generales con NOVA; se reactiva mañana. Con un expediente abierto, el dictado y el guardado siguen funcionando normalmente.',
});

const INSTRUCCION_CIERRE_SUAVE = `

CONVERSACIÓN LARGA: esta conversación ya se extendió. Responde lo que te preguntan de forma breve, no abras temas nuevos ni hagas preguntas de seguimiento, y cierra con amabilidad sugiriendo continuar otro día o comentarlo con su médico en su próxima consulta.`;

function fechaCuliacan(fecha = new Date()) {
  // Culiacán (Sinaloa) = America/Mazatlan, UTC-7 sin horario de verano.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mazatlan', year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

// Recorta EN SITIO (el arreglo lo usan después los reintentos y el
// guardado) a los últimos `n` mensajes. La API exige que el primero sea del
// usuario, así que se descartan los del asistente que queden al frente.
function recortarHistorial(messages, n) {
  if (!Array.isArray(messages) || messages.length <= n) return messages;
  messages.splice(0, messages.length - n);
  while (messages.length > 1 && messages[0].role !== 'user') messages.shift();
  return messages;
}

function mensajesDelUsuario(messages) {
  return Array.isArray(messages) ? messages.filter((m) => m && m.role === 'user').length : 0;
}

function urlTabla(sufijo = '') {
  const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');
  return `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLA)}${sufijo}`;
}

function cabeceras() {
  return { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
}

// ¿Esta persona ya llegó al tope de hoy? Si no, cuenta este mensaje.
// Devuelve { agotado: boolean, error?: string }. Nunca lanza.
async function verificarYContar(tipo, codigo) {
  const limite = LIMITE_DIARIO[tipo];
  if (!limite || !codigo) return { agotado: false };
  const fecha = fechaCuliacan();
  const clave = `${codigo}|${fecha}`;
  try {
    const formula = `{Clave}="${String(clave).replace(/"/g, '\\"')}"`;
    const r = await fetch(urlTabla(`?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`), { headers: cabeceras() });
    if (!r.ok) throw new Error(`Airtable respondió ${r.status} al leer ${TABLA}`);
    const rec = ((await r.json()).records || [])[0];
    const usados = rec ? Number(rec.fields['Mensajes']) || 0 : 0;
    if (usados >= limite) return { agotado: true };

    const w = rec
      ? await fetch(urlTabla(`/${rec.id}`), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ fields: { 'Mensajes': usados + 1 } }) })
      : await fetch(urlTabla(), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ fields: { 'Clave': clave, 'Código': codigo, 'Fecha': fecha, 'Tipo': tipo, 'Mensajes': 1 } }) });
    if (!w.ok) throw new Error(`Airtable respondió ${w.status} al contar en ${TABLA}`);
    return { agotado: false };
  } catch (err) {
    console.error('[usoNova] contador no disponible, no se bloquea:', err.message);
    return { agotado: false, error: err.message };
  }
}

function mensajeTope(tipo, idioma) {
  if (tipo === 'medico') return MENSAJE_TOPE.medico;
  const textos = MENSAJE_TOPE.paciente;
  return textos[idioma] || textos.es;
}

module.exports = {
  LIMITE_DIARIO, VENTANA, CIERRE_SUAVE_PACIENTE, INSTRUCCION_CIERRE_SUAVE,
  fechaCuliacan, recortarHistorial, mensajesDelUsuario, verificarYContar, mensajeTope,
};
