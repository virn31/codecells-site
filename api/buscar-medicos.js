// api/buscar-medicos.js
// CERRADO (2026-10-05). Era la API del buscador viejo (buscar-medico.html,
// que desde agosto redirige a /directorio). Público y sin sesión:
//   - listaba TODOS los médicos (también inactivos) con teléfono y nivel
//     interno — el nivel nunca se muestra al público (CLAUDE.md §10) y los
//     teléfonos del directorio solo se ven tras aceptar el aviso de privacidad;
//   - ofrecía un "triage" con el modelo sin ningún límite (gasto de tokens
//     abierto a cualquiera);
//   - un fallo de Airtable se respondía como "sin médicos" (auditoría M1).
// El reemplazo es /directorio (api/airtable.js, lista blanca + Publicado) y
// la herramienta buscar_medicos_directorio de NOVA. La implementación
// anterior vive en el historial de git.

module.exports = async (req, res) => {
  return res.status(410).json({
    error: 'Este buscador fue reemplazado por el directorio médico.',
    directorio: '/directorio',
  });
};
