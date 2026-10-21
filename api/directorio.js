// api/directorio.js
// Flujo de publicación del directorio médico (etapa 1, 2026-10-21).
//
//   Médico (sesión tipo 'medico'):
//     GET  ?accion=mi_estado              → estado de su perfil + texto del consentimiento
//     POST ?accion=solicitar_publicacion  → acepta el consentimiento → "En revisión"
//     POST ?accion=despublicar            → retira su perfil de inmediato
//   Administrador del directorio (ADMIN_DIRECTORIO, por defecto VIRN01 y JCG01):
//     GET  ?accion=admin_perfiles         → todos los perfiles con su estado y la cédula del médico
//     POST ?accion=admin_aprobar          → { recordId } publica (exige consentimiento registrado)
//     POST ?accion=admin_rechazar         → { recordId, motivo } (motivo obligatorio)
//     POST ?accion=admin_despublicar      → { recordId, motivo }
//
// Reglas: el médico nunca pone `Publicado` por su cuenta (api/airtable.js
// quita esos campos); cada transición queda en "Historial de publicación";
// un fallo de Airtable se responde como fallo (502), nunca como "sin datos".

const { verificarToken, tokenDesdeRequest } = require('../lib/auth');
const { CONGELADO, respuestaCongelada } = require('../lib/congelamientoDatosPersonales');
const { sendTelegramMessage } = require('../lib/telegram');
const D = require('../lib/directorio');

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA'); // base del ambiente (Preview = prueba)
const TBL_DIRECTORIO = 'tblkUNPwu1sQgZBPJ';
const TBL_MEDICOS = 'tbl87DsuBMmb4DjFM';

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

const escapar = v => String(v).replace(/"/g, '\\"');

async function medicoPorCodigo(codigo) {
  const d = await at(`${TBL_MEDICOS}?${new URLSearchParams({ filterByFormula: `{Código de médico}="${escapar(codigo)}"`, maxRecords: '1' })}`);
  return (d.records || [])[0] || null;
}

// Perfil del médico. La liga 'Médico' guarda recordIds; se compara por id
// (ARRAYJOIN devolvería el código, que también sirve, pero el id no es ambiguo).
async function perfilDeMedico(medicoRecId) {
  const todos = await leerTodo(TBL_DIRECTORIO, {});
  return todos.find(r => (r.fields['Médico'] || []).includes(medicoRecId)) || null;
}

function resumenPerfil(rec) {
  const c = rec.fields || {};
  return {
    id: rec.id,
    estado: D.estadoEfectivo(c),
    publicado: !!c['Publicado'],
    tieneConsentimiento: D.tieneConsentimiento(c),
    versionConsentimiento: c['Consentimiento — versión'] || null,
    fechaConsentimiento: c['Consentimiento — fecha'] || null,
    cambiosSinRevisar: !!c['Cambios sin revisar'],
    motivoRechazo: c['Motivo de rechazo'] || null,
    faltantes: D.faltantesParaPublicar(c),
  };
}

async function avisarTelegram(chatId, texto) {
  if (!chatId) return 'sin chat';
  try { await sendTelegramMessage(chatId, texto); return 'enviado'; }
  catch (e) { console.error('[directorio] aviso Telegram falló:', e.message); return 'falló'; }
}

const ambiente = () => (BASE_ID === 'app6jyD9pDlTLpknA' ? '' : '\n(Ambiente: prueba)');

module.exports = async (req, res) => {
  const sesion = verificarToken(tokenDesdeRequest(req));
  if (!sesion || sesion.tipo !== 'medico') {
    return res.status(401).json({ error: 'Sesión médica requerida.' });
  }
  const codigo = sesion.codigo;
  const accion = String(req.query.accion || '');
  const ahora = new Date().toISOString();
  const esAdmin = D.esAdminDirectorio(codigo, process.env);

  try {
    // ── Médico ────────────────────────────────────────────────────────
    if (accion === 'mi_estado' && req.method === 'GET') {
      const med = await medicoPorCodigo(codigo);
      if (!med) return res.status(404).json({ error: 'No encontramos tu registro de médico.' });
      const perfil = await perfilDeMedico(med.id);
      return res.status(200).json({
        perfil: perfil ? resumenPerfil(perfil) : null,
        consentimiento: { version: D.VERSION_CONSENTIMIENTO, texto: D.TEXTO_CONSENTIMIENTO },
        esAdmin,
      });
    }

    if (accion === 'solicitar_publicacion' && req.method === 'POST') {
      if (CONGELADO) return respuestaCongelada(res);
      const b = req.body || {};
      if (b.acepto !== true || b.version !== D.VERSION_CONSENTIMIENTO) {
        return res.status(400).json({ error: 'Debes aceptar el consentimiento vigente para solicitar la publicación.' });
      }
      const med = await medicoPorCodigo(codigo);
      if (!med) return res.status(404).json({ error: 'No encontramos tu registro de médico.' });
      const perfil = await perfilDeMedico(med.id);
      if (!perfil) return res.status(404).json({ error: 'Primero crea tu perfil.' });
      const faltan = D.faltantesParaPublicar(perfil.fields);
      if (faltan.length) return res.status(400).json({ error: 'Falta completar: ' + faltan.join(', ') + '.', faltantes: faltan });
      const estado = D.estadoEfectivo(perfil.fields);
      if (estado === D.ESTADOS.EN_REVISION) return res.status(409).json({ error: 'Tu solicitud ya está en revisión.' });
      if (estado === D.ESTADOS.PUBLICADO && D.tieneConsentimiento(perfil.fields)) {
        return res.status(409).json({ error: 'Tu perfil ya está publicado.' });
      }
      const fields = {
        ...D.sellarConsentimiento({ codigo, ip: D.ipDeRequest(req), navegador: req.headers['user-agent'], fechaISO: ahora }),
        'Estado de publicación': D.ESTADOS.EN_REVISION,
        'Publicado': false,
        'Cambios sin revisar': false,
        'Motivo de rechazo': '',
        'Historial de publicación': D.agregarHistorial(perfil.fields['Historial de publicación'], {
          fechaISO: ahora, accion: 'Solicitud de publicación', quien: codigo, detalle: `consentimiento ${D.VERSION_CONSENTIMIENTO}`,
        }),
      };
      const act = await at(`${TBL_DIRECTORIO}/${perfil.id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
      const aviso = await avisarTelegram(process.env.TELEGRAM_CHAT_ID,
        `Directorio: nueva solicitud de publicación\nMédico: ${codigo}\nPerfil: ${perfil.fields['Name'] || '(sin nombre)'}\nRevísala en /admin-directorio.html${ambiente()}`);
      return res.status(200).json({ ok: true, perfil: resumenPerfil(act), avisoAdministradores: aviso });
    }

    if (accion === 'despublicar' && req.method === 'POST') {
      // Retirar el consentimiento reduce lo que se expone: se permite aun con
      // producción congelada (es el ejercicio de un derecho, no captación).
      const med = await medicoPorCodigo(codigo);
      if (!med) return res.status(404).json({ error: 'No encontramos tu registro de médico.' });
      const perfil = await perfilDeMedico(med.id);
      if (!perfil) return res.status(404).json({ error: 'No tienes perfil.' });
      const fields = {
        'Publicado': false,
        'Estado de publicación': D.ESTADOS.DESPUBLICADO,
        'Cambios sin revisar': false,
        'Historial de publicación': D.agregarHistorial(perfil.fields['Historial de publicación'], {
          fechaISO: ahora, accion: 'Despublicado por el médico', quien: codigo,
        }),
      };
      const act = await at(`${TBL_DIRECTORIO}/${perfil.id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
      return res.status(200).json({ ok: true, perfil: resumenPerfil(act) });
    }

    // ── Administración ────────────────────────────────────────────────
    if (accion.startsWith('admin_')) {
      if (!esAdmin) return res.status(403).json({ error: 'Solo los administradores del directorio pueden hacer esto.' });

      if (accion === 'admin_perfiles' && req.method === 'GET') {
        const perfiles = await leerTodo(TBL_DIRECTORIO, {});
        const idsMedicos = [...new Set(perfiles.flatMap(p => p.fields['Médico'] || []))];
        const medicos = {};
        for (let i = 0; i < idsMedicos.length; i += 50) {
          const lote = idsMedicos.slice(i, i + 50);
          const recs = await leerTodo(TBL_MEDICOS, { filterByFormula: `OR(${lote.map(id => `RECORD_ID()="${id}"`).join(',')})` });
          recs.forEach(m => { medicos[m.id] = m.fields; });
        }
        const lista = perfiles.map(p => {
          const c = p.fields || {};
          const m = medicos[(c['Médico'] || [])[0]] || null;
          return {
            ...resumenPerfil(p),
            nombrePublico: c['Name'] || '',
            ciudad: c['Ciudad de consulta'] || '',
            especialidades: c['Especialidades visibles'] || [],
            tratamientos: c['Tratamientos que ofrece'] || [],
            bio: c['Bio corta'] || '',
            horarios: c['Horarios'] || '',
            telefono: c['Teléfono de consultorio'] || '',
            whatsapp: c['WhatsApp público'] || '',
            revisadoPor: c['Revisado por'] || null,
            fechaRevision: c['Fecha de revisión'] || null,
            historial: c['Historial de publicación'] || '',
            medico: m ? {
              codigo: m['Código de médico'] || null,
              nombre: m['Nombre completo'] || null,
              cedula: m['Cédula profesional'] || null,
            } : null,
          };
        });
        return res.status(200).json({ perfiles: lista });
      }

      if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
      const { recordId, motivo } = req.body || {};
      if (!/^rec[A-Za-z0-9]{14}$/.test(String(recordId || ''))) return res.status(400).json({ error: 'recordId inválido.' });
      const rec = await at(`${TBL_DIRECTORIO}/${recordId}`);
      const c = rec.fields || {};
      const medicoRecId = (c['Médico'] || [])[0];
      const avisarMedico = async texto => {
        if (!medicoRecId) return 'sin médico ligado';
        try {
          const m = await at(`${TBL_MEDICOS}/${medicoRecId}`);
          return await avisarTelegram(m.fields && m.fields['Telegram Chat ID'], texto + ambiente());
        } catch (e) { return 'falló'; }
      };

      if (accion === 'admin_aprobar') {
        if (CONGELADO) return respuestaCongelada(res);
        if (!D.tieneConsentimiento(c)) {
          return res.status(409).json({ error: 'Este perfil no tiene consentimiento registrado: el médico debe solicitar la publicación desde su portal.' });
        }
        const faltan = D.faltantesParaPublicar(c);
        if (faltan.length) return res.status(409).json({ error: 'Al perfil le falta: ' + faltan.join(', ') + '.' });
        const fields = {
          'Publicado': true,
          'Estado de publicación': D.ESTADOS.PUBLICADO,
          'Cambios sin revisar': false,
          'Motivo de rechazo': '',
          'Revisado por': codigo,
          'Fecha de revisión': ahora,
          ...(c['Fecha de alta'] ? {} : { 'Fecha de alta': ahora }),
          'Historial de publicación': D.agregarHistorial(c['Historial de publicación'], {
            fechaISO: ahora, accion: c['Cambios sin revisar'] && c['Publicado'] ? 'Cambios revisados' : 'Aprobado y publicado', quien: codigo,
          }),
        };
        const act = await at(`${TBL_DIRECTORIO}/${recordId}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
        const aviso = await avisarMedico('CODE CELLS: tu perfil del directorio médico fue aprobado y ya es visible para los pacientes.');
        return res.status(200).json({ ok: true, perfil: resumenPerfil(act), avisoMedico: aviso });
      }

      if (accion === 'admin_rechazar' || accion === 'admin_despublicar') {
        const texto = String(motivo || '').trim().slice(0, 1000);
        if (accion === 'admin_rechazar' && !texto) return res.status(400).json({ error: 'Escribe el motivo del rechazo: el médico lo verá.' });
        if (accion === 'admin_rechazar' && CONGELADO) return respuestaCongelada(res);
        const rechazar = accion === 'admin_rechazar';
        const fields = {
          'Publicado': false,
          'Estado de publicación': rechazar ? D.ESTADOS.RECHAZADO : D.ESTADOS.DESPUBLICADO,
          'Cambios sin revisar': false,
          'Revisado por': codigo,
          'Fecha de revisión': ahora,
          ...(rechazar ? { 'Motivo de rechazo': texto } : {}),
          'Historial de publicación': D.agregarHistorial(c['Historial de publicación'], {
            fechaISO: ahora, accion: rechazar ? 'Rechazado' : 'Despublicado por administración', quien: codigo, detalle: texto,
          }),
        };
        const act = await at(`${TBL_DIRECTORIO}/${recordId}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
        const aviso = await avisarMedico(rechazar
          ? `CODE CELLS: tu solicitud de publicación en el directorio necesita cambios. Motivo: ${texto}. Corrígelo desde tu portal y vuelve a solicitarla.`
          : `CODE CELLS: tu perfil fue retirado del directorio.${texto ? ' Motivo: ' + texto : ''}`);
        return res.status(200).json({ ok: true, perfil: resumenPerfil(act), avisoMedico: aviso });
      }
    }

    return res.status(400).json({ error: 'Acción no reconocida.' });
  } catch (e) {
    if (e instanceof ErrorAirtable) {
      console.error('[directorio]', accion, e.status, JSON.stringify(e.detalle).slice(0, 300));
      return res.status(502).json({ error: 'No pudimos completar la operación con la base de datos. Revisa el estado de tu perfil e intenta de nuevo.' });
    }
    console.error('[directorio]', accion, e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
