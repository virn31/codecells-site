// api/citas.js
// Solicitud de cita desde la ficha pública del médico (etapa 2, 2026-10-22).
//
//   Público (sin sesión):
//     GET  ?accion=disponibilidad&medicoId=rec…&fecha=YYYY-MM-DD
//                              → espacios libres si el médico tiene agenda automática (etapa 2b),
//                                el primer horario libre y la zona horaria del consultorio
//     GET  ?accion=proximos&ids=rec…,rec…  (máx. 50)
//                              → { proximos: { rec…: { fecha, hora } } } para las tarjetas del
//                                directorio; un médico sin agenda o cuya agenda no se pudo leer
//                                simplemente no aparece (la tarjeta no promete nada)
//     POST ?accion=solicitar   → crea la solicitud y devuelve la clave de seguimiento. Con agenda
//                                automática y `hora`, la cita queda Aceptada al momento; sin
//                                agenda, queda Pendiente hasta que el médico responda
//     POST ?accion=estado      → { id, c } estado de SU solicitud (sin teléfono ni motivo).
//                                POST para que la clave no quede en URLs ni bitácoras.
//     POST ?accion=paciente    → { id, c, accion: confirmar | cancelar }
//   Médico (sesión tipo 'medico'):
//     GET  ?accion=mis_solicitudes → solicitudes dirigidas a SU perfil del directorio
//     POST ?accion=responder       → { id, respuesta: aceptar | proponer | rechazar, horario, mensaje }
//
// Reglas: una solicitud nunca se presenta como cita confirmada hasta que el
// médico acepta; el motivo (dato de salud) solo se guarda con consentimiento
// y NUNCA viaja por Telegram (el aviso solo dice que hay una solicitud); un
// fallo de Airtable se responde como fallo (502).

const { verificarToken, tokenDesdeRequest, generarTokenVisitante } = require('../lib/auth');
const { congelado, respuestaCongelada } = require('../lib/congelamientoDatosPersonales');
const CONGELADO = congelado('directorio'); // área descongelable por separado
const { sendTelegramMessage } = require('../lib/telegram');
const C = require('../lib/citas');
const A = require('../lib/agenda');
const G = require('../lib/google-agenda');
const D = require('../lib/directorio');

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA'); // base del ambiente (Preview = prueba)
const TBL_SOLICITUDES = 'tblUsc72JO2BaqT6d';
const TBL_DIRECTORIO = 'tblkUNPwu1sQgZBPJ';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const VERSION_AVISO = 'v1.0 2026-08-11';

class ErrorAirtable extends Error {
  constructor(status, detalle) { super(`Airtable respondió ${status}`); this.status = status; this.detalle = detalle; }
}

// Airtable responde 403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND (no 404) cuando
// un id bien formado no existe en la tabla. Para un GET por id con un token
// que sí lee esta base, eso es "no existe", no una falla de la base.
const noExiste = e => e instanceof ErrorAirtable && (e.status === 404 ||
  (e.status === 403 && e.detalle && e.detalle.error && e.detalle.error.type === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND'));

async function at(ruta, opciones = {}) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorAirtable(r.status, data);
  return data;
}

async function leerTodo(tabla, params) {
  const registros = [];
  let offset;
  do {
    const p = new URLSearchParams(params);
    p.set('pageSize', '100');
    if (offset) p.set('offset', offset);
    const d = await at(`${tabla}?${p.toString()}`);
    registros.push(...(d.records || []));
    offset = d.offset;
  } while (offset);
  return registros;
}

const esRecId = v => /^rec[A-Za-z0-9]{14}$/.test(String(v || ''));
const escapar = v => String(v).replace(/"/g, '\\"');

function agregarHistorial(previo, fechaISO, accion, quien, detalle) {
  const linea = [fechaISO, accion, quien, detalle].filter(Boolean).join(' | ').replace(/\n/g, ' ');
  return previo ? `${previo}\n${linea}` : linea;
}

async function perfilDelMedicoEnSesion(codigo) {
  const d = await at(`${TBL_MEDICOS}?${new URLSearchParams({ filterByFormula: `{Código de médico}="${escapar(codigo)}"`, maxRecords: '1' })}`);
  const med = (d.records || [])[0];
  if (!med) return { med: null, perfil: null };
  const perfiles = await leerTodo(TBL_DIRECTORIO, {});
  return { med, perfil: perfiles.find(r => (r.fields['Médico'] || []).includes(med.id)) || null };
}

// Aviso al médico SIN datos del paciente ni motivo: solo que hay algo que
// revisar en su portal. Si no tiene Telegram, va a Víctor para reenvío.
async function avisarMedico(perfil, texto) {
  try {
    const links = (perfil && perfil.fields && perfil.fields['Médico']) || [];
    let chat = null;
    if (links.length) {
      const m = await at(`${TBL_MEDICOS}/${links[0]}`);
      chat = (m.fields && m.fields['Telegram Chat ID']) || null;
    }
    const ambiente = BASE_ID === 'app6jyD9pDlTLpknA' ? '' : '\n(Ambiente: prueba)';
    if (chat) { await sendTelegramMessage(chat, texto + ambiente); return 'Médico (directo)'; }
    if (process.env.TELEGRAM_CHAT_ID) {
      await sendTelegramMessage(process.env.TELEGRAM_CHAT_ID, `${texto}\nMédico sin Telegram: ${(perfil && perfil.fields && perfil.fields['Name']) || '(sin nombre)'}${ambiente}`);
      return 'Fallback a Víctor';
    }
    return 'No enviada';
  } catch (e) {
    console.error('[citas] aviso Telegram falló:', e.message);
    return 'Falló el envío';
  }
}

function resumenParaMedico(rec) {
  const c = rec.fields || {};
  return {
    id: rec.id,
    estado: c['Estado de cita'] || C.ESTADOS_CITA.PENDIENTE,
    esCita: !!c['Estado de cita'], // las solicitudes viejas de "contacto" no traen ciclo de cita
    nombre: c['Nombre del paciente'] || '',
    telefono: c['Teléfono/WhatsApp'] || '',
    email: c['Email'] || '',
    fechaPreferida: c['Fecha preferida'] || null,
    turno: c['Turno preferido'] || null,
    modalidad: c['Modalidad'] || 'Presencial',
    horario: c['Horario acordado'] || null,
    mensaje: c['Mensaje del médico'] || null,
    motivo: c['Consentimiento datos sensibles'] ? (c['Motivo declarado'] || null) : null,
    fechaSolicitud: c['Fecha solicitud'] || null,
    historial: c['Historial de la solicitud'] || '',
  };
}

// Agenda automática del perfil: solo cuenta si está activa Y el horario guardado es válido.
function agendaDePerfil(perfil) {
  const c = (perfil && perfil.fields) || {};
  const v = A.validarHorarioSemanal(A.leerJSON(c[A.CAMPOS.HORARIO], null));
  return {
    automatica: c[A.CAMPOS.AUTOMATICA] === true && v.ok,
    horario: v.ok ? v.horario : null,
    bloqueos: A.leerJSON(c[A.CAMPOS.BLOQUEOS], []).filter(b => b && b.desde && b.hasta),
  };
}

// Permiso de Google Calendar del médico dueño del perfil (solo servidor).
async function googleDelPerfil(perfil) {
  const medId = ((perfil && perfil.fields && perfil.fields['Médico']) || [])[0];
  if (!medId) return null;
  const m = await at(`${TBL_MEDICOS}/${medId}`);
  const refresh = m.fields && m.fields['Google Calendar Refresh Token'];
  return refresh ? { refresh, email: m.fields['Google Calendar Email'] || '' } : null;
}

// Bloques ocupados en el Google Calendar del médico. Si Google no responde,
// se FALLA (no se ofrecen espacios que podrían estar ocupados).
async function ocupadoEnGoogle(perfil, horario, desde, hasta) {
  const g = await googleDelPerfil(perfil);
  if (!g) return {};
  try {
    return await G.ocupadoGoogle(g.refresh, { desde, hasta, zona: horario.zona });
  } catch (e) {
    console.error('[citas] Google Calendar:', e.message);
    if (e.revocado) {
      // El médico (o Google) retiró el permiso: no se puede saber qué tiene
      // ocupado. Se pausa la agenda automática (los pacientes vuelven a
      // enviar solicitudes) y se le avisa UNA vez (al borrar el permiso, la
      // siguiente consulta ya no entra aquí).
      try {
        await at(`${TBL_MEDICOS}/${perfil.fields['Médico'][0]}`, { method: 'PATCH', body: JSON.stringify({ fields: { 'Google Calendar Refresh Token': '', 'Google Calendar Email': '' } }) });
        await at(`${TBL_DIRECTORIO}/${perfil.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { [A.CAMPOS.AUTOMATICA]: false } }) });
        await avisarMedico(perfil, '⚠️ Tu Google Calendar se desconectó (se retiró el permiso). Pausé tu agenda automática para no darte citas encima: mientras tanto los pacientes te envían solicitudes. Escribe /conectar en Telegram para reconectarla y /agenda para reactivarla.');
      } catch (e2) { console.error('[citas] al pausar por permiso retirado:', e2.message); }
    }
    const err = new Error('No pudimos consultar la agenda del médico en este momento. Intenta de nuevo en unos minutos.');
    err.http = 503;
    throw err;
  }
}

// Evento en el Google Calendar del médico para una cita agendada. Un fallo
// aquí NO deshace la cita (ya está confirmada al paciente): se anota en el
// historial y se avisa al médico.
async function anotarEnGoogle(perfil, horario, rec, datos) {
  const g = await googleDelPerfil(perfil).catch(() => null);
  if (!g) return null;
  try {
    const [fecha, hora] = datos.horario.split(' ');
    const enLinea = ((rec && rec.fields) || {})['Modalidad'] === 'En línea';
    const id = await G.crearEventoCita(g.refresh, {
      fecha, hora, duracion: horario.duracion, zona: horario.zona,
      titulo: `Cita${enLinea ? ' en línea' : ''}: ${datos.nombre} (CODE CELLS)`,
      descripcion: `Tel.: ${datos.telefono}${enLinea ? '\nConsulta EN LÍNEA: acuerda con el paciente cómo se conectan y el pago.' : ''}\nAgendada por NOVA desde el directorio CODE CELLS.\nDetalles en tu portal → Mi directorio.`,
    });
    await at(`${TBL_SOLICITUDES}/${rec.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { 'Evento Google': id } }) });
    return id;
  } catch (e) {
    console.error('[citas] no se pudo anotar en Google:', e.message);
    await avisarMedico(perfil, `⚠️ NOVA agendó una cita el ${fechaCorta(datos.horario.slice(0, 10))} a las ${A.horaCorta(datos.horario.slice(11))}, pero NO pude anotarla en tu Google Calendar (${e.message}). Anótala tú o escribe /conectar.`);
    return null;
  }
}

async function quitarDeGoogle(rec) {
  const evento = rec.fields && rec.fields['Evento Google'];
  const perfilId = ((rec.fields && rec.fields['Médico solicitado']) || [])[0];
  if (!evento || !perfilId) return;
  try {
    const perfil = await at(`${TBL_DIRECTORIO}/${perfilId}`);
    const g = await googleDelPerfil(perfil);
    if (g) await G.borrarEvento(g.refresh, evento);
  } catch (e) {
    console.error('[citas] no se pudo quitar el evento de Google:', e.message);
  }
}

// Citas que ocupan agenda de ESTE perfil. La liga no se filtra por id en
// fórmula (CLAUDE.md §8): se trae lo que ocupa y se filtra aquí.
async function citasQueOcupan(perfilId) {
  const estados = A.ESTADOS_QUE_OCUPAN.map(e => `{Estado de cita}="${escapar(e)}"`).join(',');
  const regs = await leerTodo(TBL_SOLICITUDES, [
    ['filterByFormula', `AND(OR(${estados}), {Horario acordado}!="")`],
    ['fields[]', 'Médico solicitado'], ['fields[]', 'Estado de cita'], ['fields[]', 'Horario acordado'],
  ]);
  return perfilId ? regs.filter(r => (r.fields['Médico solicitado'] || []).includes(perfilId)) : regs;
}

// Primer horario libre (fecha + hora) a partir de las fechas con espacio.
function primerEspacio(ag, siguientes, ocupadosMapa, rangosMapa, ahora) {
  const f = (siguientes || [])[0];
  if (!f) return null;
  const hora = A.espaciosLibres({ fecha: f.fecha, horario: ag.horario, bloqueos: ag.bloqueos, ocupados: ocupadosMapa[f.fecha], rangosOcupados: rangosMapa[f.fecha], ahora })[0];
  return hora ? { fecha: f.fecha, hora } : null;
}

const fechaCorta = ymd => {
  try { return new Date(ymd + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); }
  catch { return ymd; }
};

module.exports = async (req, res) => {
  const accion = String((req.query && req.query.accion) || '');
  const ahora = new Date();
  const ahoraISO = ahora.toISOString();

  try {
    // ── Público ───────────────────────────────────────────────────────
    if (accion === 'disponibilidad' && req.method === 'GET') {
      const medicoId = String(req.query.medicoId || '');
      const fecha = String(req.query.fecha || '');
      if (!esRecId(medicoId)) return res.status(400).json({ error: 'Falta el médico.' });
      let perfil;
      try { perfil = await at(`${TBL_DIRECTORIO}/${medicoId}`); }
      catch (e) { if (noExiste(e)) perfil = null; else throw e; }
      if (!perfil || !perfil.fields || perfil.fields['Publicado'] !== true) {
        return res.status(404).json({ error: 'Este médico no está disponible en el directorio.' });
      }
      const ag = agendaDePerfil(perfil);
      if (!ag.automatica) return res.status(200).json({ automatica: false });
      const ocupadosMapa = A.ocupadosPorFecha(await citasQueOcupan(medicoId));
      const manana = C.sumarDias(C.fechaMexico(ahora), 1);
      const conFecha = A.fechaValida(fecha);
      const desde = conFecha && fecha > manana ? fecha : manana;
      const rangosMapa = await ocupadoEnGoogle(perfil, ag.horario, conFecha && fecha < desde ? fecha : desde, C.sumarDias(desde, 30));
      const siguientes = A.proximasFechasConEspacio({ desde, horario: ag.horario, bloqueos: ag.bloqueos, ocupadosMapa, rangosMapa, ahora, cuantas: 7 });
      return res.status(200).json({
        automatica: true,
        duracion: ag.horario.duracion,
        zona: ag.horario.zona || null,
        fecha: conFecha ? fecha : null,
        espacios: conFecha ? A.espaciosLibres({ fecha, horario: ag.horario, bloqueos: ag.bloqueos, ocupados: ocupadosMapa[fecha], rangosOcupados: rangosMapa[fecha], ahora }) : [],
        siguientes,
        primero: primerEspacio(ag, siguientes, ocupadosMapa, rangosMapa, ahora),
      });
    }

    if (accion === 'proximos' && req.method === 'GET') {
      const ids = [...new Set(String(req.query.ids || '').split(',').map(x => x.trim()).filter(esRecId))].slice(0, 50);
      if (!ids.length) return res.status(200).json({ proximos: {} });
      const perfiles = await leerTodo(TBL_DIRECTORIO, [
        ['filterByFormula', `AND({Publicado}=1, OR(${ids.map(id => `RECORD_ID()="${id}"`).join(',')}))`],
        ['fields[]', 'Médico'], ['fields[]', A.CAMPOS.HORARIO], ['fields[]', A.CAMPOS.BLOQUEOS], ['fields[]', A.CAMPOS.AUTOMATICA],
      ]);
      const conAgenda = perfiles.map(p => ({ perfil: p, ag: agendaDePerfil(p) })).filter(x => x.ag.automatica);
      if (!conAgenda.length) return res.status(200).json({ proximos: {} });
      // Una sola lectura de las citas que ocupan agenda, repartida por perfil.
      const ocupan = await citasQueOcupan(null);
      const manana = C.sumarDias(C.fechaMexico(ahora), 1);
      const proximos = {};
      await Promise.all(conAgenda.map(async ({ perfil, ag }) => {
        try {
          const ocupadosMapa = A.ocupadosPorFecha(ocupan.filter(r => (r.fields['Médico solicitado'] || []).includes(perfil.id)));
          const rangosMapa = await ocupadoEnGoogle(perfil, ag.horario, manana, C.sumarDias(manana, 14));
          const siguientes = A.proximasFechasConEspacio({ desde: manana, horario: ag.horario, bloqueos: ag.bloqueos, ocupadosMapa, rangosMapa, ahora, cuantas: 1, buscarDias: 14 });
          const p = primerEspacio(ag, siguientes, ocupadosMapa, rangosMapa, ahora);
          if (p) proximos[perfil.id] = p;
        } catch (e) {
          console.error('[citas] proximos', perfil.id, e.message); // sin insignia: no se promete nada
        }
      }));
      return res.status(200).json({ proximos });
    }

    if (accion === 'solicitar' && req.method === 'POST') {
      if (CONGELADO) return respuestaCongelada(res);
      const cuerpo = { ...(req.body || {}) };
      const hora = String(cuerpo.hora || '');
      if (hora) {
        if (!A.horaValida(hora)) return res.status(400).json({ error: 'Elige uno de los horarios disponibles.' });
        cuerpo.turno = A.turnoDeHora(hora);
      }
      const v = C.validarSolicitudCita(cuerpo, ahora);
      // Sin hora ni turno, el error de "turno" confundiría al paciente con agenda automática.
      if (!v.ok && !hora && !cuerpo.turno && /mañana, tarde/.test(v.error)) return res.status(400).json({ error: 'Elige un horario.' });
      if (!v.ok) return res.status(400).json({ error: v.error });
      const d = v.datos;
      let perfil;
      try { perfil = await at(`${TBL_DIRECTORIO}/${d.medicoId}`); }
      catch (e) { if (noExiste(e)) perfil = null; else throw e; }
      if (!perfil || !perfil.fields || perfil.fields['Publicado'] !== true) {
        return res.status(404).json({ error: 'Este médico no está disponible en el directorio.' });
      }
      const enLinea = d.modalidad === 'En línea';
      if (enLinea && perfil.fields[D.CAMPO_EN_LINEA] !== true) {
        return res.status(400).json({ error: 'Este médico no ofrece consulta en línea. Elige consulta en el consultorio.' });
      }
      // Agenda automática: el espacio debe estar libre AHORA (se recalcula
      // aquí; lo que mostró la página pudo cambiar). La consulta en línea no
      // la usa: el horario se acuerda con el médico.
      const ag = agendaDePerfil(perfil);
      let horarioAgendado = null;
      if (ag.automatica && !enLinea) {
        if (!hora) return res.status(400).json({ error: 'Elige uno de los horarios disponibles.' });
        const ocupados = A.ocupadosPorFecha(await citasQueOcupan(d.medicoId))[d.fechaPreferida];
        const rangosOcupados = (await ocupadoEnGoogle(perfil, ag.horario, d.fechaPreferida, d.fechaPreferida))[d.fechaPreferida];
        const libres = A.espaciosLibres({ fecha: d.fechaPreferida, horario: ag.horario, bloqueos: ag.bloqueos, ocupados, rangosOcupados, ahora });
        if (!libres.includes(hora)) return res.status(409).json({ error: 'Ese horario ya no está disponible. Elige otro.', espacios: libres });
        horarioAgendado = `${d.fechaPreferida} ${hora}`;
      }
      const clave = C.generarClave();
      const fields = {
        'Nombre del paciente': d.nombre,
        'Teléfono/WhatsApp': d.telefono,
        'Email': d.email,
        'Médico solicitado': [d.medicoId],
        'Fecha solicitud': ahoraISO,
        'Estado': 'Nueva',
        'Origen': 'Formulario /directorio',
        'Consentimiento datos sensibles': d.consentimiento,
        'Versión aviso de privacidad': VERSION_AVISO,
        'Alerta enviada a': 'No enviada',
        'Fecha preferida': d.fechaPreferida,
        'Turno preferido': d.turno,
        'Modalidad': d.modalidad,
        'Estado de cita': horarioAgendado ? C.ESTADOS_CITA.ACEPTADA : C.ESTADOS_CITA.PENDIENTE,
        'Clave de seguimiento — huella': C.huellaClave(clave),
        'Historial de la solicitud': horarioAgendado
          ? agregarHistorial('', ahoraISO, 'Cita agendada automáticamente (agenda del médico)', 'paciente', horarioAgendado)
          : agregarHistorial('', ahoraISO, 'Solicitud enviada', 'paciente', `${d.fechaPreferida} · ${d.turno}${enLinea ? ' · en línea' : ''}`),
      };
      if (horarioAgendado) fields['Horario acordado'] = horarioAgendado;
      if (d.motivo) fields['Motivo declarado'] = d.motivo;
      const creado = await at(TBL_SOLICITUDES, { method: 'POST', body: JSON.stringify({ fields }) });

      // Airtable no tiene transacciones: si dos pacientes tomaron el mismo
      // espacio a la vez, se queda el primero y al segundo se le avisa.
      if (horarioAgendado) {
        const mismas = (await citasQueOcupan(d.medicoId))
          .filter(r => r.fields['Horario acordado'] === horarioAgendado)
          .sort((a, b) => a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id));
        if (mismas.length > 1 && mismas[0].id !== creado.id) {
          await at(`${TBL_SOLICITUDES}/${creado.id}`, { method: 'PATCH', body: JSON.stringify({ fields: {
            'Estado de cita': C.ESTADOS_CITA.RECHAZADA,
            'Historial de la solicitud': agregarHistorial(fields['Historial de la solicitud'], new Date().toISOString(), 'Anulada: otro paciente tomó el mismo espacio al mismo tiempo', 'sistema'),
          } }) });
          const ocupados = A.ocupadosPorFecha(await citasQueOcupan(d.medicoId))[d.fechaPreferida];
          return res.status(409).json({ error: 'Otro paciente acaba de tomar ese horario. Elige otro.',
            espacios: A.espaciosLibres({ fecha: d.fechaPreferida, horario: ag.horario, bloqueos: ag.bloqueos, ocupados, ahora }) });
        }
        await anotarEnGoogle(perfil, ag.horario, creado, { horario: horarioAgendado, nombre: d.nombre, telefono: d.telefono });
      }

      const destino = await avisarMedico(perfil, horarioAgendado
        ? `CODE CELLS: NOVA agendó una cita el ${fechaCorta(d.fechaPreferida)} a las ${A.horaCorta(hora)}. Detalles en tu portal → Mi directorio.`
        : `CODE CELLS: tienes una nueva solicitud de ${enLinea ? 'consulta EN LÍNEA' : 'cita'} para el ${fechaCorta(d.fechaPreferida)}, ${C.textoTurno(d.turno)}. Revísala en tu portal → Mi directorio.`);
      try { await at(`${TBL_SOLICITUDES}/${creado.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { 'Alerta enviada a': destino } }) }); }
      catch (e) { console.error('[citas] no se registró el destino del aviso:', e.message); }

      return res.status(200).json({ ok: true, id: creado.id, clave, token: generarTokenVisitante(), aviso: destino,
        estado: fields['Estado de cita'], horario: horarioAgendado,
        zona: horarioAgendado ? (ag.horario.zona || null) : null, duracion: horarioAgendado ? ag.horario.duracion : null });
    }

    if (accion === 'estado' && req.method === 'POST') {
      const { id, c } = req.body || {};
      if (!esRecId(id) || !c) return res.status(400).json({ error: 'La liga de seguimiento está incompleta.' });
      let rec;
      try { rec = await at(`${TBL_SOLICITUDES}/${id}`); }
      catch (e) { if (noExiste(e)) rec = null; else throw e; }
      if (!rec || !C.claveValida(c, rec.fields['Clave de seguimiento — huella'])) {
        return res.status(404).json({ error: 'No encontramos esa solicitud. Revisa que la liga esté completa.' });
      }
      const idPerfil = (rec.fields['Médico solicitado'] || [])[0];
      let nombreMedico = null;
      let agenda = null;
      let consultorio = null;
      if (idPerfil) {
        try {
          const perfil = await at(`${TBL_DIRECTORIO}/${idPerfil}`);
          nombreMedico = perfil.fields['Name'] || null;
          // Dónde es la consulta: la dirección es pública en la ficha; el
          // teléfono ya se le mostró al paciente al enviar su solicitud.
          const f = perfil.fields || {};
          const direccion = D.normalizarDireccion(f[D.CAMPO_DIRECCION]);
          const tel = D.normalizarTelefono(f['Teléfono de consultorio']);
          consultorio = {
            direccion: direccion.ok ? direccion.valor : '',
            ciudad: D.normalizarCiudad(f['Ciudad de consulta']),
            mapa: direccion.ok ? D.enlaceMapa(direccion.valor, f['Ciudad de consulta']) : '',
            telefono: tel.ok ? tel.valor : '',
            liga: D.esLigaValida(f[D.CAMPO_LIGA]) ? f[D.CAMPO_LIGA] : null,
            costo: D.costoLegible(f[D.CAMPO_COSTO]),
            costoEnLinea: f[D.CAMPO_EN_LINEA] === true ? D.costoLegible(f[D.CAMPO_COSTO_EN_LINEA]) : '',
          };
          const ag = agendaDePerfil(perfil);
          // Para "Agregar a mi calendario". Sin horario configurado no se
          // sabe la zona: el navegador usa la hora local del teléfono.
          if (ag.horario) agenda = { zona: ag.horario.zona || null, duracion: ag.horario.duracion || null };
        } catch (e) { /* el nombre y la zona son opcionales */ }
      }
      return res.status(200).json({ solicitud: C.vistaPaciente(rec, nombreMedico), medicoId: idPerfil || null, agenda, consultorio });
    }

    if (accion === 'paciente' && req.method === 'POST') {
      const { id, c, accion: acc } = req.body || {};
      if (!esRecId(id) || !c) return res.status(400).json({ error: 'La liga de seguimiento está incompleta.' });
      if (acc !== 'cancelar' && CONGELADO) return respuestaCongelada(res); // cancelar reduce lo tratado: se permite
      let rec;
      try { rec = await at(`${TBL_SOLICITUDES}/${id}`); }
      catch (e) { if (noExiste(e)) rec = null; else throw e; }
      if (!rec || !C.claveValida(c, rec.fields['Clave de seguimiento — huella'])) {
        return res.status(404).json({ error: 'No encontramos esa solicitud.' });
      }
      const t = C.transicionPaciente(rec.fields['Estado de cita'], acc);
      if (!t.ok) return res.status(409).json({ error: t.error });
      const fields = {
        'Estado de cita': t.estado,
        'Historial de la solicitud': agregarHistorial(rec.fields['Historial de la solicitud'], ahoraISO, t.estado, 'paciente'),
      };
      const act = await at(`${TBL_SOLICITUDES}/${id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
      if (t.estado === C.ESTADOS_CITA.CANCELADA) await quitarDeGoogle(rec);
      const idPerfil = (rec.fields['Médico solicitado'] || [])[0];
      if (idPerfil) {
        try {
          const perfil = await at(`${TBL_DIRECTORIO}/${idPerfil}`);
          if (t.estado === C.ESTADOS_CITA.CONFIRMADA) {
            const ag = agendaDePerfil(perfil);
            await anotarEnGoogle(perfil, ag.horario || { duracion: A.DURACION_DEFECTO }, act, { horario: act.fields['Horario acordado'], nombre: act.fields['Nombre del paciente'], telefono: act.fields['Teléfono/WhatsApp'] });
          }
          await avisarMedico(perfil, t.estado === C.ESTADOS_CITA.CONFIRMADA
            ? `CODE CELLS: un paciente confirmó el horario que propusiste (${rec.fields['Horario acordado'] || 's/h'}). Revísalo en tu portal → Mi directorio.`
            : 'CODE CELLS: un paciente canceló su solicitud de cita. Revísalo en tu portal → Mi directorio.');
        } catch (e) { console.error('[citas] aviso al médico falló:', e.message); }
      }
      return res.status(200).json({ ok: true, solicitud: C.vistaPaciente(act) });
    }

    // ── Médico ────────────────────────────────────────────────────────
    if (accion === 'mis_solicitudes' || accion === 'responder') {
      const sesion = verificarToken(tokenDesdeRequest(req));
      if (!sesion || sesion.tipo !== 'medico') return res.status(401).json({ error: 'Sesión médica requerida.' });
      const { perfil } = await perfilDelMedicoEnSesion(sesion.codigo);
      if (!perfil) return res.status(200).json({ solicitudes: [], sinPerfil: true });

      if (accion === 'mis_solicitudes' && req.method === 'GET') {
        // La liga guarda recordIds y ARRAYJOIN devolvería el nombre, no el id:
        // se filtra en el servidor por id exacto (CLAUDE.md §8).
        const todas = await leerTodo(TBL_SOLICITUDES, {});
        const mias = todas
          .filter(r => (r.fields['Médico solicitado'] || []).includes(perfil.id))
          .map(resumenParaMedico)
          .sort((a, b) => String(b.fechaSolicitud).localeCompare(String(a.fechaSolicitud)));
        return res.status(200).json({ solicitudes: mias, nombrePublico: perfil.fields['Name'] || '' });
      }

      if (accion === 'responder' && req.method === 'POST') {
        if (CONGELADO) return respuestaCongelada(res);
        const { id, respuesta } = req.body || {};
        const mensaje = String((req.body && req.body.mensaje) || '').trim().slice(0, 500);
        if (!esRecId(id)) return res.status(400).json({ error: 'Solicitud inválida.' });
        const rec = await at(`${TBL_SOLICITUDES}/${id}`);
        if (!(rec.fields['Médico solicitado'] || []).includes(perfil.id)) {
          return res.status(403).json({ error: 'Esta solicitud no es para tu perfil.' });
        }
        let horario = null;
        if (respuesta === 'aceptar' || respuesta === 'proponer') {
          const h = C.validarHorario(req.body.horario, ahora);
          if (!h.ok) return res.status(400).json({ error: h.error });
          horario = h.horario;
        }
        const t = C.transicionMedico(rec.fields['Estado de cita'], respuesta, { horario, mensaje });
        if (!t.ok) return res.status(409).json({ error: t.error });
        const fields = {
          'Estado de cita': t.estado,
          'Mensaje del médico': mensaje,
          ...(horario ? { 'Horario acordado': horario } : {}),
          ...(rec.fields['Estado'] === 'Nueva' || rec.fields['Estado'] === 'Notificada' ? { 'Estado': 'Contactada' } : {}),
          'Historial de la solicitud': agregarHistorial(rec.fields['Historial de la solicitud'], ahoraISO, t.estado, sesion.codigo, horario || ''),
        };
        const act = await at(`${TBL_SOLICITUDES}/${id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
        // Google Calendar del médico: la cita aceptada a mano también se anota;
        // la cancelada se quita.
        if (t.estado === C.ESTADOS_CITA.RECHAZADA) await quitarDeGoogle(rec);
        if (t.estado === C.ESTADOS_CITA.ACEPTADA) {
          const ag = agendaDePerfil(perfil);
          await anotarEnGoogle(perfil, ag.horario || { duracion: A.DURACION_DEFECTO }, act, { horario, nombre: act.fields['Nombre del paciente'], telefono: act.fields['Teléfono/WhatsApp'] });
        }
        return res.status(200).json({ ok: true, solicitud: resumenParaMedico(act) });
      }
    }

    return res.status(400).json({ error: 'Acción no reconocida.' });
  } catch (e) {
    if (e.http === 503) return res.status(503).json({ error: e.message });
    if (e instanceof ErrorAirtable) {
      console.error('[citas]', accion, e.status, JSON.stringify(e.detalle).slice(0, 300));
      return res.status(502).json({ error: 'No pudimos completar la operación con la base de datos. Intenta de nuevo en un momento.' });
    }
    console.error('[citas]', accion, e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
