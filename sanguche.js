// Armá tu sánguche: configuración, precio y texto. Lo usan el catálogo (armador), la app (configuración)
// y el servidor de pagos (pedido.js), así el precio se calcula igual en todos lados.
//
// stores/{sid}/public/sanguche = {
//   on, t (título), ex (precio de cada ingrediente extra),
//   tam: [{ n: 'Chico', p: 3500, inc: 2 }],           // precio fijo por tamaño, con `inc` ingredientes incluidos
//   pasos: [{ id, t, max, min, cu, it: [{ i, n, por, w }] }]
//     cu = 1 si lo que se elige en ese paso cuenta como ingrediente (fiambres, quesos); 0 si no (pan, aderezos)
//     it = productos de Stock: i = id, n = nombre, por = porción (kg si w, unidades si no), w = por peso
// }
// En el carrito: { k: 'sw:…', sw: { t: índice del tamaño, s: { idPaso: [idProducto…] } }, q }

export const PASOS_DEF = [
  { id: 'pan', t: 'Pan', max: 1, min: 1, cu: 0 },
  { id: 'fia', t: 'Fiambres', max: 3, min: 0, cu: 1 },
  { id: 'que', t: 'Quesos', max: 2, min: 0, cu: 1 },
  { id: 'ver', t: 'Verduras', max: 4, min: 0, cu: 0 },
  { id: 'ade', t: 'Aderezos', max: 3, min: 0, cu: 0 },
];
export const TAM_DEF = [{ n: 'Chico', p: 0, inc: 2 }, { n: 'Mediano', p: 0, inc: 3 }, { n: 'Grande', p: 0, inc: 4 }];

// Palabras para sugerir de qué paso es cada producto del stock.
const SUG = {
  pan: /\b(pan|pebete|baguette|figaza|ciabatta|miga|lact(eado)?|árabe|arabe|pancito|felipe|flauta)\b/,
  fia: /\b(jam[oó]n|salame|salamin|mortadela|bondiola|lomito|crudo|cocido|paleta|pastrami|leberwurst|matambre|pollo|pavita|panceta|bacon|longaniza|sopressata|cantimpalo)\b/,
  que: /\b(queso|muzzarella|mozzarella|tybo|cremoso|dambo|fontina|provolone|roquefort|azul|sardo|reggianito|gouda|holanda|port salut|danbo|cheddar)\b/,
  ver: /\b(lechuga|tomate|cebolla|r[uú]cula|pepino|palta|aceituna|morr[oó]n|zanahoria|choclo|huevo|pickles?|berenjena|champi[nñ]ones?)\b/,
  ade: /\b(mayonesa|mostaza|ketchup|k[eé]tchup|salsa|golf|barbacoa|bbq|chimichurri|aderezo|savora|alioli|provenzal|pesto)\b/,
};
const sinAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function sugerirPaso(nombre) {
  const t = sinAc(nombre);
  if (/\b(nachos?|papas|chizitos?|galletit|alfajor|snacks?|palitos|tostadas?|pizza|empanada)/.test(t)) return '';   // snacks y otros que no van en el sánguche
  for (const id of ['ade', 'que', 'fia', 'ver', 'pan']) if (SUG[id].test(t)) return id;   // aderezo antes que pan ("salsa para pan"), queso antes que fiambre
  return '';
}
// Porción por defecto: fiambres y quesos 50 g, verduras 30 g, aderezos 15 g; si se vende por unidad, 1.
export function porcionDef(paso, w) {
  if (!w) return 1;
  return { fia: 0.05, que: 0.05, ver: 0.03, ade: 0.015, pan: 0.1 }[paso] || 0.05;
}

const num = (v) => (isFinite(+v) && +v > 0 ? +v : 0);
// Normaliza lo que viene de la base (o de la app) para no romper nada si falta algo.
export function limpiarCfg(c) {
  c = c || {};
  const tam = (Array.isArray(c.tam) ? c.tam : []).map((x) => ({ n: String(x && x.n || '').trim().slice(0, 20), p: Math.round(num(x && x.p)), inc: Math.max(0, Math.min(20, Math.round(+(x && x.inc) || 0))) }))
    .filter((x) => x.n && x.p > 0).slice(0, 4);
  const pasos = (Array.isArray(c.pasos) ? c.pasos : []).map((p) => ({
    id: String(p && p.id || '').slice(0, 12), t: String(p && p.t || '').trim().slice(0, 24) || 'Paso',
    max: Math.max(1, Math.min(10, Math.round(+(p && p.max) || 1))), min: Math.max(0, Math.min(10, Math.round(+(p && p.min) || 0))), cu: p && p.cu ? 1 : 0,
    it: (Array.isArray(p && p.it) ? p.it : []).filter((x) => x && x.i).map((x) => ({ i: String(x.i), n: String(x.n || '').slice(0, 60), por: num(x.por) || 1, w: x.w ? 1 : 0 })).slice(0, 40),
  })).filter((p) => p.id && p.it.length);
  return { on: !!c.on, t: String(c.t || '').trim().slice(0, 40) || 'Armá tu sánguche', ex: Math.round(num(c.ex)), tam, pasos };
}
export const activo = (c) => !!(c && c.on && c.tam && c.tam.length && c.pasos && c.pasos.length);
export const desde = (c) => (c && c.tam && c.tam.length ? Math.min.apply(null, c.tam.map((x) => x.p)) : 0);

// sw = { t, s: { idPaso: [ids] } } → { ok, u (precio), n (nombre), d (detalle), cuenta, extras, error }
export function calcular(cfg, sw) {
  const c = cfg && cfg.pasos ? cfg : limpiarCfg(cfg);
  if (!sw || typeof sw !== 'object') return { ok: false, error: 'sánguche inválido' };
  const tm = c.tam[+sw.t]; if (!tm) return { ok: false, error: 'tamaño no disponible' };
  const s = sw.s && typeof sw.s === 'object' ? sw.s : {};
  let cuenta = 0; const partes = [], comp = [];
  for (const p of c.pasos) {
    const sel = Array.isArray(s[p.id]) ? s[p.id].map(String) : [];
    const uniq = sel.filter((x, i) => sel.indexOf(x) === i);
    if (uniq.length > p.max) return { ok: false, error: 'demasiados en ' + p.t };
    if (uniq.length < p.min) return { ok: false, error: 'falta elegir ' + p.t };
    const its = uniq.map((id) => p.it.find((x) => x.i === id));
    if (its.some((x) => !x)) return { ok: false, error: 'ingrediente no disponible' };
    if (p.cu) cuenta += its.length;
    its.forEach((x) => { partes.push(x.n); comp.push({ i: x.i, n: x.n, q: x.por, w: x.w }); });
  }
  if (!partes.length) return { ok: false, error: 'sánguche vacío' };
  const extras = Math.max(0, cuenta - tm.inc);
  return { ok: true, u: tm.p + extras * c.ex, n: 'Sánguche ' + tm.n.toLowerCase(), d: partes.join(', '), cuenta, extras, comp };
}
