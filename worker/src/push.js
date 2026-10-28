// Notificaciones al celular (Web Push, RFC 8291 + VAPID RFC 8292) con WebCrypto, sin librerías.
// Las claves VAPID se generan solas la primera vez y quedan guardadas en KV ('vapid').
// Celulares de cada usuario: KV push:{uid} = [{ e: endpoint, k: { p256dh, auth }, at }]

const te = new TextEncoder();
export const b64u = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64u = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const cat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

// ---------- claves VAPID ----------
let VAP = null;
export async function vapid(env) {
  if (VAP) return VAP;
  let v = await env.MP.get('vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
    const otra = await env.MP.get('vapid', 'json'); if (otra) v = otra; else await env.MP.put('vapid', JSON.stringify(v));
  }
  VAP = { pub: v.pub, key: await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
  return VAP;
}
export function _reset() { VAP = null; }
async function vapidJwt(v, endpoint, sub) {
  const aud = new URL(endpoint).origin;
  const data = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' + b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.key, te.encode(data));
  return data + '.' + b64u(sig);
}

// ---------- cifrado del mensaje (aes128gcm) ----------
export async function cifrar(payload, p256dh, auth) {
  const ua = unb64u(p256dh), sec = unb64u(auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(sec, shared, cat(te.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, cat(te.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

// Manda a un celular. Devuelve false si el celular ya no existe (hay que borrarlo).
async function enviarUno(env, sus, msg) {
  const v = await vapid(env);
  const body = await cifrar(JSON.stringify(msg), sus.k.p256dh, sus.k.auth);
  const r = await fetch(sus.e, { method: 'POST', headers: { TTL: '86400', Urgency: msg.urg || 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
    Authorization: 'vapid t=' + await vapidJwt(v, sus.e, env.PUSH_SUB || 'mailto:soporte@pekeronapp.com') + ', k=' + v.pub }, body });
  if (r.status === 404 || r.status === 410) return false;
  return true;
}

const endpointOk = (e) => { try { const u = new URL(e); return u.protocol === 'https:' && /(^|\.)(googleapis\.com|mozilla\.com|mozaws\.net|push\.apple\.com|notify\.windows\.com|windows\.com)$/.test(u.hostname); } catch (x) { return false; } };
export async function alta(env, uid, s) {
  if (!s || !endpointOk(s.endpoint) || !s.keys || !s.keys.p256dh || !s.keys.auth) throw Object.assign(new Error('Datos del celular inválidos.'), { http: 400 });
  const l = ((await env.MP.get('push:' + uid, 'json')) || []).filter((x) => x.e !== s.endpoint);
  l.push({ e: s.endpoint, k: { p256dh: s.keys.p256dh, auth: s.keys.auth }, at: Date.now() });
  await env.MP.put('push:' + uid, JSON.stringify(l.slice(-6)));
  return l.length;
}
export async function baja(env, uid, endpoint) {
  const l = ((await env.MP.get('push:' + uid, 'json')) || []).filter((x) => x.e !== endpoint);
  await env.MP.put('push:' + uid, JSON.stringify(l));
}
// msg = { t: título, b: texto, u: link al tocar, tag }
export async function enviar(env, uids, msg) {
  let n = 0;
  for (const uid of [...new Set(uids)].filter(Boolean)) {
    const l = (await env.MP.get('push:' + uid, 'json')) || []; if (!l.length) continue;
    const vivos = [];
    for (const s of l) { let ok = true; try { ok = await enviarUno(env, s, msg); if (ok) n++; } catch (e) { console.error('push', e && e.message); } if (ok) vivos.push(s); }
    if (vivos.length !== l.length) await env.MP.put('push:' + uid, JSON.stringify(vivos));
  }
  return n;
}
