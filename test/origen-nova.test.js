// Guard de origen de api/nova.js: dominios propios por comparación exacta;
// URLs de Preview de Vercel solo cuando VERCEL_ENV=preview.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
const test = require('node:test');
const assert = require('node:assert');
const { isAllowedOrigin } = require('../api/nova.js');

const PREVIEW = 'https://codecells-site-9aci6ssk7-codecells.vercel.app';

test('dominios propios: sí; parecidos que empiezan igual: no', () => {
  assert.strictEqual(isAllowedOrigin('https://codecells.mx'), true);
  assert.strictEqual(isAllowedOrigin('https://www.codecells.mx'), true);
  assert.strictEqual(isAllowedOrigin('https://codecells.mx.atacante.com'), false);
  assert.strictEqual(isAllowedOrigin('https://codecells-site.vercel.app.atacante.com'), false);
  assert.strictEqual(isAllowedOrigin(''), false);
});

test('URL de Preview: solo en el ambiente Preview', () => {
  const antes = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = 'production';
    assert.strictEqual(isAllowedOrigin(PREVIEW), false);
    process.env.VERCEL_ENV = 'preview';
    assert.strictEqual(isAllowedOrigin(PREVIEW), true);
    assert.strictEqual(isAllowedOrigin('https://codecells-site-x-otroequipo.vercel.app'), false);
    assert.strictEqual(isAllowedOrigin('https://otro-proyecto-abc-codecells.vercel.app'), false);
  } finally {
    if (antes === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = antes;
  }
});
