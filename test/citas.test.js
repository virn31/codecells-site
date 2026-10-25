// Etapa 2 del directorio: solicitud de cita. Una solicitud nunca es una cita
// confirmada hasta que el médico responde; el motivo nunca viaja por Telegram.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';
process.env.AIRTABLE_BASE_ID = 'appBASEDEPRUEBAS'; // no es producción → sin congelamiento
process.env.TELEGRAM_CHAT_ID = 'chat-victor';

const test = require('node:test');
const assert = require('node:assert');
const { generarToken } = require('../lib/auth');
const C = require('../lib/citas');

const AHORA = new Date('2026-10-22T18:00:00Z'); // 12:00 en Culiacán/CDMX
const MAÑANA = '2026-10-23';

// ── Reglas puras ──────────────────────────────────────────────────────
const base = { medicoId: 'recPERFIL00000001', nombre: 'Ana Prueba', telefono: '667 123 4567', fechaPreferida: MAÑANA, turno: 'Mañana' };

test('validarSolicitudCita: datos mínimos válidos', () => {
  const v = C.validarSolicitudCita(base, AHORA);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.datos.fechaPreferida, MAÑANA);
});

test('validarSolicitudCita: fecha desde mañana y hasta 90 días (hora de México)', () => {
  assert.strictEqual(C.validarSolicitudCita({ ...base, fechaPreferida: '2026-10-22' }, AHORA).ok, false, 'hoy no');
  assert.strictEqual(C.validarSolicitudCita({ ...base, fechaPreferida: '2026-02-30' }, AHORA).ok, false, 'fecha inexistente');
  assert.strictEqual(C.validarSolicitudCita({ ...base, fechaPreferida: C.sumarDias('2026-10-22', 91) }, AHORA).ok, false);
  assert.strictEqual(C.validarSolicitudCita({ ...base, fechaPreferida: C.sumarDias('2026-10-22', 90) }, AHORA).ok, true);
  // 05:30 UTC del 23 = 23:30 del 22 en México: "mañana" sigue siendo el 23.
  assert.strictEqual(C.validarSolicitudCita(base, new Date('2026-10-23T05:30:00Z')).ok, true);
});

test('validarSolicitudCita: teléfono, turno, médico y campo trampa', () => {
  assert.strictEqual(C.validarSolicitudCita({ ...base, telefono: '12345' }, AHORA).ok, false);
  assert.strictEqual(C.validarSolicitudCita({ ...base, turno: 'Noche' }, AHORA).ok, false);
  assert.strictEqual(C.validarSolicitudCita({ ...base, medicoId: 'x' }, AHORA).ok, false);
  assert.strictEqual(C.validarSolicitudCita({ ...base, sitio: 'http://spam' }, AHORA).ok, false);
});

test('validarSolicitudCita: el motivo solo se conserva con consentimiento', () => {
  assert.strictEqual(C.validarSolicitudCita({ ...base, motivo: 'dolor de rodilla' }, AHORA).datos.motivo, undefined);
  assert.strictEqual(C.validarSolicitudCita({ ...base, motivo: 'dolor de rodilla', consentimiento: true }, AHORA).datos.motivo, 'dolor de rodilla');
});

test('validarHorario: formato, hora y no en el pasado', () => {
  assert.deepStrictEqual(C.validarHorario('2026-10-24T09:30', AHORA), { ok: true, horario: '2026-10-24 09:30' });
  assert.strictEqual(C.validarHorario('2026-10-21 09:30', AHORA).ok, false);
  assert.strictEqual(C.validarHorario('2026-10-24 25:00', AHORA).ok, false);
  assert.strictEqual(C.validarHorario('mañana a las 9', AHORA).ok, false);
});

test('transiciones del médico', () => {
  const E = C.ESTADOS_CITA;
  assert.strictEqual(C.transicionMedico(E.PENDIENTE, 'aceptar', { horario: 'x' }).estado, E.ACEPTADA);
  assert.strictEqual(C.transicionMedico(E.PENDIENTE, 'aceptar', {}).ok, false, 'aceptar exige hora exacta');
  assert.strictEqual(C.transicionMedico(E.ACEPTADA, 'aceptar', { horario: 'x' }).ok, false);
  assert.strictEqual(C.transicionMedico(E.PROPUESTA, 'proponer', { horario: 'x' }).estado, E.PROPUESTA);
  assert.strictEqual(C.transicionMedico(E.PENDIENTE, 'rechazar', {}).estado, E.RECHAZADA);
  assert.strictEqual(C.transicionMedico(E.ACEPTADA, 'rechazar', {}).ok, false, 'cancelar una cita acordada exige mensaje');
  assert.strictEqual(C.transicionMedico(E.ACEPTADA, 'rechazar', { mensaje: 'Tuve una urgencia' }).estado, E.RECHAZADA);
  assert.strictEqual(C.transicionMedico(E.CANCELADA, 'rechazar', { mensaje: 'x' }).ok, false);
});

test('transiciones del paciente', () => {
  const E = C.ESTADOS_CITA;
  assert.strictEqual(C.transicionPaciente(E.PROPUESTA, 'confirmar').estado, E.CONFIRMADA);
  assert.strictEqual(C.transicionPaciente(E.PENDIENTE, 'confirmar').ok, false, 'no hay nada que confirmar');
  assert.strictEqual(C.transicionPaciente(E.ACEPTADA, 'cancelar').estado, E.CANCELADA);
  assert.strictEqual(C.transicionPaciente(E.RECHAZADA, 'cancelar').ok, false);
});

test('clave de seguimiento: solo se guarda la huella y se compara exacta', () => {
  const clave = C.generarClave();
  const h = C.huellaClave(clave);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(C.claveValida(clave, h));
  assert.ok(!C.claveValida(clave + 'x', h));
  assert.ok(!C.claveValida(clave, ''));
  assert.notStrictEqual(C.generarClave(), clave);
});

test('vistaPaciente no expone teléfono, correo ni motivo', () => {
  const v = C.vistaPaciente({ id: 'recX', fields: { 'Teléfono/WhatsApp': '667', 'Email': 'a@b.c', 'Motivo declarado': 'dolor', 'Estado de cita': 'Aceptada', 'Horario acordado': '2026-10-24 09:30' } }, 'Dr. X');
  assert.deepStrictEqual(Object.keys(v).sort(), ['estado', 'fechaPreferida', 'fechaSolicitud', 'horario', 'id', 'medico', 'mensaje', 'modalidad', 'turno']);
  assert.ok(!JSON.stringify(v).includes('667'));
  assert.ok(!JSON.stringify(v).includes('dolor'));
});

// ── Endpoint con Airtable y Telegram simulados ───────────────────────
const TBL_SOL = 'tblUsc72JO2BaqT6d';
const TBL_DIR = 'tblkUNPwu1sQgZBPJ';
const TBL_MED = 'tbl87DsuBMmb4DjFM';
const PERFIL = 'recPERFIL00000001';
const MED = 'recMEDICO00000001';
const COD = 'CCMED-PRUEBA01';

function mundo({ publicado = true, solicitudes = [], perfilExtra = {} } = {}) {
  const m = { creados: [], patches: [], telegram: [], solicitudes: JSON.parse(JSON.stringify(solicitudes)) };
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const metodo = opts.method || 'GET';
    const ok = data => ({ ok: true, status: 200, json: async () => data });
    if (u.hostname === 'api.telegram.org') { m.telegram.push(JSON.parse(opts.body)); return ok({ ok: true }); }
    if (u.pathname.includes(TBL_MED)) {
      if (u.pathname.endsWith(MED)) return ok({ id: MED, fields: { 'Código de médico': COD, 'Telegram Chat ID': 'chat-medico' } });
      return ok({ records: [{ id: MED, fields: { 'Código de médico': COD } }] });
    }
    if (u.pathname.includes(TBL_DIR)) {
      const perfil = { id: PERFIL, fields: { 'Name': 'Dr. Prueba', 'Médico': [MED], 'Publicado': publicado, ...perfilExtra } };
      if (u.pathname.endsWith(PERFIL)) return ok(perfil);
      return ok({ records: [perfil] });
    }
    if (u.pathname.includes(TBL_SOL)) {
      if (metodo === 'POST') {
        const rec = { id: 'recSOLNUEVA000001', fields: JSON.parse(opts.body).fields };
        m.creados.push(rec.fields); m.solicitudes.push(rec);
        return ok(rec);
      }
      const id = u.pathname.split('/').pop();
      const rec = m.solicitudes.find(r => r.id === id);
      if (metodo === 'PATCH') {
        const f = JSON.parse(opts.body).fields;
        m.patches.push({ id, fields: f });
        Object.assign(rec.fields, f);
        return ok(rec);
      }
      if (rec) return ok(rec);
      // Así responde Airtable de verdad a un id bien formado que no existe (no 404).
      if (id.startsWith('rec')) return { ok: false, status: 403, json: async () => ({ error: { type: 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND', message: 'Invalid permissions, or the requested model was not found.' } }) };
      return ok({ records: m.solicitudes });
    }
    throw new Error('URL no simulada: ' + url);
  };
  return m;
}

function llamar(accion, { metodo = 'GET', body, codigo } = {}) {
  delete require.cache[require.resolve('../api/citas.js')];
  const handler = require('../api/citas.js');
  const headers = codigo ? { authorization: `Bearer ${generarToken({ tipo: 'medico', codigo })}` } : {};
  return new Promise(resolve => {
    handler({ method: metodo, query: { accion }, body, headers }, {
      status(c) { this.c = c; return this; },
      json(d) { resolve({ status: this.c, data: d }); return this; },
    });
  });
}

const solicitudValida = () => ({ ...base, fechaPreferida: C.sumarDias(C.fechaMexico(), 2), motivo: 'dolor crónico de rodilla', consentimiento: true });

test('solicitar a un médico no publicado → 404 y no crea nada', async () => {
  const m = mundo({ publicado: false });
  const r = await llamar('solicitar', { metodo: 'POST', body: solicitudValida() });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(m.creados.length, 0);
});

test('solicitar: queda Pendiente, guarda solo la huella de la clave y el Telegram no lleva motivo ni teléfono', async () => {
  const m = mundo();
  const r = await llamar('solicitar', { metodo: 'POST', body: solicitudValida() });
  assert.strictEqual(r.status, 200);
  const f = m.creados[0];
  assert.strictEqual(f['Estado de cita'], 'Pendiente');
  assert.strictEqual(f['Motivo declarado'], 'dolor crónico de rodilla');
  assert.strictEqual(f['Clave de seguimiento — huella'], C.huellaClave(r.data.clave));
  assert.ok(!JSON.stringify(f).includes(r.data.clave), 'la clave en claro no se guarda');
  assert.strictEqual(m.telegram.length, 1);
  assert.strictEqual(m.telegram[0].chat_id, 'chat-medico');
  assert.ok(!/rodilla|667|Ana/.test(m.telegram[0].text), 'el aviso no lleva motivo, teléfono ni nombre');
});

test('estado con clave equivocada → 404; con la correcta no expone teléfono ni motivo', async () => {
  const clave = C.generarClave();
  mundo({ solicitudes: [{ id: 'recSOL0000000001A', fields: { 'Clave de seguimiento — huella': C.huellaClave(clave), 'Teléfono/WhatsApp': '6671234567', 'Motivo declarado': 'rodilla', 'Médico solicitado': [PERFIL], 'Estado de cita': 'Pendiente' } }] });
  const mal = await llamar('estado', { metodo: 'POST', body: { id: 'recSOL0000000001A', c: 'otra' } });
  assert.strictEqual(mal.status, 404);
  const bien = await llamar('estado', { metodo: 'POST', body: { id: 'recSOL0000000001A', c: clave } });
  assert.strictEqual(bien.status, 200);
  assert.strictEqual(bien.data.solicitud.medico, 'Dr. Prueba');
  assert.ok(!/6671234567|rodilla/.test(JSON.stringify(bien.data)));
});

test('estado devuelve dónde es la consulta: dirección, mapa, teléfono del consultorio y liga del perfil', async () => {
  const clave = C.generarClave();
  mundo({
    solicitudes: [{ id: 'recSOL0000000003A', fields: { 'Clave de seguimiento — huella': C.huellaClave(clave), 'Teléfono/WhatsApp': '6670000000', 'Médico solicitado': [PERFIL], 'Estado de cita': 'Aceptada', 'Horario acordado': MAÑANA + ' 10:00' } }],
    perfilExtra: { 'Dirección del consultorio': 'Av. Obregón 123\nConsultorio 4', 'Ciudad de consulta': 'Culiacan', 'Teléfono de consultorio': '667 123 4567', 'Liga pública': 'dr-prueba', 'Costo de consulta': 1200 },
  });
  const r = await llamar('estado', { metodo: 'POST', body: { id: 'recSOL0000000003A', c: clave } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.deepStrictEqual(r.data.consultorio, {
    direccion: 'Av. Obregón 123\nConsultorio 4', ciudad: 'Culiacán',
    mapa: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Av. Obregón 123, Consultorio 4, Culiacán, México'),
    telefono: '6671234567', liga: 'dr-prueba', costo: '$1,200 MXN', costoEnLinea: '',
  });
  assert.ok(!JSON.stringify(r.data).includes('6670000000'), 'el teléfono del paciente no sale');
});

test('estado de una solicitud que no existe → 404 "no encontramos" (Airtable responde 403 MODEL_NOT_FOUND), no 502', async () => {
  mundo();
  const r = await llamar('estado', { metodo: 'POST', body: { id: 'recNOEXISTE000001', c: 'abc' } });
  assert.strictEqual(r.status, 404, JSON.stringify(r.data));
  assert.match(r.data.error, /No encontramos/);
});

test('el paciente confirma un horario propuesto; no puede confirmar uno pendiente', async () => {
  const clave = C.generarClave();
  const m = mundo({ solicitudes: [{ id: 'recSOL0000000002A', fields: { 'Clave de seguimiento — huella': C.huellaClave(clave), 'Médico solicitado': [PERFIL], 'Estado de cita': 'Pendiente' } }] });
  const r1 = await llamar('paciente', { metodo: 'POST', body: { id: 'recSOL0000000002A', c: clave, accion: 'confirmar' } });
  assert.strictEqual(r1.status, 409);
  m.solicitudes[0].fields['Estado de cita'] = 'Otro horario propuesto';
  const r2 = await llamar('paciente', { metodo: 'POST', body: { id: 'recSOL0000000002A', c: clave, accion: 'confirmar' } });
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(r2.data.solicitud.estado, 'Confirmada por el paciente');
});

test('mis_solicitudes: el médico solo ve las de su perfil', async () => {
  mundo({ solicitudes: [
    { id: 'recSOLMIA00000001', fields: { 'Médico solicitado': [PERFIL], 'Nombre del paciente': 'Mía', 'Estado de cita': 'Pendiente' } },
    { id: 'recSOLAJENA000001', fields: { 'Médico solicitado': ['recOTROPERFIL0001'], 'Nombre del paciente': 'Ajena' } },
  ] });
  const r = await llamar('mis_solicitudes', { codigo: COD });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.solicitudes.map(s => s.nombre), ['Mía']);
});

test('responder: 401 sin sesión, 403 si la solicitud es de otro perfil, aceptar exige hora', async () => {
  mundo({ solicitudes: [
    { id: 'recSOLAJENA000001', fields: { 'Médico solicitado': ['recOTROPERFIL0001'], 'Estado de cita': 'Pendiente' } },
    { id: 'recSOLMIA00000001', fields: { 'Médico solicitado': [PERFIL], 'Estado de cita': 'Pendiente', 'Estado': 'Nueva' } },
  ] });
  assert.strictEqual((await llamar('responder', { metodo: 'POST', body: { id: 'recSOLMIA00000001', respuesta: 'rechazar' } })).status, 401);
  assert.strictEqual((await llamar('responder', { metodo: 'POST', codigo: COD, body: { id: 'recSOLAJENA000001', respuesta: 'rechazar' } })).status, 403);
  assert.strictEqual((await llamar('responder', { metodo: 'POST', codigo: COD, body: { id: 'recSOLMIA00000001', respuesta: 'aceptar' } })).status, 400);
  const ok = await llamar('responder', { metodo: 'POST', codigo: COD, body: { id: 'recSOLMIA00000001', respuesta: 'aceptar', horario: C.sumarDias(C.fechaMexico(), 3) + ' 10:30' } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.data.solicitud.estado, 'Aceptada');
});

test('textoTurno: la franja nunca se confunde con "mañana" = día siguiente', () => {
  const C = require('../lib/citas');
  assert.equal(C.textoTurno('Mañana'), 'por la mañana');
  assert.equal(C.textoTurno('Tarde'), 'por la tarde');
  assert.equal(C.textoTurno('Cualquiera'), 'a cualquier hora');
});

// ── Modalidad: presencial / en línea ──
test('validarSolicitudCita: sin modalidad = Presencial; "En línea" pasa; otra cosa → error', () => {
  const b = { ...base, fechaPreferida: C.sumarDias(C.fechaMexico(), 2) };
  assert.strictEqual(C.validarSolicitudCita(b).datos.modalidad, 'Presencial');
  assert.strictEqual(C.validarSolicitudCita({ ...b, modalidad: 'En línea' }).datos.modalidad, 'En línea');
  assert.strictEqual(C.validarSolicitudCita({ ...b, modalidad: 'Telepatía' }).ok, false);
});

test('solicitar en línea a un médico que no la ofrece → 400 y no crea nada', async () => {
  const m = mundo();
  const r = await llamar('solicitar', { metodo: 'POST', body: { ...solicitudValida(), modalidad: 'En línea' } });
  assert.strictEqual(r.status, 400, JSON.stringify(r.data));
  assert.match(r.data.error, /no ofrece consulta en línea/);
  assert.strictEqual(m.creados.length, 0);
});

test('solicitar en línea con agenda automática: NO se agenda sola, queda Pendiente con Modalidad "En línea" y el aviso lo dice', async () => {
  const horario = JSON.stringify({ duracion: 30, zona: 'America/Mazatlan', dias: { 0: [['09:00', '18:00']], 1: [['09:00', '18:00']], 2: [['09:00', '18:00']], 3: [['09:00', '18:00']], 4: [['09:00', '18:00']], 5: [['09:00', '18:00']], 6: [['09:00', '18:00']] } });
  const m = mundo({ perfilExtra: { 'Consulta en línea': true, 'Agenda — automática': true, 'Agenda — horario': horario } });
  // Control: la agenda automática SÍ está activa (presencial sin hora → la pide).
  const control = await llamar('solicitar', { metodo: 'POST', body: { ...solicitudValida(), turno: 'Tarde' } });
  assert.strictEqual(control.status, 400, JSON.stringify(control.data));
  assert.match(control.data.error, /horarios disponibles/);
  const r = await llamar('solicitar', { metodo: 'POST', body: { ...solicitudValida(), turno: 'Tarde', modalidad: 'En línea' } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const f = m.creados[0];
  assert.strictEqual(f['Modalidad'], 'En línea');
  assert.strictEqual(f['Estado de cita'], 'Pendiente', 'el horario se acuerda con el médico');
  assert.ok(!f['Horario acordado']);
  assert.match(m.telegram[0].text, /EN LÍNEA/);
});

test('solicitar presencial guarda Modalidad "Presencial" (explícita, no vacía)', async () => {
  const m = mundo();
  const r = await llamar('solicitar', { metodo: 'POST', body: solicitudValida() });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(m.creados[0]['Modalidad'], 'Presencial');
  assert.ok(!/EN LÍNEA/.test(m.telegram[0].text));
});

test('estado de una solicitud en línea: modalidad y costo en línea para el paciente', async () => {
  const clave = C.generarClave();
  mundo({
    solicitudes: [{ id: 'recSOL0000000004A', fields: { 'Clave de seguimiento — huella': C.huellaClave(clave), 'Médico solicitado': [PERFIL], 'Estado de cita': 'Pendiente', 'Modalidad': 'En línea' } }],
    perfilExtra: { 'Consulta en línea': true, 'Costo de consulta en línea': 600 },
  });
  const r = await llamar('estado', { metodo: 'POST', body: { id: 'recSOL0000000004A', c: clave } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.solicitud.modalidad, 'En línea');
  assert.strictEqual(r.data.consultorio.costoEnLinea, '$600 MXN');
});
