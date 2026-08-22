// api/guardar-preconsulta.js
// Recibe los antecedentes y datos que el propio paciente dictó a NOVA en
// autorregistro.html (preconsulta) y los reparte en PACIENTES + HISTORIA
// CLÍNICA — mismo criterio de reparto que usa el dictado médico, pero aquí
// no requiere confirmación de un médico porque es autorreporte del paciente
// sobre sí mismo.

const { MENSAJE_NO_DISPONIBLE } = require('../lib/autorizacion');

const AIRTABLE_BASE_ID = 'app6jyD9pDlTLpknA';
const PACIENTES_TABLE_ID = 'tblyUcCfueFLJuvIv';
const HISTORIA_TABLE_ID = 'tblm2xUADazitHisR';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

async function airtableGet(tableId, formula) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}?filterByFormula=${encodeURIComponent(formula)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  return data.records && data.records.length > 0 ? data.records[0] : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { codigoPaciente, ...datos } = req.body;
    if (!codigoPaciente || !/^CC-PAC-[0-9]{4,8}$/.test(codigoPaciente)) {
      return res.status(400).json({ error: 'Código de paciente inválido.' });
    }

    // 403 uniforme, nunca 404: un código inexistente y uno inválido deben
    // verse igual desde afuera — un 404 distinguible es un oráculo para
    // enumerar códigos CC-PAC- en bloque (mismo principio que
    // lib/autorizacion.js, aunque aquí no hay médico que autorizar).
    const pacienteRecord = await airtableGet(PACIENTES_TABLE_ID, `{Código de paciente} = "${codigoPaciente}"`);
    if (!pacienteRecord) {
      return res.status(403).json({ error: MENSAJE_NO_DISPONIBLE });
    }

    const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };

    // Datos sociodemográficos → PACIENTES
    const pacienteFields = {
      'Fecha de nacimiento': datos.fecha_nacimiento || undefined,
      'Estado civil': datos.estado_civil || undefined,
      'Ocupación': datos.ocupacion || undefined,
      'Grupo sanguíneo': datos.grupo_sanguineo || undefined,
      'Escolaridad': datos.escolaridad || undefined,
    };
    Object.keys(pacienteFields).forEach((k) => pacienteFields[k] === undefined && delete pacienteFields[k]);
    if (Object.keys(pacienteFields).length > 0) {
      await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PACIENTES_TABLE_ID}/${pacienteRecord.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ typecast: true, fields: pacienteFields }),
      });
    }

    // Antecedentes + motivo → HISTORIA CLÍNICA
    const historiaFields = {
      'Motivo de consulta': datos.motivo_consulta || undefined,
      'AHF — Heredo-familiares': datos.antecedentes_heredofamiliares || undefined,
      'APP — Enfermedades previas': datos.antecedentes_personales_patologicos || undefined,
      'Antecedentes quirúrgicos': datos.antecedentes_quirurgicos || undefined,
      'AGO — Ginecobstétrico': datos.antecedentes_ginecoobstetricos || undefined,
      'Medicamentos actuales': datos.medicamentos_actuales || undefined,
      'Alergias': datos.alergias || undefined,
      'APNP — Alimentación': datos.habitos_estilo_vida || undefined,
    };
    Object.keys(historiaFields).forEach((k) => historiaFields[k] === undefined && delete historiaFields[k]);

    if (Object.keys(historiaFields).length > 0) {
      const historiaExistente = await airtableGet(HISTORIA_TABLE_ID, `{Código de paciente ref} = "${codigoPaciente}"`);
      if (historiaExistente) {
        await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${HISTORIA_TABLE_ID}/${historiaExistente.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ typecast: true, fields: historiaFields }),
        });
      } else {
        historiaFields['Código de paciente ref'] = codigoPaciente;
        historiaFields['Paciente'] = [pacienteRecord.id];
        historiaFields['Fecha entrevista NOVA'] = new Date().toISOString();
        await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${HISTORIA_TABLE_ID}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ typecast: true, records: [{ fields: historiaFields }] }),
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[guardar-preconsulta] error:', err.message);
    return res.status(500).json({ error: 'Error interno guardando la preconsulta.' });
  }
};
