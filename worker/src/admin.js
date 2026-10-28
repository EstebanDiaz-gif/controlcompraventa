// Acceso de administrador a Firestore desde el servidor de pagos, con una cuenta de servicio de Firebase
// (secreto FB_SA = el JSON que descarga Firebase). Solo lo usa el servidor para extender el abono de una tienda
// cuando Mercado Pago confirma un cobro; nunca sale del servidor.

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uStr = (s) => b64u(new TextEncoder().encode(s));
let MEM = null;

async function firmar(sa, claims) {
  const pem = String(sa.private_key || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const data = b64uStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64uStr(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  return data + '.' + b64u(sig);
}
export async function adminToken(env) {
  if (MEM && MEM.exp - Date.now() > 300000) return MEM.t;
  if (!env.FB_SA) throw new Error('Falta la cuenta de servicio de Firebase (FB_SA).');
  const sa = typeof env.FB_SA === 'string' ? JSON.parse(env.FB_SA) : env.FB_SA;
  const now = Math.floor(Date.now() / 1000);
  const jwt = await firmar(sa, { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('google token ' + r.status);
  MEM = { t: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return MEM.t;
}
export function _reset() { MEM = null; }

// ---------- conversión de valores ----------
// Un número envuelto como { __ts: ms } se guarda como fecha de Firestore (Timestamp).
export const TS = (ms) => ({ __ts: ms });
export function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (v && typeof v === 'object' && '__ts' in v) return { timestampValue: new Date(v.__ts).toISOString() };
  const fields = {}; for (const k in v) if (v[k] !== undefined) fields[k] = toFs(v[k]);
  return { mapValue: { fields } };
}
export function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}, f = v.mapValue.fields || {}; for (const k in f) o[k] = fromFs(f[k]); return o; }
  return null;
}

const base = (env) => 'https://firestore.googleapis.com/v1/projects/' + env.FB_PROJECT + '/databases/(default)/documents';
export async function aGet(env, path) {
  const r = await fetch(base(env) + '/' + path, { headers: { Authorization: 'Bearer ' + await adminToken(env) } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('fs get ' + r.status);
  const d = await r.json(); return fromFs({ mapValue: { fields: d.fields || {} } });
}
// Reemplaza el documento entero (lo crea si no existe).
export async function aSet(env, path, obj) {
  const r = await fetch(base(env) + '/' + path, { method: 'PATCH', headers: { Authorization: 'Bearer ' + await adminToken(env), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: toFs(obj).mapValue.fields }) });
  if (!r.ok) throw new Error('fs set ' + r.status);
}
// Ids de las tiendas cuyo campo `campo` es igual a `valor` (ej. sucursales: main == sid).
export async function aWhere(env, coleccion, campo, valor) {
  const r = await fetch(base(env) + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer ' + await adminToken(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coleccion }], where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: toFs(valor) } }, select: { fields: [{ fieldPath: campo }] } } }) });
  if (!r.ok) throw new Error('fs query ' + r.status);
  const d = await r.json();
  return (Array.isArray(d) ? d : []).filter((x) => x.document).map((x) => x.document.name.split('/').pop());
}
