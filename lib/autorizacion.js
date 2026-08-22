// lib/autorizacion.js
// Única fuente de verdad para "¿este médico puede tocar este paciente?"
// (CLAUDE.md §4). Antes de este archivo la respuesta se repetía —o
// faltaba— en cada endpoint clínico: 630c106 cerró la enumeración de
// PACIENTES pero dejó historia/consultas/labs, medico_tabla_labs,
// medico_resumen_labs y graficas_series leyendo el expediente de
// cualquier paciente (Pendiente 3). Todo acceso médico a un expediente
// pasa por autorizarPaciente(); un endpoint que no la llama no tiene
// forma de leer datos de paciente (ver el guard en api/airtable.js).

const BASE_ID = 'app6jyD9pDlTLpknA';
const TBL_PACIENTES = 'tblyUcCfueFLJuvIv';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';

// Nombres reales de campo — filterByFormula de Airtable solo acepta
// nombres, nunca IDs (aunque la tarea los liste; se verificaron contra
// datos reales de la base antes de escribir esto: CC-PAC-635281 trae
// Médico_principal → [{id:"recDQBB7QxgWdZVeB", name:"CCMED-VIRN01"}]).
const CAMPO_CODIGO_PACIENTE = 'Código de paciente'; // fldCrr2Y0UES1PBJS
const CAMPO_MEDICO_PRINCIPAL = 'Médico_principal'; // fldQi7M2OXo9AsGNT
const CAMPO_ES_DEMO = 'Es demo'; // fld390FMoPXf7oUJh
const CAMPO_CODIGO_MEDICO = 'Código de médico'; // MÉDICOS, campo primario

// NOTA: 'asignado' (CLAUDE.md §4, vía 2 — NOVA asigna por solicitud del
// directorio) usa HOY el mismo campo Médico_principal que "lo registró
// directamente" (vía 1) — no existe un campo separado en Airtable que las
// distinga. Por eso esta función nunca produce via==='asignado': ambas
// vías 1 y 2 se etiquetan 'principal'. Si algún día se separan, este
// archivo es el único lugar que cambia.
//
// El flag "Ver todos los pacientes" (MÉDICOS, fldT779AWvDFqk4xN) NO se
// consulta aquí a propósito: desde 630c106 dejó de ser visibilidad y es
// solo permiso admin del bot de Telegram (ver api/telegram-bot.js). Un
// médico con ese flag en true (ej. CCMED-JCG01) NO debe pasar por eso —
// CLAUDE.md §4 es explícito: "sin excepciones... por ser fundador".

const MENSAJE_NO_DISPONIBLE = 'Paciente no disponible';

// 403 uniforme: paciente inexistente y paciente ajeno son indistinguibles
// a propósito (regla 1) — un 404 aparte reabriría la enumeración que
// 630c106 cerró, por otra puerta.
class ErrorAutorizacion extends Error {
  constructor(mensaje = MENSAJE_NO_DISPONIBLE) {
    super(mensaje);
    this.name = 'ErrorAutorizacion';
    this.status = 403;
  }
}

function escaparFormula(valor) {
  return String(valor).replace(/"/g, '\\"');
}

// TODO(P2): tabla INTERCONSULTAS no existe aún (CLAUDE.md §4 vía 3;
// Pendiente 2 de 630c106 — hoy la interconsulta es efímera, por
// ?pacienteBuscado= en el teclado, no queda registrada). Devuelve null
// por NO IMPLEMENTADO, nunca por "no autorizado": autorizarPaciente()
// NUNCA debe leer este null como negativa validada, solo como "esta vía
// no aplicó todavía".
async function viaInterconsulta(_codigoMedico, _camposPaciente) {
  return null;
}

// GET exacto contra Airtable (nunca search_records, nunca match difuso —
// regla 5). Un fallo real de Airtable (red, 5xx) se relanza tal cual: NO
// se traduce a ErrorAutorizacion, porque un error de infraestructura no
// es una decisión de autorización (CLAUDE.md §6 — falla ruidosamente, no
// silencies un error de red como si fuera un "no autorizado").
async function airtableGetExacto(tableId, campo, valor, token) {
  const formula = `{${campo}}="${escaparFormula(valor)}"`;
  const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const e = new Error(`autorizacion: airtable respondió ${r.status} al leer ${tableId}`);
    e.status = 502;
    throw e;
  }
  const data = await r.json();
  return (data.records && data.records[0]) || null;
}

/**
 * ¿Puede `codigoMedico` tocar al paciente `pacienteCode`? Resuelve el
 * paciente UNA VEZ (una consulta a PACIENTES) y evalúa las vías sobre ese
 * registro — nunca cuatro consultas condicionadas por vía.
 *
 * @param {string} codigoMedico   Código CCMED- extraído del token verificado. NUNCA del body.
 * @param {string} pacienteCode   Código CC-PAC- solicitado.
 * @param {{requiereEscritura?: boolean}} [opts]
 * @returns {Promise<{recId:string, codigo:string, via:'principal'|'asignado'|'interconsulta'|'demo', escritura:boolean, medicoRecId:string|null}>}
 *   medicoRecId es el recordId de MÉDICOS que autorizó — null en vía 'demo'
 *   (no se resuelve médico para una vía de solo lectura). Para atribución
 *   de escrituras (campo "Registrado por"), nunca usar esto si escritura
 *   es false.
 * @throws  {ErrorAutorizacion} 403 — mismo mensaje para "no existe" y "no es tuyo".
 */
async function autorizarPaciente(codigoMedico, pacienteCode, { requiereEscritura = false } = {}) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  if (!AIRTABLE_TOKEN) {
    const e = new Error('autorizacion: AIRTABLE_TOKEN no configurado.');
    e.status = 500;
    throw e;
  }

  const registro = await airtableGetExacto(TBL_PACIENTES, CAMPO_CODIGO_PACIENTE, pacienteCode, AIRTABLE_TOKEN);
  if (!registro) throw new ErrorAutorizacion();

  const f = registro.fields || {};

  // Demo domina: solo lectura SIN EXCEPCIÓN (regla 3), aunque el médico
  // también sea Médico_principal de este registro — no hay forma de que
  // requiereEscritura:true pase para un paciente demo.
  if (f[CAMPO_ES_DEMO] === true) {
    if (requiereEscritura) throw new ErrorAutorizacion();
    return { recId: registro.id, codigo: pacienteCode, via: 'demo', escritura: false, medicoRecId: null };
  }

  // Vía principal — membresía EXACTA por recordId, no por substring de
  // texto: se resuelve el código del médico a su propio recordId en
  // MÉDICOS (mismo patrón que ya usa el PATCH de pacientes en
  // api/airtable.js) y se verifica que esté en el link. Así "CCMED-JORGE"
  // nunca cala contra "CCMED-JORGE01" — no porque se delimite con comas
  // una búsqueda de texto, sino porque son dos recordIds distintos o el
  // primero simplemente no resuelve a ningún médico real.
  const medico = await airtableGetExacto(TBL_MEDICOS, CAMPO_CODIGO_MEDICO, codigoMedico, AIRTABLE_TOKEN);
  const linkPrincipal = Array.isArray(f[CAMPO_MEDICO_PRINCIPAL]) ? f[CAMPO_MEDICO_PRINCIPAL] : [];
  if (medico && linkPrincipal.includes(medico.id)) {
    return { recId: registro.id, codigo: pacienteCode, via: 'principal', escritura: true, medicoRecId: medico.id };
  }

  const viaInter = await viaInterconsulta(codigoMedico, f);
  if (viaInter) {
    return { recId: registro.id, codigo: pacienteCode, via: 'interconsulta', escritura: true };
  }

  throw new ErrorAutorizacion();
}

module.exports = { autorizarPaciente, ErrorAutorizacion, MENSAJE_NO_DISPONIBLE };
