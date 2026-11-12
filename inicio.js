// Inicio para gastronomía (sanguchería, hamburguesería, pizzería, rotisería, bar, cafetería):
// resumen del día, botón grande de "Nuevo pedido", aviso de pedidos nuevos y botones de colores para cada parte del local.
// Los datos vienen de la caja (ALM.iniDatos) y de Pedidos (PD.resumen); esta pantalla no lee nada de Firebase por su cuenta.
//
// X: $, esc, money, show(tab), isAdm(), tienda(), nombre(), alm, pd, catLink(), qrMesas()

const SV = (d, w) => '<svg viewBox="0 0 24 24" width="' + (w || 26) + '" height="' + (w || 26) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const IC = {
  plus: SV('<path d="M12 5v14M5 12h14"/>', 22),
  bell: SV('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', 22),
  ped: SV('<path d="M5 3h14v18l-3.5-2-3.5 2-3.5-2L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  mesa: SV('<path d="M3 9h18M6 9v11M18 9v11M8 5h8"/>'),
  coc: SV('<path d="M12 2c1 3 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 4 0-3 0-5 0-7z"/>'),
  caja: SV('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'),
  moto: SV('<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h3l-3 11.5M5.5 17.5 9 10h7"/>'),
  box: SV('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>', 20),
  libreta: SV('<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M8 9h7M8 13h5"/>', 20),
  gasto: SV('<path d="M4 3h16v18l-3-2-2 2-3-2-3 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>', 20),
  qr: SV('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>', 20),
  ojo: SV('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 20),
  equipo: SV('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>', 20),
  res: SV('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>', 20),
  flecha: SV('<path d="M9 18l6-6-6-6"/>', 18)
};
const CSS = '#s-ini{padding-bottom:8px}' +
  '.inh{background:#0F172A;color:#fff;border-radius:24px;padding:18px 16px 16px}' +
  '.inh1{display:flex;justify-content:space-between;align-items:center;gap:10px}.inh1 small{display:block;font-size:13px;font-weight:600;color:#CBD5E1}.inh1 b{display:block;font-size:21px;font-weight:900;line-height:1.2}' +
  '.insw{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:99px;padding:7px 7px 7px 13px;font:inherit;font-weight:800;font-size:13px;cursor:pointer;flex:none}' +
  '.insw i{width:40px;height:24px;border-radius:99px;background:#64748B;position:relative;display:block}.insw i:after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s}.insw.on i{background:#22C55E}.insw.on i:after{left:19px}' +
  '.ink{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px;margin-top:16px}.ink div{background:rgba(255,255,255,.09);border-radius:14px;padding:10px 11px;min-width:0}.ink small{display:block;font-size:11.5px;font-weight:600;color:#CBD5E1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ink b{display:block;font-size:18px;font-weight:900;margin-top:2px;white-space:nowrap}' +
  '.innp{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:14px;background:#1D3FAF;color:#fff;border:0;border-radius:16px;padding:16px;font:inherit;font-size:17px;font-weight:800;cursor:pointer}' +
  '.inal{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:18px;padding:12px 12px 12px 14px;margin-top:14px;box-shadow:0 6px 20px rgba(15,23,42,.08);border:0;width:100%;font:inherit;color:var(--ink);text-align:left;cursor:pointer}' +
  '.inal .ic{width:42px;height:42px;border-radius:12px;background:#D92D20;color:#fff;display:flex;align-items:center;justify-content:center;flex:none}.inal b{display:block;font-size:15px}.inal small{display:block;font-size:13px;color:var(--mut);margin-top:2px}.inal .ver{margin-left:auto;background:#D92D20;color:#fff;border-radius:11px;padding:10px 15px;font-weight:800;font-size:14px;flex:none}' +
  '.inst{font-size:12.5px;font-weight:800;letter-spacing:.06em;color:var(--mut);margin:18px 2px 10px;text-transform:uppercase}' +
  '.ing{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}' +
  '.inb{position:relative;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;min-height:92px;border:0;border-radius:18px;padding:14px;color:#fff;font:inherit;text-align:left;cursor:pointer}' +
  '.inb span{font-size:16px;font-weight:800;line-height:1.2}.inb span small{display:block;font-size:12px;font-weight:600;opacity:.92;margin-top:2px}.inb em{position:absolute;top:12px;right:12px;background:#fff;color:#D92D20;border-radius:99px;font-size:12px;font-weight:900;padding:2px 8px;font-style:normal}' +
  '.inb.ap{background:var(--card);color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--line)}.inb.ap span small{color:var(--mut);opacity:1}.inb .sq{display:flex;gap:4px}.inb .sq i{width:22px;height:22px;border-radius:6px;display:block}' +
  '.inm{background:var(--card);border-radius:18px;overflow:hidden}.inm button,.inm a{display:flex;align-items:center;gap:12px;width:100%;padding:13px 14px;border:0;background:none;font:inherit;font-size:15px;font-weight:700;color:var(--ink);text-decoration:none;cursor:pointer;text-align:left}' +
  '.inm > *:not(:first-child){border-top:1px solid var(--line)}.inm svg:last-child{margin-left:auto;color:var(--mut)}.inm .mi{width:34px;height:34px;border-radius:10px;background:var(--line);display:flex;align-items:center;justify-content:center;flex:none}';

export function createInicio(X) {
  const { esc, money } = X;
  let cssOk = false;
  function tile(k, bg, ic, t, sub, badge) {
    return '<button type="button" class="inb" data-inx="' + k + '" style="background:' + bg + '">' + ic + '<span>' + esc(t) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' + (badge ? '<em>' + badge + '</em>' : '') + '</button>';
  }
  function draw() {
    const box = X.$('s-ini'); if (!box) return;
    if (!cssOk) { cssOk = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
    const d = X.alm.iniDatos(), adm = X.isAdm(), r = X.pd.on() ? X.pd.resumen() : null;
    const nombre = String(X.nombre() || '').split(' ')[0];
    let h = '<div class="inh"><div class="inh1"><div>' + (nombre ? '<small>Hola, ' + esc(nombre) + '</small>' : '') + '<b>' + esc(X.tienda() || 'Mi local') + '</b></div>' +
      (r ? (adm ? '<button type="button" class="insw' + (r.cerr ? '' : ' on') + '" data-inx="abierto" aria-label="' + (r.cerr ? 'Local cerrado: tocá para abrir' : 'Local abierto: tocá para cerrar') + '">' + (r.cerr ? 'Cerrado' : 'Abierto') + '<i></i></button>' : '<span class="insw' + (r.cerr ? '' : ' on') + '">' + (r.cerr ? 'Cerrado' : 'Abierto') + '<i></i></span>') : '') + '</div>';
    const k = [];
    if (adm) k.push(['Vendido hoy', money(d.vend)]);
    if (r) k.push(['Pedidos', String(r.total)]); else k.push([adm ? 'Ventas de hoy' : 'Mis ventas hoy', String(d.n)]);
    if (adm && d.apHay) k.push(['Apps a cobrar', money(d.apCobrar)]);
    else if (r) k.push(['En cocina', String(r.cocina)]);
    h += '<div class="ink">' + k.map((x) => '<div><small>' + x[0] + '</small><b>' + x[1] + '</b></div>').join('') + '</div>' +
      '<button type="button" class="innp" data-inx="nuevo">' + IC.plus + 'Nuevo pedido</button></div>';
    if (r && r.nuevos) h += '<button type="button" class="inal" data-inx="pedidos"><span class="ic">' + IC.bell + '</span><span style="min-width:0"><b>' + r.nuevos + ' pedido' + (r.nuevos === 1 ? ' nuevo' : 's nuevos') + '</b><small>' + esc(r.nuevosTxt) + '</small></span><span class="ver">Ver</span></button>';
    h += '<div class="inst">¿Qué querés hacer?</div><div class="ing">';
    if (r) {
      h += tile('pedidos', '#D92D20', IC.ped, 'Pedidos', r.total ? r.total + ' activo' + (r.total === 1 ? '' : 's') : 'Sin pedidos ahora', r.nuevos || '');
      if (r.mesasOn) h += tile('mesas', '#15803D', IC.mesa, 'Mesas', r.mesas ? r.mesas + ' ocupada' + (r.mesas === 1 ? '' : 's') + (r.nm ? ' de ' + r.nm : '') : 'Todas libres');
      h += tile('cocina', '#C2410C', IC.coc, 'Cocina', r.cocina ? r.cocina + ' preparando' : 'Nada para preparar');
    } else if (adm) h += tile('tab:team', '#475569', IC.ped, 'Pedidos online', 'Activalos en Equipo');
    h += tile('tab:caja', '#6D28D9', IC.caja, 'Caja', d.caja ? 'Abierta' + (adm ? ' · ' + money(d.caja.ef) : '') : 'Cobrar y cerrar el día');
    if (r) h += tile('delivery', '#0E7490', IC.moto, 'Delivery', r.camino ? r.camino + ' en camino' : 'Envíos y cadetes');
    if (adm) h += '<button type="button" class="inb ap" data-inx="tab:apd"><span class="sq"><i style="background:#E6004C"></i><i style="background:#000"></i><i style="background:#FF5A1F"></i></span><span>Apps de delivery<small>' +
      (d.apHay ? (d.apCobrar ? 'El lunes cobrás ' + money(d.apCobrar) : 'Todo cobrado') : 'PedidosYa, Uber Eats, Rappi') + '</small></span></button>';
    h += '</div><div class="inst">Más</div><div class="inm">' +
      fila('tab:stk', IC.box, 'Productos y stock') +
      (adm ? fila('tab:res', IC.res, 'Resumen y ganancias') : '') +
      fila('tab:fia', IC.libreta, 'Fiado') +
      (adm ? fila('tab:gas', IC.gasto, 'Gastos') : '') +
      (adm && r && r.mesasOn ? fila('qr', IC.qr, 'QR de las mesas') : '') +
      '<a href="' + esc(X.catLink()) + '" target="_blank" rel="noopener"><span class="mi">' + IC.ojo + '</span>Ver mi menú online' + IC.flecha + '</a>' +
      (adm ? fila('tab:team', IC.equipo, 'Equipo y configuración') : '') + '</div>';
    box.innerHTML = h;
  }
  const fila = (k, ic, t) => '<button type="button" data-inx="' + k + '"><span class="mi">' + ic + '</span>' + esc(t) + IC.flecha + '</button>';
  function clic(e) {
    const b = e.target.closest && e.target.closest('[data-inx]'); if (!b) return;
    const a = b.dataset.inx;
    if (a.indexOf('tab:') === 0) { X.show(a.slice(4)); window.scrollTo(0, 0); return; }
    if (a === 'nuevo') { X.show('caja'); window.scrollTo(0, 0); return; }
    if (a === 'pedidos' || a === 'delivery') { X.pd.abrir(); return; }
    if (a === 'mesas') { X.pd.mesas(); return; }
    if (a === 'cocina') { X.pd.cocina(); return; }
    if (a === 'abierto') { X.pd.abiertoCerrado(); return; }
    if (a === 'qr') X.qrMesas();
  }
  let wired = false;
  function wire() { const s = X.$('s-ini'); if (s && !wired) { wired = true; s.addEventListener('click', clic); } }
  return { draw() { wire(); draw(); } };
}

// =====================================================================
// Inicio de la interfaz Nueva para comercios, tiendas y servicios (no gastronomía):
// ganancia del mes, ventas de hoy, resumen rápido (caja, deudas, stock bajo) y botones grandes.
// X: $, esc, money, show(tab), isAdm(), datos() → {
//   ganMes, ventasMes, ventasPrev (mismo día del mes pasado; null si no se sabe), ventasHoy, nHoy, unidHoy,
//   deudores, deuda, cajaEf (null si no hay caja abierta), stockBajo (null si no aplica),
//   venta: [tab, texto], stock: [tab, texto] | null, extra: [tab, texto, icono] | null, fiado: tab | null }
// =====================================================================
const CSS2 = '#s-ini .ini-h{background:linear-gradient(135deg,#1D4ED8,#0B2F9F);color:#fff;border-radius:24px;padding:18px;position:relative;overflow:hidden}' +
  '#s-ini .ini-h small{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;opacity:.92}#s-ini .ini-h b{display:block;font-size:38px;font-weight:900;letter-spacing:-.02em;margin-top:6px;line-height:1.05}' +
  '#s-ini .ini-p{display:inline-flex;align-items:center;gap:4px;margin-top:10px;border-radius:99px;padding:5px 11px;font-size:13.5px;font-weight:800;background:#16A34A;color:#fff}#s-ini .ini-p.baja{background:#B42318}#s-ini .ini-p span{font-weight:600;opacity:.9}' +
  '#s-ini .ini-h svg.sp{position:absolute;right:14px;bottom:12px;width:120px;height:48px;opacity:.55}' +
  '#s-ini .ini-k{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}#s-ini .ini-k div{background:var(--card);border-radius:18px;padding:12px;box-shadow:0 1px 3px rgba(15,27,61,.06)}' +
  '#s-ini .ini-k svg{width:24px;height:24px;stroke:var(--sell);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}#s-ini .ini-k small{display:block;font-size:12.5px;font-weight:700;color:var(--mut);margin-top:6px}#s-ini .ini-k b{display:block;font-size:19px;font-weight:900;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '#s-ini .ini-t{display:flex;align-items:center;justify-content:space-between;font-size:16px;font-weight:900;margin:20px 4px 8px}' +
  '#s-ini .ini-r{background:var(--card);border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(15,27,61,.06)}#s-ini .ini-r button{display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;color:var(--ink);font:inherit;font-size:15.5px;font-weight:700;padding:13px 14px;text-align:left;cursor:pointer}' +
  '#s-ini .ini-r button + button{border-top:1px solid var(--line)}#s-ini .ini-r i{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none}#s-ini .ini-r i svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
  '#s-ini .ini-r b{margin-left:auto;font-weight:900}#s-ini .ini-r em{margin-left:auto;font-style:normal;background:#D92D20;color:#fff;border-radius:99px;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;padding:0 7px}' +
  '#s-ini .ini-b{display:grid;gap:10px;margin-top:16px}#s-ini .ini-b button{display:flex;align-items:center;justify-content:center;gap:10px;border-radius:16px;padding:16px;font:inherit;font-size:17px;font-weight:800;cursor:pointer}' +
  '#s-ini .ini-b .b1{background:var(--btn);color:var(--btnink);border:0}#s-ini .ini-b .b2{background:transparent;color:var(--ink);border:2px solid var(--ink)}#s-ini .ini-b svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}';
const I2 = {
  chart: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 20v-6M10 20V9M15 20v-9M20 20V4"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/></svg>',
  box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></svg>',
  cash: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  spark: '<svg class="sp" viewBox="0 0 120 48" aria-hidden="true" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 40 22 34 40 37 58 26 76 28 94 15 118 6"/></svg>'
};
export function createInicioCom(X) {
  const { esc, money } = X;
  let cssOk = false, wired = false;
  function draw() {
    const box = X.$('s-ini'); if (!box) return;
    if (!cssOk) { cssOk = true; const st = document.createElement('style'); st.textContent = CSS2; document.head.appendChild(st); }
    if (!wired) { wired = true; box.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-inc]'); if (!b || !X.$('s-ini').contains(b)) return; X.show(b.dataset.inc); window.scrollTo(0, 0); }); }
    if (X.esGas && X.esGas()) return;
    const d = X.datos(), adm = X.isAdm();
    let h = '';
    if (adm) {
      const pct = d.ventasPrev > 0 ? Math.round((d.ventasMes - d.ventasPrev) / d.ventasPrev * 100) : null;
      h += '<div class="ini-h">' + I2.spark + '<small>' + I2.chart + 'Ganancia de este mes</small><b>' + money(d.ganMes) + '</b>' +
        (pct !== null ? '<span class="ini-p' + (pct < 0 ? ' baja' : '') + '">' + (pct < 0 ? I2.down : I2.arrow) + (pct > 0 ? '+' : '') + pct + '% <span>en ventas vs. el mes pasado</span></span>' : '') + '</div>';
    }
    h += '<div class="ini-k"><div>' + I2.cart + '<small>' + (adm ? 'Ventas hoy' : 'Mis ventas hoy') + '</small><b>' + (adm ? money(d.ventasHoy) : String(d.nHoy)) + '</b></div>' +
      '<div>' + I2.box + '<small>Productos vendidos</small><b>' + fmt(d.unidHoy) + '</b></div>' +
      '<div>' + I2.people + '<small>Clientes con deuda</small><b>' + d.deudores + '</b></div></div>';
    const rows = [];
    if (adm && d.cajaEf !== null && d.cajaEf !== undefined) rows.push(['caja', '#16A34A', I2.cash, 'Caja actual', '<b>' + money(d.cajaEf) + '</b>']);
    if (d.fiado) rows.push([d.fiado, '#2563EB', I2.card, 'Deuda de clientes', '<b>' + money(d.deuda) + '</b>']);
    if (d.stockBajo !== null && d.stockBajo !== undefined) rows.push([d.stkTab || 'stk', '#D97706', I2.alert, d.stockBajo ? 'Stock bajo (' + d.stockBajo + ')' : 'Stock al día', d.stockBajo ? '<em>!</em>' : '']);
    if (d.extra) rows.push([d.extra[0], '#7C3AED', I2.cal, d.extra[1], d.extra[2] ? '<b>' + esc(d.extra[2]) + '</b>' : '']);
    if (rows.length) h += '<div class="ini-t">Resumen rápido' + (adm && d.resTab ? '<button type="button" class="x" data-inc="' + d.resTab + '" style="font-size:14px;color:var(--sell);text-decoration:none;font-weight:800">Ver más ›</button>' : '') + '</div><div class="ini-r">' +
      rows.map((r) => '<button type="button" data-inc="' + r[0] + '"><i style="background:' + r[1] + '22;color:' + r[1] + '">' + r[2] + '</i>' + esc(r[3]) + r[4] + '</button>').join('') + '</div>';
    h += '<div class="ini-b"><button type="button" class="b1" data-inc="' + d.venta[0] + '">' + I2.cart + esc(d.venta[1]) + '</button>' + (d.stock ? '<button type="button" class="b2" data-inc="' + d.stock[0] + '">' + I2.box + esc(d.stock[1]) + '</button>' : '') + '</div>';
    box.innerHTML = h;
  }
  const fmt = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString('es-AR');
  return { draw };
}
