// Débito automático del abono de Pekeron (Suscripciones de Mercado Pago, con la cuenta de Pekeron: MP_ACCESS_TOKEN).
// - El administrador de la tienda elige un plan → se crea la suscripción (preapproval) con el precio del plan
//   y la fecha del primer cobro = cuando se le termina la prueba o lo ya pagado (Llave en mano incluido).
// - Cada cobro aprobado extiende el abono un mes (billing/access de la tienda y de sus sucursales).
// - stores/{sid}/billing/sus = { id, plan, monto, st, email, at, next, prev, prevPlan, pagos: { idCobro: ms } }
import { computeAccess, addPeriod } from '../../access.js';
import { mergeConfig } from '../../plans.js';
import { aGet, aSet, aWhere, TS } from './admin.js';

const MP = 'https://api.mercadopago.com';
async function mp(env, path, o = {}) {
  if (!env.MP_ACCESS_TOKEN) throw new Error('Falta MP_ACCESS_TOKEN.');
  const r = await fetch(MP + path, { ...o, headers: { Authorization: 'Bearer ' + env.MP_ACCESS_TOKEN, 'Content-Type': 'application/json', ...(o.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('mp ' + r.status + ' ' + (d.message || '')); e.mp = d; e.status = r.status; throw e; }
  return d;
}

// Igual que litBuild() de app.html: arma el documento billing/access a partir de los datos base.
export function construir(cfgGuardada, b) {
  const now = Date.now();
  const c = computeAccess({ nowMs: now, config: cfgGuardada, paidPlan: b.paidPlan || null, trialStartMs: b.trialStartMs == null ? null : b.trialStartMs, paidUntilMs: b.paidUntilMs == null ? null : b.paidUntilMs, ownerFree: false, grants: [] });
  const lim = c.graceUntilMs != null ? c.graceUntilMs : c.activeUntilMs, LO = b.lim || null;
  if (LO && LO.plan === c.effectivePlan && !c.unlimited) { c.limits = { ...c.limits }; for (const k of ['admins', 'empleados', 'sucursales']) if (Number.isInteger(LO[k])) c.limits[k] = LO[k]; }
  return { state: c.state, unlimited: c.unlimited, ownerFree: false, paidPlan: b.paidPlan || null, trialStartMs: b.trialStartMs == null ? null : b.trialStartMs, trialEndMs: c.trialEndMs,
    paidUntilMs: b.paidUntilMs == null ? null : b.paidUntilMs, activeUntil: lim == null ? null : TS(lim), activeUntilMs: c.activeUntilMs, graceUntilMs: c.graceUntilMs,
    effectivePlan: c.effectivePlan, limits: c.limits, phases: c.phases, updatedAt: TS(now), chosenPlan: b.chosenPlan || null, life: b.life || null, paused: b.paused || null,
    llave: b.llave || null, lim: LO, auto: b.auto || null };
}

// Un mes más de abono por un cobro aprobado.
async function extender(env, sid, plan, cobroId) {
  const cfg = await aGet(env, 'platform/config');
  const old = (await aGet(env, 'stores/' + sid + '/billing/access')) || {};
  const from = Math.max(old.paidUntilMs || 0, Date.now());
  const nb = construir(cfg, { paidPlan: plan, paidUntilMs: addPeriod(from, { months: 1 }), trialStartMs: old.trialStartMs == null ? null : old.trialStartMs, chosenPlan: plan,
    paused: old.paused || null, life: old.life || null, llave: old.llave || null, lim: old.lim || null, auto: { at: Date.now(), cobro: String(cobroId) } });
  const hijas = await aWhere(env, 'stores', 'main', sid);
  await Promise.all([sid, ...hijas].map((id) => aSet(env, 'stores/' + id + '/billing/access', nb)));
  return nb;
}

// Revisa la suscripción en Mercado Pago y aplica los cobros aprobados que falten.
export async function sincronizar(env, sid) {
  const s = await aGet(env, 'stores/' + sid + '/billing/sus');
  if (!s || !s.id) return { st: 'none' };
  s.pagos = s.pagos || {};
  let nuevos = 0;
  for (const id of [s.id, s.prev].filter(Boolean)) {
    let pre;
    try { pre = await mp(env, '/preapproval/' + id); } catch (e) { if (id === s.id) throw e; continue; }
    if (id === s.id) { s.st = pre.status || s.st; s.next = pre.next_payment_date ? Date.parse(pre.next_payment_date) : null; if (pre.auto_recurring) s.monto = pre.auto_recurring.transaction_amount; }
    const r = await mp(env, '/authorized_payments/search?preapproval_id=' + encodeURIComponent(id)).catch(() => ({ results: [] }));
    const cobros = (r.results || []).filter((p) => p && p.payment && p.payment.status === 'approved' && !s.pagos[p.id]).sort((a, b) => Date.parse(a.date_created || 0) - Date.parse(b.date_created || 0));
    for (const p of cobros) {
      const k = 'pay:' + p.id;
      if (await env.MP.get(k)) continue;
      await env.MP.put(k, String(Date.now()), { expirationTtl: 60 * 60 * 24 * 400 });
      try { await extender(env, sid, id === s.id ? s.plan : (s.prevPlan || s.plan), p.id); }
      catch (e) { await env.MP.delete(k); throw e; }
      s.pagos[p.id] = Date.now(); nuevos++;
    }
  }
  // Si cambió de plan y la suscripción nueva ya está autorizada, damos de baja la anterior.
  if (s.prev && s.st === 'authorized') { try { await mp(env, '/preapproval/' + s.prev, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); } catch (e) {} s.prev = null; s.prevPlan = null; }
  const ks = Object.keys(s.pagos).sort((a, b) => s.pagos[a] - s.pagos[b]); while (ks.length > 30) delete s.pagos[ks.shift()];
  s.sync = Date.now();
  await aSet(env, 'stores/' + sid + '/billing/sus', s);
  return { st: s.st, next: s.next, nuevos };
}

export async function crear(env, { sid, plan, email, vuelta }) {
  const st = await aGet(env, 'stores/' + sid);
  if (!st) throw Object.assign(new Error('Tienda no encontrada.'), { http: 404 });
  if (st.main) throw Object.assign(new Error('Esta es una sucursal: el plan se paga desde la tienda principal.'), { http: 400 });
  if (st.mon === 'USD') throw Object.assign(new Error('El débito automático con Mercado Pago es solo para pagos en pesos.'), { http: 400 });
  const cfg = mergeConfig(await aGet(env, 'platform/config'));
  const P = cfg.plans[plan]; if (!P || !(P.priceARS > 0)) throw Object.assign(new Error('Plan inválido.'), { http: 400 });
  const acc = (await aGet(env, 'stores/' + sid + '/billing/access')) || {};
  if (acc.life) throw Object.assign(new Error('Esta tienda tiene licencia de por vida: no necesita abono.'), { http: 400 });
  // Primer cobro: cuando termina lo que ya tiene (prueba, mes de Llave en mano o meses pagados). Si ya venció, ahora.
  const hasta = Math.max(acc.activeUntilMs || 0, acc.paidUntilMs || 0, acc.trialEndMs || 0);
  const ar = { frequency: 1, frequency_type: 'months', transaction_amount: P.priceARS, currency_id: 'ARS' };
  if (hasta > Date.now() + 3600000) ar.start_date = new Date(hasta).toISOString();
  const pre = await mp(env, '/preapproval', { method: 'POST', body: JSON.stringify({ reason: 'Pekeron App · Plan ' + P.name + (st.name ? ' · ' + String(st.name).slice(0, 60) : ''), external_reference: sid, payer_email: email, auto_recurring: ar, back_url: vuelta, status: 'pending' }) });
  if (!pre.init_point || !pre.id) throw Object.assign(new Error('Mercado Pago no devolvió el link de la suscripción.'), { http: 502 });
  const old = await aGet(env, 'stores/' + sid + '/billing/sus');
  const activa = old && old.id && old.st === 'authorized';
  await aSet(env, 'stores/' + sid + '/billing/sus', { id: pre.id, plan, monto: P.priceARS, st: 'pending', email, at: Date.now(), next: ar.start_date ? hasta : null,
    prev: activa ? old.id : (old && old.prev) || null, prevPlan: activa ? old.plan : (old && old.prevPlan) || null, pagos: (old && old.pagos) || {} });
  await env.MP.put('susid:' + pre.id, sid);
  return { url: pre.init_point, desde: ar.start_date ? hasta : null };
}

export async function cancelar(env, sid) {
  const s = await aGet(env, 'stores/' + sid + '/billing/sus');
  if (!s || !s.id) return { st: 'none' };
  for (const id of [s.id, s.prev].filter(Boolean)) { try { await mp(env, '/preapproval/' + id, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); } catch (e) { if (id === s.id && e.status !== 404) throw e; } }
  s.st = 'cancelled'; s.prev = null; s.prevPlan = null; s.next = null; s.baja = Date.now();
  await aSet(env, 'stores/' + sid + '/billing/sus', s);
  return { st: 'cancelled' };
}

// Aviso de Mercado Pago (webhook). Solo trae un id: los datos se piden de nuevo a Mercado Pago con la clave de Pekeron,
// así un aviso falso no puede activar nada.
export async function aviso(env, tipo, id) {
  if (!id) return null;
  let pre = null;
  if (/authorized_payment/.test(tipo)) { const p = await mp(env, '/authorized_payments/' + encodeURIComponent(id)); pre = p.preapproval_id; }
  else if (/preapproval/.test(tipo)) pre = id;
  else return null;
  if (!pre) return null;
  let sid = await env.MP.get('susid:' + pre);
  if (!sid) { const d = await mp(env, '/preapproval/' + encodeURIComponent(pre)); sid = d.external_reference; }
  if (!sid || !/^[A-Za-z0-9_-]{1,64}$/.test(sid)) return null;
  return sincronizar(env, sid);
}
