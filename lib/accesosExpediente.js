// lib/accesosExpediente.js
// Capa 1 — constancia de acceso a expedientes. La bitácora registra; la
// autorización decide. Este archivo SOLO observa: deja rastro de quién
// intentó qué, cuándo y con qué resultado. No decide ningún acceso, no
// bloquea nada, y no asume ningún modelo de autorización propio — esa
// decisión completa vive en autorizarPaciente()/viaInterconsulta()
// (lib/autorizacion.js), que sí distingue médico principal de médico
// consultado por interconsulta (CLAUDE.md §4). Un intento "Denegado" que
// llega hasta aquí es evidencia de que la autorización ya corrió y ya dijo
// que no — esta capa nunca es la que decide el resultado.
//
// ACCESOS_EXPEDIENTE (tblSpORAqLKxYOI6W, base app6jyD9pDlTLpknA) — tabla ya
// creada, campos ya definidos. Los singleSelect (Acción/Resultado) todavía
// no tienen opciones configuradas en Airtable — typecast:true las crea al
// primer uso.

const BASE_ID = 'app6jyD9pDlTLpknA';
const TBL_ACCESOS = 'tblSpORAqLKxYOI6W';

function formatearFechaLegible(fecha) {
  // "2026-08-21 15:40" — UTC, sin segundos, para el campo primario legible.
  return fecha.toISOString().slice(0, 16).replace('T', ' ');
}

// Nunca lanza — un fallo al escribir la constancia no debe tumbar la
// operación real del médico (regla dura #2). console.error y seguir.
// La fecha SIEMPRE la pone el servidor (regla dura #3) — por eso no se
// acepta como parámetro; new Date() es la única fuente.
async function registrarAccesoExpediente({ pacienteCode, codigoMedico, medicoRecId, accion, resultado, endpoint, esDemo = false }) {
  try {
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    if (!AIRTABLE_TOKEN) {
      console.error('[accesos-expediente] AIRTABLE_TOKEN no configurado — acceso no registrado.');
      return;
    }
    const ahora = new Date();
    // Código de paciente es texto, no link, a propósito — debe poder
    // registrar también códigos que no existen (ver nota de diseño).
    const codigoPacienteTexto = (pacienteCode && String(pacienteCode).trim()) || '(sin código)';
    const codigoMedicoTexto = (codigoMedico && String(codigoMedico).trim()) || '(sin código)';

    const fields = {
      'Name': `${codigoPacienteTexto} · ${codigoMedicoTexto} · ${formatearFechaLegible(ahora)}`,
      'Código de paciente': codigoPacienteTexto,
      'Código de médico': codigoMedicoTexto,
      'Fecha y hora': ahora.toISOString(),
      'Acción': accion,
      'Resultado': resultado,
      'Endpoint': endpoint,
    };
    // El link a MÉDICOS es un extra cuando ya se resolvió el recordId como
    // parte de la operación misma — nunca se resuelve aquí solo para esto
    // (evitaría una consulta a Airtable extra en cada acceso).
    if (medicoRecId) fields['Médico'] = [medicoRecId];
    // `Es demo` marca accesos de sesión tipo:'demo' (api/auth-login.js) —
    // filtrable y excluible de métricas sin tener que parsear el texto de
    // Endpoint/Código de médico.
    if (esDemo) fields['Es demo'] = true;

    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_ACCESOS}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ typecast: true, records: [{ fields }] }),
    });
    if (!res.ok) {
      console.error('[accesos-expediente] error escribiendo registro:', await res.text());
    }
  } catch (err) {
    console.error('[accesos-expediente] excepción al registrar acceso:', err.message);
  }
}

module.exports = { registrarAccesoExpediente };
