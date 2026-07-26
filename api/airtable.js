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

const { verificarToken, tokenDesdeRequest } = require('../lib/auth');

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

function escaparFormula(valor) {
  return String(valor).replace(/"/g, '\\"');
}

// Para el flujo de invitaciones (dezawavip.html con ?inv=, o ?from= de
// referidos) el paciente todavía NO tiene sesión — es imposible pedirle un
// token antes de que exista la invitación. Se permite, sin token, ÚNICAMENTE
// una búsqueda de un registro exacto en `temp` por "Código invitación" o
// "Código propio" — nunca una lista completa ni ningún otro filtro.
function esBusquedaDeInvitacionValida(tabla, filterByFormula) {
  if (tabla !== 'temp' || !filterByFormula) return false;
  return /^\{(Código invitación|Código propio)\}="[^"]*"$/.test(filterByFormula);
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
  const esBusquedaInvitacion =
    req.method === 'GET' && esBusquedaDeInvitacionValida(tabla, req.query.filterByFormula);

  if (!sesion && !esLecturaPublicaPermitida && !esBusquedaInvitacion) {
    return res.status(401).json({ error: 'Sesión no válida o expirada. Inicia sesión de nuevo.' });
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
