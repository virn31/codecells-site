// agenda/js/agenda-api.js
// Cliente API para módulo Agenda
// Conecta con /api/agenda.js

class AgendaAPI {
  constructor() {
    this.baseURL = '/api/agenda';
    this.medicoActual = this.obtenerMedicoDelToken();
  }

  obtenerMedicoDelToken() {
    const sesionRaw = sessionStorage.getItem('cc_medico_session');
    if (!sesionRaw) throw new Error('No autenticado');
    const sesion = JSON.parse(sesionRaw);
    if (Date.now() > sesion.expira) throw new Error('Sesión expirada');
    return sesion.medico['Código de médico'];
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
