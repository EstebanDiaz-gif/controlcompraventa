// Clientes de gastronomía (y de los pedidos en general) + club de sellos.
//
// Cada pedido cobrado que tiene teléfono suma a la ficha del cliente: stores/{sid}/cg/{tel}
//   { n, tel, v (visitas), g (gastado), f (primera vez, ms), u (última, ms), it {producto: veces}, h {hora: veces}, dw {día: veces}, s (sellos), cj (canjes) }
// Club de sellos (config en public/info.club = { on, n: sellos para el premio, premio, min: compra mínima }):
//   el progreso también va en stores/{sid}/clubp/{hash del teléfono} = { s, n } para que el cliente lo vea en el catálogo
//   sin exponer su teléfono ni lo que gastó.
import { doc, getDoc, setDoc, writeBatch, increment, collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Teléfono → clave: solo dígitos, sin 54 / 9 / 0 de adelante, últimos 10. Vacío si no parece un teléfono.
export function telKey(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length > 10 && d.indexOf('54') === 0) d = d.slice(2);
  if (d.length > 10 && d[0] === '9') d = d.slice(1);
  if (d.length > 10 && d[0] === '0') d = d.slice(1);
  d = d.slice(-10);
  return d.length >= 8 ? d : '';
}
export async function clubHash(sid, k) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(sid) + ':' + k));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
export function clubCfg(info) {
  const c = (info && info.club) || {};
  return { on: !!c.on, n: Math.max(2, Math.min(30, Math.round(+c.n || 8))), premio: String(c.premio || '').slice(0, 80), min: Math.max(0, Math.round(+c.min || 0)) };
}
const llave = (s) => String(s || '').replace(/[.~*/[\]`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Producto';

// Suma el pedido cobrado a la ficha del cliente (y un sello si corresponde). Devuelve { s, n, premio } o null.
export async function sumarPedido(db, sid, p, tot, info) {
  const k = telKey(p && p.tel); if (!k) return null;
  const R = doc(db, 'stores', sid, 'cg', k), now = Date.now(), dt = new Date(now - 3 * 3600000);
  let ant = null; try { const sn = await getDoc(R); ant = sn.exists() ? sn.data() : null; } catch (e) { /* sin permiso de lectura: igual sumamos */ }
  const it = {};
  (p.it || []).forEach((x) => { if (x && x.n && !x.env) it[llave(x.n)] = increment(+x.q > 0 && !x.w ? Math.round(+x.q) : 1); });
  const o = { n: String(p.cl || (ant && ant.n) || '').slice(0, 60), tel: String(p.tel || '').slice(0, 30), v: increment(1), g: increment(Math.round(tot || 0)), u: now,
    it, h: { [String(dt.getUTCHours())]: increment(1) }, dw: { [String(dt.getUTCDay())]: increment(1) } };
  if (!ant || !ant.f) o.f = now;
  if (p.uid) o.uid = String(p.uid).slice(0, 40);
  if (p.em) o.em = String(p.em).slice(0, 120);
  const c = clubCfg(info), sello = c.on && (tot || 0) >= c.min;
  const b = writeBatch(db);
  if (sello) {
    o.s = increment(1);
    b.set(doc(db, 'stores', sid, 'clubp', await clubHash(sid, k)), { s: increment(1), n: c.n, u: now }, { merge: true });
  }
  b.set(R, o, { merge: true });
  await b.commit();
  if (!sello) return null;
  const s = ((ant && ant.s) || 0) + 1;
  return { s, n: c.n, premio: s >= c.n, texto: c.premio };
}
// Canjear el premio: descuenta los sellos del club.
export async function canjear(db, sid, k, info) {
  const c = clubCfg(info), b = writeBatch(db);
  b.set(doc(db, 'stores', sid, 'cg', k), { s: increment(-c.n), cj: increment(1) }, { merge: true });
  b.set(doc(db, 'stores', sid, 'clubp', await clubHash(sid, k)), { s: increment(-c.n), u: Date.now() }, { merge: true });
  return b.commit();
}
// Sellos de un cliente (desde el pedido o el catálogo).
export async function sellosDe(db, sid, tel) {
  const k = telKey(tel); if (!k) return null;
  try { const sn = await getDoc(doc(db, 'stores', sid, 'clubp', await clubHash(sid, k))); return sn.exists() ? Math.max(0, sn.data().s || 0) : 0; } catch (e) { return null; }
}

// ---------- Datos de una ficha ----------
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const topDe = (m, n) => Object.keys(m || {}).map((k) => [k, +m[k] || 0]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
export function ficha(c, now) {
  const v = Math.max(0, c.v || 0), g = Math.max(0, c.g || 0), cada = v > 1 && c.f && c.u > c.f ? Math.round((c.u - c.f) / 86400000 / (v - 1)) : null;
  const dias = c.u ? Math.floor(((now || Date.now()) - c.u) / 86400000) : null;
  const hh = topDe(c.h, 1)[0], dd = topDe(c.dw, 1)[0];
  // "Dejó de venir": venía seguido (2+ visitas) y pasó más del doble de lo habitual (y al menos 14 días).
  const perdido = v >= 2 && dias !== null && dias >= Math.max(14, 2 * (cada || 7));
  return { v, g, prom: v ? Math.round(g / v) : 0, cada, dias, hora: hh ? +hh[0] : null, dia: dd ? DIAS[+dd[0]] : '', top: topDe(c.it, 3).map((x) => x[0]), perdido, nuevo: v === 1 && dias !== null && dias <= 30 };
}

// ---------- Pantalla de Clientes ----------
// X: db, $, esc, money, sid(), isAdm(), pub(), tienda(), catLink(), fail(e), wa(tel) → número para wa.me
export function createClientes(X) {
  const { esc, money } = X;
  let L = null, R = null, un = null, unR = null, sidOn = '', q = '', filtro = 'todos', err = '';
  const errDe = (e) => (/permission/.test(String(e && (e.code || e.message))) ? 'Falta publicar las reglas nuevas de Firebase para ver los clientes.' : 'No se pudieron cargar los clientes.');
  function start() {
    const sid = X.sid(); if (un && sidOn === sid) return; stop(); sidOn = sid; L = null; R = null; css();
    un = onSnapshot(collection(X.db, 'stores', sid, 'cg'), (sn) => { L = []; err = ''; sn.forEach((d) => { const x = d.data(); x.k = d.id; L.push(x); }); draw(); },
      (e) => { L = []; err = errDe(e); draw(); });
    // Clientes que se registraron en el menú (email y si aceptan promos).
    unR = onSnapshot(collection(X.db, 'stores', sid, 'cr'), (sn) => { R = []; sn.forEach((d) => { const x = d.data(); x.id = d.id; R.push(x); }); draw(); }, () => { R = []; draw(); });
  }
  function stop() { if (un) { un(); un = null; } if (unR) { unR(); unR = null; } }
  const hora = (h) => (h === null ? '' : String(h).padStart(2, '0') + ' hs');
  const hace = (d) => (d === null ? '' : d === 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días');
  function draw() {
    const box = X.$('s-cli'); if (!box) return;
    if (!X.isAdm()) { box.innerHTML = '<div class="card"><div class="empty">Solo el administrador ve los clientes.</div></div>'; return; }
    start();
    const c = clubCfg(X.pub()), now = Date.now();
    let h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:17px">🎁 Club de sellos</b>' +
      '<button type="button" class="x" data-clx="club" style="font-size:14px;font-weight:800;text-decoration:underline;color:var(--sell)">' + (c.on ? 'Cambiar' : 'Activar') + '</button></div>' +
      '<div class="k" style="margin-top:4px">' + (c.on ? 'Cada compra' + (c.min ? ' de ' + money(c.min) + ' o más' : '') + ' suma un sello. Con <b>' + c.n + '</b> sellos el cliente se lleva <b>' + esc(c.premio || 'un premio') + '</b>. Se identifica por su teléfono, sin cuenta ni app.' : 'Hacé que vuelvan: cada compra suma un sello y al completar la tarjeta se llevan un premio. El cliente ve sus sellos en tu menú.') + '</div></div>';
    const pb = X.pub() || {}, reg = ['opc', 'obl'].indexOf(pb.reg) >= 0 ? pb.reg : 'no', Rl = R || [], acep = Rl.filter((r) => r.mk && r.em).length;
    h += '<div class="card"><b style="font-size:17px">📝 Registro en tu menú</b><div class="k" style="margin-top:4px">Antes de cerrar su primer pedido, el cliente crea su cuenta con email y contraseña (o con Google). El navegador la recuerda y la próxima vez no le pide nada. Los pedidos en la mesa con QR no piden registro.</div>' +
      '<div class="clseg">' + [['no', 'No pedir'], ['opc', 'Opcional'], ['obl', 'Obligatorio']].map((o) => '<button type="button" data-clreg="' + o[0] + '"' + (reg === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>').join('') + '</div>' +
      (Rl.length ? '<div class="k" style="margin-top:8px"><b>' + Rl.length + '</b> registrados · <b>' + acep + '</b> aceptan recibir promos por email</div>' : '') + '</div>';
    h += '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:17px">📧 Promos por email</b></div>' +
      '<div class="k" style="margin-top:4px">' + (acep ? 'Escribí una promo y le llega por mail a los <b>' + acep + '</b> clientes que aceptaron recibirlas. Cada mail trae un botón a tu menú y un link para darse de baja.' : 'Cuando tus clientes se registren y acepten recibir promos, desde acá les mandás un mail a todos juntos.') + '</div>' +
      '<button type="button" class="go" data-clx="mail" style="margin-top:10px"' + (acep ? '' : ' disabled') + '>Escribir una promo</button></div>';
    if (err) { box.innerHTML = h + '<div class="bn warn">' + esc(err) + '</div>'; return; }
    if (L === null) { box.innerHTML = h + '<div class="card"><div class="empty">Cargando clientes…</div></div>'; return; }
    const F = L.map((x) => Object.assign({ x }, ficha(x, now)));
    const cnt = { todos: F.length, frec: F.filter((f) => f.v >= 3).length, perd: F.filter((f) => f.perdido).length, nue: F.filter((f) => f.nuevo).length, prem: F.filter((f) => c.on && (f.x.s || 0) >= c.n).length };
    h += '<div class="chips" style="margin:4px 0 10px">' + [['todos', 'Todos'], ['frec', 'Frecuentes'], ['perd', 'Dejaron de venir'], ['nue', 'Nuevos']].concat(c.on ? [['prem', '🎁 Con premio']] : []).map((t) => '<button type="button" class="ch' + (filtro === t[0] ? ' on' : '') + '" data-clf="' + t[0] + '">' + t[1] + ' (' + cnt[t[0]] + ')</button>').join('') + '</div>' +
      '<input id="cliq" type="search" placeholder="Buscar por nombre o teléfono" autocomplete="off" value="' + esc(q) + '" style="margin-bottom:10px">';
    let l = F.filter((f) => filtro === 'todos' || (filtro === 'frec' && f.v >= 3) || (filtro === 'perd' && f.perdido) || (filtro === 'nue' && f.nuevo) || (filtro === 'prem' && c.on && (f.x.s || 0) >= c.n));
    const t = q.trim().toLowerCase(); if (t) l = l.filter((f) => (f.x.n || '').toLowerCase().indexOf(t) >= 0 || (f.x.tel || '').replace(/\D/g, '').indexOf(t.replace(/\D/g, '') || '§') >= 0);
    l.sort(filtro === 'perd' ? (a, b) => b.dias - a.dias : (a, b) => b.v - a.v || (b.x.u || 0) - (a.x.u || 0));
    if (!F.length) h += '<div class="card"><div class="empty">Todavía no hay clientes. Cada pedido cobrado que tenga teléfono suma acá: cuántas veces vino, qué pide, a qué hora y cuánto gasta.</div></div>';
    else if (!l.length) h += '<div class="card"><div class="empty">No hay clientes con ese filtro.</div></div>';
    h += l.slice(0, 200).map((f) => {
      const x = f.x, prem = c.on && (x.s || 0) >= c.n;
      return '<div class="card cliq"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div style="min-width:0"><b style="font-size:16.5px">' + esc(x.n || 'Sin nombre') + '</b>' +
        '<div class="k" style="margin-top:2px">' + esc(x.tel || '') + (f.dias !== null ? ' · última vez ' + hace(f.dias) : '') + '</div>' + (x.em ? '<div class="k" style="margin-top:1px">📧 ' + esc(x.em) + '</div>' : '') + '</div>' +
        (f.perdido ? '<span class="clb" style="background:#FEE4E2;color:#B42318">Dejó de venir</span>' : f.v >= 3 ? '<span class="clb" style="background:#DCFCE7;color:#166534">Frecuente</span>' : f.nuevo ? '<span class="clb" style="background:#E0E7FF;color:#3730A3">Nuevo</span>' : '') + '</div>' +
        '<div class="clg"><div><small>Vino</small><b>' + f.v + (f.v === 1 ? ' vez' : ' veces') + '</b></div><div><small>Promedio</small><b>' + money(f.prom) + '</b></div><div><small>Viene</small><b>' + (f.cada !== null ? 'cada ' + f.cada + ' días' : '—') + '</b></div></div>' +
        (f.top.length ? '<div class="k" style="margin-top:8px">🍽️ Suele pedir: <b>' + f.top.map(esc).join(', ') + '</b></div>' : '') +
        (f.hora !== null ? '<div class="k" style="margin-top:2px">🕘 Viene ' + (f.dia ? 'más los ' + f.dia + ', ' : '') + 'cerca de las ' + hora(f.hora) + '</div>' : '') +
        (c.on ? '<div class="clsel">' + Array.from({ length: c.n }, (_, i) => '<i class="' + (i < Math.min(x.s || 0, c.n) ? 'on' : '') + '"></i>').join('') + '<span>' + Math.max(0, x.s || 0) + '/' + c.n + '</span></div>' : '') +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' + (prem ? '<button type="button" class="go" data-clc="' + esc(x.k) + '" style="margin:0;flex:1;background:#16A34A;color:#fff">🎁 Canjear premio</button>' : '') +
        (x.tel ? '<a class="go alt" target="_blank" rel="noopener" href="https://wa.me/' + X.wa(x.tel) + '?text=' + encodeURIComponent(msgDe(f, c)) + '" style="margin:0;flex:1;text-align:center;text-decoration:none">💬 ' + (f.perdido ? 'Mandarle "te extrañamos"' : prem ? 'Avisarle del premio' : 'WhatsApp') + '</a>' : '') + '</div></div>';
    }).join('');
    if (l.length > 200) h += '<div class="k" style="text-align:center">Mostrando 200 de ' + l.length + '. Buscá para encontrar el resto.</div>';
    box.innerHTML = h;
    const qi = X.$('cliq'); if (qi) qi.oninput = () => { q = qi.value; const p = qi.selectionStart; draw(); const n = X.$('cliq'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) { /* */ } } };
  }
  function msgDe(f, c) {
    const nom = String(f.x.n || '').split(' ')[0], t = X.tienda() || 'el local', link = X.catLink();
    if (c.on && (f.x.s || 0) >= c.n) return '¡Hola ' + nom + '! Completaste tu tarjeta del club de ' + t + ' 🎉 Tenés de regalo: ' + (c.premio || 'un premio') + '. Lo pedís en tu próxima compra. ' + link;
    if (f.perdido) return '¡Hola ' + nom + '! Te extrañamos en ' + t + ' 😊 ' + (f.top[0] ? '¿Se viene un ' + f.top[0] + '? ' : '') + 'Te dejamos el menú: ' + link;
    return '¡Hola ' + nom + '! Te escribimos de ' + t + '. ';
  }
  function clubDlg() {
    const c = clubCfg(X.pub());
    const o = dlg('clubdlg', '<b style="font-size:19px">🎁 Club de sellos</b><div class="k" style="margin-top:4px">Cada compra suma un sello en la tarjeta del cliente (por su teléfono). Al completarla, se lleva el premio. El cliente ve cuántos sellos tiene en tu menú.</div>' +
      '<label style="display:flex;align-items:center;gap:10px;margin-top:14px"><input type="checkbox" id="cb_on"' + (c.on ? ' checked' : '') + ' style="width:22px;height:22px;margin:0"> Club activado</label>' +
      '<div class="row"><div><label>Sellos para el premio</label><input id="cb_n" type="number" inputmode="numeric" min="2" max="30" value="' + c.n + '"></div><div><label>Compra mínima ($)</label><input id="cb_min" type="number" inputmode="numeric" min="0" value="' + (c.min || '') + '" placeholder="0 = cualquiera"></div></div>' +
      '<label>Premio</label><input id="cb_p" maxlength="80" placeholder="Ej: una hamburguesa simple" value="' + esc(c.premio) + '">' +
      '<button class="go" id="cb_ok">Guardar</button><button class="x" id="cb_no" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelector('#cb_no').onclick = () => o.remove();
    o.querySelector('#cb_ok').onclick = () => {
      const on = o.querySelector('#cb_on').checked, premio = o.querySelector('#cb_p').value.trim();
      if (on && !premio) { alert('Escribí cuál es el premio.'); return; }
      const club = { on, n: Math.max(2, Math.min(30, Math.round(+o.querySelector('#cb_n').value || 8))), premio: premio.slice(0, 80), min: Math.max(0, Math.round(+o.querySelector('#cb_min').value || 0)) };
      setDoc(doc(X.db, 'stores', X.sid(), 'public', 'info'), { club }, { merge: true }).then(() => { o.remove(); const pb = X.pub(); if (pb) pb.club = club; draw(); }).catch(X.fail);
    };
  }
  function dlg(id, html) {
    const o = document.createElement('div'); o.className = 'almdlg'; o.id = id;
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto';
    o.innerHTML = '<div style="background:var(--card);color:var(--ink);border-radius:22px;padding:20px;max-width:460px;width:100%;margin:auto">' + html + '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o || (e.target.dataset && e.target.dataset.cerrar)) o.remove(); });
    return o;
  }
  function promoDlg() {
    const acep = (R || []).filter((r) => r.mk && r.em).length, t = X.tienda() || 'tu local';
    const o = dlg('promodlg', '<b style="font-size:19px">📧 Nueva promo por email</b><div class="k" style="margin-top:4px">Le llega a <b>' + acep + '</b> ' + (acep === 1 ? 'cliente' : 'clientes') + '. El mail sale con el nombre de ' + esc(t) + ', un botón a tu menú y el link para darse de baja.</div>' +
      '<label>Asunto</label><input id="pm_as" maxlength="80" placeholder="Ej: Martes 2x1 en hamburguesas 🍔">' +
      '<label>Mensaje</label><textarea id="pm_tx" rows="6" maxlength="1500" placeholder="Ej: Este martes llevá 2 hamburguesas dobles y pagá 1. Válido pidiendo desde el menú, de 20 a 23 hs."></textarea>' +
      '<div class="k" id="pm_er" style="color:#B42318;margin-top:6px"></div>' +
      '<button class="go" id="pm_ok">Mandar a ' + acep + ' ' + (acep === 1 ? 'cliente' : 'clientes') + '</button>' +
      '<button class="go alt" id="pm_pr" style="margin-top:8px">Mandarme una prueba a mí</button>' +
      '<button class="x" data-cerrar="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const val = () => ({ as: o.querySelector('#pm_as').value.trim(), tx: o.querySelector('#pm_tx').value.trim() });
    const er = (m) => { o.querySelector('#pm_er').textContent = m || ''; };
    const mandar = (prueba, b) => {
      const v = val(); if (v.as.length < 3) { er('Escribí el asunto.'); return; } if (v.tx.length < 5) { er('Escribí el mensaje.'); return; }
      if (!prueba && !confirm('¿Mandar la promo a ' + acep + ' clientes? No se puede deshacer.')) return;
      er(''); const tx0 = b.textContent; b.disabled = true; b.textContent = 'Mandando…';
      X.pushFetch('/mail/promo', { sid: X.sid(), as: v.as, tx: v.tx, link: X.catLink(), prueba: prueba ? 1 : 0 }).then((d) => {
        b.disabled = false; b.textContent = tx0;
        if (prueba) { alert('Listo: te mandamos la prueba a ' + (d.a || 'tu email') + '. Revisá también la carpeta de spam o promociones.'); return; }
        o.remove(); alert('¡Promo enviada a ' + d.n + ' clientes! ✓' + (d.falta ? '\n\n' + d.falta : ''));
      }).catch((e) => { b.disabled = false; b.textContent = tx0; er((e && e.message) || 'No se pudo mandar. Probá de nuevo.'); });
    };
    o.querySelector('#pm_ok').onclick = (e) => mandar(false, e.currentTarget);
    o.querySelector('#pm_pr').onclick = (e) => mandar(true, e.currentTarget);
  }
  function clic(e) {
    const b = e.target.closest && e.target.closest('[data-clx],[data-clf],[data-clc],[data-clreg]'); if (!b || !X.$('s-cli').contains(b)) return;
    if (b.dataset.clx === 'club') { clubDlg(); return; }
    if (b.dataset.clx === 'mail') { promoDlg(); return; }
    if (b.dataset.clreg) {
      const v = b.dataset.clreg;
      setDoc(doc(X.db, 'stores', X.sid(), 'public', 'info'), { reg: v }, { merge: true }).then(() => { const pb = X.pub(); if (pb) pb.reg = v; draw(); }).catch(X.fail);
      return;
    }
    if (b.dataset.clf) { filtro = b.dataset.clf; draw(); return; }
    if (b.dataset.clc) {
      const x = (L || []).find((y) => y.k === b.dataset.clc), c = clubCfg(X.pub()); if (!x) return;
      if (!confirm('¿Canjear el premio de ' + (x.n || 'este cliente') + '? (' + (c.premio || 'premio') + ')\nSe le descuentan ' + c.n + ' sellos.')) return;
      b.disabled = true; canjear(X.db, X.sid(), x.k, X.pub()).catch(X.fail);
    }
  }
  let wired = false;
  return { draw() { if (!wired) { wired = true; const s = X.$('s-cli'); if (s) s.addEventListener('click', clic); } draw(); }, stop };
}

let cssOk = false;
function css() {
  if (cssOk) return; cssOk = true;
  const st = document.createElement('style');
  st.textContent = '.clb{flex:none;border-radius:99px;padding:4px 9px;font-size:12px;font-weight:800;white-space:nowrap}' +
    '.clg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:10px}.clg>div{background:var(--bg);border-radius:12px;padding:8px 9px;min-width:0}.clg small{display:block;font-size:11.5px;color:var(--mut);font-weight:700}.clg b{display:block;font-size:14px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.clsel{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:10px}.clsel i{width:20px;height:20px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--line)}.clsel i.on{background:#F59E0B;box-shadow:none}.clsel span{font-size:13px;font-weight:800;color:var(--mut);margin-left:4px}' +
    '.clseg{display:flex;gap:4px;background:var(--bg);border-radius:14px;padding:4px;margin-top:10px}.clseg button{flex:1;border:0;border-radius:11px;padding:10px 4px;background:transparent;color:var(--ink);font:inherit;font-size:14px;font-weight:700;cursor:pointer}.clseg button.on{background:var(--card);box-shadow:0 1px 3px rgba(0,0,0,.15);font-weight:900;color:var(--sell)}';
  document.head.appendChild(st);
}
