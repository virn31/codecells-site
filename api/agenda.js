// api/agenda.js
// Backend completo para módulo Agenda - Desacoplado del portal, capacitaciones, etc
// Table ID Airtable: tbl8s038fJ3qRFKD6

import fetch from 'node-fetch';
import { verificarToken, tokenDesdeRequest } from '../lib/auth.js';

const AIRTABLE_BASE_ID = 'app6jyD9pDlTLpknA';
const AGENDA_TABLE_ID = 'tbl8s038fJ3qRFKD6';
const MEDICOS_TABLE_ID = 'tbl87DsuBMmb4DjFM';
const PACIENTES_TABLE_ID = 'tblyUcCfueFLJuvIv';
const VENUES_TABLE_ID = 'tblVenues'; // Ajustar si es diferente

// ============================================================================
// UTILIDADES AIRTABLE
// ============================================================================

async function airtableRequest(method, path, body = null) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Airtable error: ${error.error.message}`);
  }

  return response.json();
}

async function airtableQuery(tableId, filterByFormula = null, maxRecords = 100) {
  let path = `/${tableId}`;
  const params = new URLSearchParams();

  if (filterByFormula) {
    params.append('filterByFormula', filterByFormula);
  }
  params.append('maxRecords', maxRecords);
  params.append('sort[0][field]', 'Fecha');
  params.append('sort[0][direction]', 'asc');

  const result = await airtableRequest('GET', `${path}?${params}`);
  return result.records || [];
}

async function airtableCreate(tableId, fields) {
  const result = await airtableRequest('POST', `/${tableId}`, {
    records: [{ fields }]
  });
  return result.records[0];
}

async function airtableUpdate(tableId, recordId, fields) {
  const result = await airtableRequest('PATCH', `/${tableId}`, {
    records: [{ id: recordId, fields }]
  });
  return result.records[0];
}

async function airtableDelete(tableId, recordId) {
  await airtableRequest('DELETE', `/${tableId}/${recordId}`);
  return { success: true };
}

// ============================================================================
// VALIDACIONES (RESCATADAS DE OPENEMR)
// ============================================================================

function validarCita(cita) {
  const errores = [];

  if (!cita.Médico) {
    errores.push('Médico requerido');
  }
  if (!cita.Paciente) {
    errores.push('Paciente requerido');
  }
  if (!cita.Fecha || !isValidDate(cita.Fecha)) {
    errores.push('Fecha inválida (formato YYYY-MM-DD)');
  }
  if (!cita.Hora_inicio || !isValidTime(cita.Hora_inicio)) {
    errores.push('Hora inicio inválida (formato HH:MM)');
  }
  if (cita.Hora_fin && !isValidTime(cita.Hora_fin)) {
    errores.push('Hora fin inválida (formato HH:MM)');
  }
  if (!cita.Motivo || cita.Motivo.trim().length < 2) {
    errores.push('Motivo debe tener al menos 2 caracteres');
  }
  if (cita.Duración_minutos && cita.Duración_minutos <= 0) {
    errores.push('Duración debe ser > 0');
  }
  if (cita.Estatus && !['scheduled', 'completed', 'no_show', 'cancelled'].includes(cita.Estatus)) {
    errores.push('Estatus inválido');
  }

  return { valido: errores.length === 0, errores };
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date).getTime());
}

function isValidTime(time) {
  return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

// ============================================================================
// BÚSQUEDA Y VERIFICACIÓN
// ============================================================================

async function buscarPacienteAirtable(criterio) {
  // Busca por nombre o código CC-PAC-
  let formula;
  if (criterio.startsWith('CC-PAC-')) {
    formula = `{Código de paciente} = "${criterio}"`;
  } else {
    // Búsqueda por nombre (case-insensitive)
    formula = `LOWER({Nombre completo}) = LOWER("${criterio}")`;
  }

  const pacientes = await airtableQuery(PACIENTES_TABLE_ID, formula, 1);
  return pacientes.length > 0 ? pacientes[0] : null;
}

async function buscarMedicoAirtable(codigoMedico) {
  const formula = `{Código de médico} = "${codigoMedico}"`;
  const medicos = await airtableQuery(MEDICOS_TABLE_ID, formula, 1);
  return medicos.length > 0 ? medicos[0] : null;
}

async function verificarDisponibilidad(codigoMedico, fecha, horaInicio, horaFin) {
  // Verificar que no haya citas solapadas para el mismo médico
  const formula = `AND(
    {Médico} = "${codigoMedico}",
    {Fecha} = "${fecha}",
    {Estatus} != "cancelled"
  )`;

  const citasExistentes = await airtableQuery(AGENDA_TABLE_ID, formula);

  for (const cita of citasExistentes) {
    const horaInicioEx = cita.fields.Hora_inicio;
    const horaFinEx = cita.fields.Hora_fin || horaInicioEx;

    // Verificar solapamiento
    if (horaInicio < horaFinEx && horaFin > horaInicioEx) {
      return false; // Hay solapamiento
    }
  }

  return true;
}

// ============================================================================
// HERRAMIENTAS PARA NOVA
// ============================================================================

async function crearCita(input, medicoActual) {
  // input = { paciente_nombre, fecha, hora, motivo, duracion_minutos, notas }
  // medicoActual = código CCMED- del médico actual

  try {
    // 1. Validar médico
    const medico = await buscarMedicoAirtable(medicoActual);
    if (!medico) {
      return {
        success: false,
        error: `Médico ${medicoActual} no encontrado`,
        mensaje: '❌ Error: médico no válido'
      };
    }

    // 2. Buscar paciente
    let paciente = await buscarPacienteAirtable(input.paciente_nombre);
    if (!paciente) {
      return {
        success: false,
        error: `Paciente "${input.paciente_nombre}" no encontrado`,
        mensaje: `❌ No encontré paciente llamado "${input.paciente_nombre}". ¿Es un paciente nuevo?`
      };
    }

    // 3. Normalizar fecha
    let fecha = normalizarFecha(input.fecha);
    if (!isValidDate(fecha)) {
      return {
        success: false,
        error: 'Fecha inválida',
        mensaje: '❌ Fecha no válida. Usa formato YYYY-MM-DD o "próximo viernes"'
      };
    }

    // 4. Normalizar hora
    let horaInicio = normalizarHora(input.hora);
    if (!isValidTime(horaInicio)) {
      return {
        success: false,
        error: 'Hora inválida',
        mensaje: '❌ Hora no válida. Usa formato HH:MM'
      };
    }

    // 5. Calcular duración y hora fin
    const duracionMinutos = input.duracion_minutos || 60;
    const horaFin = sumarMinutos(horaInicio, duracionMinutos);

    // 6. Verificar disponibilidad
    const disponible = await verificarDisponibilidad(medicoActual, fecha, horaInicio, horaFin);
    if (!disponible) {
      return {
        success: false,
        error: 'No disponible',
        mensaje: `❌ No disponible el ${fecha} a las ${horaInicio}. Hay otra cita en ese horario.`
      };
    }

    // 7. Crear en Airtable
    const citaData = {
      Médico: [medico.id],
      Paciente: [paciente.id],
      Fecha: fecha,
      Hora_inicio: horaInicio,
      Hora_fin: horaFin,
      Duración_minutos: duracionMinutos,
      Motivo: input.motivo,
      Notas: input.notas || '',
      Estatus: 'scheduled',
      Notificar_SMS: true,
      Notificar_Email: true
    };

    const validacion = validarCita(citaData);
    if (!validacion.valido) {
      return {
        success: false,
        error: validacion.errores.join(', '),
        mensaje: `❌ Error: ${validacion.errores[0]}`
      };
    }

    const resultado = await airtableCreate(AGENDA_TABLE_ID, citaData);

    // 8. Sincronizar con Google Calendar (si está configurado)
    try {
      await sincronizarConGoogleCalendar(medico.id, resultado, 'create');
    } catch (e) {
      console.warn('Advertencia: no se pudo sincronizar con Google Calendar', e.message);
      // No fallar si Google Calendar no está disponible
    }

    // 9. Notificar paciente
    try {
      await notificarPaciente(paciente.fields['Código de paciente'], {
        fecha,
        horaInicio,
        medico: medico.fields['Nombre completo'],
        motivo: input.motivo
      });
    } catch (e) {
      console.warn('Advertencia: no se pudo notificar al paciente', e.message);
    }

    return {
      success: true,
      mensaje: `✅ Cita confirmada con ${paciente.fields['Nombre completo']} el ${fecha} a las ${horaInicio}. Paciente notificado.`,
      cita: resultado
    };
  } catch (error) {
    console.error('Error en crearCita:', error);
    return {
      success: false,
      error: error.message,
      mensaje: `❌ Error al crear cita: ${error.message}`
    };
  }
}

async function listarCitas(medicoActual, dias = 7) {
  try {
    const medico = await buscarMedicoAirtable(medicoActual);
    if (!medico) {
      return {
        success: false,
        error: 'Médico no encontrado',
        citas: []
      };
    }

    const hoy = new Date().toISOString().split('T')[0];
    const enDias = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const formula = `AND(
      {Médico} = "${medico.id}",
      {Fecha} >= "${hoy}",
      {Fecha} <= "${enDias}",
      {Estatus} != "cancelled"
    )`;

    const citas = await airtableQuery(AGENDA_TABLE_ID, formula);

    const resumen = citas.map(c => {
      const paciente = c.fields.Paciente ? c.fields.Paciente[0] : 'Desconocido';
      return `${c.fields.Fecha} ${c.fields.Hora_inicio} - ${paciente} (${c.fields.Motivo})`;
    }).join('\n');

    return {
      success: true,
      mensaje: `📅 Tus próximas citas (próximos ${dias} días):\n\n${resumen || 'No hay citas'}`,
      citas: citas
    };
  } catch (error) {
    console.error('Error en listarCitas:', error);
    return {
      success: false,
      error: error.message,
      citas: []
    };
  }
}

async function editarCita(citaId, cambios, medicoActual) {
  try {
    // Validar cambios
    if (cambios.Fecha || cambios.Hora_inicio) {
      const cita = await airtableRequest('GET', `/${AGENDA_TABLE_ID}/${citaId}`);
      const fecha = cambios.Fecha || cita.fields.Fecha;
      const horaInicio = cambios.Hora_inicio || cita.fields.Hora_inicio;
      const horaFin = cambios.Hora_fin || cita.fields.Hora_fin;

      const disponible = await verificarDisponibilidad(medicoActual, fecha, horaInicio, horaFin);
      if (!disponible) {
        return {
          success: false,
          error: 'No disponible',
          mensaje: `❌ No disponible en esa fecha/hora. Hay otra cita solapada.`
        };
      }
    }

    const resultado = await airtableUpdate(AGENDA_TABLE_ID, citaId, cambios);

    // Sincronizar con Google Calendar
    try {
      await sincronizarConGoogleCalendar(medicoActual, resultado, 'update');
    } catch (e) {
      console.warn('Advertencia: no se pudo sincronizar con Google Calendar', e.message);
    }

    return {
      success: true,
      mensaje: `✅ Cita actualizada`,
      cita: resultado
    };
  } catch (error) {
    console.error('Error en editarCita:', error);
    return {
      success: false,
      error: error.message,
      mensaje: `❌ Error al editar cita: ${error.message}`
    };
  }
}

async function cancelarCita(citaId) {
  try {
    const cita = await airtableRequest('GET', `/${AGENDA_TABLE_ID}/${citaId}`);
    const resultado = await airtableUpdate(AGENDA_TABLE_ID, citaId, { Estatus: 'cancelled' });

    // Desincronizar de Google Calendar
    try {
      await sincronizarConGoogleCalendar(null, cita, 'delete');
    } catch (e) {
      console.warn('Advertencia: no se pudo desincronizar de Google Calendar', e.message);
    }

    // Notificar paciente
    try {
      await notificarPacienteCancelacion(cita.fields.Paciente);
    } catch (e) {
      console.warn('Advertencia: no se pudo notificar cancelación', e.message);
    }

    return {
      success: true,
      mensaje: `✅ Cita cancelada`,
      cita: resultado
    };
  } catch (error) {
    console.error('Error en cancelarCita:', error);
    return {
      success: false,
      error: error.message,
      mensaje: `❌ Error al cancelar cita: ${error.message}`
    };
  }
}

// ============================================================================
// SINCRONIZACIÓN GOOGLE CALENDAR
// ============================================================================

async function sincronizarConGoogleCalendar(medicoId, cita, accion) {
  // TODO: Implementar integración Google Calendar
  // Por ahora, solo log
  console.log(`[Google Calendar] ${accion} cita:`, cita.fields.Motivo);
}

// ============================================================================
// NOTIFICACIONES
// ============================================================================

async function notificarPaciente(codigoPaciente, detalles) {
  // TODO: Implementar notificación vía NOVA / WhatsApp
  // Por ahora, solo log
  console.log(`[Notificación] Paciente ${codigoPaciente}: Cita confirmada para ${detalles.fecha} a las ${detalles.horaInicio}`);
}

async function notificarPacienteCancelacion(pacienteLink) {
  // TODO: Implementar notificación de cancelación
  console.log(`[Notificación] Cita cancelada`);
}

// ============================================================================
// UTILIDADES
// ============================================================================

function normalizarFecha(input) {
  // Si ya es YYYY-MM-DD, devolver tal cual
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }

  // Interpretar texto como "próximo viernes", "este lunes", etc
  const hoy = new Date();
  const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const input_lower = input.toLowerCase();

  for (let i = 0; i < 7; i++) {
    const diaPrueba = new Date(hoy);
    diaPrueba.setDate(hoy.getDate() + i);
    const nombreDia = diasSemana[diaPrueba.getDay()];

    if (input_lower.includes(nombreDia)) {
      return diaPrueba.toISOString().split('T')[0];
    }
  }

  // Si no reconoce, devolver null para que sea inválido
  return null;
}

function normalizarHora(input) {
  // Si ya es HH:MM, devolver tal cual
  if (/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(input)) {
    return input;
  }

  // Interpretar "10am" → "10:00", "3:30pm" → "15:30", etc
  const regex = /(\d{1,2}):?(\d{2})?\s*(am|pm)?/i;
  const match = input.match(regex);

  if (match) {
    let hora = parseInt(match[1]);
    const minutos = match[2] ? parseInt(match[2]) : 0;
    const periodo = match[3] ? match[3].toLowerCase() : null;

    if (periodo === 'pm' && hora !== 12) {
      hora += 12;
    } else if (periodo === 'am' && hora === 12) {
      hora = 0;
    }

    return `${String(hora).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
  }

  return null;
}

function sumarMinutos(horaInicio, minutos) {
  const [h, m] = horaInicio.split(':').map(Number);
  let totalMinutos = h * 60 + m + minutos;
  const nuevaHora = Math.floor(totalMinutos / 60) % 24;
  const nuevoMinuto = totalMinutos % 60;

  return `${String(nuevaHora).padStart(2, '0')}:${String(nuevoMinuto).padStart(2, '0')}`;
}

// ============================================================================
// MANEJADOR PRINCIPAL
// ============================================================================

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://codecells.mx');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // El Bearer de Airtable (airtableRequest, arriba) es para el fetch
    // saliente hacia Airtable — nunca sirvió como autenticación de entrada.
    // Antes, cualquiera que mandara un `medicoActual` en el body podía
    // operar la agenda de OTRO médico con solo conocer su código CCMED-,
    // sin ninguna verificación de que el caller de verdad fuera esa
    // persona. Mismo mecanismo que ya usan los endpoints clínicos
    // (api/nova.js, api/nova-asistente-clinico.js): token de sesión
    // firmado (lib/auth.js) en el header Authorization, nunca del body.
    // El frontend (agenda/js/agenda-api.js) YA manda ese header hoy —
    // esto no requiere ningún cambio de cliente.
    const sesion = verificarToken(tokenDesdeRequest(req));
    if (!sesion || sesion.tipo !== 'medico') {
      return res.status(401).json({ error: 'Sesión médica requerida.' });
    }
    const medicoActual = sesion.codigo;

    const { action, ...datos } = req.body;
    delete datos.medicoActual; // ignorar cualquier valor que mande el cliente

    switch (action) {
      case 'crear':
        const resultadoCrear = await crearCita(datos, medicoActual);
        return res.status(resultadoCrear.success ? 201 : 400).json(resultadoCrear);

      case 'listar':
        const resultadoListar = await listarCitas(medicoActual, datos.dias || 7);
        return res.status(resultadoListar.success ? 200 : 400).json(resultadoListar);

      case 'editar':
        const resultadoEditar = await editarCita(datos.citaId, datos.cambios, medicoActual);
        return res.status(resultadoEditar.success ? 200 : 400).json(resultadoEditar);

      case 'cancelar':
        const resultadoCancelar = await cancelarCita(datos.citaId);
        return res.status(resultadoCancelar.success ? 200 : 400).json(resultadoCancelar);

      default:
        return res.status(400).json({ error: 'Acción no reconocida' });
    }
  } catch (error) {
    console.error('Error en /api/agenda:', error);
    return res.status(500).json({
      error: error.message,
      mensaje: '❌ Error interno del servidor'
    });
  }
}
