import { test } from 'node:test';
import assert from 'node:assert/strict';
import { num, codigo, siNo, parseCsv, detectar, armar, plan, ejemploCsv } from './planilla.js';

test('planilla: precios en formato argentino y otros', () => {
  assert.equal(num('$ 1.234,50'), 1234.5);
  assert.equal(num('1.234'), 1234);
  assert.equal(num('1,234.50'), 1234.5);
  assert.equal(num('1234.5'), 1234.5);
  assert.equal(num('3,5'), 3.5);
  assert.equal(num(2800), 2800);
  assert.ok(isNaN(num('consultar')));
});
test('planilla: códigos de barras guardados como número', () => {
  assert.equal(codigo(7790895000997), '7790895000997');
  assert.equal(codigo('7.790895000997E+12'), '7790895000997');
  assert.equal(codigo('7790895000997.0'), '7790895000997');
  assert.equal(codigo(''), '');
  assert.ok(siNo('Sí') && siNo('kg') && !siNo('no') && !siNo(''));
});
test('planilla: CSV con ; comillas y acentos', () => {
  const r = parseCsv('﻿Nombre;Precio\r\n"Galletitas ""Oreo""";1.200,50\r\nYerba;4200\r\n\r\n');
  assert.deepEqual(r, [['Nombre', 'Precio'], ['Galletitas "Oreo"', '1.200,50'], ['Yerba', '4200']]);
  assert.equal(parseCsv(ejemploCsv()).length, 5);
});
test('planilla: detecta la fila de títulos y las columnas', () => {
  const rows = [['Lista de precios octubre'], [], ['Cód. Barra', 'Descripción', 'Rubro', 'P. Costo', 'Precio Venta', 'Existencia']];
  const d = detectar(rows.filter((r) => r.length));
  assert.equal(d.head, 1);
  assert.deepEqual(d.map, { n: 1, s: 0, pn: 4, c: 3, q: 5, cat: 2 });
  const d2 = detectar([['Código', 'Artículo', 'Código de barras', 'Precio']]);
  assert.equal(d2.map.s, 2);
  const d3 = detectar([['Código', 'Cód. Barra', 'Descripción', 'Precio Venta']]);
  assert.equal(d3.map.s, 1);
  assert.equal(d3.map.n, 2);
  assert.equal(d2.map.n, 1);
});
test('planilla: arma productos, saltea errores y repetidos', () => {
  const rows = [['Nombre', 'Código', 'Precio', 'Stock', 'Por peso'],
    ['Coca 2,25', 7790895000997, 3100, 24, 'no'],
    ['', '', '', '', ''],
    ['Sin precio válido', '', 'consultar', 1, ''],
    ['Queso', '', '9.500', '3,5', 'sí'],
    ['Coca 2,25 L', 7790895000997, 3200, 30, 'no'],
    ['', 123, 10, 1, '']];
  const { items, errores } = armar(rows, 0, { n: 0, s: 1, pn: 2, q: 3, w: 4 });
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], { fila: 6, n: 'Coca 2,25 L', s: '7790895000997', pn: 3200, q: 30, w: false, dup: 1 });
  assert.deepEqual(items[1], { fila: 4, n: 'Sin precio válido', pn: 0, q: 1, w: false });
  assert.deepEqual(items[2], { fila: 5, n: 'Queso', pn: 9500, q: 3.5, w: true });
  assert.deepEqual(errores.map((e) => e.fila), [7]);
});
test('planilla: compara con lo que ya existe por código o por nombre', () => {
  const ex = [{ id: 'a', n: 'Coca-Cola 2,25 L', s: '7790895000997' }, { id: 'b', n: 'Yerba Playadito 1 kg', s: '' }];
  const { nuevos, actualizar } = plan([
    { n: 'Coca 2.25', s: '7790895000997' }, { n: 'yerba playadito 1 KG' }, { n: 'Fideos', s: '123' }
  ], ex);
  assert.deepEqual(actualizar.map((x) => x.p.id), ['a', 'b']);
  assert.deepEqual(nuevos.map((x) => x.n), ['Fideos']);
});
