// lib/proteinaPlan.js — proteína del plan semanal en g/kg (no en % de kcal).
//
// Antes la proteína salía de proteina_pct × kcal: el demo con ERC 3 recibía
// 93 g (1.1 g/kg) y el de obesidad de 108 kg, 219 g (2 g/kg de peso real).
// Reglas (Víctor 2026-10-27):
//   - ERC sin diálisis: 0.8 g/kg con diabetes; etapa 3–5 sin diabetes 0.6 g/kg.
//   - ERC en diálisis: 1.1 g/kg.
//   - Plan hiperproteico: 1.5 g/kg.
//   - Resto: el % del plan, con tope de 1.8 g/kg.
//   - IMC ≥ 30: todo sobre peso ajustado = ideal (IMC 22.5) + 40 % del exceso.
// Las kcal que libera o consume la proteína se reparten entre carbohidratos y
// grasa en la proporción del plan: el total de kcal no cambia.

const IMC_IDEAL = 22.5;
const TOPE_G_KG = 1.8;

function pesoReferencia(peso, tallaCm) {
  const t = tallaCm / 100;
  if (!(peso > 0) || !(t > 0)) return { kg: peso, ajustado: false };
  const imc = peso / (t * t);
  if (imc < 30) return { kg: peso, ajustado: false };
  const ideal = IMC_IDEAL * t * t;
  return { kg: Math.round((ideal + 0.4 * (peso - ideal)) * 10) / 10, ajustado: true };
}

// Etapa numérica de ERC desde patologías ("ERC 3", "ERC 3b") o severidad ("Etapa 4").
function etapaErc(patologias, severidad) {
  const texto = [severidad || ''].concat(patologias || []).join(' ');
  const m = texto.match(/(?:ERC|Etapa)\s*([1-5])/i);
  return m ? +m[1] : null;
}

// → { proteinaG, grasaG, carboG, gKg, regla, pesoRef, ajustado }
function macrosDelPlan({ kcal, preset, presetNombre, peso, talla, patologias, severidadErc }) {
  const pats = patologias || [];
  const ref = pesoReferencia(peso, talla);
  const tieneErc = pats.some(p => /^ERC\b/i.test(p)) || /etapa/i.test(severidadErc || '');
  const dialisis = pats.some(p => /di[aá]lisis/i.test(p));
  const diabetes = pats.some(p => /diabetes/i.test(p));
  let gKg = null, regla;
  if (tieneErc && dialisis) { gKg = 1.1; regla = 'ERC en diálisis'; }
  else if (tieneErc) {
    const etapa = etapaErc(pats, severidadErc);
    if (diabetes) { gKg = 0.8; regla = 'ERC con diabetes'; }
    else if (etapa && etapa >= 3) { gKg = 0.6; regla = `ERC etapa ${etapa}`; }
    else { gKg = 0.8; regla = 'ERC'; }
  } else if (presetNombre === 'hiperproteica') { gKg = 1.5; regla = 'plan hiperproteico'; }

  let proteinaG = gKg !== null ? ref.kg * gKg : (kcal * preset.proteina_pct) / 4;
  if (gKg === null && ref.kg > 0 && proteinaG > ref.kg * TOPE_G_KG) { proteinaG = ref.kg * TOPE_G_KG; regla = `tope de ${TOPE_G_KG} g/kg`; }
  proteinaG = Math.round(proteinaG);
  const resto = Math.max(kcal - proteinaG * 4, 0);
  const sumaCG = (preset.carbo_pct + preset.grasa_pct) || 1;
  const carboG = Math.round((resto * preset.carbo_pct / sumaCG) / 4);
  const grasaG = Math.round((resto * preset.grasa_pct / sumaCG) / 9);
  return { proteinaG, grasaG, carboG, gKg: ref.kg > 0 ? Math.round((proteinaG / ref.kg) * 100) / 100 : null, regla: regla || null, pesoRef: ref.kg, ajustado: ref.ajustado };
}

module.exports = { macrosDelPlan, pesoReferencia, etapaErc };
