// api/vip-activar.js
// Endpoint público (llamado desde dezawavip.html) que activa una cuenta VIP
// real: genera Código DZW + Token activación de forma server-side con
// verificación anti-colisión (ver lib/codigos.js), escribe el registro en
// PACIENTES_VIP, marca la invitación de origen como "Contratado" si aplica,
// y SIEMPRE notifica por Telegram a los médicos configurados — sin importar
// si el paciente llegó por invitación autorizada por un médico, por
// referido de otro paciente VIP, o por el test público abierto. Así nunca
// se pierde de vista la coordinación de atención, en ninguno de los caminos.

const { sendTelegramMessage } = require('../lib/telegram');
const { generarCodigoUnico } = require('../lib/codigos');
const { CONGELADO, respuestaCongelada } = require('../lib/congelamientoDatosPersonales');

const BASE_ID = 'app6jyD9pDlTLpknA';
const TBL_PACIENTES_VIP = 'pacientes_vip'; // alias whitelisteado en api/airtable.js
const TBL_TEMP = 'temp';                   // alias whitelisteado — ahí viven las invitaciones
const TBL_MEDICOS_ID = 'tbl87DsuBMmb4DjFM';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

// Médicos que SIEMPRE deben enterarse de una cuenta VIP nueva, sin importar
// el canal de entrada. Agregar aquí si en el futuro se suma un tercero.
const CODIGOS_A_NOTIFICAR = ['CCMED-VIRN01', 'CCMED-JCG01'];

function airtableUrl(tabla, extra = '') {
  return `https://api.airtable.com/v0/${BASE_ID}/${tabla}${extra}`;
}

async function airtableFetch(tabla, opts = {}, extra = '') {
  const res = await fetch(airtableUrl(tabla, extra), {
    ...opts,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

async function buscarMedicoPorCodigo(codigo) {
  const formula = encodeURIComponent(`{Código de médico}="${codigo}"`);
  const { data } = await airtableFetch(TBL_MEDICOS_ID, {}, `?filterByFormula=${formula}`);
  return data.records && data.records.length > 0 ? data.records[0] : null;
}

async function notificarMedicos({ nombre, protocolo, origen, detalle }) {
  const mensaje =
    `🆕 Nuevo paciente DEZAWA VIP\n\n` +
    `Nombre: ${nombre || '(sin nombre)'}\n` +
    `Protocolo sugerido: ${protocolo || '—'}\n` +
    `Origen: ${origen}` +
    (detalle ? `\n${detalle}` : '');

  // No bloqueamos la respuesta al paciente si Telegram falla — se registra
  // en logs, pero el paciente ya tiene su cuenta activa.
  await Promise.all(
    CODIGOS_A_NOTIFICAR.map(async (codigo) => {
      try {
        const medico = await buscarMedicoPorCodigo(codigo);
        const chatId = medico?.fields?.['Telegram Chat ID'];
        if (chatId) {
          await sendTelegramMessage(chatId, mensaje);
        } else {
          console.error(`[vip-activar] ${codigo} no tiene Telegram Chat ID configurado.`);
        }
      } catch (err) {
        console.error(`[vip-activar] error notificando a ${codigo}:`, err.message);
      }
    })
  );
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://codecells.mx');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // CONGELAMIENTO 2026-08-24 (instrucción legal): activación pública de
  // cuenta VIP (PACIENTES_VIP) — captura Nombre/WhatsApp/Email/scores. Ver
  // lib/congelamientoDatosPersonales.js.
  if (CONGELADO) return respuestaCongelada(res);

  try {
    const {
      inviteCode,      // 'INV-XXXXXXXX' si llegó por invitación (médico o referido) — null si es flujo abierto
      nombre,
      whatsapp,
      email,
      protocolo,
      scores,           // { energy, repair, balance, neuro, regen }
      solicitadoPor,    // texto ya armado por el cliente (referido/equipo/invitación)
    } = req.body || {};

    if (!nombre || typeof nombre !== 'string') {
      return res.status(400).json({ error: 'Falta el nombre del paciente.' });
    }

    let origenInvitacion = null; // registro completo de la invitación en `temp`, si aplica

    if (inviteCode) {
      if (!/^INV-[0-9]{6,10}$/.test(inviteCode)) {
        return res.status(400).json({ error: 'Código de invitación inválido.' });
      }
      const formula = encodeURIComponent(`{Código invitación}="${inviteCode}"`);
      const { data } = await airtableFetch(TBL_TEMP, {}, `?filterByFormula=${formula}&maxRecords=1`);
      origenInvitacion = data.records && data.records[0] ? data.records[0] : null;
      // 403 uniforme, nunca 404: mismo principio que lib/autorizacion.js —
      // un código de invitación inexistente no debe ser distinguible por
      // status/mensaje de uno mal formado, para no poder recorrer INV-XXXXXXXX
      // en bloque.
      if (!origenInvitacion) {
        return res.status(403).json({ error: 'Invitación no disponible.' });
      }
      if (origenInvitacion.fields['Estado'] === 'Contratado') {
        return res.status(409).json({ error: 'Esta invitación ya fue procesada.' });
      }
    }

    // Códigos generados en el servidor, con verificación anti-colisión.
    const codigoDZW = await generarCodigoUnico({
      AIRTABLE_TOKEN, BASE_ID, TABLE_ID: TBL_PACIENTES_VIP,
      CAMPO: 'Código DZW', PREFIJO: 'DZW-', esSecuencial: false,
    });
    const tokenActivacion = await generarCodigoUnico({
      AIRTABLE_TOKEN, BASE_ID, TABLE_ID: TBL_PACIENTES_VIP,
      CAMPO: 'Token activación', PREFIJO: 'SETUP-', esSecuencial: false,
    });

    const fieldsVip = {
      'Nombre': nombre,
      'WhatsApp': whatsapp || (origenInvitacion?.fields?.['WhatsApp'] || ''),
      'Email': email || (origenInvitacion?.fields?.['Email'] || ''),
      'Código DZW': codigoDZW,
      'Token activación': tokenActivacion,
      'Activado': false,
      'Protocolo': protocolo || '',
      'Nivel de acceso': 'VIP',
      'Solicitado por': solicitadoPor || (origenInvitacion
        ? `${origenInvitacion.fields['Invitado por (tipo)'] || 'Invitación'} ${origenInvitacion.fields['Invitado por (código)'] || ''}`.trim()
        : 'Test público'),
      'Estado': 'Activo',
      'Fecha creación': new Date().toISOString(),
    };
    if (scores) {
      if (scores.energy  != null) fieldsVip['Score ENERGY']  = scores.energy;
      if (scores.repair  != null) fieldsVip['Score REPAIR']  = scores.repair;
      if (scores.balance != null) fieldsVip['Score BALANCE'] = scores.balance;
      if (scores.neuro   != null) fieldsVip['Score NEURO']   = scores.neuro;
      if (scores.regen   != null) fieldsVip['Score REGEN']   = scores.regen;
    }

    const { ok: createOk, data: createData } = await airtableFetch(TBL_PACIENTES_VIP, {
      method: 'POST',
      body: JSON.stringify({ typecast: true, records: [{ fields: fieldsVip }] }),
    });

    if (!createOk || !createData.records || !createData.records[0]) {
      console.error('[vip-activar] error creando registro VIP:', JSON.stringify(createData));
      return res.status(502).json({ error: 'No se pudo activar la cuenta VIP. Intenta de nuevo.' });
    }

    // Si vino de una invitación, se marca como Contratado — dezawavip.html
    // ya reconoce este estado para no dejar reutilizar la misma invitación.
    if (origenInvitacion) {
      await airtableFetch(TBL_TEMP, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'Estado': 'Contratado' }, typecast: true }),
      }, `/${origenInvitacion.id}`).catch((err) => console.error('[vip-activar] error marcando invitación como Contratado:', err.message));
    }

    const origenTexto = origenInvitacion
      ? `Vía invitación ${origenInvitacion.fields['Invitado por (tipo)'] === 'Médico' ? 'de médico' : 'de referido'}`
      : 'Vía test público';
    const detalleTexto = origenInvitacion
      ? `Invitado por: ${origenInvitacion.fields['Invitado por (código)'] || '—'}`
      : null;

    // Notificación best-effort — no debe tumbar la respuesta al paciente.
    notificarMedicos({ nombre, protocolo, origen: origenTexto, detalle: detalleTexto }).catch((err) => {
      console.error('[vip-activar] error notificando médicos:', err.message);
    });

    return res.status(200).json({
      ok: true,
      id: createData.records[0].id,
      codigo: codigoDZW,
      tokenActivacion,
    });
  } catch (err) {
    console.error('[vip-activar] error interno:', err.message);
    return res.status(500).json({ error: 'Error interno activando la cuenta VIP.' });
  }
};
