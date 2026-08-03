// ═══════════════════════════════════════════════════════════════════════════
// ─── MODAL NUEVA CITA MEJORADO - AUTOCOMPLETE + HORARIOS ──────────────────
// ═══════════════════════════════════════════════════════════════════════════

let autocompletePacientes = [];
let pacienteSeleccionado = null;
let horariosDisponibles = [];

// ─── CARGAR PACIENTES PARA AUTOCOMPLETE ───────────────────────────────────
async function cargarPacientesAutocomplete() {
  try {
    const res = await fetch(`/api/airtable?tabla=pacientes&maxRecords=1000`);
    const data = await res.json();
    
    autocompletePacientes = data.records.map(r => ({
      id: r.id,
      codigo: r.fields['Código de paciente'],
      nombre: r.fields['Nombre completo'],
      edad: r.fields['Edad'],
      protocolo: r.fields['Protocolo actual']?.[0],
      sexo: r.fields['Sexo biológico'],
      telefono: r.fields['Teléfono/WhatsApp']
    })).filter(p => p.codigo && p.nombre);
    
    console.log('✅ Pacientes cargados:', autocompletePacientes.length);
  } catch (err) {
    console.error('Error cargando pacientes:', err);
  }
}

// ─── MOSTRAR SUGERENCIAS AUTOCOMPLETE ──────────────────────────────────────
function mostrarSugerenciasPacientes(input) {
  const contenedor = document.getElementById('sugerencias-pacientes');
  if (!contenedor) return;
  
  const valor = input.toUpperCase();
  if (!valor || valor.length < 2) {
    contenedor.innerHTML = '';
    return;
  }
  
  const coincidencias = autocompletePacientes.filter(p => 
    p.codigo.includes(valor) || 
    p.nombre.toUpperCase().includes(valor)
  ).slice(0, 8);
  
  if (coincidencias.length === 0) {
    contenedor.innerHTML = '<div style="padding:8px;color:#999;font-size:12px;">Sin resultados</div>';
    return;
  }
  
  const html = coincidencias.map(p => `
    <div class="sugerencia-paciente" onclick="seleccionarPaciente(${p.id})">
      <div class="sugerencia-codigo">${p.codigo}</div>
      <div class="sugerencia-nombre">${p.nombre}</div>
      <div class="sugerencia-detalle">${p.edad || '?'} años • ${p.protocolo || 'Sin protocolo'}</div>
    </div>
  `).join('');
  
  contenedor.innerHTML = html;
}

// ─── SELECCIONAR PACIENTE ───────────────────────────────────────────────────
async function seleccionarPaciente(pacienteId) {
  const paciente = autocompletePacientes.find(p => p.id === pacienteId);
  if (!paciente) return;
  
  pacienteSeleccionado = paciente;
  
  // Actualizar input
  document.getElementById('nc-codigo-paciente').value = paciente.codigo;
  document.getElementById('sugerencias-pacientes').innerHTML = '';
  
  // Cargar protocolo completo
  let protocoloData = {};
  if (paciente.protocolo) {
    try {
      const res = await fetch(`/api/airtable?tabla=protocolos&recordId=${paciente.protocolo}`);
      const data = await res.json();
      protocoloData = data.fields || {};
    } catch (err) {
      console.error('Error cargando protocolo:', err);
    }
  }
  
  // Mostrar datos del paciente
  mostrarDatosPacienteSeleccionado(paciente, protocoloData);
  
  // Cargar horarios disponibles
  await cargarHorariosDisponibles();
}

// ─── MOSTRAR DATOS DEL PACIENTE SELECCIONADO ───────────────────────────────
function mostrarDatosPacienteSeleccionado(paciente, protocolo) {
  const datosPaciente = document.getElementById('datos-paciente-seleccionado');
  
  if (!datosPaciente) {
    // Crear si no existe
    const html = `
      <div id="datos-paciente-seleccionado" class="datos-paciente-card">
        <div class="dato-fila">
          <span class="dato-label">👤 Paciente:</span>
          <span class="dato-valor">${paciente.nombre}</span>
        </div>
        <div class="dato-fila">
          <span class="dato-label">📅 Edad:</span>
          <span class="dato-valor">${paciente.edad || '?'} años</span>
        </div>
        <div class="dato-fila">
          <span class="dato-label">🩺 Protocolo:</span>
          <span class="dato-valor">${protocolo.nombre || 'Sin protocolo'}</span>
        </div>
        <div class="dato-fila">
          <span class="dato-label">🔬 Sistema:</span>
          <span class="dato-valor">${protocolo['CODE System'] || '?'}</span>
        </div>
        <div class="dato-fila">
          <span class="dato-label">📱 Teléfono:</span>
          <span class="dato-valor">${paciente.telefono || 'Sin registrar'}</span>
        </div>
      </div>
    `;
    
    const modal = document.getElementById('modal-nueva-cita');
    if (modal) {
      const body = modal.querySelector('.modal-body-premium');
      body.insertAdjacentHTML('afterbegin', html);
    }
  } else {
    // Actualizar
    datosPaciente.innerHTML = `
      <div class="dato-fila">
        <span class="dato-label">👤 Paciente:</span>
        <span class="dato-valor">${paciente.nombre}</span>
      </div>
      <div class="dato-fila">
        <span class="dato-label">📅 Edad:</span>
        <span class="dato-valor">${paciente.edad || '?'} años</span>
      </div>
      <div class="dato-fila">
        <span class="dato-label">🩺 Protocolo:</span>
        <span class="dato-valor">${protocolo.nombre || 'Sin protocolo'}</span>
      </div>
      <div class="dato-fila">
        <span class="dato-label">🔬 Sistema:</span>
        <span class="dato-valor">${protocolo['CODE System'] || '?'}</span>
      </div>
      <div class="dato-fila">
        <span class="dato-label">📱 Teléfono:</span>
        <span class="dato-valor">${paciente.telefono || 'Sin registrar'}</span>
      </div>
    `;
  }
}

// ─── CARGAR HORARIOS DISPONIBLES ──────────────────────────────────────────
async function cargarHorariosDisponibles() {
  const fecha = document.getElementById('nc-fecha').value;
  if (!fecha) return;
  
  try {
    // Obtener citas del médico para ese día
    const medicoId = medicoActual.id;
    const formula = `AND({Médico} = '${medicoId}', {Fecha de consulta} = '${fecha}')`;
    
    const res = await fetch(`/api/airtable?tabla=consultas&filterByFormula=${encodeURIComponent(formula)}`);
    const data = await res.json();
    
    const citasDelDia = (data.records || []).map(r => r.fields['Hora de consulta']);
    
    // Generar horarios disponibles
    const inicio = parseInt(calendarioState.horaInicio.split(':')[0]);
    const fin = parseInt(calendarioState.horaFin.split(':')[0]);
    const duracion = calendarioState.duracionConsulta;
    
    horariosDisponibles = [];
    
    for (let hora = inicio; hora < fin; hora++) {
      for (let min = 0; min < 60; min += duracion) {
        const horaStr = `${String(hora).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        
        // Verificar si está disponible
        const disponible = !citasDelDia.includes(horaStr);
        
        horariosDisponibles.push({
          hora: horaStr,
          disponible,
          clase: disponible ? 'horario-disponible' : 'horario-ocupado'
        });
      }
    }
    
    mostrarSelectorHorarios();
  } catch (err) {
    console.error('Error cargando horarios:', err);
  }
}

// ─── MOSTRAR SELECTOR DE HORARIOS ─────────────────────────────────────────
function mostrarSelectorHorarios() {
  const selector = document.getElementById('selector-horarios');
  
  if (!selector) {
    // Crear
    const html = `
      <div id="selector-horarios" class="selector-horarios-container">
        <label>⏰ Horarios disponibles (Verde):</label>
        <div class="grid-horarios" id="grid-horarios"></div>
      </div>
    `;
    
    const modal = document.getElementById('modal-nueva-cita');
    if (modal) {
      const body = modal.querySelector('.modal-body-premium');
      const ncHora = document.getElementById('nc-hora').parentElement;
      ncHora.insertAdjacentHTML('afterend', html);
    }
  }
  
  const grid = document.getElementById('grid-horarios');
  const disponibles = horariosDisponibles.filter(h => h.disponible);
  
  const html = disponibles.map(h => `
    <button 
      class="horario-btn horario-disponible" 
      onclick="seleccionarHorario('${h.hora}')"
      title="Clic para seleccionar ${h.hora}">
      ${h.hora}
    </button>
  `).join('');
  
  grid.innerHTML = html || '<div style="color:#999;font-size:12px;grid-column:1/-1;text-align:center;">Sin horarios disponibles</div>';
}

// ─── SELECCIONAR HORARIO ──────────────────────────────────────────────────
function seleccionarHorario(hora) {
  document.getElementById('nc-hora').value = hora;
  
  // Highlight
  document.querySelectorAll('.horario-btn').forEach(btn => {
    btn.style.opacity = '0.4';
  });
  event.target.style.opacity = '1';
}

// ─── INICIALIZAR MODAL ────────────────────────────────────────────────────
function abrirModalNuevaCitaMejorado() {
  // Si no está cargado, cargar pacientes
  if (autocompletePacientes.length === 0) {
    cargarPacientesAutocomplete();
  }
  
  // Limpiar
  pacienteSeleccionado = null;
  document.getElementById('nc-codigo-paciente').value = '';
  document.getElementById('nc-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('nc-hora').value = calendarioState.horaInicio;
  document.getElementById('nc-sistema').value = '';
  document.getElementById('nc-notas').value = '';
  
  // Limpiar datos paciente
  const datosPaciente = document.getElementById('datos-paciente-seleccionado');
  if (datosPaciente) datosPaciente.remove();
  
  const selector = document.getElementById('selector-horarios');
  if (selector) selector.remove();
  
  document.getElementById('sugerencias-pacientes').innerHTML = '';
  
  // Abrir modal
  document.getElementById('modal-nueva-cita').style.display = 'flex';
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    // Autocomplete listener
    const inputCodigo = document.getElementById('nc-codigo-paciente');
    if (inputCodigo) {
      inputCodigo.addEventListener('input', (e) => {
        mostrarSugerenciasPacientes(e.target.value);
      });
      
      inputCodigo.addEventListener('blur', () => {
        setTimeout(() => {
          document.getElementById('sugerencias-pacientes').innerHTML = '';
        }, 200);
      });
    }
    
    // Fecha listener
    const inputFecha = document.getElementById('nc-fecha');
    if (inputFecha) {
      inputFecha.addEventListener('change', () => {
        cargarHorariosDisponibles();
      });
    }
  }, 500);
});

