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
test('lista del catálogo: descripción, precio anterior y destacado', () => {
  const L = buildLista([
    { id: 'a', n: 'Dulce de leche 200 g', pn: 1800, q: 6, d: 'Clásico', pa: 2200, dt: true },
    { id: 'b', n: 'Yerba 1 kg', pn: 4000, q: 6, pa: 3500 },
    { id: 'c', n: 'Alfajor', pn: 900, q: 6, dt: 2 }
  ]);
  // dt: true (marcado antes de poder ordenar) va al final (999); un número es el orden elegido
  assert.deepEqual(L.data[0], [{ i: 'c', n: 'Alfajor', p: 900, q: pubQty(6), t: 2 }, { i: 'a', n: 'Dulce de leche 200 g', p: 1800, q: pubQty(6), d: 'Clásico', a: 2200, t: 999 }, { i: 'b', n: 'Yerba 1 kg', p: 4000, q: pubQty(6) }]);
});
test('lista del catálogo: se parte en varios documentos si es grande', () => {
  const P = Array.from({ length: 3000 }, (_, i) => ({ id: 'p' + i, n: 'Producto número ' + i, pn: 1000 + i, q: 5, cat: 'Almacén' }));
  const L = buildLista(P, 100000);
  assert.ok(L.data.length > 1);
  assert.equal(L.data.flat().length, 3000);
  L.data.forEach((c) => assert.ok(JSON.stringify(c).length < 100000));
});

import { descuento, repartir, vigentes, tituloCant, precioNormal, ahorro } from './promos.js';
test('promos: vigentes respeta pausa y vencimiento', () => {
  const L = [{ id: 'a', t: 'combo', on: true }, { id: 'b', t: 'combo', on: false }, { id: 'c', t: 'combo', hasta: 1000 }, { id: 'd', t: 'combo', hasta: 5000 }];
  assert.deepEqual(vigentes(L, 2000).map((p) => p.id), ['a', 'd']);
});
test('promos: descuento por cantidad (por categoría y el mejor)', () => {
  const L = [{ t: 'cant', min: 2, pct: 10 }, { t: 'cant', min: 3, pct: 20, cat: 'Zapatillas' }];
  const lin = [{ cat: 'Zapatillas', unidades: 2, total: 100000 }, { cat: 'Remeras', unidades: 1, total: 20000 }];
  let r = descuento(L, 0, lin);
  assert.equal(r.mejor.monto, 12000); assert.deepEqual(r.mejor.idx, [0, 1]);
  r = descuento(L, 0, [{ cat: 'Zapatillas', unidades: 3, total: 150000 }]);
  assert.equal(r.mejor.monto, 30000); assert.equal(r.mejor.p.pct, 20);
  r = descuento(L, 0, [{ cat: 'Zapatillas', unidades: 1, total: 50000 }]);
  assert.equal(r.mejor, null); assert.equal(r.cerca.faltan, 1);
  assert.equal(tituloCant(L[1], 'prendas'), 'Llevando 3 o más, 20% OFF en Zapatillas');
  assert.equal(tituloCant(L[0], 'prendas'), 'Llevando 2 o más prendas, 10% OFF');
});
test('promos: reparto del precio del combo', () => {
  const a = repartir(10000, [9000, 2750]);
  assert.equal(a[0] + a[1], 10000); assert.equal(a[0], 7660);
  assert.deepEqual(repartir(100, [0, 0]), [50, 50]);
  assert.equal(precioNormal([{ id: 'f', q: 1 }, { id: 'c', q: 2 }], (id) => ({ f: 9000, c: 2750 })[id]), 14500);
  assert.equal(ahorro({ precio: 12000, antes: 14500 }), 17);
});

test('lista del catálogo: los productos sin control de stock se muestran aunque tengan 0', async () => {
  const { buildLista } = await import('./almacen-calc.js');
  const L = buildLista([
    { id: 'a', n: 'Jamón cocido', pn: 12000, q: 0, w: true, ns: true },
    { id: 'b', n: 'Queso cremoso', pn: 9000, q: -2.5, w: true, ns: true },
    { id: 'c', n: 'Pan de miga', pn: 3000, q: 0, ns: true },
    { id: 'd', n: 'Yerba', pn: 4000, q: 0 }
  ]);
  const d = L.data[0];
  assert.deepEqual(d.map((x) => [x.n, x.q]), [['Jamón cocido', 5], ['Pan de miga', 10], ['Queso cremoso', 5]]);
});

test('caja: billetes sugeridos, partes del pago y efectivo esperado', async () => {
  const { billetes, partes, payLabel, esperado } = await import('./almacen-calc.js');
  assert.deepEqual(billetes(11750), [12000, 15000, 20000]);
  assert.deepEqual(billetes(850), [1000, 2000, 5000, 10000]);
  assert.deepEqual(billetes(20000), []);
  assert.deepEqual(partes({ pay: 'tr', tot: 500 }), { tr: 500 });
  assert.deepEqual(partes({ pay: 'mix', tot: 500, pp: { ef: 200, qr: 300 } }), { ef: 200, qr: 300 });
  assert.equal(payLabel({ pay: 'mix', pp: { ef: 1, tr: 2 } }), 'Efectivo + Transferencia');
  assert.equal(esperado({ ini: 5000, p: { ef: 12000, tr: 3000 }, c: { ef: 2000 }, ing: 1000, ret: 4000 }), 16000);
});
test('balanza: lee peso o importe de la etiqueta', async () => {
  const { balanza, eanOk, porPlu } = await import('./almacen-calc.js');
  const mk = (d12) => { let s = 0; for (let i = 0; i < 12; i++) s += (+d12[i]) * (i % 2 ? 3 : 1); return d12 + ((10 - (s % 10)) % 10); };
  const c1 = mk('200012301250');            // PLU 00123, 1250 g
  assert.ok(eanOk(c1));
  assert.deepEqual(balanza(c1, { on: true, plu: 5, val: 'peso' }), { plu: '00123', kg: 1.25 });
  assert.deepEqual(balanza(mk('210123004500'), { on: true, plu: 4, val: 'precio' }), { plu: '0123', importe: 4500 });
  assert.equal(balanza(c1, { on: false }), null);
  assert.equal(balanza('7790895000997', { on: true }), null);
  assert.equal(balanza(c1.slice(0, 12) + '0', { on: true }), null);   // dígito verificador mal
  const L = [{ id: 'a', s: '123', w: true }, { id: 'b', s: '7790895000997' }];
  assert.equal(porPlu(L, '00123').id, 'a');
  assert.equal(porPlu(L, '0999'), null);
});
test('ranking de vendidos, sin ventas y CSV', async () => {
  const { ranking, sinVentas, csv } = await import('./almacen-calc.js');
  const P = [{ id: 'a', n: 'Coca', q: 5, c: 100 }, { id: 'b', n: 'Queso', q: 2, c: 900, w: true }, { id: 'c', n: 'Yerba', q: 3, c: 300 }, { id: 'd', n: 'Jamón', q: 0, ns: true }];
  const pr = { a: { q: 10, v: 30000 }, b: { q: 1.5, v: 14000 }, x: { q: 1, v: 100, n: 'Viejo' } };
  assert.deepEqual(ranking(pr, P).map((r) => r.n), ['Coca', 'Queso', 'Viejo']);
  assert.deepEqual(ranking(pr, P, 'q').map((r) => r.n), ['Coca', 'Queso', 'Viejo']);
  assert.deepEqual(sinVentas(pr, P).map((p) => p.n), ['Yerba']);
  assert.equal(csv([['Nombre', 'Precio'], ['Pan "lactal"; grande', 1.5]]), '﻿Nombre;Precio\r\n"Pan ""lactal""; grande";1,5\r\n');
});
