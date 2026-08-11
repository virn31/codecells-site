// api/airtable.js
// Proxy hacia Airtable — el token de Airtable NUNCA viaja al navegador.
//
// CAMBIO CRÍTICO (jul 2026, auditoría de seguridad): antes, este endpoint no
// validaba absolutamente nada — cualquiera en internet que descubriera esta
// URL podía leer, crear o modificar cualquiera de las 9 tablas whitelisteadas
// (pacientes, historia clínica, consultas, médicos, etc.) sin login ni token.
//
// Ahora TODA solicitud requiere un token de sesión válido (emitido por
// api/auth-login.js tras validar un código real contra Airtable), enviado
// como header "Authorization: Bearer <token>". Sin token válido, 401.
//
// Además, el rol del token (medico/paciente/vip) determina qué tablas y qué
// registros puede tocar — un paciente NO puede leer el expediente de otro
// paciente, aunque tenga un token válido, porque su token está atado a su
// propio código.

const { verificarToken, tokenDesdeRequest, generarTokenVisitante } = require('../lib/auth');
const { sendTelegramMessage } = require('../lib/telegram');

const BASE_ID = 'app6jyD9pDlTLpknA';

const TABLAS_PERMITIDAS = {
  pacientes: 'tblyUcCfueFLJuvIv',
  historia: 'tblm2xUADazitHisR',
  consultas: 'tbl1Xp2IGxdV178Ky',
  medicos: 'tbl87DsuBMmb4DjFM',
  protocolos: 'tblMGnZxnEHHrjZl4',
  labs: 'tblhKp4uE1NdXXqLh',
  temp: 'tblVOTed5MJSX1Vpy',
  pacientes_vip: 'tblquF2fzFgUC5nll',
  solicitudes_medico: 'tblDpqi2XJqoR4QiE',
  directorio_medico: 'tblkUNPwu1sQgZBPJ',
  solicitudes_paciente: 'tblUsc72JO2BaqT6d',
};

// Campo que, en cada tabla, identifica a qué paciente/vip pertenece un
// registro — usado para restringir el acceso de los roles "paciente" y "vip"
// a SOLO sus propios datos. AJUSTAR si el nombre real del campo difiere.
const CAMPO_DUENIO = {
  pacientes: 'Código de paciente',
  historia: 'Código de paciente ref',
  consultas: 'Código de paciente ref',
  labs: 'Código de paciente ref',
  pacientes_vip: 'Código DZW',
};

// Tablas de referencia, sin datos personales — lectura pública permitida
// (nunca escritura) incluso sin token, porque no exponen nada sensible.
const TABLAS_LECTURA_PUBLICA = new Set(['protocolos']);

// Campos que el DIRECTORIO expone al público. TODO campo no listado aquí
// (Médico linkado, Fecha de alta, Última actualización) queda BLOQUEADO
// en la respuesta pública — se aplica como fields[]= en la petición a
// Airtable, no en post-procesado JS, para que un bug de serialización no
// pueda filtrar campos sensibles.
const DIRECTORIO_CAMPOS_PUBLICOS = [
  'Name',
  'Especialidades visibles',
  'Tratamientos que ofrece',
  'Otras terapias',
  'Ciudad de consulta',
  'Bio corta',
  'Horarios',
  'WhatsApp público',
];

// Campos que solo se revelan a visitantes registrados (gate suave).
// NUNCA fusionar con la lista de campos públicos de arriba.
const DIRECTORIO_CAMPOS_PRIVADOS = ['Teléfono de consultorio'];

function escaparFormula(valor) {
  return String(valor).replace(/"/g, '\\"');
}

// Resuelve el recordId del médico a partir de su código CCMED-. Se usa en
// las ramas POST/PATCH de directorio_medico porque el link 'Médico' de la
// tabla DIRECTORIO_MEDICO guarda recordIds, no códigos.
async function obtenerRecordIdMedico(codigo, AIRTABLE_TOKEN) {
  const formula = `{Código de médico}="${escaparFormula(codigo)}"`;
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLAS_PERMITIDAS.medicos}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1&fields%5B%5D=${encodeURIComponent('Código de médico')}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    if (!r.ok) return null;
    const d = await r.json();
    return d.records?.[0]?.id || null;
  } catch {
    return null;
  }
}

// Tablas donde, ANTES de que exista sesión, el propio código/token que el
// cliente ya trae en memoria (de la URL, o recién generado) funciona como
// credencial de arranque — siempre que sea una coincidencia EXACTA de un
// solo campo, nunca una lista ni un filtro compuesto. `temp` cubre el flujo
// de invitaciones DZW/referidos; `pacientes_vip` cubre el flujo de
// activación de cuenta VIP (Token activación) antes de tener PIN/sesión.
const CAMPOS_CREDENCIAL_PREAUTH = {
  temp: ['Código invitación', 'Código propio'],
  pacientes_vip: ['Código DZW', 'Token activación'],
  solicitudes_medico: ['Código invitación'],
};

function esLecturaPreAuthValida(tabla, filterByFormula) {
  const campos = CAMPOS_CREDENCIAL_PREAUTH[tabla];
  if (!campos || !filterByFormula) return false;
  const patron = new RegExp(`^\\{(${campos.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\}="[^"]*"$`);
  return patron.test(filterByFormula);
}

// Mismo caso pero para actualizar (PATCH) un registro antes de tener sesión
// — ej. marcar una invitación "Verificado", o que el paciente VIP establezca
// su PIN por primera vez. La "credencial" es conocer el código exacto de
// ESE registro específico — se verifica contra el registro real antes de
// permitir el cambio, igual que con los roles ya autenticados.
async function esEscrituraPreAuthValida(req, tabla, tableId, AIRTABLE_TOKEN) {
  const campos = CAMPOS_CREDENCIAL_PREAUTH[tabla];
  if (!campos) return false;
  const { recordId } = req.query;
  const credencial = req.query.credencialPreAuth || (req.body && req.body.credencialPreAuth);
  if (!recordId || !credencial) return false;
  try {
    const check = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    if (!check.ok) return false;
    const data = await check.json();
    const f = data.fields || {};
    return campos.some(c => f[c] === credencial);
  } catch {
    return false;
  }
}

// Avisa al médico por Telegram. Si el médico no tiene chat vinculado,
// le llega a Víctor para reenvío manual. Devuelve el destino real,
// que se guarda en el campo 'Alerta enviada a'.
async function notificarSolicitudPaciente(registro, body) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  let chatMedico = null;
  let nombreMedico = 'un médico de la red';

  if (body.medicoId) {
    try {
      // 1) Perfil público → 2) expediente en MÉDICOS → 3) Telegram Chat ID
      const rDir = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/tblkUNPwu1sQgZBPJ/${body.medicoId}`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      const dir = await rDir.json();
      nombreMedico = dir.fields?.['Name'] || nombreMedico;
      const links = dir.fields?.['Médico'] || [];
      if (links.length) {
        const rMed = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/tbl87DsuBMmb4DjFM/${links[0]}`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const med = await rMed.json();
        chatMedico = med.fields?.['Telegram Chat ID'] || null;
      }
    } catch (e) { /* cae al fallback */ }
  }

  const consintio = body.consentimiento === true;
  const lineas = [
    '🔔 *Nueva solicitud de contacto*',
    '',
    `*Para:* ${nombreMedico}`,
    `*Paciente:* ${body.nombre || '—'}`,
    `*Teléfono:* ${body.telefono || '—'}`,
    `*Ciudad:* ${body.ciudad || '—'}`,
    `*Busca:* ${body.especialidad || '—'}`
  ];
  if (consintio && body.motivo) {
    lineas.push(`*Motivo:* ${body.motivo}`);
  } else {
    lineas.push('_El paciente no autorizó compartir su motivo de consulta._');
  }
  lineas.push('', 'Contáctalo directamente. Registro en Airtable → SOLICITUDES_PACIENTE.');

  const mensaje = lineas.join('\n');

  if (chatMedico) {
    await sendTelegramMessage(chatMedico, mensaje);
    return 'Médico (directo)';
  }

  const chatVictor = process.env.TELEGRAM_CHAT_ID;
  if (chatVictor) {
    await sendTelegramMessage(
      chatVictor,
      mensaje + '\n\n⚠️ _Este médico aún no vinculó su Telegram. Reenvíaselo a mano._'
    );
    return 'Fallback a Víctor';
  }
  return 'No enviada';
}

module.exports = async (req, res) => {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  if (!AIRTABLE_TOKEN) {
    return res.status(500).json({ error: 'AIRTABLE_TOKEN no configurado en Vercel.' });
  }

  const { tabla } = req.query;
  const tableId = TABLAS_PERMITIDAS[tabla];
  if (!tableId) {
    return res.status(400).json({ error: 'Tabla no reconocida o no permitida.' });
  }

  // ── Autenticación ──
  const token = tokenDesdeRequest(req);
  const sesion = verificarToken(token); // null si falta, es inválido o expiró

  const esLecturaPublicaPermitida =
    req.method === 'GET' && TABLAS_LECTURA_PUBLICA.has(tabla);
  const esLecturaPreAuth =
    req.method === 'GET' && esLecturaPreAuthValida(tabla, req.query.filterByFormula);
  // Crear una invitación (temp) siempre fue pensado como acción pública —
  // así arranca el flujo de referidos/invitación, antes de que exista sesión.
  const esCreacionInvitacionPublica = req.method === 'POST' && tabla === 'temp';
  // Actualizar un registro puntual (temp o pacientes_vip) sin sesión — solo
  // si se demuestra conocer el código/token exacto de ESE registro.
  const esEscrituraPreAuth =
    !sesion && req.method === 'PATCH' && CAMPOS_CREDENCIAL_PREAUTH[tabla]
      ? await esEscrituraPreAuthValida(req, tabla, tableId, AIRTABLE_TOKEN)
      : false;

  const esLecturaDirectorioPublico =
    !sesion && req.method === 'GET' && tabla === 'directorio_medico';
  const esListaCiudadesPublica =
    !sesion && req.method === 'GET' && tabla === 'directorio_medico' && req.query.accion === 'ciudades';

  // ── Registro público de un lead del directorio (crea el lead + token) ──
  const esRegistroPacientePublico =
    req.method === 'POST' &&
    tabla === 'solicitudes_paciente' &&
    req.query.accion === 'registrar';

  if (esRegistroPacientePublico) {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim().slice(0, 120);
    const telefono = String(b.telefono || '').trim().slice(0, 30);
    if (!nombre || !telefono) {
      return res.status(400).json({ error: 'Nombre y teléfono son obligatorios.' });
    }

    const consintio = b.consentimiento === true;

    const fields = {
      'Nombre del paciente': nombre,
      'Teléfono/WhatsApp': telefono,
      'Email': String(b.email || '').trim().slice(0, 120),
      'Ciudad': String(b.ciudad || '').trim().slice(0, 80),
      'Especialidad de interés': String(b.especialidad || '').trim().slice(0, 120),
      'Fecha solicitud': new Date().toISOString(),
      'Estado': 'Nueva',
      'Origen': 'Formulario /directorio',
      'Consentimiento datos sensibles': consintio,
      'Versión aviso de privacidad': 'v1.0 2026-08-11',
      'Alerta enviada a': 'No enviada'
    };

    // CANDADO LEGAL: el motivo (dato de salud) SOLO se guarda con
    // consentimiento expreso. Sin checkbox, el lead entra sin motivo.
    if (consintio && b.motivo) {
      fields['Motivo declarado'] = String(b.motivo).trim().slice(0, 2000);
    }

    if (b.medicoId) {
      fields['Médico solicitado'] = [String(b.medicoId)];
    }

    try {
      const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/tblUsc72JO2BaqT6d`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      });
      const creado = await r.json();
      if (!r.ok) {
        return res.status(500).json({ error: 'No se pudo guardar la solicitud.' });
      }

      // Token de visitante: desbloquea los teléfonos por 2h.
      const token = generarTokenVisitante();

      // Alerta Telegram — NO debe tumbar la respuesta si falla.
      let destino = 'No enviada';
      try {
        destino = await notificarSolicitudPaciente(creado, b);
      } catch (e) {
        destino = 'Falló el envío';
      }

      // Best-effort: registrar a dónde se avisó. Si falla, no importa.
      try {
        await fetch(`https://api.airtable.com/v0/${BASE_ID}/tblUsc72JO2BaqT6d/${creado.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields: { 'Alerta enviada a': destino } })
        });
      } catch (e) { /* silencioso */ }

      return res.status(200).json({ ok: true, token });
    } catch (err) {
      return res.status(500).json({ error: 'Error al registrar la solicitud.' });
    }
  }

  if (
    !sesion &&
    !esLecturaPublicaPermitida &&
    !esLecturaPreAuth &&
    !esCreacionInvitacionPublica &&
    !esEscrituraPreAuth &&
    !esLecturaDirectorioPublico
  ) {
    return res.status(401).json({ error: 'Sesión no válida o expirada. Inicia sesión de nuevo.' });
  }

  // ── Directorio público: forwarding dedicado con filtro forzado y
  //    whitelist estricta de campos. El cliente NO puede mandar
  //    filterByFormula ni fields[] arbitrarios en este path. ──
  // Devuelve SOLO los teléfonos de consultorio, a visitantes registrados.
  // Requiere token de visitante emitido al dejar datos en /directorio.
  const esContactosDirectorio =
    req.method === 'GET' &&
    tabla === 'directorio_medico' &&
    req.query.accion === 'contactos';

  if (esContactosDirectorio) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const payload = verificarToken(token);
    if (!payload || payload.rol !== 'visitante') {
      return res.status(401).json({ error: 'Registro requerido.' });
    }
    const params = new URLSearchParams();
    params.set('filterByFormula', '{Publicado}=1');
    params.append('fields[]', 'Teléfono de consultorio');
    params.set('maxRecords', '200');
    const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params.toString()}`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const data = await r.json();
      const contactos = {};
      (data.records || []).forEach(rec => {
        const tel = rec.fields?.['Teléfono de consultorio'];
        if (tel) contactos[rec.id] = tel;
      });
      return res.status(200).json({ contactos });
    } catch (err) {
      return res.status(500).json({ error: 'Error al conectar con Airtable.' });
    }
  }

  if (esListaCiudadesPublica) {
    // Devolver array de ciudades únicas de médicos publicados
    const params = new URLSearchParams();
    params.set('filterByFormula', '{Publicado}=1');
    params.append('fields[]', 'Ciudad de consulta');
    params.set('maxRecords', '100');
    const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params.toString()}`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const data = await r.json();
      const set = new Set();
      (data.records || []).forEach(rec => {
        const c = rec.fields?.['Ciudad de consulta']?.trim();
        if (c) set.add(c);
      });
      return res.status(200).json({ ciudades: Array.from(set).sort() });
    } catch (err) {
      return res.status(500).json({ error: 'Error al conectar con Airtable.', detail: String(err) });
    }
  }

  if (esLecturaDirectorioPublico) {
    const params = new URLSearchParams();
    const filtros = ['{Publicado}=1'];
    const { ciudad, especialidad, tratamiento } = req.query;
    if (ciudad) {
      filtros.push(`{Ciudad de consulta}="${escaparFormula(ciudad)}"`);
    }
    if (especialidad) {
      filtros.push(`FIND("${escaparFormula(especialidad)}", ARRAYJOIN({Especialidades visibles}, ", "))>0`);
    }
    if (tratamiento) {
      filtros.push(`FIND("${escaparFormula(tratamiento)}", ARRAYJOIN({Tratamientos que ofrece}, ", "))>0`);
    }
    params.set(
      'filterByFormula',
      filtros.length === 1 ? filtros[0] : `AND(${filtros.join(',')})`
    );
    DIRECTORIO_CAMPOS_PUBLICOS.forEach(f => params.append('fields[]', f));
    params.set('maxRecords', '50');

    const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params.toString()}`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const data = await r.json();
      return res.status(r.status).json(data);
    } catch (err) {
      return res.status(500).json({ error: 'Error al conectar con Airtable.', detail: String(err) });
    }
  }

  // Un token de VISITANTE no es una sesión con rol: su único permiso es
  // ?accion=contactos (ya resuelto arriba). Si llega aquí, es una ruta que
  // no le corresponde — sin este corte caería al reenvío genérico y podría
  // leer directorio_medico en crudo (sin whitelist de campos ni {Publicado}=1).
  if (sesion && sesion.rol === 'visitante') {
    return res.status(403).json({ error: 'Tu registro solo permite ver los contactos del directorio.' });
  }

  // El marcador "credencialPreAuth" es solo la credencial de esta petición —
  // nunca debe reenviarse a Airtable como si fuera un campo real.
  if (req.body && req.body.credencialPreAuth !== undefined) {
    delete req.body.credencialPreAuth;
  }

  // ── Autorización por rol (solo aplica cuando hay sesión real) ──
  if (sesion) {
    const { tipo, codigo } = sesion;

    if (tipo === 'medico') {
      // Acceso amplio a las tablas clínicas — igual que hoy (interconsulta
      // entre médicos por código de paciente sigue funcionando). Nunca
      // permite escribir en MÉDICOS a través de este proxy genérico —
      // cambios de certificación/nivel se hacen por vías controladas propias.
      if (tabla === 'medicos' && req.method !== 'GET') {
        return res.status(403).json({ error: 'No permitido: la tabla de médicos no se modifica por este proxy.' });
      }
      if (tabla === 'solicitudes_medico' && req.method !== 'GET' && req.method !== 'POST') {
        return res.status(403).json({ error: 'No permitido.' });
      }

      // ── Directorio médico: cada médico solo ve/edita SU propio perfil ──
      if (tabla === 'directorio_medico') {
        if (req.method === 'GET') {
          req.query.filterByFormula = `{Médico}="${escaparFormula(codigo)}"`;
          req.query.maxRecords = '1';
        } else if (req.method === 'POST') {
          const recordIdMedico = await obtenerRecordIdMedico(codigo, AIRTABLE_TOKEN);
          if (!recordIdMedico) {
            return res.status(500).json({ error: 'No se pudo resolver el registro del médico.' });
          }
          const fields = (req.body && req.body.fields) || {};
          delete fields['Fecha de alta']; // solo se estampa al primer publish
          req.body.fields = {
            ...fields,
            'Médico': [recordIdMedico],
            'Publicado': false,
            'Última actualización': new Date().toISOString(),
          };
        } else if (req.method === 'PATCH') {
          const { recordId } = req.query;
          if (!recordId) return res.status(400).json({ error: 'Falta recordId.' });
          const recordIdMedico = await obtenerRecordIdMedico(codigo, AIRTABLE_TOKEN);
          if (!recordIdMedico) {
            return res.status(500).json({ error: 'No se pudo resolver el registro del médico.' });
          }
          try {
            const check = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`, {
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
            });
            const checkData = await check.json();
            const linkado = checkData.fields?.['Médico'] || [];
            if (!check.ok || !linkado.includes(recordIdMedico)) {
              return res.status(403).json({ error: 'No puedes modificar un perfil que no es tuyo.' });
            }
            const fields = (req.body && req.body.fields) || {};
            // Campos que el médico NO puede tocar por este endpoint
            delete fields['Médico'];
            delete fields['Fecha de alta'];
            // Si va a publicar por primera vez, estampar Fecha de alta
            const yaTieneFecha = !!checkData.fields?.['Fecha de alta'];
            if (fields['Publicado'] === true && !yaTieneFecha) {
              fields['Fecha de alta'] = new Date().toISOString();
            }
            fields['Última actualización'] = new Date().toISOString();
            req.body.fields = fields;
          } catch (err) {
            return res.status(502).json({ error: 'No se pudo verificar el registro antes de modificarlo.' });
          }
        }
      }
    } else if (tipo === 'paciente' || tipo === 'vip') {
      const tablasPermitidasRol =
        tipo === 'paciente'
          ? ['pacientes', 'historia', 'consultas', 'labs', 'protocolos', 'temp']
          : ['pacientes_vip', 'temp'];

      if (!tablasPermitidasRol.includes(tabla)) {
        return res.status(403).json({ error: 'Tu sesión no tiene acceso a esta información.' });
      }

      const campoDuenio = CAMPO_DUENIO[tabla];
      if (campoDuenio) {
        if (req.method === 'GET') {
          // Se IGNORA cualquier filterByFormula que el cliente haya mandado
          // y se reemplaza por una restringida a su propio código — así un
          // token válido no puede usarse para leer el expediente de alguien
          // más solo cambiando el query string.
          req.query.filterByFormula = `{${campoDuenio}}="${escaparFormula(codigo)}"`;
        } else if (req.method === 'POST') {
          const fields = (req.body && req.body.fields) || {};
          if (fields[campoDuenio] !== undefined && fields[campoDuenio] !== codigo) {
            return res.status(403).json({ error: 'No puedes crear registros a nombre de otro código.' });
          }
          // Si el campo no viene, se fuerza para que el registro quede
          // correctamente atribuido a quien lo está creando.
          req.body.fields = { ...fields, [campoDuenio]: codigo };
        } else if (req.method === 'PATCH') {
          // Antes de aplicar el cambio, se verifica que el registro que se
          // quiere modificar de verdad pertenezca a este código — se hace
          // una lectura previa del registro específico.
          const { recordId } = req.query;
          if (!recordId) return res.status(400).json({ error: 'Falta recordId.' });
          try {
            const check = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`, {
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
            });
            const checkData = await check.json();
            if (!check.ok || checkData.fields?.[campoDuenio] !== codigo) {
              return res.status(403).json({ error: 'No puedes modificar un registro que no es tuyo.' });
            }
          } catch (err) {
            return res.status(502).json({ error: 'No se pudo verificar el registro antes de modificarlo.' });
          }
        }
      }
    }
  }

  // ── Reenvío real a Airtable ──
  try {
    if (req.method === 'GET') {
      const params = new URLSearchParams(req.query);
      params.delete('tabla');
      const qs = params.toString();
      const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}${qs ? '?' + qs : ''}`;
      const airtableRes = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const data = await airtableRes.json();
      return res.status(airtableRes.status).json(data);
    }

    if (req.method === 'POST') {
      const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}`;
      const airtableRes = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await airtableRes.json();
      return res.status(airtableRes.status).json(data);
    }

    if (req.method === 'PATCH') {
      const { recordId } = req.query;
      if (!recordId) return res.status(400).json({ error: 'Falta recordId para actualizar el registro.' });
      const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`;
      const airtableRes = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await airtableRes.json();
      return res.status(airtableRes.status).json(data);
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al conectar con Airtable.', detail: String(err) });
  }
};
