// Verifica el token de sesión de Firebase (el que manda la app) con las claves públicas de Google.
const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let CACHE = null;
const dec = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
async function claves() {
  if (CACHE && CACHE.exp > Date.now()) return CACHE.keys;
  const r = await fetch(JWKS); if (!r.ok) throw new Error('jwks ' + r.status);
  const d = await r.json(); CACHE = { keys: d.keys || [], exp: Date.now() + 3600000 }; return CACHE.keys;
}
export function _reset() { CACHE = null; }
// Devuelve el uid si el token es válido para este proyecto; si no, ''.
export async function verificar(env, token) {
  try {
    const [h, p, s] = String(token || '').split('.'); if (!h || !p || !s) return '';
    const hd = JSON.parse(new TextDecoder().decode(dec(h))), pl = JSON.parse(new TextDecoder().decode(dec(p)));
    if (hd.alg !== 'RS256') return '';
    const now = Math.floor(Date.now() / 1000);
    if (pl.aud !== env.FB_PROJECT || pl.iss !== 'https://securetoken.google.com/' + env.FB_PROJECT || !(pl.exp > now) || !(pl.iat <= now + 300) || !pl.sub) return '';
    const jwk = (await claves()).find((k) => k.kid === hd.kid); if (!jwk) return '';
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, dec(s), new TextEncoder().encode(h + '.' + p));
    return ok ? pl.sub : '';
  } catch (e) { return ''; }
}
