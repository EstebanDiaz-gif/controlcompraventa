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
