// scripts/servidor-local.js
// Servidor de desarrollo mínimo, estilo Vercel, para probar kiosco / portal /
// app del paciente contra la BASE DE PRUEBA sin `vercel dev` (que pide login).
//
//   node scripts/servidor-local.js          → http://127.0.0.1:3077
//   PORT=3078 node scripts/servidor-local.js
//
// - Sirve los archivos estáticos del repo y monta api/<nombre>.js como
//   handler (req, res) con req.query, req.body (JSON) y res.status/json.
// - Carga .env.local (ignorado por git). Debe traer:
//     AIRTABLE_BASE_ID=appCQ0RdhqFMGxWL5   (base de prueba)
//     NODE_ENV=development + PERMITIR_REGISTRO_LOCAL=true  (descongela en local)
// - OJO: estos endpoints tienen la base de PRODUCCIÓN fija y escribirían en
//   producción aunque corran aquí: agenda, agenda-sync-cron, buscar-medicos,
//   capacitacion-progreso, google-oauth-callback, guardar-preconsulta,
//   nueva-solicitud-medico, telegram-bot, vip-activar.
// - En esta PC la PRIMERA llamada de cada proceso a Airtable tarda ~10 s y a
//   veces falla ("fetch failed"); reintentar. Usar 127.0.0.1, no localhost
//   (localhost intenta IPv6 y se cuelga).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const envLocal = path.join(ROOT, '.env.local');
if (fs.existsSync(envLocal)) {
  for (const linea of fs.readFileSync(envLocal, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}
if (process.env.AIRTABLE_BASE_ID !== 'appCQ0RdhqFMGxWL5') {
  console.warn(`⚠️  AIRTABLE_BASE_ID=${process.env.AIRTABLE_BASE_ID || '(vacío → PRODUCCIÓN)'} — no es la base de prueba.`);
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf',
};

http.createServer(async (req, res) => {
  const t0 = Date.now();
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    const nombre = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
    const archivo = path.join(ROOT, 'api', nombre + '.js');
    if (!fs.existsSync(archivo)) { res.statusCode = 404; return res.end('api no encontrada'); }
    let crudo = '';
    for await (const trozo of req) crudo += trozo;
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = crudo ? JSON.parse(crudo) : {}; } catch { req.body = {}; }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(o));
      console.log(req.method, req.url.slice(0, 120), res.statusCode, (Date.now() - t0) + 'ms');
      return res;
    };
    try { await require(archivo)(req, res); } catch (e) { console.error(e); res.statusCode = 500; res.end('error'); }
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', TIPOS[path.extname(f)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(f).pipe(res);
}).listen(Number(process.env.PORT || 3077), '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${process.env.PORT || 3077}  (base ${process.env.AIRTABLE_BASE_ID || 'PRODUCCIÓN'})`);
});
