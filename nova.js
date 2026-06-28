// netlify/functions/nova.js
// Proxy seguro entre el frontend de CODE CELLS y la API de Anthropic
// La API key vive en variables de entorno de Netlify, nunca en el HTML

exports.handler = async function(event) {
  // Solo POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // CORS — permite solo tu dominio en producción
  var origin = event.headers.origin || event.headers.Origin || '';
  var allowedOrigins = [
    'https://codecells.mx',
    'https://www.codecells.mx',
    'http://localhost',        // desarrollo local
    'http://127.0.0.1'        // desarrollo local
  ];
  var corsOrigin = allowedOrigins.indexOf(origin) !== -1 ? origin : allowedOrigins[0];

  var corsHeaders = {
    'Access-Control-Allow-Origin':  corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Preflight OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    var body = JSON.parse(event.body);

    // Validación mínima
    if (!body.messages || !Array.isArray(body.messages)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing messages array' })
      };
    }

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      body.model      || 'claude-sonnet-4-6',
        max_tokens: body.max_tokens || 1024,
        system:     body.system     || '',
        messages:   body.messages
      })
    });

    var data = await response.json();

    return {
      statusCode: response.status,
      headers: corsHeaders,
      body: JSON.stringify(data)
    };

  } catch(err) {
    console.error('NOVA proxy error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal proxy error', detail: err.message })
    };
  }
};
