// Qué avisos se mandan al celular y a quién. Cada aviso se manda una sola vez (marca en KV av:{clave}).
import { aGet, aMerge, aQuery } from './admin.js';
import { enviar, subOk, aUno } from './push.js';
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
  // Si el pago es de un pedido que entró a la app (ref = id del pedido), se marca pagado en el pedido.
  const ref = String((p.metadata && p.metadata.ref) || p.external_reference || '');
  let ped = null;
  if (/^[A-Za-z0-9]{12,40}$/.test(ref)) { try { ped = await aGet(env, 'stores/' + sid + '/pedidos/' + ref); if (ped) await aMerge(env, 'stores/' + sid + '/pedidos/' + ref, { pag: Math.round(+p.transaction_amount || 0), pid: String(pid) }); } catch (e) { ped = null; } }
  await enviar(env, await adminsDe(env, sid), { t: '💙 Pago aprobado · ' + money(p.transaction_amount), b: (p.description || 'Pedido del catálogo') + ' · ' + nombre(st) + (ped ? '. Ya está marcado como pagado en Pedidos.' : '. Fijate el pedido en tu WhatsApp.'), u: APP(env), tag: 'pago-' + pid });
  return true;
}
// Pedido hecho desde el catálogo (mesa, retiro o envío): avisa a todo el equipo del local.
const TIPO_PED = { mesa: '🍽️ Mesa ', env: '🛵 Envío', ret: '🏪 Retiro' };
export async function pedidoNuevo(env, sid, id) {
  if (!/^[A-Za-z0-9]{12,40}$/.test(String(id))) return false;
  const d = await aGet(env, 'stores/' + sid + '/pedidos/' + id);
  if (!d || d.src !== 'web' || !(Math.abs(Date.now() - (d.at || 0)) < 15 * 60000)) return false;
  if (!await una(env, 'ped:' + sid + ':' + id)) return false;
  const quien = (await aQuery(env, 'stores/' + sid, 'members', [])).map((x) => x.id);
  const n = (d.it || []).reduce((a, x) => a + (x.w ? 1 : (+x.q || 0)), 0);
  await enviar(env, quien, { t: '🛎️ Pedido nuevo · ' + (TIPO_PED[d.tipo] || '') + (d.tipo === 'mesa' ? (d.mesa || '') : '') + ' · ' + money(d.tot || 0), b: (d.cl || 'Un cliente') + ' pidió ' + n + ' producto' + (n === 1 ? '' : 's') + '. Tocá para verlo y aceptarlo.', u: APP(env) + '?ped=1', tag: 'ped-' + id });
  return true;
}
// ---------- Cadete sin app: el local le manda por WhatsApp un link con una clave; la clave no se guarda, solo su huella (kh) ----------
async function huella(k) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(k))); return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
const pagado = (d) => !!(d.pag || d.pg || d.cob);
export async function cadete(env, sid, id, k, accion) {
  if (!/^[A-Za-z0-9]{12,40}$/.test(String(id)) || !/^[A-Za-z0-9]{16,64}$/.test(String(k))) return { error: 'Link inválido.' };
  const ruta = 'stores/' + sid + '/pedidos/' + id, d = await aGet(env, ruta);
  if (!d || !d.kh || d.kh !== await huella(k)) return { error: 'Este link ya no es válido. Pedile al local que te lo mande de nuevo.' };
  if (accion === 'entregado' && (d.st === 'camino' || d.st === 'listo' || d.st === 'ok')) {
    const st = pagado(d) ? 'entregado' : 'rendir';   // rendir: lo entregó y tiene la plata del cliente
    await aMerge(env, ruta, { st, upd: Date.now(), ent: Date.now() });
    d.st = st;
    if (await una(env, 'cad:' + sid + ':' + id)) {
      const quien = (await aQuery(env, 'stores/' + sid, 'members', [])).filter((m) => !m.x.sop).map((m) => m.id);
      await enviar(env, quien, { t: '🛵 Entregado #' + String(id).slice(-4).toUpperCase() + (d.cad ? ' · ' + d.cad : ''), b: (d.cl || 'El cliente') + (st === 'rendir' ? ' ya lo recibió. El cadete cobró ' + money(d.tot || 0) + ': falta rendir la plata.' : ' ya lo recibió.'), u: APP(env) + '?ped=1', tag: 'cad-' + id });
    }
  }
  const info = (await aGet(env, 'stores/' + sid + '/public/info')) || {};
  return { ok: true, p: { id, st: d.st, cl: d.cl || '', tel: d.tel || '', dir: d.dir || '', geo: d.geo || null, nota: d.nota || '', tot: d.tot || 0, pago: d.pago || '', paga: d.paga || 0, pagado: pagado(d), cad: d.cad || '',
    n: (d.it || []).reduce((a, x) => a + (x.w ? 1 : (+x.q || 0)), 0), it: (d.it || []).slice(0, 40).map((x) => ({ n: x.n, q: x.q, w: x.w ? 1 : 0, x: x.x || '' })) }, tienda: { n: info.name || '', tel: (Array.isArray(info.was) && info.was[0] && info.was[0].w) || info.wa || '', addr: info.addr || '' } };
}
// Mesas que atiende cada mozo (cfg/servicios.mozos = { uid: '4, 5, 6' | '1-8' }), igual que en pedidos.js
export function mesasDe(t) {
  const s = new Set();
  String(t || '').split(/[\s,;y]+/).forEach((x) => { const m = /^(\d+)-(\d+)$/.exec(x); if (m) { for (let i = +m[1]; i <= Math.min(+m[2], +m[1] + 200); i++) s.add(String(i)); } else if (x.trim()) s.add(x.trim().toLowerCase()); });
  return s;
}
// Pedido de una mesa marcado "listo": avisa a los mozos que atienden esa mesa.
export async function pedidoListo(env, sid, id) {
  if (!/^[A-Za-z0-9]{12,40}$/.test(String(id))) return false;
  const d = await aGet(env, 'stores/' + sid + '/pedidos/' + id);
  if (!d || d.st !== 'listo' || d.tipo !== 'mesa' || !(Math.abs(Date.now() - (d.upd || 0)) < 10 * 60000)) return false;
  const cfg = (await aGet(env, 'stores/' + sid + '/cfg/servicios')) || {}, mz = cfg.mozos || {}, mesa = String(d.mesa || '').trim().toLowerCase();
  const quien = Object.keys(mz).filter((u) => mesasDe(mz[u]).has(mesa));
  if (!quien.length) return false;
  if (!await una(env, 'listo:' + sid + ':' + id)) return false;
  await enviar(env, quien, { t: '🍽️ Mesa ' + (d.mesa || '') + ' · pedido listo', b: 'El pedido #' + String(id).slice(-4).toUpperCase() + (d.cl ? ' de ' + d.cl : '') + ' está listo para llevar a la mesa.', u: APP(env) + '?ped=1', tag: 'listo-' + id });
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

// ---------- Avisos al cliente del catálogo (no tiene cuenta ni app) ----------
// Al hacer el pedido puede tocar "Avisame cuando salga": su navegador da un permiso de notificaciones y lo guardamos
// en KV cli:{sid}:{id} por 2 días, solo para ese pedido. Cuando el local cambia el estado, la app llama a /push/estado
// y le llega el aviso aunque tenga la página cerrada (Android y compu; en iPhone, solo si tiene la página en el inicio).
const idOk = (id) => /^[A-Za-z0-9]{12,40}$/.test(String(id));
const FIN = ['entregado', 'rendir', 'servido', 'cancelado'];
const linkPedido = (env, sid, id) => (env.APP_URL || 'https://pekeronapp.com') + '/catalogo.html?t=' + encodeURIComponent(sid) + '&ped=' + id;
async function nombreTienda(env, sid) { try { const t = (await aGet(env, 'stores/' + sid + '/public/info')) || {}; return t.n || t.name || ''; } catch (e) { return ''; } }
export async function clienteAlta(env, sid, id, sub) {
  if (!idOk(id) || !subOk(sub)) return { error: 'Datos inválidos.' };
  const d = await aGet(env, 'stores/' + sid + '/pedidos/' + id);
  if (!d || d.src !== 'web' || FIN.includes(d.st) || !(Date.now() - (d.at || 0) < 12 * 3600000)) return { error: 'Ese pedido ya no está activo.' };
  await env.MP.put('cli:' + sid + ':' + id, JSON.stringify({ e: sub.endpoint, k: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }), { expirationTtl: 2 * 86400 });
  const tn = await nombreTienda(env, sid), cod = String(id).slice(-4).toUpperCase();
  await aUno(env, JSON.parse(await env.MP.get('cli:' + sid + ':' + id)), { t: '🔔 Listo, te avisamos', b: 'Te va a llegar un aviso cuando tu pedido #' + cod + (tn ? ' de ' + tn : '') + (d.tipo === 'env' ? ' salga para tu casa.' : ' esté listo.'), u: linkPedido(env, sid, id), tag: 'ped-' + id });
  return { ok: true };
}
export function msgCliente(d, tn) {
  const cod = '#' + String(d.id || '').slice(-4).toUpperCase(), de = tn ? ' de ' + tn : '';
  const hm = (ms) => new Date(ms - 3 * 3600000).toISOString().slice(11, 16);
  if (d.st === 'ok') return { t: '👨‍🍳 Confirmaron tu pedido', b: 'Tu pedido ' + cod + de + ' ya se está preparando.' + (d.min && d.acc ? ' Estimado: ' + hm(d.acc + d.min * 60000) + '.' : '') };
  if (d.st === 'camino') return { t: '🛵 ¡Tu pedido va en camino!', b: 'Tu pedido ' + cod + de + ' ya salió' + (d.dir ? ' para ' + d.dir : '') + '.', urg: 'high' };
  if (d.st === 'listo' && d.tipo === 'ret') return { t: '✅ ¡Tu pedido está listo!', b: 'Ya podés pasar a retirar tu pedido ' + cod + de + '.', urg: 'high' };
  if (d.st === 'listo' && d.tipo === 'mesa') return { t: '🍽️ ¡Ya sale para tu mesa!', b: 'Tu pedido ' + cod + ' está listo. Buen provecho.' };
  if (d.st === 'cancelado') return { t: '❌ No pudieron tomar tu pedido', b: 'El pedido ' + cod + de + ' fue cancelado.' + (d.mot ? ' Motivo: ' + d.mot : '') };
  return null;
}
export async function clienteEstado(env, sid, id) {
  if (!idOk(id)) return false;
  const sub = await env.MP.get('cli:' + sid + ':' + id, 'json'); if (!sub) return false;
  const d = await aGet(env, 'stores/' + sid + '/pedidos/' + id);
  if (!d || !(Math.abs(Date.now() - (d.upd || 0)) < 10 * 60000)) return false;
  const m = msgCliente(Object.assign({ id }, d), await nombreTienda(env, sid)); if (!m) return false;
  if (!await una(env, 'cli:' + sid + ':' + id + ':' + d.st)) return false;
  const vivo = await aUno(env, sub, Object.assign(m, { u: linkPedido(env, sid, id), tag: 'ped-' + id }));
  if (!vivo || FIN.includes(d.st)) await env.MP.delete('cli:' + sid + ':' + id);
  return true;
}
