// api/google-calendar.js
// ─── ENDPOINT GOOGLE CALENDAR - Crear/actualizar eventos ───────────────────

export default async function handler(req, res) {
  if (req.method === 'POST') {
    return crearEvento(req, res);
  } else if (req.method === 'PUT') {
    return actualizarEvento(req, res);
  } else if (req.method === 'DELETE') {
    return eliminarEvento(req, res);
  }
  
  return res.status(405).json({ error: 'Método no permitido' });
}

async function crearEvento(req, res) {
  try {
    const { evento } = req.body;
    
    // Obtener token del médico desde session
    const token = req.headers['x-google-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'No token de Google Calendar' });
    }
    
    const calendarId = 'primary';
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(evento)
    });
    
    if (!response.ok) {
      const error = await response.json();
      return res.status(400).json({ error: error.error.message });
    }
    
    const data = await response.json();
    
    return res.status(200).json({
      success: true,
      eventId: data.id,
      htmlLink: data.htmlLink
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function actualizarEvento(req, res) {
  try {
    const { citaId, datos } = req.body;
    const token = req.headers['x-google-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'No token' });
    }
    
    // Buscar evento por citaId
    // (esto requería trackear event IDs en Airtable)
    
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function eliminarEvento(req, res) {
  try {
    const { citaId } = req.body;
    const token = req.headers['x-google-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'No token' });
    }
    
    // Buscar y eliminar evento
    
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

