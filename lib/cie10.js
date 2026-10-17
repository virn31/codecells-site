// lib/cie10.js — Sugerencia de códigos CIE-10 para el diagnóstico que el
// médico escribió o dictó. NOVA PROPONE, el médico ELIGE (uno o varios)
// antes de guardar; nada se escribe en el expediente desde aquí.
//
// Reglas:
// - Solo se codifica lo que el médico puso como diagnóstico: cada grupo de
//   candidatos va atado a una FRASE literal de su texto (se verifica). NOVA
//   no deduce diagnósticos a partir de síntomas.
// - Cada código propuesto se comprueba contra el catálogo oficial
//   (lib/cie10-catalogo.js: categorías de 3 caracteres y subcategorías de 4).
//   Un código que no existe se descarta. La descripción que ve el médico es la del CATÁLOGO,
//   nunca la que escriba el modelo: si el modelo se equivoca, se nota.

const CATALOGO = require('./cie10-catalogo');
const { normalizarDictado } = require('./dictado');

const DESCRIPCION_POR_CODIGO = new Map(CATALOGO.map((e) => [e.codigo, e.descripcion]));
const MAX_TEXTO_DIAGNOSTICO = 1500;
const MAX_CANDIDATOS = 3;

// "i20.8" → "I20.8"; "I208" → "I20.8"; "I20" → "I20". null si no parece código.
function normalizarCodigoCie10(codigo) {
  const m = String(codigo || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z])(\d)(\d)(?:\.?([0-9X]))?$/);
  if (!m) return null;
  return m[4] !== undefined ? `${m[1]}${m[2]}${m[3]}.${m[4]}` : `${m[1]}${m[2]}${m[3]}`;
}

// Categoría de 3 caracteres de un código ("I20.8" → "I20").
function categoriaCie10(codigo) {
  const n = normalizarCodigoCie10(codigo);
  return n ? n.slice(0, 3) : null;
}

// Código del catálogo para lo que propuso el modelo: la subcategoría si
// existe; si propuso una subcategoría que NO existe, su categoría de 3
// caracteres (que sí existe) — nunca un código inventado.
function codigoDelCatalogo(propuesto) {
  const n = normalizarCodigoCie10(propuesto);
  if (!n) return { motivo: 'formato de código no válido' };
  if (DESCRIPCION_POR_CODIGO.has(n)) return { codigo: n };
  if (n.length > 3 && DESCRIPCION_POR_CODIGO.has(n.slice(0, 3))) return { codigo: n.slice(0, 3), nota: `${n} no existe en el catálogo; se ofrece la categoría ${n.slice(0, 3)}` };
  return { motivo: 'no existe en el catálogo CIE-10' };
}

function procesarSugerenciasCie10(textoDiagnostico, propuestas) {
  const tNorm = normalizarDictado(textoDiagnostico);
  const grupos = [];
  const descartados = [];
  for (const p of (Array.isArray(propuestas) ? propuestas : []).slice(0, 10)) {
    const frase = String((p && p.frase) || '').trim();
    const fNorm = normalizarDictado(frase);
    if (fNorm.length < 2 || !tNorm.includes(fNorm)) {
      descartados.push({ frase, motivo: 'esa frase no está en tu diagnóstico' });
      continue;
    }
    const candidatos = [];
    for (const c of (Array.isArray(p.codigos) ? p.codigos : [])) {
      const r = codigoDelCatalogo(c);
      if (!r.codigo) { descartados.push({ frase, codigo: normalizarCodigoCie10(c) || String(c), motivo: r.motivo }); continue; }
      if (r.nota) descartados.push({ frase, codigo: normalizarCodigoCie10(c), motivo: r.nota });
      if (!candidatos.some((x) => x.codigo === r.codigo)) candidatos.push({ codigo: r.codigo, descripcion: DESCRIPCION_POR_CODIGO.get(r.codigo) });
      if (candidatos.length >= MAX_CANDIDATOS) break;
    }
    const previo = grupos.find((g) => normalizarDictado(g.frase) === fNorm);
    if (previo) {
      for (const c of candidatos) if (!previo.candidatos.some((x) => x.codigo === c.codigo)) previo.candidatos.push(c);
    } else {
      grupos.push({ frase, candidatos });
    }
  }
  return { grupos, descartados };
}

const PROMPT_CIE10 = `Eres el codificador CIE-10 de NOVA. Recibes el texto de DIAGNÓSTICO que escribió o dictó un médico.
- Identifica cada diagnóstico que el médico mencionó. No agregues diagnósticos que no escribió ni los deduzcas de síntomas, antecedentes o tratamientos.
- Para cada uno devuelve "frase": el fragmento EXACTO del texto (copiado palabra por palabra), y "codigos": hasta ${MAX_CANDIDATOS} códigos CIE-10, de la más a la menos adecuada. Usa la CIE-10 de la OMS/OPS (no CIE-10-CM ni CIE-11).
- Prefiere la SUBCATEGORÍA de cuatro caracteres (p. ej. I20.0, E11.2, M17.0) cuando el texto la sustenta. Si el texto no permite distinguir la subcategoría, usa la ".9" (no especificada) o la ".8" (otras) según corresponda, o la categoría de tres caracteres si no tiene subcategorías. No elijas una subcategoría que exija información que el médico no dio (por ejemplo, una complicación que no mencionó).
- Los datos de contexto (semanas de gestación, estadio, grado, lateralidad, "en control", "descontrolada") NO son diagnósticos aparte: van dentro de la frase del diagnóstico al que califican. Un embarazo con patología obstétrica no se codifica además como "embarazo normal".
- Si un término es ambiguo, incluye las alternativas razonables. Calificativos como "probable" o "en estudio" no cambian la categoría.
- Si el médico escribió un síntoma como diagnóstico, puedes proponer la categoría del capítulo R correspondiente.
- Usa la herramienta proponer_cie10. Si no hay ningún diagnóstico en el texto, devuélvela vacía.`;

function buildHerramientaCie10() {
  return {
    name: 'proponer_cie10',
    description: 'Propone categorías CIE-10 de 3 caracteres para cada diagnóstico escrito por el médico.',
    input_schema: {
      type: 'object',
      properties: {
        diagnosticos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              frase: { type: 'string' },
              codigos: { type: 'array', items: { type: 'string' } },
            },
            required: ['frase', 'codigos'],
          },
        },
      },
      required: ['diagnosticos'],
    },
  };
}

// Devuelve { ok: true, grupos, descartados } o { ok: false, status, error }.
async function sugerirCie10(textoDiagnostico) {
  const t = typeof textoDiagnostico === 'string' ? textoDiagnostico.trim() : '';
  if (!t) return { ok: false, status: 400, error: 'Escribe o dicta primero el diagnóstico.' };
  if (t.length > MAX_TEXTO_DIAGNOSTICO) return { ok: false, status: 400, error: `El diagnóstico es muy largo (máximo ${MAX_TEXTO_DIAGNOSTICO} caracteres).` };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      system: PROMPT_CIE10,
      tools: [buildHerramientaCie10()],
      tool_choice: { type: 'tool', name: 'proponer_cie10' },
      messages: [{ role: 'user', content: `Diagnóstico escrito por el médico:\n<diagnostico>\n${t}\n</diagnostico>` }],
    }),
  });
  if (!r.ok) {
    console.error('[cie10] Anthropic:', r.status, (await r.text()).slice(0, 300));
    return { ok: false, status: 502, error: 'NOVA no pudo sugerir códigos en este momento. Puedes buscarlos en el campo de diagnóstico.' };
  }
  const data = await r.json();
  const tool = Array.isArray(data.content) ? data.content.find((b) => b && b.type === 'tool_use' && b.name === 'proponer_cie10') : null;
  if (!tool || data.stop_reason === 'max_tokens') {
    return { ok: false, status: 502, error: 'NOVA no terminó de sugerir códigos. Intenta de nuevo.' };
  }
  return { ok: true, ...procesarSugerenciasCie10(t, tool.input.diagnosticos) };
}

// Texto del diagnóstico con los códigos que ELIGIÓ el médico. Se conserva su
// frase (p. ej. "probable") junto a cada código: "I20 — Angina de pecho
// (angina estable probable); E11 — …". Mismo formato que el portal.
function diagnosticoConCodigos(elegidos) {
  return (elegidos || []).map((e) => `${e.codigo} — ${e.descripcion}${e.frase ? ` (${e.frase})` : ''}`).join('; ');
}

// Coloca los códigos elegidos DENTRO del texto del médico: cada frase
// codificada se sustituye por "código — descripción (frase)" y todo lo demás
// queda como él lo escribió. Un diagnóstico sin código elegido NO se borra
// (antes "sí 1" con dos diagnósticos dictados guardaba solo el codificado).
// Una frase que no se encuentra en el texto se agrega al final.
// Mismo algoritmo que integrarCodigosEnDiagnostico de portal-medico.html.
function integrarCodigosEnDiagnostico(texto, elegidos) {
  let t = String(texto || '').trim();
  const porFrase = [];
  for (const e of elegidos || []) {
    const g = porFrase.find((x) => x.frase === e.frase);
    if (g) g.items.push(e); else porFrase.push({ frase: e.frase, items: [e] });
  }
  const sueltos = [];
  for (const g of porFrase) {
    const con = diagnosticoConCodigos(g.items);
    const i = g.frase ? t.toLowerCase().indexOf(String(g.frase).toLowerCase()) : -1;
    if (i >= 0) t = t.slice(0, i) + con + t.slice(i + g.frase.length);
    else sueltos.push(con);
  }
  return [t, ...sueltos].filter(Boolean).join('; ');
}

module.exports = { categoriaCie10, normalizarCodigoCie10, procesarSugerenciasCie10, sugerirCie10, diagnosticoConCodigos, integrarCodigosEnDiagnostico, MAX_TEXTO_DIAGNOSTICO };
