// Cierre de caja para tiendas de productos (ropa, calzado…) y servicios.
// Mismo modelo de datos que la caja del almacén: stores/{sid}/cajas/{id}
// { id, d, m, ab, by, bn, ini, st: 'open'|'closed', n, v, p: {ef, tr, tj, qr, fi}, c: {ef, tr, ...} (cobros de fiado),
//   ing, ret, mv: {id: {t, a, r, h, bn}}, ci, cb, cbn, cnt, esp, dif, deja, nota }
// Las ventas y cobros suman con increment en una escritura aparte, así una caja cerrada en otro celular nunca frena una venta.
import { doc, setDoc, onSnapshot, increment, query, where, collection } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { PAY, esperado } from './almacen-calc.js';

export const PAGOS = [['ef', 'Efectivo'], ['tr', 'Transferencia'], ['tj', 'Tarjeta'], ['qr', 'QR / Mercado Pago']];

export function createCaja(X) {
  const db = X.db, $ = X.$, esc = X.esc, money = X.money;
  const S = { caja: null, err: false, mes: null, mesM: null };
  const un = {};
  const off = (k) => { if (un[k]) { un[k](); delete un[k]; } };
  const col = (n) => collection(db, 'stores', X.sid(), n);
  const ref = (id) => doc(db, 'stores', X.sid(), 'cajas', id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const hm = (ms) => { const d = new Date(ms || 0); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const dmy = (s) => String(s || '').split('-').reverse().join('/');
  const now = () => { const d = new Date(); return hm(d.getTime()); };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } };
  const deny = (e) => e && String(e.code || '').indexOf('permission') >= 0;
  const failW = (e) => X.fail(e);

  function modal(html) {
    const o = document.createElement('div'); o.className = 'cjdlg';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto';
    o.innerHTML = '<div style="background:var(--card);color:var(--ink);border-radius:22px;padding:20px;max-width:440px;width:100%;margin:auto">' + html + '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o || (e.target.dataset && e.target.dataset.close)) o.remove(); });
    return o;
  }

  const enUso = () => X.on() && !!X.sid();
  function listen() {
    if (!enUso() || un.caja) return;
    un.caja = onSnapshot(query(col('cajas'), where('st', '==', 'open')), (sn) => {
      const l = []; sn.forEach((x) => l.push(x.data())); l.sort((a, b) => (a.ab || 0) - (b.ab || 0));
      S.caja = l[0] || null; S.err = false; paint(); X.changed();
    }, (e) => { S.caja = null; S.err = deny(e); paint(); });
  }
  function listenMes(m) {
    if (!enUso() || !X.adm() || (un.mes && S.mesM === m)) return;
    off('mes'); S.mesM = m; S.mes = null;
    un.mes = onSnapshot(query(col('cajas'), where('m', '==', m)), (sn) => {
      S.mes = []; sn.forEach((x) => S.mes.push(x.data())); S.mes.sort((a, b) => (b.ab || 0) - (a.ab || 0)); X.changed('mes');
    }, () => { S.mes = []; });
  }
  function stop() { Object.keys(un).forEach(off); S.caja = null; S.err = false; S.mes = null; S.mesM = null; }

  // ---------- barra arriba de Vender / Atender ----------
  function bar() { return enUso() ? '<div class="cjbar">' + barInner() + '</div>' : ''; }
  function barInner() {
    if (S.err) return X.adm() ? '<div class="bn warn" style="margin:0 0 12px">Para usar el cierre de caja, publicá las reglas nuevas de Firebase.</div>' : '';
    const c = S.caja;
    if (!c) return '<div class="card cjb"><span><b>Caja cerrada</b><small>Abrila para controlar el efectivo del día</small></span><button class="go" data-cj="open" style="width:auto;margin:0;padding:10px 16px;flex:none">Abrir caja</button></div>';
    return '<div class="card cjb cjo"><div class="cjt"><span><b>🟢 Caja abierta</b><small>desde las ' + hm(c.ab) + (c.d !== X.today() ? ' del ' + dmy(c.d) : '') + ' · ' + esc(c.bn || '') + '</small></span>' +
      (X.adm() ? '<span style="text-align:right"><small>Efectivo en caja</small><b style="font-size:20px">' + money(esperado(c)) + '</b></span>' : '<span style="text-align:right"><small>' + (X.palabra(2).charAt(0).toUpperCase() + X.palabra(2).slice(1)) + '</small><b>' + (c.n || 0) + '</b></span>') + '</div>' +
      '<div class="cjg"><button class="go alt" data-cj="mov">Sacar / poner</button><button class="go" data-cj="close">Cerrar caja</button></div></div>';
  }
  function paint() { document.querySelectorAll('.cjbar').forEach((e) => { e.innerHTML = barInner(); }); }

  function abrir() {
    if (!X.canWrite()) { alert('El acceso de la tienda venció.'); return; }
    if (S.caja) { paint(); return; }
    const last = lsGet('pk_deja_' + X.sid()) || '';
    const o = modal('<b style="font-size:19px">Abrir caja</b><div class="k" style="margin-top:4px">Contá el efectivo con el que arrancás (el cambio que quedó en la caja).</div>' +
      '<label>Efectivo inicial</label><input id="cji" type="number" inputmode="decimal" min="0" placeholder="0" value="' + esc(last) + '">' +
      '<button class="go" id="cjok">Abrir caja</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const i = o.querySelector('#cji');
    const ok = () => {
      const ini = Math.round(+i.value || 0);
      if (ini < 0) { alert('El monto no puede ser negativo.'); return; }
      const id = uid(), u = X.user(), d = X.today();
      setDoc(ref(id), { id, d, m: d.slice(0, 7), ab: Date.now(), by: u.uid, bn: X.nm(), ini, st: 'open', n: 0, v: 0, p: {}, c: {}, ing: 0, ret: 0 }).catch(failW);
      o.remove();
    };
    o.querySelector('#cjok').onclick = ok; i.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    setTimeout(() => { i.focus(); i.select(); }, 50);
  }
  function mover() {
    const c = S.caja; if (!c) return;
    let t = 'r';
    const o = modal('<b style="font-size:19px">Sacar o poner plata</b><div class="k" style="margin-top:4px">Para cuando pagás algo con la plata de la caja o agregás cambio. Así el cierre da bien.</div>' +
      '<div class="seg" style="margin-top:12px"><button class="pay on" data-t="r">Saco plata</button><button class="pay" data-t="i">Pongo plata</button></div>' +
      '<label>Monto</label><input id="cma" type="number" inputmode="decimal" min="0" placeholder="0">' +
      '<label>Motivo</label><input id="cmr" maxlength="60" autocomplete="off" placeholder="Ej: Pago del flete">' +
      '<button class="go" id="cmok">Guardar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { t = b.dataset.t; o.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); o.querySelector('#cmr').placeholder = t === 'r' ? 'Ej: Pago del flete' : 'Ej: Cambio que traje'; }; });
    o.querySelector('#cmok').onclick = () => {
      const a = Math.round(+o.querySelector('#cma').value || 0), r = o.querySelector('#cmr').value.trim().slice(0, 60);
      if (!(a > 0)) { alert('Escribí el monto.'); return; }
      if (!r) { alert('Escribí el motivo (así el dueño sabe para qué fue).'); return; }
      setDoc(ref(c.id), { [t === 'r' ? 'ret' : 'ing']: increment(a), mv: { [uid()]: { t, a, r, h: now(), bn: X.nm() } } }, { merge: true }).catch(failW);
      o.remove();
    };
    setTimeout(() => o.querySelector('#cma').focus(), 50);
  }
  function filas(c) {
    const p = c.p || {}, cb = c.c || {}, r = (t, v) => '<div class="r2"><span>' + t + '</span><b style="font-size:16px">' + v + '</b></div>';
    let h = '<div class="rows" style="margin:10px 0 0">' + r('Efectivo inicial', money(c.ini || 0)) + r('Ventas en efectivo', '+ ' + money(p.ef || 0)) +
      (cb.ef ? r('Cobros de fiado en efectivo', '+ ' + money(cb.ef)) : '') + (c.ing ? r('Puse plata', '+ ' + money(c.ing)) : '') + (c.ret ? r('Saqué plata', '<span style="color:#b3261e">− ' + money(c.ret) + '</span>') : '') +
      '<div class="r2" style="border-top:2px solid var(--line);padding-top:8px"><span><b>Debería haber</b></span><b style="font-size:20px">' + money(c.esp != null && c.st === 'closed' ? c.esp : esperado(c)) + '</b></div></div>';
    const otros = ['tr', 'tj', 'qr', 'fi'].filter((k) => (p[k] || 0) || (cb[k] || 0));
    if (otros.length) h += '<div class="k" style="margin-top:12px"><b>Otros medios</b> (no van a la caja)</div><div class="rows" style="margin:4px 0 0">' + otros.map((k) => r(k === 'fi' ? 'Quedó fiado' : PAY[k], money((p[k] || 0) + (cb[k] || 0)))).join('') + '</div>';
    const mv = Object.keys(c.mv || {}).map((k) => c.mv[k]).sort((a, b) => String(a.h).localeCompare(String(b.h)));
    if (mv.length) h += '<div class="k" style="margin-top:12px"><b>Movimientos</b></div>' + mv.map((m) => '<div class="it"><div><b>' + (m.t === 'r' ? 'Sacó' : 'Puso') + ' ' + money(m.a) + '</b><small>' + esc(m.h || '') + ' · ' + esc(m.r || '') + (m.bn ? ' · ' + esc(m.bn) : '') + '</small></div></div>').join('');
    return h;
  }
  const difHtml = (d) => d === 0 ? '<b style="color:#1a8f4c">Justo ✓</b>' : d < 0 ? '<b style="color:#b3261e">Faltan ' + money(-d) + '</b>' : '<b style="color:var(--sell)">Sobran ' + money(d) + '</b>';
  const ventasTxt = (c) => (c.n || 0) + ' ' + X.palabra(c.n || 0) + ' por ' + money(c.v || 0);
  function cerrar() {
    const c = S.caja; if (!c) return;
    const A = X.adm(), esp = esperado(c);
    const o = modal('<b style="font-size:19px">Cerrar caja</b><div class="k" style="margin-top:4px">Abierta a las ' + hm(c.ab) + (c.d !== X.today() ? ' del ' + dmy(c.d) : '') + ' por ' + esc(c.bn || '') + ' · ' + ventasTxt(c) + '</div>' +
      (A ? filas(c) : '<div class="k" style="margin-top:10px">Contá todo el efectivo de la caja (billetes y monedas) y escribí el total.</div>') +
      '<label>¿Cuánto efectivo contaste?</label><input id="ccn" type="number" inputmode="decimal" min="0" placeholder="0"><div id="ccd" style="margin-top:8px;font-size:18px"></div>' +
      '<label>¿Cuánto dejás en la caja para mañana? (opcional)</label><input id="ccj" type="number" inputmode="decimal" min="0" placeholder="0">' +
      '<label>Nota (opcional)</label><input id="ccx" maxlength="120" autocomplete="off" placeholder="Ej: di mal un vuelto">' +
      '<button class="go" id="ccok">Cerrar caja</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const cn = o.querySelector('#ccn');
    if (A) cn.oninput = () => { o.querySelector('#ccd').innerHTML = cn.value === '' ? '' : difHtml(Math.round(+cn.value) - esp); };
    o.querySelector('#ccok').onclick = () => {
      if (cn.value === '') { alert('Escribí cuánto efectivo contaste (si no hay nada, poné 0).'); cn.focus(); return; }
      const cnt = Math.round(+cn.value || 0), deja = Math.round(+o.querySelector('#ccj').value || 0), nota = o.querySelector('#ccx').value.trim().slice(0, 120), u = X.user();
      if (cnt < 0 || deja < 0) { alert('Los montos no pueden ser negativos.'); return; }
      const fin = { st: 'closed', ci: Date.now(), cb: u.uid, cbn: X.nm(), cnt, esp, dif: cnt - esp, deja, nota };
      setDoc(ref(c.id), fin, { merge: true }).catch(failW);
      lsSet('pk_deja_' + X.sid(), String(deja || ''));
      o.remove(); ver(Object.assign({}, c, fin), true);
    };
    setTimeout(() => cn.focus(), 50);
  }
  function texto(c) {
    const p = c.p || {}, cb = c.c || {};
    const l = ['*Cierre de caja · ' + (X.sname() || '') + '*', dmy(c.d) + ' · ' + hm(c.ab) + ' a ' + hm(c.ci) + ' · ' + (c.cbn || c.bn || ''), '',
      'Ventas: ' + ventasTxt(c), 'Efectivo inicial: ' + money(c.ini || 0), 'Ventas en efectivo: ' + money(p.ef || 0)];
    if (cb.ef) l.push('Cobros de fiado en efectivo: ' + money(cb.ef));
    if (c.ing) l.push('Puse plata: ' + money(c.ing));
    if (c.ret) l.push('Saqué plata: ' + money(c.ret));
    l.push('Debería haber: ' + money(c.esp != null ? c.esp : esperado(c)), 'Contado: ' + money(c.cnt || 0), (c.dif === 0 ? 'Diferencia: justo ✓' : c.dif < 0 ? 'Faltan: ' + money(-c.dif) : 'Sobran: ' + money(c.dif)));
    ['tr', 'tj', 'qr', 'fi'].forEach((k) => { const v = (p[k] || 0) + (cb[k] || 0); if (v) l.push((k === 'fi' ? 'Quedó fiado' : PAY[k]) + ': ' + money(v)); });
    if (c.deja) l.push('Queda en caja para mañana: ' + money(c.deja));
    if (c.nota) l.push('Nota: ' + c.nota);
    return l.join('\n');
  }
  function ver(c, recien) {
    return modal('<b style="font-size:19px">' + (recien ? 'Caja cerrada ✓' : 'Cierre de caja del ' + dmy(c.d)) + '</b><div class="k" style="margin-top:4px">' + hm(c.ab) + ' a ' + (c.ci ? hm(c.ci) : '…') + ' · abrió ' + esc(c.bn || '') + (c.cbn && c.cbn !== c.bn ? ' · cerró ' + esc(c.cbn) : '') + ' · ' + ventasTxt(c) + '</div>' +
      (c.st === 'closed' ? '<div style="margin:14px 0 0;padding:14px 16px;border-radius:16px;background:var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px"><span>Contado <b>' + money(c.cnt || 0) + '</b></span><span style="font-size:20px">' + difHtml(c.dif || 0) + '</span></div>' : '') +
      (X.adm() || !recien ? filas(c) : '') + (c.deja ? '<div class="k" style="margin-top:10px">Queda en caja para mañana: <b>' + money(c.deja) + '</b></div>' : '') + (c.nota ? '<div class="k" style="margin-top:6px">Nota: ' + esc(c.nota) + '</div>' : '') +
      (c.st === 'closed' ? '<a class="go" style="display:block;text-align:center;text-decoration:none;margin-top:14px" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texto(c)) + '">Mandar el resumen por WhatsApp</a>' : '') +
      '<button class="go alt" data-close="1">Listo</button>');
  }
  // Historial del mes (Resumen del administrador)
  function card() {
    if (!enUso() || S.mes == null) return '';
    const l = S.mes;
    let h = '<div class="card"><b>Cierres de caja</b>';
    if (!l.length) return h + '<div class="k" style="margin-top:6px">Todavía no hay cierres este mes. La caja se abre y se cierra arriba de la pantalla de ' + X.donde() + '.</div></div>';
    let fal = 0, sob = 0, v = 0, ef = 0; l.forEach((c) => { v += c.v || 0; ef += (c.p || {}).ef || 0; if (c.st === 'closed') { if (c.dif < 0) fal += -c.dif; else sob += c.dif || 0; } });
    const nC = l.filter((c) => c.st === 'closed').length;
    h += '<div class="cjs"><div><small>Cajas cerradas</small><b>' + nC + '</b></div><div><small>Vendido</small><b>' + money(v) + '</b></div><div><small>Faltó</small><b style="color:' + (fal ? '#b3261e' : 'inherit') + '">' + money(fal) + '</b></div><div><small>Sobró</small><b>' + money(sob) + '</b></div></div>';
    h += l.slice(0, 40).map((c) => '<button class="pl" data-cj="ver" data-id="' + esc(c.id) + '"><span><b>' + dmy(c.d) + ' · ' + hm(c.ab) + (c.ci ? '–' + hm(c.ci) : '') + '</b><small>' + esc(c.cbn || c.bn || '') + ' · ' + ventasTxt(c) + '</small></span>' +
      (c.st === 'open' ? '<b style="color:#1a8f4c">Abierta</b>' : difHtml(c.dif || 0)) + '</button>').join('');
    return h + '</div>';
  }

  // ---------- lo que suma cada venta / cobro ----------
  // tot: total de la venta; pay: medio con que pagó lo que pagó hoy; hoy: lo que pagó hoy (por defecto tot); fi: lo que quedó fiado.
  function venta(o) {
    const c = S.caja; if (!enUso() || !c) return null;
    const tot = Math.round(o.tot || 0), hoy = Math.round(o.hoy != null ? o.hoy : tot), fi = Math.round(o.fi || 0), pay = o.pay || 'ef', s = o.sign || 1;
    const p = {}; if (hoy) p[pay] = increment(s * hoy); if (fi) p.fi = increment(s * fi);
    setDoc(ref(c.id), { n: increment(s), v: increment(s * tot), p }, { merge: true }).catch(() => {});
    return c.id;
  }
  function anular(o, cj) { if (S.caja && cj && S.caja.id === cj) venta(Object.assign({}, o, { sign: -1 })); }
  function cobro(pay, a) {
    const c = S.caja; if (!enUso() || !c || !(a > 0)) return null;
    setDoc(ref(c.id), { c: { [pay || 'ef']: increment(Math.round(a)) } }, { merge: true }).catch(() => {});
    return c.id;
  }
  function action(a, id) {
    if (a === 'open') abrir(); else if (a === 'mov') mover(); else if (a === 'close') cerrar();
    else if (a === 'ver') { const c = (S.mes || []).find((x) => x.id === id); if (c) ver(c); }
  }
  return { listen, listenMes, stop, bar, paint, action, venta, anular, cobro, card, modal, abierta: () => S.caja, enUso };
}
