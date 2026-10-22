import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normDur, lockIds, libres, rangos, dias, elegirPro, desdeHoy, hm, toMin, rowsToH, hToRows, busyFromTurnos, DEF_H, weekday } from './turnos.js';

const cfg = { paso: 30, h: { ...DEF_H }, cz: ['2026-10-31'] }; // 2026-10-24 es sábado, 25 domingo

test('turnos: duración en bloques de 15 y bloques que ocupa', () => {
  assert.equal(normDur(40), 45); assert.equal(normDur(0), 15); assert.equal(normDur(30), 30);
  assert.deepEqual(lockIds('2026-10-24', 'u1', 600, 645), ['2026-10-24_u1_600', '2026-10-24_u1_615', '2026-10-24_u1_630']);
});
test('turnos: días con atención (domingo cerrado y feriados)', () => {
  assert.equal(weekday('2026-10-25'), 0);
  assert.deepEqual(rangos(cfg, '2026-10-25'), []);
  assert.deepEqual(rangos(cfg, '2026-10-31'), []);
  assert.deepEqual(rangos(cfg, '2026-10-24'), [[540, 1200]]);
  assert.deepEqual(dias(cfg, '2026-10-24', 3), ['2026-10-24', '2026-10-26']);
});
test('turnos: horarios libres respetan lo ocupado de cada profesional', () => {
  const busy = busyFromTurnos([{ d: '2026-10-24', e: 'a', i: 600, f: 660 }]); // a: 10:00 a 11:00
  const l = libres(cfg, '2026-10-24', 45, ['a', 'b'], busy);
  const at = (m) => l.find((x) => x.m === m);
  assert.deepEqual(at(540).pros, ['a', 'b']);       // 9:00 libre para los dos
  assert.deepEqual(at(570).pros, ['b']);            // 9:30 + 45 min pisa las 10:00 de a
  assert.deepEqual(at(600).pros, ['b']);
  assert.deepEqual(at(660).pros, ['a', 'b']);       // 11:00 libre otra vez
  assert.equal(l[l.length - 1].m, 1140);            // último que termina antes de las 20
  assert.equal(libres(cfg, '2026-10-24', 45, ['a'], busy, 700)[0].m, 720); // hoy, desde las 11:40
});
test('turnos: "cualquiera" elige al que tiene menos turnos', () => {
  const busy = busyFromTurnos([{ d: '2026-10-24', e: 'a', i: 600, f: 660 }]);
  assert.equal(elegirPro(['a', 'b'], busy, '2026-10-24'), 'b');
});
test('turnos: anticipación mínima y días pasados', () => {
  const now = new Date(2026, 9, 24, 10, 20);
  assert.equal(desdeHoy('2026-10-24', now, 60), 680);
  assert.equal(desdeHoy('2026-10-26', now, 60), null);
  assert.equal(desdeHoy('2026-10-23', now, 60), 1e9);
});
test('turnos: horarios editables ida y vuelta', () => {
  assert.equal(hm(570), '09:30'); assert.equal(toMin('9:30'), 570); assert.ok(isNaN(toMin('25:00')));
  const rows = hToRows(DEF_H); rows[1].push(['16:00', '20:00']); rows[1][0] = ['09:00', '13:00']; rows[2] = [['10:00', '09:00']];
  const h = rowsToH(rows);
  assert.deepEqual(h[1], [540, 780, 960, 1200]);
  assert.deepEqual(h[2], []); // franja inválida se descarta
});
