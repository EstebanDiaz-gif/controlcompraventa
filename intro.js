// Animación graciosa de ~3 segundos al entrar, según el tema de temporada activo.
// Se ve una vez por sesión (al abrir la app o el catálogo) y no bloquea nada: se puede tocar la pantalla mientras corre.
import { TEMAS } from './temas.js';

const DUR = 3000;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[Math.floor(Math.random() * l.length)];

// ---------- piezas ----------
// lluvia: caen desde arriba girando.
function lluvia(l, n, sz) {
  let h = '';
  for (let i = 0; i < n; i++) h += '<i class="pk-f" style="left:' + rnd(2, 94).toFixed(1) + '%;font-size:' + Math.round(rnd(sz * .7, sz * 1.2)) + 'px;animation-delay:' + rnd(0, .9).toFixed(2) + 's;animation-duration:' + rnd(1.5, 2.2).toFixed(2) + 's;--r:' + Math.round(rnd(-260, 260)) + 'deg">' + pick(l) + '</i>';
  return h;
}
// suben: desde abajo, balanceándose (globos, corazones).
function suben(l, n, sz) {
  let h = '';
  for (let i = 0; i < n; i++) h += '<i class="pk-u" style="left:' + rnd(2, 92).toFixed(1) + '%;font-size:' + Math.round(rnd(sz * .7, sz * 1.25)) + 'px;animation-delay:' + rnd(0, .8).toFixed(2) + 's;animation-duration:' + rnd(1.8, 2.4).toFixed(2) + 's">' + pick(l) + '</i>';
  return h;
}
// cruza: atraviesa la pantalla de derecha a izquierda (los animales miran a la izquierda).
// modo: 'salta' | 'vuela' | 'rapido'
function cruza(e, top, sz, modo, delay) {
  return '<i class="pk-x pk-' + (modo || 'salta') + '" style="top:' + top + '%;font-size:' + sz + 'px;animation-delay:' + (delay || 0) + 's"><b>' + e + '</b></i>';
}
// pop: un personaje grande aparece en el centro con rebote.
const pop = (e, mov) => '<i class="pk-p' + (mov ? ' pk-' + mov : '') + '"><b>' + e + '</b></i>';
// choque: dos que vienen de los costados y se chocan en el medio.
const choque = (a, b, chispa) => '<i class="pk-ca">' + a + '</i><i class="pk-cb">' + b + '</i><i class="pk-cc">' + (chispa || '💥') + '</i>';
// fuegos: estallidos de partículas.
function fuegos(n) {
  let h = '';
  for (let k = 0; k < n; k++) {
    const x = rnd(15, 85), y = rnd(14, 46), d = rnd(.1, 1.2), c = pick(['✨', '⭐', '🎉', '💛', '✦']);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2, r = rnd(70, 120);
      h += '<i class="pk-b" style="left:' + x + '%;top:' + y + '%;animation-delay:' + d.toFixed(2) + 's;--dx:' + Math.round(Math.cos(a) * r) + 'px;--dy:' + Math.round(Math.sin(a) * r) + 'px">' + c + '</i>';
    }
  }
  return h;
}
const anio = () => { const d = new Date(); return d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear(); }; // el año que empieza
const patria = (txt, extra) => () => ({ t: txt, h: lluvia(['🇦🇷', '⭐', '🩵', '🤍'], 16, 30) + (extra || '') + pop('☀️', 'gira') });

// ---------- recetas por tema ----------
const RECETAS = {
  reyes: () => ({ t: '¡Llegaron los Reyes! 👑', h: lluvia(['⭐', '✨'], 10, 24) + cruza('🐪', 64, 64, 'salta', 0) + cruza('🐪', 64, 64, 'salta', .35) + cruza('🐪', 64, 64, 'salta', .7) }),
  san_valentin: () => ({ t: 'Flechazo garantizado 💘', h: suben(['❤️', '💖', '💕', '💗'], 22, 34) + cruza('💘', 34, 58, 'rapido', .3) }),
  pascuas: () => ({ t: '¿Quién se comió los huevos? 🍫', h: lluvia(['🥚', '🍫', '🐣'], 14, 32) + cruza('🐰', 66, 70, 'salta', .1) }),
  mayo: patria('¡Locro y pastelitos para todos!', lluvia(['🥟', '🍲'], 6, 34)),
  bandera: patria('¡Arriba la celeste y blanca!', cruza('🇦🇷', 66, 66, 'flamea', .2)),
  julio: patria('¡Viva la Patria! (y las empanadas)', lluvia(['🥟'], 8, 34)),
  padre: () => ({ t: '¡Grande, viejo! 🧉', h: lluvia(['👔', '🧉', '🔥', '🥩'], 14, 32) + pop('🧔', 'guina') }),
  amigo: () => ({ t: '¡Chocala, amigo!', h: choque('🤜', '🤛', '💥') + lluvia(['🎉', '✨'], 10, 26) }),
  nino: () => ({ t: '¡A jugar! 🎈', h: suben(['🎈', '🎈', '🎈', '🪁', '⭐'], 20, 40) + cruza('🧸', 68, 64, 'salta', .2) }),
  primavera: () => ({ t: '¡Llegó la primavera! 🌼', h: lluvia(['🌸', '🌼', '🌷', '🍃'], 22, 28) + cruza('🦋', 40, 48, 'vuela', 0) + cruza('🐝', 58, 40, 'vuela', .5) }),
  madre: () => ({ t: '¡Mamá hay una sola! 💐', h: suben(['💖', '💕', '🌸', '🌷'], 20, 32) + pop('💐', 'late') }),
  halloween: () => ({ t: '¡BUUU! 👻', h: cruza('🦇', 22, 44, 'rapido', 0) + cruza('🦇', 34, 34, 'rapido', .25) + cruza('🦇', 16, 30, 'rapido', .5) + pop('👻', 'tiembla') + lluvia(['🍬', '🍭'], 8, 26) }),
  black_friday: () => ({ t: '¡Ofertas que vuelan! ⚡', h: lluvia(['🏷️', '💸', '💸', '⚡', '🛍️'], 28, 34) + pop('🤑', 'late') }),
  navidad: () => ({ t: '¡Jo, jo, jo! 🎅', h: lluvia(['❄️', '❄️', '✨'], 28, 22) + cruza('🦌🦌🛷🎅', 24, 46, 'vuela', 0) + pop('🎄', 'late') }),
  anio_nuevo: () => ({ t: '¡Feliz ' + anio() + '! 🥂', h: fuegos(5) + lluvia(['🎉', '🎊', '✨'], 18, 26) + choque('🥂', '🥂', '✨') })
};

const CSS = '#pk-intro{position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;animation:pkfade ' + DUR + 'ms ease forwards}' +
  '#pk-intro i{position:absolute;font-style:normal;line-height:1;will-change:transform}' +
  '#pk-intro .pk-f{top:-60px;animation:pkfall 2s ease-in forwards}' +
  '#pk-intro .pk-u{bottom:-70px;animation:pkup 2s ease-out forwards}' +
  '#pk-intro .pk-x{right:-30vw;white-space:nowrap;animation:pkcross 2.5s linear forwards}' +
  '#pk-intro .pk-x b{display:inline-block;font-weight:400}' +
  '#pk-intro .pk-salta b{animation:pkhop .42s ease-in-out infinite}' +
  '#pk-intro .pk-vuela b{animation:pkwave .7s ease-in-out infinite}' +
  '#pk-intro .pk-rapido{animation-duration:1.3s}#pk-intro .pk-rapido b{animation:pkwave .3s ease-in-out infinite}' +
  '#pk-intro .pk-flamea b{animation:pkflag .5s ease-in-out infinite;transform-origin:left bottom}' +
  '#pk-intro .pk-p{left:50%;top:42%;font-size:110px;transform:translate(-50%,-50%) scale(0);animation:pkpop .55s cubic-bezier(.3,1.6,.5,1) .15s forwards}' +
  '#pk-intro .pk-p b{display:inline-block;font-weight:400}' +
  '#pk-intro .pk-gira b{animation:pkspin 2.4s linear infinite}#pk-intro .pk-late b{animation:pkbeat .6s ease-in-out .7s infinite}' +
  '#pk-intro .pk-tiembla b{animation:pkshake .12s linear .7s infinite}#pk-intro .pk-guina b{animation:pktilt .5s ease-in-out .7s infinite alternate}' +
  '#pk-intro .pk-ca,#pk-intro .pk-cb{top:42%;font-size:96px;margin-top:-48px}' +
  '#pk-intro .pk-ca{left:-120px;animation:pkca .7s cubic-bezier(.5,0,.8,.4) .1s forwards}#pk-intro .pk-cb{right:-120px;animation:pkcb .7s cubic-bezier(.5,0,.8,.4) .1s forwards}' +
  '#pk-intro .pk-cc{left:50%;top:42%;font-size:90px;transform:translate(-50%,-50%) scale(0);animation:pkboom .6s ease-out .75s forwards}' +
  '#pk-intro .pk-b{font-size:22px;opacity:0;animation:pkburst 1.1s ease-out forwards}' +
  '#pk-intro .pk-t{left:50%;bottom:16%;transform:translate(-50%,30px);opacity:0;font:800 20px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:14px 22px;border-radius:99px;white-space:nowrap;box-shadow:0 12px 34px rgba(0,0,0,.25);animation:pktxt .5s cubic-bezier(.3,1.5,.5,1) .45s forwards}' +
  '@keyframes pkfade{0%{opacity:0}6%{opacity:1}82%{opacity:1}100%{opacity:0}}' +
  '@keyframes pkfall{to{transform:translateY(calc(100vh + 120px)) rotate(var(--r))}}' +
  '@keyframes pkup{0%{transform:translate(0,0)}25%{transform:translate(14px,-30vh)}50%{transform:translate(-14px,-60vh)}100%{transform:translate(10px,calc(-100vh - 140px))}}' +
  '@keyframes pkcross{to{transform:translateX(calc(-100vw - 60vw))}}' +
  '@keyframes pkhop{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-34px) rotate(-8deg)}}' +
  '@keyframes pkwave{0%,100%{transform:translateY(0)}50%{transform:translateY(-22px)}}' +
  '@keyframes pkflag{0%,100%{transform:skewY(0) rotate(-4deg)}50%{transform:skewY(-8deg) rotate(4deg)}}' +
  '@keyframes pkpop{to{transform:translate(-50%,-50%) scale(1)}}' +
  '@keyframes pkspin{to{transform:rotate(360deg)}}@keyframes pkbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}' +
  '@keyframes pkshake{0%{transform:translate(-5px,2px) rotate(-6deg)}50%{transform:translate(5px,-2px) rotate(6deg)}100%{transform:translate(-5px,2px) rotate(-6deg)}}' +
  '@keyframes pktilt{from{transform:rotate(-10deg)}to{transform:rotate(10deg) scale(1.08)}}' +
  '@keyframes pkca{to{left:calc(50% - 96px)}}@keyframes pkcb{to{right:calc(50% - 96px)}}' +
  '@keyframes pkboom{0%{transform:translate(-50%,-50%) scale(0) rotate(0)}60%{transform:translate(-50%,-50%) scale(1.4) rotate(20deg)}100%{transform:translate(-50%,-50%) scale(1) rotate(0)}}' +
  '@keyframes pkburst{0%{opacity:1;transform:translate(0,0) scale(.4)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1)}}' +
  '@keyframes pktxt{to{opacity:1;transform:translate(-50%,0)}}';

// Muestra la animación del tema una vez por sesión. lugar: 'app' | 'cat' (cada uno lleva su propia cuenta).
export function introTema(id, lugar, forzar) {
  const T = TEMAS[id], R = RECETAS[id];
  if (!T || !R || typeof document === 'undefined') return false;
  try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (e) { }
  const k = 'pk_intro_' + (lugar || '') + '_' + id;
  try { if (!forzar && sessionStorage.getItem(k)) return false; sessionStorage.setItem(k, '1'); } catch (e) { }
  const old = document.getElementById('pk-intro'); if (old) old.remove();
  if (!document.getElementById('pk-intro-css')) { const s = document.createElement('style'); s.id = 'pk-intro-css'; s.textContent = CSS; document.head.appendChild(s); }
  const r = R(), d = document.createElement('div');
  d.id = 'pk-intro'; d.setAttribute('aria-hidden', 'true');
  d.innerHTML = r.h + '<i class="pk-t" style="background:' + T.ban.g + ';color:' + T.ban.ink + '">' + r.t + '</i>';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), DUR + 100);
  return true;
}
export const RECETAS_IDS = Object.keys(RECETAS);
