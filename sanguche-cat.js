// Armador de sánguches del catálogo (estilo McDonald's): tamaño → pan → fiambres → quesos → verduras → aderezos,
// con el dibujo del sánguche que se arma capa por capa y el precio en vivo.
// tarjetaArmador(cfg, money) → html del botón de entrada
// abrirArmador({ cfg, info: (id) => ({ img }), money, onAdd: (sw, res) => void })

import { calcular, desde } from './sanguche.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Color / forma de cada capa según el ingrediente.
function capa(paso, nombre) {
  const t = sinAc(nombre);
  if (paso === 'fia') {
    if (/crudo|serrano/.test(t)) return { c: '#b8323c', h: 11, k: 'f' };
    if (/salam|cantimpalo|longaniza|sopressata/.test(t)) return { c: '#9e2a2b', h: 12, k: 'sal' };
    if (/mortadela/.test(t)) return { c: '#f3b2aa', h: 12, k: 'f' };
    if (/bondiola|lomito|pastrami|matambre/.test(t)) return { c: '#a8473f', h: 11, k: 'f' };
    if (/pollo|pavita|pechuga/.test(t)) return { c: '#efd5b3', h: 12, k: 'f' };
    if (/panceta|bacon/.test(t)) return { c: '#c4544e', h: 8, k: 'f' };
    return { c: '#f0a3a3', h: 12, k: 'f' };   // jamón cocido
  }
  if (paso === 'que') return { c: /azul|roquefort/.test(t) ? '#e9e4cf' : /cheddar/.test(t) ? '#f39a1c' : '#f7cf4a', h: 9, k: 'q' };
  if (paso === 'ver') {
    if (/tomate/.test(t)) return { c: '#e2463b', h: 9, k: 'tom' };
    if (/lechuga|rucula/.test(t)) return { c: '#7cc35a', h: 10, k: 'lec' };
    if (/cebolla/.test(t)) return { c: '#ecdaf0', h: 7, k: 'f' };
    if (/palta/.test(t)) return { c: '#a7c957', h: 10, k: 'f' };
    if (/huevo/.test(t)) return { c: '#fff7e0', h: 10, k: 'hue' };
    if (/morron|pimiento/.test(t)) return { c: '#d93a2b', h: 7, k: 'f' };
    if (/pepino|pickle/.test(t)) return { c: '#9cbf5f', h: 7, k: 'f' };
    if (/aceituna/.test(t)) return { c: '#4f5b2e', h: 7, k: 'f' };
    return { c: '#8cc66a', h: 8, k: 'f' };
  }
  if (paso === 'ade') {
    if (/ketchup/.test(t)) return { c: '#d6332b', h: 5, k: 'sal2' };
    if (/mostaza/.test(t)) return { c: '#f2c230', h: 5, k: 'sal2' };
    if (/golf/.test(t)) return { c: '#f29f75', h: 5, k: 'sal2' };
    if (/chimichurri|pesto/.test(t)) return { c: '#6a8f3c', h: 5, k: 'sal2' };
    if (/barbacoa|bbq/.test(t)) return { c: '#7a2e1d', h: 5, k: 'sal2' };
    return { c: '#fff4cf', h: 5, k: 'sal2' };   // mayonesa
  }
  return { c: '#d9a066', h: 10, k: 'f' };
}
const EMO = { pan: '🥖', fia: '🥓', que: '🧀', ver: '🥬', ade: '🥫' };
function emo(paso, n) {
  const t = sinAc(n);
  if (/tomate/.test(t)) return '🍅'; if (/palta/.test(t)) return '🥑'; if (/huevo/.test(t)) return '🥚'; if (/cebolla/.test(t)) return '🧅';
  if (/pollo|pavita/.test(t)) return '🍗'; if (/miga|lactal/.test(t)) return '🍞'; if (/pebete|hamburguesa/.test(t)) return '🍔';
  if (/salam/.test(t)) return '🍖'; if (/aceituna/.test(t)) return '🫒'; if (/pepino|pickle/.test(t)) return '🥒';
  return EMO[paso] || '🥪';
}

let cssOk = false;
function css() {
  if (cssOk) return; cssOk = true;
  const s = document.createElement('style');
  s.textContent = [
    '.swc{max-width:var(--mw,1100px);margin:14px auto 6px;padding:0 14px}',
    '.swc button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:14px;width:100%;padding:14px 16px;border-radius:22px;background:linear-gradient(120deg,var(--ap,#c62828),color-mix(in srgb,var(--ap,#c62828) 70%,#000));color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.14);overflow:hidden;position:relative}',
    '.swc .ic{flex:none;width:76px;height:64px;position:relative}.swc .tx{flex:1;min-width:0}.swc b{display:block;font-size:19px;line-height:1.15;font-weight:900}.swc small{display:block;font-size:13px;opacity:.9;margin-top:3px;line-height:1.3}',
    '.swc .go{flex:none;background:#fff;color:var(--ap,#c62828);font-weight:900;font-size:14px;padding:10px 14px;border-radius:99px}',
    '@media(max-width:420px){.swc .go{display:none}}',
    '.swa{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;font-family:inherit}',
    '.swp{background:#fff;color:#111;width:100%;max-width:980px;height:min(94vh,860px);border-radius:24px 24px 0 0;display:flex;flex-direction:column;overflow:hidden;animation:swup .32s cubic-bezier(.2,.8,.25,1)}',
    '@keyframes swup{from{transform:translateY(40px);opacity:0}}',
    '@media(min-width:900px){.swa{align-items:center}.swp{border-radius:24px;display:grid;grid-template-columns:400px 1fr;grid-template-rows:auto 1fr auto}.swp .swh{grid-column:1/3}.swp .swv{grid-row:2/4;height:auto;border-right:1px solid #eee;justify-content:center;padding-bottom:40px}.swp .swst{transform-origin:50% 60%}.swp .swr{grid-column:2;grid-row:2;min-height:0}.swp .swf{grid-column:2}}',
    '.swh{display:flex;align-items:center;gap:10px;padding:14px 16px 10px}.swh b{flex:1;font-size:19px;font-weight:900}.swh button{all:unset;cursor:pointer;width:38px;height:38px;border-radius:50%;background:#f2f2f2;display:flex;align-items:center;justify-content:center;font-size:22px}',
    '.swv{position:relative;height:200px;flex:none;background:radial-gradient(120% 90% at 50% 100%,color-mix(in srgb,var(--ap,#c62828) 18%,#fff),#fff 70%);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:8px 0 16px;overflow:hidden}',
    '.swst{display:flex;flex-direction:column-reverse;align-items:center;width:210px;transform-origin:50% 100%}',
    '.swl{width:190px;margin-top:-3px;border-radius:40%/60%;box-shadow:inset 0 -2px 0 rgba(0,0,0,.12);position:relative}',
    '.swl.nw{animation:swdrop .5s cubic-bezier(.3,1.4,.5,1) both}@keyframes swdrop{0%{transform:translateY(-90px) scale(.9);opacity:0}100%{transform:none;opacity:1}}',
    '.swl.bb{width:184px;height:26px;border-radius:10px 10px 46% 46%/10px 10px 90% 90%;background:linear-gradient(#e6a75f,#c98543)}',
    '.swl.bt{width:190px;height:56px;border-radius:50% 50% 14px 14px/90% 90% 14px 14px;background:radial-gradient(circle at 30% 30%,#f3c27f,#d48a42 70%);margin-top:-4px}',
    '.swl.bt:after{content:"";position:absolute;inset:10px 26px 22px;background:radial-gradient(#fff6dc 1.6px,transparent 2px) 0 0/22px 14px;opacity:.9;border-radius:50%}',
    '.swl.mb,.swl.mt{width:176px;height:16px;border-radius:6px;background:#fbf3e3;box-shadow:inset 0 0 0 4px #e3b77d}.swl.mt{height:18px;margin-top:-2px}',
    '.swl.q{width:198px;border-radius:3px}.swl.q:after{content:"";position:absolute;right:16px;bottom:-9px;border:9px solid transparent;border-top-color:inherit;border-top-color:var(--qc)}',
    '.swl.sal{background-image:radial-gradient(#f3d1c9 1.5px,transparent 2px)!important;background-size:12px 6px!important}',
    '.swl.lec{width:204px;border-radius:50%/40%;clip-path:polygon(0 40%,6% 0,12% 45%,18% 5%,24% 50%,30% 0,36% 45%,42% 5%,48% 50%,54% 0,60% 45%,66% 5%,72% 50%,78% 0,84% 45%,90% 5%,96% 50%,100% 20%,100% 100%,0 100%)}',
    '.swl.tom{width:170px;background:radial-gradient(circle,#ff8b7e 20%,#e2463b 60%)!important}.swl.hue{background:radial-gradient(circle,#f7c531 25%,#fff7e0 30%)!important}',
    '.swl.sal2{width:176px;border-radius:50%;opacity:.95}',
    '.swv .pr{position:absolute;right:14px;top:10px;background:#111;color:#fff;font-weight:900;font-size:15px;padding:6px 11px;border-radius:99px}',
    '.swv .sz{position:absolute;left:14px;top:12px;font-size:12.5px;font-weight:700;color:#555}',
    '.swr{display:flex;flex-direction:column;min-height:0;flex:1}',
    '.swtb{display:flex;gap:6px;overflow-x:auto;padding:10px 14px 4px;scrollbar-width:none;flex:none}.swtb::-webkit-scrollbar{display:none}',
    '.swtb button{all:unset;cursor:pointer;flex:none;padding:8px 12px;border-radius:99px;background:#f1f1f1;font-size:13px;font-weight:800;color:#444;white-space:nowrap}.swtb button.on{background:#111;color:#fff}.swtb button.ok:before{content:"✓ ";color:#2f9e44}.swtb button.on.ok:before{color:#8ff0a4}',
    '.swbd{flex:1;overflow:auto;padding:8px 14px 14px}',
    '.swbd h4{margin:6px 2px 2px;font-size:20px;font-weight:900}.swbd .k2{margin:0 2px 10px;font-size:13.5px;color:#666}',
    '.swg{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}@media(min-width:560px){.swg{grid-template-columns:repeat(3,1fr)}}',
    '.swo{all:unset;box-sizing:border-box;cursor:pointer;position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border-radius:18px;background:#f6f6f6;border:2px solid transparent;text-align:center;font-size:14px;font-weight:700;line-height:1.2;transition:transform .12s,border-color .12s,background .12s}',
    '.swo:active{transform:scale(.96)}.swo .im{width:64px;height:64px;border-radius:14px;background:#fff center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:34px}',
    '.swo.on{border-color:var(--ap,#c62828);background:color-mix(in srgb,var(--ap,#c62828) 8%,#fff)}.swo.on:after{content:"✓";position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;background:var(--ap,#c62828);color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center}',
    '.swo.off{opacity:.45}.swo .swz{all:unset;display:block;font-size:12px;font-weight:600;color:#666}.swo.tz{padding:16px 10px}.swo.tz b{font-size:18px}.swo.tz .swz{font-size:13px}.swo.tz .swpp{all:unset;display:block;font-size:17px;font-weight:900;color:var(--ap,#c62828)}',
    '.swm{min-height:20px;margin:10px 2px 0;font-size:13.5px;font-weight:700;color:#b3261e}',
    '.swf{display:flex;gap:8px;padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid #eee;background:#fff;flex:none}',
    '.swf button{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;padding:15px 16px;border-radius:16px;font-weight:900;font-size:15.5px}.swf .bk{background:#f1f1f1;color:#111}.swf .nx{flex:1;background:var(--ap,#c62828);color:#fff}',
    '@media (prefers-reduced-motion:reduce){.swl.nw,.swp{animation:none}}',
  ].join('');
  document.head.appendChild(s);
}

// Dibujito del sánguche (para el carrito).
export const IMG_SW = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="16" fill="#fff4e0"/><path d="M12 38c0-14 12-22 28-22s28 8 28 22z" fill="#e0a05a"/><g fill="#fff6dc"><circle cx="30" cy="26" r="1.6"/><circle cx="42" cy="22" r="1.6"/><circle cx="52" cy="28" r="1.6"/><circle cx="38" cy="31" r="1.6"/></g><path d="M9 41q31 9 62 0v4q-31 8-62 0z" fill="#7cc35a"/><rect x="11" y="45" width="58" height="5" rx="2" fill="#f7cf4a"/><rect x="10" y="50" width="60" height="7" rx="3.5" fill="#f0a3a3"/><path d="M13 57h54v4c0 4-3 6-7 6H20c-4 0-7-2-7-6z" fill="#c98543"/></svg>');
export function tarjetaArmador(cfg, money) {
  css();
  return '<div class="swc"><button type="button" data-swopen="1"><span class="ic">' + mini() + '</span><span class="tx"><b>🥪 ' + esc(cfg.t) + '</b><small>Elegí el pan, los fiambres, el queso y los aderezos a tu gusto · desde ' + money(desde(cfg)) + (cfg.modo === 'pan' ? ' (precio a confirmar)' : '') + '</small></span><span class="go">Armar</span></button></div>';
}
function mini() {
  const l = (w, h, c, r, mt) => '<i style="display:block;margin:' + (mt || -2) + 'px auto 0;width:' + w + 'px;height:' + h + 'px;background:' + c + ';border-radius:' + r + '"></i>';
  return '<span style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center">' + l(64, 18, 'radial-gradient(circle at 30% 30%,#f3c27f,#d48a42 70%)', '50% 50% 6px 6px/90% 90% 6px 6px', 0) + l(70, 6, '#7cc35a', '40%') + l(68, 5, '#f7cf4a', '2px') + l(70, 7, '#f0a3a3', '40%') + l(66, 10, 'linear-gradient(#e6a75f,#c98543)', '4px 4px 40% 40%') + '</span>';
}

export function abrirArmador(o) {
  css();
  const C = o.cfg, money = o.money, info = o.info || (() => ({}));
  const PM = C.modo === 'pan';   // precio según el pan, el resto a confirmar por WhatsApp
  const pasos = (PM ? [] : [{ id: '__t', t: 'Tamaño' }]).concat(C.pasos);
  const st = { t: PM ? 0 : (C.tam.length === 1 ? 0 : null), s: {}, i: 0 };
  let dibujadas = {};
  const old = document.getElementById('swa'); if (old) old.remove();
  const d = document.createElement('div'); d.className = 'swa'; d.id = 'swa';
  d.innerHTML = '<div class="swp" role="dialog" aria-label="' + esc(C.t) + '"><div class="swh"><b>🥪 ' + esc(C.t) + '</b><button type="button" data-swx="1" aria-label="Cerrar">×</button></div>' +
    '<div class="swv"><span class="sz" id="swsz"></span><span class="pr" id="swpr"></span><div class="swst" id="swst"></div></div>' +
    '<div class="swr"><div class="swtb" id="swtb"></div><div class="swbd" id="swbd"></div></div><div class="swf"><button type="button" class="bk" id="swbk">Atrás</button><button type="button" class="nx" id="swnx"></button></div></div>';
  document.body.appendChild(d);
  const $ = (id) => d.querySelector('#' + id);
  const prevOv = document.body.style.overflow; document.body.style.overflow = 'hidden';
  const cerrar = () => { d.remove(); document.body.style.overflow = prevOv; };

  const sel = (pid) => st.s[pid] || (st.s[pid] = []);
  const res = () => (st.t == null ? null : calcular(C, { t: st.t, s: st.s }));
  const panSel = () => PM ? ((C.pasos.find((p) => p.id === 'pan') || { it: [] }).it.find((x) => sel('pan').indexOf(x.i) >= 0)) : null;
  const listo = (p) => (p.id === '__t' ? st.t != null : sel(p.id).length >= (p.min || 0));
  const cuenta = () => C.pasos.reduce((a, p) => a + (p.cu ? sel(p.id).length : 0), 0);

  function pila() {
    const L = [], pan = (C.pasos.find((p) => p.id === 'pan') || { it: [] }).it.find((x) => sel('pan').indexOf(x.i) >= 0), miga = pan && /miga|lactal/.test(sinAc(pan.n));
    L.push({ k: 'bb', cls: miga ? 'mb' : 'bb' });
    C.pasos.forEach((p) => { if (p.id === 'pan') return; sel(p.id).forEach((id) => { const x = p.it.find((y) => y.i === id); if (x) L.push({ k: p.id + ':' + id, p: p.id, n: x.n }); }); });
    L.push({ k: 'bt', cls: miga ? 'mt' : 'bt' });
    const nuevo = {};
    $('swst').innerHTML = L.map((l) => {
      const nw = !dibujadas[l.k] && l.k !== 'bb' ? ' nw' : ''; nuevo[l.k] = 1;
      if (l.cls) return '<i class="swl ' + l.cls + (l.k === 'bt' && nw ? ' nw' : '') + '"></i>';
      const c = capa(l.p, l.n);
      return '<i class="swl ' + c.k + nw + '" style="height:' + c.h + 'px;background:' + c.c + ';--qc:' + c.c + '"></i>';
    }).join('');
    dibujadas = nuevo;
    const n = L.length, dk = window.matchMedia && matchMedia('(min-width:900px)').matches, sc = (n > 9 ? Math.max(0.6, 9 / n) : 1) * (dk ? (n > 12 ? 1.2 : 1.5) : 1); $('swst').style.transform = 'scale(' + sc + ')';
  }
  function precio() {
    const r = res(), tm = !PM && st.t != null ? C.tam[st.t] : null;
    if (PM) { const pn = panSel(); $('swpr').textContent = pn ? money(pn.p) : 'desde ' + money(desde(C)); $('swsz').textContent = pn ? 'Precio a confirmar por WhatsApp' : ''; return; }
    $('swpr').textContent = tm ? money(r && r.ok ? r.u : tm.p) : 'desde ' + money(desde(C));
    $('swsz').textContent = tm ? tm.n + ' · ' + Math.min(cuenta(), tm.inc) + ' de ' + tm.inc + ' incluidos' + (cuenta() > tm.inc ? ' · ' + (cuenta() - tm.inc) + ' extra' : '') : '';
  }
  function tabs() {
    $('swtb').innerHTML = pasos.map((p, i) => '<button type="button" data-swtab="' + i + '" class="' + (i === st.i ? 'on' : '') + (i !== st.i && listo(p) && (p.id === '__t' || sel(p.id).length) ? ' ok' : '') + '">' + esc(p.t) + '</button>').join('');
    const b = $('swtb').querySelector('.on'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function cuerpo(msg) {
    const p = pasos[st.i]; let h = '';
    if (p.id === '__t') {
      h = '<h4>¿De qué tamaño?</h4><div class="k2">Cada tamaño incluye una cantidad de fiambres y quesos.' + (C.ex ? ' Si querés más, cada uno suma ' + money(C.ex) + '.' : '') + '</div><div class="swg">' +
        C.tam.map((t, i) => '<button type="button" class="swo tz' + (st.t === i ? ' on' : '') + '" data-swt="' + i + '"><b>' + esc(t.n) + '</b><span class="swz">' + (t.inc ? 'Incluye ' + t.inc + ' fiambre' + (t.inc > 1 ? 's' : '') + ' o queso' + (t.inc > 1 ? 's' : '') : 'Solo el pan y lo que elijas') + '</span><span class="swpp">' + money(t.p) + '</span></button>').join('') + '</div>';
    } else {
      const s = sel(p.id), tm = !PM && st.t != null ? C.tam[st.t] : null, c = cuenta();
      let sub = p.max === 1 ? 'Elegí ' + (p.min ? 'uno' : 'uno (opcional)') : 'Elegí hasta ' + p.max + (p.min ? '' : ' (opcional)');
      if (p.cu && tm) sub += ' · llevás ' + c + ' de ' + tm.inc + ' incluidos' + (C.ex ? ', cada extra +' + money(C.ex) : '');
      h = '<h4>' + esc(p.t) + '</h4><div class="k2">' + sub + '</div><div class="swg">' + p.it.map((x) => {
        const on = s.indexOf(x.i) >= 0, full = !on && s.length >= p.max && p.max > 1, im = (info(x.i) || {}).img;
        const extra = PM && p.id === 'pan' && x.p ? '<span class="swz">' + money(x.p) + '</span>' : p.cu && tm && !on && C.ex && c >= tm.inc ? '<span class="swz">+' + money(C.ex) + '</span>' : '';
        return '<button type="button" class="swo' + (on ? ' on' : '') + (full ? ' off' : '') + '" data-swi="' + esc(x.i) + '"><span class="im"' + (im ? ' style="background-image:url(\'' + esc(im) + '\')"' : '') + '>' + (im ? '' : emo(p.id, x.n)) + '</span>' + esc(x.n) + extra + '</button>';
      }).join('') + '</div>';
    }
    h += '<div class="swm" id="swmsg">' + esc(msg || '') + '</div>';
    $('swbd').innerHTML = h; $('swbd').scrollTop = 0;
  }
  function pie() {
    const ult = st.i === pasos.length - 1, r = res();
    $('swbk').style.display = st.i ? '' : 'none';
    $('swnx').textContent = ult ? 'Agregar al pedido' + (r && r.ok ? ' · ' + money(r.u) + (r.conf ? '*' : '') : '') : 'Siguiente';
    const ya = $('swconf'); if (ya) ya.remove();
    if (PM && ult) { const n = document.createElement('div'); n.id = 'swconf'; n.className = 'k2'; n.style.cssText = 'margin:10px 2px 0'; n.textContent = '* Es el precio según el pan. El negocio te confirma el precio final por WhatsApp según lo que elegiste.'; $('swbd').appendChild(n); }
  }
  function todo(msg) { tabs(); cuerpo(msg); pila(); precio(); pie(); }
  function ir(i) {
    // no se puede saltear el tamaño ni el pan
    for (let k = 0; k < i; k++) if (!listo(pasos[k])) { st.i = k; todo(k === 0 ? 'Elegí un tamaño para seguir.' : 'Elegí ' + (pasos[k].max === 1 ? 'uno' : 'al menos ' + pasos[k].min) + ' en ' + pasos[k].t + ' para seguir.'); return; }
    st.i = Math.max(0, Math.min(pasos.length - 1, i)); todo();
  }

  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-swx]')) { cerrar(); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.swtab != null) { ir(+b.dataset.swtab); return; }
    if (b.dataset.swt != null) { st.t = +b.dataset.swt; todo(); setTimeout(() => { if (st.i === 0) ir(1); }, 260); return; }
    if (b.dataset.swi != null) {
      const p = pasos[st.i], s = sel(p.id), id = b.dataset.swi, k = s.indexOf(id);
      if (k >= 0) s.splice(k, 1);
      else if (p.max === 1) { s.length = 0; s.push(id); }
      else if (s.length >= p.max) { const m = $('swmsg'); if (m) m.textContent = 'Podés elegir hasta ' + p.max + '. Sacá uno para cambiarlo.'; return; }
      else s.push(id);
      todo();
      if (p.max === 1 && k < 0 && st.i < pasos.length - 1) setTimeout(() => ir(st.i + 1), 320);
      return;
    }
    if (b.id === 'swbk') { ir(st.i - 1); return; }
    if (b.id === 'swnx') {
      const p = pasos[st.i];
      if (!listo(p)) { todo(p.id === '__t' ? 'Elegí un tamaño para seguir.' : 'Elegí ' + (p.max === 1 ? 'uno' : 'al menos ' + p.min) + ' para seguir.'); return; }
      if (st.i < pasos.length - 1) { ir(st.i + 1); return; }
      for (let k = 0; k < pasos.length; k++) if (!listo(pasos[k])) { ir(k); return; }
      const r = res(); if (!r || !r.ok) { todo(r && r.error ? 'No se pudo: ' + r.error : 'Revisá lo elegido.'); return; }
      const sw = { t: st.t, s: {} }; C.pasos.forEach((q) => { if (sel(q.id).length) sw.s[q.id] = sel(q.id).slice(); });
      cerrar(); if (o.onAdd) o.onAdd(sw, r);
    }
  });
  document.addEventListener('keydown', function k(e) { if (!document.body.contains(d)) { document.removeEventListener('keydown', k); return; } if (e.key === 'Escape') cerrar(); });
  todo();
  return d;
}
