// Promociones por email de cada local a sus clientes registrados en el menú (Brevo, https://www.brevo.com).
// Secreto BREVO_KEY (clave de API de Brevo). Variable MAIL_FROM: el remitente verificado en Brevo (ej. promos@pekeronapp.com);
// el mail sale con el nombre del local. MAIL_DIA: tope de mails por día entre todos los locales (plan gratis de Brevo: 300).
// Solo reciben los clientes que tildaron "Quiero recibir promos" (cr.mk) y cada mail trae su link para darse de baja.
import { aGet, aQuery, aMerge, aCommit } from './admin.js';
import { qrPng } from './qrpng.js';

const BREVO = 'https://api.brevo.com/v3/smtp/email';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoy = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const emailOk = (e) => typeof e === 'string' && e.length <= 120 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(e);
const colorOk = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? c : '#1D4ED8');
const claro = (c) => { const n = parseInt(c.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 160; };

async function firma(env, txt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('baja:' + (env.MAIL_SECRET || env.BREVO_KEY || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(s)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const firmaBaja = firma;

// Mezcla un color con blanco (f = cuánto blanco, 0..1): fondos suaves del color del local.
const suave = (c, f) => { const n = parseInt(c.slice(1), 16), m = (x) => Math.round(x + (255 - x) * f).toString(16).padStart(2, '0'); return '#' + m(n >> 16) + m((n >> 8) & 255) + m(n & 255); };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
// "el viernes 27/11" (hora de Argentina)
export function venceTxt(ms) { const d = new Date(ms - 3 * 3600000); return 'el ' + DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1); }
export const verCodigo = (c) => c.slice(0, 3) + '-' + c.slice(3);

// Arma el mail (html) de una promo. o: { as, tx, link, tienda, color, logo (url), cup: { c, qr (url), ex (ms) }, baja, addr, wa, ig }
export function armar(o) {
  const c = colorOk(o.color), ink = claro(c) ? '#111111' : '#FFFFFF', acc = claro(c) ? '#111827' : c;
  const parr = String(o.tx || '').split(/\n{2,}/).map((p) => '<p style="margin:0 0 14px">' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
  const pre = String(o.tx || '').replace(/\s+/g, ' ').slice(0, 110);
  const ig = String(o.ig || '').replace(/^@/, '').replace(/[^\w.]/g, ''), wa = String(o.wa || '').replace(/\D/g, '');
  const datos = [o.addr ? '📍 ' + esc(String(o.addr).slice(0, 120)) : '', wa.length >= 8 ? '💬 <a href="https://wa.me/' + wa + '" style="color:' + acc + ';font-weight:bold;text-decoration:none">WhatsApp</a>' : '',
    ig ? '📷 <a href="https://instagram.com/' + esc(ig) + '" style="color:' + acc + ';font-weight:bold;text-decoration:none">@' + esc(ig) + '</a>' : ''].filter(Boolean);
  const cup = o.cup ? '<tr><td style="padding:12px 22px 4px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed ' + acc + ';border-radius:18px;background:' + suave(c, 0.93) + '"><tr><td align="center" style="padding:22px 16px 20px">' +
    '<div style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#4B5563">🎟️ TU CUPÓN</div>' +
    '<img src="' + esc(o.cup.qr) + '" width="190" height="190" alt="Código QR del cupón" style="display:block;margin:14px auto 12px;width:190px;height:190px;border:0;border-radius:12px;background:#FFFFFF">' +
    '<div style="font-family:\'Courier New\',Courier,monospace;font-size:30px;font-weight:bold;letter-spacing:6px;color:#111827">' + esc(verCodigo(o.cup.c)) + '</div>' +
    '<div style="margin-top:10px;font-size:15px;font-weight:bold;color:#111827">Válido hasta ' + esc(venceTxt(o.cup.ex)) + '</div>' +
    '<div style="margin-top:6px;font-size:13.5px;line-height:1.5;color:#4B5563">Mostrá este QR en el local o decí el código cuando hagas tu pedido.<br>Es personal y se usa una sola vez.</div>' +
    '</td></tr></table></td></tr>' : '';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' + esc(o.as) + '</title></head>' +
    '<body style="margin:0;background:#EEF0F4;font-family:Arial,Helvetica,sans-serif;color:#1F2937">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(pre) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F4;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:22px;overflow:hidden;box-shadow:0 2px 10px rgba(17,24,39,.08)">' +
    '<tr><td style="background:' + c + ';padding:20px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
    (o.logo ? '<td style="padding-right:14px;vertical-align:middle"><img src="' + esc(o.logo) + '" width="54" height="54" alt="" style="display:block;width:54px;height:54px;border-radius:50%;border:2px solid #FFFFFF;background:#FFFFFF;object-fit:cover"></td>' : '') +
    '<td style="vertical-align:middle;color:' + ink + ';font-size:21px;font-weight:bold;line-height:1.2">' + esc(o.tienda) + '<div style="font-size:13px;font-weight:normal;opacity:.85;margin-top:3px">Promo para nuestros clientes</div></td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:28px 26px 4px">' +
    '<span style="display:inline-block;background:' + suave(c, 0.88) + ';color:' + acc + ';font-size:12px;font-weight:bold;letter-spacing:1.5px;padding:6px 12px;border-radius:99px">🔥 PROMO</span>' +
    '<h1 style="margin:14px 0 12px;font-size:28px;line-height:1.2;color:#111827">' + esc(o.as) + '</h1>' +
    '<div style="font-size:16px;line-height:1.6;color:#374151">' + parr + '</div></td></tr>' +
    cup +
    (o.link ? '<tr><td style="padding:20px 24px 6px"><a href="' + esc(o.link) + '" style="display:block;background:' + c + ';color:' + ink + ';text-decoration:none;font-weight:bold;font-size:17px;padding:16px 22px;border-radius:14px;text-align:center">Ver el menú y pedir →</a></td></tr>' : '') +
    (datos.length ? '<tr><td style="padding:16px 24px 4px;font-size:14px;line-height:1.8;color:#4B5563;text-align:center">' + datos.join(' &nbsp;·&nbsp; ') + '</td></tr>' : '') +
    '<tr><td style="height:22px;line-height:22px;font-size:0">&nbsp;</td></tr>' +
    '</table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:16px 8px;font-size:12px;line-height:1.5;color:#6B7280;text-align:center">' +
    'Te llega este mail porque aceptaste recibir promos de ' + esc(o.tienda) + ' cuando creaste tu cuenta en su menú.<br>' +
    (o.baja ? '<a href="' + esc(o.baja) + '" style="color:#6B7280">No quiero recibir más promos</a>' : '') +
    '</td></tr></table></td></tr></table></body></html>';
}

// Cupones: 6 letras/números sin los que se confunden (0/O, 1/I/L).
export const ALF = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function nuevoCodigo() { const b = crypto.getRandomValues(new Uint8Array(6)); return Array.from(b, (x) => ALF[x % ALF.length]).join(''); }
export const cuponOk = (c) => new RegExp('^[' + ALF + ']{6}$').test(String(c || ''));
const sidOk = (s) => /^[A-Za-z0-9_-]{1,64}$/.test(String(s || ''));
// Lo que lleva el QR: el menú del local con el cupón (la cámara del celular abre el menú; el escáner de la app lee el cupón).
export const qrTexto = (sid, c) => 'https://pekeronapp.com/catalogo.html?t=' + sid + '&cupon=' + c;
// Vence a las 23:59 (Argentina) del día `dias` contando desde hoy.
export function vence(dias, ahora) { const d = new Date((ahora || Date.now()) - 3 * 3600000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dias, 26, 59, 59); }

// GET /mail/qr?s=&c=  → PNG del QR del cupón.
export async function qrImg(url) {
  const s = url.searchParams.get('s') || '', c = url.searchParams.get('c') || '';
  if (!sidOk(s) || !cuponOk(c)) return new Response('no', { status: 400 });
  const png = await qrPng(qrTexto(s, c), 8);
  return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
// GET /mail/logo?s=  → el logo del local (en Firestore está como "data:image/…"; los mails no muestran ese formato).
export async function logoImg(env, url) {
  const s = url.searchParams.get('s') || '';
  if (!sidOk(s)) return new Response('no', { status: 400 });
  const info = (await aGet(env, 'stores/' + s + '/public/info').catch(() => null)) || {};
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(info.logo || ''));
  if (!m) return new Response('no', { status: 404 });
  const bin = atob(m[2]), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Response(out, { headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=86400' } });
}

async function brevo(env, cuerpo) {
  const r = await fetch(BREVO, { method: 'POST', headers: { 'api-key': env.BREVO_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(cuerpo) });
  if (r.ok) return true;
  const t = await r.text().catch(() => '');
  console.error('brevo', r.status, t.slice(0, 300));
  const e = new Error(r.status === 401 ? 'La clave de Brevo no es válida. Avisale a Pekeron App.' : /sender/i.test(t) ? 'El remitente de los mails todavía no está verificado en Brevo. Avisale a Pekeron App.' : 'El servicio de mails no respondió bien. Probá de nuevo en un rato.');
  e.http = 502; throw e;
}

// POST /mail/promo  { sid, as, tx, link, prueba }  (con sesión de un administrador del local)
export async function promo(env, uid, email, b, origen) {
  if (!env.MAIL_FROM) env = { ...env, MAIL_FROM: 'promos@pekeronapp.com' };
  const fail = (m, h) => { const e = new Error(m); e.http = h || 400; throw e; };
  if (!env.BREVO_KEY || !env.MAIL_FROM) fail('El envío de mails todavía no está activado. Avisale a Pekeron App.', 503);
  const sid = String(b.sid || ''), as = String(b.as || '').trim().slice(0, 80), tx = String(b.tx || '').trim().slice(0, 1500);
  if (as.length < 3 || tx.length < 5) fail('Escribí el asunto y el mensaje.');
  const m = await aGet(env, 'stores/' + sid + '/members/' + uid);
  if (!m || m.role !== 'admin') fail('Solo el administrador del local puede mandar promos.', 403);
  const info = (await aGet(env, 'stores/' + sid + '/public/info')) || {};
  const tienda = String(info.name || 'Tu local').slice(0, 60);
  let link = String(b.link || ''); if (!/^https:\/\//.test(link) || link.length > 300) link = '';
  const logo = /^data:image\/(png|jpeg|gif|webp);base64,/.test(String(info.logo || '')) ? origen + '/mail/logo?s=' + encodeURIComponent(sid) + '&v=' + String(info.logo).length : '';
  const was = Array.isArray(info.was) && info.was[0] && info.was[0].w ? info.was[0].w : info.wa;
  const base = { as, tx, link, tienda, color: info.color, logo, addr: info.addr, wa: was, ig: info.ig };
  const sender = { name: tienda.replace(/[<>"]/g, ''), email: env.MAIL_FROM };
  // Cupón con QR (uno por cliente, se canjea una vez en el local). Vence en 3, 7, 15 o 30 días.
  const conCup = !!b.cup, dias = [3, 7, 15, 30].indexOf(+b.dias) >= 0 ? +b.dias : 7, ex = vence(dias), pid = Date.now().toString(36), at = Date.now();
  const cupDe = (c) => ({ c, ex, qr: origen + '/mail/qr?s=' + encodeURIComponent(sid) + '&c=' + c });
  if (b.prueba) {
    if (!emailOk(email)) fail('Tu usuario no tiene un email para mandarte la prueba.');
    let cup = null;
    if (conCup) { const c = nuevoCodigo(); await aCommit(env, [{ path: 'stores/' + sid + '/cupones/' + c, obj: { t: as, n: 'Prueba (' + email.split('@')[0] + ')', ex, at, p: pid, pr: true } }]); cup = cupDe(c); await aMerge(env, 'stores/' + sid + '/public/info', { cup: at }); }
    await brevo(env, { sender, to: [{ email }], subject: '[Prueba] ' + as, htmlContent: armar(Object.assign({ cup }, base)), tags: ['promo-prueba'] });
    return { ok: true, a: email, c: cup ? verCodigo(cup.c) : '' };
  }
  // Un envío por local cada 20 horas y un tope diario entre todos los locales.
  const kt = 'mail:t:' + sid, ult = +(await env.MP.get(kt) || 0);
  if (Date.now() - ult < 20 * 3600000) fail('Ya mandaste una promo hoy. Podés mandar otra mañana.', 429);
  const lista = (await aQuery(env, 'stores/' + sid, 'cr', [['mk', true]])).filter((x) => emailOk(x.x.em));
  const vistos = {}, dest = lista.filter((x) => { const e = x.x.em.toLowerCase(); if (vistos[e]) return false; vistos[e] = 1; return true; });
  if (!dest.length) fail('Todavía no hay clientes que hayan aceptado recibir promos.');
  const kd = 'mail:d:' + hoy(), usados = +(await env.MP.get(kd) || 0), tope = Math.max(0, (+env.MAIL_DIA || 300) - usados);
  if (!tope) fail('Por hoy se llegó al máximo de mails de Pekeron. Probá mañana temprano.', 429);
  const van = dest.slice(0, tope);
  const versiones = [], cupones = [];
  for (const x of van) {
    const k = await firma(env, sid + ':' + x.id);
    const baja = origen + '/mail/baja?s=' + encodeURIComponent(sid) + '&u=' + encodeURIComponent(x.id) + '&k=' + k;
    const nom = String(x.x.n || '').replace(/[<>"]/g, '').slice(0, 60);
    let cup = null;
    if (conCup) { const c = nuevoCodigo(); cup = cupDe(c); cupones.push({ path: 'stores/' + sid + '/cupones/' + c, obj: { t: as, n: nom || x.x.em, u: x.id, ex, at, p: pid } }); }
    versiones.push({ to: [{ email: x.x.em, name: nom || undefined }], htmlContent: armar(Object.assign({ baja, cup }, base)) });
  }
  // Los cupones se guardan antes de mandar: así, cuando el cliente llega al local, el cupón ya existe.
  if (cupones.length) { await aCommit(env, cupones); await aMerge(env, 'stores/' + sid + '/public/info', { cup: at }); }
  for (let i = 0; i < versiones.length; i += 900) {
    await brevo(env, { sender, subject: as, htmlContent: armar(base), messageVersions: versiones.slice(i, i + 900), tags: ['promo', 'sid-' + sid] });
  }
  await env.MP.put(kt, String(Date.now()), { expirationTtl: 86400 });
  await env.MP.put(kd, String(usados + van.length), { expirationTtl: 2 * 86400 });
  return { ok: true, n: van.length, falta: dest.length > van.length ? 'Por el tope diario quedaron ' + (dest.length - van.length) + ' sin mandar. Mandales la promo mañana.' : '' };
}

// GET /mail/baja?s=&u=&k=  → deja de mandarle promos de ese local.
export async function baja(env, url) {
  const s = url.searchParams.get('s') || '', u = url.searchParams.get('u') || '', k = url.searchParams.get('k') || '';
  const pag = (t, p) => new Response('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(t) + '</title></head>' +
    '<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#F2F4F7;color:#111827"><div style="max-width:440px;margin:60px auto;background:#fff;border-radius:18px;padding:28px 24px;text-align:center">' +
    '<div style="font-size:42px">' + (/Listo/.test(t) ? '✅' : '⚠️') + '</div><h1 style="font-size:21px;margin:10px 0">' + esc(t) + '</h1><p style="color:#4B5563;font-size:15px;line-height:1.5">' + p + '</p></div></body></html>',
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s) || !/^[A-Za-z0-9]{1,128}$/.test(u) || k !== await firma(env, s + ':' + u)) return pag('Link no válido', 'Este link para darte de baja no es válido. Si te siguen llegando mails, escribile al local para que te dé de baja.');
  await aMerge(env, 'stores/' + s + '/cr/' + u, { mk: false, mkat: Date.now() });
  const info = (await aGet(env, 'stores/' + s + '/public/info').catch(() => null)) || {};
  return pag('Listo, te dimos de baja', 'No te vamos a mandar más promos de <b>' + esc(info.name || 'este local') + '</b>. Tus pedidos y tu cuenta siguen igual.');
}
