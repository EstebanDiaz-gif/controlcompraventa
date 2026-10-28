// Cálculos del rubro almacén (sin Firebase, para poder probarlos con node --test).
export const CATS = ['Almacén', 'Bebidas', 'Galletitas y golosinas', 'Lácteos', 'Fiambrería', 'Panadería', 'Verdulería', 'Congelados', 'Limpieza', 'Perfumería', 'Cigarrillos', 'Otros'];
// Categorías sugeridas según el tipo de negocio (cfg/servicios.tipo). Si no tiene, las de almacén.
export const CATS_TIPO = {
  panaderia: ['Panadería', 'Facturas', 'Tortas y postres', 'Masas y confitería', 'Sándwiches y salados', 'Galletitas y budines', 'Bebidas', 'Almacén', 'Lácteos', 'Otros'],
};
export const catsFor = (tipo) => CATS_TIPO[tipo] || CATS;
export const PAY = { ef: 'Efectivo', tr: 'Transferencia', tj: 'Tarjeta', qr: 'QR / Mercado Pago', fi: 'Fiado' };
// Medios que se pueden combinar con efectivo en un pago dividido.
export const OTROS = ['tr', 'tj', 'qr'];

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
    if (p.dt) o.t = typeof p.dt === 'number' && p.dt > 0 && p.dt < 999 ? p.dt : 999;   // destacado (número = orden)
    return o;
  });
  const imgs = vis.filter((p) => p.img).map((p) => ({ i: p.id, f: p.img }));
  const dj = JSON.stringify(data), ij = imgs.map((x) => x.i + ':' + hashStr(x.f)).join(',');
  return { data: chunk(data, max), imgs: chunk(imgs, max), h: hashStr(dj), hi: hashStr(ij), count: data.length };
}


// ---------- Caja: vuelto, pago dividido y cierre ----------
// Billetes con los que probablemente paga el cliente (para tocar en vez de escribir).
export function billetes(tot) {
  if (!(tot > 0)) return [];
  const out = [];
  [1000, 2000, 5000, 10000, 20000].forEach((st) => { const v = Math.ceil(tot / st) * st; if (v > tot && out.indexOf(v) < 0) out.push(v); });
  return out.sort((a, b) => a - b).slice(0, 4);
}
// Cuánto entró por cada medio en una venta: {ef: 3000, tr: 2500}. Las ventas viejas no tienen pp.
export function partes(v) {
  if (v.pp && typeof v.pp === 'object') return v.pp;
  return { [v.pay]: v.tot || 0 };
}
export function payLabel(v, PAYS = PAY) {
  if (v.pay !== 'mix') return PAYS[v.pay] || v.pay;
  return Object.keys(partes(v)).map((k) => PAYS[k] || k).join(' + ');
}
// Efectivo que debería haber en el cajón al cerrar.
export function esperado(c) {
  const p = c.p || {}, cb = c.c || {};
  return Math.round((c.ini || 0) + (p.ef || 0) + (cb.ef || 0) + (c.ing || 0) - (c.ret || 0));
}

// ---------- Etiquetas de balanza ----------
// EAN-13 que empieza con 2: 2 + tipo (1 dígito) + código del producto (PLU) + peso o importe + dígito verificador.
export function eanOk(code) {
  if (!/^\d{13}$/.test(code)) return false;
  let s = 0; for (let i = 0; i < 12; i++) s += (+code[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10 === +code[12];
}
// cfg: { on, plu: 4|5|6, val: 'peso' | 'precio' }  →  { plu, kg } o { plu, importe }
export function balanza(code, cfg) {
  if (!cfg || !cfg.on) return null;
  const c = String(code || '').trim();
  if (!/^2\d{12}$/.test(c) || !eanOk(c)) return null;
  const L = [4, 5, 6].indexOf(+cfg.plu) >= 0 ? +cfg.plu : 5;
  const plu = c.substr(2, L), raw = +c.substr(2 + L, 10 - L);
  if (!(raw > 0)) return null;
  return cfg.val === 'precio' ? { plu, importe: raw } : { plu, kg: r3(raw / 1000) };
}
export function porPlu(list, plu) {
  const n = +plu;
  const ok = list.filter((p) => p.s && /^\d{1,6}$/.test(String(p.s).trim()) && +p.s === n);
  return ok.find((p) => p.w) || ok[0] || null;
}

// ---------- Lo más vendido ----------
// pr: {idProducto: {q, v}} (se acumula en totales/{mes} con cada venta)
export function ranking(pr, products, by = 'v') {
  const byId = {}; (products || []).forEach((p) => { byId[p.id] = p; });
  return Object.keys(pr || {}).map((id) => ({ id, n: (byId[id] && byId[id].n) || pr[id].n || 'Producto borrado', w: !!(byId[id] && byId[id].w), q: r3(pr[id].q || 0), v: Math.round(pr[id].v || 0) }))
    .filter((x) => x.q > 0 || x.v > 0).sort((a, b) => b[by] - a[by] || a.n.localeCompare(b.n));
}
// Productos con stock que no se vendieron en el mes.
export function sinVentas(pr, products) {
  return (products || []).filter((p) => !p.ns && p.q > 0 && !(pr && pr[p.id] && pr[p.id].q > 0)).sort((a, b) => (b.q * (b.c || 0)) - (a.q * (a.c || 0)) || a.n.localeCompare(b.n));
}
// CSV para Excel en español: separador ; y decimales con coma.
export function csv(rows) {
  const cell = (v) => {
    if (v == null) return '';
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000).replace('.', ',');
    const t = String(v);
    return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
