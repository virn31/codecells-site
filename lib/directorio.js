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
const VERSION_CONSENTIMIENTO = 'v1.2-borrador 2026-10-23';
const TEXTO_CONSENTIMIENTO =
  'Autorizo a CODE CELLS™ a publicar en su directorio médico público los datos profesionales que capturé en mi perfil: ' +
  'nombre público, fotografía, avatar o logotipo (si lo subí), ciudad de consulta, especialidades, herramientas que ofrezco, presentación, horarios, medios de contacto de mi consultorio y las ligas a mis redes sociales y sitio web profesionales. ' +
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
  'Foto de perfil',
]);

// Campos que ve el público. Si el médico cambia uno de estos en un perfil
// ya publicado, el perfil sigue visible pero queda marcado para revisión.
const CAMPOS_PUBLICOS = Object.freeze([
  'Name',
  'Foto de perfil',
  'Especialidades visibles',
  'Tratamientos que ofrece',
  'Otras terapias',
  'Ciudad de consulta',
  'Bio corta',
  'Horarios',
  'WhatsApp público',
  'Teléfono de consultorio',
  'Instagram',
  'Facebook',
  'TikTok',
  'YouTube',
  'LinkedIn',
  'Sitio web',
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

// ── Foto de perfil ──────────────────────────────────────────────────
// La sube solo api/directorio.js (subir_foto). El portal la recorta a un
// cuadrado de 400 px y la vuelve a codificar, lo que además quita los
// metadatos (GPS, cámara). Aquí se revisa lo que de verdad llegó: el tipo
// se decide por los primeros bytes del archivo, no por lo que diga el cliente.
const CAMPO_FOTO = 'Foto de perfil';
const FOTO_MAX_BYTES = 1024 * 1024;
const FOTO_TIPOS = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });

function tipoDeImagen(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function validarFoto(body) {
  const b = body || {};
  const base64 = String(b.base64 || '').replace(/^data:[^,]*,/, '');
  if (!base64) return { ok: false, error: 'No llegó ninguna imagen.' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { ok: false, error: 'La imagen llegó dañada. Intenta de nuevo.' };
  const buf = Buffer.from(base64, 'base64');
  if (buf.length > FOTO_MAX_BYTES) return { ok: false, error: 'La imagen pesa demasiado (máximo 1 MB ya recortada).' };
  const tipo = tipoDeImagen(buf);
  if (!tipo) return { ok: false, error: 'Solo se aceptan imágenes JPG, PNG o WebP.' };
  if (b.contentType && b.contentType !== tipo) return { ok: false, error: 'El tipo de la imagen no coincide con su contenido.' };
  return { ok: true, tipo, extension: FOTO_TIPOS[tipo], base64, bytes: buf.length };
}

// URL pública de la foto (miniatura grande si Airtable ya la generó). Las
// URLs de Airtable caducan en unas horas: se piden frescas en cada lectura.
function urlFotoPublica(adjuntos) {
  const a = Array.isArray(adjuntos) ? adjuntos[adjuntos.length - 1] : null;
  if (!a) return null;
  const u = (a.thumbnails && a.thumbnails.large && a.thumbnails.large.url) || a.url || '';
  return /^https:\/\//.test(u) ? u : null;
}

// ── Redes sociales y sitio web ─────────────────────────────────────
// El médico escribe la liga o solo su usuario (@consultorio); se guarda
// SIEMPRE como liga https completa. Cada red solo acepta su propio dominio:
// un "Instagram" que apunta a otro sitio se rechaza, porque el paciente
// confía en el ícono y no lee la liga.
const REDES = Object.freeze([
  { campo: 'Instagram', dominios: ['instagram.com'], usuario: u => `https://www.instagram.com/${u}` },
  { campo: 'Facebook', dominios: ['facebook.com', 'fb.com'], usuario: u => `https://www.facebook.com/${u}` },
  { campo: 'TikTok', dominios: ['tiktok.com'], usuario: u => `https://www.tiktok.com/@${u}` },
  { campo: 'YouTube', dominios: ['youtube.com', 'youtu.be'], usuario: u => `https://www.youtube.com/@${u}` },
  { campo: 'LinkedIn', dominios: ['linkedin.com'], usuario: null },
  { campo: 'Sitio web', dominios: null, usuario: null },
]);
const CAMPOS_REDES = Object.freeze(REDES.map(r => r.campo));

// Devuelve { ok, valor } con la liga normalizada ('' = borrar) o { ok:false, error }.
function normalizarRed(campo, entrada) {
  const red = REDES.find(r => r.campo === campo);
  if (!red) return { ok: false, error: `Red desconocida: ${campo}` };
  const texto = String(entrada == null ? '' : entrada).trim();
  if (!texto) return { ok: true, valor: '' };
  if (texto.length > 300) return { ok: false, error: `La liga de ${campo} es demasiado larga.` };

  // Solo usuario: sin "/" ni esquema, y no es el dominio de la red tal cual
  // ("dr.rodriguez" es usuario de Instagram; "instagram.com" no).
  const usuario = texto.replace(/^@/, '');
  const pareceLiga = /^[a-z][a-z0-9+.-]*:/i.test(texto) || texto.includes('/') ||
    (red.dominios || []).some(d => usuario.toLowerCase() === d || usuario.toLowerCase().endsWith('.' + d));
  if (red.usuario && !pareceLiga && /^[A-Za-z0-9._-]{1,60}$/.test(usuario)) {
    return { ok: true, valor: red.usuario(usuario) };
  }

  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : 'https://' + texto);
  } catch (e) {
    return { ok: false, error: `No reconocemos la liga de ${campo}. Cópiala tal cual desde tu perfil.` };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: `La liga de ${campo} debe empezar con https://` };
  }
  if (url.username || url.password) return { ok: false, error: `La liga de ${campo} no es válida.` };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // Sin direcciones IP ni nombres sin dominio (localhost, servidores internos).
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) {
    return { ok: false, error: `La liga de ${campo} no es válida.` };
  }
  if (red.dominios && !red.dominios.some(d => host === d || host.endsWith('.' + d))) {
    return { ok: false, error: `Esa liga no es de ${campo}. Revisa que la copiaste de tu perfil de ${campo}.` };
  }
  url.protocol = 'https:';
  url.hash = '';
  return { ok: true, valor: url.toString() };
}

// Normaliza las redes que vengan en `fields` (las demás claves no se tocan).
// Devuelve { fields, errores } — con errores no se debe guardar nada.
function normalizarRedes(fields) {
  const salida = { ...(fields || {}) };
  const errores = [];
  for (const campo of CAMPOS_REDES) {
    if (!(campo in salida)) continue;
    const r = normalizarRed(campo, salida[campo]);
    if (r.ok) salida[campo] = r.valor;
    else errores.push(r.error);
  }
  return { fields: salida, errores };
}

// Para lo que sale al público: solo ligas que pasan la misma regla (por si
// alguien las escribió directo en Airtable).
function redesPublicas(campos) {
  const c = campos || {};
  const out = {};
  for (const campo of CAMPOS_REDES) {
    if (!c[campo]) continue;
    const r = normalizarRed(campo, c[campo]);
    if (r.ok && r.valor) out[campo] = r.valor;
  }
  return out;
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
  CAMPO_FOTO,
  FOTO_MAX_BYTES,
  tipoDeImagen,
  validarFoto,
  urlFotoPublica,
  REDES,
  CAMPOS_REDES,
  normalizarRed,
  normalizarRedes,
  redesPublicas,
};
