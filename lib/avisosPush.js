// lib/avisosPush.js
// Notificaciones del teléfono del paciente (Web Push, lib/webPush.js).
// OPCIONALES y por tipo — el paciente las activa en SU teléfono:
//   - Mensajes: cuando su médico le escribe (nunca el texto del mensaje en
//     la notificación: solo "te escribió", se lee dentro de la app).
//   - Tomas: a la hora de cada toma, desde la hora de la primera que ELIGIÓ
//     el paciente (la receta trae la frecuencia, no la hora).
//   - Citas: la víspera de la próxima cita, a las 18:00 de su teléfono.
//   - Discreto: sin nombre de medicamento ni de médico (pantalla bloqueada).
// Tabla SUSCRIPCIONES_PUSH por NOMBRE (su ID cambia entre prueba y
// producción). Una suscripción vencida (404/410) se desactiva, no se borra.

const meds = require('./medicamentos');
const citasPaciente = require('./citasPaciente');
const Alarmas = require('./alarmasCalendario');
const WebPush = require('./webPush');

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');
const TABLA = 'SUSCRIPCIONES_PUSH';
const MINUTOS_PASO = 5;          // el cron corre cada 5 minutos
const HORA_AVISO_CITA = '18:00'; // víspera de la cita, hora del teléfono
const MAX_SUSCRIPCIONES_PACIENTE = 5;

function url(sufijo = '') { return `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLA)}${sufijo}`; }
function cabeceras() { return { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' }; }
function esc(v) { return String(v).replace(/"/g, '\\"'); }
function falla(status) { const e = new Error(`${TABLA} respondió ${status}`); e.status = 502; return e; }

// ─── Textos (en el idioma que tenía la app al activarlos) ─────────
const TEXTOS = {
  es: { mensajeDe: n => `${n} te escribió`, mensaje: 'Tienes un mensaje nuevo', leelo: 'Ábrelo en tu app CODE CELLS™.',
        toma: 'Hora de tu medicamento', tomaDiscreta: 'Tienes una toma programada', marca: 'Márcala como tomada en tu app.',
        cita: 'Mañana tienes cita', citaCon: n => `Mañana tienes cita con ${n}`, confirma: 'Confirma la hora con su consultorio.',
        prueba: 'Avisos activados', pruebaTexto: 'Así te llegarán los avisos de CODE CELLS™.' },
  en: { mensajeDe: n => `${n} wrote to you`, mensaje: 'You have a new message', leelo: 'Open it in your CODE CELLS™ app.',
        toma: 'Time for your medication', tomaDiscreta: 'You have a scheduled dose', marca: 'Mark it as taken in your app.',
        cita: 'You have an appointment tomorrow', citaCon: n => `Tomorrow you have an appointment with ${n}`, confirma: 'Confirm the time with their office.',
        prueba: 'Notifications on', pruebaTexto: 'This is how CODE CELLS™ notifications will look.' },
  pt: { mensajeDe: n => `${n} escreveu para você`, mensaje: 'Você tem uma mensagem nova', leelo: 'Abra no seu app CODE CELLS™.',
        toma: 'Hora do seu medicamento', tomaDiscreta: 'Você tem uma dose programada', marca: 'Marque como tomada no seu app.',
        cita: 'Amanhã você tem consulta', citaCon: n => `Amanhã você tem consulta com ${n}`, confirma: 'Confirme o horário com o consultório.',
        prueba: 'Avisos ativados', pruebaTexto: 'É assim que os avisos da CODE CELLS™ vão chegar.' },
};
const textos = idioma => TEXTOS[idioma] || TEXTOS.es;

function avisoMensaje(sus, nombreMedico) {
  const t = textos(sus.idioma);
  return { title: !sus.discreto && nombreMedico ? t.mensajeDe(nombreMedico) : t.mensaje, body: t.leelo, url: '/mi-nivel.html?buzon=1', tag: 'mensaje' };
}
function avisoToma(sus, med) {
  const t = textos(sus.idioma);
  return sus.discreto
    ? { title: t.tomaDiscreta, body: t.marca, url: '/mi-nivel.html', tag: 'toma' }
    : { title: '💊 ' + t.toma, body: `${med.nombre}${med.dosis ? ' · ' + med.dosis : ''}. ${t.marca}`, url: '/mi-nivel.html', tag: 'toma-' + med.id };
}
function avisoCita(sus, nombreMedico) {
  const t = textos(sus.idioma);
  return { title: !sus.discreto && nombreMedico ? t.citaCon(nombreMedico) : t.cita, body: t.confirma, url: '/mi-nivel.html', tag: 'cita' };
}
function avisoPrueba(sus) { const t = textos(sus.idioma); return { title: t.prueba, body: t.pruebaTexto, url: '/mi-nivel.html', tag: 'prueba' }; }

// ─── Validación de lo que manda el teléfono ───────────────────────
function zonaValida(z) {
  if (typeof z !== 'string' || !z || z.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; }
}
// { endpoint, p256dh, auth, zona, idioma, mensajes, tomas, citas, discreto, horarios }
function validarSuscripcion(b) {
  const x = b || {};
  let u;
  try { u = new URL(String(x.endpoint || '')); } catch (e) { return { ok: false, error: 'Suscripción no válida.' }; }
  if (u.protocol !== 'https:' || String(x.endpoint).length > 1000) return { ok: false, error: 'Suscripción no válida.' };
  if (WebPush.deB64u(x.p256dh || '').length !== 65 || WebPush.deB64u(x.auth || '').length !== 16) return { ok: false, error: 'Suscripción no válida.' };
  if (!zonaValida(x.zona)) return { ok: false, error: 'Zona horaria no válida.' };
  const horarios = {};
  const h = x.horarios && typeof x.horarios === 'object' ? x.horarios : {};
  for (const [id, hora] of Object.entries(h).slice(0, 20)) {
    if (/^rec[A-Za-z0-9]{14}$/.test(id) && /^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) horarios[id] = hora;
  }
  const tipos = { mensajes: x.mensajes === true, tomas: x.tomas === true, citas: x.citas === true };
  if (!tipos.mensajes && !tipos.tomas && !tipos.citas) return { ok: false, error: 'Elige al menos un tipo de aviso.' };
  return { ok: true, valor: {
    endpoint: String(x.endpoint), p256dh: String(x.p256dh), auth: String(x.auth), zona: x.zona,
    idioma: ['es', 'en', 'pt'].includes(x.idioma) ? x.idioma : 'es', ...tipos, discreto: x.discreto === true, horarios,
  } };
}

// ─── Hora local del teléfono ──────────────────────────────────────
// { dia: 'YYYY-MM-DD', minutos: 0..1439 } en la zona del paciente.
function relojLocal(zona, ahora = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(ahora).map(x => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, minutos: (+p.hour % 24) * 60 + +p.minute };
}
const aMinutos = h => +h.slice(0, 2) * 60 + +h.slice(3, 5);
// ¿Cae la hora h en el paso de 5 minutos que empieza en `inicio`?
const enPaso = (h, inicio) => { const m = aMinutos(h); return m >= inicio && m < inicio + MINUTOS_PASO; };

// Tomas que tocan en este paso: para cada medicamento con hora elegida, las
// horas del día según su frecuencia. Una hora que da la vuelta a la
// medianoche (primera 16:00 → 00:00) pertenece al día de la toma anterior;
// ese día debe tener tomas (lib/medicamentos.tomasEsperadasEnDia: respeta
// inicio, duración, suspensión y ciclo de 48 h / semanal).
function tomasEnPaso(horarios, listaMeds, reloj) {
  const inicioPaso = reloj.minutos - (reloj.minutos % MINUTOS_PASO);
  const out = [];
  for (const med of listaMeds || []) {
    const primera = horarios && horarios[med.id];
    if (!primera || med.estado !== 'Activo') continue;
    for (const h of Alarmas.horasDeTomas(med.frecuencia, primera)) {
      if (!enPaso(h, inicioPaso)) continue;
      const diaDeToma = aMinutos(h) < aMinutos(primera) ? meds.sumarDias(reloj.dia, -1) : reloj.dia;
      if (meds.tomasEsperadasEnDia(med, diaDeToma) > 0) out.push(med);
    }
  }
  return out;
}
const esPasoAvisoCita = reloj => enPaso(HORA_AVISO_CITA, reloj.minutos - (reloj.minutos % MINUTOS_PASO));

// ─── Airtable ─────────────────────────────────────────────────────
function aSuscripcion(rec) {
  const f = rec.fields || {};
  let horarios = {};
  try { horarios = JSON.parse(f['Horarios'] || '{}') || {}; } catch (e) { horarios = {}; }
  return {
    id: rec.id, codigo: f['Código de paciente ref'] || '', endpoint: f['Endpoint'] || '', p256dh: f['p256dh'] || '', auth: f['auth'] || '',
    zona: f['Zona'] || 'America/Mazatlan', idioma: f['Idioma'] || 'es',
    mensajes: !!f['Mensajes'], tomas: !!f['Tomas'], citas: !!f['Citas'], discreto: !!f['Discreto'], horarios, activa: !!f['Activa'],
  };
}
async function listar(formula) {
  const registros = [];
  let offset;
  do {
    const r = await fetch(url(`?filterByFormula=${encodeURIComponent(formula)}${offset ? `&offset=${offset}` : ''}`), { headers: cabeceras() });
    if (!r.ok) throw falla(r.status);
    const d = await r.json();
    registros.push(...(d.records || []));
    offset = d.offset;
  } while (offset);
  return registros.map(aSuscripcion);
}
const porEndpoint = endpoint => listar(`{Endpoint}="${esc(endpoint)}"`);
const activasDePaciente = codigo => listar(`AND({Activa},{Código de paciente ref}="${esc(codigo)}")`);
const activasParaCron = () => listar('AND({Activa},OR({Tomas},{Citas}))');

// Lo de este teléfono para el paciente de la sesión (o null).
async function estado(codigo, endpoint) {
  const s = (await porEndpoint(endpoint)).find(x => x.codigo === codigo && x.activa);
  return s ? { mensajes: s.mensajes, tomas: s.tomas, citas: s.citas, discreto: s.discreto, horarios: s.horarios } : null;
}

// Alta o cambio. El endpoint es del TELÉFONO: si ya existía con otro
// paciente (teléfono compartido), pasa al de la sesión — el anterior deja de
// recibir avisos en ese teléfono.
async function guardar(codigo, v) {
  const existentes = await porEndpoint(v.endpoint);
  const propias = (await activasDePaciente(codigo)).filter(s => s.endpoint !== v.endpoint);
  if (!existentes.length && propias.length >= MAX_SUSCRIPCIONES_PACIENTE) return { error: { status: 400, mensaje: `Ya tienes avisos en ${MAX_SUSCRIPCIONES_PACIENTE} teléfonos. Desactívalos en alguno antes.` } };
  const ahora = new Date().toISOString();
  const fields = {
    'Código de paciente ref': codigo, 'Endpoint': v.endpoint, 'p256dh': v.p256dh, 'auth': v.auth, 'Zona': v.zona, 'Idioma': v.idioma,
    'Mensajes': v.mensajes, 'Tomas': v.tomas, 'Citas': v.citas, 'Discreto': v.discreto, 'Horarios': JSON.stringify(v.horarios),
    'Activa': true, 'Actualizada': ahora,
  };
  const r = existentes.length
    ? await fetch(url(`/${existentes[0].id}`), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ fields }) })
    : await fetch(url(), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ records: [{ fields: { ...fields, 'Creada': ahora } }] }) });
  if (!r.ok) throw falla(r.status);
  const d = await r.json();
  const rec = d.records ? d.records[0] : d;
  // Duplicados del mismo teléfono (si los hubiera) quedan inactivos.
  for (const dup of existentes.slice(1)) await desactivarPorId(dup.id);
  return { suscripcion: aSuscripcion(rec) };
}

async function desactivarPorId(id) {
  const r = await fetch(url(`/${id}`), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ fields: { 'Activa': false, 'Actualizada': new Date().toISOString() } }) });
  if (!r.ok) throw falla(r.status);
}
// Solo la del paciente de la sesión en este teléfono. Devuelve cuántas.
async function desactivar(codigo, endpoint) {
  const suyas = (await porEndpoint(endpoint)).filter(s => s.codigo === codigo && s.activa);
  for (const s of suyas) await desactivarPorId(s.id);
  return suyas.length;
}

// Envía y, si el teléfono ya no acepta (404/410), desactiva.
async function enviarA(sus, aviso, opciones) {
  const r = await WebPush.enviar(sus, aviso, opciones);
  if (r.vencida) { try { await desactivarPorId(sus.id); } catch (e) { console.error('[avisos] no se pudo desactivar vencida:', e.message); } }
  return r;
}

// Mensaje nuevo del médico → a los teléfonos del paciente con Mensajes.
// Nunca lanza: el mensaje ya quedó guardado; esto es un extra.
async function notificarMensaje(codigo, nombreMedico) {
  try {
    const subs = (await activasDePaciente(codigo)).filter(s => s.mensajes);
    let enviados = 0;
    for (const s of subs) if ((await enviarA(s, avisoMensaje(s, nombreMedico))).ok) enviados++;
    return { enviados, telefonos: subs.length };
  } catch (e) {
    console.error('[avisos] mensaje:', e.message);
    return { enviados: 0, error: e.message };
  }
}

// ─── Cron (cada 5 min): tomas y víspera de cita ───────────────────
// prueba=true: devuelve lo que mandaría, sin mandar ni desactivar nada.
async function ejecutarCron({ ahora = new Date(), prueba = false, leerConsultas } = {}) {
  const subs = await activasParaCron();
  const porPaciente = new Map();
  for (const s of subs) { if (!porPaciente.has(s.codigo)) porPaciente.set(s.codigo, []); porPaciente.get(s.codigo).push(s); }
  const pendientes = [];
  for (const [codigo, lista] of porPaciente) {
    const relojes = lista.map(s => relojLocal(s.zona, ahora));
    // Medicamentos: solo si alguna suscripción con tomas tiene una toma en este paso.
    let listaMeds = null;
    for (let i = 0; i < lista.length; i++) {
      const s = lista[i];
      if (!s.tomas || !Object.keys(s.horarios).length) continue;
      if (!listaMeds) listaMeds = await meds.listarMedicamentos(codigo);
      for (const med of tomasEnPaso(s.horarios, listaMeds, relojes[i])) pendientes.push({ s, aviso: avisoToma(s, med), tipo: 'toma' });
    }
    // Cita: a las 18:00 del teléfono, si la próxima cita es mañana.
    const conCita = lista.map((s, i) => [s, relojes[i]]).filter(([s, r]) => s.citas && esPasoAvisoCita(r));
    if (conCita.length && leerConsultas) {
      const proximas = citasPaciente.proximasCitas(await leerConsultas(codigo), conCita[0][1].dia);
      for (const [s, r] of conCita) {
        const c = proximas.find(p => p.fecha === meds.sumarDias(r.dia, 1));
        if (c) pendientes.push({ s, aviso: avisoCita(s, c.medico && c.medico.nombre), tipo: 'cita' });
      }
    }
  }
  if (prueba) return { ok: true, prueba: true, suscripciones: subs.length, avisos: pendientes.map(p => ({ paciente: p.s.codigo, tipo: p.tipo, ...p.aviso })) };
  let enviados = 0, fallidos = 0, vencidas = 0;
  for (const p of pendientes) {
    try {
      const r = await enviarA(p.s, p.aviso, { ttl: p.tipo === 'toma' ? 1800 : 6 * 3600 });
      if (r.ok) enviados++; else { fallidos++; if (r.vencida) vencidas++; }
    } catch (e) { fallidos++; console.error('[avisos] envío:', e.message); }
  }
  return { ok: true, suscripciones: subs.length, enviados, fallidos, vencidas };
}

module.exports = {
  TABLA, MINUTOS_PASO, validarSuscripcion, relojLocal, tomasEnPaso, esPasoAvisoCita,
  avisoMensaje, avisoToma, avisoCita, avisoPrueba,
  estado, guardar, desactivar, activasDePaciente, enviarA, notificarMensaje, ejecutarCron,
};
