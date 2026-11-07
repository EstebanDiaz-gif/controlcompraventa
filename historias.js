// Historias del catálogo: las arma el negocio desde la app y duran 24 horas, como en Instagram o los estados de WhatsApp.
// Se guardan en stores/{sid}/public/historias = { list: [cuadro...], at }  (el catálogo lo lee con 1 lectura).
//
// cuadro: { id, g: 'Ofertas' (nombre de la historia), k: 'p' producto | 's' servicio | 't' texto, ref: id del producto/servicio,
//           n, p, pa (nombre y precios al publicar, por si el producto ya no está), tit, sub, em, est (estilo), cta: 'ver'|'wa'|'no',
//           at (publicado), exp (vence) }
// Los vencidos quedan 7 días en la lista de la app para volver a publicarlos; el catálogo muestra solo los vigentes.
//
// El diseño es HTML/CSS (no imagen): se ve nítido, pesa poco y el precio sale siempre actualizado.
// Los tamaños van en cqw (ancho del cuadro), así la vista previa chiquita y la historia grande se ven iguales.

export const DUR = 24 * 3600 * 1000;
const GUARDA = 7 * 24 * 3600 * 1000, MAX = 60;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const vigentes = (list, now) => (list || []).filter((f) => f && f.exp > now);
// Agrupa por nombre de historia: primero la que tiene el cuadro más nuevo; dentro, en el orden en que se publicaron.
export function grupos(list, now) {
  const m = {};
  vigentes(list, now).forEach((f) => { const k = String(f.g || 'Historias').trim() || 'Historias'; (m[k] = m[k] || []).push(f); });
  return Object.keys(m).map((t) => ({ t, f: m[t].sort((a, b) => a.at - b.at) }))
    .sort((a, b) => b.f[b.f.length - 1].at - a.f[a.f.length - 1].at);
}

// ---------- estilos ----------
// rubro: 'almacen' | 'kiosco' | 'ropa' | 'servicios' | 'general'
export function rubroDe(biz, tp) {
  if (biz === 'servicios') return 'servicios';
  if (biz === 'almacen') return tp === 'kiosco' ? 'kiosco' : 'almacen';
  if (/ropa|calzado/.test(tp || '')) return 'ropa';
  return 'general';
}
const DECO = {
  almacen: ['🥖', '🧀', '🥛', '🍪', '🧉', '🍝'], kiosco: ['🍬', '🍫', '🍭', '🥤', '🍟', '🧃'], ropa: ['👟', '👕', '🧢', '👖', '✨', '🛍️'],
  servicios: ['✂️', '💅', '🌸', '✨', '💆', '🪷'], general: ['✨', '⭐', '🛍️', '🎁', '💥', '🔥']
};
// Paletas por estilo (y retoques por rubro). L = diseño, f = letra del título.
const BASE = {
  oferta: { n: 'Oferta', L: 'oferta', bg: '#E3262F', bg2: '#FF6A3D', ink: '#fff', ac: '#FFE14D', ac2: '#111', f: 'Anton' },
  cartel: { n: 'Cartel', L: 'cartel', bg: '#F6D776', bg2: '#EFC85B', ink: '#151515', ac: '#D62828', ac2: '#151515', f: 'Permanent Marker' },
  pizarra: { n: 'Pizarra', L: 'pizarra', bg: '#1F3B2D', bg2: '#16291F', ink: '#F4F1E8', ac: '#FFE36E', ac2: '#8B5A2B', f: 'Caveat' },
  moderno: { n: 'Moderno', L: 'moderno', bg: '#0E4D45', bg2: '#0B2B27', ink: '#fff', ac: '#C8EE6E', ac2: '#0E2E29', f: 'Bricolage Grotesque' },
  pastel: { n: 'Pastel', L: 'pastel', bg: '#FDE2E4', bg2: '#E2ECE9', ink: '#2B2D42', ac: '#FF7AA2', ac2: '#fff', f: 'Bricolage Grotesque' },
  marca: { n: 'Tu marca', L: 'marca', bg: '#1D3FAF', bg2: '#132B78', ink: '#fff', ac: '#FFE14D', ac2: '#111', f: 'Bricolage Grotesque' },
  minimal: { n: 'Minimal', L: 'minimal', bg: '#F6F1EA', bg2: '#EFE7DC', ink: '#1E1B18', ac: '#B5542C', ac2: '#1E1B18', f: 'Fraunces' },
  fiesta: { n: 'Fiesta', L: 'fiesta', bg: '#7B2FF7', bg2: '#F107A3', ink: '#fff', ac: '#FFE14D', ac2: '#111', f: 'Anton' },
  neon: { n: 'Neón', L: 'neon', bg: '#0B0B14', bg2: '#151530', ink: '#fff', ac: '#FF3DB5', ac2: '#3DF2FF', f: 'Bricolage Grotesque' },
  elegante: { n: 'Elegante', L: 'elegante', bg: '#111111', bg2: '#1C1A17', ink: '#F5EFE6', ac: '#D4B483', ac2: '#F5EFE6', f: 'Fraunces' }
};
const ORDEN = {
  almacen: ['oferta', 'cartel', 'pizarra', 'moderno', 'pastel', 'marca', 'minimal', 'fiesta', 'neon', 'elegante'],
  kiosco: ['fiesta', 'neon', 'oferta', 'pastel', 'cartel', 'moderno', 'marca', 'pizarra', 'minimal', 'elegante'],
  ropa: ['moderno', 'minimal', 'elegante', 'neon', 'oferta', 'pastel', 'fiesta', 'marca', 'cartel', 'pizarra'],
  servicios: ['elegante', 'minimal', 'pastel', 'moderno', 'neon', 'marca', 'fiesta', 'oferta', 'pizarra', 'cartel'],
  general: ['moderno', 'oferta', 'minimal', 'pastel', 'neon', 'elegante', 'fiesta', 'marca', 'cartel', 'pizarra']
};
const RETOQUE = {
  ropa: { moderno: { bg: '#111', bg2: '#000', ac: '#fff', ac2: '#111' }, pastel: { bg: '#E9DFFF', bg2: '#FFE3EC', ac: '#7C4DFF' }, oferta: { bg: '#111', bg2: '#2A2A2A', ac: '#FF3B30', ac2: '#fff' } },
  servicios: { pastel: { bg: '#F3E8FF', bg2: '#FFE4EF', ac: '#B05CC9' }, minimal: { bg: '#FBF1EE', bg2: '#F6E3DD', ac: '#B76E79' }, moderno: { bg: '#2B2B2B', bg2: '#111', ac: '#D4B483', ac2: '#111' } },
  kiosco: { pastel: { bg: '#FFF1B8', bg2: '#FFD6E8', ac: '#FF5C8A' }, moderno: { bg: '#4A1F8C', bg2: '#2A1252', ac: '#FFD23F', ac2: '#2A1252' } },
  almacen: { pastel: { bg: '#E3F5D8', bg2: '#FFF3C4', ac: '#2E7D32' } }
};
export function estilos(rubro) {
  const r = ORDEN[rubro] ? rubro : 'general';
  return ORDEN[r].map((id) => Object.assign({ id, deco: DECO[r] }, BASE[id], (RETOQUE[r] || {})[id] || {}));
}
export function estilo(id, rubro) { const l = estilos(rubro); return l.find((s) => s.id === id) || l[0]; }

// ---------- dibujo de un cuadro ----------
// o: { img, n, p, pa, sub2 (ej. duración), money, tienda, color (marca), cover (foto que llena), rubro }
export function frameHtml(f, o) {
  const S = estilo(f.est, o.rubro);
  const bg = S.id === 'marca' && /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : S.bg;
  const esTexto = f.k === 't', p = esTexto ? 0 : (o.p || 0), pa = esTexto ? 0 : (o.pa > p ? o.pa : 0);
  const pct = pa ? Math.round((pa - p) / pa * 100) : 0;
  const kick = esTexto ? '' : (f.tit || ''), titulo = esTexto ? (f.tit || '') : (o.n || f.n || ''), sub = f.sub || (esTexto ? '' : (o.sub2 || ''));
  const deco = (S.deco || []).slice(0, 6).map((e, i) => '<i style="--i:' + i + '">' + e + '</i>').join('');
  const tl = titulo.length, ts = esTexto ? (tl > 60 ? 8.4 : tl > 34 ? 10 : tl > 18 ? 12.5 : 15) : (tl > 40 ? 6.6 : tl > 22 ? 7.8 : 9.4);
  return '<div class="hx hx-' + S.L + (o.img ? ' hx-ci' : ' hx-si') + (o.cover ? ' hx-cv' : '') + (esTexto ? ' hx-tx' : '') + '" style="--bg:' + bg + ';--bg2:' + S.bg2 + ';--ink:' + S.ink + ';--ac:' + S.ac + ';--ac2:' + S.ac2 + ';--ff:\'' + S.f + '\';--ts:' + ts + 'cqw">' +
    '<div class="hx-dc">' + deco + '</div>' +
    (S.L === 'marca' || S.L === 'elegante' ? '<div class="hx-tn">' + esc(o.tienda || '') + '</div>' : '') +
    '<div class="hx-in">' +
    (kick ? '<div class="hx-k">' + esc(kick) + '</div>' : '') +
    (o.img ? '<div class="hx-im"><img alt="" src="' + esc(o.img) + '">' + (pct ? '<span class="hx-o">-' + pct + '%</span>' : '') + '</div>' : (esTexto && f.em ? '<div class="hx-em">' + esc(f.em) + '</div>' : '')) +
    '<div class="hx-t">' + esc(titulo) + '</div>' +
    (sub ? '<div class="hx-s">' + esc(sub) + '</div>' : '') +
    (p ? '<div class="hx-p">' + (pct && !o.img ? '<span class="hx-o">-' + pct + '%</span>' : '') + '<b>' + esc(o.money(p)) + (o.kg ? '<small>/kg</small>' : '') + '</b>' + (pa ? '<s>' + esc(o.money(pa)) + '</s>' : '') + '</div>' : '') +
    '</div></div>';
}

let FL = false;
export function fuentes() {
  if (FL) return; FL = true;
  try {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Caveat:wght@700&family=Fraunces:ital,opsz,wght@0,9..144,600..800;1,9..144,600&family=Permanent+Marker&display=swap';
    document.head.appendChild(l);
  } catch (e) { /* sin fuentes: se ve con la del sistema */ }
}
let CSSOK = false;
export function estilosCss() {
  if (CSSOK) return; CSSOK = true; fuentes();
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
}

const CSS = `
.hx{container-type:inline-size;position:relative;width:100%;aspect-ratio:9/16;overflow:hidden;border-radius:5%/2.8%;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,sans-serif;box-sizing:border-box;user-select:none;-webkit-user-select:none}
.hx *{box-sizing:border-box}
.hx-dc{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.hx-dc i{position:absolute;font-style:normal;font-size:11cqw;opacity:.16;line-height:1}
.hx-dc i:nth-child(1){left:6%;top:6%;transform:rotate(-14deg)}.hx-dc i:nth-child(2){right:7%;top:14%;transform:rotate(12deg)}
.hx-dc i:nth-child(3){left:10%;top:44%;transform:rotate(8deg)}.hx-dc i:nth-child(4){right:9%;top:56%;transform:rotate(-10deg)}
.hx-dc i:nth-child(5){left:14%;bottom:7%;transform:rotate(16deg)}.hx-dc i:nth-child(6){right:12%;bottom:12%;transform:rotate(-6deg)}
.hx-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3.2cqw;padding:12cqw 8cqw;text-align:center;z-index:1}
.hx-k{font-weight:900;font-size:5.4cqw;letter-spacing:.06em;text-transform:uppercase;padding:2cqw 4.5cqw;border-radius:99px;background:var(--ac);color:var(--ac2);max-width:100%}
.hx-im{position:relative;width:78cqw;aspect-ratio:1/1;border-radius:6cqw;background:#fff;overflow:visible;flex:none;box-shadow:0 4cqw 10cqw rgba(0,0,0,.28)}
.hx-im img{width:100%;height:100%;object-fit:contain;padding:5cqw;display:block;border-radius:inherit}
.hx-cv .hx-im img{object-fit:cover;padding:0}
.hx-o{position:absolute;right:3cqw;top:3cqw;background:var(--ac);color:var(--ac2);font-weight:900;font-size:5.6cqw;border-radius:99px;padding:1.6cqw 3.4cqw;z-index:2}
.hx-p .hx-o{position:static;display:inline-block;margin-right:2cqw;vertical-align:middle}
.hx-em{font-size:30cqw;line-height:1.05;filter:drop-shadow(0 3cqw 5cqw rgba(0,0,0,.25))}
.hx-t{font-family:var(--ff),system-ui,sans-serif;font-weight:800;font-size:var(--ts);line-height:1.04;letter-spacing:-.01em;overflow-wrap:break-word;hyphens:auto;max-width:100%}
.hx-s{font-size:5cqw;font-weight:600;opacity:.9;line-height:1.25;max-width:100%}
.hx-p b{font-family:var(--ff),system-ui,sans-serif;font-size:13cqw;font-weight:900;line-height:1;letter-spacing:-.02em;color:var(--ac)}
.hx-p b small{font-size:5.5cqw;opacity:.85;margin-left:1cqw}
.hx-p s{display:block;font-size:5.2cqw;opacity:.7;margin-top:1cqw;font-weight:700}
.hx-tn{position:absolute;left:0;right:0;top:7cqw;text-align:center;font-weight:800;font-size:4.4cqw;letter-spacing:.18em;text-transform:uppercase;z-index:2;opacity:.9}
/* OFERTA: rojo intenso, letras de cartel y el precio en un sticker */
.hx-oferta{background:radial-gradient(circle at 30% 20%,var(--bg2),var(--bg) 60%)}
.hx-oferta .hx-dc i{opacity:.22}
.hx-oferta .hx-k{transform:rotate(-4deg);font-size:6.4cqw;padding:2.4cqw 6cqw;border-radius:2cqw;box-shadow:0 2cqw 0 rgba(0,0,0,.2)}
.hx-oferta .hx-t{text-transform:uppercase;font-weight:400;letter-spacing:.01em}
.hx-oferta .hx-p b{color:var(--ac2);background:var(--ac);display:inline-block;padding:3cqw 6cqw;border-radius:4cqw;transform:rotate(-3deg);box-shadow:0 2.5cqw 0 rgba(0,0,0,.22)}
.hx-oferta .hx-p s{color:var(--ink)}
.hx-oferta.hx-tx .hx-t,.hx-fiesta.hx-tx .hx-t{font-size:calc(var(--ts) * .92)}
/* CARTEL: papel amarillo con fibra, letra de fibrón y foto tipo polaroid */
.hx-cartel{background:repeating-linear-gradient(0deg,transparent 0 9cqw,rgba(0,0,0,.05) 9cqw 9.4cqw),linear-gradient(180deg,var(--bg),var(--bg2))}
.hx-cartel::after{content:"";position:absolute;inset:3.5cqw;border:1cqw dashed rgba(0,0,0,.25);border-radius:3cqw;pointer-events:none}
.hx-cartel .hx-k{background:none;color:var(--ac);font-family:'Permanent Marker',cursive;font-size:8cqw;text-transform:none;letter-spacing:0;transform:rotate(-5deg)}
.hx-cartel .hx-t{font-weight:400}
.hx-cartel .hx-im{border-radius:1.5cqw;padding:3cqw 3cqw 9cqw;transform:rotate(-3deg);width:72cqw}
.hx-cartel .hx-im img{border-radius:1cqw;background:#fff;height:auto;aspect-ratio:1/1}
.hx-cartel .hx-p b{color:var(--ac);font-family:'Permanent Marker',cursive;font-weight:400;font-size:15cqw;text-decoration:underline wavy;text-underline-offset:2.5cqw;text-decoration-thickness:.8cqw}
.hx-cartel .hx-dc i{opacity:.2}
/* PIZARRA: verde de pizarrón con marco de madera y tiza */
.hx-pizarra{background:radial-gradient(ellipse at 50% 30%,#2A4A3A,var(--bg) 55%,var(--bg2))}
.hx-pizarra::after{content:"";position:absolute;inset:0;border:4.5cqw solid var(--ac2);border-radius:inherit;box-shadow:inset 0 0 0 .8cqw rgba(0,0,0,.35);pointer-events:none;z-index:3}
.hx-pizarra .hx-dc i{filter:grayscale(1) brightness(3);opacity:.14}
.hx-pizarra .hx-t{font-weight:700;font-size:calc(var(--ts) * 1.18);text-shadow:0 0 1cqw rgba(255,255,255,.35)}
.hx-pizarra .hx-k{background:none;color:var(--ac);font-family:'Caveat',cursive;font-size:9cqw;text-transform:none;letter-spacing:0;border-bottom:.7cqw solid var(--ac);border-radius:0;padding:0 1cqw}
.hx-pizarra .hx-p b{font-family:'Caveat',cursive;font-size:17cqw;font-weight:700}
.hx-pizarra .hx-im{border-radius:3cqw;width:70cqw}
/* MODERNO: la foto llena todo con un degradé; sin foto, degradé con un emoji grande */
.hx-moderno{background:linear-gradient(160deg,var(--bg),var(--bg2))}
.hx-moderno.hx-ci .hx-in{justify-content:flex-end;align-items:flex-start;text-align:left;padding-bottom:12cqw}
.hx-moderno.hx-ci .hx-im{position:absolute;inset:0;width:auto;aspect-ratio:auto;border-radius:0;box-shadow:none;background:#fff;z-index:-1;overflow:hidden}
.hx-moderno.hx-ci .hx-im img{object-fit:cover;padding:0;border-radius:0}
.hx-moderno.hx-ci:not(.hx-cv) .hx-im img{object-fit:contain;padding:10cqw 10cqw 62cqw}
.hx-moderno.hx-ci:not(.hx-cv) .hx-im::after{background:linear-gradient(180deg,rgba(0,0,0,0) 50%,rgba(0,0,0,.85) 72%)}
.hx-moderno.hx-ci .hx-im::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.82) 100%)}
.hx-moderno.hx-ci .hx-o{left:5cqw;right:auto;top:6cqw}
.hx-moderno.hx-ci{color:#fff}
.hx-moderno.hx-ci .hx-k{order:-1}
.hx-moderno .hx-p b{background:var(--ac);color:var(--ac2);padding:2.4cqw 5cqw;border-radius:99px;display:inline-block;font-size:10cqw}
.hx-moderno .hx-p s{color:inherit}
.hx-moderno.hx-si .hx-dc i{opacity:.1;font-size:16cqw}
/* PASTEL: degradé suave, burbujas y tarjeta blanca */
.hx-pastel{background:linear-gradient(165deg,var(--bg),var(--bg2))}
.hx-pastel::before,.hx-pastel::after{content:"";position:absolute;border-radius:50%;background:rgba(255,255,255,.55)}
.hx-pastel::before{width:60cqw;height:60cqw;left:-20cqw;top:-14cqw}.hx-pastel::after{width:46cqw;height:46cqw;right:-16cqw;bottom:-10cqw}
.hx-pastel .hx-dc i{opacity:.28}
.hx-pastel .hx-k{background:#fff;color:var(--ac);box-shadow:0 1.5cqw 4cqw rgba(0,0,0,.08)}
.hx-pastel .hx-im{border-radius:9cqw;box-shadow:0 4cqw 10cqw rgba(0,0,0,.12)}
.hx-pastel .hx-p b{color:var(--ac)}
/* TU MARCA: el color del negocio, foto en círculo */
.hx-marca{background:linear-gradient(170deg,var(--bg),color-mix(in srgb,var(--bg) 70%,#000))}
.hx-marca .hx-im{border-radius:50%;width:70cqw;border:2.5cqw solid rgba(255,255,255,.9)}
.hx-marca .hx-dc i{opacity:.12}
/* MINIMAL: crema, letra con serifa y mucho aire */
.hx-minimal{background:var(--bg)}
.hx-minimal .hx-dc{display:none}
.hx-minimal .hx-in{gap:4cqw}
.hx-minimal .hx-k{background:none;color:var(--ac);border:.5cqw solid var(--ac);font-size:4.4cqw;letter-spacing:.2em}
.hx-minimal .hx-t{font-weight:600}
.hx-minimal.hx-tx .hx-t{font-style:italic}
.hx-minimal .hx-im{border-radius:3cqw;box-shadow:0 6cqw 14cqw rgba(60,40,20,.18)}
.hx-minimal .hx-p b{font-weight:700;font-size:11cqw}
.hx-minimal .hx-s{font-family:'Fraunces',serif;font-style:italic;font-weight:600}
/* FIESTA: degradé fuerte, papelitos y sticker */
.hx-fiesta{background:linear-gradient(150deg,var(--bg),var(--bg2))}
.hx-fiesta .hx-dc i{opacity:.35;font-size:9cqw}
.hx-fiesta::before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.55) .7cqw,transparent .8cqw),radial-gradient(circle,rgba(255,225,77,.7) .6cqw,transparent .7cqw);background-size:13cqw 13cqw,17cqw 17cqw;background-position:0 0,6cqw 8cqw;opacity:.7}
.hx-fiesta .hx-k{transform:rotate(-6deg);font-size:6cqw}
.hx-fiesta .hx-t{text-transform:uppercase;font-weight:400;text-shadow:0 1.2cqw 0 rgba(0,0,0,.25)}
.hx-fiesta .hx-im{transform:rotate(3deg);border:2cqw solid #fff}
/* NEÓN: negro con letras que brillan */
.hx-neon{background:radial-gradient(circle at 50% 35%,var(--bg2),var(--bg) 70%)}
.hx-neon .hx-dc i{filter:grayscale(1) brightness(4);opacity:.08}
.hx-neon .hx-t{color:#fff;text-shadow:0 0 2cqw var(--ac),0 0 6cqw var(--ac),0 0 12cqw var(--ac)}
.hx-neon .hx-k{background:none;color:var(--ac2);border:.6cqw solid var(--ac2);box-shadow:0 0 3cqw var(--ac2),inset 0 0 3cqw var(--ac2);text-shadow:0 0 2cqw var(--ac2)}
.hx-neon .hx-im{border-radius:50%;width:66cqw;box-shadow:0 0 0 1cqw var(--ac),0 0 8cqw var(--ac)}
.hx-neon .hx-p b{color:var(--ac2);text-shadow:0 0 3cqw var(--ac2)}
.hx-neon .hx-o{background:var(--ac2);color:#000}
/* ELEGANTE: negro y dorado, marco fino y serifa en cursiva */
.hx-elegante{background:linear-gradient(170deg,var(--bg2),var(--bg))}
.hx-elegante::after{content:"";position:absolute;inset:4cqw;border:.4cqw solid var(--ac);pointer-events:none}
.hx-elegante .hx-dc{display:none}
.hx-elegante .hx-tn{color:var(--ac);top:9cqw}
.hx-elegante .hx-k{background:none;color:var(--ac);font-size:4.2cqw;letter-spacing:.3em;padding:0}
.hx-elegante .hx-t{font-style:italic;font-weight:600}
.hx-elegante .hx-im{border-radius:50% 50% 3cqw 3cqw;width:66cqw;aspect-ratio:4/5}
.hx-elegante:not(.hx-cv) .hx-im img{object-fit:contain;padding:6cqw}
.hx-elegante .hx-im img{object-fit:cover;padding:0}
.hx-elegante .hx-p b{color:var(--ac);font-weight:600;font-family:'Fraunces',serif}
`;

// ---------- pantalla de la app: lista y editor ----------
// X: { leer() → Promise<list>, guardar(list) → Promise, items() → [{k:'p'|'s', id, n, p, pa, img, cat, kg}], rubro, tienda, color,
//      money, hayServicios, prefill: {k, id} }
export function abrirHistorias(X) {
  estilosCss();
  const old = document.getElementById('hsdlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'hsdlg';
  d.style.cssText = 'position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
  d.innerHTML = '<div id="hsin" style="background:var(--bg,#fff);color:var(--ink,#111);width:100%;max-width:560px;max-height:94vh;overflow:auto;border-radius:22px 22px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))"><div class="k">Cargando…</div></div>';
  document.body.appendChild(d);
  const $ = (id) => d.querySelector('#' + id);
  let L = [], E = null, Qp = '', busy = false;
  const EST = estilos(X.rubro), now = () => Date.now();
  const item = (k, id) => X.items().find((x) => x.k === k && x.id === id);
  const sugeridos = () => {
    const usados = grupos(L, now()).map((g) => g.t);
    const base = X.rubro === 'servicios' ? ['Turnos libres', 'Promos', 'Novedades', 'Trabajos'] : X.rubro === 'ropa' ? ['Novedades', 'Ofertas', 'Ingresos', 'Promos'] : ['Ofertas', 'Novedades', 'Promos', 'Hoy'];
    return usados.concat(base.filter((b) => usados.indexOf(b) < 0)).slice(0, 6);
  };
  const vence = (f) => { const ms = f.exp - now(); if (ms <= 0) return 'Vencida'; const h = Math.floor(ms / 3600000); return h >= 1 ? 'Vence en ' + h + ' h' : 'Vence en ' + Math.max(1, Math.round(ms / 60000)) + ' min'; };
  const datos = (f) => { const it = f.k === 't' ? null : item(f.k, f.ref); return { img: it ? it.img : '', n: it ? it.n : f.n, p: it ? it.p : f.p, pa: it ? it.pa : f.pa, kg: it && it.kg, sub2: it && it.sub2, money: X.money, tienda: X.tienda, color: X.color, cover: X.rubro !== 'almacen' && X.rubro !== 'kiosco', rubro: X.rubro }; };
  const guardar = (nueva) => {
    const t = now(); nueva = nueva.filter((f) => f.exp > t - GUARDA).sort((a, b) => b.at - a.at).slice(0, MAX);
    busy = true; return X.guardar(nueva).then(() => { L = nueva; busy = false; }, (e) => { busy = false; throw e; });
  };

  function lista() {
    E = null; const t = now(), act = vigentes(L, t), venc = L.filter((f) => f.exp <= t);
    const G = grupos(L, t);
    let h = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:19px">📲 Historias del catálogo</b><button type="button" class="x" data-hs="x" style="font-weight:700;text-decoration:underline">Cerrar</button></div>' +
      '<div class="k" style="margin-top:4px">Aparecen arriba de tu catálogo en círculos, como en Instagram, y <b>duran 24 horas</b>. Elegí qué mostrar, escribí lo que quieras y elegí un diseño.</div>' +
      '<button type="button" class="go" data-hs="new" style="margin-top:12px">+ Nueva historia</button>';
    if (!act.length) h += '<div class="k" style="margin-top:12px;text-align:center">No tenés historias activas. Tus clientes no ven círculos hasta que subas una.</div>';
    G.forEach((g) => {
      h += '<div style="margin-top:16px"><b>' + esc(g.t) + '</b> <span class="k">· ' + g.f.length + (g.f.length === 1 ? ' imagen' : ' imágenes') + '</span><div style="display:flex;gap:10px;overflow-x:auto;padding:8px 0 4px">' +
        g.f.map((f) => '<div style="flex:none;width:104px;text-align:center"><div style="width:104px">' + frameHtml(f, datos(f)) + '</div><div class="k" style="margin-top:4px;font-size:12px">' + vence(f) + '</div>' +
          '<div style="display:flex;gap:4px;margin-top:4px"><button type="button" class="x" data-hs="dup" data-id="' + f.id + '" style="flex:1;font-size:12.5px;font-weight:700;text-decoration:underline">Editar</button><button type="button" class="x" data-hs="del" data-id="' + f.id + '" style="flex:1;font-size:12.5px;font-weight:700;text-decoration:underline;color:#b3261e">Borrar</button></div></div>').join('') + '</div></div>';
    });
    if (venc.length) {
      h += '<div style="margin-top:18px;padding-top:12px;border-top:1px solid var(--line,#eee)"><b>Vencidas</b> <span class="k">· podés volver a publicarlas por 24 horas más</span><div style="display:flex;gap:10px;overflow-x:auto;padding:8px 0 4px">' +
        venc.slice(0, 12).map((f) => '<div style="flex:none;width:90px;text-align:center;opacity:.85"><div style="width:90px">' + frameHtml(f, datos(f)) + '</div><button type="button" class="x" data-hs="ren" data-id="' + f.id + '" style="font-size:12.5px;font-weight:700;text-decoration:underline;margin-top:4px">↻ Publicar de nuevo</button></div>').join('') + '</div></div>';
    }
    $('hsin').innerHTML = h;
  }

  function nuevo(pre) {
    const it = pre && pre.id ? item(pre.k, pre.id) : null;
    E = pre && pre.f ? Object.assign({}, pre.f) :
      { id: 'h' + now().toString(36) + Math.random().toString(36).slice(2, 6), k: it ? it.k : (X.items().length ? 'p' : 't'), ref: it ? it.id : '', tit: '', sub: '', em: '🔥', est: EST[0].id, cta: 'ver', g: '' };
    if (!E.g) E.g = E.k === 't' ? (sugeridos()[0] || 'Novedades') : (it && it.pa > it.p ? 'Ofertas' : (sugeridos()[0] || 'Novedades'));
    Qp = ''; editor();
  }

  const seg = (attr, opts, sel) => '<div style="display:flex;gap:6px;background:var(--card,#f4f3f0);padding:5px;border-radius:14px;margin-top:8px">' + opts.map((o) => '<button type="button" data-' + attr + '="' + o[0] + '" style="flex:1;border:0;border-radius:10px;padding:10px 6px;font:inherit;font-weight:700;font-size:14.5px;cursor:pointer;' + (o[0] === sel ? 'background:var(--btn,#1D3FAF);color:var(--btnink,#fff)' : 'background:transparent;color:var(--ink,#111)') + '">' + o[1] + '</button>').join('') + '</div>';
  const EMO = ['🔥', '🎉', '⭐', '🆕', '💥', '🛵', '🎁', '⏰', '❤️', '✨', ''];

  function editor() {
    const tipos = [['p', '🛍️ Producto'], ['t', '✍️ Texto']]; if (X.hayServicios) tipos.splice(1, 0, ['s', '✂️ Servicio']);
    const it = E.k !== 't' && E.ref ? item(E.k, E.ref) : null;
    let h = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:19px">Nueva historia</b><button type="button" class="x" data-hs="list" style="font-weight:700;text-decoration:underline">← Volver</button></div>' +
      '<label style="margin-top:12px">¿Qué querés mostrar?</label>' + seg('hsk', tipos, E.k);
    if (E.k !== 't') {
      if (it) h += '<div style="display:flex;gap:10px;align-items:center;margin-top:10px;background:var(--card,#f4f3f0);border-radius:14px;padding:8px 10px">' + (it.img ? '<img alt="" src="' + esc(it.img) + '" style="width:44px;height:44px;border-radius:10px;object-fit:cover;background:#fff">' : '') + '<div style="flex:1;min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(it.n) + '</b><span class="k">' + (it.p ? esc(X.money(it.p)) : '') + (it.pa > it.p ? ' · antes ' + esc(X.money(it.pa)) : '') + '</span></div><button type="button" class="x" data-hs="chg" style="font-weight:700;text-decoration:underline">Cambiar</button></div>';
      else h += '<input id="hsq" type="search" autocomplete="off" placeholder="Buscá el ' + (E.k === 's' ? 'servicio' : 'producto') + '…" value="' + esc(Qp) + '" style="margin-top:10px"><div id="hsr" style="max-height:240px;overflow:auto;margin-top:6px"></div>';
      h += '<label>Frase arriba (opcional)</label><input id="hst" maxlength="40" placeholder="Ej: ¡Llegó!, Oferta del día, Solo hoy" value="' + esc(E.tit) + '">' +
        '<label>Texto abajo (opcional)</label><input id="hss" maxlength="70" placeholder="' + (E.k === 's' ? 'Ej: Quedan turnos para el sábado' : 'Ej: Hasta agotar stock') + '" value="' + esc(E.sub) + '">';
    } else {
      h += '<label>Título</label><textarea id="hst" rows="2" maxlength="80" placeholder="Ej: Hoy 20% OFF comprando desde la web" style="width:100%;font:inherit;font-size:16px">' + esc(E.tit) + '</textarea>' +
        '<label>Texto chico (opcional)</label><input id="hss" maxlength="90" placeholder="Ej: Hacé tu pedido por el catálogo y te lo llevamos" value="' + esc(E.sub) + '">' +
        '<label>Dibujo</label><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' + EMO.map((e) => '<button type="button" data-hse="' + e + '" style="width:44px;height:44px;border-radius:12px;border:2px solid ' + (E.em === e ? 'var(--btn,#1D3FAF)' : 'transparent') + ';background:var(--card,#f4f3f0);font-size:22px;cursor:pointer">' + (e || '—') + '</button>').join('') + '</div>' +
        '<label>Botón para tus clientes</label><select id="hsc"><option value="ver"' + (E.cta === 'ver' ? ' selected' : '') + '>' + (X.rubro === 'servicios' ? 'Reservar turno / ver servicios' : 'Ver productos') + '</option><option value="wa"' + (E.cta === 'wa' ? ' selected' : '') + '>Escribir por WhatsApp</option><option value="no"' + (E.cta === 'no' ? ' selected' : '') + '>Sin botón</option></select>';
    }
    h += '<label>Diseño</label><div id="hsst" style="display:flex;gap:8px;overflow-x:auto;padding:6px 2px 8px"></div>' +
      '<div style="display:flex;justify-content:center;margin-top:4px"><div id="hspv" style="width:min(62vw,260px)"></div></div>' +
      '<label>Nombre de la historia</label><div class="k" style="margin:0 0 6px">Es el nombre que se ve debajo del círculo. Las que tengan el mismo nombre van juntas.</div>' +
      '<input id="hsg" maxlength="18" value="' + esc(E.g) + '"><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + sugeridos().map((s) => '<button type="button" data-hsg="' + esc(s) + '" style="border:0;border-radius:99px;padding:7px 12px;background:var(--card,#f4f3f0);font:inherit;font-weight:700;font-size:13.5px;cursor:pointer">' + esc(s) + '</button>').join('') + '</div>' +
      '<button type="button" class="go" data-hs="pub" style="margin-top:16px">Publicar por 24 horas</button><div class="k" id="hsm" style="margin-top:8px;font-weight:600"></div>';
    $('hsin').innerHTML = h;
    if ($('hsq')) { resultados(); $('hsq').oninput = (e) => { Qp = e.target.value; resultados(); }; }
    vista();
  }
  function leerCampos() { if (!E) return; const t = $('hst'), s = $('hss'), c = $('hsc'), g = $('hsg'); if (t) E.tit = t.value.trim(); if (s) E.sub = s.value.trim(); if (c) E.cta = c.value; if (g) E.g = g.value.trim(); }
  function resultados() {
    const q = Qp.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const l = X.items().filter((x) => x.k === E.k && (!q || (x.n + ' ' + (x.cat || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(q) >= 0))
      .sort((a, b) => (b.pa > b.p) - (a.pa > a.p) || a.n.localeCompare(b.n)).slice(0, 30);
    $('hsr').innerHTML = l.length ? l.map((x) => '<button type="button" data-hsp="' + esc(x.id) + '" style="display:flex;gap:10px;align-items:center;width:100%;text-align:left;border:0;background:none;padding:7px 4px;border-bottom:1px solid var(--line,#eee);font:inherit;cursor:pointer;color:inherit">' +
      (x.img ? '<img alt="" src="' + esc(x.img) + '" style="width:40px;height:40px;border-radius:9px;object-fit:cover;background:#fff;flex:none">' : '<span style="width:40px;height:40px;border-radius:9px;background:var(--card,#f4f3f0);flex:none"></span>') +
      '<span style="flex:1;min-width:0"><b style="display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(x.n) + '</b><span class="k" style="font-size:12.5px">' + (x.p ? esc(X.money(x.p)) : '') + (x.pa > x.p ? ' · <b style="color:#b3261e">oferta</b>' : '') + '</span></span></button>').join('')
      : '<div class="k" style="padding:8px 4px">No encontré ' + (E.k === 's' ? 'servicios' : 'productos') + ' con ese nombre.</div>';
  }
  function vista() {
    const st = $('hsst'), pv = $('hspv'); if (!st || !pv) return;
    const dd = datos(Object.assign({}, E, { n: '', p: 0 }));
    if (E.k !== 't' && !E.ref) { dd.n = 'Elegí un ' + (E.k === 's' ? 'servicio' : 'producto'); dd.p = 0; }
    st.innerHTML = EST.map((s) => '<button type="button" data-hss="' + s.id + '" style="flex:none;width:76px;border:0;background:none;padding:0;cursor:pointer;font:inherit;color:inherit"><div style="width:76px;border-radius:12px;outline:3px solid ' + (E.est === s.id ? 'var(--btn,#1D3FAF)' : 'transparent') + ';outline-offset:2px">' + frameHtml(Object.assign({}, E, { est: s.id }), dd) + '</div><div style="font-size:12px;font-weight:700;margin-top:5px">' + esc(s.n) + '</div></button>').join('');
    pv.innerHTML = frameHtml(E, dd);
  }
  d.addEventListener('input', (e) => { if (E && e.target && /^(hst|hss|hsg)$/.test(e.target.id)) { leerCampos(); if (e.target.id !== 'hsg') vista(); } });
  d.addEventListener('change', (e) => { if (E && e.target && e.target.id === 'hsc') leerCampos(); });
  d.addEventListener('click', (e) => {
    if (e.target === d) { d.remove(); return; }
    const t = e.target.closest('[data-hs],[data-hsk],[data-hsp],[data-hss],[data-hse],[data-hsg]'); if (!t || busy) return;
    const a = t.dataset;
    if (a.hsk) { leerCampos(); E.k = a.hsk; E.ref = ''; Qp = ''; editor(); return; }
    if (a.hsp) { leerCampos(); E.ref = a.hsp; const it = item(E.k, E.ref); if (it && it.pa > it.p && !$('hsg').value) E.g = 'Ofertas'; editor(); return; }
    if (a.hss) { E.est = a.hss; vista(); return; }
    if (a.hse !== undefined) { leerCampos(); E.em = a.hse; editor(); return; }
    if (a.hsg) { $('hsg').value = a.hsg; E.g = a.hsg; return; }
    const id = a.id;
    if (a.hs === 'x') { d.remove(); return; }
    if (a.hs === 'list') { lista(); return; }
    if (a.hs === 'new') { nuevo(); return; }
    if (a.hs === 'chg') { leerCampos(); E.ref = ''; editor(); return; }
    if (a.hs === 'del') { if (!confirm('¿Borrar esta imagen de la historia? Tus clientes dejan de verla.')) return; guardar(L.filter((f) => f.id !== id)).then(lista, X.fail); return; }
    if (a.hs === 'ren') { const f = L.find((x) => x.id === id); if (!f) return; const t0 = now(); guardar(L.map((x) => x.id === id ? Object.assign({}, x, { at: t0, exp: t0 + DUR }) : x)).then(lista, X.fail); return; }
    if (a.hs === 'dup') { const f = L.find((x) => x.id === id); if (f) { E = Object.assign({}, f); editor(); } return; }
    if (a.hs === 'pub') {
      leerCampos(); const m = (s) => { $('hsm').textContent = s; };
      if (E.k !== 't' && !E.ref) { m('Elegí un ' + (E.k === 's' ? 'servicio' : 'producto') + '.'); return; }
      if (E.k === 't' && !E.tit) { m('Escribí el título de la historia.'); $('hst').focus(); return; }
      if (!E.g) { m('Poné un nombre a la historia (ej: Ofertas).'); $('hsg').focus(); return; }
      const it = E.k !== 't' ? item(E.k, E.ref) : null, t0 = now();
      const f = { id: E.id, g: E.g.slice(0, 18), k: E.k, ref: E.ref || '', n: it ? it.n : '', p: it ? it.p || 0 : 0, pa: it ? it.pa || 0 : 0, tit: E.tit.slice(0, 80), sub: E.sub.slice(0, 90), em: E.k === 't' ? E.em : '', est: E.est, cta: E.k === 't' ? E.cta : '', at: t0, exp: t0 + DUR };
      // Editar una que sigue activa no le estira el tiempo; una vencida vuelve a durar 24 h.
      const prev = L.find((x) => x.id === E.id); if (prev && prev.exp > t0) { f.at = prev.at; f.exp = prev.exp; }
      m('Publicando…');
      guardar(L.filter((x) => x.id !== f.id).concat([f])).then(() => { lista(); const b = d.querySelector('#hsin'); if (b) b.insertAdjacentHTML('afterbegin', '<div class="bn" style="margin-bottom:10px">✓ Publicada. Tus clientes la ven arriba del catálogo durante 24 horas.</div>'); }, (e) => { m(''); X.fail(e); });
    }
  });
  X.leer().then((l) => { L = (l || []).filter((f) => f && f.id); if (X.prefill) nuevo(X.prefill); else lista(); }, (e) => { $('hsin').innerHTML = '<div class="k">No pude cargar tus historias. Revisá la conexión.</div>'; X.fail && X.fail(e); });
  return d;
}
