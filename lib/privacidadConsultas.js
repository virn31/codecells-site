// lib/privacidadConsultas.js
// El paciente es dueño del expediente, no del criterio médico. Todo médico
// autorizado al paciente (principal, vinculado por llave, interconsulta, demo)
// ve el expediente completo — diagnóstico, CIE-10, plan terapéutico,
// medicamentos, recomendaciones, signos, padecimiento y exploración — porque
// ocultar el manejo de un colega reproduce justo el problema que la red
// resuelve (SPEC Fase 2 §6.1). Lo que NO ve es el criterio propio de cada
// colega: estos campos solo los ve el AUTOR de la consulta. El paciente
// tampoco los ve.
//
// Decidido por Víctor el 2026-10-04. Se filtra en el SERVIDOR: un filtro en
// la UI se salta con F12.

const CAMPOS_PRIVADOS_AUTOR = Object.freeze([
  'Razonamiento clínico',
  'Notas internas',
  'Pronóstico',
  'Adherencia — observaciones',
]);

// ¿El médico (código del token + su recordId en MÉDICOS) es autor de esta
// consulta? Se acepta el código en 'Código de médico ref' o el link 'Médico':
// el portal históricamente escribió '—' en el ref cuando no tenía el código
// a la mano, y sin el link ese autor perdería sus propias notas.
function esAutor(fields, codigoMedico, medicoRecId) {
  if (!codigoMedico) return false;
  if (fields['Código de médico ref'] === codigoMedico) return true;
  const link = Array.isArray(fields['Médico']) ? fields['Médico'] : [];
  return !!medicoRecId && link.includes(medicoRecId);
}

// Quita los campos privados de cada consulta que el lector no escribió.
// lector = { codigoMedico, medicoRecId } para un médico; null para el
// paciente (nunca es autor). Devuelve registros NUEVOS — no muta la entrada.
function filtrarConsultasParaLector(records, lector) {
  if (!Array.isArray(records)) return records;
  return records.map((rec) => {
    const fields = rec && rec.fields ? rec.fields : {};
    if (lector && esAutor(fields, lector.codigoMedico, lector.medicoRecId)) return rec;
    const limpios = { ...fields };
    for (const campo of CAMPOS_PRIVADOS_AUTOR) delete limpios[campo];
    return { ...rec, fields: limpios };
  });
}

module.exports = { CAMPOS_PRIVADOS_AUTOR, esAutor, filtrarConsultasParaLector };
