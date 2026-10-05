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

const { sendTelegramMessage } = require('./telegram');

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');
const TBL_ACCESOS = 'tblSpORAqLKxYOI6W';
const BASE_PRODUCCION = 'app6jyD9pDlTLpknA';

// Decidido por Víctor (2026-10-05): SIEMPRE debe haber registro. Si Airtable
// no acepta la constancia se reintenta; si aun así falla, el registro
// completo se manda por Telegram (TELEGRAM_CHAT_ID, el chat de Víctor) —
// sin consultar Airtable para resolver el chat, porque el problema puede ser
// justo que Airtable no responde. Si Telegram también falla, queda el
// registro completo en el log de Vercel como último recurso.
const ESPERAS_REINTENTO_MS = [0, 300, 1000];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function formatearFechaLegible(fecha) {
  // "2026-08-21 15:40" — UTC, sin segundos, para el campo primario legible.
  return fecha.toISOString().slice(0, 16).replace('T', ' ');
}

// Nunca lanza — un fallo al escribir la constancia no debe tumbar la
// operación real del médico (regla dura #2). Pero tampoco se pierde: ver
// reintento + alerta por Telegram arriba.
// La fecha SIEMPRE la pone el servidor (regla dura #3) — por eso no se
// acepta como parámetro; new Date() es la única fuente.
async function registrarAccesoExpediente({ pacienteCode, codigoMedico, medicoRecId, accion, resultado, endpoint, esDemo = false }) {
  try {
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    if (!AIRTABLE_TOKEN) {
      await alertarRegistroPerdido({ pacienteCode, codigoMedico, accion, resultado, endpoint }, 'AIRTABLE_TOKEN no configurado');
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

    let ultimoError = '';
    for (const espera of ESPERAS_REINTENTO_MS) {
      if (espera) await esperar(espera);
      try {
        const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL_ACCESOS}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ typecast: true, records: [{ fields }] }),
        });
        if (res.ok) return;
        ultimoError = `Airtable ${res.status}: ${(await res.text()).slice(0, 300)}`;
        // Un 4xx que no es 429 (campo inválido, permisos) no se arregla
        // reintentando: directo a la alerta.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
      } catch (err) {
        ultimoError = `red: ${err.message}`;
      }
    }
    await alertarRegistroPerdido(fields, ultimoError);
  } catch (err) {
    console.error('[accesos-expediente] excepción al registrar acceso:', err.message);
    await alertarRegistroPerdido({ pacienteCode, codigoMedico, accion, resultado, endpoint }, `excepción: ${err.message}`);
  }
}

async function alertarRegistroPerdido(fields, error) {
  const ambiente = BASE_ID === BASE_PRODUCCION ? 'PRODUCCIÓN' : `prueba (${BASE_ID})`;
  const texto =
    `⚠️ *Bitácora de accesos: registro NO guardado en Airtable*\n` +
    `Ambiente: ${ambiente}\n\n` +
    `Fecha (UTC): ${fields['Fecha y hora'] || new Date().toISOString()}\n` +
    `Paciente: ${fields['Código de paciente'] || fields.pacienteCode || '(sin código)'}\n` +
    `Médico: ${fields['Código de médico'] || fields.codigoMedico || '(sin código)'}\n` +
    `Acción: ${fields['Acción'] || fields.accion || ''}\n` +
    `Resultado: ${fields['Resultado'] || fields.resultado || ''}\n` +
    `Endpoint: ${fields['Endpoint'] || fields.endpoint || ''}` +
    (fields['Es demo'] ? `\nSesión demo: sí` : '') +
    `\n\nError: ${error}\n` +
    `Este mensaje ES la constancia de ese acceso hasta que se capture en ACCESOS_EXPEDIENTE.`;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  try {
    if (!chatId) throw new Error('TELEGRAM_CHAT_ID no configurado');
    await sendTelegramMessage(chatId, texto);
  } catch (err) {
    // Último recurso: el registro completo en el log de Vercel.
    console.error('[accesos-expediente] REGISTRO PERDIDO (ni Airtable ni Telegram):', err.message, JSON.stringify({ fields, error }));
  }
}

module.exports = { registrarAccesoExpediente };
