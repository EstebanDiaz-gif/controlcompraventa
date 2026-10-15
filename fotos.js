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

// Devuelve {thumb, hd}. Si falla, {thumb:'', hd:''}.
export async function makePhotos(file) {
  try {
    const im = await loadImg(file), w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    if (!w || !h) return { thumb: '', hd: '' };
    const thumb = make(im, w, h, THUMB);
    const hd = Math.max(w, h) > THUMB.side * 1.15 ? make(im, w, h, HD) : '';
    return { thumb, hd };
  } catch (e) { return { thumb: '', hd: '' }; }
}
