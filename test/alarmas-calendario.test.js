// "Alarmas en mi calendario" de la app del paciente (lib/alarmasCalendario.js).
// Corre con: node --test
const test = require('node:test');
const assert = require('node:assert');
const A = require('../lib/alarmasCalendario.js');
const meds = require('../lib/medicamentos.js');

const HOY = '2026-10-26';
const med = (x) => ({ id: 'recMED00000000001', nombre: 'Metformina', dosis: '850 mg', estado: 'Activo', inicio: '2026-10-20', frecuencia: 'c12h', duracionDias: 30, indicaciones: 'con alimentos', ...x });
const eventos = ics => ics.split('BEGIN:VEVENT').slice(1);

test('las frecuencias coinciden con lib/medicamentos.js', () => {
  for (const [codigo, fr] of Object.entries(meds.FRECUENCIAS)) {
    if (codigo === 'prn') { assert.ok(!A.FRECUENCIAS.prn, 'prn no tiene horario'); continue; }
    assert.deepStrictEqual(A.FRECUENCIAS[codigo], { tomasDia: fr.tomasDia, cadaDias: fr.cadaDias }, codigo);
  }
});

test('horas de las tomas desde la primera que elige el paciente', () => {
  assert.deepStrictEqual(A.horasDeTomas('c12h', '08:00'), ['08:00', '20:00']);
  assert.deepStrictEqual(A.horasDeTomas('c8h', '07:30'), ['07:30', '15:30', '23:30']);
  assert.deepStrictEqual(A.horasDeTomas('c8h', '16:00'), ['16:00', '00:00', '08:00']);
  assert.deepStrictEqual(A.horasDeTomas('c24h', '21:15'), ['21:15']);
  assert.deepStrictEqual(A.horasDeTomas('prn', '08:00'), []);
  assert.deepStrictEqual(A.horasDeTomas('c12h', '8'), [], 'hora inválida: nada');
  assert.deepStrictEqual(A.horasDeTomas('c12h', '24:00'), []);
});

test('c12h a las 8:00: dos eventos diarios desde hoy hasta el último día de la receta, alarma a la hora', () => {
  const { ics, incluidos } = A.armarIcsTomas({ meds: [med()], horas: { recMED00000000001: '08:00' }, hoy: HOY, ahora: new Date('2026-10-26T15:00:00Z') });
  assert.deepStrictEqual(incluidos, [{ id: 'recMED00000000001', nombre: 'Metformina', horas: ['08:00', '20:00'] }]);
  const ev = eventos(ics);
  assert.strictEqual(ev.length, 2);
  assert.match(ev[0], /DTSTART:20261026T080000\r\n/);
  assert.match(ev[1], /DTSTART:20261026T200000\r\n/);
  // 30 días desde el 20 de octubre: el último día con tomas es el 18 de noviembre.
  for (const e of ev) {
    assert.match(e, /RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20261118T235959\r\n/);
    assert.match(e, /TRIGGER:PT0M/);
    assert.match(e, /SUMMARY:Toma: Metformina 850 mg/);
  }
  for (const l of ics.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75, 'línea larga: ' + l);
});

test('una hora que pasa la medianoche empieza al día siguiente (no suena antes de la primera toma)', () => {
  const { ics } = A.armarIcsTomas({ meds: [med({ frecuencia: 'c8h' })], horas: { recMED00000000001: '16:00' }, hoy: HOY });
  const ev = eventos(ics);
  assert.match(ev[0], /DTSTART:20261026T160000/);
  assert.match(ev[1], /DTSTART:20261027T000000/);
  assert.match(ev[2], /DTSTART:20261027T080000/);
});

test('cada 48 h y semanal respetan el ciclo contado desde el inicio de la receta', () => {
  // Inicio 20 oct, cada 48 h: tocan 20, 22, 24, 26 → hoy (26) toca.
  assert.strictEqual(A.primerDia(med({ frecuencia: 'c48h' }), HOY), '2026-10-26');
  // Inicio 21 oct, cada 48 h: 21, 23, 25, 27 → el primero desde hoy es el 27.
  assert.strictEqual(A.primerDia(med({ frecuencia: 'c48h', inicio: '2026-10-21' }), HOY), '2026-10-27');
  // Semanal desde el 20 oct: el siguiente es el 27.
  const { ics } = A.armarIcsTomas({ meds: [med({ frecuencia: 'semanal', duracionDias: null })], horas: { recMED00000000001: '09:00' }, hoy: HOY });
  assert.match(ics, /DTSTART:20261027T090000/);
  assert.match(ics, /RRULE:FREQ=DAILY;INTERVAL=7\r\n/, 'sin duración: sin fecha de fin');
  // Receta que empieza en el futuro: arranca ese día.
  assert.strictEqual(A.primerDia(med({ inicio: '2026-11-02' }), HOY), '2026-11-02');
});

test('sin alarma: "solo si lo necesita", suspendido, terminado o sin hora elegida', () => {
  const r = A.armarIcsTomas({
    meds: [
      med({ id: 'recPRN', frecuencia: 'prn' }),
      med({ id: 'recSUSP', estado: 'Suspendido' }),
      med({ id: 'recFIN', inicio: '2026-09-01', duracionDias: 10 }),
      med({ id: 'recSINHORA' }),
    ],
    horas: { recPRN: '08:00', recSUSP: '08:00', recFIN: '08:00' }, hoy: HOY,
  });
  assert.strictEqual(r.ics, null);
  assert.deepStrictEqual(r.incluidos, []);
});

test('discreto: el aviso no dice el medicamento ni las indicaciones (se ve en la pantalla bloqueada)', () => {
  const { ics } = A.armarIcsTomas({ meds: [med()], horas: { recMED00000000001: '08:00' }, hoy: HOY, discreto: true });
  assert.ok(!/Metformina|850|alimentos/.test(ics));
  assert.match(ics, /SUMMARY:Toma de medicamento/);
});

test('cita: todo el día (la hora no se inventa) con aviso la víspera y el mismo día', () => {
  const ics = A.armarIcsCita({ fecha: '2026-12-20', medico: 'Dr. Víctor Rodríguez' });
  assert.match(ics, /DTSTART;VALUE=DATE:20261220\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261221\r\n/);
  assert.match(ics, /TRIGGER:-PT15H/);
  assert.match(ics, /TRIGGER:PT7H/);
  assert.match(ics, /SUMMARY:Cita con Dr. Víctor Rodríguez/);
  assert.ok(!/T\d{6}/.test(ics.split('DTSTAMP')[0] + ics.split(/DTSTAMP:[^\r]*/)[1]), 'ninguna hora fuera del sello');
  assert.match(A.armarIcsCita({ fecha: '2026-12-20', medico: 'Dr. X', discreto: true }), /SUMMARY:Cita médica/);
  assert.throws(() => A.armarIcsCita({ fecha: '20-12-2026' }));
});
