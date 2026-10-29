// Servidor de pagos de Pekeron (Cloudflare Worker).
// - Cada negocio conecta su cuenta de Mercado Pago (OAuth). Su clave queda guardada acá (KV), nunca en el catálogo.
// - El catálogo pide un cobro: el servidor recalcula el total con los datos públicos de la tienda (pedido.js)
//   y crea el cobro en Mercado Pago con ese monto. El cliente paga sin escribir el importe.
// - Pekeron puede cobrar una comisión por venta (marketplace_fee); arranca en 0% y la cambia el dueño de la plataforma.
//
// Variables (wrangler.toml): FB_PROJECT, FB_API_KEY, ORIGINS (orígenes permitidos, separados por coma), OWNER_UIDS
// Secretos: MP_CLIENT_ID, MP_CLIENT_SECRET (conexión de cuentas), MP_ACCESS_TOKEN (cuenta de Pekeron: suscripciones),
//   FB_SA (cuenta de servicio de Firebase: extender abonos)
// KV: MP  →  tok:{sid} = {at, rt, exp, mpuid, nick, conn}   st:{state} = {sid, uid, vuelta}   cfg:fee = {pct}
import { calcularPedido, gruposStock, gruposLista } from '../../pedido.js';
import * as SUS from './suscripciones.js';
import * as AV from './avisos.js';
import * as PUSH from './push.js';
import { verificar } from './auth.js';
import { aGet, aSet, aQuery, aFaltantes } from './admin.js';

const MP_API = 'https://api.mercadopago.com';
const MP_AUTH = 'https://auth.mercadopago.com/authorization';

// ---------- utilidades ----------
function cors(req, env) {
  const o = req.headers.get('Origin') || '', ok = origenes(env).includes(o);
  return ok ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {};
}
const origenes = (env) => String(env.ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const urlPermitida = (u, env) => { try { const x = new URL(u); return origenes(env).includes(x.origin); } catch (e) { return false; } };
const json = (req, env, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(req, env) } });
const err = (req, env, msg, status = 400, extra) => json(req, env, { error: msg, ...(extra || {}) }, status);
const sidOk = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);
function azar(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); }
function con(u, p) { return u + (u.includes('?') ? '&' : '?') + p; }

// ---------- Firestore (API REST, con las mismas reglas de seguridad que la app) ----------
function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return fieldsToObj(v.mapValue.fields || {});
  return null;
}
function fieldsToObj(f) { const o = {}; for (const k in f) o[k] = fromFs(f[k]); return o; }
const fsBase = (env) => 'https://firestore.googleapis.com/v1/projects/' + env.FB_PROJECT + '/databases/(default)/documents/';
async function fsGet(env, path, token, mask) {
  let u = fsBase(env) + path + '?key=' + env.FB_API_KEY;
  (mask || []).forEach((m) => { u += '&mask.fieldPaths=' + encodeURIComponent(m); });
  const r = await fetch(u, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (r.status === 404) return { status: 404, data: null };
  if (!r.ok) return { status: r.status, data: null };
  const d = await r.json(); return { status: 200, data: fieldsToObj(d.fields || {}) };
}
async function fsList(env, path, mask) {
  const out = []; let tok = '';
  for (let i = 0; i < 20; i++) {
    let u = fsBase(env) + path + '?key=' + env.FB_API_KEY + '&pageSize=300';
    (mask || []).forEach((m) => { u += '&mask.fieldPaths=' + encodeURIComponent(m); });
    if (tok) u += '&pageToken=' + encodeURIComponent(tok);
    const r = await fetch(u); if (!r.ok) throw new Error('fs ' + r.status);
    const d = await r.json();
    (d.documents || []).forEach((x) => out.push({ id: x.name.split('/').pop(), x: fieldsToObj(x.fields || {}) }));
    if (!d.nextPageToken) break; tok = d.nextPageToken;
  }
  return out;
}

// ---------- quién llama (token de Firebase de la app) ----------
function uidDe(token) {
  try { const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return p.user_id || p.sub || ''; } catch (e) { return ''; }
}
const tokenDe = (req) => (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
// Administrador de la tienda: Firestore solo deja leer members/{uid} con un token válido de ese mismo usuario.
async function esAdmin(env, token, sid) {
  const uid = uidDe(token); if (!uid || !sidOk(sid)) return '';
  const r = await fsGet(env, 'stores/' + sid + '/members/' + uid, token, ['role']);
  return r.status === 200 && r.data && r.data.role === 'admin' ? uid : '';
}
// Propietario de la plataforma: platform_owners/{uid} (o los uid fijos), con token válido.
async function esDueno(env, token) {
  const uid = uidDe(token); if (!uid) return false;
  const r = await fsGet(env, 'platform_owners/' + uid, token);
  if (r.status === 200) return true;
  return r.status === 404 && String(env.OWNER_UIDS || '').split(',').map((s) => s.trim()).includes(uid);
}

// ---------- Mercado Pago ----------
async function mpToken(env, body) {
  const r = await fetch(MP_API + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ client_id: env.MP_CLIENT_ID, client_secret: env.MP_CLIENT_SECRET, ...body }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('mp oauth ' + r.status + ' ' + (d.message || d.error || ''));
  return d;
}
// Clave del negocio, renovada si vence en menos de una semana.
async function claveDe(env, sid) {
  const t = await env.MP.get('tok:' + sid, 'json'); if (!t) return null;
  if (t.exp && t.exp - Date.now() < 7 * 864e5 && t.rt) {
    try {
      const d = await mpToken(env, { grant_type: 'refresh_token', refresh_token: t.rt });
      Object.assign(t, { at: d.access_token, rt: d.refresh_token || t.rt, exp: Date.now() + (d.expires_in || 15552000) * 1000 });
      await env.MP.put('tok:' + sid, JSON.stringify(t));
    } catch (e) { if (t.exp < Date.now()) return null; }
  }
  return t;
}

// ---------- rutas ----------
async function conectar(req, env) {
  const b = await req.json().catch(() => ({})), token = tokenDe(req);
  if (!env.MP_CLIENT_ID || !env.MP_CLIENT_SECRET) return err(req, env, 'Todavía no está configurada la aplicación de Mercado Pago de Pekeron.', 503);
  const uid = await esAdmin(env, token, b.sid); if (!uid) return err(req, env, 'Solo un administrador de la tienda puede conectar Mercado Pago.', 403);
  if (!urlPermitida(b.vuelta, env)) return err(req, env, 'Dirección de vuelta no permitida.');
  const state = azar(16);
  await env.MP.put('st:' + state, JSON.stringify({ sid: b.sid, uid, vuelta: b.vuelta }), { expirationTtl: 900 });
  const redir = new URL(req.url).origin + '/mp/vuelta';
  const url = MP_AUTH + '?client_id=' + encodeURIComponent(env.MP_CLIENT_ID) + '&response_type=code&platform_id=mp&state=' + state + '&redirect_uri=' + encodeURIComponent(redir);
  return json(req, env, { url });
}
async function vuelta(req, env) {
  const u = new URL(req.url), state = u.searchParams.get('state') || '', code = u.searchParams.get('code') || '';
  const st = state && await env.MP.get('st:' + state, 'json');
  if (!st) return new Response('El link venció. Volvé a la app y tocá "Conectar Mercado Pago" de nuevo.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  await env.MP.delete('st:' + state);
  if (!code) return Response.redirect(con(st.vuelta, 'mp=no'), 302);
  try {
    const d = await mpToken(env, { grant_type: 'authorization_code', code, redirect_uri: u.origin + '/mp/vuelta', test_token: 'false' });
    let nick = '';
    try { const me = await fetch(MP_API + '/users/me', { headers: { Authorization: 'Bearer ' + d.access_token } }).then((r) => r.json()); nick = me.nickname || me.email || ''; } catch (e) {}
    await env.MP.put('tok:' + st.sid, JSON.stringify({ at: d.access_token, rt: d.refresh_token || '', exp: Date.now() + (d.expires_in || 15552000) * 1000, mpuid: d.user_id || '', nick, conn: Date.now(), por: st.uid }));
    return Response.redirect(con(st.vuelta, 'mp=ok'), 302);
  } catch (e) {
    return Response.redirect(con(st.vuelta, 'mp=error'), 302);
  }
}
async function estado(req, env) {
  const b = await req.json().catch(() => ({}));
  if (!await esAdmin(env, tokenDe(req), b.sid)) return err(req, env, 'Sin permiso.', 403);
  const t = await env.MP.get('tok:' + b.sid, 'json');
  return json(req, env, { on: !!t, nick: t ? t.nick : '', conn: t ? t.conn : 0, listo: !!(env.MP_CLIENT_ID && env.MP_CLIENT_SECRET) });
}
async function desconectar(req, env) {
  const b = await req.json().catch(() => ({}));
  if (!await esAdmin(env, tokenDe(req), b.sid)) return err(req, env, 'Sin permiso.', 403);
  await env.MP.delete('tok:' + b.sid);
  return json(req, env, { ok: true });
}
async function comision(req, env) {
  if (req.method === 'GET') { const c = await env.MP.get('cfg:fee', 'json'); return json(req, env, { pct: (c && c.pct) || 0 }); }
  const b = await req.json().catch(() => ({}));
  if (!await esDueno(env, tokenDe(req))) return err(req, env, 'Sin permiso.', 403);
  const pct = Math.max(0, Math.min(10, Math.round((+b.pct || 0) * 100) / 100));
  await env.MP.put('cfg:fee', JSON.stringify({ pct, at: Date.now() }));
  return json(req, env, { pct });
}
async function pagar(req, env) {
  const b = await req.json().catch(() => ({}));
  if (!sidOk(b.sid)) return err(req, env, 'Tienda inválida.');
  if (!urlPermitida(b.vuelta, env)) return err(req, env, 'Dirección de vuelta no permitida.');
  const inf = await fsGet(env, 'stores/' + b.sid + '/public/info', null, ['enabled', 'alm', 'name', 'mode', 'minCart', 'env', 'pagos', 'mon', 'susp']);
  const info = inf.data;
  if (!info || !info.enabled) return err(req, env, 'Este catálogo no está disponible.', 404);
  if (info.susp) return err(req, env, 'Este catálogo no está disponible por el momento.', 403);
  if (!(info.pagos && info.pagos.mpa && info.pagos.mpa.on) || info.mon === 'USD') return err(req, env, 'Este negocio no tiene activado el pago online.', 403);
  const t = await claveDe(env, b.sid); if (!t) return err(req, env, 'Este negocio todavía no conectó su Mercado Pago.', 403);
  // productos y promos, con los mismos datos que ve el catálogo
  let G;
  if (info.alm) {
    const L = await fsGet(env, 'stores/' + b.sid + '/public/lista', null, ['n']);
    const n = Math.min(50, (L.data && L.data.n) || 0), partes = [];
    for (let i = 0; i < n; i++) { const d = await fsGet(env, 'stores/' + b.sid + '/public/lista_d' + i); partes.push(d.data && d.data.p); }
    G = gruposLista(partes);
  } else {
    G = gruposStock(await fsList(env, 'stores/' + b.sid + '/stock', ['n', 's', 'pm', 'pn', 'mm', 'oh', 'q', 'w', 'cat']));
  }
  const pr = await fsGet(env, 'stores/' + b.sid + '/public/promos');
  const c = calcularPedido({ items: b.items, G, info, promos: (pr.data && pr.data.list) || [], now: Date.now(), pago: 'mpa', entrega: b.entrega });
  if (!c.ok) return err(req, env, 'No pude armar el cobro: ' + c.error + '. Actualizá la página y probá de nuevo.', 409);
  if (!(c.total > 0)) return err(req, env, 'El total del pedido no es válido.', 409);
  if (Math.abs(c.total - Math.round(+b.total || 0)) > 1) return err(req, env, 'Los precios cambiaron. Actualizá la página para ver el total nuevo.', 409, { total: c.total });
  const fee = await env.MP.get('cfg:fee', 'json'), pct = (fee && fee.pct) || 0;
  const ref = String(b.ref || azar(6)).replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  const desc = c.lineas.map((x) => x.q + ' × ' + x.n).join(', ').slice(0, 250);
  const pref = {
    items: [{ id: 'pedido', title: ('Pedido en ' + (info.name || 'la tienda')).slice(0, 250), description: desc, quantity: 1, unit_price: c.total, currency_id: 'ARS' }],
    external_reference: ref,
    back_urls: { success: con(b.vuelta, 'mp=pago'), pending: con(b.vuelta, 'mp=pago'), failure: con(b.vuelta, 'mp=pago') },
    auto_return: 'approved',
    metadata: { sid: b.sid, ref },
    notification_url: new URL(req.url).origin + '/mp/webhook?sid=' + encodeURIComponent(b.sid),
  };
  if (pct > 0) pref.marketplace_fee = Math.round(c.total * pct) / 100;
  const r = await fetch(MP_API + '/checkout/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t.at, 'X-Idempotency-Key': b.sid + '-' + ref + '-' + c.total }, body: JSON.stringify(pref) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.init_point) return err(req, env, 'Mercado Pago no aceptó el cobro. Probá de nuevo o elegí otro medio de pago.', 502, { mp: d.message || '' });
  return json(req, env, { url: d.init_point, total: c.total });
}

// ---------- débito automático del abono (suscripciones) ----------
const emailOk = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 120;
async function susRuta(req, env, path) {
  if (!env.MP_ACCESS_TOKEN || !env.FB_SA) return err(req, env, 'Todavía no está activado el débito automático.', 503);
  const b = await req.json().catch(() => ({}));
  if (!await esAdmin(env, tokenDe(req), b.sid)) return err(req, env, 'Solo un administrador de la tienda puede hacer esto.', 403);
  try {
    if (path === '/sus/crear') {
      if (!emailOk(b.email)) return err(req, env, 'Revisá el email de Mercado Pago.');
      if (!urlPermitida(b.vuelta, env)) return err(req, env, 'Dirección de vuelta no permitida.');
      return json(req, env, await SUS.crear(env, { sid: b.sid, plan: String(b.plan || ''), email: b.email.trim().toLowerCase(), vuelta: b.vuelta }));
    }
    if (path === '/sus/sync') return json(req, env, await SUS.sincronizar(env, b.sid));
    if (path === '/sus/cancelar') return json(req, env, await SUS.cancelar(env, b.sid));
  } catch (e) {
    if (e.http) return err(req, env, e.message, e.http);
    console.error(e && e.stack || e, e && e.mp);
    return err(req, env, e.mp && /payer_email|email/i.test(JSON.stringify(e.mp)) ? 'Mercado Pago no aceptó ese email. Usá el mismo email con el que entrás a Mercado Pago.' : 'Mercado Pago no respondió bien. Probá de nuevo en un rato.', 502);
  }
  return err(req, env, 'No encontrado.', 404);
}
// ---------- notificaciones al celular ----------
async function pushRuta(req, env, path) {
  const b = await req.json().catch(() => ({}));
  if (path === '/push/clave') return json(req, env, { clave: (await PUSH.vapid(env)).pub });
  if (!env.FB_SA) return json(req, env, { ok: false });
  // Avisos que dispara el catálogo (sin sesión): el servidor verifica todo antes de mandar.
  if (path === '/push/turno') { if (sidOk(b.sid)) { try { await AV.turnoNuevo(env, b.sid, String(b.id || '')); } catch (e) { console.error(e && e.message); } } return json(req, env, { ok: true }); }
  if (path === '/push/pago') { if (sidOk(b.sid)) { try { const t = await claveDe(env, b.sid); if (t) await AV.pagoCatalogo(env, b.sid, String(b.id || ''), t.at); } catch (e) { console.error(e && e.message); } } return json(req, env, { ok: true }); }
  const uid = await verificar(env, tokenDe(req)); if (!uid) return err(req, env, 'Iniciá sesión de nuevo.', 401);
  try {
    if (path === '/push/alta') return json(req, env, { ok: true, n: await PUSH.alta(env, uid, b.sub) });
    if (path === '/push/baja') { await PUSH.baja(env, uid, String(b.endpoint || '')); return json(req, env, { ok: true }); }
    if (path === '/push/prueba') return json(req, env, { n: await PUSH.enviar(env, [uid], { t: '🔔 Avisos activados', b: 'Así te van a llegar los avisos de Pekeron a este celular.', u: (env.APP_URL || 'https://pekeronapp.com') + '/app.html', tag: 'prueba' }) });
    // Soporte: el dueño de la plataforma entra como administrador a una tienda (si perdió el acceso o para ayudar a un cliente).
    if (path === '/admin/entrar') {
      if (!await esDueno(env, tokenDe(req))) return err(req, env, 'Sin permiso.', 403);
      if (!sidOk(b.sid)) return err(req, env, 'Tienda inválida.');
      const st = await aGet(env, 'stores/' + b.sid); if (!st) return err(req, env, 'No existe esa tienda.', 404);
      const m = await aGet(env, 'stores/' + b.sid + '/members/' + uid);
      if (!m || m.role !== 'admin') await aSet(env, 'stores/' + b.sid + '/members/' + uid, { ...(m || {}), role: 'admin', email: String(b.email || '').slice(0, 120), name: String(b.name || 'Soporte Pekeron').slice(0, 60) });
      const o = { name: st.name || 'Tienda' }; if (st.main) o.main = st.main;
      await aSet(env, 'users/' + uid + '/stores/' + b.sid, o);
      return json(req, env, { ok: true, name: o.name });
    }
    if (path === '/admin/huerfanas' || path === '/admin/restaurar') {
      if (!await esDueno(env, tokenDe(req))) return err(req, env, 'Sin permiso.', 403);
      if (path === '/admin/huerfanas') {
        const ids = await aFaltantes(env, 'stores'), l = [];
        for (const sid of ids.slice(0, 50)) {
          const [pi, mem, acc] = await Promise.all([aGet(env, 'stores/' + sid + '/public/info').catch(() => null), aQuery(env, 'stores/' + sid, 'members', []).catch(() => []), aGet(env, 'stores/' + sid + '/billing/access').catch(() => null)]);
          if (!mem.length && !pi) continue;
          l.push({ sid, name: (pi && pi.name) || '', admins: mem.filter((m) => m.x.role === 'admin').map((m) => m.x.email || m.x.name || m.id), n: mem.length, desde: (acc && (acc.trialStartMs || acc.updatedAt)) || null });
        }
        return json(req, env, { l });
      }
      if (!sidOk(b.sid)) return err(req, env, 'Tienda inválida.');
      if (await aGet(env, 'stores/' + b.sid)) return err(req, env, 'Esa tienda ya existe.', 409);
      const [pi, mem, acc, cfg] = await Promise.all([aGet(env, 'stores/' + b.sid + '/public/info').catch(() => null), aQuery(env, 'stores/' + b.sid, 'members', []), aGet(env, 'stores/' + b.sid + '/billing/access').catch(() => null), aGet(env, 'stores/' + b.sid + '/cfg/servicios').catch(() => null)]);
      if (!mem.length) return err(req, env, 'No encontré el equipo de esa tienda.', 404);
      const adm = mem.filter((m) => m.x.role === 'admin'), owner = (adm.find((m) => m.id === uid) || adm[0] || mem[0]).id;
      const name = String(b.name || (pi && pi.name) || 'Tienda').slice(0, 60);
      const st = { name, owner, created: (acc && acc.trialStartMs) || Date.now(), pais: 'AR', mon: 'ARS', restaurada: Date.now() };
      await aSet(env, 'stores/' + b.sid, st);
      for (const m of mem) await aSet(env, 'users/' + m.id + '/stores/' + b.sid, { name });
      return json(req, env, { ok: true, name, owner, equipo: mem.length, tipo: (cfg && cfg.tipo) || '' });
    }
    if (path === '/push/revisar') { if (!await esDueno(env, tokenDe(req))) return err(req, env, 'Sin permiso.', 403); return json(req, env, await AV.revisar(env)); }
    if (path === '/push/nueva') { if (sidOk(b.sid)) await AV.negocioNuevo(env, uid, b.sid); return json(req, env, { ok: true }); }
  } catch (e) { if (e.http) return err(req, env, e.message, e.http); throw e; }
  return err(req, env, 'No encontrado.', 404);
}
// Foto de producto de la base pública (Open Food Facts) para la app, cuando el navegador no la deja bajar directo.
async function imagen(req, env) {
  const u = new URL(req.url).searchParams.get('u') || '';
  if (!/^https:\/\/images\.open(food|beauty)facts\.org\/[\w./-]+\.(jpg|jpeg|png|webp)$/i.test(u)) return err(req, env, 'Imagen no permitida.', 400);
  const r = await fetch(u, { cf: { cacheTtl: 86400, cacheEverything: true } });
  const len = +(r.headers.get('content-length') || 0);
  if (!r.ok || len > 3000000 || !/^image\//.test(r.headers.get('content-type') || '')) return err(req, env, 'No se pudo bajar la imagen.', 502);
  const h = new Headers({ 'Content-Type': r.headers.get('content-type'), 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' });
  return new Response(r.body, { status: 200, headers: h });
}
async function webhook(req, env) {
  const u = new URL(req.url); let b = {};
  try { b = await req.json(); } catch (e) {}
  const tipo = String(b.type || b.topic || u.searchParams.get('type') || u.searchParams.get('topic') || '');
  const id = String((b.data && b.data.id) || u.searchParams.get('data.id') || u.searchParams.get('id') || '');
  // Pago de un pedido del catálogo (cuenta de Mercado Pago de la tienda): aviso al negocio.
  const sidCat = u.searchParams.get('sid');
  if (sidCat) {
    if (/payment/.test(tipo) && sidOk(sidCat) && env.FB_SA) { try { const t = await claveDe(env, sidCat); if (t) await AV.pagoCatalogo(env, sidCat, id, t.at); } catch (e) { console.error('aviso pago', e && e.message); } }
    return new Response('ok');
  }
  if (env.MP_ACCESS_TOKEN && env.FB_SA && /^[A-Za-z0-9_-]{1,64}$/.test(id)) { try { await SUS.aviso(env, tipo, id); } catch (e) { console.error('aviso', tipo, id, e && e.message); return new Response('reintentar', { status: 500 }); } }
  return new Response('ok');
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) });
    try {
      if (path === '/' ) return json(req, env, { ok: true, servicio: 'pagos pekeron', sus: !!(env.MP_ACCESS_TOKEN && env.FB_SA), mp: !!(env.MP_CLIENT_ID && env.MP_CLIENT_SECRET) });
      if (path === '/mp/vuelta' && req.method === 'GET') return await vuelta(req, env);
      if (path === '/mp/comision') return await comision(req, env);
      if (path === '/mp/webhook') return await webhook(req, env);
      if (path === '/push/clave') return await pushRuta(req, env, path);
      if (path === '/img' && req.method === 'GET') return await imagen(req, env);
      if (req.method !== 'POST') return err(req, env, 'Método no permitido.', 405);
      if (path === '/mp/conectar') return await conectar(req, env);
      if (path === '/mp/estado') return await estado(req, env);
      if (path === '/mp/desconectar') return await desconectar(req, env);
      if (path === '/pagar') return await pagar(req, env);
      if (path.startsWith('/sus/')) return await susRuta(req, env, path);
      if (path.startsWith('/push/') || path.startsWith('/admin/')) return await pushRuta(req, env, path);
      return err(req, env, 'No encontrado.', 404);
    } catch (e) {
      console.error(e && e.stack || e);
      return err(req, env, 'Ocurrió un error. Probá de nuevo.', 500);
    }
  },
  // Reloj del servidor (wrangler.toml → [triggers]): avisos de vencimiento y suspensión automática.
  async scheduled(ev, env, ctx) {
    if (!env.FB_SA) return;
    ctx.waitUntil(AV.revisar(env).then((r) => console.log('revisar', JSON.stringify(r))).catch((e) => console.error('revisar', e && e.message)));
  },
};
