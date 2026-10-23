// lib/agenda.js
// Reglas puras de la agenda automática del directorio (etapa 2b, 2026-10-23).
//
// El médico configura UNA vez su horario semanal (por Telegram, con botones) y
// bloquea fechas escribiéndole a NOVA. El paciente solo ve los espacios libres
// y su cita queda agendada sin que el médico tenga que hacer nada.
//
// Todas las horas son hora local del consultorio (México), como texto "HH:mm";
// las fechas, "YYYY-MM-DD". No hay conversiones de zona horaria que muevan
// una cita.

const { fechaMexico, sumarDias, ESTADOS_CITA, DIAS_MAXIMOS } = require('./citas');

const DURACIONES = Object.freeze([20, 30, 45, 60]);
const DURACION_DEFECTO = 30;
const DIAS = Object.freeze(['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']);
const DIAS_CORTOS = Object.freeze(['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']);
const MESES = Object.freeze(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']);
// Estados de una solicitud que ocupan un espacio de la agenda.
const ESTADOS_QUE_OCUPAN = Object.freeze([ESTADOS_CITA.ACEPTADA, ESTADOS_CITA.CONFIRMADA, ESTADOS_CITA.PROPUESTA]);
const BLOQUEO_MAX_DIAS = 366;

const CAMPOS = Object.freeze({
  HORARIO: 'Agenda — horario',
  BLOQUEOS: 'Agenda — bloqueos',
  ASISTENTE: 'Agenda — asistente',
  AUTOMATICA: 'Agenda — automática',
});

function fechaValida(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return false;
  const d = new Date(ymd + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === ymd;
}

const horaValida = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || ''));
const minutos = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const diaSemana = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();
// "9:00" para mostrar (sin cero inicial).
const horaCorta = h => h.replace(/^0(\d)/, '$1');

function leerJSON(texto, defecto) {
  if (!texto) return defecto;
  try { return JSON.parse(texto); } catch (e) { return defecto; }
}

// Valida el horario semanal guardado: { duracion, dias: { '1': [['09:00','14:00'], …] } }
// (0 = domingo … 6 = sábado). Rangos ordenados y sin traslaparse.
function validarHorarioSemanal(h) {
  if (!h || typeof h !== 'object') return { ok: false, error: 'Horario vacío.' };
  const duracion = Number(h.duracion);
  if (!DURACIONES.includes(duracion)) return { ok: false, error: 'Duración de consulta no válida.' };
  const dias = {};
  for (const [k, rangos] of Object.entries(h.dias || {})) {
    if (!/^[0-6]$/.test(k) || !Array.isArray(rangos)) return { ok: false, error: 'Día no válido.' };
    if (!rangos.length) continue;
    const orden = rangos.map(r => (Array.isArray(r) ? r : [])).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    let finAnterior = -1;
    for (const [ini, fin] of orden) {
      if (!horaValida(ini) || !horaValida(fin)) return { ok: false, error: `Hora no válida el ${DIAS[k]}.` };
      if (minutos(fin) - minutos(ini) < duracion) return { ok: false, error: `El ${DIAS[k]} no cabe ni una consulta entre ${ini} y ${fin}.` };
      if (minutos(ini) < finAnterior) return { ok: false, error: `Horarios encimados el ${DIAS[k]}.` };
      finAnterior = minutos(fin);
    }
    dias[k] = orden.map(([a, b]) => [a, b]);
  }
  if (!Object.keys(dias).length) return { ok: false, error: 'Elige al menos un día de consulta.' };
  return { ok: true, horario: { duracion, dias } };
}

// Bloqueo: días completos (sin horas) o una franja dentro de esos días.
function validarBloqueo(b, ahora = new Date()) {
  const x = b || {};
  const desde = String(x.desde || '');
  const hasta = String(x.hasta || x.desde || '');
  if (!fechaValida(desde) || !fechaValida(hasta)) return { ok: false, error: 'No entendí las fechas.' };
  if (hasta < desde) return { ok: false, error: 'La fecha final es antes que la inicial.' };
  const hoy = fechaMexico(ahora);
  if (hasta < hoy) return { ok: false, error: 'Esas fechas ya pasaron.' };
  if (desde > sumarDias(hoy, BLOQUEO_MAX_DIAS)) return { ok: false, error: 'Solo puedo bloquear fechas dentro del próximo año.' };
  if (diasEntre(desde, hasta) > BLOQUEO_MAX_DIAS) return { ok: false, error: 'El bloqueo es demasiado largo (máximo un año).' };
  const ini = x.ini || null;
  const fin = x.fin || null;
  if ((ini && !fin) || (!ini && fin)) return { ok: false, error: 'Falta la hora de inicio o de fin.' };
  if (ini && (!horaValida(ini) || !horaValida(fin) || minutos(fin) <= minutos(ini))) return { ok: false, error: 'Las horas del bloqueo no son válidas.' };
  const nota = String(x.nota || '').trim().slice(0, 140) || null;
  return { ok: true, bloqueo: { desde, hasta, ini, fin, nota } };
}

function diasEntre(a, b) {
  return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000) + 1;
}

// ¿El espacio [ini, ini+dur) de esa fecha cae en algún bloqueo?
function estaBloqueado(fecha, ini, dur, bloqueos) {
  const a = minutos(ini);
  const z = a + dur;
  return (bloqueos || []).some(b => {
    if (fecha < b.desde || fecha > b.hasta) return false;
    if (!b.ini) return true;
    return a < minutos(b.fin) && minutos(b.ini) < z;
  });
}

// Espacios libres de una fecha. `ocupados` son horas de inicio ("HH:mm") de
// citas ya tomadas ese día; se comparan por traslape, así un cambio de
// duración no deja dos citas encimadas.
function espaciosLibres({ fecha, horario, bloqueos, ocupados, ahora = new Date() }) {
  if (!fechaValida(fecha) || !horario || !horario.dias) return [];
  const hoy = fechaMexico(ahora);
  if (fecha <= hoy || fecha > sumarDias(hoy, DIAS_MAXIMOS)) return [];
  const dur = Number(horario.duracion) || DURACION_DEFECTO;
  const rangos = horario.dias[String(diaSemana(fecha))] || [];
  const tomados = (ocupados || []).filter(horaValida).map(minutos);
  const libres = [];
  for (const [ini, fin] of rangos) {
    for (let t = minutos(ini); t + dur <= minutos(fin); t += dur) {
      if (tomados.some(o => t < o + dur && o < t + dur)) continue;
      if (estaBloqueado(fecha, hhmm(t), dur, bloqueos)) continue;
      libres.push(hhmm(t));
    }
  }
  return libres;
}

// "Horario acordado" de las solicitudes → { 'YYYY-MM-DD': ['HH:mm', …] }
function ocupadosPorFecha(solicitudes) {
  const mapa = {};
  for (const s of solicitudes || []) {
    const c = s.fields || s;
    if (!ESTADOS_QUE_OCUPAN.includes(c['Estado de cita'])) continue;
    const m = String(c['Horario acordado'] || '').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
    if (!m) continue;
    (mapa[m[1]] = mapa[m[1]] || []).push(m[2]);
  }
  return mapa;
}

// Citas agendadas que caen dentro de un bloqueo (para avisar al médico; NOVA
// nunca las cancela sola).
function citasDentroDeBloqueo(bloqueo, solicitudes, duracion = DURACION_DEFECTO) {
  const mapa = ocupadosPorFecha(solicitudes);
  const res = [];
  for (const [fecha, horas] of Object.entries(mapa)) {
    for (const h of horas) if (estaBloqueado(fecha, h, duracion, [bloqueo])) res.push(`${fecha} ${h}`);
  }
  return res.sort();
}

// Próximas fechas con espacio, para sugerir al paciente cuando el día que
// eligió está lleno o sin consulta.
function proximasFechasConEspacio({ desde, horario, bloqueos, ocupadosMapa, ahora = new Date(), cuantas = 5, buscarDias = 30 }) {
  const res = [];
  for (let i = 0; i < buscarDias && res.length < cuantas; i++) {
    const f = sumarDias(desde, i);
    const n = espaciosLibres({ fecha: f, horario, bloqueos, ocupados: (ocupadosMapa || {})[f], ahora }).length;
    if (n) res.push({ fecha: f, espacios: n });
  }
  return res;
}

function fechaTexto(ymd, conAnio = false) {
  const [a, m, d] = ymd.split('-').map(Number);
  return `${DIAS[diaSemana(ymd)].toLowerCase()} ${d} de ${MESES[m - 1]}${conAnio ? ' de ' + a : ''}`;
}

function textoBloqueo(b) {
  const anio = b.hasta.slice(0, 4);
  let t = b.desde === b.hasta
    ? `el ${fechaTexto(b.desde)} de ${anio}`
    : `del ${fechaTexto(b.desde, b.desde.slice(0, 4) !== anio)} al ${fechaTexto(b.hasta)} de ${anio} (${diasEntre(b.desde, b.hasta)} días)`;
  t += b.ini ? `, de ${horaCorta(b.ini)} a ${horaCorta(b.fin)}` : ', todo el día';
  return t;
}

// Resumen legible del horario semanal; agrupa los días con el mismo horario
// y dice explícitamente qué días NO hay consulta (no queda nada sin cubrir).
function textoHorario(h) {
  if (!h || !h.dias) return 'Sin horario configurado.';
  const grupos = new Map();
  const orden = [1, 2, 3, 4, 5, 6, 0];
  const sin = [];
  for (const d of orden) {
    const r = h.dias[String(d)];
    if (!r || !r.length) { sin.push(DIAS_CORTOS[d]); continue; }
    const clave = r.map(([a, b]) => `${horaCorta(a)}–${horaCorta(b)}`).join(' y ');
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(DIAS_CORTOS[d]);
  }
  const lineas = [...grupos].map(([clave, dias]) => `${dias.join(', ')}: ${clave}`);
  if (sin.length) lineas.push(`${sin.join(', ')}: sin consulta`);
  lineas.push(`Cada consulta: ${h.duracion} min`);
  return lineas.join('\n');
}

const turnoDeHora = h => (minutos(h) < 14 * 60 ? 'Mañana' : 'Tarde');

module.exports = {
  CAMPOS,
  DURACIONES,
  DURACION_DEFECTO,
  DIAS,
  DIAS_CORTOS,
  ESTADOS_QUE_OCUPAN,
  fechaValida,
  horaValida,
  minutos,
  hhmm,
  horaCorta,
  diaSemana,
  leerJSON,
  validarHorarioSemanal,
  validarBloqueo,
  estaBloqueado,
  espaciosLibres,
  ocupadosPorFecha,
  citasDentroDeBloqueo,
  proximasFechasConEspacio,
  fechaTexto,
  textoBloqueo,
  textoHorario,
  turnoDeHora,
};
