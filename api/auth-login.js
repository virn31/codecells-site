// api/auth-login.js
// Valida un código (CCMED-/CC-PAC-/DZW-) contra Airtable y, si existe, emite
// un token de sesión firmado. Este es el ÚNICO lugar donde un código se
// intercambia por un token — de aquí en adelante, api/airtable.js y demás
// endpoints sensibles exigen el token, no el código suelto.

const { generarToken } = require('../lib/auth');

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'app6jyD9pDlTLpknA';

const TABLAS = {
  medico:   { id: 'tbl87DsuBMmb4DjFM', campo: 'Código de médico' },
  paciente: { id: 'tblyUcCfueFLJuvIv', campo: 'Código de paciente' },
  vip:      { id: 'tblquF2fzFgUC5nll', campo: 'Código DZW' },
};

const HORAS_SESION = { medico: 6, paciente: 24, vip: 24, demo: 0.5 };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://codecells.mx');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { tipo, codigo } = req.body || {};
    if (!tipo || !TABLAS[tipo] || !codigo || typeof codigo !== 'string') {
      return res.status(400).json({ error: 'Falta un tipo válido (medico/paciente/vip) o el código.' });
    }
    if (!process.env.SESSION_SECRET) {
      console.error('[auth-login] SESSION_SECRET no configurado en Vercel.');
      return res.status(500).json({ error: 'Configuración de sesión incompleta en el servidor.' });
    }

    const { id: tableId, campo } = TABLAS[tipo];
    const formula = encodeURIComponent(`{${campo}}="${codigo.trim()}"`);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?filterByFormula=${formula}&maxRecords=1`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await r.json();

    // Un fallo de Airtable (429 por cuota agotada, 5xx, etc.) NUNCA debe
    // leerse como "código no encontrado" — data.records viene undefined en
    // ambos casos, y antes de este check un 429 cola-abajo se disfrazaba de
    // "código inexistente" (CLAUDE.md §6/§7: un fallo debe verse como fallo).
    if (!r.ok) {
      console.error('[auth-login] Airtable no-ok verificando código:', r.status, JSON.stringify(data));
      return res.status(503).json({ error: 'No se pudo verificar tu código en este momento. Intenta de nuevo en unos minutos.' });
    }

    // El cliente ya validó el FORMATO antes de llegar aquí (regex propia de
    // cada pantalla) — si llegamos a este punto y Airtable no encontró nada,
    // no es un problema de formato, es que ese código exacto no existe (o se
    // truncó al escribirlo/pegarlo). No repetir "inválido" aquí: induce a
    // pensar que el formato está mal cuando puede estar completo pero
    // incompleto en un carácter, o simplemente no dado de alta todavía.
    if (!data.records || data.records.length === 0) {
      return res.status(401).json({ error: 'No encontramos ese código. Verifica que esté completo (revisa que no se haya cortado al escribirlo o pegarlo) o confirma con administración.' });
    }

    const registro = data.records[0];

    // Para médicos, la cuenta debe estar activa.
    if (tipo === 'medico' && registro.fields['Activo'] === false) {
      return res.status(401).json({ error: 'Acceso desactivado. Contacta a administración.' });
    }
    // Para pacientes VIP, la cuenta ya debe estar activada.
    if (tipo === 'vip' && registro.fields['Activado'] !== true) {
      return res.status(401).json({ error: 'Esta cuenta VIP aún no ha sido activada.' });
    }

    // CLAUDE.md §5: los códigos demo (CC-PAC-DEMO*/9900*, campo `Es demo` en
    // PACIENTES) no deben poder iniciar sesión CON LOS MISMOS PRIVILEGIOS que
    // un paciente real — aparecen en capturas y presentaciones, y un token de
    // 24h de escritura ahí es una credencial publicada. En vez de rechazar el
    // login (eso rompería las demos que SÍ necesitan mostrarse), se emite un
    // tipo de sesión distinto ('demo'): TTL corto y sin privilegios de
    // escritura en ningún endpoint que revise `sesion.tipo` — nunca 'paciente'.
    const esDemo = tipo === 'paciente' && registro.fields['Es demo'] === true;
    const tipoSesion = esDemo ? 'demo' : tipo;
    const horas = HORAS_SESION[tipoSesion];

    const token = generarToken({ tipo: tipoSesion, codigo: codigo.trim(), horas });
    return res.status(200).json({
      ok: true,
      token,
      tipo: tipoSesion,
      horasValidez: horas,
      recordId: registro.id,
      fields: registro.fields,
    });
  } catch (err) {
    console.error('[auth-login] error interno:', err.message);
    return res.status(500).json({ error: 'Error interno validando el código.' });
  }
};
