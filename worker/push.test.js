// Pruebas de notificaciones: cifrado Web Push (se descifra como lo haría el celular), firma VAPID,
// verificación del token de Firebase y avisos de vencimiento / suspensión automática.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { cifrar, unb64u, b64u, _reset as resetPush } from './src/push.js';
import { verificar, _reset as resetAuth } from './src/auth.js';
import { _reset as resetAdmin } from './src/admin.js';
import W from './src/index.js';

const S = webcrypto.subtle, te = new TextEncoder();
async function hkdf(salt, ikm, info, len) { const k = await S.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await S.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8)); }
const cat = (...a) => { const o = new Uint8Array(a.reduce((x, y) => x + y.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
// El "celular": tiene su par de claves y su secreto; descifra como dice el RFC 8291.
async function celular() {
  const kp = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await S.exportKey('raw', kp.publicKey)), auth = webcrypto.getRandomValues(new Uint8Array(16));
  return { kp, p256dh: b64u(pub), auth: b64u(auth), async leer(body) {
    const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
    const asKey = await S.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await S.deriveBits({ name: 'ECDH', public: asKey }, kp.privateKey, 256));
    const ikm = await hkdf(auth, shared, cat(te.encode('WebPush: info\0'), pub, asPub), 32);
    const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
    const k = await S.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const pt = new Uint8Array(await S.decrypt({ name: 'AES-GCM', iv: nonce }, k, ct));
    assert.equal(pt[pt.length - 1], 2, 'delimitador del último registro');
    return JSON.parse(new TextDecoder().decode(pt.slice(0, -1)));
  } };
}

test('el mensaje cifrado lo puede leer el celular', async () => {
  const c = await celular();
  const body = await cifrar(JSON.stringify({ t: '💙 Pago aprobado', b: 'Ñandú $42.500' }), c.p256dh, c.auth);
  assert.equal(body.slice(16, 20).join(','), '0,0,16,0');
  assert.deepEqual(await c.leer(body), { t: '💙 Pago aprobado', b: 'Ñandú $42.500' });
});

// ---------- entorno simulado ----------
let SA, FBK;
before(async () => {
  const k = await S.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await S.exportKey('pkcs8', k.privateKey)).toString('base64');
  SA = JSON.stringify({ client_email: 'sa@x', private_key: '-----BEGIN PRIVATE KEY-----\n' + der + '\n-----END PRIVATE KEY-----' });
  FBK = await S.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
});
async function idToken(uid, o = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(te.encode(JSON.stringify({ alg: 'RS256', kid: 'K1' }))), p = b64u(te.encode(JSON.stringify({ aud: 'p', iss: 'https://securetoken.google.com/p', sub: uid, iat: now, exp: now + 3600, ...o })));
  return h + '.' + p + '.' + b64u(await S.sign('RSASSA-PKCS1-v1_5', FBK.privateKey, te.encode(h + '.' + p)));
}
const toFs = (v) => {
  if (v === null || v === undefined) return { nullValue: null }; if (typeof v === 'string') return { stringValue: v }; if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
};
const fromFs = (v) => { if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('booleanValue' in v) return v.booleanValue; if ('nullValue' in v) return null; if ('doubleValue' in v) return v.doubleValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs); return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)])); };

function entorno(docs, cels) {
  resetPush(); resetAuth(); resetAdmin();
  const kv = new Map(), enviados = [];
  const env = { FB_PROJECT: 'p', FB_API_KEY: 'k', ORIGINS: 'https://pekeronapp.com', OWNER_UIDS: 'own', FB_SA: SA, MP_ACCESS_TOKEN: 'PEK',
    MP: { get: async (k, t) => (kv.has(k) ? (t === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
  globalThis.fetch = async (url, o = {}) => {
    url = String(url);
    if (url.startsWith('https://www.googleapis.com/service_accounts')) { const j = await S.exportKey('jwk', FBK.publicKey); return Response.json({ keys: [{ ...j, kid: 'K1' }] }); }
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'ADMIN', expires_in: 3600 });
    if (url.includes(':runQuery')) {
      const q = JSON.parse(o.body).structuredQuery, par = (url.match(/documents\/(.*):runQuery/) || [])[1] || '', col = q.from[0].collectionId, all = q.from[0].allDescendants;
      const fs = q.where ? (q.where.fieldFilter ? [q.where.fieldFilter] : q.where.compositeFilter.filters.map((f) => f.fieldFilter)) : [];
      const res = Object.keys(docs).filter((k) => { const parts = k.split('/'); if (parts[parts.length - 2] !== col) return false; if (!all && parts.slice(0, -2).join('/') !== par) return false;
        return fs.every((f) => docs[k][f.field.fieldPath] === fromFs(f.value)); });
      return Response.json(res.map((k) => ({ document: { name: 'projects/p/databases/(default)/documents/' + k, fields: toFs(docs[k]).mapValue.fields } })));
    }
    const m = url.match(/documents\/([^?]+)/);
    if (m) { const path = decodeURIComponent(m[1]);
      if (o.method === 'PATCH') { const f = fromFs({ mapValue: { fields: JSON.parse(o.body).fields } }); const mask = [...url.matchAll(/updateMask\.fieldPaths=([^&]+)/g)].map((x) => decodeURIComponent(x[1]));
        if (mask.length) { docs[path] = { ...(docs[path] || {}) }; mask.forEach((k) => { if (k in f) docs[path][k] = f[k]; else delete docs[path][k]; }); } else docs[path] = f; return Response.json({}); }
      return path in docs ? Response.json({ fields: toFs(docs[path]).mapValue.fields }) : new Response('{}', { status: 404 }); }
    if (url.startsWith('https://fcm.googleapis.com/')) { const c = cels[url]; if (!c) return new Response('', { status: 410 });
      assert.match(o.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/); enviados.push({ a: c.uid, m: await c.leer(new Uint8Array(o.body)) }); return new Response('', { status: 201 }); }
    if (url.startsWith('https://api.mercadopago.com/v1/payments/')) return Response.json({ status: 'approved', transaction_amount: 42500, description: 'Pedido en Urbana', metadata: { sid: 's1' } });
    return new Response('?', { status: 599 });
  };
  return { env, kv, enviados };
}
const post = (path, body, tok) => new Request('https://pagos.test' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://pekeronapp.com', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) });

test('token de Firebase: válido, vencido, de otro proyecto, firma falsa', async () => {
  const { env } = entorno({}, {});
  assert.equal(await verificar(env, await idToken('u1')), 'u1');
  assert.equal(await verificar(env, await idToken('u1', { exp: 1 })), '');
  assert.equal(await verificar(env, await idToken('u1', { aud: 'otro' })), '');
  const t = await idToken('u1'); assert.equal(await verificar(env, t.slice(0, -4) + 'AAAA'), '');
});

test('alta de celular, prueba, avisos de pago, turno y negocio nuevo', async () => {
  const now = Date.now();
  const docs = { 'stores/s1': { name: 'Urbana', owner: 'u1', created: now - 60000, vend: 'MARCOS' }, 'stores/s1/members/u1': { role: 'admin' }, 'stores/s1/members/u2': { role: 'empleado' },
    'stores/s1/turnos/w123abc': { src: 'web', at: now - 5000, cl: 'Juan', sn: 'Corte', d: '2026-10-30', i: 600, en: 'Leo' }, 'vendUid/v9': { code: 'MARCOS' } };
  const c1 = await celular(), cv = await celular(), co = await celular();
  const cels = { 'https://fcm.googleapis.com/fcm/send/A': { ...c1, uid: 'u1' }, 'https://fcm.googleapis.com/fcm/send/V': { ...cv, uid: 'v9' }, 'https://fcm.googleapis.com/fcm/send/O': { ...co, uid: 'own' } };
  const { env, kv, enviados } = entorno(docs, cels);
  let r = await W.fetch(new Request('https://pagos.test/push/clave', { method: 'POST', headers: { Origin: 'https://pekeronapp.com' } }), env);
  assert.equal(unb64u((await r.json()).clave).length, 65);
  r = await W.fetch(post('/push/alta', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/A', keys: { p256dh: c1.p256dh, auth: c1.auth } } }), env);
  assert.equal(r.status, 401, 'sin sesión no');
  r = await W.fetch(post('/push/alta', { sub: { endpoint: 'https://malo.com/x', keys: { p256dh: c1.p256dh, auth: c1.auth } } }, await idToken('u1')), env);
  assert.equal(r.status, 400, 'endpoint raro no');
  for (const [u, e, c] of [['u1', 'A', c1], ['v9', 'V', cv], ['own', 'O', co]]) await W.fetch(post('/push/alta', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/' + e, keys: { p256dh: c.p256dh, auth: c.auth } } }, await idToken(u)), env);
  await W.fetch(post('/push/prueba', {}, await idToken('u1')), env);
  assert.equal(enviados.pop().m.t, '🔔 Avisos activados');
  // pago del catálogo (webhook de la tienda): solo a los administradores, una vez
  kv.set('tok:s1', JSON.stringify({ at: 'TIENDA', exp: now + 1e10 }));
  await W.fetch(new Request('https://pagos.test/mp/webhook?sid=s1&data.id=987&type=payment', { method: 'POST', body: '{}' }), env);
  await W.fetch(post('/push/pago', { sid: 's1', id: '987' }), env);
  assert.equal(enviados.length, 1); assert.equal(enviados[0].a, 'u1'); assert.match(enviados[0].m.t, /Pago aprobado · \$42\.500/);
  // turno nuevo
  await W.fetch(post('/push/turno', { sid: 's1', id: 'w123abc' }), env);
  await W.fetch(post('/push/turno', { sid: 's1', id: 'w123abc' }), env);
  assert.equal(enviados.length, 2); assert.match(enviados[1].m.t, /Turno nuevo · vie 30\/10 10:00/); assert.match(enviados[1].m.b, /Juan reservó Corte con Leo/);
  // negocio nuevo: al dueño y al vendedor; otro usuario no puede dispararlo
  await W.fetch(post('/push/nueva', { sid: 's1' }, await idToken('u2')), env);
  assert.equal(enviados.length, 2);
  await W.fetch(post('/push/nueva', { sid: 's1' }, await idToken('u1')), env);
  assert.deepEqual(enviados.slice(2).map((x) => x.a).sort(), ['own', 'v9']);
  assert.match(enviados.find((x) => x.a === 'v9').m.b, /Urbana creó su tienda con tu código MARCOS/);
  // celular dado de baja (410): se borra
  delete cels['https://fcm.googleapis.com/fcm/send/A'];
  await W.fetch(post('/push/prueba', {}, await idToken('u1')), env);
  assert.deepEqual(JSON.parse(kv.get('push:u1')), []);
});

test('vencimientos: avisa antes, en la gracia y al suspender; suspende y reactiva el catálogo', async () => {
  const DAY = 864e5, now = Date.now();
  const ph = (st, u) => [{ state: st, untilMs: u }];
  const docs = {
    'stores/a': { name: 'Vence pronto', owner: 'x' }, 'stores/a/members/ua': { role: 'admin' }, 'stores/a/billing/access': { paidUntilMs: now + 2 * DAY, activeUntilMs: now + 2 * DAY, phases: ph('paid', now + 2 * DAY) },
    'stores/b': { name: 'Prueba mañana', owner: 'x' }, 'stores/b/members/ub': { role: 'admin' }, 'stores/b/billing/access': { trialStartMs: now - 9 * DAY, activeUntilMs: now + 0.5 * DAY, phases: ph('trial', now + 0.5 * DAY) },
    'stores/c': { name: 'En gracia', owner: 'x' }, 'stores/c/members/uc': { role: 'admin' }, 'stores/c/billing/access': { paidUntilMs: now - DAY, activeUntilMs: now - DAY, graceUntilMs: now + 2 * DAY, phases: ph('paid', now - DAY) },
    'stores/d': { name: 'Vencida', owner: 'x' }, 'stores/d/members/ud': { role: 'admin' }, 'stores/d/public/info': { enabled: true }, 'stores/d2': { name: 'Suc', main: 'd' }, 'stores/d2/public/info': { enabled: true },
    'stores/d/billing/access': { paidUntilMs: now - 5 * DAY, activeUntilMs: now - 5 * DAY, graceUntilMs: now - 2 * DAY, phases: ph('paid', now - 5 * DAY) },
    'stores/d2/billing/access': { paidUntilMs: now - 5 * DAY, activeUntilMs: now - 5 * DAY, graceUntilMs: now - 2 * DAY, phases: ph('paid', now - 5 * DAY) },
    'stores/e': { name: 'Con débito', owner: 'x' }, 'stores/e/members/ue': { role: 'admin' }, 'stores/e/billing/access': { paidUntilMs: now + DAY, activeUntilMs: now + DAY, phases: ph('paid', now + DAY) }, 'stores/e/billing/sus': { st: 'authorized' },
    'stores/f': { name: 'De por vida' }, 'stores/f/billing/access': { life: { at: 1 }, paidUntilMs: now + 1e12, activeUntilMs: now + 1e12, phases: ph('paid', now + 1e12) },
  };
  const cels = {}, sub = {};
  for (const u of ['ua', 'ub', 'uc', 'ud', 'ue', 'own']) { const c = await celular(); cels['https://fcm.googleapis.com/fcm/send/' + u] = { ...c, uid: u }; sub[u] = c; }
  const { env, kv, enviados } = entorno(docs, cels);
  for (const u in sub) kv.set('push:' + u, JSON.stringify([{ e: 'https://fcm.googleapis.com/fcm/send/' + u, k: { p256dh: sub[u].p256dh, auth: sub[u].auth } }]));
  let r = await W.fetch(post('/push/revisar', {}, await idToken('ua')), env); assert.equal(r.status, 403);
  r = await W.fetch(post('/push/revisar', {}, await idToken('own')), env);
  const res = await r.json();
  const de = (u) => enviados.filter((x) => x.a === u).map((x) => x.m.t);
  assert.match(de('ua')[0], /Tu plan vence el/);
  assert.match(de('ub')[0], /Tu prueba gratis termina mañana/);
  assert.match(de('uc')[0], /Tu plan venció/);
  assert.match(de('ud')[0], /Cuenta suspendida por falta de pago/);
  assert.deepEqual(de('ue'), [], 'con débito automático no molesta');
  assert.ok(de('own').some((t) => /Negocio suspendido/.test(t)));
  assert.equal(docs['stores/d/public/info'].susp, true); assert.equal(docs['stores/d2/public/info'].susp, true, 'sucursal también');
  assert.equal(enviados.filter((x) => x.a === 'ud').length, 1, 'la sucursal no avisa por separado');
  assert.equal(res.suspendidas, 1);
  // segunda vuelta: no repite
  const n = enviados.length; await W.fetch(post('/push/revisar', {}, await idToken('own')), env); assert.equal(enviados.length, n);
  // paga: se reactiva el catálogo
  docs['stores/d/billing/access'] = { paidUntilMs: now + 30 * DAY, activeUntilMs: now + 30 * DAY, phases: ph('paid', now + 30 * DAY) };
  await W.fetch(post('/push/revisar', {}, await idToken('own')), env);
  assert.equal('susp' in docs['stores/d/public/info'], false); assert.equal('susp' in docs['stores/d2/public/info'], false);
});

test('soporte: el dueño de la plataforma entra como administrador a cualquier tienda', async () => {
  const docs = { 'stores/pk': { name: 'Pekeron', owner: 'otra' }, 'stores/pk/members/x': { role: 'admin' } };
  const { env } = entorno(docs, {});
  let r = await W.fetch(post('/admin/entrar', { sid: 'pk', email: 'a@b.com', name: 'Esteban' }, await idToken('u5')), env);
  assert.equal(r.status, 403, 'otro usuario no');
  r = await W.fetch(post('/admin/entrar', { sid: 'pk', email: 'a@b.com', name: 'Esteban' }, await idToken('own')), env);
  assert.deepEqual(await r.json(), { ok: true, name: 'Pekeron' });
  assert.equal(docs['stores/pk/members/own'].role, 'admin');
  assert.deepEqual(docs['users/own/stores/pk'], { name: 'Pekeron' });
});
