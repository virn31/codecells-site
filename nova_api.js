// api/nova.js
// Proxy seguro entre el frontend de CODE CELLS y la API de Anthropic

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = req.body;

    if (!body.messages || !Array.isArray(body.messages)) {
      return res.status(400).json({ error: 'Missing messages array' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: body.model || 'claude-sonnet-4-6',
        max_tokens: body.max_tokens || 1024,
        system: body.system || '',
        messages: body.messages
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    console.error('NOVA proxy error:', err);
    return res.status(500).json({ error: 'Internal proxy error', detail: err.message });
  }
}
