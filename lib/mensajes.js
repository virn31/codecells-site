// lib/mensajes.js
// Buzón de la app del paciente: mensajes de UNA vía, del médico al paciente
// (decisiones de Víctor 2026-10-26: solo de ida; un mensaje es un mensaje,
// no expediente — si algo cambia clínicamente, el médico lo cambia en el
// expediente). Por eso:
//   - cada médico ve solo los mensajes que ÉL escribió a ese paciente;
//   - el paciente ve todos los suyos y no puede contestar;
//   - no se editan ni se borran (lo enviado, enviado está).
// Tabla MENSAJES_PACIENTE por NOMBRE (su ID cambia entre prueba y
// producción). No está en TABLAS_PERMITIDAS de api/airtable.js: solo la tocan
// las acciones de api/nova.js, que autorizan antes de llamar aquí.

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');
const TABLA = 'MENSAJES_PACIENTE';
const MAX_CARACTERES = 1000;
const MAX_POR_LISTA = 100;

function url(sufijo = '') { return `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLA)}${sufijo}`; }
function cabeceras() { return { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' }; }
function esc(v) { return String(v).replace(/"/g, '\\"'); }
function falla(status) { const e = new Error(`${TABLA} respondió ${status}`); e.status = 502; return e; }

// Texto del médico: sin espacios sobrantes ni más de una línea en blanco
// seguida; 1–1000 caracteres. Se guarda tal cual lo escribió (no se corrige).
function validarMensaje(texto) {
  const limpio = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n')
    .split('\n').map(l => l.replace(/[ \t]+$/g, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  if (!limpio) return { ok: false, error: 'Escribe el mensaje.' };
  if (limpio.length > MAX_CARACTERES) return { ok: false, error: `El mensaje es demasiado largo (máximo ${MAX_CARACTERES} caracteres).` };
  return { ok: true, valor: limpio };
}

function aPublico(rec) {
  const f = rec.fields || {};
  return { id: rec.id, medico: f['Médico'] || null, mensaje: f['Mensaje'] || '', fecha: f['Fecha envío'] || null, leido: f['Leído'] || null };
}

async function listar(formula) {
  const q = `?filterByFormula=${encodeURIComponent(formula)}&sort%5B0%5D%5Bfield%5D=${encodeURIComponent('Fecha envío')}&sort%5B0%5D%5Bdirection%5D=desc&pageSize=${MAX_POR_LISTA}&maxRecords=${MAX_POR_LISTA}`;
  const r = await fetch(url(q), { headers: cabeceras() });
  if (!r.ok) throw falla(r.status);
  return ((await r.json()).records || []).map(aPublico);
}

// Todos los del paciente (su buzón), del más nuevo al más viejo.
function listarDePaciente(codigoPaciente) {
  return listar(`{Código de paciente ref}="${esc(codigoPaciente)}"`);
}
// Los que ESTE médico le escribió a ese paciente (nunca los de otro médico).
function listarDeMedico(codigoMedico, codigoPaciente) {
  return listar(`AND({Código de paciente ref}="${esc(codigoPaciente)}",{Código de médico ref}="${esc(codigoMedico)}")`);
}

async function enviar({ codigoPaciente, codigoMedico, nombreMedico, mensaje }) {
  const r = await fetch(url(), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ records: [{ fields: {
    'Código de paciente ref': codigoPaciente, 'Código de médico ref': codigoMedico, 'Médico': nombreMedico || '',
    'Mensaje': mensaje, 'Fecha envío': new Date().toISOString(),
  } }] }) });
  if (!r.ok) throw falla(r.status);
  return aPublico(((await r.json()).records || [])[0] || {});
}

// Marca como leídos los mensajes indicados QUE SON DEL PACIENTE y aún no lo
// estaban. Los ids que no son suyos se ignoran (no se revela si existen).
// Devuelve cuántos confirmó Airtable.
async function marcarLeidos(codigoPaciente, ids) {
  const validos = [...new Set((ids || []).filter(id => /^rec[A-Za-z0-9]{14}$/.test(String(id))))].slice(0, MAX_POR_LISTA);
  if (!validos.length) return 0;
  const propios = await listar(`AND({Código de paciente ref}="${esc(codigoPaciente)}",OR(${validos.map(id => `RECORD_ID()="${id}"`).join(',')}))`);
  const porMarcar = propios.filter(m => !m.leido).map(m => m.id);
  const ahora = new Date().toISOString();
  let confirmados = 0;
  for (let i = 0; i < porMarcar.length; i += 10) {
    const lote = porMarcar.slice(i, i + 10);
    const r = await fetch(url(), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ records: lote.map(id => ({ id, fields: { 'Leído': ahora } })) }) });
    if (!r.ok) throw falla(r.status);
    confirmados += ((await r.json()).records || []).length;
  }
  return confirmados;
}

module.exports = { TABLA, MAX_CARACTERES, validarMensaje, listarDePaciente, listarDeMedico, enviar, marcarLeidos };
