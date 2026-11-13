// Pruebas de las promos por email (Brevo y Firestore simulados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promo, baja, armar, firmaBaja } from './src/mail.js';
import { _reset } from './src/admin.js';

const toFs = (v) => {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
};
async function claveSA() {
  const k = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', k.privateKey)).toString('base64');
  return JSON.stringify({ client_email: 'sa@p.iam', private_key: '-----BEGIN PRIVATE KEY-----\n' + der + '\n-----END PRIVATE KEY-----\n' });
}
async function entorno(docs) {
  _reset();
  const kv = new Map(), enviados = [], merges = [];
  const env = { FB_PROJECT: 'p', FB_SA: await claveSA(), BREVO_KEY: 'bk', MAIL_FROM: 'promos@pekeronapp.com', MAIL_DIA: '3',
    MP: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } } };
  globalThis.fetch = async (url, o = {}) => {
    url = String(url);
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'AT', expires_in: 3600 });
    if (url.includes('api.brevo.com')) { enviados.push(JSON.parse(o.body)); return Response.json({ messageId: 'x' }, { status: 201 }); }
    if (url.endsWith(':runQuery')) {
      const b = JSON.parse(o.body), col = b.structuredQuery.from[0].collectionId, par = url.split('/documents/')[1].replace(':runQuery', '');
      const out = Object.keys(docs).filter((k) => k.startsWith(par + '/' + col + '/') && docs[k].mk === true).map((k) => ({ document: { name: 'projects/p/databases/(default)/documents/' + k, fields: toFs(docs[k]).mapValue.fields } }));
      return Response.json(out);
    }
    const m = url.match(/documents\/([^?]+)/);
    if (m) {
      const path = decodeURIComponent(m[1]);
      if (o.method === 'PATCH') { merges.push({ path, body: JSON.parse(o.body), url }); return Response.json({}); }
      if (!(path in docs)) return new Response('{}', { status: 404 });
      return Response.json({ fields: toFs(docs[path]).mapValue.fields });
    }
    return new Response('?', { status: 599 });
  };
  return { env, kv, enviados, merges };
}
const DOCS = {
  'stores/s1/members/u1': { role: 'admin' }, 'stores/s1/members/u2': { role: 'empleado' },
  'stores/s1/public/info': { name: 'Burger Town', color: '#E11D48' },
  'stores/s1/cr/c1': { n: 'Ana', em: 'ana@mail.com', mk: true },
  'stores/s1/cr/c2': { n: 'Beto', em: 'beto@mail.com', mk: false },
  'stores/s1/cr/c3': { n: 'Caro', em: 'ANA@mail.com', mk: true },
  'stores/s1/cr/c4': { n: 'Dani', em: 'dani@mail.com', mk: true },
  'stores/s1/cr/c5': { n: 'Eli', em: 'eli@mail.com', mk: true },
  'stores/s1/cr/c6': { n: 'Fede', em: 'fede@mail.com', mk: true },
};
const B = { sid: 's1', as: 'Martes 2x1', tx: 'Llevá 2 y pagá 1.\n\nSolo hoy.', link: 'https://pekeronapp.com/burgertown' };

test('solo el administrador manda promos', async () => {
  const { env } = await entorno(DOCS);
  await assert.rejects(promo(env, 'u2', 'e@x.com', B, 'https://w'), /administrador/);
});
test('prueba: le llega solo al administrador', async () => {
  const { env, enviados } = await entorno(DOCS);
  const r = await promo(env, 'u1', 'dueno@x.com', Object.assign({ prueba: 1 }, B), 'https://w');
  assert.equal(r.a, 'dueno@x.com'); assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0].to, [{ email: 'dueno@x.com' }]); assert.match(enviados[0].subject, /^\[Prueba\]/);
  assert.equal(enviados[0].sender.name, 'Burger Town');
});
test('manda solo a los que aceptaron, sin repetir emails, con tope diario y una vez por día', async () => {
  const { env, enviados, kv } = await entorno(DOCS);
  const r = await promo(env, 'u1', 'dueno@x.com', B, 'https://w');
  assert.equal(r.n, 3); assert.match(r.falta, /quedaron 1/);
  const v = enviados[0].messageVersions; assert.equal(v.length, 3);
  const ems = v.map((x) => x.to[0].email); assert.ok(!ems.includes('beto@mail.com')); assert.equal(ems.filter((e) => /ana@/i.test(e)).length, 1);
  assert.match(v[0].htmlContent, /\/mail\/baja\?s=s1&amp;u=c\d&amp;k=[0-9a-f]{32}/);
  assert.equal(kv.get('mail:d:' + new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)), '3');
  await assert.rejects(promo(env, 'u1', 'dueno@x.com', B, 'https://w'), /mañana/);
});
test('baja con link válido deja mk en false; con link falso no', async () => {
  const { env, merges } = await entorno(DOCS);
  const k = await firmaBaja(env, 's1:c1');
  const r = await baja(env, new URL('https://w/mail/baja?s=s1&u=c1&k=' + k));
  assert.match(await r.text(), /te dimos de baja/); assert.equal(merges.length, 1);
  assert.match(merges[0].path, /stores\/s1\/cr\/c1$/); assert.equal(merges[0].body.fields.mk.booleanValue, false);
  const r2 = await baja(env, new URL('https://w/mail/baja?s=s1&u=c1&k=' + 'f'.repeat(32)));
  assert.match(await r2.text(), /no es válido/); assert.equal(merges.length, 1);
});
test('el mail escapa lo que escribe el local', () => {
  const h = armar({ as: '<b>x</b>', tx: 'hola <script>', tienda: 'A&B', color: 'red' });
  assert.ok(!h.includes('<script>')); assert.ok(h.includes('A&amp;B')); assert.ok(h.includes('#1D4ED8'));
});
