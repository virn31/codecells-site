// api/telegram-bot.js
// Webhook de Telegram para @Drvirnbot (CODE CELLS™).
//
// Dos funciones:
// 1) Vincular el chat_id de Telegram de cada médico con su registro en la tabla
//    MÉDICOS de Airtable (para que NOVA y los crons puedan enviarle alertas).
// 2) Una vez vinculado, el médico puede escribir los datos de un paciente
//    (peso, talla, IMC, diagnósticos, labs, etc.) y el bot le regresa un plan
//    nutricional de 7 días en texto plano, firmado con su nombre y cédula,
//    listo para copiar/pegar y reenviar por Telegram o correo.

const { sendTelegramMessage, sendTelegramMessageChunked, answerCallbackQuery, editarMensaje } = require('../lib/telegram');
const { generarPlanNutricional } = require('../lib/nutricion');
const { generarCodigoPorIniciales } = require('../lib/codigos');
const { CONGELADO, congelado, respuestaCongelada } = require('../lib/congelamientoDatosPersonales');
const { autorizarPaciente, ErrorAutorizacion, verificarAccesoClinicoMedico } = require('../lib/autorizacion');
const { registrarAccesoExpediente } = require('../lib/accesosExpediente');
const { estructurarDictado } = require('../lib/dictado');
const { sugerirCie10, integrarCodigosEnDiagnostico } = require('../lib/cie10');
const { manejarMensajeAgenda, manejarBotonAgenda } = require('../lib/agenda-telegram');

// Vercel: esta función puede tardar (generación con Claude), se permite hasta 60s.
module.exports.config = { maxDuration: 60 };

const AIRTABLE_BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA'); // base del ambiente (Preview = prueba)
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

async function airtableGet(tableId, formula) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}?filterByFormula=${encodeURIComponent(formula)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  // Un 429/5xx NO es "no encontrado" (CLAUDE.md §6): antes un fallo de
  // Airtable se leía como "código inexistente" al vincular, como "sin hilo"
  // al responder a un paciente, etc. Se lanza; el catch del webhook avisa
  // al médico que fue un problema temporal.
  if (!res.ok) throw new Error(`Airtable respondió ${res.status} al leer ${tableId}`);
  const data = await res.json();
  return data.records && data.records.length > 0 ? data.records[0] : null;
}

async function buscarPacientePorCodigo(codigo) {
  return airtableGet(PACIENTES_TABLE_ID, `{Código de paciente} = "${codigo}"`);
}

// ── Dictado por Telegram (SPEC dictado, Fase 3) ────────────────────────
// Mismo motor que el portal (lib/dictado.js): cada campo se verifica contra
// una cita literal de lo dictado. El médico ve "Entendí:" campo por campo y
// solo "sí" guarda. Mientras hay un dictado pendiente, lo que escriba se
// AGREGA al dictado y se vuelve a estructurar todo; "cancelar" lo descarta.
// El pendiente vive en PENDIENTES ('Ficha JSON' = { v: 2, transcripcion,
// resultado }) y caduca: un "sí" horas después no guarda nada olvidado.
const VERSION_PENDIENTE = 2;
const HORAS_VIGENCIA_PENDIENTE = 12;

function leerDictadoPendiente(pendiente) {
  if (!pendiente || !pendiente.fields['Ficha JSON']) return null;
  let d;
  try { d = JSON.parse(pendiente.fields['Ficha JSON']); } catch { return { invalido: 'formato' }; }
  if (!d || d.v !== VERSION_PENDIENTE || !d.transcripcion || !d.resultado) return { invalido: 'formato' };
  const fecha = Date.parse(pendiente.fields['Fecha'] || '');
  if (!Number.isFinite(fecha) || Date.now() - fecha > HORAS_VIGENCIA_PENDIENTE * 3600 * 1000) return { invalido: 'vencido' };
  return d;
}

function mensajeEntendi(nombre, codigo, r) {
  const L = [`Entendí para ${nombre} (${codigo}):`, ''];
  const porCampo = {};
  for (const x of (r.detalle || [])) (porCampo[x.campo] = porCampo[x.campo] || []).push(x);
  for (const [campo, items] of Object.entries(porCampo)) {
    const valor = r.campos[campo];
    if (valor === undefined) continue;
    const citas = items.map((x) => x.cita).filter((c) => String(c) !== String(valor));
    L.push(`• **${items[0].etiqueta}:** ${valor}${citas.length ? ` — «${citas.join('» · «')}»` : ''}${items.some((x) => x.aviso) ? ' ⚠️ fuera de rango plausible, revisa' : ''}`);
  }
  if (!Object.keys(r.campos || {}).length) L.push('No encontré datos clínicos que acomodar en la ficha.');
  if ((r.descartados || []).length) {
    L.push('', '**Descartado** (no lo encontré tal cual en lo que dictaste):');
    r.descartados.forEach((x) => L.push(`• ${x.etiqueta || x.campo}: ${x.valor ?? ''} — ${x.motivo}`));
  }
  if ((r.sinUbicar || []).length) {
    L.push('', '**No encaja en ningún campo** (no se guarda):');
    r.sinUbicar.forEach((x) => L.push(`• «${x}»`));
  }
  if ((r.faltantes || []).length) L.push('', `Signos que no dictaste (quedan vacíos): ${r.faltantes.join(', ')}.`);
  if (r.receta) {
    L.push('', '**Receta** (borrador — no se emite desde Telegram; la emites tú desde el portal):');
    (r.receta.medicamentos || []).forEach((m) => L.push(`• ${m.nombre} ${m.dosis} ${m.via} ${m.frecuencia}${m.duracionDias ? ` · ${m.duracionDias} días` : ''}${m.faltan.length ? ` — falta: ${m.faltan.join(', ')}` : ''}`.replace(/\s+/g, ' ')));
    if (r.receta.indicaciones) L.push(`Indicaciones: ${r.receta.indicaciones}`);
    if (r.receta.proximaCita) L.push(`Próxima cita: ${r.receta.proximaCita}`);
  }
  const opciones = (r.cie10 && r.cie10.opciones) || [];
  if (opciones.length) {
    L.push('', '**CIE-10 sugeridos para tu diagnóstico** (verificados contra el catálogo; elige tú):');
    opciones.forEach((o) => L.push(`${o.n}) ${o.codigo} — ${o.descripcion} («${o.frase}»)`));
  } else if (r.cie10 && r.cie10.error) {
    L.push('', `CIE-10: ${r.cie10.error} El diagnóstico se guarda como lo dictaste.`);
  }
  if (!Object.keys(r.campos || {}).length) {
    L.push('', 'Sigue dictando para agregar, o **cancelar** para descartarlo.');
  } else if (opciones.length) {
    L.push('', 'Responde **sí 1** (o **sí 1 3** para varios códigos) para guardar con esos códigos, **sí** para guardar el diagnóstico sin código, **cancelar** para descartarlo, o sigue dictando para agregar.');
  } else {
    L.push('', 'Responde **sí** para guardarlo en su expediente, **cancelar** para descartarlo, o sigue dictando para agregar.');
  }
  return L.join('\n');
}

async function guardarPendiente(chatId, pacienteRecordId, codigoPaciente, dictado) {
  const existente = await airtableGet(PENDIENTES_TABLE_ID, `{Chat ID} = "${chatId}"`);
  const body = {
    fields: {
      'Chat ID': String(chatId),
      'Paciente': [pacienteRecordId],
      'Código de paciente': codigoPaciente,
      'Ficha JSON': dictado ? JSON.stringify({ v: VERSION_PENDIENTE, ...dictado }) : '',
      'Fecha': new Date().toISOString(),
    },
  };
  const url = existente
    ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PENDIENTES_TABLE_ID}/${existente.id}`
    : `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PENDIENTES_TABLE_ID}`;
  const r = await fetch(url, {
    method: existente ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Sin pendiente guardado, un "sí" después no tendría qué guardar: se avisa.
  if (!r.ok) throw new Error(`Airtable respondió ${r.status} al guardar el dictado pendiente`);
}

async function obtenerPendiente(chatId) {
  return airtableGet(PENDIENTES_TABLE_ID, `{Chat ID} = "${chatId}"`);
}

// Se limpia TODO (dictado y paciente): antes quedaba el código del paciente
// y cualquier mensaje posterior del médico se tomaba como dictado para él.
async function borrarPendiente(recordId) {
  const r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PENDIENTES_TABLE_ID}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Ficha JSON': '', 'Código de paciente': '', 'Paciente': [] } }),
  });
  return r.ok;
}

// Puerta del dictado por Telegram — las mismas reglas que el portal
// (CLAUDE.md §4). Antes bastaba el código CC-PAC- para dictar y guardar en
// el expediente de CUALQUIER paciente. Ahora: Tipo de acceso=Clinico y
// autorizarPaciente() con escritura (propio, vinculado o interconsulta con
// escritura; demo nunca). Un fallo de Airtable se relanza (el catch del
// webhook avisa "problema temporal"); nunca se lee como "no autorizado".
// Devuelve { pacienteRecord } o { mensaje } para responderle al médico.
async function autorizarDictadoTelegram(medico, codigoPaciente) {
  const codigoMedico = medico.fields[CAMPO_CODIGO];
  const acceso = await verificarAccesoClinicoMedico(codigoMedico, AIRTABLE_TOKEN);
  if (acceso.errorInfra) throw new Error('No se pudo verificar el Tipo de acceso del médico.');
  if (!acceso.permitido) {
    await registrarAccesoExpediente({ pacienteCode: codigoPaciente, codigoMedico, medicoRecId: acceso.recordId, accion: 'Escritura', resultado: 'Denegado', endpoint: 'telegram:dictado' });
    return { mensaje: 'Tu tipo de acceso no permite escribir en expedientes clínicos.' };
  }
  try {
    await autorizarPaciente(codigoMedico, codigoPaciente, { requiereEscritura: true });
  } catch (err) {
    if (err instanceof ErrorAutorizacion) {
      await registrarAccesoExpediente({ pacienteCode: codigoPaciente, codigoMedico, accion: 'Escritura', resultado: 'Rechazado', endpoint: 'telegram:dictado' });
      // Mismo mensaje para "no existe" y "no es tuyo": no reabrir la enumeración.
      return { mensaje: `No tienes acceso de escritura al paciente ${codigoPaciente} (o no existe). No se guardó nada.` };
    }
    throw err;
  }
  const pacienteRecord = await buscarPacientePorCodigo(codigoPaciente);
  if (!pacienteRecord) throw new Error(`Paciente ${codigoPaciente} autorizado pero no releído.`);
  return { pacienteRecord };
}

// Reparte lo confirmado en CONSULTAS / HISTORIA CLÍNICA / PACIENTES, con el
// mismo criterio que "Guardar consulta" del portal. Cuenta lo confirmado por
// Airtable (CLAUDE.md §6): si la consulta no se crea, se lanza y el médico lo
// sabe; si la consulta se creó pero otra parte falla, se devuelve qué faltó.
// elegidos: opciones CIE-10 que el médico eligió con "sí 1 3" (o []).
async function guardarDictadoEnExpediente(pacienteRecord, dictado, medico, elegidos = []) {
  // Falla ruidosa, no escritura parcial: una CONSULTA sin Paciente enlazado
  // queda huérfana del expediente para siempre.
  if (!pacienteRecord || !pacienteRecord.id) {
    throw new Error('guardarDictadoEnExpediente: pacienteRecord.id no disponible — no se crea la consulta sin paciente enlazado.');
  }
  const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
  const pacId = pacienteRecord.fields['Código de paciente'];
  const c = dictado.resultado.campos || {};

  const vitalesExtra = [];
  if (c.frecuencia_cardiaca) vitalesExtra.push(`FC: ${c.frecuencia_cardiaca} lpm`);
  if (c.frecuencia_respiratoria) vitalesExtra.push(`FR: ${c.frecuencia_respiratoria} rpm`);
  if (c.saturacion_oxigeno) vitalesExtra.push(`SatO2: ${c.saturacion_oxigeno}%`);
  if (c.circunferencia_cintura) vitalesExtra.push(`Cintura: ${c.circunferencia_cintura} cm`);

  // El grupo sanguíneo no cambia: si el expediente ya tiene otro, uno de los
  // dos está mal y no se resuelve sobrescribiendo — se avisa y la bitácora lo
  // dice (no queda como "colocado").
  const grupoPrevio = pacienteRecord.fields['Grupo sanguíneo'];
  const grupoEnConflicto = !!(c.grupo_sanguineo && grupoPrevio && grupoPrevio !== c.grupo_sanguineo);
  const detalle = (dictado.resultado.detalle || []).map((x) => (x.campo === 'grupo_sanguineo' && grupoEnConflicto
    ? `${x.etiqueta}: dictado «${x.cita}» — NO aplicado, el expediente ya dice ${grupoPrevio}`
    : `${x.etiqueta}: colocado por NOVA desde «${x.cita}»`));
  if (elegidos.length) detalle.push(`CIE-10: sugerido por NOVA (verificado en el catálogo) y elegido por el médico: ${elegidos.map((e) => e.codigo).join(', ')}.`);
  detalle.push('Revisado y confirmado por el médico en Telegram ("sí"), sin edición campo por campo.');

  const consultaFields = {
    'Código de paciente ref': pacId,
    'Paciente': [pacienteRecord.id],
    'Médico': medico.fields[CAMPO_NOMBRE] || 'Médico',
    'Código de médico ref': medico.fields[CAMPO_CODIGO] || '—',
    'Firma / Cédula médico': (medico.fields[CAMPO_NOMBRE] || 'Médico') + (medico.fields[CAMPO_CEDULA] ? ' — Céd. ' + medico.fields[CAMPO_CEDULA] : ''),
    'Fecha de consulta': new Date().toISOString().split('T')[0],
    'Peso en consulta (kg)': c.peso ?? undefined,
    'Talla en consulta (cm)': c.talla ?? undefined,
    'Presión arterial en consulta': c.presion || undefined,
    'Temperatura en consulta (°C)': c.temperatura ?? undefined,
    'Motivo de consulta': c.motivo_consulta || undefined,
    'Exploración física': c.exploracion_fisica || undefined,
    'Diagnóstico (CIE-10)': (elegidos.length ? integrarCodigosEnDiagnostico(c.diagnostico, elegidos) : c.diagnostico) || undefined,
    'Plan terapéutico': c.plan_terapeutico || undefined,
    'Origen del registro': 'Dictado NOVA — Telegram',
    'Método': 'Texto',
    'Transcripción dictada': dictado.transcripcion,
    'Detalle del dictado': detalle.join('\n'),
  };
  if (vitalesExtra.length > 0) consultaFields['Signos vitales'] = vitalesExtra.join(' · ');
  Object.keys(consultaFields).forEach((k) => consultaFields[k] === undefined && delete consultaFields[k]);

  const consultaRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CONSULTAS_TABLE_ID}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ typecast: true, records: [{ fields: consultaFields }] }),
  });
  if (!consultaRes.ok) throw new Error(`Airtable respondió ${consultaRes.status} al crear la consulta`);
  const consultaData = await consultaRes.json();
  const consultaId = consultaData.records && consultaData.records[0] && consultaData.records[0].id;
  if (!consultaId) throw new Error('Airtable no devolvió la consulta creada');

  const falto = [];

  // Antecedentes: se AGREGAN a lo que ya había (renglón nuevo), nunca se
  // reemplaza lo que otro médico o el paciente ya registraron.
  const historiaNueva = {
    'AHF — Heredo-familiares': c.antecedentes_heredofamiliares,
    'APP — Enfermedades previas': c.antecedentes_personales_patologicos,
    'Antecedentes quirúrgicos': c.antecedentes_quirurgicos,
    'AGO — Ginecobstétrico': c.antecedentes_ginecoobstetricos,
    'Medicamentos actuales': c.medicamentos_actuales,
    'Alergias': c.alergias,
    'APNP — Alimentación': c.habitos_estilo_vida,
  };
  Object.keys(historiaNueva).forEach((k) => !historiaNueva[k] && delete historiaNueva[k]);
  if (Object.keys(historiaNueva).length > 0) {
    try {
      const existente = await airtableGet(HISTORIA_TABLE_ID, `{Código de paciente ref} = "${pacId}"`);
      let r;
      if (existente) {
        const fields = {};
        for (const [k, v] of Object.entries(historiaNueva)) {
          const prev = String(existente.fields[k] || '').trim();
          fields[k] = !prev ? v : prev.includes(v) ? prev : `${prev}\n${v}`;
        }
        r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${HISTORIA_TABLE_ID}/${existente.id}`, {
          method: 'PATCH', headers, body: JSON.stringify({ typecast: true, fields }),
        });
      } else {
        r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${HISTORIA_TABLE_ID}`, {
          method: 'POST', headers,
          body: JSON.stringify({ typecast: true, records: [{ fields: { ...historiaNueva, 'Código de paciente ref': pacId, 'Paciente': [pacienteRecord.id], 'Fecha entrevista NOVA': new Date().toISOString() } }] }),
        });
      }
      if (!r.ok) throw new Error(`Airtable respondió ${r.status}`);
    } catch (err) {
      console.error('[telegram-bot] historia clínica no guardada:', err.message);
      falto.push(`antecedentes en Historia Clínica (${Object.keys(historiaNueva).join(', ')})`);
    }
  }

  const avisos = [];
  const pacienteFields = {};
  if (c.estado_civil) pacienteFields['Estado civil'] = c.estado_civil;
  if (c.ocupacion) pacienteFields['Ocupación'] = c.ocupacion;
  if (c.escolaridad) pacienteFields['Escolaridad'] = c.escolaridad;
  if (c.grupo_sanguineo && !grupoPrevio) pacienteFields['Grupo sanguíneo'] = c.grupo_sanguineo;
  if (grupoEnConflicto) avisos.push(`No cambié el grupo sanguíneo: el expediente dice ${grupoPrevio} y dictaste ${c.grupo_sanguineo}. Verifícalo y corrígelo desde el portal.`);
  if (Object.keys(pacienteFields).length > 0) {
    try {
      const r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PACIENTES_TABLE_ID}/${pacienteRecord.id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ typecast: true, fields: pacienteFields }),
      });
      if (!r.ok) throw new Error(`Airtable respondió ${r.status}`);
    } catch (err) {
      console.error('[telegram-bot] datos del paciente no guardados:', err.message);
      falto.push(`datos del paciente (${Object.keys(pacienteFields).join(', ')})`);
    }
  }
  return { consultaId, falto, avisos };
}

async function buscarMedicoPorCodigo(codigo) {
  return airtableGet(MEDICOS_TABLE_ID, `{${CAMPO_CODIGO}} = "${codigo}"`);
}

async function buscarMedicoPorChatId(chatId) {
  return airtableGet(MEDICOS_TABLE_ID, `{${CAMPO_CHAT_ID}} = "${chatId}"`);
}

async function vincularChatId(recordId, chatId) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}/${recordId}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [CAMPO_CHAT_ID]: String(chatId) } }),
  });
  // "Cuenta vinculada" solo si de verdad quedó guardada.
  if (!r.ok) throw new Error(`Airtable respondió ${r.status} al vincular Telegram`);
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
  // Sin la lectura previa no se escribe: antes un fallo se tomaba como "no
  // había respuestas pendientes" y el PATCH borraba las anteriores.
  if (!pacRes.ok) throw new Error(`Airtable respondió ${pacRes.status} al leer el paciente`);
  const pacData = await pacRes.json();
  const previa = pacData.fields?.['Respuesta médico pendiente'] || '';
  const fechaHoy = new Date().toISOString().slice(0, 10);
  const nuevaRespuesta = (previa ? previa + '\n' : '') + `[${fechaHoy}] ${textoRespuesta.trim()}`;

  const guardadoRes = await fetch(pacUrl, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Respuesta médico pendiente': nuevaRespuesta } }),
  });
  // El hilo solo se marca respondido si la respuesta quedó guardada; si no,
  // el médico recibiría "Respuesta enviada" y el paciente nunca la vería.
  if (!guardadoRes.ok) throw new Error(`Airtable respondió ${guardadoRes.status} al guardar la respuesta`);

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
  // CONGELAMIENTO 2026-08-24 (instrucción legal): vincula el mensaje a un
  // paciente identificado (Paciente + Pregunta del paciente) — se verifica
  // aquí mismo, no solo en el llamador (hoy únicamente api/nova.js, ya
  // congelado), para que esta escritura nunca dependa de que otro lugar
  // recuerde congelarla primero. Ver lib/congelamientoDatosPersonales.js.
  if (CONGELADO) return;
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

/**
 * Procesa el toque de un botón "✅ Autorizar" / "❌ Rechazar" sobre una
 * solicitud de afiliación. Antes, el aviso de Telegram era solo informativo
 * ("da de alta manualmente en Airtable") y escribir "sí procede" no hacía
 * absolutamente nada — el bot respondía con su mensaje genérico de ayuda.
 * Ahora es un solo toque: autorizar genera el código CCMED- automáticamente
 * (iniciales del nombre + secuencial, ej. "Carlos Gabriel Terrazas" ->
 * CCMED-CGT01) y crea el registro real en MÉDICOS.
 */
async function manejarCallbackQuery(callbackQuery, res) {
  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const textoOriginal = callbackQuery.message.text || '';

  // Solo los médicos maestros (Víctor y Dr. Juan Carlos) pueden tocar estos
  // botones — se verifica que el chat_id que tocó ya esté vinculado a un
  // médico con "Es médico maestro" activo (permiso admin, no visibilidad).
  const esMaestro = await verificarEsMedicoMaestro(chatId);
  if (!esMaestro) {
    await answerCallbackQuery(callbackQuery.id, 'No tienes permiso para esta acción.');
    return res.status(200).json({ ok: true });
  }

  const [accion, solicitudId] = data.split(':');
  if (!solicitudId || (accion !== 'autorizar_solicitud' && accion !== 'rechazar_solicitud')) {
    await answerCallbackQuery(callbackQuery.id);
    return res.status(200).json({ ok: true });
  }

  try {
    const solRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SOLICITUDES_TABLE_ID}/${solicitudId}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    const solData = await solRes.json();
    if (!solRes.ok || !solData.fields) {
      await answerCallbackQuery(callbackQuery.id, 'No se encontró la solicitud (¿ya se borró?).');
      return res.status(200).json({ ok: true });
    }

    // Evita procesar dos veces la misma solicitud si alguien vuelve a tocar
    // el botón antes de que Telegram termine de quitarlo de pantalla.
    if (solData.fields['Estado'] && solData.fields['Estado'] !== 'Pendiente') {
      await answerCallbackQuery(callbackQuery.id, `Esta solicitud ya fue ${solData.fields['Estado'].toLowerCase()}.`);
      return res.status(200).json({ ok: true });
    }

    if (accion === 'rechazar_solicitud') {
      await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SOLICITUDES_TABLE_ID}/${solicitudId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ typecast: true, fields: { 'Estado': 'Rechazada' } }),
      });
      await answerCallbackQuery(callbackQuery.id, 'Solicitud rechazada.');
      await editarMensaje(chatId, messageId, textoOriginal + '\n\n❌ RECHAZADA');
      return res.status(200).json({ ok: true });
    }

    // CONGELAMIENTO 2026-08-24 (instrucción legal): esta rama crea el
    // registro nuevo en MÉDICOS (última etapa del pipeline de registro de
    // médicos, después de unete.html/code-cells-network → nueva-solicitud-
    // medico.js). "Rechazar" no captura datos nuevos — se deja funcionando.
    // Ver lib/congelamientoDatosPersonales.js. Área 'afiliacion'.
    if (congelado('afiliacion')) {
      await answerCallbackQuery(callbackQuery.id, 'Registro de médicos pausado temporalmente (actualización del aviso de privacidad).');
      await editarMensaje(chatId, messageId, textoOriginal + '\n\n⏸️ Pausado — registro de médicos nuevos suspendido temporalmente por actualización del aviso de privacidad. Esta solicitud sigue pendiente.');
      return res.status(200).json({ ok: true });
    }

    // ── Autorizar: generar código, crear médico, marcar solicitud ──
    const nombreCompleto = solData.fields['Nombre completo'] || 'Médico';
    const codigoNuevo = await generarCodigoPorIniciales({
      AIRTABLE_TOKEN, BASE_ID: AIRTABLE_BASE_ID, TABLE_ID: MEDICOS_TABLE_ID,
      CAMPO: CAMPO_CODIGO, PREFIJO: 'CCMED-', nombreCompleto,
    });

    const medicoFields = {
      'Nombre completo': nombreCompleto,
      'Especialidad': solData.fields['Especialidad'] || '',
      'Cédula profesional': solData.fields['Cédula profesional'] || '',
      'Ciudad': solData.fields['Ciudad'] || '',
      'Teléfono': solData.fields['WhatsApp'] || '',
      'Correo': solData.fields['Email'] || '',
      'Código de médico': codigoNuevo,
      'Activo': true,
      'Fecha de ingreso': new Date().toISOString().split('T')[0],
    };

    const crearRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ typecast: true, records: [{ fields: medicoFields }] }),
    });
    if (!crearRes.ok) {
      const errTxt = await crearRes.text();
      console.error('[telegram-bot] error creando médico:', errTxt);
      await answerCallbackQuery(callbackQuery.id, 'Error al crear el médico — revisa los logs.');
      return res.status(200).json({ ok: true });
    }

    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SOLICITUDES_TABLE_ID}/${solicitudId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ typecast: true, fields: { 'Estado': 'Aprobada' } }),
    });

    await answerCallbackQuery(callbackQuery.id, `Autorizado — ${codigoNuevo}`);
    await editarMensaje(chatId, messageId, textoOriginal + `\n\n✅ AUTORIZADO — Código: ${codigoNuevo}\n(Aún debe vincular su Telegram: buscar @Drvirnbot, /start, enviar su código.)`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[telegram-bot] error en manejarCallbackQuery:', err.message);
    await answerCallbackQuery(callbackQuery.id, 'Error interno, revisa los logs.').catch(() => {});
    return res.status(200).json({ ok: true });
  }
}

async function verificarEsMedicoMaestro(chatId) {
  const formula = `{Telegram Chat ID}="${chatId}"`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${MEDICOS_TABLE_ID}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  const rec = data.records && data.records[0];
  // 'Es médico maestro' es el permiso admin (autoriza solicitudes). Se lee el
  // nombre nuevo y el viejo durante la transición del rename del campo.
  return !!(rec && (rec.fields['Es médico maestro'] === true || rec.fields['Ver todos los pacientes'] === true));
}

const SOLICITUDES_TABLE_ID = 'tblDpqi2XJqoR4QiE';

module.exports = async (req, res) => {
  // Solo Preview: registra el webhook del bot de PRUEBA hacia esta rama. Se
  // llama una vez (detrás de Vercel Authentication). Exige que el bot del
  // token sea exactamente el nombrado en TELEGRAM_BOT_PRUEBA: así nunca se
  // puede desviar por error el bot real de producción hacia Preview.
  if (req.method === 'GET' && req.query && req.query.accion === 'registrar_webhook') {
    if (process.env.VERCEL_ENV !== 'preview' || !process.env.TELEGRAM_BOT_PRUEBA) {
      return res.status(403).json({ error: 'Solo disponible en Preview con bot de prueba.' });
    }
    const api = `https://api.telegram.org/bot${require('../lib/telegram').TOKEN_BOT}`;
    const yo = await fetch(`${api}/getMe`).then(r => r.json()).catch(() => ({}));
    const usuario = yo && yo.result && yo.result.username;
    if (!usuario || usuario.toLowerCase() !== String(process.env.TELEGRAM_BOT_PRUEBA).replace(/^@/, '').toLowerCase()) {
      return res.status(409).json({ error: `El token de esta rama es del bot @${usuario || '?'}, no del bot de prueba esperado (${process.env.TELEGRAM_BOT_PRUEBA}). No se registró nada.` });
    }
    if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
      return res.status(409).json({ error: 'Falta "Protection Bypass for Automation" en Vercel (Settings → Deployment Protection). Sin él, Telegram no puede entrar a Preview.' });
    }
    const destino = `https://${process.env.VERCEL_BRANCH_URL}/api/telegram-bot?x-vercel-protection-bypass=${encodeURIComponent(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)}`;
    const r = await fetch(`${api}/setWebhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: destino, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }),
    }).then(x => x.json()).catch(e => ({ ok: false, description: e.message }));
    return res.status(r.ok ? 200 : 502).json({ ok: !!r.ok, bot: '@' + usuario, webhook: `https://${process.env.VERCEL_BRANCH_URL}/api/telegram-bot`, detalle: r.description || null });
  }

  if (req.method !== 'POST') {
    return res.status(200).send('CODE CELLS™ Telegram bot activo.');
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

  // ── Update real de Telegram — valida el secret token del webhook ────
  // Telegram incluye X-Telegram-Bot-Api-Secret-Token en cada request cuando
  // el webhook se registra con secret_token (setWebhook). Sin esta
  // verificación, cualquiera que adivine la URL puede simular un update y
  // resolver identidad de médico por chat.id sin más autenticación. 401
  // (no 403): es un problema de autenticación, no de rol. El secret vive
  // solo en la variable de entorno TELEGRAM_WEBHOOK_SECRET de Vercel.
  const secretWebhook = req.headers['x-telegram-bot-api-secret-token'];
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secretWebhook !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const update = req.body;

    // ── Toque de botón (Autorizar/Rechazar solicitud de afiliación) ──────
    if (update.callback_query) {
      // Botones de la agenda ("ag:…"): son del propio médico, no requieren ser maestro.
      if (await manejarBotonAgenda(update.callback_query)) return res.status(200).json({ ok: true });
      return await manejarCallbackQuery(update.callback_query, res);
    }

    const message = update.message;

    // Notas de voz: aún no se transcriben en servidor (falta que el abogado
    // apruebe un proveedor). Al médico vinculado se le dice qué hacer en vez
    // de ignorarlo en silencio.
    if (message && !message.text && (message.voice || message.audio)) {
      if (await esDuplicado(message.chat.id, update.update_id)) return res.status(200).json({ ok: true });
      const medicoVoz = await buscarMedicoPorChatId(message.chat.id);
      if (medicoVoz) {
        await sendTelegramMessage(message.chat.id, 'Todavía no proceso notas de voz. Usa el micrófono del teclado de tu celular para dictar: me llega como texto y lo estructuro igual.');
      }
      return res.status(200).json({ ok: true });
    }

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
        'Hola, soy el bot de notificaciones y apoyo clínico de CODE CELLS™ Red Médica.\n\n' +
          'Para vincular tu cuenta, envíame tu código de médico (formato CCMED-XXXXXX).\n\n' +
          'Una vez vinculado:\n' +
          '• Escribe /agenda → configura tu horario para que NOVA agende tus citas sola.\n' +
          '• Escribe "plan" + datos del paciente → plan nutricional de 7 días.\n' +
          '• Escribe el código del paciente (CC-PAC-XXXXXX) + tu dictado, en el orden que quieras → te digo campo por campo qué entendí. Puedes seguir dictando para agregar; "sí" lo guarda en su expediente y "cancelar" lo descarta.'
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
          `No encontré el código ${codigo} en la Red CODE CELLS™. Verifica que esté bien escrito o contacta a Víctor.`
        );
        return res.status(200).json({ ok: true });
      }

      // Hallazgo 2026-10-24: bastaba mandar el código de OTRO médico para
      // quedarse con su vínculo (se reemplazaba sin preguntar) y actuar como él
      // ante el bot. Un vínculo existente ya no se reemplaza desde aquí, y un
      // chat no se vincula a dos médicos. Cambiar de teléfono → administración.
      const chatActual = medico.fields[CAMPO_CHAT_ID] ? String(medico.fields[CAMPO_CHAT_ID]) : '';
      if (chatActual === String(chatId)) {
        await sendTelegramMessage(chatId, 'Tu cuenta ya estaba vinculada a este Telegram.');
        return res.status(200).json({ ok: true });
      }
      if (chatActual) {
        console.warn(`[telegram-bot] intento de vincular ${codigo}, que ya tiene otro Telegram; se rechazó.`);
        await sendTelegramMessage(chatId, 'Ese código ya está vinculado a otra cuenta de Telegram. Si cambiaste de teléfono, pide a administración de CODE CELLS™ que lo desvincule.');
        return res.status(200).json({ ok: true });
      }
      const yaVinculado = await buscarMedicoPorChatId(chatId);
      if (yaVinculado && yaVinculado.id !== medico.id) {
        await sendTelegramMessage(chatId, 'Este Telegram ya está vinculado a otro código de médico. Un Telegram solo puede pertenecer a un médico.');
        return res.status(200).json({ ok: true });
      }

      try {
        await vincularChatId(medico.id, chatId);
      } catch (e) {
        console.error('[telegram-bot] vincular:', e.message);
        await sendTelegramMessage(chatId, 'No pude guardar la vinculación por un problema temporal. Envía tu código de nuevo en unos minutos.');
        return res.status(200).json({ ok: true });
      }

      const nombre = medico.fields[CAMPO_NOMBRE] || 'Doctor(a)';
      await sendTelegramMessage(
        chatId,
        `Cuenta vinculada correctamente, ${nombre}.\n\nA partir de ahora recibirás aquí tus notificaciones de CODE CELLS™ (certificaciones, recordatorios del Diplomado, avisos de NOVA).\n\nPara generar un plan nutricional, escribe "plan" seguido de los datos del paciente. Para dictar un expediente, escribe el código del paciente (CC-PAC-XXXXXX) seguido de lo que quieras registrar.`
      );
      return res.status(200).json({ ok: true });
    }

    // Cualquier otro mensaje: ¿el médico ya está vinculado?
    const medicoVinculado = await buscarMedicoPorChatId(chatId);

    if (!medicoVinculado) {
      await sendTelegramMessage(
        chatId,
        'Este bot es exclusivo para médicos de la Red CODE CELLS™. Si aún no vinculaste tu cuenta, envíame tu código CCMED-XXXXXX.'
      );
      return res.status(200).json({ ok: true });
    }

    // Médico vinculado y el mensaje no es un comando de vinculación:
    // primero revisar si es una RESPUESTA (reply de Telegram) a una alerta
    // de paciente — en ese caso, entregar la respuesta y NO generar plan.
    if (message.reply_to_message) {
      const hilo = await buscarHiloPaciente(chatId, message.reply_to_message.message_id);
      if (hilo) {
        // CONGELAMIENTO 2026-08-24 (instrucción legal): entregarRespuestaAlPaciente
        // escribe contenido nuevo al expediente del paciente (Respuesta médico
        // pendiente). Ver lib/congelamientoDatosPersonales.js.
        if (CONGELADO) {
          await sendTelegramMessage(
            chatId,
            'Estamos actualizando nuestro aviso de privacidad y políticas de datos. La entrega de respuestas al paciente no está disponible temporalmente.'
          );
          return res.status(200).json({ ok: true });
        }
        const nombrePaciente = await entregarRespuestaAlPaciente(hilo, texto);
        await sendTelegramMessage(
          chatId,
          `Respuesta enviada. Se le mostrará a ${nombrePaciente} en su próxima conversación con NOVA.`
        );
        return res.status(200).json({ ok: true });
      }
    }

    // ── Dictado de expediente (SPEC dictado, Fase 3) ─────────────────────
    // Dictado libre: el código del paciente identifica a quién va (nunca se
    // adivina por nombre); "sí" guarda, "cancelar" descarta, cualquier otro
    // texto mientras hay un dictado pendiente se AGREGA y se re-estructura.
    // "sí", o "sí 1 3" / "sí 1, 3" / "sí 1 y 3" para elegir códigos CIE-10.
    const mConfirmacion = texto.match(/^(?:s[ií]|confirmar|guardar|correcto|ok|dale)(?:[\s,.:]+((?:\d{1,2}(?:\s*(?:,|y|\s)\s*)?)+))?\s*[.!]?$/i);
    const esConfirmacion = !!mConfirmacion;
    const numerosElegidos = mConfirmacion && mConfirmacion[1] ? [...new Set(mConfirmacion[1].match(/\d+/g).map(Number))] : [];
    const esCancelacion = /^(cancelar|cancela|descartar|desc[aá]rtalo|borrar|no)\.?!?$/i.test(texto);
    const matchPaciente = texto.match(/CC-PAC-[0-9]{4,8}/i);
    const esComandoConsulta = /^\/consulta\b/i.test(texto);
    const esComandoPlan = /^\/?plan\b/i.test(texto);
    const pendiente = await obtenerPendiente(chatId);
    const conDictado = pendiente && pendiente.fields['Ficha JSON'] ? pendiente : null;
    const esperando = pendiente && pendiente.fields['Código de paciente'] && !pendiente.fields['Ficha JSON'] ? pendiente : null;

    if ((conDictado || esperando) && esCancelacion) {
      const borrado = await borrarPendiente((conDictado || esperando).id);
      await sendTelegramMessage(chatId, borrado
        ? 'Descartado. No se guardó nada en el expediente.'
        : 'No pude descartar el dictado pendiente (problema temporal). No se ha guardado nada; escribe "cancelar" de nuevo.');
      return res.status(200).json({ ok: true });
    }

    if (conDictado && esConfirmacion) {
      // CONGELAMIENTO 2026-08-24 (instrucción legal): guardar escribe datos
      // clínicos permanentes. Ver lib/congelamientoDatosPersonales.js.
      if (CONGELADO) {
        await sendTelegramMessage(
          chatId,
          'Estamos actualizando nuestro aviso de privacidad y políticas de datos. El registro de nueva información clínica no está disponible temporalmente. Tu dictado sigue pendiente de confirmar cuando se reactive.'
        );
        return res.status(200).json({ ok: true });
      }
      const codigoPend = conDictado.fields['Código de paciente'];
      let pendienteRetirado = false;
      let d = null;
      try {
        // Se vuelve a autorizar al confirmar: el acceso pudo cambiar entre
        // el dictado y el "sí".
        const puerta = await autorizarDictadoTelegram(medicoVinculado, codigoPend);
        if (puerta.mensaje) {
          await sendTelegramMessage(chatId, puerta.mensaje);
          return res.status(200).json({ ok: true });
        }
        d = leerDictadoPendiente(conDictado);
        if (!d || d.invalido) {
          await borrarPendiente(conDictado.id);
          await sendTelegramMessage(chatId, d && d.invalido === 'vencido'
            ? `Ese dictado lleva más de ${HORAS_VIGENCIA_PENDIENTE} horas sin confirmar; por seguridad no lo guardo. Díctalo de nuevo.`
            : 'Ese dictado se tomó con una versión anterior del bot; por seguridad no lo guardo. Díctalo de nuevo.');
          return res.status(200).json({ ok: true });
        }
        if (!Object.keys(d.resultado.campos || {}).length) {
          await sendTelegramMessage(chatId, 'Ese dictado no tiene datos que guardar. Sigue dictando o escribe "cancelar".');
          return res.status(200).json({ ok: true });
        }
        // Códigos elegidos: solo números de la lista mostrada; uno que no
        // existe no se adivina — no se guarda nada y se pide de nuevo.
        const opciones = (d.resultado.cie10 && d.resultado.cie10.opciones) || [];
        const invalidos = numerosElegidos.filter((n) => !opciones.some((o) => o.n === n));
        if (invalidos.length) {
          await sendTelegramMessage(chatId, opciones.length
            ? `No hay opción ${invalidos.join(', ')} en la lista de CIE-10 (van del 1 al ${opciones.length}). No guardé nada; responde de nuevo, p. ej. "sí 1".`
            : 'Este dictado no tiene códigos CIE-10 sugeridos para elegir. Responde "sí" para guardarlo sin código.');
          return res.status(200).json({ ok: true });
        }
        const elegidos = numerosElegidos.map((n) => opciones.find((o) => o.n === n));
        // Primero se retira el pendiente: si no se puede, NO se guarda (un
        // segundo "sí" duplicaría la consulta).
        if (!(await borrarPendiente(conDictado.id))) {
          await sendTelegramMessage(chatId, 'No se guardó: tuve un problema temporal con el dictado pendiente. Escribe "sí" de nuevo en un momento.');
          return res.status(200).json({ ok: true });
        }
        pendienteRetirado = true;
        const pacienteRecord = puerta.pacienteRecord;
        const { falto, avisos } = await guardarDictadoEnExpediente(pacienteRecord, d, medicoVinculado, elegidos);
        let msg = `Consulta guardada en el expediente de ${pacienteRecord.fields['Nombre completo'] || codigoPend}. ✅`;
        if (elegidos.length) msg += `\nDiagnóstico: ${integrarCodigosEnDiagnostico((d.resultado.campos || {}).diagnostico, elegidos)}`;
        if (falto.length) msg += `\n\n⚠️ Pero NO se guardó: ${falto.join('; ')}. Captúralo desde el portal.`;
        avisos.forEach((a) => { msg += `\n\n⚠️ ${a}`; });
        if (d.resultado.receta) msg += '\n\nLa receta no se emitió: emítela desde el portal (botón Receta).';
        await sendTelegramMessage(chatId, msg);
      } catch (err) {
        console.error('[telegram-bot] error guardando dictado confirmado:', err.message);
        // La consulta no se creó: se repone el pendiente para que "sí" funcione.
        let repuesto = !pendienteRetirado;
        if (pendienteRetirado && d && conDictado.fields['Paciente'] && conDictado.fields['Paciente'][0]) {
          try { await guardarPendiente(chatId, conDictado.fields['Paciente'][0], codigoPend, { transcripcion: d.transcripcion, resultado: d.resultado }); repuesto = true; } catch (e) { /* abajo se avisa */ }
        }
        await sendTelegramMessage(chatId, repuesto
          ? 'No se guardó la consulta (problema temporal con Airtable). Tu dictado sigue pendiente: escribe "sí" de nuevo en un momento.'
          : 'No se guardó la consulta (problema temporal con Airtable) y no pude conservar el dictado. Tu texto sigue arriba en este chat: reenvíalo con el código del paciente.');
      }
      return res.status(200).json({ ok: true });
    }

    // "sí" cuando solo se dio el código y aún no hay nada dictado: no hay qué
    // guardar ni qué estructurar (antes se mandaba "sí" al modelo como dictado).
    if (esperando && esConfirmacion) {
      await sendTelegramMessage(chatId, `Aún no me has dictado nada para ${esperando.fields['Código de paciente']}. Dicta lo que quieras registrar, o escribe "cancelar".`);
      return res.status(200).json({ ok: true });
    }

    const agregaAlPendiente = conDictado && !matchPaciente && !esComandoConsulta && !esComandoPlan && !esConfirmacion;

    if (matchPaciente || esComandoConsulta || esperando || agregaAlPendiente) {
      // CONGELAMIENTO 2026-08-24 (instrucción legal): este flujo estructura y
      // guarda como pendiente datos clínicos de un paciente identificado.
      if (CONGELADO) {
        await sendTelegramMessage(
          chatId,
          'Estamos actualizando nuestro aviso de privacidad y políticas de datos. El dictado de expediente no está disponible temporalmente.'
        );
        return res.status(200).json({ ok: true });
      }
      const codigoPaciente = matchPaciente
        ? matchPaciente[0].toUpperCase()
        : pendiente && pendiente.fields['Código de paciente']
          ? pendiente.fields['Código de paciente']
          : null;

      if (!codigoPaciente) {
        await sendTelegramMessage(chatId, 'Necesito el código del paciente (formato CC-PAC-XXXXXX) para saber a quién va el dictado.');
        return res.status(200).json({ ok: true });
      }

      const puerta = await autorizarDictadoTelegram(medicoVinculado, codigoPaciente);
      if (puerta.mensaje) {
        await sendTelegramMessage(chatId, puerta.mensaje);
        return res.status(200).json({ ok: true });
      }
      const pacienteRecord = puerta.pacienteRecord;
      const nombrePaciente = pacienteRecord.fields['Nombre completo'] || codigoPaciente;

      const dictadoNuevo = matchPaciente || esComandoConsulta
        ? texto.replace(/^\/consulta\b/i, '').replace(new RegExp(codigoPaciente, 'i'), '').replace(/^[:\s-]+/, '').trim()
        : texto.trim();

      // ¿Hay un dictado vigente? Del mismo paciente se continúa; de otro se
      // descarta (y se dice).
      let previo = '';
      let aviso = '';
      if (conDictado) {
        const d = leerDictadoPendiente(conDictado);
        const mismo = conDictado.fields['Código de paciente'] === codigoPaciente;
        if (d && !d.invalido && mismo) previo = d.transcripcion;
        else if (d && !d.invalido) aviso = `(Descarté el dictado sin confirmar de ${conDictado.fields['Código de paciente']}.)\n\n`;
        else aviso = '(El dictado anterior ya no era válido; empiezo uno nuevo.)\n\n';
      }

      if (!dictadoNuevo) {
        if (previo) {
          await sendTelegramMessage(chatId, `Sigues con el dictado de ${nombrePaciente}. Dime qué agregar, "sí" para guardar o "cancelar".`);
          return res.status(200).json({ ok: true });
        }
        await guardarPendiente(chatId, pacienteRecord.id, codigoPaciente, null);
        await sendTelegramMessage(chatId, `${aviso}Encontré a ${nombrePaciente} — dicta lo que quieras registrar, en el orden que quieras.`);
        return res.status(200).json({ ok: true });
      }

      const transcripcion = previo ? `${previo}\n${dictadoNuevo}` : dictadoNuevo;
      await sendTelegramMessage(chatId, previo ? 'Lo agrego al dictado y lo vuelvo a acomodar, un momento...' : 'Acomodando el dictado, un momento...');

      try {
        const r = await estructurarDictado(transcripcion);
        if (!r.ok) {
          await sendTelegramMessage(chatId, r.error);
          return res.status(200).json({ ok: true });
        }
        const resultado = { campos: r.campos, detalle: r.detalle, descartados: r.descartados, sinUbicar: r.sinUbicar, faltantes: r.faltantes, receta: r.receta };
        // CIE-10 sugeridos para el diagnóstico DICTADO (verificados contra el
        // catálogo), numerados para que el médico elija con "sí 1 3". Si falla
        // la sugerencia, se dice y el dictado sigue (se guarda sin código).
        if (r.campos.diagnostico) {
          try {
            const s = await sugerirCie10(String(r.campos.diagnostico));
            if (s.ok) {
              let n = 0;
              const opciones = [];
              for (const g of s.grupos) for (const c of g.candidatos) opciones.push({ n: ++n, codigo: c.codigo, descripcion: c.descripcion, frase: g.frase });
              resultado.cie10 = { opciones };
            } else {
              resultado.cie10 = { opciones: [], error: 'no pude sugerir códigos en este momento.' };
            }
          } catch (errCie) {
            console.error('[telegram-bot] sugerencia CIE-10:', errCie.message);
            resultado.cie10 = { opciones: [], error: 'no pude sugerir códigos en este momento.' };
          }
        }
        await guardarPendiente(chatId, pacienteRecord.id, codigoPaciente, { transcripcion, resultado });
        await sendTelegramMessageChunked(chatId, aviso + mensajeEntendi(nombrePaciente, codigoPaciente, resultado));
      } catch (err) {
        console.error('[telegram-bot] error estructurando dictado:', err.message);
        await sendTelegramMessage(chatId, 'Hubo un error acomodando el dictado; no se guardó nada. Intenta de nuevo.');
      }
      return res.status(200).json({ ok: true });
    }

    // Agenda (etapa 2b): /agenda, /bloqueos, /citas o texto libre del tipo
    // "estaré fuera del 5 al 10 de noviembre". Va después de los flujos de
    // expediente para no robarles un mensaje, y antes del plan nutricional.
    if (!/^\/?plan\b/i.test(texto) && await manejarMensajeAgenda(chatId, texto)) {
      return res.status(200).json({ ok: true });
    }

    // Médico vinculado: solo se genera plan nutricional si el mensaje empieza
    // explícitamente con "plan" o "/plan" — así cualquier otro mensaje suyo
    // (confirmar una cita, comentarios, etc.) no se confunde con esto.
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
        `\n\nNOVA by CODE CELLS™`;

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
    // Antes el médico no recibía nada: su mensaje parecía ignorado. Se le
    // dice que falló y que nada se guardó a medias por este mensaje.
    const chatIdError = req.body && req.body.message && req.body.message.chat && req.body.message.chat.id;
    if (chatIdError) {
      try {
        await sendTelegramMessage(chatIdError, 'No pude procesar tu mensaje por un problema temporal con la base de datos. Intenta de nuevo en un minuto.');
      } catch (e) { console.error('[telegram-bot] no se pudo avisar el error al médico:', e.message); }
    }
    return res.status(200).json({ ok: true }); // Siempre 200 para que Telegram no reintente en loop
  }
};
