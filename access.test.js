import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAccess, addPeriod, deriveState, DAY } from '../lib/access.js';

const T0 = Date.UTC(2026, 9, 13);
const base = { config: null, trialStartMs: T0 };

test('prueba de 14 días: vigente el día 13, vencida el 15', () => {
  assert.equal(computeAccess({ ...base, nowMs: T0 + 13 * DAY }).state, 'trial');
  const e = computeAccess({ ...base, nowMs: T0 + 15 * DAY });
  assert.equal(e.state, 'expired'); assert.equal(e.active, false);
});
test('durante la prueba rigen los límites del plan de prueba', () => {
  const c = computeAccess({ ...base, nowMs: T0 });
  assert.deepEqual(c.limits, { admins: 2, empleados: 4, sucursales: 1 });
});
test('acceso gratuito permanente: sin vencimiento ni límites', () => {
  const c = computeAccess({ nowMs: T0 + 9999 * DAY, config: null, grants: [{ id: 'g', type: 'free_forever', status: 'active' }] });
  assert.equal(c.state, 'free_forever'); assert.equal(c.unlimited, true); assert.equal(c.activeUntilMs, null);
  assert.deepEqual(c.limits, { admins: null, empleados: null, sucursales: null });
});
test('un beneficio revocado deja de valer', () => {
  const c = computeAccess({ nowMs: T0, config: null, grants: [{ id: 'g', type: 'free_forever', status: 'revoked' }] });
  assert.equal(c.state, 'expired');
});
test('tienda del propietario de la plataforma: sin cobro ni límites', () => {
  const c = computeAccess({ nowMs: T0 + 5000 * DAY, config: null, ownerFree: true });
  assert.equal(c.state, 'owner_free'); assert.equal(c.unlimited, true);
});
test('acceso gratuito temporal: vigente y luego vencido', () => {
  const g = [{ id: 'g', type: 'free_timed', status: 'active', startMs: T0, endMs: T0 + 30 * DAY }];
  assert.equal(computeAccess({ nowMs: T0 + 10 * DAY, config: null, grants: g }).state, 'free_timed');
  assert.equal(computeAccess({ nowMs: T0 + 31 * DAY, config: null, grants: g }).state, 'expired');
});
test('ampliar la prueba suma tiempo', () => {
  const g = [{ id: 'g', type: 'trial_extension', status: 'active', addedMs: 30 * DAY }];
  assert.equal(computeAccess({ ...base, nowMs: T0 + 40 * DAY, grants: g }).state, 'trial');
  assert.equal(computeAccess({ ...base, nowMs: T0 + 45 * DAY, grants: g }).state, 'expired');
});
test('extender suscripción: cortesía sobre el vencimiento pagado', () => {
  const c = computeAccess({ nowMs: T0 + 35 * DAY, config: null, paidPlan: 'profesional', paidUntilMs: T0 + 30 * DAY, grants: [{ id: 'g', type: 'subscription_extension', status: 'active', addedMs: 10 * DAY }] });
  assert.equal(c.state, 'paid'); assert.equal(c.effectivePlan, 'profesional');
  assert.deepEqual(c.limits, { admins: 4, empleados: 10, sucursales: 3 });
});
test('plan superior temporal con límites propios, y vuelve al terminar', () => {
  const g = [{ id: 'g', type: 'plan_upgrade', status: 'active', startMs: T0, endMs: T0 + 10 * DAY, plan: 'empresarial', limits: { empleados: 50 } }];
  const a = computeAccess({ ...base, nowMs: T0 + DAY, grants: g });
  assert.equal(a.effectivePlan, 'empresarial'); assert.equal(a.limits.empleados, 50); assert.equal(a.limits.admins, 10);
  const b = computeAccess({ ...base, nowMs: T0 + 11 * DAY, grants: g });
  assert.equal(b.effectivePlan, 'inicial'); assert.equal(b.limits.empleados, 4);
});
test('addPeriod respeta meses y años de calendario', () => {
  assert.equal(new Date(addPeriod(Date.UTC(2026, 0, 15), { months: 1 })).toISOString().slice(0, 10), '2026-02-15');
  assert.equal(new Date(addPeriod(Date.UTC(2026, 0, 15), { years: 2 })).toISOString().slice(0, 10), '2028-01-15');
  assert.throws(() => addPeriod(T0, { days: 0 }));
  assert.throws(() => addPeriod(T0, { days: -3 }));
});
test('deriveState elige la fase vigente según la hora', () => {
  const c = computeAccess({ ...base, nowMs: T0 });
  const doc = { phases: c.phases };
  assert.equal(deriveState(doc, T0 + 2 * DAY).state, 'trial');
  assert.equal(deriveState(doc, T0 + 2 * DAY).daysLeft, 12);
  assert.equal(deriveState(doc, T0 + 20 * DAY).state, 'expired');
});
