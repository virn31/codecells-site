// Suite del detector de capa de texto en PDF (Fase C §5): distingue un PDF
// nativo (con operadores de texto en streams FlateDecode) de un escaneo/foto.
// Sin dependencias: runner nativo de Node. Correr con:  node --test

const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { pdfTieneCapaDeTexto } = require('../api/nova.js');

// Construye un PDF mínimo con un stream FlateDecode que contiene `contenido`.
function pdfConStream(contenido) {
  const pre = Buffer.from('%PDF-1.4\n1 0 obj<< /Length 1 >>\nstream\n');
  const post = Buffer.from('\nendstream\nendobj\n%%EOF');
  return Buffer.concat([pre, zlib.deflateSync(Buffer.from(contenido)), post]);
}

test('nativo: stream con operadores de texto (BT/Tf/Tj) -> true', () => {
  const pdf = pdfConStream('BT /F1 12 Tf (Glucosa 94 mg/dL) Tj ET BT (Colesterol) Tj ET');
  assert.strictEqual(pdfTieneCapaDeTexto(pdf), true);
});

test('escaneo: stream sin operadores de texto (bytes de imagen) -> false', () => {
  const pdf = pdfConStream(Buffer.alloc(3000, 0xAA)); // sin BT/Tj/TJ/Tf
  assert.strictEqual(pdfTieneCapaDeTexto(pdf), false);
});

test('sin streams -> false', () => {
  assert.strictEqual(pdfTieneCapaDeTexto(Buffer.from('%PDF-1.4 documento sin streams %%EOF')), false);
});

test('buffer vacío -> false (no rompe)', () => {
  assert.strictEqual(pdfTieneCapaDeTexto(Buffer.alloc(0)), false);
});

test('pocos operadores (por debajo del umbral) -> false', () => {
  // Solo un Tj: 1 < umbral de 3 -> se trata como escaneo (más cuidadoso).
  const pdf = pdfConStream('(x) Tj');
  assert.strictEqual(pdfTieneCapaDeTexto(pdf), false);
});
