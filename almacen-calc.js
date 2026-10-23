// Cálculos del rubro almacén (sin Firebase, para poder probarlos con node --test).
export const CATS = ['Almacén', 'Bebidas', 'Galletitas y golosinas', 'Lácteos', 'Fiambrería', 'Panadería', 'Verdulería', 'Congelados', 'Limpieza', 'Perfumería', 'Cigarrillos', 'Otros'];
export const PAY = { ef: 'Efectivo', tr: 'Transferencia', tj: 'Tarjeta', fi: 'Fiado' };

// ---------- utilidades puras (se prueban en almacen.test.js) ----------
export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;
// Acepta "0,250", "0.250", "1,5" — para kilos y cantidades.
export function pnum(s) {
  const t = String(s == null ? '' : s).trim().replace(/\s/g, '');
  if (!t) return NaN;
  return Number(t.indexOf(',') >= 0 ? t.replace(/\./g, '').replace(',', '.') : t);
}
export const n3 = (v) => r3(+v || 0).toLocaleString('es-AR', { maximumFractionDigits: 3 });
export const fq = (q, w) => (w ? n3(q) + ' kg' : n3(q));
export const lineTotal = (l) => Math.round(l.q * l.u);
export const lineCost = (l) => Math.round(l.q * (l.c || 0));
export function cartTotals(cart) {
  let tot = 0, cost = 0;
  cart.forEach((l) => { tot += lineTotal(l); cost += lineCost(l); });
  return { tot, cost };
}
// Costo promedio ponderado después de una reposición. El stock negativo no pesa en el promedio.
export function newAvgCost(q0, c0, qIn, cIn) {
  const a = Math.max(+q0 || 0, 0), tot = a + qIn;
  if (tot <= 0) return cIn;
  return r2((a * (+c0 || 0) + qIn * cIn) / tot);
}
export function roundPrice(v, step) { return step > 1 ? Math.round(v / step) * step : Math.round(v); }
export function match(text, q) {
  const t = String(q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!t.length) return true;
  const hay = String(text || '').toLowerCase();
  return t.every((w) => hay.indexOf(w) >= 0);
}
export function lastMonths(n, from) {
  const out = []; let [y, m] = from.split('-').map(Number);
  for (let i = 0; i < n; i++) { out.push(y + '-' + String(m).padStart(2, '0')); m--; if (!m) { m = 12; y--; } }
  return out;
}


// ---------- Lista de precios para el catálogo web ----------
// En vez de que cada visita al catálogo lea todos los productos (una lectura por producto),
// la app publica una lista resumida en pocos documentos: stores/{sid}/public/lista (índice),
// lista_d0, lista_d1… (datos) y lista_i0, lista_i1… (fotos, aparte porque pesan más).
export function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + s.length.toString(36); }
// Cantidad que ve el cliente: tope 10 unidades o 5 kg, para no republicar con cada venta.
export function pubQty(q, w) { return w ? Math.min(Math.floor(q * 4) / 4, 5) : Math.min(Math.floor(q), 10); }
function chunk(items, max) {
  const out = []; let cur = [], size = 2;
  items.forEach((it) => { const l = JSON.stringify(it).length + 1; if (cur.length && size + l > max) { out.push(cur); cur = []; size = 2; } cur.push(it); size += l; });
  if (cur.length) out.push(cur);
  return out;
}
export function buildLista(products, max = 700000) {
  // ns = sin control de stock (fiambres, cosas que se usan para elaborar): siempre disponible, con el tope máximo.
  const qOf = (p) => (p.ns ? (p.w ? 5 : 10) : pubQty(p.q, p.w));
  const vis = products.filter((p) => !p.oh && p.pn > 0 && qOf(p) > 0).sort((a, b) => a.n.localeCompare(b.n));
  const data = vis.map((p) => {
    const o = { i: p.id, n: p.n, p: p.pn, q: qOf(p) };
    if (p.cat) o.c = p.cat; if (p.w) o.w = 1; if (p.img) o.f = p.hd ? 2 : 1;
    if (p.d) o.d = p.d;                 // descripción
    if (p.pa > p.pn) o.a = p.pa;        // precio anterior (tachado)
    if (p.dt) o.t = 1;                  // destacado
    return o;
  });
  const imgs = vis.filter((p) => p.img).map((p) => ({ i: p.id, f: p.img }));
  const dj = JSON.stringify(data), ij = imgs.map((x) => x.i + ':' + hashStr(x.f)).join(',');
  return { data: chunk(data, max), imgs: chunk(imgs, max), h: hashStr(dj), hi: hashStr(ij), count: data.length };
}
