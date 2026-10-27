// Envíos a domicilio con repartidores.
// Config (cfg/servicios.env): { on, cob (cuánto se le cobra al cliente), pag (cuánto se le paga al repartidor), reps: [{id, n, tel}], cat (catálogo ofrece envío) }
// Cada envío: stores/{sid}/envios/{id} = { id, d, m, at, rep, rn, cob, pag, dir, det, vid, st: 'debe'|'pagado', by, bn, pa, pbn }
// Al repartidor se le junta lo que se le debe y se le paga después: el pago sale de la caja abierta y queda como gasto (Envíos).
import { doc, setDoc, getDocs, onSnapshot, writeBatch, increment, query, where, collection } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export function createRepartos(X) {
  const db = X.db, $ = X.$, esc = X.esc, money = X.money;
  const S = { debe: null, mes: null, mesM: '', un: {}, unFor: '' };
  const cfg = () => (X.cs() && X.cs().env) || {};
  const reps = () => cfg().reps || [];
  const on = () => !!cfg().on && X.biz() !== 'servicios';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const hm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const fail = (e) => X.fail(e);
  const col = (n) => collection(db, 'stores', X.sid(), n);

  function modal(html) {
    const o = document.createElement('div'); o.className = 'rpdlg';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto';
    o.innerHTML = '<div style="background:var(--card);color:var(--ink);border-radius:22px;padding:20px;max-width:440px;width:100%;margin:auto">' + html + '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o || (e.target.dataset && e.target.dataset.close)) o.remove(); });
    return o;
  }
  const repOpts = (sel) => reps().map((r) => '<option value="' + esc(r.id) + '"' + (r.id === sel ? ' selected' : '') + '>' + esc(r.n) + '</option>').join('') + '<option value=""' + (!sel ? ' selected' : '') + '>Sin asignar / otro</option>';
  const campos = (p) => '<label>Repartidor</label><select id="' + p + 'rep">' + repOpts(reps()[0] && reps()[0].id) + '</select>' +
    '<div class="row"><div><label>Le cobrás al cliente</label><input id="' + p + 'cob" type="number" inputmode="decimal" min="0" value="' + (cfg().cob || '') + '" placeholder="0"></div><div><label>Le pagás al repartidor</label><input id="' + p + 'pag" type="number" inputmode="decimal" min="0" value="' + (cfg().pag || '') + '" placeholder="0"></div></div>' +
    '<label>Dirección (opcional)</label><input id="' + p + 'dir" maxlength="120" autocomplete="off" placeholder="Ej: San Martín 1234">';
  const leerDe = (root, p) => {
    const rid = root.querySelector('#' + p + 'rep').value, r = reps().find((x) => x.id === rid);
    return { rep: rid || '', rn: r ? r.n : 'Sin asignar', cob: Math.max(0, Math.round(+root.querySelector('#' + p + 'cob').value || 0)), pag: Math.max(0, Math.round(+root.querySelector('#' + p + 'pag').value || 0)), dir: root.querySelector('#' + p + 'dir').value.trim().slice(0, 120) };
  };

  // ---------- en el formulario de venta (ropa / productos) ----------
  function formHtml() {
    if (!on()) return '';
    return '<label style="display:flex;gap:10px;align-items:center;margin-top:14px;font-weight:600"><input id="evon" type="checkbox" style="width:auto"> 🛵 Con envío a domicilio</label>' +
      '<div id="evbox" style="display:none;background:var(--line);border-radius:14px;padding:14px;margin:10px 0">' + campos('ev') + '<div class="k" id="evmsg" style="margin-top:6px"></div></div>';
  }
  function wire(onChange) {
    const c = $('evon'); if (!c) return;
    const box = $('evbox'), msg = () => { const v = leer(); $('evmsg').textContent = v ? 'El cliente paga ' + money(v.cob) + ' de envío. Al repartidor se le anota ' + money(v.pag) + ' para pagarle después.' : ''; if (onChange) onChange(); };
    c.onchange = () => { box.style.display = c.checked ? 'block' : 'none'; msg(); };
    ['evrep', 'evcob', 'evpag'].forEach((id) => { const e = $(id); if (e) e.addEventListener('input', msg); });
  }
  function leer() { const c = $('evon'); if (!c || !c.checked) return null; return leerDe(document, 'ev'); }

  // ---------- almacén: ventana para agregar el envío al carrito ----------
  function dlg(cb) {
    if (!on()) return;
    const o = modal('<b style="font-size:19px">🛵 Envío a domicilio</b><div class="k" style="margin-top:4px">Se suma a la venta lo que le cobrás al cliente. Al repartidor se le anota lo que le pagás, para pagarle después.</div>' + campos('ed') +
      '<button class="go" id="edok">Agregar envío</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelector('#edok').onclick = () => { const v = leerDe(o, 'ed'); o.remove(); cb(v); };
  }

  // ---------- registrar el envío (lo que se le debe al repartidor) ----------
  function registrar(env, info) {
    if (!env) return;
    const id = 'ev' + uid(), d = X.today(), u = X.user();
    const o = { id, d, m: d.slice(0, 7), at: Date.now(), rep: env.rep || '', rn: env.rn || '', cob: env.cob || 0, pag: env.pag || 0, dir: env.dir || '', det: String((info && info.det) || '').slice(0, 200), vid: String((info && info.vid) || ''), st: env.pag > 0 ? 'debe' : 'pagado', by: u.uid, bn: X.nm() };
    setDoc(doc(db, 'stores', X.sid(), 'envios', id), o).catch(fail);
  }

  // ---------- panel del dueño (Equipo) ----------
  function listen(month) {
    if (X.role() !== 'admin' || !X.sid()) return;
    if (S.unFor !== X.sid()) { stop(); S.unFor = X.sid(); }
    if (!S.un.debe) S.un.debe = onSnapshot(query(col('envios'), where('st', '==', 'debe')), (sn) => { S.debe = []; sn.forEach((d) => S.debe.push(d.data())); X.changed(); }, () => { S.debe = []; });
    if (S.mesM !== month) { if (S.un.mes) S.un.mes(); S.mesM = month; S.mes = null; S.un.mes = onSnapshot(query(col('envios'), where('m', '==', month)), (sn) => { S.mes = []; sn.forEach((d) => S.mes.push(d.data())); X.changed(); }, () => { S.mes = []; }); }
  }
  function stop() { Object.keys(S.un).forEach((k) => S.un[k] && S.un[k]()); S.un = {}; S.debe = null; S.mes = null; S.mesM = ''; S.unFor = ''; }
  function card(month) {
    if (X.role() !== 'admin' || X.biz() === 'servicios') return '';
    const c = cfg();
    let h = '<div class="card" id="rpc"><b>🛵 Envíos a domicilio</b><div class="k" style="margin:4px 0 0">Al vender marcás "Con envío": se suma lo que le cobrás al cliente y al repartidor se le va anotando lo que le pagás. Le pagás cuando quieras desde acá: sale de la caja y queda como gasto.</div>' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:12px;font-weight:600"><input type="checkbox" id="rpon" style="width:auto"' + (c.on ? ' checked' : '') + '> Hago envíos a domicilio</label>';
    if (!c.on) return h + '</div>';
    listen(month);
    // deudas por repartidor
    const by = {};
    (S.debe || []).forEach((e) => { const k = e.rep || '_'; const o = by[k] || (by[k] = { rep: e.rep, rn: e.rn || 'Sin asignar', n: 0, t: 0 }); o.n++; o.t += e.pag || 0; });
    const ks = Object.keys(by);
    h += '<div style="margin-top:14px"><b style="font-size:15px">Lo que les debés</b></div>' + (S.debe == null ? '<div class="k">Cargando…</div>' : ks.length ? ks.map((k) => { const o = by[k]; return '<div class="it"><div><b>' + esc(o.rn) + '</b><small>' + o.n + ' envío' + (o.n === 1 ? '' : 's') + ' sin pagar</small></div><div style="display:flex;gap:8px;align-items:center"><b>' + money(o.t) + '</b><button class="go" data-rpp="' + esc(k) + '" style="width:auto;margin:0;padding:8px 12px;font-size:13px">Pagar</button></div></div>'; }).join('') : '<div class="k">No les debés nada a los repartidores ✓</div>');
    if (S.mes) { let cob = 0, pag = 0; S.mes.forEach((e) => { cob += e.cob || 0; pag += e.pag || 0; }); if (S.mes.length) h += '<div class="rows" style="margin:10px 0 0"><div class="r2"><span>Envíos este mes<small>' + S.mes.length + ' envío' + (S.mes.length === 1 ? '' : 's') + '</small></span><b>' + money(cob) + '</b></div><div class="r2"><span>Para repartidores</span><b>' + money(pag) + '</b></div><div class="r2"><span>Te queda de los envíos</span><b class="' + (cob - pag >= 0 ? 'pos' : 'neg') + '">' + money(cob - pag) + '</b></div></div>'; }
    // configuración
    h += '<div style="margin-top:16px"><b style="font-size:15px">Repartidores</b></div>' + (reps().length ? reps().map((r) => '<div class="it"><div><b>' + esc(r.n) + '</b>' + (r.tel ? '<small>' + esc(r.tel) + '</small>' : '') + '</div><button class="x" data-rpx="' + esc(r.id) + '" aria-label="Quitar">×</button></div>').join('') : '<div class="k">Todavía no cargaste repartidores.</div>') +
      '<div class="row" style="align-items:flex-end"><div><label>Nombre</label><input id="rpn" maxlength="40" autocomplete="off" placeholder="Ej: Juan moto"></div><div><label>WhatsApp (opcional)</label><input id="rpt" inputmode="tel" maxlength="20" autocomplete="off"></div></div><button class="go alt" data-rpa="1">+ Agregar repartidor</button>' +
      '<div style="margin-top:16px"><b style="font-size:15px">Precios de siempre</b><div class="k">Se completan solos al vender (los podés cambiar en cada envío).</div></div>' +
      '<div class="row"><div><label>Le cobrás al cliente</label><input id="rpcob" type="number" inputmode="decimal" min="0" value="' + (c.cob || '') + '"></div><div><label>Le pagás al repartidor</label><input id="rppag" type="number" inputmode="decimal" min="0" value="' + (c.pag || '') + '"></div></div>' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:12px;font-weight:600"><input type="checkbox" id="rpcat" style="width:auto"' + (c.cat ? ' checked' : '') + '> Ofrecer envío en el catálogo online</label><div class="k" style="margin-top:2px">El cliente elige "Envío a domicilio" en su pedido y se le suma lo que le cobrás.</div>' +
      '<button class="go" data-rps="1">Guardar precios</button>';
    return h + '</div>';
  }
  function guardar(o) {
    const c = Object.assign({}, cfg(), o);
    setDoc(doc(db, 'stores', X.sid(), 'cfg', 'servicios'), { env: c }, { merge: true }).catch(fail);
    // el catálogo lee public/info
    setDoc(doc(db, 'stores', X.sid(), 'public', 'info'), { env: { on: !!(c.on && c.cat), precio: c.cob || 0 } }, { merge: true }).catch(() => {});
  }
  function pagar(k) {
    const l = (S.debe || []).filter((e) => (e.rep || '_') === k); if (!l.length) return;
    const tot = l.reduce((a, e) => a + (e.pag || 0), 0), rn = l[0].rn || 'Sin asignar';
    if (!confirm('¿Le pagás ' + money(tot) + ' a ' + rn + ' por ' + l.length + ' envío' + (l.length === 1 ? '' : 's') + '?\n\nSale de la caja abierta (si hay) y queda como gasto de Envíos.')) return;
    const sid = X.sid(), u = X.user(), now = Date.now(), d = X.today(), b = writeBatch(db);
    l.forEach((e) => b.update(doc(db, 'stores', sid, 'envios', e.id), { st: 'pagado', pa: now, pbn: X.nm() }));
    b.set(doc(db, 'stores', sid, 'gastos', String(now)), { id: now, d, c: 'Envíos', n: 'Pago a repartidor ' + rn + ' (' + l.length + ' envío' + (l.length === 1 ? '' : 's') + ')', a: tot, by: u.uid, bn: X.nm() });
    b.commit().then(() => getDocs(query(col('cajas'), where('st', '==', 'open')))).then((sn) => {
      let c = null; sn.forEach((x) => { if (!c) c = x.data(); });
      if (c) setDoc(doc(db, 'stores', sid, 'cajas', c.id), { ret: increment(tot), mv: { [uid()]: { t: 'r', a: tot, r: 'Pago a repartidor ' + rn, h: hm(), bn: X.nm() } } }, { merge: true }).catch(() => {});
      alert('Listo: pagado ' + money(tot) + ' a ' + rn + '.' + (c ? ' Se descontó de la caja abierta.' : ' No había caja abierta: si lo pagaste con plata de la caja, anotalo con "Sacar / poner".'));
    }).catch(fail);
  }
  function click(e) {
    const t = e.target;
    const p = t.closest('[data-rpp]'); if (p) { pagar(p.dataset.rpp); return true; }
    const x = t.closest('[data-rpx]'); if (x) { if (confirm('¿Quitar este repartidor? Lo que se le debe no se borra.')) guardar({ reps: reps().filter((r) => r.id !== x.dataset.rpx) }); return true; }
    if (t.closest('[data-rpa]')) { const n = $('rpn').value.trim().slice(0, 40), tel = $('rpt').value.trim().slice(0, 20); if (!n) { alert('Escribí el nombre del repartidor.'); return true; } guardar({ reps: reps().concat([{ id: 'r' + uid(), n, tel }]) }); return true; }
    if (t.closest('[data-rps]')) { guardar({ cob: Math.max(0, Math.round(+$('rpcob').value || 0)), pag: Math.max(0, Math.round(+$('rppag').value || 0)), cat: $('rpcat').checked }); alert('Guardado.'); return true; }
    return false;
  }
  function change(e) { if (e.target.id === 'rpon') { guardar({ on: e.target.checked }); return true; } return false; }
  return { on, formHtml, wire, leer, dlg, registrar, card, click, change, listen, stop };
}
