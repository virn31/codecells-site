// api/airtable.js
// Proxy seguro hacia Airtable. El token NUNCA viaja al navegador.
// El portal médico llama a /api/airtable en vez de api.airtable.com directamente.

export default async function handler(req, res) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = 'app6jyD9pDlTLpknA';

  if (!AIRTABLE_TOKEN) {
    return res.status(500).json({ error: 'AIRTABLE_TOKEN no configurado en Vercel.' });
  }

  // Tablas permitidas — whitelist para que nadie pida tablas fuera de este set
  const TABLAS_PERMITIDAS = {
    pacientes: 'tblyUcCfueFLJuvIv',
    historia:  'tblm2xUADazitHisR',
    consultas: 'tbl1Xp2IGxdV178Ky',
    medicos:   'tbl87DsuBMmb4DjFM',
    protocolos:'tblMGnZxnEHHrjZl4',
    labs:      'tblhKp4uE1NdXXqLh',
    temp:      'tblVOTed5MJSX1Vpy',
  };

  const { tabla } = req.query;
  const tableId = TABLAS_PERMITIDAS[tabla];

  if (!tableId) {
    return res.status(400).json({ error: 'Tabla no reconocida o no permitida.' });
  }

  try {
    if (req.method === 'GET') {
      // Reenviar query params (filterByFormula, sort, maxRecords, etc.)
      const params = new URLSearchParams(req.query);
      params.delete('tabla');
      const qs = params.toString();
      const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}${qs ? '?' + qs : ''}`;

      const airtableRes = await fetch(url, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
      });
      const data = await airtableRes.json();
      return res.status(airtableRes.status).json(data);
    }

    if (req.method === 'POST') {
      const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}`;
      const airtableRes = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      });
      const data = await airtableRes.json();
      return res.status(airtableRes.status).json(data);
    }

    if (req.method === 'PATCH') {
      // Actualiza un registro existente. Requiere ?recordId=recXXXXXXXXXXXXXX
      const { recordId } = req.query;
      if (!recordId) {
        return res.status(400).json({ error: 'Falta recordId para actualizar el registro.' });
      }
      const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`;
      const airtableRes = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      });
      const data = await airtableRes.json();
      return res.status(airtableRes.status).json(data);
    }

    return res.status(405).json({ error: 'Método no permitido.' });

  } catch (err) {
    return res.status(500).json({ error: 'Error al conectar con Airtable.', detail: String(err) });
  }
}
