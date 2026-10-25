// "Agregar a mi calendario" (directorio/calendario.js). Corre con: node --test
const test = require('node:test');
const assert = require('node:assert');
const Cal = require('../directorio/calendario.js');

test('utcDesdeLocal: 10:00 en Culiacán (UTC-7) es 17:00 UTC; en CDMX (UTC-6) es 16:00 UTC', () => {
  assert.strictEqual(Cal.utcDesdeLocal('2026-10-26', '10:00', 'America/Mazatlan').toISOString(), '2026-10-26T17:00:00.000Z');
  assert.strictEqual(Cal.utcDesdeLocal('2026-10-26', '10:00', 'America/Mexico_City').toISOString(), '2026-10-26T16:00:00.000Z');
  assert.strictEqual(Cal.utcDesdeLocal('2026-07-01', '09:30', 'America/Tijuana').toISOString(), '2026-07-01T16:30:00.000Z', 'Tijuana en horario de verano (UTC-7)');
});

test('armarIcs: evento con zona → UTC, duración, dos recordatorios y texto escapado', () => {
  const ics = Cal.armarIcs({ fecha: '2026-10-26', hora: '10:00', duracion: 45, zona: 'America/Mazatlan', titulo: 'Cita con Dr. X, CODE CELLS', descripcion: 'Línea 1\nLínea 2; fin', uid: 'abc', ahora: new Date('2026-10-23T00:00:00Z') });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261026T170000Z\r\n/);
  assert.match(ics, /DTEND:20261026T174500Z\r\n/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.match(ics, /TRIGGER:-PT2H/);
  const BS = String.fromCharCode(92); // una barra invertida
  assert.ok(ics.includes(`SUMMARY:Cita con Dr. X${BS}, CODE CELLS\r\n`), 'coma escapada');
  assert.ok(ics.includes(`DESCRIPTION:Línea 1${BS}nLínea 2${BS}; fin\r\n`), 'salto y punto y coma escapados');
  assert.match(ics, /UID:abc@codecells\.mx/);
  for (const l of ics.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75, 'línea larga: ' + l);
});

test('armarIcs: sin zona conocida la hora queda flotante (no se adivina la zona)', () => {
  const ics = Cal.armarIcs({ fecha: '2026-10-26', hora: '23:45', duracion: 30, zona: null, titulo: 'Cita' });
  assert.match(ics, /DTSTART:20261026T234500\r\n/);
  assert.match(ics, /DTEND:20261027T001500\r\n/, 'cruza la medianoche');
});

test('armarIcs: fecha u hora inválida → error (no se arma un evento a ciegas)', () => {
  assert.throws(() => Cal.armarIcs({ fecha: '26/10/2026', hora: '10:00' }));
  assert.throws(() => Cal.armarIcs({ fecha: '2026-10-26', hora: '' }));
});

test('armarIcs: el lugar va en LOCATION (escapado); sin lugar no hay LOCATION', () => {
  const con = Cal.armarIcs({ fecha: '2026-11-02', hora: '10:00', zona: null, titulo: 'Cita', lugar: 'Av. Obregón 123, Col. Centro; Culiacán', ahora: new Date('2026-10-24T00:00:00Z') });
  assert.match(con, /LOCATION:Av\. Obregón 123\\, Col\. Centro\\; Culiacán/);
  const sin = Cal.armarIcs({ fecha: '2026-11-02', hora: '10:00', zona: null, titulo: 'Cita', ahora: new Date('2026-10-24T00:00:00Z') });
  assert.ok(!/LOCATION/.test(sin));
});
