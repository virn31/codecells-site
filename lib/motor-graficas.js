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

// Colores solo para elementos NUEVOS (bandas de zona, series extra de
// multi_linea). Inline, para no inventar clases CSS. La serie principal sigue
// usando la clase dorada existente.
const COLOR_ZONA = {
  verde:    'rgba(76,175,80,0.12)',
  amarillo: 'rgba(232,163,61,0.14)',
  naranja:  'rgba(230,126,34,0.14)',
  rojo:     'rgba(229,90,74,0.14)',
};
const COLOR_SERIE = ['#5AA9E6', '#8E7CE6', '#4CAF50', '#E55A4A'];

// Etiqueta de tooltip: si el punto trae `semana` (metadato de CONSULTAS),
// reproduce la semántica original (Inicio / Semana N); si no, cae a la fecha.
function etiquetaPuntoGrafica(p) {
  if (p.semana != null) return p.semana === 0 ? 'Inicio' : `Semana ${p.semana}`;
  return p.fecha || '';
}
// Etiqueta de eje: el PRIMER punto es "Inicio" por posición (índice), igual
// que la curva original; el resto usa el número de semana. Sin `semana`, cae
// a la fecha o al ordinal.
function etiquetaEjeGrafica(p, i) {
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

/**
 * @param {Object}     config
 * @param {SVGElement} config.svg                 <svg viewBox="0 0 560 200">
 * @param {string}     config.tipo                linea_zonas | multi_linea | (otras: no impl)
 * @param {string}     [config.escalaX='indice']  'indice' | 'fecha'
 * @param {Array}      config.series              [{codigo,nombre,unidad,decimales,puntos:[{fecha,valor,semana?}]}]
 * @param {Array}      [config.zonas=[]]          [{min?,max?,color}] (solo linea_zonas)
 * @param {number}     [config.lineaReferencia]   línea horizontal opcional (clase linea-meta)
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

  const escalaX = config.escalaX || 'indice';
  const series = (config.series || []).filter(s => s && s.puntos && s.puntos.length);
  if (!series.length) return;

  const W = 560, H = 200, ML = 40, MR = 12, MT = 15, MB = 25;
  const plotW = W - ML - MR, plotH = H - MT - MB;

  // Dominio Y sobre todos los puntos de todas las series (holgura ±1, igual
  // que la curva original).
  const valores = series.reduce((acc, s) => acc.concat(s.puntos.map(p => p.valor)), []);
  const minY = Math.floor(Math.min(...valores)) - 1;
  const maxY = Math.ceil(Math.max(...valores)) + 1;
  const y = val => MT + (1 - (val - minY) / (maxY - minY)) * plotH;

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

  // Bandas de zona (solo linea_zonas y solo si hay zonas). Fondo semitranspa-
  // rente, dibujadas primero para quedar detrás. peso llega con zonas=[] → nada.
  const zonas = (tipo === 'linea_zonas' && Array.isArray(config.zonas)) ? config.zonas : [];
  zonas.forEach(z => {
    const yTop = y(z.max != null ? z.max : maxY);
    const yBot = y(z.min != null ? z.min : minY);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', ML);
    rect.setAttribute('y', Math.min(yTop, yBot));
    rect.setAttribute('width', plotW);
    rect.setAttribute('height', Math.abs(yBot - yTop));
    rect.setAttribute('fill', COLOR_ZONA[z.color] || 'rgba(232,163,61,0.10)');
    svg.appendChild(rect);
  });

  // Guías horizontales (min/max) con su valor. Unidad del catálogo (no literal).
  const unidadEje = series[0].unidad || '';
  [minY, maxY].forEach(val => {
    const linea = document.createElementNS(NS, 'line');
    linea.setAttribute('x1', ML); linea.setAttribute('x2', W - MR);
    linea.setAttribute('y1', y(val)); linea.setAttribute('y2', y(val));
    linea.setAttribute('class', 'linea-guia');
    svg.appendChild(linea);

    const texto = document.createElementNS(NS, 'text');
    texto.setAttribute('x', 4); texto.setAttribute('y', y(val) + 3);
    texto.textContent = val + ' ' + unidadEje;
    svg.appendChild(texto);
  });

  // Línea de referencia opcional (generaliza metaKg; lo necesita control prenatal).
  if (config.lineaReferencia != null) {
    const linea = document.createElementNS(NS, 'line');
    linea.setAttribute('x1', ML); linea.setAttribute('x2', W - MR);
    linea.setAttribute('y1', y(config.lineaReferencia)); linea.setAttribute('y2', y(config.lineaReferencia));
    linea.setAttribute('class', 'linea-meta');
    svg.appendChild(linea);
  }

  // Polilíneas (una por serie). La principal va con la clase dorada existente;
  // las series extra de multi_linea se distinguen por color en línea.
  series.forEach((s, si) => {
    const n = s.puntos.length;
    const pts = s.puntos.map((p, i) => `${xDe(p, i, n)},${y(p.valor)}`).join(' ');
    const poly = document.createElementNS(NS, 'polyline');
    poly.setAttribute('points', pts);
    poly.setAttribute('class', 'linea-peso');
    if (si > 0) poly.setAttribute('stroke', COLOR_SERIE[(si - 1) % COLOR_SERIE.length]);
    svg.appendChild(poly);
  });

  // Puntos + etiquetas de eje. Las etiquetas de eje se dibujan una sola vez,
  // desde la serie de referencia (la más larga), intercaladas con sus puntos
  // — mismo orden de DOM que la curva original.
  const refIdx = series.reduce((best, s, idx, arr) => (s.puntos.length > arr[best].puntos.length ? idx : best), 0);
  series.forEach((s, si) => {
    const n = s.puntos.length;
    const dec = typeof s.decimales === 'number' ? s.decimales : 0;
    const unidad = s.unidad || '';
    const esRef = si === refIdx;
    s.puntos.forEach((p, i) => {
      const cx = xDe(p, i, n);
      const circulo = document.createElementNS(NS, 'circle');
      circulo.setAttribute('cx', cx);
      circulo.setAttribute('cy', y(p.valor));
      circulo.setAttribute('r', i === 0 ? 5 : 4);
      circulo.setAttribute('class', i === 0 ? 'punto-inicio' : 'punto-peso');
      if (si > 0) circulo.setAttribute('fill', COLOR_SERIE[(si - 1) % COLOR_SERIE.length]);
      const titulo = document.createElementNS(NS, 'title');
      titulo.textContent = `${etiquetaPuntoGrafica(p)} — ${p.valor.toFixed(dec)} ${unidad}`;
      circulo.appendChild(titulo);
      svg.appendChild(circulo);

      if (esRef) {
        const etiqueta = document.createElementNS(NS, 'text');
        etiqueta.setAttribute('x', cx);
        etiqueta.setAttribute('y', H - 6);
        etiqueta.setAttribute('text-anchor', 'middle');
        etiqueta.textContent = etiquetaEjeGrafica(p, i);
        svg.appendChild(etiqueta);
      }
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COLOR_ZONA,
    COLOR_SERIE,
    etiquetaPuntoGrafica,
    etiquetaEjeGrafica,
    evaluarZona,
    renderGrafica,
  };
}
