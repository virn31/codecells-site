// lib/evaluacionesBiologicas.js
// Lectura/escritura de EVALUACIONES_BIOLOGICAS (Biological Map). La tabla
// no está en TABLAS_PERMITIDAS: solo la tocan las acciones de api/nova.js,
// que califican en el SERVIDOR (lib/cuestionarioBiologico.js) — el cliente
// manda respuestas, nunca puntajes. Referenciada por NOMBRE (su ID cambia
// entre la base de prueba y la de producción).

const cuestionario = require('./cuestionarioBiologico');

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');
const TABLA = 'EVALUACIONES_BIOLOGICAS';
const DIAS_ENTRE_EVALUACIONES_APP = 14;
const CAMPO_FUNCION = { energy: 'Función ENERGY', repair: 'Función REPAIR', balance: 'Función BALANCE', neuro: 'Función NEURO', regen: 'Función REGEN' };

function url(sufijo = '') { return `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLA)}${sufijo}`; }
function cabeceras() { return { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' }; }
function escaparFormula(v) { return String(v).replace(/"/g, '\\"'); }

// Todas las evaluaciones del paciente, de la más antigua a la más reciente.
// Un fallo de Airtable se lanza (502): "no se pudo leer" nunca se muestra
// como "aún no tienes evaluación" (CLAUDE.md §6).
async function listar(codigoPaciente) {
  const formula = `{Código de paciente ref}="${escaparFormula(codigoPaciente)}"`;
  const registros = [];
  let offset;
  do {
    const q = `?filterByFormula=${encodeURIComponent(formula)}&sort%5B0%5D%5Bfield%5D=Fecha&sort%5B0%5D%5Bdirection%5D=asc${offset ? `&offset=${offset}` : ''}`;
    const r = await fetch(url(q), { headers: cabeceras() });
    if (!r.ok) { const e = new Error(`EVALUACIONES_BIOLOGICAS respondió ${r.status}`); e.status = 502; throw e; }
    const d = await r.json();
    registros.push(...(d.records || []));
    offset = d.offset;
  } while (offset);
  return registros.map(aPublico);
}

// Solo lo que la app y el portal necesitan. Las respuestas crudas no salen.
function aPublico(rec) {
  const f = rec.fields || {};
  const sistemas = {};
  for (const [id, campo] of Object.entries(CAMPO_FUNCION)) {
    sistemas[id] = typeof f[campo] === 'number' ? f[campo] : null;
  }
  return {
    id: rec.id,
    fecha: f['Fecha'] || null,
    sistemas,
    estadoGeneral: typeof f['Estado general'] === 'number' ? f['Estado general'] : null,
    origen: f['Origen'] || null,
    version: f['Versión cuestionario'] || null,
  };
}

// Próxima fecha en que el paciente puede reevaluarse desde su app, o null si
// ya puede. Solo cuentan las evaluaciones hechas desde la app: una del kiosco
// la decidió el médico y no le resta al paciente.
function proximaPermitida(evaluaciones, ahora = Date.now()) {
  const app = evaluaciones.filter(e => e.origen === 'App del paciente' && e.fecha);
  if (!app.length) return null;
  const ultima = Math.max(...app.map(e => new Date(e.fecha).getTime()));
  const proxima = ultima + DIAS_ENTRE_EVALUACIONES_APP * 24 * 3600e3;
  return proxima > ahora ? new Date(proxima).toISOString() : null;
}

// Califica y guarda. Devuelve { error: {status, mensaje} } o { evaluacion }.
async function guardar({ codigoPaciente, pacienteRecId, respuestas, origen, medicoRecId }) {
  const resultado = cuestionario.calificar(respuestas);
  if (!resultado) return { error: { status: 400, mensaje: 'Faltan respuestas o alguna no es válida — no se guardó la evaluación.' } };
  const fecha = new Date().toISOString();
  const fields = {
    'ID Evaluación': `${codigoPaciente} · ${fecha.slice(0, 10)}`,
    'Código de paciente ref': codigoPaciente,
    'Paciente': [pacienteRecId],
    'Fecha': fecha,
    'Estado general': resultado.estadoGeneral,
    'Respuestas': JSON.stringify(respuestas),
    'Versión cuestionario': resultado.version,
    'Origen': origen,
  };
  for (const [id, campo] of Object.entries(CAMPO_FUNCION)) fields[campo] = resultado.sistemas[id].funcion;
  if (medicoRecId) fields['Registrado por'] = [medicoRecId];
  const r = await fetch(url(), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ records: [{ fields }] }) });
  if (!r.ok) {
    console.error('[evaluaciones] POST', r.status, await r.text().catch(() => ''));
    return { error: { status: 502, mensaje: 'No se pudo guardar la evaluación. Intenta de nuevo.' } };
  }
  const rec = ((await r.json()).records || [])[0];
  return { evaluacion: aPublico(rec) };
}

module.exports = { TABLA, DIAS_ENTRE_EVALUACIONES_APP, listar, guardar, proximaPermitida };
