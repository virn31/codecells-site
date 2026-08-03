// ═══════════════════════════════════════════════════════════════════════════
// ─── TELEGRAM NOTIFICACIONES - Enviar indicaciones + receta al paciente ─────
// ═══════════════════════════════════════════════════════════════════════════

async function enviarNotificacionCitaTelegram(cita) {
  try {
    // Verificar que paciente tiene teléfono
    if (!cita.telefonoPaciente) {
      console.log('⚠️ Paciente sin teléfono registrado, no se puede enviar Telegram');
      return false;
    }
    
    // Generar indicaciones y receta con NOVA
    const indicaciones = await generarIndicacionesMedicas(cita);
    const receta = await generarRecetaPersonalizada(cita);
    
    // Construir mensaje Telegram
    const mensaje = `
🔬 *Tu Cita está Confirmada*

📅 *Fecha:* ${formatearFechaTelegram(cita.fecha)}
⏰ *Hora:* ${cita.hora}

👨‍⚕️ *Médico:* ${cita.medicoNombre}
💼 *Sistema:* ${cita.sistema || 'CONTINUUM™'}

---

*📋 INDICACIONES MÉDICAS:*
${indicaciones}

---

*💊 RECETA PERSONALIZADA:*
${receta}

---

✅ *Confirma tu asistencia respondiendo aquí*
    `.trim();
    
    // Enviar por Telegram
    const res = await fetch('/api/telegram-notificaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'cita_agendada',
        citaId: cita.id,
        telefonoPaciente: cita.telefonoPaciente,
        mensaje,
        indicaciones,
        receta
      })
    });
    
    if (!res.ok) {
      console.error('Error enviando notificación Telegram');
      return false;
    }
    
    const data = await res.json();
    console.log('✅ Notificación Telegram enviada:', data.messageId);
    
    return true;
  } catch (err) {
    console.error('Error en notificación Telegram:', err);
    return false;
  }
}

async function generarIndicacionesMedicas(cita) {
  try {
    const res = await fetch('/api/nova-asistente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'generar_indicaciones',
        citaId: cita.id,
        pacienteNombre: cita.pacienteNombre,
        protocolo: cita.protocolo,
        sistema: cita.sistema,
        medicoNombre: cita.medicoNombre,
        notasMedico: cita.notasMedico
      })
    });
    
    if (!res.ok) throw new Error('Error generando indicaciones');
    
    const data = await res.json();
    return data.indicaciones || '';
  } catch (err) {
    console.error('Error generando indicaciones:', err);
    return 'Sigue las indicaciones de tu médico. Consulta cualquier duda.';
  }
}

async function generarRecetaPersonalizada(cita) {
  try {
    const res = await fetch('/api/nova-asistente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'generar_receta',
        citaId: cita.id,
        pacienteNombre: cita.pacienteNombre,
        protocolo: cita.protocolo,
        sistema: cita.sistema,
        medicoNombre: cita.medicoNombre
      })
    });
    
    if (!res.ok) throw new Error('Error generando receta');
    
    const data = await res.json();
    return data.receta || '';
  } catch (err) {
    console.error('Error generando receta:', err);
    return 'Medicamentos y suplementos según indicaciones del médico.';
  }
}

function formatearFechaTelegram(fechaStr) {
  const fecha = new Date(fechaStr + 'T00:00:00');
  const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return fecha.toLocaleDateString('es-MX', opciones);
}

// Recordatorio automático 24h antes
async function enviarRecordatorioCita(cita) {
  try {
    if (!cita.telefonoPaciente) return;
    
    const mensaje = `
📌 *Recordatorio: Tu Cita es Mañana*

👨‍⚕️ ${cita.medicoNombre}
⏰ ${cita.hora}

✅ *Responde "Confirmo" para confirmar tu asistencia*
    `.trim();
    
    const res = await fetch('/api/telegram-notificaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'recordatorio_24h',
        citaId: cita.id,
        telefonoPaciente: cita.telefonoPaciente,
        mensaje
      })
    });
    
    if (res.ok) {
      console.log('✅ Recordatorio enviado');
    }
  } catch (err) {
    console.error('Error enviando recordatorio:', err);
  }
}

