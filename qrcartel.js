// QR del catálogo: para imprimir (cartel A4 para el mostrador o la vidriera) o para compartir como imagen.
// abrirQR({ link, tienda, color, logo (data:image… opcional), rubro: 'almacen'|'ropa'|'servicios'|'general' })

import { qrCanvas } from './qr.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIT = { almacen: 'Hacé tu pedido online', ropa: 'Mirá todo nuestro catálogo', servicios: 'Reservá tu turno online', general: 'Mirá nuestro catálogo online' };
const SUB = { almacen: 'Elegí tus productos y mandanos el pedido por WhatsApp', ropa: 'Talles, precios y novedades en tu celular', servicios: 'Elegí el servicio, el día y la hora desde tu celular', general: 'Precios y novedades en tu celular' };
const FMT = { cartel: 'Cartel para imprimir', qr: 'Solo el QR' };

const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
const cargar = (src) => new Promise((ok) => { if (!src) { ok(null); return; } const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

// Corta un texto en renglones que entren en el ancho.
function renglones(ctx, t, ancho, max) {
  const out = []; let l = '';
  String(t || '').split(/\s+/).forEach((p) => { const pr = l ? l + ' ' + p : p; if (ctx.measureText(pr).width <= ancho || !l) l = pr; else { out.push(l); l = p; } });
  if (l) out.push(l); return out.slice(0, max || 3);
}

// Cartel A4 (1240×1754 = A4 a 150 ppp): franja de color con el nombre, título, QR grande y el link.
async function cartel(o) {
  const W = 1240, H = 1754, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'), col = hexOk(o.color) ? o.color : '#111111', claro = lum(col) > 165, tinta = claro ? '#111' : '#fff';
  const F = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  // franja de arriba
  x.fillStyle = col; x.beginPath(); x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W, 330); x.quadraticCurveTo(W / 2, 420, 0, 330); x.closePath(); x.fill();
  const lg = await cargar(o.logo); let tx = W / 2;
  x.textAlign = 'center'; x.fillStyle = tinta; x.font = '800 74px ' + F;
  const nom = renglones(x, o.tienda || 'Nuestro catálogo', W - 260, 2);
  if (lg) {
    const r = 74, cx = W / 2, cy = 120; x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill(); x.clip();
    const s = Math.max(2 * r / lg.width, 2 * r / lg.height); x.drawImage(lg, cx - lg.width * s / 2, cy - lg.height * s / 2, lg.width * s, lg.height * s); x.restore();
    x.font = '800 ' + (nom.length > 1 ? 54 : 64) + 'px ' + F; nom.forEach((l, i) => x.fillText(l, tx, 268 + i * 60 - (nom.length > 1 ? 24 : 0)));
  } else {
    x.font = '800 ' + (nom.length > 1 ? 64 : 80) + 'px ' + F; nom.forEach((l, i) => x.fillText(l, tx, (nom.length > 1 ? 170 : 210) + i * 76));
  }
  // título y subtítulo
  x.fillStyle = '#111'; x.font = '900 86px ' + F;
  const t = renglones(x, o.titulo, W - 160, 2); t.forEach((l, i) => x.fillText(l, tx, 560 + i * 96));
  let y = 560 + (t.length - 1) * 96 + 70;
  x.fillStyle = '#555'; x.font = '500 40px ' + F; renglones(x, o.sub, W - 220, 2).forEach((l, i) => x.fillText(l, tx, y + i * 52));
  // QR con marco redondeado del color de la marca
  const q = qrCanvas(o.link, 720, 2), qs = 700, qx = (W - qs) / 2, qy = 790;
  x.fillStyle = col; rr(x, qx - 34, qy - 34, qs + 68, qs + 68, 54); x.fill();
  x.fillStyle = '#fff'; rr(x, qx - 18, qy - 18, qs + 36, qs + 36, 40); x.fill();
  x.imageSmoothingEnabled = false; x.drawImage(q, qx, qy, qs, qs);
  // abajo
  x.fillStyle = '#111'; x.font = '800 46px ' + F; x.fillText('📱 Escaneá con la cámara de tu celular', tx, qy + qs + 34 + 96);
  x.fillStyle = '#666'; x.font = '500 34px ' + F; x.fillText(o.link.replace(/^https?:\/\//, ''), tx, qy + qs + 34 + 156);
  return cv;
}
function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
// Solo el QR, grande y con margen blanco (para pegar en un flyer, el menú, una etiqueta…).
function soloQR(o) { return qrCanvas(o.link, 1200, 4); }

export function abrirQR(o) {
  const rub = TIT[o.rubro] ? o.rubro : 'general';
  const old = document.getElementById('qrdlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'qrdlg';
  d.style.cssText = 'position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
  const seg = Object.keys(FMT).map((k) => '<button type="button" data-qf="' + k + '" style="flex:1;border:0;border-radius:10px;padding:10px 6px;font:inherit;font-weight:700;font-size:15px;cursor:pointer">' + FMT[k] + '</button>').join('');
  d.innerHTML = '<div style="background:var(--bg,#fff);color:var(--ink,#111);width:100%;max-width:520px;max-height:94vh;overflow:auto;border-radius:22px 22px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:19px">🔳 QR de tu catálogo</b><button type="button" class="x" data-qx="1" style="font-weight:700;text-decoration:underline">Cerrar</button></div>' +
    '<div class="k" style="margin-top:4px">Imprimilo y pegalo en el mostrador, la vidriera o las bolsas. Tus clientes lo escanean con la cámara y entran directo a tu catálogo.</div>' +
    '<div style="display:flex;gap:6px;background:var(--card,#f4f3f0);padding:5px;border-radius:14px;margin-top:12px">' + seg + '</div>' +
    '<div id="qrtx"><label>Título del cartel</label><input id="qrt" maxlength="40" value="' + esc(TIT[rub]) + '"><label>Texto chico</label><input id="qrs" maxlength="70" value="' + esc(SUB[rub]) + '"></div>' +
    '<div style="display:flex;justify-content:center;background:var(--card,#f4f3f0);border-radius:16px;padding:12px;margin-top:12px"><img id="qrpv" alt="Vista previa" style="max-width:100%;max-height:46vh;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.18);background:#fff"></div>' +
    '<button type="button" class="go" id="qrpr" style="margin-top:12px">🖨️ Imprimir</button>' +
    '<div class="row" style="gap:8px"><button type="button" class="go alt" id="qrdl" style="margin:0">Descargar imagen</button><button type="button" class="go alt" id="qrsh" style="margin:0">Compartir</button></div>' +
    '<div class="k" id="qrmsg" style="margin-top:8px;font-weight:600"></div>' +
    '<div class="k" style="margin-top:6px;word-break:break-all">El QR abre: <b>' + esc(o.link) + '</b></div></div>';
  document.body.appendChild(d);
  const $ = (id) => d.querySelector('#' + id), msg = (t) => { $('qrmsg').textContent = t || ''; };
  let fmt = 'cartel', cv = null, gen = 0;
  const marcar = () => d.querySelectorAll('[data-qf]').forEach((b) => { const on = b.dataset.qf === fmt; b.style.background = on ? 'var(--btn,#1D3FAF)' : 'transparent'; b.style.color = on ? 'var(--btnink,#fff)' : 'var(--ink,#111)'; });
  const arch = () => 'qr-' + String(o.tienda || 'catalogo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 30) + (fmt === 'cartel' ? '-cartel' : '') + '.png';
  const dibujar = async () => {
    const g = ++gen; $('qrtx').hidden = fmt !== 'cartel';
    const c = fmt === 'cartel' ? await cartel(Object.assign({}, o, { titulo: $('qrt').value.trim() || TIT[rub], sub: $('qrs').value.trim() })) : soloQR(o);
    if (g !== gen) return; cv = c; $('qrpv').src = c.toDataURL('image/png');
  };
  const blob = () => new Promise((ok) => cv.toBlob(ok, 'image/png'));
  let t = 0; d.addEventListener('input', () => { clearTimeout(t); t = setTimeout(dibujar, 250); });
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-qx]')) { d.remove(); return; }
    const f = e.target.closest('[data-qf]'); if (f) { fmt = f.dataset.qf; marcar(); dibujar(); }
  });
  $('qrdl').onclick = () => { if (!cv) return; const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = arch(); document.body.appendChild(a); a.click(); a.remove(); msg('Imagen descargada ✓'); };
  $('qrsh').onclick = async () => {
    if (!cv) return; const b = await blob(), file = new File([b], arch(), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text: o.link }).catch(() => {});
    else { $('qrdl').onclick(); msg('En este dispositivo no se puede compartir directo: descargué la imagen.'); }
  };
  // Imprimir: una página aparte con la imagen a tamaño A4 (o el QR a 12 cm), y se abre el diálogo de impresión.
  $('qrpr').onclick = () => {
    if (!cv) return; const src = cv.toDataURL('image/png'), w = window.open('', '_blank');
    if (!w) { msg('El navegador bloqueó la ventana. Probá con Descargar imagen e imprimila desde la galería.'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(o.tienda || 'QR') + '</title><style>@page{size:A4;margin:' + (fmt === 'cartel' ? '0' : '2cm') + '}html,body{margin:0;height:100%}body{display:flex;align-items:' + (fmt === 'cartel' ? 'stretch' : 'flex-start') + ';justify-content:center}img{' + (fmt === 'cartel' ? 'width:100%;height:100%;object-fit:contain' : 'width:12cm;height:12cm') + '}</style></head><body><img src="' + src + '" onload="setTimeout(function(){print()},250)"></body></html>');
    w.document.close();
  };
  marcar(); dibujar();
  return d;
}
