// lib/webPush.js
// Notificaciones del teléfono (Web Push) sin librerías ni cuentas de
// terceros: solo el crypto de Node.
//   - RFC 8291 (cifrado del mensaje, aes128gcm de RFC 8188): el servicio de
//     push del teléfono (Google, Apple, Mozilla — el que use su navegador)
//     solo transporta bytes cifrados; no puede leer el aviso.
//   - RFC 8292 (VAPID): firma con NUESTRA llave para que ese servicio sepa
//     que el aviso viene de CODE CELLS™. Llaves en VAPID_PUBLIC_KEY /
//     VAPID_PRIVATE_KEY (base64url, P-256); VAPID_SUBJECT = mailto:…
// cifrar() se verifica contra el ejemplo de RFC 8291 Apéndice A.

const crypto = require('crypto');

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// Par de llaves P-256 nuevo (para VAPID): { publica, privada } en base64url.
function generarLlavesVapid() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { publica: b64u(ecdh.getPublicKey()), privada: b64u(ecdh.getPrivateKey()) };
}

// RFC 8291 §3.4 + RFC 8188: un solo registro. `opciones.privadaServidor` y
// `opciones.salt` solo los fija la prueba (vector del RFC); en uso real son
// aleatorios en cada envío.
function cifrar(textoPlano, { p256dh, auth }, opciones = {}) {
  const uaPublica = deB64u(p256dh);
  const secretoAuth = deB64u(auth);
  if (uaPublica.length !== 65 || secretoAuth.length !== 16) throw new Error('Suscripción inválida');
  const ecdh = crypto.createECDH('prime256v1');
  if (opciones.privadaServidor) ecdh.setPrivateKey(deB64u(opciones.privadaServidor)); else ecdh.generateKeys();
  const asPublica = ecdh.getPublicKey();
  const secretoEcdh = ecdh.computeSecret(uaPublica);
  const salt = opciones.salt ? deB64u(opciones.salt) : crypto.randomBytes(16);

  const hkdf = (ikm, sal, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, sal, info, n));
  const infoLlave = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublica, asPublica]);
  const ikm = hkdf(secretoEcdh, secretoAuth, infoLlave, 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);

  const cifrador = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02: delimitador del último (y único) registro.
  const cuerpo = Buffer.concat([cifrador.update(Buffer.concat([Buffer.from(textoPlano, 'utf8'), Buffer.from([2])])), cifrador.final(), cifrador.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublica.length]), asPublica, cuerpo]);
}

// JWT ES256 de VAPID para el origen del servicio de push (12 h).
function encabezadoVapid(endpoint, { publica, privada, sujeto }, ahora = Date.now()) {
  const pub = deB64u(publica);
  const jwk = { kty: 'EC', crv: 'P-256', d: privada, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) };
  const llave = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const parte = o => b64u(Buffer.from(JSON.stringify(o)));
  const datos = parte({ typ: 'JWT', alg: 'ES256' }) + '.' + parte({ aud: new URL(endpoint).origin, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: sujeto });
  const firma = crypto.sign('sha256', Buffer.from(datos), { key: llave, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${datos}.${b64u(firma)}, k=${publica}`;
}

function llavesDelAmbiente(env = process.env) {
  const { VAPID_PUBLIC_KEY: publica, VAPID_PRIVATE_KEY: privada } = env;
  if (!publica || !privada) return null;
  return { publica, privada, sujeto: env.VAPID_SUBJECT || 'mailto:contacto@codecells.mx' };
}

// Manda un aviso a una suscripción { endpoint, p256dh, auth }.
// Devuelve { ok, status, vencida } — vencida = el teléfono ya no la acepta
// (404/410): hay que darla de baja. Nunca lanza por un rechazo del servicio.
async function enviar(suscripcion, datos, { llaves = llavesDelAmbiente(), ttl = 3600, urgencia = 'high' } = {}) {
  if (!llaves) return { ok: false, status: 0, error: 'Faltan las llaves VAPID' };
  let url;
  try { url = new URL(suscripcion.endpoint); } catch (e) { return { ok: false, status: 0, vencida: true, error: 'Endpoint inválido' }; }
  if (url.protocol !== 'https:') return { ok: false, status: 0, vencida: true, error: 'Endpoint no es https' };
  const cuerpo = cifrar(JSON.stringify(datos), suscripcion);
  const r = await fetch(suscripcion.endpoint, {
    method: 'POST',
    headers: {
      Authorization: encabezadoVapid(suscripcion.endpoint, llaves),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: String(ttl), Urgency: urgencia,
    },
    body: cuerpo,
  });
  return { ok: r.ok, status: r.status, vencida: r.status === 404 || r.status === 410 };
}

module.exports = { b64u, deB64u, generarLlavesVapid, cifrar, encabezadoVapid, llavesDelAmbiente, enviar };
