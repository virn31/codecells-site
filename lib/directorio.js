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
const VERSION_CONSENTIMIENTO = 'v1.6-borrador 2026-10-24';
const TEXTO_CONSENTIMIENTO =
  'Autorizo a CODE CELLS™ a publicar en su directorio médico público los datos profesionales que capturé en mi perfil: ' +
  'nombre público, fotografía, avatar o logotipo (si lo subí), ciudad de consulta, especialidades, herramientas que ofrezco, presentación, horarios, costo de la consulta presencial, si ofrezco consulta en línea y su costo (si los capturé), dirección y medios de contacto de mi consultorio y las ligas a mis redes sociales, WhatsApp y sitio web profesionales. ' +
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
  'Liga pública',
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
  'Costo de consulta',
  'Consulta en línea',
  'Costo de consulta en línea',
  'Dirección del consultorio',
  'Teléfono de consultorio',
  'WhatsApp público',
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
  // 2026-10-24 (Víctor): el WhatsApp del médico es opcional y público, como
  // sus redes: la ficha muestra la liga que él publicó y el paciente la abre
  // en su teléfono. CODE CELLS no pide ni manda nada por WhatsApp.
  { campo: 'WhatsApp público', etiqueta: 'WhatsApp', whatsapp: true },
]);
const CAMPOS_REDES = Object.freeze(REDES.map(r => r.campo));

// Devuelve { ok, valor } con la liga normalizada ('' = borrar) o { ok:false, error }.
function normalizarRed(campo, entrada) {
  const red = REDES.find(r => r.campo === campo);
  if (!red) return { ok: false, error: `Red desconocida: ${campo}` };
  const texto = String(entrada == null ? '' : entrada).trim();
  if (!texto) return { ok: true, valor: '' };
  if (texto.length > 300) return { ok: false, error: `La liga de ${campo} es demasiado larga.` };
  if (red.whatsapp) return normalizarWhatsApp(texto);

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

// WhatsApp: el médico escribe su número o pega su liga (wa.me o
// api.whatsapp.com). Se guarda siempre como https://wa.me/<número> SIN
// mensaje pre-escrito: la plataforma no redacta nada por el médico.
// 10 dígitos = México (+52); el "521" viejo se quita.
const ERROR_WHATSAPP = 'Escribe tu número de WhatsApp a 10 dígitos o pega tu liga wa.me.';
function numeroWhatsApp(digitos) {
  let d = digitos;
  if (d.length === 10) d = '52' + d;
  else if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3);
  return d.length >= 11 && d.length <= 15 ? d : '';
}
function normalizarWhatsApp(texto) {
  let digitos = '';
  if (/^[+\d\s().-]+$/.test(texto)) {
    digitos = texto.replace(/\D/g, '');
  } else {
    let url;
    try { url = new URL(/^https?:\/\//i.test(texto) ? texto : 'https://' + texto); } catch (e) { return { ok: false, error: ERROR_WHATSAPP }; }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.username || url.password) return { ok: false, error: ERROR_WHATSAPP };
    if (host === 'wa.me') {
      // Liga corta de WhatsApp Business (wa.me/message/CODIGO)
      const m = url.pathname.match(/^\/message\/([A-Za-z0-9]{6,40})\/?$/);
      if (m) return { ok: true, valor: `https://wa.me/message/${m[1]}` };
      digitos = (url.pathname.match(/^\/\+?(\d+)\/?$/) || [])[1] || '';
    } else if (host === 'api.whatsapp.com' || host === 'whatsapp.com') {
      if (!/^\/send\/?$/.test(url.pathname)) return { ok: false, error: ERROR_WHATSAPP };
      digitos = String(url.searchParams.get('phone') || '').replace(/\D/g, '');
    } else if (host.endsWith('.whatsapp.com')) {
      return { ok: false, error: 'Las ligas de grupos o canales no sirven aquí. ' + ERROR_WHATSAPP };
    } else {
      return { ok: false, error: 'Esa liga no es de WhatsApp. ' + ERROR_WHATSAPP };
    }
  }
  const n = numeroWhatsApp(digitos);
  return n ? { ok: true, valor: `https://wa.me/${n}` } : { ok: false, error: ERROR_WHATSAPP };
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

// ── Teléfono del consultorio ───────────────────────────────────────
// 2026-10-24 (Víctor): la plataforma no pide ni manda nada por WhatsApp. El
// paciente llama al consultorio con un enlace tel: normal. (El WhatsApp del
// médico, si lo quiere publicar, es una red social más: ver REDES.)
function normalizarTelefono(valor) {
  const texto = String(valor == null ? '' : valor).trim();
  if (!texto) return { ok: true, valor: '' };
  const digitos = texto.replace(/\D/g, '');
  if (!/^[+\d\s().-]+$/.test(texto) || digitos.length < 10 || digitos.length > 13) {
    return { ok: false, error: 'El teléfono del consultorio debe tener 10 dígitos (puede llevar la lada +52).' };
  }
  return { ok: true, valor: (texto.startsWith('+') ? '+' : '') + digitos };
}

// Dirección del consultorio: texto del médico, público en la ficha con
// "Cómo llegar". Se limpian espacios y renglones vacíos; una liga no es una
// dirección (el botón de mapa lo arma la plataforma).
const CAMPO_DIRECCION = 'Dirección del consultorio';
function normalizarDireccion(valor) {
  const texto = String(valor == null ? '' : valor)
    .split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4).join('\n');
  if (!texto) return { ok: true, valor: '' };
  if (texto.length > 300) return { ok: false, error: 'La dirección es demasiado larga (máximo 300 caracteres).' };
  if (/https?:\/\/|www\./i.test(texto)) return { ok: false, error: 'Escribe la dirección (calle, número, colonia), no una liga: el botón "Cómo llegar" se arma solo.' };
  return { ok: true, valor: texto };
}

// Liga a mapas sin cuenta ni llave de ningún servicio: abre la app de mapas
// del teléfono o la web. '' si no hay dirección.
function enlaceMapa(direccion, ciudad) {
  const dir = String(direccion || '').split(/\n+/).map(x => x.trim()).filter(Boolean).join(', ');
  if (!dir) return '';
  const partes = [dir, normalizarCiudad(ciudad), 'México'].filter(Boolean);
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(partes.join(', '));
}

// Costo de la consulta: opcional, lo decide el médico y se paga en su
// consultorio (la plataforma solo lo informa). Pesos enteros: "$1,200",
// "1200 MXN" → 1200. Vacío → null (Airtable borra el número).
const CAMPO_COSTO = 'Costo de consulta';
const COSTO_MAXIMO = 100000;
function normalizarCosto(valor) {
  if (valor == null || String(valor).trim() === '') return { ok: true, valor: null };
  const texto = typeof valor === 'number' ? String(valor)
    : String(valor).replace(/\s+/g, '').replace(/^\$/, '').replace(/(mxn|pesos?)$/i, '').replace(/,(?=\d{3}(\D|$))/g, '');
  if (!/^\d+(\.0+)?$/.test(texto)) return { ok: false, error: 'Escribe el costo como un número en pesos (por ejemplo 800), sin centavos ni rangos.' };
  const n = parseInt(texto, 10);
  if (n < 1 || n > COSTO_MAXIMO) return { ok: false, error: 'El costo debe estar entre $1 y $100,000. Si no quieres mostrarlo, déjalo vacío.' };
  return { ok: true, valor: n };
}
// Consulta en línea: el médico la ofrece o no, con su propio costo. Horario
// y pago se acuerdan directo entre médico y paciente (p. ej. transferencia);
// CODE CELLS no cobra ni interviene. El costo solo se publica si la casilla
// está marcada.
const CAMPO_EN_LINEA = 'Consulta en línea';
const CAMPO_COSTO_EN_LINEA = 'Costo de consulta en línea';

// "$1,200 MXN"; '' si no hay costo válido.
function costoLegible(valor) {
  const r = normalizarCosto(valor);
  return r.ok && r.valor ? '$' + r.valor.toLocaleString('en-US') + ' MXN' : '';
}

// Para las escrituras del médico: valida teléfono, dirección y costo del
// consultorio. (El WhatsApp se valida como red social en normalizarRedes.)
function normalizarContacto(fields) {
  const out = { ...(fields || {}) };
  const errores = [];
  if (CAMPO_DIRECCION in out) {
    const d = normalizarDireccion(out[CAMPO_DIRECCION]);
    if (d.ok) out[CAMPO_DIRECCION] = d.valor; else errores.push(d.error);
  }
  if ('Teléfono de consultorio' in out) {
    const r = normalizarTelefono(out['Teléfono de consultorio']);
    if (r.ok) out['Teléfono de consultorio'] = r.valor; else errores.push(r.error);
  }
  if (CAMPO_COSTO in out) {
    const c = normalizarCosto(out[CAMPO_COSTO]);
    if (c.ok) out[CAMPO_COSTO] = c.valor; else errores.push(c.error);
  }
  if (CAMPO_COSTO_EN_LINEA in out) {
    const c = normalizarCosto(out[CAMPO_COSTO_EN_LINEA]);
    if (c.ok) out[CAMPO_COSTO_EN_LINEA] = c.valor; else errores.push(c.error.replace('El costo', 'El costo en línea'));
  }
  if (CAMPO_EN_LINEA in out) out[CAMPO_EN_LINEA] = out[CAMPO_EN_LINEA] === true || out[CAMPO_EN_LINEA] === 'true';
  return { fields: out, errores };
}

// ── Ciudad de consulta ─────────────────────────────────────────────
// Es texto libre: "Culiacan" y "Culiacán" eran dos ciudades distintas y el
// paciente que elegía una no encontraba a los médicos de la otra. Se compara
// por CLAVE (sin acentos, minúsculas, espacios simples) y, si la ciudad está
// en el catálogo, se muestra con su ortografía correcta.
function claveCiudad(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

const CIUDADES_CATALOGO = [
  'Culiacán', 'Mazatlán', 'Los Mochis', 'Guasave', 'Navolato', 'Guamúchil', 'El Rosario', 'Escuinapa',
  'Ciudad de México', 'Guadalajara', 'Zapopan', 'Monterrey', 'San Pedro Garza García', 'Puebla', 'Querétaro',
  'León', 'Mérida', 'Cancún', 'Playa del Carmen', 'Tijuana', 'Mexicali', 'Ensenada', 'Hermosillo',
  'Ciudad Obregón', 'Chihuahua', 'Ciudad Juárez', 'Torreón', 'Saltillo', 'Durango', 'Tepic',
  'Puerto Vallarta', 'Aguascalientes', 'San Luis Potosí', 'Morelia', 'Toluca', 'Cuernavaca', 'Pachuca',
  'Oaxaca', 'Tuxtla Gutiérrez', 'Villahermosa', 'Xalapa', 'Veracruz', 'Acapulco', 'Zacatecas', 'Colima',
  'Campeche', 'Chetumal', 'La Paz', 'Los Cabos', 'Tampico', 'Reynosa', 'Matamoros', 'Celaya', 'Irapuato',
];
const CIUDADES_ALIAS = { 'cdmx': 'Ciudad de México', 'df': 'Ciudad de México', 'mexico df': 'Ciudad de México', 'cd de mexico': 'Ciudad de México', 'cd obregon': 'Ciudad Obregón', 'cd juarez': 'Ciudad Juárez', 'mochis': 'Los Mochis' };
const CIUDAD_POR_CLAVE = Object.freeze(Object.assign(
  Object.fromEntries(CIUDADES_CATALOGO.map(c => [claveCiudad(c), c])),
  CIUDADES_ALIAS,
));

// Para guardar y para mostrar: ortografía del catálogo o, si no está, el
// texto del médico con espacios limpios (nunca se inventa una ciudad).
function normalizarCiudad(texto) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!limpio) return '';
  return CIUDAD_POR_CLAVE[claveCiudad(limpio)] || limpio;
}

// Opciones de los filtros del directorio con lo que de verdad hay publicado
// (antes eran listas fijas: el paciente podía elegir una especialidad sin
// ningún médico). Cuenta perfiles por opción; ciudades agrupadas por clave.
function opcionesFiltros(registros) {
  const contar = (mapa, clave, etiqueta) => {
    if (!clave) return;
    const previo = mapa.get(clave);
    mapa.set(clave, { nombre: previo ? previo.nombre : etiqueta, n: (previo ? previo.n : 0) + 1 });
  };
  const ciudades = new Map(), esp = new Map(), trat = new Map();
  for (const rec of registros || []) {
    const f = rec.fields || {};
    const ciudad = normalizarCiudad(f['Ciudad de consulta']);
    contar(ciudades, claveCiudad(ciudad), ciudad);
    for (const e of new Set(f['Especialidades visibles'] || [])) contar(esp, e, e);
    for (const t of new Set(f['Tratamientos que ofrece'] || [])) contar(trat, t, t);
  }
  const ordenar = m => [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { ciudades: ordenar(ciudades), especialidades: ordenar(esp), tratamientos: ordenar(trat) };
}

// ── Búsqueda por texto ─────────────────────────────────────────────
// "Busca por nombre o lo que quieres atender". Se compara sin acentos ni
// mayúsculas contra lo que el médico PUBLICÓ (nombre, especialidades,
// herramientas, otras terapias, ciudad y bio). Cada palabra tiene que
// aparecer en algún campo. No hay sinónimos: "rodilla" no se convierte en
// "Ortopedia" — si un médico aparece es porque él lo escribió.
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'lo', 'y', 'e', 'o', 'u', 'en', 'con',
  'para', 'por', 'a', 'al', 'mi', 'mis', 'un', 'una', 'unos', 'que', 'me', 'se', 'su', 'sus',
  'dr', 'dra', 'doctor', 'doctora', 'medico', 'medica', 'busco', 'quiero']);

// Palabras útiles de lo que escribió el paciente (máx. 8). Plural simple:
// "terapias" → "terapia", "hormonales" → "hormonal", para que el plural del
// paciente encuentre el singular del médico (al revés ya coincide).
function palabrasBusqueda(texto) {
  const salida = [];
  for (let p of claveCiudad(String(texto || '').slice(0, 100)).split(' ')) {
    p = p.replace(/[^a-z0-9]/g, '');
    if (p.length < 2 || PALABRAS_VACIAS.has(p)) continue;
    if (p.length > 5 && /[lnrdj]es$/.test(p)) p = p.slice(0, -2);
    else if (p.length > 4 && p.endsWith('s')) p = p.slice(0, -1);
    if (!salida.includes(p)) salida.push(p);
  }
  return salida.slice(0, 8);
}

function coincideBusqueda(fields, palabras) {
  if (!palabras || !palabras.length) return true;
  const f = fields || {};
  const lista = v => (Array.isArray(v) ? v.join(' ') : String(v || ''));
  const texto = ' ' + claveCiudad([
    f['Name'], lista(f['Especialidades visibles']), lista(f['Tratamientos que ofrece']),
    lista(f['Otras terapias']), normalizarCiudad(f['Ciudad de consulta']), f['Bio corta'],
  ].map(lista).join(' ').replace(/[^\p{L}\p{N}]+/gu, ' ')) + ' ';
  return palabras.every(p => texto.includes(p));
}

// ── Lectura pública ────────────────────────────────────────────────
// Campos que el directorio expone al público (lista blanca aplicada como
// fields[] en la petición a Airtable). Antes vivía en api/airtable.js; aquí
// la comparten el directorio y la ficha con vista previa (api/ficha.js).
const CAMPO_LIGA = 'Liga pública';
const CAMPOS_LECTURA_PUBLICA = Object.freeze([
  'Name', 'Especialidades visibles', 'Tratamientos que ofrece', 'Otras terapias',
  'Ciudad de consulta', 'Bio corta', 'Horarios', 'Foto de perfil', CAMPO_LIGA, 'Dirección del consultorio', CAMPO_COSTO, CAMPO_EN_LINEA, CAMPO_COSTO_EN_LINEA,
  ...CAMPOS_REDES,
]);

// Deja un registro listo para el público: foto solo como URL, redes que
// pasan su regla y ciudad con la ortografía del catálogo. Muta y devuelve.
function limpiarPerfilPublico(rec) {
  const f = (rec && rec.fields) || {};
  if (CAMPO_FOTO in f) {
    const url = urlFotoPublica(f[CAMPO_FOTO]);
    if (url) f[CAMPO_FOTO] = url; else delete f[CAMPO_FOTO];
  }
  const redes = redesPublicas(f);
  CAMPOS_REDES.forEach(c => { if (redes[c]) f[c] = redes[c]; else delete f[c]; });
  if (f['Ciudad de consulta']) f['Ciudad de consulta'] = normalizarCiudad(f['Ciudad de consulta']);
  if (f[CAMPO_LIGA] && !esLigaValida(f[CAMPO_LIGA])) delete f[CAMPO_LIGA];
  if (CAMPO_COSTO in f) { const c = normalizarCosto(f[CAMPO_COSTO]); if (c.ok && c.valor) f[CAMPO_COSTO] = c.valor; else delete f[CAMPO_COSTO]; }
  if (f[CAMPO_EN_LINEA] === true) {
    const c = normalizarCosto(f[CAMPO_COSTO_EN_LINEA]);
    if (c.ok && c.valor) f[CAMPO_COSTO_EN_LINEA] = c.valor; else delete f[CAMPO_COSTO_EN_LINEA];
  } else {
    // Sin la casilla no se publica un costo en línea olvidado.
    delete f[CAMPO_EN_LINEA];
    delete f[CAMPO_COSTO_EN_LINEA];
  }
  return rec;
}

// ── Liga pública (/directorio/dr-victor-rodriguez) ─────────────────
// Se asigna UNA vez, al aprobar el perfil, y no cambia aunque el médico
// edite su nombre: la imprime en tarjetas y la comparte. Si ya existe, se
// agrega -2, -3…
const LIGAS_RESERVADAS = new Set(['index', 'medico', 'solicitud', 'calendario', 'api', 'admin', 'buscar', 'unete']);
function esLigaValida(liga) {
  return typeof liga === 'string' && liga.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(liga);
}
function baseDeLiga(nombre) {
  let s = claveCiudad(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > 56) s = s.slice(0, 56).replace(/-[^-]*$/, '') || s.slice(0, 56);
  return s || 'medico';
}
function ligaDisponible(nombre, usadas) {
  const ocupadas = new Set([...(usadas || [])].map(String));
  const base = baseDeLiga(nombre);
  for (let n = 1; n < 1000; n++) {
    const liga = n === 1 ? base : `${base}-${n}`;
    if (!ocupadas.has(liga) && !LIGAS_RESERVADAS.has(liga)) return liga;
  }
  throw new Error('No hay liga disponible para ' + base);
}

// ── Ficha con vista previa (WhatsApp, Facebook, buscadores) ────────
// Esos robots no ejecutan JavaScript: el servidor pone en el <head> el
// nombre, la especialidad, la ciudad y la foto del médico.
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function recortar(texto, max) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}
function metaFicha(fields, urlFicha) {
  const f = fields || {};
  const nombre = String(f['Name'] || 'Médico').replace(/\s+/g, ' ').trim();
  const esp = (f['Especialidades visibles'] || []).slice(0, 2).join(' · ');
  const ciudad = f['Ciudad de consulta'] || '';
  const subtitulo = [esp, ciudad].filter(Boolean).join(' en ');
  const titulo = `${nombre}${subtitulo ? ' — ' + subtitulo : ''}`;
  const descripcion = recortar(f['Bio corta'] || `Perfil de ${nombre} en el directorio médico de la Red CODE CELLS™. Solicita tu cita en línea.`, 180);
  return { titulo, descripcion, imagen: /^https:\/\//.test(f[CAMPO_FOTO] || '') ? f[CAMPO_FOTO] : '', url: urlFicha };
}
// Inserta las etiquetas en la plantilla directorio/medico.html. `datos` llega
// a la página como window.FICHA (id del perfil o noEncontrada).
function htmlFicha(plantilla, meta, datos, { indexar = true } = {}) {
  const head = [
    `<link rel="canonical" href="${escHtml(meta.url)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="Red CODE CELLS™">`,
    `<meta property="og:title" content="${escHtml(meta.titulo)}">`,
    `<meta property="og:description" content="${escHtml(meta.descripcion)}">`,
    `<meta property="og:url" content="${escHtml(meta.url)}">`,
    meta.imagen ? `<meta property="og:image" content="${escHtml(meta.imagen)}">` : '',
    `<meta name="twitter:card" content="${meta.imagen ? 'summary_large_image' : 'summary'}">`,
    indexar ? '' : '<meta name="robots" content="noindex">',
    // JSON dentro de <script>: "<" escapado para que nada cierre la etiqueta.
    `<script>window.FICHA = ${JSON.stringify(datos || {}).replace(/</g, '\\u003c')};</script>`,
  ].filter(Boolean).join('\n  ');
  return plantilla
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(meta.titulo)} | CODE CELLS™</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escHtml(meta.descripcion)}">`)
    .replace('</head>', `  ${head}\n</head>`);
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
  normalizarTelefono,
  CAMPO_DIRECCION,
  normalizarDireccion,
  enlaceMapa,
  CAMPO_COSTO,
  CAMPO_EN_LINEA,
  CAMPO_COSTO_EN_LINEA,
  normalizarCosto,
  costoLegible,
  normalizarContacto,
  claveCiudad,
  normalizarCiudad,
  opcionesFiltros,
  CAMPO_LIGA,
  CAMPOS_LECTURA_PUBLICA,
  limpiarPerfilPublico,
  esLigaValida,
  baseDeLiga,
  ligaDisponible,
  metaFicha,
  htmlFicha,
  palabrasBusqueda,
  coincideBusqueda,
};
