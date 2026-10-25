// api/ficha.js — ficha pública del médico con liga bonita y vista previa.
//
//   GET /directorio/<liga>   (vercel.json la reescribe a /api/ficha?liga=<liga>)
//
// WhatsApp, Facebook y los buscadores no ejecutan JavaScript: para que la liga
// compartida muestre nombre, especialidad, ciudad y foto, el servidor toma la
// plantilla directorio/medico.html y le pone esas etiquetas en el <head>. El
// resto de la página funciona igual que /directorio/medico.html?id=… (la
// página recibe el id en window.FICHA).
//
// Solo perfiles publicados y solo la lista blanca pública
// (directorio.CAMPOS_LECTURA_PUBLICA), igual que el directorio.
// - Liga que no existe o perfil despublicado → 404 con la página "no está en
//   el directorio" (y noindex).
// - Airtable falla → 502 con un aviso; nunca se responde como "no existe".
const fs = require('fs');
const path = require('path');
const directorio = require('../lib/directorio');

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA'); // base del ambiente (Preview = prueba)
const TBL_DIRECTORIO = 'tblkUNPwu1sQgZBPJ';
const PLANTILLA = path.join(__dirname, '..', 'directorio', 'medico.html');

// Dominio para las ligas absolutas (og:url, canonical). En producción siempre
// www.codecells.mx; en Preview/local, el host de la petición si es válido.
function origen(req) {
  const host = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').toLowerCase();
  if (/(^|\.)codecells\.mx$/.test(host)) return 'https://www.codecells.mx';
  if (/^[a-z0-9.-]+\.vercel\.app$/.test(host)) return 'https://' + host;
  if (/^127\.0\.0\.1:\d+$/.test(host)) return 'http://' + host;
  return 'https://www.codecells.mx';
}

function enviarHtml(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(html);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    return res.end('Método no permitido');
  }
  const liga = String((req.query && req.query.liga) || '');
  let plantilla;
  try {
    plantilla = fs.readFileSync(PLANTILLA, 'utf8');
  } catch (e) {
    console.error('ficha: no se pudo leer la plantilla', e);
    return enviarHtml(res, 500, '<!doctype html><meta charset="utf-8"><title>Error</title><p>No pudimos mostrar este perfil. Intenta de nuevo en unos minutos.</p>', 'no-store');
  }
  const urlFicha = `${origen(req)}/directorio/${liga}`;
  const noEncontrada = () => enviarHtml(res, 404,
    directorio.htmlFicha(plantilla, { titulo: 'Médico no encontrado', descripcion: 'Este perfil no está en el directorio de la Red CODE CELLS™.', imagen: '', url: urlFicha }, { noEncontrada: true }, { indexar: false }),
    'public, s-maxage=60');

  if (!directorio.esLigaValida(liga)) return noEncontrada();

  const params = new URLSearchParams();
  params.set('filterByFormula', `AND({Publicado}=1, {${directorio.CAMPO_LIGA}}="${liga}")`);
  params.set('maxRecords', '1');
  directorio.CAMPOS_LECTURA_PUBLICA.forEach(c => params.append('fields[]', c));
  let rec;
  try {
    const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_DIRECTORIO}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` },
    });
    if (!r.ok) throw new Error('Airtable ' + r.status);
    const d = await r.json();
    rec = (d.records || [])[0] || null;
  } catch (e) {
    console.error('ficha: lectura falló', e.message);
    return enviarHtml(res, 502,
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No pudimos cargar el perfil</title>' +
      '<body style="font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;line-height:1.5">' +
      '<h1>No pudimos cargar el perfil</h1><p>Hubo un problema de conexión. Recarga la página en unos segundos.</p><p><a href="/directorio/">Ir al directorio</a></p></body></html>',
      'no-store');
  }
  if (!rec) return noEncontrada();

  directorio.limpiarPerfilPublico(rec);
  const meta = directorio.metaFicha(rec.fields, urlFicha);
  return enviarHtml(res, 200, directorio.htmlFicha(plantilla, meta, { id: rec.id, liga }),
    // 5 min en caché: un cambio de perfil o una despublicación tarda eso en verse.
    'public, s-maxage=300, stale-while-revalidate=600');
};
