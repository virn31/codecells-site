// lib/agenda-telegram.js
// La agenda del médico, por Telegram (etapa 2b, 2026-10-23):
//   /agenda    → cuestionario con botones (o resumen + cambiar / pausar)
//   /bloqueos  → bloqueos próximos, con botón para quitar cada uno
//   /citas     → citas agendadas de los próximos 14 días (solo fecha y hora)
//   texto libre ("NOVA, estaré fuera del 5 al 10 de noviembre") → NOVA lo
//              interpreta, lo repite y SOLO bloquea si el médico toca "Sí".
//
// Por Telegram nunca viajan datos de pacientes: solo fechas y horas.
// El estado entre toques vive en el perfil del directorio ("Agenda — asistente").

const A = require('./agenda');
const W = require('./agenda-asistente');
const C = require('./citas');
const { sendTelegramMessage, answerCallbackQuery, editarMensaje } = require('./telegram');
const { CONGELADO } = require('./congelamientoDatosPersonales');

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const TBL_DIRECTORIO = 'tblkUNPwu1sQgZBPJ';
const TBL_SOLICITUDES = 'tblUsc72JO2BaqT6d';
const MODELO = 'claude-sonnet-5-5';
const AVISO_CONGELADO = 'Estamos actualizando nuestro aviso de privacidad. Los cambios de agenda no están disponibles temporalmente.';

async function at(ruta, opciones = {}) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Airtable respondió ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function leerTodo(tabla, params) {
  const out = [];
  let offset;
  do {
    const p = new URLSearchParams(params);
    p.set('pageSize', '100');
    if (offset) p.set('offset', offset);
    const d = await at(`${tabla}?${p}`);
    out.push(...(d.records || []));
    offset = d.offset;
  } while (offset);
  return out;
}

async function perfilPorChat(chatId) {
  const d = await at(`${TBL_MEDICOS}?${new URLSearchParams({ filterByFormula: `{Telegram Chat ID}="${String(chatId).replace(/"/g, '')}"`, maxRecords: '1' })}`);
  const med = (d.records || [])[0];
  if (!med) return { med: null, perfil: null };
  const perfiles = await leerTodo(TBL_DIRECTORIO, {});
  return { med, perfil: perfiles.find(r => (r.fields['Médico'] || []).includes(med.id)) || null };
}

const guardar = (perfil, fields) => at(`${TBL_DIRECTORIO}/${perfil.id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
const asistenteDe = perfil => A.leerJSON(perfil.fields[A.CAMPOS.ASISTENTE], {}) || {};
const bloqueosDe = perfil => A.leerJSON(perfil.fields[A.CAMPOS.BLOQUEOS], []).filter(b => b && b.desde);
const horarioDe = perfil => {
  const v = A.validarHorarioSemanal(A.leerJSON(perfil.fields[A.CAMPOS.HORARIO], null));
  return v.ok ? v.horario : null;
};

async function citasDelPerfil(perfilId) {
  const estados = A.ESTADOS_QUE_OCUPAN.map(e => `{Estado de cita}="${e}"`).join(',');
  const regs = await leerTodo(TBL_SOLICITUDES, [
    ['filterByFormula', `AND(OR(${estados}), {Horario acordado}!="")`],
    ['fields[]', 'Médico solicitado'], ['fields[]', 'Estado de cita'], ['fields[]', 'Horario acordado'],
  ]);
  return regs.filter(r => (r.fields['Médico solicitado'] || []).includes(perfilId));
}

const SIN_PERFIL = 'Todavía no tienes perfil en el directorio. Créalo en tu portal → "Mi directorio" y luego escríbeme /agenda.';
const AYUDA_BLOQUEO = 'Para que no te agende en ciertas fechas, escríbeme por ejemplo:\n"NOVA, estaré fuera del 5 al 10 de noviembre"\n"El jueves 12 no consulto en la tarde"';

function tecladoResumen(perfil) {
  const activa = perfil.fields[A.CAMPOS.AUTOMATICA] === true;
  return { inline_keyboard: [
    [{ text: '✏️ Cambiar horario', callback_data: 'ag:cfg:nuevo' }],
    [activa ? { text: '⏸ Pausar agenda automática', callback_data: 'ag:auto:0' } : { text: '▶ Activar agenda automática', callback_data: 'ag:auto:1' }],
  ] };
}

function textoResumen(perfil) {
  const h = horarioDe(perfil);
  const activa = perfil.fields[A.CAMPOS.AUTOMATICA] === true;
  return `🗓 Tu agenda (${activa ? 'automática: ACTIVA' : 'automática: PAUSADA — los pacientes envían solicitudes que tú respondes'})\n\n${A.textoHorario(h)}\n\n${AYUDA_BLOQUEO}\n\n/bloqueos para ver o quitar bloqueos · /citas para ver tus próximas citas`;
}

async function iniciarCuestionario(chatId, perfil) {
  const estado = W.inicio();
  const v = W.render(estado);
  const enviado = await sendTelegramMessage(chatId, v.texto, { inline_keyboard: v.teclado });
  estado.msg = enviado && enviado.result && enviado.result.message_id;
  await guardar(perfil, { [A.CAMPOS.ASISTENTE]: JSON.stringify({ ...asistenteDe(perfil), cuestionario: estado }) });
}

// ── Mensajes de texto. Devuelve true si el mensaje era de agenda. ──────
async function manejarMensajeAgenda(chatId, texto) {
  const t = String(texto || '').trim();
  const esAgenda = /^\/?agenda$/i.test(t);
  const esBloqueos = /^\/bloqueos$/i.test(t);
  const esCitas = /^\/citas$/i.test(t);
  if (!esAgenda && !esBloqueos && !esCitas && !W.pareceDeAgenda(t)) return false;

  const { perfil } = await perfilPorChat(chatId);
  if (!perfil) { await sendTelegramMessage(chatId, SIN_PERFIL); return true; }

  if (esAgenda) {
    if (horarioDe(perfil)) await sendTelegramMessage(chatId, textoResumen(perfil), tecladoResumen(perfil));
    else {
      if (CONGELADO) { await sendTelegramMessage(chatId, AVISO_CONGELADO); return true; }
      await iniciarCuestionario(chatId, perfil);
    }
    return true;
  }

  if (esBloqueos) {
    const hoy = C.fechaMexico();
    const prox = bloqueosDe(perfil).filter(b => b.hasta >= hoy).sort((a, b) => a.desde.localeCompare(b.desde));
    if (!prox.length) { await sendTelegramMessage(chatId, 'No tienes bloqueos próximos.\n\n' + AYUDA_BLOQUEO); return true; }
    await sendTelegramMessage(chatId,
      '🚫 Fechas sin citas:\n\n' + prox.map((b, i) => `${i + 1}. ${A.textoBloqueo(b)}${b.nota ? ' — ' + b.nota : ''}`).join('\n') + '\n\nToca uno para quitarlo:',
      { inline_keyboard: prox.map((b, i) => [{ text: `Quitar ${i + 1}`, callback_data: 'ag:qbl:' + b.id }]) });
    return true;
  }

  if (esCitas) {
    const hoy = C.fechaMexico();
    const limite = C.sumarDias(hoy, 14);
    const lista = Object.entries(A.ocupadosPorFecha(await citasDelPerfil(perfil.id)))
      .filter(([f]) => f >= hoy && f <= limite)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([f, horas]) => `• ${A.fechaTexto(f)}: ${horas.sort().map(A.horaCorta).join(', ')}`);
    await sendTelegramMessage(chatId, lista.length
      ? '📋 Tus citas de los próximos 14 días:\n\n' + lista.join('\n') + '\n\nNombres y teléfonos: en tu portal → Mi directorio.'
      : 'No tienes citas agendadas en los próximos 14 días.');
    return true;
  }

  // Texto libre que habla de agenda → NOVA lo interpreta y pide confirmación.
  if (!horarioDe(perfil)) {
    await sendTelegramMessage(chatId, 'Primero configura tu horario: escribe /agenda (son 4 preguntas con botones).');
    return true;
  }
  let r;
  try {
    r = await W.interpretarBloqueo(t, { model: MODELO });
  } catch (e) {
    console.error('[agenda] interpretarBloqueo:', e.message);
    await sendTelegramMessage(chatId, 'No pude leer tu mensaje en este momento (falla de NOVA). No bloqueé nada. Intenta de nuevo en un minuto.');
    return true;
  }
  if (r.noEsBloqueo) return false; // no era de agenda: que siga el flujo normal del bot
  if (!r.ok) { await sendTelegramMessage(chatId, r.duda + '\n\nNo bloqueé nada todavía.'); return true; }

  const enRango = A.citasDentroDeBloqueo(r.bloqueo, await citasDelPerfil(perfil.id), (horarioDe(perfil) || {}).duracion);
  const aviso = enRango.length
    ? `\n\n⚠️ Ya tienes ${enRango.length} cita(s) en esas fechas: ${enRango.map(x => A.fechaTexto(x.slice(0, 10)) + ' ' + A.horaCorta(x.slice(11))).join('; ')}. No las cancelo; avísales tú desde tu portal.`
    : '';
  const enviado = await sendTelegramMessage(chatId,
    `Entendí: NO agendar citas ${A.textoBloqueo(r.bloqueo)}${r.bloqueo.nota ? ' (' + r.bloqueo.nota + ')' : ''}.${aviso}\n\n¿Lo bloqueo?`,
    { inline_keyboard: [[{ text: '✅ Sí, bloquear', callback_data: 'ag:blq:si' }, { text: '✖ No', callback_data: 'ag:blq:no' }]] });
  const msg = enviado && enviado.result && enviado.result.message_id;
  await guardar(perfil, { [A.CAMPOS.ASISTENTE]: JSON.stringify({ ...asistenteDe(perfil), bloqueo: { ...r.bloqueo, msg } }) });
  return true;
}

// ── Botones "ag:…". Devuelve true si el botón era de agenda. ──────────
async function manejarBotonAgenda(cq) {
  const b = W.leerBoton(cq.data);
  if (!b) return false;
  const chatId = cq.message.chat.id;
  const msgId = cq.message.message_id;
  const responder = txt => answerCallbackQuery(cq.id, txt);
  const editar = (txt, teclado) => editarMensaje(chatId, msgId, txt, teclado ? { inline_keyboard: teclado } : undefined);

  const { perfil } = await perfilPorChat(chatId);
  if (!perfil) { await responder('No encontré tu perfil del directorio.'); return true; }
  if (CONGELADO) { await responder(AVISO_CONGELADO.slice(0, 190)); return true; }
  const asis = asistenteDe(perfil);

  if (b.accion === 'cfg') { await responder(); await iniciarCuestionario(chatId, perfil); return true; }

  if (b.accion === 'auto') {
    const activar = b.valor === '1';
    if (activar && !horarioDe(perfil)) { await responder('Primero configura tu horario con /agenda.'); return true; }
    await guardar(perfil, { [A.CAMPOS.AUTOMATICA]: activar });
    perfil.fields[A.CAMPOS.AUTOMATICA] = activar;
    await responder(activar ? 'Agenda automática activada.' : 'Agenda automática en pausa.');
    await editar(textoResumen(perfil), tecladoResumen(perfil).inline_keyboard);
    return true;
  }

  if (b.accion === 'blq') {
    const p = asis.bloqueo;
    if (!p || p.msg !== msgId) { await responder('Ese botón ya no aplica.'); return true; }
    const { bloqueo: _x, ...resto } = asis;
    if (b.valor !== 'si') {
      await guardar(perfil, { [A.CAMPOS.ASISTENTE]: JSON.stringify(resto) });
      await responder('No bloqueé nada.');
      await editar(cq.message.text.replace(/\n\n¿Lo bloqueo\?$/, '') + '\n\n✖ No se bloqueó. Escríbemelo de otra forma si hace falta.');
      return true;
    }
    const v = A.validarBloqueo(p);
    if (!v.ok) { await responder(v.error); return true; }
    const nuevo = { id: Math.random().toString(36).slice(2, 8), ...v.bloqueo, creado: new Date().toISOString(), via: 'telegram' };
    await guardar(perfil, {
      [A.CAMPOS.BLOQUEOS]: JSON.stringify([...bloqueosDe(perfil), nuevo]),
      [A.CAMPOS.ASISTENTE]: JSON.stringify(resto),
    });
    await responder('Bloqueado.');
    await editar(cq.message.text.replace(/\n\n¿Lo bloqueo\?$/, '') + '\n\n✅ Bloqueado. Esos días ya no aparecen para los pacientes. (/bloqueos para quitarlo)');
    return true;
  }

  if (b.accion === 'qbl') {
    const todos = bloqueosDe(perfil);
    const quitado = todos.find(x => x.id === b.valor);
    if (!quitado) { await responder('Ese bloqueo ya no existe.'); return true; }
    await guardar(perfil, { [A.CAMPOS.BLOQUEOS]: JSON.stringify(todos.filter(x => x.id !== b.valor)) });
    await responder('Bloqueo quitado.');
    await sendTelegramMessage(chatId, `✅ Quité el bloqueo ${A.textoBloqueo(quitado)}. Esos espacios vuelven a estar disponibles.`);
    return true;
  }

  // Cuestionario
  const estado = asis.cuestionario;
  if (!estado || estado.msg !== msgId) { await responder('Ese cuestionario ya no está activo. Escribe /agenda.'); return true; }
  const r = W.aplicar(estado, b.accion, b.valor);
  if (!r.ok) { await responder(r.error); return true; }
  const { cuestionario: _c, ...resto } = asis;

  if (r.cancelado) {
    await guardar(perfil, { [A.CAMPOS.ASISTENTE]: JSON.stringify(resto) });
    await responder('Cancelado.');
    await editar('Cuestionario cancelado. ' + (horarioDe(perfil) ? 'Tu horario anterior sigue igual.' : 'No guardé ningún horario.'));
    return true;
  }
  if (r.terminado) {
    await guardar(perfil, {
      [A.CAMPOS.HORARIO]: JSON.stringify(r.horario),
      [A.CAMPOS.AUTOMATICA]: true,
      [A.CAMPOS.ASISTENTE]: JSON.stringify(resto),
    });
    await responder('Agenda guardada.');
    await editar('✅ Agenda guardada y activa.\n\n' + A.textoHorario(r.horario) +
      '\n\nDesde ahora los pacientes ven solo estos espacios y su cita queda confirmada sola; te aviso aquí de cada una.\n\n' + AYUDA_BLOQUEO);
    return true;
  }
  r.estado.msg = msgId;
  await guardar(perfil, { [A.CAMPOS.ASISTENTE]: JSON.stringify({ ...resto, cuestionario: r.estado }) });
  await responder();
  const v = W.render(r.estado);
  await editar(v.texto, v.teclado);
  return true;
}

module.exports = { manejarMensajeAgenda, manejarBotonAgenda };
