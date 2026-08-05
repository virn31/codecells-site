// agenda/js/agenda-api.js
// Cliente API para módulo Agenda
// Conecta con /api/agenda.js

class AgendaAPI {
  constructor() {
    this.baseURL = '/api/agenda';
    this.medicoActual = this.obtenerMedicoDelToken();
  }

  obtenerMedicoDelToken() {
    // Estrategia 1: clave directa escrita por portal-medico.html al iniciar sesión
    let codigo = localStorage.getItem('cc_agenda_medico');
    if (codigo) return codigo;

    // Estrategia 2: respaldo de la sesión completa (por si 'cc_agenda_medico' no llegó a escribirse)
    try {
      const backup = localStorage.getItem('cc_medico_session_backup');
      if (backup) {
        const medico = (JSON.parse(backup).medico) || {};
        codigo = medico['Código de médico'] || medico['Código'] || medico.codigo || medico.id;
        if (codigo) return codigo;
      }
    } catch (e) {
      console.warn('[AgendaAPI] Backup de sesión inválido:', e.message);
    }

    // Estrategia 3: sessionStorage, por si la pestaña heredó el contexto del portal (window.open)
    try {
      const raw = sessionStorage.getItem('cc_medico_session');
      if (raw) {
        const medico = (JSON.parse(raw).medico) || {};
        codigo = medico['Código de médico'] || medico['Código'] || medico.codigo || medico.id;
        if (codigo) return codigo;
      }
    } catch (e) {
      console.warn('[AgendaAPI] sessionStorage inválido:', e.message);
    }

    return null;
  }

  async hacer_request(body) {
    try {
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('cc_medico_session')}`
        },
        body: JSON.stringify({
          ...body,
          medicoActual: this.medicoActual
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.mensaje || error.error || 'Error en solicitud');
      }

      return await response.json();
    } catch (error) {
      console.error('Error en AgendaAPI:', error);
      throw error;
    }
  }

  async crearCita(datos) {
    // datos = { paciente_nombre, fecha, hora, motivo, duracion_minutos, notas }
    return this.hacer_request({
      action: 'crear',
      paciente_nombre: datos.paciente_nombre,
      fecha: datos.fecha,
      hora: datos.hora,
      motivo: datos.motivo,
      duracion_minutos: datos.duracion_minutos || 60,
      notas: datos.notas || ''
    });
  }

  async listarCitas(dias = 7) {
    return this.hacer_request({
      action: 'listar',
      dias: dias
    });
  }

  async editarCita(citaId, cambios) {
    return this.hacer_request({
      action: 'editar',
      citaId: citaId,
      cambios: cambios
    });
  }

  async cancelarCita(citaId) {
    return this.hacer_request({
      action: 'cancelar',
      citaId: citaId
    });
  }
}

// Exportar para uso global
window.AgendaAPI = AgendaAPI;
