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

test('ropa: detecta modelo, talle, mayorista y código de barras', async () => {
  const { detectar, filas, CAMPOS_ROPA } = await import('./planilla.js');
  const rows = [['Mi planilla de stock'], ['Artículo', 'Cód.', 'Talle', 'Cód. barras', 'Cantidad', 'Precio mayorista', 'Precio', 'Costo', 'Rubro'],
    ['Zapatilla Urbana', 'ZU-1', '38', '7791234567893', '2', '$ 60.000', '$ 89.000', '45000', 'Zapatillas'], ['Zapatilla Urbana', 'ZU-1', 39, '', 1, '60000', '89000', '45000', 'Zapatillas'], ['', '', '', '', '', '', '', '', ''], ['', 'X', '40', '', 3, '', '1000', '', '']];
  const d = detectar(rows, CAMPOS_ROPA);
  assert.equal(d.head, 1);
  assert.deepEqual([d.map.n, d.map.s, d.map.z, d.map.cb, d.map.q, d.map.pm, d.map.pn, d.map.c, d.map.cat], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const r = filas(rows, d.head, d.map, CAMPOS_ROPA);
  assert.equal(r.items.length, 2); assert.equal(r.errores.length, 1);
  assert.deepEqual(r.items[0], { fila: 3, n: 'Zapatilla Urbana', s: 'ZU-1', z: '38', cb: '7791234567893', q: 2, pm: 60000, pn: 89000, c: 45000, cat: 'Zapatillas' });
  assert.equal(r.items[1].z, '39');
});
test('fiado: detecta cliente, teléfono y saldo', async () => {
  const { detectar, filas, CAMPOS_FIADO } = await import('./planilla.js');
  const rows = [['Apellido y nombre', 'Celular', 'Saldo'], ['Pérez Juan', '381 555 1234', '12.500,50'], ['Ana', '', '0']];
  const d = detectar(rows, CAMPOS_FIADO);
  const r = filas(rows, d.head, d.map, CAMPOS_FIADO);
  assert.deepEqual(r.items[0], { fila: 2, n: 'Pérez Juan', t: '381 555 1234', d: 12500.5 });
  assert.equal(r.items[1].d, 0);
});
