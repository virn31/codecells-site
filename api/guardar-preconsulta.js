// api/guardar-preconsulta.js
// CERRADO (2026-10-05). Recibía los antecedentes que el paciente dictaba a
// NOVA en autorregistro.html y los escribía en PACIENTES + HISTORIA CLÍNICA
// — SIN NINGUNA SESIÓN: con solo un código CC-PAC- cualquiera podía
// sobrescribir antecedentes, alergias y medicamentos de cualquier paciente
// existente. Además, un fallo de lectura de Airtable creaba una HISTORIA
// duplicada (auditoría de lecturas sin r.ok, A9).
//
// El autorregistro por link está pausado desde 2026-08-23 (no es una de las
// dos vías autorizadas de creación de expediente, CLAUDE.md §7), y este era
// su único llamador. Si algún día se reactiva, debe volver con sesión de
// paciente (código del TOKEN, nunca del body) y lecturas que fallen
// ruidosamente. La implementación anterior vive en el historial de git.

module.exports = async (req, res) => {
  return res.status(410).json({
    error: 'La preconsulta por link está pausada. Tu médico completará tu historia clínica en consulta.',
    motivo: 'preconsulta_pausada',
  });
};
