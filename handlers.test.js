import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './fakedb.js';
import * as H from '../lib/handlers.js';

const OWNER = 'uOwner';
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof H.AppError && (!code || e.code === code));
async function newStoreFor(env, uid, name = 'Tienda') { return H.createStore(env.deps, { uid, email: uid + '@x.com', name }); }
async function inviteAndJoin(env, sid, adminUid, role, uid) {
  const { code } = await H.createInvite(env.deps, { uid: adminUid, sid, role });
  return H.joinStore(env.deps, { uid, email: uid + '@x.com', code });
}

test('crear tienda: prueba de 14 días, el creador queda como administrador', async () => {
  const env = makeEnv();
  const r = await newStoreFor(env, 'u1', '  Pekeron  ');
  assert.equal(r.name, 'Pekeron'); assert.equal(r.trial, true);
  assert.equal(env.data.get(`stores/${r.sid}/members/u1`).role, 'admin');
  const a = env.data.get(`stores/${r.sid}/billing/access`);
  assert.equal(a.state, 'trial'); assert.equal(a.trialStartMs, env.clock.t);
  assert.ok(a.activeUntil && a.activeUntilMs === env.clock.t + 14 * 86400000);
});
test('el nombre de la tienda es obligatorio', async () => {
  await rejects(newStoreFor(makeEnv(), 'u1', '   '), 'invalid-argument');
});
test('una sola prueba gratuita por cuenta: la segunda tienda nace sin prueba', async () => {
  const env = makeEnv();
  await newStoreFor(env, 'u1', 'A');
  const b = await newStoreFor(env, 'u1', 'B');
  assert.equal(b.trial, false);
  assert.equal(env.data.get(`stores/${b.sid}/billing/access`).state, 'expired');
});
test('las tiendas del propietario de la plataforma no tienen cobro ni límites', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const a = await newStoreFor(env, OWNER, 'Mia 1'), b = await newStoreFor(env, OWNER, 'Mia 2');
  for (const s of [a, b]) {
    const d = env.data.get(`stores/${s.sid}/billing/access`);
    assert.equal(d.state, 'owner_free'); assert.equal(d.unlimited, true); assert.equal(d.activeUntil, null);
    assert.deepEqual(d.limits, { admins: null, empleados: null, sucursales: null });
  }
});
test('solo un administrador puede crear invitaciones', async () => {
  const env = makeEnv();
  const { sid } = await newStoreFor(env, 'u1');
  await inviteAndJoin(env, sid, 'u1', 'empleado', 'u2');
  await rejects(H.createInvite(env.deps, { uid: 'u2', sid, role: 'empleado' }), 'permission-denied');
  await rejects(H.createInvite(env.deps, { uid: 'u9', sid, role: 'empleado' }), 'permission-denied');
  await rejects(H.createInvite(env.deps, { uid: 'u1', sid, role: 'superadmin' }), 'invalid-argument');
});
test('el rol sale de la invitación guardada, no de lo que mande el cliente', async () => {
  const env = makeEnv();
  const { sid } = await newStoreFor(env, 'u1');
  const { code } = await H.createInvite(env.deps, { uid: 'u1', sid, role: 'empleado' });
  const r = await H.joinStore(env.deps, { uid: 'u2', email: 'u2@x.com', code, role: 'admin' });
  assert.equal(r.role, 'empleado');
  assert.equal(env.data.get(`stores/${sid}/members/u2`).role, 'empleado');
});
test('un código no sirve en otra tienda ni si fue anulado', async () => {
  const env = makeEnv();
  const a = await newStoreFor(env, 'u1', 'A'), b = await newStoreFor(env, 'u3', 'B');
  const { code } = await H.createInvite(env.deps, { uid: 'u1', sid: a.sid, role: 'empleado' });
  const forged = b.sid + code.slice(10);
  await rejects(H.joinStore(env.deps, { uid: 'u2', email: 'u2@x.com', code: forged }), 'not-found');
  await env.db.doc(`stores/${a.sid}/invites/${code.slice(10)}`).delete(); // anulación manual
  await rejects(H.joinStore(env.deps, { uid: 'u2', email: 'u2@x.com', code }), 'not-found');
  await rejects(H.joinStore(env.deps, { uid: 'u2', email: 'u2@x.com', code: 'abc' }), 'invalid-argument');
});
test('un empleado no puede ascender usando un código de administrador', async () => {
  const env = makeEnv();
  const { sid } = await newStoreFor(env, 'u1');
  await inviteAndJoin(env, sid, 'u1', 'empleado', 'u2');
  const { code } = await H.createInvite(env.deps, { uid: 'u1', sid, role: 'admin' });
  const r = await H.joinStore(env.deps, { uid: 'u2', email: 'u2@x.com', code });
  assert.equal(r.already, true); assert.equal(r.role, 'empleado');
  assert.equal(env.data.get(`stores/${sid}/members/u2`).role, 'empleado');
});
test('límites del plan: 4 empleados y 2 administradores en la prueba', async () => {
  const env = makeEnv();
  const { sid } = await newStoreFor(env, 'u1');
  for (let i = 0; i < 4; i++) await inviteAndJoin(env, sid, 'u1', 'empleado', 'e' + i);
  await rejects(inviteAndJoin(env, sid, 'u1', 'empleado', 'e9'), 'resource-exhausted');
  await inviteAndJoin(env, sid, 'u1', 'admin', 'a2');
  await rejects(inviteAndJoin(env, sid, 'u1', 'admin', 'a3'), 'resource-exhausted');
});
test('carrera: seis personas con el mismo código y lugar para cuatro: entran solo cuatro', async () => {
  const env = makeEnv();
  const { sid } = await newStoreFor(env, 'u1');
  const { code } = await H.createInvite(env.deps, { uid: 'u1', sid, role: 'empleado' });
  const res = await Promise.allSettled([1, 2, 3, 4, 5, 6].map((i) => H.joinStore(env.deps, { uid: 'p' + i, email: 'p' + i + '@x.com', code })));
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 4);
  assert.equal(res.filter((r) => r.status === 'rejected').length, 2);
  assert.equal(env.data.get(`stores/${sid}/invites/${code.slice(10)}`).uses, 4); // el código sigue activo hasta que se anule
});
test('con la prueba vencida no se puede invitar ni unirse, pero los datos siguen', async () => {
  const env = makeEnv();
  const { sid } = await newStoreFor(env, 'u1');
  const { code } = await H.createInvite(env.deps, { uid: 'u1', sid, role: 'empleado' });
  env.day(15);
  await rejects(H.createInvite(env.deps, { uid: 'u1', sid, role: 'empleado' }), 'failed-precondition');
  await rejects(H.joinStore(env.deps, { uid: 'u2', email: 'u2@x.com', code }), 'failed-precondition');
  assert.ok(env.data.get(`stores/${sid}/members/u1`));
});
test('un cliente no puede usar funciones del propietario', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const { sid } = await newStoreFor(env, 'u1');
  const call = (fn, extra = {}) => fn(env.deps, { uid: 'u1', sid, reason: 'x', ...extra });
  await rejects(call(H.ownerGrantBenefit, { type: 'free_forever' }), 'permission-denied');
  await rejects(call(H.ownerRevokeBenefit, { grantId: 'g' }), 'permission-denied');
  await rejects(call(H.ownerListStores), 'permission-denied');
  await rejects(call(H.ownerStoreDetail), 'permission-denied');
  await rejects(call(H.ownerSetPlanConfig, { config: {} }), 'permission-denied');
  await rejects(call(H.ownerMigrateLegacy), 'permission-denied');
  await rejects(H.ownerListStores(env.deps, { uid: undefined }), 'permission-denied');
});
test('beneficio A: acceso gratuito permanente, con auditoría', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const { sid } = await newStoreFor(env, 'u1');
  env.day(30);
  const r = await H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'free_forever', reason: 'socio' });
  assert.equal(r.before.state, 'expired'); assert.equal(r.after.state, 'free_forever');
  const a = env.data.get(`stores/${sid}/billing/access`);
  assert.equal(a.unlimited, true); assert.equal(a.activeUntil, null);
  const audit = [...env.data.entries()].filter(([k]) => k.startsWith('audit/')).map(([, v]) => v);
  assert.equal(audit.length, 1); assert.equal(audit[0].by, OWNER); assert.equal(audit[0].reason, 'socio'); assert.equal(audit[0].before.state, 'expired');
  await rejects(H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'free_forever', reason: '   ' }), 'invalid-argument');
});
test('beneficio B: acceso gratuito por 3 meses y luego vuelve a vencer', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const { sid } = await newStoreFor(env, 'u1');
  env.day(20);
  await H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'free_timed', params: { months: 3 }, reason: 'promo' });
  assert.equal(env.data.get(`stores/${sid}/billing/access`).state, 'free_timed');
  const a = env.data.get(`stores/${sid}/billing/access`);
  assert.ok(a.activeUntilMs > env.clock.t + 85 * 86400000);
  await rejects(H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'free_timed', params: { startDate: '2099-01-01', endDate: '2099-02-01' }, reason: 'x' }), 'invalid-argument');
  await rejects(H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'free_timed', params: { days: 0 }, reason: 'x' }), 'invalid-argument');
});
test('beneficio C: ampliar la prueba registra vencimiento anterior y nuevo', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const { sid } = await newStoreFor(env, 'u1');
  const r = await H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'trial_extension', params: { days: 7 }, reason: 'necesita más tiempo' });
  assert.equal(r.after.trialEndMs - r.before.trialEndMs, 7 * 86400000);
  const audit = [...env.data.entries()].find(([k]) => k.startsWith('audit/'))[1];
  assert.equal(audit.addedMs, 7 * 86400000); assert.equal(audit.before.trialEndMs, r.before.trialEndMs); assert.equal(audit.after.trialEndMs, r.after.trialEndMs);
});
test('ampliar la prueba de una tienda ya vencida cuenta desde hoy', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const { sid } = await newStoreFor(env, 'u1');
  env.day(40);
  await H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'trial_extension', params: { days: 7 }, reason: 'x' });
  const a = env.data.get(`stores/${sid}/billing/access`);
  assert.equal(a.state, 'trial'); assert.equal(a.trialEndMs, env.clock.t + 7 * 86400000);
});
test('beneficio D: extender suscripción exige una suscripción activa', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const { sid } = await newStoreFor(env, 'u1');
  await rejects(H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'subscription_extension', params: { months: 1 }, reason: 'x' }), 'invalid-argument');
  // simula una suscripción pagada (la cargará el webhook de pagos en la fase de pagos)
  await env.db.doc(`stores/${sid}/billing/access`).set({ paidPlan: 'profesional', paidUntilMs: env.clock.t + 10 * 86400000 }, { merge: true });
  const r = await H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'subscription_extension', params: { months: 1 }, reason: 'cortesía' });
  assert.ok(r.after.paidUntilMs > r.before.paidUntilMs + 27 * 86400000);
});
test('beneficio E: plan superior temporal con límites propios; al revocar vuelve el plan base', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const { sid } = await newStoreFor(env, 'u1');
  const g = await H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'plan_upgrade', params: { plan: 'empresarial', empleados: 40, months: 2 }, reason: 'piloto' });
  let a = env.data.get(`stores/${sid}/billing/access`);
  assert.equal(a.effectivePlan, 'empresarial'); assert.equal(a.limits.empleados, 40); assert.equal(a.limits.admins, 10);
  await H.ownerRevokeBenefit(env.deps, { uid: OWNER, sid, grantId: g.grantId, reason: 'fin del piloto' });
  a = env.data.get(`stores/${sid}/billing/access`);
  assert.equal(a.effectivePlan, 'inicial'); assert.equal(a.limits.empleados, 4);
  assert.equal(env.data.get(`stores/${sid}/grants/${g.grantId}`).status, 'revoked');
  await rejects(H.ownerRevokeBenefit(env.deps, { uid: OWNER, sid, grantId: g.grantId, reason: 'otra vez' }), 'failed-precondition');
});
test('si un beneficio termina y hay más miembros que el límite, nadie se borra pero no entra nadie más', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const { sid } = await newStoreFor(env, 'u1');
  const g = await H.ownerGrantBenefit(env.deps, { uid: OWNER, sid, type: 'plan_upgrade', params: { plan: 'profesional' }, reason: 'x' });
  for (let i = 0; i < 6; i++) await inviteAndJoin(env, sid, 'u1', 'empleado', 'e' + i);
  await H.ownerRevokeBenefit(env.deps, { uid: OWNER, sid, grantId: g.grantId, reason: 'fin' });
  const n = [...env.data.keys()].filter((k) => k.startsWith(`stores/${sid}/members/e`)).length;
  assert.equal(n, 6);
  await rejects(inviteAndJoin(env, sid, 'u1', 'empleado', 'e7'), 'resource-exhausted');
});
test('configuración de planes: se valida y cambia los límites nuevos', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const cfg = { trialDays: 14, trialPlan: 'inicial', plans: { inicial: { priceARS: 15999, admins: 2, empleados: 2, sucursales: 1 }, profesional: { priceARS: 24999, admins: 4, empleados: 10, sucursales: 3 }, empresarial: { priceARS: 55999, admins: 10, empleados: 30, sucursales: 10 } } };
  await rejects(H.ownerSetPlanConfig(env.deps, { uid: OWNER, config: { ...cfg, trialDays: -1 } }), 'invalid-argument');
  await rejects(H.ownerSetPlanConfig(env.deps, { uid: OWNER, config: { ...cfg, plans: { ...cfg.plans, inicial: { ...cfg.plans.inicial, admins: 'mil' } } } }), 'invalid-argument');
  await H.ownerSetPlanConfig(env.deps, { uid: OWNER, config: cfg });
  const { sid } = await newStoreFor(env, 'u1');
  await inviteAndJoin(env, sid, 'u1', 'empleado', 'e1'); await inviteAndJoin(env, sid, 'u1', 'empleado', 'e2');
  await rejects(inviteAndJoin(env, sid, 'u1', 'empleado', 'e3'), 'resource-exhausted');
});
test('el propietario busca tiendas por nombre, id o email del administrador', async () => {
  const env = makeEnv({ owners: [OWNER] });
  const a = await newStoreFor(env, 'ana', 'Zapatillas Ana'), b = await newStoreFor(env, 'beto', 'Ropa Beto');
  const by = async (q) => (await H.ownerListStores(env.deps, { uid: OWNER, query: q })).stores.map((s) => s.name);
  assert.deepEqual(await by('zapat'), ['Zapatillas Ana']);
  assert.deepEqual(await by('beto@x.com'), ['Ropa Beto']);
  assert.deepEqual(await by(b.sid), ['Ropa Beto']);
  assert.equal((await by('')).length, 2);
  const d = await H.ownerStoreDetail(env.deps, { uid: OWNER, sid: a.sid });
  assert.equal(d.members.length, 1); assert.equal(d.access.state, 'trial');
});
test('migración inicial: tiendas del propietario sin cobro, las demás con prueba desde hoy', async () => {
  const env = makeEnv({ owners: [OWNER] });
  env.data.set('stores/aaaaaaaaaa', { name: 'Pekeron', owner: OWNER, created: 1 });
  env.data.set('stores/bbbbbbbbbb', { name: 'Otra', owner: 'u5', created: 1 });
  const r = await H.ownerMigrateLegacy(env.deps, { uid: OWNER });
  assert.deepEqual(r, { initialized: 2, ownerFree: 1 });
  assert.equal(env.data.get('stores/aaaaaaaaaa/billing/access').state, 'owner_free');
  assert.equal(env.data.get('stores/bbbbbbbbbb/billing/access').state, 'trial');
  assert.deepEqual(await H.ownerMigrateLegacy(env.deps, { uid: OWNER }), { initialized: 0, ownerFree: 0 });
});
