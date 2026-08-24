// lib/datosPacienteNuevo.js
// Campos derivados al dar de alta un paciente (kiosco_crear_paciente y
// crear_paciente_dictado en api/nova.js) que NO deben fabricar datos que
// nadie capturó (CLAUDE.md §7).
//
// 'Edad' en PACIENTES es un campo fórmula (DATETIME_DIFF sobre 'Fecha de
// nacimiento') — no es escribible. Antes, cuando solo se dictaba/tecleaba
// la edad sin fecha de nacimiento, el código calculaba una fecha de
// nacimiento aproximada (hoy menos N años) y la escribía como si fuera un
// dato real. Esa fecha fabricada quedaba indistinguible de una real y
// alimentaba el campo fórmula con un valor falso.
//
// Ahora: 'Fecha de nacimiento' nunca se fabrica. Si solo hay edad, se
// conserva como nota de texto en 'Notas generales' — visible para el
// médico, nunca confundible con un dato capturado con precisión.

function notaEdadSinFecha(edad) {
  if (!edad) return null;
  return `Edad referida al alta: ${edad} años. Sin fecha de nacimiento capturada — confirmar y actualizar cuando se tenga el dato real.`;
}

module.exports = { notaEdadSinFecha };
