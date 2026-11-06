// Publicar un producto en Instagram: arma la imagen (foto + nombre + precio + tienda) y un texto editable,
// y abre el menú de compartir del celular para elegir Instagram (publicación o historia).
// Instagram no deja que otra app publique sola: la persona termina la publicación en Instagram.
// El texto no viaja con la imagen (Instagram lo ignora), así que se copia para pegarlo.
//
// abrirInsta({ nombre, precio, porKg, talles, detalle, cat, foto, fotoHD, logo, tienda, link, money })
//   foto: imagen chica (data URL) · fotoHD: () => Promise<data URL | ''> con la foto grande, si hay.
//   talles: ['38','39'] (se dibujan como etiquetas) · logo: logo de la tienda (data URL), si tiene.
//
// Tres estilos (Moderno, Minimal, Impacto) en dos formatos (publicación 4:5 e historia 9:16).
// Si la tienda tiene una fecha especial activa (Navidad, Día de la Madre…), se suma un cuarto estilo de esa fecha:
//   tema: { nombre, emoji, titulo, wa, regalo, deco, ban: { g, ink, cd, cdi }, cuenta: 'Faltan 5 días' }
// El color de acento sale de la foto (su color más vivo), así cada producto queda combinado con su imagen.

const FMT = { post: { w: 1080, h: 1350, t: 'Publicación' }, story: { w: 1080, h: 1920, t: 'Historia' } };
const EST = { moderno: 'Moderno', minimal: 'Minimal', impacto: 'Impacto' };
const FD = '"Bricolage Grotesque", "Archivo", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FS = '"Fraunces", Georgia, "Times New Roman", serif';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function tag(s) { const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, ''); return t ? '#' + t.toLowerCase() : ''; }
function cssVar(n, def) { try { const v = getComputedStyle(document.body).getPropertyValue(n).trim(); return v || def; } catch (e) { return def; } }
function loadImg(src) { return new Promise((res) => { if (!src) { res(null); return; } const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

// ---------- tipografías (Google Fonts): se cargan una vez; si no llegan, queda la del sistema ----------
let fontsP = null;
function fuentes() {
  if (fontsP) return fontsP;
  fontsP = new Promise((res) => {
    const fin = () => {
      if (!document.fonts || !document.fonts.load) { res(); return; }
      Promise.all(['800 80px "Bricolage Grotesque"', '600 30px "Bricolage Grotesque"', '700 64px "Fraunces"', 'italic 600 40px "Fraunces"', 'italic 600 80px "Fraunces"'].map((f) => document.fonts.load(f).catch(() => null))).then(() => res(), () => res());
    };
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Fraunces:ital,opsz,wght@0,9..144,600..700;1,9..144,600&display=swap';
    l.onload = fin; l.onerror = () => res(); document.head.appendChild(l);
    setTimeout(res, 3500);
  });
  return fontsP;
}

// ---------- color ----------
function hex(c) { return '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function parse(s) { const m = String(s || '').trim().match(/^#?([0-9a-f]{6})$/i); if (!m) return { r: 29, g: 63, b: 175 }; const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 }; }
function mix(a, b, t) { return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }; }
function lum(c) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
function rgba(c, a) { return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + a + ')'; }
// Oscurece hasta que el blanco se lea bien encima.
function paraBlanco(c) { let x = c, i = 0; while (lum(x) > 0.2 && i++ < 12) x = mix(x, { r: 0, g: 0, b: 0 }, 0.12); return x; }
// El color más vivo de la foto (se ignoran blancos, negros y grises).
function vivo(img) {
  try {
    const n = 40, c = document.createElement('canvas'); c.width = n; c.height = n;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, n, n);
    const d = x.getImageData(0, 0, n, n).data, cub = {};
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
      if (mx < 40 || s < 0.28 || (mx > 245 && s < 0.4)) continue;
      const k = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5), e = cub[k] || (cub[k] = { r: 0, g: 0, b: 0, n: 0, w: 0 });
      e.r += r; e.g += g; e.b += b; e.n++; e.w += 1 + s * 2;
    }
    let best = null; Object.keys(cub).forEach((k) => { if (!best || cub[k].w > best.w) best = cub[k]; });
    if (!best || best.n < 12) return null;
    return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n };
  } catch (e) { return null; }
}

export function textoInsta(o, est) {
  const T = est === 'temporada' && o.tema, l = [];
  if (T) { l.push(T.emoji + ' ' + T.titulo + ' ' + T.emoji, ''); }
  l.push('✨ ' + o.nombre);
  if (o.precio > 0) l.push('💲 ' + o.money(o.precio) + (o.porKg ? ' el kilo' : ''));
  if (o.detalle) l.push(o.detalle);
  if (T && T.regalo && T.wa) l.push('🎁 Ideal ' + T.wa);
  l.push('', '📲 Pedilo por WhatsApp o desde nuestro catálogo (link en la bio)');
  if (o.link) l.push(o.link);
  const tags = [tag(o.tienda), tag(o.cat), T ? tag(T.nombre) : ''].filter(Boolean);
  if (tags.length) l.push('', tags.join(' '));
  return l.join('\n');
}

// ---------- dibujo ----------
// Corta el texto en renglones que entren en `w` (como mucho `max` renglones, con … al final).
function lineas(ctx, txt, w, max) {
  const words = String(txt || '').split(/\s+/).filter(Boolean), out = [];
  let cur = '';
  words.forEach((wd) => { const t = cur ? cur + ' ' + wd : wd; if (ctx.measureText(t).width <= w || !cur) cur = t; else { out.push(cur); cur = wd; } });
  if (cur) out.push(cur);
  if (out.length > max) { out.length = max; let s = out[max - 1]; while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); out[max - 1] = s + '…'; }
  return out;
}
// Achica la letra hasta que el texto entre en `max` renglones.
function ajustar(ctx, txt, w, max, peso, tam, min, fam) {
  let t = tam, l;
  for (; t >= min; t -= 4) { ctx.font = peso + ' ' + t + 'px ' + fam; l = lineas(ctx, txt, w, 99); if (l.length <= max) break; }
  ctx.font = peso + ' ' + Math.max(t, min) + 'px ' + fam;
  return { l: lineas(ctx, txt, w, max), t: Math.max(t, min) };
}
function rr(ctx, x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function cover(ctx, img, x, y, w, h) { const r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r; ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h); }
function espaciado(ctx, txt, x, y, sp, align) {
  const s = String(txt); let w = 0; for (const ch of s) w += ctx.measureText(ch).width + sp; w -= sp;
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; const a0 = ctx.textAlign; ctx.textAlign = 'left';
  for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; } ctx.textAlign = a0; return w;
}
function logoCirc(ctx, lg, x, y, d, borde) {
  if (!lg) return false;
  ctx.save(); if (borde) { ctx.fillStyle = borde; ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2 + 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, d, d); cover(ctx, lg, x, y, d, d); ctx.restore(); return true;
}
// Etiquetas (talles) en una fila; devuelve el ancho usado.
function chips(ctx, l, x, y, maxW, o) {
  ctx.font = o.font; let cx = x, n = 0;
  for (const t of l) {
    const w = ctx.measureText(t).width + o.pad * 2; if (cx + w > x + maxW) { if (n < l.length) { /* no entra más */ } break; }
    rr(ctx, cx, y, w, o.h, o.h / 2);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.line) { ctx.strokeStyle = o.line; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = o.ink; ctx.textBaseline = 'middle'; ctx.fillText(t, cx + o.pad, y + o.h / 2 + 2); ctx.textBaseline = 'alphabetic';
    cx += w + o.gap; n++;
  }
  return cx - x;
}
function sinFoto(ctx, W, H, ac) {
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, hex(mix(ac, { r: 255, g: 255, b: 255 }, 0.15))); g.addColorStop(1, hex(paraBlanco(ac)));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(W * (0.15 + i * 0.22), H * (0.2 + (i % 2) * 0.25), 160 + i * 40, 0, Math.PI * 2); ctx.fill(); }
}

// MODERNO: foto a pantalla completa, degradé oscuro y texto blanco encima; precio en una píldora del color de la foto.
function moderno(ctx, W, H, o, img, ac, fmt) {
  if (img) cover(ctx, img, 0, 0, W, H); else sinFoto(ctx, W, H, ac);
  let g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 300);
  const y0 = H * (fmt === 'story' ? 0.42 : 0.38);
  g = ctx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, 'rgba(8,8,12,0)'); g.addColorStop(0.45, 'rgba(8,8,12,.62)'); g.addColorStop(1, 'rgba(8,8,12,.94)'); ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
  // marca arriba
  const M = 64, top = fmt === 'story' ? 120 : 60; let lx = M;
  if (o._lg) { logoCirc(ctx, o._lg, M, top, 92, 'rgba(255,255,255,.9)'); lx = M + 92 + 24; }
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 12; ctx.font = '700 38px ' + FD;
  ctx.fillText(lineas(ctx, o.tienda || '', W - lx - M, 1)[0] || '', lx, top + 60); ctx.shadowBlur = 0;
  // abajo, de abajo hacia arriba
  let y = H - (fmt === 'story' ? 280 : 70);
  ctx.globalAlpha = 0.78; ctx.fillStyle = '#fff'; ctx.font = '600 30px ' + FD;
  ctx.fillText(fmt === 'story' ? 'Tocá el enlace y pedilo 👇' : 'Pedilo por WhatsApp · link en la bio', M, y); ctx.globalAlpha = 1;
  y -= 56;
  const precio = o.precio > 0 ? o.money(o.precio) + (o.porKg ? ' /kg' : '') : '';
  if (precio) {
    ctx.font = '800 76px ' + FD; const pw = ctx.measureText(precio).width + 76, ph = 116;
    ctx.fillStyle = hex(ac); rr(ctx, M, y - ph, pw, ph, ph / 2); ctx.fill();
    ctx.fillStyle = lum(ac) > 0.45 ? '#111' : '#fff'; ctx.fillText(precio, M + 38, y - 32);
    if (o.talles && o.talles.length) chips(ctx, o.talles, M + pw + 22, y - ph + (ph - 64) / 2, W - M * 2 - pw - 22, { font: '700 30px ' + FD, h: 64, pad: 22, gap: 12, line: 'rgba(255,255,255,.7)', ink: '#fff' });
    y -= ph + 40;
  } else if (o.talles && o.talles.length) { chips(ctx, o.talles, M, y - 64, W - M * 2, { font: '700 30px ' + FD, h: 64, pad: 22, gap: 12, line: 'rgba(255,255,255,.7)', ink: '#fff' }); y -= 64 + 40; }
  const N = ajustar(ctx, o.nombre, W - M * 2, 3, '800', fmt === 'story' ? 104 : 92, 56, FD);
  ctx.fillStyle = '#fff'; const lh = N.t * 1.02;
  for (let i = N.l.length - 1; i >= 0; i--) { ctx.fillText(N.l[i], M, y); y -= lh; }
  if (o.cat) { ctx.fillStyle = hex(mix(ac, { r: 255, g: 255, b: 255 }, 0.55)); ctx.font = '700 28px ' + FD; espaciado(ctx, String(o.cat).toUpperCase(), M, y + 8, 5); }
}

// MINIMAL: fondo claro teñido con el color de la foto, foto en una tarjeta con sombra y tipografía editorial.
function minimal(ctx, W, H, o, img, ac, fmt) {
  const bg = mix(ac, { r: 248, g: 245, b: 240 }, 0.9), ink = { r: 24, g: 22, b: 20 }, acD = paraBlanco(ac);
  ctx.fillStyle = hex(bg); ctx.fillRect(0, 0, W, H);
  const M = 72, st = fmt === 'story';
  // encabezado: logo + tienda en versalitas
  let top = st ? 150 : 70, lx = M;
  if (o._lg) { logoCirc(ctx, o._lg, M, top - 6, 64, null); lx = M + 64 + 20; }
  ctx.fillStyle = hex(ink); ctx.font = '700 26px ' + FD; espaciado(ctx, String(o.tienda || '').toUpperCase(), lx, top + 36, 6);
  if (o.cat) { ctx.globalAlpha = 0.55; ctx.font = '600 24px ' + FD; espaciado(ctx, String(o.cat).toUpperCase(), W - M, top + 36, 4, 'right'); ctx.globalAlpha = 1; }
  // foto
  const fy = top + 84, fh = st ? 1040 : 820, fw = W - M * 2;
  ctx.save(); ctx.shadowColor = 'rgba(40,30,20,.22)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 22; ctx.fillStyle = '#fff'; rr(ctx, M, fy, fw, fh, 34); ctx.fill(); ctx.restore();
  ctx.save(); rr(ctx, M, fy, fw, fh, 34); ctx.clip(); if (img) cover(ctx, img, M, fy, fw, fh); else { ctx.fillStyle = hex(mix(ac, { r: 255, g: 255, b: 255 }, 0.6)); ctx.fillRect(M, fy, fw, fh); } ctx.restore();
  // texto
  let y = fy + fh + (st ? 120 : 96);
  const N = ajustar(ctx, o.nombre, W - M * 2, 2, '700', st ? 80 : 66, 44, FS);
  ctx.fillStyle = hex(ink); N.l.forEach((s, i) => ctx.fillText(s, M, y + i * N.t * 1.08)); y += (N.l.length - 1) * N.t * 1.08;
  y += st ? 40 : 28; ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(M, y, W - M * 2, 2); y += st ? 84 : 70;
  const precio = o.precio > 0 ? o.money(o.precio) + (o.porKg ? ' el kilo' : '') : '';
  if (precio) { ctx.fillStyle = hex(acD); ctx.font = '800 ' + (st ? 72 : 60) + 'px ' + FD; ctx.fillText(precio, M, y); }
  ctx.fillStyle = hex(ink); ctx.globalAlpha = 0.7; ctx.font = '500 ' + (st ? 32 : 28) + 'px ' + FD; ctx.textAlign = 'right';
  if (o.talles && o.talles.length) ctx.fillText(lineas(ctx, 'Talles ' + o.talles.join(' · '), W - M * 2 - (precio ? 380 : 0), 1)[0], W - M, y - 4);
  ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  ctx.fillStyle = hex(ink); ctx.globalAlpha = 0.5; ctx.font = 'italic 600 ' + (st ? 34 : 28) + 'px ' + FS; ctx.textAlign = 'center';
  ctx.fillText(st ? 'Tocá el enlace y pedilo' : 'Pedilo por WhatsApp — link en la bio', W / 2, H - (st ? 300 : 52)); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
}

// IMPACTO: color pleno, la foto como polaroid inclinada, el precio gigante y un sticker.
function impacto(ctx, W, H, o, img, ac, fmt) {
  const bg = paraBlanco(ac), st = fmt === 'story', yel = '#FFE14D';
  ctx.fillStyle = hex(bg); ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = rgba(mix(bg, { r: 255, g: 255, b: 255 }, 0.25), 0.35);
  ctx.beginPath(); ctx.arc(W * 0.92, st ? 330 : 170, st ? 420 : 360, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W * 0.04, H * 0.86, 260, 0, Math.PI * 2); ctx.fill();
  // tienda arriba
  const M = 64, top = st ? 130 : 56; let lx = M;
  if (o._lg) { logoCirc(ctx, o._lg, M, top, 76, '#fff'); lx = M + 76 + 22; }
  ctx.fillStyle = '#fff'; ctx.font = '800 36px ' + FD; ctx.fillText(lineas(ctx, o.tienda || '', W - lx - M, 1)[0] || '', lx, top + 50);
  // polaroid
  const s = st ? 780 : 620, cx = W / 2, cy = (st ? 320 : 160) + s / 2 + 40;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.055);
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24; ctx.fillStyle = '#fff'; ctx.fillRect(-s / 2 - 24, -s / 2 - 24, s + 48, s + 48 + 40); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (img) { ctx.save(); ctx.beginPath(); ctx.rect(-s / 2, -s / 2, s, s); ctx.clip(); cover(ctx, img, -s / 2, -s / 2, s, s); ctx.restore(); } else { ctx.fillStyle = hex(mix(ac, { r: 255, g: 255, b: 255 }, 0.5)); ctx.fillRect(-s / 2, -s / 2, s, s); }
  ctx.restore();
  // sticker
  ctx.save(); ctx.translate(cx + s / 2 - 10, cy - s / 2 + 20); ctx.rotate(0.22);
  ctx.fillStyle = yel; ctx.beginPath(); const R = st ? 112 : 96;
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = i % 2 ? R : R * 0.88; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.font = '800 ' + (st ? 34 : 30) + 'px ' + FD; ctx.fillText('¡PEDILO', 0, -4); ctx.fillText('YA!', 0, st ? 34 : 30); ctx.textAlign = 'left'; ctx.restore();
  // nombre y precio
  let y = cy + s / 2 + (st ? 180 : 165);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  const N = ajustar(ctx, o.nombre, W - M * 2, 2, '800', st ? 78 : 64, 42, FD);
  N.l.forEach((t, i) => ctx.fillText(t, W / 2, y + i * N.t * 1.05)); y += (N.l.length - 1) * N.t * 1.05;
  const precio = o.precio > 0 ? o.money(o.precio) + (o.porKg ? ' /kg' : '') : '';
  if (precio) {
    y += st ? 60 : 40; const PT = ajustar(ctx, precio, W - M * 2 - 80, 1, '800', st ? 150 : 124, 70, FD);
    const pw = ctx.measureText(precio).width + 80, ph = PT.t * 1.12;
    ctx.save(); ctx.translate(W / 2, y + ph / 2); ctx.rotate(-0.025); ctx.fillStyle = yel; rr(ctx, -pw / 2, -ph / 2, pw, ph, 22); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillText(precio, 0, PT.t * 0.36); ctx.restore(); y += ph;
  }
  if (o.talles && o.talles.length) { y += st ? 80 : 56; ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9; ctx.font = '700 ' + (st ? 36 : 30) + 'px ' + FD; ctx.fillText(lineas(ctx, 'Talles ' + o.talles.join(' · '), W - M * 2, 1)[0], W / 2, y); ctx.globalAlpha = 1; }
  ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8; ctx.font = '600 ' + (st ? 32 : 28) + 'px ' + FD; ctx.fillText(st ? 'Tocá el enlace y pedilo 👇' : 'Pedilo por WhatsApp · link en la bio', W / 2, st ? Math.max(y + 90, H - 300) : H - 44); ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// FECHA ESPECIAL: degradé y colores de la fecha, adornos de fondo, título en letra caligráfica,
// la foto en un marco con arco y la cuenta regresiva.
function colores(g) { return (String(g || '').match(/#[0-9a-f]{3,6}\b/gi) || []).map((h) => h.length === 4 ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h); }
function florC(ctx, x, y, r, c1, c2, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.fillStyle = c1;
  for (let i = 0; i < 5; i++) { ctx.save(); ctx.rotate(i * Math.PI * 2 / 5); ctx.beginPath(); ctx.ellipse(0, -r * 0.46, r * 0.3, r * 0.46, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function adorno(ctx, dc, x, y, sz, rot) {
  if (String(dc).indexOf('flor:') === 0) { const p = dc.split(':'); florC(ctx, x, y, sz / 2, p[1], p[2], rot); return; }
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.font = sz + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(dc, 0, 0); ctx.restore();
}
function arco(ctx, x, y, w, h) { const r = w / 2; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h - 28); ctx.arcTo(x + w, y + h, x + w - 28, y + h, 28); ctx.lineTo(x + 28, y + h); ctx.arcTo(x, y + h, x, y + h - 28, 28); ctx.closePath(); }
function temporada(ctx, W, H, o, img, ac, fmt) {
  const T = o.tema || {}, B = T.ban || {}, cs = colores(B.g), st = fmt === 'story';
  const ink = B.ink || '#fff', cd = B.cd || '#fff', cdi = B.cdi || '#111';
  const g = ctx.createLinearGradient(0, 0, W, H); (cs.length ? cs : ['#1D3FAF', '#3b5bd6']).forEach((c, i, a) => g.addColorStop(a.length > 1 ? i / (a.length - 1) : 0, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // adornos chiquitos de fondo, siempre en el mismo lugar
  const dec = (T.deco || []).map((d) => d[0]); let k = 7;
  const rnd = () => { k = (k * 9301 + 49297) % 233280; return k / 233280; };
  ctx.globalAlpha = 0.16;
  for (let yy = 40; yy < H; yy += st ? 210 : 190) for (let xx = (yy / 10) % 120; xx < W; xx += 230) { if (dec.length) adorno(ctx, dec[Math.floor(rnd() * dec.length)], xx + rnd() * 60, yy + rnd() * 50, 46 + rnd() * 18, rnd() - 0.5); }
  ctx.globalAlpha = 1;
  const M = 64, top = st ? 120 : 56;
  // tienda y cuenta regresiva
  let lx = M; if (o._lg) { logoCirc(ctx, o._lg, M, top, 70, cd); lx = M + 70 + 20; }
  ctx.fillStyle = ink; ctx.font = '800 32px ' + FD; ctx.fillText(lineas(ctx, o.tienda || '', W / 2 - lx, 1)[0] || '', lx, top + 46);
  if (T.cuenta) { ctx.font = '800 30px ' + FD; const cw = ctx.measureText(T.cuenta).width + 48; ctx.fillStyle = cd; rr(ctx, W - M - cw, top + 8, cw, 58, 29); ctx.fill(); ctx.fillStyle = cdi; ctx.fillText(T.cuenta, W - M - cw + 24, top + 48); }
  // título
  ctx.textAlign = 'center'; ctx.fillStyle = ink;
  const TT = ajustar(ctx, T.titulo || T.nombre || '', W - M * 2, 1, 'italic 600', st ? 92 : 78, 46, FS);
  const ty = top + (st ? 210 : 170); ctx.fillText(TT.l[0] || '', W / 2, ty);
  ctx.globalAlpha = 0.7; ctx.fillRect(W / 2 - 150, ty + 28, 110, 3); ctx.fillRect(W / 2 + 40, ty + 28, 110, 3); ctx.globalAlpha = 1;
  adorno(ctx, T.emoji || '✨', W / 2, ty + 30, 34, 0);
  // foto en arco
  const fw = st ? 840 : 700, fh = st ? 940 : 660, fx = (W - fw) / 2, fy = ty + (st ? 90 : 72);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.32)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 22; ctx.fillStyle = cd; arco(ctx, fx - 14, fy - 14, fw + 28, fh + 28); ctx.fill(); ctx.restore();
  ctx.save(); arco(ctx, fx, fy, fw, fh); ctx.clip(); if (img) cover(ctx, img, fx, fy, fw, fh); else { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(fx, fy, fw, fh); } ctx.restore();
  if (dec[0]) adorno(ctx, dec[0], fx + fw - 10, fy + fw * 0.18, st ? 150 : 128, 0.18);
  if (dec[1]) adorno(ctx, dec[1], fx + 10, fy + fh - 30, st ? 112 : 96, -0.2);
  // nombre, precio, talles
  let y = fy + fh + (st ? 120 : 92); ctx.fillStyle = ink;
  const N = ajustar(ctx, o.nombre, W - M * 2, 2, '800', st ? 70 : 54, 38, FD);
  N.l.forEach((t, i) => ctx.fillText(t, W / 2, y + i * N.t * 1.05)); y += (N.l.length - 1) * N.t * 1.05;
  const precio = o.precio > 0 ? o.money(o.precio) + (o.porKg ? ' /kg' : '') : '';
  if (precio) { y += st ? 40 : 26; ctx.font = '800 ' + (st ? 76 : 62) + 'px ' + FD; const pw = ctx.measureText(precio).width + 70, ph = st ? 112 : 92; ctx.fillStyle = cd; rr(ctx, W / 2 - pw / 2, y, pw, ph, ph / 2); ctx.fill(); ctx.fillStyle = cdi; ctx.fillText(precio, W / 2, y + ph * 0.72); y += ph; }
  if (o.talles && o.talles.length) { y += st ? 62 : 46; ctx.fillStyle = ink; ctx.globalAlpha = 0.85; ctx.font = '700 ' + (st ? 34 : 28) + 'px ' + FD; ctx.fillText(lineas(ctx, 'Talles ' + o.talles.join(' · '), W - M * 2, 1)[0], W / 2, y); ctx.globalAlpha = 1; }
  ctx.fillStyle = ink; ctx.globalAlpha = 0.85; ctx.font = 'italic 600 ' + (st ? 36 : 30) + 'px ' + FS;
  const pie = st ? 'Tocá el enlace y pedilo 👇' : (T.regalo && T.wa ? 'Ideal ' + T.wa : 'Pedilo por WhatsApp') + ' · link en la bio';
  ctx.fillText(pie, W / 2, st ? Math.max(y + 90, H - 300) : H - 38); ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

export function dibujar(cv, o, img, fmt, est) {
  const F = FMT[fmt] || FMT.post, W = F.w, H = F.h, ctx = cv.getContext('2d');
  cv.width = W; cv.height = H; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const ac = (img && vivo(img)) || parse(o.color);
  ({ moderno, minimal, impacto, temporada }[est] || moderno)(ctx, W, H, o, img, ac, fmt);
}

export function abrirInsta(o) {
  o.color = o.color || cssVar('--btn', '#1D3FAF');
  // Con una fecha especial activa, su estilo aparece primero y elegido.
  const ES = o.tema ? Object.assign({ temporada: o.tema.emoji + ' ' + (o.tema.nombre.length > 12 ? o.tema.nombre.split(' ').slice(-1)[0] : o.tema.nombre) }, EST) : EST;
  let est = o.tema ? 'temporada' : 'moderno';
  const old = document.getElementById('igdlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'igdlg';
  d.style.cssText = 'position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
  const seg = (attr, obj, sel) => '<div style="display:flex;gap:6px;background:var(--card,#f4f3f0);padding:5px;border-radius:14px;margin-top:8px">' + Object.keys(obj).map((k) => '<button type="button" data-' + attr + '="' + k + '" aria-pressed="' + (k === sel) + '" style="flex:1;border:0;border-radius:10px;padding:10px 6px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;' + (k === sel ? 'background:var(--btn,#1D3FAF);color:var(--btnink,#fff)' : 'background:transparent;color:var(--ink,#111)') + '">' + (typeof obj[k] === 'string' ? obj[k] : obj[k].t) + '</button>').join('') + '</div>';
  d.innerHTML = '<div style="background:var(--bg,#fff);color:var(--ink,#111);width:100%;max-width:520px;max-height:94vh;overflow:auto;border-radius:22px 22px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:19px">📸 Publicar en Instagram</b><button type="button" class="x" data-igx="1" style="font-size:15px;font-weight:700;text-decoration:underline">Cerrar</button></div>' +
    '<div id="igest">' + seg('ige', ES, est) + '</div><div id="igfmt">' + seg('igf', FMT, 'post') + '</div>' +
    '<div style="display:flex;justify-content:center;background:var(--card,#f4f3f0);border-radius:16px;padding:10px;margin-top:10px"><canvas id="igcv" style="width:auto;max-width:100%;max-height:48vh;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.2)"></canvas></div>' +
    '<label for="igtx" style="margin-top:14px">Texto de la publicación</label><textarea id="igtx" rows="7" style="width:100%;font:inherit;font-size:15px;line-height:1.4"></textarea>' +
    '<button type="button" class="go" id="igsh" style="margin-top:12px">Compartir en Instagram</button>' +
    '<div class="row" style="gap:8px"><button type="button" class="go alt" id="igdl" style="margin:0">Descargar imagen</button><button type="button" class="go alt" id="igcp" style="margin:0">Copiar texto</button></div>' +
    '<div class="k" id="igmsg" style="margin-top:10px;font-weight:600"></div>' +
    '<div class="k" style="margin-top:6px">Al tocar <b>Compartir</b> el texto se copia solo. En Instagram elegí Publicación o Historia, y en el texto mantené apretado y tocá <b>Pegar</b>.</div></div>';
  document.body.appendChild(d);
  const $ = (id) => d.querySelector('#' + id), cv = $('igcv'), tx = $('igtx'), msg = (t) => { $('igmsg').textContent = t; };
  let auto = textoInsta(o, est); tx.value = auto;
  let fmt = 'post', img = null, file = null, gen = 0;
  const nombreArch = (o.nombre || 'producto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'producto';
  // El archivo se prepara antes del toque: el menú de compartir solo se abre si se llama enseguida al tocar.
  const render = () => {
    dibujar(cv, o, img, fmt, est); file = null; const g = ++gen;
    try { cv.toBlob((b) => { if (g === gen && b) file = new File([b], nombreArch + (fmt === 'story' ? '-historia' : '') + '.jpg', { type: 'image/jpeg' }); }, 'image/jpeg', 0.93); } catch (e) { file = null; }
  };
  const copiar = () => { const t = tx.value; try { if (navigator.clipboard) return navigator.clipboard.writeText(t).then(() => true, () => false); } catch (e) { /* sin portapapeles */ } return Promise.resolve(false); };
  const descargar = () => {
    try { const a = document.createElement('a'); a.href = cv.toDataURL('image/jpeg', 0.93); a.download = nombreArch + (fmt === 'story' ? '-historia' : '') + '.jpg'; document.body.appendChild(a); a.click(); a.remove(); return true; } catch (e) { return false; }
  };
  const marcar = (attr, val) => d.querySelectorAll('[data-' + attr + ']').forEach((b) => { const on = b.dataset[attr] === val; b.setAttribute('aria-pressed', on); b.style.background = on ? 'var(--btn,#1D3FAF)' : 'transparent'; b.style.color = on ? 'var(--btnink,#fff)' : 'var(--ink,#111)'; });
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-igx]')) { d.remove(); return; }
    const f = e.target.closest('[data-igf]'); if (f) { fmt = f.dataset.igf; marcar('igf', fmt); render(); return; }
    const s = e.target.closest('[data-ige]'); if (s) { est = s.dataset.ige; marcar('ige', est); render();
      // el texto se adapta al estilo, salvo que la persona ya lo haya cambiado
      const nu = textoInsta(o, est); if (tx.value === auto) tx.value = nu; auto = nu; }
  });
  $('igcp').onclick = () => { copiar().then((ok) => msg(ok ? 'Texto copiado ✓' : 'No pude copiar: seleccioná el texto y copialo a mano.')); };
  $('igdl').onclick = () => { const ok = descargar(); copiar().then((c) => msg(ok ? 'Imagen descargada' + (c ? ' y texto copiado' : '') + '. Subila desde Instagram.' : 'No pude descargar la imagen.')); };
  $('igsh').onclick = () => {
    const pc = copiar();
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).then(() => msg('Listo. Si no pegaste el texto: mantené apretado y tocá Pegar.'), (e) => { if (e && e.name !== 'AbortError') msg('No se pudo compartir. Probá con Descargar imagen.'); });
      pc.then((ok) => { if (!ok) msg('No pude copiar el texto: copialo antes con el botón Copiar texto.'); });
      return;
    }
    // Compu o navegador sin compartir archivos: se descarga la imagen.
    const ok = descargar(); pc.then((c) => msg(ok ? 'En este dispositivo no se puede compartir directo: descargué la imagen' + (c ? ' y copié el texto' : '') + '. Subila desde Instagram.' : 'No pude preparar la imagen.'));
  };
  render();
  Promise.all([fuentes(), loadImg(o.logo).then((l) => { o._lg = l; })]).then(render);
  loadImg(o.foto).then((i) => { if (i) { img = i; render(); } return o.fotoHD ? o.fotoHD() : ''; })
    .then((hd) => (hd ? loadImg(hd) : null)).then((i) => { if (i && document.body.contains(d)) { img = i; render(); } }).catch(() => {});
  return d;
}
