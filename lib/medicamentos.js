// lib/medicamentos.js
// MVP-2 Medicamentos (docs/VISION-APP-MEDICA.md). Decisiones de Víctor
// (2026-10-04): la receta es el ÚNICO acto médico que crea medicamentos; el
// paciente solo registra suplementos, aparte y marcados "sin confirmar".
//
// Tablas (por NOMBRE: sus IDs cambian entre prueba y producción). Ninguna
// está en TABLAS_PERMITIDAS de api/airtable.js: solo las tocan las acciones
// de api/nova.js, que autorizan antes de llamar aquí.
//   RECETAS               acto médico (autor desde el token)
//   MEDICAMENTOS_PACIENTE un registro por medicamento; se suspende, no se borra
//   TOMAS_MEDICAMENTO     lo que el paciente marca "tomado"
//   SUPLEMENTOS_PACIENTE  lo que el paciente registra; se da de baja, no se borra
//
// "Hoy" es el día en Culiacán (America/Mazatlan), calculado en el SERVIDOR:
// el reloj del celular no decide qué día se marcó una toma.

const BASE_ID = (process.env.AIRTABLE_BASE_ID || 'app6jyD9pDlTLpknA');
const T = { recetas: 'RECETAS', medicamentos: 'MEDICAMENTOS_PACIENTE', tomas: 'TOMAS_MEDICAMENTO', suplementos: 'SUPLEMENTOS_PACIENTE' };
const ZONA = 'America/Mazatlan';
const MAX_MEDICAMENTOS = 10;   // un POST por lote de Airtable = todo o nada
const DIAS_ADHERENCIA = 7;

const VIAS = ['Oral', 'Sublingual', 'Subcutánea', 'Intramuscular', 'Intravenosa', 'Tópica', 'Inhalada', 'Oftálmica', 'Ótica', 'Nasal', 'Rectal', 'Vaginal', 'Otra'];
// tomasDia: cuántas veces se marca en un día que toca; cadaDias: cada cuántos
// días toca (1 = diario). 'prn' no genera tomas esperadas ni adherencia.
const FRECUENCIAS = {
  c4h:     { etiqueta: 'Cada 4 horas',  tomasDia: 6, cadaDias: 1 },
  c6h:     { etiqueta: 'Cada 6 horas',  tomasDia: 4, cadaDias: 1 },
  c8h:     { etiqueta: 'Cada 8 horas',  tomasDia: 3, cadaDias: 1 },
  c12h:    { etiqueta: 'Cada 12 horas', tomasDia: 2, cadaDias: 1 },
  c24h:    { etiqueta: 'Una vez al día', tomasDia: 1, cadaDias: 1 },
  c48h:    { etiqueta: 'Cada 48 horas', tomasDia: 1, cadaDias: 2 },
  semanal: { etiqueta: 'Una vez por semana', tomasDia: 1, cadaDias: 7 },
  prn:     { etiqueta: 'Solo si lo necesita', tomasDia: 0, cadaDias: 1 },
};

function url(tabla, sufijo = '') { return `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tabla)}${sufijo}`; }
function cabeceras() { return { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' }; }
function esc(v) { return String(v).replace(/"/g, '\\"'); }
function falla(tabla, status) { const e = new Error(`${tabla} respondió ${status}`); e.status = 502; return e; }

// ─── Fechas (días como 'YYYY-MM-DD', aritmética en UTC sin horas) ─────
function hoyEnZona(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}
function sumarDias(dia, n) {
  const d = new Date(dia + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function diasEntre(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400e3); }

// ─── Reglas puras (probadas sin Airtable) ─────────────────────────
// Cuántas tomas tocan ese día. 0 si aún no empieza, ya terminó, se suspendió
// antes de ese día, o es "solo si lo necesita".
function tomasEsperadasEnDia(med, dia) {
  const fr = FRECUENCIAS[med.frecuencia];
  if (!fr || !med.inicio || dia < med.inicio) return 0;
  if (med.duracionDias && diasEntre(med.inicio, dia) >= med.duracionDias) return 0;
  if (med.suspendidoDia && dia >= med.suspendidoDia) return 0;
  if (diasEntre(med.inicio, dia) % fr.cadaDias !== 0) return 0;
  return fr.tomasDia;
}

// Vigente hoy: activo, ya empezó y no ha terminado su duración. Un "solo si lo
// necesita" activo está vigente aunque no tenga tomas esperadas.
function vigente(med, hoy) {
  if (med.estado !== 'Activo' || !med.inicio || hoy < med.inicio) return false;
  if (med.duracionDias && diasEntre(med.inicio, hoy) >= med.duracionDias) return false;
  return true;
}

// Adherencia de los últimos N días COMPLETOS (sin contar hoy, que aún no
// acaba). Solo cuentan tomas marcadas que correspondían (no se puede pasar del
// 100% marcando de más). Sin tomas esperadas → porcentaje null, no 100%.
function adherencia(meds, tomas, hoy, dias = DIAS_ADHERENCIA) {
  const marcadas = new Set(tomas.map(t => `${t.medicamentoId}|${t.dia}|${t.numero}`));
  const porMed = {};
  let esperadasTot = 0, tomadasTot = 0;
  for (const med of meds) {
    let esperadas = 0, tomadas = 0;
    for (let i = dias; i >= 1; i--) {
      const dia = sumarDias(hoy, -i);
      const n = tomasEsperadasEnDia(med, dia);
      esperadas += n;
      for (let k = 1; k <= n; k++) if (marcadas.has(`${med.id}|${dia}|${k}`)) tomadas++;
    }
    porMed[med.id] = { esperadas, tomadas, porcentaje: esperadas ? Math.round(100 * tomadas / esperadas) : null };
    esperadasTot += esperadas; tomadasTot += tomadas;
  }
  return { dias, porMedicamento: porMed, esperadas: esperadasTot, tomadas: tomadasTot, porcentaje: esperadasTot ? Math.round(100 * tomadasTot / esperadasTot) : null };
}

// Valida un renglón de la receta. Devuelve { error } o { med } normalizado.
// Nada se completa por defecto: si falta dosis o frecuencia, se rechaza.
function validarMedicamento(m, i) {
  const n = `Medicamento ${i + 1}`;
  const nombre = String((m && m.nombre) || '').trim();
  const dosis = String((m && m.dosis) || '').trim();
  const via = String((m && m.via) || '').trim();
  const frecuencia = String((m && m.frecuencia) || '').trim();
  const indicaciones = String((m && m.indicaciones) || '').trim();
  if (!nombre) return { error: `${n}: falta el nombre.` };
  if (nombre.length > 120) return { error: `${n}: el nombre es demasiado largo.` };
  if (!dosis) return { error: `${n} (${nombre}): falta la dosis.` };
  if (dosis.length > 60) return { error: `${n} (${nombre}): la dosis es demasiado larga.` };
  if (!VIAS.includes(via)) return { error: `${n} (${nombre}): vía no válida.` };
  if (!FRECUENCIAS[frecuencia]) return { error: `${n} (${nombre}): frecuencia no válida.` };
  if (indicaciones.length > 300) return { error: `${n} (${nombre}): indicaciones demasiado largas.` };
  let duracionDias = null;
  if (m.duracionDias !== undefined && m.duracionDias !== null && m.duracionDias !== '') {
    duracionDias = Number(m.duracionDias);
    if (!Number.isInteger(duracionDias) || duracionDias < 1 || duracionDias > 365) return { error: `${n} (${nombre}): duración entre 1 y 365 días, o vacía (hasta nuevo aviso).` };
  }
  return { med: { nombre, dosis, via, frecuencia, duracionDias, indicaciones } };
}

// ─── Lecturas ─────────────────────────────────────────────────────
async function listarTodo(tabla, formula, orden) {
  const registros = [];
  let offset;
  do {
    const q = `?filterByFormula=${encodeURIComponent(formula)}${orden ? `&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(orden)}&sort%5B0%5D%5Bdirection%5D=desc` : ''}${offset ? `&offset=${offset}` : ''}`;
    const r = await fetch(url(tabla, q), { headers: cabeceras() });
    if (!r.ok) throw falla(tabla, r.status);
    const d = await r.json();
    registros.push(...(d.records || []));
    offset = d.offset;
  } while (offset);
  return registros;
}

function medAPublico(rec) {
  const f = rec.fields || {};
  const fs = f['Fecha suspensión'];
  return {
    id: rec.id,
    codigoPaciente: f['Código de paciente ref'] || null,
    nombre: f['Medicamento'] || '',
    dosis: f['Dosis'] || '',
    via: f['Vía'] || '',
    frecuencia: f['Frecuencia'] || '',
    frecuenciaEtiqueta: (FRECUENCIAS[f['Frecuencia']] || {}).etiqueta || '',
    duracionDias: typeof f['Duración (días)'] === 'number' ? f['Duración (días)'] : null,
    inicio: f['Fecha inicio'] || null,
    indicaciones: f['Indicaciones'] || '',
    estado: f['Estado'] || '',
    suspendidoDia: fs ? hoyEnZona(new Date(fs)) : null,
    motivoSuspension: f['Motivo suspensión'] || '',
    medicoCodigo: f['Código de médico ref'] || null,
    medicoRecId: (f['Prescrito por'] || [])[0] || null,
    recetaId: (f['Receta'] || [])[0] || null,
  };
}

async function listarMedicamentos(codigoPaciente) {
  const recs = await listarTodo(T.medicamentos, `{Código de paciente ref}="${esc(codigoPaciente)}"`, 'Fecha inicio');
  return recs.map(medAPublico);
}

// Tomas de los días indicados (igualdad exacta sobre texto: nada de comparar
// fechas como cadenas, CLAUDE.md §8).
async function listarTomas(codigoPaciente, dias) {
  const dDias = dias.map(d => `{Día}="${esc(d)}"`).join(',');
  const recs = await listarTodo(T.tomas, `AND({Código de paciente ref}="${esc(codigoPaciente)}",OR(${dDias}))`);
  return recs.map(r => ({ id: r.id, medicamentoId: r.fields['Medicamento ID'], dia: r.fields['Día'], numero: r.fields['Número de toma'] }));
}

async function listarSuplementos(codigoPaciente) {
  const recs = await listarTodo(T.suplementos, `AND({Código de paciente ref}="${esc(codigoPaciente)}",{Activo})`, 'Fecha registro');
  return recs.map(r => ({ id: r.id, nombre: r.fields['Suplemento'] || '', comoLoToma: r.fields['Cómo lo toma'] || '', desde: r.fields['Fecha registro'] || null }));
}

async function ultimaReceta(codigoPaciente) {
  const recs = await listarTodo(T.recetas, `AND({Código de paciente ref}="${esc(codigoPaciente)}",{Estado}="Emitida")`, 'Fecha emisión');
  const r = recs[0];
  if (!r) return null;
  const f = r.fields;
  return { id: r.id, fecha: f['Fecha emisión'] || null, diagnostico: f['Diagnóstico'] || '', indicaciones: f['Indicaciones generales'] || '', prescripcionAdicional: f['Prescripción adicional (texto)'] || '', proximaCita: f['Próxima cita'] || '', medicoRecId: (f['Médico'] || [])[0] || null };
}

async function leerMedicamento(id) {
  const r = await fetch(url(T.medicamentos, `/${id}`), { headers: cabeceras() });
  if (r.status === 404) return null;
  if (!r.ok) throw falla(T.medicamentos, r.status);
  return medAPublico(await r.json());
}

// ─── Escrituras ───────────────────────────────────────────────────
// Emite la receta. Orden: cabecera "Emitiendo" → medicamentos en UN lote
// (Airtable crea todo el lote o nada) → cabecera "Emitida". Si el lote falla,
// la cabecera queda "Fallida" y el paciente no ve nada. Devuelve
// { error:{status,mensaje} } o { recetaId, medicamentos, advertencia? }.
async function emitirReceta({ codigoPaciente, pacienteRecId, medicoCodigo, medicoRecId, datos, medicamentos }) {
  const ahora = new Date().toISOString();
  const hoy = hoyEnZona();
  const cab = await fetch(url(T.recetas), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ records: [{ fields: {
    'Receta': `${codigoPaciente} · ${hoy} · ${medicoCodigo}`,
    'Código de paciente ref': codigoPaciente,
    'Paciente': [pacienteRecId],
    'Médico': medicoRecId ? [medicoRecId] : [],
    'Código de médico ref': medicoCodigo,
    'Fecha emisión': ahora,
    'Diagnóstico': datos.diagnostico || '',
    'Indicaciones generales': datos.indicaciones || '',
    'Prescripción adicional (texto)': datos.prescripcionAdicional || '',
    'Próxima cita': datos.proximaCita || '',
    'Observaciones': datos.observaciones || '',
    'Estado': 'Emitiendo',
  } }] }) });
  if (!cab.ok) { console.error('[medicamentos] RECETAS POST', cab.status); return { error: { status: 502, mensaje: 'No se pudo guardar la receta. No se emitió nada; intenta de nuevo.' } }; }
  const recetaId = ((await cab.json()).records || [])[0].id;
  const marcar = (estado, n) => fetch(url(T.recetas, `/${recetaId}`), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ fields: { 'Estado': estado, 'Medicamentos guardados': n } }) });

  let creados = [];
  if (medicamentos.length) {
    const lote = await fetch(url(T.medicamentos), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ records: medicamentos.map(m => ({ fields: {
      'Medicamento': m.nombre,
      'Código de paciente ref': codigoPaciente,
      'Receta': [recetaId],
      'Dosis': m.dosis,
      'Vía': m.via,
      'Frecuencia': m.frecuencia,
      ...(m.duracionDias ? { 'Duración (días)': m.duracionDias } : {}),
      'Fecha inicio': hoy,
      'Indicaciones': m.indicaciones,
      'Prescrito por': medicoRecId ? [medicoRecId] : [],
      'Código de médico ref': medicoCodigo,
      'Estado': 'Activo',
    } })) }) });
    if (!lote.ok) {
      console.error('[medicamentos] MEDICAMENTOS POST', lote.status);
      await marcar('Fallida', 0).catch(() => {});
      return { error: { status: 502, mensaje: 'No se guardaron los medicamentos. La receta NO se emitió y el paciente no ve nada; intenta de nuevo.' } };
    }
    creados = ((await lote.json()).records || []).map(medAPublico);
  }
  const fin = await marcar('Emitida', creados.length).catch(() => ({ ok: false }));
  const out = { recetaId, medicamentos: creados };
  if (!fin.ok) out.advertencia = 'Los medicamentos se guardaron, pero la receta quedó marcada como "Emitiendo" en el registro.';
  return out;
}

async function suspenderMedicamento(id, motivo) {
  const r = await fetch(url(T.medicamentos, `/${id}`), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ fields: { 'Estado': 'Suspendido', 'Fecha suspensión': new Date().toISOString(), 'Motivo suspensión': motivo } }) });
  return r.ok;
}

// Marca una toma de HOY. Idempotente: si ya estaba, no duplica.
async function marcarToma({ codigoPaciente, medicamentoId, numero }) {
  const hoy = hoyEnZona();
  const existentes = await listarTodo(T.tomas, `AND({Código de paciente ref}="${esc(codigoPaciente)}",{Medicamento ID}="${esc(medicamentoId)}",{Día}="${hoy}",{Número de toma}=${Number(numero)})`);
  if (existentes.length) return { ok: true, yaEstaba: true, dia: hoy };
  const r = await fetch(url(T.tomas), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ records: [{ fields: {
    'Toma': `${medicamentoId} · ${hoy} · ${numero}`, 'Medicamento ID': medicamentoId, 'Código de paciente ref': codigoPaciente,
    'Día': hoy, 'Número de toma': Number(numero), 'Marcado en': new Date().toISOString(),
  } }] }) });
  if (!r.ok) throw falla(T.tomas, r.status);
  return { ok: true, dia: hoy };
}

// Desmarca una toma de HOY (corregir un toque por error). Solo del día en
// curso: el historial de días anteriores no se reescribe.
async function desmarcarToma({ codigoPaciente, medicamentoId, numero }) {
  const hoy = hoyEnZona();
  const existentes = await listarTodo(T.tomas, `AND({Código de paciente ref}="${esc(codigoPaciente)}",{Medicamento ID}="${esc(medicamentoId)}",{Día}="${hoy}",{Número de toma}=${Number(numero)})`);
  for (const rec of existentes) {
    const r = await fetch(url(T.tomas, `/${rec.id}`), { method: 'DELETE', headers: cabeceras() });
    if (!r.ok) throw falla(T.tomas, r.status);
  }
  return { ok: true, dia: hoy };
}

async function agregarSuplemento({ codigoPaciente, nombre, comoLoToma }) {
  const r = await fetch(url(T.suplementos), { method: 'POST', headers: cabeceras(), body: JSON.stringify({ records: [{ fields: {
    'Suplemento': nombre, 'Código de paciente ref': codigoPaciente, 'Cómo lo toma': comoLoToma, 'Activo': true, 'Fecha registro': new Date().toISOString(),
  } }] }) });
  if (!r.ok) throw falla(T.suplementos, r.status);
  const rec = ((await r.json()).records || [])[0];
  return { id: rec.id, nombre, comoLoToma, desde: rec.fields['Fecha registro'] || null };
}

// Baja (no borrado) de un suplemento del propio paciente.
async function bajaSuplemento({ codigoPaciente, id }) {
  const g = await fetch(url(T.suplementos, `/${id}`), { headers: cabeceras() });
  if (g.status === 404) return { error: { status: 404, mensaje: 'No se encontró el suplemento.' } };
  if (!g.ok) throw falla(T.suplementos, g.status);
  if (((await g.json()).fields || {})['Código de paciente ref'] !== codigoPaciente) return { error: { status: 403, mensaje: 'No disponible.' } };
  const r = await fetch(url(T.suplementos, `/${id}`), { method: 'PATCH', headers: cabeceras(), body: JSON.stringify({ fields: { 'Activo': false, 'Fecha baja': new Date().toISOString() } }) });
  if (!r.ok) throw falla(T.suplementos, r.status);
  return { ok: true };
}

module.exports = {
  T, VIAS, FRECUENCIAS, MAX_MEDICAMENTOS, DIAS_ADHERENCIA,
  hoyEnZona, sumarDias, tomasEsperadasEnDia, vigente, adherencia, validarMedicamento,
  listarMedicamentos, listarTomas, listarSuplementos, ultimaReceta, leerMedicamento,
  emitirReceta, suspenderMedicamento, marcarToma, desmarcarToma, agregarSuplemento, bajaSuplemento,
};
