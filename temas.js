// Temas de temporada (Día de la Madre, y más adelante otros).
// La tienda lo activa en Equipo → Tema de temporada. Se guarda en stores/{sid}/public/info
// ({tema:'madre', temaHasta: ms}) y se aplica a la app de todo el equipo y al catálogo.
// Se apaga solo al terminar la fecha (temaHasta), así nadie tiene que acordarse de sacarlo.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Día de la Madre en Argentina: tercer domingo de octubre.
export function diaMadre(y) {
  const d1 = new Date(y, 9, 1), primerDomingo = 1 + ((7 - d1.getDay()) % 7);
  return new Date(y, 9, primerDomingo + 14);
}
// Próximo Día de la Madre (o el de hoy, si es hoy).
export function proximoDiaMadre(now) {
  const n = new Date(now), hoy = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const d = diaMadre(hoy.getFullYear());
  return d >= hoy ? d : diaMadre(hoy.getFullYear() + 1);
}
export const fechaLarga = (d) => DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];

export const TEMAS = {
  madre: {
    nombre: 'Día de la Madre',
    // Hasta el final del lunes siguiente (por si alguien entrega o cobra después del domingo).
    hasta: (now) => { const d = proximoDiaMadre(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 23, 59, 59).getTime(); },
    fecha: (now) => proximoDiaMadre(now)
  }
};

// Devuelve el id del tema vigente ('madre') o '' si no hay ninguno.
export function temaActivo(info, now) {
  if (!info || !info.tema || !TEMAS[info.tema]) return '';
  if (info.temaHasta && now > info.temaHasta) return '';
  return info.tema;
}
export function faltan(now, fecha) {
  const n = new Date(now), hoy = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((fecha - hoy) / 86400000);
}
export function cuentaRegresiva(now, fecha) {
  const f = faltan(now, fecha);
  return f <= 0 ? '¡Es hoy!' : f === 1 ? '¡Es mañana!' : 'Faltan ' + f + ' días';
}

// Flores en SVG (sin imágenes externas). c1/c2: colores de pétalos.
export function flor(size, c1, c2, rot) {
  const p = [0, 72, 144, 216, 288].map((a) => '<ellipse cx="0" cy="-11" rx="7" ry="11" fill="' + c1 + '" transform="rotate(' + a + ')"/>').join('');
  return '<svg width="' + size + '" height="' + size + '" viewBox="-24 -24 48 48" aria-hidden="true" style="transform:rotate(' + (rot || 0) + 'deg)">' + p + '<circle r="6" fill="' + c2 + '"/></svg>';
}
