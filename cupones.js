// Cupones con QR de las promos por email.
// El servidor crea uno por cliente en stores/{sid}/cupones/{código} = { t: promo, n: cliente, ex: vence (ms), at, p, pr (prueba) }.
// En el local se canjean una sola vez: escaneando el QR del mail (con el escáner de la app) o escribiendo el código.
// Al canjear se guarda us (cuándo) y ub (quién); las reglas de Firebase no dejan canjearlo dos veces.
import { doc, getDoc, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { openScanner, canScan } from './scanner.js';

export const ALF = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RE = new RegExp('^[' + ALF + ']{6}$');
// Saca el código de lo que se escaneó o escribió: el link del QR (…&cupon=ABC234) o el código solo ("abc-234").
export function codigoCupon(txt) {
  const s = String(txt || '').trim(), m = s.match(/[?&]cupon=([A-Za-z0-9-]{4,14})/);
  const c = (m ? m[1] : s).toUpperCase().replace(/[\s-]/g, '');
  return RE.test(c) ? c : '';
}
// ¿El QR escaneado es de un cupón? (para el escáner de la caja: no confundirlo con un código de producto)
export const esQrCupon = (txt) => /^https:\/\/pekeronapp\.com\/catalogo\.html\?.*[?&]cupon=/.test(String(txt || '').trim()) && !!codigoCupon(txt);
export const verCodigo = (c) => c.slice(0, 3) + '-' + c.slice(3);
// Estado de un cupón: 'usado' | 'vencido' | 'ok'
export function estado(x, ahora) { return x.us ? 'usado' : x.ex && x.ex < (ahora || Date.now()) ? 'vencido' : 'ok'; }
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], d2 = (n) => String(n).padStart(2, '0');
const fecha = (ms, hora) => { const d = new Date(ms); return DIAS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + (hora ? ' a las ' + d2(d.getHours()) + ':' + d2(d.getMinutes()) : ''); };

let css = false;
function estilos() {
  if (css) return; css = true;
  const st = document.createElement('style');
  st.textContent = '.cupd{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:70;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto}' +
    '.cupd>div{background:var(--card);color:var(--ink);border-radius:22px;padding:20px;max-width:440px;width:100%;margin:auto}' +
    '.cupd .cupin{display:flex;gap:8px;margin-top:12px}.cupd .cupin input{flex:1;min-width:0;width:100%;font-size:22px;font-weight:800;letter-spacing:3px;text-transform:uppercase;text-align:center;margin:0}' +
    '.cupd .cupin button{margin:0;width:auto;padding:0 18px}' +
    '.cupd .cupr{margin-top:14px;border-radius:18px;padding:16px;text-align:center}.cupd .cupr b{display:block;font-size:19px}.cupd .cupr .t{font-size:17px;font-weight:800;margin-top:8px}' +
    '.cupd .cupr small{display:block;font-size:14px;margin-top:4px;opacity:.85}' +
    '.cupd .ok{background:#DCFCE7;color:#14532D}.cupd .mal{background:#FEE4E2;color:#7A271A}.cupd .avi{background:#FEF3C7;color:#78350F}.cupd .hecho{background:#16A34A;color:#fff}';
  document.head.appendChild(st);
}

// Abre la ventana para canjear. X: { db, sid(), uid(), esc }. codigo: opcional (si viene del escáner).
export function abrirCanje(X, codigo) {
  estilos();
  const esc = X.esc, o = document.createElement('div'); o.className = 'cupd';
  o.innerHTML = '<div><b style="font-size:19px">🎟️ Canjear cupón</b><div class="k" style="margin-top:4px">Escaneá el QR del mail del cliente o escribí el código que figura abajo del QR.</div>' +
    '<div class="cupin"><input id="cup_c" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC-234"><button type="button" class="go" id="cup_b">Buscar</button></div>' +
    (canScan() ? '<button type="button" class="go alt" id="cup_s" style="margin-top:8px">📷 Escanear el QR</button>' : '') +
    '<div id="cup_r"></div>' +
    '<button type="button" class="x" data-cerrar="1" style="display:block;margin:14px auto 0;font-size:14px;text-decoration:underline">Cerrar</button></div>';
  document.body.appendChild(o);
  const $ = (s) => o.querySelector(s), inp = $('#cup_c'), res = $('#cup_r');
  o.addEventListener('click', (e) => { if (e.target === o || (e.target.dataset && e.target.dataset.cerrar)) o.remove(); });
  const caja = (cl, h) => { res.innerHTML = '<div class="cupr ' + cl + '">' + h + '</div>'; };
  const ref = (c) => doc(X.db, 'stores', X.sid(), 'cupones', c);
  function buscar(txt) {
    const c = codigoCupon(txt);
    if (!c) { caja('mal', '<b>❌ Código no válido</b><small>Son 6 letras y números, por ejemplo ABC-234.</small>'); return; }
    inp.value = verCodigo(c); caja('', '<div class="k">Buscando…</div>');
    getDoc(ref(c)).then((d) => {
      if (!d.exists()) { caja('mal', '<b>❌ No existe ese cupón</b><small>Revisá que el código esté bien escrito.</small>'); return; }
      const x = d.data(), e = estado(x), pr = x.pr ? '<small>(cupón de prueba)</small>' : '';
      if (e === 'usado') { caja('avi', '<b>⚠️ Este cupón ya se usó</b><div class="t">' + esc(x.t || '') + '</div><small>Se canjeó el ' + esc(fecha(x.us, true)) + '</small>' + pr); return; }
      if (e === 'vencido') { caja('avi', '<b>⏰ Este cupón venció</b><div class="t">' + esc(x.t || '') + '</div><small>Era válido hasta el ' + esc(fecha(x.ex)) + '</small>' + pr); return; }
      caja('ok', '<b>✅ Cupón válido</b><div class="t">' + esc(x.t || '') + '</div>' + (x.n ? '<small>Cliente: ' + esc(x.n) + '</small>' : '') +
        (x.ex ? '<small>Vence el ' + esc(fecha(x.ex)) + '</small>' : '') + pr +
        '<button type="button" class="go" id="cup_ok" style="margin-top:12px;background:#16A34A;color:#fff">Canjear ahora</button>');
      $('#cup_ok').onclick = (ev) => {
        const b = ev.currentTarget; b.disabled = true; b.textContent = 'Canjeando…';
        runTransaction(X.db, async (tr) => {
          const s = await tr.get(ref(c)); if (!s.exists()) throw new Error('no');
          if (s.data().us) throw new Error('usado');
          tr.update(ref(c), { us: Date.now(), ub: X.uid() });
        }).then(() => {
          caja('hecho', '<b>🎉 ¡Canjeado!</b><div class="t">Dale la promo: ' + esc(x.t || '') + '</div>' + (x.n ? '<small>' + esc(x.n) + '</small>' : ''));
          inp.value = '';
        }).catch((er) => {
          if (/usado/.test(String(er && er.message))) { buscar(c); return; }
          b.disabled = false; b.textContent = 'Canjear ahora';
          const perm = /permission/i.test(String(er && (er.code || er.message)));
          caja('mal', '<b>No se pudo canjear</b><small>' + (perm ? 'Falta publicar las reglas nuevas de Firebase (avisale a Pekeron App).' : 'Revisá la conexión y probá de nuevo.') + '</small>');
        });
      };
    }).catch((er) => {
      const perm = /permission/i.test(String(er && (er.code || er.message)));
      caja('mal', '<b>No se pudo buscar el cupón</b><small>' + (perm ? 'Falta publicar las reglas nuevas de Firebase (avisale a Pekeron App).' : 'Revisá la conexión y probá de nuevo.') + '</small>');
    });
  }
  $('#cup_b').onclick = () => buscar(inp.value);
  inp.onkeydown = (e) => { if (e.key === 'Enter') buscar(inp.value); };
  if ($('#cup_s')) $('#cup_s').onclick = () => openScanner({ title: 'Escaneá el QR del cupón', onCode(t) { const c = codigoCupon(t); if (!c) return { ok: false, msg: 'Ese QR no es de un cupón' }; setTimeout(() => buscar(c), 0); return { ok: true, close: true, msg: '🎟️ ' + verCodigo(c) }; } });
  if (codigo) buscar(codigo); else setTimeout(() => { try { inp.focus(); } catch (e) { /* */ } }, 80);
}
