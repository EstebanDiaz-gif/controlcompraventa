// Pedidos que entran a la app desde el catálogo (mesa con QR, retiro o envío) y los que se cargan en el mostrador.
// stores/{sid}/pedidos/{id} = { id, at, st, tipo: 'mesa'|'env'|'ret', mesa, cl, tel, dir, nota, it: [{ k, n, x, o, q, u, w, t }],
//   tot, env, pago, paga (con cuánto paga), mp, src: 'web'|'local', min (minutos que dijo el local), acc, upd,
//   imp (comanda impresa), cob (cobrado en la caja), pag (pagado con Mercado Pago), pg (marcado pagado a mano), mot }
// st: nuevo → ok (en preparación) → listo → camino (solo envío) → entregado · o cancelado
// Pantalla pensada para el celu (solapas y un botón grande con la próxima acción) que en la compu se ve en columnas.

import { collection, doc, onSnapshot, query, where, updateDoc, setDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { tkConfig, imprimirComanda, codPedido } from './ticket.js';
import { qrCanvas } from './qr.js';
import { PAGOS_URL } from './pagos-config.js';

const ACTIVOS = ['nuevo', 'ok', 'listo', 'camino', 'rendir', 'servido'];
const TIPO = { mesa: ['🍽️', 'Mesa'], env: ['🛵', 'Delivery'], ret: ['🏪', 'Retiro'] };
const EST = { nuevo: ['Nuevo', 'n'], ok: ['Preparando', 'p'], listo: ['Listo', 'l'], camino: ['En camino', 'c'], rendir: ['Por rendir', 'n'], servido: ['En la mesa · por cobrar', 'c'], entregado: ['Entregado', 'e'], cancelado: ['Cancelado', 'x'] };
const SOLAPAS = [['nuevo', 'Nuevos'], ['ok', 'En curso'], ['listo', 'Listos'], ['camino', 'Entregados']];
const EN4 = { camino: 1, rendir: 1, servido: 1 };   // la 4ª solapa: salieron o están en la mesa, falta cerrar

// Próxima acción de cada pedido: [estado nuevo, ícono, texto del botón]
function proxima(p) {
  if (p.st === 'nuevo') return ['ok', '✓', 'Aceptar'];
  if (p.st === 'ok') return ['listo', '🛎️', 'Marcar listo'];
  if (p.st === 'listo') return p.tipo === 'env' ? ['camino', '🛵', 'Enviar pedido'] : p.tipo === 'mesa' ? ['entregado', '🍽️', 'Llevado a la mesa'] : ['entregado', '🤝', 'Entregar'];
  if (p.st === 'camino') return ['entregado', '🏁', 'Confirmar entrega'];
  if (p.st === 'rendir') return ['cobrar', '💵', 'Recibí la plata'];
  if (p.st === 'servido') return ['cobrar', '💵', 'Cobrar'];
  return null;
}
const pago = (p) => !!(p.pag || p.pg || p.cob);
// Mesas que atiende cada mozo: "4, 5, 6" o "1-8" (igual que worker/src/avisos.js)
export function mesasDe(t) {
  const s = new Set();
  String(t || '').split(/[\s,;y]+/).forEach((x) => { const m = /^(\d+)-(\d+)$/.exec(x); if (m) { for (let i = +m[1]; i <= Math.min(+m[2], +m[1] + 200); i++) s.add(String(i)); } else if (x.trim()) s.add(x.trim().toLowerCase()); });
  return s;
}

export function createPedidos(X) {
  const { db, esc, money } = X;
  let un = null, sidOn = '', L = [], abierto = false, vistos = null, sonT = null, titT = null, titulo = '', audio = null, impresos = {};
  let tab = 'nuevo', modo = 'act', busca = '', HIST = null, det = null, prevSt = {}, soloMias = null, toastT = null;
  const MIAS = () => mesasDe(X.misMesas ? X.misMesas() : '');
  const mia = (p) => p.tipo === 'mesa' && MIAS().has(String(p.mesa || '').trim().toLowerCase());
  const listosMios = () => L.filter((p) => p.st === 'listo' && mia(p));

  // ---------- estilos ----------
  if (!document.getElementById('pedcss')) {
    const st = document.createElement('style'); st.id = 'pedcss';
    st.textContent = [
      '#pedfab{position:fixed;right:14px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:55;display:flex;align-items:center;gap:8px;border:0;border-radius:99px;padding:12px 18px;background:#111827;color:#fff;font:inherit;font-size:15px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer}',
      '#pedfab b{background:#e11d48;color:#fff;border-radius:99px;min-width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0 7px;font-size:13px}',
      '#pedfab.nuevo{background:#e11d48;animation:pedpul 1s ease-in-out infinite}#pedfab.nuevo b{background:#fff;color:#e11d48}#pedfab.listo{background:#16A34A}#pedfab.listo b{color:#16A34A}',
      '#pedtoast{position:fixed;left:50%;transform:translateX(-50%);top:calc(14px + env(safe-area-inset-top));z-index:90;border:0;border-radius:18px;background:#16A34A;color:#fff;font:inherit;padding:14px 20px;box-shadow:0 12px 30px rgba(0,0,0,.3);text-align:left;cursor:pointer;max-width:calc(100% - 24px);animation:pdup .25s ease}#pedtoast b{display:block;font-size:16px}#pedtoast span{font-size:13px;opacity:.85}',
      '#pedp .pch.on{background:var(--pa);color:#fff}',
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
      '#pedd .ppcad{display:block;width:100%;border:0;border-radius:14px;background:#111827;color:#fff;font:inherit;font-weight:800;font-size:15.5px;padding:15px;margin-top:12px;cursor:pointer}',
      '#pedk{position:fixed;inset:0;z-index:68;background:#0B0F19;color:#F9FAFB;overflow:auto;padding-bottom:30px;font-size:16px}',
      '#pedk .kh,#pedm .mh{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:calc(12px + env(safe-area-inset-top)) 16px 12px;background:#111827;border-bottom:1px solid #1F2937}',
      '#pedk .kh b{font-size:22px}#pedk .kh span{color:#9CA3AF;font-weight:700}#pedk .kclk{margin-left:auto;font-size:20px;color:#F9FAFB!important;font-variant-numeric:tabular-nums}',
      '#pedk .kh button,#pedm .mh button{border:0;border-radius:12px;padding:10px 14px;font:inherit;font-weight:800;background:#1F2937;color:#F9FAFB;cursor:pointer}#pedk .kh .kbn{background:#E11D48;animation:pedpul 1s infinite}',
      '#pedk .kgr{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;padding:14px;align-items:start}#pedk .ksep{padding:4px 18px 0;color:#9CA3AF;font-weight:800;text-transform:uppercase;font-size:13px;letter-spacing:.06em}',
      '.kc{background:#F9FAFB;color:#111827;border-radius:18px;overflow:hidden;border-top:10px solid #16A34A}.kc.a{border-top-color:#F59E0B}.kc.r{border-top-color:#DC2626;box-shadow:0 0 0 3px #DC2626}.kc.n{border-top-color:#6B7280;opacity:.95}',
      '.kc .kt{display:flex;justify-content:space-between;align-items:center;padding:12px 14px 0}.kc .kt b{font-size:24px;font-weight:900;letter-spacing:.02em}.kc .km{font-size:18px;font-weight:900;font-variant-numeric:tabular-nums}.kc.r .km{color:#DC2626}.kc.a .km{color:#B45309}',
      '.kc .ks{padding:2px 14px 6px;color:#6B7280;font-weight:700;font-size:14px}.kc ul{list-style:none;margin:0;padding:0 14px}',
      '.kc li{padding:10px 0;border-top:1px dashed #D1D5DB;font-size:19px;font-weight:800;cursor:pointer;user-select:none}.kc li b{color:#1D4ED8}.kc li em{display:block;font-style:normal;font-size:15px;font-weight:900;color:#B45309;text-transform:uppercase;padding-left:30px;margin-top:2px}',
      '.kc li.ok{opacity:.35;text-decoration:line-through}.kc .kno{margin:8px 14px 0;padding:10px 12px;border-radius:12px;background:#FEF3C7;color:#78350F;font-weight:900;font-size:16px;text-transform:uppercase}',
      '.kc .kl{display:block;width:calc(100% - 28px);margin:12px 14px 14px;border:0;border-radius:14px;background:#16A34A;color:#fff;font:inherit;font-size:20px;font-weight:900;padding:16px;cursor:pointer}',
      '.kc .kmn{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:12px 14px 14px}.kc .kmn button{border:0;border-radius:12px;background:#16A34A;color:#fff;font:inherit;font-weight:900;padding:12px 0;cursor:pointer}',
      '.kvac{grid-column:1/-1;text-align:center;padding:70px 20px;color:#9CA3AF}.kvac i{font-style:normal;font-size:56px;display:block}.kvac b{display:block;font-size:22px;color:#F9FAFB;margin:8px 0 4px}',
      '#pedm{position:fixed;inset:0;z-index:68;background:#F3F4F8;color:#111827;overflow:auto;padding-bottom:30px}#pedm .mh{background:#fff;border-bottom-color:#E5E7EB}#pedm .mh b{font-size:22px;margin-right:auto}#pedm .mh button{background:#F3F4F8;color:#111827}#pedm .mh .mf.on{background:var(--btn,#1D3FAF);color:#fff}',
      '#pedm .mlg{display:flex;flex-wrap:wrap;gap:6px 12px;padding:12px 16px 0;font-size:13px;font-weight:700;color:#4B5563}#pedm .mlg i{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:5px;vertical-align:-1px}',
      '#pedm .mgr{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;padding:14px 16px}',
      '.mt{position:relative;aspect-ratio:1;border:0;border-radius:20px;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px;background:#fff;color:#9CA3AF;border:2px dashed #D1D5DB}',
      '.mt b{font-size:30px;font-weight:900;line-height:1}.mt span{font-size:13px;font-weight:800}.mt em{font-style:normal;font-size:12.5px;font-weight:800;opacity:.9}.mt i{position:absolute;top:6px;right:9px;font-style:normal;font-size:11.5px;font-weight:800;opacity:.8}',
      '.mt.nuevo,#pedm .mlg .nuevo i{background:#FDE68A;color:#78350F;border:0}.mt.ok,#pedm .mlg .ok i{background:#DDD6FE;color:#4C1D95;border:0}.mt.listo,#pedm .mlg .listo i{background:#16A34A;color:#fff;border:0}.mt.listo{animation:pedpul 1.2s infinite}',
      '.mt.servido,#pedm .mlg .servido i{background:#BFDBFE;color:#1E3A8A;border:0}.mt.camino,.mt.rendir{background:#E5E7EB;color:#111827;border:0}#pedm .mlg .libre i{background:#fff;border:2px dashed #D1D5DB}',
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

  function sonarListo() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      [[0, 784], [0.16, 988], [0.32, 1175], [0.7, 784], [0.86, 988], [1.02, 1175]].forEach((n) => {
        const o = audio.createOscillator(), g = audio.createGain(); o.type = 'sine'; o.frequency.value = n[1];
        g.gain.setValueAtTime(0.0001, t0 + n[0]); g.gain.exponentialRampToValueAtTime(0.3, t0 + n[0] + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[0] + 0.25);
        o.connect(g); g.connect(audio.destination); o.start(t0 + n[0]); o.stop(t0 + n[0] + 0.26);
      });
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) {}
  }
  function toast(t) {
    let e = document.getElementById('pedtoast');
    if (!e) { e = document.createElement('button'); e.id = 'pedtoast'; e.type = 'button'; e.onclick = () => { e.remove(); modo = 'act'; tab = 'listo'; abrir(); }; document.body.appendChild(e); }
    e.innerHTML = '<b>' + esc(t) + '</b><span>Tocá para verlo</span>'; clearTimeout(toastT); toastT = setTimeout(() => { if (e.parentNode) e.remove(); }, 15000);
  }
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
      const nl = L.filter((p) => p.st === 'listo' && mia(p) && prevSt[p.id] && prevSt[p.id] !== 'listo');
      if (vistos && nl.length) { sonarListo(); toast('🍽️ Mesa ' + nl.map((p) => p.mesa).join(', ') + ': ' + (nl.length === 1 ? 'pedido listo' : 'pedidos listos') + ' para llevar'); }
      prevSt = {}; L.forEach((p) => { prevSt[p.id] = p.st; });
      vistos = {}; L.forEach((p) => { vistos[p.id] = 1; });
      if (det) { const d2 = L.find((x) => x.id === det.id); if (d2) det = d2; }
      alerta(); comandas(); pintar(); pintarK(); pintarM();
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
    const lm = listosMios();
    f.className = nn ? 'nuevo' : lm.length ? 'nuevo listo' : ''; f.hidden = abierto;
    f.innerHTML = nn ? '🛎️ ' + (nn === 1 ? 'Pedido nuevo' : 'Pedidos nuevos') + ' <b>' + nn + '</b>' : lm.length ? '🍽️ Llevar a Mesa ' + lm.map((p) => esc(p.mesa)).join(', ') + ' <b>' + lm.length + '</b>' : '🛎️ Pedidos <b>' + L.length + '</b>';
    if (abierto) dibujar();
    if (det) { const o = document.getElementById('pedd'); if (!o || !o.dataset.mesa) detalle(det.id, true); }
  }
  function cabecera() {
    const pub = (X.pub && X.pub()) || {}, cerr = !!pub.cerr, adm = X.isAdm && X.isAdm(), lg = pub.logo || '';
    const enTab = (p, k) => p.st === k || (k === 'camino' && EN4[p.st]);
    const cnt = (k) => L.filter((p) => enTab(p, k) && (!misOn() || mia(p))).length;
    return '<div class="ppt"><span class="plg">' + (/^(data:image|https:)/.test(lg) ? '<img alt="" src="' + esc(lg) + '">' : esc((X.tienda() || 'P').charAt(0).toUpperCase())) + '</span>' +
      '<a class="pch" href="' + esc(X.catLink ? X.catLink() : '#') + '" target="_blank" rel="noopener">👁️ Ver menú</a>' +
      (adm ? '<button type="button" class="pch ' + (cerr ? 'ce' : 'ab') + '" data-pa="abierto" title="Tocá para ' + (cerr ? 'abrir' : 'cerrar') + '"><i></i>' + (cerr ? 'Cerrado' : 'Abierto') + '</button>' : '<span class="pch ' + (cerr ? 'ce' : 'ab') + '"><i></i>' + (cerr ? 'Cerrado' : 'Abierto') + '</span>') +
      '<button type="button" class="px" data-pa="cerrar" aria-label="Cerrar">×</button></div>' +
      (MIAS().size || (X.push && /off|ios/.test(X.push.est())) ? '<div class="ppt" style="margin-top:8px;flex-wrap:wrap">' + (MIAS().size ? '<button type="button" class="pch' + (misOn() ? ' on' : '') + '" data-pa="mias">🍽️ ' + (misOn() ? 'Solo mis mesas: ' : 'Mis mesas: ') + esc(X.misMesas()) + '</button>' : '') + (X.push && /off|ios/.test(X.push.est()) ? '<button type="button" class="pch" data-pa="push" style="background:#FEF3C7;color:#92400E">🔔 Activar avisos en este celu</button>' : '') + '</div>' : '') +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h2>Pedidos</h2><div style="display:flex;gap:6px"><button type="button" class="pch" data-pa="cocina">👨‍🍳 Cocina</button>' + (mesasOn() ? '<button type="button" class="pch" data-pa="mesas">🍽️ Mesas</button>' : '') + '</div></div>' +
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
    const l = filtra(modo === 'todos' ? L.slice().reverse() : L.filter((p) => p.st === tab || (tab === 'camino' && EN4[p.st]))).filter((p) => !misOn() || mia(p));
    if (l.length) return l.map((p) => tarjeta(p, modo === 'todos')).join('');
    return modo === 'todos' ? vacio('📭', 'No hay pedidos activos', 'Los pedidos de tu menú entran acá solos, sin recargar la página.')
      : tab === 'nuevo' ? vacio('📥', 'No hay pedidos nuevos', 'Los pedidos de tu menú entran acá solos, sin recargar la página.')
      : vacio(tab === 'ok' ? '👨‍🍳' : tab === 'listo' ? '✅' : '🛵', 'Nada por acá', tab === 'ok' ? 'Los pedidos que aceptás aparecen acá mientras se preparan.' : tab === 'listo' ? 'Cuando marcás un pedido como listo, aparece acá.' : 'Los envíos que salieron aparecen acá hasta que confirmás la entrega.');
  }
  function misOn() { const m = MIAS(); if (!m.size) return false; if (soloMias === null) soloMias = !(X.isAdm && X.isAdm()); return soloMias; }
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
    if (nx[0] === 'cobrar') { cobrarDlg(p, 'entregado'); return; }
    if (nx[0] === 'entregado' && !p.cob && X.cobrar) { cobrarDlg(p, 'entregado'); return; }   // al entregar: ¿lo cobraste?
    set(p.id, { st: nx[0] }); online(p); if (nx[0] === 'listo') avisarListo(p);
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
  function avisarListo(p) { if (p.tipo === 'mesa' && PAGOS_URL) setTimeout(() => fetch(PAGOS_URL + '/push/listo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: sidOn, id: p.id }) }).catch(() => {}), 1500); }
  // ---------- cadete: link sin app con una clave (en el pedido solo queda su huella) ----------
  let cadK = null, cadsLoc = null;
  const cadsGuardar = (l, p) => X.guardarCads(l).then(() => { cadsLoc = { l, t: Date.now() }; cadDlg(p); });
  const claveNueva = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', r = new Uint8Array(28); crypto.getRandomValues(r); let o = ''; for (let i = 0; i < 28; i++) o += a[r[i] % a.length]; return o; };
  const huella = (k) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(k)).then((h) => Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join(''));
  const mapaDe = (p) => p.geo && isFinite(p.geo.la) ? 'https://www.google.com/maps/dir/?api=1&destination=' + p.geo.la + ',' + p.geo.lo : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(p.dir || '');
  function cadDlg(p) {
    det = p; const k = claveNueva(); cadK = { id: p.id, k, kh: null }; huella(k).then((h) => { if (cadK && cadK.k === k) cadK.kh = h; });
    const L2 = cadsLoc && Date.now() - cadsLoc.t < 8000 ? cadsLoc.l : ((X.cads && X.cads()) || []), adm = X.isAdm && X.isAdm();
    hoja('<div class="pgr"></div><h3>🛵 Mandar al cadete</h3><div class="pds">Le llega por WhatsApp la dirección con el mapa, cuánto cobrar y un link para avisar cuando lo entrega. No necesita la app.</div>' +
      '<div class="pes">' + L2.map((c, i) => '<div style="display:flex;gap:6px;align-items:center"><button type="button" data-pd="cadsel" data-n="' + esc(c.n) + '" data-t="' + esc(c.t) + '" style="flex:1">🛵 ' + esc(c.n) + ' <span style="color:#6B7280;font-weight:600">· ' + esc(c.t) + '</span></button>' + (adm ? '<button type="button" data-pd="caddel" data-i="' + i + '" data-n="' + esc(c.n) + '" style="width:auto;background:none;color:#B91C1C;margin-top:6px">✕</button>' : '') + '</div>').join('') +
      '<button type="button" data-pd="cadsel" data-n="" data-t="">💬 Elegir el contacto en WhatsApp</button></div>' +
      (adm ? '<details style="margin-top:12px"><summary style="font-weight:800;cursor:pointer">＋ Guardar un cadete</summary><input id="cad_n" placeholder="Nombre (ej: Juan)" maxlength="40" style="margin-top:8px"><input id="cad_t" type="tel" placeholder="WhatsApp (ej: 381 555 1234)" maxlength="24"><button type="button" class="go" data-pd="cadadd">Guardar cadete</button></details>' : '') +
      '<div class="pft"><button type="button" class="sec" data-pd="det" style="flex:1">Volver</button></div>');
  }
  function mandarCad(p, nombreC, telC) {
    if (!cadK || cadK.id !== p.id) return;
    const k = cadK.k, url = new URL('cadete.html', location.href).href.split('?')[0] + '?s=' + encodeURIComponent(sidOn) + '&p=' + encodeURIComponent(p.id) + '&k=' + k;
    const cobrar = pago(p) ? '✅ Ya está pago: no cobres nada.' : '💵 Cobrar: ' + money(p.tot || 0) + (p.pago ? ' (' + p.pago + ')' : '') + (p.paga > (p.tot || 0) ? '\n   Paga con ' + money(p.paga) + ' → llevá ' + money(p.paga - p.tot) + ' de vuelto' : '');
    const msg = '🛵 Envío #' + codPedido(p.id) + ' — ' + (X.tienda() || '') + '\n\n👤 ' + nombre(p) + (p.tel ? ' · ' + p.tel : '') + '\n📍 ' + (p.dir || '') + '\n🗺️ Cómo llegar: ' + mapaDe(p) + '\n\n' + cobrar + (p.nota ? '\n📝 ' + p.nota : '') +
      '\n\n📦 Lleva ' + cuantos(p) + ' producto' + (cuantos(p) === 1 ? '' : 's') + '\n\n✅ Cuando lo entregues tocá acá:\n' + url;
    const n = waTel(telC);
    window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(msg), '_blank');
    const guardar = (kh) => { const o = { kh, cad: nombreC || '' }; if (p.st === 'ok' || p.st === 'listo') o.st = 'camino'; set(p.id, o); };
    if (cadK.kh) guardar(cadK.kh); else huella(k).then(guardar);
    cerrarDet();
  }
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
      else if (a === 'mias') { soloMias = !misOn(); dibujar(); }
      else if (a === 'cocina') { cerrar(); cocina(); }
      else if (a === 'mesas') { cerrar(); mesas(); }
      else if (a === 'push') { if (X.push.est() === 'ios') alert('En iPhone los avisos llegan solo con la app instalada: tocá Compartir → Agregar a inicio, abrí Pekeron desde ese ícono y activalos acá.'); else { X.push.alta(b); setTimeout(dibujar, 4000); } }
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
      o.addEventListener('click', (e) => { if (e.target === o) { cerrarDet(); return; } const b = e.target.closest('[data-pd]'); if (b && !clicMesa(b)) clicDet(b); });
      document.body.appendChild(o);
    }
    const w = o.querySelector('.pdw'), sc = w.scrollTop; w.innerHTML = h; w.scrollTop = sc;
  }
  function cerrarDet() { det = null; const o = document.getElementById('pedd'); if (o) o.remove(); if (mOn) pintarM(); }
  function detalle(id, refresco) {
    const o0 = document.getElementById('pedd'); if (o0 && !refresco) delete o0.dataset.mesa;
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
      (p.dir || p.geo ? '<div style="margin-top:2px"><a href="' + mapaDe(p) + '" target="_blank" rel="noopener" style="color:inherit">📍 ' + esc(p.dir || 'Ubicación marcada') + '</a>' + (p.geo ? ' <span class="pbg l">ubicación exacta</span>' : '') + '</div>' : '') +
      (w ? '<div class="pbt"><a href="https://wa.me/' + w + '?text=' + encodeURIComponent('Hola ' + nombre(p) + '! Te escribimos por tu pedido #' + codPedido(p.id) + ' en ' + (X.tienda() || 'el local') + '.') + '" target="_blank" rel="noopener">💬 WhatsApp</a><a href="tel:' + esc(String(p.tel).replace(/[^\d+]/g, '')) + '">📞 Llamar</a></div>' : '') + '</div>';
    h += '<div class="pbx"><div class="prw"><span>Subtotal</span><span>' + money(sub) + '</span></div>' + (p.env ? '<div class="prw"><span>Envío</span><span>' + money(p.env) + '</span></div>' : '') +
      (Math.abs(sub + (p.env || 0) - (p.tot || 0)) > 1 ? '<div class="prw"><span>Descuentos y ajustes</span><span>' + money((p.tot || 0) - sub - (p.env || 0)) + '</span></div>' : '') +
      '<div class="prw t"><span>Total</span><span>' + money(p.tot || 0) + '</span></div>' +
      '<div class="pli" style="align-items:center"><span>' + esc(p.pago || 'Pago a definir') + '</span><button type="button" class="ppg' + (pago(p) ? ' si' : '') + '" data-pd="pg" style="padding:0"><i>' + (pago(p) ? '✓' : '') + '</i>' + (p.cob ? 'Cobrado' + (p.cpay ? ' · ' + esc(p.cpay) : '') : p.pag ? 'Pagado online' : pago(p) ? 'Está pago' : 'Sin pagar') + '</button></div>' +
      (p.paga > 0 ? '<div class="prw" style="margin-top:8px"><span>Abona con</span><span>' + money(p.paga) + '</span></div><div class="prw v"><span>Vuelto</span><span>' + money(Math.max(0, p.paga - (p.tot || 0))) + '</span></div>' : '') + '</div>';
    if (p.tipo === 'env' && /^(ok|listo|camino)$/.test(p.st)) h += '<button type="button" class="ppcad" data-pd="cad">🛵 ' + (p.kh ? 'Mandar de nuevo al cadete' + (p.cad ? ' (' + esc(p.cad) + ')' : '') : 'Mandar al cadete por WhatsApp') + '</button>';
    if (p.st === 'rendir') h += '<div class="pnt" style="background:#FEF3C7">🛵 Lo entregó ' + esc(p.cad || 'el cadete') + ' y cobró ' + money(p.tot || 0) + '. Cuando te rinda la plata, tocá "Recibí la plata" y la venta queda registrada.</div>';
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
    if (a === 'sinco') { set(p.id, { st: p.tipo === 'mesa' ? 'servido' : 'entregado' }); cerrarDet(); return; }
    if (a === 'pg') { togPago(p); return; }
    if (a === 'estado') { estados(p); return; }
    if (a === 'setst') { const s = b.dataset.st, o = { st: s }; if (s === 'ok' && !p.acc) o.acc = Date.now(); set(p.id, o); if (s === 'listo') avisarListo(p); cerrarDet(); return; }
    if (a === 'com') { imprimirComanda(p); updateDoc(ref(p.id), { imp: true }).catch(() => {}); return; }
    if (a === 'caja') { if (X.aCaja(p)) cerrar(); return; }
    if (a === 'cancel') { cancelar(p); return; }
    if (a === 'cad') { cadDlg(p); return; }
    if (a === 'cadsel') { mandarCad(p, b.dataset.n || '', b.dataset.t || ''); return; }
    if (a === 'cadadd') { const n = (document.getElementById('cad_n').value || '').trim().slice(0, 40), t = (document.getElementById('cad_t').value || '').trim().slice(0, 24); if (!n || t.replace(/\D/g, '').length < 6) { alert('Escribí el nombre y el WhatsApp del cadete.'); return; } const base = cadsLoc && Date.now() - cadsLoc.t < 8000 ? cadsLoc.l : (X.cads() || []); cadsGuardar(base.concat([{ n, t }]).slice(-12), p); return; }
    if (a === 'caddel') { if (!confirm('¿Borrar a ' + b.dataset.n + ' de la lista?')) return; const base = cadsLoc && Date.now() - cadsLoc.t < 8000 ? cadsLoc.l : (X.cads() || []); cadsGuardar(base.filter((c, i) => i !== +b.dataset.i), p); return; }
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

  // ================= PANTALLA DE COCINA =================
  // Para una tablet o tele en la cocina: lo que hay que preparar en grande, sin precios, con un reloj por pedido y un botón LISTO.
  let kOn = false, kNuevos = false, kT = null, kLock = null, kVistos = null, kHechos = {};
  const kKey = () => 'pk_kh_' + sidOn;
  function kCargar() { try { kHechos = JSON.parse(localStorage.getItem(kKey()) || '{}') || {}; } catch (e) { kHechos = {}; } }
  function kGuardar() { try { const v = {}; L.forEach((p) => { if (kHechos[p.id]) v[p.id] = kHechos[p.id]; }); kHechos = v; localStorage.setItem(kKey(), JSON.stringify(v)); } catch (e) {} }
  function despierto(on) {
    try { if (on && navigator.wakeLock && !kLock) navigator.wakeLock.request('screen').then((l) => { kLock = l; l.addEventListener('release', () => { kLock = null; }); }).catch(() => {}); if (!on && kLock) { kLock.release(); kLock = null; } } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (kOn || mOn)) despierto(true); });
  function cocina() {
    mSalir(); kOn = true; kCargar(); kVistos = null;
    let e = document.getElementById('pedk');
    if (!e) { e = document.createElement('div'); e.id = 'pedk'; e.addEventListener('click', clicK); document.body.appendChild(e); }
    despierto(true); clearInterval(kT); kT = setInterval(pintarK, 30000); pintar(); pintarK();
  }
  function kSalir() { kOn = false; clearInterval(kT); despierto(false); const e = document.getElementById('pedk'); if (e) e.remove(); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (er) {} pintar(); }
  const hm = (ms) => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const opsLineas = (x) => String(x || '').split(/,\s*/).filter(Boolean);
  function kCard(p, nuevo) {
    const m = mins(p.acc || p.at), obj = p.min || 20, c = nuevo ? 'n' : m >= obj ? 'r' : m >= obj * 0.7 ? 'a' : 'v', h = kHechos[p.id] || {};
    return '<div class="kc ' + c + '"><div class="kt"><b>' + (p.tipo === 'mesa' ? 'MESA ' + esc(p.mesa || '') : p.tipo === 'env' ? '🛵 ENVÍO' : '🏪 RETIRA') + '</b><span class="km">' + (nuevo ? 'nuevo' : m < 60 ? m + ' min' : reloj(p.acc || p.at)) + '</span></div>' +
      '<div class="ks">#' + esc(codPedido(p.id)) + ' · ' + esc(nombre(p)) + (p.min && !nuevo ? ' · listo ~' + hm((p.acc || p.at) + p.min * 60000) : '') + '</div><ul>' +
      (p.it || []).map((x, i) => '<li class="' + (h[i] ? 'ok' : '') + '" data-k="it" data-id="' + esc(p.id) + '" data-i="' + i + '"><b>' + (x.w ? esc(String(x.q).replace('.', ',')) + ' kg' : esc(x.q) + '×') + '</b> ' + esc(x.n) + (x.x ? opsLineas(x.x).map((o) => '<em>' + esc(o) + '</em>').join('') : '') + '</li>').join('') + '</ul>' +
      (p.nota ? '<div class="kno">📝 ' + esc(p.nota) + '</div>' : '') +
      (nuevo ? '<div class="kmn">' + [10, 20, 30, 45].map((n) => '<button type="button" data-k="acc" data-id="' + esc(p.id) + '" data-m="' + n + '">' + n + ' min</button>').join('') + '</div>'
        : '<button type="button" class="kl" data-k="listo" data-id="' + esc(p.id) + '">✅ LISTO</button>') + '</div>';
  }
  function pintarK() {
    if (!kOn) return; const e = document.getElementById('pedk'); if (!e) return;
    const prep = L.filter((p) => p.st === 'ok').sort((a, b) => (a.acc || a.at || 0) - (b.acc || b.at || 0)), nue = L.filter((p) => p.st === 'nuevo');
    const ids = prep.map((p) => p.id); if (kVistos && ids.some((id) => !kVistos[id])) sonar(); kVistos = {}; ids.forEach((id) => { kVistos[id] = 1; });
    if (!nue.length) kNuevos = false;
    e.innerHTML = '<div class="kh"><b>👨‍🍳 Cocina</b><span>' + prep.length + ' en preparación</span>' + (nue.length ? '<button type="button" class="kbn" data-k="nuevos">🔔 ' + nue.length + ' sin aceptar</button>' : '') +
      '<span class="kclk">' + hm(Date.now()) + '</span><button type="button" data-k="fs" title="Pantalla completa">⛶</button><button type="button" data-k="salir">Salir</button></div>' +
      (kNuevos ? '<div class="kgr">' + nue.map((p) => kCard(p, true)).join('') + '</div><div class="ksep">En preparación</div>' : '') +
      '<div class="kgr">' + (prep.length ? prep.map((p) => kCard(p)).join('') : '<div class="kvac"><i>👌</i><b>Todo al día</b>Cuando se acepta un pedido, aparece acá.</div>') + '</div>';
  }
  function clicK(e) {
    const b = e.target.closest('[data-k]'); if (!b) return; const a = b.dataset.k, p = L.find((x) => x.id === b.dataset.id);
    if (a === 'salir') { kSalir(); return; }
    if (a === 'fs') { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (er) {} return; }
    if (a === 'nuevos') { kNuevos = !kNuevos; pintarK(); return; }
    if (!p) return;
    if (a === 'it') { const h = kHechos[p.id] || (kHechos[p.id] = {}); h[b.dataset.i] = !h[b.dataset.i]; kGuardar(); pintarK(); return; }
    if (a === 'acc') { set(p.id, { st: 'ok', min: +b.dataset.m, acc: Date.now() }); online(p); return; }
    if (a === 'listo') { set(p.id, { st: 'listo' }); avisarListo(p); delete kHechos[p.id]; kGuardar(); }
  }

  // ================= PANTALLA DEL MOZO: MAPA DE MESAS =================
  let mOn = false, mSoloMias = null;
  const mesasOn = () => { const c = ((X.pub && X.pub()) || {}).ped || {}; return !!c.mesa; };
  const PRIO = { listo: 6, nuevo: 5, servido: 4, ok: 3, camino: 2, rendir: 1 };
  const MLAB = { libre: 'Libre', nuevo: 'Pidió', ok: 'Preparando', listo: '¡Llevar!', servido: 'Por cobrar' };
  const mkey = (m) => String(m || '').trim().toLowerCase();
  function mesaDe(n) {
    const ords = L.filter((p) => p.tipo === 'mesa' && mkey(p.mesa) === mkey(n));
    if (!ords.length) return { st: 'libre', ords, tot: 0, desde: 0 };
    const st = ords.reduce((a, p) => ((PRIO[p.st] || 0) > (PRIO[a] || 0) ? p.st : a), 'libre');
    return { st, ords, tot: ords.filter((p) => !p.cob).reduce((a, p) => a + (p.tot || 0), 0), desde: Math.min.apply(null, ords.map((p) => p.at || Date.now())) };
  }
  function mMisOn() { const m = MIAS(); if (!m.size) return false; if (mSoloMias === null) mSoloMias = !(X.isAdm && X.isAdm()); return mSoloMias; }
  function mesas() {
    kSalir(); mOn = true;
    let e = document.getElementById('pedm');
    if (!e) { e = document.createElement('div'); e.id = 'pedm'; e.addEventListener('click', clicM); document.body.appendChild(e); }
    despierto(true); pintar(); pintarM();
  }
  function mSalir() { if (!mOn) return; mOn = false; despierto(false); const e = document.getElementById('pedm'); if (e) e.remove(); pintar(); }
  function pintarM() {
    if (!mOn) return; const e = document.getElementById('pedm'); if (!e) return;
    const nm = Math.max(0, Math.min(80, +((((X.pub && X.pub()) || {}).ped || {}).nm) || 0)), set1 = {}, nums = [];
    for (let i = 1; i <= nm; i++) { nums.push(String(i)); set1[String(i)] = 1; }
    L.forEach((p) => { if (p.tipo === 'mesa' && !set1[mkey(p.mesa)]) { set1[mkey(p.mesa)] = 1; nums.push(String(p.mesa)); } });
    const mias = MIAS(), filtro = mMisOn(), ver = filtro ? nums.filter((n) => mias.has(mkey(n))) : nums;
    const cuenta = (st) => ver.filter((n) => mesaDe(n).st === st).length;
    e.innerHTML = '<div class="mh"><b>🍽️ Mesas</b>' + (mias.size ? '<button type="button" class="mf' + (filtro ? ' on' : '') + '" data-m="mias">' + (filtro ? 'Mis mesas' : 'Todas') + '</button>' : '') +
      '<button type="button" data-m="pedidos">🛎️ Pedidos</button><button type="button" data-m="salir">Salir</button></div>' +
      '<div class="mlg">' + ['listo', 'nuevo', 'ok', 'servido', 'libre'].map((st) => '<span class="' + st + '"><i></i>' + MLAB[st] + ' <b>' + cuenta(st) + '</b></span>').join('') + '</div>' +
      (ver.length ? '<div class="mgr">' + ver.map((n) => { const d = mesaDe(n); return '<button type="button" class="mt ' + d.st + '" data-mesa="' + esc(n) + '"><b>' + esc(n) + '</b><span>' + MLAB[d.st] + '</span>' + (d.tot ? '<em>' + money(d.tot) + '</em>' : '') + (d.desde ? '<i>' + reloj(d.desde) + '</i>' : '') + '</button>'; }).join('') + '</div>'
        : '<div class="kvac" style="color:#6B7280"><i>🍽️</i><b style="color:#111827">Sin mesas para mostrar</b>Cargá la cantidad de mesas en Equipo → Catálogo → Pedidos en la app.</div>');
    const ab = document.getElementById('pedd'); if (ab && ab.dataset.mesa) mesaDlg(ab.dataset.mesa, true);
  }
  function mesaDlg(n, refresco) {
    if (refresco && document.querySelector('#pedd .pes, #pedd .pmn')) return;
    const d = mesaDe(n), porCobrar = d.ords.filter((p) => !p.cob);
    let h = '<div class="pgr"></div><h3>Mesa ' + esc(n) + '</h3><div class="pds">' + (d.ords.length ? MLAB[d.st] + ' · hace ' + reloj(d.desde) : 'Libre') + '</div>';
    d.ords.forEach((p) => {
      const e = EST[p.st] || ['', 'e'], nx = proxima(p);
      h += '<div class="pbx"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>#' + esc(codPedido(p.id)) + ' · ' + esc(nombre(p)) + '</b><span class="pbg ' + e[1] + '">' + e[0] + '</span></div>' +
        (p.it || []).map((x) => '<div class="pli"><span><em>' + esc(x.q) + '×</em> ' + esc(x.n) + (x.x ? '<small>+ ' + esc(x.x) + '</small>' : '') + '</span><span>' + money(Math.round((+x.u || 0) * (+x.q || 0))) + '</span></div>').join('') +
        (p.nota ? '<div class="pnt">📝 ' + esc(p.nota) + '</div>' : '') +
        '<div class="prw t" style="font-size:16px"><span>' + (p.cob ? 'Cobrado ✓' : 'Total') + '</span><span>' + money(p.tot || 0) + '</span></div>' +
        (nx && nx[0] !== 'cobrar' ? '<button type="button" class="ppcad" data-pd="mnext" data-id="' + esc(p.id) + '" style="background:' + (p.st === 'listo' ? '#16A34A' : 'var(--btn,#1D3FAF)') + '">' + nx[1] + ' ' + nx[2] + '</button>' : '') + '</div>';
    });
    h += '<div class="pft" style="flex-wrap:wrap">' + (porCobrar.length ? '<button type="button" class="pri ac" data-pd="mcob" style="flex:1 1 100%">💵 Cobrar mesa · ' + money(porCobrar.reduce((a, p) => a + (p.tot || 0), 0)) + '</button>' : '') +
      '<button type="button" class="sec" data-pd="volver">Cerrar</button><button type="button" class="pri" data-pd="mcarga">＋ Cargar pedido</button></div>';
    hoja(h); const o = document.getElementById('pedd'); if (o) o.dataset.mesa = n; det = d.ords[0] || { id: '' };
  }
  function cobrarMesa(n) {
    const ps = mesaDe(n).ords.filter((p) => !p.cob); if (!ps.length) return;
    const tot = ps.reduce((a, p) => a + (p.tot || 0), 0), sug = payDe(ps[0].pago) || 'ef';
    hoja('<div class="pgr"></div><h3>Cobrar Mesa ' + esc(n) + '</h3><div class="pds">' + ps.length + ' pedido' + (ps.length === 1 ? '' : 's') + ' · <b>' + money(tot) + '</b></div><div class="pds" style="margin-top:6px">Se registra la venta y la mesa queda libre cuando ya está todo servido.</div>' +
      '<div class="pes">' + PAYS.map((x) => '<button type="button" data-pd="mcobpay" data-pay="' + x[0] + '" class="' + (x[0] === sug ? 'on' : '') + '">' + x[1] + ' ' + x[2] + '</button>').join('') + '</div>' +
      '<div class="pft"><button type="button" class="sec" data-pd="mvolver" style="flex:1">Volver</button></div>');
    const o = document.getElementById('pedd'); if (o) o.dataset.mesa = n;
  }
  function clicM(e) {
    const b = e.target.closest('[data-m],[data-mesa]'); if (!b) return;
    if (b.dataset.mesa) { mesaDlg(b.dataset.mesa); return; }
    const a = b.dataset.m;
    if (a === 'salir') mSalir(); else if (a === 'pedidos') { mSalir(); abrir(); } else if (a === 'mias') { mSoloMias = !mMisOn(); pintarM(); }
  }
  function clicMesa(b) {   // botones de la hoja de una mesa
    const a = b.dataset.pd, o = document.getElementById('pedd'), n = o && o.dataset.mesa; if (!n) return false;
    if (a === 'mnext') { const p = L.find((x) => x.id === b.dataset.id); if (p) { if (proxima(p)[0] === 'ok') aceptar(p); else avanzar(p); } return true; }
    if (a === 'mcob') { cobrarMesa(n); return true; }
    if (a === 'mvolver') { mesaDlg(n); return true; }
    if (a === 'mcarga') { cerrarDet(); mSalir(); X.nuevoPedido({ tipo: 'mesa', mesa: n, volver: 'mesas' }); return true; }
    if (a === 'mcobpay') {
      const ps = mesaDe(n).ords.filter((p) => !p.cob); b.disabled = true; b.textContent = 'Registrando…';
      ps.reduce((pr, p) => pr.then(() => registrar(p, b.dataset.pay, p.st === 'servido' || p.st === 'listo' ? { st: 'entregado' } : null)), Promise.resolve()).then(() => cerrarDet());
      return true;
    }
    return false;
  }

  return { start, stop, abrir, qrMesas, guardarMostrador, cocina, mesas, on: () => !!sidOn, activos: () => L.length };
}
