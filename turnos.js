// Turnos (servicios con agenda): cálculo de horarios libres. Lo usan la app (agenda.js) y el catálogo.
//
// Cómo se evita que dos personas reserven el mismo horario sin servidor propio:
// cada turno ocupa bloques de 15 minutos, y cada bloque es un documento con un nombre fijo
// (stores/{sid}/ocupado/{día}_{profesional}_{minuto}). El turno y sus bloques se guardan juntos
// (todo o nada) y las reglas de Firebase solo dejan CREAR un bloque que no existe: si alguien
// ya tomó uno de esos bloques, la reserva entera falla y se le pide elegir otro horario.
//
// Horarios de atención: h = { '0': [inicio, fin, inicio, fin...], ... '6': [...] }
// (día de la semana 0 = domingo; minutos desde las 00:00; Firestore no admite listas dentro de listas).

export const UNIT = 15;
export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DC = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
// Lunes a sábado de 9 a 20, domingo cerrado.
export const DEF_H = { 0: [], 1: [540, 1200], 2: [540, 1200], 3: [540, 1200], 4: [540, 1200], 5: [540, 1200], 6: [540, 1200] };
export const DEF_CFG = { on: false, paso: 30, ant: 60, max: 30, h: DEF_H, cz: [], pros: null };

export const pad = (n) => String(n).padStart(2, '0');
export function hm(m) { m = Math.round(m); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
export function toMin(s) { const r = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); if (!r) return NaN; const h = +r[1], m = +r[2]; return h < 24 && m < 60 ? h * 60 + m : NaN; }
export function ymd(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
export function parseYmd(s) { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
export function weekday(s) { return parseYmd(s).getDay(); }
export function fechaCorta(s) { const d = parseYmd(s); return DC[d.getDay()] + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
export function fechaLargaT(s) { const d = parseYmd(s); return DIAS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); }
// Duración real que ocupa en la agenda: múltiplo de 15, mínimo 15.
export function normDur(d) { d = Math.round(+d || 0); return Math.max(UNIT, Math.ceil(d / UNIT) * UNIT); }
export function durTxt(d) { d = +d || 0; const h = Math.floor(d / 60), m = d % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; }

export function lockId(d, e, m) { return d + '_' + e + '_' + m; }
export function lockIds(d, e, i, f) { const r = []; for (let m = i; m < f; m += UNIT) r.push(lockId(d, e, m)); return r; }
// Bloques ocupados a partir de los turnos de un día (la app los tiene completos).
export function busyFromTurnos(list) { const s = new Set(); (list || []).forEach((t) => lockIds(t.d, t.e, t.i, t.f).forEach((k) => s.add(k))); return s; }

// Franjas de atención de un día: [[inicio, fin], ...]
export function rangos(cfg, d) {
  if (!cfg || (cfg.cz || []).indexOf(d) >= 0) return [];
  const h = (cfg.h || DEF_H)[weekday(d)] || [], r = [];
  for (let k = 0; k + 1 < h.length; k += 2) if (h[k + 1] > h[k]) r.push([h[k], h[k + 1]]);
  return r;
}
// Próximos días con atención, desde `desde` (incluido), hasta cfg.max días.
export function dias(cfg, desde, max) {
  const n = max || (cfg && cfg.max) || 30, out = [];
  for (let k = 0; k < n; k++) { const d = addDays(desde, k); if (rangos(cfg, d).length) out.push(d); }
  return out;
}
// Horarios en los que empieza un turno de `dur` minutos: [{ m, pros: [libres] }].
// `pros`: profesionales a considerar; `busy`: Set de bloques ocupados; `desdeMin`: no ofrecer antes de ese minuto (hoy).
export function libres(cfg, d, dur, pros, busy, desdeMin) {
  dur = normDur(dur);
  const paso = Math.max(UNIT, +(cfg && cfg.paso) || 30), out = [];
  rangos(cfg, d).forEach(([a, b]) => {
    for (let t = a; t + dur <= b; t += paso) {
      if (desdeMin != null && t < desdeMin) continue;
      const free = pros.filter((e) => lockIds(d, e, t, t + dur).every((k) => !busy.has(k)));
      if (free.length) out.push({ m: t, pros: free });
    }
  });
  return out;
}
// "Cualquiera": el profesional libre con menos turnos ese día (reparte el trabajo).
export function elegirPro(free, busy, d) {
  let best = free[0], bn = Infinity;
  free.forEach((e) => { let n = 0; busy.forEach((k) => { if (k.indexOf(d + '_' + e + '_') === 0) n++; }); if (n < bn) { bn = n; best = e; } });
  return best;
}
// Primer minuto reservable hoy según la anticipación mínima (null si el día no es hoy).
export function desdeHoy(d, now, ant) {
  if (d !== ymd(now)) return d < ymd(now) ? 1e9 : null;
  return now.getHours() * 60 + now.getMinutes() + (+ant || 0);
}
// Horarios de atención "planos" (para Firestore) <-> filas editables [[ 'HH:MM','HH:MM' ], ...] por día.
export function hToRows(h) { const o = {}; for (let w = 0; w < 7; w++) { const a = (h || DEF_H)[w] || []; o[w] = []; for (let k = 0; k + 1 < a.length; k += 2) o[w].push([hm(a[k]), hm(a[k + 1])]); } return o; }
export function rowsToH(rows) {
  const h = {};
  for (let w = 0; w < 7; w++) {
    const flat = [];
    (rows[w] || []).forEach(([a, b]) => { const x = toMin(a), y = toMin(b); if (!isNaN(x) && !isNaN(y) && y > x) flat.push(x, y); });
    h[w] = flat;
  }
  return h;
}
// Texto para WhatsApp / calendario
export function gcalUrl(titulo, d, i, f, detalle, lugar) {
  const p = d.replace(/-/g, ''), t = (m) => pad(Math.floor(m / 60)) + pad(m % 60) + '00';
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titulo) + '&dates=' + p + 'T' + t(i) + '/' + p + 'T' + t(f) +
    (detalle ? '&details=' + encodeURIComponent(detalle) : '') + (lugar ? '&location=' + encodeURIComponent(lugar) : '');
}
