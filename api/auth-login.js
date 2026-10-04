// api/auth-login.js
// Valida una credencial contra Airtable y, si es correcta, emite un token de
// sesión firmado. Este es el ÚNICO lugar donde una credencial se intercambia
// por un token — de aquí en adelante, api/airtable.js y demás endpoints
// sensibles exigen el token, no el código suelto.
//
// Paciente (SPEC-PACIENTE-UNICO.md §3): el código CC-PAC- es solo un
// identificador; la credencial es su PIN, verificado aquí contra
// CREDENCIALES_PACIENTE (lib/credencialesPaciente.js). La cuenta se activa
// con una liga de un solo uso que emite su médico (modo 'activar'). Los
// códigos demo siguen entrando sin PIN, como sesión 'demo' de solo lectura.

const { generarToken } = require('../lib/auth');
const cred = require('../lib/credencialesPaciente');
const { registrarAccesoExpediente } = require('../lib/accesosExpediente');

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');

const TABLAS = {
  medico:   { id: 'tbl87DsuBMmb4DjFM', campo: 'Código de médico' },
  paciente: { id: 'tblyUcCfueFLJuvIv', campo: 'Código de paciente' },
  vip:      { id: 'tblquF2fzFgUC5nll', campo: 'Código DZW' },
};

const HORAS_SESION = { medico: 6, paciente: 24, vip: 24, demo: 0.5 };

const MSG_NO_VERIFICABLE = 'No se pudo verificar tu código en este momento. Intenta de nuevo en unos minutos.';
// Mismo mensaje para liga inexistente, vencida, ya usada o de un demo: no se
// le dice a quien prueba ligas cuál de las cuatro acertó.
const MSG_LIGA = 'Este enlace de activación no es válido o ya venció. Pide a tu médico uno nuevo.';

function primerNombre(nombre) {
  return String(nombre || '').trim().split(/\s+/)[0] || '';
}

async function leerPaciente(recordId) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLAS.paciente.id}/${recordId}`, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  if (!r.ok) { const e = new Error(`PACIENTES respondió ${r.status}`); e.status = 502; throw e; }
  return r.json();
}

// Resuelve una liga a { credencial, paciente } o null si no sirve. Un fallo
// de Airtable se lanza (502), nunca se confunde con "liga inválida".
async function resolverLiga(liga) {
  if (!cred.ligaConForma(liga)) return null;
  const credencial = await cred.leerPorLiga(cred.hashLiga(liga));
  if (!credencial) return null;
  const vence = new Date(credencial.fields['Liga vence'] || 0).getTime();
  if (!Number.isFinite(vence) || vence <= Date.now()) return null;
  const pacRecId = (credencial.fields['Paciente'] || [])[0];
  if (!pacRecId) return null;
  const paciente = await leerPaciente(pacRecId);
  if (paciente.fields['Es demo'] === true) return null;
  return { credencial, paciente };
}

async function manejarActivacion(req, res) {
  const { modo, liga, pin } = req.body || {};
  let resuelta;
  try {
    resuelta = await resolverLiga(liga);
  } catch (err) {
    console.error('[auth-login] activación, Airtable:', err.message);
    return res.status(503).json({ error: MSG_NO_VERIFICABLE });
  }
  if (!resuelta) return res.status(403).json({ error: MSG_LIGA, motivo: 'liga_invalida' });
  const { credencial, paciente } = resuelta;
  const codigo = paciente.fields['Código de paciente'];

  // Solo consultar: la pantalla de activación saluda por nombre. La liga
  // (256 bits, un uso, 72 h) es el secreto; quien la tiene es el paciente.
  if (modo === 'consultar_activacion') {
    return res.status(200).json({ ok: true, nombre: primerNombre(paciente.fields['Nombre completo']), codigo });
  }

  if (!cred.pinValido(pin)) return res.status(400).json({ error: `El PIN debe tener ${cred.LARGO_PIN} dígitos.`, motivo: 'pin_formato' });
  if (cred.pinTrivial(pin)) return res.status(400).json({ error: 'Ese PIN es muy fácil de adivinar (números iguales, seguidos o repetidos). Elige otro.', motivo: 'pin_trivial' });

  try {
    // La liga se borra al usarse: un solo uso. Activar con liga también
    // desbloquea (es la recuperación por PIN olvidado o bloqueo definitivo).
    await cred.actualizar(credencial.id, {
      'PIN (hash)': cred.hashPin(pin),
      'Cuenta activada': true,
      'Fecha activación': new Date().toISOString(),
      'Intentos fallidos': 0,
      'Bloqueado hasta': null,
      'Liga (hash)': '',
      'Liga vence': null,
    });
  } catch (err) {
    console.error('[auth-login] activación, guardar PIN:', err.message);
    return res.status(503).json({ error: 'No se pudo guardar tu PIN. Intenta de nuevo con el mismo enlace.' });
  }
  await registrarAccesoExpediente({ pacienteCode: codigo, codigoMedico: '(paciente)', accion: 'Activación de cuenta', resultado: 'Exitoso', endpoint: 'auth-login:activar' });

  const token = generarToken({ tipo: 'paciente', codigo, horas: HORAS_SESION.paciente });
  return res.status(200).json({ ok: true, token, tipo: 'paciente', horasValidez: HORAS_SESION.paciente, recordId: paciente.id, fields: paciente.fields });
}

// Paciente real: exige PIN contra CREDENCIALES_PACIENTE. Devuelve true si
// ya respondió (rechazo), false si el PIN es correcto y se puede emitir token.
async function verificarPinPaciente(codigo, pin, res) {
  let credencial;
  try {
    credencial = await cred.leerPorCodigo(codigo);
  } catch (err) {
    console.error('[auth-login] credencial, Airtable:', err.message);
    res.status(503).json({ error: MSG_NO_VERIFICABLE });
    return true;
  }
  const f = (credencial && credencial.fields) || {};
  if (!credencial || f['Cuenta activada'] !== true || !f['PIN (hash)']) {
    res.status(401).json({ error: 'Tu cuenta aún no está activada. Pide a tu médico tu enlace de activación.', motivo: 'sin_activar' });
    return true;
  }
  const bloqueo = cred.estadoBloqueo(f);
  if (bloqueo) {
    res.status(429).json(bloqueo.definitivo
      ? { error: 'Demasiados intentos. Pide a tu médico un nuevo enlace de activación.', motivo: 'bloqueado_definitivo' }
      : { error: `Demasiados intentos. Intenta de nuevo en ${bloqueo.minutos} min.`, motivo: 'bloqueado', minutos: bloqueo.minutos });
    return true;
  }
  if (!pin) {
    res.status(401).json({ error: 'Escribe tu PIN.', motivo: 'pin_requerido' });
    return true;
  }
  if (!cred.pinValido(pin) || !cred.verificarPin(pin, f['PIN (hash)'])) {
    const cambios = cred.camposTrasFallo(f);
    try {
      await cred.actualizar(credencial.id, cambios);
    } catch (err) {
      // Si no se pudo contar el fallo, no se responde "PIN incorrecto" como
      // si nada: el contador es la defensa contra fuerza bruta.
      console.error('[auth-login] no se pudo registrar el intento fallido:', err.message);
      res.status(503).json({ error: MSG_NO_VERIFICABLE });
      return true;
    }
    const fallos = cambios['Intentos fallidos'];
    if (cambios['Bloqueado hasta'] || fallos >= cred.FALLOS_MAXIMOS) {
      await registrarAccesoExpediente({ pacienteCode: codigo, codigoMedico: '(paciente)', accion: 'Bloqueo por intentos de PIN', resultado: 'Rechazado', endpoint: 'auth-login:paciente' });
    }
    const restantes = cred.FALLOS_POR_BLOQUEO - (fallos % cred.FALLOS_POR_BLOQUEO);
    res.status(401).json({ error: 'PIN incorrecto.', motivo: 'pin_incorrecto', intentosAntesDeBloqueo: fallos >= cred.FALLOS_MAXIMOS ? 0 : (restantes === cred.FALLOS_POR_BLOQUEO ? 0 : restantes) });
    return true;
  }
  if (Number(f['Intentos fallidos'] || 0) > 0 || f['Bloqueado hasta']) {
    try { await cred.actualizar(credencial.id, { 'Intentos fallidos': 0, 'Bloqueado hasta': null }); }
    catch (err) { console.error('[auth-login] no se pudo reiniciar el contador de intentos:', err.message); }
  }
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://codecells.mx');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.SESSION_SECRET) {
      console.error('[auth-login] SESSION_SECRET no configurado en Vercel.');
      return res.status(500).json({ error: 'Configuración de sesión incompleta en el servidor.' });
    }

    const { modo } = req.body || {};
    if (modo === 'consultar_activacion' || modo === 'activar') return await manejarActivacion(req, res);

    const { tipo, codigo, pin } = req.body || {};
    if (!tipo || !TABLAS[tipo] || !codigo || typeof codigo !== 'string') {
      return res.status(400).json({ error: 'Falta un tipo válido (medico/paciente/vip) o el código.' });
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
      return res.status(503).json({ error: MSG_NO_VERIFICABLE });
    }

    // El cliente ya validó el FORMATO antes de llegar aquí (regex propia de
    // cada pantalla) — si llegamos a este punto y Airtable no encontró nada,
    // no es un problema de formato, es que ese código exacto no existe (o se
    // truncó al escribirlo/pegarlo).
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
    // un paciente real — aparecen en capturas y presentaciones. Se emite un
    // tipo de sesión distinto ('demo'): TTL corto, solo lectura, sin PIN.
    const esDemo = tipo === 'paciente' && registro.fields['Es demo'] === true;

    // Paciente real: el código solo no basta — PIN verificado en el servidor.
    if (tipo === 'paciente' && !esDemo) {
      const yaRespondio = await verificarPinPaciente(codigo.trim(), typeof pin === 'string' ? pin : '', res);
      if (yaRespondio) return;
    }

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
