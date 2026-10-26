// lib/alarmasCalendario.js
// "Alarmas en mi calendario" (app del paciente): arma un .ics que el teléfono
// agrega a SU calendario, con alarma. Suena con la app cerrada y sin
// internet, en iPhone y Android, sin servidor ni terceros. Opcional: solo se
// crea si el paciente toca el botón, y lo borra desde su calendario.
//
// La receta trae la FRECUENCIA ("cada 12 horas"), no la hora: la hora de la
// primera toma la elige el paciente y de ahí se reparten las demás. Es su
// recordatorio, no un dato clínico — no se guarda en el expediente.
//
// Horas "flotantes" (sin zona): 8:00 es 8:00 en el reloj del teléfono, esté
// donde esté el paciente. Requiere directorio/calendario.js (textoIcs, doblar,
// sello) y las FRECUENCIAS de lib/medicamentos.js (copiadas abajo: este
// archivo corre en el navegador).
(function (raiz) {
  'use strict';

  const Cal = (typeof module !== 'undefined' && module.exports) ? require('../directorio/calendario.js') : raiz.CalendarioCita;
  const dos = n => String(n).padStart(2, '0');

  // tomasDia / cadaDias por código, igual que lib/medicamentos.js FRECUENCIAS
  // (la prueba verifica que coincidan). 'prn' no tiene horario: sin alarma.
  const FRECUENCIAS = {
    c4h: { tomasDia: 6, cadaDias: 1 }, c6h: { tomasDia: 4, cadaDias: 1 }, c8h: { tomasDia: 3, cadaDias: 1 },
    c12h: { tomasDia: 2, cadaDias: 1 }, c24h: { tomasDia: 1, cadaDias: 1 }, c48h: { tomasDia: 1, cadaDias: 2 },
    semanal: { tomasDia: 1, cadaDias: 7 },
  };

  const esDia = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  const esHora = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h || '');
  function sumarDias(dia, n) { const d = new Date(dia + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function diasEntre(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400e3); }
  const minutos = h => +h.slice(0, 2) * 60 + +h.slice(3, 5);
  const hora = m => dos(Math.floor(m / 60) % 24) + ':' + dos(m % 60);

  // Horas del día de cada toma a partir de la primera: c8h + '07:00' →
  // ['07:00','15:00','23:00']. Frecuencia sin horario → [].
  function horasDeTomas(frecuencia, primera) {
    const fr = FRECUENCIAS[frecuencia];
    if (!fr || !esHora(primera)) return [];
    const paso = (24 * 60) / fr.tomasDia;
    return Array.from({ length: fr.tomasDia }, (_, k) => hora((minutos(primera) + k * paso) % (24 * 60)));
  }

  // Primer día >= hoy que le toca (respeta el ciclo de cada 48 h / semanal
  // contado desde el inicio de la receta). null si ya terminó.
  function primerDia(med, hoy) {
    const fr = FRECUENCIAS[med.frecuencia];
    let dia = med.inicio > hoy ? med.inicio : hoy;
    const desfase = diasEntre(med.inicio, dia) % fr.cadaDias;
    if (desfase) dia = sumarDias(dia, fr.cadaDias - desfase);
    return dia;
  }
  // Último día con tomas (inclusive) o null si no tiene duración.
  function ultimoDia(med) {
    return med.duracionDias ? sumarDias(med.inicio, med.duracionDias - 1) : null;
  }

  // Medicamento al que se le pueden poner alarmas hoy: activo, con horario
  // fijo y sin terminar.
  function admiteAlarma(med, hoy) {
    if (!med || med.estado !== 'Activo' || !FRECUENCIAS[med.frecuencia] || !esDia(med.inicio)) return false;
    const fin = ultimoDia(med);
    return !fin || primerDia(med, hoy) <= fin;
  }

  function alarma(texto) {
    return ['BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', `DESCRIPTION:${Cal.textoIcs(texto)}`, 'END:VALARM'];
  }
  function envolver(eventos, ahora) {
    const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CODE CELLS//App del paciente//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
      .concat(...eventos.map(e => e(Cal.sello(ahora || new Date()))), ['END:VCALENDAR']);
    return lineas.map(Cal.doblar).join('\r\n') + '\r\n';
  }

  // { meds: [medicamento público], horas: { medId: 'HH:mm' }, hoy: 'YYYY-MM-DD',
  //   discreto: bool, ahora } → { ics, incluidos: [{id, nombre, horas}] }.
  // Solo entran los meds que admiten alarma y tienen hora elegida. Con
  // `discreto` el aviso dice "Toma de medicamento" (se ve en la pantalla
  // bloqueada) en vez del nombre y la dosis.
  function armarIcsTomas({ meds, horas, hoy, discreto, ahora }) {
    if (!esDia(hoy)) throw new Error('Día inválido');
    const eventos = [], incluidos = [];
    for (const med of meds || []) {
      const primera = horas && horas[med.id];
      if (!admiteAlarma(med, hoy) || !esHora(primera)) continue;
      const fr = FRECUENCIAS[med.frecuencia];
      const inicio = primerDia(med, hoy), fin = ultimoDia(med);
      const titulo = discreto ? 'Toma de medicamento' : `Toma: ${med.nombre}${med.dosis ? ' ' + med.dosis : ''}`;
      const lista = horasDeTomas(med.frecuencia, primera);
      lista.forEach((h, k) => {
        // Una hora que da la vuelta a la medianoche (primera 16:00 → 00:00)
        // empieza al día siguiente: no suena antes de la primera toma.
        const diaK = minutos(h) < minutos(primera) ? sumarDias(inicio, 1) : inicio;
        if (fin && diaK > fin) return;
        eventos.push(stamp => [
          'BEGIN:VEVENT',
          `UID:toma-${med.id}-${k + 1}@codecells.mx`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${diaK.replace(/-/g, '')}T${h.replace(':', '')}00`,
          'DURATION:PT5M',
          `RRULE:FREQ=DAILY;INTERVAL=${fr.cadaDias}` + (fin ? `;UNTIL=${fin.replace(/-/g, '')}T235959` : ''),
          `SUMMARY:${Cal.textoIcs(titulo)}`,
          `DESCRIPTION:${Cal.textoIcs((discreto ? '' : (med.indicaciones ? med.indicaciones + '\n' : '')) + 'Márcala como tomada en tu app CODE CELLS™.')}`,
          ...alarma(titulo),
          'END:VEVENT',
        ]);
      });
      incluidos.push({ id: med.id, nombre: med.nombre, horas: lista });
    }
    return { ics: incluidos.length ? envolver(eventos, ahora) : null, incluidos };
  }

  // Próxima cita: la fecha la anotó el médico, la HORA no (se confirma con el
  // consultorio) → evento de todo el día con aviso la víspera a las 9:00 y el
  // mismo día a las 7:00. Nunca se inventa una hora.
  function armarIcsCita({ fecha, medico, discreto, ahora }) {
    if (!esDia(fecha)) throw new Error('Fecha inválida');
    const titulo = discreto || !medico ? 'Cita médica' : `Cita con ${medico}`;
    return envolver([stamp => [
      'BEGIN:VEVENT',
      `UID:cita-app-${fecha}${medico ? '-' + medico.replace(/[^A-Za-z0-9]/g, '').slice(0, 30) : ''}@codecells.mx`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${fecha.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${sumarDias(fecha, 1).replace(/-/g, '')}`,
      `SUMMARY:${Cal.textoIcs(titulo)}`,
      `DESCRIPTION:${Cal.textoIcs('Fecha anotada por tu médico. Confirma la hora con su consultorio.')}`,
      ...['BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15H', `DESCRIPTION:${Cal.textoIcs('Mañana: ' + titulo)}`, 'END:VALARM'],
      ...['BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT7H', `DESCRIPTION:${Cal.textoIcs('Hoy: ' + titulo)}`, 'END:VALARM'],
      'END:VEVENT',
    ]], ahora);
  }

  function descargar(ics, nombreArchivo) {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombreArchivo;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const api = { FRECUENCIAS, horasDeTomas, primerDia, ultimoDia, admiteAlarma, armarIcsTomas, armarIcsCita, descargar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.AlarmasCalendario = api;
})(typeof window !== 'undefined' ? window : globalThis);
