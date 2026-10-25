// Resumen semanal al médico (visitas a su ficha + solicitudes) por Telegram.
// Corre con: node --test
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS'; // no es producción → sin congelamiento
process.env.TELEGRAM_CHAT_ID = 'chat-victor';
process.env.CRON_SECRET = 'cron-secreto-de-prueba';

const test = require('node:test');
const assert = require('node:assert');
const R = require('../lib/resumen-semanal');
const C = require('../lib/citas');

// Lunes 26 oct 2026, 9:00 en Culiacán (UTC-7) = 16:00 UTC: cuando corre el cron.
const LUNES = new Date('2026-10-26T16:00:00Z');
const SEMANA = { inicio: '2026-10-19', fin: '2026-10-25' };

// ── Reglas puras ──────────────────────────────────────────────────────
test('semana: lunes a domingo en hora de Culiacán; el lunes se resume la que terminó ayer', () => {
  assert.strictEqual(R.lunesDe('2026-10-25'), '2026-10-19', 'domingo → lunes anterior');
  assert.strictEqual(R.lunesDe('2026-10-19'), '2026-10-19');
  assert.deepStrictEqual(R.semanaAnterior(LUNES), SEMANA);
  // Lunes 05:00 UTC = domingo 22:00 en Culiacán: todavía es la semana del 19.
  assert.strictEqual(R.semanaDe(new Date('2026-10-26T05:00:00Z')), '2026-10-19');
  assert.strictEqual(R.semanaDe(new Date('2026-10-26T07:00:00Z')), '2026-10-26');
  assert.deepStrictEqual(R.semanaAnterior(new Date('2027-01-04T16:00:00Z')), { inicio: '2026-12-28', fin: '2027-01-03' }, 'cruza de año');
});

test('esBot: sin User-Agent o con firma de bot no cuenta', () => {
  assert.ok(R.esBot(''));
  assert.ok(R.esBot('Googlebot/2.1'));
  assert.ok(R.esBot('WhatsApp/2.23 A'), 'la vista previa de una liga compartida no es una visita');
  assert.ok(R.esBot('TelegramBot (like TwitterBot)'));
  assert.ok(!R.esBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'));
});

const sol = (perfil, fecha, extra = {}) => ({ fields: { 'Médico solicitado': [perfil], 'Fecha solicitud': fecha, 'Estado de cita': C.ESTADOS_CITA.PENDIENTE, ...extra } });

test('resumenDeMedico: suma filas duplicadas de visitas, cuenta solo su semana y sus solicitudes', () => {
  const visitas = [
    { fields: { Perfil: 'recA', Semana: '2026-10-19', Visitas: 20 } },
    { fields: { Perfil: 'recA', Semana: '2026-10-19', Visitas: 3 } }, // dos visitas crearon la fila a la vez
    { fields: { Perfil: 'recB', Semana: '2026-10-19', Visitas: 99 } },
  ];
  const solicitudes = [
    sol('recA', '2026-10-20T18:00:00Z'),
    sol('recA', '2026-10-22T18:00:00Z', { 'Modalidad': 'En línea', 'Estado de cita': C.ESTADOS_CITA.ACEPTADA }),
    sol('recA', '2026-10-24T18:00:00Z', { 'Estado de cita': C.ESTADOS_CITA.CONFIRMADA }),
    sol('recA', '2026-10-26T05:00:00Z', { 'Estado de cita': C.ESTADOS_CITA.RECHAZADA }), // domingo 22:00 Culiacán: sí cuenta
    sol('recA', '2026-10-12T18:00:00Z'), // semana anterior, sigue pendiente
    sol('recA', '2026-10-26T08:00:00Z'), // ya es lunes en Culiacán: no cuenta
    sol('recB', '2026-10-21T18:00:00Z'),
  ];
  const r = R.resumenDeMedico({ perfilId: 'recA', visitas, solicitudes, semana: SEMANA, estados: C.ESTADOS_CITA });
  assert.deepStrictEqual(r, { visitas: 23, solicitudes: 4, enLinea: 1, agendadas: 2, pendientes: 3 });
});

test('textoResumen: solo números, singular/plural, y nada del paciente', () => {
  const t = R.textoResumen({ visitas: 1, solicitudes: 0, enLinea: 0, agendadas: 0, pendientes: 0 }, SEMANA);
  assert.match(t, /19–25 oct/);
  assert.match(t, /1 visita a tu perfil/);
  assert.match(t, /0 solicitudes de cita/);
  assert.ok(!/agendada/.test(t), 'sin solicitudes no se habla de agendadas');
  assert.match(t, /No tienes solicitudes pendientes/);
  const t2 = R.textoResumen({ visitas: 23, solicitudes: 4, enLinea: 1, agendadas: 2, pendientes: 1 }, { inicio: '2026-10-26', fin: '2026-11-01' });
  assert.match(t2, /26 oct–1 nov/);
  assert.match(t2, /4 solicitudes de cita \(1 en línea\)/);
  assert.match(t2, /2 ya agendadas o aceptadas/);
  assert.match(t2, /1 solicitud pendiente de responder/);
});

// ── Red simulada ──────────────────────────────────────────────────────
function mundo({ publicado = true, filaVisita = null, fallaVisitas = false, chatMedico = 'chat-medico' } = {}) {
  const m = { creados: [], parchados: [], telegram: [], urls: [] };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    m.urls.push(u);
    const ok = d => ({ ok: true, status: 200, json: async () => d });
    // Igual que Airtable: el GET de un registro por id no acepta parámetros.
    if (/\/rec[A-Za-z0-9]{14}\?/.test(u)) return { ok: false, status: 422, json: async () => ({ error: { type: 'INVALID_REQUEST_UNKNOWN' } }) };
    if (u.includes('api.telegram.org')) { m.telegram.push(JSON.parse(opts.body)); return ok({ ok: true }); }
    if (u.includes('/VISITAS_DIRECTORIO')) {
      if (fallaVisitas) return { ok: false, status: 404, json: async () => ({ error: { type: 'TABLE_NOT_FOUND' } }) };
      if (opts.method === 'POST') { m.creados.push(JSON.parse(opts.body).fields); return ok({ id: 'recVIS1' }); }
      if (opts.method === 'PATCH') { m.parchados.push(JSON.parse(opts.body).fields); return ok({ id: 'recVIS1' }); }
      if (u.includes('Semana')) return ok({ records: [{ id: 'recVIS1', fields: { Perfil: 'recPERFIL00000001', Semana: '2026-10-19', Visitas: 7 } }] });
      return ok({ records: filaVisita ? [filaVisita] : [] });
    }
    if (u.includes('tblkUNPwu1sQgZBPJ/recPERFIL00000001')) return ok({ id: 'recPERFIL00000001', fields: publicado ? { Publicado: true } : {} });
    if (u.includes('tblkUNPwu1sQgZBPJ?')) return ok({ records: [
      { id: 'recPERFIL00000001', fields: { Name: 'Dra. Con Telegram', 'Médico': ['recMEDICO00000001'] } },
      { id: 'recPERFIL00000002', fields: { Name: 'Dr. Sin Telegram', 'Médico': ['recMEDICO00000002'] } },
    ] });
    if (u.includes('tbl87DsuBMmb4DjFM/recMEDICO00000001')) return ok({ fields: chatMedico ? { 'Telegram Chat ID': chatMedico } : {} });
    if (u.includes('tbl87DsuBMmb4DjFM/recMEDICO00000002')) return ok({ fields: {} });
    if (u.includes('tblUsc72JO2BaqT6d')) return ok({ records: [
      sol('recPERFIL00000001', '2026-10-21T18:00:00Z'),
      { fields: { ...sol('recPERFIL00000001', '2026-10-23T18:00:00Z').fields, 'Nombre del paciente': 'NO DEBE SALIR' } },
    ] });
    throw new Error('URL inesperada: ' + u);
  };
  return m;
}

function llamar(accion, { metodo = 'GET', body, query = {}, headers = {} } = {}) {
  delete require.cache[require.resolve('../api/citas.js')];
  const handler = require('../api/citas.js');
  return new Promise(resolve => {
    handler({ method: metodo, query: { accion, ...query }, body, headers }, {
      status(c) { this.c = c; return this; },
      json(d) { resolve({ status: this.c, data: d }); return this; },
    });
  });
}

const NAVEGADOR = { 'user-agent': 'Mozilla/5.0 (iPhone) Safari/604.1' };

test('visita: primera de la semana crea la fila con clave perfil|lunes', async () => {
  const m = mundo();
  const r = await llamar('visita', { metodo: 'POST', body: { medicoId: 'recPERFIL00000001' }, headers: NAVEGADOR });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(m.creados.length, 1);
  const f = m.creados[0];
  assert.strictEqual(f.Perfil, 'recPERFIL00000001');
  assert.match(f.Semana, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(new Date(f.Semana + 'T12:00:00Z').getUTCDay(), 1, 'la semana se nombra por su lunes');
  assert.strictEqual(f.Clave, `recPERFIL00000001|${f.Semana}`);
  assert.strictEqual(f.Visitas, 1);
  assert.deepStrictEqual(Object.keys(f).sort(), ['Clave', 'Perfil', 'Semana', 'Visitas'], 'nada del visitante');
});

test('visita: si ya hay fila, suma uno', async () => {
  const m = mundo({ filaVisita: { id: 'recVIS1', fields: { Visitas: 4 } } });
  await llamar('visita', { metodo: 'POST', body: { medicoId: 'recPERFIL00000001' }, headers: NAVEGADOR });
  assert.deepStrictEqual(m.parchados, [{ Visitas: 5 }]);
  assert.strictEqual(m.creados.length, 0);
});

test('visita: bot, id inválido o perfil no publicado no cuentan', async () => {
  let m = mundo();
  let r = await llamar('visita', { metodo: 'POST', body: { medicoId: 'recPERFIL00000001' }, headers: { 'user-agent': 'facebookexternalhit/1.1' } });
  assert.deepStrictEqual([r.status, r.data.contada, m.urls.length], [200, false, 0]);
  r = await llamar('visita', { metodo: 'POST', body: { medicoId: 'x' }, headers: NAVEGADOR });
  assert.strictEqual(r.status, 400);
  m = mundo({ publicado: false });
  r = await llamar('visita', { metodo: 'POST', body: { medicoId: 'recPERFIL00000001' }, headers: NAVEGADOR });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(m.creados.length + m.parchados.length, 0);
});

test('visita: si la tabla de visitas falla, responde 502 (no finge que contó)', async () => {
  mundo({ fallaVisitas: true });
  const r = await llamar('visita', { metodo: 'POST', body: { medicoId: 'recPERFIL00000001' }, headers: NAVEGADOR });
  assert.strictEqual(r.status, 502);
});

test('resumen_semanal: sin el secreto del cron → 401 y no lee nada', async () => {
  const m = mundo();
  assert.strictEqual((await llamar('resumen_semanal')).status, 401);
  assert.strictEqual((await llamar('resumen_semanal', { headers: { authorization: 'Bearer otro' } })).status, 401);
  assert.strictEqual(m.urls.length, 0);
});

const CRON = { authorization: 'Bearer cron-secreto-de-prueba' };

test('resumen_semanal: manda a cada médico con Telegram sus números, y a Víctor el control con quién no lo recibió', async () => {
  const m = mundo();
  const r = await llamar('resumen_semanal', { headers: CRON });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.deepStrictEqual([r.data.enviados, r.data.total, r.data.sinTelegram], [1, 2, ['Dr. Sin Telegram']]);
  const alMedico = m.telegram.find(t => t.chat_id === 'chat-medico');
  assert.ok(alMedico, 'el médico con Telegram recibe su resumen');
  assert.match(alMedico.text, /visitas? a tu perfil/);
  assert.match(alMedico.text, /\(Ambiente: prueba\)/);
  assert.ok(!/NO DEBE SALIR/.test(JSON.stringify(m.telegram)), 'ningún dato del paciente viaja');
  const control = m.telegram.find(t => t.chat_id === 'chat-victor');
  assert.match(control.text, /enviado a 1 de 2 médicos/);
  assert.match(control.text, /Sin Telegram \(no lo recibieron\): Dr\. Sin Telegram/);
  // La lectura de SOLICITUDES pide solo campos sin datos del paciente.
  const urlSol = decodeURIComponent(m.urls.find(u => u.includes('tblUsc72JO2BaqT6d')));
  assert.ok(!/Nombre del paciente|Teléfono|Motivo|Email/.test(urlSol), urlSol);
});

test('resumen_semanal con prueba=1: devuelve los textos y no manda ningún Telegram', async () => {
  const m = mundo();
  const r = await llamar('resumen_semanal', { headers: CRON, query: { prueba: '1' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(m.telegram.length, 0);
  assert.strictEqual(r.data.medicos.length, 2);
  assert.ok(!('chat' in r.data.medicos[0]), 'no expone el chat de Telegram');
  assert.strictEqual(r.data.medicos[0].tieneTelegram, true);
});

test('resumen_semanal: si la tabla de visitas falla, no se manda NADA a los médicos y Víctor se entera', async () => {
  const m = mundo({ fallaVisitas: true });
  const r = await llamar('resumen_semanal', { headers: CRON });
  assert.strictEqual(r.status, 502);
  assert.ok(!m.telegram.some(t => t.chat_id === 'chat-medico'), 'nadie recibe números incompletos');
  const aviso = m.telegram.find(t => t.chat_id === 'chat-victor');
  assert.match(aviso.text, /NO se envió/);
});
