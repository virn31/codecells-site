// Hallazgo 2026-10-24 (pasada del directorio): api/auth-login.js pegaba el
// código sin validar dentro de filterByFormula. Con `" != "x` la fórmula se
// volvía verdadera para todos y emitía un token del primer médico de la tabla
// sin conocer ningún código. Probado contra la base de prueba antes del arreglo.
// Corre con: node --test

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-no-es-real';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-airtable-token-no-es-real';

const test = require('node:test');
const assert = require('node:assert');

function fakeRes() {
  return {
    statusCode: null, body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    setHeader() {}, end() { return this; },
  };
}

function login(body) {
  delete require.cache[require.resolve('../api/auth-login.js')];
  const handler = require('../api/auth-login.js');
  const res = fakeRes();
  return handler({ method: 'POST', body }, res).then(() => res);
}

const ATAQUES = ['" != "x', '" & "" = "', '" & {Código de médico} & "', 'CCMED-X" , TRUE(), "', 'CCMED-VIRN01"', 'a\\"b', '{Activo}', 'CCMED VIRN01'];

for (const tipo of ['medico', 'paciente', 'vip']) {
  test(`auth-login ${tipo}: un código con comillas, llaves o espacios se rechaza sin consultar Airtable`, async () => {
    let consultas = 0;
    global.fetch = async () => { consultas++; return { ok: true, status: 200, json: async () => ({ records: [{ id: 'recPRIMERO', fields: {} }] }) }; };
    for (const codigo of ATAQUES) {
      const res = await login({ tipo, codigo });
      assert.strictEqual(res.statusCode, 401, `${codigo} → ${res.statusCode}`);
      assert.ok(!res.body.token, `${codigo} no debe recibir token`);
    }
    assert.strictEqual(consultas, 0, 'ni siquiera se consulta la base');
  });
}

test('auth-login: los códigos legítimos siguen entrando y la fórmula lleva el código exacto', async () => {
  const formulas = [];
  global.fetch = async (url) => {
    formulas.push(decodeURIComponent(new URL(url).searchParams.get('filterByFormula')));
    return { ok: true, status: 200, json: async () => ({ records: [{ id: 'recMED', fields: { 'Código de médico': 'CCMED-QACARD' } }] }) };
  };
  for (const codigo of ['CCMED-QACARD', 'CCMED-VIRN01', 'CC-PAC-9001', '  CCMED-JCG01  ']) {
    const res = await login({ tipo: 'medico', codigo });
    assert.strictEqual(res.statusCode, 200, `${codigo} → ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  assert.deepStrictEqual(formulas[3], '{Código de médico}="CCMED-JCG01"');
});
