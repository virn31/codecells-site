// lib/agenda-asistente.js
// Cuestionario de Telegram (con botones) para que el médico configure su
// horario UNA vez, y lectura de bloqueos escritos en lenguaje natural
// ("NOVA, estaré fuera del 5 al 10 de noviembre").
//
// El cuestionario es una máquina de estados pura: el estado se guarda en el
// perfil del directorio (campo "Agenda — asistente") entre toque y toque, y
// cada botón solo vale en el paso que lo mostró. Así no quedan días a medias:
// se recorre cada día elegido hasta tener su horario completo, y el resumen
// final dice también qué días NO hay consulta.

const A = require('./agenda');
const { fechaMexico } = require('./citas');

const PASOS = Object.freeze(['dias', 'dur', 'mismo', 'ini', 'fin', 'desc', 'dini', 'dfin', 'conf']);
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
const HORA_PRIMERA = 7 * 60;
const HORA_ULTIMA_INICIO = 19 * 60;
const HORA_ULTIMA_FIN = 22 * 60;
const DESCANSO_MINIMO_TOTAL = 3 * 60; // con menos de 3 h seguidas no se pregunta por descanso

function inicio() {
  return { paso: 'dias', dias: [], dur: null, grupos: [], gi: 0, ini: null, fin: null, dIni: null, rangos: {} };
}

const btn = (text, data) => ({ text, callback_data: 'ag:' + data });
const filas = (botones, porFila) => {
  const r = [];
  for (let i = 0; i < botones.length; i += porFila) r.push(botones.slice(i, i + porFila));
  return r;
};
const nombresDias = dias => ORDEN_DIAS.filter(d => dias.includes(d)).map(d => A.DIAS_CORTOS[d]).join(', ');
const pie = [btn('↺ Empezar de nuevo', 'reset:0'), btn('✖ Cancelar', 'x:0')];

function rango(desde, hasta, paso) {
  const r = [];
  for (let m = desde; m <= hasta; m += paso) r.push(m);
  return r;
}

// Opciones válidas de cada paso: lo que se muestra es exactamente lo que se
// acepta (un botón viejo o manipulado con otro valor se rechaza).
function opciones(e) {
  const dur = e.dur || A.DURACION_DEFECTO;
  switch (e.paso) {
    case 'ini': return rango(HORA_PRIMERA, HORA_ULTIMA_INICIO, 60);
    case 'fin': return rango(e.ini + 60, HORA_ULTIMA_FIN, 60).filter(m => m - e.ini >= dur);
    // Antes y después del descanso debe caber al menos una consulta.
    case 'dini': return rango(e.ini + 60, e.fin - 60, 60).filter(m => m - e.ini >= dur && e.fin - m >= dur + 30);
    case 'dfin': return rango(e.dIni + 30, e.dIni + 180, 30).filter(m => e.fin - m >= dur);
    default: return [];
  }
}

function grupoActual(e) {
  return e.grupos[e.gi] || [];
}

function render(e) {
  const g = grupoActual(e);
  const titulo = g.length ? `Horario de ${nombresDias(g)}` : '';
  switch (e.paso) {
    case 'dias':
      return {
        texto: '🗓 Configurar tu agenda (1 de 4)\n\n¿Qué días das consulta? Toca cada día para marcarlo y luego "Continuar".',
        teclado: [
          ...filas(ORDEN_DIAS.map(d => btn((e.dias.includes(d) ? '✅ ' : '') + A.DIAS_CORTOS[d], 'dia:' + d)), 4),
          [btn('Continuar ▶', 'dias:ok')],
          [btn('✖ Cancelar', 'x:0')],
        ],
      };
    case 'dur':
      return {
        texto: '🗓 Configurar tu agenda (2 de 4)\n\n¿Cuánto dura cada consulta?',
        teclado: [A.DURACIONES.map(m => btn(m === A.DURACION_DEFECTO ? `${m} min ⭐` : `${m} min`, 'dur:' + m)), pie],
      };
    case 'mismo':
      return {
        texto: `🗓 Configurar tu agenda (3 de 4)\n\nDías de consulta: ${nombresDias(e.dias)}.\n¿Tienes el mismo horario todos esos días?`,
        teclado: [[btn('Sí, el mismo', 'mismo:1'), btn('No, cambia por día', 'mismo:0')], pie],
      };
    case 'ini':
      return {
        texto: `🗓 ${titulo}\n\n¿A qué hora empiezas a dar consulta?`,
        teclado: [...filas(opciones(e).map(m => btn(A.horaCorta(A.hhmm(m)), 'ini:' + m)), 4), pie],
      };
    case 'fin':
      return {
        texto: `🗓 ${titulo}\nEmpiezas: ${A.horaCorta(A.hhmm(e.ini))}\n\n¿A qué hora terminas?`,
        teclado: [...filas(opciones(e).map(m => btn(A.horaCorta(A.hhmm(m)), 'fin:' + m)), 4), pie],
      };
    case 'desc':
      return {
        texto: `🗓 ${titulo}\nDe ${A.horaCorta(A.hhmm(e.ini))} a ${A.horaCorta(A.hhmm(e.fin))}\n\n¿Tienes un descanso (comida) en medio en el que no deba agendar?`,
        teclado: [[btn('No, corrido', 'desc:0'), btn('Sí, tengo descanso', 'desc:1')], pie],
      };
    case 'dini':
      return {
        texto: `🗓 ${titulo}\n\n¿A qué hora empieza tu descanso?`,
        teclado: [...filas(opciones(e).map(m => btn(A.horaCorta(A.hhmm(m)), 'dini:' + m)), 4), pie],
      };
    case 'dfin':
      return {
        texto: `🗓 ${titulo}\nDescanso desde: ${A.horaCorta(A.hhmm(e.dIni))}\n\n¿A qué hora regresas a consulta?`,
        teclado: [...filas(opciones(e).map(m => btn(A.horaCorta(A.hhmm(m)), 'dfin:' + m)), 4), pie],
      };
    case 'conf':
      return {
        texto: '🗓 Configurar tu agenda (4 de 4)\n\nRevisa tu horario:\n\n' + A.textoHorario(horarioDe(e)) +
          '\n\nLos pacientes solo verán estos espacios y su cita quedará confirmada sola. ¿Lo guardo?',
        teclado: [[btn('✅ Guardar', 'conf:si')], pie],
      };
    default:
      return { texto: 'Cuestionario terminado.', teclado: [] };
  }
}

function horarioDe(e) {
  return { duracion: e.dur, dias: e.rangos };
}

function cerrarGrupo(e, rangos) {
  for (const d of grupoActual(e)) e.rangos[String(d)] = rangos.map(([a, b]) => [A.hhmm(a), A.hhmm(b)]);
  e.gi += 1;
  e.ini = e.fin = e.dIni = null;
  e.paso = e.gi < e.grupos.length ? 'ini' : 'conf';
}

// Aplica un toque de botón. Devuelve { ok, estado, error?, terminado?, cancelado?, horario? }.
function aplicar(estadoPrevio, accion, valor) {
  if (accion === 'x') return { ok: true, cancelado: true, estado: null };
  if (accion === 'reset') return { ok: true, estado: inicio() };
  const e = JSON.parse(JSON.stringify(estadoPrevio || {}));
  if (!PASOS.includes(e.paso)) return { ok: false, error: 'Este cuestionario ya terminó. Escribe /agenda para empezar otro.' };
  const n = Number(valor);
  const fuera = () => ({ ok: false, error: 'Ese botón ya no aplica. Usa el mensaje más reciente.' });

  switch (e.paso) {
    case 'dias':
      if (accion === 'dia') {
        if (!(n >= 0 && n <= 6)) return fuera();
        e.dias = e.dias.includes(n) ? e.dias.filter(d => d !== n) : [...e.dias, n];
        return { ok: true, estado: e };
      }
      if (accion === 'dias') {
        if (!e.dias.length) return { ok: false, error: 'Marca al menos un día.' };
        e.dias = ORDEN_DIAS.filter(d => e.dias.includes(d));
        e.paso = 'dur';
        return { ok: true, estado: e };
      }
      return fuera();
    case 'dur':
      if (accion !== 'dur' || !A.DURACIONES.includes(n)) return fuera();
      e.dur = n;
      if (e.dias.length > 1) e.paso = 'mismo';
      else { e.grupos = [e.dias]; e.paso = 'ini'; }
      return { ok: true, estado: e };
    case 'mismo':
      if (accion !== 'mismo' || !['0', '1'].includes(String(valor))) return fuera();
      e.grupos = valor === '1' || n === 1 ? [e.dias] : e.dias.map(d => [d]);
      e.gi = 0;
      e.paso = 'ini';
      return { ok: true, estado: e };
    case 'ini':
    case 'fin':
    case 'dini':
    case 'dfin': {
      if (accion !== e.paso || !opciones(e).includes(n)) return fuera();
      if (e.paso === 'ini') { e.ini = n; e.paso = 'fin'; }
      else if (e.paso === 'fin') {
        e.fin = n;
        const cabeDescanso = e.fin - e.ini >= DESCANSO_MINIMO_TOTAL && opciones({ ...e, paso: 'dini' }).length > 0;
        if (cabeDescanso) e.paso = 'desc';
        else cerrarGrupo(e, [[e.ini, e.fin]]);
      } else if (e.paso === 'dini') { e.dIni = n; e.paso = 'dfin'; }
      else cerrarGrupo(e, [[e.ini, e.dIni], [n, e.fin]]);
      return { ok: true, estado: e };
    }
    case 'desc':
      if (accion !== 'desc' || !['0', '1'].includes(String(valor))) return fuera();
      if (String(valor) === '1') e.paso = 'dini';
      else cerrarGrupo(e, [[e.ini, e.fin]]);
      return { ok: true, estado: e };
    case 'conf': {
      if (accion !== 'conf' || valor !== 'si') return fuera();
      const v = A.validarHorarioSemanal(horarioDe(e));
      if (!v.ok) return { ok: false, error: v.error };
      return { ok: true, terminado: true, estado: null, horario: v.horario };
    }
    default:
      return fuera();
  }
}

// "ag:dia:3" → { accion: 'dia', valor: '3' }
function leerBoton(data) {
  const m = String(data || '').match(/^ag:([a-z]+):([A-Za-z0-9_-]{1,20})$/);
  return m ? { accion: m[1], valor: m[2] } : null;
}

// ¿Este mensaje libre del médico parece hablar de su agenda? Filtro barato
// antes de gastar una llamada al modelo.
const PATRON_AGENDA = /\b(fuera|vacaciones|no (me )?(pongas|agendes|des|programes)|bloque|no (voy a |podr[eé] )?(consult|atend|estar|ir)|no habr[aá]|no hay consulta|congreso|viaje|viajo|ausen|cerrad|descans|cita[s]?|agenda|consultorio|libre)/i;
const pareceDeAgenda = texto => PATRON_AGENDA.test(String(texto || ''));

const SISTEMA_BLOQUEO = `Eres NOVA, asistente de agenda de un médico en México. El médico te escribe para que NO le agendes citas en ciertas fechas.
Extrae el bloqueo y responde SOLO con un objeto JSON, sin texto alrededor:
{"es_bloqueo": true|false, "desde": "YYYY-MM-DD"|null, "hasta": "YYYY-MM-DD"|null, "hora_inicio": "HH:mm"|null, "hora_fin": "HH:mm"|null, "nota": string|null, "duda": string|null}
Reglas:
- "desde" y "hasta" son inclusivos. Un solo día: desde = hasta.
- Si no dice año, usa la fecha futura más próxima a partir de hoy.
- hora_inicio/hora_fin solo si el médico limita el bloqueo a una parte del día ("el jueves en la tarde" = 14:00 a 22:00, "en la mañana" = 07:00 a 14:00). Si es todo el día, ambas null.
- "nota": motivo breve si lo dice ("congreso", "vacaciones"); si no, null.
- Si el mensaje no pide bloquear fechas, es_bloqueo = false.
- Si las fechas son ambiguas o no se pueden determinar con certeza, NO adivines: deja desde/hasta en null y escribe en "duda" una pregunta corta para el médico.`;

// Llama al modelo y valida su salida con las mismas reglas de siempre. El
// resultado SIEMPRE se le muestra al médico para que confirme con un botón.
async function interpretarBloqueo(texto, { ahora = new Date(), fetchImpl = fetch, apiKey = process.env.ANTHROPIC_API_KEY, model } = {}) {
  const hoy = fechaMexico(ahora);
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      // El modelo razona antes de contestar; con poco margen se queda sin
      // espacio para el JSON (pasó con 300 en la prueba con "la otra semana").
      max_tokens: 4000,
      system: SISTEMA_BLOQUEO,
      messages: [{ role: 'user', content: `Hoy es ${A.fechaTexto(hoy)} (${hoy}).\nMensaje del médico: ${String(texto).slice(0, 600)}` }],
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error('NOVA no respondió: ' + ((data.error && data.error.message) || r.status));
  if (data.stop_reason === 'max_tokens') throw new Error('NOVA no terminó su respuesta (max_tokens).');
  const bloque = (data.content || []).find(b => b.type === 'text');
  const m = bloque && bloque.text.match(/\{[\s\S]*\}/);
  let j = null;
  try { j = m ? JSON.parse(m[0]) : null; } catch (e) { j = null; }
  if (!j) throw new Error('NOVA dio una respuesta que no se pudo leer.');
  if (!j.es_bloqueo) return { ok: false, noEsBloqueo: true };
  if (!j.desde) return { ok: false, duda: String(j.duda || '¿Qué fechas quieres bloquear?').slice(0, 200) };
  const v = A.validarBloqueo({ desde: j.desde, hasta: j.hasta || j.desde, ini: j.hora_inicio, fin: j.hora_fin, nota: j.nota }, ahora);
  if (!v.ok) return { ok: false, duda: v.error + ' ¿Me lo escribes de otra forma? Ejemplo: "No me pongas citas del 5 al 10 de noviembre".' };
  return { ok: true, bloqueo: v.bloqueo };
}

module.exports = { inicio, render, aplicar, leerBoton, opciones, pareceDeAgenda, interpretarBloqueo, SISTEMA_BLOQUEO };
