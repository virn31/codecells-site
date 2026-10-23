// Etapa 2b del directorio: agenda automática. El paciente solo ve espacios
// libres; los bloqueos y las citas ya tomadas nunca se ofrecen; el
// cuestionario de Telegram no deja días sin horario.
// Corre con: node --test

const test = require('node:test');
const assert = require('node:assert');
const A = require('../lib/agenda');
const W = require('../lib/agenda-asistente');

// 2026-10-23 12:00 hora de México (UTC-6) = 18:00 UTC. Es viernes.
const AHORA = new Date('2026-10-23T18:00:00Z');
const HORARIO = { duracion: 30, dias: { '1': [['09:00', '11:00'], ['16:00', '17:00']], '4': [['10:00', '11:00']] } };

test('espaciosLibres: parte el horario en consultas de la duración elegida', () => {
  // 2026-10-26 es lunes.
  assert.deepStrictEqual(
    A.espaciosLibres({ fecha: '2026-10-26', horario: HORARIO, bloqueos: [], ocupados: [], ahora: AHORA }),
    ['09:00', '09:30', '10:00', '10:30', '16:00', '16:30']);
});

test('espaciosLibres: día sin consulta, hoy, pasado o más allá de 90 días → nada', () => {
  const base = { horario: HORARIO, bloqueos: [], ocupados: [], ahora: AHORA };
  assert.deepStrictEqual(A.espaciosLibres({ ...base, fecha: '2026-10-27' }), []); // martes sin consulta
  assert.deepStrictEqual(A.espaciosLibres({ ...base, fecha: '2026-10-23' }), []); // hoy
  assert.deepStrictEqual(A.espaciosLibres({ ...base, fecha: '2026-10-19' }), []); // pasado
  assert.deepStrictEqual(A.espaciosLibres({ ...base, fecha: '2027-03-01' }), []); // > 90 días
});

test('espaciosLibres: quita citas tomadas, también si se encima por cambio de duración', () => {
  const libres = A.espaciosLibres({ fecha: '2026-10-26', horario: HORARIO, bloqueos: [], ocupados: ['09:30', '10:15'], ahora: AHORA });
  assert.deepStrictEqual(libres, ['09:00', '16:00', '16:30']);
});

test('espaciosLibres: respeta bloqueos de día completo y de franja', () => {
  const dia = [{ desde: '2026-10-25', hasta: '2026-10-26', ini: null, fin: null }];
  assert.deepStrictEqual(A.espaciosLibres({ fecha: '2026-10-26', horario: HORARIO, bloqueos: dia, ocupados: [], ahora: AHORA }), []);
  const tarde = [{ desde: '2026-10-26', hasta: '2026-10-26', ini: '14:00', fin: '22:00' }];
  assert.deepStrictEqual(A.espaciosLibres({ fecha: '2026-10-26', horario: HORARIO, bloqueos: tarde, ocupados: [], ahora: AHORA }),
    ['09:00', '09:30', '10:00', '10:30']);
});

test('validarBloqueo: fechas inválidas, invertidas, pasadas u horas a medias se rechazan', () => {
  assert.equal(A.validarBloqueo({ desde: '2026-11-31' }, AHORA).ok, false);
  assert.equal(A.validarBloqueo({ desde: '2026-11-10', hasta: '2026-11-05' }, AHORA).ok, false);
  assert.equal(A.validarBloqueo({ desde: '2026-10-01', hasta: '2026-10-05' }, AHORA).ok, false);
  assert.equal(A.validarBloqueo({ desde: '2026-11-05', ini: '14:00' }, AHORA).ok, false);
  const v = A.validarBloqueo({ desde: '2026-11-05', hasta: '2026-11-10', nota: 'congreso' }, AHORA);
  assert.equal(v.ok, true);
  assert.deepStrictEqual(v.bloqueo, { desde: '2026-11-05', hasta: '2026-11-10', ini: null, fin: null, nota: 'congreso' });
});

test('textoBloqueo: el médico lee días de la semana y número de días', () => {
  assert.equal(A.textoBloqueo({ desde: '2026-11-05', hasta: '2026-11-10' }), 'del jueves 5 de noviembre al martes 10 de noviembre de 2026 (6 días), todo el día');
  assert.equal(A.textoBloqueo({ desde: '2026-11-05', hasta: '2026-11-05', ini: '14:00', fin: '22:00' }), 'el jueves 5 de noviembre de 2026, de 14:00 a 22:00');
});

test('citasDentroDeBloqueo: avisa las citas ya agendadas en esas fechas', () => {
  const sol = [
    { fields: { 'Estado de cita': 'Aceptada', 'Horario acordado': '2026-11-06 10:30' } },
    { fields: { 'Estado de cita': 'Cancelada por el paciente', 'Horario acordado': '2026-11-07 10:30' } },
    { fields: { 'Estado de cita': 'Aceptada', 'Horario acordado': '2026-11-12 10:30' } },
  ];
  assert.deepStrictEqual(A.citasDentroDeBloqueo({ desde: '2026-11-05', hasta: '2026-11-10' }, sol), ['2026-11-06 10:30']);
});

test('textoHorario: agrupa días iguales y dice qué días no hay consulta', () => {
  const t = A.textoHorario({ duracion: 30, dias: { '1': [['09:00', '14:00']], '2': [['09:00', '14:00']] } });
  assert.match(t, /Lun, Mar: 9:00–14:00/);
  assert.match(t, /Mié, Jue, Vie, Sáb, Dom: sin consulta/);
});

// ── Cuestionario de Telegram ──────────────────────────────────────────
function tocar(estado, data) {
  const b = W.leerBoton('ag:' + data);
  const r = W.aplicar(estado, b.accion, b.valor);
  assert.equal(r.ok, true, r.error);
  return r;
}

test('cuestionario: mismo horario con descanso → horario completo y válido', () => {
  let e = W.inicio();
  for (const d of ['zona:1', 'dia:1', 'dia:3', 'dia:5', 'dias:ok', 'dur:30', 'mismo:1', 'ini:540', 'fin:1200', 'desc:1', 'dini:840', 'dfin:960']) e = tocar(e, d).estado;
  assert.equal(e.paso, 'conf');
  const r = tocar(e, 'conf:si');
  assert.equal(r.terminado, true);
  const esperado = [['09:00', '14:00'], ['16:00', '20:00']];
  assert.deepStrictEqual(r.horario, { duracion: 30, dias: { '1': esperado, '3': esperado, '5': esperado }, zona: 'America/Mazatlan' });
});

test('cuestionario: horario distinto por día recorre TODOS los días elegidos', () => {
  let e = W.inicio();
  for (const d of ['zona:0', 'dia:2', 'dia:6', 'dias:ok', 'dur:60', 'mismo:0']) e = tocar(e, d).estado;
  assert.match(W.render(e).texto, /Horario de Mar/);
  for (const d of ['ini:600', 'fin:840', 'desc:0']) e = tocar(e, d).estado;
  assert.equal(e.paso, 'ini');
  assert.match(W.render(e).texto, /Horario de Sáb/);
  for (const d of ['ini:540', 'fin:720']) e = tocar(e, d).estado; // 3 h justas: pregunta descanso
  e = tocar(e, 'desc:0').estado;
  assert.equal(e.paso, 'conf');
  assert.deepStrictEqual(tocar(e, 'conf:si').horario.dias, { '2': [['10:00', '14:00']], '6': [['09:00', '12:00']] });
});

test('cuestionario: botones viejos, de otro paso o con valores no ofrecidos se rechazan', () => {
  let e = W.inicio();
  assert.equal(W.aplicar(e, 'zona', '9').ok, false); // zona que no se ofreció
  e = tocar(e, 'zona:0').estado;
  assert.equal(W.aplicar(e, 'dias', 'ok').ok, false); // sin días marcados
  e = tocar(e, 'dia:1').estado;
  assert.equal(W.aplicar(e, 'ini', '540').ok, false); // botón de otro paso
  for (const d of ['dias:ok', 'dur:30', 'ini:540']) e = tocar(e, d).estado;
  assert.equal(W.aplicar(e, 'fin', '545').ok, false); // valor que no se ofreció
  assert.equal(W.aplicar(e, 'fin', '500').ok, false); // antes del inicio
  assert.equal(W.leerBoton('ag:fin:1200;DROP'), null);
  assert.equal(W.leerBoton('autorizar_solicitud:rec123'), null);
});

test('cuestionario: cada opción de hora deja caber al menos una consulta', () => {
  const e = { ...W.inicio(), paso: 'dini', dur: 60, ini: 540, fin: 720 };
  for (const m of W.opciones(e)) {
    assert.ok(m - 540 >= 60);
    assert.ok(720 - m >= 90);
  }
});

test('pareceDeAgenda: filtra mensajes antes de llamar al modelo', () => {
  assert.equal(W.pareceDeAgenda('NOVA estaré fuera los días 5 al 10 de noviembre, no me pongas citas'), true);
  assert.equal(W.pareceDeAgenda('el jueves no voy a consultar en la tarde'), true);
  assert.equal(W.pareceDeAgenda('plan paciente 70 kg 1.70 m'), false);
});

test('interpretarBloqueo: valida la salida del modelo y no adivina', async () => {
  const falso = salida => async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(salida) }] }) });
  const r1 = await W.interpretarBloqueo('fuera del 5 al 10 de noviembre', { ahora: AHORA, fetchImpl: falso({ es_bloqueo: true, desde: '2026-11-05', hasta: '2026-11-10', hora_inicio: null, hora_fin: null, nota: null, duda: null }) });
  assert.deepStrictEqual(r1, { ok: true, bloqueo: { desde: '2026-11-05', hasta: '2026-11-10', ini: null, fin: null, nota: null } });
  const r2 = await W.interpretarBloqueo('la otra semana', { ahora: AHORA, fetchImpl: falso({ es_bloqueo: true, desde: null, duda: '¿Qué días exactamente?' }) });
  assert.deepStrictEqual(r2, { ok: false, duda: '¿Qué días exactamente?' });
  const r3 = await W.interpretarBloqueo('fuera el 30 de febrero', { ahora: AHORA, fetchImpl: falso({ es_bloqueo: true, desde: '2027-02-30', hasta: '2027-02-30' }) });
  assert.equal(r3.ok, false);
  const r4 = await W.interpretarBloqueo('gracias', { ahora: AHORA, fetchImpl: falso({ es_bloqueo: false }) });
  assert.equal(r4.noEsBloqueo, true);
});

// ── Agenda de Google ──────────────────────────────────────────────────
const G = require('../lib/google-agenda');

test('google: el enlace de conexión va firmado y caduca; no se puede cambiar el médico', () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
  const ahora = Date.now();
  const s = G.firmarEstado({ codigo: 'CCMED-QACARD', chat: 123 }, ahora);
  assert.deepStrictEqual(G.leerEstado(s, ahora), { codigo: 'CCMED-QACARD', chat: '123' });
  assert.equal(G.leerEstado(s, ahora + 31 * 60000), null); // caducó
  const [p, f] = s.split('.');
  const otro = Buffer.from(Buffer.from(p, 'base64url').toString().replace('QACARD', 'VIRN01')).toString('base64url');
  assert.equal(G.leerEstado(`${otro}.${f}`, ahora), null); // alterado
  assert.equal(G.leerEstado('CCMED-VIRN01', ahora), null); // el formato viejo (código suelto) ya no vale
});

test('google: ocupado de Google se reparte por día en hora local, incluso cruzando medianoche', () => {
  // Sinaloa (UTC-7): 2026-10-26 16:00Z = 9:00 local; 2026-10-27 06:00Z = 23:00 del 26 → 02:00 del 27.
  const m = G.ocupadosPorDia([
    { start: '2026-10-26T16:00:00Z', end: '2026-10-26T17:30:00Z' },
    { start: '2026-10-27T06:00:00Z', end: '2026-10-27T09:00:00Z' },
  ], 'America/Mazatlan');
  assert.deepStrictEqual(m, { '2026-10-26': [[540, 630], [1380, 1440]], '2026-10-27': [[0, 120]] });
});

test('espaciosLibres: lo ocupado en Google no se ofrece', () => {
  const libres = A.espaciosLibres({ fecha: '2026-10-26', horario: HORARIO, bloqueos: [], ocupados: [], rangosOcupados: [[540, 630]], ahora: AHORA });
  assert.deepStrictEqual(libres, ['10:30', '16:00', '16:30']);
});

test('google: se piden permisos mínimos y se detecta si el médico desmarcó el calendario', () => {
  assert.ok(!G.SCOPES.split(' ').includes('https://www.googleapis.com/auth/calendar'), 'ya no se pide el calendario completo');
  assert.equal(G.permisosSuficientes('https://www.googleapis.com/auth/userinfo.email openid'), false);
  assert.equal(G.permisosSuficientes('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email'), false);
  assert.equal(G.permisosSuficientes('https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events'), true);
  assert.equal(G.permisosSuficientes('https://www.googleapis.com/auth/calendar'), true); // conexiones anteriores
});
