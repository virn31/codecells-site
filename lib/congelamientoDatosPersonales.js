// lib/congelamientoDatosPersonales.js
// Congelamiento de escritura de datos personales — instrucción legal para
// fijar una línea de corte auditable al 2026-08-24. Toda captación/escritura
// de datos de una persona identificable se rechaza en el servidor ANTES de
// tocar Airtable/servicios externos. La lectura de lo que ya existe no se
// toca. Reversible: no se borra código ni rutas — mismo patrón que los
// hotfixes de pausa de agosto (registro_publico_paciente, autorregistro por
// regToken). Para reactivar: CONGELADO = false.

const CONGELADO = true;

const MENSAJE_CONGELAMIENTO =
  'Estamos actualizando nuestro aviso de privacidad y políticas de datos. El registro de nueva información no está disponible temporalmente.';

function respuestaCongelada(res) {
  return res.status(503).json({
    ok: false,
    error: MENSAJE_CONGELAMIENTO,
    motivo: 'congelamiento_datos_personales_2026-08-24',
  });
}

module.exports = { CONGELADO, MENSAJE_CONGELAMIENTO, respuestaCongelada };
