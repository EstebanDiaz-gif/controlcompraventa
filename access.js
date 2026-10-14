// Lógica pura de acceso comercial. No toca Firestore: recibe datos y devuelve el estado.
import { mergeConfig } from './plans.js';

export const DAY = 86400000;

// Suma días, meses y años de calendario (UTC) a una fecha en milisegundos.
export function addPeriod(ms, p) {
  const { days = 0, months = 0, years = 0 } = p || {};
  for (const v of [days, months, years]) if (!Number.isInteger(v) || v < 0 || v > 1200) throw new Error('El período debe estar en números enteros positivos.');
  if (days + months + years === 0) throw new Error('Indicá cuánto tiempo querés agregar.');
  const d = new Date(ms);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  return d.getTime();
}

const live = (g) => g.status !== 'revoked';

// grants: [{id,type,status,startMs,endMs,addedMs,plan,limits}]
export function computeAccess({ nowMs, config, paidPlan = null, trialStartMs = null, paidUntilMs = null, ownerFree = false, grants = [] }) {
  const cfg = mergeConfig(config);
  const gs = grants.filter(live);
  const sum = (t) => gs.filter(g => g.type === t).reduce((a, g) => a + (g.addedMs || 0), 0);

  const trialEndMs = trialStartMs == null ? null : trialStartMs + cfg.trialDays * DAY + sum('trial_extension');
  const paidEffMs = paidUntilMs == null ? null : paidUntilMs + sum('subscription_extension');
  const freeForever = gs.some(g => g.type === 'free_forever');
  const freeTimed = gs.filter(g => g.type === 'free_timed' && g.startMs <= nowMs);
  const freeTimedEnd = freeTimed.length ? Math.max(...freeTimed.map(g => g.endMs)) : null;

  // Fases ordenadas por prioridad; el cliente elige la primera que siga vigente.
  const phases = [];
  if (ownerFree) phases.push({ state: 'owner_free', untilMs: null });
  if (freeForever) phases.push({ state: 'free_forever', untilMs: null });
  if (freeTimedEnd != null) phases.push({ state: 'free_timed', untilMs: freeTimedEnd });
  if (paidEffMs != null) phases.push({ state: 'paid', untilMs: paidEffMs });
  if (trialEndMs != null) phases.push({ state: 'trial', untilMs: trialEndMs });

  const unlimited = ownerFree || freeForever;
  const ends = phases.filter(p => p.untilMs != null).map(p => p.untilMs);
  const activeUntilMs = unlimited ? null : (ends.length ? Math.max(...ends) : null);
  const current = phases.find(p => p.untilMs == null || p.untilMs > nowMs);
  const state = current ? current.state : 'expired';

  // Plan y límites vigentes
  const up = gs.filter(g => g.type === 'plan_upgrade' && g.startMs <= nowMs && (g.endMs == null || g.endMs > nowMs)).pop();
  let effectivePlan = up && up.plan ? up.plan : (state === 'paid' && paidPlan ? paidPlan : (state === 'trial' ? cfg.trialPlan : (paidPlan || 'inicial')));
  if (!cfg.plans[effectivePlan]) effectivePlan = 'inicial';
  let limits = { admins: cfg.plans[effectivePlan].admins, empleados: cfg.plans[effectivePlan].empleados, sucursales: cfg.plans[effectivePlan].sucursales };
  if (up && up.limits) for (const k of ['admins', 'empleados', 'sucursales']) if (Number.isInteger(up.limits[k])) limits[k] = up.limits[k];
  if (unlimited) limits = { admins: null, empleados: null, sucursales: null }; // null = sin límite
  const features = unlimited ? 'all' : cfg.plans[effectivePlan].features;

  return { state, unlimited, activeUntilMs, trialStartMs, trialEndMs, paidUntilMs: paidEffMs, effectivePlan, limits, features, phases, active: state !== 'expired' };
}

// Para el navegador: con el documento billing/access y la hora actual, devuelve el estado vigente.
export function deriveState(access, nowMs) {
  if (!access) return { state: 'unknown', active: false };
  const cur = (access.phases || []).find(p => p.untilMs == null || p.untilMs > nowMs);
  if (!cur) return { state: 'expired', active: false };
  const daysLeft = cur.untilMs == null ? null : Math.max(0, Math.ceil((cur.untilMs - nowMs) / DAY));
  return { state: cur.state, active: true, untilMs: cur.untilMs, daysLeft };
}

export const canUseLimit = (limit, current) => limit == null || current < limit;
