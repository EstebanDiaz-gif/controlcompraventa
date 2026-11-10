// Pedidos que entran a la app desde el catálogo (mesa con QR, retiro o envío).
// stores/{sid}/pedidos/{id} = { id, at, st, tipo: 'mesa'|'env'|'ret', mesa, cl, tel, dir, nota, it: [{ k, n, x, o, q, u, w, t }],
//   tot, env, pago, mp, src: 'web', min (minutos que dijo el local), acc, upd, imp (comanda impresa), cob (cobrado en la caja), pag (pagado online) }
// st: nuevo → ok (en preparación) → listo (mesa / retiro) o camino (envío) → entregado · o cancelado
// El local ve un botón flotante con los pedidos activos, suena una alerta cuando entra uno nuevo y, en la compu
// de la tiketera (si lo activó en Tiketera), la comanda sale sola cuando se acepta.

import { collection, doc, onSnapshot, query, where, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { tkConfig, imprimirComanda, codPedido } from './ticket.js';
import { qrCanvas } from './qr.js';

const ACTIVOS = ['nuevo', 'ok', 'listo', 'camino'];
const TIPO = { mesa: '🍽️ Mesa', env: '🛵 Envío', ret: '🏪 Retiro' };

export function createPedidos(X) {
  const { db, esc, money } = X;
  let un = null, sidOn = '', L = [], abierto = false, vistos = null, sonT = null, titT = null, titulo = '', audio = null, impresos = {};

  // ---------- estilos ----------
  if (!document.getElementById('pedcss')) {
    const st = document.createElement('style'); st.id = 'pedcss';
    st.textContent = '#pedfab{position:fixed;right:14px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:55;display:flex;align-items:center;gap:8px;border:0;border-radius:99px;padding:12px 18px;background:var(--ink);color:var(--bg);font:inherit;font-size:15px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer}' +
      '#pedfab b{background:#e11d48;color:#fff;border-radius:99px;min-width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0 7px;font-size:13px}' +
      '#pedfab.nuevo{background:#e11d48;color:#fff;animation:pedpul 1s ease-in-out infinite}#pedfab.nuevo b{background:#fff;color:#e11d48}' +
      '@keyframes pedpul{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(225,29,72,.55)}50%{transform:scale(1.06);box-shadow:0 0 0 14px rgba(225,29,72,0)}}' +
      '@media (min-width:900px){#pedfab{bottom:24px;right:24px}}' +
      '#pedp{position:fixed;inset:0;z-index:70;background:var(--bg);overflow:auto;padding:0 0 40px}' +
      '#pedp .ph{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px;background:var(--bg);border-bottom:1px solid var(--line)}' +
      '#pedp .pw{max-width:1100px;margin:0 auto;padding:6px 14px;display:grid;gap:14px}@media (min-width:900px){#pedp .pw{grid-template-columns:repeat(3,1fr);align-items:start}}' +
      '#pedp .pcol>h3{margin:12px 2px 8px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}' +
      '.pdc{background:var(--card);border-radius:18px;padding:14px;margin-bottom:10px;border:2px solid transparent}.pdc.nuevo{border-color:#e11d48}' +
      '.pdc .pt{display:flex;justify-content:space-between;align-items:center;gap:8px}.pdc .pt b{font-size:18px}.pdc .tg{border-radius:99px;padding:4px 10px;font-size:13px;font-weight:800;background:var(--line)}' +
      '.pdc .tg.mesa{background:#fde68a;color:#78350f}.pdc .tg.env{background:#dbeafe;color:#1e3a8a}.pdc .tg.ret{background:#dcfce7;color:#14532d}' +
      '.pdc .pm{font-size:13px;color:var(--mut);margin-top:4px}.pdc ul{list-style:none;margin:10px 0 0;padding:0}.pdc li{padding:6px 0;border-top:1px dashed var(--line);font-weight:700}' +
      '.pdc li small{display:block;font-weight:800;color:#b45309;text-transform:uppercase;font-size:12.5px;margin-top:2px}.pdc .nt{margin-top:8px;padding:8px 10px;border-radius:10px;background:#fef3c7;color:#78350f;font-weight:800}' +
      '.pdc .pf{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-weight:800}.pdc .ok{color:#15803d}' +
      '.pdc .pa{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.pdc .pa button,.pdc .pa a{flex:1 1 auto;border:0;border-radius:12px;padding:11px 12px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;background:var(--line);color:var(--ink);text-align:center;text-decoration:none}' +
      '.pdc .pa .pr{background:var(--btn);color:var(--btnink,#fff)}.pdc .pa .no{background:none;color:#b3261e;text-decoration:underline;flex:0 0 auto}' +
      '.pdc .mins{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}.pdc .mins button{border:0;border-radius:12px;padding:12px 0;font:inherit;font-weight:900;background:#16a34a;color:#fff;cursor:pointer}' +
      '#pedp .vac{text-align:center;color:var(--mut);padding:30px 10px}';
    document.head.appendChild(st);
  }

  // ---------- alerta: sonido, vibración y título ----------
  function sonar() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      [0, 0.18, 0.36, 0.9, 1.08, 1.26].forEach((d, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'square'; o.frequency.value = i % 3 === 2 ? 1320 : 990;
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.15);
        o.connect(g); g.connect(audio.destination); o.start(t0 + d); o.stop(t0 + d + 0.16);
      });
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]); } catch (e) {}
  }
  // el navegador solo deja sonar después de que la persona tocó algo en la página
  document.addEventListener('pointerdown', () => { try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) {} }, { once: true, capture: true });

  const nuevos = () => L.filter((p) => p.st === 'nuevo');
  function alerta() {
    const n = nuevos().length;
    clearInterval(sonT); clearInterval(titT); sonT = titT = null;
    if (titulo && !n) { document.title = titulo; titulo = ''; }
    if (!n) return;
    sonT = setInterval(() => { if (nuevos().length) sonar(); }, 8000);
    if (!titulo) titulo = document.title;
    let on = false; titT = setInterval(() => { on = !on; document.title = on ? '🛎️ (' + nuevos().length + ') Pedido nuevo' : titulo; }, 1000);
  }

  // ---------- datos ----------
  function start(sid) {
    if (un && sidOn === sid) return;
    stop(); sidOn = sid; vistos = null;
    un = onSnapshot(query(collection(db, 'stores', sid, 'pedidos'), where('st', 'in', ACTIVOS)), (sn) => {
      L = []; sn.forEach((d) => L.push(d.data()));
      L.sort((a, b) => (a.at || 0) - (b.at || 0));
      const ids = L.filter((p) => p.st === 'nuevo').map((p) => p.id);
      if (vistos && ids.some((id) => !vistos[id])) sonar();
      vistos = {}; L.forEach((p) => { vistos[p.id] = 1; });
      alerta(); comandas(); pintar();
      if (X.abrirAlInicio && X.abrirAlInicio() && L.length) abrir();
    }, (e) => { console.warn('Pedidos:', e && e.code); });
  }
  function stop() {
    if (un) { un(); un = null; } sidOn = ''; L = []; clearInterval(sonT); clearInterval(titT); sonT = titT = null;
    if (titulo) { document.title = titulo; titulo = ''; }
    const f = document.getElementById('pedfab'); if (f) f.remove(); cerrar();
  }
  const ref = (id) => doc(db, 'stores', sidOn, 'pedidos', id);
  const set = (id, o) => updateDoc(ref(id), Object.assign({ upd: Date.now() }, o)).catch((e) => X.fail(e));

  // Comanda automática: solo en el equipo que lo activó (Tiketera), para los pedidos aceptados que todavía no salieron.
  function comandas() {
    if (!tkConfig().com) return;
    L.filter((p) => p.st !== 'nuevo' && !p.imp && !impresos[p.id]).slice(0, 3).forEach((p, i) => {
      impresos[p.id] = 1;
      setTimeout(() => { imprimirComanda(p); updateDoc(ref(p.id), { imp: true }).catch(() => {}); }, i * 2500);
    });
  }

  // ---------- pantalla ----------
  const hace = (ms) => { const m = Math.max(0, Math.round((Date.now() - (ms || 0)) / 60000)); return m < 1 ? 'recién' : m < 60 ? 'hace ' + m + ' min' : 'hace ' + Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
  const hora = (ms) => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const waTel = (t) => { let n = String(t || '').replace(/\D/g, ''); if (!n) return ''; if (n.length <= 11 && n.indexOf('54') !== 0) n = '549' + n.replace(/^0/, ''); return n; };
  function tarjeta(p) {
    const n = (p.it || []).reduce((a, x) => a + (x.w ? 1 : (+x.q || 0)), 0), tp = TIPO[p.tipo] || 'Pedido';
    let h = '<div class="pdc ' + esc(p.st) + '" data-pid="' + esc(p.id) + '"><div class="pt"><b>#' + esc(codPedido(p.id)) + ' · ' + esc(p.cl || '') + '</b><span class="tg ' + esc(p.tipo) + '">' + tp + (p.tipo === 'mesa' ? ' ' + esc(p.mesa || '') : '') + '</span></div>' +
      '<div class="pm">' + hace(p.at) + ' · ' + hora(p.at || Date.now()) + (p.min && p.acc ? ' · listo ~' + hora(p.acc + p.min * 60000) : '') + ' · ' + n + ' producto' + (n === 1 ? '' : 's') + (p.imp ? ' · 🖨️ comanda impresa' : '') + '</div>';
    if (p.dir) h += '<div class="pm">📍 <a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.dir) + '" target="_blank" rel="noopener" style="color:inherit;font-weight:700">' + esc(p.dir) + '</a></div>';
    h += '<ul>' + (p.it || []).map((x) => '<li>' + (x.w ? esc(String(x.q).replace('.', ',')) + ' kg de ' : esc(x.q) + ' × ') + esc(x.n) + (x.x ? '<small>' + esc(x.x) + '</small>' : '') + '</li>').join('') + '</ul>';
    if (p.nota) h += '<div class="nt">📝 ' + esc(p.nota) + '</div>';
    h += '<div class="pf"><span>' + esc(p.pago || 'Pago a definir') + (p.pag ? ' <span class="ok">· pagado ✓</span>' : p.mp ? ' · <span style="color:#b45309">esperando el pago</span>' : '') + '</span><span>' + money(p.tot || 0) + '</span></div>';
    if (p.st === 'nuevo') h += '<div class="pm" style="margin-top:10px;font-weight:800;color:var(--ink)">Aceptar: ¿en cuánto está listo?</div><div class="mins">' + [10, 20, 30, 45].map((m) => '<button type="button" data-pa="ok" data-min="' + m + '">' + m + ' min</button>').join('') + '</div>';
    h += '<div class="pa">';
    if (p.st === 'ok') h += '<button type="button" class="pr" data-pa="' + (p.tipo === 'env' ? 'camino' : 'listo') + '">' + (p.tipo === 'env' ? '🛵 Salió el envío' : p.tipo === 'mesa' ? '✅ Listo, llevar a la mesa' : '✅ Listo para retirar') + '</button>';
    if (p.st === 'listo' || p.st === 'camino') h += '<button type="button" class="pr" data-pa="entregado">🎉 Entregado</button>';
    h += (p.cob ? '<button type="button" disabled>✓ Cobrado</button>' : '<button type="button" data-pa="caja">💵 Cobrar en la caja</button>') + '<button type="button" data-pa="com">🖨️ Comanda</button>';
    const w = waTel(p.tel); if (w) h += '<a href="https://wa.me/' + w + '?text=' + encodeURIComponent('Hola ' + (p.cl || '') + '! Te escribimos por tu pedido #' + codPedido(p.id) + ' en ' + (X.tienda() || 'el local') + '.') + '" target="_blank" rel="noopener">💬 WhatsApp</a>';
    if (p.st !== 'entregado') h += '<button type="button" class="no" data-pa="cancel">' + (p.st === 'nuevo' ? 'Rechazar' : 'Cancelar') + '</button>';
    return h + '</div></div>';
  }
  function pintar() {
    let f = document.getElementById('pedfab');
    const nn = nuevos().length;
    if (!L.length && !abierto) { if (f) f.remove(); return; }
    if (!f) { f = document.createElement('button'); f.id = 'pedfab'; f.type = 'button'; f.onclick = abrir; document.body.appendChild(f); }
    f.className = nn ? 'nuevo' : ''; f.hidden = abierto;
    f.innerHTML = '🛎️ ' + (nn ? (nn === 1 ? 'Pedido nuevo' : 'Pedidos nuevos') : 'Pedidos') + ' <b>' + (nn || L.length) + '</b>';
    if (abierto) dibujar();
  }
  function dibujar() {
    const p = document.getElementById('pedp'); if (!p) return;
    const col = (t, l, vac) => '<div class="pcol"><h3>' + t + ' (' + l.length + ')</h3>' + (l.length ? l.map(tarjeta).join('') : '<div class="vac">' + vac + '</div>') + '</div>';
    p.querySelector('.pw').innerHTML = col('🔔 Nuevos', L.filter((x) => x.st === 'nuevo'), 'Sin pedidos nuevos') +
      col('👨‍🍳 En preparación', L.filter((x) => x.st === 'ok'), 'Nada en preparación') +
      col('✅ Listos / en camino', L.filter((x) => x.st === 'listo' || x.st === 'camino'), 'Nada para entregar');
  }
  function abrir() {
    abierto = true; let p = document.getElementById('pedp');
    if (!p) {
      p = document.createElement('div'); p.id = 'pedp';
      p.innerHTML = '<div class="ph"><b style="font-size:20px">🛎️ Pedidos</b><div style="display:flex;gap:8px;align-items:center"><button type="button" class="x" data-pa="tk" style="font-size:14px;text-decoration:underline">Tiketera</button><button type="button" class="go alt" data-pa="cerrar" style="margin:0;padding:10px 16px;width:auto">Cerrar</button></div></div><div class="pw"></div>';
      p.addEventListener('click', clic); document.body.appendChild(p);
    }
    pintar(); dibujar();
  }
  function cerrar() { abierto = false; const p = document.getElementById('pedp'); if (p) p.remove(); pintar(); }
  function clic(e) {
    const b = e.target.closest('[data-pa]'); if (!b) return;
    const a = b.dataset.pa, c = b.closest('[data-pid]'), p = c ? L.find((x) => x.id === c.dataset.pid) : null;
    if (a === 'cerrar') { cerrar(); return; }
    if (a === 'tk') { X.tiketera(); return; }
    if (!p) return;
    if (a === 'ok') set(p.id, { st: 'ok', min: +b.dataset.min, acc: Date.now() });
    else if (a === 'listo' || a === 'camino' || a === 'entregado') set(p.id, { st: a });
    else if (a === 'com') { imprimirComanda(p); updateDoc(ref(p.id), { imp: true }).catch(() => {}); }
    else if (a === 'caja') { if (X.aCaja(p)) cerrar(); }
    else if (a === 'cancel') {
      const m = prompt(p.st === 'nuevo' ? '¿Rechazar el pedido #' + codPedido(p.id) + '? El cliente lo ve en su celular.\n\nMotivo (opcional, por ejemplo "nos quedamos sin pan"):' : '¿Cancelar el pedido #' + codPedido(p.id) + '?\n\nMotivo (opcional):', '');
      if (m === null) return; const o = { st: 'cancelado' }; if (m.trim()) o.mot = m.trim().slice(0, 120); set(p.id, o);
    }
  }

  // ---------- QR para las mesas: una hoja para imprimir, con un QR por mesa ----------
  function qrMesas(link, n, tienda, color) {
    n = Math.max(1, Math.min(60, Math.round(+n || 0)));
    const w = window.open('', '_blank'); if (!w) { alert('El navegador bloqueó la ventana. Permití ventanas emergentes para pekeronapp.com y probá de nuevo.'); return; }
    const url = (m) => link + (link.indexOf('?') >= 0 ? '&' : '?') + 'mesa=' + m;
    let h = '';
    for (let m = 1; m <= n; m++) h += '<div class="q"><div class="t">' + esc(tienda || '') + '</div><div class="m">MESA ' + m + '</div><img alt="" src="' + qrCanvas(url(m), 520, 2).toDataURL('image/png') + '"><div class="s">Escaneá, elegí y pedí desde tu mesa</div></div>';
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>QR de las mesas</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111}' +
      '.bar{position:sticky;top:0;background:#fff;padding:12px;text-align:center;border-bottom:1px solid #ddd}.bar button{font:inherit;font-weight:800;font-size:16px;padding:12px 22px;border:0;border-radius:12px;background:#111;color:#fff;cursor:pointer}' +
      '.g{display:grid;grid-template-columns:repeat(2,1fr);gap:8mm;padding:8mm}.q{border:2px dashed #bbb;border-radius:6mm;padding:6mm;text-align:center;break-inside:avoid}' +
      '.t{font-weight:800;font-size:15px}.m{font-weight:900;font-size:34px;letter-spacing:.06em;color:' + (/^#[0-9a-f]{6}$/i.test(color || '') ? color : '#111') + ';margin:2mm 0}.q img{width:58mm;height:58mm;image-rendering:pixelated}.s{font-size:13px;font-weight:600;color:#555;margin-top:2mm}' +
      '@media print{.bar{display:none}.g{padding:0}}</style></head><body><div class="bar"><button onclick="print()">🖨️ Imprimir</button></div><div class="g">' + h + '</div></body></html>');
    w.document.close();
  }

  return { start, stop, abrir, qrMesas, activos: () => L.length };
}
