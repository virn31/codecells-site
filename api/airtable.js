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
// Capa 1 de constancia de acceso a expedientes — solo observa, no decide
// ningún acceso (ver lib/accesosExpediente.js para el modelo completo).
const { registrarAccesoExpediente } = require('../lib/accesosExpediente');
const { autorizarPaciente, ErrorAutorizacion } = require('../lib/autorizacion');

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

// Motor de gráficas: tablas de configuración (fuera de TABLAS_PERMITIDAS a
// propósito). Se leen SOLO por las rutas dedicadas accion=graficas_* — nunca
// por el reenvío genérico, así no aceptan POST/PATCH ni filterByFormula
// arbitrario. Son catálogo de referencia, no datos de paciente.
const TBL_GRAFICAS_CATALOGO   = 'tblA51aUeYypWQMQV'; // CATALOGO_PARAMETROS
const TBL_GRAFICAS_PLANTILLAS = 'tbl1cpvSQkzo5r9UA'; // PLANTILLAS_ESPECIALIDAD
// SUPUESTO A CONFIRMAR: LAB_VALORES = tbl6y1ZfsmPPhrlFk (el que tiene el
// backfill de `Parametro`/`Confianza` del SPEC §1), NO el alias `labs`
// (tblhKp4uE1NdXXqLh), que es otra tabla sin esos campos.
const TBL_GRAFICAS_LABVALORES = 'tbl6y1ZfsmPPhrlFk'; // LAB_VALORES

// El catálogo NO guarda el nombre de la columna de origen en cada tabla, así
// que el mapeo código → campo de CONSULTAS es explícito aquí. En esta pasada
// solo `peso` (prueba de aceptación §5). Un código con Fuente=CONSULTAS que no
// esté en este mapa se reporta en `excluidos`, nunca se adivina.
const CAMPO_CONSULTAS_POR_CODIGO = {
  peso: 'Peso en consulta (kg)',
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

// Tablas con expediente de UN paciente (no la lista) a las que el rol
// médico necesita acceso — cada una debe pasar por autorizarPaciente()
// antes de llegar al reenvío genérico. 'pacientes' se scopea aparte
// (es una LISTA de pacientes, no el expediente de uno) pero también se
// marca como cubierta — ver medicoFiltroAplicado más abajo.
const TABLAS_EXPEDIENTE_MEDICO = new Set(['historia', 'consultas', 'labs']);

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

// Tablas del núcleo clínico (SPEC separación de roles, ago 2026): solo un
// médico con `Tipo de acceso`=Clinico puede leerlas. Revisor/Desarrollo
// entran por la misma puerta (mismo token de sesión) pero nunca deben tocar
// expediente de paciente — esa distinción antes no existía, era un solo tipo
// de sesión "medico" para clínicos, QA y accesos técnicos por igual.
const NUCLEO_CLINICO_TABLAS = new Set(['pacientes', 'historia', 'consultas', 'labs', 'pacientes_vip']);

// Resuelve `Tipo de acceso` desde el registro MÉDICOS a partir del código del
// TOKEN (nunca de un parámetro del cliente — regla dura del SPEC). Sin
// registro o sin fetch exitoso, permitido=false: falla cerrado, igual que un
// registro con el campo vacío (ver nota junto a NUCLEO_CLINICO_TABLAS).
async function verificarAccesoClinicoMedico(codigo, AIRTABLE_TOKEN) {
  const formula = `{Código de médico}="${escaparFormula(codigo)}"`;
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLAS_PERMITIDAS.medicos}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1&fields%5B%5D=${encodeURIComponent('Código de médico')}&fields%5B%5D=${encodeURIComponent('Tipo de acceso')}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    if (!r.ok) return { permitido: false, recordId: null };
    const d = await r.json();
    const rec = d.records?.[0];
    if (!rec) return { permitido: false, recordId: null };
    return { permitido: rec.fields?.['Tipo de acceso'] === 'Clinico', recordId: rec.id };
  } catch {
    return { permitido: false, recordId: null };
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

// `Zonas` vive como string JSON en Airtable. Se parsea en el servidor (no en
// el cliente). Un JSON mal escrito en UN registro no debe reventar toda la
// respuesta del catálogo: se loguea y ese parámetro sale con zonas: [].
function parsearZonasGrafica(raw, codigo) {
  if (!raw) return [];
  try {
    const z = JSON.parse(raw);
    return Array.isArray(z) ? z : [];
  } catch (e) {
    console.error(`[graficas] Zonas JSON inválido en "${codigo}": ${e.message}`);
    return [];
  }
}

// Lee TODOS los registros de una tabla siguiendo la paginación por `offset`.
// `paramsIniciales` es un objeto de query (filterByFormula, sort[0][field]…).
// Lanza un Error con .status/.data si Airtable responde no-OK.
async function airtableLeerTodo(tableId, token, paramsIniciales = {}) {
  const registros = [];
  let offset;
  do {
    const params = new URLSearchParams(paramsIniciales);
    params.set('pageSize', '100');
    if (offset) params.set('offset', offset);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params.toString()}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();
    if (!r.ok) {
      const e = new Error('airtable_no_ok');
      e.status = r.status;
      e.data = data;
      throw e;
    }
    registros.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return registros;
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

  // Capa 1 de constancia de acceso: se llena más abajo, solo en la rama
  // médico→pacientes (interconsulta GET / POST / PATCH), y se consume junto
  // al reenvío real a Airtable, donde ya se sabe si hubo o no coincidencia.
  let logAccesoExpediente = null;

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

  // ── MOTOR DE GRÁFICAS · accion=graficas_catalogo ──────────────────
  // Devuelve el catálogo de parámetros graficables (registros activos).
  // Cachear en cliente: cambia muy poco. Llega con un `tabla` cualquiera
  // válido (el guard de arriba lo exige); esta ruta lo ignora y resuelve
  // directo contra CATALOGO_PARAMETROS, retornando antes del reenvío
  // genérico. Requiere sesión real — es referencia clínica, no dato público.
  if (req.query.accion === 'graficas_catalogo') {
    if (!sesion) {
      return res.status(401).json({ error: 'Sesión requerida para el catálogo de gráficas.' });
    }
    try {
      const parametros = [];
      let offset;
      do {
        const params = new URLSearchParams();
        params.set('filterByFormula', '{Activo}=1');
        params.set('pageSize', '100');
        if (offset) params.set('offset', offset);
        const url = `https://api.airtable.com/v0/${BASE_ID}/${TBL_GRAFICAS_CATALOGO}?${params.toString()}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
        const data = await r.json();
        if (!r.ok) {
          return res.status(502).json({ error: 'No se pudo leer el catálogo de gráficas.' });
        }
        (data.records || []).forEach(rec => {
          const c = rec.fields || {};
          if (!c['Codigo']) return; // sin código no sirve como llave del sistema
          parametros.push({
            codigo: c['Codigo'],
            nombre: c['Nombre'] || null,
            unidad: c['Unidad'] || null,
            tipoGrafica: c['Tipo de grafica'] || null,
            grupo: c['Grupo de grafica'] || null,
            zonas: parsearZonasGrafica(c['Zonas'], c['Codigo']),
            origen: c['Origen'] || null,
            formula: c['Formula'] || null,
            decimales: typeof c['Decimales'] === 'number' ? c['Decimales'] : null,
            escalaX: c['Escala X'] || 'indice',
            fuente: c['Fuente actual'] || null,
          });
        });
        offset = data.offset;
      } while (offset);
      return res.status(200).json({ parametros });
    } catch (err) {
      return res.status(500).json({ error: 'Error al conectar con Airtable.', detail: String(err) });
    }
  }

  // ── MOTOR DE GRÁFICAS · accion=graficas_plantillas ────────────────
  // Devuelve las plantillas activas con sus códigos de parámetro resueltos.
  // `Parametros` es un link a CATALOGO_PARAMETROS: aunque su primario es
  // `Codigo` (y ARRAYJOIN devolvería códigos), se resuelve por record ID
  // contra un mapa del catálogo — más explícito y menos frágil (SPEC §3).
  if (req.query.accion === 'graficas_plantillas') {
    if (!sesion) {
      return res.status(401).json({ error: 'Sesión requerida para las plantillas de gráficas.' });
    }
    try {
      // 1. Mapa recordId → Codigo. Incluye TODO el catálogo (no solo activos)
      //    para que ningún link quede sin resolver por estar inactivo.
      const codigoPorId = {};
      let offCat;
      do {
        const p = new URLSearchParams();
        p.set('pageSize', '100');
        p.append('fields[]', 'Codigo');
        if (offCat) p.set('offset', offCat);
        const url = `https://api.airtable.com/v0/${BASE_ID}/${TBL_GRAFICAS_CATALOGO}?${p.toString()}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
        const data = await r.json();
        if (!r.ok) {
          return res.status(502).json({ error: 'No se pudo leer el catálogo para resolver plantillas.' });
        }
        (data.records || []).forEach(rec => {
          const cod = rec.fields && rec.fields['Codigo'];
          if (cod) codigoPorId[rec.id] = cod;
        });
        offCat = data.offset;
      } while (offCat);

      // 2. Plantillas activas, con sus links resueltos a códigos.
      const plantillas = [];
      let offPl;
      do {
        const p = new URLSearchParams();
        p.set('filterByFormula', '{Activo}=1');
        p.set('pageSize', '100');
        if (offPl) p.set('offset', offPl);
        const url = `https://api.airtable.com/v0/${BASE_ID}/${TBL_GRAFICAS_PLANTILLAS}?${p.toString()}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
        const data = await r.json();
        if (!r.ok) {
          return res.status(502).json({ error: 'No se pudo leer las plantillas de gráficas.' });
        }
        (data.records || []).forEach(rec => {
          const f = rec.fields || {};
          const links = Array.isArray(f['Parametros']) ? f['Parametros'] : [];
          // Preserva el orden en que la plantilla lista sus parámetros; descarta
          // links que no resuelven (registro borrado del catálogo).
          const codigos = links.map(id => codigoPorId[id]).filter(Boolean);
          plantillas.push({
            id: rec.id,
            nombre: f['Nombre'] || null,
            especialidad: f['Especialidad sugerida'] || null,
            orden: typeof f['Orden'] === 'number' ? f['Orden'] : null,
            descripcion: f['Descripcion'] || null,
            codigos,
          });
        });
        offPl = data.offset;
      } while (offPl);

      // Orden estable por `Orden`; las sin número van al final.
      plantillas.sort((a, b) => (a.orden ?? Infinity) - (b.orden ?? Infinity));
      return res.status(200).json({ plantillas });
    } catch (err) {
      return res.status(500).json({ error: 'Error al conectar con Airtable.', detail: String(err) });
    }
  }

  // ── MOTOR DE GRÁFICAS · accion=graficas_series ────────────────────
  // El corazón: devuelve las series de datos de un paciente para los códigos
  // pedidos. Entrada por query: codigoPaciente + codigos (coma-separados).
  // Respeta el scoping por rol existente: un paciente/vip SOLO puede leer su
  // propio código; el médico (acceso amplio por interconsulta) puede pedir
  // cualquier paciente por su código.
  if (req.query.accion === 'graficas_series') {
    if (!sesion) {
      return res.status(401).json({ error: 'Sesión requerida.' });
    }

    // Misma compuerta que el núcleo clínico: esta ruta ignora `tabla` y lee
    // LAB_VALORES/CONSULTAS directo, así que un Revisor/Desarrollo no puede
    // rodear el gate de arriba con un `tabla` cualquiera solo para pasar la
    // validación inicial.
    if (sesion.tipo === 'medico') {
      const acceso = await verificarAccesoClinicoMedico(sesion.codigo, AIRTABLE_TOKEN);
      if (!acceso.permitido) {
        await registrarAccesoExpediente({
          codigoMedico: sesion.codigo,
          medicoRecId: acceso.recordId,
          accion: 'Lectura de labs',
          resultado: 'Denegado',
          endpoint: 'airtable:graficas_series:GET',
        });
        return res.status(403).json({ error: 'Tu tipo de acceso no permite leer expedientes clínicos.' });
      }
    }

    let codigoPaciente = String(req.query.codigoPaciente || '').trim();
    if (sesion.tipo === 'paciente' || sesion.tipo === 'vip') {
      codigoPaciente = sesion.codigo; // no puede leer expediente ajeno
    }
    if (!codigoPaciente) {
      return res.status(400).json({ error: 'Falta codigoPaciente.' });
    }

    // El médico SÍ puede pedir el código de cualquier paciente por query —
    // pero antes no se verificaba que fuera suyo (Pendiente 3 de 630c106):
    // cualquier CC-PAC- ajeno devolvía sus series. autorizarPaciente()
    // decide; el 403 es el mismo "Paciente no disponible" que el resto.
    if (sesion.tipo === 'medico') {
      try {
        const auth = await autorizarPaciente(sesion.codigo, codigoPaciente);
        codigoPaciente = auth.codigo;
      } catch (err) {
        if (err instanceof ErrorAutorizacion) {
          return res.status(err.status).json({ error: err.message });
        }
        return res.status(err.status || 502).json({ error: 'No se pudo verificar el acceso al paciente.' });
      }
    }

    const codigos = String(req.query.codigos || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (!codigos.length) {
      return res.status(400).json({ error: 'Falta la lista de codigos.' });
    }

    try {
      // Catálogo activo → config por código + mapa recId→código (para labs).
      const catRegs = await airtableLeerTodo(TBL_GRAFICAS_CATALOGO, AIRTABLE_TOKEN, {
        filterByFormula: '{Activo}=1',
      });
      const cfgPorCodigo = {};
      const codigoPorRecId = {};
      catRegs.forEach(rec => {
        const c = rec.fields || {};
        if (!c['Codigo']) return;
        cfgPorCodigo[c['Codigo']] = {
          origen: c['Origen'] || null,
          fuente: c['Fuente actual'] || null,
          unidad: c['Unidad'] || null,
        };
        codigoPorRecId[rec.id] = c['Codigo'];
      });

      const series = {};
      const excluidos = [];
      const pedidosConsultas = [];
      const pedidosLabs = [];

      // Clasificar cada código pedido según Origen/Fuente.
      for (const codigo of codigos) {
        const cfg = cfgPorCodigo[codigo];
        if (!cfg) {
          excluidos.push({ codigo, motivo: 'codigo_desconocido' });
          continue;
        }
        // Toda serie pedida existe en la respuesta, aunque quede vacía.
        series[codigo] = { puntos: [], unidad: cfg.unidad };

        // REGLA §2.5 + nota de datos: Derivado sin campo directo NO se parsea
        // aquí (ta_sistolica/ta_diastolica viven en texto "145/92"). Serie
        // vacía y se reporta — el split es tarea aparte.
        if (cfg.origen === 'Derivado') {
          excluidos.push({ codigo, motivo: 'requiere_split' });
          continue;
        }
        // Calculado lo deriva el motor, pero los scores (FIB-4, TFG, IMC,
        // HOMA-IR) están fuera de alcance en esta pasada (§7).
        if (cfg.origen === 'Calculado') {
          excluidos.push({ codigo, motivo: 'calculo_no_implementado' });
          continue;
        }

        switch (cfg.fuente) {
          case 'CONSULTAS':    pedidosConsultas.push(codigo); break;
          case 'LAB_VALORES':  pedidosLabs.push(codigo); break;
          case 'PACIENTES':
            // Historial de peso es texto libre; migrarlo es tarea aparte (§7).
            excluidos.push({ codigo, motivo: 'fuente_no_migrada' });
            break;
          default:
            excluidos.push({ codigo, motivo: 'fuente_inexistente' });
        }
      }

      // ── Lectura de CONSULTAS (solo si hace falta) ──
      if (pedidosConsultas.length) {
        const consultasRegs = await airtableLeerTodo(TABLAS_PERMITIDAS.consultas, AIRTABLE_TOKEN, {
          filterByFormula: `{Código de paciente ref}="${escaparFormula(codigoPaciente)}"`,
          'sort[0][field]': 'Fecha de consulta',
          'sort[0][direction]': 'asc',
        });
        for (const codigo of pedidosConsultas) {
          const campo = CAMPO_CONSULTAS_POR_CODIGO[codigo];
          if (!campo) {
            excluidos.push({ codigo, motivo: 'campo_consulta_no_mapeado' });
            continue;
          }
          const puntos = [];
          for (const reg of consultasRegs) {
            const v = reg.fields[campo];
            if (typeof v !== 'number') continue; // descartar puntos sin valor
            const numSesion = reg.fields['Número de sesión'];
            puntos.push({
              fecha: reg.fields['Fecha de consulta'] || null,
              valor: v,
              // `semana` es metadato de CONSULTAS que el render usa para las
              // etiquetas (Inicio / S{n}); ausente en otras fuentes.
              semana: typeof numSesion === 'number' ? numSesion : null,
            });
          }
          series[codigo].puntos = puntos;
        }
      }

      // ── Lectura de LAB_VALORES (solo si hace falta) ──
      if (pedidosLabs.length) {
        const setLabs = new Set(pedidosLabs);
        const labRegs = await airtableLeerTodo(TBL_GRAFICAS_LABVALORES, AIRTABLE_TOKEN, {
          filterByFormula: `{Código de paciente ref}="${escaparFormula(codigoPaciente)}"`,
          'sort[0][field]': 'Fecha del estudio',
          'sort[0][direction]': 'asc',
        });
        for (const reg of labRegs) {
          const f = reg.fields || {};
          const fecha = f['Fecha del estudio'] || null;
          const analito = f['Analito'] || null;
          const paramLink = Array.isArray(f['Parametro']) ? f['Parametro'] : [];
          // §2.2: sin Parametro NO grafica; va a excluidos (no se adivina).
          if (!paramLink.length) {
            excluidos.push({ analito, motivo: 'sin_parametro', fecha });
            continue;
          }
          const codigo = codigoPorRecId[paramLink[0]];
          if (!codigo) {
            excluidos.push({ analito, motivo: 'parametro_desconocido', fecha });
            continue;
          }
          if (!setLabs.has(codigo)) continue; // no fue pedido: ignorar
          // §2.3: solo grafican Alta o Media; "Requiere revision" se excluye.
          if (f['Confianza'] === 'Requiere revision') {
            excluidos.push({ analito, codigo, motivo: 'requiere_revision', fecha });
            continue;
          }
          const v = f['Valor numérico'];
          if (typeof v !== 'number') {
            excluidos.push({ analito, codigo, motivo: 'sin_valor_numerico', fecha });
            continue;
          }
          series[codigo].puntos.push({ fecha, valor: v });
        }
      }

      return res.status(200).json({ series, excluidos });
    } catch (err) {
      const status = err && err.status ? 502 : 500;
      return res.status(status).json({ error: 'Error al leer las series de gráficas.', detail: String(err && err.message || err) });
    }
  }

  // El marcador "credencialPreAuth" es solo la credencial de esta petición —
  // nunca debe reenviarse a Airtable como si fuera un campo real.
  if (req.body && req.body.credencialPreAuth !== undefined) {
    delete req.body.credencialPreAuth;
  }

  // Se marca en 'true' solo cuando el rol médico pasó por una restricción
  // real (autorizarPaciente() o el filtro propio de 'pacientes') para una
  // tabla con expediente de paciente. Guard justo antes del reenvío
  // genérico (ver más abajo): una tabla nueva que se agregue a
  // TABLAS_EXPEDIENTE_MEDICO sin escribir su bloque cae aquí en vez de al
  // reenvío sin filtro — falla cerrado, no abierto.
  let medicoFiltroAplicado = false;

  // ── Autorización por rol (solo aplica cuando hay sesión real) ──
  if (sesion) {
    const { tipo, codigo } = sesion;

    if (tipo === 'medico' && NUCLEO_CLINICO_TABLAS.has(tabla)) {
      const acceso = await verificarAccesoClinicoMedico(codigo, AIRTABLE_TOKEN);
      if (!acceso.permitido) {
        await registrarAccesoExpediente({
          codigoMedico: codigo,
          medicoRecId: acceso.recordId,
          accion: req.method === 'GET' ? 'Lectura de expediente' : 'Escritura',
          resultado: 'Denegado',
          endpoint: `airtable:${tabla}:${req.method}`,
        });
        return res.status(403).json({ error: 'Tu tipo de acceso no permite leer expedientes clínicos.' });
      }
    }

    if (tipo === 'medico') {
      // Ya NO hay acceso amplio a las tablas clínicas: historia, consultas
      // y labs pasan por TABLAS_EXPEDIENTE_MEDICO más abajo. Nunca permite
      // escribir en MÉDICOS a través de este proxy genérico — cambios de
      // certificación/nivel se hacen por vías controladas propias.
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

      // ── PACIENTES: el médico ve SOLO los suyos + los demo + el de
      //    interconsulta. El filterByFormula del cliente se IGNORA y se
      //    reemplaza (igual que paciente/vip). La interconsulta llega como
      //    ?pacienteBuscado=CC-PAC-XXXX exacto. Sin excepción por nivel ni
      //    fundador — la visibilidad se decide aquí, en el servidor.
      if (tabla === 'pacientes') {
        medicoFiltroAplicado = true;
        const q = '"';
        const codEsc = escaparFormula(codigo);
        // Match EXACTO por token contra ARRAYJOIN del link (","&...&","), para
        // que CCMED-JORGE no cace CCMED-JORGE01. El primario de MÉDICOS es el
        // código, así que ARRAYJOIN({Médico_principal}) devuelve los CCMED-.
        const filtroPropios =
          `FIND(${q},${codEsc},${q}, ${q},${q} & ARRAYJOIN({Médico_principal}, ${q},${q}) & ${q},${q}) > 0`;
        const filtroLista = `OR(${filtroPropios}, {Es demo}=1)`;

        const buscado = String(req.query.pacienteBuscado || '').trim();
        const esInterconsulta = /^CC-PAC-(DEMO\d{2}|\d{4,8})$/.test(buscado);
        // pacienteBuscado es señal de ESTA petición: nunca un campo real ni se
        // reenvía a Airtable.
        delete req.query.pacienteBuscado;

        if (req.method === 'GET') {
          req.query.filterByFormula = esInterconsulta
            ? `{Código de paciente}="${escaparFormula(buscado)}"`
            : filtroLista;
          // Solo la interconsulta puntual (código exacto) cuenta como "abrir
          // un expediente" para la constancia — el listado propio+demo es
          // navegación de la cartera ya autorizada, no un acceso puntual.
          if (esInterconsulta) {
            logAccesoExpediente = { pacienteCode: buscado, codigoMedico: codigo, accion: 'Lectura de expediente', endpoint: 'airtable:pacientes:GET' };
          }
        } else if (req.method === 'POST') {
          // Todo paciente que cree el médico queda atribuido a él.
          const recordIdMedico = await obtenerRecordIdMedico(codigo, AIRTABLE_TOKEN);
          if (!recordIdMedico) {
            return res.status(500).json({ error: 'No se pudo resolver el registro del médico.' });
          }
          const fields = (req.body && req.body.fields) || {};
          req.body.fields = { ...fields, 'Médico_principal': [recordIdMedico] };
          logAccesoExpediente = { pacienteCode: fields['Código de paciente'], codigoMedico: codigo, medicoRecId: recordIdMedico, accion: 'Escritura', endpoint: 'airtable:pacientes:POST' };
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
            if (!check.ok) {
              return res.status(502).json({ error: 'No se pudo verificar el registro antes de modificarlo.' });
            }
            const f = (await check.json()).fields || {};
            const codigoPacienteObjetivo = f['Código de paciente'] || buscado || '';
            const linkMedico = Array.isArray(f['Médico_principal']) ? f['Médico_principal'] : [];
            const esPropio = linkMedico.includes(recordIdMedico);
            const esInterconsultaPatch = esInterconsulta && f['Código de paciente'] === buscado;
            // Los pacientes demo son SOLO LECTURA para el médico (CLAUDE.md §4):
            // no se incluyen en la condición de escritura — solo propio o interconsulta.
            if (!esPropio && !esInterconsultaPatch) {
              await registrarAccesoExpediente({ pacienteCode: codigoPacienteObjetivo, codigoMedico: codigo, medicoRecId: recordIdMedico, accion: 'Escritura', resultado: 'Rechazado', endpoint: 'airtable:pacientes:PATCH' });
              return res.status(403).json({ error: 'No puedes modificar un paciente que no es tuyo.' });
            }
            logAccesoExpediente = { pacienteCode: codigoPacienteObjetivo, codigoMedico: codigo, medicoRecId: recordIdMedico, accion: 'Escritura', endpoint: 'airtable:pacientes:PATCH' };
          } catch (err) {
            return res.status(502).json({ error: 'No se pudo verificar el registro antes de modificarlo.' });
          }
        }
      }

      // ── HISTORIA / CONSULTAS / LABS: expediente de UN paciente. Antes de
      //    este bloque, un médico con sesión válida caía al reenvío
      //    genérico y podía leer o escribir el expediente de CUALQUIER
      //    paciente con solo cambiar el filterByFormula del query string
      //    (Pendiente 3 de 630c106). Ahora pasan por autorizarPaciente():
      //    la intención viaja en ?pacienteBuscado= explícito, nunca se
      //    parsea el filtro que mande el cliente.
      if (TABLAS_EXPEDIENTE_MEDICO.has(tabla)) {
        medicoFiltroAplicado = true;
        const campoDuenio = CAMPO_DUENIO[tabla];
        const pacienteBuscado = String(req.query.pacienteBuscado || '').trim();
        delete req.query.pacienteBuscado;
        // Solo CONSULTAS distingue "mis consultas" de "todas" (interconsulta);
        // el médico de referencia SIEMPRE es el del token, nunca uno que
        // mande el cliente en el query string.
        const soloMias = tabla === 'consultas' && req.query.soloMias === '1';
        delete req.query.soloMias;

        if (!pacienteBuscado) {
          return res.status(400).json({ error: 'Falta pacienteBuscado.' });
        }

        let auth;
        try {
          auth = await autorizarPaciente(codigo, pacienteBuscado, { requiereEscritura: req.method !== 'GET' });
        } catch (err) {
          if (err instanceof ErrorAutorizacion) {
            return res.status(err.status).json({ error: err.message });
          }
          return res.status(err.status || 502).json({ error: 'No se pudo verificar el acceso al paciente.' });
        }

        if (req.method === 'GET') {
          req.query.filterByFormula = soloMias
            ? `AND({${campoDuenio}}="${escaparFormula(auth.codigo)}", {Código de médico ref}="${escaparFormula(codigo)}")`
            : `{${campoDuenio}}="${escaparFormula(auth.codigo)}"`;
        } else if (req.method === 'POST') {
          const fields = (req.body && req.body.fields) || {};
          if (fields[campoDuenio] !== undefined && fields[campoDuenio] !== auth.codigo) {
            return res.status(403).json({ error: 'No puedes crear registros a nombre de otro código.' });
          }
          req.body.fields = { ...fields, [campoDuenio]: auth.codigo };
        } else if (req.method === 'PATCH') {
          const { recordId } = req.query;
          if (!recordId) return res.status(400).json({ error: 'Falta recordId.' });
          try {
            const check = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`, {
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
            });
            const checkData = await check.json();
            if (!check.ok || checkData.fields?.[campoDuenio] !== auth.codigo) {
              return res.status(403).json({ error: 'No puedes modificar un registro que no es de este paciente.' });
            }
          } catch (err) {
            return res.status(502).json({ error: 'No se pudo verificar el registro antes de modificarlo.' });
          }
        }
      }
    } else if (tipo === 'paciente' || tipo === 'vip') {
      // NOTA DE SEGURIDAD: `temp` NO está en estas whitelists a propósito.
      // TEMP guarda PII del funnel comercial (leads, WhatsApp, códigos DZW/
      // invitación) y no tiene CAMPO_DUENIO que ate una fila a un paciente/vip;
      // si estuviera aquí, un token autenticado caería al reenvío genérico y
      // podría volcar toda la tabla con un filterByFormula arbitrario. El único
      // acceso legítimo a temp es la vía PRE-AUTH de match exacto (invitaciones
      // DZW/referidos), que vive fuera de este bloque `if (sesion)`. NO reañadir.
      const tablasPermitidasRol =
        tipo === 'paciente'
          ? ['pacientes', 'historia', 'consultas', 'labs', 'protocolos']
          : ['pacientes_vip'];

      if (!tablasPermitidasRol.includes(tabla)) {
        return res.status(403).json({ error: 'Tu sesión no tiene acceso a esta información.' });
      }

      // `protocolos` es catálogo de referencia de SOLO LECTURA (ver líneas
      // 48-50). No tiene CAMPO_DUENIO, así que sin este corte caería al reenvío
      // genérico y aceptaría POST/PATCH — un paciente podría alterar
      // indicaciones/contraindicaciones del catálogo clínico.
      if (tabla === 'protocolos' && req.method !== 'GET') {
        return res.status(403).json({ error: 'No permitido: el catálogo de protocolos es de solo lectura.' });
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

  // ── Red de seguridad: un médico nunca llega al reenvío genérico contra
  //    una tabla de expediente sin haber pasado por un filtro real. Si
  //    alguien agrega una tabla a TABLAS_EXPEDIENTE_MEDICO (o a la lista de
  //    'pacientes' de arriba) y olvida escribir su bloque de autorización,
  //    esto la bloquea en vez de dejarla caer al filterByFormula crudo del
  //    cliente — falla cerrado (CLAUDE.md §4).
  if (
    sesion &&
    sesion.tipo === 'medico' &&
    (tabla === 'pacientes' || TABLAS_EXPEDIENTE_MEDICO.has(tabla)) &&
    !medicoFiltroAplicado
  ) {
    return res.status(403).json({ error: 'Paciente no disponible' });
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
      if (logAccesoExpediente) {
        const encontrado = airtableRes.ok && Array.isArray(data.records) && data.records.length > 0;
        await registrarAccesoExpediente({ ...logAccesoExpediente, resultado: encontrado ? 'Exitoso' : 'Paciente no encontrado' });
      }
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
      // Un 5xx/4xx aquí es una falla de Airtable al crear, no una decisión
      // de acceso — no hay categoría de Resultado para eso (regla dura #1
      // habla de "código inexistente" y "rechazado", no de infraestructura).
      if (logAccesoExpediente && airtableRes.ok) {
        await registrarAccesoExpediente({ ...logAccesoExpediente, resultado: 'Exitoso' });
      }
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
      // El caso Rechazado (paciente ajeno) ya se registró antes de llegar
      // aquí — este bloque solo corre cuando la autorización sí lo permitió.
      if (logAccesoExpediente && airtableRes.ok) {
        await registrarAccesoExpediente({ ...logAccesoExpediente, resultado: 'Exitoso' });
      }
      return res.status(airtableRes.status).json(data);
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al conectar con Airtable.', detail: String(err) });
  }
};
