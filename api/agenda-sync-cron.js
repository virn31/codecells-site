// api/agenda-sync-cron.js
// Sincroniza Google Calendar del médico con tabla AGENDA cada hora
// Se ejecuta automáticamente vía Vercel Crons

const AIRTABLE_BASE_ID = 'app6jyD9pDlTLpknA';
const AGENDA_TABLE_ID = 'tbl8s038fJ3qRFKD6';
const MEDICOS_TABLE_ID = 'tbl87DsuBMmb4DjFM';

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

async function airtableQuery(tableId, filterByFormula = null) {
  let path = `/${tableId}`;
  const params = new URLSearchParams();

  if (filterByFormula) {
    params.append('filterByFormula', filterByFormula);
  }

  const result = await airtableRequest('GET', `${path}?${params}`);
  return result.records || [];
}

async function airtableCreate(tableId, fields) {
  const result = await airtableRequest('POST', `/${tableId}`, {
    records: [{ fields }]
  });
  return result.records[0];
}

async function leerGoogleCalendarDelMedico(medicoId) {
  // TODO: Implementar lectura de Google Calendar usando refresh_token
  // Por ahora, retornar array vacío
  console.log(`[CRON] Leyendo Google Calendar para médico ${medicoId}`);
  return [];
}

async function buscarEventoEnAirtable(googleCalendarId) {
  const formula = `{Google_Calendar_ID} = "${googleCalendarId}"`;
  const resultado = await airtableQuery(AGENDA_TABLE_ID, formula);
  return resultado.length > 0 ? resultado[0] : null;
}

async function crearCitaDesdeGoogle(medicoId, eventoGoogle) {
  // Extraer datos del evento de Google Calendar
  const fecha = eventoGoogle.start.dateTime.split('T')[0];
  const horaInicio = eventoGoogle.start.dateTime.split('T')[1].substring(0, 5);
  const horaFin = eventoGoogle.end.dateTime.split('T')[1].substring(0, 5);

  // Intentar extraer nombre del paciente del título del evento
  // Ej. "Consulta - Carlos Terrazas" → "Carlos Terrazas"
  let nombrePaciente = eventoGoogle.summary;
  if (eventoGoogle.summary.includes(' - ')) {
    nombrePaciente = eventoGoogle.summary.split(' - ')[1];
  }

  // Buscar paciente en Airtable
  let pacienteId = null;
  try {
    const formula = `LOWER({Nombre completo}) = LOWER("${nombrePaciente}")`;
    const pacientes = await airtableQuery('tblyUcCfueFLJuvIv', formula);
    if (pacientes.length > 0) {
      pacienteId = pacientes[0].id;
    }
  } catch (e) {
    console.warn(`No se pudo encontrar paciente ${nombrePaciente}:`, e.message);
  }

  // Crear cita en Airtable
  const citaData = {
    Médico: [medicoId],
    Paciente: pacienteId ? [pacienteId] : undefined,
    Fecha: fecha,
    Hora_inicio: horaInicio,
    Hora_fin: horaFin,
    Motivo: eventoGoogle.summary,
    Notas: eventoGoogle.description || '',
    Google_Calendar_ID: eventoGoogle.id,
    Estatus: 'scheduled'
  };

  return await airtableCreate(AGENDA_TABLE_ID, citaData);
}

async function sincronizarMedico(medicoId) {
  try {
    console.log(`[CRON] Sincronizando médico: ${medicoId}`);

    // 1. Leer Google Calendar del médico
    const eventosGoogle = await leerGoogleCalendarDelMedico(medicoId);

    if (eventosGoogle.length === 0) {
      console.log(`[CRON] Médico ${medicoId}: 0 eventos en Google Calendar`);
      return { sincronizadas: 0, error: null };
    }

    // 2. Verificar cuales ya existen en Airtable
    let nuevas = 0;
    for (const evento of eventosGoogle) {
      try {
        const existe = await buscarEventoEnAirtable(evento.id);
        if (!existe) {
          await crearCitaDesdeGoogle(medicoId, evento);
          nuevas++;
          console.log(`[CRON] Médico ${medicoId}: Cita creada desde Google (${evento.summary})`);
        }
      } catch (e) {
        console.warn(`[CRON] Error sincronizando evento ${evento.id}:`, e.message);
      }
    }

    return { sincronizadas: nuevas, error: null };
  } catch (error) {
    console.error(`[CRON] Error sincronizando médico ${medicoId}:`, error);
    return { sincronizadas: 0, error: error.message };
  }
}

export default async function handler(req, res) {
  // Verificar que sea llamada desde Vercel Cron
  if (req.headers['x-vercel-cron'] !== process.env.CRON_SECRET) {
    console.warn('[CRON] Llamada no autorizada');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[CRON] Iniciando sincronización de Google Calendar');

    // Obtener todos los médicos activos
    const formula = '{Activo} = TRUE()';
    const medicos = await airtableQuery(MEDICOS_TABLE_ID, formula);

    console.log(`[CRON] Encontrados ${medicos.length} médicos activos`);

    let totalSincronizadas = 0;
    const resultados = [];

    // Sincronizar cada médico
    for (const medico of medicos) {
      const medicoId = medico.id;
      const resultado = await sincronizarMedico(medicoId);
      totalSincronizadas += resultado.sincronizadas;
      resultados.push({
        medico: medico.fields['Código de médico'],
        sincronizadas: resultado.sincronizadas,
        error: resultado.error
      });
    }

    console.log(`[CRON] Sincronización completada. Total citas nuevas: ${totalSincronizadas}`);

    return res.json({
      success: true,
      mensaje: `Sincronización completada. ${totalSincronizadas} cita(s) nueva(s).`,
      totalMédicos: medicos.length,
      totalSincronizadas,
      resultados
    });
  } catch (error) {
    console.error('[CRON] Error fatal en sincronización:', error);

    // Notificar a Víctor por Telegram (TODO: implementar)
    // await notificarErrorTelegram('Error en sincronización calendario', error);

    return res.status(500).json({
      success: false,
      error: error.message,
      mensaje: 'Error en sincronización de Google Calendar'
    });
  }
}
