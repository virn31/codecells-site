// lib/camposMedico.js
// Qué campos de MÉDICOS salen del servidor y hacia quién.
//
// Antes, auth-login devolvía el registro completo del médico y el portal lo
// guardaba en el dispositivo (guardarSesion/guardarDispositivo); y el proxy
// (api/airtable.js, tabla=medicos) entregaba a cualquier médico con sesión
// TODOS los médicos con TODOS sus campos — incluido el refresh token de
// Google Calendar de cada colega, que da acceso permanente a su calendario.
//
// Dos reglas:
//   1. CAMPOS_SOLO_SERVIDOR nunca salen, ni al propio médico. Los usa el
//      servidor (nova.js lee el refresh token para crear eventos).
//   2. De un COLEGA solo se ve CAMPOS_COLEGA (lista blanca): lo que la
//      pantalla de interconsulta necesita para elegir especialista.

const CAMPOS_SOLO_SERVIDOR = Object.freeze([
  'Google Calendar Refresh Token',
  'Passphrase NOVA',
]);

const CAMPOS_COLEGA = Object.freeze([
  'Código de médico',
  'Nombre completo',
  'Especialidad',
  'Ciudad',
  'Nivel CODE CELLS®',
  'Activo',
]);

// El propio registro del médico, sin los secretos de servidor. No muta.
function camposParaSuDueno(fields) {
  const limpios = { ...(fields || {}) };
  for (const campo of CAMPOS_SOLO_SERVIDOR) delete limpios[campo];
  return limpios;
}

// Lo que un médico ve de otro médico. No muta.
function camposParaColega(fields) {
  const f = fields || {};
  const limpios = {};
  for (const campo of CAMPOS_COLEGA) {
    if (f[campo] !== undefined) limpios[campo] = f[campo];
  }
  return limpios;
}

module.exports = { CAMPOS_SOLO_SERVIDOR, CAMPOS_COLEGA, camposParaSuDueno, camposParaColega };
