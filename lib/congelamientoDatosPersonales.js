// lib/congelamientoDatosPersonales.js
// Congelamiento de escritura de datos personales — instrucción legal para
// fijar una línea de corte auditable al 2026-08-24. Toda captación/escritura
// de datos de una persona identificable se rechaza en el servidor ANTES de
// tocar Airtable/servicios externos. La lectura de lo que ya existe no se
// toca. Reversible: no se borra código ni rutas — mismo patrón que los
// hotfixes de pausa de agosto (registro_publico_paciente, autorregistro por
// regToken).
//
// Regla (2026-10-04, con visto bueno del abogado según Víctor): lo que se
// congela es la BASE DE PRODUCCIÓN, no el código. Tres ambientes:
//   - Local y Preview (Vercel) apuntan a la base de PRUEBA vía
//     AIRTABLE_BASE_ID → nunca congelados: ahí se prueba el producto real
//     (celular, tablet del kiosco, otros médicos) sin tocar producción.
//   - Producción (sin AIRTABLE_BASE_ID, o con la de producción) → congelada
//     hasta que alguien defina a mano DESCONGELAR_PRODUCCION=true en Vercel
//     (el día del lanzamiento). Es un interruptor explícito: no basta con
//     que falte o sobre una variable por error para descongelar.
// Antes de esta regla, descongelar exigía NODE_ENV=development, que Vercel
// nunca pone — así que Preview no servía para probar.
//
// Requisito: ningún endpoint debe tener la base de producción fija en el
// código (si no, en Preview escribiría en producción aunque esto diga que no
// está congelado). Los 9 que la tenían se corrigieron en el mismo cambio.

const BASE_PRODUCCION = 'app6jyD9pDlTLpknA';
const baseEnUso = process.env.AIRTABLE_BASE_ID || BASE_PRODUCCION;
const esProduccion = baseEnUso === BASE_PRODUCCION;

const CONGELADO = esProduccion && process.env.DESCONGELAR_PRODUCCION !== 'true';

const MENSAJE_CONGELAMIENTO =
  'Estamos actualizando nuestro aviso de privacidad y políticas de datos. El registro de nueva información no está disponible temporalmente.';

function respuestaCongelada(res) {
  return res.status(503).json({
    ok: false,
    error: MENSAJE_CONGELAMIENTO,
    motivo: 'congelamiento_datos_personales_2026-08-24',
  });
}

module.exports = { CONGELADO, MENSAJE_CONGELAMIENTO, respuestaCongelada, BASE_PRODUCCION };
