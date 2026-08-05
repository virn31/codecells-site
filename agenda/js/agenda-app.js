// agenda/js/agenda-app.js
// Lógica principal del módulo Agenda
// Totalmente desacoplada del Portal Médico, Capacitaciones, etc.

class AgendaApp {
  constructor() {
    this.api = new AgendaAPI();
    this.citas = [];
    this.vistaActual = 'mes';
    this.mesActual = new Date();
    this.init();
  }

  async init() {
    console.log('[Agenda] Inicializando...');
    
    try {
      // Cargar citas
      await this.cargarCitas();
      
      // Renderizar calendario
      this.renderCalendario();
      
      // Attached event listeners
      this.attachEventListeners();
      
      // Inicializar NOVA chat
      this.inicializarNova();
      
      console.log('[Agenda] ✅ Inicializado');
    } catch (error) {
      console.error('[Agenda] Error en inicialización:', error);
      alert('Error al cargar el módulo de agenda: ' + error.message);
    }
  }

  async cargarCitas() {
    console.log('[Agenda] Cargando citas...');
    try {
      const resultado = await this.api.listarCitas(30); // Próximos 30 días
      if (resultado.success) {
        this.citas = resultado.citas || [];
        console.log(`[Agenda] ✅ ${this.citas.length} citas cargadas`);
      } else {
        throw new Error(resultado.error || 'Error cargando citas');
      }
    } catch (error) {
      console.error('[Agenda] Error cargando citas:', error);
      this.citas = [];
    }
  }

  renderCalendario() {
    const container = document.getElementById('calendar');
    
    if (this.vistaActual === 'mes') {
      this.renderMes(container);
    } else if (this.vistaActual === 'semana') {
      this.renderSemana(container);
    }
  }

  renderMes(container) {
    const año = this.mesActual.getFullYear();
    const mes = this.mesActual.getMonth();
    
    const primerDia = new Date(año, mes, 1);
    const ultimoDia = new Date(año, mes + 1, 0);
    const diasDelMes = ultimoDia.getDate();
    const diaInicialSemana = primerDia.getDay();
    
    const nombreMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreDias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    let html = `
      <div class="calendario-mes">
        <div class="mes-header">
          <button class="btn-nav" onclick="agendaApp.mesAnterior()">◀</button>
          <h2>${nombreMeses[mes]} ${año}</h2>
          <button class="btn-nav" onclick="agendaApp.mesSiguiente()">▶</button>
        </div>
        
        <div class="dias-semana">
          ${nombreDias.map(d => `<div class="encabezado-dia">${d}</div>`).join('')}
        </div>
        
        <div class="dias-mes">
    `;
    
    // Celdas vacías antes del primer día
    for (let i = 0; i < diaInicialSemana; i++) {
      html += '<div class="dia vacio"></div>';
    }
    
    // Días del mes
    for (let dia = 1; dia <= diasDelMes; dia++) {
      const fecha = `${año}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      const citasDelDia = this.citas.filter(c => c.fields.Fecha === fecha);
      const esHoy = this.esHoy(fecha);
      
      html += `
        <div class="dia ${esHoy ? 'hoy' : ''}" onclick="agendaApp.abrirDia('${fecha}')">
          <div class="numero-dia">${dia}</div>
          <div class="citas-preview">
            ${citasDelDia.slice(0, 2).map(c => `
              <div class="cita-badge ${c.fields.Estatus}">
                ${this.formatearHora(c.fields.Hora_inicio)}
              </div>
            `).join('')}
            ${citasDelDia.length > 2 ? `<div class="mas-citas">+${citasDelDia.length - 2}</div>` : ''}
          </div>
        </div>
      `;
    }
    
    html += `
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }

  renderSemana(container) {
    // Vista semanal simplificada
    const semanaInicio = new Date(this.mesActual);
    semanaInicio.setDate(semanaInicio.getDate() - semanaInicio.getDay());
    
    let html = '<div class="calendario-semana">';
    html += '<p style="text-align: center; margin: 1rem; color: #999;">Vista de semana (en desarrollo)</p>';
    html += '</div>';
    
    container.innerHTML = html;
  }

  attachEventListeners() {
    // Botones de vista
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.vistaActual = e.target.dataset.view;
        this.renderCalendario();
      });
    });
    
    // Input de mes
    const mesInput = document.getElementById('selectMes');
    const hoy = new Date();
    mesInput.value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    mesInput.addEventListener('change', (e) => {
      const [año, mes] = e.target.value.split('-');
      this.mesActual = new Date(parseInt(año), parseInt(mes) - 1, 1);
      this.renderCalendario();
    });
    
    // Botón NOVA
    document.getElementById('btnNovaChat').addEventListener('click', () => {
      document.getElementById('novaPanel').classList.add('open');
      document.getElementById('novaInput').focus();
    });
    
    // Cerrar NOVA
    document.getElementById('btnCloseNova').addEventListener('click', () => {
      document.getElementById('novaPanel').classList.remove('open');
    });
    
    // Volver al portal
    document.getElementById('btnVolverPortal').addEventListener('click', () => {
      window.location.href = '../portal-medico.html';
    });
  }

  async inicializarNova() {
    console.log('[Agenda] Inicializando NOVA...');
    // TODO: Conectar con NOVA widget
    // Por ahora, solo mostrar welcome message
  }

  async abrirDia(fecha) {
    const citasDelDia = this.citas.filter(c => c.fields.Fecha === fecha);
    
    let html = `
      <h3>${this.formatearFecha(fecha)}</h3>
      <div class="citas-lista">
        ${citasDelDia.length > 0 ? 
          citasDelDia.map(c => `
            <div class="cita-item">
              <div class="cita-hora">${c.fields.Hora_inicio}</div>
              <div class="cita-info">
                <div class="cita-motivo">${c.fields.Motivo}</div>
                <div class="cita-paciente">${c.fields.Paciente ? c.fields.Paciente[0] : 'Desconocido'}</div>
              </div>
              <div class="cita-status ${c.fields.Estatus}">${c.fields.Estatus}</div>
              <button onclick="agendaApp.editarCitaModal('${c.id}')" class="btn-icon">✏️</button>
            </div>
          `).join('')
          : '<p style="color: #999; text-align: center;">No hay citas este día</p>'
        }
      </div>
      <button onclick="agendaApp.crearCitaManual('${fecha}')" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">
        + Crear cita (sin NOVA)
      </button>
    `;
    
    const modal = document.getElementById('modalCita');
    document.getElementById('modalCitaContent').innerHTML = html;
    modal.showModal();
  }

  editarCitaModal(citaId) {
    alert('Función en desarrollo: editar cita ' + citaId);
  }

  crearCitaManual(fecha) {
    alert('Creación manual en desarrollo. Usa NOVA para crear citas.');
  }

  esHoy(fecha) {
    const hoy = new Date().toISOString().split('T')[0];
    return fecha === hoy;
  }

  formatearFecha(fecha) {
    const date = new Date(fecha + 'T00:00:00');
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatearHora(hora) {
    return hora.substring(0, 5); // HH:MM
  }

  mesAnterior() {
    this.mesActual.setMonth(this.mesActual.getMonth() - 1);
    this.actualizarMesInput();
    this.renderCalendario();
  }

  mesSiguiente() {
    this.mesActual.setMonth(this.mesActual.getMonth() + 1);
    this.actualizarMesInput();
    this.renderCalendario();
  }

  actualizarMesInput() {
    const mesInput = document.getElementById('selectMes');
    mesInput.value = `${this.mesActual.getFullYear()}-${String(this.mesActual.getMonth() + 1).padStart(2, '0')}`;
  }
}

// ============================================================================
// FUNCIONES GLOBALES
// ============================================================================

let agendaApp;

async function enviarMensajeNova(event) {
  event.preventDefault();
  
  const input = document.getElementById('novaInput');
  const mensaje = input.value.trim();
  
  if (!mensaje) return;
  
  // Mostrar mensaje del usuario
  const container = document.getElementById('novaChat');
  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'nova-message user';
  userMsgDiv.textContent = mensaje;
  container.appendChild(userMsgDiv);
  
  input.value = '';
  container.scrollTop = container.scrollHeight;
  
  // TODO: Enviar a NOVA y recibir respuesta
  // Por ahora, solo echo
  setTimeout(() => {
    const assistantMsgDiv = document.createElement('div');
    assistantMsgDiv.className = 'nova-message assistant';
    assistantMsgDiv.textContent = `Entendido: "${mensaje}". Funcionalidad en desarrollo.`;
    container.appendChild(assistantMsgDiv);
    container.scrollTop = container.scrollHeight;
  }, 500);
}

function cerrarModal(modalId) {
  document.getElementById(modalId).close();
}

// Inicializar cuando cargue DOM
document.addEventListener('DOMContentLoaded', () => {
  agendaApp = new AgendaApp();
});
