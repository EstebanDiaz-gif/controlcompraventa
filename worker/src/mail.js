// Promociones por email de cada local a sus clientes registrados en el menú (Brevo, https://www.brevo.com).
// Secreto BREVO_KEY (clave de API de Brevo). Variable MAIL_FROM: el remitente verificado en Brevo (ej. promos@pekeronapp.com);
// el mail sale con el nombre del local. MAIL_DIA: tope de mails por día entre todos los locales (plan gratis de Brevo: 300).
// Solo reciben los clientes que tildaron "Quiero recibir promos" (cr.mk) y cada mail trae su link para darse de baja.
import { aGet, aQuery, aMerge } from './admin.js';

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

// Arma el mail (html) de una promo.
export function armar(o) {
  const c = colorOk(o.color), ink = claro(c) ? '#111111' : '#FFFFFF';
  const parr = String(o.tx || '').split(/\n{2,}/).map((p) => '<p style="margin:0 0 14px">' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(o.as) + '</title></head>' +
    '<body style="margin:0;background:#F2F4F7;font-family:Arial,Helvetica,sans-serif;color:#1F2937">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:18px;overflow:hidden">' +
    '<tr><td style="background:' + c + ';color:' + ink + ';padding:22px 24px;font-size:22px;font-weight:bold">' + esc(o.tienda) + '</td></tr>' +
    '<tr><td style="padding:26px 24px 8px"><h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#111827">' + esc(o.as) + '</h1>' +
    '<div style="font-size:16px;line-height:1.55">' + parr + '</div></td></tr>' +
    (o.link ? '<tr><td style="padding:6px 24px 28px"><a href="' + esc(o.link) + '" style="display:inline-block;background:' + c + ';color:' + ink + ';text-decoration:none;font-weight:bold;font-size:17px;padding:15px 26px;border-radius:12px">Ver el menú y pedir</a></td></tr>' : '') +
    '</table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:16px 8px;font-size:12px;line-height:1.5;color:#6B7280;text-align:center">' +
    'Te llega este mail porque aceptaste recibir promos de ' + esc(o.tienda) + ' cuando creaste tu cuenta en su menú.<br>' +
    (o.baja ? '<a href="' + esc(o.baja) + '" style="color:#6B7280">No quiero recibir más promos</a>' : '') +
    '</td></tr></table></td></tr></table></body></html>';
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
  const fail = (m, h) => { const e = new Error(m); e.http = h || 400; throw e; };
  if (!env.BREVO_KEY || !env.MAIL_FROM) fail('El envío de mails todavía no está activado. Avisale a Pekeron App.', 503);
  const sid = String(b.sid || ''), as = String(b.as || '').trim().slice(0, 80), tx = String(b.tx || '').trim().slice(0, 1500);
  if (as.length < 3 || tx.length < 5) fail('Escribí el asunto y el mensaje.');
  const m = await aGet(env, 'stores/' + sid + '/members/' + uid);
  if (!m || m.role !== 'admin') fail('Solo el administrador del local puede mandar promos.', 403);
  const info = (await aGet(env, 'stores/' + sid + '/public/info')) || {};
  const tienda = String(info.name || 'Tu local').slice(0, 60);
  let link = String(b.link || ''); if (!/^https:\/\//.test(link) || link.length > 300) link = '';
  const base = { as, tx, link, tienda, color: info.color };
  const sender = { name: tienda.replace(/[<>"]/g, ''), email: env.MAIL_FROM };
  if (b.prueba) {
    if (!emailOk(email)) fail('Tu usuario no tiene un email para mandarte la prueba.');
    await brevo(env, { sender, to: [{ email }], subject: '[Prueba] ' + as, htmlContent: armar(base), tags: ['promo-prueba'] });
    return { ok: true, a: email };
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
  const versiones = [];
  for (const x of van) {
    const k = await firma(env, sid + ':' + x.id);
    const baja = origen + '/mail/baja?s=' + encodeURIComponent(sid) + '&u=' + encodeURIComponent(x.id) + '&k=' + k;
    versiones.push({ to: [{ email: x.x.em, name: String(x.x.n || '').replace(/[<>"]/g, '').slice(0, 60) || undefined }], htmlContent: armar(Object.assign({ baja }, base)) });
  }
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
