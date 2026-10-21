// lib/directorio.js
// Reglas del flujo de publicación del directorio médico (etapa 1, 2026-10-21):
//   alta → el médico SOLICITA publicar aceptando un consentimiento versionado
//   → un administrador revisa (cédula, datos) → aprueba / rechaza → publicado.
// El médico ya NO pone `Publicado` por su cuenta: eso lo decide el servidor
// (api/directorio.js). Despublicar sí es inmediato: retirar el consentimiento
// nunca espera revisión.
//
// Funciones puras (sin red) para poder probarlas en test/directorio-publicacion.test.js.

const crypto = require('crypto');

// Texto que el médico acepta. Cambiar el texto = subir la versión: la huella
// guardada en cada perfil prueba qué texto exacto aceptó.
// PENDIENTE: revisión del abogado (por eso "borrador" en la versión).
const VERSION_CONSENTIMIENTO = 'v1.0-borrador 2026-10-21';
const TEXTO_CONSENTIMIENTO =
  'Autorizo a CODE CELLS™ a publicar en su directorio médico público los datos profesionales que capturé en mi perfil: ' +
  'nombre público, ciudad de consulta, especialidades, herramientas que ofrezco, presentación, horarios y medios de contacto de mi consultorio. ' +
  'Declaro que estos datos son verídicos y que los medios de contacto pertenecen a mi práctica profesional. ' +
  'Entiendo que mi perfil será revisado antes de publicarse, que puedo despublicarlo en cualquier momento desde mi portal ' +
  'y que mi nivel interno en la Red nunca se muestra al público. ' +
  'Este consentimiento queda registrado con fecha, hora, dirección IP y navegador.';

const ESTADOS = Object.freeze({
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  PUBLICADO: 'Publicado',
  RECHAZADO: 'Rechazado',
  DESPUBLICADO: 'Despublicado',
});

// Campos que solo escribe el servidor. El médico nunca los manda por el
// proxy genérico (api/airtable.js los quita antes de reenviar).
const CAMPOS_PROTEGIDOS = Object.freeze([
  'Médico',
  'Publicado',
  'Fecha de alta',
  'Estado de publicación',
  'Cambios sin revisar',
  'Consentimiento — versión',
  'Consentimiento — fecha',
  'Consentimiento — IP',
  'Consentimiento — navegador',
  'Consentimiento — huella',
  'Revisado por',
  'Fecha de revisión',
  'Motivo de rechazo',
  'Historial de publicación',
]);

// Campos que ve el público. Si el médico cambia uno de estos en un perfil
// ya publicado, el perfil sigue visible pero queda marcado para revisión.
const CAMPOS_PUBLICOS = Object.freeze([
  'Name',
  'Especialidades visibles',
  'Tratamientos que ofrece',
  'Otras terapias',
  'Ciudad de consulta',
  'Bio corta',
  'Horarios',
  'WhatsApp público',
  'Teléfono de consultorio',
]);

const ADMINS_POR_DEFECTO = Object.freeze(['CCMED-VIRN01', 'CCMED-JCG01']);

function quitarCamposProtegidos(fields) {
  const limpio = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (!CAMPOS_PROTEGIDOS.includes(k)) limpio[k] = v;
  }
  return limpio;
}

function tocaCamposPublicos(fields) {
  return Object.keys(fields || {}).some(k => CAMPOS_PUBLICOS.includes(k));
}

// Estado real de un perfil, también para los que existían antes de este
// flujo (sin "Estado de publicación"): si estaba publicado, sigue siéndolo,
// pero se reporta que no tiene consentimiento registrado.
function estadoEfectivo(campos) {
  const c = campos || {};
  const estado = c['Estado de publicación'];
  if (estado) return estado;
  return c['Publicado'] ? ESTADOS.PUBLICADO : ESTADOS.BORRADOR;
}

function tieneConsentimiento(campos) {
  const c = campos || {};
  return !!(c['Consentimiento — versión'] && c['Consentimiento — fecha'] && c['Consentimiento — huella']);
}

// Lo mínimo para que un perfil tenga sentido en el directorio. Devuelve la
// lista de lo que falta (vacía = puede solicitar publicación).
function faltantesParaPublicar(campos) {
  const c = campos || {};
  const faltan = [];
  if (!String(c['Name'] || '').trim()) faltan.push('Nombre público');
  if (!String(c['Ciudad de consulta'] || '').trim()) faltan.push('Ciudad de consulta');
  if (!(c['Especialidades visibles'] || []).length) faltan.push('Al menos una especialidad');
  return faltan;
}

function huellaConsentimiento({ version, texto, codigo, fechaISO }) {
  return crypto.createHash('sha256').update([version, texto, codigo, fechaISO].join('\n')).digest('hex');
}

// Campos que estampa el servidor cuando el médico acepta. La fecha es la del
// servidor, nunca la del navegador.
function sellarConsentimiento({ codigo, ip, navegador, fechaISO }) {
  return {
    'Consentimiento — versión': VERSION_CONSENTIMIENTO,
    'Consentimiento — fecha': fechaISO,
    'Consentimiento — IP': String(ip || 'desconocida').slice(0, 100),
    'Consentimiento — navegador': String(navegador || 'desconocido').slice(0, 250),
    'Consentimiento — huella': huellaConsentimiento({
      version: VERSION_CONSENTIMIENTO,
      texto: TEXTO_CONSENTIMIENTO,
      codigo,
      fechaISO,
    }),
  };
}

function agregarHistorial(previo, { fechaISO, accion, quien, detalle }) {
  const linea = [fechaISO, accion, quien, detalle].filter(Boolean).join(' | ').replace(/\n/g, ' ');
  return previo ? `${previo}\n${linea}` : linea;
}

function listaAdmins(env) {
  const raw = (env && env.ADMIN_DIRECTORIO) || '';
  const lista = raw.split(',').map(s => s.trim()).filter(Boolean);
  return lista.length ? lista : [...ADMINS_POR_DEFECTO];
}

function esAdminDirectorio(codigo, env) {
  return !!codigo && listaAdmins(env).includes(codigo);
}

function ipDeRequest(req) {
  const xff = req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For']);
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'desconocida';
}

module.exports = {
  VERSION_CONSENTIMIENTO,
  TEXTO_CONSENTIMIENTO,
  ESTADOS,
  CAMPOS_PROTEGIDOS,
  CAMPOS_PUBLICOS,
  quitarCamposProtegidos,
  tocaCamposPublicos,
  estadoEfectivo,
  tieneConsentimiento,
  faltantesParaPublicar,
  huellaConsentimiento,
  sellarConsentimiento,
  agregarHistorial,
  listaAdmins,
  esAdminDirectorio,
  ipDeRequest,
};
