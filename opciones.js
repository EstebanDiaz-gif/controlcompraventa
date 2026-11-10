// Opciones de un producto (gastronomía y otros): tamaños, punto de la carne, "sin cebolla", extras con precio, gustos…
// Las usan el Stock (para cargarlas), el catálogo (el cliente elige), la caja y el servidor de pagos (pedido.js),
// así el precio se calcula igual en todos lados.
//
// stock/{id}.op = public/lista_d*.p[].op = [
//   { t: 'Tamaño', min: 1, max: 1, o: [{ n: 'Simple', p: 0 }, { n: 'Doble', p: 1500 }] },   // p = lo que suma al precio
//   { t: 'Sacale', min: 0, max: 5, o: [{ n: 'Sin cebolla', p: 0 }] },
// ]
// Lo elegido (en el carrito): sel[índice del grupo] = [índices de las opciones]

const txt = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const ent = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v || 0)));

export const MAX_GRUPOS = 6, MAX_OPCIONES = 15;

export function limpiarOps(op) {
  return (Array.isArray(op) ? op : []).map((g) => {
    const o = (Array.isArray(g && g.o) ? g.o : []).map((x) => ({ n: txt(x && x.n, 40), p: ent(x && x.p, 0, 10000000) })).filter((x) => x.n).slice(0, MAX_OPCIONES);
    const max = ent(g && g.max, 1, Math.max(1, o.length)), min = ent(g && g.min, 0, max);
    return { t: txt(g && g.t, 30) || 'Opciones', min, max, o };
  }).filter((g) => g.o.length).slice(0, MAX_GRUPOS);
}
export const tieneOps = (op) => limpiarOps(op).length > 0;

// Texto corto de la regla de un grupo: "elegí 1", "opcional", "hasta 3"…
export function reglaOps(g) {
  if (g.max === 1) return g.min ? 'elegí 1' : 'opcional';
  if (g.min && g.min === g.max) return 'elegí ' + g.max;
  return (g.min ? 'mínimo ' + g.min + ', ' : '') + 'hasta ' + g.max;
}

// Lo que se elige de entrada: la primera opción de los grupos obligatorios de una sola opción.
export function selInicial(op) { return limpiarOps(op).map((g) => (g.min === 1 && g.max === 1 ? [0] : [])); }

// Tocar una opción: en los grupos de una sola opción reemplaza (o la saca si es opcional); en los otros suma o saca.
export function tocarOps(op, sel, gi, oi) {
  const G = limpiarOps(op), g = G[gi]; if (!g || !g.o[oi]) return sel;
  const s = G.map((_, i) => (Array.isArray(sel && sel[i]) ? sel[i].slice() : []));
  const a = s[gi], k = a.indexOf(oi);
  if (g.max === 1) s[gi] = k >= 0 && !g.min ? [] : [oi];
  else if (k >= 0) a.splice(k, 1);
  else if (a.length < g.max) a.push(oi);
  return s;
}

// → { ok, extra (lo que suma por unidad), txt ("Doble, Sin cebolla"), error }
export function calcOps(op, sel) {
  const G = limpiarOps(op);
  if (!G.length) return { ok: true, extra: 0, txt: '' };
  sel = Array.isArray(sel) ? sel : [];
  let extra = 0; const partes = [];
  for (let gi = 0; gi < G.length; gi++) {
    const g = G[gi], raw = Array.isArray(sel[gi]) ? sel[gi] : [];
    const s = raw.map((x) => +x).filter((x, i, l) => Number.isInteger(x) && x >= 0 && l.indexOf(x) === i);
    if (s.length !== raw.length || s.some((x) => !g.o[x])) return { ok: false, error: 'opción no disponible' };
    if (s.length > g.max) return { ok: false, error: 'demasiadas opciones en ' + g.t };
    if (s.length < g.min) return { ok: false, error: 'falta elegir ' + g.t };
    s.forEach((x) => { extra += g.o[x].p; partes.push(g.o[x].n); });
  }
  return { ok: true, extra, txt: partes.join(', ') };
}

// Modelos para cargar rápido en el Stock.
export const MODELOS_OPS = [
  ['Tamaño', { t: 'Tamaño', min: 1, max: 1, o: [{ n: 'Simple', p: 0 }, { n: 'Doble', p: 0 }, { n: 'Triple', p: 0 }] }],
  ['Punto de la carne', { t: 'Punto de la carne', min: 1, max: 1, o: [{ n: 'Jugosa', p: 0 }, { n: 'A punto', p: 0 }, { n: 'Bien cocida', p: 0 }] }],
  ['Sacale algo', { t: 'Sacale', min: 0, max: 6, o: [{ n: 'Sin cebolla', p: 0 }, { n: 'Sin tomate', p: 0 }, { n: 'Sin lechuga', p: 0 }, { n: 'Sin mayonesa', p: 0 }] }],
  ['Extras', { t: 'Extras', min: 0, max: 6, o: [{ n: 'Extra cheddar', p: 0 }, { n: 'Extra panceta', p: 0 }, { n: 'Huevo', p: 0 }] }],
  ['Acompañamiento', { t: 'Acompañamiento', min: 0, max: 1, o: [{ n: 'Papas fritas', p: 0 }, { n: 'Ensalada', p: 0 }] }],
  ['Gustos', { t: 'Gustos', min: 1, max: 2, o: [{ n: 'Gusto 1', p: 0 }, { n: 'Gusto 2', p: 0 }] }],
];

// Lo elegido como texto, para guardarlo en Firestore (no admite listas dentro de listas): [[1],[],[0,2]] ↔ "1;;0,2"
export const selTxt = (sel) => (Array.isArray(sel) ? sel : []).map((a) => (Array.isArray(a) ? a.join(',') : '')).join(';');
export const selDe = (t) => String(t || '').split(';').map((a) => (a ? a.split(',').map((x) => +x).filter((x) => Number.isInteger(x) && x >= 0) : []));
