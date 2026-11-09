// Ticket para tiketera (impresora térmica de 58 u 80 mm) conectada a la compu.
// Se imprime con el diálogo de impresión del navegador: la primera vez se elige la tiketera y Chrome la recuerda.
// La configuración es de cada equipo (localStorage), porque la tiketera está conectada a esa compu.

const KEY = 'pk_tk';
// puesto: esta compu imprime los tickets que mandan los celulares; remoto: este equipo los manda a la compu en vez de imprimir.
const DEF = { w: 58, auto: false, pie: '¡Gracias por tu compra!', puesto: false, remoto: false };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function tkConfig() {
  // Imprimir desde el celu en la compu (puesto / remoto) está pausado: se fuerza apagado aunque haya quedado guardado.
  let c; try { c = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { c = Object.assign({}, DEF); }
  c.puesto = false; c.remoto = false; return c;
}
export function tkGuardar(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-AR');
const kg = (q) => (Math.round(q * 1000) / 1000).toLocaleString('es-AR', { minimumFractionDigits: q < 1 ? 3 : 0, maximumFractionDigits: 3 }) + ' kg';
const fila = (a, b, cls) => '<div class="f' + (cls ? ' ' + cls : '') + '"><span>' + a + '</span><b>' + b + '</b></div>';

// t = { tienda, dir, tel, fecha (Date), atendio, nro, lineas:[{n,q,u,w}], dsc:{t,m}, env, tot, pago, paga, vuelto, cliente }
export function ticketHtml(t, cfg) {
  const c = cfg || tkConfig(), ancho = c.w === 80 ? 72 : 48, f = t.fecha || new Date();
  const fe = f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let h = '<div class="c big">' + esc(t.tienda || '') + '</div>';
  if (t.dir) h += '<div class="c">' + esc(t.dir) + '</div>';
  if (t.tel) h += '<div class="c">Tel: ' + esc(t.tel) + '</div>';
  h += '<hr>' + fila(fe, t.nro ? 'N° ' + esc(t.nro) : '') + (t.atendio ? '<div>Atendió: ' + esc(t.atendio) + '</div>' : '') + (t.cliente ? '<div>Cliente: ' + esc(t.cliente) + '</div>' : '') + '<hr>';
  (t.lineas || []).forEach((l) => {
    const tot = Math.round(l.q * l.u);
    h += '<div class="n">' + esc(l.n) + '</div>' + fila(l.w ? kg(l.q) + ' x ' + pesos(l.u) + '/kg' : (l.q !== 1 ? l.q + ' x ' + pesos(l.u) : ''), pesos(tot), 'd');
  });
  h += '<hr>';
  if (t.dsc && t.dsc.m) h += fila('Descuento' + (t.dsc.t ? ' (' + esc(t.dsc.t) + ')' : ''), '-' + pesos(t.dsc.m));
  if (t.env) h += fila('Envío', pesos(t.env));
  h += fila('TOTAL', pesos(t.tot), 'tot');
  if (t.pago) h += fila('Pago', esc(t.pago));
  if (t.paga > 0) h += fila('Paga con', pesos(t.paga)) + fila('Vuelto', pesos(t.vuelto || 0));
  h += '<hr>' + (c.pie ? '<div class="c">' + esc(c.pie) + '</div>' : '') + '<div class="c chico">Comprobante no válido como factura</div>';
  return '<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title><style>' +
    '@page{size:' + c.w + 'mm 200mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}' +
    'body{width:' + ancho + 'mm;margin:0 auto;padding:2mm 0 6mm;font:' + (c.w === 80 ? 13 : 11.5) + 'px/1.3 "Courier New",ui-monospace,monospace;-webkit-print-color-adjust:exact}' +
    '.c{text-align:center}.big{font-size:1.35em;font-weight:900;margin-bottom:1mm}.chico{font-size:.85em;margin-top:1mm}' +
    'hr{border:0;border-top:1px dashed #000;margin:1.5mm 0}.f{display:flex;justify-content:space-between;gap:2mm}.f b{white-space:nowrap}' +
    '.n{font-weight:700;margin-top:.8mm;word-break:break-word}.d span{padding-left:2mm}.tot{font-size:1.3em;font-weight:900;margin:1mm 0}' +
    '</style></head><body>' + h + '</body></html>';
}

// Imprime con un iframe oculto (no abre ventanas nuevas, así el navegador no lo bloquea).
export function imprimirTicket(t, cfg) {
  const old = document.getElementById('tkframe'); if (old) old.remove();
  const fr = document.createElement('iframe'); fr.id = 'tkframe';
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(fr);
  const c = cfg || tkConfig(), d = fr.contentWindow.document; d.open(); d.write(ticketHtml(t, c)); d.close();
  setTimeout(() => { try {
    // El largo de la hoja = el largo del ticket (si no, la tiketera tira papel de más o achica la letra).
    const mm = Math.ceil(d.body.scrollHeight * 25.4 / 96) + 8, st = d.createElement('style');
    st.textContent = '@page{size:' + c.w + 'mm ' + Math.max(40, mm) + 'mm;margin:0}'; d.head.appendChild(st);
    fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { alert('No pude imprimir el ticket: ' + (e && e.message)); } }, 250);
}

// Ventana de configuración de la tiketera (ancho del papel, imprimir sola al cobrar, mensaje al pie, prueba).
export function abrirTiketera(ejemplo, onGuardar) {
  const c = tkConfig(), old = document.getElementById('tkdlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'tkdlg';
  d.style.cssText = 'position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  const seg = [58, 80].map((w) => '<button type="button" data-tkw="' + w + '" style="flex:1;border:0;border-radius:10px;padding:10px 6px;font:inherit;font-weight:700;cursor:pointer">' + w + ' mm</button>').join('');
  d.innerHTML = '<div style="background:var(--bg,#fff);color:var(--ink,#111);width:100%;max-width:440px;max-height:92vh;overflow:auto;border-radius:20px;padding:18px 16px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:19px">🧾 Tiketera</b><button type="button" class="x" data-tkx="1">Cerrar</button></div>' +
    '<div class="k" style="margin-top:4px">Para la tiketera conectada a esta compu. La primera vez, en la ventana de impresión elegí tu tiketera como impresora: después Chrome la recuerda.</div>' +
    '<label style="margin-top:12px">Ancho del papel</label><div style="display:flex;gap:6px;background:var(--card,#f4f3f0);padding:5px;border-radius:14px">' + seg + '</div>' +
    '<div class="k" style="margin-top:4px">La más común es la de 58 mm (rollo angosto). La de 80 mm es la del rollo ancho.</div>' +
    '<label style="display:flex;gap:10px;align-items:center;margin-top:14px;font-weight:600"><input id="tkauto" type="checkbox" style="width:auto;margin:0"' + (c.auto ? ' checked' : '') + '> Imprimir el ticket solo, cada vez que cobro</label>' +

    '<label style="margin-top:12px">Mensaje al pie del ticket</label><input id="tkpie" maxlength="60" value="' + esc(c.pie) + '">' +
    '<button type="button" class="go" id="tkpr" style="margin-top:14px">Imprimir ticket de prueba</button>' +
    '<button type="button" class="go alt" id="tkok" style="margin-top:8px">Guardar</button></div>';
  document.body.appendChild(d);
  const $ = (id) => d.querySelector('#' + id);
  let w = c.w;
  const marcar = () => d.querySelectorAll('[data-tkw]').forEach((b) => { const on = +b.dataset.tkw === w; b.style.background = on ? 'var(--btn,#1D3FAF)' : 'transparent'; b.style.color = on ? 'var(--btnink,#fff)' : 'var(--ink,#111)'; });
  const leer = () => ({ w, auto: $('tkauto').checked, pie: $('tkpie').value.trim(), puesto: false, remoto: false });
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-tkx]')) { d.remove(); return; }
    const b = e.target.closest('[data-tkw]'); if (b) { w = +b.dataset.tkw; marcar(); }
  });
  $('tkpr').onclick = () => { const cf = leer(); tkGuardar(cf); if (onGuardar) onGuardar(cf, ejemplo); else imprimirTicket(ejemplo, cf); };
  $('tkok').onclick = () => { tkGuardar(leer()); d.remove(); if (onGuardar) onGuardar(tkConfig()); };
  marcar();
  return d;
}
