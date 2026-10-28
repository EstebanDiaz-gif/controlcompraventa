// Pruebas del servidor de pagos con Firestore y Mercado Pago simulados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import W from './src/index.js';

const toFs = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
};
const jwt = (uid) => 'h.' + Buffer.from(JSON.stringify({ user_id: uid })).toString('base64url') + '.s';

function entorno(docs) {
  const kv = new Map(), calls = [];
  const env = {
    FB_PROJECT: 'p', FB_API_KEY: 'k', ORIGINS: 'https://pekeronapp.com', OWNER_UIDS: 'own1', MP_CLIENT_ID: 'cid', MP_CLIENT_SECRET: 'sec',
    MP: {
      get: async (k, t) => (kv.has(k) ? (t === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null),
      put: async (k, v) => { kv.set(k, v); },
      delete: async (k) => { kv.delete(k); },
    },
  };
  globalThis.fetch = async (url, o = {}) => {
    url = String(url); calls.push({ url, o });
    const fs = url.match(/documents\/([^?]+)/);
    if (fs) {
      const path = decodeURIComponent(fs[1]), auth = (o.headers || {}).Authorization || '';
      // reglas simplificadas: members/{uid} y platform_owners/{uid} solo con el token de ese uid
      const m = path.match(/(members|platform_owners)\/(.+)$/);
      if (m && auth !== 'Bearer ' + jwt(m[2])) return new Response('{}', { status: 403 });
      const pref = path + '/', hijos = Object.keys(docs).filter((k) => k.startsWith(pref) && !k.slice(pref.length).includes('/'));
      if (!(path in docs) && hijos.length) return Response.json({ documents: hijos.map((k) => ({ name: 'x/' + k, fields: toFs(docs[k]).mapValue.fields })) });
      if (!(path in docs)) return new Response('{}', { status: 404 });
      return Response.json({ fields: toFs(docs[path]).mapValue.fields });
    }
    if (url.endsWith('/oauth/token')) { const b = JSON.parse(o.body); return Response.json({ access_token: 'AT-' + (b.code || b.refresh_token), refresh_token: 'RT', expires_in: 15552000, user_id: 99 }); }
    if (url.endsWith('/users/me')) return Response.json({ nickname: 'TIENDAURBANA' });
    if (url.endsWith('/checkout/preferences')) { const b = JSON.parse(o.body); return Response.json({ init_point: 'https://mp/checkout?total=' + b.items[0].unit_price + (b.marketplace_fee ? '&fee=' + b.marketplace_fee : '') }); }
    return new Response('?', { status: 599 });
  };
  return { env, kv, calls };
}
const req = (path, body, o = {}) => new Request('https://pagos.test' + path, { method: o.method || 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://pekeronapp.com', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) }, body: body ? JSON.stringify(body) : undefined });

const DOCS = {
  'stores/s1/members/u1': { role: 'admin' }, 'stores/s1/members/u2': { role: 'empleado' },
  'stores/s1/public/info': { enabled: true, name: 'Urbana', mode: 'producto', pagos: { mpa: { on: true, p: 0 }, tr: { on: true, alias: 'x', p: -10 } }, env: { on: true, precio: 2000 } },
  'stores/s1/stock/a': { n: 'Remera', s: 'R1', z: 'M', q: 2, pn: 18000, pm: 15000, mm: 3, cat: 'Remeras', c: 9000 },
  'stores/s1/stock/b': { n: 'Remera', s: 'R1', z: 'L', q: 2, pn: 18000, pm: 15000, mm: 3, cat: 'Remeras' },
  'stores/s1/stock/c': { n: 'Jean', s: 'J1', z: '40', q: 1, pn: 42000, cat: 'Jeans' },
  'stores/s1/public/promos': { list: [{ id: 'p1', t: 'combo', titulo: '2 remeras', precio: 30000, items: [] }, { id: 'p2', t: 'cant', min: 4, pct: 10, cat: '' }] },
};

test('conectar: solo administradores, y la vuelta guarda la clave', async () => {
  const { env, kv } = entorno(DOCS);
  let r = await W.fetch(req('/mp/conectar', { sid: 's1', vuelta: 'https://pekeronapp.com/app.html' }, { token: jwt('u2') }), env);
  assert.equal(r.status, 403);
  r = await W.fetch(req('/mp/conectar', { sid: 's1', vuelta: 'https://malo.com/' }, { token: jwt('u1') }), env);
  assert.equal(r.status, 400);
  r = await W.fetch(req('/mp/conectar', { sid: 's1', vuelta: 'https://pekeronapp.com/app.html' }, { token: jwt('u1') }), env);
  const { url } = await r.json();
  assert.match(url, /^https:\/\/auth\.mercadopago\.com\/authorization\?client_id=cid&response_type=code&platform_id=mp&state=[0-9a-f]{32}&redirect_uri=https%3A%2F%2Fpagos\.test%2Fmp%2Fvuelta$/);
  const state = new URL(url).searchParams.get('state');
  r = await W.fetch(new Request('https://pagos.test/mp/vuelta?code=CODE&state=' + state), env);
  assert.equal(r.status, 302); assert.equal(r.headers.get('Location'), 'https://pekeronapp.com/app.html?mp=ok');
  const t = JSON.parse(kv.get('tok:s1')); assert.equal(t.at, 'AT-CODE'); assert.equal(t.nick, 'TIENDAURBANA');
  r = await W.fetch(new Request('https://pagos.test/mp/vuelta?code=CODE&state=' + state), env); // no se puede reusar
  assert.equal(r.status, 400);
  r = await W.fetch(req('/mp/estado', { sid: 's1' }, { token: jwt('u1') }), env);
  assert.deepEqual(await r.json(), { on: true, nick: 'TIENDAURBANA', conn: t.conn, listo: true });
});

test('pagar: recalcula el total (mayorista, promos, descuento por cantidad, envío) y rechaza montos cambiados', async () => {
  const { env, kv } = entorno(DOCS);
  kv.set('tok:s1', JSON.stringify({ at: 'AT', rt: 'RT', exp: Date.now() + 100 * 864e5 }));
  // 3 remeras (llegan al mayorista: 3 × 15000) + 1 jean 42000 + combo 30000; 4 unidades sueltas → 10% en sueltas (8700)
  const items = [{ k: 'r1', z: 'M', q: 2 }, { k: 'r1', z: 'L', q: 1 }, { k: 'j1', z: '40', q: 1 }, { k: 'promo:p1', promo: 'p1', q: 1 }];
  const esperado = 45000 + 42000 + 30000 - 8700 + 2000;
  let r = await W.fetch(req('/pagar', { sid: 's1', items, entrega: 'env', total: esperado - 5000, vuelta: 'https://pekeronapp.com/urbana' }), env);
  assert.equal(r.status, 409); assert.equal((await r.json()).total, esperado);
  r = await W.fetch(req('/pagar', { sid: 's1', items, entrega: 'env', total: esperado, vuelta: 'https://pekeronapp.com/urbana' }), env);
  assert.equal(r.status, 200); assert.equal((await r.json()).url, 'https://mp/checkout?total=' + esperado);
  // con comisión de Pekeron
  kv.set('cfg:fee', JSON.stringify({ pct: 1 }));
  r = await W.fetch(req('/pagar', { sid: 's1', items, entrega: 'env', total: esperado, vuelta: 'https://pekeronapp.com/urbana' }), env);
  assert.equal((await r.json()).url, 'https://mp/checkout?total=' + esperado + '&fee=' + esperado / 100);
  // producto inexistente
  r = await W.fetch(req('/pagar', { sid: 's1', items: [{ k: 'nada', q: 1 }], total: 1, vuelta: 'https://pekeronapp.com/urbana' }), env);
  assert.equal(r.status, 409);
});

test('pagar: sin conectar o sin activar no se puede', async () => {
  const { env } = entorno(DOCS);
  let r = await W.fetch(req('/pagar', { sid: 's1', items: [{ k: 'j1', q: 1 }], total: 42000, vuelta: 'https://pekeronapp.com/u' }), env);
  assert.equal(r.status, 403);
  const D2 = { ...DOCS, 'stores/s1/public/info': { ...DOCS['stores/s1/public/info'], pagos: {} } };
  const e2 = entorno(D2); e2.kv.set('tok:s1', JSON.stringify({ at: 'AT', exp: Date.now() + 1e10 }));
  r = await W.fetch(req('/pagar', { sid: 's1', items: [{ k: 'j1', q: 1 }], total: 42000, vuelta: 'https://pekeronapp.com/u' }), e2.env);
  assert.equal(r.status, 403);
});

test('comisión: solo el dueño de la plataforma la cambia', async () => {
  const { env } = entorno({ ...DOCS });
  let r = await W.fetch(req('/mp/comision', { pct: 1.5 }, { token: jwt('u1') }), env);
  assert.equal(r.status, 403);
  r = await W.fetch(req('/mp/comision', { pct: 1.5 }, { token: jwt('own1') }), env);
  assert.deepEqual(await r.json(), { pct: 1.5 });
  r = await W.fetch(req('/mp/comision', null, { method: 'GET' }), env);
  assert.deepEqual(await r.json(), { pct: 1.5 });
});

test('almacén: usa la lista pública de precios (sin costos)', async () => {
  const D = { 'stores/s2/public/info': { enabled: true, alm: true, name: 'Almacén', pagos: { mpa: { on: true, p: 5 } } }, 'stores/s2/public/lista': { n: 1 },
    'stores/s2/public/lista_d0': { p: [{ i: 'y1', n: 'Yerba', p: 5200, q: 5 }, { i: 'q1', n: 'Queso', p: 9000, q: 3, w: true }] } };
  const { env, kv } = entorno(D); kv.set('tok:s2', JSON.stringify({ at: 'AT', exp: Date.now() + 1e10 }));
  const items = [{ k: 'y1', q: 2 }, { k: 'q1', q: 0.5, w: true }];
  const total = Math.round((10400 + 4500) * 1.05);
  const r = await W.fetch(req('/pagar', { sid: 's2', items, total, vuelta: 'https://pekeronapp.com/alm' }), env);
  assert.equal(r.status, 200); assert.equal((await r.json()).total, total);
});

test('CORS solo para los orígenes permitidos', async () => {
  const { env } = entorno(DOCS);
  let r = await W.fetch(new Request('https://pagos.test/pagar', { method: 'OPTIONS', headers: { Origin: 'https://pekeronapp.com' } }), env);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://pekeronapp.com');
  r = await W.fetch(new Request('https://pagos.test/pagar', { method: 'OPTIONS', headers: { Origin: 'https://otro.com' } }), env);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
});
