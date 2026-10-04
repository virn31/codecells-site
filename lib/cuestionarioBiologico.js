// lib/cuestionarioBiologico.js
// Cuestionario del Biological Map™ (5 sistemas CODE) — UNA sola copia,
// compartida por el test público (index.html), el kiosco, la app del
// paciente y el servidor. Antes vivía copiado en index.html y
// dezawavip.html, y las dos copias ya habían divergido.
//
// Se carga en el navegador con <script src="/lib/cuestionarioBiologico.js">
// (queda en window.CUESTIONARIO_BIOLOGICO) y en Node con require().
//
// Escala (docs/VISION-APP-MEDICA.md, nota 6): cada respuesta suma RIESGO
// 0–4. Al paciente se le muestra FUNCIÓN 0–10 (más = mejor):
//   función = (1 − riesgo / máximo) × 10, con un decimal.
// Estado general = promedio de los 5. Las etiquetas usan los mismos cortes
// que el test ya tenía (riesgo ≥70 % / ≥40 %), invertidos y en lenguaje
// amable. Es un cuestionario de orientación: NO es un diagnóstico ni genera
// alertas clínicas.
//
// Si cambian las preguntas o su puntuación, cambiar VERSION: las
// evaluaciones guardadas con otra versión no se comparan entre sí a ciegas.
(function (raiz) {
  var VERSION = 'v1-2026-10';

  var DATOS = {
    title: "Evaluación Cronodegenerativa CODE CELLS™",
    description: "Responde con honestidad. Esto te ayudará a descubrir qué sistema biológico está perdiendo función primero.",
    systems: [
      {
        id: "energy", name: "CODE ENERGY™", corto: "Energía", icon: "⚡", color: "#E8A33D",
        explanation: "tu energía celular podría estar perdiendo eficiencia — esto suele traducirse en fatiga, menor rendimiento y recuperación lenta.",
        action: "profundizar en tu metabolismo energético y función mitocondrial.",
        questions: [
          { id:"q1", text:"¿Te sientes cansado o con baja energía la mayor parte del día?",
            options:[{value:0,text:"Nunca"},{value:1,text:"Rara vez"},{value:2,text:"A veces"},{value:3,text:"Frecuentemente"},{value:4,text:"Siempre"}] },
          { id:"q2", text:"¿Te cuesta recuperarte después de un esfuerzo físico o mental?",
            options:[{value:0,text:"No"},{value:1,text:"Poco"},{value:2,text:"Moderado"},{value:3,text:"Bastante"},{value:4,text:"Mucho"}] }
        ]
      },
      {
        id: "repair", name: "CODE REPAIR™", corto: "Reparación", icon: "🔬", color: "#D4654A",
        explanation: "tu capacidad de reparación tisular podría estar disminuida — esto se refleja en recuperación lenta e inflamación persistente.",
        action: "evaluar tus marcadores de reparación celular e inflamación.",
        questions: [
          { id:"q1", text:"¿Tus heridas o lesiones tardan más en sanar de lo normal?",
            options:[{value:0,text:"No"},{value:4,text:"Sí"}] },
          { id:"q2", text:"¿Sientes inflamación o molestias que no terminan de resolverse?",
            options:[{value:0,text:"Nunca"},{value:1,text:"Rara vez"},{value:2,text:"A veces"},{value:3,text:"Frecuentemente"},{value:4,text:"Siempre"}] }
        ]
      },
      {
        id: "balance", name: "CODE BALANCE™", corto: "Balance", icon: "⚖️", color: "#4FA8A0",
        explanation: "tu capacidad de adaptación al estrés podría estar sobrecargada — esto se asocia con ansiedad, insomnio o irritabilidad.",
        action: "trabajar tu regulación neuroendocrina y resiliencia biológica.",
        questions: [
          { id:"q1", text:"¿Te cuesta conciliar o mantener el sueño?",
            options:[{value:0,text:"Nunca"},{value:1,text:"Rara vez"},{value:2,text:"A veces"},{value:3,text:"Frecuentemente"},{value:4,text:"Siempre"}] },
          { id:"q2", text:"¿Te sientes irritable o ansioso sin una causa clara?",
            options:[{value:0,text:"Nunca"},{value:1,text:"Rara vez"},{value:2,text:"A veces"},{value:3,text:"Frecuentemente"},{value:4,text:"Siempre"}] }
        ]
      },
      {
        id: "neuro", name: "CODE NEURO™", corto: "Neuro", icon: "🧠", color: "#8B7FD4",
        explanation: "tu función cognitiva podría estar perdiendo claridad — esto se asocia con niebla mental y menor capacidad de enfoque.",
        action: "profundizar en tu salud neurológica y plasticidad cerebral.",
        questions: [
          { id:"q1", text:"¿Sientes niebla mental o dificultad para concentrarte?",
            options:[{value:0,text:"Nunca"},{value:1,text:"Rara vez"},{value:2,text:"A veces"},{value:3,text:"Frecuentemente"},{value:4,text:"Siempre"}] },
          { id:"q2", text:"¿Notas que tu memoria reciente falla más de lo que recuerdas?",
            options:[{value:0,text:"Nunca"},{value:1,text:"Rara vez"},{value:2,text:"A veces"},{value:3,text:"Frecuentemente"},{value:4,text:"Siempre"}] }
        ]
      },
      {
        id: "regen", name: "CODE REGEN™", corto: "Regeneración", icon: "🧬", color: "#5FAE6E",
        explanation: "tu capacidad regenerativa podría estar disminuyendo — esto acelera el envejecimiento percibido y limita tu recuperación global.",
        action: "evaluar tu potencial de renovación tisular y plasticidad biológica.",
        questions: [
          { id:"q1", text:"¿Sientes que tu cuerpo se ve o se siente más envejecido de lo que esperarías para tu edad?",
            options:[{value:0,text:"Nunca"},{value:1,text:"Rara vez"},{value:2,text:"A veces"},{value:3,text:"Frecuentemente"},{value:4,text:"Siempre"}] },
          { id:"q2", text:"¿Sientes que tu capacidad de recuperación general ha disminuido con el tiempo?",
            options:[{value:0,text:"Nunca"},{value:1,text:"Rara vez"},{value:2,text:"A veces"},{value:3,text:"Frecuentemente"},{value:4,text:"Siempre"}] }
        ]
      }
    ],
    thresholds: { high_risk: 70, moderate: 40 }
  };

  function redondear1(x) { return Math.round(x * 10) / 10; }

  // respuestas: { "energy_q1": 2, "energy_q2": 4, ... } (valor de la opción).
  // Devuelve null si falta alguna respuesta o trae un valor que no es una
  // opción de esa pregunta: un test incompleto NO se califica (no se rellena
  // con 0, que sería "sin riesgo" inventado).
  function calificar(respuestas) {
    if (!respuestas || typeof respuestas !== 'object') return null;
    var sistemas = {};
    for (var i = 0; i < DATOS.systems.length; i++) {
      var sys = DATOS.systems[i];
      var suma = 0, maximo = 0;
      for (var j = 0; j < sys.questions.length; j++) {
        var q = sys.questions[j];
        var v = respuestas[sys.id + '_' + q.id];
        var valida = q.options.some(function (o) { return o.value === v; });
        if (!valida) return null;
        suma += v;
        maximo += Math.max.apply(null, q.options.map(function (o) { return o.value; }));
      }
      var riesgoPct = Math.round((suma / maximo) * 100);
      sistemas[sys.id] = { riesgoPct: riesgoPct, funcion: redondear1((1 - suma / maximo) * 10) };
    }
    var ids = Object.keys(sistemas);
    var general = redondear1(ids.reduce(function (a, k) { return a + sistemas[k].funcion; }, 0) / ids.length);
    return { version: VERSION, sistemas: sistemas, estadoGeneral: general };
  }

  // Etiqueta amable para una función 0–10 (mismos cortes que el test:
  // riesgo ≥70 % ⇔ función ≤3; riesgo ≥40 % ⇔ función ≤6).
  function etiqueta(funcion) {
    if (funcion == null || isNaN(funcion)) return null;
    if (funcion <= 3) return 'Necesita atención';
    if (funcion <= 6) return 'Puede mejorar';
    return 'Buen funcionamiento';
  }

  var api = { VERSION: VERSION, DATOS: DATOS, calificar: calificar, etiqueta: etiqueta };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.CUESTIONARIO_BIOLOGICO = api;
})(typeof window !== 'undefined' ? window : this);
