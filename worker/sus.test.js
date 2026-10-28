// Pruebas del débito automático (suscripciones) con Google, Firestore y Mercado Pago simulados.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import W from './src/index.js';
import { _reset } from './src/admin.js';

const DAY = 864e5;
let SA;
before(async () => {
  const k = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', k.privateKey)).toString('base64');
  SA = JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\n' + der.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n' });
});
const jwt = (uid) => 'h.' + Buffer.from(JSON.stringify({ user_id: uid })).toString('base64url') + '.s';
const toFs = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
};
const fromFs = (v) => {
  if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue; if ('nullValue' in v) return null; if ('timestampValue' in v) return { ts: Date.parse(v.timestampValue) };
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
};

function entorno(docs, mpData) {
  _reset();
  const kv = new Map(), log = [];
  const env = { FB_PROJECT: 'p', FB_API_KEY: 'k', ORIGINS: 'https://pekeronapp.com', OWNER_UIDS: 'own', MP_ACCESS_TOKEN: 'PEK', FB_SA: SA,
    MP: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
  globalThis.fetch = async (url, o = {}) => {
    url = String(url); const auth = (o.headers || {}).Authorization || '';
    if (url === 'https://oauth2.googleapis.com/token') { assert.match(String(o.body), /assertion=[\w-]+\.[\w-]+\.[\w-]+/); return Response.json({ access_token: 'ADMIN', expires_in: 3600 }); }
    if (url.includes(':runQuery')) { assert.equal(auth, 'Bearer ADMIN'); const v = JSON.parse(o.body).structuredQuery.where.fieldFilter.value.stringValue;
      return Response.json(Object.keys(docs).filter((k) => /^stores\/[^/]+$/.test(k) && docs[k].main === v).map((k) => ({ document: { name: 'x/' + k } }))); }
    const fs = url.match(/documents\/([^?]+)/);
    if (fs) {
      const path = decodeURIComponent(fs[1]);
      if (o.method === 'PATCH') { assert.equal(auth, 'Bearer ADMIN'); docs[path] = fromFs({ mapValue: { fields: JSON.parse(o.body).fields } }); log.push('set ' + path); return Response.json({}); }
      const m = path.match(/(members)\/(.+)$/); if (m && auth !== 'Bearer ' + jwt(m[2])) return new Response('{}', { status: 403 });
      if (!(path in docs)) return new Response('{}', { status: 404 });
      return Response.json({ fields: toFs(docs[path]).mapValue.fields });
    }
    if (url.startsWith('https://api.mercadopago.com')) {
      assert.equal(auth, 'Bearer PEK');
      const p = url.slice('https://api.mercadopago.com'.length);
      if (p === '/preapproval' && o.method === 'POST') { const b = JSON.parse(o.body); mpData.creadas.push(b); return Response.json({ id: 'PRE' + mpData.creadas.length, init_point: 'https://mp/sus/' + mpData.creadas.length }); }
      let m;
      if ((m = p.match(/^\/preapproval\/(\w+)$/))) { if (o.method === 'PUT') { mpData.cambios.push([m[1], JSON.parse(o.body)]); return Response.json({}); } return Response.json(mpData.pre[m[1]] || {}); }
      if ((m = p.match(/^\/authorized_payments\/search\?preapproval_id=(\w+)$/))) return Response.json({ results: mpData.cobros[m[1]] || [] });
      if ((m = p.match(/^\/authorized_payments\/(\w+)$/))) return Response.json({ id: m[1], preapproval_id: mpData.cobroPre[m[1]] });
    }
    return new Response('?', { status: 599 });
  };
  return { env, kv, log };
}
const req = (path, body, token) => new Request('https://pagos.test' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://pekeronapp.com', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
const CFG = { plans: { inicial: { priceARS: 15000 }, profesional: { priceARS: 25000 } } };

test('en prueba: el primer cobro es cuando termina la prueba; al cobrarse, extiende un mes (también a la sucursal)', async () => {
  const now = Date.now(), finPrueba = now + 6 * DAY;
  const docs = { 'platform/config': CFG, 'stores/s1': { name: 'Kiosco Sol', owner: 'u1' }, 'stores/s2': { name: 'Sucursal', main: 's1' }, 'stores/s1/members/u1': { role: 'admin' },
    'stores/s1/billing/access': { trialStartMs: now - 4 * DAY, trialEndMs: finPrueba, activeUntilMs: finPrueba, paidUntilMs: null, chosenPlan: 'inicial' } };
  const M = { creadas: [], cambios: [], pre: {}, cobros: {}, cobroPre: {} };
  const { env, kv } = entorno(docs, M);
  // empleado no puede
  let r = await W.fetch(req('/sus/crear', { sid: 's1', plan: 'inicial', email: 'a@b.com', vuelta: 'https://pekeronapp.com/app.html' }, jwt('u9')), env);
  assert.equal(r.status, 403);
  r = await W.fetch(req('/sus/crear', { sid: 's1', plan: 'inicial', email: 'Lucas@Gmail.com', vuelta: 'https://pekeronapp.com/app.html' }, jwt('u1')), env);
  assert.equal(r.status, 200); const d = await r.json();
  assert.equal(d.url, 'https://mp/sus/1');
  const c = M.creadas[0];
  assert.equal(c.auto_recurring.transaction_amount, 15000); assert.equal(c.auto_recurring.currency_id, 'ARS');
  assert.equal(Date.parse(c.auto_recurring.start_date), finPrueba);
  assert.equal(c.payer_email, 'lucas@gmail.com'); assert.equal(c.external_reference, 's1'); assert.equal(c.status, 'pending');
  assert.equal(docs['stores/s1/billing/sus'].st, 'pending'); assert.equal(kv.get('susid:PRE1'), 's1');
  // Mercado Pago cobra el primer mes y avisa (webhook)
  M.pre.PRE1 = { status: 'authorized', next_payment_date: new Date(finPrueba + 30 * DAY).toISOString(), auto_recurring: { transaction_amount: 15000 } };
  M.cobros.PRE1 = [{ id: 'C1', date_created: new Date().toISOString(), payment: { id: 77, status: 'approved' } }];
  M.cobroPre.C1 = 'PRE1';
  r = await W.fetch(new Request('https://pagos.test/mp/webhook', { method: 'POST', body: JSON.stringify({ type: 'subscription_authorized_payment', data: { id: 'C1' } }) }), env);
  assert.equal(r.status, 200);
  const a1 = docs['stores/s1/billing/access'], a2 = docs['stores/s2/billing/access'];
  assert.equal(a1.paidPlan, 'inicial'); assert.equal(a1.state, 'paid');
  assert.ok(Math.abs(a1.paidUntilMs - (now + 30 * DAY)) < 2 * DAY, 'un mes desde hoy');
  assert.equal(a1.trialStartMs, now - 4 * DAY, 'conserva la prueba');
  assert.deepEqual(a2.paidUntilMs, a1.paidUntilMs, 'la sucursal también');
  assert.ok(a1.activeUntil && a1.activeUntil.ts, 'activeUntil como fecha de Firestore');
  // el mismo aviso otra vez no extiende de nuevo
  const antes = a1.paidUntilMs;
  await W.fetch(new Request('https://pagos.test/mp/webhook', { method: 'POST', body: JSON.stringify({ type: 'subscription_authorized_payment', data: { id: 'C1' } }) }), env);
  r = await W.fetch(req('/sus/sync', { sid: 's1' }, jwt('u1')), env);
  assert.equal((await r.json()).nuevos, 0);
  assert.equal(docs['stores/s1/billing/access'].paidUntilMs, antes);
  assert.equal(docs['stores/s1/billing/sus'].st, 'authorized');
  // segundo mes
  M.cobros.PRE1.push({ id: 'C2', date_created: new Date().toISOString(), payment: { id: 78, status: 'approved' } });
  r = await W.fetch(req('/sus/sync', { sid: 's1' }, jwt('u1')), env);
  assert.equal((await r.json()).nuevos, 1);
  assert.ok(docs['stores/s1/billing/access'].paidUntilMs > antes + 27 * DAY);
});

test('Llave en mano: el primer cobro cae cuando vence el mes incluido; vencida: se cobra ya', async () => {
  const now = Date.now(), finMes = now + 20 * DAY;
  const docs = { 'platform/config': CFG, 'stores/s1': { owner: 'u1' }, 'stores/s1/members/u1': { role: 'admin' },
    'stores/s1/billing/access': { paidPlan: 'profesional', paidUntilMs: finMes, activeUntilMs: finMes, llave: { at: now - 10 * DAY, plan: 'profesional', amt: 50000 } } };
  const M = { creadas: [], cambios: [], pre: {}, cobros: {}, cobroPre: {} };
  const { env } = entorno(docs, M);
  await W.fetch(req('/sus/crear', { sid: 's1', plan: 'profesional', email: 'a@b.com', vuelta: 'https://pekeronapp.com/app.html' }, jwt('u1')), env);
  assert.equal(Date.parse(M.creadas[0].auto_recurring.start_date), finMes);
  assert.equal(M.creadas[0].auto_recurring.transaction_amount, 25000);
  // cobro aprobado al vencer: extiende desde el fin del mes incluido y conserva el dato de Llave en mano
  M.pre.PRE1 = { status: 'authorized' }; M.cobros.PRE1 = [{ id: 'C1', payment: { status: 'approved' } }];
  await W.fetch(req('/sus/sync', { sid: 's1' }, jwt('u1')), env);
  const a = docs['stores/s1/billing/access'];
  assert.ok(Math.abs(a.paidUntilMs - (finMes + 30 * DAY)) < 2 * DAY); assert.equal(a.llave.amt, 50000);
  // tienda vencida: sin fecha de inicio (cobra ya)
  docs['stores/s1/billing/access'] = { paidPlan: 'inicial', paidUntilMs: now - 5 * DAY, activeUntilMs: now - 5 * DAY };
  await W.fetch(req('/sus/crear', { sid: 's1', plan: 'inicial', email: 'a@b.com', vuelta: 'https://pekeronapp.com/app.html' }, jwt('u1')), env);
  assert.equal(M.creadas[1].auto_recurring.start_date, undefined);
});

test('cambio de plan: al autorizarse la nueva, se da de baja la anterior; cancelar', async () => {
  const docs = { 'platform/config': CFG, 'stores/s1': { owner: 'u1' }, 'stores/s1/members/u1': { role: 'admin' }, 'stores/s1/billing/access': {},
    'stores/s1/billing/sus': { id: 'OLD', plan: 'inicial', st: 'authorized', pagos: {} } };
  const M = { creadas: [], cambios: [], pre: { OLD: { status: 'authorized' } }, cobros: {}, cobroPre: {} };
  const { env } = entorno(docs, M);
  await W.fetch(req('/sus/crear', { sid: 's1', plan: 'profesional', email: 'a@b.com', vuelta: 'https://pekeronapp.com/app.html' }, jwt('u1')), env);
  assert.equal(docs['stores/s1/billing/sus'].prev, 'OLD');
  M.pre.PRE1 = { status: 'authorized' };
  await W.fetch(req('/sus/sync', { sid: 's1' }, jwt('u1')), env);
  assert.deepEqual(M.cambios[0], ['OLD', { status: 'cancelled' }]);
  assert.equal(docs['stores/s1/billing/sus'].prev, null);
  await W.fetch(req('/sus/cancelar', { sid: 's1' }, jwt('u1')), env);
  assert.deepEqual(M.cambios[1], ['PRE1', { status: 'cancelled' }]);
  assert.equal(docs['stores/s1/billing/sus'].st, 'cancelled');
});

test('no se puede: sucursal, tienda en dólares, licencia de por vida', async () => {
  const docs = { 'platform/config': CFG, 'stores/s2': { main: 's1' }, 'stores/s2/members/u1': { role: 'admin' }, 'stores/s3': { mon: 'USD' }, 'stores/s3/members/u1': { role: 'admin' },
    'stores/s4': {}, 'stores/s4/members/u1': { role: 'admin' }, 'stores/s4/billing/access': { life: { at: 1 } } };
  const { env } = entorno(docs, { creadas: [], cambios: [], pre: {}, cobros: {}, cobroPre: {} });
  for (const sid of ['s2', 's3', 's4']) {
    const r = await W.fetch(req('/sus/crear', { sid, plan: 'inicial', email: 'a@b.com', vuelta: 'https://pekeronapp.com/app.html' }, jwt('u1')), env);
    assert.equal(r.status, 400, sid);
  }
});

test('un aviso falso no activa nada (los datos se piden a Mercado Pago)', async () => {
  const docs = { 'platform/config': CFG, 'stores/s1': {}, 'stores/s1/billing/access': { paidUntilMs: 5 }, 'stores/s1/billing/sus': { id: 'PRE1', plan: 'inicial', st: 'authorized', pagos: {} } };
  const M = { creadas: [], cambios: [], pre: { PRE1: { status: 'authorized' } }, cobros: { PRE1: [{ id: 'X', payment: { status: 'rejected' } }] }, cobroPre: { X: 'PRE1' } };
  const { env, kv } = entorno(docs, M); kv.set('susid:PRE1', 's1');
  await W.fetch(new Request('https://pagos.test/mp/webhook', { method: 'POST', body: JSON.stringify({ type: 'subscription_authorized_payment', data: { id: 'X' } }) }), env);
  assert.equal(docs['stores/s1/billing/access'].paidUntilMs, 5);
});
