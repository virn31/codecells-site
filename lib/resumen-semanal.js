// lib/resumen-semanal.js
// Resumen semanal al médico por Telegram (2026-10-24): "esta semana, N visitas
// a tu perfil y M solicitudes". Reglas puras; la red vive en api/citas.js.
//
// Visitas: un contador por perfil y por semana en la tabla VISITAS_DIRECTORIO,
// sin IP, sin cookie y sin nada del visitante. El navegador cuenta una vez por
// semana por perfil (localStorage) y el servidor descarta bots por User-Agent.
// Es un indicador, no una auditoría: quien quiera inflarlo puede hacerlo.
//
// La semana va de lunes a domingo en hora de Culiacán y se identifica por la
// fecha de su lunes ("2026-10-19").

const ZONA = 'America/Mazatlan';
const TABLA_VISITAS = 'VISITAS_DIRECTORIO';
const CAMPOS_VISITAS = Object.freeze({ CLAVE: 'Clave', PERFIL: 'Perfil', SEMANA: 'Semana', VISITAS: 'Visitas' });

function fechaEnZona(fecha, zona = ZONA) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

function sumarDias(ymd, dias) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function lunesDe(ymd) {
  const dia = new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(ymd, dia === 0 ? -6 : 1 - dia);
}

// Semana en curso (la que cuenta las visitas de hoy).
function semanaDe(fecha) {
  return lunesDe(fechaEnZona(fecha));
}

// La semana que se resume el lunes: la que terminó ayer.
function semanaAnterior(ahora) {
  const inicio = sumarDias(semanaDe(ahora), -7);
  return { inicio, fin: sumarDias(inicio, 6) };
}

function claveVisita(perfilId, semana) {
  return `${perfilId}|${semana}`;
}

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|curl|wget|python|axios|node-fetch/i;
function esBot(userAgent) {
  return !userAgent || BOTS.test(String(userAgent));
}

function enSemana(fechaISO, semana) {
  if (!fechaISO) return false;
  const d = new Date(fechaISO);
  if (isNaN(d)) return false;
  const dia = fechaEnZona(d);
  return dia >= semana.inicio && dia <= semana.fin;
}

// visitas: registros de VISITAS_DIRECTORIO de esa semana (puede haber más de
// uno por perfil si dos visitas crearon la fila a la vez: se suman).
// solicitudes: registros de SOLICITUDES (solo los campos sin datos del paciente).
function resumenDeMedico({ perfilId, visitas, solicitudes, semana, estados }) {
  const C = CAMPOS_VISITAS;
  const nVisitas = visitas
    .filter(v => v.fields[C.PERFIL] === perfilId && v.fields[C.SEMANA] === semana.inicio)
    .reduce((s, v) => s + (Number(v.fields[C.VISITAS]) || 0), 0);
  const suyas = solicitudes.filter(s => (s.fields['Médico solicitado'] || []).includes(perfilId));
  const deLaSemana = suyas.filter(s => enSemana(s.fields['Fecha solicitud'], semana));
  const aceptadas = [estados.ACEPTADA, estados.CONFIRMADA];
  return {
    visitas: nVisitas,
    solicitudes: deLaSemana.length,
    enLinea: deLaSemana.filter(s => s.fields['Modalidad'] === 'En línea').length,
    agendadas: deLaSemana.filter(s => aceptadas.includes(s.fields['Estado de cita'])).length,
    // Pendientes de responder HOY, sin importar cuándo llegaron.
    pendientes: suyas.filter(s => s.fields['Estado de cita'] === estados.PENDIENTE).length,
  };
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function rangoLegible(semana) {
  const [, m1, d1] = semana.inicio.split('-').map(Number);
  const [, m2, d2] = semana.fin.split('-').map(Number);
  return m1 === m2 ? `${d1}–${d2} ${MESES[m2 - 1]}` : `${d1} ${MESES[m1 - 1]}–${d2} ${MESES[m2 - 1]}`;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Sin datos de pacientes: solo números.
function textoResumen(r, semana) {
  const lineas = [
    `CODE CELLS: tu semana en el directorio (${rangoLegible(semana)})`,
    `• ${plural(r.visitas, 'visita', 'visitas')} a tu perfil`,
    `• ${plural(r.solicitudes, 'solicitud', 'solicitudes')} de cita${r.enLinea ? ` (${r.enLinea} en línea)` : ''}`,
  ];
  if (r.solicitudes) lineas.push(`• ${plural(r.agendadas, 'ya agendada o aceptada', 'ya agendadas o aceptadas')}`);
  lineas.push(r.pendientes
    ? `Tienes ${plural(r.pendientes, 'solicitud pendiente', 'solicitudes pendientes')} de responder: portal → Mi directorio.`
    : 'No tienes solicitudes pendientes de responder.');
  return lineas.join('\n');
}

module.exports = {
  ZONA, TABLA_VISITAS, CAMPOS_VISITAS,
  fechaEnZona, sumarDias, lunesDe, semanaDe, semanaAnterior, claveVisita, esBot, enSemana,
  resumenDeMedico, rangoLegible, textoResumen,
};
