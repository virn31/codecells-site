// lib/motor-graficas.js
// Motor de gráficas configurable en SVG — agnóstico de especialidad. Antes
// vivía entre los marcadores MOTOR-GRAFICAS-START/END de portal-medico.html;
// se movió aquí sin cambiar comportamiento para que otras pantallas (kiosco,
// app del paciente) y las plantillas por especialidad puedan reutilizarlo
// (ver SPEC-FASE2-PLANTILLAS-ESPECIALIDAD.md).
//
// Script CLÁSICO (no módulo): sus funciones y constantes quedan como globales
// para el código inline del portal, igual que antes. En Node (pruebas) se
// exportan por module.exports. Nada aquí toca Airtable ni conoce ninguna
// especialidad: la configuración (zonas, clasificaciones, periodicidades)
// la pasa quien llama.

// Motor de gráficas configurable en SVG. Generaliza renderGraficaPeso sin
// cambiar de tecnología: emite los MISMOS elementos (<polyline>, <circle> con
// <title>) y las MISMAS clases (linea-guia, linea-meta, linea-peso,
// punto-inicio, punto-peso). Implementa dos primitivas: linea_zonas y
// multi_linea; las demás se registran como no implementadas y no dibujan.

// Paleta — SPEC-ESTETICA-GRAFICAS-VISME.md §1. Las gráficas se dibujan
// siempre sobre la tarjeta blanca (.grafica-contenedor), en cualquier tema
// del portal, así que el contraste se mide contra #FFFFFF.
//
// Zonas clínicas: conservan sus 4 categorías y su orden de severidad
// (RANGO_ZONA, semáforo); solo cambia el tono, tomado de "Estado/Alertas"
// del spec. Son bandas de fondo semitransparentes, nunca colorean la línea.
const COLOR_ZONA = {
  verde:    'rgba(16,185,129,0.12)',  // Éxito   #10B981
  amarillo: 'rgba(245,158,11,0.16)',  // Alerta  #F59E0B
  naranja:  'rgba(232,90,31,0.14)',   // naranja de serie 3 (ver abajo)
  rojo:     'rgba(239,68,68,0.14)',   // Crítico #EF4444
};
// Colores por serie, en orden (§1 "Colores por Serie"). Dos tonos del spec
// no alcanzan el 3:1 que el propio spec exige para gráficos (§8) sobre
// blanco y se oscurecieron lo mínimo: naranja #FF6B35 (2.84) → #E85A1F
// (3.55) y cian #06B6D4 (2.43) → #0891B2 (3.68). Lo vigila
// test/motor-graficas.test.js.
const COLOR_SERIE = ['#0066CC', '#00A86B', '#E85A1F', '#9333EA', '#EC4899', '#0891B2'];
// Lo que distingue a cada serie además del color (§8 "no confiar SOLO en
// color"): patrón de trazo y forma de marcador, en el mismo orden.
const TRAZO_SERIE = ['', '7 4', '2 4', '10 4 2 4', '4 3', '1 3'];
const MARCADOR_SERIE = ['circulo', 'cuadro', 'triangulo', 'rombo', 'circulo', 'cuadro'];

// Etiqueta de tooltip: si el punto trae `etiqueta` (texto ya formateado por
// quien arma la serie — ej. "31+3" para edad gestacional, cualquier otra
// convención para otro panel futuro), se usa tal cual y el motor no sabe ni
// le importa qué significa. Si no, cae al comportamiento original: `semana`
// (metadato de CONSULTAS) o la fecha.
function etiquetaPuntoGrafica(p) {
  if (p.etiqueta != null) return p.etiqueta;
  if (p.semana != null) return p.semana === 0 ? 'Inicio' : `Semana ${p.semana}`;
  return p.fecha || '';
}
// Etiqueta de eje: mismo passthrough que arriba; sin `etiqueta`, el PRIMER
// punto es "Inicio" por posición (índice) y el resto usa el número de
// semana. Sin `semana` tampoco, cae a la fecha o al ordinal.
function etiquetaEjeGrafica(p, i) {
  if (p.etiqueta != null) return p.etiqueta;
  if (p.semana != null) return i === 0 ? 'Inicio' : 'S' + p.semana;
  if (p.fecha) return p.fecha;
  return String(i + 1);
}

/**
 * Devuelve la zona en la que cae un valor, o null si ninguna aplica.
 * Reglas (no negociables — son la diferencia entre colorear bien y mentir):
 *  - Se evalúa de menor a mayor (orden por límite inferior); la PRIMERA
 *    coincidencia gana.
 *  - `min` ausente = sin límite inferior; `max` ausente = sin límite superior.
 *  - Ambos límites son INCLUSIVOS (valor >= min y valor <= max). El catálogo
 *    deja huecos de 0.1 entre zonas, así que no hay solape en los bordes:
 *    hba1c 6.4 → amarillo, 6.5 → rojo.
 *  - zonas vacías/no-array o valor null/undefined → null (sin zona), nunca error.
 * @param {number} valor
 * @param {Array}  zonas  [{min?, max?, color}]
 * @returns {Object|null} la zona coincidente (con su color) o null
 */
function evaluarZona(valor, zonas) {
  if (valor == null || !Array.isArray(zonas) || !zonas.length) return null;
  const ordenadas = zonas.slice().sort((a, b) =>
    ((a.min != null ? a.min : -Infinity) - (b.min != null ? b.min : -Infinity)) ||
    ((a.max != null ? a.max : Infinity) - (b.max != null ? b.max : Infinity))
  );
  for (const z of ordenadas) {
    const bajoOk = z.min == null || valor >= z.min;
    const altoOk = z.max == null || valor <= z.max;
    if (bajoOk && altoOk) return z;
  }
  return null;
}

// Rango de severidad de una zona — orden fijo, independiente del dominio.
// Se usa para decidir "¿empeoró o mejoró?" comparando RANGOS de zona entre
// dos valores, nunca "¿subió o bajó?": así un parámetro donde bajar es malo
// (hemoglobina) y uno donde subir es malo (glucosa) se comparan igual, sin
// que este archivo necesite saber cuál es cuál.
const RANGO_ZONA = { verde: 0, amarillo: 1, naranja: 2, rojo: 3 };

// Compara dos valores contra las mismas `zonas` y dice si la situación
// mejoró, empeoró o se mantuvo — sin asumir dirección. 100% genérico,
// reutilizable por cualquier panel que necesite una flecha de tendencia.
function compararZonas(valorActual, valorPrevio, zonas) {
  const zActual = evaluarZona(valorActual, zonas);
  const zPrevio = valorPrevio != null ? evaluarZona(valorPrevio, zonas) : null;
  const rActual = zActual ? RANGO_ZONA[zActual.color] : -1;
  const rPrevio = zPrevio ? RANGO_ZONA[zPrevio.color] : -1;
  const tendencia = valorPrevio == null ? null : (rActual > rPrevio ? 'empeora' : rActual < rPrevio ? 'mejora' : 'igual');
  const direccion = valorPrevio == null ? null : (valorActual > valorPrevio ? 'up' : valorActual < valorPrevio ? 'down' : 'flat');
  return { zona: zActual, tendencia, direccion, delta: valorPrevio != null ? +(valorActual - valorPrevio).toFixed(2) : null };
}

// Convierte un array de zonas en una cita de texto legible, ej.
// "rojo ≥ 140 · amarillo 120–139 · verde ≤ 119 mmHg". No fabrica umbrales:
// solo describe los que ya están configurados en el catálogo.
function describirZonas(zonas, unidad) {
  if (!Array.isArray(zonas) || !zonas.length) return null;
  const ordenPrioridad = { rojo: 0, naranja: 1, amarillo: 2, verde: 3 };
  const ordenadas = zonas.slice().sort((a, b) => (ordenPrioridad[a.color] ?? 9) - (ordenPrioridad[b.color] ?? 9));
  return ordenadas.map(z => {
    let rango;
    if (z.min != null && z.max != null) rango = `${z.min}–${z.max}`;
    else if (z.min != null) rango = `≥ ${z.min}`;
    else if (z.max != null) rango = `≤ ${z.max}`;
    else rango = '';
    return `${z.color} ${rango}`;
  }).join(' · ') + (unidad ? ` ${unidad}` : '');
}

// Reglas de CAMBIO entre dos mediciones — complemento de evaluarZona, no un
// reemplazo: un valor puede estar en zona verde (dentro de rango normal) y
// AUN ASÍ disparar alerta si cambió demasiado rápido ("cambio de
// trayectoria"). 100% agnóstico del dominio — sirve igual para un percentil
// fetal, un parámetro metabólico o un seguimiento posoperatorio; lo único
// que cambia entre esos casos es la configuración en el catálogo, nunca
// este código. `reglas`: [{tipo:'caida'|'ascenso', magnitudMinima, ventana, color}].
function evaluarTendencia(valorActual, valorPrevio, reglas) {
  if (valorPrevio == null || !Array.isArray(reglas) || !reglas.length) return null;
  const delta = valorActual - valorPrevio;
  for (const r of reglas) {
    // 'ventana' hoy solo soporta "consecutiva" (el punto inmediato
    // anterior). Cualquier otro valor se ignora a propósito — no se adivina
    // una ventana de tiempo que todavía no está implementada.
    if (r.ventana && r.ventana !== 'consecutiva') continue;
    const magnitud = Math.abs(delta);
    if (magnitud < (r.magnitudMinima || 0)) continue;
    if ((r.tipo === 'caida' && delta < 0) || (r.tipo === 'ascenso' && delta > 0)) {
      return { color: r.color, tipo: r.tipo, magnitud: +magnitud.toFixed(2) };
    }
  }
  return null;
}

// ─── MOTOR GENÉRICO DE ANTECEDENTES (eventos clínicos por paciente) ──────
// Mismo principio que evaluarZona/evaluarTendencia: el motor no sabe nada de
// obstetricia ni de ninguna especialidad — solo cuenta eventos según una
// clasificación que le pasan, y evalúa vigencia de un estudio periódico
// contra una periodicidad que le pasan. La clasificación obstétrica
// (GO_CLASIFICACION_EVENTO) y la periodicidad de estudios ginecológicos
// (GO_PERIODICIDAD_ESTUDIOS) viven junto a PN_RIESGOS — son configuración de
// ESTA especialidad, no del motor. El mismo par de funciones sirve, por
// ejemplo, para antecedentes quirúrgicos de otra especialidad con su propio
// mapa de clasificación y su propia tabla de periodicidad.

// Fórmula obstétrica G/P/C/A: G = gestas previas (partos + pérdidas) + 1 si
// hay embarazo actual; P = partos; C = cesáreas (subconjunto de partos);
// A = pérdidas gestacionales. `eventosPrevios` es un arreglo de valores de
// "Tipo de evento"; `clasificacion` trae los tres Set que deciden a qué
// contador suma cada tipo.
function calcularFormulaEventos(eventosPrevios, hayEventoActual, clasificacion) {
  const { tiposParto, tiposCesarea, tiposAborto } = clasificacion;
  let P = 0, C = 0, A = 0, gestasPrevias = 0;
  eventosPrevios.forEach(tipo => {
    const esParto = tiposParto.has(tipo);
    const esAborto = tiposAborto.has(tipo);
    if (esParto) P++;
    if (tiposCesarea.has(tipo)) C++;
    if (esAborto) A++;
    if (esParto || esAborto) gestasPrevias++;
  });
  return { G: gestasPrevias + (hayEventoActual ? 1 : 0), P, C, A };
}

// Vigencia de un estudio de vigilancia periódica: meses transcurridos desde
// `fechaEvento` y si ya superó `mesesVigencia`. Sin periodicidad configurada
// (`mesesVigencia` no numérico) se devuelven los meses igual, pero `vencido`
// queda `null` — no se adivina un umbral que nadie capturó.
function evaluarVigenciaEstudio(fechaEvento, mesesVigencia, hastaFecha) {
  if (!fechaEvento) return null;
  const fEvento = new Date(fechaEvento.slice(0, 10) + 'T00:00:00');
  const fRef = hastaFecha ? new Date(hastaFecha.slice(0, 10) + 'T00:00:00') : new Date();
  const meses = (fRef - fEvento) / (1000 * 60 * 60 * 24 * 30.4375);
  return {
    mesesTranscurridos: Math.floor(meses),
    vencido: typeof mesesVigencia === 'number' ? meses > mesesVigencia : null,
  };
}

// Intervalo, en meses, entre un evento (normalmente el último parto/pérdida)
// y una fecha de referencia (normalmente la FUM del embarazo actual).
function calcularIntervaloMeses(fechaEvento, fechaReferencia) {
  if (!fechaEvento || !fechaReferencia) return null;
  const a = new Date(fechaEvento.slice(0, 10) + 'T00:00:00');
  const b = new Date(fechaReferencia.slice(0, 10) + 'T00:00:00');
  return Math.round((b - a) / (1000 * 60 * 60 * 24 * 30.4375));
}

/**
 * Dibuja una gráfica en un <svg viewBox="0 0 560 200">. La estética sigue
 * SPEC-ESTETICA-GRAFICAS-VISME.md: el PADRE DIRECTO del <svg> se vuelve la
 * tarjeta (.grafica-contenedor) y recibe leyenda y tooltip; los estilos se
 * inyectan una sola vez (asegurarEstilosMotor), así cualquier pantalla que
 * use el motor los obtiene sin tocar su CSS.
 *
 * Los DATOS no cambian respecto a la versión anterior: mismo dominio Y
 * (holgura ±1), misma escala X, mismas zonas y línea de referencia. Lo que
 * cambia es solo cómo se dibuja.
 *
 * @param {Object}     config
 * @param {SVGElement} config.svg                 <svg viewBox="0 0 560 200">
 * @param {string}     config.tipo                linea_zonas | multi_linea | (otras: no impl)
 * @param {string}     [config.escalaX='indice']  'indice' | 'fecha'
 * @param {Array}      config.series              [{codigo,nombre,unidad,decimales,puntos:[{fecha,valor,semana?,etiqueta?}]}]
 * @param {Array}      [config.zonas=[]]          [{min?,max?,color}] (solo linea_zonas)
 * @param {number}     [config.lineaReferencia]   línea horizontal opcional (clase linea-meta)
 * @param {string}     [config.titulo]            título dentro de la tarjeta (opcional)
 */
function renderGrafica(config) {
  const svg = config && config.svg;
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '';

  const tipo = config.tipo;
  if (tipo !== 'linea_zonas' && tipo !== 'multi_linea') {
    console.warn(`[motor-graficas] tipo no implementado: ${tipo}`);
    return;
  }

  const cont = prepararContenedorGrafica(svg, config);
  const escalaX = config.escalaX || 'indice';
  const series = (config.series || []).filter(s => s && s.puntos && s.puntos.length);
  if (!series.length) {
    // Sin datos se muestra vacío (CLAUDE.md §6): ni leyenda ni puntos inventados.
    renderLeyendaGrafica(cont, null);
    svg.__datosTooltip = null;
    return;
  }

  const W = 560;
  const zonas = (tipo === 'linea_zonas' && Array.isArray(config.zonas)) ? config.zonas : [];
  const unidadEje = series[0].unidad || '';
  // La leyenda va ANTES de medir: en escritorio ocupa una columna a la
  // derecha y cambia el ancho del <svg>.
  renderLeyendaGrafica(cont, { series, zonas, lineaReferencia: config.lineaReferencia, unidad: unidadEje });

  // Los tamaños del spec están en px de pantalla; el SVG escala con su ancho
  // (viewBox fijo, height:auto). `u` convierte px → unidades del viewBox.
  // Si la gráfica está oculta (ancho 0) se dibuja a escala 1 y el
  // ResizeObserver la redibuja al mostrarse.
  const anchoReal = svg.getBoundingClientRect().width || W;
  svg.__anchoGrafica = Math.round(anchoReal);
  // En pantallas angostas (celular) la proporción 560×200 deja la gráfica
  // en ~100 px de alto; se usa un viewBox más alto. El ancho lógico (560)
  // no cambia, así que el resto de los cálculos se mantienen.
  const H = anchoReal < 480 ? 300 : 200;
  if (svg.getAttribute('viewBox') !== `0 0 ${W} ${H}`) svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const u = W / anchoReal;
  const movil = typeof window !== 'undefined' && window.innerWidth < 640;
  const fsEje = (movil ? 10 : 12) * u;

  // Dominio Y sobre todos los puntos de todas las series (holgura ±1, igual
  // que la curva original).
  const valores = series.reduce((acc, s) => acc.concat(s.puntos.map(p => p.valor)), []);
  const minY = Math.floor(Math.min(...valores)) - 1;
  const maxY = Math.ceil(Math.max(...valores)) + 1;

  // Marcas del eje Y: los extremos (como antes) + dos intermedias para la
  // cuadrícula. Son la escala del eje, no datos.
  // Intermedias en números redondos (paso 1-2-2.5-5 × 10ⁿ), no en tercios
  // exactos del rango: "1000 g" se lee; "1100.3 g" no.
  const pasoRedondo = bruto => {
    const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    const f = bruto / pot;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pot;
  };
  const paso = pasoRedondo((maxY - minY) / 3);
  const intermedias = [];
  for (let v = Math.ceil((minY + paso * 0.5) / paso) * paso; v <= maxY - paso * 0.5; v += paso) intermedias.push(+v.toFixed(6));
  const marcasY = [minY].concat(intermedias, [maxY]);
  const decPaso = paso >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(paso)));
  const textoMarca = (val, k) => (k === 0 || k === marcasY.length - 1 ? String(val) : val.toFixed(decPaso)) + (unidadEje ? ' ' + unidadEje : '');
  const anchoTexto = txt => txt.length * fsEje * 0.6;

  const ML = Math.max(40, Math.ceil(Math.max(...marcasY.map((v, k) => anchoTexto(textoMarca(v, k)))) + 10 * u));
  const MR = 12;
  const MT = Math.max(15, fsEje * 0.8 + 4 * u);
  const MB = Math.max(25, fsEje + 14 * u);
  const plotW = W - ML - MR, plotH = H - MT - MB;
  const y = val => MT + (1 - (val - minY) / (maxY - minY)) * plotH;
  // Una marca intermedia solo se dibuja si no se encima con la vecina
  // (1.4 renglones); los extremos siempre.
  const minSep = fsEje * 1.4;
  const marcasVisibles = [];
  marcasY.forEach((v, k) => {
    if (k === 0 || k === marcasY.length - 1) { marcasVisibles.push({ v, k }); return; }
    const previo = marcasVisibles[marcasVisibles.length - 1];
    if (Math.abs(y(v) - y(previo.v)) >= minSep && Math.abs(y(maxY) - y(v)) >= minSep) marcasVisibles.push({ v, k });
  });

  // Dominio X. 'indice' = posición por índice dentro de la serie (comporta-
  // miento original). 'fecha' = proporcional al tiempo real, compartido.
  let tMin, tMax;
  if (escalaX === 'fecha') {
    const tiempos = series
      .reduce((acc, s) => acc.concat(s.puntos.map(p => (p.fecha ? new Date(p.fecha).getTime() : NaN))), [])
      .filter(t => !isNaN(t));
    tMin = Math.min(...tiempos);
    tMax = Math.max(...tiempos);
  }
  const xDe = (p, i, n) => {
    if (escalaX === 'fecha') {
      const t = p.fecha ? new Date(p.fecha).getTime() : tMin;
      return tMax > tMin ? ML + ((t - tMin) / (tMax - tMin)) * plotW : ML;
    }
    return n > 1 ? ML + (i / (n - 1)) * plotW : ML;
  };

  const el = (nombre, attrs) => {
    const nodo = document.createElementNS(NS, nombre);
    Object.keys(attrs || {}).forEach(k => nodo.setAttribute(k, attrs[k]));
    return nodo;
  };

  // Descripción para lectores de pantalla (§8 ARIA). El aria-label del <svg>
  // lo pone quien arma la pantalla; aquí van los valores.
  const desc = el('desc');
  desc.textContent = series.map(s => {
    const dec = typeof s.decimales === 'number' ? s.decimales : 0;
    return `${s.nombre || s.codigo || 'Serie'}${s.unidad ? ' (' + s.unidad + ')' : ''}: ` +
      s.puntos.map(p => `${etiquetaPuntoGrafica(p)} ${p.valor.toFixed(dec)}`).join('; ');
  }).join('. ');
  svg.appendChild(desc);

  // Bandas de zona (solo linea_zonas y solo si hay zonas). Fondo semitranspa-
  // rente, dibujadas primero para quedar detrás. peso llega con zonas=[] → nada.
  zonas.forEach(z => {
    const yTop = y(z.max != null ? z.max : maxY);
    const yBot = y(z.min != null ? z.min : minY);
    svg.appendChild(el('rect', {
      x: ML, y: Math.min(yTop, yBot), width: plotW, height: Math.abs(yBot - yTop),
      fill: COLOR_ZONA[z.color] || 'rgba(107,114,128,0.10)', class: 'grafica-zona',
    }));
  });

  // Cuadrícula punteada + valores del eje Y.
  marcasVisibles.forEach(({ v: val, k }) => {
    svg.appendChild(el('line', { x1: ML, x2: W - MR, y1: y(val), y2: y(val), class: 'linea-guia grafica-grid' }));
    const texto = el('text', { x: ML - 6 * u, y: y(val) + fsEje * 0.35, 'text-anchor': 'end', style: `font-size:${fsEje}px`, class: 'grafica-eje-texto' });
    texto.textContent = textoMarca(val, k);
    svg.appendChild(texto);
  });
  // Ejes principales.
  svg.appendChild(el('line', { x1: ML, x2: ML, y1: MT, y2: MT + plotH, class: 'grafica-eje' }));
  svg.appendChild(el('line', { x1: ML, x2: W - MR, y1: MT + plotH, y2: MT + plotH, class: 'grafica-eje' }));

  // Línea de referencia opcional (generaliza metaKg; lo necesita control prenatal).
  if (config.lineaReferencia != null) {
    const yr = y(config.lineaReferencia);
    svg.appendChild(el('line', { x1: ML, x2: W - MR, y1: yr, y2: yr, class: 'linea-meta grafica-referencia' }));
  }

  // Coordenadas de cada punto, compartidas por líneas, marcadores y tooltip.
  const claveDe = (p, i) => (p.fecha ? 'f' + String(p.fecha).slice(0, 10) : (p.etiqueta != null ? 'e' + p.etiqueta : 'i' + i));
  const coords = series.map(s => s.puntos.map((p, i) => ({ p, i, cx: xDe(p, i, s.puntos.length), cy: y(p.valor), clave: claveDe(p, i) })));

  // Área bajo la línea (§9), solo con una serie y sin zonas: con varias series
  // o con bandas de zona el relleno taparía información.
  if (series.length === 1 && !zonas.length && coords[0].length > 1) {
    const c0 = coords[0];
    const base = MT + plotH;
    const area = el('polygon', {
      points: [`${c0[0].cx},${base}`].concat(c0.map(c => `${c.cx},${c.cy}`), [`${c0[c0.length - 1].cx},${base}`]).join(' '),
      class: 'grafica-area',
    });
    area.setAttribute('style', 'fill: var(--grafica-serie-1)');
    svg.appendChild(area);
  }

  // Polilíneas: color + patrón de trazo por serie (no solo color, §8).
  series.forEach((s, si) => {
    const n = (si % COLOR_SERIE.length) + 1;
    const poly = el('polyline', {
      points: coords[si].map(c => `${c.cx},${c.cy}`).join(' '),
      class: `linea-peso grafica-linea grafica-serie-${n}`,
      'data-s': si,
    });
    if (TRAZO_SERIE[si % TRAZO_SERIE.length]) poly.setAttribute('stroke-dasharray', TRAZO_SERIE[si % TRAZO_SERIE.length]);
    svg.appendChild(poly);
  });

  // Marcadores (forma distinta por serie) + etiquetas del eje X desde la
  // serie de referencia (la más larga). Si no caben, se muestran salteadas;
  // los puntos siempre se dibujan todos.
  const r = 4 * u;
  const refIdx = series.reduce((best, s, idx, arr) => (s.puntos.length > arr[best].puntos.length ? idx : best), 0);
  series.forEach((s, si) => {
    const n = (si % COLOR_SERIE.length) + 1;
    const dec = typeof s.decimales === 'number' ? s.decimales : 0;
    const unidad = s.unidad || '';
    coords[si].forEach(c => {
      const marcador = crearMarcadorGrafica(el, MARCADOR_SERIE[si % MARCADOR_SERIE.length], c.cx, c.cy, r);
      marcador.setAttribute('class', `grafica-punto grafica-serie-${n} ${c.i === 0 ? 'punto-inicio grafica-punto-inicio' : 'punto-peso'}`);
      marcador.setAttribute('data-s', si);
      marcador.setAttribute('data-i', c.i);
      marcador.setAttribute('tabindex', '0');
      marcador.setAttribute('aria-label', `${s.nombre || s.codigo || 'Serie'}, ${etiquetaPuntoGrafica(c.p)}: ${c.p.valor.toFixed(dec)} ${unidad}`.trim());
      svg.appendChild(marcador);
    });
  });

  const etiquetasX = coords[refIdx].map(c => etiquetaEjeGrafica(c.p, c.i));
  const anchoEtiquetas = etiquetasX.reduce((acc, t) => acc + anchoTexto(String(t)) + 8 * u, 0);
  const salto = Math.max(1, Math.ceil(anchoEtiquetas / plotW));
  coords[refIdx].forEach((c, k) => {
    const ultimo = k === coords[refIdx].length - 1;
    if (k % salto !== 0 && !ultimo) return;
    const etiqueta = el('text', { x: c.cx, y: MT + plotH + 8 * u + fsEje * 0.8, 'text-anchor': 'middle', style: `font-size:${fsEje}px`, class: 'grafica-eje-texto' });
    etiqueta.textContent = etiquetasX[k];
    svg.appendChild(etiqueta);
  });

  // Animación de entrada (§6, 300 ms) solo la primera vez que se dibuja ESTA
  // configuración —no en cada redibujo por cambio de tamaño—, solo con la
  // página visible y sin "movimiento reducido". Con Web Animations el
  // elemento conserva su opacidad normal al terminar o si nunca corre: no
  // puede quedarse congelado invisible (lo que pasaba con una clase CSS
  // cuando la gráfica se dibujaba en una pestaña oculta).
  const animar = svg.__configAnimada !== config &&
    document.visibilityState === 'visible' &&
    !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  svg.__configAnimada = config;
  if (animar) {
    svg.querySelectorAll('.grafica-linea, .grafica-punto, .grafica-area').forEach(n => {
      if (n.animate) n.animate([{ opacity: 0 }, { opacity: getComputedStyle(n).opacity }], { duration: 300, easing: 'ease-out' });
    });
  }

  // Datos para el tooltip: por punto, y agrupados por clave (misma fecha /
  // etiqueta) para mostrar todos los valores alineados (§9).
  const grupos = {};
  coords.forEach((lista, si) => lista.forEach(c => { (grupos[c.clave] = grupos[c.clave] || []).push({ ...c, si }); }));
  svg.__datosTooltip = { series, coords, grupos };

  instalarInteraccionGrafica(svg, cont);
}

// ─── Estética (SPEC-ESTETICA-GRAFICAS-VISME.md) ───────────────────────────

function crearMarcadorGrafica(el, forma, cx, cy, r) {
  if (forma === 'cuadro') {
    return el('rect', { x: cx - r * 0.9, y: cy - r * 0.9, width: r * 1.8, height: r * 1.8, rx: r * 0.2 });
  }
  if (forma === 'triangulo') {
    return el('polygon', { points: `${cx},${cy - r * 1.15} ${cx + r * 1.05},${cy + r * 0.85} ${cx - r * 1.05},${cy + r * 0.85}` });
  }
  if (forma === 'rombo') {
    return el('polygon', { points: `${cx},${cy - r * 1.25} ${cx + r * 1.25},${cy} ${cx},${cy + r * 1.25} ${cx - r * 1.25},${cy}` });
  }
  return el('circle', { cx, cy, r });
}

// El padre directo del <svg> es la tarjeta. Se marca con clases (no se
// reemplaza ni se envuelve: el resto de la pantalla sigue encontrando el
// <svg> donde estaba) y se observa su ancho para redibujar (§7 responsive).
function prepararContenedorGrafica(svg, config) {
  asegurarEstilosMotor();
  svg.classList.add('grafica-svg');
  svg.__configGrafica = config;
  const cont = svg.parentElement;
  if (!cont) return null;
  cont.classList.add('grafica-contenedor', 'grafica-motor');

  let titulo = cont.querySelector(':scope > .grafica-titulo');
  if (config.titulo) {
    if (!titulo) {
      titulo = document.createElement('h3');
      titulo.className = 'grafica-titulo';
      cont.insertBefore(titulo, cont.firstChild);
    }
    titulo.textContent = config.titulo;
  } else if (titulo) {
    titulo.remove();
  }

  // Se observa la TARJETA, no el <svg>: para un elemento SVG, ResizeObserver
  // reporta la caja de su dibujo en unidades del viewBox, no su ancho en
  // pantalla. El ancho que importa se mide siempre del <svg>. Redibujo con
  // setTimeout (no requestAnimationFrame, que se pausa en pestañas ocultas).
  svg.__anchoGrafica = Math.round(svg.getBoundingClientRect().width);
  if (!svg.__observadorGrafica && typeof ResizeObserver !== 'undefined') {
    svg.__observadorGrafica = new ResizeObserver(() => {
      const ancho = Math.round(svg.getBoundingClientRect().width);
      if (!ancho || Math.abs(ancho - svg.__anchoGrafica) <= 1) return;
      clearTimeout(svg.__temporizadorGrafica);
      svg.__temporizadorGrafica = setTimeout(() => {
        if (svg.__configGrafica && svg.isConnected) renderGrafica(svg.__configGrafica);
      }, 30);
    });
    svg.__observadorGrafica.observe(cont);
  }
  return cont;
}

// Leyenda (§5): series con su color, trazo y marcador; zonas con su rango;
// línea de referencia. `datos` null = sin datos → se quita la leyenda.
function renderLeyendaGrafica(cont, datos) {
  if (!cont) return;
  let ley = cont.querySelector(':scope > .grafica-leyenda');
  if (!datos) { if (ley) ley.remove(); return; }
  if (!ley) {
    ley = document.createElement('div');
    ley.className = 'grafica-leyenda';
    cont.appendChild(ley);
  }
  ley.textContent = '';
  const NS = 'http://www.w3.org/2000/svg';
  const item = (muestra, texto) => {
    const span = document.createElement('span');
    span.className = 'grafica-leyenda-item';
    span.appendChild(muestra);
    const t = document.createElement('span');
    t.textContent = texto;
    span.appendChild(t);
    ley.appendChild(span);
  };
  const muestraLinea = (claseSerie, trazo, forma) => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 12');
    s.setAttribute('class', 'grafica-leyenda-muestra');
    s.setAttribute('aria-hidden', 'true');
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', 1); l.setAttribute('x2', 23); l.setAttribute('y1', 6); l.setAttribute('y2', 6);
    l.setAttribute('class', `grafica-linea ${claseSerie}`);
    if (trazo) l.setAttribute('stroke-dasharray', trazo);
    s.appendChild(l);
    if (forma) {
      const el = (nombre, attrs) => { const n = document.createElementNS(NS, nombre); Object.keys(attrs).forEach(k => n.setAttribute(k, attrs[k])); return n; };
      const m = crearMarcadorGrafica(el, forma, 12, 6, 3);
      m.setAttribute('class', `grafica-punto-leyenda ${claseSerie}`);
      s.appendChild(m);
    }
    return s;
  };

  datos.series.forEach((s, si) => {
    const n = (si % COLOR_SERIE.length) + 1;
    item(
      muestraLinea(`grafica-serie-${n}`, TRAZO_SERIE[si % TRAZO_SERIE.length], MARCADOR_SERIE[si % MARCADOR_SERIE.length]),
      `${s.nombre || s.codigo || 'Serie ' + n}${s.unidad ? ' (' + s.unidad + ')' : ''}`
    );
  });

  // Zonas: solo describe los umbrales configurados en el catálogo, no inventa.
  const nombreZona = { verde: 'Verde', amarillo: 'Amarillo', naranja: 'Naranja', rojo: 'Rojo' };
  datos.zonas.forEach(z => {
    const caja = document.createElement('span');
    caja.className = 'grafica-leyenda-caja';
    caja.style.background = COLOR_ZONA[z.color] || 'rgba(107,114,128,0.10)';
    let rango = '';
    if (z.min != null && z.max != null) rango = `${z.min}–${z.max}`;
    else if (z.min != null) rango = `≥ ${z.min}`;
    else if (z.max != null) rango = `≤ ${z.max}`;
    item(caja, `${nombreZona[z.color] || z.color} ${rango}${datos.unidad ? ' ' + datos.unidad : ''}`.trim());
  });

  if (datos.lineaReferencia != null) {
    item(muestraLinea('grafica-referencia', '6 4', null), `Referencia: ${datos.lineaReferencia}${datos.unidad ? ' ' + datos.unidad : ''}`);
  }
}

// Tooltip (§5): ratón (hover), toque (tap) y teclado (foco en el punto).
function instalarInteraccionGrafica(svg, cont) {
  if (!cont || svg.__interaccionGrafica) return;
  svg.__interaccionGrafica = true;
  const puntoDe = ev => (ev.target && ev.target.closest ? ev.target.closest('.grafica-punto') : null);
  svg.addEventListener('pointerover', ev => { const p = puntoDe(ev); if (p) mostrarTooltipGrafica(svg, cont, p); });
  svg.addEventListener('pointerout', ev => {
    if (ev.pointerType === 'touch') return; // en táctil se cierra con el siguiente toque
    const p = puntoDe(ev);
    const hacia = ev.relatedTarget && ev.relatedTarget.closest ? ev.relatedTarget.closest('.grafica-punto') : null;
    if (p && !hacia) ocultarTooltipGrafica(svg, cont);
  });
  svg.addEventListener('pointerdown', ev => {
    const p = puntoDe(ev);
    if (p) mostrarTooltipGrafica(svg, cont, p); else ocultarTooltipGrafica(svg, cont);
  });
  svg.addEventListener('focusin', ev => { const p = puntoDe(ev); if (p) mostrarTooltipGrafica(svg, cont, p); });
  svg.addEventListener('focusout', () => ocultarTooltipGrafica(svg, cont));
  svg.addEventListener('keydown', ev => { if (ev.key === 'Escape') ocultarTooltipGrafica(svg, cont); });
  document.addEventListener('pointerdown', ev => { if (!svg.contains(ev.target)) ocultarTooltipGrafica(svg, cont); });
}

function mostrarTooltipGrafica(svg, cont, nodo) {
  const datos = svg.__datosTooltip;
  if (!datos) return;
  const si = Number(nodo.getAttribute('data-s'));
  const i = Number(nodo.getAttribute('data-i'));
  const ref = datos.coords[si] && datos.coords[si].find(c => c.i === i);
  if (!ref) return;
  const grupo = datos.grupos[ref.clave] || [{ ...ref, si }];

  let tip = cont.querySelector(':scope > .grafica-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'grafica-tooltip';
    tip.setAttribute('role', 'tooltip');
    cont.appendChild(tip);
  }
  tip.textContent = '';
  const titulo = document.createElement('div');
  titulo.className = 'grafica-tooltip-titulo';
  titulo.textContent = etiquetaPuntoGrafica(ref.p);
  tip.appendChild(titulo);
  grupo.forEach(g => {
    const s = datos.series[g.si];
    const dec = typeof s.decimales === 'number' ? s.decimales : 0;
    const fila = document.createElement('div');
    fila.className = 'grafica-tooltip-fila';
    const caja = document.createElement('span');
    caja.className = 'grafica-tooltip-caja';
    caja.style.background = COLOR_SERIE[g.si % COLOR_SERIE.length];
    const nombre = document.createElement('span');
    nombre.textContent = (s.nombre || s.codigo || 'Serie') + ':';
    const valor = document.createElement('span');
    valor.className = 'grafica-tooltip-valor';
    valor.textContent = `${g.p.valor.toFixed(dec)}${s.unidad ? ' ' + s.unidad : ''}`;
    fila.appendChild(caja); fila.appendChild(nombre); fila.appendChild(valor);
    tip.appendChild(fila);
  });

  // Posición: sobre el punto, sin salirse de la tarjeta; si no cabe arriba,
  // abajo (con la punta invertida).
  const rs = svg.getBoundingClientRect();
  const rc = cont.getBoundingClientRect();
  const esc = rs.width / 560;
  const px = rs.left - rc.left + ref.cx * esc;
  const py = rs.top - rc.top + ref.cy * esc;
  tip.classList.add('visible');
  const mitad = tip.offsetWidth / 2;
  const izquierda = Math.min(Math.max(px, mitad + 4), rc.width - mitad - 4);
  const abajo = py - tip.offsetHeight - 14 < 0;
  tip.classList.toggle('grafica-tooltip-abajo', abajo);
  tip.style.left = izquierda + 'px';
  tip.style.top = (abajo ? py + 10 : py - 10) + 'px';
  tip.style.setProperty('--punta-x', (px - izquierda + mitad) + 'px');

  const series = new Set(grupo.map(g => g.si));
  svg.querySelectorAll('.grafica-linea, .grafica-punto').forEach(n => {
    n.classList.toggle('grafica-inactiva', !series.has(Number(n.getAttribute('data-s'))));
    n.classList.remove('grafica-activo');
  });
  nodo.classList.add('grafica-activo');
}

function ocultarTooltipGrafica(svg, cont) {
  const tip = cont.querySelector(':scope > .grafica-tooltip');
  if (tip) tip.classList.remove('visible');
  svg.querySelectorAll('.grafica-inactiva, .grafica-activo').forEach(n => n.classList.remove('grafica-inactiva', 'grafica-activo'));
}

// Estilos del motor, una sola vez por página. Las variables del spec (§10)
// se declaran en la tarjeta y no en :root, para no pisar las variables de
// tema de la pantalla anfitriona (el portal tiene su propio :root).
function asegurarEstilosMotor() {
  if (typeof document === 'undefined' || document.getElementById('motor-graficas-estilos')) return;
  if (!document.getElementById('motor-graficas-fuente')) {
    const fuente = document.createElement('link');
    fuente.id = 'motor-graficas-fuente';
    fuente.rel = 'stylesheet';
    fuente.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(fuente);
  }
  const estilo = document.createElement('style');
  estilo.id = 'motor-graficas-estilos';
  estilo.textContent = `
.grafica-contenedor.grafica-motor {
  --color-primary: #0066CC; --color-secondary: #00A86B; --color-alert: #FF6B35;
  --color-text-primary: #1F2937; --color-text-secondary: #6B7280;
  --color-border: #D1D5DB; --color-grid: #E5E7EB; --color-bg-secondary: #F9FAFB;
  --font-family: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-size-title: 18px; --spacing-base: 4px; --border-radius: 8px;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1); --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
  ${COLOR_SERIE.map((c, i) => `--grafica-serie-${i + 1}: ${c};`).join(' ')}
  position: relative;
  background: #FFFFFF;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: 24px 20px;
  box-shadow: var(--shadow-sm);
  font-family: var(--font-family);
  transition: box-shadow 200ms ease-in-out;
}
.grafica-contenedor.grafica-motor:hover { box-shadow: var(--shadow-md); }
.grafica-motor .grafica-titulo { margin: 0 0 12px; font-size: var(--font-size-title); font-weight: 700; line-height: 1.4; color: var(--color-text-primary); }
.grafica-motor .grafica-svg { display: block; width: 100%; height: auto; overflow: visible; }
.grafica-motor .grafica-svg text { font-family: var(--font-family); font-weight: 400; fill: var(--color-text-secondary); }
.grafica-motor .grafica-svg .grafica-eje { stroke: var(--color-border); stroke-width: 1px; vector-effect: non-scaling-stroke; }
.grafica-motor .grafica-svg .grafica-grid { stroke: var(--color-grid); stroke-width: 1px; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; }
.grafica-motor .grafica-svg .grafica-referencia { stroke: var(--color-text-secondary); stroke-width: 1.5px; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }
.grafica-motor .grafica-svg .grafica-area { opacity: 0.1; stroke: none; }
.grafica-motor .grafica-linea { fill: none; stroke-width: 2.5px; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; transition: opacity 150ms ease-in-out; }
.grafica-motor .grafica-svg .grafica-punto { stroke-width: 2px; vector-effect: non-scaling-stroke; cursor: pointer; outline: none; transform-box: fill-box; transform-origin: center; transition: transform 150ms ease-in-out, opacity 150ms ease-in-out; }
.grafica-motor .grafica-svg .grafica-punto:hover,
.grafica-motor .grafica-svg .grafica-punto:focus-visible,
.grafica-motor .grafica-svg .grafica-punto.grafica-activo { transform: scale(1.5); }
${COLOR_SERIE.map((c, i) => `.grafica-motor .grafica-serie-${i + 1} { stroke: var(--grafica-serie-${i + 1}); fill: var(--grafica-serie-${i + 1}); }
.grafica-motor .grafica-linea.grafica-serie-${i + 1} { fill: none; }`).join('\n')}
.grafica-motor .grafica-svg .grafica-punto.grafica-punto-inicio { fill: #FFFFFF; }
.grafica-motor .grafica-svg .grafica-punto:focus-visible { stroke: var(--color-text-primary); }
.grafica-motor .grafica-svg .grafica-inactiva { opacity: 0.8; }
.grafica-motor .grafica-leyenda { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 16px; font-size: 11px; line-height: 1.4; color: var(--color-text-primary); }
.grafica-motor .grafica-leyenda-item { display: inline-flex; align-items: center; gap: 8px; }
.grafica-motor .grafica-leyenda-muestra { width: 24px; height: 12px; flex: none; overflow: visible; }
.grafica-motor .grafica-leyenda-muestra .grafica-linea { stroke-width: 2.5px; vector-effect: none; }
.grafica-motor .grafica-leyenda-muestra .grafica-referencia { stroke: var(--color-text-secondary); stroke-width: 1.5px; fill: none; }
.grafica-motor .grafica-punto-leyenda { stroke-width: 1px; }
.grafica-motor .grafica-leyenda-caja { width: 12px; height: 12px; border-radius: 2px; flex: none; box-shadow: inset 0 0 0 1px rgba(31, 41, 55, 0.15); }
.grafica-motor .grafica-tooltip {
  position: absolute; z-index: 5; pointer-events: none;
  background: #1F2937; color: #FFFFFF; padding: 8px 12px; border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  font-family: var(--font-family); font-size: 12px; line-height: 1.4; white-space: nowrap;
  opacity: 0; transform: translate(-50%, -100%); transition: opacity 100ms ease-in-out;
}
.grafica-motor .grafica-tooltip.visible { opacity: 1; }
.grafica-motor .grafica-tooltip::after {
  content: ''; position: absolute; top: 100%; left: var(--punta-x, 50%);
  transform: translateX(-50%); border: 6px solid transparent; border-top-color: #1F2937;
}
.grafica-motor .grafica-tooltip.grafica-tooltip-abajo { transform: translate(-50%, 0); }
.grafica-motor .grafica-tooltip.grafica-tooltip-abajo::after { top: auto; bottom: 100%; border-top-color: transparent; border-bottom-color: #1F2937; }
.grafica-motor .grafica-tooltip-titulo { font-weight: 600; margin-bottom: 4px; }
.grafica-motor .grafica-tooltip-fila { display: flex; align-items: center; gap: 8px; }
.grafica-motor .grafica-tooltip-caja { width: 10px; height: 10px; border-radius: 2px; flex: none; }
.grafica-motor .grafica-tooltip-valor { font-size: 13px; font-weight: 600; }
@media (max-width: 639px) {
  .grafica-contenedor.grafica-motor { padding: 16px; }
  .grafica-motor .grafica-titulo { font-size: 16px; }
  .grafica-motor .grafica-leyenda { flex-direction: column; align-items: flex-start; }
}
@media (min-width: 1025px) {
  .grafica-contenedor.grafica-motor { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 16px; align-items: start; }
  .grafica-motor .grafica-titulo { grid-column: 1 / -1; }
  .grafica-motor .grafica-leyenda { flex-direction: column; margin-top: 0; max-width: 220px; }
}
@media (prefers-reduced-motion: reduce) {
  .grafica-contenedor.grafica-motor, .grafica-motor * { transition: none !important; animation: none !important; }
}
`;
  document.head.appendChild(estilo);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COLOR_ZONA,
    COLOR_SERIE,
    etiquetaPuntoGrafica,
    etiquetaEjeGrafica,
    evaluarZona,
    RANGO_ZONA,
    compararZonas,
    describirZonas,
    evaluarTendencia,
    calcularFormulaEventos,
    evaluarVigenciaEstudio,
    calcularIntervaloMeses,
    renderGrafica,
  };
}
