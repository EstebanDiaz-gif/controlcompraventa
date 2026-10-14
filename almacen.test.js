// node --test almacen.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { pnum, fq, cartTotals, newAvgCost, roundPrice, match, lastMonths, lineTotal } from './almacen-calc.js';

test('pnum acepta coma o punto decimal', () => {
  assert.equal(pnum('0,250'), 0.25);
  assert.equal(pnum('0.250'), 0.25);
  assert.equal(pnum('1,5'), 1.5);
  assert.equal(pnum(' 2 '), 2);
  assert.ok(Number.isNaN(pnum('')));
});

test('venta por peso: kilos por precio por kilo', () => {
  assert.equal(lineTotal({ q: 0.25, u: 12000 }), 3000);
  assert.equal(lineTotal({ q: 0.333, u: 9000 }), 2997);
  assert.equal(fq(0.25, true), '0,25 kg');
  assert.equal(fq(3, false), '3');
});

test('totales del carrito con costo', () => {
  const t = cartTotals([{ q: 2, u: 1500, c: 1000 }, { q: 0.5, u: 8000, c: 5000 }]);
  assert.deepEqual(t, { tot: 7000, cost: 4500 });
});

test('costo promedio ponderado al reponer', () => {
  assert.equal(newAvgCost(10, 100, 10, 200), 150);
  assert.equal(newAvgCost(0, 0, 5, 300), 300);
  assert.equal(newAvgCost(-3, 100, 6, 200), 200); // el stock negativo no pesa
});

test('redondeo de precios al aumentar', () => {
  assert.equal(roundPrice(1234 * 1.1, 10), 1360);
  assert.equal(roundPrice(1234 * 1.1, 100), 1400);
  assert.equal(roundPrice(1357.4, 1), 1357);
});

test('búsqueda por palabras sueltas', () => {
  assert.ok(match('Galletitas Oreo 118 g', 'oreo gall'));
  assert.ok(!match('Galletitas Oreo', 'chocolinas'));
  assert.ok(match('cualquier cosa', ''));
});

test('últimos meses cruzando el año', () => {
  assert.deepEqual(lastMonths(3, '2026-02'), ['2026-02', '2026-01', '2025-12']);
});

import { buildLista, pubQty } from './almacen-calc.js';
test('lista del catálogo: solo productos visibles, con precio y stock', () => {
  const P = [
    { id: 'a', n: 'Coca', pn: 2500, q: 30, cat: 'Bebidas' },
    { id: 'b', n: 'Queso', pn: 9000, q: 1.3, w: true, img: 'data:x' },
    { id: 'c', n: 'Sin stock', pn: 100, q: 0 },
    { id: 'd', n: 'Oculto', pn: 100, q: 5, oh: true },
    { id: 'e', n: 'Sin precio', pn: 0, q: 5 }
  ];
  const L = buildLista(P);
  assert.equal(L.count, 2);
  assert.deepEqual(L.data[0], [{ i: 'a', n: 'Coca', p: 2500, q: 10, c: 'Bebidas' }, { i: 'b', n: 'Queso', p: 9000, q: 1.25, w: 1, f: 1 }]);
  assert.deepEqual(L.imgs, [[{ i: 'b', f: 'data:x' }]]);
  // vender 1 Coca de 30 no cambia la lista (no hay que republicar)
  assert.equal(buildLista([{ ...P[0], q: 29 }, P[1]]).h, L.h);
  assert.notEqual(buildLista([{ ...P[0], pn: 2600 }, P[1]]).h, L.h);
  assert.equal(pubQty(0.2, true), 0);
});
test('lista del catálogo: se parte en varios documentos si es grande', () => {
  const P = Array.from({ length: 3000 }, (_, i) => ({ id: 'p' + i, n: 'Producto número ' + i, pn: 1000 + i, q: 5, cat: 'Almacén' }));
  const L = buildLista(P, 100000);
  assert.ok(L.data.length > 1);
  assert.equal(L.data.flat().length, 3000);
  L.data.forEach((c) => assert.ok(JSON.stringify(c).length < 100000));
});
