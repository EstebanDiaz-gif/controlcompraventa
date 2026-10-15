// Promociones de la tienda (catálogo + Caja del almacén).
// Se guardan en stores/{sid}/public/promos = { list: [promo...] } (lo lee el catálogo con 1 lectura)
// y la foto propia de cada promo en stores/{sid}/public/promoimg_{id} = { f: dataURL }.
//
// promo combo: { id, t:'combo', titulo, desc, precio, antes, items:[{id, n, q}], img:1?, on:true, hasta:ms? }
//   items es opcional: sin items es una promo "de anuncio" (ej. servicios: "Corte + barba de regalo").
// promo cantidad: { id, t:'cant', min, pct, cat:'' (todas) | 'Zapatillas', on, hasta }

export const MAX_PROMOS = 20;

export function vigentes(list, now) {
  return (list || []).filter((p) => p && p.on !== false && (!p.hasta || now <= p.hasta));
}
export const combos = (list, now) => vigentes(list, now).filter((p) => p.t === 'combo');
export const cantidades = (list, now) => vigentes(list, now).filter((p) => p.t === 'cant' && p.min > 0 && p.pct > 0);

export function tituloCant(p, unidad) {
  return 'Llevando ' + p.min + ' o más' + (unidad && !p.cat ? ' ' + unidad : '') + ', ' + p.pct + '% OFF' + (p.cat ? ' en ' + p.cat : '');
}

// lineas: [{cat, unidades, total}] (solo productos sueltos, no combos).
// Devuelve el mejor descuento que se alcanza y, si no se alcanza ninguno, cuánto falta para el más cercano.
export function descuento(list, now, lineas) {
  let mejor = null, cerca = null;
  cantidades(list, now).forEach((p) => {
    const idx = [], ok = lineas.map((l, i) => (!p.cat || l.cat === p.cat) ? (idx.push(i), l) : null).filter(Boolean);
    const unidades = ok.reduce((a, l) => a + l.unidades, 0), total = ok.reduce((a, l) => a + l.total, 0);
    if (unidades >= p.min) {
      const monto = Math.round(total * p.pct / 100);
      if (monto > 0 && (!mejor || monto > mejor.monto)) mejor = { p, monto, idx, base: total };
    } else if (unidades > 0) {
      const faltan = p.min - unidades;
      if (!cerca || faltan < cerca.faltan) cerca = { p, faltan };
    }
  });
  return { mejor, cerca: mejor ? null : cerca };
}

// Reparte un total en pesos enteros según pesos relativos (el redondeo va al último).
export function repartir(total, pesos) {
  const ws = pesos.reduce((a, b) => a + (b || 0), 0) > 0 ? pesos.map((w) => w || 0) : pesos.map(() => 1);
  const W = ws.reduce((a, b) => a + b, 0);
  let acc = 0;
  return ws.map((w, i) => {
    if (i === ws.length - 1) return total - acc;
    const v = Math.round(total * w / W);
    acc += v; return v;
  });
}

// Precio normal de un combo según los precios de sus productos.
export function precioNormal(items, precioDe) {
  return (items || []).reduce((a, it) => a + (precioDe(it.id) || 0) * (it.q || 1), 0);
}
export const ahorro = (p) => (p.antes && p.antes > p.precio ? Math.round((1 - p.precio / p.antes) * 100) : 0);
