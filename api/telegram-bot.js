// api/telegram-bot.js
// Webhook de Telegram para @Dr_victor_ivan_bot (CODE CELLS®).
//
// Dos funciones:
// 1) Vincular el chat_id de Telegram de cada médico con su registro en la tabla
//    MÉDICOS de Airtable (para que NOVA y los crons puedan enviarle alertas).
// 2) Una vez vinculado, el médico puede escribir los datos de un paciente
//    (peso, talla, IMC, diagnósticos, labs, etc.) y el bot le regresa un plan
//    nutricional de 7 días en texto plano, firmado con su nombre y cédula,
//    listo para copiar/pegar y reenviar por Telegram, WhatsApp o correo.

const { sendTelegramMessage, sendTelegramMessageChunked } = require('../lib/telegram');
const { generarPlanNutricional } = require('../lib/nutricion');
const { generarToken } = require('../lib/auth');

// Vercel: esta función puede tardar (generación con Claude), se permite hasta 60s.
module.exports.config = { maxDuration: 60 };

const AIRTABLE_BASE_ID = 'app6jyD9pDlTLpknA';
const MEDICOS_TABLE_ID = 'tbl87DsuBMmb4DjFM';
const DEDUPE_TABLE_ID = 'tblehEMlnMhPNVEBq';
const HILOS_TABLE_ID = 'tblTW5X6f2UkuUFPT';
const PACIENTES_TABLE_ID = 'tblyUcCfueFLJuvIv';
const HISTORIA_TABLE_ID = 'tblm2xUADazitHisR';
const CONSULTAS_TABLE_ID = 'tbl1Xp2IGxdV178Ky';
const LABS_TABLE_ID = 'tblhKp4uE1NdXXqLh';
const PENDIENTES_TABLE_ID = 'tbl7J1G8slqB8r0xu';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const CAMPO_CODIGO = 'Código de médico';
const CAMPO_CHAT_ID = 'Telegram Chat ID';
const CAMPO_NOMBRE = 'Nombre completo';
const CAMPO_CEDULA = 'Cédula profesional';

const ETIQUETAS_FICHA = {
  peso: 'Peso (kg)',
  talla: 'Talla (cm)',
  presion: 'Presión',
  temperatura: 'Temperatura (°C)',
  frecuencia_cardiaca: 'Frec. cardiaca',
  frecuencia_respiratoria: 'Frec. respiratoria',
  saturacion_oxigeno: 'Sat. O2 (%)',
  circunferencia_cintura: 'Cintura (cm)',
  motivo_consulta: 'Motivo de consulta',
  exploracion_fisica: 'Exploración física',
  diagnostico: 'Diagnóstico',
  plan_terapeutico: 'Plan terapéutico',
  notas_internas: 'Notas internas',
  antecedentes_heredofamiliares: 'AHF',
  antecedentes_personales_patologicos: 'APP',
  antecedentes_quirurgicos: 'Quirúrgicos',
  antecedentes_ginecoobstetricos: 'Gineco-obstétricos',
  medicamentos_actuales: 'Medicamentos actuales',
  alergias: 'Alergias',
  habitos_estilo_vida: 'Hábitos',
  estado_civil: 'Estado civil',
  ocupacion: 'Ocupación',
  grupo_sanguineo: 'Grupo sanguíneo',
  escolaridad: 'Escolaridad',
  panel_laboratorio: 'Panel de laboratorio',
  resultados_laboratorio: 'Resultados de laboratorio',
  valores_fuera_rango: 'Valores fuera de rango',
};

async function airtableGet(tableId, formula) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}?filterByFormula=${encodeURIComponent(formula)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  return data.records && data.records.length > 0 ? data.records[0] : null;
}

async function buscarPacientePorCodigo(codigo) {
  return airtableGet(PACIENTES_TABLE_ID, `{Código de paciente} = "${codigo}"`);
}

/**
 * Llama a NOVA en modo médico (mismo endpoint que usa el Portal) para que
 * interprete el dictado y regrese la "ficha" estructurada, sin pasar por
 * ningún formulario de navegador.
 */
async function interpretarDictado(dictado, medico) {
  const res = await fetch('https://www.codecells.mx/api/nova', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      medicoCode: medico.fields[CAMPO_CODIGO],
      medicoNombre: medico.fields[CAMPO_NOMBRE],
      medicoEspecialidad: medico.fields['Especialidad'],
      messages: [{ role: 'user', content: dictado }],
    }),
  });
  const data = await res.json();
  return data.ficha || null;
}

function resumenFicha(ficha) {
  const lineas = Object.entries(ficha)
    .filter(([clave, val]) => clave !== 'campos_faltantes' && val !== undefined && val !== null && val !== '')
    .map(([clave, val]) => `${ETIQUETAS_FICHA[clave] || clave}: ${val}`);
  return lineas.join('\n');
}

async function guardarPendiente(chatId, pacienteRecordId, codigoPaciente, ficha) {
  const existente = await airtableGet(PENDIENTES_TABLE_ID, `{Chat ID} = "${chatId}"`);
  const body = {
    fields: {
      'Chat ID': String(chatId),
      'Paciente': [pacienteRecordId],
      'Código de paciente': codigoPaciente,
      'Ficha JSON': ficha ? JSON.stringify(ficha) : '',
      'Fecha': new Date().toISOString(),
    },
  };
  const url = existente
    ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PENDIENTES_TABLE_ID}/${existente.id}`
    : `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PENDIENTES_TABLE_ID}`;
  await fetch(url, {
    method: existente ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function obtenerPendiente(chatId) {
  return airtableGet(PENDIENTES_TABLE_ID, `{Chat ID} = "${chatId}"`);
}

async function borrarPendiente(recordId) {
  await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PENDIENTES_TABLE_ID}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Ficha JSON': '' } }),
  });
}

/**
 * Reparte la ficha en las 3 tablas correctas — mismo criterio que usa el
 * botón "Guardar consulta" del Portal Médico.
 */
async function guardarFichaEnExpediente(pacienteRecord, ficha, medico) {
  const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
  const pacId = pacienteRecord.fields['Código de paciente'];

  const vitalesExtra = [];
  if (ficha.frecuencia_cardiaca) vitalesExtra.push(`FC: ${ficha.frecuencia_cardiaca} lpm`);
  if (ficha.frecuencia_respiratoria) vitalesExtra.push(`FR: ${ficha.frecuencia_respiratoria} rpm`);
  if (ficha.saturacion_oxigeno) vitalesExtra.push(`SatO2: ${ficha.saturacion_oxigeno}%`);
  if (ficha.circunferencia_cintura) vitalesExtra.push(`Cintura: ${ficha.circunferencia_cintura} cm`);

  const consultaFields = {
    'Código de paciente ref': pacId,
    'Médico': medico.fields[CAMPO_NOMBRE] || 'Médico',
    'Código de médico ref': medico.fields[CAMPO_CODIGO] || '—',
    'Firma / Cédula médico': (medico.fields[CAMPO_NOMBRE] || 'Médico') + (medico.fields[CAMPO_CEDULA] ? ' — Céd. ' + medico.fields[CAMPO_CEDULA] : ''),
    'Fecha de consulta': new Date().toISOString().split('T')[0],
    'Peso en consulta (kg)': ficha.peso || undefined,
    'Talla en consulta (cm)': ficha.talla || undefined,
    'Presión arterial en consulta': ficha.presion || undefined,
    'Temperatura en consulta (°C)': ficha.temperatura || undefined,
    'Motivo de consulta': ficha.motivo_consulta || undefined,
    'Exploración física': ficha.exploracion_fisica || undefined,
    'Diagnóstico (CIE-10)': ficha.diagnostico || undefined,
    'Plan terapéutico': ficha.plan_terapeutico || undefined,
    'Notas internas': ficha.notas_internas || undefined,
  };
  if (vitalesExtra.length > 0) consultaFields['Signos vitales'] = vitalesExtra.join(' · ');
  Object.keys(consultaFields).forEach((k) => consultaFields[k] === undefined && delete consultaFields[k]);

  const consultaRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CONSULTAS_TABLE_ID}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ typecast: true, records: [{ fields: consultaFields }] }),
  });
  const consultaData = await consultaRes.json();
  const consultaId = consultaData.records && consultaData.records[0] && consultaData.records[0].id;

  // Sugerencia automática de CIE-10 — mismo criterio que el portal: solo si
  // el médico no dictó ya un diagnóstico explícito. Se autentica con un
  // token interno de un solo uso (pocos minutos de vida), mismo mecanismo
  // de sesión que usa el resto del sistema — no un canal de seguridad aparte.
  if (consultaId && !ficha.diagnostico) {
    try {
      const tokenInterno = generarToken({ tipo: 'medico', codigo: medico.fields[CAMPO_CODIGO], horas: 0.05 });
      await fetch('https://www.codecells.mx/api/nova-asistente-clinico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInterno}` },
        body: JSON.stringify({
          accion: 'sugerir_cie10',
          consultaRecordId: consultaId,
          motivo: ficha.motivo_consulta || '',
          exploracion: ficha.exploracion_fisica || '',
        }),
      });
    } catch (err) {
      console.error('[telegram-bot] error al pedir sugerencia CIE-10:', err.message);
    }
  }

  if (ficha.resultados_laboratorio) {
    const labFields = {
      'Código de paciente ref': pacId,
      'Paciente': [pacienteRecord.id],
      'Panel solicitado': ficha.panel_laboratorio || 'Personalizado',
      'Resultados (texto)': ficha.resultados_laboratorio,
      'Fecha de resultados': new Date().toISOString().split('T')[0],
    };
    if (ficha.valores_fuera_rango) labFields['Valores fuera de rango'] = ficha.valores_fuera_rango;
    if (consultaId) labFields['Consulta'] = [consultaId];
    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${LABS_TABLE_ID}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ typecast: true, records: [{ fields: labFields }] }),
    });
  }

  const historiaFields = {
    'AHF — Heredo-familiares': ficha.antecedentes_heredofamiliares || undefined,
    'APP — Enfermedades previas': ficha.antecedentes_personales_patologicos || undefined,
    'Antecedentes quirúrgicos': ficha.antecedentes_quirurgicos || undefined,
    'AGO — Ginecobstétrico': ficha.antecedentes_ginecoobstetricos || undefined,
    'Medicamentos actuales': ficha.medicamentos_actuales || undefined,
    'Alergias': ficha.alergias || undefined,
    'APNP — Alimentación': ficha.habitos_estilo_vida || undefined,
  };
  Object.keys(historiaFields).forEach((k) => historiaFields[k] === undefined && delete historiaFields[k]);

  if (Object.keys(historiaFields).length > 0) {
    const historiaExistente = await airtableGet(HISTORIA_TABLE_ID, `{Código de paciente ref} = "${pacId}"`);
    if (historiaExistente) {
      await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${HISTORIA_TABLE_ID}/${historiaExistente.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ typecast: true, fields: historiaFields }),
      });
    } else {
      historiaFields['Código de paciente ref'] = pacId;
      historiaFields['Paciente'] = [pacienteRecord.id];
      historiaFields['Fecha entrevista NOVA'] = new Date().toISOString();
      await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${HISTORIA_TABLE_ID}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ typecast: true, records: [{ fields: historiaFields }] }),
      });
    }
  }

  const pacienteFields = {
    'Estado civil': ficha.estado_civil || undefined,
    'Ocupación': ficha.ocupacion || undefined,
    'Grupo sanguíneo': ficha.grupo_sanguineo || undefined,
    'Escolaridad': ficha.escolaridad || undefined,
  };
  Object.keys(pacienteFields).forEach((k) => pacienteFields[k] === undefined && delete pacienteFields[k]);
  if (Object.keys(pacienteFields).length > 0) {
    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PACIENTES_TABLE_ID}/${pacienteRecord.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ typecast: true, fields: pacienteFields }),
    });
  }
}

async function buscarMedicoPorCodigo(codigo) {
  return airtableGet(MEDICOS_TABLE_ID, `{${CAMPO_CODIGO}} = "${codigo}"`);
}

async function buscarMedicoPorChatId(chatId) {
  return airtableGet(MEDICOS_TABLE_ID, `{${CAMPO_CHAT_ID}} = "${chatId}"`);
}

async function vincularChatId(recordId, chatId) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}/${recordId}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [CAMPO_CHAT_ID]: String(chatId) } }),
  });
}

/**
 * Busca un hilo paciente↔alerta por message_id + chat_id del médico.
 * Devuelve null si no existe o si ya fue respondido.
 */
async function buscarHiloPaciente(chatId, replyToMessageId) {
  const formula = `AND({Message ID} = "${replyToMessageId}", {Chat ID Médico} = "${chatId}", {Respondido} = FALSE())`;
  return airtableGet(HILOS_TABLE_ID, formula);
}

/**
 * Guarda la respuesta del médico en el expediente del paciente (para que NOVA
 * se la entregue en la próxima conversación) y marca el hilo como respondido.
 */
async function entregarRespuestaAlPaciente(hilo, textoRespuesta) {
  const pacienteId = hilo.fields['Paciente']?.[0];
  if (!pacienteId) return null;

  const pacUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PACIENTES_TABLE_ID}/${pacienteId}`;
  const pacRes = await fetch(pacUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const pacData = await pacRes.json();
  const previa = pacData.fields?.['Respuesta médico pendiente'] || '';
  const fechaHoy = new Date().toISOString().slice(0, 10);
  const nuevaRespuesta = (previa ? previa + '\n' : '') + `[${fechaHoy}] ${textoRespuesta.trim()}`;

  await fetch(pacUrl, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Respuesta médico pendiente': nuevaRespuesta } }),
  });

  await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${HILOS_TABLE_ID}/${hilo.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Respondido': true } }),
  });

  return pacData.fields?.['Nombre completo'] || 'el paciente';
}

/**
 * Verifica si este update_id ya se procesó para este chat (reintento de Telegram).
 * Si es nuevo, marca el update_id como procesado ANTES de hacer trabajo pesado.
 * @returns {Promise<boolean>} true si es un duplicado y debe ignorarse.
 */
async function esDuplicado(chatId, updateId) {
  const registro = await airtableGet(DEDUPE_TABLE_ID, `{Chat ID} = "${chatId}"`);

  if (registro && String(registro.fields['Último Update ID']) === String(updateId)) {
    return true;
  }

  const url = registro
    ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DEDUPE_TABLE_ID}/${registro.id}`
    : `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DEDUPE_TABLE_ID}`;
  const method = registro ? 'PATCH' : 'POST';
  const body = registro
    ? { fields: { 'Último Update ID': String(updateId) } }
    : { fields: { 'Chat ID': String(chatId), 'Último Update ID': String(updateId) } };

  await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return false;
}

/**
 * (Fusionado desde api/telegram-alert.js — mismo endpoint ahora, para no
 * exceder el límite de 12 funciones serverless de Vercel Hobby.)
 * Vincula el message_id de una alerta enviada a un médico con el paciente
 * que la originó, para que cuando el médico "responda" (reply) ese mensaje,
 * el webhook de abajo sepa a qué paciente entregarle la respuesta.
 */
async function crearHiloPacienteAlerta({ messageId, chatId, pacienteRecordId, preguntaPaciente }) {
  await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${HILOS_TABLE_ID}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      typecast: true,
      records: [{
        fields: {
          'Message ID': String(messageId),
          'Chat ID Médico': String(chatId),
          'Paciente': [pacienteRecordId],
          'Pregunta del paciente': preguntaPaciente || '',
          'Fecha': new Date().toISOString(),
          'Respondido': false,
        },
      }],
    }),
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('CODE CELLS® Telegram bot activo.');
  }

  // ── Alerta interna (fusionado desde api/telegram-alert.js) ──────────
  // NOVA (api/nova.js) y los crons llaman este mismo endpoint para enviar
  // alertas a médicos, distinguido por el header x-internal-secret — un
  // update real de Telegram nunca trae ese header, así que no hay ambigüedad.
  const secretoInterno = req.headers['x-internal-secret'];
  if (secretoInterno) {
    if (secretoInterno !== process.env.INTERNAL_ALERT_SECRET) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    try {
      const { codigoMedico, chatId, mensaje, pacienteRecordId, preguntaPaciente } = req.body || {};
      if (!mensaje) return res.status(400).json({ error: 'Falta "mensaje"' });

      let destinoChatId = chatId;
      if (!destinoChatId && codigoMedico) {
        const medico = await buscarMedicoPorCodigo(codigoMedico);
        if (!medico) return res.status(404).json({ error: `Médico ${codigoMedico} no encontrado` });
        destinoChatId = medico.fields[CAMPO_CHAT_ID];
        if (!destinoChatId) {
          return res.status(409).json({ error: `Médico ${codigoMedico} aún no vinculó su Telegram (no tiene Telegram Chat ID)` });
        }
      }
      if (!destinoChatId) return res.status(400).json({ error: 'Falta "codigoMedico" o "chatId"' });

      const resultadoEnvio = await sendTelegramMessage(destinoChatId, mensaje);
      const messageId = resultadoEnvio?.result?.message_id;

      if (pacienteRecordId && messageId) {
        await crearHiloPacienteAlerta({ messageId, chatId: destinoChatId, pacienteRecordId, preguntaPaciente });
      }
      return res.status(200).json({ ok: true, messageId: messageId || null });
    } catch (err) {
      console.error('[telegram-bot] error en alerta interna:', err.message);
      return res.status(500).json({ error: 'Error interno enviando alerta' });
    }
  }

  try {
    const update = req.body;
    const message = update.message;

    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const texto = message.text.trim();

    if (await esDuplicado(chatId, update.update_id)) {
      // Telegram reintentó este mismo mensaje; ya se procesó, no repetir.
      return res.status(200).json({ ok: true });
    }

    // /start sin código: instrucciones
    if (texto === '/start') {
      await sendTelegramMessage(
        chatId,
        'Hola, soy el bot de notificaciones y apoyo clínico de CODE CELLS® Red Médica.\n\n' +
          'Para vincular tu cuenta, envíame tu código de médico (formato CCMED-XXXXXX).\n\n' +
          'Una vez vinculado:\n' +
          '• Escribe "plan" + datos del paciente → plan nutricional de 7 días.\n' +
          '• Escribe el código del paciente (CC-PAC-XXXXXX) + tu dictado → lo interpreto y, si confirmas, lo guardo en su expediente.'
      );
      return res.status(200).json({ ok: true });
    }

    // Mensaje con código CCMED- (vinculación)
    const matchCodigo = texto.match(/CCMED-[A-Za-z0-9]+/i);
    if (matchCodigo) {
      const codigo = matchCodigo[0].toUpperCase();
      const medico = await buscarMedicoPorCodigo(codigo);

      if (!medico) {
        await sendTelegramMessage(
          chatId,
          `No encontré el código ${codigo} en la Red CODE CELLS®. Verifica que esté bien escrito o contacta a Víctor.`
        );
        return res.status(200).json({ ok: true });
      }

      await vincularChatId(medico.id, chatId);

      const nombre = medico.fields[CAMPO_NOMBRE] || 'Doctor(a)';
      await sendTelegramMessage(
        chatId,
        `Cuenta vinculada correctamente, ${nombre}.\n\nA partir de ahora recibirás aquí tus notificaciones de CODE CELLS® (certificaciones, recordatorios del Diplomado, avisos de NOVA).\n\nPara generar un plan nutricional, escribe "plan" seguido de los datos del paciente. Para dictar un expediente, escribe el código del paciente (CC-PAC-XXXXXX) seguido de lo que quieras registrar.`
      );
      return res.status(200).json({ ok: true });
    }

    // Cualquier otro mensaje: ¿el médico ya está vinculado?
    const medicoVinculado = await buscarMedicoPorChatId(chatId);

    if (!medicoVinculado) {
      await sendTelegramMessage(
        chatId,
        'Este bot es exclusivo para médicos de la Red CODE CELLS®. Si aún no vinculaste tu cuenta, envíame tu código CCMED-XXXXXX.'
      );
      return res.status(200).json({ ok: true });
    }

    // Médico vinculado y el mensaje no es un comando de vinculación:
    // primero revisar si es una RESPUESTA (reply de Telegram) a una alerta
    // de paciente — en ese caso, entregar la respuesta y NO generar plan.
    if (message.reply_to_message) {
      const hilo = await buscarHiloPaciente(chatId, message.reply_to_message.message_id);
      if (hilo) {
        const nombrePaciente = await entregarRespuestaAlPaciente(hilo, texto);
        await sendTelegramMessage(
          chatId,
          `Respuesta enviada. Se le mostrará a ${nombrePaciente} en su próxima conversación con NOVA.`
        );
        return res.status(200).json({ ok: true });
      }
    }

    // ¿Es una confirmación ("sí", "confirmar", "guardar"...) de un dictado
    // de expediente pendiente?
    if (/^(s[ií]|confirmar|guardar|correcto|ok|dale)\.?!?$/i.test(texto)) {
      const pendiente = await obtenerPendiente(chatId);
      if (pendiente && pendiente.fields['Ficha JSON']) {
        try {
          const ficha = JSON.parse(pendiente.fields['Ficha JSON']);
          const pacienteRecord = await buscarPacientePorCodigo(pendiente.fields['Código de paciente']);
          if (!pacienteRecord) {
            await sendTelegramMessage(chatId, 'No encontré ese paciente ya — puede que se haya movido. Intenta el dictado de nuevo.');
            return res.status(200).json({ ok: true });
          }
          await guardarFichaEnExpediente(pacienteRecord, ficha, medicoVinculado);
          await borrarPendiente(pendiente.id);
          await sendTelegramMessage(
            chatId,
            `Guardado en el expediente de ${pacienteRecord.fields['Nombre completo'] || pendiente.fields['Código de paciente']}. ✅`
          );
        } catch (err) {
          console.error('[telegram-bot] error guardando ficha confirmada:', err.message);
          await sendTelegramMessage(chatId, 'Hubo un error guardando en Airtable. Intenta de nuevo.');
        }
        return res.status(200).json({ ok: true });
      }
      // No hay nada pendiente que confirmar — cae al flujo normal abajo.
    }

    // ¿El mensaje trae un código de paciente (CC-PAC-XXXXXX), el comando
    // "/consulta", O ya estábamos esperando el dictado de un paciente que
    // se identificó en un mensaje anterior? En cualquiera de los tres casos
    // se interpreta como dictado de expediente.
    const matchPaciente = texto.match(/CC-PAC-[0-9]{4,8}/i);
    const esComandoConsulta = /^\/consulta\b/i.test(texto);

    let pendienteEsperando = null;
    if (!matchPaciente && !esComandoConsulta) {
      const posible = await obtenerPendiente(chatId);
      if (posible && posible.fields['Código de paciente'] && !posible.fields['Ficha JSON']) {
        pendienteEsperando = posible;
      }
    }

    if (matchPaciente || esComandoConsulta || pendienteEsperando) {
      const codigoPaciente = matchPaciente
        ? matchPaciente[0].toUpperCase()
        : pendienteEsperando
          ? pendienteEsperando.fields['Código de paciente']
          : null;

      if (!codigoPaciente) {
        await sendTelegramMessage(chatId, 'Necesito el código del paciente (formato CC-PAC-XXXXXX) para saber a quién va el dictado.');
        return res.status(200).json({ ok: true });
      }

      const pacienteRecord = await buscarPacientePorCodigo(codigoPaciente);
      if (!pacienteRecord) {
        await sendTelegramMessage(chatId, `No encontré ningún paciente con el código ${codigoPaciente}.`);
        return res.status(200).json({ ok: true });
      }

      // Si ya estábamos esperando su dictado, el mensaje completo ES el
      // dictado (no hace falta repetir el código).
      const dictado = pendienteEsperando
        ? texto.trim()
        : texto.replace(/^\/consulta\b/i, '').replace(codigoPaciente, '').replace(/^[:\s-]+/, '').trim();

      if (!dictado) {
        await guardarPendiente(chatId, pacienteRecord.id, codigoPaciente, null);
        await sendTelegramMessage(chatId, `Encontré a ${pacienteRecord.fields['Nombre completo']} — ahora dime qué quieres registrar.`);
        return res.status(200).json({ ok: true });
      }

      await sendTelegramMessage(chatId, 'Analizando el dictado, un momento...');

      try {
        const ficha = await interpretarDictado(dictado, medicoVinculado);
        if (!ficha) {
          await sendTelegramMessage(chatId, 'No pude interpretar datos clínicos claros en ese mensaje. Intenta con más detalle.');
          return res.status(200).json({ ok: true });
        }

        await guardarPendiente(chatId, pacienteRecord.id, codigoPaciente, ficha);

        const resumen = resumenFicha(ficha);
        await sendTelegramMessageChunked(
          chatId,
          `Esto entendí para ${pacienteRecord.fields['Nombre completo']} (${codigoPaciente}):\n\n${resumen}\n\n¿Lo guardo? Responde "sí" para confirmar, o mándame la corrección.`
        );
      } catch (err) {
        console.error('[telegram-bot] error interpretando dictado:', err.message);
        await sendTelegramMessage(chatId, 'Hubo un error interpretando el dictado. Intenta de nuevo.');
      }
      return res.status(200).json({ ok: true });
    }

    // Médico vinculado: solo se genera plan nutricional si el mensaje empieza
    // explícitamente con "plan" o "/plan" — así cualquier otro mensaje suyo
    // (confirmar una cita, comentarios, etc.) no se confunde con esto.
    const esComandoPlan = /^\/?plan\b/i.test(texto);

    if (!esComandoPlan) {
      await sendTelegramMessage(
        chatId,
        'Recibido. Si quieres generar un plan nutricional, escribe "plan" seguido de los datos del paciente (peso, talla, diagnósticos, etc.).\n\n' +
          'Si quieres dictar un expediente, escribe el código del paciente (CC-PAC-XXXXXX) seguido de lo que quieras registrar.\n\n' +
          'Si me estás respondiendo algo de una alerta de paciente, usa la función "Responder" (mantén presionado el mensaje de la alerta y elige Responder) para que le llegue directo.'
      );
      return res.status(200).json({ ok: true });
    }

    const textoParaPlan = texto.replace(/^\/?plan\b\s*/i, '').trim();

    await sendTelegramMessage(chatId, 'Generando el plan, un momento...');

    try {
      const plan = await generarPlanNutricional(textoParaPlan);

      const nombreMedico = medicoVinculado.fields[CAMPO_NOMBRE] || '';
      const cedulaMedico = medicoVinculado.fields[CAMPO_CEDULA] || '';
      const firma =
        `\n\n${nombreMedico}` +
        (cedulaMedico ? `\nCédula profesional: ${cedulaMedico}` : '') +
        `\n\nNOVA by CODE CELLS®`;

      await sendTelegramMessageChunked(chatId, plan + firma);
    } catch (errPlan) {
      console.error('[telegram-bot] Error generando plan nutricional:', errPlan);
      await sendTelegramMessage(
        chatId,
        'Hubo un error generando el plan. Intenta de nuevo en un momento.'
      );
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error en telegram-bot webhook:', err);
    return res.status(200).json({ ok: true }); // Siempre 200 para que Telegram no reintente en loop
  }
};
