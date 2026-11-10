// Pedidos que entran a la app desde el catálogo (mesa con QR, retiro o envío) y los que se cargan en el mostrador.
// stores/{sid}/pedidos/{id} = { id, at, st, tipo: 'mesa'|'env'|'ret', mesa, cl, tel, dir, nota, it: [{ k, n, x, o, q, u, w, t }],
//   tot, env, pago, paga (con cuánto paga), mp, src: 'web'|'local', min (minutos que dijo el local), acc, upd,
//   imp (comanda impresa), cob (cobrado en la caja), pag (pagado con Mercado Pago), pg (marcado pagado a mano), mot }
// st: nuevo → ok (en preparación) → listo → camino (solo envío) → entregado · o cancelado
// Pantalla pensada para el celu (solapas y un botón grande con la próxima acción) que en la compu se ve en columnas.

import { collection, doc, onSnapshot, query, where, updateDoc, setDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { tkConfig, imprimirComanda, codPedido } from './ticket.js';
import { qrCanvas } from './qr.js';

const ACTIVOS = ['nuevo', 'ok', 'listo', 'camino'];
const TIPO = { mesa: ['🍽️', 'Mesa'], env: ['🛵', 'Delivery'], ret: ['🏪', 'Retiro'] };
const EST = { nuevo: ['Nuevo', 'n'], ok: ['Preparando', 'p'], listo: ['Listo', 'l'], camino: ['En camino', 'c'], entregado: ['Entregado', 'e'], cancelado: ['Cancelado', 'x'] };
const SOLAPAS = [['nuevo', 'Nuevos'], ['ok', 'En curso'], ['listo', 'Listos'], ['camino', 'En camino']];

// Próxima acción de cada pedido: [estado nuevo, ícono, texto del botón]
function proxima(p) {
  if (p.st === 'nuevo') return ['ok', '✓', 'Aceptar'];
  if (p.st === 'ok') return ['listo', '🛎️', 'Marcar listo'];
  if (p.st === 'listo') return p.tipo === 'env' ? ['camino', '🛵', 'Enviar pedido'] : p.tipo === 'mesa' ? ['entregado', '🍽️', 'Llevado a la mesa'] : ['entregado', '🤝', 'Entregar'];
  if (p.st === 'camino') return ['entregado', '🏁', 'Confirmar entrega'];
  return null;
}
const pago = (p) => !!(p.pag || p.pg || p.cob);

export function createPedidos(X) {
  const { db, esc, money } = X;
  let un = null, sidOn = '', L = [], abierto = false, vistos = null, sonT = null, titT = null, titulo = '', audio = null, impresos = {};
  let tab = 'nuevo', modo = 'act', busca = '', HIST = null, det = null;

  // ---------- estilos ----------
  if (!document.getElementById('pedcss')) {
    const st = document.createElement('style'); st.id = 'pedcss';
    st.textContent = [
      '#pedfab{position:fixed;right:14px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:55;display:flex;align-items:center;gap:8px;border:0;border-radius:99px;padding:12px 18px;background:#111827;color:#fff;font:inherit;font-size:15px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer}',
      '#pedfab b{background:#e11d48;color:#fff;border-radius:99px;min-width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0 7px;font-size:13px}',
      '#pedfab.nuevo{background:#e11d48;animation:pedpul 1s ease-in-out infinite}#pedfab.nuevo b{background:#fff;color:#e11d48}',
      '@keyframes pedpul{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(225,29,72,.55)}50%{transform:scale(1.05);box-shadow:0 0 0 14px rgba(225,29,72,0)}}',
      '@media (min-width:900px){#pedfab{bottom:24px;right:24px}}',
      '#pedp{--pa:var(--btn,#1D3FAF);--pf:#F3F4F8;--pl:#E7E8EF;--pt:#111827;--pm:#6B7280;position:fixed;inset:0;z-index:70;background:var(--pf);color:var(--pt);overflow:auto;font-size:15px;padding-bottom:110px}',
      '#pedp .pph{position:sticky;top:0;z-index:3;background:#fff;padding:calc(10px + env(safe-area-inset-top)) 14px 0;box-shadow:0 1px 0 var(--pl)}',
      '#pedp .ppt{display:flex;align-items:center;gap:8px}',
      '#pedp .pph>*{max-width:1076px;margin-left:auto!important;margin-right:auto!important}',
      '#pedp .plg{width:40px;height:40px;border-radius:50%;background:var(--pa);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;flex:none;overflow:hidden}#pedp .plg img{width:100%;height:100%;object-fit:cover}',
      '#pedp .pch{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:99px;padding:8px 12px;font:inherit;font-size:13.5px;font-weight:700;background:var(--pf);color:var(--pt);cursor:pointer;text-decoration:none;white-space:nowrap}',
      '#pedp .pch.ab{background:#ECFDF5;color:#047857;border:1.5px solid #A7F3D0}#pedp .pch.ab i{width:8px;height:8px;border-radius:50%;background:#10B981}',
      '#pedp .pch.ce{background:#FEF2F2;color:#B91C1C;border:1.5px solid #FECACA}#pedp .pch.ce i{width:8px;height:8px;border-radius:50%;background:#EF4444}',
      '#pedp .px{margin-left:auto;width:40px;height:40px;border-radius:50%;border:0;background:var(--pf);font-size:20px;cursor:pointer;color:var(--pt)}',
      '#pedp h2{margin:12px 2px 8px;font-size:24px;font-weight:900;letter-spacing:-.01em}',
      '#pedp .pfl{display:flex;align-items:center;gap:6px}#pedp .pfl .pm{border:0;background:none;font:inherit;font-weight:700;font-size:14px;color:var(--pm);padding:8px 12px;border-radius:99px;cursor:pointer}#pedp .pfl .pm.on{background:var(--pa);color:#fff}',
      '#pedp .pse{flex:1;min-width:0;display:flex;align-items:center;gap:6px;margin-left:4px;color:var(--pm)}#pedp .pse input{flex:1;min-width:0;border:0;background:none;font:inherit;font-size:14.5px;outline:none;color:var(--pt);padding:8px 0}',
      '#pedp .pts{display:grid;grid-template-columns:repeat(4,1fr);margin-top:6px}#pedp .pts button{display:flex;flex-direction:column;align-items:center;white-space:nowrap;border:0;background:none;font:inherit;font-size:14px;font-weight:600;color:var(--pm);padding:8px 2px 10px;border-bottom:2.5px solid transparent;cursor:pointer}',
      '#pedp .pts button b{display:flex;align-items:center;justify-content:center;min-width:20px;height:20px;font-size:12px;font-weight:700;margin-top:3px}#pedp .pts button.on{color:var(--pa);font-weight:800;border-bottom-color:var(--pa)}',
      '#pedp .pts button.hay b{border-radius:99px;background:var(--pa);color:#fff;padding:0 6px}#pedp .pts button.alerta b{background:#e11d48}',
      '#pedp .pls{max-width:1100px;margin:0 auto;padding:12px;display:grid;gap:10px;align-items:start}@media (min-width:760px){#pedp .pls{grid-template-columns:repeat(2,1fr)}}@media (min-width:1150px){#pedp .pls{grid-template-columns:repeat(3,1fr)}}',
      '.pk{background:#fff;border-radius:16px;padding:14px;display:flex;gap:10px;cursor:pointer;border:2px solid transparent;box-shadow:0 1px 2px rgba(0,0,0,.04)}.pk.nuevo{border-color:#e11d48}.pk.tarde{border-color:#F59E0B}',
      '.pk .pki{flex:1;min-width:0}.pk .pkt{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.pk .pkt b{font-size:16px;font-weight:900;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.pk .pkt b span{font-weight:600;color:var(--pm)}',
      '.pk .pkm{color:var(--pm);font-size:14px;margin-top:5px}.pk .pkp{margin-top:4px;font-size:14px;color:var(--pm)}.pk .pkp b{font-size:18px;color:var(--pt);font-weight:900}',
      '.pk .pkr{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex:none}.pk .tm{font-size:13px;font-weight:700;color:var(--pm);white-space:nowrap}.pk .tm.tarde{color:#B45309;background:#FEF3C7;border-radius:99px;padding:2px 8px}',
      '.pk .pka{width:104px;min-height:74px;border:0;border-radius:14px;background:var(--pa);color:#fff;font:inherit;font-size:13px;font-weight:800;line-height:1.15;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px}.pk .pka i{font-style:normal;font-size:20px}',
      '.pk .pka.ac{background:#16A34A}',
      '.ppg{display:inline-flex;align-items:center;gap:7px;border:0;background:none;font:inherit;font-size:14px;font-weight:700;color:var(--pm);padding:6px 0 0;cursor:pointer}.ppg i{width:20px;height:20px;border-radius:50%;border:2px solid #9CA3AF;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:12px}',
      '.ppg.si{color:#15803D}.ppg.si i{border-color:#16A34A;background:#16A34A;color:#fff}',
      '.pbg{display:inline-flex;align-items:center;border-radius:99px;padding:3px 9px;font-size:12px;font-weight:800}.pbg.n{background:#FFE4E6;color:#BE123C}.pbg.p{background:#EDE9FE;color:#6D28D9}.pbg.l{background:#DCFCE7;color:#15803D}.pbg.c{background:#DBEAFE;color:#1D4ED8}.pbg.e{background:#F3F4F6;color:#374151}.pbg.x{background:#FEE2E2;color:#B91C1C}',
      '.pbg.t{background:#FFF7ED;color:#C2410C}.pbg.mesa{background:#FEF3C7;color:#92400E}',
      '#pedp .pvac{grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--pm)}#pedp .pvac i{display:inline-flex;width:84px;height:84px;border-radius:50%;background:#EEF0FF;align-items:center;justify-content:center;font-size:36px;font-style:normal;margin-bottom:12px}#pedp .pvac b{display:block;color:var(--pt);font-size:17px;margin-bottom:4px}',
      '#pedp .pnv{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(22px + env(safe-area-inset-bottom));z-index:4;border:0;border-radius:99px;background:var(--pa);color:#fff;font:inherit;font-size:16px;font-weight:800;padding:14px 26px;box-shadow:0 10px 26px rgba(0,0,0,.25);cursor:pointer}',
      /* detalle */
      '#pedd{position:fixed;inset:0;z-index:72;background:rgba(17,24,39,.5);display:flex;align-items:flex-end;justify-content:center}',
      '#pedd .pdw{background:#fff;color:#111827;width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:24px 24px 0 0;padding:10px 16px 0;animation:pdup .22s ease}@media (min-width:700px){#pedd{align-items:center}#pedd .pdw{border-radius:24px}}',
      '@keyframes pdup{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}',
      '#pedd .pgr{width:44px;height:5px;border-radius:3px;background:#E5E7EB;margin:0 auto 12px}#pedd h3{margin:0;font-size:22px;font-weight:900}#pedd .pds{color:#6B7280;font-size:14px;margin-top:2px}',
      '#pedd .pbx{background:#F3F4F8;border-radius:16px;padding:12px;margin-top:12px}#pedd .pbx>small{display:block;font-weight:800;color:#6B7280;font-size:12.5px;margin-bottom:8px}',
      '#pedd .pli{background:#fff;border-radius:12px;padding:10px 12px;margin-top:6px;display:flex;justify-content:space-between;gap:10px;font-weight:700}#pedd .pli em{font-style:normal;color:var(--btn,#1D3FAF);font-weight:900}#pedd .pli small{display:block;color:#6B7280;font-weight:600;margin-top:2px}',
      '#pedd .pnt{margin-top:8px;padding:10px 12px;border-radius:12px;background:#FEF3C7;color:#78350F;font-weight:800}',
      '#pedd .pbt{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}#pedd .pbt a,#pedd .pbt button{display:flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:12px;background:#fff;color:#111827;font:inherit;font-weight:800;font-size:14.5px;padding:12px;text-decoration:none;cursor:pointer}',
      '#pedd .prw{display:flex;justify-content:space-between;padding:3px 0;color:#4B5563}#pedd .prw.t{color:#111827;font-weight:900;font-size:18px;border-top:1px solid #E5E7EB;margin-top:6px;padding-top:8px}#pedd .prw.v{color:#15803D;font-weight:800}',
      '#pedd .pft{position:sticky;bottom:0;background:#fff;display:flex;gap:8px;padding:12px 0 calc(14px + env(safe-area-inset-bottom));margin-top:12px;border-top:1px solid #F3F4F6}',
      '#pedd .pft button{border:0;border-radius:14px;padding:15px 16px;font:inherit;font-weight:800;font-size:15px;cursor:pointer}#pedd .pft .sec{background:#F3F4F8;color:#111827}#pedd .pft .pri{flex:1;background:var(--btn,#1D3FAF);color:#fff}#pedd .pft .pri.ac{background:#16A34A}',
      '#pedd .pmn{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}#pedd .pmn button{border:0;border-radius:14px;padding:16px 0;font:inherit;font-weight:900;font-size:16px;background:#16A34A;color:#fff;cursor:pointer}',
      '#pedd .pes button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:#F3F4F8;border-radius:12px;padding:13px 14px;margin-top:6px;font:inherit;font-weight:700;cursor:pointer;color:#111827}#pedd .pes button.on{background:#EEF2FF;color:var(--btn,#1D3FAF)}',
      '#pedd .plk{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}#pedd .plk button{flex:1 1 auto;border:0;border-radius:12px;background:#F3F4F8;color:#111827;font:inherit;font-weight:700;font-size:14px;padding:11px 12px;cursor:pointer}#pedd .plk .rj{background:none;color:#B91C1C;text-decoration:underline;flex:0 0 auto}',
    ].join('');
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
    if (un && sidOn === sid) { pintar(); return; }
    stop(); sidOn = sid; vistos = null;
    un = onSnapshot(query(collection(db, 'stores', sid, 'pedidos'), where('st', 'in', ACTIVOS)), (sn) => {
      L = []; sn.forEach((d) => L.push(d.data()));
      L.sort((a, b) => (a.at || 0) - (b.at || 0));
      const ids = L.filter((p) => p.st === 'nuevo').map((p) => p.id);
      if (vistos && ids.some((id) => !vistos[id])) { sonar(); if (abierto && modo === 'act') tab = 'nuevo'; }
      vistos = {}; L.forEach((p) => { vistos[p.id] = 1; });
      if (det) { const d2 = L.find((x) => x.id === det.id); if (d2) det = d2; }
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
  function cargarHist() {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); HIST = null; dibujar();
    getDocs(query(collection(db, 'stores', sidOn, 'pedidos'), where('at', '>=', d0.getTime() - 86400000)))
      .then((sn) => { const l = []; sn.forEach((d) => { const x = d.data(); if (x.st === 'entregado' || x.st === 'cancelado') l.push(x); }); l.sort((a, b) => (b.upd || b.at || 0) - (a.upd || a.at || 0)); HIST = l; dibujar(); })
      .catch(() => { HIST = []; dibujar(); });
  }

  // ---------- pantalla ----------
  const mins = (ms) => Math.max(0, Math.floor((Date.now() - (ms || 0)) / 60000));
  const reloj = (ms) => { const m = mins(ms); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };
  const hora = (ms) => new Date(ms || Date.now()).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const waTel = (t) => { let n = String(t || '').replace(/\D/g, ''); if (!n) return ''; if (n.length <= 11 && n.indexOf('54') !== 0) n = '549' + n.replace(/^0/, ''); return n; };
  const cuantos = (p) => (p.it || []).reduce((a, x) => a + (x.w ? 1 : (+x.q || 0)), 0);
  const tarde = (p) => p.st !== 'entregado' && p.st !== 'cancelado' && mins(p.at) >= Math.max(20, (p.min || 0) + 5);
  const tipoTxt = (p) => (TIPO[p.tipo] || ['🛎️', 'Pedido'])[0] + ' ' + (p.tipo === 'mesa' ? 'Mesa ' + (p.mesa || '') : (TIPO[p.tipo] || ['', 'Pedido'])[1]);
  const nombre = (p) => (p.cl || 'Cliente').trim();

  function tarjeta(p, conEstado) {
    const nx = proxima(p), e = EST[p.st] || ['', 'e'];
    return '<div class="pk' + (p.st === 'nuevo' ? ' nuevo' : tarde(p) ? ' tarde' : '') + '" data-pid="' + esc(p.id) + '"><div class="pki">' +
      '<div class="pkt"><b><span>#' + esc(codPedido(p.id)) + '</span> ' + esc(nombre(p)) + '</b>' + (conEstado ? '<span class="pbg ' + e[1] + '">' + e[0] + '</span>' : '') + '</div>' +
      '<div class="pkm">' + tipoTxt(p) + (p.src === 'local' ? ' · mostrador' : '') + ' · ' + cuantos(p) + ' producto' + (cuantos(p) === 1 ? '' : 's') + '</div>' +
      '<div class="pkp"><b>' + money(p.tot || 0) + '</b> · ' + esc(p.pago || 'A definir') + '</div>' +
      '<button type="button" class="ppg' + (pago(p) ? ' si' : '') + '" data-pq="pg"><i>' + (pago(p) ? '✓' : '') + '</i>' + (pago(p) ? 'Está pago' : 'Sin pagar') + '</button></div>' +
      '<div class="pkr"><span class="tm' + (tarde(p) ? ' tarde' : '') + '">🕒 ' + reloj(p.at) + '</span>' +
      (nx ? '<button type="button" class="pka' + (p.st === 'nuevo' ? ' ac' : '') + '" data-pq="next"><i>' + nx[1] + '</i>' + nx[2] + '</button>' : '') + '</div></div>';
  }
  function pintar() {
    let f = document.getElementById('pedfab');
    const nn = nuevos().length;
    if (!sidOn || (!L.length && !abierto)) { if (f) f.remove(); return; }
    if (!f) { f = document.createElement('button'); f.id = 'pedfab'; f.type = 'button'; f.onclick = abrir; document.body.appendChild(f); }
    f.className = nn ? 'nuevo' : ''; f.hidden = abierto;
    f.innerHTML = '🛎️ ' + (nn ? (nn === 1 ? 'Pedido nuevo' : 'Pedidos nuevos') : 'Pedidos') + ' <b>' + (nn || L.length) + '</b>';
    if (abierto) dibujar();
    if (det) detalle(det.id, true);
  }
  function cabecera() {
    const pub = (X.pub && X.pub()) || {}, cerr = !!pub.cerr, adm = X.isAdm && X.isAdm(), lg = pub.logo || '';
    const cnt = (k) => L.filter((p) => p.st === k).length;
    return '<div class="ppt"><span class="plg">' + (/^(data:image|https:)/.test(lg) ? '<img alt="" src="' + esc(lg) + '">' : esc((X.tienda() || 'P').charAt(0).toUpperCase())) + '</span>' +
      '<a class="pch" href="' + esc(X.catLink ? X.catLink() : '#') + '" target="_blank" rel="noopener">👁️ Ver menú</a>' +
      (adm ? '<button type="button" class="pch ' + (cerr ? 'ce' : 'ab') + '" data-pa="abierto" title="Tocá para ' + (cerr ? 'abrir' : 'cerrar') + '"><i></i>' + (cerr ? 'Cerrado' : 'Abierto') + '</button>' : '<span class="pch ' + (cerr ? 'ce' : 'ab') + '"><i></i>' + (cerr ? 'Cerrado' : 'Abierto') + '</span>') +
      '<button type="button" class="px" data-pa="cerrar" aria-label="Cerrar">×</button></div>' +
      '<h2>Pedidos</h2>' +
      '<div class="pfl"><button type="button" class="pm' + (modo === 'todos' ? ' on' : '') + '" data-pa="todos">Todos</button><button type="button" class="pm' + (modo === 'hist' ? ' on' : '') + '" data-pa="hist">Historial</button>' +
      '<label class="pse">🔍<input id="pedq" type="search" placeholder="Buscar…" value="' + esc(busca) + '" autocomplete="off"></label>' +
      '<button type="button" class="pch" data-pa="tk" title="Tiketera">🖨️</button></div>' +
      '<div class="pts">' + SOLAPAS.map((s) => { const n = cnt(s[0]); return '<button type="button" class="' + (modo === 'act' && tab === s[0] ? 'on' : '') + (n ? ' hay' : '') + (s[0] === 'nuevo' && n ? ' alerta' : '') + '" data-tab="' + s[0] + '">' + s[1] + '<b>' + n + '</b></button>'; }).join('') + '</div>';
  }
  function lista() {
    const q = busca.trim().toLowerCase();
    const filtra = (l) => (q ? l.filter((p) => (codPedido(p.id) + ' ' + (p.cl || '') + ' ' + (p.mesa ? 'mesa ' + p.mesa : '') + ' ' + (p.tel || '') + ' ' + (p.dir || '')).toLowerCase().indexOf(q) >= 0) : l);
    if (modo === 'hist') {
      if (!HIST) return '<div class="pvac">Cargando…</div>';
      const l = filtra(HIST);
      return l.length ? l.map((p) => tarjeta(p, true)).join('') : vacio('📭', 'Sin pedidos terminados', 'Acá ves los entregados y cancelados de hoy y ayer.');
    }
    const l = filtra(modo === 'todos' ? L.slice().reverse() : L.filter((p) => p.st === tab));
    if (l.length) return l.map((p) => tarjeta(p, modo === 'todos')).join('');
    return modo === 'todos' ? vacio('📭', 'No hay pedidos activos', 'Los pedidos de tu menú entran acá solos, sin recargar la página.')
      : tab === 'nuevo' ? vacio('📥', 'No hay pedidos nuevos', 'Los pedidos de tu menú entran acá solos, sin recargar la página.')
      : vacio(tab === 'ok' ? '👨‍🍳' : tab === 'listo' ? '✅' : '🛵', 'Nada por acá', tab === 'ok' ? 'Los pedidos que aceptás aparecen acá mientras se preparan.' : tab === 'listo' ? 'Cuando marcás un pedido como listo, aparece acá.' : 'Los envíos que salieron aparecen acá hasta que confirmás la entrega.');
  }
  const vacio = (ic, t, s) => '<div class="pvac"><i>' + ic + '</i><b>' + t + '</b>' + s + '</div>';
  function dibujar() {
    const p = document.getElementById('pedp'); if (!p) return;
    const ae = document.activeElement, enQ = ae && ae.id === 'pedq', pos = enQ ? ae.selectionStart : 0;
    p.querySelector('.pph').innerHTML = cabecera(); p.querySelector('.pls').innerHTML = lista();
    if (enQ) { const i = document.getElementById('pedq'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) {} }
  }
  function abrir() {
    abierto = true; let p = document.getElementById('pedp');
    if (!p) {
      p = document.createElement('div'); p.id = 'pedp';
      p.innerHTML = '<div class="pph"></div><div class="pls"></div><button type="button" class="pnv" data-pa="nuevo">＋ Nuevo pedido</button>';
      p.addEventListener('click', clic);
      p.addEventListener('input', (e) => { if (e.target.id === 'pedq') { busca = e.target.value; p.querySelector('.pls').innerHTML = lista(); } });
      document.body.appendChild(p);
    }
    if (nuevos().length) { modo = 'act'; tab = 'nuevo'; }
    pintar(); dibujar();
  }
  function cerrar() { abierto = false; det = null; ['pedp', 'pedd'].forEach((i) => { const e = document.getElementById(i); if (e) e.remove(); }); pintar(); }

  // ---------- acciones ----------
  function avanzar(p, desde) {
    const nx = proxima(p); if (!nx) return;
    if (nx[0] === 'ok') { aceptar(p); return; }
    if (nx[0] === 'entregado' && !p.cob && X.cobrar) { cobrarDlg(p, 'entregado'); return; }   // al entregar: ¿lo cobraste?
    set(p.id, { st: nx[0] }); online(p);
    if (desde === 'det') cerrarDet();
  }
  // ---------- cobro: el pedido pagado se registra como venta (Resumen, stock y caja), sin pasar por la caja ----------
  const PAYS = [['ef', '💵', 'Efectivo'], ['tr', '🏦', 'Transferencia'], ['tj', '💳', 'Tarjeta'], ['qr', '📱', 'QR / Mercado Pago']];
  const payDe = (t) => { t = String(t || '').toLowerCase(); return /efect/.test(t) ? 'ef' : /transf/.test(t) ? 'tr' : /tarj|d[eé]bito|cr[eé]dito/.test(t) ? 'tj' : /mercado|qr|online/.test(t) ? 'qr' : ''; };
  function registrar(p, pay, extra) {
    const r = X.cobrar && X.cobrar(p, pay);
    if (!r) { set(p.id, Object.assign({ pg: true }, extra || {})); return Promise.resolve(); }
    return r.then(() => { if (extra) return set(p.id, extra); }).catch((e) => X.fail(e));
  }
  // Pagado online con Mercado Pago: la venta se registra sola la primera vez que el local lo mueve.
  function online(p) { if (p.pag && !p.cob && X.cobrar) registrar(p, 'qr'); }
  function cobrarDlg(p, luego) {
    det = p; const sug = payDe(p.pago) || 'ef', ent = luego === 'entregado';
    hoja('<div class="pgr"></div><h3>' + (ent ? '¿Ya lo cobraste?' : '¿Cómo pagó?') + '</h3><div class="pds">#' + esc(codPedido(p.id)) + ' · ' + esc(nombre(p)) + ' · <b>' + money(p.tot || 0) + '</b>' + (p.paga > 0 ? ' · abona con ' + money(p.paga) + ' (vuelto ' + money(Math.max(0, p.paga - (p.tot || 0))) + ')' : '') + '</div>' +
      '<div class="pds" style="margin-top:6px">La venta queda registrada en el Resumen y se descuenta del stock.</div>' +
      '<div class="pes">' + PAYS.map((x) => '<button type="button" data-pd="cob" data-pay="' + x[0] + '"' + (ent ? ' data-luego="entregado"' : '') + ' class="' + (x[0] === sug ? 'on' : '') + '">' + x[1] + ' ' + x[2] + (x[0] === sug && p.pago ? ' · eligió el cliente' : '') + '</button>').join('') + '</div>' +
      '<div class="pft">' + (ent ? '<button type="button" class="sec" data-pd="sinco" style="flex:1">Todavía no lo pagó</button>' : '<button type="button" class="sec" data-pd="volver" style="flex:1">Cancelar</button>') + '</div>');
  }
  function aceptar(p) {
    det = p; hoja('<div class="pgr"></div><h3>Aceptar #' + esc(codPedido(p.id)) + '</h3><div class="pds">¿En cuánto está listo? El cliente lo ve en su celular.</div>' +
      '<div class="pmn">' + [10, 15, 20, 30, 45, 60].map((m) => '<button type="button" data-pd="min" data-m="' + m + '">' + m + ' min</button>').join('') + '</div>' +
      '<div class="pft"><button type="button" class="sec" data-pd="volver">Volver</button><button type="button" class="pri ac" data-pd="min" data-m="0">Aceptar sin tiempo</button></div>');
  }
  function togPago(p) {
    if (p.cob) { alert('Este pedido ya está cobrado y registrado como venta' + (p.cpay ? ' (' + p.cpay + ')' : '') + '. Si hubo un error, anulá la venta desde el Resumen.'); return; }
    if (p.pag) { if (confirm('Este pedido se pagó online con Mercado Pago. ¿Lo registro ahora como venta?')) registrar(p, 'qr'); return; }
    if (!X.cobrar) { set(p.id, { pg: !p.pg }); return; }
    cobrarDlg(p);
  }
  function cancelar(p) {
    const m = prompt((p.st === 'nuevo' ? '¿Rechazar' : '¿Cancelar') + ' el pedido #' + codPedido(p.id) + '? El cliente lo ve en su celular.\n\nMotivo (opcional, por ejemplo "nos quedamos sin pan"):', '');
    if (m === null) return; const o = { st: 'cancelado' }; if (m.trim()) o.mot = m.trim().slice(0, 120); set(p.id, o); cerrarDet();
  }
  function clic(e) {
    const b = e.target.closest('[data-pa],[data-tab],[data-pq]'), card = e.target.closest('[data-pid]');
    const p = card ? (L.find((x) => x.id === card.dataset.pid) || (HIST || []).find((x) => x.id === card.dataset.pid)) : null;
    if (b && b.dataset.tab) { modo = 'act'; tab = b.dataset.tab; dibujar(); return; }
    if (b && b.dataset.pq && p) { e.stopPropagation(); if (b.dataset.pq === 'next') avanzar(p); else togPago(p); return; }
    if (b && b.dataset.pa) {
      const a = b.dataset.pa;
      if (a === 'cerrar') cerrar();
      else if (a === 'tk') X.tiketera();
      else if (a === 'todos') { modo = modo === 'todos' ? 'act' : 'todos'; dibujar(); }
      else if (a === 'hist') { if (modo === 'hist') { modo = 'act'; dibujar(); } else { modo = 'hist'; cargarHist(); } }
      else if (a === 'nuevo') { cerrar(); X.nuevoPedido(); }
      else if (a === 'abierto') {
        const c = !((X.pub && X.pub()) || {}).cerr;
        if (c && !confirm('¿Cerrar el local? El catálogo se sigue viendo, pero no se pueden hacer pedidos hasta que lo vuelvas a abrir.')) return;
        setDoc(doc(db, 'stores', sidOn, 'public', 'info'), { cerr: c }, { merge: true }).catch((er) => X.fail(er));
      }
      return;
    }
    if (p) detalle(p.id);
  }

  // ---------- detalle (hoja de abajo en el celu, ventana en la compu) ----------
  function hoja(h) {
    let o = document.getElementById('pedd');
    if (!o) {
      o = document.createElement('div'); o.id = 'pedd'; o.innerHTML = '<div class="pdw"></div>';
      o.addEventListener('click', (e) => { if (e.target === o) { cerrarDet(); return; } const b = e.target.closest('[data-pd]'); if (b) clicDet(b); });
      document.body.appendChild(o);
    }
    const w = o.querySelector('.pdw'), sc = w.scrollTop; w.innerHTML = h; w.scrollTop = sc;
  }
  function cerrarDet() { det = null; const o = document.getElementById('pedd'); if (o) o.remove(); }
  function detalle(id, refresco) {
    const p = L.find((x) => x.id === id) || (HIST || []).find((x) => x.id === id) || (det && det.id === id ? det : null);
    if (!p) { cerrarDet(); return; }
    if (refresco && document.querySelector('#pedd .pmn')) return;   // está eligiendo los minutos: no se pisa
    if (refresco && document.querySelector('#pedd .pes')) return;   // está eligiendo estado o medio de pago
    det = p;
    const e = EST[p.st] || ['', 'e'], nx = proxima(p), w = waTel(p.tel), sub = (p.it || []).reduce((a, x) => a + Math.round((+x.u || 0) * (+x.q || 0)), 0);
    let h = '<div class="pgr"></div><h3>Pedido #' + esc(codPedido(p.id)) + '</h3><div class="pds">' + hora(p.at) + ' · hace ' + reloj(p.at) + (p.min && p.acc ? ' · listo ~' + hora(p.acc + p.min * 60000) : '') + (p.imp ? ' · 🖨️ comanda impresa' : '') + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><span class="pbg ' + e[1] + '">' + e[0] + '</span><span class="pbg ' + (p.tipo === 'mesa' ? 'mesa' : 't') + '">' + tipoTxt(p) + '</span>' + (p.src === 'local' ? '<span class="pbg e">Mostrador</span>' : '') + '</div>';
    h += '<div class="pbx"><small>Productos (' + cuantos(p) + ')</small>' + (p.it || []).map((x) => '<div class="pli"><span><em>' + (x.w ? esc(String(x.q).replace('.', ',')) + ' kg' : esc(x.q) + '×') + '</em> ' + esc(x.n) + (x.x ? '<small>+ ' + esc(x.x) + '</small>' : '') + '</span><span>' + money(Math.round((+x.u || 0) * (+x.q || 0))) + '</span></div>').join('') +
      (p.nota ? '<div class="pnt">📝 ' + esc(p.nota) + '</div>' : '') + '</div>';
    h += '<div class="pbx"><small>' + tipoTxt(p) + '</small><b style="font-size:16px">' + esc(nombre(p)) + '</b>' + (p.tel ? '<div class="pds">' + esc(p.tel) + '</div>' : '') +
      (p.dir ? '<div style="margin-top:2px"><a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.dir) + '" target="_blank" rel="noopener" style="color:inherit">📍 ' + esc(p.dir) + '</a></div>' : '') +
      (w ? '<div class="pbt"><a href="https://wa.me/' + w + '?text=' + encodeURIComponent('Hola ' + nombre(p) + '! Te escribimos por tu pedido #' + codPedido(p.id) + ' en ' + (X.tienda() || 'el local') + '.') + '" target="_blank" rel="noopener">💬 WhatsApp</a><a href="tel:' + esc(String(p.tel).replace(/[^\d+]/g, '')) + '">📞 Llamar</a></div>' : '') + '</div>';
    h += '<div class="pbx"><div class="prw"><span>Subtotal</span><span>' + money(sub) + '</span></div>' + (p.env ? '<div class="prw"><span>Envío</span><span>' + money(p.env) + '</span></div>' : '') +
      (Math.abs(sub + (p.env || 0) - (p.tot || 0)) > 1 ? '<div class="prw"><span>Descuentos y ajustes</span><span>' + money((p.tot || 0) - sub - (p.env || 0)) + '</span></div>' : '') +
      '<div class="prw t"><span>Total</span><span>' + money(p.tot || 0) + '</span></div>' +
      '<div class="pli" style="align-items:center"><span>' + esc(p.pago || 'Pago a definir') + '</span><button type="button" class="ppg' + (pago(p) ? ' si' : '') + '" data-pd="pg" style="padding:0"><i>' + (pago(p) ? '✓' : '') + '</i>' + (p.cob ? 'Cobrado' + (p.cpay ? ' · ' + esc(p.cpay) : '') : p.pag ? 'Pagado online' : pago(p) ? 'Está pago' : 'Sin pagar') + '</button></div>' +
      (p.paga > 0 ? '<div class="prw" style="margin-top:8px"><span>Abona con</span><span>' + money(p.paga) + '</span></div><div class="prw v"><span>Vuelto</span><span>' + money(Math.max(0, p.paga - (p.tot || 0))) + '</span></div>' : '') + '</div>';
    h += '<div class="plk">' + (p.cob ? '' : '<button type="button" data-pd="caja">💵 Cobrar en la caja</button>') + '<button type="button" data-pd="com">🖨️ Comanda</button>' +
      (p.st !== 'entregado' && p.st !== 'cancelado' ? '<button type="button" class="rj" data-pd="cancel">' + (p.st === 'nuevo' ? 'Rechazar' : 'Cancelar pedido') + '</button>' : '') + '</div>';
    if (p.st === 'cancelado' && p.mot) h += '<div class="pnt" style="background:#FEE2E2;color:#991B1B">Motivo: ' + esc(p.mot) + '</div>';
    h += '<div class="pft"><button type="button" class="sec" data-pd="estado">Estado</button>' + (nx ? '<button type="button" class="pri' + (p.st === 'nuevo' ? ' ac' : '') + '" data-pd="next">' + nx[1] + ' ' + nx[2] + '</button>' : '<button type="button" class="pri" data-pd="volver">Listo</button>') + '</div>';
    hoja(h);
  }
  function estados(p) {
    const l = [['nuevo', '🔔 Nuevo'], ['ok', '👨‍🍳 Preparando'], ['listo', '✅ Listo']].concat(p.tipo === 'env' ? [['camino', '🛵 En camino']] : []).concat([['entregado', '🎉 Entregado']]);
    hoja('<div class="pgr"></div><h3>Estado del pedido #' + esc(codPedido(p.id)) + '</h3><div class="pds">Si te equivocaste, volvelo atrás. El cliente lo ve al instante.</div><div class="pes">' +
      l.map((x) => '<button type="button" data-pd="setst" data-st="' + x[0] + '" class="' + (p.st === x[0] ? 'on' : '') + '">' + x[1] + (p.st === x[0] ? ' · actual' : '') + '</button>').join('') + '</div>' +
      '<div class="pft"><button type="button" class="pri" data-pd="det" style="background:#F3F4F8;color:#111827">Volver</button></div>');
  }
  function clicDet(b) {
    const p = det; if (!p) return; const a = b.dataset.pd;
    if (a === 'volver') { cerrarDet(); return; }
    if (a === 'det') { detalle(p.id); return; }
    if (a === 'next') { avanzar(p, 'det'); return; }
    if (a === 'min') { const m = +b.dataset.m, o = { st: 'ok', acc: Date.now() }; if (m) o.min = m; set(p.id, o); online(p); cerrarDet(); return; }
    if (a === 'cob') { const ex = b.dataset.luego ? { st: b.dataset.luego } : null; b.disabled = true; b.textContent = 'Registrando la venta…'; registrar(p, b.dataset.pay, ex).then(() => cerrarDet()); return; }
    if (a === 'sinco') { set(p.id, { st: 'entregado' }); cerrarDet(); return; }
    if (a === 'pg') { togPago(p); return; }
    if (a === 'estado') { estados(p); return; }
    if (a === 'setst') { const s = b.dataset.st, o = { st: s }; if (s === 'ok' && !p.acc) o.acc = Date.now(); set(p.id, o); cerrarDet(); return; }
    if (a === 'com') { imprimirComanda(p); updateDoc(ref(p.id), { imp: true }).catch(() => {}); return; }
    if (a === 'caja') { if (X.aCaja(p)) cerrar(); return; }
    if (a === 'cancel') cancelar(p);
  }

  // ---------- pedido del mostrador (lo arma la caja con los productos de la venta en curso) ----------
  function pedId() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', r = new Uint8Array(20); crypto.getRandomValues(r); let o = ''; for (let i = 0; i < 20; i++) o += a[r[i] % a.length]; return o; }
  function guardarMostrador(o) {
    const id = pedId(), d = Object.assign({ id, at: Date.now(), st: 'ok', acc: Date.now(), src: 'local' }, o);
    return setDoc(ref(id), d).then(() => d);
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

  return { start, stop, abrir, qrMesas, guardarMostrador, on: () => !!sidOn, activos: () => L.length };
}
