// api/citas.js
// Solicitud de cita desde la ficha pública del médico (etapa 2, 2026-10-22).
//
//   Público (sin sesión):
//     POST ?accion=solicitar   → crea la solicitud (Pendiente) y devuelve la clave de seguimiento
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
const { CONGELADO, respuestaCongelada } = require('../lib/congelamientoDatosPersonales');
const { sendTelegramMessage } = require('../lib/telegram');
const C = require('../lib/citas');

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA'); // base del ambiente (Preview = prueba)
const TBL_SOLICITUDES = 'tblUsc72JO2BaqT6d';
const TBL_DIRECTORIO = 'tblkUNPwu1sQgZBPJ';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';
const VERSION_AVISO = 'v1.0 2026-08-11';

class ErrorAirtable extends Error {
  constructor(status, detalle) { super(`Airtable respondió ${status}`); this.status = status; this.detalle = detalle; }
}

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
    horario: c['Horario acordado'] || null,
    mensaje: c['Mensaje del médico'] || null,
    motivo: c['Consentimiento datos sensibles'] ? (c['Motivo declarado'] || null) : null,
    fechaSolicitud: c['Fecha solicitud'] || null,
    historial: c['Historial de la solicitud'] || '',
  };
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
    if (accion === 'solicitar' && req.method === 'POST') {
      if (CONGELADO) return respuestaCongelada(res);
      const v = C.validarSolicitudCita(req.body, ahora);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const d = v.datos;
      let perfil;
      try { perfil = await at(`${TBL_DIRECTORIO}/${d.medicoId}`); }
      catch (e) { if (e instanceof ErrorAirtable && e.status === 404) perfil = null; else throw e; }
      if (!perfil || !perfil.fields || perfil.fields['Publicado'] !== true) {
        return res.status(404).json({ error: 'Este médico no está disponible en el directorio.' });
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
        'Estado de cita': C.ESTADOS_CITA.PENDIENTE,
        'Clave de seguimiento — huella': C.huellaClave(clave),
        'Historial de la solicitud': agregarHistorial('', ahoraISO, 'Solicitud enviada', 'paciente', `${d.fechaPreferida} · ${d.turno}`),
      };
      if (d.motivo) fields['Motivo declarado'] = d.motivo;
      const creado = await at(TBL_SOLICITUDES, { method: 'POST', body: JSON.stringify({ fields }) });

      const destino = await avisarMedico(perfil,
        `CODE CELLS: tienes una nueva solicitud de cita para el ${fechaCorta(d.fechaPreferida)}, ${C.textoTurno(d.turno)}. Revísala en tu portal → Mi directorio.`);
      try { await at(`${TBL_SOLICITUDES}/${creado.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { 'Alerta enviada a': destino } }) }); }
      catch (e) { console.error('[citas] no se registró el destino del aviso:', e.message); }

      return res.status(200).json({ ok: true, id: creado.id, clave, token: generarTokenVisitante(), aviso: destino });
    }

    if (accion === 'estado' && req.method === 'POST') {
      const { id, c } = req.body || {};
      if (!esRecId(id) || !c) return res.status(400).json({ error: 'La liga de seguimiento está incompleta.' });
      let rec;
      try { rec = await at(`${TBL_SOLICITUDES}/${id}`); }
      catch (e) { if (e instanceof ErrorAirtable && e.status === 404) rec = null; else throw e; }
      if (!rec || !C.claveValida(c, rec.fields['Clave de seguimiento — huella'])) {
        return res.status(404).json({ error: 'No encontramos esa solicitud. Revisa que la liga esté completa.' });
      }
      const idPerfil = (rec.fields['Médico solicitado'] || [])[0];
      let nombreMedico = null;
      if (idPerfil) { try { nombreMedico = (await at(`${TBL_DIRECTORIO}/${idPerfil}`)).fields['Name'] || null; } catch (e) { /* el nombre es opcional */ } }
      return res.status(200).json({ solicitud: C.vistaPaciente(rec, nombreMedico), medicoId: idPerfil || null });
    }

    if (accion === 'paciente' && req.method === 'POST') {
      const { id, c, accion: acc } = req.body || {};
      if (!esRecId(id) || !c) return res.status(400).json({ error: 'La liga de seguimiento está incompleta.' });
      if (acc !== 'cancelar' && CONGELADO) return respuestaCongelada(res); // cancelar reduce lo tratado: se permite
      let rec;
      try { rec = await at(`${TBL_SOLICITUDES}/${id}`); }
      catch (e) { if (e instanceof ErrorAirtable && e.status === 404) rec = null; else throw e; }
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
      const idPerfil = (rec.fields['Médico solicitado'] || [])[0];
      if (idPerfil) {
        try {
          const perfil = await at(`${TBL_DIRECTORIO}/${idPerfil}`);
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
        return res.status(200).json({ ok: true, solicitud: resumenParaMedico(act) });
      }
    }

    return res.status(400).json({ error: 'Acción no reconocida.' });
  } catch (e) {
    if (e instanceof ErrorAirtable) {
      console.error('[citas]', accion, e.status, JSON.stringify(e.detalle).slice(0, 300));
      return res.status(502).json({ error: 'No pudimos completar la operación con la base de datos. Intenta de nuevo en un momento.' });
    }
    console.error('[citas]', accion, e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
