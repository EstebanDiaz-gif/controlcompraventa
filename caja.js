// Cierre de caja para tiendas de productos (ropa, calzado…) y servicios.
// Mismo modelo de datos que la caja del almacén: stores/{sid}/cajas/{id}
// { id, d, m, ab, by, bn, ini, st: 'open'|'closed', n, v, p: {ef, tr, tj, qr, fi}, c: {ef, tr, ...} (cobros de fiado),
//   ing, ret, mv: {id: {t, a, r, h, bn}}, ci, cb, cbn, cnt, esp, dif, deja, nota }
// Las ventas y cobros suman con increment en una escritura aparte, así una caja cerrada en otro celular nunca frena una venta.
import { doc, setDoc, getDocs, onSnapshot, increment, query, where, collection } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
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
  // ¿El empleado ve cuánto debería haber? (Equipo > Cierre de caja). El dueño siempre lo ve.
  const veEsp = () => X.adm() || !(X.cs() && X.cs().cjv === false);
  // Último cierre (este mes o el anterior): cuánto quedó en la caja para el turno siguiente.
  function ultimoCierre() {
    const m = X.today().slice(0, 7), d = new Date(+m.slice(0, 4), +m.slice(5) - 2, 1), m0 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const q = (mm) => getDocs(query(col('cajas'), where('m', '==', mm))).then((sn) => { let u = null; sn.forEach((x) => { const c = x.data(); if (c.st === 'closed' && (!u || (c.ci || 0) > (u.ci || 0))) u = c; }); return u; });
    return q(m).then((u) => u || q(m0)).catch(() => null);
  }
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
      (veEsp() ? '<span style="text-align:right"><small>Efectivo en caja</small><b style="font-size:20px">' + money(esperado(c)) + '</b></span>' : '<span style="text-align:right"><small>' + (X.palabra(2).charAt(0).toUpperCase() + X.palabra(2).slice(1)) + '</small><b>' + (c.n || 0) + '</b></span>') + '</div>' +
      '<div class="cjg"><button class="go alt" data-cj="mov">Sacar / poner</button><button class="go" data-cj="close">Cerrar caja</button></div></div>';
  }
  function paint() { document.querySelectorAll('.cjbar').forEach((e) => { e.innerHTML = barInner(); }); }

  function abrir() {
    if (!X.canWrite()) { alert('El acceso de la tienda venció.'); return; }
    if (S.caja) { paint(); return; }
    const A0 = X.adm(), last = A0 ? (lsGet('pk_deja_' + X.sid()) || '') : '';
    let prev = null, prevBn = '';
    const o = modal('<b style="font-size:19px">Abrir caja</b><div class="k" style="margin-top:4px">Contá el efectivo con el que arrancás (el cambio que quedó en la caja).</div>' +
      '<div id="cjprev" class="k" style="margin-top:8px"></div>' +
      '<label>Efectivo inicial</label><input id="cji" type="number" inputmode="decimal" min="0" placeholder="0" value="' + esc(last) + '"><div id="cjpd" style="margin-top:6px;font-size:14px"></div>' +
      '<button class="go" id="cjok">Abrir caja</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const i = o.querySelector('#cji');
    const pd = () => { const e = o.querySelector('#cjpd'); if (!e) return; if (prev == null || i.value === '') { e.innerHTML = ''; return; } const df = Math.round(+i.value || 0) - prev; e.innerHTML = df === 0 ? '<b style="color:#1a8f4c">Coincide con lo que quedó ✓</b>' : df < 0 ? '<b style="color:#b3261e">Faltan ' + money(-df) + ' respecto de lo que quedó</b>' : '<b style="color:var(--sell)">Hay ' + money(df) + ' más de lo que quedó</b>'; };
    i.oninput = pd;
    ultimoCierre().then((u) => { if (!u || !o.isConnected) return; prev = Math.round(u.deja != null ? u.deja : (u.cnt || 0)); prevBn = u.cbn || u.bn || '';
      if (!A0) { o.querySelector('#cjprev').innerHTML = 'Contá la plata de la caja y escribí el total. La app lo compara sola con lo que dejó el turno anterior.'; return; }
      o.querySelector('#cjprev').innerHTML = 'En el último cierre (' + dmy(u.d) + ', ' + esc(u.cbn || u.bn || '') + ') quedaron <b>' + money(prev) + '</b> en la caja.';
      if (!last) i.value = prev; pd(); });
    const ok = () => {
      const ini = Math.round(+i.value || 0);
      if (ini < 0) { alert('El monto no puede ser negativo.'); return; }
      const id = uid(), u = X.user(), d = X.today(), o0 = { id, d, m: d.slice(0, 7), ab: Date.now(), by: u.uid, bn: X.nm(), ini, st: 'open', n: 0, v: 0, p: {}, c: {}, ing: 0, ret: 0 };
      if (prev != null) { o0.prev = prev; o0.prevBn = prevBn; }
      setDoc(ref(id), o0).catch(failW);
      if (!A0 && prev != null && ini !== prev) setTimeout(() => alert('Lo que contaste no coincide con lo que dejó el turno anterior' + (prevBn ? ' (' + prevBn + ')' : '') + '. Quedó registrado y el dueño lo va a ver. Si querés, avisale ahora al encargado.'), 100);
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
    let h = '<div class="rows" style="margin:10px 0 0">' + (c.prev != null && c.prev !== c.ini ? r((c.prevBn ? esc(c.prevBn) + ' dejó' : 'Quedó en el cierre anterior') + '<small style="color:#b3261e">' + esc(c.bn || '') + ' contó ' + money(c.ini || 0) + ' al abrir: ' + (c.ini < c.prev ? 'faltan ' + money(c.prev - c.ini) : 'sobran ' + money(c.ini - c.prev)) + ' entre turnos</small>', money(c.prev)) : '') + r('Efectivo inicial' + (c.prev != null && c.prev !== c.ini ? '<small style="color:' + (c.ini < c.prev ? '#b3261e' : 'var(--sell)') + '">' + (c.ini < c.prev ? 'abrió con ' + money(c.prev - c.ini) + ' menos' : 'abrió con ' + money(c.ini - c.prev) + ' más') + '</small>' : ''), money(c.ini || 0)) + r('Ventas en efectivo', '+ ' + money(p.ef || 0)) +
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
    const A = veEsp(), esp = esperado(c);
    const o = modal('<b style="font-size:19px">Cerrar caja</b><div class="k" style="margin-top:4px">Abierta a las ' + hm(c.ab) + (c.d !== X.today() ? ' del ' + dmy(c.d) : '') + ' por ' + esc(c.bn || '') + ' · ' + ventasTxt(c) + '</div>' +
      (A ? filas(c) : '<div class="k" style="margin-top:10px">Contá todo el efectivo de la caja (billetes y monedas) y escribí el total.</div>') +
      '<label>¿Cuánto efectivo contaste?</label><input id="ccn" type="number" inputmode="decimal" min="0" placeholder="0"><div id="ccd" style="margin-top:8px;font-size:18px"></div>' +
      '<div class="k" style="margin-top:6px">Lo que contás es lo que queda en la caja y lo recibe el próximo turno. Si el dueño se lleva la recaudación, anotala antes con “Sacar / poner”.</div>' +
      '<label>Nota (opcional)</label><input id="ccx" maxlength="120" autocomplete="off" placeholder="Ej: di mal un vuelto">' +
      '<button class="go" id="ccok">Cerrar caja</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const cn = o.querySelector('#ccn');
    if (A) cn.oninput = () => { o.querySelector('#ccd').innerHTML = cn.value === '' ? '' : difHtml(Math.round(+cn.value) - esp); };
    o.querySelector('#ccok').onclick = () => {
      if (cn.value === '') { alert('Escribí cuánto efectivo contaste (si no hay nada, poné 0).'); cn.focus(); return; }
      const cnt = Math.round(+cn.value || 0), deja = cnt, nota = o.querySelector('#ccx').value.trim().slice(0, 120), u = X.user();
      if (cnt < 0) { alert('El monto no puede ser negativo.'); return; }
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
    if (c.cnt != null) l.push('Queda en la caja para el próximo turno: ' + money(c.deja != null ? c.deja : c.cnt));
    if (c.nota) l.push('Nota: ' + c.nota);
    return l.join('\n');
  }
  function ver(c, recien) {
    return modal('<b style="font-size:19px">' + (recien ? 'Caja cerrada ✓' : 'Cierre de caja del ' + dmy(c.d)) + '</b><div class="k" style="margin-top:4px">' + hm(c.ab) + ' a ' + (c.ci ? hm(c.ci) : '…') + ' · abrió ' + esc(c.bn || '') + (c.cbn && c.cbn !== c.bn ? ' · cerró ' + esc(c.cbn) : '') + ' · ' + ventasTxt(c) + '</div>' +
      (c.st === 'closed' ? '<div style="margin:14px 0 0;padding:14px 16px;border-radius:16px;background:var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px"><span>Contado <b>' + money(c.cnt || 0) + '</b></span><span style="font-size:20px">' + difHtml(c.dif || 0) + '</span></div>' : '') +
      (c.corr ? '<div class="k" style="margin-top:8px">Corregido por ' + esc(c.corr.bn || '') + ' el ' + dmy(new Date(c.corr.at).toISOString().slice(0, 10)) + ' (antes: contado ' + money(c.corr.cnt0 || 0) + ')</div>' : '') +
      (veEsp() ? filas(c) : '') + (c.st === 'closed' && c.deja != null && c.deja !== c.cnt ? '<div class="k" style="margin-top:10px">Quedó en la caja para el próximo turno: <b>' + money(c.deja) + '</b></div>' : '') + (c.nota ? '<div class="k" style="margin-top:6px">Nota: ' + esc(c.nota) + '</div>' : '') +
      (c.st === 'closed' ? '<a class="go" style="display:block;text-align:center;text-decoration:none;margin-top:14px" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texto(c)) + '">Mandar el resumen por WhatsApp</a>' : '') +
      (X.adm() && c.st === 'closed' ? '<button class="go alt" data-cjfix="' + esc(c.id) + '">Corregir este cierre</button>' : '') +
      '<button class="go alt" data-close="1">Listo</button>');
  }
  // Solo el dueño corrige un cierre ya hecho (el empleado no puede: lo frenan las reglas). Queda registrado.
  function corregir(c) {
    const o = modal('<b style="font-size:19px">Corregir cierre del ' + dmy(c.d) + '</b><div class="k" style="margin-top:4px">Debería haber ' + money(c.esp || 0) + '. Se contaron ' + money(c.cnt || 0) + '. Queda registrado que lo corregiste.</div>' +
      '<label>Efectivo contado</label><input id="cfc" type="number" inputmode="decimal" min="0" value="' + (c.cnt || 0) + '">' +
      '<label>Nota</label><input id="cfn" maxlength="120" autocomplete="off" value="' + esc(c.nota || '') + '" placeholder="Ej: apareció la plata del flete">' +
      '<button class="go" id="cfok">Guardar corrección</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelector('#cfok').onclick = () => {
      const cnt = Math.round(+o.querySelector('#cfc').value || 0), nota = o.querySelector('#cfn').value.trim().slice(0, 120);
      if (cnt < 0) { alert('El monto no puede ser negativo.'); return; }
      setDoc(ref(c.id), { cnt, deja: cnt, dif: cnt - (c.esp || 0), nota, corr: { at: Date.now(), bn: X.nm(), cnt0: c.cnt || 0 } }, { merge: true }).catch(failW);
      o.remove();
    };
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
    h += l.slice(0, 40).map((c) => '<button class="pl" data-cj="ver" data-id="' + esc(c.id) + '"><span><b>' + dmy(c.d) + ' · ' + hm(c.ab) + (c.ci ? '–' + hm(c.ci) : '') + '</b><small>' + esc(c.cbn || c.bn || '') + ' · ' + ventasTxt(c) + (c.prev != null && c.prev !== c.ini ? '<span style="display:block;color:#b3261e">⚠️ Al abrir ' + (c.ini < c.prev ? 'faltaban ' : 'sobraban ') + money(Math.abs(c.ini - c.prev)) + ' de lo que dejó ' + esc(c.prevBn || 'el turno anterior') + '</span>' : '') + '</small></span>' +
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
    else if (a === 'fix') { const c = (S.mes || []).find((x) => x.id === id); if (c) { document.querySelectorAll('.cjdlg').forEach((e) => e.remove()); corregir(c); } }
  }
  // Pestaña Caja (ropa, servicios): barra para abrir/cerrar, detalle de la caja abierta e historial del mes (admin).
  // det = true: solo el detalle (debajo del formulario de venta en ropa/productos), sin la barra.
  function vista(det) {
    if (!enUso()) return det ? '' : '<div class="card"><div class="empty">El cierre de caja está desactivado. Se activa en Equipo.</div></div>';
    const c = S.caja, A = X.adm();
    let h = det ? '' : bar();
    if (c) {
      const mv = Object.keys(c.mv || {}).map((k) => c.mv[k]).sort((a, b) => String(b.h).localeCompare(String(a.h)));
      h += '<div class="card"><b>Caja de hoy</b><div class="k" style="margin-top:4px">Abierta a las ' + hm(c.ab) + (c.d !== X.today() ? ' del ' + dmy(c.d) : '') + ' por ' + esc(c.bn || '') + ' · ' + ventasTxt(c) + '</div>' +
        (veEsp() ? filas(c) : (mv.length ? '<div class="k" style="margin-top:12px"><b>Plata que se sacó o se puso</b></div>' + mv.map((m) => '<div class="it"><div><b>' + (m.t === 'r' ? 'Sacó' : 'Puso') + ' ' + money(m.a) + '</b><small>' + esc(m.h || '') + ' · ' + esc(m.r || '') + (m.bn ? ' · ' + esc(m.bn) : '') + '</small></div></div>').join('') : '<div class="k" style="margin-top:10px">Todavía no se sacó ni se puso plata. Si sacás para pagar algo, anotalo con "Sacar / poner" así el cierre da justo.</div>')) +
        '</div>';
    } else if (!S.err) {
      h += '<div class="card"><b>¿Cómo funciona?</b><div class="k" style="margin-top:6px;line-height:1.5">1. Al empezar el día abrís la caja con el efectivo que hay (el cambio).<br>2. Cada ' + X.palabra(1) + ' suma sola según cómo pagó.<br>3. Si sacás o ponés plata (un flete, cambio), lo anotás con el motivo.<br>4. Al terminar, contás el efectivo y cerrás: ' + (A ? 'te dice si falta o sobra.' : 'el dueño ve si falta o sobra.') + '</div></div>';
    }
    if (A) h += card();
    return h;
  }
  return { listen, listenMes, stop, bar, paint, action, venta, anular, cobro, card, vista, modal, abierta: () => S.caja, enUso };
}
