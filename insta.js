// Publicar un producto en Instagram: arma la imagen (foto + nombre + precio + tienda) y un texto editable,
// y abre el menú de compartir del celular para elegir Instagram (publicación o historia).
// Instagram no deja que otra app publique sola: la persona termina la publicación en Instagram.
// El texto no viaja con la imagen (Instagram lo ignora), así que se copia para pegarlo.
//
// abrirInsta({ nombre, precio, porKg, detalle, cat, foto, fotoHD, tienda, link, money })
//   foto: imagen chica (data URL) · fotoHD: () => Promise<data URL | ''> con la foto grande, si hay.

const FMT = { post: { w: 1080, h: 1350, t: 'Publicación' }, story: { w: 1080, h: 1920, t: 'Historia' } };

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function tag(s) { const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, ''); return t ? '#' + t.toLowerCase() : ''; }
function cssVar(n, def) { try { const v = getComputedStyle(document.body).getPropertyValue(n).trim(); return v || def; } catch (e) { return def; } }
function loadImg(src) { return new Promise((res) => { if (!src) { res(null); return; } const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

export function textoInsta(o) {
  const l = ['✨ ' + o.nombre];
  if (o.precio > 0) l.push('💲 ' + o.money(o.precio) + (o.porKg ? ' el kilo' : ''));
  if (o.detalle) l.push(o.detalle);
  l.push('', '📲 Pedilo por WhatsApp o desde nuestro catálogo (link en la bio)');
  if (o.link) l.push(o.link);
  const tags = [tag(o.tienda), tag(o.cat)].filter(Boolean);
  if (tags.length) l.push('', tags.join(' '));
  return l.join('\n');
}

// Corta el texto en renglones que entren en `w` (como mucho `max` renglones, con … al final).
function lineas(ctx, txt, w, max) {
  const words = String(txt).split(/\s+/).filter(Boolean), out = [];
  let cur = '';
  words.forEach((wd) => { const t = cur ? cur + ' ' + wd : wd; if (ctx.measureText(t).width <= w || !cur) cur = t; else { out.push(cur); cur = wd; } });
  if (cur) out.push(cur);
  if (out.length > max) { out.length = max; let s = out[max - 1]; while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); out[max - 1] = s + '…'; }
  return out;
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
// Dibuja la foto llenando el recuadro (recorta lo que sobra, sin deformar).
function cover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

export function dibujar(cv, o, img, fmt) {
  const F = FMT[fmt], W = F.w, H = F.h, ctx = cv.getContext('2d');
  cv.width = W; cv.height = H;
  const C = o.color || '#1D3FAF', T = o.tinta || '#FFFFFF', FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = C; ctx.fillRect(0, 0, W, H);
  const precio = o.precio > 0 ? o.money(o.precio) + (o.porKg ? ' /kg' : '') : '';
  if (fmt === 'post') {
    const fh = 1010;
    if (img) cover(ctx, img, 0, 0, W, fh);
    else { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, 0, W, fh); ctx.fillStyle = T; ctx.font = '800 96px ' + FONT; ctx.textAlign = 'center'; lineas(ctx, o.nombre, W - 160, 4).forEach((s, i, a) => ctx.fillText(s, W / 2, fh / 2 - (a.length - 1) * 55 + i * 110)); ctx.textAlign = 'left'; }
    if (precio) { // cartel del precio sobre la foto
      ctx.font = '900 76px ' + FONT; const pw = ctx.measureText(precio).width + 64;
      ctx.fillStyle = '#FFFFFF'; rrect(ctx, W - pw - 40, fh - 136, pw, 104, 52); ctx.fill();
      ctx.fillStyle = '#111111'; ctx.fillText(precio, W - pw - 8, fh - 58);
    }
    ctx.fillStyle = T; ctx.font = '800 58px ' + FONT;
    const nl = lineas(ctx, o.nombre, W - 96, 2); nl.forEach((s, i) => ctx.fillText(s, 48, fh + 86 + i * 66));
    ctx.globalAlpha = 0.85; ctx.font = '600 36px ' + FONT;
    const pie = [o.tienda, o.detalle].filter(Boolean).join(' · ');
    ctx.fillText(lineas(ctx, pie, W - 96, 1)[0] || '', 48, fh + 86 + nl.length * 66 + 30);
    ctx.font = '700 36px ' + FONT; ctx.fillText('📲 Pedilo por WhatsApp · link en la bio', 48, H - 48); ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = T; ctx.textAlign = 'center';
    ctx.font = '800 50px ' + FONT; ctx.fillText(lineas(ctx, o.tienda || '', W - 120, 1)[0] || '', W / 2, 190);
    const s = 900, x = (W - s) / 2, y = 290;
    ctx.save(); rrect(ctx, x, y, s, s, 48); ctx.clip();
    if (img) cover(ctx, img, x, y, s, s); else { ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x, y, s, s); }
    ctx.restore();
    ctx.fillStyle = T; ctx.font = '800 72px ' + FONT;
    const nl = lineas(ctx, o.nombre, W - 140, 2); nl.forEach((t, i) => ctx.fillText(t, W / 2, y + s + 120 + i * 84));
    let yy = y + s + 120 + nl.length * 84 + 20;
    if (precio) {
      ctx.font = '900 92px ' + FONT; const pw = ctx.measureText(precio).width + 80;
      ctx.fillStyle = '#FFFFFF'; rrect(ctx, (W - pw) / 2, yy, pw, 130, 65); ctx.fill();
      ctx.fillStyle = '#111111'; ctx.fillText(precio, W / 2, yy + 98); yy += 130;
    }
    if (o.detalle) { ctx.fillStyle = T; ctx.globalAlpha = 0.85; ctx.font = '600 40px ' + FONT; ctx.fillText(lineas(ctx, o.detalle, W - 140, 1)[0], W / 2, yy + 80); ctx.globalAlpha = 1; }
    ctx.fillStyle = T; ctx.globalAlpha = 0.8; ctx.font = '700 40px ' + FONT; ctx.fillText('Pedilo por WhatsApp 👇', W / 2, H - 230); ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

export function abrirInsta(o) {
  o.color = o.color || cssVar('--btn', '#1D3FAF'); o.tinta = o.tinta || '#FFFFFF';
  const old = document.getElementById('igdlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'igdlg';
  d.style.cssText = 'position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
  d.innerHTML = '<div style="background:var(--bg,#fff);color:var(--ink,#111);width:100%;max-width:520px;max-height:94vh;overflow:auto;border-radius:22px 22px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:19px">📸 Publicar en Instagram</b><button type="button" class="x" data-igx="1" style="font-size:15px;font-weight:700;text-decoration:underline">Cerrar</button></div>' +
    '<div class="row" style="gap:8px;margin:12px 0 10px" role="tablist">' + Object.keys(FMT).map((k) => '<button type="button" class="go' + (k === 'post' ? '' : ' alt') + '" data-igf="' + k + '" style="margin:0;flex:1">' + FMT[k].t + '</button>').join('') + '</div>' +
    '<div style="display:flex;justify-content:center;background:var(--card,#f4f3f0);border-radius:16px;padding:10px"><canvas id="igcv" style="width:auto;max-width:100%;max-height:46vh;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.18)"></canvas></div>' +
    '<label for="igtx" style="margin-top:14px">Texto de la publicación</label><textarea id="igtx" rows="7" style="width:100%;font:inherit;font-size:15px;line-height:1.4"></textarea>' +
    '<button type="button" class="go" id="igsh" style="margin-top:12px">Compartir en Instagram</button>' +
    '<div class="row" style="gap:8px"><button type="button" class="go alt" id="igdl" style="margin:0">Descargar imagen</button><button type="button" class="go alt" id="igcp" style="margin:0">Copiar texto</button></div>' +
    '<div class="k" id="igmsg" style="margin-top:10px;font-weight:600"></div>' +
    '<div class="k" style="margin-top:6px">Al tocar <b>Compartir</b> el texto se copia solo. En Instagram elegí Publicación o Historia, y en el texto mantené apretado y tocá <b>Pegar</b>.</div></div>';
  document.body.appendChild(d);
  const $ = (id) => d.querySelector('#' + id), cv = $('igcv'), tx = $('igtx'), msg = (t) => { $('igmsg').textContent = t; };
  tx.value = textoInsta(o);
  let fmt = 'post', img = null, file = null, gen = 0;
  const nombreArch = (o.nombre || 'producto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'producto';
  // El archivo se prepara antes del toque: el menú de compartir solo se abre si se llama enseguida al tocar.
  const render = () => {
    dibujar(cv, o, img, fmt); file = null; const g = ++gen;
    try { cv.toBlob((b) => { if (g === gen && b) file = new File([b], nombreArch + (fmt === 'story' ? '-historia' : '') + '.jpg', { type: 'image/jpeg' }); }, 'image/jpeg', 0.92); } catch (e) { file = null; }
  };
  const copiar = () => { const t = tx.value; try { if (navigator.clipboard) return navigator.clipboard.writeText(t).then(() => true, () => false); } catch (e) { /* sin portapapeles */ } return Promise.resolve(false); };
  const descargar = () => {
    try { const a = document.createElement('a'); a.href = cv.toDataURL('image/jpeg', 0.92); a.download = nombreArch + '.jpg'; document.body.appendChild(a); a.click(); a.remove(); return true; } catch (e) { return false; }
  };
  const cerrar = () => { d.remove(); };
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-igx]')) { cerrar(); return; }
    const f = e.target.closest('[data-igf]');
    if (f) { fmt = f.dataset.igf; d.querySelectorAll('[data-igf]').forEach((b) => b.classList.toggle('alt', b !== f)); render(); }
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
  loadImg(o.foto).then((i) => { if (i) { img = i; render(); } return o.fotoHD ? o.fotoHD() : ''; })
    .then((hd) => (hd ? loadImg(hd) : null)).then((i) => { if (i && document.body.contains(d)) { img = i; render(); } }).catch(() => {});
  return d;
}
