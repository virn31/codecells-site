// NOVA con un solo modo de paciente (VIP fusionado, 2026-10-04): sin
// niveles, sin "consejos como si estuviera en consulta" (el criterio es del
// médico, CLAUDE.md §7), sin recordatorios que nada envía (promesa falsa) y
// sin guardar nombre/teléfono de terceros. Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
const test = require('node:test');
const assert = require('node:assert');
const nova = require('../api/nova.js');

test('prompt de paciente: un solo modo, sin nivel VIP ni consejos clínicos de NOVA', () => {
  const p = nova.buildSystemPrompt('paciente', { nombre: 'Mariana', id: 'CC-PAC-200001' });
  assert.match(p, /MODO: PACIENTE\n/);
  assert.doesNotMatch(p, /VIP|DEZAWA/);
  assert.doesNotMatch(p, /como si estuviera en consulta/);
  assert.match(p, /NO das consejos clínicos personalizados/);
  assert.doesNotMatch(p, /crear_recordatorio|invitar_amigo/);
});

test('herramienta de paciente: sin recordatorios ni referidos con datos de terceros', () => {
  const props = Object.keys(nova.buildHerramientaPaciente().input_schema.properties);
  for (const k of ['crear_recordatorio', 'invitar_amigo', 'referido_nombre', 'referido_telefono']) {
    assert.ok(!props.includes(k), `${k} no debe ofrecerse`);
  }
  for (const k of ['reply', 'crear_solicitud_cita', 'requiere_valoracion_medica']) assert.ok(props.includes(k));
});
