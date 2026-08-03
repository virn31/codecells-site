// ═══════════════════════════════════════════════════════════════════════════
// ─── GOOGLE CALENDAR AUTOMÁTICO - Crear evento al agendar ──────────────────
// ═══════════════════════════════════════════════════════════════════════════

async function crearEventoGoogleCalendar(cita) {
  try {
    // Verificar si médico tiene token
    const tieneToken = localStorage.getItem('googleCalendarToken');
    if (!tieneToken) {
      console.log('⚠️ Médico no ha conectado Google Calendar');
      return;
    }
    
    // Construir evento
    const fecha = new Date(cita.fecha + 'T' + cita.hora);
    const fechaFin = new Date(fecha.getTime() + (calendarioState.duracionConsulta * 60000));
    
    const evento = {
      summary: `Cita: ${cita.pacienteNombre} - ${cita.sistema || 'CONTINUUM™'}`,
      description: `
Paciente: ${cita.pacienteNombre} (${cita.codigoPaciente})
Edad: ${cita.edadPaciente || '?'}
Protocolo: ${cita.protocolo || 'Evaluación'}
Sistema: ${cita.sistema || 'CONTINUUM™'}
Motivo: ${cita.motivo || 'Consulta'}
      `.trim(),
      start: {
        dateTime: fecha.toISOString(),
        timeZone: 'America/Mazatlan'
      },
      end: {
        dateTime: fechaFin.toISOString(),
        timeZone: 'America/Mazatlan'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'notification', minutes: 60 },  // 1 hora antes
          { method: 'notification', minutes: 1440 } // 24 horas antes
        ]
      }
    };
    
    // Llamar API Google Calendar
    const res = await fetch('/api/google-calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'crear_evento',
        evento
      })
    });
    
    if (!res.ok) {
      console.error('Error creando evento Google Calendar');
      return;
    }
    
    const data = await res.json();
    console.log('✅ Evento creado en Google Calendar:', data.eventId);
    
    return data.eventId;
  } catch (err) {
    console.error('Error con Google Calendar:', err);
  }
}

async function actualizarEventoGoogleCalendar(citaId, nuevosDatos) {
  try {
    const tieneToken = localStorage.getItem('googleCalendarToken');
    if (!tieneToken) return;
    
    const res = await fetch('/api/google-calendar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'actualizar_evento',
        citaId,
        datos: nuevosDatos
      })
    });
    
    if (res.ok) {
      console.log('✅ Evento actualizado en Google Calendar');
    }
  } catch (err) {
    console.error('Error actualizando evento:', err);
  }
}

async function eliminarEventoGoogleCalendar(citaId) {
  try {
    const tieneToken = localStorage.getItem('googleCalendarToken');
    if (!tieneToken) return;
    
    const res = await fetch('/api/google-calendar', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'eliminar_evento',
        citaId
      })
    });
    
    if (res.ok) {
      console.log('✅ Evento eliminado de Google Calendar');
    }
  } catch (err) {
    console.error('Error eliminando evento:', err);
  }
}

