// Lógica de las funciones del servidor. Recibe sus dependencias (db, reloj, generador de ids)
// para poder probarse sin conectarse a Firebase.
import { mergeConfig, validateConfigInput, PLAN_IDS, TECH } from './plans.js';
import { computeAccess, addPeriod, canUseLimit } from './access.js';

export class AppError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, msg) => { throw new AppError(code, msg); };

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const readAccessBase = (a) => ({ paidPlan: a.paidPlan || null, trialStartMs: a.trialStartMs ?? null, paidUntilMs: a.paidUntilMs ?? null, ownerFree: !!a.ownerFree });
const grantFrom = (d) => ({ id: d.id, ...d.data() });

export async function getConfig(db) { const s = await db.doc('platform/config').get(); return mergeConfig(s.exists ? s.data() : null); }

// Arma el documento stores/{sid}/billing/access a partir de los datos base y los beneficios.
function buildAccess(deps, cfg, base, grants) {
  const nowMs = deps.now();
  const c = computeAccess({ nowMs, config: cfg, ...base, grants });
  return {
    doc: {
      state: c.state, unlimited: c.unlimited, ownerFree: base.ownerFree, paidPlan: base.paidPlan,
      trialStartMs: base.trialStartMs, trialEndMs: c.trialEndMs, paidUntilMs: base.paidUntilMs,
      activeUntil: c.activeUntilMs == null ? null : deps.ts(c.activeUntilMs), activeUntilMs: c.activeUntilMs,
      effectivePlan: c.effectivePlan, limits: c.limits, phases: c.phases, updatedAt: deps.ts(nowMs)
    },
    computed: c
  };
}
const snapshot = (c) => ({ state: c.state, activeUntilMs: c.activeUntilMs, trialEndMs: c.trialEndMs, paidUntilMs: c.paidUntilMs, plan: c.effectivePlan, limits: c.limits });

async function requireOwner(deps, uid) { if (!uid || !(await deps.isPlatformOwner(uid))) fail('permission-denied', 'No tenés permiso para esta operación.'); }
async function requireAdmin(tx, db, sid, uid) {
  const m = await tx.get(db.doc(`stores/${sid}/members/${uid}`));
  if (!m.exists || m.data().role !== 'admin') fail('permission-denied', 'Solo un administrador de la tienda puede hacer esto.');
}

/* ---------------- tiendas e invitaciones ---------------- */
export async function createStore(deps, { uid, email, name, userName }) {
  if (!uid) fail('unauthenticated', 'Tenés que iniciar sesión.');
  const nm = clean(name, TECH.nameMax);
  if (!nm) fail('invalid-argument', 'Escribí el nombre de la tienda.');
  const db = deps.db, now = deps.now();
  const owner = await deps.isPlatformOwner(uid);
  const cfg = await getConfig(db);
  const sid = deps.genId(10);
  let trial = false;
  await db.runTransaction(async (tx) => {
    const meta = await tx.get(db.doc(`users/${uid}/meta/trial`));
    const links = await tx.get(db.collection(`users/${uid}/stores`));
    const cap = owner ? TECH.maxStoresPerOwner : TECH.maxStoresPerCustomer;
    if (links.size >= cap) fail('resource-exhausted', 'Llegaste al máximo técnico de tiendas por cuenta.');
    trial = !owner && !meta.exists;
    const base = { paidPlan: null, trialStartMs: trial ? now : null, paidUntilMs: null, ownerFree: owner };
    const { doc } = buildAccess(deps, cfg, base, []);
    tx.set(db.doc(`stores/${sid}`), { name: nm, owner: uid, created: now });
    tx.set(db.doc(`stores/${sid}/members/${uid}`), { role: 'admin', email: email || '', name: clean(userName, 80) || (email || '').split('@')[0], joinedAt: deps.ts(now) });
    tx.set(db.doc(`users/${uid}/stores/${sid}`), { name: nm });
    tx.set(db.doc(`stores/${sid}/billing/access`), doc);
    if (trial) tx.set(db.doc(`users/${uid}/meta/trial`), { startedAt: deps.ts(now), sid });
  });
  return { sid, name: nm, trial };
}

export async function createInvite(deps, { uid, sid, role }) {
  if (!uid) fail('unauthenticated', 'Tenés que iniciar sesión.');
  if (!['admin', 'empleado'].includes(role)) fail('invalid-argument', 'Rol no válido.');
  if (!/^[a-z0-9]{10}$/.test(String(sid))) fail('invalid-argument', 'Tienda no válida.');
  const db = deps.db, now = deps.now();
  const id = (role === 'admin' ? 'a' : 'e') + deps.genId(6);
  await db.runTransaction(async (tx) => {
    await requireAdmin(tx, db, sid, uid);
    const acc = await tx.get(db.doc(`stores/${sid}/billing/access`));
    if (!acc.exists) fail('failed-precondition', 'La tienda todavía no tiene su plan inicializado.');
    const a = acc.data();
    if (!a.unlimited && !(a.activeUntilMs > now)) fail('failed-precondition', 'El acceso de la tienda está vencido. Renovalo para invitar personas.');
    const invs = await tx.get(db.collection(`stores/${sid}/invites`));
    if (invs.size >= TECH.maxActiveInvites) fail('resource-exhausted', 'Hay demasiados códigos activos. Anulá los que ya no uses.');
    tx.set(db.doc(`stores/${sid}/invites/${id}`), { role, created: now, createdBy: uid, uses: 0 });
  });
  return { code: sid + id, role };
}

export function parseCode(raw) {
  const c = String(raw || '').toLowerCase().replace(/\s/g, '');
  if (!/^[a-z0-9]{10}[ae][a-z0-9]{6}$/.test(c)) fail('invalid-argument', 'Ese código no es válido.');
  return { sid: c.slice(0, 10), iid: c.slice(10) };
}

// El rol sale SIEMPRE del documento de invitación guardado en el servidor, nunca de lo que mande el cliente.
// El código sigue valiendo hasta que un administrador lo anule (flujo manual actual).
export async function joinStore(deps, { uid, email, userName, code }) {
  if (!uid) fail('unauthenticated', 'Tenés que iniciar sesión.');
  const { sid, iid } = parseCode(code);
  const db = deps.db, now = deps.now();
  const cfg = await getConfig(db);
  return db.runTransaction(async (tx) => {
    const inv = await tx.get(db.doc(`stores/${sid}/invites/${iid}`));
    if (!inv.exists) fail('not-found', 'Ese código no es válido o ya fue anulado.');
    const role = inv.data().role;
    if (!['admin', 'empleado'].includes(role)) fail('failed-precondition', 'La invitación no es válida.');
    const store = await tx.get(db.doc(`stores/${sid}`));
    if (!store.exists) fail('not-found', 'La tienda no existe.');
    const mine = await tx.get(db.doc(`stores/${sid}/members/${uid}`));
    const acc = await tx.get(db.doc(`stores/${sid}/billing/access`));
    const gs = await tx.get(db.collection(`stores/${sid}/grants`));
    const ms = await tx.get(db.collection(`stores/${sid}/members`));
    if (mine.exists) return { sid, name: store.data().name, role: mine.data().role, already: true }; // no cambia roles
    if (!acc.exists) fail('failed-precondition', 'La tienda todavía no tiene su plan inicializado.');
    const { computed } = buildAccess(deps, cfg, readAccessBase(acc.data()), gs.docs.map(grantFrom));
    if (!computed.active) fail('failed-precondition', 'El acceso de esta tienda está vencido. Pedile al administrador que lo renueve.');
    let n = 0; ms.forEach((d) => { if (d.data().role === role) n++; });
    const lim = role === 'admin' ? computed.limits.admins : computed.limits.empleados;
    if (!canUseLimit(lim, n)) fail('resource-exhausted', role === 'admin' ? 'La tienda alcanzó el máximo de administradores de su plan.' : 'La tienda alcanzó el máximo de empleados de su plan.');
    tx.set(db.doc(`stores/${sid}/members/${uid}`), { role, email: email || '', name: clean(userName, 80) || (email || '').split('@')[0], code: iid, joinedAt: deps.ts(now) });
    tx.set(db.doc(`users/${uid}/stores/${sid}`), { name: store.data().name });
    tx.update(db.doc(`stores/${sid}/invites/${iid}`), { uses: (inv.data().uses || 0) + 1, lastUsedAt: now });
    return { sid, name: store.data().name, role, already: false };
  });
}

/* ---------------- panel del propietario de la plataforma ---------------- */
function period(p) { return { days: Number(p && p.days || 0), months: Number(p && p.months || 0), years: Number(p && p.years || 0) }; }
const needReason = (r) => { const x = clean(r, TECH.reasonMax); if (!x) fail('invalid-argument', 'Escribí el motivo del beneficio.'); return x; };

export async function ownerGrantBenefit(deps, { uid, sid, type, params = {}, reason }) {
  await requireOwner(deps, uid);
  const why = needReason(reason);
  if (!/^[a-z0-9]{10}$/.test(String(sid))) fail('invalid-argument', 'Tienda no válida.');
  const TYPES = ['free_forever', 'free_timed', 'trial_extension', 'subscription_extension', 'plan_upgrade'];
  if (!TYPES.includes(type)) fail('invalid-argument', 'Tipo de beneficio no válido.');
  const db = deps.db, now = deps.now(), cfg = await getConfig(db);
  const grantId = deps.genId(16);
  return db.runTransaction(async (tx) => {
    const store = await tx.get(db.doc(`stores/${sid}`));
    if (!store.exists) fail('not-found', 'La tienda no existe.');
    const acc = await tx.get(db.doc(`stores/${sid}/billing/access`));
    if (!acc.exists) fail('failed-precondition', 'La tienda no tiene su plan inicializado. Ejecutá la migración inicial.');
    const gs = (await tx.get(db.collection(`stores/${sid}/grants`))).docs.map(grantFrom);
    const base = readAccessBase(acc.data());
    const before = buildAccess(deps, cfg, base, gs).computed;
    const g = { type, status: 'active', startMs: now, endMs: null, addedMs: 0, reason: why, createdAt: deps.ts(now), createdBy: uid };
    try {
      if (type === 'free_timed') {
        if (params.endDate) {
          const start = params.startDate ? Date.parse(params.startDate + 'T00:00:00Z') : now;
          const end = Date.parse(params.endDate + 'T23:59:59Z');
          if (isNaN(start) || isNaN(end)) throw new Error('Las fechas no son válidas.');
          if (start > now + 60000) throw new Error('Por ahora el acceso temporal tiene que empezar hoy o antes.');
          if (end <= start) throw new Error('La fecha de fin tiene que ser posterior a la de inicio.');
          g.startMs = start; g.endMs = end;
        } else g.endMs = addPeriod(now, period(params));
        if (g.endMs <= now) throw new Error('El acceso ya estaría vencido; elegí una fecha futura.');
      } else if (type === 'trial_extension') {
        if (before.trialEndMs == null) throw new Error('Esta tienda no tiene prueba gratuita para ampliar. Usá un acceso gratuito temporal.');
        const newEnd = addPeriod(Math.max(before.trialEndMs, now), period(params));
        g.addedMs = newEnd - before.trialEndMs;
      } else if (type === 'subscription_extension') {
        if (before.paidUntilMs == null || before.paidUntilMs <= now) throw new Error('La tienda no tiene una suscripción activa para extender.');
        const newEnd = addPeriod(before.paidUntilMs, period(params));
        g.addedMs = newEnd - before.paidUntilMs;
      } else if (type === 'plan_upgrade') {
        if (!PLAN_IDS.includes(params.plan)) throw new Error('Elegí un plan válido.');
        g.plan = params.plan;
        const lim = {};
        for (const k of ['admins', 'empleados', 'sucursales']) if (params[k] !== undefined && params[k] !== '' && params[k] !== null) {
          const v = Number(params[k]); if (!Number.isInteger(v) || v < 0 || v > 1000000) throw new Error('Límite inválido en ' + k + '.');
          lim[k] = v;
        }
        if (Object.keys(lim).length) g.limits = lim;
        const p = period(params);
        if (p.days + p.months + p.years > 0) g.endMs = addPeriod(now, p);
      }
    } catch (e) { fail('invalid-argument', e.message); }
    const after = buildAccess(deps, cfg, base, gs.concat([{ id: grantId, ...g }]));
    tx.set(db.doc(`stores/${sid}/grants/${grantId}`), g);
    tx.set(db.doc(`stores/${sid}/billing/access`), after.doc);
    tx.set(db.doc(`audit/${deps.genId(20)}`), { at: deps.ts(now), atMs: now, by: uid, action: 'grant', sid, grantId, grantType: type, reason: why, startMs: g.startMs, endMs: g.endMs, addedMs: g.addedMs, before: snapshot(before), after: snapshot(after.computed) });
    return { grantId, before: snapshot(before), after: snapshot(after.computed) };
  });
}

export async function ownerRevokeBenefit(deps, { uid, sid, grantId, reason }) {
  await requireOwner(deps, uid);
  const why = needReason(reason);
  const db = deps.db, now = deps.now(), cfg = await getConfig(db);
  return db.runTransaction(async (tx) => {
    const acc = await tx.get(db.doc(`stores/${sid}/billing/access`));
    const g = await tx.get(db.doc(`stores/${sid}/grants/${grantId}`));
    if (!acc.exists || !g.exists) fail('not-found', 'No se encontró el beneficio.');
    if (g.data().status === 'revoked') fail('failed-precondition', 'Ese beneficio ya estaba revocado.');
    const gs = (await tx.get(db.collection(`stores/${sid}/grants`))).docs.map(grantFrom);
    const base = readAccessBase(acc.data());
    const before = buildAccess(deps, cfg, base, gs).computed;
    const next = gs.map((x) => x.id === grantId ? { ...x, status: 'revoked' } : x);
    const after = buildAccess(deps, cfg, base, next);
    tx.update(db.doc(`stores/${sid}/grants/${grantId}`), { status: 'revoked', revokedAt: deps.ts(now), revokedBy: uid, revokeReason: why });
    tx.set(db.doc(`stores/${sid}/billing/access`), after.doc);
    tx.set(db.doc(`audit/${deps.genId(20)}`), { at: deps.ts(now), atMs: now, by: uid, action: 'revoke', sid, grantId, grantType: g.data().type, reason: why, before: snapshot(before), after: snapshot(after.computed) });
    return { before: snapshot(before), after: snapshot(after.computed) };
  });
}

export async function ownerListStores(deps, { uid, query }) {
  await requireOwner(deps, uid);
  const db = deps.db, q = clean(query, 80).toLowerCase();
  const all = (await db.collection('stores').limit(500).get()).docs;
  const out = [];
  for (const d of all) {
    const s = d.data(), nameHit = !q || (s.name || '').toLowerCase().includes(q) || d.id.includes(q);
    if (!nameHit && !q.includes('@')) continue;
    const ms = (await db.collection(`stores/${d.id}/members`).get()).docs.map((m) => m.data());
    const admins = ms.filter((m) => m.role === 'admin').map((m) => m.email);
    if (!nameHit && !admins.some((e) => (e || '').toLowerCase().includes(q))) continue;
    const a = await db.doc(`stores/${d.id}/billing/access`).get();
    out.push({ sid: d.id, name: s.name, admins, members: ms.length, state: a.exists ? a.data().state : 'sin_inicializar', activeUntilMs: a.exists ? a.data().activeUntilMs ?? null : null, plan: a.exists ? a.data().effectivePlan : null });
    if (out.length >= 50) break;
  }
  return { stores: out, truncated: all.length >= 500 };
}

export async function ownerStoreDetail(deps, { uid, sid }) {
  await requireOwner(deps, uid);
  const db = deps.db;
  const store = await db.doc(`stores/${sid}`).get();
  if (!store.exists) fail('not-found', 'La tienda no existe.');
  const acc = await db.doc(`stores/${sid}/billing/access`).get();
  const gs = (await db.collection(`stores/${sid}/grants`).get()).docs.map((d) => { const x = d.data(); return { id: d.id, type: x.type, status: x.status, startMs: x.startMs, endMs: x.endMs, addedMs: x.addedMs, plan: x.plan || null, limits: x.limits || null, reason: x.reason, createdAt: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : null }; });
  const ms = (await db.collection(`stores/${sid}/members`).get()).docs.map((d) => ({ uid: d.id, role: d.data().role, email: d.data().email, name: d.data().name }));
  const au = (await db.collection('audit').where('sid', '==', sid).get()).docs.map((d) => d.data()).sort((a, b) => b.atMs - a.atMs).slice(0, 30);
  return { sid, name: store.data().name, access: acc.exists ? acc.data() : null, grants: gs, members: ms, audit: au };
}

export async function ownerSetPlanConfig(deps, { uid, config }) {
  await requireOwner(deps, uid);
  let v; try { v = validateConfigInput(config); } catch (e) { fail('invalid-argument', e.message); }
  const db = deps.db, now = deps.now();
  const prev = await getConfig(db);
  await db.doc('platform/config').set({ ...v, updatedAt: deps.ts(now), updatedBy: uid });
  await db.doc(`audit/${deps.genId(20)}`).set({ at: deps.ts(now), atMs: now, by: uid, action: 'plan_config', sid: null, before: { trialDays: prev.trialDays, trialPlan: prev.trialPlan, plans: Object.fromEntries(PLAN_IDS.map((k) => [k, { priceARS: prev.plans[k].priceARS, admins: prev.plans[k].admins, empleados: prev.plans[k].empleados, sucursales: prev.plans[k].sucursales }])) }, after: v });
  return { ok: true };
}

// Inicializa el plan de las tiendas creadas antes de existir el sistema de planes.
// Tiendas de propietarios de la plataforma: sin cobro. Las demás: prueba de la duración configurada desde hoy.
export async function ownerMigrateLegacy(deps, { uid }) {
  await requireOwner(deps, uid);
  const db = deps.db, now = deps.now(), cfg = await getConfig(db);
  const all = (await db.collection('stores').limit(2000).get()).docs;
  let done = 0, free = 0;
  for (const d of all) {
    const a = await db.doc(`stores/${d.id}/billing/access`).get();
    if (a.exists) continue;
    const ownerFree = await deps.isPlatformOwner(d.data().owner);
    const base = { paidPlan: null, trialStartMs: ownerFree ? null : now, paidUntilMs: null, ownerFree };
    await db.doc(`stores/${d.id}/billing/access`).set({ ...buildAccess(deps, cfg, base, []).doc, legacy: true });
    done++; if (ownerFree) free++;
  }
  await db.doc(`audit/${deps.genId(20)}`).set({ at: deps.ts(now), atMs: now, by: uid, action: 'migrate_legacy', sid: null, after: { initialized: done, ownerFree: free } });
  return { initialized: done, ownerFree: free };
}
