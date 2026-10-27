// Notificaciones del teléfono: lib/webPush.js (RFC 8291 + VAPID),
// lib/avisosPush.js (cuándo y qué avisar) y las acciones de api/nova.js.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS';
process.env.NODE_ENV = 'development';
process.env.CRON_SECRET = 'cron-de-prueba';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const W = require('../lib/webPush');
const A = require('../lib/avisosPush');
const { generarToken } = require('../lib/auth');

const LLAVES = W.generarLlavesVapid();
process.env.VAPID_PUBLIC_KEY = LLAVES.publica;
process.env.VAPID_PRIVATE_KEY = LLAVES.privada;

test('cifrar: coincide byte por byte con el ejemplo de RFC 8291 (Apéndice A)', () => {
  const out = W.cifrar('When I grow up, I want to be a watermelon',
    { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
    { privadaServidor: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', salt: 'DGv6ra1nlYgDCS1FRnbzlw' });
  assert.strictEqual(W.b64u(out), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('VAPID: JWT ES256 verificable con la llave pública, para el origen del servicio', () => {
  const h = W.encabezadoVapid('https://fcm.googleapis.com/fcm/send/abc', { ...LLAVES, sujeto: 'mailto:x@codecells.mx' }, Date.UTC(2026, 9, 26));
  const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.strictEqual(k, LLAVES.publica);
  const [cab, cuerpo, firma] = jwt.split('.');
  const claims = JSON.parse(W.deB64u(cuerpo).toString());
  assert.strictEqual(claims.aud, 'https://fcm.googleapis.com');
  assert.strictEqual(claims.sub, 'mailto:x@codecells.mx');
  const pub = W.deB64u(LLAVES.publica);
  const llave = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: W.b64u(pub.subarray(1, 33)), y: W.b64u(pub.subarray(33)) }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(cab + '.' + cuerpo), { key: llave, dsaEncoding: 'ieee-p1363' }, W.deB64u(firma)));
});

// Suscripción de un "teléfono" de mentira (llaves reales P-256).
function telefono() {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return { endpoint: 'https://fcm.googleapis.com/fcm/send/' + crypto.randomBytes(8).toString('hex'), p256dh: W.b64u(ecdh.getPublicKey()), auth: W.b64u(crypto.randomBytes(16)) };
}

test('validarSuscripcion: exige https, llaves válidas, zona real y al menos un tipo; horarios limpios', () => {
  const t = telefono();
  const ok = A.validarSuscripcion({ ...t, zona: 'America/Mazatlan', idioma: 'en', mensajes: true, horarios: { recMED00000000001: '08:00', basura: '08:00', recMED00000000002: '25:00' } });
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(ok.valor.horarios, { recMED00000000001: '08:00' });
  assert.strictEqual(ok.valor.idioma, 'en');
  assert.strictEqual(A.validarSuscripcion({ ...t, endpoint: 'http://x.com/a', zona: 'America/Mazatlan', mensajes: true }).ok, false);
  assert.strictEqual(A.validarSuscripcion({ ...t, p256dh: 'abc', zona: 'America/Mazatlan', mensajes: true }).ok, false);
  assert.strictEqual(A.validarSuscripcion({ ...t, zona: 'Marte/Olympus', mensajes: true }).ok, false);
  assert.strictEqual(A.validarSuscripcion({ ...t, zona: 'America/Mazatlan' }).ok, false, 'sin tipos');
});

test('relojLocal: hora del teléfono en su zona', () => {
  const r = A.relojLocal('America/Mazatlan', new Date('2026-10-26T15:02:00Z')); // UTC-7
  assert.deepStrictEqual(r, { dia: '2026-10-26', minutos: 8 * 60 + 2 });
  assert.deepStrictEqual(A.relojLocal('America/Mexico_City', new Date('2026-10-27T05:30:00Z')), { dia: '2026-10-26', minutos: 23 * 60 + 30 });
});

const med = x => ({ id: 'recMED00000000001', nombre: 'Metformina', dosis: '850 mg', estado: 'Activo', frecuencia: 'c12h', inicio: '2026-10-20', duracionDias: 30, ...x });
const reloj = (dia, hhmm) => ({ dia, minutos: +hhmm.slice(0, 2) * 60 + +hhmm.slice(3) });

test('tomasEnPaso: avisa en el paso de 5 min de cada toma; nada fuera de él', () => {
  const h = { recMED00000000001: '08:00' };
  assert.strictEqual(A.tomasEnPaso(h, [med()], reloj('2026-10-26', '08:00')).length, 1);
  assert.strictEqual(A.tomasEnPaso(h, [med()], reloj('2026-10-26', '08:04')).length, 1, 'mismo paso');
  assert.strictEqual(A.tomasEnPaso(h, [med()], reloj('2026-10-26', '08:05')).length, 0);
  assert.strictEqual(A.tomasEnPaso(h, [med()], reloj('2026-10-26', '20:03')).length, 1, 'segunda toma');
  assert.strictEqual(A.tomasEnPaso({ recMED00000000001: '08:03' }, [med()], reloj('2026-10-26', '08:00')).length, 1, '08:03 cae en el paso de 08:00');
});

test('tomasEnPaso: respeta fin de receta, suspensión, prn, ciclo de 48 h y la vuelta de medianoche', () => {
  // Último día con tomas: 18 nov (30 días desde el 20 oct).
  assert.strictEqual(A.tomasEnPaso({ recMED00000000001: '08:00' }, [med()], reloj('2026-11-18', '08:00')).length, 1);
  assert.strictEqual(A.tomasEnPaso({ recMED00000000001: '08:00' }, [med()], reloj('2026-11-19', '08:00')).length, 0);
  assert.strictEqual(A.tomasEnPaso({ recMED00000000001: '08:00' }, [med({ suspendidoDia: '2026-10-25' })], reloj('2026-10-26', '08:00')).length, 0);
  assert.strictEqual(A.tomasEnPaso({ recMED00000000001: '08:00' }, [med({ estado: 'Suspendido' })], reloj('2026-10-26', '08:00')).length, 0);
  assert.strictEqual(A.tomasEnPaso({ recMED00000000001: '08:00' }, [med({ frecuencia: 'prn' })], reloj('2026-10-26', '08:00')).length, 0);
  // c48h desde el 20 oct: toca el 26, no el 27.
  assert.strictEqual(A.tomasEnPaso({ recMED00000000001: '09:00' }, [med({ frecuencia: 'c48h' })], reloj('2026-10-26', '09:00')).length, 1);
  assert.strictEqual(A.tomasEnPaso({ recMED00000000001: '09:00' }, [med({ frecuencia: 'c48h' })], reloj('2026-10-27', '09:00')).length, 0);
  // c8h desde las 16:00: la de las 00:00 pertenece al día anterior. La
  // receta empieza el 26: el 27 a las 00:00 sí; el 26 a las 00:00 no (aún no empezaba).
  const c8 = med({ frecuencia: 'c8h', inicio: '2026-10-26' });
  assert.strictEqual(A.tomasEnPaso({ recMED00000000001: '16:00' }, [c8], reloj('2026-10-27', '00:00')).length, 1);
  assert.strictEqual(A.tomasEnPaso({ recMED00000000001: '16:00' }, [c8], reloj('2026-10-26', '00:00')).length, 0);
  // Sin hora elegida: nada.
  assert.strictEqual(A.tomasEnPaso({}, [med()], reloj('2026-10-26', '08:00')).length, 0);
});

test('textos: discreto sin nombres; el aviso de mensaje NUNCA trae el texto del mensaje', () => {
  const s = { idioma: 'es', discreto: false };
  assert.match(A.avisoToma(s, med()).body, /Metformina · 850 mg/);
  const d = A.avisoToma({ ...s, discreto: true }, med());
  assert.ok(!JSON.stringify(d).match(/Metformina|850/));
  assert.strictEqual(A.avisoMensaje(s, 'Dra. Ana').title, 'Dra. Ana te escribió');
  assert.ok(!JSON.stringify(A.avisoMensaje({ ...s, discreto: true }, 'Dra. Ana')).includes('Ana'));
  assert.strictEqual(A.avisoCita({ idioma: 'en', discreto: false }, 'Dr. X').title, 'Tomorrow you have an appointment with Dr. X');
  assert.ok(!JSON.stringify(A.avisoCita({ idioma: 'es', discreto: true }, 'Dr. X')).includes('Dr. X'));
  assert.ok(A.esPasoAvisoCita(reloj('2026-10-26', '18:02')));
  assert.ok(!A.esPasoAvisoCita(reloj('2026-10-26', '18:05')));
});

// ─── Acciones de api/nova.js con Airtable y push de mentira ───────
function fakeRes() { return { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, setHeader() {}, end() { return this; } }; }
const PAC = 'CC-PAC-200001';

function mundo({ previas = [], respuestaPush = 201 } = {}) {
  const subs = previas.map(s => ({ id: s.id, fields: { ...s.fields } }));
  const cap = { posts: [], patches: [], pushes: [] };
  const original = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url)); const metodo = opts.method || 'GET';
    const ok = d => ({ ok: true, status: 200, json: async () => d });
    if (u.startsWith('https://fcm.googleapis.com/')) { cap.pushes.push({ u, headers: opts.headers, body: opts.body }); return { ok: respuestaPush < 300, status: respuestaPush, json: async () => ({}) }; }
    if (u.includes('SUSCRIPCIONES_PUSH')) {
      if (metodo === 'POST') { const f = JSON.parse(opts.body).records[0].fields; cap.posts.push(f); const rec = { id: 'recSUS' + String(subs.length + 1).padStart(11, '0'), fields: f }; subs.push(rec); return ok({ records: [rec] }); }
      if (metodo === 'PATCH') { const id = u.match(/SUSCRIPCIONES_PUSH\/(rec\w+)/)[1]; const f = JSON.parse(opts.body).fields; cap.patches.push({ id, f }); const rec = subs.find(x => x.id === id); Object.assign(rec.fields, f); return ok(rec); }
      const endpoint = (u.match(/\{Endpoint\}="([^"]+)"/) || [])[1];
      const codigo = (u.match(/\{Código de paciente ref\}="([^"]+)"/) || [])[1];
      const cron = u.includes('OR({Tomas},{Citas})');
      return ok({ records: subs.filter(s => (!endpoint || s.fields['Endpoint'] === endpoint) && (!codigo || (s.fields['Código de paciente ref'] === codigo && s.fields['Activa'])) && (!cron || (s.fields['Activa'] && (s.fields['Tomas'] || s.fields['Citas'])))) });
    }
    if (u.includes('MEDICAMENTOS_PACIENTE')) return ok({ records: [{ id: 'recMED00000000001', fields: { 'Código de paciente ref': PAC, 'Medicamento': 'Metformina', 'Dosis': '850 mg', 'Frecuencia': 'c12h', 'Fecha inicio': '2026-10-20', 'Duración (días)': 30, 'Estado': 'Activo' } }] });
    throw new Error(`fetch no mockeado: ${metodo} ${u}`);
  };
  return { cap, subs, restaurar: () => { global.fetch = original; } };
}
async function nova(sesion, body, { metodo = 'POST', query, headers = {} } = {}) {
  const res = fakeRes();
  const h = { 'content-type': 'application/json', ...headers };
  if (sesion) h.authorization = `Bearer ${generarToken({ horas: 1, ...sesion })}`;
  delete require.cache[require.resolve('../api/nova.js')];
  await require('../api/nova.js')({ method: metodo, headers: h, body, query: query || {} }, res);
  return res;
}
const paciente = { tipo: 'paciente', codigo: PAC };

test('suscribir: guarda para el paciente de la SESIÓN; demo 403; sin llaves 503; datos malos 400', async () => {
  const w = mundo();
  try {
    const t = telefono();
    const r = await nova(paciente, { action: 'paciente_suscribir_avisos', ...t, zona: 'America/Mazatlan', mensajes: true, tomas: true, horarios: { recMED00000000001: '08:00' }, codigo: 'CC-PAC-999999' });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(w.cap.posts[0]['Código de paciente ref'], PAC);
    assert.strictEqual(w.cap.posts[0]['Activa'], true);
    assert.deepStrictEqual(JSON.parse(w.cap.posts[0]['Horarios']), { recMED00000000001: '08:00' });
    assert.deepStrictEqual(r.body.estado, { mensajes: true, tomas: true, citas: false, discreto: false, horarios: { recMED00000000001: '08:00' } });
    assert.strictEqual((await nova({ tipo: 'demo', codigo: 'CC-PAC-200002' }, { action: 'paciente_suscribir_avisos', ...t, zona: 'America/Mazatlan', mensajes: true })).statusCode, 403);
    assert.strictEqual((await nova(paciente, { action: 'paciente_suscribir_avisos', ...t, zona: 'America/Mazatlan' })).statusCode, 400);
    const pub = process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PUBLIC_KEY;
    try { assert.strictEqual((await nova(paciente, { action: 'paciente_suscribir_avisos', ...t, zona: 'America/Mazatlan', mensajes: true })).statusCode, 503); }
    finally { process.env.VAPID_PUBLIC_KEY = pub; }
  } finally { w.restaurar(); }
});

test('suscribir: el mismo teléfono con otro paciente pasa al de la sesión (no se duplica)', async () => {
  const t = telefono();
  const w = mundo({ previas: [{ id: 'recSUS00000000001', fields: { 'Código de paciente ref': 'CC-PAC-200009', 'Endpoint': t.endpoint, 'p256dh': t.p256dh, 'auth': t.auth, 'Activa': true, 'Mensajes': true } }] });
  try {
    const r = await nova(paciente, { action: 'paciente_suscribir_avisos', ...t, zona: 'America/Mazatlan', citas: true });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(w.cap.posts.length, 0);
    assert.strictEqual(w.subs[0].fields['Código de paciente ref'], PAC);
  } finally { w.restaurar(); }
});

test('desuscribir y estado: solo lo del paciente de la sesión en ese teléfono', async () => {
  const t = telefono();
  const w = mundo({ previas: [{ id: 'recSUS00000000001', fields: { 'Código de paciente ref': 'CC-PAC-200009', 'Endpoint': t.endpoint, 'Activa': true, 'Mensajes': true } }] });
  try {
    const r = await nova(paciente, { action: 'paciente_desuscribir_avisos', endpoint: t.endpoint });
    assert.strictEqual(r.body.desactivadas, 0, 'no apaga la de otro paciente');
    assert.strictEqual(w.cap.patches.length, 0);
    const e = await nova(paciente, { action: 'paciente_avisos_estado', endpoint: t.endpoint });
    assert.strictEqual(e.body.estado, null);
    assert.strictEqual(e.body.publica, LLAVES.publica);
  } finally { w.restaurar(); }
});

test('probar: manda un aviso CIFRADO con VAPID a ese teléfono; 410 → se desactiva', async () => {
  const t = telefono();
  const previas = [{ id: 'recSUS00000000001', fields: { 'Código de paciente ref': PAC, 'Endpoint': t.endpoint, 'p256dh': t.p256dh, 'auth': t.auth, 'Activa': true, 'Mensajes': true } }];
  let w = mundo({ previas });
  try {
    const r = await nova(paciente, { action: 'paciente_probar_aviso', endpoint: t.endpoint });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    const p = w.cap.pushes[0];
    assert.strictEqual(p.headers['Content-Encoding'], 'aes128gcm');
    assert.match(p.headers.Authorization, /^vapid t=.+, k=/);
    assert.ok(!Buffer.from(p.body).toString('latin1').includes('Avisos'), 'el texto viaja cifrado');
  } finally { w.restaurar(); }
  w = mundo({ previas, respuestaPush: 410 });
  try {
    const r = await nova(paciente, { action: 'paciente_probar_aviso', endpoint: t.endpoint });
    assert.strictEqual(r.statusCode, 502);
    assert.deepStrictEqual(w.cap.patches.map(x => x.f['Activa']), [false]);
  } finally { w.restaurar(); }
  // 403 (la llave no coincide con la de la suscripción): no se desactiva,
  // pero el paciente ve el código para poder reportarlo.
  w = mundo({ previas, respuestaPush: 403 });
  const error = console.error; console.error = () => {};
  try {
    const r = await nova(paciente, { action: 'paciente_probar_aviso', endpoint: t.endpoint });
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(r.body.codigo, 403);
    assert.strictEqual(w.cap.patches.length, 0);
  } finally { console.error = error; w.restaurar(); }
});

test('cron: sin CRON_SECRET → 401; con prueba=1 dice qué mandaría sin mandar nada', async () => {
  const t = telefono();
  const w = mundo({ previas: [{ id: 'recSUS00000000001', fields: { 'Código de paciente ref': PAC, 'Endpoint': t.endpoint, 'p256dh': t.p256dh, 'auth': t.auth, 'Activa': true, 'Tomas': true, 'Zona': 'America/Mazatlan', 'Horarios': JSON.stringify({ recMED00000000001: '08:00' }) } }] });
  const realDate = global.Date;
  try {
    assert.strictEqual((await nova(null, {}, { metodo: 'GET', query: { accion: 'avisos_push' } })).statusCode, 401);
    const r = await nova(null, {}, { metodo: 'GET', query: { accion: 'avisos_push', prueba: '1' }, headers: { authorization: 'Bearer cron-de-prueba' } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.prueba, true);
    assert.strictEqual(w.cap.pushes.length, 0);
  } finally { global.Date = realDate; w.restaurar(); }
});

test('cron en producción: Vercel llama SIN encabezado Origin y no debe chocar con el filtro de origen', async () => {
  const w = mundo();
  const modo = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production'; // fuera de desarrollo, el filtro de origen sí aplica
    const sin = await nova(null, {}, { metodo: 'GET', query: { accion: 'avisos_push' } });
    assert.strictEqual(sin.statusCode, 401, 'sin secreto: 401 (no 403 del filtro de origen)');
    const con = await nova(null, {}, { metodo: 'GET', query: { accion: 'avisos_push', prueba: '1' }, headers: { authorization: 'Bearer cron-de-prueba' } });
    assert.strictEqual(con.statusCode, 200, JSON.stringify(con.body));
    // Y cualquier otra llamada sin origen permitido sigue rechazada.
    assert.strictEqual((await nova(paciente, { action: 'paciente_avisos_estado' })).statusCode, 403);
  } finally { process.env.NODE_ENV = modo; w.restaurar(); }
});

test('cron (lib): a las 08:00 de su teléfono manda la toma; a las 08:05 no', async () => {
  const t = telefono();
  const w = mundo({ previas: [{ id: 'recSUS00000000001', fields: { 'Código de paciente ref': PAC, 'Endpoint': t.endpoint, 'p256dh': t.p256dh, 'auth': t.auth, 'Activa': true, 'Tomas': true, 'Zona': 'America/Mazatlan', 'Horarios': JSON.stringify({ recMED00000000001: '08:00' }) } }] });
  try {
    const a = await A.ejecutarCron({ ahora: new Date('2026-10-26T15:01:00Z'), prueba: true });
    assert.deepStrictEqual(a.avisos.map(x => [x.tipo, x.title]), [['toma', '💊 Hora de tu medicamento']]);
    const b = await A.ejecutarCron({ ahora: new Date('2026-10-26T15:06:00Z'), prueba: true });
    assert.strictEqual(b.avisos.length, 0);
    const c = await A.ejecutarCron({ ahora: new Date('2026-10-26T15:01:00Z') });
    assert.strictEqual(c.enviados, 1);
    assert.strictEqual(w.cap.pushes.length, 1);
  } finally { w.restaurar(); }
});
