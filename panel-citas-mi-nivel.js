// ═══════════════════════════════════════════════════════════════════════════
// ─── PANEL DE CITAS PARA PACIENTE (mi-nivel.html) ──────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

async function cargarCitasPaciente() {
  try {
    const codigoPaciente = localStorage.getItem('pacienteCodigoActual') || 'CC-PAC-DEMO01';
    
    // Obtener todas las citas del paciente
    const formula = `{Código de paciente ref} = '${codigoPaciente}'`;
    const res = await fetch(`/api/airtable?tabla=consultas&filterByFormula=${encodeURIComponent(formula)}&sort=[{"field": "Fecha de consulta", "direction": "asc"}]`);
    const data = await res.json();
    
    const citas = (data.records || []).map(r => ({
      id: r.id,
      fecha: r.fields['Fecha de consulta'],
      hora: r.fields['Hora de consulta'],
      medico: r.fields['Médico']?.[0],
      medicoNombre: r.fields['Médico Nombre'],
      sistema: r.fields['Sistema CODE'],
      protocolo: r.fields['Protocolo'],
      indicaciones: r.fields['Indicaciones médicas'] || '',
      receta: r.fields['Receta personalizada'] || '',
      confirmado: r.fields['Confirmó Cita'] || false,
      estado: r.fields['Estado del protocolo']
    })).filter(c => c.fecha);
    
    // Filtrar solo citas futuras
    const hoy = new Date();
    const citasFuturas = citas.filter(c => {
      const fechaCita = new Date(c.fecha);
      return fechaCita >= hoy;
    });
    
    console.log('✅ Citas cargadas:', citasFuturas.length);
    mostrarCitasPaciente(citasFuturas);
  } catch (err) {
    console.error('Error cargando citas:', err);
  }
}

function mostrarCitasPaciente(citas) {
  const container = document.getElementById('lista-citas-paciente');
  const contador = document.getElementById('contador-citas');
  
  if (!container) return;
  
  // Actualizar contador
  if (contador) {
    contador.textContent = `${citas.length} cita${citas.length !== 1 ? 's' : ''}`;
  }
  
  if (citas.length === 0) {
    container.innerHTML = `
      <div class="citas-vacio">
        <p>No tienes citas agendadas</p>
        <small>Contacta a tu médico para agendar una</small>
      </div>
    `;
    return;
  }
  
  const html = citas.map(cita => `
    <div class="cita-card">
      <div class="cita-card-header">
        <div class="cita-fecha-hora">
          <div class="cita-fecha">${formatearFecha(cita.fecha)}</div>
          <div class="cita-hora">⏰ ${cita.hora}</div>
        </div>
        <div class="cita-status ${cita.confirmado ? '' : 'pendiente'}">
          ${cita.confirmado ? '✅ Confirmada' : '⏳ Pendiente'}
        </div>
      </div>
      
      <div class="cita-card-info">
        <div class="cita-info-row">
          <span class="cita-info-label">👨‍⚕️ Médico:</span>
          <span class="cita-info-valor cita-medico">${cita.medicoNombre || 'Por asignar'}</span>
        </div>
        <div class="cita-info-row">
          <span class="cita-info-label">🔬 Sistema:</span>
          <span class="cita-info-valor">${cita.sistema || 'CONTINUUM™'}</span>
        </div>
        <div class="cita-info-row">
          <span class="cita-info-label">📋 Protocolo:</span>
          <span class="cita-info-valor">${cita.protocolo || 'Evaluación'}</span>
        </div>
      </div>
      
      <div class="cita-card-acciones">
        ${cita.indicaciones ? `<button class="btn-cita-accion" onclick="mostrarIndicaciones('${cita.id}')">📋 Indicaciones</button>` : ''}
        ${cita.receta ? `<button class="btn-cita-accion" onclick="mostrarReceta('${cita.id}')">💊 Receta</button>` : ''}
        ${!cita.confirmado ? `<button class="btn-cita-accion btn-cita-confirmar" onclick="confirmarCita('${cita.id}')">✅ Confirmar</button>` : ''}
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

function formatearFecha(fechaStr) {
  const fecha = new Date(fechaStr + 'T00:00:00');
  const opciones = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  return fecha.toLocaleDateString('es-MX', opciones).replace(/\./g, '');
}

function mostrarIndicaciones(citaId) {
  const cita = document.querySelector(`[data-cita-id="${citaId}"]`);
  if (!cita) return;
  
  const titulo = '📋 Indicaciones Médicas';
  const contenido = cita.dataset.indicaciones || 'Sin indicaciones registradas';
  
  abrirModalInfo(titulo, contenido);
}

function mostrarReceta(citaId) {
  const cita = document.querySelector(`[data-cita-id="${citaId}"]`);
  if (!cita) return;
  
  const titulo = '💊 Receta Personalizada';
  const contenido = cita.dataset.receta || 'Sin receta registrada';
  
  abrirModalInfo(titulo, contenido);
}

function abrirModalInfo(titulo, contenido) {
  const modal = document.createElement('div');
  modal.className = 'modal-info-cita';
  modal.innerHTML = `
    <div class="modal-info-content">
      <div class="modal-info-header">
        <h4>${titulo}</h4>
        <button class="modal-info-close" onclick="this.closest('.modal-info-cita').remove()">✕</button>
      </div>
      <div class="modal-info-body">
        ${contenido}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

async function confirmarCita(citaId) {
  try {
    // Actualizar en Airtable
    const res = await fetch('/api/airtable', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tabla: 'consultas',
        recordId: citaId,
        fields: {
          'Confirmó Cita': true,
          'Confirmó Cita_Fecha': new Date().toISOString().split('T')[0]
        }
      })
    });
    
    if (!res.ok) throw new Error('Error confirmando cita');
    
    console.log('✅ Cita confirmada');
    cargarCitasPaciente(); // Recargar
  } catch (err) {
    console.error('Error confirmando cita:', err);
    alert('Error al confirmar la cita');
  }
}

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    cargarCitasPaciente();
  }, 1000);
});

