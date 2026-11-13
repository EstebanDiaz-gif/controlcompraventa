// scanner.js usa el navegador al cargarse: le damos lo mínimo para probar la búsqueda por código.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document = globalThis.document || { addEventListener() {}, createElement: () => ({ style: {} }), head: { appendChild() {} } };
globalThis.window = globalThis.window || globalThis;
test('un producto con varios códigos se encuentra escaneando cualquiera', async () => {
  const { findByCode, codigosDe } = await import('./scanner.js');
  const l = [{ id: 'a', n: 'Pepsi 2 L', s: '7791813421535', s2: ['7791813421542'] }, { id: 'b', n: 'Yerba', s: '7790123400001' }];
  assert.equal(findByCode(l, '7791813421542').id, 'a');
  assert.equal(findByCode(l, '7791813421535').id, 'a');
  assert.equal(findByCode(l, '7790123400001').id, 'b');
  assert.equal(findByCode(l, '123'), null);
  assert.deepEqual(codigosDe(l[0]), ['7791813421535', '7791813421542']);
});
