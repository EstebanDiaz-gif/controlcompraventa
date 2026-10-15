// Temas de temporada para la app y el catálogo.
// La tienda activa uno en Equipo → Tema de temporada. Se guarda en stores/{sid}/public/info
// ({tema:'navidad', temaHasta: ms}) y se aplica a la app de todo el equipo y al catálogo.
// Cada tema se apaga solo cuando termina su fecha (temaHasta).

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fechaLarga = (d) => DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- fechas ----------
// n-ésimo día de la semana (dow: 0=domingo) de un mes (m: 0=enero).
export function nthDow(y, m, dow, n) { const d1 = new Date(y, m, 1); return new Date(y, m, 1 + ((7 + dow - d1.getDay()) % 7) + (n - 1) * 7); }
// Domingo de Pascua (algoritmo de Gauss / Meeus).
export function pascua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}
const fijo = (m, d) => (y) => new Date(y, m, d);
export const diaMadre = (y) => nthDow(y, 9, 0, 3);           // 3er domingo de octubre
const blackFriday = (y) => { const t = nthDow(y, 10, 4, 4); return new Date(y, 10, t.getDate() + 1); }; // viernes después del 4º jueves de noviembre

// ---------- paletas ----------
// app: colores claros de la app; dark: modo oscuro; cat: catálogo; ban: cartel (degradé, texto, etiqueta).
function pal(o) { return o; }
const PATRIA = pal({
  app: { bg: '#eef5fb', card: '#fbfdff', hero: '#cfe6f7', nav: '#deedf8', btn: '#1f6fb2', btnink: '#fff', line: 'rgba(31,111,178,.13)' },
  dark: { bg: '#0e151c', card: '#16212b', btn: '#7cc1f2', btnink: '#08243b', line: 'rgba(124,193,242,.16)' },
  cat: { bg: '#f0f7fd', line: '#d4e7f6', b: '#1f6fb2', bi: '#fff' },
  ban: { g: 'linear-gradient(180deg,#74acdf 0 30%,#ffffff 30% 70%,#74acdf 70% 100%)', ink: '#0b3a5c', cd: '#1f6fb2', cdi: '#fff' }
});

// deco: adornos del cartel [contenido, tamaño px, posición css]. 'flor' = flor dibujada.
export const TEMAS = {
  reyes: {
    nombre: 'Reyes Magos', emoji: '👑', dia: fijo(0, 6), extra: 0, regalo: true, badge: '🎁',
    titulo: 'Feliz Día de Reyes', sub: 'Los regalos que los Reyes van a dejar en los zapatitos.', wa: 'para Reyes 👑',
    deco: [['👑', 54, 'right:14px;top:8px'], ['⭐', 30, 'right:84px;top:16px'], ['🐪', 40, 'right:40px;bottom:6px']],
    ...pal({
      app: { bg: '#f5f0fa', card: '#fffcf5', hero: '#ead9f5', nav: '#ece3f4', btn: '#5b2a86', btnink: '#fff', line: 'rgba(91,42,134,.13)' },
      dark: { bg: '#130f1a', card: '#1f1829', btn: '#d6b25e', btnink: '#2a1a00', line: 'rgba(214,178,94,.18)' },
      cat: { bg: '#f8f3fc', line: '#e6daf1', b: '#5b2a86', bi: '#fff' },
      ban: { g: 'linear-gradient(120deg,#3d1a5e,#5b2a86 55%,#c99a2e)', ink: '#fff', cd: '#f2c94c', cdi: '#2a1a00' }
    })
  },
  san_valentin: {
    nombre: 'San Valentín', emoji: '❤️', dia: fijo(1, 14), extra: 0, regalo: true, badge: '💝',
    titulo: 'Feliz San Valentín', sub: 'Sorprendé a quien más querés.', wa: 'para San Valentín ❤️',
    deco: [['❤️', 56, 'right:12px;top:4px'], ['💘', 36, 'right:84px;bottom:8px'], ['🌹', 34, 'right:24px;bottom:4px']],
    ...pal({
      app: { bg: '#fbeeee', card: '#fff9f9', hero: '#f6c6c9', nav: '#f4dcdd', btn: '#c0182f', btnink: '#fff', line: 'rgba(192,24,47,.13)' },
      dark: { bg: '#1d1012', card: '#2b171a', btn: '#ff8a98', btnink: '#3a0510', line: 'rgba(255,138,152,.16)' },
      cat: { bg: '#fdf2f3', line: '#f6d4d8', b: '#c0182f', bi: '#fff' },
      ban: { g: 'linear-gradient(120deg,#ffd6dc,#ff9aab 55%,#e8475f)', ink: '#4d0812', cd: '#c0182f', cdi: '#fff' }
    })
  },
  pascuas: {
    nombre: 'Pascuas', emoji: '🐣', dia: pascua, extra: 0, regalo: true, badge: '🍫',
    titulo: 'Felices Pascuas', sub: 'Huevos, conejos y dulces para compartir.', wa: 'para Pascuas 🐣',
    deco: [['🐰', 52, 'right:12px;top:8px'], ['🥚', 34, 'right:84px;bottom:8px'], ['🐣', 32, 'right:30px;bottom:4px']],
    ...pal({
      app: { bg: '#f6f2fb', card: '#fffdf7', hero: '#e8dcf7', nav: '#ece5f5', btn: '#6b3fa0', btnink: '#fff', line: 'rgba(107,63,160,.13)' },
      dark: { bg: '#15111c', card: '#211a2b', btn: '#c9a6f2', btnink: '#2a1145', line: 'rgba(201,166,242,.16)' },
      cat: { bg: '#f9f6fd', line: '#e7ddf4', b: '#6b3fa0', bi: '#fff' },
      ban: { g: 'linear-gradient(120deg,#fff3c4,#f3d9ff 55%,#c9b3f5)', ink: '#3b1d5c', cd: '#6b3fa0', cdi: '#fff' }
    })
  },
  mayo: {
    nombre: '25 de Mayo', emoji: '☀️', dia: fijo(4, 25), extra: 0, regalo: false, badge: '',
    titulo: '¡Feliz 25 de Mayo!', sub: 'Revolución de Mayo. Locro, empanadas y pastelitos.', wa: '',
    deco: [['☀️', 64, 'right:14px;top:50%;margin-top:-34px']], ...PATRIA
  },
  padre: {
    nombre: 'Día del Padre', emoji: '👔', dia: (y) => nthDow(y, 5, 0, 3), extra: 1, regalo: true, badge: '🎁',
    titulo: 'Feliz Día del Padre', sub: 'Encontrá el regalo ideal para papá.', wa: 'para el Día del Padre 👔',
    deco: [['👔', 52, 'right:14px;top:8px'], ['🧉', 36, 'right:86px;bottom:8px'], ['🎁', 32, 'right:28px;bottom:4px']],
    ...pal({
      app: { bg: '#eef1f5', card: '#fbfcfe', hero: '#cdd8e6', nav: '#dfe5ee', btn: '#1e3a5f', btnink: '#fff', line: 'rgba(30,58,95,.13)' },
      dark: { bg: '#0e131a', card: '#18202b', btn: '#8fb3e0', btnink: '#0b1b2e', line: 'rgba(143,179,224,.16)' },
      cat: { bg: '#f2f5f9', line: '#dbe3ee', b: '#1e3a5f', bi: '#fff' },
      ban: { g: 'linear-gradient(120deg,#dce6f2,#a9c0dd 55%,#5d7fa8)', ink: '#0e2340', cd: '#1e3a5f', cdi: '#fff' }
    })
  },
  bandera: {
    nombre: 'Día de la Bandera', emoji: '🇦🇷', dia: fijo(5, 20), extra: 0, regalo: false, badge: '',
    titulo: '¡Feliz Día de la Bandera!', sub: '20 de junio, homenaje a Manuel Belgrano.', wa: '',
    deco: [['☀️', 64, 'right:14px;top:50%;margin-top:-34px']], ...PATRIA
  },
  julio: {
    nombre: '9 de Julio', emoji: '☀️', dia: fijo(6, 9), extra: 0, regalo: false, badge: '',
    titulo: '¡Feliz Día de la Independencia!', sub: '9 de julio. ¡Viva la Patria!', wa: '',
    deco: [['☀️', 64, 'right:14px;top:50%;margin-top:-34px']], ...PATRIA
  },
  amigo: {
    nombre: 'Día del Amigo', emoji: '🤝', dia: fijo(6, 20), extra: 0, regalo: true, badge: '🎁',
    titulo: 'Feliz Día del Amigo', sub: 'Un detalle para tus amigos de siempre.', wa: 'para el Día del Amigo 🤝',
    deco: [['🤝', 50, 'right:14px;top:8px'], ['🎉', 36, 'right:84px;bottom:8px'], ['🍻', 32, 'right:28px;bottom:4px']],
    ...pal({
      app: { bg: '#f2f8f6', card: '#fdfffe', hero: '#c8ebe2', nav: '#ddf0eb', btn: '#0f7a6a', btnink: '#fff', line: 'rgba(15,122,106,.13)' },
      dark: { bg: '#0d1715', card: '#15231f', btn: '#6fdcc6', btnink: '#05302a', line: 'rgba(111,220,198,.16)' },
      cat: { bg: '#f3faf8', line: '#d3ece5', b: '#0f7a6a', bi: '#fff' },
      ban: { g: 'linear-gradient(120deg,#fff1b8,#ffd86b 50%,#7fd6c2)', ink: '#073b33', cd: '#0f7a6a', cdi: '#fff' }
    })
  },
  nino: {
    nombre: 'Día del Niño', emoji: '🧸', dia: (y) => nthDow(y, 7, 0, 3), extra: 0, regalo: true, badge: '🎁',
    titulo: 'Feliz Día del Niño', sub: 'Juguetes y sorpresas para los más chicos.', wa: 'para el Día del Niño 🧸',
    deco: [['🧸', 52, 'right:14px;top:8px'], ['🎈', 38, 'right:86px;top:10px'], ['🪁', 32, 'right:30px;bottom:4px']],
    ...pal({
      app: { bg: '#f3f6fd', card: '#fffefa', hero: '#cfe0ff', nav: '#e1e9fb', btn: '#3155d6', btnink: '#fff', line: 'rgba(49,85,214,.13)' },
      dark: { bg: '#10131f', card: '#1a1f33', btn: '#9db2ff', btnink: '#0b1a52', line: 'rgba(157,178,255,.16)' },
      cat: { bg: '#f5f8fe', line: '#dbe5fa', b: '#3155d6', bi: '#fff' },
      ban: { g: 'linear-gradient(120deg,#ffe066,#ff8fab 50%,#7ab8ff)', ink: '#1b1f4d', cd: '#3155d6', cdi: '#fff' }
    })
  },
  primavera: {
    nombre: 'Primavera y Día del Estudiante', emoji: '🌼', dia: fijo(8, 21), extra: 0, regalo: true, badge: '🌼',
    titulo: '¡Feliz primavera!', sub: 'Día de la Primavera y del Estudiante.', wa: 'por el Día de la Primavera 🌼',
    deco: [['🌼', 54, 'right:14px;top:8px'], ['🌸', 36, 'right:84px;bottom:8px'], ['🦋', 32, 'right:30px;bottom:4px']],
    ...pal({
      app: { bg: '#f1f8ee', card: '#fdfff9', hero: '#d6efc8', nav: '#e3f2da', btn: '#3f8a2e', btnink: '#fff', line: 'rgba(63,138,46,.13)' },
      dark: { bg: '#10180d', card: '#192515', btn: '#9ad97f', btnink: '#123a08', line: 'rgba(154,217,127,.16)' },
      cat: { bg: '#f4faf1', line: '#dcefd2', b: '#3f8a2e', bi: '#fff' },
      ban: { g: 'linear-gradient(120deg,#fff6b3,#c9f0a8 50%,#9fe0c9)', ink: '#1e4a12', cd: '#3f8a2e', cdi: '#fff' }
    })
  },
  madre: {
    nombre: 'Día de la Madre', emoji: '💐', dia: diaMadre, extra: 1, regalo: true, badge: '🎁',
    titulo: 'Feliz Día de la Madre', sub: 'Encontrá el regalo ideal para mamá.', wa: 'para el Día de la Madre 💐',
    deco: [['flor:#e05a8a:#ffd36b', 110, 'right:-14px;top:-18px'], ['flor:#fff:#f39ab8', 70, 'right:70px;bottom:-26px'], ['flor:#c2185b:#fff3c4', 34, 'right:120px;top:6px;opacity:.8']],
    ...pal({
      app: { bg: '#f8edf1', card: '#fff8fa', hero: '#f4c9d6', nav: '#f3dbe3', btn: '#8e1f4f', btnink: '#fff', line: 'rgba(142,31,79,.13)' },
      dark: { bg: '#1c1217', card: '#2a1a21', btn: '#f3a6c0', btnink: '#2a0f1a', line: 'rgba(243,166,192,.16)' },
      cat: { bg: '#fdf1f5', line: '#f5d9e3', b: '#8e1f4f', bi: '#fff' },
      ban: { g: 'linear-gradient(120deg,#fde3ec 0%,#f8c2d5 55%,#ee9ab9 100%)', ink: '#4a0f28', cd: '#8e1f4f', cdi: '#fff' }
    })
  },
  halloween: {
    nombre: 'Halloween', emoji: '🎃', dia: fijo(9, 31), extra: 0, regalo: false, badge: '🎃',
    titulo: 'Feliz Halloween', sub: 'Dulce o truco… ¡mejor dulce!', wa: 'para Halloween 🎃',
    deco: [['🎃', 56, 'right:12px;top:8px'], ['🦇', 32, 'right:86px;top:10px'], ['👻', 34, 'right:40px;bottom:4px']],
    ...pal({
      app: { bg: '#f6f0ea', card: '#fffaf5', hero: '#f7c99a', nav: '#efe2d6', btn: '#c24a00', btnink: '#fff', line: 'rgba(194,74,0,.14)' },
      dark: { bg: '#120d14', card: '#1e1622', btn: '#ff9a3c', btnink: '#2a1200', line: 'rgba(255,154,60,.18)' },
      cat: { bg: '#f8f2ec', line: '#efdccb', b: '#c24a00', bi: '#fff' },
      ban: { g: 'linear-gradient(120deg,#2b1640,#4a1f5c 55%,#d35400)', ink: '#fff', cd: '#ff9a3c', cdi: '#2a1200' }
    })
  },
  black_friday: {
    nombre: 'Black Friday', emoji: '🏷️', dia: blackFriday, extra: 3, regalo: false, badge: '🏷️',
    titulo: 'Black Friday', sub: 'Ofertas especiales por tiempo limitado.', wa: 'del Black Friday 🏷️',
    deco: [['🏷️', 52, 'right:14px;top:8px'], ['⚡', 36, 'right:84px;bottom:8px'], ['🛍️', 34, 'right:28px;bottom:4px']],
    ...pal({
      app: { bg: '#efefed', card: '#ffffff', hero: '#ffe14d', nav: '#e6e6e2', btn: '#111111', btnink: '#ffe14d', line: 'rgba(0,0,0,.12)' },
      dark: { bg: '#0a0a0a', card: '#171717', btn: '#ffe14d', btnink: '#111', line: 'rgba(255,225,77,.18)' },
      cat: { bg: '#f2f2f0', line: '#e2e2de', b: '#111111', bi: '#ffe14d' },
      ban: { g: 'linear-gradient(120deg,#111,#262626 60%,#111)', ink: '#fff', cd: '#ffe14d', cdi: '#111' }
    })
  },
  navidad: {
    nombre: 'Navidad', emoji: '🎄', dia: fijo(11, 25), extra: 0, regalo: true, badge: '🎁',
    titulo: '¡Feliz Navidad!', sub: 'Regalos para poner debajo del arbolito.', wa: 'para Navidad 🎄',
    deco: [['🎄', 56, 'right:12px;top:8px'], ['⭐', 30, 'right:84px;top:10px'], ['🎁', 34, 'right:44px;bottom:4px'], ['❄️', 24, 'right:110px;bottom:12px;opacity:.8']],
    ...pal({
      app: { bg: '#f3efe6', card: '#fffdf8', hero: '#cfe3d3', nav: '#e7ecdf', btn: '#b3261e', btnink: '#fff', line: 'rgba(31,107,58,.14)' },
      dark: { bg: '#0f1712', card: '#18241c', btn: '#f08a80', btnink: '#2a0b08', line: 'rgba(240,138,128,.16)' },
      cat: { bg: '#f6f2ea', line: '#e6e0d1', b: '#b3261e', bi: '#fff' },
      ban: { g: 'linear-gradient(120deg,#1f6b3a,#2e8a4e 55%,#b3261e)', ink: '#fff', cd: '#fff', cdi: '#b3261e' }
    })
  },
  anio_nuevo: {
    nombre: 'Año Nuevo', emoji: '🥂', dia: fijo(0, 1), extra: 0, regalo: false, badge: '✨',
    titulo: '¡Feliz Año Nuevo!', sub: 'Todo para recibir el año con alegría.', wa: 'para Año Nuevo 🥂',
    deco: [['🥂', 52, 'right:14px;top:8px'], ['✨', 32, 'right:84px;top:10px'], ['🎆', 38, 'right:40px;bottom:2px']],
    ...pal({
      app: { bg: '#f1efe8', card: '#fffdf7', hero: '#e9dcb4', nav: '#e9e4d4', btn: '#1d1b3a', btnink: '#f2c94c', line: 'rgba(29,27,58,.12)' },
      dark: { bg: '#0d0c1a', card: '#17162b', btn: '#f2c94c', btnink: '#1d1b3a', line: 'rgba(242,201,76,.18)' },
      cat: { bg: '#f5f3ec', line: '#e6e0cc', b: '#1d1b3a', bi: '#f2c94c' },
      ban: { g: 'linear-gradient(120deg,#1d1b3a,#2d2a5c 55%,#4b3f8f)', ink: '#fff', cd: '#f2c94c', cdi: '#1d1b3a' }
    })
  }
};

// Fecha del próximo (o actual) evento de un tema.
export function proxima(id, now) {
  const t = TEMAS[id], y = new Date(now).getFullYear();
  for (const yy of [y - 1, y, y + 1]) { const d = t.dia(yy); if (finDe(id, d) >= now) return d; }
  return t.dia(y + 1);
}
function finDe(id, d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + TEMAS[id].extra, 23, 59, 59).getTime(); }
export function hasta(id, now) { return finDe(id, proxima(id, now)); }
// Lista de temas ordenada por la fecha más cercana.
export function porFecha(now) {
  return Object.keys(TEMAS).map((id) => ({ id, fecha: proxima(id, now) })).sort((a, b) => a.fecha - b.fecha);
}

// Devuelve el id del tema vigente o '' si no hay ninguno.
export function temaActivo(info, now) {
  if (!info || !info.tema || !TEMAS[info.tema]) return '';
  if (info.temaHasta && now > info.temaHasta) return '';
  return info.tema;
}
// Tema general que activa el propietario de Pekeron App para todas las tiendas (platform/tema = {tema, hasta}).
export function temaGeneral(g, now) {
  if (!g || !g.tema || !TEMAS[g.tema]) return '';
  if (g.hasta && now > g.hasta) return '';
  return g.tema;
}
// Tema que se ve: el que eligió la tienda; si no eligió ninguno, el general (salvo que la tienda lo haya desactivado con temaOff).
export function temaEfectivo(info, g, now) {
  return temaActivo(info, now) || (info && info.temaOff ? '' : temaGeneral(g, now));
}
export function faltan(now, fecha) {
  const n = new Date(now), hoy = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((fecha - hoy) / 86400000);
}
export function cuentaRegresiva(now, fecha) {
  const f = faltan(now, fecha);
  return f < 0 ? '¡Últimos días!' : f === 0 ? '¡Es hoy!' : f === 1 ? '¡Es mañana!' : 'Faltan ' + f + ' días';
}

// Flor en SVG (sin imágenes externas). c1/c2: colores de pétalos y centro.
export function flor(size, c1, c2, rot) {
  const p = [0, 72, 144, 216, 288].map((a) => '<ellipse cx="0" cy="-11" rx="7" ry="11" fill="' + c1 + '" transform="rotate(' + a + ')"/>').join('');
  return '<svg width="' + size + '" height="' + size + '" viewBox="-24 -24 48 48" aria-hidden="true" style="transform:rotate(' + (rot || 0) + 'deg)">' + p + '<circle r="6" fill="' + c2 + '"/></svg>';
}
// Adornos del cartel. escala: 1 = catálogo; menor en la app.
export function adornos(id, escala, max) {
  return TEMAS[id].deco.slice(0, max || 9).map(([c, s, pos], i) => {
    const sz = Math.round(s * (escala || 1));
    const inner = c.indexOf('flor:') === 0 ? flor(sz, c.split(':')[1], c.split(':')[2], i * 17) : '<span style="font-size:' + sz + 'px;line-height:1">' + c + '</span>';
    return '<span class="fl ' + (i % 2 ? 'b' : 'a') + '" style="' + pos + '">' + inner + '</span>';
  }).join('');
}
export const fechaTitulo = (d) => cap(fechaLarga(d));

// CSS de la app para un tema (claro, oscuro automático y oscuro forzado).
export function cssApp(id) {
  const t = TEMAS[id]; if (!t) return '';
  const v = (o) => Object.keys(o).map((k) => '--' + k + ':' + o[k]).join(';');
  const sel = ':root[data-tema="' + id + '"]';
  const dk = Object.assign({ nav: t.dark.card }, t.dark);
  return sel + '{' + v(t.app) + '}' +
    '@media (prefers-color-scheme:dark){' + sel + ':not([data-theme="light"]){' + v(dk) + '}}' +
    ':root[data-theme="dark"][data-tema="' + id + '"]{' + v(dk) + '}';
}
