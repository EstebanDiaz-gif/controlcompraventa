// Envíos de mercadería entre sucursales (traspasos).
// stores/{origen}/traspasos/{id} y stores/{destino}/traspasos/{id} (la misma ficha en las dos):
// { id, from, to, fromN, toN, st: 'enviado'|'recibido'|'cancelado', at, by, bn, items: [{k, n, s, z, q, c, raw}],
//   rat, rby, rbn, rec: [cantidades recibidas], cat, cby, cbn }
// Despachar: resta el stock en el origen (no es una venta). Recibir: suma en el destino (no es una compra).
// En ropa/productos además quedan movimientos 'ts' (salida) y 'te' (entrada) para el stock del dueño.
// Precio en el destino: si el producto ya existe ahí, mantiene su precio; si es nuevo, copia el del origen. El costo viaja.
import { doc, setDoc, getDoc, getDocs, onSnapshot, writeBatch, increment, query, where, collection } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { openScanner, scanButton, codeVariants, beep } from './scanner.js';

export function createTraspasos(X) {
  const db = X.db, $ = X.$, esc = X.esc, money = X.money;
  const S = { fam: null, famFor: '', pend: [], un: null, unFor: '' };
  const key = (s) => String(s || '').trim().toLowerCase();
  const dmy = (ms) => { const d = new Date(ms || 0); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const sref = (sid, id) => doc(db, 'stores', sid, 'stock', id);
  const tref = (sid, id) => doc(db, 'stores', sid, 'traspasos', id);
  const alm = () => X.biz() === 'almacen';
  const fail = (e) => X.fail(e);

  // ---------- sucursales de la familia (lista pública en la principal: stores/{main}/public/sucs) ----------
  function cargarFam() {
    const m = X.mainSid(); if (!m) return;
    if (S.famFor === m && S.fam) return;
    S.famFor = m;
    getDoc(doc(db, 'stores', m, 'public', 'sucs')).then((s) => { S.fam = s.exists() ? (s.data().list || []) : []; X.changed(); }, () => { S.fam = []; });
  }
  const destinos = () => (S.fam || []).filter((x) => x.id !== X.sid());
  const on = () => !!X.sid() && !!X.role() && X.biz() !== 'servicios' && destinos().length > 0;

  // ---------- envíos que llegan (en camino hacia esta sucursal) ----------
  function listen() {
    const sid = X.sid(); if (!sid || S.unFor === sid) return;
    stop(); S.unFor = sid;
    S.un = onSnapshot(query(collection(db, 'stores', sid, 'traspasos'), where('st', '==', 'enviado')), (sn) => {
      S.pend = []; sn.forEach((d) => { const t = d.data(); if (t.to === sid) S.pend.push(t); }); S.pend.sort((a, b) => a.at - b.at); X.changed();
    }, () => { S.pend = []; });
  }
  function stop() { if (S.un) S.un(); S.un = null; S.unFor = ''; S.pend = []; }

  function banner() {
    if (!S.pend.length) return '';
    const n = S.pend.length, f = S.pend[0];
    return '<div class="bn warn" data-tr="rec" style="cursor:pointer"><b>📥 ' + (n === 1 ? 'Llegó un envío de ' + esc(f.fromN || 'otra sucursal') : 'Llegaron ' + n + ' envíos de otras sucursales') + '.</b> Revisá la mercadería y confirmá lo que llegó. <u>Recibir</u></div>';
  }
  function bar() {
    cargarFam(); listen();
    if (!on()) return '';
    return '<div class="card" style="padding:12px 16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span><b>🚚 Envíos entre sucursales</b><small style="display:block;color:var(--mut)">Mandá mercadería a otra sucursal escaneando</small></span>' +
      (S.pend.length ? '<button class="go" data-tr="rec" style="width:auto;margin:0;padding:9px 14px;flex:none">📥 Recibir (' + S.pend.length + ')</button>' : '') + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><button class="go" data-tr="env" style="margin:0">Enviar a otra sucursal</button><button class="go alt" data-tr="hist" style="margin:0">Ver envíos</button></div></div>';
  }

  function modal(html) {
    const o = document.createElement('div'); o.className = 'trdlg';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto';
    o.innerHTML = '<div style="background:var(--card);color:var(--ink);border-radius:22px;padding:20px;max-width:480px;width:100%;margin:auto">' + html + '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o || (e.target.dataset && e.target.dataset.close)) o.remove(); });
    return o;
  }

  // ---------- despachar ----------
  const desc = (p) => esc(p.n) + (p.z ? ' · talle ' + esc(p.z) : '');
  function buscar(q) {
    const t = key(q).split(/\s+/).filter(Boolean); if (!t.length) return [];
    return X.st().filter((p) => { const hay = key(p.n + ' ' + p.s + ' ' + (p.z || '') + ' ' + (p.cb || '')); return t.every((w) => hay.indexOf(w) >= 0); }).slice(0, 8);
  }
  function porCodigo(code) {
    const v = codeVariants(code); const m = (x) => x && v.indexOf(String(x).trim().toLowerCase()) >= 0;
    return X.st().find((p) => m(p.cb)) || X.st().find((p) => m(p.s)) || null;
  }
  function enviar() {
    cargarFam();
    if (!X.canWrite()) { alert('El acceso de la tienda venció.'); return; }
    const ds = destinos(); if (!ds.length) { alert('No hay otras sucursales.'); return; }
    const L = []; // { p, q }
    const o = modal('<b style="font-size:19px">Enviar a otra sucursal</b><div class="k" style="margin-top:4px">Escaneá o buscá lo que mandás. Se descuenta del stock de acá y la otra sucursal lo confirma cuando llega.</div>' +
      '<label>¿A qué sucursal?</label><select id="trd">' + ds.map((d) => '<option value="' + esc(d.id) + '">' + esc(d.n) + '</option>').join('') + '</select>' +
      '<label>Producto</label><div style="display:flex;gap:8px;align-items:center"><input id="trq" type="search" enterkeyhint="go" autocomplete="off" placeholder="Nombre, código o talle" style="flex:1;min-width:0">' + scanButton('trscan') + '</div>' +
      '<div id="trr"></div><div id="trl" style="margin-top:12px"></div>' +
      '<button class="go" id="trok">Despachar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const qi = o.querySelector('#trq'), rr = o.querySelector('#trr'), ll = o.querySelector('#trl');
    const add = (p) => { const it = L.find((x) => x.p.id === p.id); if (it) it.q++; else L.push({ p, q: 1 }); qi.value = ''; rr.innerHTML = ''; draw(); };
    const draw = () => {
      ll.innerHTML = L.length ? '<b style="font-size:14px">Para mandar (' + L.reduce((a, x) => a + x.q, 0) + ')</b>' + L.map((x, i) => '<div class="it" style="align-items:center"><div><b>' + desc(x.p) + '</b><small>hay ' + x.p.q + ' acá</small></div><div style="display:flex;gap:6px;align-items:center"><input type="number" min="1" inputmode="numeric" data-tri="' + i + '" value="' + x.q + '" style="width:70px;margin:0;padding:8px"><button class="x" data-trx="' + i + '" aria-label="Quitar" style="font-size:20px">×</button></div></div>').join('') : '<div class="k">Todavía no agregaste productos.</div>';
    };
    draw();
    qi.oninput = () => { const r = buscar(qi.value); rr.innerHTML = r.length ? '<div class="rows" style="margin:6px 0 0">' + r.map((p) => '<button class="pl" data-tra="' + esc(p.id) + '"><span><b>' + desc(p) + '</b><small>' + (p.s ? esc(p.s) + ' · ' : '') + 'hay ' + p.q + '</small></span><b style="font-size:14px">Agregar</b></button>').join('') + '</div>' : (qi.value.trim() ? '<div class="k" style="margin-top:6px">No encontré ese producto acá.</div>' : ''); };
    const porCod = (code) => { const p = porCodigo(code); if (p) { beep(true); add(p); return true; } beep(false); return false; };
    qi.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = qi.value.trim(); if (!v) return; if (!porCod(v)) { const r = buscar(v); if (r.length === 1) add(r[0]); else alert('No encontré ese código en esta sucursal.'); } } };
    o.addEventListener('click', (e) => {
      const a = e.target.closest('[data-tra]'); if (a) { const p = X.st().find((x) => x.id === a.dataset.tra); if (p) add(p); return; }
      const x = e.target.closest('[data-trx]'); if (x) { L.splice(+x.dataset.trx, 1); draw(); return; }
      const s = e.target.closest('[data-al="trscan"]'); if (s) { openScanner({ title: 'Escaneá lo que mandás', multi: true, onCode: (c) => { const p = porCodigo(c); if (!p) return { ok: false, msg: 'Ese código no está en esta sucursal' }; add(p); return { ok: true, msg: desc(p).replace(/<[^>]+>/g, '') + ' ✓' }; } }); }
    });
    o.addEventListener('input', (e) => { const i = e.target.dataset && e.target.dataset.tri; if (i != null && L[+i]) L[+i].q = Math.max(1, Math.floor(+e.target.value || 1)); });
    setTimeout(() => qi.focus(), 50);
    o.querySelector('#trok').onclick = () => {
      if (!L.length) { alert('Agregá al menos un producto.'); return; }
      const to = o.querySelector('#trd').value, dn = (ds.find((d) => d.id === to) || {}).n || '';
      const sobre = L.filter((x) => x.q > x.p.q);
      if (sobre.length && !confirm('Estás mandando más de lo que figura en stock (' + sobre.map((x) => x.p.n + (x.p.z ? ' ' + x.p.z : '') + ': hay ' + x.p.q).join(', ') + '). ¿Seguir igual?')) return;
      if (!confirm('¿Despachar ' + L.reduce((a, x) => a + x.q, 0) + ' unidad(es) a ' + dn + '?')) return;
      despachar(to, dn, L.map((x) => ({ p: x.p, q: x.q }))).then(() => { o.remove(); alert('Despachado ✓. Cuando llegue, en ' + dn + ' lo confirman y se suma a su stock.'); X.changed(); }).catch(fail);
    };
  }
  function despachar(to, toN, L) {
    const sid = X.sid(), id = 'tr' + uid(), u = X.user(), now = Date.now(), b = writeBatch(db), ropa = !alm();
    const items = L.map((x) => {
      const p = x.p, raw = {};
      ['n', 's', 'z', 'pn', 'pm', 'cat', 'w', 'min', 'img', 'hd', 'mm', 'cb'].forEach((k) => { if (p[k] !== undefined && p[k] !== '' && p[k] !== false && p[k] !== 0) raw[k] = p[k]; });
      return { k: p.id, n: p.n, s: p.s || '', z: p.z || '', q: x.q, c: Math.round(X.costo(p) || 0), raw };
    });
    const t = { id, from: sid, to, fromN: X.sname(), toN, st: 'enviado', at: now, by: u.uid, bn: X.nm(), items };
    b.set(tref(sid, id), t); b.set(tref(to, id), t);
    items.forEach((it, i) => {
      b.update(sref(sid, it.k), { q: increment(-it.q) });
      if (ropa) b.set(doc(db, 'stores', sid, 'movs', String(now + i)), { id: now + i, t: 'ts', d: X.today(), p: it.n, s: it.s, z: it.z, q: it.q, u: it.c, k: '', tr: id, a: toN, by: u.uid, bn: X.nm() });
    });
    return b.commit();
  }

  // ---------- recibir ----------
  function recibir() {
    if (!S.pend.length) { alert('No hay envíos en camino hacia esta sucursal.'); return; }
    const o = modal('<b style="font-size:19px">Recibir mercadería</b><div class="k" style="margin-top:4px">Contá lo que llegó. Si llegó menos de lo que mandaron, corregí la cantidad: queda registrado.</div>' +
      S.pend.map((t, ti) => '<div style="margin-top:14px;padding:12px;border-radius:14px;background:var(--bg)"><b>De ' + esc(t.fromN || '') + '</b><small style="display:block;color:var(--mut)">Despachó ' + esc(t.bn || '') + ' · ' + dmy(t.at) + '</small>' +
        t.items.map((it, i) => '<div class="it" style="align-items:center"><div><b>' + desc(it) + '</b><small>mandaron ' + it.q + '</small></div><div style="display:flex;gap:6px;align-items:center"><small>llegaron</small><input type="number" min="0" inputmode="numeric" data-rq="' + ti + '_' + i + '" max="' + it.q + '" value="' + it.q + '" style="width:70px;margin:0;padding:8px"></div></div>').join('') +
        '<button class="go" data-rok="' + ti + '" style="margin-top:10px">Confirmar lo que llegó</button></div>').join('') +
      '<button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cerrar</button>');
    o.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rok]'); if (!b) return;
      const ti = +b.dataset.rok, t = S.pend[ti]; if (!t) return;
      const rec = t.items.map((it, i) => { const v = o.querySelector('[data-rq="' + ti + '_' + i + '"]'); return Math.min(t.items[i].q, Math.max(0, Math.floor(+(v && v.value) || 0))); });
      const dif = t.items.filter((it, i) => rec[i] !== it.q);
      if (dif.length && !confirm('Llegó distinto de lo que mandaron (' + dif.map((it) => it.n + (it.z ? ' ' + it.z : '')).join(', ') + '). Queda registrado. ¿Confirmar?')) return;
      b.disabled = true;
      confirmar(t, rec).then(() => { b.closest('div').innerHTML = '<b style="color:#1a8f4c">Recibido ✓</b> <small>Ya se sumó al stock de esta sucursal.</small>'; X.changed(); }).catch((er) => { b.disabled = false; fail(er); });
    });
  }
  // Busca el producto en el stock de esta sucursal: ropa por clave (código/nombre + talle), almacén por código o nombre.
  function enDestino(it) {
    const st = X.st();
    if (!alm()) { const id = X.skey(X.pk({ s: it.s, p: it.n, z: it.z })); return st.find((p) => p.id === id) || { id, nuevo: true }; }
    const v = it.s ? codeVariants(it.s) : [];
    return (it.s && st.find((p) => p.s && v.indexOf(String(p.s).trim().toLowerCase()) >= 0)) || st.find((p) => key(p.n) === key(it.n)) || { id: 'al_' + X.rnd(10), nuevo: true };
  }
  function confirmar(t, rec) {
    const sid = X.sid(), u = X.user(), now = Date.now(), b = writeBatch(db), ropa = !alm();
    const fin = { st: 'recibido', rat: now, rby: u.uid, rbn: X.nm(), rec };
    b.update(tref(sid, t.id), fin); b.update(tref(t.from, t.id), fin);
    t.items.forEach((it, i) => {
      const q = rec[i]; if (!(q > 0)) return;
      const d = enDestino(it);
      if (d.nuevo) {
        const o = Object.assign({}, it.raw || {}, { n: it.n, s: it.s || '', q, tr: t.id });
        if (ropa) o.z = it.z || ''; if (it.c) o.c = it.c;
        b.set(sref(sid, d.id), o);
      } else {
        const o = { q: increment(q), tr: t.id };
        if (it.c > 0) { const q0 = Math.max(0, d.q || 0), c0 = d.c || 0; o.c = Math.round(q0 + q > 0 ? (q0 * (c0 || it.c) + q * it.c) / (q0 + q) : it.c); }
        b.update(sref(sid, d.id), o);
      }
      if (ropa) b.set(doc(db, 'stores', sid, 'movs', String(now + i)), { id: now + i, t: 'te', d: X.today(), p: it.n, s: it.s, z: it.z, q, u: it.c || 0, k: '', tr: t.id, a: t.fromN || '', by: u.uid, bn: X.nm() });
    });
    return b.commit();
  }

  // ---------- historial ----------
  function historial() {
    const sid = X.sid();
    const o = modal('<b style="font-size:19px">Envíos entre sucursales</b><div id="trh" class="k" style="margin-top:8px">Cargando…</div><button class="go alt" data-close="1">Cerrar</button>');
    getDocs(collection(db, 'stores', sid, 'traspasos')).then((sn) => {
      const l = []; sn.forEach((d) => l.push(d.data())); l.sort((a, b) => b.at - a.at);
      const h = l.slice(0, 40).map((t) => {
        const sale = t.from === sid, tot = t.items.reduce((a, x) => a + x.q, 0), rt = t.rec ? t.rec.reduce((a, x) => a + x, 0) : null;
        const est = t.st === 'enviado' ? '<b style="color:#8a4b00">En camino</b>' : t.st === 'cancelado' ? '<b style="color:var(--mut)">Cancelado</b>' : (rt !== tot ? '<b style="color:#b3261e">Llegaron ' + rt + ' de ' + tot + '</b>' : '<b style="color:#1a8f4c">Recibido ✓</b>');
        return '<div class="it" style="align-items:flex-start"><div><b>' + (sale ? '→ a ' + esc(t.toN || '') : '← de ' + esc(t.fromN || '')) + '</b><small>' + dmy(t.at) + ' · ' + tot + ' u. · despachó ' + esc(t.bn || '') + (t.rbn ? ' · recibió ' + esc(t.rbn) : '') + '</small><small>' + t.items.map((x, i) => esc(x.n) + (x.z ? ' ' + esc(x.z) : '') + ' ×' + x.q + (t.rec && t.rec[i] !== x.q ? ' (llegaron ' + t.rec[i] + ')' : '')).join(', ') + '</small>' +
          (sale && t.st === 'enviado' ? '<button class="x" data-trc="' + esc(t.id) + '" style="font-size:13px;text-decoration:underline;margin-top:4px">Cancelar envío</button>' : '') + '</div><div style="text-align:right;font-size:13px">' + est + '</div></div>';
      }).join('');
      const e = o.querySelector('#trh'); if (e) e.innerHTML = h || 'Todavía no hay envíos.';
      o.addEventListener('click', (ev) => { const c = ev.target.closest('[data-trc]'); if (!c) return; const t = l.find((x) => x.id === c.dataset.trc); if (t && confirm('¿Cancelar este envío? La mercadería vuelve al stock de acá.')) cancelar(t).then(() => { o.remove(); X.changed(); }).catch(fail); });
    }).catch(() => { const e = o.querySelector('#trh'); if (e) e.textContent = 'No pude cargar los envíos.'; });
  }
  function cancelar(t) {
    const sid = X.sid(), u = X.user(), now = Date.now(), b = writeBatch(db), ropa = !alm();
    const fin = { st: 'cancelado', cat: now, cby: u.uid, cbn: X.nm() };
    b.update(tref(sid, t.id), fin); b.update(tref(t.to, t.id), fin);
    t.items.forEach((it, i) => {
      b.update(sref(sid, it.k), { q: increment(it.q), tr: t.id });
      if (ropa) b.set(doc(db, 'stores', sid, 'movs', String(now + i)), { id: now + i, t: 'te', d: X.today(), p: it.n, s: it.s, z: it.z, q: it.q, u: it.c || 0, k: '', tr: t.id, a: 'envío cancelado', by: u.uid, bn: X.nm() });
    });
    return b.commit();
  }

  function action(a) { if (a === 'env') enviar(); else if (a === 'rec') recibir(); else if (a === 'hist') historial(); }
  // La principal mantiene la lista pública de sucursales (para que los empleados de cualquier sucursal puedan elegir destino).
  function publicarFam(list) {
    const m = X.mainSid(); if (!m || m !== X.sid() || X.role() !== 'admin') return;
    const v = JSON.stringify(list); if (S.pubDone === v) return; S.pubDone = v;
    setDoc(doc(db, 'stores', m, 'public', 'sucs'), { list, at: Date.now() }).catch(() => {});
    S.fam = list; S.famFor = m;
  }
  return { bar, banner, action, listen, stop, on, publicarFam, cargarFam };
}
