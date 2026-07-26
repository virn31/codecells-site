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
// CELLS®, este nivel de mitigación es más que suficiente.
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

async function generarCodigoUnico({ AIRTABLE_TOKEN, BASE_ID, TABLE_ID, CAMPO, PREFIJO, esSecuencial, maxIntentos = 6 }) {
  for (let intento = 0; intento < maxIntentos; intento++) {
    let candidato;

    if (esSecuencial) {
      const listRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?fields[]=${encodeURIComponent(CAMPO)}`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      const listData = await listRes.json();
      const numeros = (listData.records || [])
        .map(r => parseInt((r.fields[CAMPO] || '').replace(PREFIJO, ''), 10))
        .filter(n => !isNaN(n));
      // +intento: si el candidato "natural" ya chocó en una vuelta anterior,
      // probamos con el siguiente número en vez de repetir el mismo cálculo.
      const siguienteNum = (numeros.length ? Math.max(...numeros) : 0) + 1 + intento;
      candidato = `${PREFIJO}${String(siguienteNum).padStart(6, '0')}`;
    } else {
      candidato = PREFIJO + String(Math.floor(Math.random() * 90000000) + 10000000);
    }

    const formulaCheck = `{${CAMPO}}="${candidato}"`;
    const checkRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(formulaCheck)}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const checkData = await checkRes.json();

    if (!checkData.records || checkData.records.length === 0) {
      return candidato;
    }
    // Colisión — siguiente intento con nuevo candidato.
  }

  throw new Error(`No se pudo generar un código único para ${CAMPO} después de ${maxIntentos} intentos.`);
}

module.exports = { generarCodigoUnico };
