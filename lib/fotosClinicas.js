// lib/fotosClinicas.js
// Fotos clínicas del expediente (decisión de Víctor 2026-10-27): las SUBE EL
// MÉDICO desde el portal; el paciente las ve en su app y puede guardarlas en
// la galería de su teléfono. Por ser expediente:
//   - las ve todo médico autorizado para ese paciente (autorizarPaciente),
//     no solo quien las subió (CLAUDE.md §4);
//   - no se borran: el médico que la subió puede RETIRARLA (Activa = false,
//     con fecha), y ya no se muestra a nadie;
//   - autoría (médico, fecha) la fija el servidor desde la sesión.
// Tabla FOTOS_CLINICAS por NOMBRE (su ID cambia entre prueba y producción);
// la imagen va al campo adjunto "Imagen" con el endpoint uploadAttachment de
// Airtable (máximo 5 MB). No está en TABLAS_PERMITIDAS de api/airtable.js:
// solo la tocan las acciones de api/nova.js, que autorizan antes.

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');
const TABLA = 'FOTOS_CLINICAS';
const CATEGORIAS = ['cuerpo-frente', 'cuerpo-perfil', 'rostro', 'piel', 'herida', 'documento'];
const MAX_BYTES = 3 * 1024 * 1024;   // en base64 ~4 MB: bajo el límite de 4.5 MB de Vercel; la app comprime a ~0.3–0.6 MB
const MAX_NOTA = 300;
const MAX_POR_LISTA = 200;

function url(sufijo = '') { return `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLA)}${sufijo}`; }
function cabeceras() { return { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' }; }
function esc(v) { return String(v).replace(/"/g, '\\"'); }
function falla(status, que = TABLA) { const e = new Error(`${que} respondió ${status}`); e.status = 502; return e; }

// { categoria, imagen: 'data:image/jpeg;base64,…' | base64, nota } del portal.
function validarFoto(b) {
  const x = b || {};
  if (!CATEGORIAS.includes(x.categoria)) return { ok: false, error: 'Elige qué se fotografió.' };
  const m = String(x.imagen || '').match(/^(?:data:(image\/(?:jpeg|png|webp));base64,)?([A-Za-z0-9+/]+={0,2})$/);
  if (!m) return { ok: false, error: 'La imagen no es válida.' };
  const tipo = m[1] || 'image/jpeg';
  const bytes = Math.floor(m[2].length * 3 / 4) - (m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0);
  if (bytes < 1024) return { ok: false, error: 'La imagen está vacía.' };
  if (bytes > MAX_BYTES) return { ok: false, error: 'La imagen es demasiado grande (máximo 3 MB).' };
  // Firma real del archivo, no lo que diga el encabezado.
  const cabeza = Buffer.from(m[2].slice(0, 16), 'base64');
  const esJpeg = cabeza[0] === 0xFF && cabeza[1] === 0xD8;
  const esPng = cabeza[0] === 0x89 && cabeza[1] === 0x50;
  const esWebp = cabeza.slice(0, 4).toString('latin1') === 'RIFF';
  if (!(esJpeg || esPng || esWebp)) return { ok: false, error: 'La imagen no es válida.' };
  const nota = String(x.nota == null ? '' : x.nota).replace(/\r\n?/g, '\n').trim();
  if (nota.length > MAX_NOTA) return { ok: false, error: `La nota es demasiado larga (máximo ${MAX_NOTA} caracteres).` };
  return { ok: true, valor: { categoria: x.categoria, base64: m[2], tipo: esJpeg ? 'image/jpeg' : esPng ? 'image/png' : 'image/webp', nota } };
}

// Para el paciente y para el médico: sin datos internos. Las URL de Airtable
// vencen a las ~2 h: la app las pide de nuevo cada vez que abre la pestaña.
function aPublico(rec) {
  const f = rec.fields || {};
  const img = (f['Imagen'] || [])[0] || null;
  const mini = img && img.thumbnails && (img.thumbnails.large || img.thumbnails.small);
  return {
    id: rec.id, categoria: f['Categoría'] || '', fecha: f['Fecha'] || null, nota: f['Nota'] || '',
    medicoCodigo: f['Código de médico ref'] || null,
    url: img ? img.url : null, miniatura: mini ? mini.url : (img ? img.url : null),
    ancho: img && img.width || null, alto: img && img.height || null,
  };
}

async function listar(codigoPaciente) {
  const formula = `AND({Código de paciente ref}="${esc(codigoPaciente)}",{Activa})`;
  const q = `?filterByFormula=${encodeURIComponent(formula)}&sort%5B0%5D%5Bfield%5D=Fecha&sort%5B0%5D%5Bdirection%5D=desc&pageSize=100&maxRecords=${MAX_POR_LISTA}`;
  const r = await fetch(url(q), { headers: cabeceras() });
  if (!r.ok) throw falla(r.status);
  // Una foto cuyo adjunto aún no termina de procesarse no se muestra a medias.
  return ((await r.json()).records || []).map(aPublico).filter(f => f.url);
}

// Registro primero, imagen después. Si la imagen no sube, el registro queda
// inactivo (nunca una foto "activa" sin imagen) y se informa el fallo.
async function subir({ codigoPaciente, pacienteRecId, codigoMedico, medicoRecId, categoria, base64, tipo, nota }) {
  const ahora = new Date().toISOString();
  const r = await fetch(url(), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ records: [{ fields: {
    'Foto': `${codigoPaciente} · ${ahora.slice(0, 10)} · ${categoria}`,
    'Código de paciente ref': codigoPaciente, 'Paciente': pacienteRecId ? [pacienteRecId] : [],
    'Categoría': categoria, 'Fecha': ahora, 'Nota': nota,
    'Código de médico ref': codigoMedico, 'Subida por': medicoRecId ? [medicoRecId] : [],
    'Activa': false,
  } }] }) });
  if (!r.ok) throw falla(r.status);
  const id = ((await r.json()).records || [])[0].id;
  const ext = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg';
  const sube = await fetch(`https://content.airtable.com/v0/${BASE_ID}/${id}/${encodeURIComponent('Imagen')}/uploadAttachment`, {
    method: 'POST', headers: cabeceras(), body: JSON.stringify({ contentType: tipo, file: base64, filename: `${codigoPaciente}-${ahora.slice(0, 10)}-${categoria}.${ext}` }),
  });
  if (!sube.ok) throw falla(sube.status, 'uploadAttachment');
  const act = await fetch(url(`/${id}`), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ fields: { 'Activa': true } }) });
  if (!act.ok) throw falla(act.status);
  return aPublico(await act.json());
}

// Solo quien la subió, y solo si es de ese paciente.
async function retirar({ id, codigoPaciente, codigoMedico }) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(id || ''))) return { error: { status: 400, mensaje: 'Foto no válida.' } };
  const g = await fetch(url(`/${id}`), { headers: cabeceras() });
  if (g.status === 404) return { error: { status: 404, mensaje: 'No se encontró la foto.' } };
  if (!g.ok) throw falla(g.status);
  const f = (await g.json()).fields || {};
  if (f['Código de paciente ref'] !== codigoPaciente) return { error: { status: 404, mensaje: 'No se encontró la foto.' } };
  if (f['Código de médico ref'] !== codigoMedico) return { error: { status: 403, mensaje: 'Solo quien subió la foto puede retirarla.' } };
  const r = await fetch(url(`/${id}`), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ fields: { 'Activa': false, 'Fecha retiro': new Date().toISOString() } }) });
  if (!r.ok) throw falla(r.status);
  return { ok: true };
}

module.exports = { TABLA, CATEGORIAS, MAX_BYTES, validarFoto, aPublico, listar, subir, retirar };
