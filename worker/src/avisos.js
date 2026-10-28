// Qué avisos se mandan al celular y a quién. Cada aviso se manda una sola vez (marca en KV av:{clave}).
import { aGet, aMerge, aQuery } from './admin.js';
import { enviar } from './push.js';
import { deriveState } from '../../access.js';

const DAY = 864e5;
const APP = (env) => (env.APP_URL || 'https://pekeronapp.com') + '/app.html';
const p2 = (n) => String(n).padStart(2, '0');
const art = (ms) => new Date(ms - 3 * 3600000); // hora de Argentina
export const fecha = (ms) => { const d = art(ms); return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1); };
export const money = (n) => '$' + Math.round(+n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const hm = (m) => p2(Math.floor(m / 60)) + ':' + p2(m % 60);
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const diaTurno = (d) => { const [y, m, dd] = String(d).split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, dd)); return DIAS[x.getUTCDay()] + ' ' + p2(dd) + '/' + p2(m); };

const ya = async (env, k) => !!(await env.MP.get('av:' + k));
const marcar = (env, k, dias = 120) => env.MP.put('av:' + k, '1', { expirationTtl: dias * 86400 });
async function una(env, k) { if (await ya(env, k)) return false; await marcar(env, k); return true; }

export async function adminsDe(env, sid) { return (await aQuery(env, 'stores/' + sid, 'members', [['role', 'admin']])).map((x) => x.id); }
export async function duenos(env) {
  let l = []; try { l = (await aQuery(env, '', 'platform_owners', [])).map((x) => x.id); } catch (e) {}
  return [...new Set([...l, ...String(env.OWNER_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean)])];
}
const nombre = (st) => (st && st.name) || 'tu negocio';

// ---------- negocio ----------
// Pago aprobado en el catálogo (se verifica con la clave de Mercado Pago de la tienda).
export async function pagoCatalogo(env, sid, pid, claveTienda) {
  if (!claveTienda || !/^\d{1,20}$/.test(String(pid))) return false;
  if (await ya(env, 'cat:' + pid)) return false;
  const r = await fetch('https://api.mercadopago.com/v1/payments/' + pid, { headers: { Authorization: 'Bearer ' + claveTienda } });
  if (!r.ok) return false;
  const p = await r.json();
  const sidPago = (p.metadata && p.metadata.sid) || '';
  if (p.status !== 'approved' || sidPago !== sid) return false;
  if (!await una(env, 'cat:' + pid)) return false;
  const st = await aGet(env, 'stores/' + sid);
  await enviar(env, await adminsDe(env, sid), { t: '💙 Pago aprobado · ' + money(p.transaction_amount), b: (p.description || 'Pedido del catálogo') + ' · ' + nombre(st) + '. Fijate el pedido en tu WhatsApp.', u: APP(env), tag: 'pago-' + pid });
  return true;
}
// Turno reservado desde el catálogo (se verifica que el turno exista y sea de recién).
export async function turnoNuevo(env, sid, tid) {
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(String(tid))) return false;
  const t = await aGet(env, 'stores/' + sid + '/turnos/' + tid);
  if (!t || t.src !== 'web' || !(Date.now() - (t.at || 0) < 15 * 60000)) return false;
  if (!await una(env, 'tur:' + sid + ':' + tid)) return false;
  await enviar(env, await adminsDe(env, sid), { t: '📅 Turno nuevo · ' + diaTurno(t.d) + ' ' + hm(t.i), b: (t.cl || 'Un cliente') + ' reservó ' + (t.sn || 'un turno') + (t.en ? ' con ' + t.en : '') + '.', u: APP(env), tag: 'turno-' + tid });
  return true;
}
// Débito automático: cobro aprobado o rechazado.
export async function debitoOk(env, sid, plan, hasta, monto, cobro) {
  if (!await una(env, 'dok:' + cobro)) return;
  const st = await aGet(env, 'stores/' + sid);
  await enviar(env, await adminsDe(env, sid), { t: '✅ Se renovó tu plan', b: 'Plan ' + plan + ' de ' + nombre(st) + ' activo hasta el ' + fecha(hasta) + ' (débito automático).', u: APP(env), tag: 'plan-' + sid });
  await enviar(env, await duenos(env), { t: '💰 Cobro de débito automático', b: nombre(st) + ' · plan ' + plan + (monto ? ' · ' + money(monto) : ''), u: APP(env), tag: 'dok-' + cobro });
}
export async function debitoRech(env, sid, cobro) {
  if (!await una(env, 'drj:' + cobro)) return;
  const st = await aGet(env, 'stores/' + sid);
  await enviar(env, await adminsDe(env, sid), { t: '⚠️ No se pudo cobrar tu plan', b: 'Mercado Pago rechazó el débito automático de ' + nombre(st) + '. Revisá tu tarjeta en Mercado Pago para que no se suspenda la cuenta.', u: APP(env), tag: 'plan-' + sid, urg: 'high' });
  await enviar(env, await duenos(env), { t: '⚠️ Débito rechazado', b: nombre(st) + ': Mercado Pago no pudo cobrar el plan.', u: APP(env), tag: 'drj-' + cobro });
}
// Negocio nuevo: aviso a vos y al vendedor que lo trajo.
export async function negocioNuevo(env, uid, sid) {
  const st = await aGet(env, 'stores/' + sid);
  if (!st || st.owner !== uid || !(Date.now() - (st.created || 0) < 2 * 3600000) || st.main) return false;
  if (!await una(env, 'new:' + sid)) return false;
  const cfg = (await aGet(env, 'stores/' + sid + '/cfg/servicios').catch(() => null)) || {};
  await enviar(env, await duenos(env), { t: '🆕 Negocio nuevo', b: nombre(st) + (cfg.tipo ? ' (' + cfg.tipo + ')' : '') + (st.pais && st.pais !== 'AR' ? ' · ' + st.pais : '') + (st.vend ? ' · vendedor ' + st.vend : ''), u: APP(env), tag: 'new-' + sid });
  if (st.vend) {
    const vs = (await aQuery(env, '', 'vendUid', [['code', st.vend]])).map((x) => x.id);
    if (vs.length) await enviar(env, vs, { t: '🎉 Cliente nuevo', b: nombre(st) + ' creó su tienda con tu código ' + st.vend + '. Cuando empiece a pagar, suma a tu comisión.', u: APP(env), tag: 'vnew-' + sid });
  }
  return true;
}

// ---------- vencimientos y suspensión automática (lo corre el reloj del servidor varias veces por día) ----------
// Avisa 3 días antes y 1 día antes de vencer, al vencer (días de gracia) y al suspenderse.
// Cuando una tienda queda suspendida por falta de pago, su catálogo también (public/info.susp); al pagar se reactiva.
async function catalogo(env, sid, susp) {
  const hijas = (await aQuery(env, '', 'stores', [['main', sid]])).map((x) => x.id);
  for (const id of [sid, ...hijas]) { const pi = await aGet(env, 'stores/' + id + '/public/info'); if (pi && !!pi.susp !== susp) await aMerge(env, 'stores/' + id + '/public/info', { susp: susp ? true : null }); }
  if (susp) await env.MP.put('susp:' + sid, '1'); else await env.MP.delete('susp:' + sid);
}
export async function reactivar(env, sid) { if (await env.MP.get('susp:' + sid)) await catalogo(env, sid, false); }

export async function revisar(env, now = Date.now()) {
  const docs = await aQuery(env, '', 'billing', [], true);
  const acc = {}, sus = {};
  docs.forEach((d) => { const m = d.path.match(/^stores\/([^/]+)\/billing\/(access|sus)$/); if (m) (m[2] === 'access' ? acc : sus)[m[1]] = d.x; });
  const res = { avisos: 0, suspendidas: 0, reactivadas: 0 };
  const stores = {}; const tienda = async (sid) => (stores[sid] !== undefined ? stores[sid] : (stores[sid] = await aGet(env, 'stores/' + sid)));
  for (const sid of Object.keys(acc)) {
    try {
      const a = acc[sid];
      if (!a || a.life || a.unlimited || a.paused || !a.phases || (!a.paidUntilMs && !a.trialStartMs)) continue;
      const until = a.activeUntilMs; if (!until) continue;
      const st = deriveState(a, now).state, auto = sus[sid] && sus[sid].st === 'authorized';
      if (st === 'paid' || st === 'trial' || st === 'free_timed') {
        if (await env.MP.get('susp:' + sid)) { await catalogo(env, sid, false); res.reactivadas++; }
        const dias = (until - now) / DAY;
        if (auto || dias > 3) continue;
        const k = (dias <= 1 ? 'v1:' : 'v3:') + sid + ':' + until;
        if (await ya(env, k)) continue;
        const t = await tienda(sid); if (!t || t.main) continue;
        await marcar(env, k);
        const prueba = st === 'trial';
        await enviar(env, await adminsDe(env, sid), { t: '⏰ ' + (prueba ? 'Tu prueba gratis termina ' : 'Tu plan vence ') + (dias <= 1 ? 'mañana' : 'el ' + fecha(until)), b: (prueba ? 'Elegí un plan' : 'Pagá tu plan') + ' de ' + nombre(t) + ' para seguir usando Pekeron sin cortes. Con débito automático te olvidás de pagar cada mes.', u: APP(env), tag: 'plan-' + sid });
        res.avisos++;
      } else if (st === 'grace') {
        const k = 'gr:' + sid + ':' + until; if (await ya(env, k)) continue;
        const t = await tienda(sid); if (!t || t.main) continue;
        await marcar(env, k);
        await enviar(env, await adminsDe(env, sid), { t: '⚠️ Tu plan venció', b: 'Tenés hasta el ' + fecha(a.graceUntilMs || until) + ' para pagar el plan de ' + nombre(t) + '. Después se suspende el uso de la app y del catálogo.', u: APP(env), tag: 'plan-' + sid, urg: 'high' });
        res.avisos++;
      } else if (st === 'expired') {
        const t = await tienda(sid); if (!t || t.main) continue;
        if (!await env.MP.get('susp:' + sid)) { await catalogo(env, sid, true); res.suspendidas++; }
        const reciente = now - (a.graceUntilMs || until) < 7 * DAY;
        const k = 'su:' + sid + ':' + until;
        if (reciente && !await ya(env, k)) {
          await marcar(env, k);
          await enviar(env, await adminsDe(env, sid), { t: '⛔ Cuenta suspendida por falta de pago', b: 'Se suspendió el uso de Pekeron y del catálogo de ' + nombre(t) + '. Pagá tu plan para reactivarla al instante.', u: APP(env), tag: 'plan-' + sid, urg: 'high' });
          await enviar(env, await duenos(env), { t: '⛔ Negocio suspendido', b: nombre(t) + ' quedó suspendido por falta de pago.', u: APP(env), tag: 'su-' + sid });
          res.avisos++;
        }
      }
    } catch (e) { console.error('revisar', sid, e && e.message); }
  }
  return res;
}
