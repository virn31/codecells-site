// lib/restriccionesAlimentarias.js
// Traduce el campo libre "Alergias alimentarias" del expediente a
// ingredientes del catálogo (api/data/bncc-data.json) que el plan semanal
// debe excluir.
//
// Antes se buscaba el texto del expediente dentro del NOMBRE de cada
// ingrediente: "Intolerancia a la lactosa" no aparece en "Leche descremada",
// así que el plan de un intolerante a la lactosa traía leche, yogur, queso y
// proteína de suero (visto con el demo CC-PAC-200002, 2026-10-27).
//
// Ahora: (1) grupos de alérgenos → IDs de ingrediente (identificador, no
// coincidencia de texto, CLAUDE.md §6); (2) lo que no es un grupo conocido se
// busca por nombre (una "fresa" excluye "Fresas"); (3) lo que no se reconoce
// NI coincide con nada se devuelve aparte para avisarlo en el plan: una
// restricción que no se pudo aplicar nunca se ignora en silencio.

// Grupos → IDs del catálogo. Un grupo sin ingredientes hoy (mariscos,
// cacahuate, soya) se reconoce igual: no hay nada que excluir, pero tampoco
// es una restricción "no aplicada". Al agregar ingredientes al catálogo,
// revisar esta tabla.
const GRUPOS = {
  lacteos: {
    nombre: 'lácteos',
    terminos: ['lactosa', 'lacteo', 'leche', 'caseina', 'apLV'],
    // leche, yogur natural, queso panela, crema, queso fresco, yogur griego, proteína de suero
    ids: ['ING000015', 'ING000016', 'ING000017', 'ING000033', 'ING000037', 'ING000041', 'ING000045'],
  },
  huevo: { nombre: 'huevo', terminos: ['huevo'], ids: ['ING000004', 'ING000038'] },
  pescado: { nombre: 'pescado', terminos: ['pescado', 'atun'], ids: ['ING000018', 'ING000056'] },
  frutosSecos: {
    nombre: 'frutos secos',
    terminos: ['nuez', 'nueces', 'almendra', 'frutos secos', 'oleaginosa'],
    ids: ['ING000019', 'ING000029'],
  },
  // Avena incluida por contaminación cruzada con trigo (celiaquía).
  gluten: {
    nombre: 'gluten',
    terminos: ['gluten', 'trigo', 'celiac', 'celiaq'],
    ids: ['ING000034', 'ING000039', 'ING000014', 'ING000030'],
  },
  mariscos: { nombre: 'mariscos', terminos: ['marisco', 'camaron', 'crustaceo', 'molusco'], ids: [] },
  cacahuate: { nombre: 'cacahuate', terminos: ['cacahuate', 'mani'], ids: [] },
  soya: { nombre: 'soya', terminos: ['soya', 'soja'], ids: [] },
};

// "Niega", "ninguna", "sin alergias"… no son restricciones. Frases EXACTAS:
// "sin gluten" o "no lácteos" SÍ son restricciones y no deben caer aquí.
const NINGUNA = /^(niega( alergias?( alimentarias)?)?|negad[ao]s?|ningun[ao]s?|n\/?a|-+|sin alergias?( alimentarias)?( conocidas)?|no (refiere|conocidas?|tiene)( alergias?)?)$/;
// "Alergia a la fresa", "intolerancia a la lactosa" → lo que importa es el alimento.
const PREFIJO = /^(alergi[ao]s?|alergic[ao]s?|intoleran(cia|te)s?|sensibilidad)( alimentarias?)?\s+(a|al)\s+(la |los |las |el )?/;

const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// texto: "Intolerancia a la lactosa, fresa" ; ingredientes: catálogo.
// → { excluir: Set<id>, aplicadas: [string], noAplicadas: [string] }
function restriccionesAlimentarias(texto, ingredientes) {
  const excluir = new Set();
  const aplicadas = [];
  const noAplicadas = [];
  const partes = String(texto || '').split(/[,;\n]+|\s+[ye]\s+/).map(s => s.trim()).filter(Boolean);
  for (const parte of partes) {
    const n = normalizar(parte).replace(PREFIJO, '');
    if (!n || NINGUNA.test(n)) continue;
    const grupos = Object.values(GRUPOS).filter(g => g.terminos.some(t => n.includes(normalizar(t))));
    if (grupos.length) {
      for (const g of grupos) g.ids.forEach(id => excluir.add(id));
      aplicadas.push(parte);
      continue;
    }
    // Sin grupo: por nombre, tolerando el plural ("fresa" ↔ "Fresas").
    const raiz = n.replace(/(es|s)$/, '');
    const porNombre = raiz.length >= 3 ? (ingredientes || []).filter(i => normalizar(i.nombre).includes(raiz)) : [];
    if (porNombre.length) { porNombre.forEach(i => excluir.add(i.id)); aplicadas.push(parte); }
    else noAplicadas.push(parte);
  }
  return { excluir, aplicadas, noAplicadas };
}

module.exports = { GRUPOS, restriccionesAlimentarias, normalizar };
