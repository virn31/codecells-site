// lib/citasPaciente.js
// Reglas puras de la pestaña Citas de la app del paciente (mi-nivel.html,
// nova paciente_mis_citas). Sin Airtable: se prueban solas.
//
// La "próxima cita" NO es un registro aparte: es la fecha que el médico anota
// en el campo 'Próxima cita' al guardar la consulta. Por eso cuenta solo la
// de la consulta MÁS RECIENTE de cada médico: si en la consulta siguiente ya
// no anotó fecha, la anterior quedó superada y no se muestra (presentarla
// sería afirmar una cita que el médico ya no sostiene, CLAUDE.md §6).

const directorio = require('./directorio');

// consultas: [{ fecha (ISO), proximaCita ('AAAA-MM-DD' | null), medicoClave, medico }]
// hoy: 'AAAA-MM-DD' en la zona del consultorio. Devuelve [{ fecha, medico, anotadaEl }]
// ordenadas de la más cercana a la más lejana.
function proximasCitas(consultas, hoy) {
  const ultimaPorMedico = new Map();
  for (const c of consultas || []) {
    if (!c || !c.fecha) continue;
    const clave = c.medicoClave || '';
    const previa = ultimaPorMedico.get(clave);
    if (!previa || String(c.fecha) > String(previa.fecha)) ultimaPorMedico.set(clave, c);
  }
  const proximas = [];
  for (const c of ultimaPorMedico.values()) {
    const fecha = c.proximaCita;
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    if (fecha < hoy) continue;
    proximas.push({ fecha, medico: c.medico || null, anotadaEl: c.fecha });
  }
  return proximas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

// Liga a la ficha pública de un perfil PUBLICADO del directorio; null si no
// lo está. La liga bonita si es válida; si no, la ficha por id.
function urlFichaDirectorio(perfil) {
  const f = (perfil && perfil.fields) || {};
  if (!f['Publicado']) return null;
  const liga = f[directorio.CAMPO_LIGA];
  if (directorio.esLigaValida(liga)) return `/directorio/${liga}`;
  return `/directorio/medico.html?id=${encodeURIComponent(perfil.id)}`;
}

// Especialidad del médico como la lee un paciente. 'Especialidad' en MEDICOS
// es texto libre ("CIRUGIA PLASTICA", "cardiologia"): si coincide con una
// especialidad conocida (sin acentos ni mayúsculas) se devuelve bien escrita;
// si no, solo se quitan las MAYÚSCULAS sostenidas. Nunca se agregan acentos
// a una palabra que no está en la lista: se adivinaría.
const ESPECIALIDADES_CONOCIDAS = [
  'Medicina Regenerativa', 'Medicina Interna', 'Medicina General', 'Medicina Familiar',
  'Medicina Estética', 'Medicina del Deporte', 'Medicina Física y Rehabilitación',
  'Endocrinología', 'Ginecología', 'Ginecología y Obstetricia', 'Obstetricia',
  'Gastroenterología', 'Otorrinolaringología', 'Nutriología', 'Nutrición',
  'Cardiología', 'Nefrología', 'Reumatología', 'Dermatología', 'Neumología',
  'Psiquiatría', 'Psicología', 'Urología', 'Oftalmología', 'Cirugía Plástica',
  'Cirugía General', 'Pediatría', 'Neurología', 'Neurocirugía', 'Geriatría',
  'Oncología', 'Hematología', 'Infectología', 'Angiología', 'Alergología',
  'Inmunología', 'Traumatología', 'Ortopedia', 'Traumatología y Ortopedia',
  'Anestesiología', 'Algología', 'Radiología', 'Odontología', 'Rehabilitación',
];
const sinAcentos = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const POR_CLAVE = new Map(ESPECIALIDADES_CONOCIDAS.map(e => [sinAcentos(e), e]));
const MENORES = new Set(['y', 'e', 'de', 'del', 'la', 'las', 'los', 'en']);

function unaEspecialidad(texto) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!limpio) return '';
  const conocida = POR_CLAVE.get(sinAcentos(limpio));
  if (conocida) return conocida;
  // Solo se toca el texto escrito todo en mayúsculas; lo demás es como el
  // médico lo escribió.
  if (limpio !== limpio.toUpperCase() || limpio === limpio.toLowerCase()) return limpio;
  return limpio.toLowerCase().split(' ').map((p, i) =>
    (i > 0 && MENORES.has(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// Acepta texto o lista (un campo de selección múltiple). '' / null → null.
function especialidadLegible(valor) {
  const partes = (Array.isArray(valor) ? valor : String(valor == null ? '' : valor).split(','))
    .map(unaEspecialidad).filter(Boolean);
  return partes.length ? [...new Set(partes)].join(', ') : null;
}

// Ficha de emergencia (app del paciente): los datos clínicos son SOLO lo que
// anotó su médico; el contacto de emergencia, lo que escribió el paciente.
// pacienteFields: el registro de PACIENTES; historias: registros de HISTORIA
// CLÍNICA del paciente. Un campo vacío queda null — la app lo dice como "no
// registrado", nunca como "sin alergias" (CLAUDE.md §7: un negativo clínico
// que nadie anotó es contenido fabricado).
// Contacto de emergencia: lo elige y lo escribe el PACIENTE (decisión de
// Víctor 2026-10-26), no el médico. Campos que ya existían en PACIENTES y no
// usaba nadie. Un solo renglón de nombre (ahí cabe "Ana López, mi hermana")
// para no tener que separar parentesco del nombre adivinando.
const CAMPO_CONTACTO_NOMBRE = 'Contacto de emergencia';
const CAMPO_CONTACTO_TEL = 'Tel. emergencia';

// { nombre, telefono } del paciente → { ok, valor: {nombre, telefono} | null }
// (null = borrarlo) o { ok: false, error }. Los dos o ninguno: un nombre sin
// teléfono no sirve en una urgencia.
function normalizarContactoEmergencia(entrada) {
  const nombre = String((entrada && entrada.nombre) == null ? '' : entrada.nombre).replace(/\s+/g, ' ').trim();
  const telTexto = String((entrada && entrada.telefono) == null ? '' : entrada.telefono).trim();
  if (!nombre && !telTexto) return { ok: true, valor: null };
  if (!nombre) return { ok: false, error: 'Escribe el nombre de tu contacto.' };
  if (!telTexto) return { ok: false, error: 'Escribe el teléfono de tu contacto.' };
  if (nombre.length > 100) return { ok: false, error: 'El nombre es demasiado largo (máximo 100 caracteres).' };
  if (/https?:\/\/|www\.|[<>]/i.test(nombre)) return { ok: false, error: 'Escribe solo el nombre de tu contacto.' };
  const tel = directorio.normalizarTelefono(telTexto);
  if (!tel.ok) return { ok: false, error: 'El teléfono debe tener 10 dígitos (puede llevar la lada +52).' };
  return { ok: true, valor: { nombre, telefono: tel.valor } };
}

function fichaEmergencia(pacienteFields, historias) {
  const f = pacienteFields || {};
  const contactoNombre = typeof f[CAMPO_CONTACTO_NOMBRE] === 'string' ? f[CAMPO_CONTACTO_NOMBRE].trim() : '';
  const contactoTel = typeof f[CAMPO_CONTACTO_TEL] === 'string' ? f[CAMPO_CONTACTO_TEL].trim() : '';
  const grupo = typeof f['Grupo sanguíneo'] === 'string' ? f['Grupo sanguíneo'].trim() : '';
  const alergias = [...new Set((historias || [])
    .map(h => ((h && h.fields) || {})['Alergias'])
    .filter(a => typeof a === 'string' && a.trim())
    .map(a => a.trim()))];
  const padecimientos = (Array.isArray(f['Patologías activas']) ? f['Patologías activas'] : [])
    .filter(p => typeof p === 'string' && p.trim());
  return {
    grupoSanguineo: grupo || null,
    alergias: alergias.length ? alergias : null,
    padecimientos,
    // Lo escribió el paciente; con solo una de las dos partes se muestra lo
    // que hay, para que lo complete.
    contacto: (contactoNombre || contactoTel) ? { nombre: contactoNombre || null, telefono: contactoTel || null } : null,
  };
}

module.exports = {
  proximasCitas, urlFichaDirectorio, especialidadLegible, fichaEmergencia,
  normalizarContactoEmergencia, CAMPO_CONTACTO_NOMBRE, CAMPO_CONTACTO_TEL,
};
