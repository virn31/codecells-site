// lib/fotosPaciente.js — funciones puras de la pestaña Fotos (la parte de
// navegador: cámara, IndexedDB y pantalla, se prueba en el teléfono).
const test = require('node:test');
const assert = require('node:assert');
const F = require('../lib/fotosPaciente');

test('escalar: el lado mayor no pasa del máximo y nunca agranda', () => {
  assert.deepStrictEqual(F.escalar(4000, 3000, 1600), { w: 1600, h: 1200 });
  assert.deepStrictEqual(F.escalar(1080, 1920, 1600), { w: 900, h: 1600 });
  assert.deepStrictEqual(F.escalar(800, 600, 1600), { w: 800, h: 600 });
});

test('recorteCover: guarda exactamente lo que se ve en pantalla', () => {
  // Cámara 4:3 horizontal en pantalla vertical 9:16 → franja central.
  const r = F.recorteCover(1920, 1440, 360, 640);
  assert.strictEqual(r.sh, 1440); assert.strictEqual(r.sy, 0);
  assert.ok(Math.abs(r.sw / r.sh - 360 / 640) < 1e-9);
  assert.ok(Math.abs(r.sx - (1920 - r.sw) / 2) < 1e-9);
  // Cámara vertical más alta que la pantalla → recorte arriba y abajo.
  const v = F.recorteCover(1080, 2400, 400, 600);
  assert.strictEqual(v.sw, 1080); assert.ok(v.sy > 0);
  assert.ok(Math.abs(v.sw / v.sh - 400 / 600) < 1e-9);
});

test('agruparPorMes: más recientes primero, un grupo por mes', () => {
  const g = F.agruparPorMes([
    { id: 'a', fecha: '2026-09-02T10:00:00Z' }, { id: 'b', fecha: '2026-10-20T10:00:00Z' },
    { id: 'c', fecha: '2026-10-01T10:00:00Z' }, { id: 'd', fecha: '2026-08-15T10:00:00Z' },
  ]);
  assert.deepStrictEqual(g.map(x => x.clave), ['2026-10', '2026-09', '2026-08']);
  assert.deepStrictEqual(g[0].fotos.map(f => f.id), ['b', 'c']);
  assert.deepStrictEqual(F.agruparPorMes([]), []);
});

test('diasEntre: días calendario, sin importar el orden', () => {
  assert.strictEqual(F.diasEntre('2026-04-10T12:00:00', '2026-10-27T08:00:00'), 200);
  assert.strictEqual(F.diasEntre('2026-10-27T23:00:00', '2026-10-27T01:00:00'), 0);
});

test('parPorDefecto: la primera y la última de la categoría; null con menos de dos', () => {
  const fotos = [
    { id: 'x', categoria: 'rostro', fecha: '2026-05-01' }, { id: 'y', categoria: 'rostro', fecha: '2026-03-01' },
    { id: 'z', categoria: 'rostro', fecha: '2026-07-01' }, { id: 'w', categoria: 'piel', fecha: '2026-06-01' },
  ];
  assert.deepStrictEqual(F.parPorDefecto(fotos, 'rostro'), { antes: fotos[1], despues: fotos[2] });
  assert.strictEqual(F.parPorDefecto(fotos, 'piel'), null);
});

test('cada categoría tiene silueta, cámara y consejo', () => {
  for (const c of F.CATEGORIAS) {
    assert.ok(['cuerpo', 'perfil', 'rostro', 'piel', 'documento'].includes(c.guia), c.id);
    assert.ok(['user', 'environment'].includes(c.camara), c.id);
    assert.ok(c.consejo.length > 10, c.id);
  }
});
