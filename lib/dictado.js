// lib/dictado.js — Motor de dictado de NOVA (SPEC-NOVA-DICTACION-BIDIRECCIONAL).
// Compartido por el portal (nova.js action medico_dictado) y por Telegram
// (api/telegram-bot.js): mismo prompt, misma verificación por cita literal.
// No guarda nada; quien lo llama decide qué hacer con el resultado.

// ─── MOTOR DE DICTADO (SPEC-NOVA-DICTACION-BIDIRECCIONAL, Fase 1) ───
// NOVA transcribe y estructura, nunca redacta (CLAUDE.md §7). Por cada campo
// que coloca devuelve la CITA exacta del dictado; el servidor verifica que la
// cita exista en la transcripción. Campos de texto: el valor ES la cita
// literal (NOVA solo decide en qué campo va cada fragmento). Números: la cita
// debe contener el número. Lo que no se verifica se DESCARTA y se le muestra
// al médico. Nada se guarda aquí: el médico revisa y guarda (portal) o
// confirma (Telegram). Mismos nombres de campo que rellenar_ficha_consulta,
// para reutilizar el llenado del formulario.
const CAMPOS_DICTADO = Object.freeze({
  peso:                  { tipo: 'numero', rango: [1, 400], etiqueta: 'Peso (kg)' },
  talla:                 { tipo: 'numero', rango: [30, 250], etiqueta: 'Talla (cm)' },
  presion:               { tipo: 'presion', etiqueta: 'Presión arterial' },
  temperatura:           { tipo: 'numero', rango: [33, 43], etiqueta: 'Temperatura (°C)' },
  frecuencia_cardiaca:   { tipo: 'numero', rango: [30, 220], etiqueta: 'Frecuencia cardiaca' },
  frecuencia_respiratoria: { tipo: 'numero', rango: [6, 60], etiqueta: 'Frecuencia respiratoria' },
  saturacion_oxigeno:    { tipo: 'numero', rango: [50, 100], etiqueta: 'Saturación de oxígeno' },
  circunferencia_cintura: { tipo: 'numero', rango: [30, 250], etiqueta: 'Circunferencia de cintura (cm)' },
  motivo_consulta:       { tipo: 'texto', etiqueta: 'Motivo de consulta' },
  exploracion_fisica:    { tipo: 'texto', etiqueta: 'Exploración física' },
  diagnostico:           { tipo: 'texto', etiqueta: 'Diagnóstico' },
  plan_terapeutico:      { tipo: 'texto', etiqueta: 'Plan terapéutico' },
  antecedentes_heredofamiliares: { tipo: 'texto', etiqueta: 'Antecedentes heredofamiliares' },
  antecedentes_personales_patologicos: { tipo: 'texto', etiqueta: 'Antecedentes personales patológicos' },
  antecedentes_quirurgicos: { tipo: 'texto', etiqueta: 'Antecedentes quirúrgicos' },
  antecedentes_ginecoobstetricos: { tipo: 'texto', etiqueta: 'Antecedentes ginecoobstétricos' },
  medicamentos_actuales: { tipo: 'texto', etiqueta: 'Medicamentos actuales' },
  alergias:              { tipo: 'texto', etiqueta: 'Alergias' },
  habitos_estilo_vida:   { tipo: 'texto', etiqueta: 'Hábitos y estilo de vida' },
  estado_civil:          { tipo: 'texto', etiqueta: 'Estado civil' },
  ocupacion:             { tipo: 'texto', etiqueta: 'Ocupación' },
  grupo_sanguineo:       { tipo: 'grupo_sanguineo', etiqueta: 'Grupo sanguíneo' },
  escolaridad:           { tipo: 'escolaridad', etiqueta: 'Escolaridad' },
});

// ── Campos de opción fija (mismas opciones que los <select> del portal) ──
// El valor tiene que estar DICHO en la cita: "O positivo", "A-", "terminó la
// licenciatura". No se deduce ("es ingeniero" no prueba licenciatura
// terminada; "estudió licenciatura" no dice si la terminó).
const GRUPOS_SANGUINEOS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const ESCOLARIDADES = ['Primaria', 'Secundaria', 'Preparatoria', 'Licenciatura trunca', 'Licenciatura terminada', 'Posgrado'];

function verificarGrupoSanguineo(valor, cita) {
  const m = String(valor || '').toUpperCase().replace(/\s+/g, '').match(/^(AB|A|B|O)([+-])$/);
  if (!m) return { ok: false, motivo: 'grupo sanguíneo no válido' };
  const [, tipo, signo] = m;
  const t = tipo.toLowerCase();
  const raw = String(cita || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Con símbolo: "O+", "ab -", "O Rh+". La letra no puede ir pegada a otra
  // letra ("ab+" no prueba "B+").
  const conSimbolo = new RegExp(`(^|[^a-z])${t}\\s*(rh\\s*)?\\${signo}`).test(raw);
  // Con palabras: "O positivo", "cero Rh negativo", "A factor positivo".
  const n = normalizarDictado(cita);
  const palabra = signo === '+' ? 'positivo' : 'negativo';
  const tipos = t === 'o' ? ['o', 'cero'] : [t];
  const conPalabras = tipos.some((tp) => new RegExp(`(^| )${tp} (rh )?(factor )?${palabra}( |$)`).test(n));
  if (!conSimbolo && !conPalabras) return { ok: false, motivo: 'ese grupo sanguíneo no aparece en la cita' };
  return { ok: true, valor: `${tipo}${signo}` };
}

const ESCOLARIDAD_INCOMPLETA = /\b(trunca|truncada|incompleta|inconclusa|no (la |lo )?termino|sin terminar|dejo)\b/;
const ESCOLARIDAD_COMPLETA = /\b(terminada|termino|completa|concluida|concluyo|titulad[oa]|egresad[oa])\b/;
function verificarEscolaridad(valor, cita) {
  const opcion = ESCOLARIDADES.find((o) => o.toLowerCase() === String(valor || '').trim().toLowerCase());
  if (!opcion) return { ok: false, motivo: 'escolaridad no válida' };
  const n = normalizarDictado(cita);
  const nivel = {
    Primaria: /\bprimaria\b/,
    Secundaria: /\bsecundaria\b/,
    Preparatoria: /\b(preparatoria|prepa|bachillerato)\b/,
    'Licenciatura trunca': /\b(licenciatura|carrera|universidad)\b/,
    'Licenciatura terminada': /\b(licenciatura|carrera|universidad)\b/,
    Posgrado: /\b(posgrado|maestria|doctorado|especialidad)\b/,
  }[opcion];
  if (!nivel.test(n)) return { ok: false, motivo: 'ese nivel de estudios no aparece en la cita' };
  const incompleta = ESCOLARIDAD_INCOMPLETA.test(n);
  if (opcion === 'Licenciatura trunca') {
    return incompleta ? { ok: true, valor: opcion } : { ok: false, motivo: 'no dijiste que la licenciatura quedó trunca' };
  }
  if (opcion === 'Licenciatura terminada') {
    if (incompleta) return { ok: false, motivo: 'dijiste que la licenciatura no se terminó' };
    return ESCOLARIDAD_COMPLETA.test(n) ? { ok: true, valor: opcion } : { ok: false, motivo: 'no dijiste si terminó la licenciatura — elígelo tú' };
  }
  // Primaria/secundaria/prepa/posgrado incompletos no tienen opción propia:
  // no se redondea a "completo".
  if (incompleta) return { ok: false, motivo: 'no hay opción para ese nivel incompleto — captúralo tú' };
  return { ok: true, valor: opcion };
}
const SIGNOS_BASICOS_DICTADO = ['presion', 'frecuencia_cardiaca', 'temperatura', 'saturacion_oxigeno', 'peso', 'talla'];
const MAX_TEXTO_DICTADO = 8000;

// Minúsculas, sin acentos, puntuación → espacio, espacios colapsados. Se
// conserva el punto decimal entre dígitos ("37.2").
function normalizarDictado(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d)[.,](\d)/g, '$1#$2')
    .replace(/[^a-z0-9#ñ/ ]+/g, ' ')
    .replace(/#/g, '.')
    .replace(/\s+/g, ' ').trim();
}

// Números en palabras (español) → cifras, de forma DETERMINISTA y solo para
// verificar la cita: el reconocimiento de voz a veces entrega "noventa y dos"
// en vez de "92". No es inferencia: si NOVA dice 92 y la cita dice "noventa y
// dos", se acepta; si dice 90, se descarta. Cubre 0–999 y decimales con
// "punto" ("treinta y siete punto dos" → 37.2).
const NUM_UNIDADES = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };
const NUM_ESPECIALES = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const NUM_DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const NUM_CENTENAS = { cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400,
  cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };

function claseNumero(w) {
  if (w in NUM_CENTENAS) return [3, NUM_CENTENAS[w]];
  if (w in NUM_DECENAS) return [2, NUM_DECENAS[w]];
  if (w in NUM_ESPECIALES) return [2, NUM_ESPECIALES[w]]; // 10–29 ocupan decena + unidad
  if (w in NUM_UNIDADES) return [1, NUM_UNIDADES[w]];
  return null;
}

function numerosEnPalabras(textoNorm) {
  const palabras = textoNorm.split(' ');
  const enteros = []; // [{valor, fin}] — fin = índice de la última palabra
  let actual = null; let ultimaClase = 9; let decenaSinUnidad = false;
  const cerrar = (i) => { if (actual !== null) enteros.push({ valor: actual, fin: i }); actual = null; ultimaClase = 9; decenaSinUnidad = false; };
  for (let i = 0; i < palabras.length; i++) {
    const w = palabras[i];
    if (w === 'y' && actual !== null && decenaSinUnidad) continue;
    const c = claseNumero(w);
    if (!c) { cerrar(i - 1); continue; }
    const [clase, valor] = c;
    // Una unidad tras una decena exacta (con o sin "y") se suma: "noventa y dos".
    const suma = actual !== null && (clase < ultimaClase || (clase === 1 && decenaSinUnidad));
    if (!suma) cerrar(i - 1);
    actual = (actual || 0) + valor;
    decenaSinUnidad = clase === 2 && valor % 10 === 0 && valor >= 30;
    ultimaClase = clase === 2 && !decenaSinUnidad ? 1.5 : clase;
  }
  cerrar(palabras.length - 1);
  // Decimales: "<entero> punto <entero>" → "37.2"
  const out = [];
  for (let k = 0; k < enteros.length; k++) {
    const a = enteros[k]; const b = enteros[k + 1];
    if (b && palabras[a.fin + 1] === 'punto' && b.fin > a.fin + 1) { out.push(Number(`${a.valor}.${b.valor}`)); k++; }
    else out.push(a.valor);
  }
  return out;
}

// Números de la cita: en cifras ("37.2", "37 punto 2", "120/80") y en palabras.
function numerosDeCita(cita) {
  const n = normalizarDictado(cita).replace(/(\d+) punto (\d+)/g, '$1.$2');
  return [...(n.match(/\d+(?:\.\d+)?/g) || []).map(Number), ...numerosEnPalabras(n.replace(/\//g, ' '))];
}

// Encabezados que el médico dice en voz alta ("Diagnóstico: …"). Se quita
// solo el encabezado inicial del propio campo; el contenido queda literal.
const ENCABEZADOS_DICTADO = {
  motivo_consulta: ['motivo de consulta', 'motivo'],
  exploracion_fisica: ['exploracion fisica', 'exploracion', 'ef'],
  diagnostico: ['diagnostico', 'dx', 'impresion diagnostica'],
  plan_terapeutico: ['plan terapeutico', 'plan', 'tratamiento'],
  alergias: ['alergias'],
  medicamentos_actuales: ['medicamentos actuales', 'medicamentos'],
};
function quitarEncabezado(campo, texto) {
  const t = String(texto).trim();
  for (const e of (ENCABEZADOS_DICTADO[campo] || [])) {
    const m = t.match(/^([^:]{1,40}):\s*(.+)$/s);
    if (m && normalizarDictado(m[1]) === e) return m[2].trim();
  }
  return t;
}

// Verifica UN campo propuesto contra la transcripción. Devuelve
// { ok: true, valor, aviso? } o { ok: false, motivo }.
function verificarCampoDictado(campo, valor, cita, transcripcionNorm) {
  const def = CAMPOS_DICTADO[campo];
  if (!def) return { ok: false, motivo: 'campo desconocido' };
  // En los campos de opción el dato puede quedar repartido ("estudió
  // licenciatura" … "sí la terminó"): la cita admite fragmentos separados por
  // "…" y CADA uno tiene que aparecer literal en lo dictado.
  const esOpcion = def.tipo === 'grupo_sanguineo' || def.tipo === 'escolaridad';
  const piezas = esOpcion ? String(cita || '').split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean) : [cita];
  const noAparece = (p) => { const n = normalizarDictado(p); return n.length < 2 || !transcripcionNorm.includes(n); };
  if (!piezas.length || piezas.some(noAparece)) {
    return { ok: false, motivo: 'la cita no aparece en lo que dictaste' };
  }
  if (esOpcion) cita = piezas.join(' ');
  if (def.tipo === 'texto') return { ok: true, valor: quitarEncabezado(campo, cita) };
  if (def.tipo === 'grupo_sanguineo') return verificarGrupoSanguineo(valor, cita);
  if (def.tipo === 'escolaridad') return verificarEscolaridad(valor, cita);
  const nums = numerosDeCita(cita);
  if (def.tipo === 'presion') {
    const m = String(valor || '').match(/^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/);
    if (!m) return { ok: false, motivo: 'formato de presión no válido' };
    const sis = Number(m[1]); const dia = Number(m[2]);
    if (!nums.includes(sis) || !nums.includes(dia)) return { ok: false, motivo: 'las cifras no aparecen en la cita' };
    const fuera = sis < 60 || sis > 260 || dia < 30 || dia > 160 || dia >= sis;
    return { ok: true, valor: `${sis}/${dia}`, ...(fuera ? { aviso: 'fuera de rango plausible — revisa' } : {}) };
  }
  const v = Number(valor);
  if (!Number.isFinite(v)) return { ok: false, motivo: 'no es un número' };
  if (!nums.includes(v)) return { ok: false, motivo: 'el número no aparece en la cita' };
  const fuera = v < def.rango[0] || v > def.rango[1];
  return { ok: true, valor: v, ...(fuera ? { aviso: 'fuera de rango plausible — revisa' } : {}) };
}

// Aplica la verificación a la salida del modelo. Texto repetido en un mismo
// campo se une con ". "; un número repetido con valores distintos es
// conflicto y se descarta (el médico lo dicta de nuevo).
function procesarDictado(transcripcion, propuestos, sinUbicar, recetaPropuesta) {
  const tNorm = normalizarDictado(transcripcion);
  const campos = {};
  const detalle = [];
  const descartados = [];
  for (const p of (Array.isArray(propuestos) ? propuestos : [])) {
    if (!p || typeof p.campo !== 'string') continue;
    const r = verificarCampoDictado(p.campo, p.valor, p.cita, tNorm);
    if (!r.ok) { descartados.push({ campo: p.campo, etiqueta: CAMPOS_DICTADO[p.campo]?.etiqueta || p.campo, valor: p.valor ?? null, cita: p.cita ?? null, motivo: r.motivo }); continue; }
    const def = CAMPOS_DICTADO[p.campo];
    if (campos[p.campo] !== undefined) {
      if (def.tipo === 'texto') {
        const prev = String(campos[p.campo]);
        if (!prev.includes(r.valor)) campos[p.campo] = `${prev}${/[.!?]\s*$/.test(prev) ? '' : '.'} ${r.valor}`;
      }
      else if (campos[p.campo] !== r.valor) {
        descartados.push({ campo: p.campo, etiqueta: def.etiqueta, valor: r.valor, cita: p.cita, motivo: `dictaste dos valores distintos (${campos[p.campo]} y ${r.valor})` });
        delete campos[p.campo];
        for (let i = detalle.length - 1; i >= 0; i--) if (detalle[i].campo === p.campo) detalle.splice(i, 1);
        continue;
      }
    } else campos[p.campo] = r.valor;
    detalle.push({ campo: p.campo, etiqueta: def.etiqueta, valor: r.valor, cita: String(p.cita).trim(), ...(r.aviso ? { aviso: r.aviso } : {}) });
  }
  const sinUbicarVerificado = (Array.isArray(sinUbicar) ? sinUbicar : [])
    .map(x => String(x || '').trim()).filter(x => x && tNorm.includes(normalizarDictado(x)));
  const faltantes = SIGNOS_BASICOS_DICTADO.filter(c => campos[c] === undefined).map(c => CAMPOS_DICTADO[c].etiqueta);
  const r = recetaPropuesta || {};
  const receta = procesarRecetaDictada(tNorm, r.medicamentos, r.receta_indicaciones, r.proxima_cita);
  if (receta && campos.diagnostico) receta.diagnostico = String(campos.diagnostico).slice(0, 300);
  return { campos, detalle, descartados, sinUbicar: sinUbicarVerificado, faltantes, receta };
}

// ── Borrador de receta desde el dictado (p. ej. el médico en su auto tras una
// llamada: dicta la consulta y lo que receta). Misma regla de cita literal.
// La receta es acto médico: aquí solo se arma el BORRADOR; se emite con
// medico_emitir_receta cuando el médico lo revisa (portal) o confirma
// (Telegram). Nada se deduce: si la vía o la frecuencia no se dijeron, el
// medicamento queda incompleto y el médico las elige antes de emitir.
const VIAS_DICTADO = {
  Oral: ['oral', 'via oral', 'vo', 'por boca', 'tomado', 'tomada'],
  Sublingual: ['sublingual', 'debajo de la lengua'],
  'Subcutánea': ['subcutanea', 'subcutaneo', 'sc'],
  Intramuscular: ['intramuscular', 'im'],
  Intravenosa: ['intravenosa', 'intravenoso', 'iv', 'endovenosa'],
  'Tópica': ['topica', 'topico', 'aplicar en la piel'],
  Inhalada: ['inhalada', 'inhalado', 'inhalador', 'nebulizacion', 'nebulizar'],
  'Oftálmica': ['oftalmica', 'oftalmico', 'en el ojo', 'en los ojos'],
  'Ótica': ['otica', 'en el oido', 'en los oidos'],
  Nasal: ['nasal', 'intranasal'],
  Rectal: ['rectal', 'supositorio'],
  Vaginal: ['vaginal', 'ovulo'],
};
const FRECUENCIAS_DICTADO = {
  c4h: { horas: 4 }, c6h: { horas: 6 }, c8h: { horas: 8 }, c12h: { horas: 12 },
  c24h: { horas: 24, frases: ['una vez al dia', 'una vez diaria', 'cada dia', 'diario', 'diariamente', 'al dia una', 'una al dia', 'una diaria'] },
  c48h: { horas: 48, frases: ['cada tercer dia', 'cada dos dias', 'dia de por medio', 'un dia si y un dia no'] },
  semanal: { frases: ['semanal', 'una vez por semana', 'una vez a la semana', 'cada semana', 'cada siete dias', 'cada 7 dias'] },
  prn: { frases: ['si hay dolor', 'en caso de dolor', 'en caso de', 'si lo necesita', 'por razon necesaria', 'prn', 'si es necesario', 'si tiene fiebre', 'si presenta'] },
};

function contieneFrase(citaNorm, frase) {
  return (` ${citaNorm} `).includes(` ${frase} `);
}

function verificarFrecuencia(clave, cita) {
  const def = FRECUENCIAS_DICTADO[clave];
  if (!def || !cita) return false;
  const c = normalizarDictado(cita);
  if ((def.frases || []).some(f => contieneFrase(c, f))) return true;
  if (def.horas && /\bhoras?\b/.test(c) && numerosDeCita(cita).includes(def.horas)) return true;
  return false;
}

function verificarVia(via, cita) {
  const palabras = VIAS_DICTADO[via];
  if (!palabras || !cita) return false;
  const c = normalizarDictado(cita);
  return palabras.some(p => contieneFrase(c, p));
}

// Duración en días: el número dicho, o semanas × 7 ("dos semanas" → 14).
function verificarDuracion(dias, cita) {
  const d = Number(dias);
  if (!Number.isInteger(d) || d < 1 || d > 365 || !cita) return false;
  const c = normalizarDictado(cita);
  const nums = numerosDeCita(cita);
  if (/\bdias?\b/.test(c) && nums.includes(d)) return true;
  if (/\bsemanas?\b/.test(c) && (nums.some(n => n * 7 === d) || (d === 7 && contieneFrase(c, 'una semana')))) return true;
  if (/\bmes(es)?\b/.test(c) && nums.some(n => n * 30 === d)) return true;
  return false;
}

// Verifica el borrador de receta propuesto por NOVA contra la transcripción.
function procesarRecetaDictada(transcripcionNorm, medicamentos, indicacionesCitas, proximaCitaCita) {
  const enDictado = (cita) => {
    const n = normalizarDictado(cita);
    return n.length >= 2 && transcripcionNorm.includes(n);
  };
  const meds = [];
  const descartados = [];
  for (const m of (Array.isArray(medicamentos) ? medicamentos : []).slice(0, 10)) {
    if (!m || !m.nombre || !enDictado(m.nombre.cita)) {
      descartados.push({ medicamento: m && m.nombre && m.nombre.valor, motivo: 'el nombre no aparece en lo que dictaste' });
      continue;
    }
    const med = { nombre: String(m.nombre.cita).trim(), dosis: '', via: '', frecuencia: '', duracionDias: null, indicaciones: '', faltan: [], citas: { nombre: String(m.nombre.cita).trim() } };
    if (m.dosis && enDictado(m.dosis.cita)) { med.dosis = String(m.dosis.cita).trim().slice(0, 60); med.citas.dosis = med.dosis; }
    if (m.frecuencia && enDictado(m.frecuencia.cita) && verificarFrecuencia(m.frecuencia.valor, m.frecuencia.cita)) { med.frecuencia = m.frecuencia.valor; med.citas.frecuencia = String(m.frecuencia.cita).trim(); }
    if (m.via && enDictado(m.via.cita) && verificarVia(m.via.valor, m.via.cita)) { med.via = m.via.valor; med.citas.via = String(m.via.cita).trim(); }
    if (m.duracion_dias && enDictado(m.duracion_dias.cita) && verificarDuracion(m.duracion_dias.valor, m.duracion_dias.cita)) { med.duracionDias = Number(m.duracion_dias.valor); med.citas.duracion = String(m.duracion_dias.cita).trim(); }
    if (m.indicaciones && enDictado(m.indicaciones.cita)) { med.indicaciones = String(m.indicaciones.cita).trim().slice(0, 300); med.citas.indicaciones = med.indicaciones; }
    if (!med.dosis) med.faltan.push('dosis');
    if (!med.via) med.faltan.push('vía');
    if (!med.frecuencia) med.faltan.push('frecuencia');
    meds.push(med);
  }
  const indicaciones = (Array.isArray(indicacionesCitas) ? indicacionesCitas : [])
    .map(x => String(x || '').trim()).filter(x => x && enDictado(x)).join('. ');
  const proximaCita = proximaCitaCita && enDictado(proximaCitaCita) ? String(proximaCitaCita).trim().slice(0, 120) : '';
  if (!meds.length && !indicaciones) return null;
  return { medicamentos: meds, indicaciones, proximaCita, completa: meds.length > 0 && meds.every(x => !x.faltan.length), descartados };
}

const PROMPT_DICTADO = `Eres el transcriptor clínico de NOVA. Recibes lo que un médico dictó durante o después de una consulta y lo ACOMODAS en los campos de la ficha. Reglas que no se negocian:
- No redactas, no resumes, no corriges, no completas. Solo decides en qué campo va cada fragmento de lo que el médico dijo.
- Para cada campo devuelves "cita": el fragmento EXACTO, copiado palabra por palabra de la transcripción, de donde sale ese dato. Si no puedes señalar una cita exacta, NO llenes ese campo.
- Nunca agregues negativos clínicos ("niega alergias", "sin antecedentes") que no se dijeron, ni unidades, ni fechas, ni códigos CIE-10, ni dosis, ni diagnósticos que el médico no dijo.
- Antecedentes heredofamiliares (padres, hermanos, familia) nunca van en antecedentes personales.
- Lo que el paciente REFIERE (síntomas, cómo empezó, qué lo empeora o mejora, evolución) va en motivo_consulta. En exploracion_fisica solo va lo que el médico ENCONTRÓ al explorar (auscultación, palpación, inspección, hallazgos).
- Para números (peso, talla, temperatura, frecuencias, saturación, cintura) "valor" es el número tal como se dijo; presión como "sistólica/diastólica".
- grupo_sanguineo: solo si el médico lo dijo; "valor" en formato O+, O-, A+, A-, B+, B-, AB+ o AB-, y la "cita" incluye el tipo y el Rh tal como se dijeron ("tipo de sangre O positivo").
- escolaridad: solo si se dijo; "valor" es exactamente una de: Primaria, Secundaria, Preparatoria, Licenciatura trunca, Licenciatura terminada, Posgrado. "Licenciatura terminada" o "trunca" solo si el médico dijo si la terminó o no; si no lo dijo, no llenes escolaridad (deja la frase en sin_ubicar).
- Si el grupo sanguíneo o la escolaridad quedaron repartidos en dos partes del dictado, la "cita" son las dos partes literales separadas por " … " (por ejemplo: "estudió la licenciatura en derecho … sí terminó la licenciatura").
- Lo que el médico dijo y no encaja en ningún campo va en "sin_ubicar" (copiado literal). No lo inventes en otro campo.
- El médico no dicta en orden: puede empezar con el padecimiento, saltar a un antecedente y volver. Tu trabajo es justamente ESTRUCTURAR: cada fragmento a su campo; si un campo recibe varios fragmentos, devuelve una entrada por fragmento.
- RECETA: si el médico prescribe medicamentos ("le receto", "indico", "que tome", "le dejo"), llénalos en "medicamentos", cada dato con su cita literal: nombre, dosis, frecuencia (solo si la dijo: c4h/c6h/c8h/c12h/c24h/c48h/semanal/prn), vía (solo si la dijo), duración en días (solo si la dijo) e indicaciones. NUNCA completes una dosis, vía, frecuencia o duración que no se dijo: déjala fuera. Indicaciones generales para el paciente van en "receta_indicaciones"; la próxima cita en "proxima_cita". Lo que dijo del plan también va en plan_terapeutico.
- Usa la herramienta estructurar_dictado. Si no hay nada clínico que acomodar, devuélvela con campos vacíos.`;

function buildHerramientaEstructurarDictado() {
  return {
    name: 'estructurar_dictado',
    description: 'Acomoda lo dictado en campos de la ficha. Cada campo con su cita literal de la transcripción.',
    input_schema: {
      type: 'object',
      properties: {
        campos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              campo: { type: 'string', enum: Object.keys(CAMPOS_DICTADO) },
              valor: { type: ['string', 'number'] },
              cita: { type: 'string', description: 'Fragmento EXACTO, palabra por palabra, de la transcripción.' },
            },
            required: ['campo', 'valor', 'cita'],
          },
        },
        sin_ubicar: { type: 'array', items: { type: 'string' }, description: 'Fragmentos literales que no encajan en ningún campo.' },
        medicamentos: {
          type: 'array',
          description: 'Solo si el médico prescribió. Cada dato con su cita literal; omite lo que no dijo.',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'object', properties: { valor: { type: 'string' }, cita: { type: 'string' } }, required: ['valor', 'cita'] },
              dosis: { type: 'object', properties: { valor: { type: 'string' }, cita: { type: 'string' } }, required: ['valor', 'cita'] },
              frecuencia: { type: 'object', properties: { valor: { type: 'string', enum: Object.keys(FRECUENCIAS_DICTADO) }, cita: { type: 'string' } }, required: ['valor', 'cita'] },
              via: { type: 'object', properties: { valor: { type: 'string', enum: Object.keys(VIAS_DICTADO) }, cita: { type: 'string' } }, required: ['valor', 'cita'] },
              duracion_dias: { type: 'object', properties: { valor: { type: 'number' }, cita: { type: 'string' } }, required: ['valor', 'cita'] },
              indicaciones: { type: 'object', properties: { cita: { type: 'string' } }, required: ['cita'] },
            },
            required: ['nombre'],
          },
        },
        receta_indicaciones: { type: 'array', items: { type: 'string' }, description: 'Indicaciones generales para el paciente, copiadas literal.' },
        proxima_cita: { type: 'string', description: 'Cuándo volver, copiado literal, si lo dijo.' },
      },
      required: ['campos'],
    },
  };
}

// Llama al modelo con la herramienta estructurar_dictado y verifica su salida.
// Devuelve { ok: true, campos, detalle, descartados, sinUbicar, faltantes,
// receta } o { ok: false, status, error } con un mensaje para el médico.
async function estructurarDictado(texto) {
  const t = typeof texto === 'string' ? texto.trim() : '';
  if (!t) return { ok: false, status: 400, error: 'No llegó texto dictado.' };
  if (t.length > MAX_TEXTO_DICTADO) return { ok: false, status: 400, error: `El dictado es muy largo (máximo ${MAX_TEXTO_DICTADO} caracteres). Divídelo en partes.` };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      system: PROMPT_DICTADO,
      tools: [buildHerramientaEstructurarDictado()],
      tool_choice: { type: 'tool', name: 'estructurar_dictado' },
      messages: [{ role: 'user', content: `Transcripción del dictado:\n<dictado>\n${t}\n</dictado>` }],
    }),
  });
  if (!r.ok) {
    console.error('[dictado] Anthropic:', r.status, (await r.text()).slice(0, 300));
    return { ok: false, status: 502, error: 'NOVA no pudo procesar el dictado en este momento. Tu texto no se perdió: intenta de nuevo.' };
  }
  const data = await r.json();
  const tool = Array.isArray(data.content) ? data.content.find(b => b && b.type === 'tool_use' && b.name === 'estructurar_dictado') : null;
  if (!tool || data.stop_reason === 'max_tokens') {
    return { ok: false, status: 502, error: 'NOVA no terminó de procesar el dictado. Intenta con un fragmento más corto.' };
  }
  return { ok: true, transcripcion: t, ...procesarDictado(t, tool.input.campos, tool.input.sin_ubicar, tool.input) };
}

module.exports = {
  CAMPOS_DICTADO,
  MAX_TEXTO_DICTADO,
  normalizarDictado,
  numerosEnPalabras,
  procesarDictado,
  estructurarDictado,
};
