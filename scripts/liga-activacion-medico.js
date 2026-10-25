// scripts/liga-activacion-medico.js
// Emite la liga de activación (crear PIN) de un médico. Es el arranque: el
// panel de administración también exige PIN, así que el primer administrador
// (Víctor) recibe la suya por aquí. Los demás médicos pueden recibirla desde el
// panel (admin-directorio.html → "Enlace de acceso").
//
//   node scripts/liga-activacion-medico.js CCMED-VIRN01
//        → base de prueba; imprime la liga para el servidor local
//   node scripts/liga-activacion-medico.js CCMED-VIRN01 --url https://www.codecells.mx --produccion
//        → base de PRODUCCIÓN
//
// La liga vale 72 h y un solo uso. Solo su HMAC queda en Airtable: si se
// pierde, se emite otra (la nueva invalida la anterior).
// Lee AIRTABLE_TOKEN, AIRTABLE_BASE_ID y SESSION_SECRET de .env.local. OJO:
// SESSION_SECRET debe ser el MISMO del ambiente donde se usará la liga.
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
const credenciales = require('../lib/credenciales');

const BASE_PRUEBA = 'appCQ0RdhqFMGxWL5';
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const args = process.argv.slice(2);
const codigo = (args.find(a => /^CCMED-[A-Z0-9]+$/.test(a)) || '').trim();
const iUrl = args.indexOf('--url');
const baseUrl = (iUrl >= 0 ? args[iUrl + 1] : 'http://127.0.0.1:3077').replace(/\/$/, '');

if (!codigo) {
  console.error('Uso: node scripts/liga-activacion-medico.js CCMED-XXXX [--url https://…] [--produccion]');
  process.exit(1);
}
if (BASE_ID !== BASE_PRUEBA && !args.includes('--produccion')) {
  console.error(`La base ${BASE_ID} no es la de prueba. Para escribir en producción agrega --produccion.`);
  process.exit(1);
}

(async () => {
  const p = new URLSearchParams({ filterByFormula: `{Código de médico}="${codigo}"`, maxRecords: '1' });
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_MEDICOS}?${p}`, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` } });
  if (!r.ok) throw new Error(`MÉDICOS respondió ${r.status}`);
  const med = ((await r.json()).records || [])[0];
  if (!med) { console.error(`No existe ${codigo} en la base ${BASE_ID}.`); process.exit(1); }
  if (med.fields['Activo'] === false) { console.error(`${codigo} está desactivado: no se emite liga.`); process.exit(1); }
  const liga = await credenciales.medico.emitirLiga({ medicoRecId: med.id, codigo, emitidaPor: 'script liga-activacion-medico' });
  console.log(`${codigo} (${med.fields['Nombre completo'] || 'sin nombre'}) — base ${BASE_ID}`);
  console.log(`Liga (72 h, un solo uso; no la compartas por un medio público):`);
  console.log(`${baseUrl}/entrar.html?activar=${liga}&t=medico`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
