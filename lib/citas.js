// lib/citas.js
// Reglas puras de la solicitud de cita del directorio (etapa 2, 2026-10-22).
//
// Una solicitud NUNCA es una cita confirmada mientras el médico no responda:
//   Pendiente → (médico) Aceptada | Otro horario propuesto | Rechazada
//   Otro horario propuesto → (paciente) Confirmada por el paciente | Cancelada
//   El paciente puede cancelar en cualquier momento; el médico puede rechazar
//   (cancelar) una cita ya aceptada, con mensaje.
//
// El paciente no tiene cuenta: recibe una clave de seguimiento aleatoria. Solo
// se guarda su huella SHA-256; quien tenga la liga ve el estado de SU solicitud
// (sin teléfono ni motivo).

const crypto = require('crypto');

const ESTADOS_CITA = Object.freeze({
  PENDIENTE: 'Pendiente',
  ACEPTADA: 'Aceptada',
  PROPUESTA: 'Otro horario propuesto',
  CONFIRMADA: 'Confirmada por el paciente',
  RECHAZADA: 'Rechazada',
  CANCELADA: 'Cancelada por el paciente',
});

const TURNOS = Object.freeze(['Mañana', 'Tarde', 'Cualquiera']);
// En línea: horario y pago se acuerdan directo con el médico (CODE CELLS no
// interviene) y no usa la agenda automática. Sin modalidad = presencial.
const MODALIDADES = Object.freeze(['Presencial', 'En línea']);

// "(mañana)" junto a una fecha se lee como "el día de mañana": siempre se
// escribe la franja completa.
const TEXTO_TURNO = Object.freeze({ 'Mañana': 'por la mañana', 'Tarde': 'por la tarde', 'Cualquiera': 'a cualquier hora' });
const textoTurno = t => TEXTO_TURNO[t] || String(t || '').toLowerCase();
const DIAS_MAXIMOS = 90;
const ZONA = 'America/Mexico_City';

// Fecha local de México como YYYY-MM-DD (el servidor corre en UTC).
function fechaMexico(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

function sumarDias(ymd, dias) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function fechaValida(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return false;
  const d = new Date(ymd + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === ymd;
}

const limpiar = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

// Valida lo que manda el formulario público. El motivo (dato de salud) solo
// se conserva con consentimiento expreso, igual que el formulario anterior.
function validarSolicitudCita(body, ahora = new Date()) {
  const b = body || {};
  if (limpiar(b.sitio, 200)) return { ok: false, error: 'Solicitud rechazada.', bot: true }; // campo trampa
  const nombre = limpiar(b.nombre, 120);
  const telefono = limpiar(b.telefono, 30);
  const digitos = telefono.replace(/\D/g, '');
  const email = limpiar(b.email, 120);
  const fechaPreferida = limpiar(b.fechaPreferida, 10);
  const turno = limpiar(b.turno, 20);
  const medicoId = limpiar(b.medicoId, 30);
  const consentimiento = b.consentimiento === true;
  const modalidad = limpiar(b.modalidad, 20) || 'Presencial';

  if (!/^rec[A-Za-z0-9]{14}$/.test(medicoId)) return { ok: false, error: 'Falta el médico de la solicitud.' };
  if (nombre.length < 2) return { ok: false, error: 'Escribe tu nombre.' };
  if (digitos.length < 10 || digitos.length > 15) return { ok: false, error: 'Escribe un teléfono de 10 dígitos (puede llevar lada internacional).' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'El correo no parece válido.' };
  if (!fechaValida(fechaPreferida)) return { ok: false, error: 'Elige la fecha que prefieres.' };
  const hoy = fechaMexico(ahora);
  if (fechaPreferida <= hoy) return { ok: false, error: 'La fecha preferida debe ser a partir de mañana.' };
  if (fechaPreferida > sumarDias(hoy, DIAS_MAXIMOS)) return { ok: false, error: `Elige una fecha dentro de los próximos ${DIAS_MAXIMOS} días.` };
  if (!TURNOS.includes(turno)) return { ok: false, error: 'Elige mañana, tarde o cualquiera.' };
  if (!MODALIDADES.includes(modalidad)) return { ok: false, error: 'Elige consulta en el consultorio o en línea.' };

  const datos = { nombre, telefono, email, fechaPreferida, turno, medicoId, consentimiento, modalidad };
  const motivo = limpiar(b.motivo, 1000);
  if (consentimiento && motivo) datos.motivo = motivo;
  return { ok: true, datos };
}

// Horario que el médico acepta o propone: hora local del consultorio,
// "YYYY-MM-DD HH:mm", desde hoy y hasta 6 meses. Es texto a propósito: se
// muestra tal cual, sin conversiones de zona horaria que lo puedan mover.
function validarHorario(texto, ahora = new Date()) {
  const t = limpiar(texto, 16).replace('T', ' ');
  const m = t.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/);
  if (!m || !fechaValida(m[1])) return { ok: false, error: 'Escribe fecha y hora (AAAA-MM-DD HH:mm).' };
  const h = Number(m[2]); const min = Number(m[3]);
  if (h > 23 || min > 59) return { ok: false, error: 'La hora no es válida.' };
  const hoy = fechaMexico(ahora);
  if (m[1] < hoy) return { ok: false, error: 'La fecha ya pasó.' };
  if (m[1] > sumarDias(hoy, 180)) return { ok: false, error: 'Elige una fecha dentro de los próximos 6 meses.' };
  return { ok: true, horario: `${m[1]} ${m[2]}:${m[3]}` };
}

// Transiciones permitidas. Devuelve { ok, estado } o { ok:false, error }.
function transicionMedico(estadoActual, respuesta, { horario, mensaje } = {}) {
  const e = estadoActual || ESTADOS_CITA.PENDIENTE;
  if (respuesta === 'aceptar') {
    if (e !== ESTADOS_CITA.PENDIENTE) return { ok: false, error: 'Solo puedes aceptar una solicitud pendiente.' };
    if (!horario) return { ok: false, error: 'Indica la fecha y hora exactas de la cita.' };
    return { ok: true, estado: ESTADOS_CITA.ACEPTADA };
  }
  if (respuesta === 'proponer') {
    if (![ESTADOS_CITA.PENDIENTE, ESTADOS_CITA.PROPUESTA].includes(e)) return { ok: false, error: 'Ya no puedes proponer otro horario en esta solicitud.' };
    if (!horario) return { ok: false, error: 'Indica el horario que propones.' };
    return { ok: true, estado: ESTADOS_CITA.PROPUESTA };
  }
  if (respuesta === 'rechazar') {
    if ([ESTADOS_CITA.RECHAZADA, ESTADOS_CITA.CANCELADA].includes(e)) return { ok: false, error: 'Esta solicitud ya está cerrada.' };
    const yaAgendada = [ESTADOS_CITA.ACEPTADA, ESTADOS_CITA.CONFIRMADA].includes(e);
    if (yaAgendada && !limpiar(mensaje, 500)) return { ok: false, error: 'Para cancelar una cita ya acordada, escribe un mensaje al paciente.' };
    return { ok: true, estado: ESTADOS_CITA.RECHAZADA };
  }
  return { ok: false, error: 'Respuesta no reconocida.' };
}

function transicionPaciente(estadoActual, accion) {
  const e = estadoActual || ESTADOS_CITA.PENDIENTE;
  if (accion === 'confirmar') {
    if (e !== ESTADOS_CITA.PROPUESTA) return { ok: false, error: 'No hay un horario propuesto que confirmar.' };
    return { ok: true, estado: ESTADOS_CITA.CONFIRMADA };
  }
  if (accion === 'cancelar') {
    if ([ESTADOS_CITA.RECHAZADA, ESTADOS_CITA.CANCELADA].includes(e)) return { ok: false, error: 'Esta solicitud ya está cerrada.' };
    return { ok: true, estado: ESTADOS_CITA.CANCELADA };
  }
  return { ok: false, error: 'Acción no reconocida.' };
}

// ── Clave de seguimiento ─────────────────────────────────────────────
function generarClave() {
  return crypto.randomBytes(24).toString('base64url');
}

function huellaClave(clave) {
  return crypto.createHash('sha256').update(String(clave || ''), 'utf8').digest('hex');
}

function claveValida(clave, huellaGuardada) {
  if (!clave || !/^[0-9a-f]{64}$/.test(String(huellaGuardada || ''))) return false;
  const a = Buffer.from(huellaClave(clave), 'hex');
  const b = Buffer.from(huellaGuardada, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Lo que ve el paciente con su liga: sin teléfono, correo ni motivo.
function vistaPaciente(rec, nombreMedico) {
  const c = (rec && rec.fields) || {};
  return {
    id: rec.id,
    estado: c['Estado de cita'] || ESTADOS_CITA.PENDIENTE,
    medico: nombreMedico || null,
    fechaPreferida: c['Fecha preferida'] || null,
    turno: c['Turno preferido'] || null,
    modalidad: c['Modalidad'] || 'Presencial',
    horario: c['Horario acordado'] || null,
    mensaje: c['Mensaje del médico'] || null,
    fechaSolicitud: c['Fecha solicitud'] || null,
  };
}

module.exports = {
  ESTADOS_CITA,
  TURNOS,
  MODALIDADES,
  textoTurno,
  DIAS_MAXIMOS,
  fechaMexico,
  sumarDias,
  validarSolicitudCita,
  validarHorario,
  transicionMedico,
  transicionPaciente,
  generarClave,
  huellaClave,
  claveValida,
  vistaPaciente,
};
