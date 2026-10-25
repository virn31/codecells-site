// scripts/asignar-ligas-directorio.js
// Asigna la "Liga pública" (/directorio/<liga>) a los perfiles PUBLICADOS que
// todavía no la tienen (los que se aprobaron antes de que existiera; los
// nuevos la reciben al aprobarse en api/directorio.js). Nunca cambia una liga
// que ya existe.
//
//   node scripts/asignar-ligas-directorio.js              → solo muestra qué haría
//   node scripts/asignar-ligas-directorio.js --aplicar    → escribe (base de prueba)
//   node scripts/asignar-ligas-directorio.js --aplicar --produccion
//                                                         → escribe en PRODUCCIÓN
//
// Lee AIRTABLE_TOKEN y AIRTABLE_BASE_ID de .env.local (como el servidor local).
const fs = require('fs');
const path = require('path');
const D = require('../lib/directorio');

const ROOT = path.resolve(__dirname, '..');
const envLocal = path.join(ROOT, '.env.local');
if (fs.existsSync(envLocal)) {
  for (const linea of fs.readFileSync(envLocal, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}
const BASE_PRUEBA = 'appCQ0RdhqFMGxWL5';
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA';
const TBL = 'tblkUNPwu1sQgZBPJ';
const aplicar = process.argv.includes('--aplicar');
if (aplicar && BASE_ID !== BASE_PRUEBA && !process.argv.includes('--produccion')) {
  console.error(`La base ${BASE_ID} no es la de prueba. Para escribir en producción agrega --produccion.`);
  process.exit(1);
}

async function at(ruta, opciones = {}) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return d;
}

(async () => {
  const todos = [];
  let offset;
  do {
    const p = new URLSearchParams([['fields[]', 'Name'], ['fields[]', 'Publicado'], ['fields[]', D.CAMPO_LIGA], ['pageSize', '100']]);
    if (offset) p.set('offset', offset);
    const d = await at(`${TBL}?${p}`);
    todos.push(...d.records);
    offset = d.offset;
  } while (offset);

  const usadas = todos.map(r => r.fields[D.CAMPO_LIGA]).filter(Boolean);
  const pendientes = todos.filter(r => r.fields.Publicado && !D.esLigaValida(r.fields[D.CAMPO_LIGA]));
  console.log(`Base ${BASE_ID}: ${todos.length} perfiles, ${pendientes.length} publicados sin liga.`);
  for (const r of pendientes) {
    const liga = D.ligaDisponible(r.fields.Name, usadas);
    usadas.push(liga);
    if (aplicar) {
      const act = await at(`${TBL}/${r.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { [D.CAMPO_LIGA]: liga } }) });
      // Se cuenta lo que Airtable confirmó, no lo intentado.
      console.log(act.fields[D.CAMPO_LIGA] === liga ? '✓' : '✗ NO SE GUARDÓ', r.id, r.fields.Name, '→', liga);
    } else {
      console.log('(sin escribir)', r.id, r.fields.Name, '→', liga);
    }
  }
  if (!aplicar && pendientes.length) console.log('Para escribir: --aplicar');
})().catch(e => { console.error(e.message); process.exit(1); });
