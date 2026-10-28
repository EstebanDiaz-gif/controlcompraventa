// Cálculo del total de un pedido del catálogo. Lo usa el servidor de pagos (worker/) para cobrar
// con Mercado Pago el monto correcto: recalcula todo con los datos públicos del catálogo, así nadie
// puede cambiar el precio desde el celular. Tiene que dar lo mismo que lines()/sheet() de catalogo.html.
import { combos, descuento } from './promos.js';

const key = (s) => String(s || '').trim().toLowerCase();

// Productos del catálogo a partir del stock (tiendas) — igual que catalogo.html.
export function gruposStock(docs) {
  const m = {};
  docs.forEach(({ id, x }) => {
    const k = key(x.s || x.n);
    const g = m[k] || (m[k] = { k, n: x.n || '', pm: 0, pn: 0, mm: 0, oh: false, q: 0, w: !!x.w, cat: x.cat || '' });
    g.n = x.n || g.n; if (x.cat) g.cat = x.cat; if (x.pm) g.pm = x.pm; if (x.pn) g.pn = x.pn; if (x.mm) g.mm = x.mm; if (x.oh) g.oh = true;
    g.q += Math.max(x.q || 0, 0);
  });
  return Object.keys(m).map((k) => m[k]).filter((g) => !g.oh && g.q > 0 && (g.pn || g.pm));
}
// Almacén: lista de precios resumida (public/lista_d*: { p: [{ i, n, p, q, w, c }] }).
export function gruposLista(partes) {
  const G = [];
  partes.forEach((p) => (p || []).forEach((x) => G.push({ k: x.i, n: x.n, pm: 0, pn: x.p, mm: 0, q: x.q, w: !!x.w, cat: x.c || '' })));
  return G;
}

// medios de pago del negocio (public/info.pagos) → % de ajuste del elegido
export function ajustePago(info, id) {
  const P = (info && info.pagos) || {}, n = (v) => Math.max(-90, Math.min(90, +v || 0));
  if (id === 'ef' || id === 'tr' || id === 'mp' || id === 'mpa') return P[id] && P[id].on ? n(P[id].p) : null;
  const m = /^o(\d+)$/.exec(id || ''); if (m) { const o = (P.ot || [])[+m[1]]; return o && o.n ? n(o.p) : null; }
  return null;
}

// items: [{ k, z, q, promo }] como el CART del catálogo.
// Devuelve { ok, total, sub, dsc, aj, env, lineas: [{ n, q, u }] } o { ok:false, error }.
export function calcularPedido({ items, G, info, promos, now, pago, entrega }) {
  info = info || {};
  if (!Array.isArray(items) || !items.length || items.length > 200) return { ok: false, error: 'pedido vacío' };
  const gOf = (k) => G.find((g) => g.k === k);
  const tot = items.reduce((a, l) => a + (l.promo ? 0 : (+l.q || 0)), 0);
  const inCart = (k) => items.reduce((a, l) => a + (l.k === k ? (+l.q || 0) : 0), 0);
  const price = (g) => {
    let may = false;
    if (g.pm && (g.pn || g.pm)) { if (info.mode === 'carrito') may = info.minCart > 0 && tot >= info.minCart; else may = g.mm > 0 && inCart(g.k) >= g.mm; }
    return may ? g.pm : (g.pn || g.pm);
  };
  const cmb = combos(promos || [], now);
  const ls = [];
  for (const l of items) {
    const q = +l.q;
    if (!(q > 0) || q > 10000) return { ok: false, error: 'cantidad inválida' };
    if (l.promo) {
      const p = cmb.find((x) => x.id === l.promo); if (!p) return { ok: false, error: 'promo no disponible' };
      ls.push({ n: '🔥 ' + p.titulo, q, u: +p.precio || 0, promo: true }); continue;
    }
    const g = gOf(l.k); if (!g) return { ok: false, error: 'producto no disponible' };
    ls.push({ n: g.n + (l.z ? ' (' + l.z + ')' : ''), q, u: price(g), cat: g.cat || '', w: !!g.w });
  }
  const sub = ls.reduce((a, x) => a + x.u * x.q, 0);
  const suel = ls.filter((x) => !x.promo);
  const d = descuento(promos || [], now, suel.map((x) => ({ cat: x.cat, unidades: x.w ? 1 : x.q, total: x.u * x.q })));
  const dsc = d.mejor ? d.mejor.monto : 0;
  let total = sub - dsc;
  const p = ajustePago(info, pago); if (p === null && pago) return { ok: false, error: 'medio de pago no disponible' };
  const aj = p ? Math.round(total * p / 100) : 0;
  total += aj;
  const env = info.env && info.env.on && entrega === 'env' ? (+info.env.precio || 0) : 0;
  total += env;
  return { ok: true, total: Math.round(total), sub, dsc, aj, env, lineas: ls.map((x) => ({ n: x.n, q: x.q, u: x.u })) };
}
