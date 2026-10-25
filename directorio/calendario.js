// directorio/calendario.js
// "Agregar a mi calendario": arma un archivo .ics con la cita y dos
// recordatorios (24 h y 2 h antes). Sirve en iPhone, Android (Google
// Calendar) y Outlook, sin SMS ni costo. Lo usan medico.html y solicitud.html.
//
// La hora acordada es hora LOCAL del consultorio ("2026-10-26 10:00"). Si se
// conoce la zona del consultorio (America/Mazatlan…), se convierte a UTC para
// que el teléfono del paciente la muestre bien aunque esté en otra zona. Si no
// se conoce, se deja "flotante" (el calendario la toma en la hora local del
// teléfono) — nunca se adivina una zona.
(function (raiz) {
  'use strict';

  const dos = n => String(n).padStart(2, '0');

  // Instante UTC de una hora local en `zona` (dos pasadas: cubre el cambio de horario).
  function utcDesdeLocal(ymd, hm, zona) {
    const [y, m, d] = ymd.split('-').map(Number);
    const [H, M] = hm.split(':').map(Number);
    const objetivo = Date.UTC(y, m - 1, d, H, M);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    let t = objetivo;
    for (let i = 0; i < 2; i++) {
      const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value]));
      const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
      t += objetivo - comoUTC;
    }
    return new Date(t);
  }

  const sello = f => `${f.getUTCFullYear()}${dos(f.getUTCMonth() + 1)}${dos(f.getUTCDate())}T${dos(f.getUTCHours())}${dos(f.getUTCMinutes())}00Z`;

  // Texto de un campo .ics: escapa \ ; , y saltos de línea (RFC 5545 §3.3.11).
  const textoIcs = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  // Líneas de más de 75 octetos se doblan con CRLF + espacio.
  function doblar(linea) {
    const partes = [];
    let resto = linea;
    while (new TextEncoder().encode(resto).length > 75) {
      let corte = 74;
      while (new TextEncoder().encode(resto.slice(0, corte)).length > 74) corte--;
      partes.push(resto.slice(0, corte));
      resto = ' ' + resto.slice(corte);
    }
    partes.push(resto);
    return partes.join('\r\n');
  }

  // { fecha:'YYYY-MM-DD', hora:'HH:mm', duracion:min, zona:'America/…'|null, titulo, descripcion, lugar, uid, ahora }
  function armarIcs(c) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha || '') || !/^\d{2}:\d{2}$/.test(c.hora || '')) throw new Error('Fecha u hora inválida');
    const dur = Number(c.duracion) > 0 ? Number(c.duracion) : 30;
    let inicio, fin;
    if (c.zona) {
      const i = utcDesdeLocal(c.fecha, c.hora, c.zona);
      inicio = 'DTSTART:' + sello(i);
      fin = 'DTEND:' + sello(new Date(i.getTime() + dur * 60000));
    } else {
      const [y, m, d] = c.fecha.split('-').map(Number);
      const [H, M] = c.hora.split(':').map(Number);
      const f = new Date(Date.UTC(y, m - 1, d, H, M + dur));
      inicio = `DTSTART:${c.fecha.replace(/-/g, '')}T${c.hora.replace(':', '')}00`;
      fin = `DTEND:${f.getUTCFullYear()}${dos(f.getUTCMonth() + 1)}${dos(f.getUTCDate())}T${dos(f.getUTCHours())}${dos(f.getUTCMinutes())}00`;
    }
    const alarma = (trigger, texto) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${textoIcs(texto)}`, 'END:VALARM'];
    const lineas = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CODE CELLS//Directorio//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${c.uid || 'cita-' + c.fecha + '-' + c.hora.replace(':', '')}@codecells.mx`,
      `DTSTAMP:${sello(c.ahora || new Date())}`,
      inicio, fin,
      `SUMMARY:${textoIcs(c.titulo || 'Cita médica')}`,
      `DESCRIPTION:${textoIcs(c.descripcion || '')}`,
      ...(c.lugar ? [`LOCATION:${textoIcs(c.lugar)}`] : []),
      ...alarma('-P1D', 'Mañana: ' + (c.titulo || 'cita médica')),
      ...alarma('-PT2H', 'En 2 horas: ' + (c.titulo || 'cita médica')),
      'END:VEVENT', 'END:VCALENDAR',
    ];
    return lineas.map(doblar).join('\r\n') + '\r\n';
  }

  // En el navegador: descarga el archivo (el teléfono ofrece agregarlo al calendario).
  function descargarIcs(c) {
    const blob = new Blob([armarIcs(c)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cita-codecells-${c.fecha}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const api = { utcDesdeLocal, armarIcs, descargarIcs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.CalendarioCita = api;
})(typeof window !== 'undefined' ? window : globalThis);
