// Interfaces de la app (todos los rubros; gastronomía conserva su Inicio y su caja por canal en las tres):
//   Clásica      — la de siempre (sigue el modo claro/oscuro del celular).
//   Nueva clara  — azul Pekeron, tarjetas blancas, Inicio con lo importante, barra con 4 secciones + "Más",
//                  y en la compu el menú pasa al costado.
//   Nueva oscura — lo mismo con fondo azul oscuro.
// Cada persona elige la suya en cada equipo (se guarda en el navegador). Los negocios creados desde que salió
// la nueva arrancan con la Nueva clara; los que ya estaban siguen con la Clásica hasta que la cambien.

export const UIS = [
  ['clasica', 'Clásica', 'La de siempre, sin cambios'],
  ['clara', 'Nueva clara', 'Más ordenada, con Inicio y fondo claro'],
  ['oscura', 'Nueva oscura', 'Igual a la nueva, con fondo oscuro']
];
export const UI_DESDE = Date.parse('2026-11-12T00:00:00-03:00');
const KEY = 'pk_ui';

export function uiModo(o) {
  let v = ''; try { v = localStorage.getItem(KEY) || ''; } catch (e) {}
  if (UIS.some((u) => u[0] === v)) return v;
  return o && o.creada && o.creada >= UI_DESDE ? 'clara' : 'clasica';
}
export function uiGuardar(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
export const uiEligio = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return true; } };

export function uiAplicar(modo) {
  const r = document.documentElement;
  if (modo === 'clara' || modo === 'oscura') {
    r.setAttribute('data-ui', 'n'); r.setAttribute('data-theme', modo === 'oscura' ? 'dark' : 'light'); r.setAttribute('data-uit', '1');
  } else {
    r.removeAttribute('data-ui');
    if (r.getAttribute('data-uit')) { r.removeAttribute('data-theme'); r.removeAttribute('data-uit'); }
  }
  if (!document.getElementById('uicss')) { const s = document.createElement('style'); s.id = 'uicss'; s.textContent = CSS; document.head.appendChild(s); }
}

// Qué secciones van en la barra de abajo (en el celular); el resto queda en "Más". En la compu se ven todas al costado.
const PRIM = { gas: ['caja', 'stk', 'res', 'fia'], almacen: ['caja', 'stk', 'fia', 'res'], productos: ['caja', 'stk', 'res', 'add'], ambos: ['agd', 'caja', 'stk', 'res'], servicios: ['agd', 'att', 'res', 'caja'] };
export function uiTabs(tabs, biz, n) {
  n = n || 3;
  const p = PRIM[biz] || PRIM.productos, ks = tabs.map((t) => t[0]);
  const prim = p.filter((k) => ks.indexOf(k) >= 0).slice(0, n);
  ks.forEach((k) => { if (prim.length < n && prim.indexOf(k) < 0) prim.push(k); });
  return tabs.map((t) => [t[0], t[1], prim.indexOf(t[0]) >= 0]);
}

const MAS_IC = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
export const masBoton = () => '<button type="button" class="tmas" data-uimas="1">' + MAS_IC + '<span>Más</span></button>';

// Hoja de "Más": las secciones que no entran en la barra + Apariencia.
export function abrirMas(items, ICON, esc, ir, elegir) {
  cerrarHoja();
  const o = document.createElement('div'); o.id = 'uihoja';
  o.innerHTML = '<div class="uih"><div class="uihg"></div><b>Más</b>' + items.map((t) => '<button type="button" data-uiir="' + esc(t[0]) + '">' + (ICON[t[0]] || '') + '<span>' + esc(t[1]) + '</span></button>').join('') +
    '<button type="button" data-uiap="1">' + PALETA + '<span>Apariencia</span></button></div>';
  o.addEventListener('click', (e) => {
    if (e.target === o) { cerrarHoja(); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.uiir) { cerrarHoja(); ir(b.dataset.uiir); } else if (b.dataset.uiap) { cerrarHoja(); elegir(); }
  });
  document.body.appendChild(o);
}
function cerrarHoja() { const e = document.getElementById('uihoja'); if (e) e.remove(); }
const PALETA = '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.6 0-1.2-1-1.6-1-2.8 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/></svg>';

// Elegir la interfaz: tres tarjetas con una vista chiquita de cada una.
export function elegirUI(actual, esc, alElegir) {
  cerrarHoja();
  const mini = (k) => k === 'clasica'
    ? '<i style="background:#FFF6E9"><u style="background:#f4f3f0"></u><u style="background:#1D3FAF;width:60%"></u><s style="background:#bdbdb8"></s></i>'
    : k === 'clara' ? '<i style="background:#F2F4F9"><u style="background:#1D4ED8"></u><u style="background:#fff;width:60%"></u><s style="background:#fff"></s></i>'
      : '<i style="background:#0A1022"><u style="background:#2563EB"></u><u style="background:#131B31;width:60%"></u><s style="background:#0E1529"></s></i>';
  const o = document.createElement('div'); o.id = 'uihoja';
  o.innerHTML = '<div class="uih"><div class="uihg"></div><b>Apariencia</b><div class="uik">Elegí cómo querés ver la app en este equipo. Tus datos son los mismos; podés cambiarla cuando quieras.</div>' +
    UIS.map((u) => '<button type="button" class="uiop' + (u[0] === actual ? ' on' : '') + '" data-uisel="' + u[0] + '">' + mini(u[0]) + '<span><b>' + esc(u[1]) + '</b><small>' + esc(u[2]) + '</small></span>' + (u[0] === actual ? '<em>En uso</em>' : '') + '</button>').join('') + '</div>';
  o.addEventListener('click', (e) => {
    if (e.target === o) { cerrarHoja(); return; }
    const b = e.target.closest('[data-uisel]'); if (!b) return;
    uiGuardar(b.dataset.uisel); cerrarHoja(); alElegir(b.dataset.uisel);
  });
  document.body.appendChild(o);
}

const CSS = [
  // Hoja de Más y de Apariencia (sirve en las tres interfaces)
  '#uihoja{position:fixed;inset:0;z-index:70;background:rgba(10,16,34,.5);display:flex;align-items:flex-end;justify-content:center}',
  '#uihoja .uih{background:var(--bg);color:var(--ink);width:100%;max-width:520px;border-radius:24px 24px 0 0;padding:10px 16px calc(18px + env(safe-area-inset-bottom,0px));max-height:85vh;overflow:auto}',
  '#uihoja .uihg{width:44px;height:5px;border-radius:9px;background:var(--line);margin:0 auto 12px}#uihoja .uih > b{display:block;font-size:20px;font-weight:900;margin:0 4px 10px}',
  '#uihoja .uik{color:var(--mut);font-size:14px;margin:-4px 4px 12px}',
  '#uihoja .uih > button{display:flex;align-items:center;gap:14px;width:100%;border:0;background:var(--card);color:var(--ink);border-radius:16px;padding:13px 14px;margin-top:8px;font:inherit;font-size:16px;font-weight:700;text-align:left;cursor:pointer}',
  '#uihoja .uih > button svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}',
  '#uihoja .uiop{position:relative}#uihoja .uiop.on{box-shadow:inset 0 0 0 2.5px var(--sell)}#uihoja .uiop small{display:block;font-size:13px;font-weight:600;color:var(--mut);margin-top:2px}#uihoja .uiop em{margin-left:auto;white-space:nowrap;font-style:normal;font-size:12px;font-weight:800;color:var(--sell)}',
  '#uihoja .uiop i{width:54px;height:64px;border-radius:10px;flex:none;display:flex;flex-direction:column;gap:5px;padding:7px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);position:relative;overflow:hidden}#uihoja .uiop i u{display:block;height:10px;border-radius:4px;width:100%}#uihoja .uiop i s{position:absolute;left:0;right:0;bottom:0;height:9px}',
  // ---------- Nueva: colores ----------
  ':root[data-ui="n"]{--bg:#F2F4F9!important;--card:#FFFFFF!important;--ink:#0F1B3D!important;--mut:#5A6478!important;--line:rgba(15,27,61,.11)!important;--sell:#1D4ED8!important;--btn:#1D4ED8!important;--btnink:#FFFFFF!important;--nav:#FFFFFF!important;--hero:#E7ECFA!important;--onc:#FFFFFF!important;--buy:#FFE2C2!important}',
  ':root[data-ui="n"][data-theme="dark"]{--bg:#0A1022!important;--card:#131B31!important;--ink:#EAF0FF!important;--mut:#9AA6C2!important;--line:rgba(255,255,255,.11)!important;--sell:#6E9BFF!important;--btn:#2563EB!important;--btnink:#FFFFFF!important;--nav:#0E1529!important;--hero:#16213F!important;--onc:#0A1022!important}',
  // ---------- Nueva: formas ----------
  '[data-ui="n"] .card{border-radius:20px;box-shadow:0 1px 3px rgba(15,27,61,.06)}[data-ui="n"][data-theme="dark"] .card{box-shadow:inset 0 0 0 1px var(--line)}',
  '[data-ui="n"] .go{border-radius:16px}[data-ui="n"] input,[data-ui="n"] select,[data-ui="n"] textarea{border-radius:14px}',
  '[data-ui="n"] .tabs{background:var(--nav);border-top:1px solid var(--line);box-shadow:0 -6px 24px rgba(15,27,61,.06)}',
  '[data-ui="n"] .tabs button.on{color:var(--sell)}[data-ui="n"] .tabs button.on::before{background:var(--sell)}',
  // Barra de abajo (todas las interfaces, menos gastronomía): 4 secciones + "Más" con el resto y Apariencia.
  '.tabs .tmas{cursor:pointer}.tabs .tmas svg{fill:currentColor!important;stroke-width:1!important}',
  '.tabs button.tx{display:none}',
  // ---------- Nueva en la compu: menú al costado ----------
  '@media (min-width:960px){',
  '[data-ui="n"] body{padding-left:248px}',
  '[data-ui="n"] main{max-width:1000px}',
  '[data-ui="n"] .tabs{top:0;bottom:0;right:auto;left:0;width:248px;flex-direction:column;justify-content:flex-start;gap:4px;padding:24px 14px;border-top:0;border-right:1px solid var(--line);box-shadow:none;overflow:auto}',
  '[data-ui="n"] .tabs button,[data-ui="n"] .tabs button.tx{display:flex;flex:none;max-width:none;width:100%;flex-direction:row;gap:12px;padding:12px 14px;border-radius:12px;font-size:15px;font-weight:700;justify-content:flex-start}',
  '[data-ui="n"] .tabs button.on{background:color-mix(in srgb,var(--sell) 13%,transparent)}[data-ui="n"] .tabs button.on::before{display:none}',
  '[data-ui="n"] .tabs .tmas{display:none}',
  '[data-ui="n"] #s-ini .ini-g{grid-template-columns:repeat(3,minmax(0,1fr))}',
  '}'
].join('\n');
