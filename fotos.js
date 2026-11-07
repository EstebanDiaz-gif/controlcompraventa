// Fotos de productos en buena calidad, sin usar Firebase Storage (que pide el plan Blaze).
// De cada foto se generan dos versiones:
//  - "thumb": 640 px, liviana. Va dentro del producto (stock) y se usa en listas y en la grilla del catálogo.
//  - "hd": hasta 1400 px. Va en su propio documento público (stores/{sid}/public/foto_...) y el catálogo
//    la descarga solo cuando el cliente abre el producto (1 lectura).
// Se usa WebP cuando el navegador lo permite (mejor calidad con menos peso) y JPEG si no (iPhone).
// La reducción se hace por pasos para que la foto no quede pixelada ni borrosa.

const THUMB = { side: 640, max: 110000, q: 0.86, minQ: 0.6 };
const HD = { side: 1400, max: 900000, q: 0.9, minQ: 0.66 };

export function fotoId(k) { return 'foto_' + encodeURIComponent(String(k || '')).replace(/\./g, '%2E').slice(0, 700); }

function loadImg(file) {
  return new Promise((ok, bad) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { ok(im); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    im.onerror = () => { URL.revokeObjectURL(url); bad(new Error('img')); };
    im.src = url;
  });
}
// Achica por mitades (más nítido que un solo salto grande) hasta el tamaño final.
function scaled(src, w0, h0, side) {
  const k = Math.min(1, side / Math.max(w0, h0)), W = Math.max(1, Math.round(w0 * k)), H = Math.max(1, Math.round(h0 * k));
  let cur = src, cw = w0, ch = h0;
  while (cw / 2 >= W && ch / 2 >= H) {
    const c = document.createElement('canvas'); c.width = Math.round(cw / 2); c.height = Math.round(ch / 2);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, c.width, c.height); cur = c; cw = c.width; ch = c.height;
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(cur, 0, 0, W, H);
  return c;
}
let WEBP = null;
function webpOk() { if (WEBP === null) { try { WEBP = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { WEBP = false; } } return WEBP; }
function encode(canvas, cfg) {
  const type = webpOk() ? 'image/webp' : 'image/jpeg';
  let q = cfg.q, out = canvas.toDataURL(type, q);
  while (out.length > cfg.max && q > cfg.minQ) { q -= 0.06; out = canvas.toDataURL(type, q); }
  return out;
}
function make(im, w, h, cfg) {
  let side = cfg.side, out = '';
  for (let i = 0; i < 4; i++) {
    out = encode(scaled(im, w, h, side), cfg);
    if (out.length <= cfg.max) return out;
    side = Math.round(side * 0.8);
  }
  return out.length <= cfg.max ? out : '';
}

// Puntaje de calidad de una foto de producto, de 0 a 100 (para decidir cuál queda en la base compartida):
//  nitidez (35): varianza del laplaciano · resolución (20): lado menor de la foto original ·
//  luz (20): ni oscura ni quemada · fondo limpio (25): borde parejo y claro, como las fotos de catálogo de las marcas.
export function calidad(im, w, h) {
  try {
    const S = 256, k = S / Math.max(w, h), W = Math.max(8, Math.round(w * k)), H = Math.max(8, Math.round(h * k));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(im, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, n = W * H, g = new Float32Array(n);
    let sum = 0, dark = 0, burn = 0;
    for (let i = 0; i < n; i++) { const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; g[i] = v; sum += v; if (v < 28) dark++; if (v > 250) burn++; }
    const mean = sum / n;
    // nitidez: qué tan marcados son los bordes más fuertes (el 1 % más alto del laplaciano). Una foto movida no tiene bordes fuertes.
    const hist = new Uint32Array(1021); let m = 0;
    for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) { const i = y * W + xx, L = Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W]); hist[Math.min(1020, L | 0)]++; m++; }
    let need = Math.max(1, Math.round(m * 0.01)), acc = 0, cnt = 0;
    for (let v = 1020; v >= 0 && cnt < need; v--) { const t = Math.min(hist[v], need - cnt); acc += t * v; cnt += t; }
    const p99 = cnt ? acc / cnt : 0;
    const nit = 35 * Math.max(0, Math.min(1, (p99 - 20) / 130));
    const res = 20 * Math.min(1, Math.min(w, h) / 900);
    let luz = 20;
    if (mean < 70) luz *= Math.max(0, (mean - 25) / 45);
    if (dark / n > 0.35) luz *= 0.5;
    if (burn / n > 0.85) luz *= 0.6;   // casi todo blanco: producto chiquito o foto quemada
    let bs = 0, bs2 = 0, bn = 0;
    const borde = (i) => { bs += g[i]; bs2 += g[i] * g[i]; bn++; };
    for (let xx = 0; xx < W; xx++) { borde(xx); borde(W + xx); borde((H - 1) * W + xx); borde((H - 2) * W + xx); }
    for (let y = 2; y < H - 2; y++) { borde(y * W); borde(y * W + 1); borde(y * W + W - 1); borde(y * W + W - 2); }
    const bm = bs / bn, bsd = Math.sqrt(Math.max(0, bs2 / bn - bm * bm));
    const fondo = 25 * (bsd < 10 ? 1 : bsd < 22 ? 0.7 : bsd < 40 ? 0.35 : 0) * (bm > 215 ? 1 : bm > 170 ? 0.75 : 0.45);
    let tot = nit + res + luz + fondo;
    if (p99 < 45) tot *= 0.6;   // movida o desenfocada: no compensa con fondo o luz
    return Math.max(0, Math.min(100, Math.round(tot)));
  } catch (e) { return 0; }
}

// Devuelve {thumb, hd, qs} (qs = puntaje de calidad). Si falla, {thumb:'', hd:'', qs:0}.
export async function makePhotos(file) {
  try {
    const im = await loadImg(file), w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    if (!w || !h) return { thumb: '', hd: '', qs: 0 };
    const thumb = make(im, w, h, THUMB);
    const hd = Math.max(w, h) > THUMB.side * 1.15 ? make(im, w, h, HD) : '';
    return { thumb, hd, qs: thumb ? calidad(im, w, h) : 0 };
  } catch (e) { return { thumb: '', hd: '', qs: 0 }; }
}
