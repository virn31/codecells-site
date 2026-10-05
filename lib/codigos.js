// lib/codigos.js
// Utilidad compartida para generar códigos (CC-PAC-, DZW-, INV-, etc.) con
// verificación anti-colisión del lado del servidor.
//
// IMPORTANTE — límite honesto: Airtable no ofrece locks atómicos reales vía
// API (no hay constraint de unicidad ni escritura condicional tipo
// If-Match/ETag sobre un valor de campo). Esto NO es un candado atómico en
// el sentido estricto de una base de datos transaccional. Lo que sí hace:
// mueve la generación al servidor (en vez del navegador del cliente) y,
// antes de usar un código candidato, verifica contra Airtable que no exista
// ya — con varios reintentos si hay colisión. Esto reduce drásticamente la
// ventana de riesgo real (que antes era 100% del lado del cliente, sin
// ninguna verificación), aunque en teoría dos invocaciones concurrentes del
// mismo milisegundo podrían aún chocar. Para el volumen actual de CODE
// CELLS™, este nivel de mitigación es más que suficiente.
//
// Uso:
//   const { generarCodigoUnico } = require('../lib/codigos');
//   const codigo = await generarCodigoUnico({
//     AIRTABLE_TOKEN, BASE_ID, TABLE_ID,
//     CAMPO: 'Código de paciente',
//     PREFIJO: 'CC-PAC-',
//     esSecuencial: true,   // CC-PAC-000123 — se calcula max+1
//   });
//   // o para códigos aleatorios (DZW-, INV-, etc.):
//   const codigo = await generarCodigoUnico({
//     AIRTABLE_TOKEN, BASE_ID, TABLE_ID,
//     CAMPO: 'Código DZW',
//     PREFIJO: 'DZW-',
//     esSecuencial: false,  // DZW-12345678 — 8 dígitos aleatorios
//   });

// GET a Airtable que LANZA si no responde ok. Esta es la única capa
// anti-colisión: si una lectura falla (429/5xx) y se tomara como "no existe",
// el candidato se daría por único SIN verificarlo — dos pacientes con el
// mismo CC-PAC- (auditoría 2026-08-24, C5). Ante la duda, no se genera.
async function leerAirtable(url, AIRTABLE_TOKEN) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  if (!r.ok) {
    const e = new Error(`codigos: Airtable respondió ${r.status}; no se puede verificar que el código sea único.`);
    e.status = 502;
    throw e;
  }
  return r.json();
}

async function existeCodigo({ AIRTABLE_TOKEN, BASE_ID, TABLE_ID, CAMPO }, candidato) {
  const formulaCheck = `{${CAMPO}}="${candidato}"`;
  const data = await leerAirtable(
    `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(formulaCheck)}&maxRecords=1`,
    AIRTABLE_TOKEN
  );
  return Array.isArray(data.records) && data.records.length > 0;
}

async function generarCodigoUnico({ AIRTABLE_TOKEN, BASE_ID, TABLE_ID, CAMPO, PREFIJO, esSecuencial, maxIntentos = 6 }) {
  for (let intento = 0; intento < maxIntentos; intento++) {
    let candidato;

    if (esSecuencial) {
      // TODAS las páginas: con solo la primera (100 registros) el máximo
      // salía mal en cuanto hubiera más de 100.
      const registros = [];
      let offset;
      do {
        const data = await leerAirtable(
          `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?fields[]=${encodeURIComponent(CAMPO)}&pageSize=100${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`,
          AIRTABLE_TOKEN
        );
        registros.push(...(data.records || []));
        offset = data.offset;
      } while (offset);
      const numeros = registros
        .map(r => parseInt((r.fields[CAMPO] || '').replace(PREFIJO, ''), 10))
        .filter(n => !isNaN(n));
      // +intento: si el candidato "natural" ya chocó en una vuelta anterior,
      // probamos con el siguiente número en vez de repetir el mismo cálculo.
      const siguienteNum = (numeros.length ? Math.max(...numeros) : 0) + 1 + intento;
      candidato = `${PREFIJO}${String(siguienteNum).padStart(6, '0')}`;
    } else {
      candidato = PREFIJO + String(Math.floor(Math.random() * 90000000) + 10000000);
    }

    if (!(await existeCodigo({ AIRTABLE_TOKEN, BASE_ID, TABLE_ID, CAMPO }, candidato))) {
      return candidato;
    }
    // Colisión — siguiente intento con nuevo candidato.
  }

  throw new Error(`No se pudo generar un código único para ${CAMPO} después de ${maxIntentos} intentos.`);
}

// Genera un código a partir de las iniciales de un nombre (hasta 3 letras)
// + un sufijo numérico de 2 dígitos, verificando colisión — usado para
// CCMED- al aprobar una solicitud de afiliación (ej. "Carlos Gabriel
// Terrazas" -> CCMED-CGT01).
function extraerIniciales(nombreCompleto) {
  const limpio = String(nombreCompleto || '')
    .replace(/^(Dr\.?a?\.?|Dra\.?)\s+/i, '')
    .trim();
  const palabras = limpio.split(/\s+/).filter(Boolean);
  return palabras.slice(0, 3).map(p => p[0].toUpperCase()).join('') || 'MED';
}

async function generarCodigoPorIniciales({ AIRTABLE_TOKEN, BASE_ID, TABLE_ID, CAMPO, PREFIJO, nombreCompleto, maxIntentos = 15 }) {
  const iniciales = extraerIniciales(nombreCompleto);
  for (let intento = 1; intento <= maxIntentos; intento++) {
    const candidato = `${PREFIJO}${iniciales}${String(intento).padStart(2, '0')}`;
    if (!(await existeCodigo({ AIRTABLE_TOKEN, BASE_ID, TABLE_ID, CAMPO }, candidato))) {
      return candidato;
    }
  }
  throw new Error(`No se pudo generar un código único con iniciales "${iniciales}" tras ${maxIntentos} intentos.`);
}

module.exports = { generarCodigoUnico, generarCodigoPorIniciales };
