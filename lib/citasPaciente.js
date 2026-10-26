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

// Ficha de emergencia (app del paciente): SOLO lo que anotó su médico.
// pacienteFields: el registro de PACIENTES; historias: registros de HISTORIA
// CLÍNICA del paciente. Un campo vacío queda null — la app lo dice como "no
// registrado", nunca como "sin alergias" (CLAUDE.md §7: un negativo clínico
// que nadie anotó es contenido fabricado).
function fichaEmergencia(pacienteFields, historias) {
  const f = pacienteFields || {};
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
  };
}

module.exports = { proximasCitas, urlFichaDirectorio, especialidadLegible, fichaEmergencia };
