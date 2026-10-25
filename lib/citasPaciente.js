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

module.exports = { proximasCitas, urlFichaDirectorio };
