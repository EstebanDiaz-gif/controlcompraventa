// Rubro ALMACÉN: caja rápida (por unidad y por peso), fiado / libreta de clientes,
// stock con costo promedio, reposición, aumento de precios y resumen por mes.
//
// Pensado para mucho volumen (cientos de ventas por día, miles de productos):
// - Las ventas NO se descargan todas: se leen por día (consulta d == fecha).
// - Los totales del mes se guardan ya sumados en stores/{sid}/totales/{AAAA-MM}
//   (se actualizan con increment en cada venta, así el resumen es UNA lectura).
// - El costo de cada venta se guarda al momento de vender (costo promedio del producto),
//   así no hace falta recorrer el historial de compras para calcular la ganancia.
// - Cada cliente del fiado tiene su saldo ya calculado (campo s).
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, onSnapshot, writeBatch, increment, query, where, deleteField } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { fotoId, makePhotos } from './fotos.js';
import { abrirInsta } from './insta.js';
import { tkConfig, imprimirTicket, abrirTiketera } from './ticket.js';
import { calcular as sanCalc, limpiarCfg as sanCfg, activo as sanActivo } from './sanguche.js';
import { abrirSueltos } from './sueltos.js';
import { limpiarOps, calcOps, tocarOps, selInicial, reglaOps, MODELOS_OPS, MAX_GRUPOS, MAX_OPCIONES, selDe } from './opciones.js';
import { PAGOS_URL } from './pagos-config.js';
import { combos, descuento, tituloCant, repartir } from './promos.js';
import { CATS, catsFor, PAY, OTROS, r2, r3, pnum, n3, fq, lineTotal, cartTotals, newAvgCost, roundPrice, match, lastMonths, buildLista, billetes, partes, payLabel, esperado, balanza, porPlu, ranking, sinVentas, csv, limpiarApps, lunes, semanasApp, semanaTxt, apTotal, apNeto, APPS_SUG, appId } from './almacen-calc.js';
import { openScanner, scanButton, findByCode, beep, canScan } from './scanner.js';
// Computadora (mouse, sin pantalla táctil): ahí se usa la pistola lectora en vez de la cámara.
const PC = (() => { try { return matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(any-pointer: coarse)').matches; } catch (e) { return false; } })();
import { CAMPOS, CAMPOS_FIADO, filas, leerArchivo, detectar, armar, plan, ejemploCsv } from './planilla.js';
import { cargarDemo, borrarDemo, DEMO_TIPOS } from './demo.js';
export { CATS, PAY };

// ---------- módulo de pantalla ----------
// X = contexto que pasa app.html: db, $, esc, money, today, fail, canWrite, blockedCard, nm, rnd, readPhoto,
// mlabel, gTotal(mes), y getters de estado: sid(), role(), user(), st(), sname(), isAlm().
export function createAlmacen(X) {
  const { db, $, esc, money } = X;
  const S = {
    cart: [], q: '', cat: '', pay: 'ef', apSel: '', apTot: '', aps: null, cli: '', cliQ: '', paga: '', last: '', mixEf: '', mixO: 'tr', caja: null, cajaErr: false, cajasM: null, prBy: 'v',
    cl: [], clErr: false, fq: '', sel: null, fmov: null,
    stQ: '', stCat: '', stLow: false, stNoCod: false, edit: null, repo: null, rq: '', rcomp: null, imp: null, qk: null,
    month: X.today().slice(0, 7), tot: null, totM: null, hoy: [], hoyDay: '', day: X.today(), dayV: null
  };
  const un = {};
  const off = (k) => { if (un[k]) { un[k](); delete un[k]; } };
  const adm = () => X.role() === 'admin';
  // Puede cargar productos: administrador o empleado con el permiso "cp" (lo activa el dueño en Equipo).
  const load = () => adm() || !!(X.canLoad && X.canLoad());
  const P = () => X.st();
  const prod = (id) => P().find((p) => p.id === id) || null;
  const cli = (id) => S.cl.find((c) => c.id === id) || null;
  const ref = (...p) => doc(db, 'stores', X.sid(), ...p);
  const col = (n) => collection(db, 'stores', X.sid(), n);
  const now = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const dmy = (d) => String(d || '').split('-').reverse().join('/');
  const uid = () => Date.now() + '-' + X.rnd(4);
  const CATL = () => catsFor(X.cs && X.cs() && X.cs().tipo);
  const cats = () => { const o = {}; CATL().forEach((c) => { o[c] = 0; }); P().forEach((p) => { if (p.cat) o[p.cat] = (o[p.cat] || 0) + 1; }); return o; };
  // Opciones de categoría: las sugeridas + las que ya usa el negocio + "Nueva categoría…" (la crea el usuario).
  const catOptions = (sel) => Array.from(new Set(CATL().concat(usedCats()).concat(sel && sel !== '__new' ? [sel] : []))).map((x) => '<option value="' + esc(x) + '"' + (sel === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') +
    '<option value="__new">➕ Nueva categoría…</option>';
  document.addEventListener('change', (e) => {
    const s = e.target; if (!s || (s.id !== 'fc' && s.id !== 'qk_c') || s.value !== '__new') return;
    let n = (prompt('Nombre de la nueva categoría (ej: Desayuno y merienda, Mascotas, Bazar):') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!n) { s.value = s.dataset.prev || ''; return; }
    n = n.charAt(0).toUpperCase() + n.slice(1);
    const ya = Array.from(s.options).find((o) => o.value.toLowerCase() === n.toLowerCase() && o.value !== '__new');
    if (ya) { s.value = ya.value; s.dataset.prev = ya.value; return; }
    const o = document.createElement('option'); o.value = n; o.textContent = n; s.insertBefore(o, s.querySelector('option[value="__new"]')); s.value = n; s.dataset.prev = n;
  });
  document.addEventListener('focusin', (e) => { const s = e.target; if (s && (s.id === 'fc' || s.id === 'qk_c') && s.value !== '__new') s.dataset.prev = s.value; });
  const sinAc = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const ATAJOS = { 'Desayuno y merienda': 'yerba, mate, café, té, cacao, chocolatada, dulce de leche, mermelada, edulcorante' };
  // Productos cuyo nombre tiene alguna de las palabras (separadas por coma) y que no están ya en la categoría dst.
  // Palabras cortas van enteras: "mate" no agarra "tomate", "té" no agarra "aceite".
  function porPalabras(texto, dst) {
    const ts = sinAc(texto).split(',').map((t) => t.trim()).filter(Boolean); if (!ts.length || !dst || dst === '__new') return [];
    const re = ts.map((t) => new RegExp('(^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (t.length <= 4 ? '(?![a-z0-9])' : '')));
    return P().filter((p) => p.cat !== dst && re.some((r) => r.test(sinAc(p.n)))).sort((a, b) => a.n.localeCompare(b.n));
  }
  const usedCats = () => { const o = cats(); return Object.keys(o).filter((c) => o[c] > 0).sort((a, b) => { const L = CATL(), i = (x) => { const k = L.indexOf(x); return k < 0 ? 999 : k; }; return i(a) - i(b) || a.localeCompare(b); }); };
  const priceTxt = (p) => (p.pn ? money(p.pn) + (p.w ? ' / kg' : '') : 'sin precio');
  const deny = (e) => e && /permission/.test(String(e.code || e.message));
  // ---------- Apps de delivery: la venta va al stock y a los totales, pero no a la caja; queda a cobrar en la cuenta de la app ----------
  const apps = () => limpiarApps(((X.cs && X.cs()) || {}).apps);
  const appDe = (id) => apps().find((a) => a.id === id) || null;
  let apAvisado = false;
  function apSumar(id, n, d, a) {
    if (!id || !a) return;
    setDoc(doc(db, 'stores', X.sid(), 'apsal', id), { n: n || id, s: increment(a), w: { [lunes(d)]: increment(a) }, u: Date.now() }, { merge: true }).catch((e) => {
      console.warn('apps', e && e.code);
      if (deny(e) && !apAvisado) { apAvisado = true; alert('La venta se guardó ✓, pero Firebase no dejó anotarla en la cuenta de ' + (n || 'la app') + '. Falta publicar las reglas nuevas de Firebase: avisale a Pekeron App.'); }
    });
  }
  const rulesCard = () => '<div class="card"><b>Falta un paso</b><div class="k" style="margin-top:6px">Para usar el almacén hay que agregar las reglas nuevas en Firebase (archivo <b>ALMACEN-LEEME.md</b>, paso 2). Tus datos están a salvo.</div></div>';
  function failW(e) { if (deny(e)) alert('Firebase no dejó guardar: faltan las reglas del almacén (ALMACEN-LEEME.md, paso 2), o tu usuario no tiene permiso.'); else X.fail(e); }
  function modal(html) {
    const o = document.createElement('div'); o.className = 'almdlg';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto';
    o.innerHTML = '<div style="background:var(--card);color:var(--ink);border-radius:22px;padding:20px;max-width:440px;width:100%;margin:auto">' + html + '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o || (e.target.dataset && e.target.dataset.close)) o.remove(); });
    return o;
  }

  // ---------- escuchas de Firestore (solo lo necesario) ----------
  function start() {
    if (un.cli) return;
    un.cli = onSnapshot(col('clientes'), (sn) => {
      S.cl = []; S.clErr = false;
      sn.forEach((d) => { const x = d.data(); S.cl.push({ id: d.id, n: x.n || '', tel: x.tel || '', s: r2(x.s || 0), u: x.u || 0, up: x.up || '', fd: x.fd || '' }); });
      redraw();
    }, () => { S.clErr = true; redraw(); });
    listenHoy(); listenCaja(); syncPuesto();
    if (adm()) un.lista = onSnapshot(ref('public', 'lista'), (sn) => { S.lista = sn.exists() ? sn.data() : {}; publishSoon(); }, () => { S.lista = null; });
  }
  // ---------- lista de precios del catálogo web ----------
  // La publica el administrador (con la app abierta) cuando cambia algo que ve el cliente:
  // nombre, precio, categoría, foto, o el stock baja de 10 unidades / 5 kg. Espera unos segundos
  // para juntar varios cambios en una sola publicación.
  let pubT = null, pubBusy = false;
  function publishSoon() { if (!adm() || !S.lista) return; clearTimeout(pubT); pubT = setTimeout(publish, 8000); }
  function publish() {
    const info = X.pub(), L0 = S.lista;
    if (!X.isAlm() || !adm() || !L0 || !info || !info.enabled || pubBusy) return;
    if (!navigator.onLine) return;
    const L = buildLista(P());
    const dataChanged = L.h !== L0.h, imgChanged = L.hi !== L0.hi;
    if (!dataChanged && !imgChanged) return;
    const sid = X.sid(), b = writeBatch(db);
    if (dataChanged) { L.data.forEach((c, k) => b.set(doc(db, 'stores', sid, 'public', 'lista_d' + k), { p: c })); for (let k = L.data.length; k < (L0.n || 0); k++) b.delete(doc(db, 'stores', sid, 'public', 'lista_d' + k)); }
    if (imgChanged) { L.imgs.forEach((c, k) => b.set(doc(db, 'stores', sid, 'public', 'lista_i' + k), { f: c })); for (let k = L.imgs.length; k < (L0.ni || 0); k++) b.delete(doc(db, 'stores', sid, 'public', 'lista_i' + k)); }
    b.set(doc(db, 'stores', sid, 'public', 'lista'), { h: L.h, hi: L.hi, n: L.data.length, ni: L.imgs.length, count: L.count, at: Date.now() });
    pubBusy = true;
    b.commit().catch((e) => { if (deny(e)) console.warn('Catálogo: faltan las reglas de public/lista'); }).finally(() => { pubBusy = false; });
  }
  function listenHoy() {
    const d = X.today(); if (un.hoy && S.hoyDay === d) return;
    off('hoy'); S.hoyDay = d; S.hoy = [];
    const qy = adm() ? query(col('ventas'), where('d', '==', d)) : query(col('ventas'), where('by', '==', X.user().uid), where('d', '==', d));
    un.hoy = onSnapshot(qy, (sn) => { S.hoy = []; sn.forEach((x) => S.hoy.push(x.data())); S.hoy.sort((a, b) => String(b.id).localeCompare(String(a.id))); redraw(); }, () => {});
  }
  function listenTot() {
    if (!adm() || (un.tot && S.totM === S.month)) return;
    off('tot'); S.totM = S.month; S.tot = null;
    un.tot = onSnapshot(ref('totales', S.month), (sn) => { S.tot = sn.exists() ? sn.data() : {}; if (X.tab() === 'res') drawRes(); }, () => { S.tot = {}; });
  }
  // ---------- Cierre de caja ----------
  // Una caja abierta por tienda (el cajón de la plata). stores/{sid}/cajas/{id}:
  // { id, d, m, ab (apertura, ms), by, bn, ini, st: 'open'|'closed', n, v, p: {ef, tr, tj, qr, fi} (ventas por medio),
  //   c: {ef, tr, ...} (cobros de fiado), ing, ret, mv: {id: {t, a, r, h, bn}}, ci, cb, cbn, cnt, esp, dif, deja, nota }
  // Las ventas suman en la caja abierta con increment, en la misma escritura de la venta.
  const hm = (ms) => { const d = new Date(ms || 0); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } };
  // ¿El empleado ve cuánto debería haber? (Equipo > Cierre de caja). El dueño siempre lo ve.
  const veEsp = () => adm() || !(X.cs && X.cs() && X.cs().cjv === false);
  function ultimoCierre() {
    const m = X.today().slice(0, 7), d = new Date(+m.slice(0, 4), +m.slice(5) - 2, 1), m0 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const q = (mm) => getDocs(query(col('cajas'), where('m', '==', mm))).then((sn) => { let u = null; sn.forEach((x) => { const c = x.data(); if (c.st === 'closed' && (!u || (c.ci || 0) > (u.ci || 0))) u = c; }); return u; });
    return q(m).then((u) => u || q(m0)).catch(() => null);
  }
  function listenCaja() {
    if (un.caja) return;
    un.caja = onSnapshot(query(col('cajas'), where('st', '==', 'open')), (sn) => {
      const l = []; sn.forEach((x) => l.push(x.data())); l.sort((a, b) => (a.ab || 0) - (b.ab || 0));
      S.caja = l[0] || null; S.cajaErr = false; renderCajaBar(); if (X.tab() === 'res') drawRes();
    }, (e) => { S.caja = null; S.cajaErr = deny(e); renderCajaBar(); });
  }
  function listenCajasMes() {
    if (!adm() || (un.cjm && S.cjmM === S.month)) return;
    off('cjm'); S.cjmM = S.month; S.cajasM = null;
    un.cjm = onSnapshot(query(col('cajas'), where('m', '==', S.month)), (sn) => {
      S.cajasM = []; sn.forEach((x) => S.cajasM.push(x.data())); S.cajasM.sort((a, b) => (b.ab || 0) - (a.ab || 0)); if (X.tab() === 'res') drawRes();
    }, () => { S.cajasM = []; });
  }
  function renderCajaBar() {
    const e = $('cjbar'); if (!e) return;
    if (S.cajaErr) { e.innerHTML = adm() ? '<div class="bn warn" style="margin:0 0 12px">Para usar el cierre de caja, publicá las reglas nuevas de Firebase.</div>' : ''; return; }
    const c = S.caja;
    if (!c) {
      e.innerHTML = '<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px"><span><b>Caja cerrada</b><small style="display:block;color:var(--mut)">Abrila para controlar el efectivo del turno</small></span><button class="go" data-al="cjopen" style="width:auto;margin:0;padding:10px 16px;flex:none">Abrir caja</button></div>';
      return;
    }
    e.innerHTML = '<div class="card" style="padding:12px 16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span><b>🟢 Caja abierta</b><small style="display:block;color:var(--mut)">desde las ' + hm(c.ab) + (c.d !== X.today() ? ' del ' + dmy(c.d) : '') + ' · ' + esc(c.bn || '') + '</small></span>' +
      (veEsp() ? '<span style="text-align:right"><small style="display:block;color:var(--mut)">Efectivo en caja</small><b style="font-size:20px' + (esperado(c) < 0 ? ';color:#b3261e' : '') + '">' + money(esperado(c)) + '</b>' + (esperado(c) < 0 ? '<small style="display:block;color:#b3261e;font-weight:700">Salió más de lo que entró</small>' : '') + '<button class="x" data-al="cjdet" style="display:block;margin-left:auto;font-size:13px;font-weight:700;text-decoration:underline;color:var(--ink)">Ver detalle</button></span>' : '<span style="text-align:right"><small style="display:block;color:var(--mut)">Ventas</small><b>' + (c.n || 0) + '</b></span>') + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><button class="go alt" data-al="cjmov" style="margin:0">Sacar / poner</button><button class="go" data-al="cjclose" style="margin:0">Cerrar caja</button></div></div>';
  }
  function cajaOpen() {
    if (!X.canWrite()) { alert('El acceso de la tienda venció.'); return; }
    if (S.caja) { renderCajaBar(); return; }
    const A0 = adm(), last = A0 ? (lsGet('pk_deja_' + X.sid()) || '') : '';
    const o = modal('<b style="font-size:19px">Abrir caja</b><div class="k" style="margin-top:4px">Contá el efectivo con el que arrancás (el cambio que quedó en el cajón).</div>' +
      '<div id="cjprev" class="k" style="margin-top:8px"></div>' +
      '<label>Efectivo inicial</label><input id="cji" type="number" inputmode="decimal" min="0" placeholder="0" value="' + esc(last) + '"><div id="cjpd" style="margin-top:6px;font-size:14px"></div>' +
      '<button class="go" id="cjok">Abrir caja</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const i = o.querySelector('#cji');
    let prev = null, prevBn = '';
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
      setDoc(ref('cajas', id), o0).catch(failW);
      if (!A0 && prev != null && ini !== prev) setTimeout(() => alert('Lo que contaste no coincide con lo que dejó el turno anterior' + (prevBn ? ' (' + prevBn + ')' : '') + '. Quedó registrado y el dueño lo va a ver. Si querés, avisale ahora al encargado.'), 100);
      o.remove();
    };
    o.querySelector('#cjok').onclick = ok; i.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    setTimeout(() => { i.focus(); i.select(); }, 50);
  }
  function cajaMov() {
    const c = S.caja; if (!c) return;
    let t = 'r';
    const o = modal('<b style="font-size:19px">Sacar o poner plata</b><div class="k" style="margin-top:4px">Para cuando pagás algo con la plata de la caja o agregás cambio. Así el cierre da bien.</div>' +
      '<div class="seg" style="margin-top:12px"><button class="pay on" data-t="r">Saco plata</button><button class="pay" data-t="i">Pongo plata</button></div>' +
      '<label>Monto</label><input id="cma" type="number" inputmode="decimal" min="0" placeholder="0">' +
      '<label>Motivo</label><input id="cmr" maxlength="60" autocomplete="off" placeholder="Ej: Pago al proveedor de bebidas">' +
      '<button class="go" id="cmok">Guardar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { t = b.dataset.t; o.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); o.querySelector('#cmr').placeholder = t === 'r' ? 'Ej: Pago al proveedor de bebidas' : 'Ej: Cambio que traje'; }; });
    o.querySelector('#cmok').onclick = () => {
      const a = Math.round(+o.querySelector('#cma').value || 0), r = o.querySelector('#cmr').value.trim().slice(0, 60);
      if (!(a > 0)) { alert('Escribí el monto.'); return; }
      if (!r) { alert('Escribí el motivo (así el dueño sabe para qué fue).'); return; }
      const id = uid();
      setDoc(ref('cajas', c.id), { [t === 'r' ? 'ret' : 'ing']: increment(a), mv: { [id]: { t, a, r, h: now(), bn: X.nm() } } }, { merge: true }).catch(failW);
      o.remove();
    };
    setTimeout(() => o.querySelector('#cma').focus(), 50);
  }
  // Un renglón de los movimientos de la caja. t: r = sacó, i = puso, b = borró una venta, bc = borró un cobro de fiado.
  function mvHtml(m) {
    const bor = m.t === 'b' || m.t === 'bc', t = m.t === 'r' ? 'Sacó ' + money(m.a) : m.t === 'b' ? '🗑️ Borró una venta de ' + money(m.a) : m.t === 'bc' ? '🗑️ Borró un cobro de ' + money(m.a) : 'Puso ' + money(m.a);
    return '<div class="it"><div><b' + (bor ? ' style="color:#b3261e"' : '') + '>' + t + '</b><small>' + esc(m.h || '') + (bor && m.pay ? ' · ' + (PAY[m.pay] || m.pay) : '') + (m.r ? ' · ' + esc(m.r) : '') + (m.bn ? ' · ' + esc(m.bn) : '') + '</small></div></div>';
  }
  function cajaDet() { const c = S.caja; if (!c) return; modal('<b style="font-size:19px">Detalle de la caja</b><div class="k" style="margin-top:4px">Abierta a las ' + hm(c.ab) + ' por ' + esc(c.bn || '') + '</div>' + cajaRows(c) + '<button class="go" data-close="1" style="margin-top:16px">Listo</button>'); }
  // Productos que más suman a la mercadería en stock: sirve para encontrar uno cargado mal (stock o costo de más).
  function stockValDlg() {
    const all = P().filter((p) => !p.ns && p.q > 0 && p.c > 0), tot = all.reduce((a, p) => a + p.q * p.c, 0) || 1;
    const raro = (p) => {
      const r = [];
      if (/^\d{8,14}$/.test(String(p.n || '').trim())) r.push('el nombre es un código');
      if (!p.w && p.q >= 1000) r.push('stock muy alto');
      if (p.w && p.q >= 200) r.push('muchos kilos');
      if (p.c >= 200000) r.push('costo muy alto');
      if (p.pn > 0 && p.c > p.pn * 3) r.push('cuesta más que el precio');
      return r;
    };
    const l = all.map((p) => ({ p, v: p.q * p.c, r: raro(p) })).sort((a, b) => b.v - a.v).slice(0, 20);
    const o = modal('<b style="font-size:19px">¿Qué suma más?</b><div class="k" style="margin:4px 0 10px">Los 20 productos que más pesan en la mercadería en stock (' + money(tot) + '). Si uno solo se lleva casi todo, seguro tiene el stock o el costo mal cargado.</div>' +
      l.map((x) => { const pc = Math.round(x.v / tot * 100); return '<div class="it" style="align-items:center"><div style="flex:1;min-width:0"><b' + (x.r.length ? ' style="color:#b3261e"' : '') + '>' + esc(x.p.n) + '</b>' +
        '<small>' + fq(x.p.q, x.p.w) + ' × ' + money(x.p.c) + ' = <b>' + money(x.v) + '</b> (' + pc + '%)' + (x.r.length ? ' · ⚠️ ' + esc(x.r.join(', ')) : '') + '</small></div>' +
        '<button class="x" data-ed="' + esc(x.p.id) + '" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin-left:10px">Editar</button></div>'; }).join('') +
      '<button class="go" data-close="1" style="margin-top:14px">Listo</button>');
    o.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { o.remove(); prodForm(b.dataset.ed); window.scrollTo(0, 0); }; });
  }
  function cajaRows(c) {
    const p = c.p || {}, cb = c.c || {}, r = (t, v, cls) => '<div class="r2"><span>' + t + '</span><b class="' + (cls || '') + '" style="font-size:16px">' + v + '</b></div>';
    let h = '<div class="rows" style="margin:10px 0 0">' + (c.prev != null && c.prev !== c.ini ? r((c.prevBn ? esc(c.prevBn) + ' dejó' : 'Quedó en el cierre anterior') + '<small style="color:#b3261e">' + esc(c.bn || '') + ' contó ' + money(c.ini || 0) + ' al abrir: ' + (c.ini < c.prev ? 'faltan ' + money(c.prev - c.ini) : 'sobran ' + money(c.ini - c.prev)) + ' entre turnos</small>', money(c.prev)) : '') + r('Efectivo inicial' + (c.prev != null && c.prev !== c.ini ? '<small style="color:' + (c.ini < c.prev ? '#b3261e' : 'var(--sell)') + '">' + (c.ini < c.prev ? 'abrió con ' + money(c.prev - c.ini) + ' menos' : 'abrió con ' + money(c.ini - c.prev) + ' más') + '</small>' : ''), money(c.ini || 0)) + r('Ventas en efectivo', '+ ' + money(p.ef || 0)) +
      (cb.ef ? r('Cobros de fiado en efectivo', '+ ' + money(cb.ef)) : '') + (c.ing ? r('Puse plata', '+ ' + money(c.ing)) : '') + (c.ret ? r('Saqué plata', '<span style="color:#b3261e">− ' + money(c.ret) + '</span>') : '') +
      '<div class="r2" style="border-top:2px solid var(--line);padding-top:8px"><span><b>Debería haber</b></span><b style="font-size:20px">' + money(esperado(c)) + '</b></div></div>';
    const otros = ['tr', 'tj', 'qr', 'fi', 'ap'].filter((k) => (p[k] || 0) || (cb[k] || 0));
    if (otros.length) h += '<div class="k" style="margin-top:12px"><b>Otros medios</b> (no van al cajón)</div><div class="rows" style="margin:4px 0 0">' + otros.map((k) => r(PAY[k], money((p[k] || 0) + (cb[k] || 0)))).join('') + '</div>';
    const mv = Object.keys(c.mv || {}).map((k) => c.mv[k]).sort((a, b) => String(a.h).localeCompare(String(b.h)));
    if (mv.length) h += '<div class="k" style="margin-top:12px"><b>Movimientos</b></div>' + mv.map(mvHtml).join('');
    return h;
  }
  const difHtml = (d) => d === 0 ? '<b style="color:#1a8f4c">Justo ✓</b>' : d < 0 ? '<b style="color:#b3261e">Faltan ' + money(-d) + '</b>' : '<b style="color:var(--sell)">Sobran ' + money(d) + '</b>';
  function cajaClose() {
    const c = S.caja; if (!c) return;
    const A = veEsp(), esp = esperado(c);
    const o = modal('<b style="font-size:19px">Cerrar caja</b><div class="k" style="margin-top:4px">Abierta a las ' + hm(c.ab) + (c.d !== X.today() ? ' del ' + dmy(c.d) : '') + ' por ' + esc(c.bn || '') + ' · ' + (c.n || 0) + ' venta' + (c.n === 1 ? '' : 's') + ' por ' + money(c.v || 0) + '</div>' +
      (A ? cajaRows(c) : '<div class="k" style="margin-top:10px">Contá todo el efectivo del cajón (billetes y monedas) y escribí el total.</div>') +
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
      setDoc(ref('cajas', c.id), fin, { merge: true }).catch(failW);
      lsSet('pk_deja_' + X.sid(), String(deja || ''));
      o.remove(); cajaVer(Object.assign({}, c, fin), true);
    };
    setTimeout(() => cn.focus(), 50);
  }
  function cajaTxt(c) {
    const p = c.p || {}, cb = c.c || {};
    const l = ['*Cierre de caja · ' + (X.sname() || '') + '*', dmy(c.d) + ' · ' + hm(c.ab) + ' a ' + hm(c.ci) + ' · ' + (c.cbn || c.bn || ''), '',
      'Ventas: ' + (c.n || 0) + ' por ' + money(c.v || 0), 'Efectivo inicial: ' + money(c.ini || 0), 'Ventas en efectivo: ' + money(p.ef || 0)];
    if (cb.ef) l.push('Cobros de fiado en efectivo: ' + money(cb.ef));
    if (c.ing) l.push('Puse plata: ' + money(c.ing));
    if (c.ret) l.push('Saqué plata: ' + money(c.ret));
    l.push('Debería haber: ' + money(c.esp != null ? c.esp : esperado(c)), 'Contado: ' + money(c.cnt || 0), (c.dif === 0 ? 'Diferencia: justo ✓' : c.dif < 0 ? 'Faltan: ' + money(-c.dif) : 'Sobran: ' + money(c.dif)));
    ['tr', 'tj', 'qr', 'fi', 'ap'].forEach((k) => { const v = (p[k] || 0) + (cb[k] || 0); if (v) l.push(PAY[k] + ': ' + money(v)); });
    if (c.cnt != null) l.push('Queda en la caja para el próximo turno: ' + money(c.deja != null ? c.deja : c.cnt));
    if (c.nota) l.push('Nota: ' + c.nota);
    return l.join('\n');
  }
  function cajaVer(c, recien) {
    const o = modal('<b style="font-size:19px">' + (recien ? 'Caja cerrada ✓' : 'Cierre de caja del ' + dmy(c.d)) + '</b><div class="k" style="margin-top:4px">' + hm(c.ab) + ' a ' + (c.ci ? hm(c.ci) : '…') + ' · abrió ' + esc(c.bn || '') + (c.cbn && c.cbn !== c.bn ? ' · cerró ' + esc(c.cbn) : '') + ' · ' + (c.n || 0) + ' ventas por ' + money(c.v || 0) + '</div>' +
      '<div style="margin:14px 0 0;padding:14px 16px;border-radius:16px;background:var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px"><span>Contado <b>' + money(c.cnt || 0) + '</b></span><span style="font-size:20px">' + difHtml(c.dif || 0) + '</span></div>' +
      (c.corr ? '<div class="k" style="margin-top:8px">Corregido por ' + esc(c.corr.bn || '') + ' (antes: contado ' + money(c.corr.cnt0 || 0) + ')</div>' : '') +
      (veEsp() ? cajaRows(c) : '') + (c.st === 'closed' && c.deja != null && c.deja !== c.cnt ? '<div class="k" style="margin-top:10px">Quedó en la caja para el próximo turno: <b>' + money(c.deja) + '</b></div>' : '') + (c.nota ? '<div class="k" style="margin-top:6px">Nota: ' + esc(c.nota) + '</div>' : '') +
      '<a class="go" style="display:block;text-align:center;text-decoration:none;margin-top:14px" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(cajaTxt(c)) + '">Mandar el resumen por WhatsApp</a>' +
      (adm() && c.st === 'closed' ? '<button class="go alt" data-al="cjfix" data-id="' + esc(c.id) + '">Corregir este cierre</button>' : '') +
      '<button class="go alt" data-close="1">Listo</button>');
    return o;
  }
  function cajaFix(c) {
    const o = modal('<b style="font-size:19px">Corregir cierre del ' + dmy(c.d) + '</b><div class="k" style="margin-top:4px">Debería haber ' + money(c.esp || 0) + '. Se contaron ' + money(c.cnt || 0) + '. Queda registrado que lo corregiste.</div>' +
      '<label>Efectivo contado</label><input id="cfc" type="number" inputmode="decimal" min="0" value="' + (c.cnt || 0) + '">' +
      '<label>Nota</label><input id="cfn" maxlength="120" autocomplete="off" value="' + esc(c.nota || '') + '" placeholder="Ej: apareció la plata del flete">' +
      '<button class="go" id="cfok">Guardar corrección</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelector('#cfok').onclick = () => {
      const cnt = Math.round(+o.querySelector('#cfc').value || 0), nota = o.querySelector('#cfn').value.trim().slice(0, 120);
      if (cnt < 0) { alert('El monto no puede ser negativo.'); return; }
      setDoc(ref('cajas', c.id), { cnt, deja: cnt, dif: cnt - (c.esp || 0), nota, corr: { at: Date.now(), bn: X.nm(), cnt0: c.cnt || 0 } }, { merge: true }).catch(failW);
      o.remove();
    };
  }
  function cajasCard() {
    if (S.cajasM == null) return '';
    const l = S.cajasM;
    let h = '<div class="card"><b>Cierres de caja</b>';
    if (!l.length) return h + '<div class="k" style="margin-top:6px">Todavía no hay cierres este mes. Se abre y se cierra la caja desde la Caja.</div></div>';
    let fal = 0; l.forEach((c) => { if (c.st === 'closed' && c.dif < 0) fal += -c.dif; });
    if (fal) h += '<div class="k" style="margin-top:4px">En el mes faltaron <b style="color:#b3261e">' + money(fal) + '</b> en total.</div>';
    h += l.slice(0, 40).map((c) => '<button class="pl" data-al="cjver" data-id="' + esc(c.id) + '"><span><b>' + dmy(c.d) + ' · ' + hm(c.ab) + (c.ci ? '–' + hm(c.ci) : '') + '</b><small>' + esc(c.cbn || c.bn || '') + ' · ' + (c.n || 0) + ' ventas · ' + money(c.v || 0) + (c.prev != null && c.prev !== c.ini ? '<span style="display:block;color:#b3261e">⚠️ Al abrir ' + (c.ini < c.prev ? 'faltaban ' : 'sobraban ') + money(Math.abs(c.ini - c.prev)) + ' de lo que dejó ' + esc(c.prevBn || 'el turno anterior') + '</span>' : '') + '</small></span>' +
      (c.st === 'open' ? '<b style="color:#1a8f4c">Abierta</b>' : difHtml(c.dif || 0)) + '</button>').join('');
    return h + '</div>';
  }
  function stop() { clearTimeout(pubT); S.lista = null; S.caja = null; S.cajaErr = false; S.cajasM = null; S.cjmM = null; Object.keys(un).forEach(off); S.cart = []; S.cl = []; S.sel = null; S.edit = null; S.repo = null; S.hoy = []; S.tot = null; S.totM = null; S.dayV = null; S.rcomp = null; }

  function redraw() {
    if (!X.isAlm()) return;
    const t = X.tab();
    if (t === 'caja') drawCaja(); else if (t === 'fia') drawFiado(); else if (t === 'stk') drawStock(); else if (t === 'res') drawRes();
  }

  // =====================================================================
  // CAJA
  // =====================================================================
  function drawCaja() {
    const box = $('s-caja');
    if (!X.canWrite()) { box.innerHTML = X.blockedCard(); return; }
    listenHoy();
    if (!P().length) {
      box.innerHTML = '<div class="card"><div class="empty">' + (load() ? 'Todavía no cargaste productos. Empezá por el Stock.' : 'Todavía no hay productos cargados. Un administrador tiene que cargarlos.') + '</div>' + (load() ? '<button class="go" data-t="stk">Ir a Stock</button>' : '') + '</div>';
      return;
    }
    if (!$('cjq')) {
      box.innerHTML = '<div id="cjbar"></div><div class="card"><div style="display:flex;gap:8px;align-items:center"><input id="cjq" type="search" enterkeyhint="go" placeholder="Buscar o escanear" autocomplete="off" style="flex:1;min-width:0" value="' + esc(S.q) + '">' + scanButton('scancaja') + '</div>' +
        '<div class="r1w"><button type="button" class="r1a l" data-r1="-1" aria-label="Ver categorías anteriores">‹</button><div id="cjcats" class="chips r1"></div><button type="button" class="r1a r" data-r1="1" aria-label="Ver más categorías">›</button></div><div id="cjres"></div></div><div id="cjcart"></div><div id="cjhoy"></div>';
      loadSan();
      const qi = $('cjq');
      qi.oninput = () => { S.q = qi.value; if (S.cat && S.q.trim()) { S.cat = ''; renderCats(); } renderRes(); };
      qi.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); enterAdd(); } };
      if (PC) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) qi.focus({ preventScroll: true }); }, 50);
    }
    renderCats(); renderRes(); renderHoy(); renderCajaBar();
    // Si el cajero está escribiendo (paga con, buscar cliente), no le borramos lo que escribe.
    const fa = document.activeElement;
    if (!(fa && fa.closest && fa.closest('#cjcart'))) renderCart();
  }
  function renderCats() {
    const e = $('cjcats'); if (!e) return;
    e.innerHTML = '<button class="ch lib" data-al="libre" title="Cobrar algo que no está cargado">＋ Importe libre</button>' +
      (sanActivo(S.san) ? '<button class="ch lib" data-al="sw" title="Armar un sánguche y descontar sus ingredientes del stock">🥪 Sánguche</button>' : '') +
      usedCats().map((c) => '<button class="ch' + (S.cat === c ? ' on' : '') + '" data-al="cat" data-v="' + esc(c) + '">' + esc(c) + '</button>').join('');
    filaFin(e);
  }
  // Filas de categorías: se deslizan de costado; con la rueda del mouse también (en la compu).
  function filaFin(e) {
    if (!e) return; const fin = e.scrollLeft + e.clientWidth >= e.scrollWidth - 4, ini = e.scrollLeft <= 4, w = e.parentNode;
    e.classList.toggle('fin', fin); if (w && w.classList.contains('r1w')) { w.classList.toggle('fin', fin); w.classList.toggle('ini', ini); }
  }
  if (!window.__r1) {
    window.__r1 = 1;
    document.addEventListener('scroll', (ev) => { const t = ev.target; if (t && t.classList && t.classList.contains('r1')) filaFin(t); }, true);
    // Flechitas ‹ › (compu) y arrastrar con el mouse.
    document.addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('[data-r1]'); if (!b) return;
      const r = b.parentNode.querySelector('.chips.r1'); if (r) r.scrollBy({ left: +b.dataset.r1 * Math.max(160, r.clientWidth * 0.7), behavior: 'smooth' });
    });
    let dr = null;
    document.addEventListener('pointerdown', (ev) => { if (ev.pointerType !== 'mouse' || ev.button !== 0) return; const r = ev.target.closest && ev.target.closest('.chips.r1'); if (r && r.scrollWidth > r.clientWidth) dr = { r, x: ev.clientX, s: r.scrollLeft, mov: false }; });
    document.addEventListener('pointermove', (ev) => { if (!dr) return; const dx = ev.clientX - dr.x; if (Math.abs(dx) > 5) { dr.mov = true; dr.r.classList.add('drag'); } if (dr.mov) dr.r.scrollLeft = dr.s - dx; });
    document.addEventListener('pointerup', () => { if (!dr) return; const d = dr; dr = null; d.r.classList.remove('drag');
      if (d.mov) { const stop = (e) => { e.stopPropagation(); e.preventDefault(); }; document.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', stop, true), 50); } });
    document.addEventListener('wheel', (ev) => {
      const r = ev.target && ev.target.closest && ev.target.closest('.chips.r1');
      if (!r || r.scrollWidth <= r.clientWidth || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
      const max = r.scrollWidth - r.clientWidth;
      if ((ev.deltaY > 0 && r.scrollLeft >= max) || (ev.deltaY < 0 && r.scrollLeft <= 0)) return;
      r.scrollLeft += ev.deltaY; ev.preventDefault();
    }, { passive: false });
  }
  function results() {
    if (!S.q.trim() && !S.cat) return null;
    return P().filter((p) => (!S.cat || p.cat === S.cat) && (match(p.n + ' ' + p.s + ' ' + p.cat, S.q) || (S.q.trim() && findByCode([p], S.q))))
      .sort((a, b) => a.n.localeCompare(b.n)).slice(0, 40);
  }
  function renderRes() {
    const e = $('cjres'); if (!e) return;
    const r = results();
    if (!r) {
      const ps = combos(X.promos(), Date.now());
      e.innerHTML = (ps.length ? '<div class="k" style="margin:12px 0 2px"><b>🔥 Promos</b></div>' + ps.map((p) => '<button class="pl" data-al="addpromo" data-id="' + esc(p.id) + '"><span><b>' + esc(p.titulo) + '</b>' + (p.items && p.items.length ? '<small>' + p.items.map((i) => (i.q > 1 ? i.q + '× ' : '') + esc(i.n)).join(' + ') + '</small>' : '') + '</span><b>' + money(p.precio) + '</b></button>').join('') : '') +
        '';
      return;
    }
    if (!r.length) { e.innerHTML = '<div class="empty">No encontré productos.</div>'; return; }
    e.innerHTML = r.map((p) => '<button class="pl" data-al="add" data-id="' + esc(p.id) + '"><span><b>' + esc(p.n) + '</b><small>' + (p.w ? 'por peso · ' : '') + (p.ns ? 'sin control de stock' : 'stock ' + fq(p.q, p.w)) + '</small></span><b>' + priceTxt(p) + '</b></button>').join('');
  }
  function enterAdd() {
    const q = S.q.trim().toLowerCase(); if (!q) return;
    let p = findByCode(P(), q);
    if (!p) { const r = results() || []; if (r.length === 1) p = r[0]; }
    if (!p) { const bl = balLine(q); if (bl) { if (bl.err) { beep(false); alert(bl.err); return; } beep(true); S.cart.push(bl.line); S.last = ''; clearSearch(); renderCart(); return; } }
    if (p) { if (p.pn) beep(true); addProd(p); } else if (/^\d{6,}$/.test(q)) { beep(false); if (load() && confirm('El código ' + q + ' no está cargado. ¿Lo cargás ahora?')) qkModal(q, (np) => addProd(np)); } // código que no existe
  }
  function clearSearch(noFocus) { S.q = ''; const qi = $('cjq'); if (qi) { qi.value = ''; renderRes(); if (!noFocus) qi.focus(); } }
  // Producto sin precio: se lo pone ahí mismo, al cobrar. Quien puede cargar productos lo deja guardado en el producto;
  // si no, el precio vale solo para esta venta.
  function precioDlg(p, done) {
    const c = qkCfg(), guarda = load(), sug = p.c > 0 ? roundPrice(p.c * (1 + c.m / 100), c.r) : 0;
    const o = modal('<b style="font-size:19px">' + esc(p.n) + '</b><div class="k">Todavía no tiene precio de venta' + (p.c > 0 ? ' · costo ' + money(p.c) + (p.w ? ' el kilo' : '') : '') + '.</div>' +
      '<label>Precio de venta' + (p.w ? ' (por kilo)' : '') + '</label><input id="pzp" type="number" inputmode="decimal" min="0" placeholder="0" autocomplete="off" value="' + (sug || '') + '">' +
      (sug ? '<div class="k" style="margin-top:4px">Sugerido: costo + ' + c.m + '% de ganancia.</div>' : '') +
      '<div class="k" id="pzm" style="margin-top:4px;font-weight:700"></div>' +
      '<div class="k" style="margin-top:10px">' + (guarda ? 'Queda guardado en el producto: la próxima vez ya sale con este precio.' : 'Vale solo para esta venta. Avisale a quien carga los productos para que le ponga precio.') + '</div>' +
      '<button class="go" id="pzok">' + (guarda ? 'Guardar y agregar' : 'Agregar a la venta') + '</button>' +
      '<button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const i = o.querySelector('#pzp'), m = o.querySelector('#pzm');
    const mg = () => { const v = +i.value; m.textContent = v > 0 && p.c > 0 ? (v > p.c ? 'Ganás ' + money(v - p.c) + ' (' + Math.round((v - p.c) / v * 100) + '%)' : '⚠️ Está por debajo del costo') : ''; };
    const ok = () => {
      const v = r2(+i.value); if (!(v > 0)) { i.focus(); return; }
      if (guarda) setDoc(doc(db, 'stores', X.sid(), 'stock', p.id), { pn: v }, { merge: true }).catch(failW);
      o.remove(); done(Object.assign({}, p, { pn: v }));
    };
    i.oninput = mg; mg();
    i.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
    o.querySelector('#pzok').onclick = ok;
    setTimeout(() => { i.focus(); i.select(); }, 60);
  }
  // Publicar un producto en Instagram (foto, nombre, precio). El link abre el producto en el catálogo.
  function instaProd(id, dest) {
    const p = prod(id); if (!p) return; const L = X.catLink ? X.catLink() : '';
    abrirInsta({ dest, historia: X.isAdm && X.isAdm() ? () => X.hist(p.id) : null, nombre: p.n, precio: p.pn, porKg: !!p.w, cat: p.cat, foto: p.img || '', logo: (X.pub() || {}).logo || '', tema: X.igTema ? X.igTema() : null, tienda: X.sname() || '', money,
      link: L ? L + (L.indexOf('?') >= 0 ? '&' : '?') + 'p=' + encodeURIComponent(p.id) : '',
      fotoHD: () => (p.hd ? getDoc(ref('public', fotoId(p.id))).then((s) => (s.exists() && s.data().f) || '').catch(() => '') : Promise.resolve('')) });
  }
  function addProd(p, noFocus) {
    if (!p.pn) { precioDlg(p, (np) => addProd(np, noFocus)); return; }
    if (p.w) { weightDlg(p); return; }
    if (p.op && limpiarOps(p.op).length) { opsDlg(p, noFocus); return; }
    const l = S.cart.find((x) => x.id === p.id && !x.w);
    if (l) l.q += 1; else S.cart.push({ id: p.id, n: p.n, q: 1, u: p.pn, c: p.c || 0, w: false });
    S.last = ''; clearSearch(noFocus); renderCart();
  }
  function weightDlg(p, idx) {
    const cur = idx != null ? S.cart[idx] : null;
    const o = modal('<b style="font-size:19px">' + esc(p.n) + '</b><div class="k">' + money(p.pn) + ' el kilo</div>' +
      '<div class="row"><div><label>Kilos</label><input id="wk" type="text" inputmode="decimal" placeholder="0,250" autocomplete="off" value="' + (cur ? n3(cur.q) : '') + '"></div>' +
      '<div><label>o Importe ($)</label><input id="wp" type="number" inputmode="decimal" placeholder="0" value="' + (cur ? lineTotal(cur) : '') + '"></div></div>' +
      '<div class="chips" style="margin-top:10px">' + [0.1, 0.25, 0.5, 1].map((k) => '<button class="ch" data-k="' + k + '">' + (k < 1 ? k * 1000 + ' g' : '1 kg') + '</button>').join('') + '</div>' +
      '<div class="tot" id="wt"></div><button class="go" id="wok">' + (cur ? 'Guardar' : 'Agregar') + '</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const wk = o.querySelector('#wk'), wp = o.querySelector('#wp'), wt = o.querySelector('#wt');
    const show = () => { const k = pnum(wk.value); wt.textContent = k > 0 ? fq(k, true) + ' = ' + money(k * p.pn) : ''; };
    wk.oninput = () => { const k = pnum(wk.value); wp.value = k > 0 ? Math.round(k * p.pn) : ''; show(); };
    wp.oninput = () => { const a = +wp.value; wk.value = a > 0 ? n3(a / p.pn) : ''; show(); };
    o.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { wk.value = n3(+b.dataset.k); wk.oninput(); }; });
    o.querySelector('#wok').onclick = () => {
      const k = r3(pnum(wk.value));
      if (!(k > 0)) { alert('Escribí los kilos o el importe.'); return; }
      if (cur) cur.q = k; else S.cart.push({ id: p.id, n: p.n, q: k, u: p.pn, c: p.c || 0, w: true });
      o.remove(); S.last = ''; clearSearch(); renderCart();
    };
    show(); setTimeout(() => wk.focus(), 50);
  }
  // ---------- Armá tu sánguche en la caja: una sola pantalla, todo a la vista, y descuenta las porciones del stock ----------
  function loadSan() {
    const sid = X.sid(); if (!sid) return;
    getDoc(doc(db, 'stores', sid, 'public', 'sanguche')).then((d) => { if (X.sid() !== sid) return; S.san = d.exists() ? sanCfg(d.data()) : null; renderCats(); }).catch(() => {});
  }
  function swDlg(pre) {
    const C = S.san; if (!sanActivo(C)) return;
    const PM = C.modo === 'pan';   // precio según el pan (el cajero lo puede cambiar si sale más)
    const st = pre ? { t: pre.t, s: JSON.parse(JSON.stringify(pre.s)) } : { t: PM ? 0 : (S.swT != null && C.tam[S.swT] ? S.swT : (C.tam.length === 1 ? 0 : null)), s: {} };
    let precio = null;   // precio escrito a mano (modo pan)
    C.pasos.forEach((p) => { if (!st.s[p.id]) st.s[p.id] = []; if (p.min && p.max === 1 && p.it.length === 1 && !st.s[p.id].length) st.s[p.id] = [p.it[0].i]; });
    let n = 1;
    const o = modal('<div id="swc"></div>'), box = o.querySelector('#swc');
    const r = () => (st.t == null ? null : sanCalc(C, st));
    const cuenta = () => C.pasos.reduce((a, p) => a + (p.cu ? st.s[p.id].length : 0), 0);
    const chip = (on, attrs, txt) => '<button type="button" class="ch' + (on ? ' on' : '') + '" ' + attrs + ' style="margin:0">' + txt + '</button>';
    const pinta = (msg) => {
      const x = r(), tm = !PM && st.t != null ? C.tam[st.t] : null, c = cuenta(), u = PM && precio != null ? precio : (x && x.ok ? x.u : tm ? tm.p : 0);
      let h = '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><b style="font-size:19px">🥪 Sánguche</b><b style="font-size:24px">' + (u ? money(u * n) : '') + '</b></div>' +
        '<div class="k" style="margin:2px 0 0">' + (PM ? 'Precio según el pan: si lleva más, cambialo abajo.' : tm ? esc(tm.n) + ' · ' + Math.min(c, tm.inc) + ' de ' + tm.inc + ' incluidos' + (c > tm.inc ? ' · ' + (c - tm.inc) + ' extra (+' + money((c - tm.inc) * C.ex) + ')' : '') : 'Elegí el tamaño') + '</div>';
      if (S.swPrev && !pre) h += '<button type="button" class="x" data-swrep="1" style="margin-top:6px;font-size:14px;font-weight:700;text-decoration:underline">↺ Repetir el último (' + esc(S.swPrev.txt) + ')</button>';
      if (!PM) h += '<div style="font-weight:800;font-size:14px;margin:12px 0 6px">Tamaño</div><div class="chips" style="margin:0;gap:6px">' + C.tam.map((t, i) => chip(st.t === i, 'data-swt="' + i + '"', esc(t.n) + ' ' + money(t.p))).join('') + '</div>';
      C.pasos.forEach((p) => {
        const sel = st.s[p.id];
        h += '<div style="font-weight:800;font-size:14px;margin:12px 0 6px">' + esc(p.t) + ' <span style="font-weight:500;opacity:.65">' + (p.max === 1 ? (p.min ? '· uno' : '· uno, opcional') : '· hasta ' + p.max) + (p.cu && !PM ? ' · entran en el tamaño' : '') + '</span></div><div class="chips" style="margin:0;gap:6px">' +
          p.it.map((it) => chip(sel.indexOf(it.i) >= 0, 'data-swp="' + esc(p.id) + '" data-swi="' + esc(it.i) + '"', esc(it.n) + (PM && p.id === 'pan' && it.p ? ' ' + money(it.p) : ''))).join('') + '</div>';
      });
      if (PM) h += '<div style="display:flex;gap:8px;align-items:center;margin-top:12px"><b style="flex:1;font-size:14px">Precio de cada sánguche</b><span>$</span><input id="swpu" type="number" inputmode="numeric" min="0" value="' + (u || '') + '" style="width:120px;margin:0"></div>';
      h += '<div class="k" style="min-height:18px;margin-top:10px;color:#b3261e;font-weight:700">' + esc(msg || '') + '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:6px"><button type="button" class="qb" data-swn="-1" aria-label="Uno menos">−</button><b style="min-width:22px;text-align:center">' + n + '</b><button type="button" class="qb" data-swn="1" aria-label="Uno más">+</button>' +
        '<button type="button" class="go" id="swadd" style="margin:0;flex:1">Agregar' + (u ? ' · ' + money(u * n) : '') + '</button></div>' +
        '<button type="button" class="go alt" data-close="1" style="margin-top:8px">Cancelar</button>';
      box.innerHTML = h;
    };
    const agregar = () => {
      const x = r();
      if (st.t == null) { pinta('Elegí el tamaño.'); return; }
      if (!x || !x.ok) { pinta(x && x.error ? 'Falta: ' + x.error.replace(/^falta elegir /, '') : 'Revisá lo elegido.'); return; }
      const c = x.comp.reduce((a, it) => a + (((prod(it.i) || {}).c) || 0) * it.q, 0);
      const u = PM && precio > 0 ? Math.round(precio) : x.u;
      S.cart.push({ promo: 'sw:' + uid(), sw: 1, n: '🥪 ' + x.n, q: n, u, w: false, items: x.comp.map((it) => ({ id: it.i, n: it.n, q: it.q })), c: Math.round(c) });
      const resto = x.comp.filter((it) => !(C.pasos[0] && C.pasos[0].id === 'pan' && C.pasos[0].it.some((p) => p.i === it.i))).map((it) => it.n);
      S.swT = st.t; S.swPrev = { t: st.t, s: JSON.parse(JSON.stringify(st.s)), txt: (PM ? x.n.replace(/^Sánguche /, '') : C.tam[st.t].n) + ': ' + resto.slice(0, 3).join(', ') + (resto.length > 3 ? '…' : '') };
      S.last = ''; o.remove(); renderCart();
    };
    o.addEventListener('input', (e) => { if (e.target.id === 'swpu') { precio = +e.target.value || 0; const t = box.querySelector('#swadd'); if (t) t.textContent = 'Agregar' + (precio ? ' · ' + money(precio * n) : ''); } });
    o.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !box.contains(b)) return; const ds = b.dataset;
      if (ds.swt != null) st.t = +ds.swt;
      else if (ds.swi != null) {
        const p = C.pasos.find((q) => q.id === ds.swp), sel = st.s[p.id], k = sel.indexOf(ds.swi);
        if (PM && p.id === 'pan') precio = null;   // cambió el pan: vuelve al precio de ese pan
        if (k >= 0) sel.splice(k, 1); else if (p.max === 1) { sel.length = 0; sel.push(ds.swi); } else if (sel.length >= p.max) { pinta('En ' + p.t + ' van hasta ' + p.max + '.'); return; } else sel.push(ds.swi);
      } else if (ds.swn) n = Math.max(1, Math.min(50, n + +ds.swn));
      else if (ds.swrep) { const pv = S.swPrev; st.t = pv.t; Object.keys(st.s).forEach((k) => { st.s[k] = (pv.s[k] || []).slice(); }); }
      else if (b.id === 'swadd') { agregar(); return; }
      else return;
      pinta();
    });
    // Enter agrega y Escape cierra (antes que el lector de códigos de la compu, que también escucha el teclado).
    const tecla = (e) => {
      if (!document.body.contains(o)) { window.removeEventListener('keydown', tecla, true); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); agregar(); }
      else if (e.key === 'Escape') { e.stopImmediatePropagation(); o.remove(); }
    };
    window.addEventListener('keydown', tecla, true);
    o.tabIndex = -1; pinta(); setTimeout(() => o.focus(), 0);
  }
  function addPromo(id) {
    const p = combos(X.promos(), Date.now()).find((x) => x.id === id); if (!p) return;
    const l = S.cart.find((x) => x.promo === id);
    if (l) l.q += 1;
    else S.cart.push({ promo: id, n: '🔥 ' + p.titulo, q: 1, u: p.precio, w: false, items: (p.items || []).map((i) => ({ id: i.id, n: i.n, q: i.q })),
      c: (p.items || []).reduce((a, i) => a + ((prod(i.id) || {}).c || 0) * i.q, 0) });
    S.last = ''; renderCart();
  }
  // Carrito con el descuento por cantidad aplicado (baja el precio de los productos que entran en la promo).
  function efectivo() {
    const suel = S.cart.map((l, i) => ({ l, i })).filter((x) => !x.l.promo);
    const d = descuento(X.promos(), Date.now(), suel.map((x) => ({ cat: (prod(x.l.id) || {}).cat || '', unidades: x.l.w ? 1 : x.l.q, total: lineTotal(x.l) })));
    const lines = S.cart.map((l) => Object.assign({}, l));
    let dsc = null;
    if (d.mejor) {
      const f = 1 - d.mejor.monto / d.mejor.base;
      d.mejor.idx.forEach((j) => { lines[suel[j].i].u = lines[suel[j].i].u * f; });
      dsc = { t: tituloCant(d.mejor.p, 'productos'), m: d.mejor.monto };
    }
    return { lines, dsc, cerca: d.cerca };
  }
  // Envío a domicilio (módulo de repartos): se cobra como una línea más de la venta.
  const RPm = () => (X.rp && X.rp()) || null;
  const envCob = () => (S.env && S.env.cob) || 0;
  function renderCart() {
    const e = $('cjcart'); if (!e) return;
    if (!S.cart.length) { e.innerHTML = S.last ? '<div class="card"><div class="tot" style="color:var(--sell);font-size:16px;margin:0">' + S.last + '</div>' +
      (S.lastTk ? '<div style="display:flex;gap:8px;margin-top:10px"><button class="go alt" data-al="tkpr" style="margin:0;flex:1">🧾 Imprimir ticket</button><button class="go alt" data-al="tkcfg" style="margin:0;width:auto;padding:0 14px" aria-label="Configurar tiketera">⚙️</button></div>' : '') + '</div>' : ''; return; }
    const EF = efectivo(), tot = cartTotals(EF.lines).tot + envCob();
    let h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>Venta en curso</b><button class="x" data-al="clear" style="font-size:14px;text-decoration:underline">Vaciar</button></div>';
    S.cart.forEach((l, i) => {
      h += '<div class="it"><div><b>' + esc(l.n) + '</b>' + (l.items && l.items.length ? '<small>' + l.items.map((x) => (x.q > 1 ? x.q + '× ' : '') + esc(x.n)).join(' + ') + '</small>' : '') + '<small>' + fq(l.q, l.w) + ' × ' + money(l.u) + (l.w ? '/kg' : '') + '</small></div>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
        (l.w ? '<button class="qb" data-al="wedit" data-i="' + i + '" aria-label="Cambiar peso">✎</button>' : '<button class="qb" data-al="dec" data-i="' + i + '" aria-label="Uno menos">−</button><button class="qb" data-al="inc" data-i="' + i + '" aria-label="Uno más">+</button>') +
        '<b style="min-width:76px;text-align:right">' + money(lineTotal(l)) + '</b><button class="x" data-al="rm" data-i="' + i + '" aria-label="Quitar">×</button></div></div>';
    });
    if (EF.dsc) h += '<div class="it" style="color:var(--buy);font-weight:800"><div>🏷️ ' + esc(EF.dsc.t) + '</div><div>−' + money(EF.dsc.m) + '</div></div>';
    else if (EF.cerca) h += '<div class="k" style="margin-top:8px">🏷️ Sumá ' + EF.cerca.faltan + ' más' + (EF.cerca.p.cat ? ' de ' + esc(EF.cerca.p.cat) : '') + ' y tiene ' + EF.cerca.p.pct + '% OFF.</div>';
    if (S.env) h += '<div class="it"><div><b>🛵 Envío a domicilio</b><small>' + esc(S.env.rn || '') + (S.env.dir ? ' · ' + esc(S.env.dir) : '') + (S.env.pag ? ' · al repartidor ' + money(S.env.pag) : '') + '</small></div><div style="display:flex;align-items:center;gap:6px"><b style="min-width:76px;text-align:right">' + money(S.env.cob) + '</b><button class="x" data-al="envx" aria-label="Quitar envío">×</button></div></div>';
    else if (RPm() && RPm().on()) h += '<button class="x" data-al="envadd" style="font-size:15px;font-weight:700;text-decoration:underline;color:var(--ink);margin-top:10px">🛵 Agregar envío a domicilio</button>';
    h += '<div class="big" style="font-size:40px;margin:14px 0 4px">' + money(tot) + '</div>';
    const PB = { ef: 'Efectivo', tr: 'Transferencia', tj: 'Tarjeta', qr: 'QR / MP', fi: 'Fiado', mix: 'Dividido' }, AL = apps();
    if (AL.length) PB.ap = '📲 App';
    if (S.pay === 'ap' && !AL.length) S.pay = 'ef';
    h += '<div class="seg" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">' + Object.keys(PB).map((k) => '<button class="pay' + (S.pay === k ? ' on' : '') + '" data-al="pay" data-v="' + k + '" style="margin:0">' + PB[k] + '</button>').join('') + '</div>';
    if (S.pay === 'ef') {
      h += '<label>¿Con cuánto paga?</label><div class="chips" style="margin-top:4px">' + ['justo'].concat(billetes(tot)).map((b) => '<button class="ch' + (String(b === 'justo' ? tot : b) === String(S.paga) ? ' on' : '') + '" data-al="paga" data-v="' + (b === 'justo' ? tot : b) + '">' + (b === 'justo' ? 'Justo' : money(b)) + '</button>').join('') + '</div>' +
        '<input id="cjpg" type="number" inputmode="decimal" placeholder="O escribí el monto" value="' + esc(S.paga) + '" style="margin-top:8px" enterkeyhint="done"><div id="cjvu">' + vueltoHtml(tot) + '</div>';
    }
    if (S.pay === 'mix') {
      const ef = Math.round(+S.mixEf || 0), resto = tot - ef;
      h += '<div class="row" style="align-items:flex-end"><div><label>Paga en efectivo</label><input id="cjmx" type="number" inputmode="decimal" placeholder="0" value="' + esc(S.mixEf) + '"></div>' +
        '<div><label>El resto con</label><select id="cjmo">' + OTROS.map((k) => '<option value="' + k + '"' + (S.mixO === k ? ' selected' : '') + '>' + ({ tr: 'Transferencia', tj: 'Tarjeta', qr: 'QR / MP' })[k] + '</option>').join('') + '</select></div></div>' +
        '<div class="k" id="cjmr" style="margin-top:8px;font-size:15px">' + mixTxt(tot) + '</div>';
    }
    if (S.pay === 'fi') h += cliPicker();
    let apT = 0;
    if (S.pay === 'ap') {
      if (!appDe(S.apSel)) S.apSel = AL.length === 1 ? AL[0].id : '';
      const A = appDe(S.apSel); apT = A ? (Math.round(+S.apTot) || apTotal(tot, A.rec)) : 0;
      h += '<label>¿Por qué app?</label><div class="chips" style="margin-top:4px">' + AL.map((a) => '<button class="ch' + (a.id === S.apSel ? ' on' : '') + '" data-al="apsel" data-v="' + esc(a.id) + '">' + esc(a.n) + '</button>').join('') + '</div>' +
        (A ? '<label>Total del pedido en ' + esc(A.n) + '</label><input id="cjap" type="number" inputmode="numeric" value="' + apT + '">' +
          '<div class="k" style="margin-top:6px">' + (A.rec ? 'Con el ' + A.rec + '% de recargo de la app. ' : '') + 'No entra a la caja: queda a cobrar en la cuenta de ' + esc(A.n) + (A.com ? ' (te depositan ≈ <b id="cjapn">' + money(apNeto(apT, A.com)) + '</b> con el ' + A.com + '% de comisión)' : '') + '.</div>' : '');
    }
    h += '<button class="go" data-al="cobrar">' + (S.pay === 'fi' ? 'Anotar en el fiado ' : S.pay === 'ap' ? 'Registrar venta' + (appDe(S.apSel) ? ' de ' + esc(appDe(S.apSel).n) + ' ' + money(apT) : '') : 'Cobrar ' + money(tot)) + '</button>' +
      (X.pedOn && X.pedOn() && !S.ped ? '<button class="go alt" data-al="aped" style="margin-top:8px">🛎️ Guardar como pedido (se cobra después)</button>' : '') + '</div>';
    e.innerHTML = h;
    const pg = $('cjpg');
    if (pg) {
      pg.oninput = () => { S.paga = pg.value; $('cjvu').innerHTML = vueltoHtml(tot); e.querySelectorAll('[data-al="paga"]').forEach((b) => b.classList.toggle('on', b.dataset.v === S.paga)); };
      pg.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); cobrar(); } };
    }
    const mx = $('cjmx'), mo = $('cjmo');
    if (mx) mx.oninput = () => { S.mixEf = mx.value; $('cjmr').innerHTML = mixTxt(tot); };
    if (mo) mo.onchange = () => { S.mixO = mo.value; $('cjmr').innerHTML = mixTxt(tot); };
    const ap = $('cjap');
    if (ap) ap.oninput = () => { S.apTot = ap.value; const A = appDe(S.apSel), n = $('cjapn'), b = e.querySelector('[data-al="cobrar"]'), v = Math.round(+ap.value || 0); if (n && A) n.textContent = money(apNeto(v, A.com)); if (b && A) b.textContent = 'Registrar venta de ' + A.n + ' ' + money(v); };
    const cq = $('cjcq');
    if (cq) cq.oninput = () => { S.cliQ = cq.value; const l = $('cjcl'); if (l) l.innerHTML = cliList(); };
  }
  function vueltoHtml(tot) {
    const pg = Math.round(+S.paga || 0);
    if (!pg) return '';
    if (pg < tot) return '<div class="bn warn" style="margin:10px 0 0">Faltan <b>' + money(tot - pg) + '</b></div>';
    return '<div style="margin:12px 0 0;padding:14px 16px;border-radius:16px;background:var(--sell);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:10px"><span style="font-weight:700;font-size:17px">Vuelto</span><b style="font-size:34px;line-height:1">' + money(pg - tot) + '</b></div>';
  }
  function mixTxt(tot) {
    const ef = Math.round(+S.mixEf || 0);
    if (!ef) return 'Escribí cuánto paga en efectivo.';
    if (ef >= tot) return '⚠️ El efectivo cubre todo: elegí <b>Efectivo</b> en vez de Dividido.';
    return 'Efectivo <b>' + money(ef) + '</b> + ' + PAY[S.mixO] + ' <b>' + money(tot - ef) + '</b>';
  }
  function cliList() {
    const l = S.cl.filter((c) => match(c.n + ' ' + c.tel, S.cliQ)).sort((a, b) => a.n.localeCompare(b.n)).slice(0, 8);
    return l.map((c) => '<button class="pl' + (S.cli === c.id ? ' on' : '') + '" data-al="pickcli" data-id="' + esc(c.id) + '"><span><b>' + esc(c.n) + '</b>' + (c.tel ? '<small>' + esc(c.tel) + '</small>' : '') + '</span><b class="' + (c.s > 0 ? 'neg' : '') + '">' + (c.s > 0 ? 'debe ' + money(c.s) : 'al día') + '</b></button>').join('') ||
      '<div class="k" style="margin-top:8px">' + (S.cl.length ? 'No encontré ese cliente.' : 'Todavía no hay clientes.') + '</div>';
  }
  function cliPicker() {
    if (S.clErr) return rulesCard();
    const c = cli(S.cli);
    if (c) return '<div class="bn" style="margin:14px 0 0;display:flex;justify-content:space-between;gap:10px;align-items:center"><span>Fiado a <b>' + esc(c.n) + '</b>' + (c.s > 0 ? '<br><small>Ya debe ' + money(c.s) + '</small>' : '') + '</span><button class="x" data-al="pickcli" data-id="" style="font-size:14px;text-decoration:underline">Cambiar</button></div>';
    return '<label>¿A quién le fiás?</label><input id="cjcq" type="search" placeholder="Buscar cliente" autocomplete="off" value="' + esc(S.cliQ) + '"><div id="cjcl">' + cliList() + '</div>' +
      '<button class="x" data-al="newcli" data-pick="1" style="font-size:15px;font-weight:700;text-decoration:underline;color:var(--ink);margin-top:8px">+ Cliente nuevo</button>';
  }
  // Diagnóstico cuando Firebase rechaza una venta: ¿la persona figura como miembro? ¿el acceso de la tienda está vigente?
  function diagPermiso(sid, uidU) {
    const f = (t) => new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return Promise.all([
      getDoc(doc(db, 'stores', sid, 'members', uidU)).then((m) => (m.exists() ? 'sí (' + (m.data().role || '?') + ')' : 'NO'), (e) => 'no se pudo leer (' + ((e && e.code) || '?') + ')'),
      getDoc(doc(db, 'stores', sid, 'billing', 'access')).then((a) => {
        if (!a.exists()) return 'sin datos';
        const x = a.data(), t = x.activeUntil && x.activeUntil.toMillis ? x.activeUntil.toMillis() : (typeof x.activeUntil === 'number' ? x.activeUntil : null);
        if (x.unlimited) return 'ilimitado';
        return t ? (t > Date.now() ? 'vigente hasta ' : 'VENCIDO el ') + f(t) : 'sin fecha de vencimiento';
      }, (e) => 'no se pudo leer (' + ((e && e.code) || '?') + ')')
    ]).then(([m, a]) => 'Diagnóstico → miembro: ' + m + ' · acceso: ' + a + ' · tienda: ' + sid + ' · id: ' + String(uidU).slice(0, 8)).catch(() => '');
  }
  // Avisa (una sola vez por tanda) que la venta se guardó pero no se pudo descontar el stock de algún producto.
  let sfT = null, sfL = [];
  function stockFallo(n) {
    if (sfL.indexOf(n) < 0) sfL.push(n); clearTimeout(sfT);
    sfT = setTimeout(() => { const l = sfL.slice(); sfL = []; diagPermiso(X.sid(), (X.user() || {}).uid).then((dg) => alert('Firebase no dejó descontar del stock: ' + l.join(', ') + '.\n\n' + dg + '\n\nMandale este mensaje a Pekeron App (usuario: ' + X.nm() + ').')); }, 400);
  }
  function cobrar() {
    if (!S.cart.length) return;
    if (!X.canWrite()) { alert('El acceso de la tienda venció.'); return; }
    if (S.pay === 'fi' && !cli(S.cli)) { alert('Elegí a quién le fiás.'); return; }
    const APP = S.pay === 'ap' ? appDe(S.apSel) : null;
    if (S.pay === 'ap' && !APP) { alert('Elegí por qué app fue la venta.'); return; }
    if (S.pay === 'ef' && +S.paga > 0 && +S.paga < cartTotals(efectivo().lines).tot + envCob() && !confirm('Paga con ' + money(+S.paga) + ' y la venta es de ' + money(cartTotals(efectivo().lines).tot + envCob()) + '. ¿Cobrar igual?')) return;
    if (S.pay === 'mix') { const ef0 = Math.round(+S.mixEf || 0), t0 = cartTotals(efectivo().lines).tot + envCob(); if (!(ef0 > 0 && ef0 < t0)) { alert(ef0 >= t0 ? 'El efectivo cubre todo: elegí Efectivo.' : 'Escribí cuánto paga en efectivo.'); return; } }
    const sid = X.sid(), d = X.today(), m = d.slice(0, 7), dd = d.slice(8, 10), u = X.user();
    const EF = efectivo(), it = [];
    EF.lines.forEach((l) => {
      if (!l.promo) { it.push({ id: l.id, n: l.n, q: r3(l.q), u: l.u, c: l.c || 0, w: l.w ? 1 : 0 }); return; }
      const total = Math.round(l.q * l.u), ps = l.items || [];
      if (!ps.length) { it.push({ id: '', n: l.n, q: l.q, u: l.u, c: 0, w: 0, pr: l.n }); return; }
      // el precio del combo se reparte entre sus productos según su precio normal (así la ganancia por producto es real)
      const parts = repartir(total, ps.map((x) => ((prod(x.id) || {}).pn || 1) * x.q));
      ps.forEach((x, j) => { const p = prod(x.id) || {}, q = x.q * l.q; it.push({ id: x.id, n: x.n, q, u: parts[j] / q, c: p.c || 0, w: p.w ? 1 : 0, pr: l.n }); });
    });
    const ENV = S.env; if (ENV && ENV.cob > 0) it.push({ id: '', n: 'Envío a domicilio', q: 1, u: ENV.cob, c: 0, w: 0, env: 1 });
    // Venta por app: el total es el de la app (con su recargo o el que escribieron); se reparte entre los productos.
    if (APP) { const t0 = cartTotals(it).tot, ta = Math.round(+S.apTot) || apTotal(t0, APP.rec); if (t0 > 0 && ta > 0 && ta !== t0) { const f = ta / t0; it.forEach((x) => { x.u = x.u * f; }); } }
    const { tot, cost } = cartTotals(it);
    const id = uid();
    const v = { id, d, m, h: now(), it, tot, cost, pay: S.pay, by: u.uid, bn: X.nm() };
    if (APP) { v.ap = APP.id; v.apn = APP.n; }
    if (S.pay === 'mix') { const ef = Math.round(+S.mixEf); v.pp = { ef, [S.mixO]: tot - ef }; }
    if (S.caja) v.cj = S.caja.id;
    if (EF.dsc) v.dsc = EF.dsc;
    if (ENV) v.env = ENV;
    const pp = partes(v), payInc = {}; Object.keys(pp).forEach((k) => { payInc[k] = increment(pp[k]); });
    // lo vendido por producto en el mes (para "Lo más vendido")
    const prInc = {}; it.forEach((x) => { if (!x.id || !prod(x.id)) return; const o = prInc[x.id] || (prInc[x.id] = { q: 0, v: 0, n: x.n }); o.q = r3(o.q + x.q); o.v += Math.round(x.q * x.u); });
    Object.keys(prInc).forEach((k) => { prInc[k] = { q: increment(prInc[k].q), v: increment(prInc[k].v), n: (prod(k) || {}).n || prInc[k].n }; });
    const b = writeBatch(db), escr = [];   // [nombre, ref, datos, merge]
    if (S.pay === 'fi') {
      const c = cli(S.cli), fid = uid();
      v.cli = c.id; v.cn = c.n; v.fid = fid;
      escr.push(['fiado', doc(db, 'stores', sid, 'fiado', fid), { id: fid, cid: c.id, t: 'f', a: tot, d, m, vid: id, det: it.map((x) => x.n + (x.w ? ' ' + fq(x.q, 1) : (x.q > 1 ? ' x' + n3(x.q) : ''))).join(', ').slice(0, 300), by: u.uid, bn: X.nm() }, false]);
      escr.push(['cliente', doc(db, 'stores', sid, 'clientes', c.id), Object.assign({ s: increment(tot), u: Date.now() }, c.s <= 0 ? { fd: X.today() } : {}), true]);
    }
    escr.push(['venta', doc(db, 'stores', sid, 'ventas', id), v, false]);
    escr.push(['totales del mes', doc(db, 'stores', sid, 'totales', m), { v: increment(tot), c: increment(cost), n: increment(1), pay: payInc, pr: prInc, dias: { [dd]: { v: increment(tot), c: increment(cost), n: increment(1) } } }, true]);
    escr.forEach((x) => b.set(x[1], x[2], x[3] ? { merge: true } : undefined));
    b.commit().catch((e) => {
      if (!deny(e)) { X.fail(e); return; }
      // Firebase rechazó algo: se guarda cada parte por separado para no perder la venta y saber qué parte fue.
      Promise.all(escr.map((x) => setDoc(x[1], x[2], x[3] ? { merge: true } : {}).then(() => '', (er) => { console.warn('Venta: Firebase rechazó', x[0], er && er.code); return x[0]; })))
        .then((r) => diagPermiso(sid, u.uid).then((dg) => { const no = r.filter(Boolean), ok = no.indexOf('venta') < 0;
          alert((ok ? 'La venta se guardó ✓, pero Firebase no dejó guardar: ' : 'No se pudo guardar la venta. Firebase no dejó guardar: ') + no.join(', ') + '.\n\n' + dg + '\n\nMandale este mensaje a Pekeron App (usuario: ' + X.nm() + ').'); }));
    });
    // El stock va aparte y producto por producto: si Firebase rechaza uno (por ejemplo un producto con el stock mal
    // guardado), la venta ya quedó registrada igual y se avisa cuál fue, en vez de perder la venta entera.
    const desc = {}; it.forEach((x) => { if (ctl(x.id)) desc[x.id] = r3((desc[x.id] || 0) + x.q); });
    Object.keys(desc).forEach((pid) => {
      if (!(desc[pid] > 0)) return;
      updateDoc(doc(db, 'stores', sid, 'stock', pid), { q: increment(-desc[pid]) }).catch((e) => {
        const pn = (prod(pid) || {}).n || pid; console.warn('No se pudo descontar el stock de', pn, pid, e && e.code);
        if (deny(e)) stockFallo(pn);
      });
    });
    // La caja va aparte: si justo la cerraron en otro equipo, la venta igual se guarda.
    if (S.caja) setDoc(doc(db, 'stores', sid, 'cajas', S.caja.id), { n: increment(1), v: increment(tot), p: payInc }, { merge: true }).catch(() => {});
    if (ENV && RPm()) RPm().registrar(ENV, { det: it.filter((x) => !x.env).map((x) => x.n).join(', '), vid: id });
    if (APP) apSumar(APP.id, APP.n, d, tot);
    const pg = +S.paga;
    // Ticket de la venta (para la tiketera): con los precios de lista, el descuento aparte y el vuelto.
    S.lastTk = { tienda: X.sname(), dir: (X.pub() || {}).addr || '', fecha: new Date(), atendio: X.nm(), cliente: S.pay === 'fi' ? cli(S.cli).n : '',
      lineas: S.cart.map((l) => ({ n: l.n, q: l.w ? r3(l.q) : l.q, u: l.u, w: !!l.w })), dsc: EF.dsc || null, env: ENV && ENV.cob > 0 ? ENV.cob : 0,
      tot, pago: payLabel(v), paga: S.pay === 'ef' && pg >= tot && pg > 0 ? pg : 0, vuelto: S.pay === 'ef' && pg >= tot ? pg - tot : 0 };
    if (tkConfig().auto) imprimir(S.lastTk);
    if (S.ped) { updateDoc(doc(db, 'stores', sid, 'pedidos', S.ped), { cob: true, vid: id, cpay: payLabel(v) }).catch(() => {}); S.ped = null; }
    S.last = (S.pay === 'fi' ? 'Anotado en el fiado de ' + esc(cli(S.cli).n) + ': ' : APP ? 'Venta de ' + esc(APP.n) + ' registrada ✓ (a cobrar) ' : 'Cobrado ✓ ') + money(tot) + (S.pay === 'mix' ? ' (' + payLabel(v) + ')' : '') + (S.pay === 'ef' && pg >= tot && pg > 0 ? ' · Vuelto ' + money(pg - tot) : '');
    S.cart = []; S.paga = ''; S.mixEf = ''; S.cli = ''; S.cliQ = ''; S.pay = 'ef'; S.apTot = ''; S.cat = ''; S.env = null; renderCats();
    renderCart(); clearSearch();
  }
  // Venta en curso → pedido para preparar (mesa, retira o envío). Se cobra después desde Pedidos → Cobrar en la caja.
  function pedidoDlg() {
    if (!S.cart.length) return;
    const pre = S.pedPre || {}; let tipo = pre.tipo || 'ret';
    const o = modal('<b style="font-size:19px">🛎️ Guardar como pedido</b><div class="k" style="margin:4px 0 10px">Le llega a la cocina (y sale la comanda si está activada). Lo cobrás cuando lo entregás.</div>' +
      '<label>Nombre del cliente</label><input id="pd_n" maxlength="60" placeholder="Ej: Juan (si lo dejás vacío: Mostrador)" autocomplete="off">' +
      '<label>¿Para?</label><div class="seg" id="pd_t" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">' + [['ret', '🏪 Retira'], ['mesa', '🍽️ Mesa'], ['env', '🛵 Envío']].map((x) => '<button type="button" class="pay' + (x[0] === tipo ? ' on' : '') + '" data-t="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
      '<div id="pd_m"' + (tipo === 'mesa' ? '' : ' hidden') + '><label>Número de mesa</label><input id="pd_mn" maxlength="12" inputmode="numeric" placeholder="Ej: 4" value="' + esc(pre.mesa || '') + '"></div>' +
      '<div id="pd_e" hidden><label>Dirección</label><input id="pd_d" maxlength="160" placeholder="Calle, número, barrio"><label>Teléfono</label><input id="pd_tel" type="tel" maxlength="24" placeholder="381 555 1234"></div>' +
      '<label>Aclaraciones (opcional)</label><input id="pd_nt" maxlength="200" placeholder="Ej: sin sal, para las 21:30">' +
      '<button class="go" id="pd_ok">Guardar pedido</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const q = (id) => o.querySelector('#' + id);
    o.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { tipo = b.dataset.t; o.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); q('pd_m').hidden = tipo !== 'mesa'; q('pd_e').hidden = tipo !== 'env'; }; });
    q('pd_ok').onclick = () => {
      const mesa = q('pd_mn').value.trim(), dir = q('pd_d').value.trim();
      if (tipo === 'mesa' && !mesa) { alert('Escribí el número de mesa.'); return; }
      if (tipo === 'env' && dir.length < 4) { alert('Escribí la dirección del envío.'); return; }
      const EF = efectivo(), it = S.cart.map((l) => {
        const m = l.op ? /^(.*?) \((.+)\)$/.exec(l.n) : null, x = { k: l.promo || /^lib_/.test(l.id || '') ? '' : (l.id || ''), n: String(m ? m[1] : l.n).slice(0, 80), q: l.w ? r3(l.q) : l.q, u: Math.round(l.u) };
        if (m) x.x = m[2].slice(0, 200); if (l.w) x.w = 1; if (l.promo) x.t = 'promo'; return x;
      });
      const d = { tipo, cl: q('pd_n').value.trim().slice(0, 60) || 'Mostrador', it, tot: Math.round(cartTotals(EF.lines).tot), by: X.user().uid };
      if (tipo === 'mesa') d.mesa = mesa.slice(0, 12); if (tipo === 'env') { d.dir = dir.slice(0, 160); const t = q('pd_tel').value.trim(); if (t) d.tel = t.slice(0, 24); }
      const nt = q('pd_nt').value.trim(); if (nt) d.nota = nt.slice(0, 200);
      if (S.pay === 'ap' && appDe(S.apSel)) { d.pago = appDe(S.apSel).n; d.ap = S.apSel; }
      else if (S.pay && PAY[S.pay] && S.pay !== 'fi') d.pago = PAY[S.pay];
      q('pd_ok').disabled = true;
      X.guardarPedido(d).then((r) => { o.remove(); S.cart = []; S.paga = ''; S.env = null; S.pedPre = null; S.last = '🛎️ Pedido #' + String(r.id).slice(-4).toUpperCase() + ' enviado a preparar'; renderCart(); clearSearch(); if (pre.volver && X.volver) X.volver(pre.volver); })
        .catch((e) => { q('pd_ok').disabled = false; X.fail(e); });
    };
    setTimeout(() => q('pd_n').focus(), 50);
  }
  // Pedido pagado → venta registrada (sin pasar por la caja). Los precios son los del pedido; el costo y el stock, los del Stock de ahora.
  // Si el pedido tuvo descuentos, se reparten entre los productos para que el total sea el del pedido.
  function ventaPedido(p, pay) {
    if (!X.canWrite()) return Promise.reject(new Error('El acceso de la tienda venció.'));
    if (p.cob) return Promise.resolve(null);
    const sid = X.sid(), d = X.today(), m = d.slice(0, 7), dd = d.slice(8, 10), u = X.user();
    const APP = /^ap:/.test(pay || '') ? appDe(pay.slice(3)) : null; if (APP) pay = 'ap'; else if (pay === 'ap') pay = 'tr';
    const it = (p.it || []).map((l) => { const pr = l.t ? null : prod(l.k), q = +l.q || 1; return { id: pr ? pr.id : '', n: String((l.n || 'Producto') + (l.x ? ' (' + l.x + ')' : '')).slice(0, 140), q: l.w ? r3(q) : q, u: +l.u || 0, c: pr ? (pr.c || 0) : 0, w: l.w ? 1 : 0 }; });
    const subt = it.reduce((a, x) => a + x.q * x.u, 0), env = Math.max(0, +p.env || 0), obj0 = Math.max(0, Math.round((+p.tot || 0) - env)), obj = APP ? apTotal(obj0, APP.rec) : obj0;
    if (subt > 0 && Math.abs(subt - obj) > 1) { const f = obj / subt; it.forEach((x) => { x.u = x.u * f; }); }
    if (env > 0) it.push({ id: '', n: 'Envío a domicilio', q: 1, u: env, c: 0, w: 0, env: 1 });
    const { tot, cost } = cartTotals(it), id = uid();
    const v = { id, d, m, h: now(), it, tot, cost, pay, by: u.uid, bn: X.nm(), ped: p.id, pcl: String(p.cl || '').slice(0, 60) };
    if (S.caja) v.cj = S.caja.id;
    if (subt - obj > 1) v.dsc = { t: 'Descuento del pedido', m: Math.round(subt - obj) };
    if (APP) { v.ap = APP.id; v.apn = APP.n; }
    const pp = partes(v), payInc = {}; Object.keys(pp).forEach((k) => { payInc[k] = increment(pp[k]); });
    const prInc = {}; it.forEach((x) => { if (!x.id || !prod(x.id)) return; const o = prInc[x.id] || (prInc[x.id] = { q: 0, v: 0, n: x.n }); o.q = r3(o.q + x.q); o.v += Math.round(x.q * x.u); });
    Object.keys(prInc).forEach((k) => { prInc[k] = { q: increment(prInc[k].q), v: increment(prInc[k].v), n: (prod(k) || {}).n || prInc[k].n }; });
    const b = writeBatch(db);
    b.set(doc(db, 'stores', sid, 'ventas', id), v);
    b.set(doc(db, 'stores', sid, 'totales', m), { v: increment(tot), c: increment(cost), n: increment(1), pay: payInc, pr: prInc, dias: { [dd]: { v: increment(tot), c: increment(cost), n: increment(1) } } }, { merge: true });
    b.update(doc(db, 'stores', sid, 'pedidos', p.id), { cob: true, pg: true, vid: id, cpay: payLabel(v), upd: Date.now() });
    return b.commit().then(() => {
      const desc = {}; it.forEach((x) => { if (ctl(x.id)) desc[x.id] = r3((desc[x.id] || 0) + x.q); });
      Object.keys(desc).forEach((pid) => { if (desc[pid] > 0) updateDoc(doc(db, 'stores', sid, 'stock', pid), { q: increment(-desc[pid]) }).catch(() => {}); });
      if (S.caja) setDoc(doc(db, 'stores', sid, 'cajas', S.caja.id), { n: increment(1), v: increment(tot), p: payInc }, { merge: true }).catch(() => {});
      if (APP) apSumar(APP.id, APP.n, d, tot);
      return v;
    });
  }
  // Pedido del catálogo → venta en curso de la caja. Los precios salen del Stock de ahora (no del celular del cliente).
  function cargarPedido(p) {
    if (S.cart.length && !confirm('Hay una venta en curso en la caja. ¿La reemplazo por este pedido?')) return false;
    S.cart = []; S.env = null;
    (p.it || []).forEach((l) => {
      const pr = l.t ? null : prod(l.k), q = +l.q || 1;
      if (pr && pr.pn > 0) {
        if (pr.w) { S.cart.push({ id: pr.id, n: pr.n, q: r3(q), u: pr.pn, c: pr.c || 0, w: true }); return; }
        const G = limpiarOps(pr.op), x = G.length ? calcOps(G, selDe(l.o)) : { ok: true, extra: 0, txt: '' };
        if (x.ok) { const o = { id: pr.id, n: pr.n + (x.txt ? ' (' + x.txt + ')' : ''), q, u: pr.pn + x.extra, c: pr.c || 0, w: false }; if (G.length) o.op = 1; S.cart.push(o); return; }
        if (l.x && +l.u > 0) { S.cart.push({ id: pr.id, n: pr.n + ' (' + l.x + ')', q, u: Math.round(+l.u), c: pr.c || 0, w: false, op: 1 }); return; }   // pedido del mostrador: ya trae lo elegido
      }
      S.cart.push({ id: 'lib_' + uid(), n: (l.n || 'Producto') + (l.x ? ' (' + l.x + ')' : ''), q, u: Math.round(+l.u || 0), c: 0, w: false });
    });
    if (p.env > 0) S.cart.push({ id: 'lib_' + uid(), n: 'Envío a domicilio', q: 1, u: Math.round(p.env), c: 0, w: false });
    S.ped = p.id; S.last = ''; renderCart(); return true;
  }
  function renderHoy() {
    const e = $('cjhoy'); if (!e) return;
    let t = 0; S.hoy.forEach((v) => { t += v.tot || 0; });
    let h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>' + (adm() ? 'Ventas de hoy' : 'Tus ventas de hoy') + '</b><b>' + money(t) + '</b></div><div class="k">' + S.hoy.length + ' venta' + (S.hoy.length === 1 ? '' : 's') + '</div>';
    h += ventasHtml(S.hoy.slice(0, 15), adm());
    const tc = tkConfig();
    h += '<button class="x" data-al="tkcfg" style="margin-top:8px;font-size:14px">' + (tc.puesto ? (S.impErr ? '⚠️ Puesto de impresión sin conexión: reintentando… · configurar' : '🖥️ Puesto de impresión activo: imprime los tickets de los celulares · configurar') : tc.remoto ? '📱 Los tickets se imprimen en la compu · configurar' : '🧾 Tiketera: configurar e imprimir prueba') + '</button>';
    if (S.hoy.length > 15) h += '<div class="k" style="margin-top:8px">' + (adm() ? 'Ves todas en Resumen.' : 'Se muestran las últimas 15.') + '</div>';
    e.innerHTML = h + '</div>';
  }
  function ventasHtml(l, canDel) {
    return l.map((v) => '<div class="it"><div><b>' + money(v.tot) + '</b> <em class="tag">' + esc(payLabel(v)) + '</em>' + (v.cn ? '<span class="sku">' + esc(v.cn) + '</span>' : '') +
      '<small>' + (v.h || '') + (v.d !== X.today() ? ' · ' + dmy(v.d) : '') + ' · ' + (v.it || []).map((x) => esc(x.n) + (x.w ? ' ' + fq(x.q, 1) : (x.q !== 1 ? ' x' + n3(x.q) : ''))).join(', ') + (adm() && v.bn ? ' · ' + esc(v.bn) : '') + '</small></div>' +
      '<div style="display:flex;gap:4px;align-items:center;flex:none"><button class="x" data-al="tkv" data-id="' + esc(v.id) + '" aria-label="Imprimir ticket" title="Imprimir ticket" style="font-size:18px;text-decoration:none">🧾</button>' +
      (canDel ? '<button class="x" data-al="delv" data-id="' + esc(v.id) + '" aria-label="Anular venta">×</button>' : '') + '</div></div>').join('');
  }
  // ---------- Impresión desde el celu en la tiketera de la compu ----------
  // El celu (tiketera: "manda a la compu") deja el ticket en stores/{sid}/impresion; la compu marcada como
  // "puesto de impresión" lo recibe al instante, lo imprime y lo borra.
  function imprimir(t) {
    const c = tkConfig();
    if (!c.remoto || c.puesto) { imprimirTicket(t); return; }
    const sid = X.sid(), id = uid(), tk = Object.assign({}, t, { fecha: (t.fecha instanceof Date ? t.fecha : new Date()).getTime() });
    setDoc(doc(db, 'stores', sid, 'impresion', id), { tk: JSON.parse(JSON.stringify(tk)), at: Date.now(), by: X.user().uid, bn: X.nm() })
      .then(() => aviso('🖨️ Ticket enviado a la compu'))
      .catch((e) => { if (deny(e)) alert('Todavía no está activada la impresión desde el celu: falta publicar la regla "impresion" en Firebase (te la pasa Claude). Mientras, imprimí desde la compu con el botón 🧾 de la venta.'); else X.fail(e); });
  }
  function aviso(t) {
    const e = document.createElement('div'); e.textContent = t;
    e.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:80;background:#111;color:#fff;padding:11px 16px;border-radius:99px;font-weight:700;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.25)';
    document.body.appendChild(e); setTimeout(() => e.remove(), 2400);
  }
  let colaImp = [], imprimiendo = false;
  function sigImp() {
    if (imprimiendo || !colaImp.length) return; imprimiendo = true;
    const t = colaImp.shift(); try { imprimirTicket(t); } catch (e) { /* nada */ }
    setTimeout(() => { imprimiendo = false; sigImp(); }, 3000);   // de a uno: cada ticket usa la misma hoja oculta
  }
  function syncPuesto() {
    const quiere = !!tkConfig().puesto && !!X.sid();
    if (!quiere) { off('imp'); return; }
    if (un.imp) return;
    un.imp = onSnapshot(col('impresion'), (sn) => {
      sn.docChanges().forEach((ch) => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data() || {};
        deleteDoc(ch.doc.ref).catch(() => {});
        if (!d.tk || Math.abs(Date.now() - (d.at || 0)) > 15 * 60000) return;   // los viejos (la compu estaba apagada) no se imprimen
        aviso('🖨️ Imprimiendo ticket' + (d.bn ? ' de ' + d.bn : '') + '…');
        colaImp.push(Object.assign({}, d.tk, { fecha: new Date(d.tk.fecha || d.at) })); sigImp();
      });
      if (S.impErr) { S.impErr = false; renderHoy(); }
    }, () => {
      // Si falla (sin internet, o la regla de Firebase todavía no estaba publicada), se vuelve a intentar sola.
      S.impErr = true; off('imp'); renderHoy();
      clearTimeout(S.impT); S.impT = setTimeout(syncPuesto, 20000);
    });
  }
  // Ticket de una venta ya hecha (para reimprimir). Los combos van en una línea; el envío aparte.
  function ticketDeVenta(v) {
    const lineas = [], combos = {};
    (v.it || []).forEach((x) => {
      if (x.env) return;
      if (x.pr) { let c = combos[x.pr]; if (!c) { c = combos[x.pr] = { n: x.pr, q: 1, u: 0 }; lineas.push(c); } c.u += Math.round(x.q * x.u); return; }
      lineas.push({ n: x.n, q: x.q, u: x.u, w: !!x.w });
    });
    const env = (v.it || []).filter((x) => x.env).reduce((a, x) => a + Math.round(x.q * x.u), 0);
    const f = v.d ? new Date(v.d + 'T' + (/^\d{1,2}:\d{2}$/.test(v.h || '') ? ('0' + v.h).slice(-5) : '12:00') + ':00') : new Date();
    return { tienda: X.sname(), dir: (X.pub() || {}).addr || '', fecha: f, atendio: v.bn || '', cliente: v.cn || '', lineas, env, tot: v.tot, pago: payLabel(v) };
  }
  // Productos con control de stock (los marcados "sin control" no suben ni bajan con las ventas).
  function ctl(id) { const p = prod(id); return !!p && !p.ns; }
  function delVenta(id) {
    const v = S.hoy.concat(S.dayV || []).find((x) => String(x.id) === String(id)); if (!v) return;
    if (!confirm('¿Anular esta venta de ' + money(v.tot) + '? La mercadería vuelve al stock' + (v.fid ? ' y se descuenta del fiado de ' + v.cn : '') + (v.ap ? ' y de la cuenta de ' + (v.apn || 'la app') : '') + '.')) return;
    const sid = X.sid(), b = writeBatch(db), dd = v.d.slice(8, 10);
    b.delete(doc(db, 'stores', sid, 'ventas', String(v.id)));
    (v.it || []).forEach((x) => { if (ctl(x.id)) b.update(doc(db, 'stores', sid, 'stock', x.id), { q: increment(x.q) }); });
    const pp = partes(v), payDec = {}; Object.keys(pp).forEach((k) => { payDec[k] = increment(-pp[k]); });
    const prDec = {}; (v.it || []).forEach((x) => { if (!x.id) return; const o = prDec[x.id] || (prDec[x.id] = { q: 0, v: 0 }); o.q = r3(o.q + x.q); o.v += Math.round(x.q * x.u); });
    Object.keys(prDec).forEach((k) => { prDec[k] = { q: increment(-prDec[k].q), v: increment(-prDec[k].v) }; });
    b.set(doc(db, 'stores', sid, 'totales', v.m || v.d.slice(0, 7)), { v: increment(-v.tot), c: increment(-(v.cost || 0)), n: increment(-1), pay: payDec, pr: prDec, dias: { [dd]: { v: increment(-v.tot), c: increment(-(v.cost || 0)), n: increment(-1) } } }, { merge: true });
    if (v.cj && S.caja && S.caja.id === v.cj) setDoc(doc(db, 'stores', sid, 'cajas', v.cj), { n: increment(-1), v: increment(-v.tot), p: payDec,
      mv: { [uid()]: { t: 'b', a: Math.round(v.tot || 0), pay: v.pay || 'ef', r: ((v.it || []).map((x) => x.n).join(', ') + (v.h ? ' (de las ' + v.h + ')' : '')).slice(0, 80), h: now(), bn: X.nm() } } }, { merge: true }).catch(() => {});
    if (v.fid) { b.delete(doc(db, 'stores', sid, 'fiado', v.fid)); if (cli(v.cli)) b.update(doc(db, 'stores', sid, 'clientes', v.cli), { s: increment(-v.tot) }); }
    if (v.ap) apSumar(v.ap, v.apn, v.d, -(v.tot || 0));
    b.commit().then(() => { if (S.dayV) { S.dayV = S.dayV.filter((x) => x.id !== v.id); if (X.tab() === 'res') drawRes(); } }).catch(failW);
  }

  // =====================================================================
  // FIADO / LIBRETA
  // =====================================================================
  function drawFiado() {
    const box = $('s-fia');
    if (S.clErr) { box.innerHTML = rulesCard(); return; }
    if (S.sel) { if (!cli(S.sel)) { S.sel = null; off('fmov'); } else { drawCliente(); return; } }
    if (!$('fiq')) {
      box.innerHTML = '<div class="card hero"><div class="k">Total que te deben</div><div class="big" id="fitot"></div><div class="k" id="ficnt"></div></div>' +
        '<input id="fiq" type="search" placeholder="Buscar cliente" autocomplete="off" value="' + esc(S.fq) + '" style="margin-bottom:12px">' +
        '<div class="row" style="gap:8px;margin:0 0 14px"><button class="go alt" data-al="newcli" style="margin:0">+ Cliente nuevo</button>' + (adm() && X.canWrite() ? '<button class="go alt" data-al="impcli" style="margin:0">📥 Importar de Excel</button>' : '') + '</div><div id="filist"></div>';
      $('fiq').oninput = function () { S.fq = this.value; renderFiList(); };
    }
    renderFiList();
  }
  function renderFiList() {
    let t = 0, n = 0; S.cl.forEach((c) => { if (c.s > 0) { t += c.s; n++; } });
    $('fitot').textContent = money(t); $('ficnt').textContent = n + ' cliente' + (n === 1 ? '' : 's') + ' con deuda';
    // Alerta solo cuando pasó un mes (30 días) sin pagar: desde el último pago o, si nunca pagó, desde que empezó a deber.
    const hoy0 = new Date(X.today() + 'T00:00:00').getTime();
    const sinPagar = (c) => { if (!(c.s > 0)) return 0; const ref = c.up || c.fd || (c.u ? new Date(c.u).toISOString().slice(0, 10) : ''); if (!ref) return 0; const d = Math.floor((hoy0 - new Date(ref + 'T00:00:00').getTime()) / 86400000); return d >= 30 ? d : 0; };
    const atr = S.cl.filter((c) => sinPagar(c)).sort((a, b) => sinPagar(b) - sinPagar(a));
    const l = S.cl.filter((c) => match(c.n + ' ' + c.tel, S.fq) && (!S.fAtr || sinPagar(c))).sort((a, b) => a.n.localeCompare(b.n, 'es', { sensitivity: 'base' }));
    $('filist').innerHTML = (atr.length ? '<div class="bn warn" style="margin:0 0 12px"><b>⚠️ ' + (atr.length === 1 ? '1 cliente lleva' : atr.length + ' clientes llevan') + ' más de un mes sin pagar</b><div style="margin:4px 0 8px;font-size:14px">' + esc(atr.slice(0, 4).map((c) => c.n).join(', ')) + (atr.length > 4 ? ' y ' + (atr.length - 4) + ' más' : '') + '</div>' +
      '<button class="x" data-al="fatr" style="font-size:14px;font-weight:700;text-decoration:underline">' + (S.fAtr ? 'Ver todos los clientes' : 'Ver solo esos') + '</button></div>' : '') +
      '<div class="card">' + (l.length ? l.map((c) => { const dsp = sinPagar(c); return '<button class="pl" data-al="opencli" data-id="' + esc(c.id) + '"><span><b>' + esc(c.n) + '</b>' + (dsp ? '<span class="fch no">⚠️ Hace ' + dsp + ' días que no paga</span>' : '') + '<small>' + (c.tel ? esc(c.tel) + ' · ' : '') + (c.up ? 'último pago ' + c.up.split('-').reverse().slice(0, 2).join('/') : c.u ? 'último movimiento ' + new Date(c.u).toLocaleDateString('es-AR') : 'sin movimientos') + '</small></span><b class="' + (c.s > 0 ? 'neg' : 'pos') + '">' + (c.s > 0 ? money(c.s) : (c.s < 0 ? 'a favor ' + money(-c.s) : 'al día')) + '</b></button>'; }).join('') :
      '<div class="empty">' + (S.cl.length ? 'No encontré ese cliente.' : 'Todavía no anotaste clientes. Se crean acá o al cobrar con Fiado.') + '</div>') + '</div>';
  }
  function openCli(id) {
    S.sel = id; S.fmov = null; off('fmov');
    un.fmov = onSnapshot(query(col('fiado'), where('cid', '==', id)), (sn) => { S.fmov = []; sn.forEach((d) => S.fmov.push(d.data())); S.fmov.sort((a, b) => String(b.id).localeCompare(String(a.id))); if (X.tab() === 'fia' && S.sel === id) drawCliente(); }, (e) => { S.fmov = []; if (deny(e)) S.clErr = true; redraw(); });
    $('s-fia').innerHTML = ''; drawCliente(); window.scrollTo(0, 0);
  }
  function closeCli() { S.sel = null; S.fmov = null; off('fmov'); $('s-fia').innerHTML = ''; drawFiado(); }
  function drawCliente() {
    const c = cli(S.sel); if (!c) return;
    let h = '<button class="x" data-al="closecli" style="font-size:14px;text-decoration:underline;margin-bottom:10px">← Todos los clientes</button>' +
      '<div class="card hero"><b style="font-size:20px">' + esc(c.n) + '</b>' + (c.tel ? '<div class="k">' + esc(c.tel) + '</div>' : '') +
      '<div class="big ' + (c.s > 0 ? 'neg' : 'pos') + '">' + money(Math.abs(c.s)) + '</div><div class="k">' + (c.s > 0 ? 'Debe' : c.s < 0 ? 'Saldo a favor' : 'Está al día') + '</div></div>' +
      '<div class="row" style="gap:8px"><button class="go" data-al="pago" style="margin-top:0">Registrar pago</button><button class="go alt" data-al="deuda" style="margin-top:0">Anotar deuda</button></div>' +
      (c.tel && c.s > 0 ? '<button class="go alt" data-al="wa">Recordarle por WhatsApp</button>' : '') +
      '<div class="card" style="margin-top:14px"><b>Movimientos</b>';
    if (!S.fmov) h += '<div class="empty">Cargando…</div>';
    else if (!S.fmov.length) h += '<div class="empty">Sin movimientos todavía.</div>';
    else h += S.fmov.map((f) => '<div class="it"><div><b>' + (f.t === 'p' ? 'Pagó' + (f.pay ? ' · ' + (PAY[f.pay] || '') : '') : (f.vid ? 'Compró' : 'Deuda anotada')) + '</b><small>' + dmy(f.d) + (f.det ? ' · ' + esc(f.det) : '') + (f.bn ? ' · ' + esc(f.bn) : '') + '</small></div><div class="amt"><b class="' + (f.t === 'p' ? 'pos' : 'neg') + '">' + (f.t === 'p' ? '−' : '+') + money(f.a) + '</b></div>' +
      (adm() && !f.vid ? '<button class="x" data-al="delf" data-id="' + esc(f.id) + '" aria-label="Borrar">×</button>' : '') + '</div>').join('');
    h += '</div>' + (adm() ? '<div class="row" style="gap:8px"><button class="go alt" data-al="editcli">Editar datos</button>' + (c.s === 0 ? '<button class="go alt" data-al="delcli" style="color:var(--buy)">Borrar cliente</button>' : '') + '</div>' : '');
    $('s-fia').innerHTML = h;
  }
  function cliDlg(c, pick) {
    const o = modal('<b style="font-size:19px">' + (c ? 'Editar cliente' : 'Cliente nuevo') + '</b><label>Nombre</label><input id="cn" autocomplete="off" maxlength="60" value="' + esc(c ? c.n : '') + '" placeholder="Ej: Doña Rosa (casa verde)">' +
      '<label>WhatsApp (opcional, con código de área)</label><input id="ct" inputmode="tel" autocomplete="off" maxlength="20" value="' + esc(c ? c.tel : '') + '" placeholder="Ej: 3815551234">' +
      '<button class="go" id="cok">Guardar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    setTimeout(() => o.querySelector('#cn').focus(), 50);
    o.querySelector('#cok').onclick = () => {
      const n = o.querySelector('#cn').value.trim(), tel = o.querySelector('#ct').value.replace(/[^\d]/g, '');
      if (!n) { alert('Escribí el nombre.'); return; }
      if (!c && S.cl.some((x) => x.n.toLowerCase() === n.toLowerCase()) && !confirm('Ya hay un cliente "' + n + '". ¿Crear otro igual?')) return;
      const id = c ? c.id : 'c' + X.rnd(11);
      setDoc(ref('clientes', id), c ? { n, tel } : { n, tel, s: 0, u: 0 }, { merge: true }).catch(failW);
      if (!c) S.cl.push({ id, n, tel, s: 0, u: 0 });
      o.remove();
      if (pick) { S.cli = id; renderCart(); } else if (!c) openCli(id); else redraw();
    };
  }
  function movDlg(kind) {
    const c = cli(S.sel); if (!c) return;
    const isP = kind === 'p';
    const o = modal('<b style="font-size:19px">' + (isP ? 'Pago de ' : 'Anotar deuda a ') + esc(c.n) + '</b>' + (isP ? '' : '<div class="k" style="margin-top:4px">Para pasar deudas de la libreta de papel o algo que no está en el sistema. Las compras con productos se anotan solas al cobrar con Fiado en la Caja.</div>') +
      '<label>Monto</label><input id="ma" type="number" inputmode="decimal" min="0" placeholder="0"' + (isP && c.s > 0 ? ' value="' + c.s + '"' : '') + '>' +
      (isP ? '<label>Forma de pago</label><select id="mp"><option value="ef">Efectivo</option><option value="tr">Transferencia</option><option value="tj">Tarjeta</option><option value="qr">QR / Mercado Pago</option></select>' : '<label>Detalle</label><input id="md" maxlength="120" autocomplete="off" placeholder="Ej: Deuda de la libreta">') +
      '<label>Fecha</label><input id="mf" type="date" value="' + X.today() + '">' +
      '<button class="go" id="mok">Guardar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelector('#mok').onclick = () => {
      const a = Math.round(+o.querySelector('#ma').value), d = o.querySelector('#mf').value || X.today();
      if (!(a > 0)) { alert('Escribí el monto.'); return; }
      const id = uid(), sid = X.sid(), u = X.user(), b = writeBatch(db);
      const f = { id, cid: c.id, t: isP ? 'p' : 'f', a, d, m: d.slice(0, 7), by: u.uid, bn: X.nm() };
      if (isP) f.pay = o.querySelector('#mp').value; else f.det = o.querySelector('#md').value.trim().slice(0, 120) || 'Deuda anotada';
      if (isP && S.caja && d === X.today()) f.cj = S.caja.id;
      b.set(doc(db, 'stores', sid, 'fiado', id), f);
      b.update(doc(db, 'stores', sid, 'clientes', c.id), Object.assign({ s: increment(isP ? -a : a), u: Date.now() }, isP && !(c.up > d) ? { up: d } : {}, !isP && c.s <= 0 ? { fd: d } : {}));
      if (isP) b.set(doc(db, 'stores', sid, 'totales', f.m), { cob: increment(a), cobp: { [f.pay]: increment(a) } }, { merge: true });
      if (f.cj) setDoc(doc(db, 'stores', sid, 'cajas', f.cj), { c: { [f.pay]: increment(a) } }, { merge: true }).catch(() => {});
      b.commit().catch(failW);
      o.remove();
    };
    setTimeout(() => o.querySelector('#ma').focus(), 50);
  }
  function delFiado(id) {
    const f = (S.fmov || []).find((x) => x.id === id); if (!f || f.vid) return;
    if (!confirm('¿Borrar este movimiento de ' + money(f.a) + '? El saldo se corrige solo.')) return;
    const sid = X.sid(), b = writeBatch(db);
    b.delete(doc(db, 'stores', sid, 'fiado', id));
    b.update(doc(db, 'stores', sid, 'clientes', f.cid), { s: increment(f.t === 'p' ? f.a : -f.a) });
    if (f.t === 'p') b.set(doc(db, 'stores', sid, 'totales', f.m), { cob: increment(-f.a), cobp: { [f.pay || 'ef']: increment(-f.a) } }, { merge: true });
    if (f.t === 'p' && f.cj && S.caja && S.caja.id === f.cj) setDoc(doc(db, 'stores', sid, 'cajas', f.cj), { c: { [f.pay || 'ef']: increment(-f.a) },
      mv: { [uid()]: { t: 'bc', a: Math.round(f.a || 0), pay: f.pay || 'ef', r: 'Cobro de fiado', h: now(), bn: X.nm() } } }, { merge: true }).catch(() => {});
    b.commit().catch(failW);
  }
  function waMsg() {
    const c = cli(S.sel); if (!c || !c.tel) return;
    let tel = c.tel.replace(/\D/g, ''); if (tel.length <= 11 && tel.indexOf('54') !== 0) tel = '549' + tel.replace(/^0/, '').replace(/^15/, '');
    const msg = 'Hola ' + c.n + ', te escribo de ' + X.sname() + '. Te recuerdo que tu saldo en la libreta es de ' + money(c.s) + '. ¡Gracias!';
    window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), '_blank');
  }

  // =====================================================================
  // STOCK (productos, reposición, aumento de precios)
  // =====================================================================
  function drawStock() {
    const box = $('s-stk');
    if (S.edit || S.repo || S.imp || S.qk) return; // hay un formulario abierto: no lo pisamos
    if (!$('aq')) {
      box.innerHTML = (load() ? '<div class="row" style="gap:8px;margin-bottom:6px"><button class="go" data-al="newp" style="margin-top:0">+ Producto</button><button class="go alt" data-al="repo" style="margin-top:0">Reponer</button></div>' + herrStock() : '') +
        '<div style="display:flex;gap:8px;align-items:center"><input id="aq" type="search" placeholder="Buscar producto o código" autocomplete="off" style="flex:1;min-width:0" value="' + esc(S.stQ) + '">' + scanButton('scanstk') + '</div><div class="r1w" style="margin:10px 0 12px"><button type="button" class="r1a l" data-r1="-1" aria-label="Ver categorías anteriores">‹</button><div id="acats" class="chips r1"></div><button type="button" class="r1a r" data-r1="1" aria-label="Ver más categorías">›</button></div><div id="abody"></div>';
      // Al buscar o escanear, se busca en TODOS los productos: si quedaba elegida una categoría o "Por reponer",
      // un producto de otra categoría parecía "no cargado" (pasaba con la pistola lectora en la compu).
      $('aq').oninput = function () { S.stQ = this.value; if (S.stQ.trim() && (S.stCat || S.stLow)) { S.stCat = ''; S.stLow = false; } renderStock(); };
    }
    renderStock();
  }
  // Herramientas de Stock en cuadraditos: ícono + nombre corto; al pasar el mouse explica qué hace.
  const ICS = {
    qk: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10.5 8v8M14 8v8M17 8v8"/>',
    imp: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3"/>',
    precios: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    mvcat: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 13h6M13 11l2 2-2 2"/>',
    xstk: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14l3 3 3-3"/>',
    sueltos: '<path d="M7 3h10v3H7z"/><path d="M6 6h12l-1 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9z"/><path d="M9 13h6M9 16h4"/>',
    baldlg: '<path d="M12 4v16M8 20h8M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>'
  };
  function herrStock() {
    if (!document.getElementById('hstcss')) {
      const st = document.createElement('style'); st.id = 'hstcss';
      st.textContent = '.hst{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:8px;margin:10px 0 14px}' +
        '.hst button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:76px;padding:10px 4px;border:1.5px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink);font:inherit;font-size:12.5px;font-weight:700;line-height:1.15;text-align:center;cursor:pointer;transition:transform .12s,border-color .12s}' +
        '.hst button svg{width:24px;height:24px;flex:none}.hst button:active{transform:scale(.96)}.hst .dot{position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;background:#2fb34a}' +
        '@media(hover:hover){.hst button:hover{border-color:var(--btn)}.hst button[data-tip]:hover::after{content:attr(data-tip);position:absolute;left:50%;top:calc(100% + 6px);transform:translateX(-50%);width:max-content;max-width:220px;padding:8px 10px;border-radius:10px;background:#111;color:#fff;font-size:12.5px;font-weight:500;line-height:1.3;z-index:5;box-shadow:0 6px 18px rgba(0,0,0,.25);pointer-events:none;white-space:normal}.hst button:nth-child(3n+1)[data-tip]:hover::after{left:0;transform:none}.hst button:nth-child(3n)[data-tip]:hover::after{left:auto;right:0;transform:none}}';
      document.head.appendChild(st);
    }
    const bal = cfgBal() && cfgBal().on;
    const t = [['qk', 'Carga rápida', 'Cargá o sumá stock escaneando los códigos de barras uno tras otro'], ['imp', 'Importar Excel', 'Subí una planilla de Excel con tus productos y precios'], ['sueltos', 'Sueltos', 'Agregá de una lista los productos sueltos (frutos secos, cereales, semillas, golosinas…) sin escribirlos']];
    if (adm()) t.push(['precios', 'Precios por\u00a0%', 'Subí o bajá los precios de varios productos con un porcentaje'], ['mvcat', 'Categorías', 'Pasá varios productos juntos a otra categoría'],
      ['xstk', 'Descargar Excel', 'Bajá todo tu stock en una planilla de Excel'], ['baldlg', 'Balanza', 'Balanza con etiquetas de código de barras' + (bal ? ' (activa)' : '')]);
    return '<div class="hst">' + t.map((x) => '<button type="button" data-al="' + x[0] + '" data-tip="' + esc(x[2]) + '" aria-label="' + esc(x[1] + ': ' + x[2]) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICS[x[0]] + '</svg>' + esc(x[1]) +
      (x[0] === 'baldlg' && bal ? '<span class="dot"></span>' : '') + '</button>').join('') + '</div>';
  }
  function avisoOff(k) { try { return localStorage.getItem('pk_av_' + k + '_' + X.sid()) === '1'; } catch (e) { return false; } }
  function renderStock() {
    if (P().length) syncFotosBase();
    const isLow = (p) => !p.ns && p.q <= (p.min || 0) && (p.min || p.q <= 0);
    const all = P(), low = all.filter(isLow).length, sinCod = all.filter((p) => !p.s).length;
    if (!sinCod) S.stNoCod = false;
    $('acats').innerHTML = '<button class="ch' + (!S.stCat && !S.stLow ? ' on' : '') + '" data-al="scat" data-v="">Todos (' + all.length + ')</button>' +
      '<button class="ch' + (S.stLow ? ' on' : '') + '" data-al="slow">Por reponer (' + low + ')</button>' +
      (load() && sinCod ? '<button class="ch' + (S.stNoCod ? ' on' : '') + '" data-al="snocod">Sin código (' + sinCod + ')</button>' : '') +
      usedCats().map((c) => '<button class="ch' + (S.stCat === c ? ' on' : '') + '" data-al="scat" data-v="' + esc(c) + '">' + esc(c) + '</button>').join('');
    filaFin($('acats'));
    const l = all.filter((p) => (!S.stNoCod || !p.s) && (!S.stCat || p.cat === S.stCat) && (!S.stLow || isLow(p)) && (match(p.n + ' ' + p.s + ' ' + p.cat, S.stQ) || (S.stQ.trim() && findByCode([p], S.stQ)))).sort((a, b) => a.n.localeCompare(b.n));
    let val = 0; all.forEach((p) => { if (!p.ns) val += Math.max(p.q, 0) * (p.c || 0); });
    let h = adm() ? '<div class="k" style="margin:0 4px 10px">' + all.length + ' productos · mercadería en stock (a costo): <b>' + money(val) + '</b> · <button class="x" data-al="stval" style="font-size:13px;font-weight:700;text-decoration:underline;color:var(--ink)">¿Qué suma más?</button></div>' : '';
    h += '<div class="card">';
    if (S.stNoCod && l.length) h += '<div class="k" style="margin-bottom:6px">Tocá "Escanear código" en cada producto y pasale la cámara por el código de barras. También podés escanear desde el buscador: si el código no existe, te deja elegir a qué producto asignarlo.</div>';
    const own = X.isOwner && X.isOwner() && adm();
    if (own && !all.length) h += '<div class="bn" style="margin:0 0 12px"><b>✨ Demo para mostrar</b><div style="margin:4px 0 10px;font-size:14px">Llená esta tienda con productos de ejemplo, fotos, destacados y el catálogo listo. Solo lo ves vos (dueño de Pekeron).</div><button class="go" data-al="demo" style="margin:0">Cargar demo</button></div>';
    // Aviso: productos ya cargados (ej. en Almacén) que van en Desayuno y merienda.
    const avDes = adm() && !S.stQ && !avisoOff('des') ? porPalabras(ATAJOS['Desayuno y merienda'], 'Desayuno y merienda') : [];
    if (avDes.length) h += '<div class="bn" style="margin:0 0 12px"><b>☕ ' + (avDes.length === 1 ? '1 producto parece' : avDes.length + ' productos parecen') + ' de Desayuno y merienda</b>' +
      '<div style="margin:4px 0 10px;font-size:14px">' + esc(avDes.slice(0, 4).map((p) => p.n).join(', ')) + (avDes.length > 4 ? ' y ' + (avDes.length - 4) + ' más' : '') + '. Pasalos todos juntos a esa categoría (antes podés destildar los que no van).</div>' +
      '<div class="row" style="gap:8px"><button class="go" data-al="mvdes" style="margin:0">Revisar y pasar</button><button class="go alt" data-al="avoff" data-v="des" style="margin:0;width:auto;padding:0 16px">Ahora no</button></div></div>';
    if (own && all.some((p) => p.demo)) h += '<button class="x" data-al="demodel" style="font-size:13px;text-decoration:underline;margin:0 4px 10px;color:#b3261e">Borrar los productos de ejemplo</button>';
    if (!l.length) h += '<div class="empty">' + (all.length ? 'No hay productos en esta vista.' : (load() ? 'Cargá tu primer producto con "+ Producto".' : 'Todavía no hay productos cargados.')) + '</div>';
    const shown = l.slice(0, 300);
    shown.forEach((p) => {
      const lw = isLow(p), mg = p.pn && p.c ? Math.round((p.pn - p.c) / p.pn * 100) : null;
      h += '<div class="it"><div>' + (p.img ? '<img src="' + p.img + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:10px;float:left;margin:0 10px 4px 0">' : '') + '<b>' + esc(p.n) + '</b>' + (p.s ? '<span class="sku">' + esc(p.s) + '</span>' : '') +
        '<small>' + (p.cat ? '<em class="tag">' + esc(p.cat) + '</em>' : '') + priceTxt(p) + (adm() && p.c ? ' · costo ' + money(p.c) + (p.ce ? ' (estimado)' : '') + (mg != null ? ' · margen ' + mg + '%' : '') : '') + '</small>' +
        (load() ? '<button class="x" data-al="editp" data-id="' + esc(p.id) + '" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin-top:4px">Editar</button>' : '') +
        (load() ? '<button class="x" data-al="ig" data-id="' + esc(p.id) + '" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin:4px 0 0 14px">📸 Instagram</button><button class="x" data-al="igwa" data-id="' + esc(p.id) + '" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin:4px 0 0 14px">🟢 Estado</button>' : '') +
        (load() && S.stNoCod ? '<button class="x" data-al="asigcod" data-id="' + esc(p.id) + '" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin:4px 0 0 14px">Escanear código</button>' : '') + '</div>' +
        (p.ns ? '<div class="amt"><b>—</b><small>sin control</small></div></div>' : '<div class="amt"><b class="' + (p.q < 0 ? 'neg' : lw ? 'neg' : '') + '">' + fq(p.q, p.w) + '</b><small>' + (lw ? 'reponer' : 'en stock') + '</small></div></div>');
    });
    if (l.length > shown.length) h += '<div class="k" style="margin-top:8px">Mostrando 300 de ' + l.length + '. Buscá para encontrar el resto.</div>';
    $('abody').innerHTML = h + '</div>';
  }
  function closeForms() { qkStop(); S.edit = null; S.repo = null; S.imp = null; S.qk = null; $('s-stk').innerHTML = ''; drawStock(); }

  function prodForm(id, code) {
    const p = id ? prod(id) : null;
    if (id && !p) return;
    S.edit = { id: id || null, img: undefined };
    const c = p || { n: '', s: code || '', cat: S.stCat || '', w: false, pn: '', c: '', q: '', min: '' };
    const catOpts = catOptions(c.cat || '');
    let h = '<button class="x" data-al="cancel" style="font-size:14px;text-decoration:underline;margin-bottom:10px">← Volver al stock</button><div class="card"><b style="font-size:19px">' + (p ? 'Editar producto' : 'Producto nuevo') + '</b>' +
      '<label>Nombre</label><input id="fn" autocomplete="off" maxlength="80" placeholder="Ej: Coca-Cola 2,25 L" value="' + esc(c.n) + '">' +
      '<label>Código de barras o código propio (opcional)</label><div style="display:flex;gap:8px;align-items:center"><input id="fs" autocomplete="off" maxlength="40" placeholder="Ej: 7790895000997" style="flex:1;min-width:0" value="' + esc(c.s) + '">' + scanButton('scanfs') + '</div>' +
      (cfgBal() && cfgBal().on ? '<div class="k" style="margin-top:4px">⚖️ Si se pesa en la balanza, poné acá su número de producto en la balanza (PLU), por ejemplo 123.</div>' : '') +
      '<label>Categoría</label><select id="fc"><option value="">Sin categoría</option>' + catOpts + '</select>' +
      '<label>Descripción para el catálogo (opcional)</label><textarea id="fdsc" maxlength="160" rows="2" placeholder="Ej: Dulce de leche clásico, pote de 200 g." style="width:100%;padding:14px 16px;border:0;border-radius:14px;background-color:var(--line);color:var(--ink);font:inherit;font-weight:600;outline:none;resize:vertical">' + esc(c.d || '') + '</textarea>' +
      '<label>¿Cómo se vende?</label><div class="seg"><button class="pay' + (!c.w ? ' on' : '') + '" data-al="fw" data-v="0">Por unidad</button><button class="pay' + (c.w ? ' on' : '') + '" data-al="fw" data-v="1">Por peso (kg)</button></div>' +
      '<div class="row"><div><label id="lpn">Precio de venta</label><input id="fpn" type="number" inputmode="decimal" min="0" placeholder="0" value="' + (c.pn || '') + '"></div><div><label id="lco">Costo</label><input id="fco" type="number" inputmode="decimal" min="0" placeholder="0" value="' + (c.c || '') + '"></div></div><div class="tot" id="fmg"></div>' +
      '<div id="fopw"' + (c.w ? ' hidden' : '') + '><label>Opciones para elegir (opcional)</label><div class="k" style="margin:0 0 6px">Tamaños, punto de la carne, "sin cebolla", extras con precio, gustos… El cliente las elige en el catálogo y vos en la caja. El precio de cada opción se suma al precio de venta.</div><div id="fops"></div></div>' +
      '<label style="display:flex;gap:10px;align-items:flex-start;margin-top:14px;font-weight:600"><input id="fns" type="checkbox" style="width:auto;margin-top:3px"' + (c.ns ? ' checked' : '') + '><span>Sin control de stock (siempre disponible)<small style="display:block;font-weight:400;color:var(--mut);margin-top:2px">Para fiambres, quesos o cosas que también usás para preparar (sánguches, pizzas) y no sabés cuánto hay. Se vende igual y aparece siempre en el catálogo.</small></span></label>' +
      '<div id="fqrow"' + (c.ns ? ' hidden' : '') + '><div class="row"><div><label id="lq">' + (p ? 'Stock actual (contado)' : 'Stock inicial') + '</label><input id="fq" type="text" inputmode="decimal" placeholder="0" autocomplete="off" value="' + (p ? n3(c.q) : '') + '"></div><div><label>Avisar cuando quede (opcional)</label><input id="fmin" type="text" inputmode="decimal" placeholder="Ej: 3" autocomplete="off" value="' + (c.min ? n3(c.min) : '') + '"></div></div>' +
      (p ? '<div class="k" style="margin-top:6px">Si contás la mercadería y no coincide, corregí el stock acá. Para cargar mercadería que compraste usá Reponer (así se calcula bien el costo).</div>' : '') + '</div>' +
      (c.img && !c.hd ? '<div class="bn warn" style="margin:14px 0 0;font-size:13px">Esta foto se subió con la versión anterior y se ve en baja calidad. Volvé a elegirla para que se vea nítida en el catálogo.</div>' : '') + '<label style="margin-top:14px">Foto (opcional)</label><div style="display:flex;gap:12px;align-items:center"><img id="fph" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:12px;' + (c.img ? '' : 'display:none') + '" src="' + (c.img || '') + '"><input id="fpf" type="file" accept="image/*" style="flex:1"></div>' +
      (X.fotosOn && X.fotosOn() ? '<button class="x" data-al="pxp" style="display:block;font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin-top:8px">🖼️ Buscar foto publicitaria</button>' : '') +
      '<label>Precio anterior (opcional)</label><input id="fpa" type="number" inputmode="decimal" min="0" placeholder="Ej: 2200" value="' + (c.pa || '') + '"><div class="k" style="margin-top:6px">Se muestra tachado en el catálogo, con el % de descuento. Tiene que ser mayor que el precio de venta.</div>' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:14px;font-weight:600"><input id="fdt" type="checkbox" style="width:auto"' + (c.dt ? ' checked' : '') + '> ⭐ Destacar en el catálogo (sale arriba, en el carrusel)</label>' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:14px;font-weight:600"><input id="foh" type="checkbox" style="width:auto"' + (c.oh ? ' checked' : '') + '> No mostrar en el catálogo</label>' +
      '<button class="go" data-al="savep">Guardar</button>' + (p && adm() ? '<button class="x" data-al="delp" style="display:block;margin:18px auto 0;font-size:14px;text-decoration:underline;color:#b3261e">Eliminar este producto</button>' : '') + '</div>';
    $('s-stk').innerHTML = h;
    S.edit.w = !!c.w; S.edit.op = limpiarOps(c.op); opsDraw();
    $('fops').onclick = opsClick; $('fops').onchange = (e) => { if (e.target.classList.contains('opm')) { opsRead(); opsDraw(); } };
    const mg = () => { const pn = +$('fpn').value, co = +$('fco').value; $('fmg').textContent = pn > 0 && co > 0 ? 'Ganás ' + money(pn - co) + (S.edit.w ? ' por kilo' : ' por unidad') + ' (' + Math.round((pn - co) / pn * 100) + '% del precio)' : ''; };
    const lbl = () => { $('lpn').textContent = S.edit.w ? 'Precio de venta por kilo' : 'Precio de venta'; $('lco').textContent = S.edit.w ? 'Costo por kilo' : 'Costo por unidad'; $('lq').textContent = (p ? 'Stock actual (contado)' : 'Stock inicial') + (S.edit.w ? ' en kg' : ''); $('fopw').hidden = S.edit.w; };
    $('fpn').oninput = mg; $('fco').oninput = mg; mg(); lbl(); S.edit.lbl = () => { lbl(); mg(); };
    $('fns').onchange = function () { $('fqrow').hidden = this.checked; };
    $('fpf').onchange = function () { const f = this.files && this.files[0]; if (!f) return; X.readPhoto(f, (o, hd, qs) => { if (!o) { alert('No pude leer esa foto. Probá con otra.'); return; } S.edit.img = o; S.edit.hd = hd || ''; S.edit.qs = qs || 0; const v = $('fph'); v.src = o; v.style.display = ''; }); };
    window.scrollTo(0, 0);
    if (!p) setTimeout(() => $('fn').focus(), 50);
  }
  // ---------- Opciones del producto (editor del Stock): grupos con sus opciones y lo que suma cada una ----------
  // modo del grupo: '1' = elegir 1 obligatorio, '0' = elegir 1 opcional, 'n' = puede elegir varias
  const opsModo = (g) => (g.max > 1 ? 'n' : g.min ? '1' : '0');
  function opsRead() {
    const E = S.edit, box = $('fops'); if (!E || !box) return;
    E.op = Array.from(box.querySelectorAll('.opsg')).map((gd) => {
      const o = Array.from(gd.querySelectorAll('.opsr')).map((r) => ({ n: r.querySelector('.opn').value.replace(/\s+/g, ' ').trim().slice(0, 40), p: Math.max(0, Math.round(+r.querySelector('.opp').value || 0)) }));
      const m = gd.querySelector('.opm').value;
      return { t: gd.querySelector('.opt').value.replace(/\s+/g, ' ').trim().slice(0, 30), min: m === '1' ? 1 : 0, max: m === 'n' ? Math.max(1, o.length) : 1, o };
    });
  }
  function opsDraw() {
    const E = S.edit, box = $('fops'); if (!E || !box) return;
    const G = E.op || [];
    let h = G.map((g, gi) => '<div class="opsg" style="background:var(--bg);border-radius:16px;padding:12px;margin-top:8px">' +
      '<div style="display:flex;gap:8px;align-items:center"><input class="opt" maxlength="30" placeholder="Nombre del grupo (ej: Tamaño)" value="' + esc(g.t) + '" style="flex:1;min-width:0;margin:0;font-weight:800"><button type="button" class="x" data-op="gdel" data-g="' + gi + '" style="font-size:13px;text-decoration:underline;color:#b3261e">Quitar</button></div>' +
      '<select class="opm" style="margin-top:8px">' + [['1', 'Tiene que elegir 1'], ['0', 'Puede elegir 1 (opcional)'], ['n', 'Puede elegir varias']].map((x) => '<option value="' + x[0] + '"' + (opsModo(g) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>' +
      g.o.map((x, oi) => '<div class="opsr" style="display:flex;gap:6px;align-items:center;margin-top:6px"><input class="opn" maxlength="40" placeholder="Opción (ej: Doble)" value="' + esc(x.n) + '" style="flex:1;min-width:0;margin:0"><span style="font-weight:700;color:var(--mut)">+$</span><input class="opp" type="number" inputmode="numeric" min="0" placeholder="0" value="' + (x.p || '') + '" style="width:92px;margin:0"><button type="button" class="qb" data-op="odel" data-g="' + gi + '" data-o="' + oi + '" aria-label="Quitar opción" style="flex:none">×</button></div>').join('') +
      (g.o.length < MAX_OPCIONES ? '<button type="button" class="x" data-op="oadd" data-g="' + gi + '" style="display:block;margin-top:8px;font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink)">+ Agregar opción</button>' : '') + '</div>').join('');
    if (G.length < MAX_GRUPOS) h += '<div class="k" style="margin:10px 0 0">' + (G.length ? 'Agregar otro grupo:' : 'Agregar un grupo:') + '</div><div class="chips" style="margin-top:6px">' + MODELOS_OPS.map((m, i) => '<button type="button" class="ch" data-op="mod" data-i="' + i + '">+ ' + esc(m[0]) + '</button>').join('') + '<button type="button" class="ch" data-op="gadd">+ Otro</button></div>';
    box.innerHTML = h;
  }
  function opsClick(e) {
    const b = e.target.closest('[data-op]'); if (!b) return; e.preventDefault(); opsRead();
    const E = S.edit, a = b.dataset.op, gi = +b.dataset.g;
    if (a === 'mod') E.op.push(JSON.parse(JSON.stringify(MODELOS_OPS[+b.dataset.i][1])));
    else if (a === 'gadd') E.op.push({ t: '', min: 0, max: 1, o: [{ n: '', p: 0 }] });
    else if (a === 'gdel') E.op.splice(gi, 1);
    else if (a === 'oadd') { const g = E.op[gi]; g.o.push({ n: '', p: 0 }); if (g.max > 1) g.max = g.o.length; }
    else if (a === 'odel') { const g = E.op[gi]; g.o.splice(+b.dataset.o, 1); if (!g.o.length) E.op.splice(gi, 1); else if (g.max > 1) g.max = g.o.length; }
    opsDraw();
    if (a === 'mod' || a === 'gadd' || a === 'oadd') { const gs = $('fops').querySelectorAll('.opsg'), gd = gs[a === 'oadd' ? gi : gs.length - 1]; const ins = gd && gd.querySelectorAll(a === 'oadd' ? '.opn' : '.opt'); if (ins && ins.length) ins[ins.length - 1].focus(); }
  }
  // ---------- Caja: elegir las opciones de un producto (una pantalla, todo a la vista) ----------
  function opsDlg(p, noFocus) {
    const G = limpiarOps(p.op); let sel = selInicial(G), n = 1;
    const o = modal('<div id="opc"></div>'), box = o.querySelector('#opc');
    const pinta = (msg) => {
      const u = p.pn + G.reduce((a, g, gi) => a + (sel[gi] || []).reduce((b, oi) => b + g.o[oi].p, 0), 0);
      let h = '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><b style="font-size:19px">' + esc(p.n) + '</b><b style="font-size:24px">' + money(u * n) + '</b></div>';
      G.forEach((g, gi) => {
        h += '<div style="font-weight:800;font-size:14px;margin:12px 0 6px">' + esc(g.t) + ' <span style="font-weight:500;opacity:.65">· ' + esc(reglaOps(g)) + '</span></div><div class="chips" style="margin:0;gap:6px">' +
          g.o.map((x, oi) => '<button type="button" class="ch' + ((sel[gi] || []).indexOf(oi) >= 0 ? ' on' : '') + '" data-og="' + gi + '" data-oo="' + oi + '" style="margin:0">' + esc(x.n) + (x.p ? ' +' + money(x.p) : '') + '</button>').join('') + '</div>';
      });
      h += '<div class="k" style="min-height:18px;margin-top:10px;color:#b3261e;font-weight:700">' + esc(msg || '') + '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:6px"><button type="button" class="qb" data-on="-1" aria-label="Uno menos">−</button><b style="min-width:22px;text-align:center">' + n + '</b><button type="button" class="qb" data-on="1" aria-label="Uno más">+</button>' +
        '<button type="button" class="go" id="opadd" style="margin:0;flex:1">Agregar · ' + money(u * n) + '</button></div>' +
        '<button type="button" class="go alt" data-close="1" style="margin-top:8px">Cancelar</button>';
      box.innerHTML = h;
    };
    const agregar = () => {
      const x = calcOps(G, sel); if (!x.ok) { pinta(x.error.replace(/^falta elegir /, 'Falta elegir: ')); return; }
      const nm = p.n + (x.txt ? ' (' + x.txt + ')' : ''), u = p.pn + x.extra, l = S.cart.find((y) => y.id === p.id && y.n === nm && !y.w);
      if (l) l.q += n; else S.cart.push({ id: p.id, n: nm, q: n, u, c: p.c || 0, w: false, op: 1 });
      o.remove(); S.last = ''; clearSearch(noFocus); renderCart();
    };
    o.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !box.contains(b)) return; const ds = b.dataset;
      if (ds.og !== undefined) { sel = tocarOps(G, sel, +ds.og, +ds.oo); pinta(); }
      else if (ds.on) { n = Math.max(1, Math.min(99, n + +ds.on)); pinta(); }
      else if (b.id === 'opadd') agregar();
    });
    const tecla = (e) => { if (!document.body.contains(o)) { window.removeEventListener('keydown', tecla, true); return; } if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); agregar(); } else if (e.key === 'Escape') { e.stopPropagation(); o.remove(); } };
    window.addEventListener('keydown', tecla, true);
    pinta();
  }
  function saveProd() {
    const E = S.edit, p = E.id ? prod(E.id) : null;
    const n = $('fn').value.trim(), s = $('fs').value.trim(), cat = $('fc').value === '__new' ? '' : $('fc').value, pn = +$('fpn').value || 0, co = +$('fco').value || 0;
    const ns = $('fns').checked;
    const qs = ns ? '' : $('fq').value.trim(), q = qs === '' ? (p && ns ? p.q : 0) : r3(pnum(qs)), mins = ns ? '' : $('fmin').value.trim(), min = mins === '' ? 0 : r3(pnum(mins));
    if (!n) { alert('Escribí el nombre del producto.'); return; }
    if (isNaN(q) || isNaN(min) || min < 0) { alert('Revisá el stock (usá números, por ejemplo 12 o 1,5).'); return; }
    if (!ns && !E.w && q !== Math.floor(q)) { alert('Este producto se vende por unidad: el stock tiene que ser un número entero.'); return; }
    const dtOk = (v) => typeof v === 'number' && v > 0 && v < 999;
    const d = $('fdsc').value.trim().replace(/\s+/g, ' ').slice(0, 160), pa = +$('fpa').value || 0, dt = $('fdt').checked ? (p && dtOk(p.dt) ? p.dt : 1 + Math.max(0, ...P().map((x) => (dtOk(x.dt) ? x.dt : 0)))) : false;
    if (pn < 0 || co < 0 || pa < 0) { alert('Los precios no pueden ser negativos.'); return; }
    if (pa > 0 && pa <= pn) { alert('El precio anterior tiene que ser mayor que el precio de venta (' + money(pn) + '). Si no hay descuento, dejalo vacío.'); return; }
    if (s && P().some((x) => x.id !== E.id && x.s && x.s.toLowerCase() === s.toLowerCase())) { alert('Ya hay otro producto con el código ' + s + '.'); return; }
    if (!E.id && P().some((x) => x.n.toLowerCase() === n.toLowerCase()) && !confirm('Ya existe "' + n + '". ¿Crear otro con el mismo nombre?')) return;
    const id = E.id || 'al_' + X.rnd(10);
    opsRead(); const op = E.w ? [] : limpiarOps(E.op);
    const malo = (E.op || []).find((g) => g.o.some((x) => !x.n) || !g.t);
    if (!E.w && malo) { alert('Completá el nombre de cada grupo y de cada opción (o quitá las que estén vacías).'); return; }
    const o = { n, s, cat, w: E.w, pn, c: co, min, oh: $('foh').checked, alm: 1, d, pa, dt, ns, op: op.length ? op : deleteField() };
    const b = writeBatch(db);
    if (E.img !== undefined) {
      o.img = E.img; o.hd = E.hd ? 1 : deleteField(); o.bf = deleteField();   // foto propia: ya no sigue a la base
      if (E.hd) b.set(ref('public', fotoId(id)), { f: E.hd, at: Date.now() }); else b.delete(ref('public', fotoId(id)));
    }
    // Si el stock guardado no es un número válido, se pone la cantidad contada tal cual (así se corrige solo al guardar).
    if (p && typeof p.q === 'number' && isFinite(p.q)) { const dq = r3(q - p.q); if (dq !== 0) o.q = increment(dq); } else o.q = isFinite(q) ? q : 0;
    b.set(ref('stock', id), o, { merge: true });
    b.commit().catch(failW);
    if (s) { if (E.img !== undefined && !E.px) aportar(s, n, E.img, E.qs || 0, 'u'); else aportar(s, n, '', 0, 'u'); }   // la foto publicitaria no va a la base de códigos
    closeForms();
  }
  function delProd() {
    const p = prod(S.edit && S.edit.id); if (!p) return;
    if (!confirm('¿Eliminar "' + p.n + '"? Las ventas ya hechas se conservan en los resúmenes.')) return;
    const b = writeBatch(db); b.delete(ref('stock', p.id)); b.delete(ref('public', fotoId(p.id))); b.commit().catch(failW); closeForms();
  }

  function repoForm(id) {
    S.repo = { id: id || null };
    S.edit = null;
    if (adm() && (!S.rcomp || S.rcomp.m !== X.today().slice(0, 7))) loadCompras(); // la lista de compras (con totales) es solo del administrador
    renderRepo();
  }
  function loadCompras() {
    const m = X.today().slice(0, 7);
    S.rcomp = { m, list: null };
    getDocs(query(col('compras'), where('m', '==', m))).then((sn) => { const l = []; sn.forEach((d) => l.push(d.data())); l.sort((a, b) => String(b.id).localeCompare(String(a.id))); S.rcomp = { m, list: l }; if (S.repo && !S.repo.id) renderRepo(); })
      .catch((e) => { S.rcomp = { m, list: [], err: deny(e) }; if (S.repo && !S.repo.id) renderRepo(); });
  }
  function renderRepo() {
    const R = S.repo, p = R.id ? prod(R.id) : null;
    let h = '<button class="x" data-al="cancel" style="font-size:14px;text-decoration:underline;margin-bottom:10px">← Volver al stock</button><div class="card"><b style="font-size:19px">Reponer mercadería</b><div class="k" style="margin-top:4px">Cargá lo que compraste al proveedor. Suma al stock y actualiza el costo promedio.</div>';
    if (!p) {
      h += '<label>¿Qué compraste?</label><div style="display:flex;gap:8px;align-items:center"><input id="rq" type="search" placeholder="Buscar producto o código" autocomplete="off" style="flex:1;min-width:0" value="' + esc(S.rq) + '">' + scanButton('scanrepo') + '</div><div id="rres"></div>' +
        '<button class="x" data-al="newp" style="font-size:15px;font-weight:700;text-decoration:underline;color:var(--ink);margin-top:10px">+ Es un producto nuevo</button></div>';
      if (adm()) {
      const cl = S.rcomp && S.rcomp.list;
      h += '<div class="card"><b>Compras de este mes</b>';
      if (S.rcomp && S.rcomp.err) h += rulesCard();
      else if (!cl) h += '<div class="empty">Cargando…</div>';
      else if (!cl.length) h += '<div class="empty">Todavía no cargaste compras este mes.</div>';
      else { let t = 0; cl.forEach((x) => { t += x.tot; }); h += '<div class="k">Total ' + money(t) + '</div>' + cl.slice(0, 50).map((x) => '<div class="it"><div><b>' + esc(x.n) + '</b><small>' + dmy(x.d) + ' · ' + fq(x.q, x.w) + ' × ' + money(x.u) + (x.prov ? ' · ' + esc(x.prov) : '') + '</small></div><div class="amt"><b class="neg">−' + money(x.tot) + '</b></div><button class="x" data-al="delc" data-id="' + esc(x.id) + '" aria-label="Borrar">×</button></div>').join(''); }
      }
      $('s-stk').innerHTML = h + '</div>';
      const rq = $('rq');
      const rres = () => { const l = S.rq.trim() ? P().filter((x) => match(x.n + ' ' + x.s + ' ' + x.cat, S.rq)).sort((a, b) => a.n.localeCompare(b.n)).slice(0, 20) : []; $('rres').innerHTML = l.map((x) => '<button class="pl" data-al="rpick" data-id="' + esc(x.id) + '"><span><b>' + esc(x.n) + '</b><small>stock ' + fq(x.q, x.w) + (x.c ? ' · costo ' + money(x.c) : '') + '</small></span></button>').join(''); };
      rq.oninput = () => { S.rq = rq.value; rres(); };
      rq.onkeydown = (e) => { if (e.key === 'Enter') { const f = findByCode(P(), S.rq); if (!f && /^\d{6,}$/.test(S.rq.trim())) beep(false); if (f) { beep(true); e.preventDefault(); S.repo.id = f.id; renderRepo(); } } };
      rres(); setTimeout(() => rq.focus(), 50);
      return;
    }
    if (R.note) h += '<div class="bn" style="margin:12px 0 0">Este producto ya estaba cargado con ese código. Poné cuántos compraste y se suma al stock.</div>';
    h += '<div class="bn" style="margin:12px 0 0;display:flex;justify-content:space-between;align-items:center;gap:8px"><span><b>' + esc(p.n) + '</b><br><small>Stock ' + fq(p.q, p.w) + ' · costo ' + (p.c ? money(p.c) : '—') + ' · venta ' + priceTxt(p) + '</small></span><button class="x" data-al="rpick" data-id="" style="font-size:14px;text-decoration:underline">Cambiar</button></div>' +
      '<div class="row"><div><label>Cantidad' + (p.w ? ' (kg)' : '') + '</label><input id="rqq" type="text" inputmode="decimal" autocomplete="off" placeholder="0"></div><div><label>Costo ' + (p.w ? 'por kilo' : 'por unidad') + '</label><input id="rcu" type="number" inputmode="decimal" min="0" placeholder="0" value="' + (p.c || '') + '"></div></div>' +
      '<div class="k" style="margin-top:6px">¿Compraste por bulto? Poné las unidades totales y el costo de cada una (ej: bulto de 12 a $6.000 → 12 a $500).</div>' +
      '<label>Precio de venta ' + (p.w ? 'por kilo' : '') + '</label><input id="rpn" type="number" inputmode="decimal" min="0" value="' + (p.pn || '') + '"><div class="tot" id="rmg"></div>' +
      '<div class="row"><div><label>Proveedor (opcional)</label><input id="rpv" maxlength="40" autocomplete="off" list="provs"></div><div><label>Fecha</label><input id="rd" type="date" value="' + X.today() + '"></div></div>' +
      '<datalist id="provs">' + Array.from(new Set(((S.rcomp && S.rcomp.list) || []).map((x) => x.prov).filter(Boolean))).map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
      '<div class="tot" id="rtot"></div><button class="go" data-al="saver">Guardar compra</button></div>';
    $('s-stk').innerHTML = h;
    const upd = () => {
      const q = pnum($('rqq').value), cu = +$('rcu').value, pn = +$('rpn').value;
      $('rtot').textContent = q > 0 && cu > 0 ? 'Total de la compra: ' + money(q * cu) + ' · costo promedio nuevo: ' + money(newAvgCost(p.q, p.c, q, cu)) : '';
      $('rmg').textContent = pn > 0 && cu > 0 ? 'Margen: ' + Math.round((pn - cu) / pn * 100) + '% (' + money(pn - cu) + ')' : '';
    };
    ['rqq', 'rcu', 'rpn'].forEach((i) => { $(i).oninput = upd; });
    upd(); setTimeout(() => $('rqq').focus(), 50);
  }
  function saveRepo() {
    const p = prod(S.repo.id); if (!p) return;
    const q = r3(pnum($('rqq').value)), cu = +$('rcu').value, pn = +$('rpn').value || p.pn || 0, d = $('rd').value || X.today(), m = d.slice(0, 7);
    if (!(q > 0)) { alert('Escribí la cantidad que compraste.'); return; }
    if (!p.w && q !== Math.floor(q)) { alert('Este producto se vende por unidad: la cantidad tiene que ser entera.'); return; }
    if ($('rcu').value === '' || !(cu >= 0)) { alert('Escribí el costo.'); return; }
    const id = uid(), sid = X.sid(), u = X.user(), tot = Math.round(q * cu), b = writeBatch(db);
    const c = { id, pid: p.id, n: p.n, w: p.w ? 1 : 0, q, u: cu, tot, d, m, prov: $('rpv').value.trim().slice(0, 40), by: u.uid, bn: X.nm() };
    b.set(doc(db, 'stores', sid, 'compras', id), c);
    // si el costo era estimado (carga sin factura), la primera compra real lo reemplaza
    b.update(doc(db, 'stores', sid, 'stock', p.id), { q: increment(q), c: p.ce ? cu : newAvgCost(p.q, p.c, q, cu), ce: deleteField(), pn });
    b.set(doc(db, 'stores', sid, 'totales', m), { co: increment(tot) }, { merge: true });
    b.commit().catch(failW);
    if (S.rcomp && S.rcomp.list && S.rcomp.m === m) S.rcomp.list.unshift(c);
    S.repo = { id: null }; S.rq = '';
    renderRepo();
    const k = document.querySelector('#s-stk .card .k'); if (k) k.innerHTML = '<b style="color:var(--sell)">Guardado ✓ ' + esc(p.n) + ' +' + fq(q, p.w) + '</b>';
  }
  function delCompra(id) {
    const c = S.rcomp && S.rcomp.list && S.rcomp.list.find((x) => x.id === id); if (!c) return;
    if (!confirm('¿Borrar esta compra? Se descuenta ' + fq(c.q, c.w) + ' del stock de ' + c.n + '.')) return;
    const sid = X.sid(), b = writeBatch(db);
    b.delete(doc(db, 'stores', sid, 'compras', id));
    if (prod(c.pid)) b.update(doc(db, 'stores', sid, 'stock', c.pid), { q: increment(-c.q) });
    b.set(doc(db, 'stores', sid, 'totales', c.m), { co: increment(-c.tot) }, { merge: true });
    b.commit().catch(failW);
    S.rcomp.list = S.rcomp.list.filter((x) => x.id !== id); renderRepo();
  }
  // Cambiar de categoría varios productos juntos: se buscan por palabras (separadas por coma), se revisan con tildes y se mueven.
  function mvCatDlg(dest) {
    const o = modal('<b style="font-size:19px">🗂️ Cambiar categoría a varios</b>' +
      '<div class="k" style="margin-top:4px">Buscá los productos por palabras separadas por coma, revisá la lista y movelos todos juntos.</div>' +
      '<div style="margin-top:10px"><button class="go alt" id="mvdes" style="margin:0">☕ Atajo: Desayuno y merienda (yerba, café, mate, dulce de leche…)</button></div>' +
      '<label>Buscar</label><input id="mvq" placeholder="Ej: yerba, café, mermelada" autocomplete="off">' +
      '<label>Pasarlos a la categoría</label><select id="fc">' + catOptions(dest || '') + '</select>' +
      '<div class="k" id="mvk" style="margin-top:10px"></div><div id="mvl" style="max-height:42vh;overflow:auto;margin-top:4px"></div>' +
      '<button class="go" id="mvok" style="margin-top:12px" disabled>Mover</button><button class="go alt" data-close="1" style="margin-top:8px">Cancelar</button>');
    const q = (id) => o.querySelector('#' + id); let lista = [];
    const pinta = () => {
      const dst = q('fc').value, ts = q('mvq').value.split(',').filter((t) => t.trim());
      lista = porPalabras(q('mvq').value, dst);
      q('mvk').textContent = !ts.length ? 'Escribí qué buscar o tocá el atajo.' : lista.length ? (lista.length === 1 ? '1 producto encontrado.' : lista.length + ' productos encontrados.') + ' Destildá los que no van.' : 'No hay productos para mover con esas palabras.';
      q('mvl').innerHTML = lista.map((p) => '<label style="display:flex;gap:10px;align-items:center;margin:0;padding:8px 2px;border-bottom:1px solid var(--line);font-weight:600"><input type="checkbox" data-mv="' + esc(p.id) + '" checked style="width:auto;margin:0"><span style="flex:1;min-width:0">' + esc(p.n) + '<small style="display:block;font-weight:400;opacity:.7">' + esc(p.cat || 'Sin categoría') + '</small></span></label>').join('');
      cuenta();
    };
    const cuenta = () => { const n = o.querySelectorAll('[data-mv]:checked').length; q('mvok').disabled = !n; q('mvok').textContent = n ? 'Mover ' + n + ' producto' + (n > 1 ? 's' : '') + ' a ' + q('fc').value : 'Mover'; };
    let t = 0; q('mvq').oninput = () => { clearTimeout(t); t = setTimeout(pinta, 200); };
    q('fc').addEventListener('change', () => setTimeout(pinta));
    q('mvl').onchange = cuenta;
    q('mvdes').onclick = () => { q('fc').value = 'Desayuno y merienda'; q('mvq').value = ATAJOS['Desayuno y merienda']; pinta(); };
    q('mvok').onclick = () => {
      const dst = q('fc').value, ids = Array.from(o.querySelectorAll('[data-mv]:checked')).map((x) => x.dataset.mv);
      if (!ids.length || !dst || dst === '__new') return;
      const sid = X.sid(), lotes = [];
      for (let i = 0; i < ids.length; i += 400) { const b = writeBatch(db); ids.slice(i, i + 400).forEach((id) => b.set(doc(db, 'stores', sid, 'stock', id), { cat: dst }, { merge: true })); lotes.push(b.commit()); }
      q('mvok').disabled = true; q('mvok').textContent = 'Moviendo…';
      Promise.all(lotes).then(() => { o.remove(); alert('Listo: ' + (ids.length === 1 ? '1 producto pasó' : ids.length + ' productos pasaron') + ' a "' + dst + '". En unos segundos se actualiza el catálogo.'); }).catch(failW);
    };
    if (dest && ATAJOS[dest]) q('mvdes').onclick(); else pinta();
    return o;
  }
  function preciosDlg() {
    const o = modal('<b style="font-size:19px">Actualizar precios</b><div class="k" style="margin-top:4px">Sube (o baja) el precio de venta de muchos productos de una vez. No cambia los costos.</div>' +
      '<label>¿Qué productos?</label><select id="pc"><option value="">Todos</option>' + usedCats().map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('') + '</select>' +
      '<div class="row"><div><label>Porcentaje</label><input id="pp" type="number" inputmode="decimal" step="any" placeholder="Ej: 10"></div><div><label>Redondear a</label><select id="pr"><option value="1">$1</option><option value="10" selected>$10</option><option value="50">$50</option><option value="100">$100</option></select></div></div>' +
      '<div class="k" style="margin-top:6px">Para bajar, poné un número negativo (ej: −5).</div><div class="tot" id="pt"></div><button class="go" id="pok">Aplicar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const sel = () => { const c = o.querySelector('#pc').value; return P().filter((p) => p.pn > 0 && (!c || p.cat === c)); };
    const upd = () => { const pc = +o.querySelector('#pp').value, l = sel(), ex = l[0]; o.querySelector('#pt').textContent = l.length + ' productos' + (pc && ex ? ' · ej: ' + ex.n + ' ' + money(ex.pn) + ' → ' + money(roundPrice(ex.pn * (1 + pc / 100), +o.querySelector('#pr').value)) : ''); };
    ['pc', 'pp', 'pr'].forEach((i) => { o.querySelector('#' + i).oninput = upd; o.querySelector('#' + i).onchange = upd; }); upd();
    o.querySelector('#pok').onclick = () => {
      const pc = +o.querySelector('#pp').value, st = +o.querySelector('#pr').value, l = sel();
      if (!pc || pc <= -100 || pc > 500) { alert('Escribí un porcentaje válido.'); return; }
      if (!confirm('¿Cambiar ' + pc + '% el precio de ' + l.length + ' productos?')) return;
      const sid = X.sid();
      for (let i = 0; i < l.length; i += 400) {
        const b = writeBatch(db);
        l.slice(i, i + 400).forEach((p) => b.update(doc(db, 'stores', sid, 'stock', p.id), { pn: Math.max(0, roundPrice(p.pn * (1 + pc / 100), st)) }));
        b.commit().catch(failW);
      }
      o.remove();
    };
  }

  // =====================================================================
  // RESUMEN (administrador)
  // =====================================================================
  function drawRes() {
    const box = $('s-res');
    listenTot(); listenHoy(); listenCajasMes(); listenAps();
    const t = S.tot || {}, pay = t.pay || {}, gas = X.gTotal(S.month), apc = t.apcom || 0;
    const v = t.v || 0, c = t.c || 0, gross = v - c, gain = gross - gas - apc;
    let deben = 0; S.cl.forEach((x) => { if (x.s > 0) deben += x.s; });
    const ms = lastMonths(13, X.today().slice(0, 7));
    let h = '<div class="card hero"><select data-alm="1">' + ms.map((m) => '<option value="' + m + '"' + (m === S.month ? ' selected' : '') + '>' + X.mlabel(m) + '</option>').join('') + '</select>' +
      (S.tot === null ? '<div class="big">…</div>' : '<div class="big ' + (gain >= 0 ? 'pos' : 'neg') + '">' + money(gain) + '</div>') +
      '<div class="k">Ganancia del mes: lo vendido, menos lo que te costó esa mercadería, menos los gastos' + (apc ? ' y las comisiones de las apps' : '') + '</div></div>' +
      '<div class="rows">' +
      '<div class="r2"><span>Vendí<small>' + (t.n || 0) + ' ventas' + (t.n ? ' · ticket promedio ' + money(v / t.n) : '') + '</small></span><b class="pos">' + money(v) + '</b></div>' +
      '<div class="r2"><span>Costo de lo vendido</span><b class="neg">' + money(c) + '</b></div>' +
      '<div class="r2"><span>Ganancia de las ventas<small>antes de gastos' + (v ? ' · ' + Math.round(gross / v * 100) + '%' : '') + '</small></span><b class="' + (gross >= 0 ? 'pos' : 'neg') + '">' + money(gross) + '</b></div>' +
      '<div class="r2"><span>Gastos del mes<small>alquiler, luz, sueldos…</small></span><b class="neg">' + money(gas) + '</b></div>' +
      (apc ? '<div class="r2"><span>Comisiones de las apps<small>lo que se quedaron de los depósitos de este mes</small></span><b class="neg">' + money(apc) + '</b></div>' : '') +
      '<div class="r2"><span>Compré mercadería<small>reposición cargada este mes</small></span><b>' + money(t.co || 0) + '</b></div></div>' +
      '<div class="card"><b>Cómo te pagaron</b><div class="rows" style="margin:6px 0 0">' + Object.keys(PAY).map((k) => '<div class="r2"><span>' + PAY[k] + '</span><b>' + money(pay[k] || 0) + '</b></div>').join('') +
      '<div class="r2"><span>Cobré de fiados<small>pagos de deudas este mes</small></span><b class="pos">' + money(t.cob || 0) + '</b></div>' +
      '<div class="r2"><span>Te deben hoy<small>total de la libreta</small></span><b class="neg">' + money(deben) + '</b></div>' +
      (t.apcob ? '<div class="r2"><span>Te depositaron las apps<small>depósitos registrados este mes</small></span><b class="pos">' + money(t.apcob) + '</b></div>' : '') + '</div></div>' +
      appsCard() + cajasCard() + (S.tot === null ? '' : topCard(t)) +
      '<div class="card"><b>Descargar para Excel</b><div class="k" style="margin-top:4px">Se abre con Excel o Google Sheets.</div><div class="row" style="gap:8px;margin-top:10px"><button class="go alt" data-al="xven" style="margin:0">Ventas del mes</button><button class="go alt" data-al="xtop" style="margin:0">Lo más vendido</button></div></div>';
    const dias = t.dias || {}, keys = Object.keys(dias).filter((k) => (dias[k].n || 0) > 0).sort();
    if (keys.length) {
      const mx = Math.max(...keys.map((k) => dias[k].v || 0), 1);
      h += '<div class="card"><b>Ventas por día</b>' + keys.reverse().map((k) => '<div class="bar"><span>' + k + '/' + S.month.slice(5) + '</span><i style="width:' + Math.max(2, Math.round((dias[k].v || 0) / mx * 100)) + '%"></i><b>' + money(dias[k].v || 0) + '</b></div>').join('') + '</div>';
    }
    const isToday = S.day === X.today(), lv = isToday ? S.hoy : S.dayV;
    h += '<div class="card"><b>Ventas de un día</b><input id="rday" type="date" value="' + S.day + '" max="' + X.today() + '" style="margin-top:10px">';
    if (!lv) h += '<div class="empty">Cargando…</div>';
    else {
      let tt = 0; lv.forEach((x) => { tt += x.tot || 0; });
      h += '<div class="k" style="margin-top:8px">' + lv.length + ' ventas · ' + money(tt) + '</div>' + (lv.length ? ventasHtml(lv, true) : '<div class="empty">No hay ventas ese día.</div>');
    }
    box.innerHTML = h + '</div><div class="note">El costo de cada venta es el costo promedio del producto al momento de vender. Cargá las compras en Stock → Reponer para que sea exacto.</div>';
    $('rday').onchange = function () { S.day = this.value || X.today(); S.dayV = null; if (S.day !== X.today()) loadDay(); drawRes(); };
    if (!isToday && !S.dayV) loadDay();
  }
  // ---------- Lo más vendido y descargas para Excel ----------
  // ---------- Apps de delivery: cuenta por app y por semana (lunes a domingo) ----------
  function listenAps() {
    if (un.aps || !adm()) return;
    un.aps = onSnapshot(col('apsal'), (sn) => { S.aps = {}; S.apsErr = false; sn.forEach((d) => { S.aps[d.id] = d.data(); }); if (X.tab() === 'res') drawRes(); },
      (e) => { S.aps = {}; S.apsErr = deny(e); if (X.tab() === 'res') drawRes(); });
  }
  const apInfo = (id) => appDe(id) || { id, n: ((S.aps || {})[id] || {}).n || id, com: 0, rec: 0 };
  function appsCard() {
    if (!adm()) return '';
    const AL = apps(), SA = S.aps || {}, hoy = X.today();
    const ids = AL.map((a) => a.id).concat(Object.keys(SA).filter((k) => !appDe(k) && semanasApp(SA[k].w, hoy).length));
    let h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><b>📲 Apps de delivery</b>' + (ids.length ? '<button class="x" data-al="apcfg" style="font-size:14px;text-decoration:underline">Configurar</button>' : '') + '</div>';
    if (!ids.length) return h + '<div class="k" style="margin-top:4px">¿Vendés por PedidosYa, Uber Eats o Rappi? Cargalas y llevá la cuenta de lo que te tienen que depositar cada semana. Las ventas descuentan el stock igual que las de la caja.</div><button class="go alt" data-al="apcfg" style="margin-top:10px">Configurar apps</button></div>';
    if (S.apsErr) h += '<div class="bn warn" style="margin-top:10px">Falta publicar las reglas nuevas de Firebase para ver la cuenta de las apps. Avisale a Pekeron App.</div>';
    ids.forEach((id) => {
      const A = apInfo(id), W = semanasApp((SA[id] || {}).w, hoy), pend = W.reduce((a, x) => a + x.a, 0), venc = W.filter((x) => !x.cur).reduce((a, x) => a + x.a, 0);
      h += '<div style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><b style="font-size:17px">' + esc(A.n) + '</b><span class="k">' + (A.com ? 'comisión ' + A.com + '%' : 'sin comisión cargada') + '</span></div>';
      if (!W.length) h += '<div class="k" style="margin-top:4px">No hay ventas pendientes de cobro.</div>';
      else {
        h += '<div class="rows" style="margin:6px 0 0">' + W.map((x) => '<div class="r2"><span>Semana del ' + x.txt + '<small>' + (x.cur ? 'en curso' : 'a cobrar') + (A.com ? ' · te depositan ≈ ' + money(apNeto(x.a, A.com)) : '') + '</small></span><b>' + money(x.a) + '</b></div>').join('') + '</div>';
        if (W.length > 1 || venc) h += '<div class="k" style="margin-top:6px">' + (venc ? 'A cobrar de semanas cerradas: <b>' + money(venc) + '</b>' + (A.com ? ' (≈ ' + money(apNeto(venc, A.com)) + ' de depósito)' : '') : 'Total pendiente: <b>' + money(pend) + '</b>') + '</div>';
        h += '<button class="go' + (venc ? '' : ' alt') + '" data-al="apcob" data-id="' + esc(id) + '" style="margin-top:10px">💰 Registrar el depósito de ' + esc(A.n) + '</button>';
      }
      h += '<button class="x" data-al="aphist" data-id="' + esc(id) + '" style="display:block;margin:10px auto 0;font-size:14px;text-decoration:underline">Depósitos anteriores</button></div>';
    });
    return h + '</div>';
  }
  function appsCfg() {
    if (!adm()) { alert('Solo el administrador configura las apps.'); return; }
    const L = apps().map((a) => Object.assign({}, a));
    const o = modal('<b style="font-size:19px">📲 Apps de delivery</b><div class="k" style="margin:4px 0 6px">Las apps por las que vendés. La <b>comisión</b> es el % que se queda la app: sirve para calcular cuánto te depositan. El <b>recargo</b> es cuánto más caros tenés los precios en la app (0 si son los mismos).</div>' +
      '<div id="ap_l"></div><div class="chips" id="ap_s" style="margin-top:12px"></div><button class="go" id="ap_ok">Guardar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const pint = () => {
      o.querySelector('#ap_l').innerHTML = L.map((a, i) => '<div style="border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-top:10px"><div style="display:flex;gap:8px;align-items:center"><input data-apf="n" data-api="' + i + '" value="' + esc(a.n) + '" maxlength="30" placeholder="Nombre de la app" style="flex:1;margin:0;font-weight:700"><button class="x" data-apdel="' + i + '" aria-label="Quitar" style="font-size:22px">×</button></div>' +
        '<div class="row" style="margin-top:4px"><div><label>Comisión %</label><input data-apf="com" data-api="' + i + '" type="number" inputmode="numeric" min="0" max="90" value="' + (a.com || '') + '" placeholder="Ej: 30"></div><div><label>Recargo en la app %</label><input data-apf="rec" data-api="' + i + '" type="number" inputmode="numeric" min="0" max="200" value="' + (a.rec || '') + '" placeholder="0"></div></div></div>').join('') ||
        '<div class="k" style="margin-top:10px">Todavía no cargaste ninguna. Tocá una de abajo.</div>';
      o.querySelector('#ap_s').innerHTML = APPS_SUG.filter((x) => !L.some((a) => a.id === x[0] || a.n === x[1])).map((x) => '<button type="button" class="ch" data-apsug="' + x[0] + '">+ ' + x[1] + '</button>').join('') + '<button type="button" class="ch" data-apsug="otra">+ Otra</button>';
    };
    o.addEventListener('input', (e) => { const t = e.target; if (t.dataset && t.dataset.apf) L[+t.dataset.api][t.dataset.apf] = t.value; });
    o.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('[data-apdel],[data-apsug]'); if (!t) return;
      if (t.dataset.apdel != null) L.splice(+t.dataset.apdel, 1);
      else { const sg = APPS_SUG.find((x) => x[0] === t.dataset.apsug), n = sg ? sg[1] : (prompt('Nombre de la app:') || '').trim().slice(0, 30); if (!n) return; L.push({ id: sg ? sg[0] : '', n, com: '', rec: '' }); }
      pint();
    });
    pint();
    o.querySelector('#ap_ok').onclick = () => {
      const l = limpiarApps(L); o.querySelector('#ap_ok').disabled = true;
      setDoc(doc(db, 'stores', X.sid(), 'cfg', 'servicios'), { apps: l }, { merge: true }).then(() => { o.remove(); if (X.cs && X.cs()) X.cs().apps = l; if (X.tab() === 'res') drawRes(); renderCart(); })
        .catch((e) => { o.querySelector('#ap_ok').disabled = false; X.fail(e); });
    };
  }
  function apCobro(id) {
    const A = apInfo(id), W = semanasApp(((S.aps || {})[id] || {}).w, X.today()); if (!W.length) return;
    const def = W.some((x) => !x.cur) ? W.filter((x) => !x.cur).map((x) => x.k) : W.map((x) => x.k);
    const o = modal('<b style="font-size:19px">💰 Depósito de ' + esc(A.n) + '</b><div class="k" style="margin:4px 0 6px">Marcá las semanas que te pagó y escribí cuánto te depositó. La diferencia queda como comisión de la app.</div>' +
      W.map((x) => '<label style="display:flex;gap:10px;align-items:center;margin-top:10px;font-weight:600;color:var(--ink)"><input type="checkbox" data-apk="' + x.k + '"' + (def.indexOf(x.k) >= 0 ? ' checked' : '') + ' style="width:22px;height:22px;margin:0;flex:none"><span style="flex:1">Semana del ' + x.txt + (x.cur ? ' <small style="color:var(--mut)">(en curso)</small>' : '') + '</span><b>' + money(x.a) + '</b></label>').join('') +
      '<label>¿Cuánto te depositó?</label><input id="apc_n" type="number" inputmode="numeric" placeholder="Lo que llegó a tu cuenta"><div class="k" id="apc_r" style="margin-top:8px"></div>' +
      '<label>Fecha del depósito</label><input id="apc_d" type="date" value="' + X.today() + '" max="' + X.today() + '">' +
      '<button class="go" id="apc_ok">Guardar el depósito</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const q = (i) => o.querySelector('#' + i), sel = () => Array.from(o.querySelectorAll('[data-apk]')).filter((c) => c.checked).map((c) => c.dataset.apk);
    const bruto = () => sel().reduce((a, k) => a + ((W.find((x) => x.k === k) || {}).a || 0), 0);
    let toc = false;
    const upd = () => {
      const b = bruto(); if (!toc) q('apc_n').value = b && A.com ? apNeto(b, A.com) : '';
      const n = Math.round(+q('apc_n').value || 0), c = b - n;
      q('apc_r').innerHTML = !b ? 'Marcá al menos una semana.' : 'Vendiste <b>' + money(b) + '</b> por ' + esc(A.n) + ' esas semanas.' + (n ? '<br>Comisión y cargos de la app: <b style="color:' + (c < 0 ? 'var(--ink)' : '#b3261e') + '">' + money(c) + '</b> (' + Math.round(c / b * 100) + '%)' : '');
    };
    o.querySelectorAll('[data-apk]').forEach((c) => { c.onchange = upd; }); q('apc_n').oninput = () => { toc = true; upd(); }; upd();
    q('apc_ok').onclick = () => {
      const ks = sel(), b = bruto(), n = Math.round(+q('apc_n').value || 0), d = q('apc_d').value || X.today();
      if (!ks.length) { alert('Marcá las semanas que te pagó.'); return; }
      if (!(n > 0)) { alert('Escribí cuánto te depositó.'); return; }
      if (n > b && !confirm('Te depositó más de lo que vendiste esas semanas (' + money(b) + '). ¿Guardar igual?')) return;
      const m = d.slice(0, 7), mid = uid(), sw = {}, wd = {}; ks.forEach((k) => { sw[k] = (W.find((x) => x.k === k) || {}).a || 0; wd[k] = increment(-sw[k]); });
      const bt = writeBatch(db);
      bt.set(ref('apmov', mid), { id: mid, ap: id, apn: A.n, sw, a: b, net: n, com: b - n, d, m, h: now(), by: X.user().uid, bn: X.nm() });
      bt.set(ref('apsal', id), { s: increment(-b), w: wd, u: Date.now() }, { merge: true });
      bt.set(ref('totales', m), { apcom: increment(b - n), apcob: increment(n) }, { merge: true });
      q('apc_ok').disabled = true;
      bt.commit().then(() => o.remove()).catch((e) => { q('apc_ok').disabled = false; failW(e); });
    };
  }
  function apHist(id) {
    const A = apInfo(id);
    const o = modal('<b style="font-size:19px">Depósitos de ' + esc(A.n) + '</b><div id="aph" style="margin-top:8px"><div class="empty">Cargando…</div></div><button class="go alt" data-close="1" style="margin-top:14px">Listo</button>');
    const pint = () => getDocs(query(col('apmov'), where('ap', '==', id))).then((sn) => {
      const l = []; sn.forEach((d) => l.push(d.data())); l.sort((a, b) => String(b.d + b.h + b.id).localeCompare(String(a.d + a.h + a.id)));
      o.querySelector('#aph').innerHTML = l.length ? l.slice(0, 40).map((x) => '<div class="it"><div><b>' + money(x.net) + ' el ' + dmy(x.d) + '</b><small>Semana' + (Object.keys(x.sw || {}).length > 1 ? 's' : '') + ' del ' + Object.keys(x.sw || {}).sort().map(semanaTxt).join(', ') + ' · vendiste ' + money(x.a) + ' · comisión ' + money(x.com) + (x.a ? ' (' + Math.round(x.com / x.a * 100) + '%)' : '') + (x.bn ? ' · ' + esc(x.bn) : '') + '</small></div><button class="x" data-apdes="' + esc(x.id) + '" style="font-size:13px;text-decoration:underline">Deshacer</button></div>').join('') : '<div class="empty">Todavía no registraste depósitos.</div>';
      o.querySelectorAll('[data-apdes]').forEach((bn) => { bn.onclick = () => {
        const x = l.find((y) => y.id === bn.dataset.apdes); if (!x || !confirm('¿Deshacer el depósito de ' + money(x.net) + '? Esas semanas vuelven a quedar a cobrar.')) return;
        const bt = writeBatch(db), wi = {}; Object.keys(x.sw || {}).forEach((k) => { wi[k] = increment(x.sw[k]); });
        bt.delete(ref('apmov', x.id)); bt.set(ref('apsal', id), { s: increment(x.a), w: wi, u: Date.now() }, { merge: true });
        bt.set(ref('totales', x.m), { apcom: increment(-x.com), apcob: increment(-x.net) }, { merge: true });
        bt.commit().then(pint).catch(failW);
      }; });
    }).catch((e) => { o.querySelector('#aph').innerHTML = '<div class="empty">' + (deny(e) ? 'Falta publicar las reglas nuevas de Firebase.' : 'No se pudo cargar.') + '</div>'; });
    pint();
  }
  function topCard(t) {
    const pr = t.pr || {}, l = ranking(pr, P(), S.prBy), by = S.prBy;
    let h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><b>Lo más vendido</b><div class="chips" style="margin:0"><button class="ch' + (by === 'v' ? ' on' : '') + '" data-al="prby" data-v="v">Por plata</button><button class="ch' + (by === 'q' ? ' on' : '') + '" data-al="prby" data-v="q">Por cantidad</button></div></div>';
    if (!l.length) return h + '<div class="k" style="margin-top:6px">Todavía no hay datos de este mes. Se va armando solo con cada venta.</div></div>';
    h += l.slice(0, S.prAll ? 100 : 10).map((x, i) => '<div class="it"><div><b>' + (i + 1) + '. ' + esc(x.n) + '</b><small>' + fq(x.q, x.w) + (x.w ? '' : (x.q === 1 ? ' unidad' : ' unidades')) + '</small></div><div class="amt"><b>' + money(x.v) + '</b></div></div>').join('');
    if (l.length > 10) h += '<button class="x" data-al="prall" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin-top:8px">' + (S.prAll ? 'Ver menos' : 'Ver los ' + Math.min(l.length, 100)) + '</button>';
    if (S.month === X.today().slice(0, 7)) {
      const sv = sinVentas(pr, P());
      if (sv.length) h += '<div style="margin-top:14px"><b>Con stock y sin ventas este mes</b> <span class="k">(' + sv.length + ')</span></div><div class="k" style="margin-top:2px">Plata parada: pensá en una promo o en no volver a comprarlos.</div>' +
        sv.slice(0, 8).map((p) => '<div class="it"><div><b>' + esc(p.n) + '</b><small>stock ' + fq(p.q, p.w) + '</small></div>' + (adm() && p.c ? '<div class="amt"><small>a costo</small><b>' + money(p.q * p.c) + '</b></div>' : '') + '</div>').join('');
    }
    return h + '</div>';
  }
  function bajar(nombre, rows) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function expVentas() {
    const m = S.month;
    getDocs(query(col('ventas'), where('m', '==', m))).then((sn) => {
      const l = []; sn.forEach((x) => l.push(x.data())); l.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      if (!l.length) { alert('No hay ventas en ' + X.mlabel(m) + '.'); return; }
      const rows = [['Fecha', 'Hora', 'N° de venta', 'Producto', 'Cantidad', 'Unidad', 'Precio unitario', 'Total', 'Costo', 'Ganancia', 'Medio de pago', 'Cliente (fiado)', 'Vendedor']];
      l.forEach((v) => (v.it || []).forEach((x) => { const tt = Math.round(x.q * x.u), cc = Math.round(x.q * (x.c || 0)); rows.push([dmy(v.d), v.h || '', v.id, x.n, x.q, x.w ? 'kg' : 'u', Math.round(x.u * 100) / 100, tt, cc, tt - cc, payLabel(v), v.cn || '', v.bn || '']); }));
      bajar('ventas-' + m + '.csv', rows);
    }).catch(failW);
  }
  function expTop() {
    const t = S.tot || {}, l = ranking(t.pr || {}, P(), S.prBy);
    if (!l.length) { alert('Todavía no hay datos de este mes.'); return; }
    bajar('mas-vendidos-' + S.month + '.csv', [['Puesto', 'Producto', 'Cantidad', 'Unidad', 'Vendido ($)']].concat(l.map((x, i) => [i + 1, x.n, x.q, x.w ? 'kg' : 'u', x.v])));
  }
  function expStock() {
    const A = adm(), l = P().slice().sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || a.n.localeCompare(b.n));
    const head = ['Producto', 'Código', 'Categoría', 'Se vende', 'Stock', 'Contado'].concat(A ? ['Costo', 'Precio', 'Valor a costo'] : ['Precio']);
    bajar('stock-' + X.today() + '.csv', [head].concat(l.map((p) => [p.n, p.s || '', p.cat || '', p.w ? 'por kg' : 'por unidad', p.ns ? 'sin control' : p.q, ''].concat(A ? [p.c || 0, p.pn || 0, p.ns ? '' : Math.round(Math.max(p.q, 0) * (p.c || 0))] : [p.pn || 0]))));
  }
  // ---------- Etiquetas de balanza ----------
  // La balanza imprime un código que empieza con 2 y trae adentro el código del producto (PLU) y el peso o el importe.
  const cfgBal = () => { const c = X.cs && X.cs(); return (c && c.bal) || null; };
  function balLine(code) {
    const b = balanza(code, cfgBal()); if (!b) return null;
    const p = porPlu(P(), b.plu);
    if (!p) return { err: 'Es una etiqueta de balanza del producto ' + (+b.plu) + ', pero ningún producto tiene ese código. Poné ' + (+b.plu) + ' como código del producto (Stock → Editar).' };
    if (!p.pn) return { err: '"' + p.n + '" no tiene precio de venta. Buscalo por nombre en la caja y ponéselo ahí, o en Stock → Editar.' };
    const q = b.kg != null ? b.kg : r3(b.importe / p.pn);
    if (!(q > 0)) return { err: 'La etiqueta no trae un peso válido.' };
    const u = b.importe != null ? b.importe / q : p.pn;   // con importe, el total queda igual al de la etiqueta
    return { line: { id: p.id, n: p.n, q, u, c: p.c || 0, w: true }, p };
  }
  function balDlg() {
    const b = cfgBal() || { on: false, plu: 5, val: 'peso' };
    const o = modal('<b style="font-size:19px">⚖️ Balanza con etiquetas</b><div class="k" style="margin-top:4px">Si tu balanza imprime una etiqueta con código de barras (fiambres, carnes, quesos), la caja lee el peso o el importe directo de la etiqueta. A cada producto le ponés como código el número que tiene en la balanza (PLU).</div>' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:14px;font-weight:600"><input id="bon" type="checkbox" style="width:auto"' + (b.on ? ' checked' : '') + '> Usar etiquetas de balanza</label>' +
      '<label>¿Qué trae la etiqueta?</label><select id="bval"><option value="peso"' + (b.val !== 'precio' ? ' selected' : '') + '>El peso</option><option value="precio"' + (b.val === 'precio' ? ' selected' : '') + '>El importe ($)</option></select>' +
      '<label>Largo del código de producto (PLU)</label><select id="bplu">' + [4, 5, 6].map((n) => '<option value="' + n + '"' + (+b.plu === n ? ' selected' : '') + '>' + n + ' dígitos' + (n === 5 ? ' (el más común)' : '') + '</option>').join('') + '</select>' +
      '<label>Probá con una etiqueta (escaneala o escribí el número)</label><input id="btest" inputmode="numeric" autocomplete="off" placeholder="Ej: 2000123012507"><div id="bres" class="k" style="margin-top:6px"></div>' +
      '<button class="go" id="bok">Guardar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const q = (id) => o.querySelector('#' + id);
    const test = () => {
      const v = q('btest').value.trim(), r = q('bres'); if (!v) { r.textContent = ''; return; }
      const cfg = { on: true, plu: +q('bplu').value, val: q('bval').value }, x = balanza(v, cfg);
      if (!x) { r.innerHTML = v.length < 13 ? '' : '⚠️ No es una etiqueta de balanza (tiene que tener 13 números y empezar con 2).'; return; }
      const p = porPlu(P(), x.plu);
      r.innerHTML = 'Producto <b>' + (+x.plu) + '</b> · ' + (x.kg != null ? fq(x.kg, true) : money(x.importe)) + ' → ' + (p ? '<b>' + esc(p.n) + '</b>' + (p.pn ? ' · ' + (x.kg != null ? money(x.kg * p.pn) : fq(r3(x.importe / p.pn), true)) : '') : '⚠️ ningún producto tiene el código ' + (+x.plu)) +
        '<br><small>Si el peso o el producto no coinciden con la etiqueta, probá cambiando el largo del código o lo que trae la etiqueta.</small>';
    };
    q('btest').oninput = test; q('bplu').onchange = test; q('bval').onchange = test;
    q('btest').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); test(); } };
    q('bok').onclick = () => {
      setDoc(ref('cfg', 'servicios'), { bal: { on: q('bon').checked, plu: +q('bplu').value, val: q('bval').value } }, { merge: true }).catch(failW);
      o.remove();
    };
  }
  function demoDlg() {
    const o = modal('<b style="font-size:19px">✨ Cargar demo</b><div class="k" style="margin-top:4px">Elegí qué tipo de negocio querés mostrar. Se cargan productos con fotos, precios, stock, categorías y destacados, y se activa el catálogo.</div>' +
      DEMO_TIPOS.map(([k, t]) => '<button class="go alt" data-dt="' + k + '">' + t + '</button>').join('') +
      '<button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelectorAll('[data-dt]').forEach((b) => {
      b.onclick = () => {
        o.querySelectorAll('button').forEach((x) => { x.disabled = true; }); b.textContent = 'Cargando…';
        cargarDemo({ db, sid: X.sid(), sname: X.sname() || 'Mi negocio', tipo: b.dataset.dt, fotos: X.fotosDemo || null, avance: (t) => { b.textContent = t; } })
          .then((n) => { o.remove(); publishSoon(); alert('Listo: se cargaron ' + n + ' productos de ejemplo. En unos segundos aparecen en el catálogo (Equipo → Catálogo → Copiar link).'); })
          .catch((e) => { o.remove(); failW(e); });
      };
    });
  }
  function loadDay() {
    const d = S.day;
    getDocs(query(col('ventas'), where('d', '==', d))).then((sn) => { if (S.day !== d) return; const l = []; sn.forEach((x) => l.push(x.data())); l.sort((a, b) => String(b.id).localeCompare(String(a.id))); S.dayV = l; if (X.tab() === 'res') drawRes(); })
      .catch(() => { S.dayV = []; if (X.tab() === 'res') drawRes(); });
  }

  // ---------- importar clientes con fiado (libreta / cuenta corriente de otro sistema) ----------
  // Cada cliente con deuda entra con un movimiento "Deuda anterior (importada)". Si el cliente ya existe (mismo nombre), se le suma.
  function impClientes() {
    let items = [];
    const o = modal('<b style="font-size:19px">📥 Importar clientes con fiado</b><div class="k" style="margin-top:4px">Una planilla con una fila por cliente: <b>nombre</b>, <b>teléfono</b> (opcional) y <b>cuánto debe</b>. Sirve la que exporta tu sistema anterior o una de Excel.</div>' +
      '<input id="icf" type="file" accept=".xlsx,.csv,.txt" style="margin-top:12px"><div id="icv" style="margin-top:12px"></div>' +
      '<button class="go" id="icok" disabled>Importar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelector('#icf').onchange = function () {
      const f = this.files && this.files[0]; if (!f) return; const v = o.querySelector('#icv'); v.innerHTML = '<div class="k">Leyendo…</div>';
      leerArchivo(f).then((rows) => {
        const d = detectar(rows, CAMPOS_FIADO), r = filas(rows, d.head, d.map, CAMPOS_FIADO); items = r.items.slice(0, 3000);
        const con = items.filter((x) => x.d > 0), tot = con.reduce((a, x) => a + x.d, 0);
        v.innerHTML = '<div class="k"><b>' + items.length + ' clientes</b>, ' + con.length + ' con deuda · total ' + money(tot) + (d.map.d == null || d.map.d < 0 ? '<br><span style="color:#b3261e">No encontré la columna de la deuda: se importan solo los nombres.</span>' : '') + '</div>' +
          items.slice(0, 6).map((x) => '<div class="it"><div><b>' + esc(x.n) + '</b><small>' + esc(x.t || '') + '</small></div><div class="amt"><b>' + money(x.d || 0) + '</b></div></div>').join('') +
          (items.length > 6 ? '<div class="k" style="text-align:center">… y ' + (items.length - 6) + ' más</div>' : '') + (r.errores.length ? '<div class="k" style="color:#b3261e">' + r.errores.length + ' filas sin nombre (se saltean)</div>' : '');
        const b = o.querySelector('#icok'); b.disabled = !items.length; b.textContent = 'Importar ' + items.length + ' cliente' + (items.length === 1 ? '' : 's');
      }).catch((e) => { v.innerHTML = '<div class="k" style="color:#b3261e">' + esc((e && e.message) || 'No pude leer el archivo. Probá guardarlo como .xlsx o .csv.') + '</div>'; });
    };
    o.querySelector('#icok').onclick = function () {
      const b = this; b.disabled = true; b.textContent = 'Importando…';
      const sid = X.sid(), u = X.user(), d = X.today(), m = d.slice(0, 7), ops = [], porN = {};
      (S.cl || []).forEach((c) => { porN[String(c.n || '').trim().toLowerCase()] = c; });
      let n = 0, tot = 0;
      items.forEach((x) => {
        const a = Math.round(x.d || 0), tel = String(x.t || '').replace(/\D/g, ''), ex = porN[x.n.trim().toLowerCase()];
        const id = ex ? ex.id : 'c_' + X.rnd(10);
        if (!ex) { const c = { id, n: x.n, tel, s: a > 0 ? a : 0, u: Date.now() }; if (a > 0) c.fd = d; porN[x.n.trim().toLowerCase()] = c; ops.push((bt) => bt.set(doc(db, 'stores', sid, 'clientes', id), c)); }
        else if (a > 0) ops.push((bt) => bt.update(doc(db, 'stores', sid, 'clientes', id), Object.assign({ s: increment(a), u: Date.now() }, tel && !ex.tel ? { tel } : {})));
        if (a > 0) { n++; tot += a; const fid = uid(); ops.push((bt) => bt.set(doc(db, 'stores', sid, 'fiado', fid), { id: fid, cid: id, t: 'f', a, d, m, det: 'Deuda anterior (importada)', imp: 1, by: u.uid, bn: X.nm() })); }
      });
      let p = Promise.resolve();
      for (let i = 0; i < ops.length; i += 400) { const l = ops.slice(i, i + 400); p = p.then(() => { const bt = writeBatch(db); l.forEach((f) => f(bt)); return bt.commit(); }); }
      p.then(() => { o.remove(); alert('¡Listo! Se importaron ' + items.length + ' clientes' + (n ? ', ' + n + ' con deuda por un total de ' + money(tot) : '') + '. Están en la pestaña Fiado.'); })
        .catch((e) => { b.disabled = false; b.textContent = 'Reintentar'; alert('Se cortó a mitad: ' + ((e && e.message) || e) + '. Lo que ya se guardó quedó bien.'); });
    };
  }
  // ---------- carga rápida escaneando (cargar el negocio desde cero) ----------
  // Cámara abierta dentro de la pantalla: cada producto que se escanea abre un formulario corto.
  // Nuevo: nombre (se busca solo en Open Food Facts / Open Beauty Facts), precio, costo y cuántos hay.
  // Ya cargado: se corrige el stock contado y el precio.
  // Sin factura: el costo se estima desde el precio con el margen habitual (queda marcado como estimado, ce: 1).
  const qkKey = () => 'pk_qk_' + X.sid();
  function qkCfg() { let c = null; try { c = JSON.parse(localStorage.getItem(qkKey()) || 'null'); } catch (e) { c = null; } return Object.assign({ m: 35, r: 50 }, c || {}); }
  function qkSaveCfg(c) { try { localStorage.setItem(qkKey(), JSON.stringify(c)); } catch (e) { /* sin almacenamiento */ } }
  const precioDesde = (costo, c) => roundPrice(costo * (1 + c.m / 100), c.r);
  const costoDesde = (precio, c) => Math.round(precio / (1 + c.m / 100));
  // Nombre por código de barras en bases públicas y gratuitas (si no aparece, se escribe a mano).
  const NOMC = {}, IMGC = {}, BASEC = {};
  // Base compartida de Pekeron (productos/{código} = { n, t: foto chica, at }): lo que cargó cualquier negocio.
  // Solo nombre y foto: nunca precios, stock ni de qué negocio vino.
  function buscarBase(code) {
    if (!/^\d{8,14}$/.test(code)) return Promise.resolve(null);
    if (BASEC[code] !== undefined) return Promise.resolve(BASEC[code]);
    return getDoc(doc(db, 'productos', code)).then((s) => (BASEC[code] = s.exists() ? s.data() : null), () => (BASEC[code] = null));
  }
  // Foto desde la base pública: se baja y se achica como las fotos propias (si el navegador no deja, pasa por el servidor).
  function fotoDeUrl(url) {
    if (!url) return Promise.resolve(null);
    const bajar = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error('img'); return r.blob(); });
    return bajar(url).catch(() => (PAGOS_URL ? bajar(PAGOS_URL + '/img?u=' + encodeURIComponent(url)) : Promise.reject()))
      .then((bl) => (bl && bl.size > 500 && /^image\//.test(bl.type || 'image/') ? makePhotos(bl) : null)).then((f) => (f && f.thumb ? f : null)).catch(() => null);
  }
  // Nombre + foto para un código: primero la base de Pekeron, después Open Food Facts.
  function buscarProducto(code) {
    return buscarBase(code).then((b) => {
      if (b && b.n && b.t) return { n: b.n, thumb: b.t, hd: '', base: true, src: 'base', qs: b.qs || 0 };
      return buscarNombre(code).then((n) => {
        const nom = (b && b.n && !nombreMalo(b.n)) ? b.n : (n || (b && b.n) || '');
        return fotoDeUrl(IMGC[code]).then((f) => ({ n: nom, thumb: f ? f.thumb : '', hd: f ? f.hd : '', base: !!(b && b.n), src: f ? 'off' : '', qs: f ? Math.max(f.qs || 0, 85) : 0 }));
      });
    });
  }
  // Nombre que conviene reemplazar en la base: un código de barras, muy corto, o todo números y símbolos.
  function nombreMalo(n) { n = String(n || '').trim(); return n.length < 4 || /^[\d\s.,\-]+$/.test(n); }
  // Aporta a la base compartida el nombre y la foto de un producto con código.
  // La foto queda si no había, si es la oficial de la marca (Open Food Facts) o si es claramente mejor (10 puntos más).
  // El nombre se reemplaza solo si el que había estaba mal (un código, muy corto). Lo fijado por Pekeron no se toca.
  function aportar(code, n, thumb, qs, src) {
    if (!/^\d{8,14}$/.test(code || '') || !n || n.length < 2) return;
    const t = thumb && /^data:image\/(webp|jpeg);base64,/.test(thumb) && thumb.length < 150000 ? thumb : '';
    qs = Math.max(0, Math.min(100, Math.round(qs || 0))); src = src === 'off' ? 'off' : 'u';
    buscarBase(code).then((b) => {
      if (!b) { const o = { n: n.slice(0, 80), at: Date.now() }; if (t) Object.assign(o, { t, qs, src }); BASEC[code] = o; return setDoc(doc(db, 'productos', code), o); }
      if (b.lk) return;
      const o = {}, bq = b.qs == null ? 40 : b.qs;
      if (t && t !== b.t && (!b.t || (src === 'off' && b.src !== 'off') || (b.src !== 'off' && qs >= bq + 10))) Object.assign(o, { t, qs, src });
      if (nombreMalo(b.n) && !nombreMalo(n)) o.n = n.slice(0, 80);
      if (!Object.keys(o).length) return;
      o.at = Date.now(); Object.assign(b, o);
      return setDoc(doc(db, 'productos', code), o, { merge: true });
    }).catch(() => {});
  }
  // Una vez por día: los productos que tomaron la foto de la base (o no tienen foto) se actualizan si en la base hay otra.
  function syncFotosBase() {
    if (!load() || !X.canWrite()) return;
    const k = 'pk_fb_' + X.sid(), hoy = X.today();
    try { if (localStorage.getItem(k) === hoy) return; localStorage.setItem(k, hoy); } catch (e) { return; }
    const l = P().filter((p) => /^\d{8,14}$/.test(p.s || '') && (p.bf || !p.img)).slice(0, 60);
    l.forEach((p) => buscarBase(p.s).then((b) => {
      if (!b || !b.t || b.t === p.img) return;
      const bt = writeBatch(db);
      bt.set(ref('stock', p.id), { img: b.t, bf: 1, hd: deleteField() }, { merge: true });
      if (p.hd) bt.delete(ref('public', fotoId(p.id)));
      return bt.commit();
    }).catch(() => {}));
  }
  function buscarNombre(code) {
    if (!/^\d{8,14}$/.test(code)) return Promise.resolve('');
    if (NOMC[code] != null) return Promise.resolve(NOMC[code]);
    const one = (host) => {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(() => ctl && ctl.abort(), 3500);
      return fetch('https://' + host + '/api/v2/product/' + code + '.json?fields=product_name_es,product_name,brands,quantity,image_front_url,image_url', ctl ? { signal: ctl.signal } : {})
        .then((r) => (r.ok ? r.json() : null)).then((j) => {
          clearTimeout(t); const p = j && j.status === 1 && j.product; if (!p) return '';
          const im = String(p.image_front_url || p.image_url || ''); if (/^https:\/\/images\.open(food|beauty)facts\.org\//.test(im)) IMGC[code] = IMGC[code] || im;
          let n = String(p.product_name_es || p.product_name || '').trim(); if (!n) return '';
          const b = String(p.brands || '').split(',')[0].trim(), q = String(p.quantity || '').trim();
          if (b && n.toLowerCase().indexOf(b.toLowerCase()) < 0) n = b + ' ' + n;
          if (q && n.toLowerCase().indexOf(q.toLowerCase()) < 0) n += ' ' + q;
          return n.replace(/\s+/g, ' ').slice(0, 80);
        }).catch(() => { clearTimeout(t); return ''; });
    };
    return Promise.all([one('world.openfoodfacts.org'), one('world.openbeautyfacts.org')]).then(([a, b]) => (NOMC[code] = a || b || ''));
  }
  function qkOpen() {
    S.edit = null; S.repo = null; S.imp = null;
    S.qk = { n: 0, log: [], cur: null };
    const c = qkCfg();
    $('s-stk').innerHTML = '<button class="x" data-al="cancel" style="font-size:14px;text-decoration:underline;margin-bottom:10px">← Terminar y volver al stock</button>' +
      '<div class="card"><b style="font-size:19px">Carga rápida</b><div class="k" style="margin-top:4px">Pasá cada producto por ' + (PC ? 'el lector' : 'la cámara') + '. Si es nuevo, completás nombre, precio y cuántos hay; si ya está, corregís el stock.</div>' +
      '<label>Código de barras</label><input id="qkcod" type="search" enterkeyhint="go" inputmode="numeric" autocomplete="off" placeholder="' + (PC ? 'Pasá el producto por el lector' : 'Escribilo o usá la cámara') + '">' +
      '<div id="qkcam" style="margin-top:12px"></div>' + (PC && canScan() ? '<button class="go alt" data-al="qkcamon" id="qkcamb" style="margin-top:10px">📷 Usar la cámara en vez del lector</button>' : '') +
      '<button class="go alt" data-al="qkman" style="margin-top:10px">Producto sin código (fiambre, suelto…)</button>' +
      '<details style="margin-top:12px"><summary class="k" style="cursor:pointer">Margen y redondeo: <b id="qkcs">' + c.m + '% · ' + (c.r > 1 ? 'a $' + c.r : 'sin redondeo') + '</b></summary>' +
      '<div class="row" style="margin-top:6px"><div><label>Margen de ganancia (%)</label><input id="qkm" type="number" inputmode="decimal" min="0" value="' + c.m + '"></div><div><label>Redondear precios a</label><select id="qkr">' + [[1, 'Sin redondeo'], [10, '$10'], [50, '$50'], [100, '$100']].map(([v, t]) => '<option value="' + v + '"' + (c.r === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div></div>' +
      '<div class="k" style="margin-top:6px">Con el costo te sugiero el precio; si no tenés la factura, con el precio estimo el costo.</div></details></div>' +
      '<div id="qkform"></div><div id="qklog"></div>';
    const upd = () => { const nc = { m: Math.max(0, +$('qkm').value || 0), r: +$('qkr').value }; qkSaveCfg(nc); $('qkcs').textContent = nc.m + '% · ' + (nc.r > 1 ? 'a $' + nc.r : 'sin redondeo'); };
    $('qkm').oninput = upd; $('qkr').onchange = upd;
    const ci = $('qkcod');
    ci.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const code = ci.value.trim(); ci.value = '';
      if (!code) return;
      if (S.qk.cur) { beep(false); alert('Terminá el producto de abajo primero (Guardar o Saltear).'); return; }
      beep(true); qkShow(code);
    };
    // En la compu se usa la pistola lectora: la cámara se abre solo si la piden.
    if (!PC) qkCamOn();
    else setTimeout(() => { try { ci.focus({ preventScroll: true }); } catch (e) { ci.focus(); } }, 120);
    qkLog(); window.scrollTo(0, 0);
  }
  function qkCamOn() {
    if (!S.qk || S.qk.cam || !canScan()) return;
    const b = $('qkcamb'); if (b) b.remove();
    S.qk.cam = openScanner({
      box: $('qkcam'), multi: true,
      onCode(code) {
        if (S.qk.cur) return { ok: false, msg: 'Terminá el producto de abajo primero' };
        const p = findByCode(P(), code);
        setTimeout(() => qkShow(code), 0);
        return { ok: true, msg: p ? '✓ ' + p.n : 'Código nuevo: ' + code };
      }
    });
  }
  function qkNext() {
    const ci = $('qkcod');
    if (ci && (PC || !S.qk.cam)) setTimeout(() => { try { ci.focus({ preventScroll: true }); } catch (e) { ci.focus(); } }, 60);
  }
  function qkStop() { if (S.qk && S.qk.cam) { try { S.qk.cam.close(); } catch (e) { /* nada */ } S.qk.cam = null; } }
  function qkShow(code) {
    if (!S.qk) return;
    if (S.qk.cam) S.qk.cam.pause();
    S.qk.cur = code || '-';
    qkForm($('qkform'), code, {
      onDone(p) { S.qk.n++; S.qk.log.unshift(p); S.qk.cur = null; $('qkform').innerHTML = ''; qkLog(); if (S.qk.cam) { S.qk.cam.resume(); S.qk.cam.say('✓ ' + p.n + ' guardado. Escaneá el siguiente', 'ok'); } window.scrollTo({ top: 0, behavior: 'smooth' }); qkNext(); },
      onCancel() { S.qk.cur = null; $('qkform').innerHTML = ''; if (S.qk.cam) { S.qk.cam.resume(); S.qk.cam.say('Escaneá el siguiente producto', ''); } qkNext(); }
    });
    setTimeout(() => { const f = $('qkform'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
  }
  function qkLog() {
    const e = $('qklog'); if (!e || !S.qk) return;
    e.innerHTML = S.qk.n ? '<div class="card"><b>Cargados ahora: ' + S.qk.n + '</b>' + S.qk.log.slice(0, 10).map((p) => '<div class="it"><div><b>' + esc(p.n) + '</b><small>' + (p.s ? esc(p.s) + ' · ' : '') + (p.ce ? 'costo estimado' : p.c ? 'costo ' + money(p.c) : 'sin costo') + '</small></div><div class="amt"><b>' + (p.pn ? money(p.pn) : 'sin precio') + '</b><small>' + (p.ns ? 'sin control de stock' : 'stock ' + fq(p.q, p.w)) + '</small></div></div>').join('') + '</div>' : '';
  }
  // Formulario corto, reutilizado por la carga rápida y por la caja (código desconocido).
  function qkForm(box, code, cb) {
    const c = qkCfg(), p = code ? findByCode(P(), code) : null;
    const catOpts = catOptions((p ? p.cat : S.qkCat) || '');
    box.innerHTML = '<div class="card" style="border:2px solid var(--ink)">' +
      (p ? '<b style="font-size:18px">' + esc(p.n) + '</b><div class="k">Ya está cargado · código ' + esc(p.s) + ' · ' + (p.ns ? 'sin control de stock' : 'stock ' + fq(p.q, p.w)) + '</div>'
        : '<b style="font-size:18px">Producto nuevo</b><div class="k">' + (code ? 'Código ' + esc(code) : 'Sin código de barras') + '</div>' +
          '<label>Nombre</label><input id="qk_n" maxlength="80" autocomplete="off" placeholder="' + (code ? 'Buscando el nombre…' : 'Ej: Queso cremoso') + '"><div class="k" id="qk_nf" style="margin-top:4px"></div><div id="qk_ph"></div>' +
          '<div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px"><label class="x" style="display:inline-block;margin:0;font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);cursor:pointer">📷 Sacar o subir foto<input id="qk_pf" type="file" accept="image/*" hidden></label>' +
          (X.fotosOn && X.fotosOn() ? '<button type="button" class="x" id="qk_px" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink)">🖼️ Buscar foto publicitaria</button>' : '') + '</div>' +
          '<label>Categoría</label><select id="qk_c"><option value="">Sin categoría</option>' + catOpts + '</select>' +
          '<label class="row" style="align-items:center;gap:8px;margin-top:12px;font-weight:600;color:var(--ink)"><input id="qk_w" type="checkbox" style="width:auto"' + (code ? '' : ' checked') + '> Se vende por peso (kg)</label>') +
      '<div class="row"><div><label id="qk_lp">Precio de venta</label><input id="qk_p" type="number" inputmode="decimal" min="0" placeholder="0" value="' + (p && p.pn ? p.pn : '') + '"></div>' +
      '<div><label id="qk_lc">Costo' + (p ? '' : ' (opcional)') + '</label><input id="qk_co" type="number" inputmode="decimal" min="0" placeholder="' + (p && p.c ? p.c : 'si no sabés, vacío') + '" value=""></div></div>' +
      '<div class="k" id="qk_hint" style="margin-top:6px"></div>' +
      '<label class="row" style="align-items:flex-start;gap:8px;margin-top:12px;font-weight:600;color:var(--ink)"><input id="qk_ns" type="checkbox" style="width:auto;margin-top:3px"' + (p && p.ns ? ' checked' : '') + '><span>Sin control de stock (siempre disponible)<small style="display:block;font-weight:400;color:var(--mut);margin-top:2px">Para fiambres, sueltos o cosas que no sabés cuántas hay.</small></span></label>' +
      '<div id="qk_qrow"' + (p && p.ns ? ' hidden' : '') + '><label id="qk_lq">' + (p ? '¿Cuántos hay? (stock contado)' : '¿Cuántos hay?') + '</label><input id="qk_q" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (p && !p.ns ? n3(p.q) : '') + '" enterkeyhint="done"></div>' +
      '<div class="row" style="gap:8px"><button class="go" id="qk_ok">Guardar</button><button class="go alt" id="qk_x">' + (cb.cancelTxt || 'Saltear') + '</button></div></div>';
    const q = (id) => box.querySelector('#' + id);
    let pTouched = !!(p && p.pn);
    const isW = () => (p ? p.w : q('qk_w').checked);
    const labels = () => { const w = isW(); q('qk_lp').textContent = 'Precio de venta' + (w ? ' por kg' : ''); q('qk_lc').textContent = 'Costo' + (w ? ' por kg' : '') + (p ? '' : ' (opcional)'); q('qk_lq').textContent = (p ? '¿Cuántos hay? (stock contado)' : '¿Cuántos hay?') + (w ? ' en kg' : ''); };
    const hint = () => {
      const pr = +q('qk_p').value, co = +q('qk_co').value;
      q('qk_hint').textContent = co > 0 && pr > 0 ? 'Ganás ' + money(pr - co) + ' (' + Math.round((pr - co) / pr * 100) + '% del precio)'
        : pr > 0 && !co ? 'Sin factura: el costo queda estimado en ' + money(costoDesde(pr, c)) + ' (' + c.m + '% de margen). Se corrige solo cuando cargues una compra en Reponer.' : '';
    };
    q('qk_co').oninput = () => { const co = +q('qk_co').value; if (!pTouched && co > 0) q('qk_p').value = precioDesde(co, c); hint(); };
    q('qk_p').oninput = () => { pTouched = q('qk_p').value !== ''; hint(); };
    if (!p) { q('qk_w').onchange = labels; q('qk_c').onchange = () => { setTimeout(() => { const v = q('qk_c').value; S.qkCat = v === '__new' ? '' : v; }); }; }
    labels(); hint();
    q('qk_ns').onchange = function () { q('qk_qrow').hidden = this.checked; if (!this.checked) q('qk_q').focus(); };
    const first = p ? (p.ns ? q('qk_p') : q('qk_q')) : q('qk_n');
    setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, 120);
    let FOTO = null;
    const fotoDraw = () => { const e = q('qk_ph'); if (!e) return; e.innerHTML = FOTO ? '<div style="display:flex;align-items:center;gap:12px;margin-top:10px"><img src="' + FOTO.thumb + '" alt="" style="width:72px;height:72px;object-fit:contain;border-radius:12px;background:#fff;border:1px solid var(--line)"><div class="k" style="margin:0">' + (FOTO.src === 'u' ? '📷 Tu foto: se usa en el catálogo.' : FOTO.src === 'px' ? '🖼️ Foto publicitaria: se usa en el catálogo.' : '📷 Foto encontrada: se usa en el catálogo.') + '<br><button class="x" id="qk_phx" style="font-size:13px;text-decoration:underline">Quitar foto</button></div></div>' : ''; const x = q('qk_phx'); if (x) x.onclick = () => { FOTO = null; fotoDraw(); }; };
    if (!p && code) buscarProducto(code).then((r) => {
      const el = q('qk_n'); if (!el) return;
      el.placeholder = 'Ej: Galletitas Oreo 118 g';
      if (r.n && !el.value) { el.value = r.n; q('qk_nf').textContent = '✓ ' + (r.base ? 'Ya lo cargó otro negocio de Pekeron' : 'Nombre encontrado en la base de productos') + ' (podés corregirlo)'; try { q('qk_p').focus({ preventScroll: true }); } catch (e) { /* nada */ } }
      else if (!r.n) q('qk_nf').textContent = 'No lo encontré en la base de productos: escribí el nombre.';
      if (r.thumb) { FOTO = { thumb: r.thumb, hd: r.hd || '', src: r.src, qs: r.qs || 0 }; fotoDraw(); }
    });
    q('qk_pf').onchange = function () { const f = this.files && this.files[0]; this.value = ''; if (!f) return;
      X.readPhoto(f, (o, hd, qs) => { if (!o) { alert('No pude leer esa foto. Probá con otra.'); return; } FOTO = { thumb: o, hd: hd || '', src: 'u', qs: qs || 0 }; fotoDraw(); }); };
    if (q('qk_px')) q('qk_px').onclick = () => X.fotoPub(q('qk_n').value || '', (o, hd, qs) => { FOTO = { thumb: o, hd: hd || '', src: 'px', qs: qs || 0 }; fotoDraw(); });
    q('qk_q').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); q('qk_ok').click(); } };
    q('qk_x').onclick = () => cb.onCancel();
    q('qk_ok').onclick = () => {
      const pr = +q('qk_p').value || 0, coIn = q('qk_co').value === '' ? null : +q('qk_co').value, ns = q('qk_ns').checked, qs = ns ? '' : q('qk_q').value.trim(), cant = qs === '' ? null : r3(pnum(qs)), w = isW();
      if (pr < 0 || (coIn != null && coIn < 0)) { alert('Los precios no pueden ser negativos.'); return; }
      if (/^\d{8,14}$/.test(qs)) { q('qk_q').value = ''; beep(false); alert('Eso parece un código de barras, no una cantidad. Terminá este producto (escribí cuántos hay y tocá Guardar) antes de pasar el siguiente.'); q('qk_q').focus(); return; }
      if (cant != null && (isNaN(cant) || cant < 0)) { alert('Revisá la cantidad (usá números, por ejemplo 12 o 1,5).'); return; }
      if (cant != null && !w && cant !== Math.floor(cant)) { alert('Este producto se vende por unidad: la cantidad tiene que ser entera.'); return; }
      if (p) {
        const o = {};
        if (pr > 0 && pr !== p.pn) o.pn = pr;
        if (coIn != null && coIn > 0) { o.c = coIn; o.ce = deleteField(); }
        if (cant != null) o.q = cant;
        if (ns !== !!p.ns) o.ns = ns;
        const done = Object.assign({}, p, { pn: o.pn || p.pn, c: o.c || p.c, q: cant != null ? cant : p.q, ce: o.c ? 0 : p.ce, ns });
        if (!Object.keys(o).length) { cb.onDone(done); return; }
        q('qk_ok').disabled = true;
        setDoc(ref('stock', p.id), o, { merge: true }).catch(failW); cb.onDone(done); return;
      }
      const n = q('qk_n').value.trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!n) { alert('Escribí el nombre del producto.'); q('qk_n').focus(); return; }
      if (code && findByCode(P(), code)) { alert('Ese código ya está cargado.'); return; }
      const ce = coIn == null && pr > 0, co = coIn != null ? coIn : (pr > 0 ? costoDesde(pr, c) : 0);
      const id = 'al_' + X.rnd(10), o = { n, s: code || '', cat: q('qk_c').value === '__new' ? '' : q('qk_c').value, w, pn: pr, c: co, q: cant || 0, min: 0, oh: false, alm: 1 };
      if (ns) o.ns = true;
      if (ce) o.ce = 1;
      if (FOTO) { o.img = FOTO.thumb; if (FOTO.hd) o.hd = 1; if (FOTO.src === 'base' || FOTO.src === 'off') o.bf = 1; }   // foto de la base: se actualiza si aparece una mejor
      q('qk_ok').disabled = true;
      const bq = writeBatch(db); bq.set(ref('stock', id), o, { merge: true }); if (FOTO && FOTO.hd) bq.set(ref('public', fotoId(id)), { f: FOTO.hd, at: Date.now() });
      bq.commit().catch(failW);
      // a la base de códigos va la foto oficial o la propia (con su puntaje), nunca la publicitaria
      if (code) aportar(code, n, FOTO && (FOTO.src === 'off' || FOTO.src === 'u') ? FOTO.thumb : '', FOTO ? FOTO.qs || 0 : 0, FOTO && FOTO.src === 'off' ? 'off' : 'u');
      cb.onDone(Object.assign({ id }, o));
    };
  }
  // Desde la caja: código que no existe -> cargarlo en el momento y seguir la venta.
  function qkModal(code, after) {
    const o = modal('<div id="qkm_box"></div>');
    const box = o.querySelector('#qkm_box');
    qkForm(box, code, { cancelTxt: 'Cancelar', onDone(p) { o.remove(); if (after) after(p); }, onCancel() { o.remove(); } });
  }
  // Caja: cobrar algo que no está cargado (no descuenta stock).
  function libreDlg() {
    const o = modal('<b style="font-size:19px">Importe libre</b><div class="k" style="margin-top:4px">Para cobrar algo que todavía no cargaste. No descuenta stock.</div>' +
      '<label>Importe</label><input id="lb_i" type="number" inputmode="decimal" min="0" placeholder="0">' +
      '<label>Qué es (opcional)</label><input id="lb_n" maxlength="60" placeholder="Varios" autocomplete="off">' +
      '<button class="go" id="lb_ok">Agregar a la venta</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const i = o.querySelector('#lb_i'); setTimeout(() => i.focus(), 50);
    const ok = () => {
      const v = Math.round((+i.value || 0) * 100) / 100; if (!(v > 0)) { alert('Poné el importe.'); return; }
      S.cart.push({ id: 'lib_' + uid(), n: o.querySelector('#lb_n').value.trim().slice(0, 60) || 'Varios', q: 1, u: v, c: 0, w: false });
      o.remove(); renderCart();
    };
    o.querySelector('#lb_ok').onclick = ok; i.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
  }

  // ---------- importar desde Excel / CSV (planilla.js) ----------
  const MAX_IMP = 5000;
  function impOpen() { S.edit = null; S.repo = null; S.imp = { step: 'file' }; renderImp(); window.scrollTo(0, 0); }
  const colName = (i) => { let s = '', n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  function renderImp() {
    const I = S.imp, box = $('s-stk');
    let h = I.step === 'run' ? '' : '<button class="x" data-al="cancel" style="font-size:14px;text-decoration:underline;margin-bottom:10px">← Volver al stock</button>';
    if (I.step === 'file') {
      h += '<div class="card"><b style="font-size:19px">Importar productos desde Excel</b><div class="k" style="margin-top:4px">Si ya tenés tus productos en una planilla (de Excel o la que exporta tu sistema anterior), cargalos todos de una vez. Sirven archivos <b>.xlsx</b> y <b>.csv</b>.</div>' +
        '<label>Elegí el archivo</label><input id="impf" type="file" accept=".xlsx,.xlsm,.csv,.txt,.xls,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv">' +
        '<div class="bn" style="margin:16px 0 0;background:var(--line)"><b>¿Cómo tiene que estar la planilla?</b><br>Una fila por producto y los títulos arriba. Lo único obligatorio es el <b>nombre</b>; conviene que tenga <b>precio de venta</b> y, si lo tenés, el <b>código de barras</b> (así después se escanea en la caja). También puede traer costo, stock, categoría y si se vende por peso. Las columnas pueden estar en cualquier orden y con otros nombres: en el paso siguiente elegís cuál es cuál.</div>' +
        '<button class="go alt" data-al="impej">Descargar planilla de ejemplo</button>' +
        '<div class="k" style="margin-top:10px">¿Tu archivo es .xls (Excel viejo)? Abrilo y guardalo como .xlsx. En Google Sheets: Archivo → Descargar → .xlsx.</div></div>';
      box.innerHTML = h;
      $('impf').onchange = function () { const f = this.files && this.files[0]; if (f) impLeer(f); };
      return;
    }
    if (I.step === 'map') {
      const cols = Math.max(...I.rows.slice(Math.max(0, I.head), Math.max(0, I.head) + 30).map((r) => r.length), 0);
      const hdr = I.head >= 0 ? I.rows[I.head] : [], sample = I.rows[I.head + 1] || [];
      const opt = (k) => '<option value="-1">— No está en la planilla —</option>' + Array.from({ length: cols }, (_, i) => {
        const t = String(hdr[i] == null ? '' : hdr[i]).trim() || String(sample[i] == null ? '' : sample[i]).trim().slice(0, 24);
        return '<option value="' + i + '"' + (I.map[k] === i ? ' selected' : '') + '>Columna ' + colName(i) + (t ? ': ' + esc(t) : '') + '</option>';
      }).join('');
      h += '<div class="card"><b style="font-size:19px">' + esc(I.name) + '</b><div class="k" style="margin-top:2px">' + (I.rows.length - I.head - 1) + ' filas. Revisá qué columna es cada dato (ya elegí las que reconocí).</div>' +
        '<label>Los títulos están en la fila</label><select id="imph">' + I.rows.slice(0, 15).map((r, i) => '<option value="' + i + '"' + (I.head === i ? ' selected' : '') + '>Fila ' + (i + 1) + ': ' + esc(r.filter((c) => String(c).trim()).slice(0, 3).join(' · ').slice(0, 40)) + '</option>').join('') + '<option value="-1"' + (I.head < 0 ? ' selected' : '') + '>No tiene títulos</option></select>' +
        CAMPOS.map((f) => '<label>' + f.t + (f.req ? ' *' : '') + '</label><select class="impm" data-k="' + f.k + '">' + opt(f.k) + '</select>').join('') +
        '<label style="margin-top:18px">Productos que ya están cargados (mismo código o mismo nombre)</label><select id="impu"><option value="upd"' + (I.upd !== 'skip' ? ' selected' : '') + '>Actualizar precio, costo y categoría</option><option value="skip"' + (I.upd === 'skip' ? ' selected' : '') + '>Dejarlos como están</option></select>' +
        '<div id="impsw"><label>Stock</label><select id="imps"><option value="set"' + (I.stk === 'set' || !I.stk ? ' selected' : '') + '>Poner la cantidad de la planilla</option><option value="add"' + (I.stk === 'add' ? ' selected' : '') + '>Sumar la planilla al stock actual</option><option value="no"' + (I.stk === 'no' ? ' selected' : '') + '>No tocar el stock</option></select></div>' +
        '<div id="impprev"></div><div id="impsum"></div><button class="go" data-al="impgo" id="impgo">Importar</button></div>';
      box.innerHTML = h;
      box.querySelectorAll('.impm').forEach((x) => { x.onchange = () => { I.map[x.dataset.k] = +x.value; impCalc(); }; });
      $('imph').onchange = function () { I.head = +this.value; const d = detectar(I.rows.slice(Math.max(0, I.head))); if (I.head >= 0 && d.head === 0) I.map = d.map; renderImp(); };
      $('impu').onchange = function () { I.upd = this.value; impCalc(); };
      $('imps').onchange = function () { I.stk = this.value; impCalc(); };
      impCalc();
      return;
    }
    if (I.step === 'run') {
      const pc = I.total ? Math.round(I.done / I.total * 100) : 0;
      box.innerHTML = '<div class="card"><b style="font-size:19px">Importando…</b><div class="k" style="margin-top:6px">' + I.done + ' de ' + I.total + ' productos. No cierres la app.</div><div style="height:10px;border-radius:5px;background:var(--line);margin-top:14px;overflow:hidden"><div style="height:100%;width:' + pc + '%;background:var(--sell);transition:width .3s"></div></div></div>';
      return;
    }
    if (I.step === 'done') {
      const R = I.res;
      h += '<div class="card"><b style="font-size:19px">' + (R.fail ? 'Importación incompleta' : '✓ Listo') + '</b><div style="margin-top:8px;line-height:1.5">' +
        (R.nuevos ? '<b>' + R.nuevos + '</b> producto' + (R.nuevos === 1 ? '' : 's') + ' nuevo' + (R.nuevos === 1 ? '' : 's') + '<br>' : '') + (R.act ? '<b>' + R.act + '</b> actualizado' + (R.act === 1 ? '' : 's') + '<br>' : '') +
        (R.err ? R.err + ' fila' + (R.err === 1 ? '' : 's') + ' salteada' + (R.err === 1 ? '' : 's') + '<br>' : '') + '</div>' +
        (R.fail ? '<div class="bn warn" style="margin:12px 0 0">Se cortó a mitad (' + esc(R.fail) + '). Lo que ya se guardó quedó bien: volvé a importar el mismo archivo y los que ya están se actualizan en vez de repetirse.</div>' : '') +
        (R.sinCod ? '<div class="bn" style="margin:12px 0 0;background:var(--line)"><b>' + R.sinCod + ' producto' + (R.sinCod === 1 ? '' : 's') + ' sin código de barras.</b> Para que se puedan escanear en la caja, en Stock tocá "Sin código" y escaneá cada uno, o escaneá desde el buscador y elegí a qué producto es.</div>' : '') +
        '<button class="go" data-al="cancel">Ver el stock</button></div>';
      box.innerHTML = h;
    }
  }
  function impLeer(file) {
    const st = $('impf'); if (st) st.disabled = true;
    leerArchivo(file).then((rows) => {
      if (!rows.length) { alert('El archivo está vacío o no pude encontrar datos en la primera hoja.'); renderImp(); return; }
      const d = detectar(rows);
      Object.assign(S.imp, { step: 'map', name: file.name, rows, head: d.head, map: d.map, upd: 'upd', stk: 'set' });
      renderImp();
    }).catch((e) => {
      const c = e && e.code;
      alert(c === 'xls' ? 'Ese archivo es de Excel viejo (.xls). Abrilo en Excel y guardalo como .xlsx (Archivo → Guardar como), o en Google Sheets: Archivo → Descargar → .xlsx. Después volvé a elegirlo acá.'
        : c === 'ods' ? 'Ese archivo es de LibreOffice (.ods). Guardalo como .xlsx o .csv y volvé a elegirlo.'
        : c === 'nav' ? 'Tu navegador no puede abrir archivos .xlsx. Actualizalo, o guardá la planilla como .csv y elegí ese.'
        : 'No pude leer ese archivo. Probá guardarlo como .xlsx o .csv.');
      renderImp();
    });
  }
  function impCalc() {
    const I = S.imp, ok = I.map.n != null && I.map.n >= 0;
    $('impsw').hidden = !(I.map.q >= 0);
    const btn = $('impgo');
    if (!ok) { $('impprev').innerHTML = ''; $('impsum').innerHTML = '<div class="bn warn" style="margin:14px 0 0">Elegí qué columna tiene el <b>nombre</b> del producto.</div>'; btn.disabled = true; return; }
    const A = armar(I.rows, I.head, I.map), Pl = plan(A.items, P());
    I.A = A; I.Pl = Pl;
    const show = A.items.slice(0, 5), has = (k) => I.map[k] != null && I.map[k] >= 0;
    $('impprev').innerHTML = '<label style="margin-top:18px">Así van a quedar (primeros ' + show.length + ')</label>' + show.map((x) => '<div class="it" style="padding:10px 0"><div><b>' + esc(x.n) + '</b><small>' +
      (x.cat ? '<em class="tag">' + esc(x.cat) + '</em>' : '') + [has('s') ? (x.s ? 'código ' + esc(x.s) : 'sin código') : '', has('c') && x.c != null ? 'costo ' + money(x.c) : '', has('q') && x.q != null ? 'stock ' + fq(x.q, x.w) : ''].filter(Boolean).join(' · ') +
      '</small></div><div class="amt"><b>' + (has('pn') ? (x.pn ? money(x.pn) + (x.w ? '<span class="k"> /kg</span>' : '') : '<span class="k">sin precio</span>') : '') + '</b></div></div>').join('');
      '<tr style="color:var(--mut);text-align:left"><th style="padding:6px 6px 6px 0">Nombre</th>' + (has('s') ? '<th>Código</th>' : '') + (has('pn') ? '<th>Precio</th>' : '') + (has('c') ? '<th>Costo</th>' : '') + (has('q') ? '<th>Stock</th>' : '') + '</tr>' +
      show.map((x) => '<tr style="border-top:1px solid var(--line)"><td style="padding:6px 6px 6px 0;font-weight:700">' + esc(x.n) + (x.w ? ' <span class="k">(kg)</span>' : '') + (x.cat ? '<br><span class="k">' + esc(x.cat) + '</span>' : '') + '</td>' + (has('s') ? '<td>' + esc(x.s || '—') + '</td>' : '') + (has('pn') ? '<td>' + (x.pn ? money(x.pn) : '—') + '</td>' : '') + (has('c') ? '<td>' + (x.c != null ? money(x.c) : '—') + '</td>' : '') + (has('q') ? '<td>' + (x.q != null ? fq(x.q, x.w) : '—') + '</td>' : '') + '</tr>').join('') + '</table></div>';
    const n = Pl.nuevos.length, u = I.upd === 'skip' ? 0 : Pl.actualizar.length, sinP = A.items.filter((x) => !x.pn).length, sinC = A.items.filter((x) => !x.s).length;
    const tot = n + u;
    $('impsum').innerHTML = '<div class="bn" style="margin:16px 0 0;background:var(--line);line-height:1.5">' +
      (n ? 'Se van a crear <b>' + n + '</b> producto' + (n === 1 ? '' : 's') + ' nuevo' + (n === 1 ? '' : 's') + '.<br>' : '') +
      (Pl.actualizar.length ? (I.upd === 'skip' ? Pl.actualizar.length + ' ya están cargados y se dejan como están.' : 'Se van a actualizar <b>' + u + '</b> que ya estaban cargados.') + '<br>' : '') +
      (A.errores.length ? A.errores.length + ' fila' + (A.errores.length === 1 ? '' : 's') + ' se saltea' + (A.errores.length === 1 ? '' : 'n') + ' (' + esc(A.errores.slice(0, 4).map((e) => 'fila ' + e.fila + ': ' + e.motivo.toLowerCase()).join('; ')) + (A.errores.length > 4 ? '…' : '') + ').<br>' : '') +
      (sinP && has('pn') ? sinP + ' sin precio de venta (los vas a poder completar después).<br>' : !has('pn') ? 'La planilla no tiene precio: los productos quedan sin precio hasta que lo cargues.<br>' : '') +
      (sinC ? sinC + ' sin código de barras: después los podés escanear en Stock → "Sin código".' : '') + '</div>' +
      (tot > MAX_IMP ? '<div class="bn warn" style="margin:12px 0 0">Son muchos productos: se pueden importar hasta ' + MAX_IMP + ' por vez. Partí la planilla en varias.</div>' : '');
    btn.disabled = !tot || tot > MAX_IMP;
    btn.textContent = tot ? 'Importar ' + tot + ' producto' + (tot === 1 ? '' : 's') : 'No hay nada para importar';
  }
  async function impRun() {
    const I = S.imp; if (!I || !I.Pl) return;
    if (!X.canWrite()) { alert('El acceso venció: por ahora no se pueden cargar productos.'); return; }
    const hasQ = I.map.q >= 0, stk = hasQ ? I.stk : 'no', ops = [];
    I.Pl.nuevos.forEach((it) => ops.push([ref('stock', 'al_' + X.rnd(10)), { n: it.n, s: it.s || '', cat: it.cat || '', w: !!it.w, pn: it.pn || 0, c: it.c || 0, q: stk !== 'no' && it.q != null ? it.q : 0, min: 0, oh: false, alm: 1 }]));
    if (I.upd !== 'skip') I.Pl.actualizar.forEach(({ it, p }) => {
      const o = {};
      if (it.pn != null && it.pn > 0) o.pn = it.pn;
      if (it.c != null) o.c = it.c;
      if (it.cat) o.cat = it.cat;
      if (it.s && !p.s) o.s = it.s;
      if (it.w != null) o.w = !!it.w;
      if (stk === 'set' && it.q != null) o.q = it.q; else if (stk === 'add' && it.q) o.q = increment(it.q);
      if (Object.keys(o).length) ops.push([ref('stock', p.id), o]);
    });
    Object.assign(I, { step: 'run', total: ops.length, done: 0 }); renderImp();
    let fail = '';
    for (let k = 0; k < ops.length; k += 400) {
      const b = writeBatch(db);
      ops.slice(k, k + 400).forEach(([r, o]) => b.set(r, o, { merge: true }));
      try { await b.commit(); } catch (e) { fail = deny(e) ? 'faltan permisos' : 'sin conexión o error de Firebase'; break; }
      I.done = Math.min(ops.length, k + 400); if (S.imp === I) renderImp();
    }
    const sinCod = I.A.items.filter((x) => !x.s).length;
    I.res = { nuevos: Math.min(I.Pl.nuevos.length, I.done), act: Math.max(0, I.done - I.Pl.nuevos.length), err: I.A.errores.length, sinCod, fail };
    I.step = 'done'; if (S.imp === I) renderImp();
  }
  function impEjemplo() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ejemploCsv()], { type: 'text/csv;charset=utf-8' }));
    a.download = 'planilla-productos-ejemplo.csv'; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- escáner con la cámara (scanner.js) ----------
  const later = (f) => setTimeout(f, 320); // después de que se cierra el escáner
  const offerNew = (code) => {
    if (!load()) { alert('No hay ningún producto con el código ' + code + '.'); return; }
    const o = modal('<b style="font-size:19px">Código ' + esc(code) + '</b><div class="k" style="margin-top:4px">No hay ningún producto con este código. ¿Qué es?</div>' +
      '<button class="go" id="on_ya">Es un producto que ya cargué</button><div class="k" style="margin-top:6px">Por ejemplo, si lo importaste desde Excel sin código: elegilo y le queda asignado.</div>' +
      '<button class="go alt" id="on_new">Es un producto nuevo</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelector('#on_new').onclick = () => { o.remove(); S.repo = null; prodForm(null, code); };
    o.querySelector('#on_ya').onclick = () => { o.remove(); pickForCode(code); };
  };
  // Asignar un código escaneado a un producto que ya existe (elegido de una lista con buscador).
  function pickForCode(code) {
    const o = modal('<b style="font-size:19px">¿A qué producto es?</b><div class="k" style="margin-top:4px">Código ' + esc(code) + '. Primero aparecen los que no tienen código.</div>' +
      '<input id="pf_q" type="search" placeholder="Buscar por nombre" autocomplete="off" style="margin-top:12px"><div id="pf_l" style="max-height:52vh;overflow:auto"></div>' +
      '<button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const q = o.querySelector('#pf_q'), list = o.querySelector('#pf_l');
    const draw = () => {
      const l = P().filter((p) => match(p.n + ' ' + p.cat, q.value)).sort((a, b) => (a.s ? 1 : 0) - (b.s ? 1 : 0) || a.n.localeCompare(b.n)).slice(0, 40);
      list.innerHTML = l.map((p) => '<button class="pl" data-pid="' + esc(p.id) + '"><span><b>' + esc(p.n) + '</b><small>' + (p.s ? 'ya tiene el código ' + esc(p.s) : 'sin código') + (p.cat ? ' · ' + esc(p.cat) : '') + '</small></span><b>' + priceTxt(p) + '</b></button>').join('') || '<div class="empty">No encontré productos con ese nombre.</div>';
    };
    q.oninput = draw; draw(); setTimeout(() => q.focus(), 50);
    list.onclick = (e) => {
      const b = e.target.closest('[data-pid]'); if (!b) return;
      const p = prod(b.dataset.pid); if (!p) return;
      if (p.s && !confirm('"' + p.n + '" ya tiene el código ' + p.s + '. ¿Lo reemplazo por ' + code + '?')) return;
      o.remove(); setCode(p, code);
    };
  }
  function setCode(p, code) {
    setDoc(ref('stock', p.id), { s: code }, { merge: true }).then(() => {
      if (S.repo) { S.repo.id = p.id; S.repo.note = 0; renderRepo(); return; }
      // Desde Stock: se abre la ficha del producto para cargar precio de venta y stock contado sin buscarlo de nuevo.
      prodForm(p.id); const f = $('fs'); if (f) f.value = code;
    }).catch(failW);
  }
  // Desde el filtro "Sin código": escanear el código de un producto puntual.
  function asigCod(id) {
    const p = prod(id); if (!p) return;
    openScanner({
      title: 'Código de: ' + p.n,
      onCode(code) {
        const dup = findByCode(P(), code);
        if (dup && dup.id !== p.id) return { ok: false, msg: 'Ese código ya es de "' + dup.n + '". Probá con otro.' };
        later(() => setCode(p, code));
        return { ok: true, close: true, msg: '✓ ' + p.n + ' · ' + code };
      }
    });
  }
  function scanCaja() {
    openScanner({
      title: 'Escaneá los productos', multi: true,
      onCode(code) {
        const p = findByCode(P(), code);
        if (!p) { const bl = balLine(code); if (bl) { if (bl.err) return { ok: false, msg: bl.err }; S.cart.push(bl.line); S.last = ''; later(() => renderCart()); return { ok: true, msg: '✓ ' + bl.line.n + ' · ' + fq(bl.line.q, true) + ' · ' + money(lineTotal(bl.line)) }; } }
        if (!p && load()) { later(() => qkModal(code, (np) => addProd(np))); return { ok: false, close: true, msg: 'Código nuevo: cargalo y sigue la venta' }; }
        if (!p) return { ok: false, msg: 'No hay ningún producto con el código ' + code + '. Avisale a quien carga los productos.' };
        if (!p.pn) { later(() => precioDlg(p, (np) => addProd(np, true))); return { ok: true, close: true, msg: p.n + ': ponele el precio' }; }
        if (p.w) { later(() => weightDlg(p)); return { ok: true, close: true, msg: p.n }; }
        addProd(p, true);
        let u = 0; S.cart.forEach((l) => { u += l.w ? 1 : l.q; });
        return { ok: true, msg: '✓ ' + p.n + ' · ' + money(p.pn) + '  (' + u + ' en la venta)' };
      }
    });
  }
  function scanStock() {
    openScanner({
      title: 'Escaneá el producto',
      onCode(code) {
        const p = findByCode(P(), code);
        if (p) { later(() => { S.stQ = p.s; S.stCat = ''; S.stLow = false; const q = $('aq'); if (q) q.value = p.s; renderStock(); }); return { ok: true, close: true, msg: p.n }; }
        later(() => offerNew(code)); return { ok: true, close: true, msg: code };
      }
    });
  }
  function scanRepo() {
    openScanner({
      title: 'Escaneá lo que compraste',
      onCode(code) {
        const p = findByCode(P(), code);
        if (p) { later(() => { if (S.repo) { S.repo.id = p.id; renderRepo(); } }); return { ok: true, close: true, msg: p.n }; }
        later(() => offerNew(code)); return { ok: true, close: true, msg: code };
      }
    });
  }
  function scanField() {
    openScanner({
      title: 'Escaneá el código del producto',
      onCode(code) {
        const dup = findByCode(P(), code);
        if (dup && S.edit && !S.edit.id) { // producto nuevo, pero ese código ya está cargado: es una reposición
          later(() => { repoForm(dup.id); S.repo.note = 1; renderRepo(); });
          return { ok: true, close: true, msg: dup.n + ' ya está cargado' };
        }
        later(() => {
          const f = $('fs'); if (f) f.value = code;
          if (dup && (!S.edit || dup.id !== S.edit.id)) alert('Ojo: ese código ya lo tiene "' + dup.n + '".');
        });
        return { ok: true, close: true, msg: code };
      }
    });
  }

  // ---------- clics y cambios ----------
  document.addEventListener('click', (e) => {
    if (!X.isAlm()) return;
    const el = e.target.closest && e.target.closest('[data-al]'); if (!el) return;
    const a = el.dataset.al, id = el.dataset.id, i = +el.dataset.i;
    if (a === 'cat') { S.cat = S.cat === el.dataset.v ? '' : el.dataset.v; renderCats(); renderRes(); }
    else if (a === 'add') { const p = prod(id); if (p) addProd(p); }
    else if (a === 'addpromo') addPromo(id);
    else if (a === 'sw') swDlg();
    else if (a === 'inc') { S.cart[i].q += 1; renderCart(); }
    else if (a === 'dec') { if (S.cart[i].q > 1) S.cart[i].q -= 1; else S.cart.splice(i, 1); renderCart(); }
    else if (a === 'rm') { S.cart.splice(i, 1); renderCart(); }
    else if (a === 'wedit') { const l = S.cart[i], p = prod(l.id) || { n: l.n, pn: l.u }; weightDlg(Object.assign({}, p, { pn: l.u }), i); }
    else if (a === 'clear') { if (confirm('¿Vaciar la venta en curso?')) { S.cart = []; S.paga = ''; S.env = null; S.ped = null; renderCart(); } }
    else if (a === 'envadd') { if (RPm()) RPm().dlg((v) => { S.env = v; renderCart(); }); }
    else if (a === 'envx') { S.env = null; renderCart(); }
    else if (a === 'aped') pedidoDlg();
    else if (a === 'pay') { S.pay = el.dataset.v; renderCart(); }
    else if (a === 'apsel') { S.apSel = el.dataset.v; S.apTot = ''; renderCart(); }
    else if (a === 'apcfg') appsCfg();
    else if (a === 'apcob') apCobro(el.dataset.id);
    else if (a === 'aphist') apHist(el.dataset.id);
    else if (a === 'paga') { S.paga = el.dataset.v; renderCart(); }
    else if (a === 'tkpr') { if (S.lastTk) imprimir(S.lastTk); }
    else if (a === 'tkv') { const v = S.hoy.concat(S.dayV || []).find((x) => String(x.id) === String(el.dataset.id)); if (v) imprimir(ticketDeVenta(v)); }
    else if (a === 'tkcfg') abrirTiketera(S.lastTk || { tienda: X.sname(), dir: (X.pub() || {}).addr || '', atendio: X.nm(), lineas: [{ n: 'Yerba mate 1 kg', q: 2, u: 4500 }, { n: 'Queso cremoso', q: 0.35, u: 9800, w: true }], tot: 12430, pago: 'Efectivo', paga: 15000, vuelto: 2570 }, (cf, ej) => { syncPuesto(); if (ej) imprimir(ej); renderHoy(); });
    else if (a === 'pickcli') { S.cli = id || ''; renderCart(); }
    else if (a === 'cobrar') cobrar();
    else if (a === 'cjopen') cajaOpen();
    else if (a === 'prby') { S.prBy = el.dataset.v; drawRes(); }
    else if (a === 'prall') { S.prAll = !S.prAll; drawRes(); }
    else if (a === 'xven') expVentas();
    else if (a === 'xtop') expTop();
    else if (a === 'xstk') expStock();
    else if (a === 'baldlg') balDlg();
    else if (a === 'demo') demoDlg();
    else if (a === 'demodel') { const ids = P().filter((p) => p.demo).map((p) => p.id); if (ids.length && confirm('¿Borrar los ' + ids.length + ' productos de ejemplo?')) borrarDemo({ db, sid: X.sid(), ids }).catch(failW); }
    else if (a === 'cjmov') cajaMov();
    else if (a === 'cjdet') cajaDet();
    else if (a === 'stval') stockValDlg();
    else if (a === 'pxp') X.fotoPub(($('fn') || {}).value || '', (o, hd, qs) => { if (!S.edit) return; S.edit.img = o; S.edit.hd = hd || ''; S.edit.qs = qs || 0; S.edit.px = 1; const v = $('fph'); if (v) { v.src = o; v.style.display = ''; } });
    else if (a === 'cjclose') cajaClose();
    else if (a === 'cjfix') { const c = (S.cajasM || []).find((x) => x.id === id); if (c) { document.querySelectorAll('.almdlg').forEach((e) => e.remove()); cajaFix(c); } }
    else if (a === 'cjver') { const c = (S.cajasM || []).find((x) => x.id === id); if (c) { if (c.st === 'open') cajaClose(); else cajaVer(c); } }
    else if (a === 'delv') delVenta(id);
    else if (a === 'newcli') cliDlg(null, !!el.dataset.pick);
    else if (a === 'impcli') impClientes();
    else if (a === 'opencli') openCli(id);
    else if (a === 'closecli') closeCli();
    else if (a === 'pago') movDlg('p');
    else if (a === 'deuda') movDlg('f');
    else if (a === 'delf') delFiado(id);
    else if (a === 'wa') waMsg();
    else if (a === 'editcli') cliDlg(cli(S.sel), false);
    else if (a === 'delcli') { const c = cli(S.sel); if (c && confirm('¿Borrar a ' + c.n + '? Se conserva el historial de ventas.')) { deleteDoc(ref('clientes', c.id)).catch(failW); closeCli(); } }
    else if (a === 'scat') { S.stCat = el.dataset.v; S.stLow = false; renderStock(); }
    else if (a === 'slow') { S.stLow = !S.stLow; S.stCat = ''; renderStock(); }
    else if (a === 'newp') { S.repo = null; prodForm(null); }
    else if (a === 'editp') prodForm(id);
    else if (a === 'ig') instaProd(id);
    else if (a === 'igwa') instaProd(id, 'wa');
    else if (a === 'fw') { S.edit.w = el.dataset.v === '1'; el.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); S.edit.lbl(); }
    else if (a === 'savep') saveProd();
    else if (a === 'delp') { if (adm()) delProd(); }
    else if (a === 'cancel') closeForms();
    else if (a === 'repo') repoForm(null);
    else if (a === 'rpick') { S.repo.id = id || null; S.repo.note = 0; renderRepo(); }
    else if (a === 'saver') saveRepo();
    else if (a === 'delc') delCompra(id);
    else if (a === 'precios') preciosDlg();
    else if (a === 'mvcat') mvCatDlg();
    else if (a === 'fatr') { S.fAtr = !S.fAtr; renderFiList(); }
    else if (a === 'sueltos') abrirSueltos({
      existe: (n) => P().some((p) => sinAc(p.n) === sinAc(n)),
      guardar: (items) => {
        const sid = X.sid(), c = qkCfg(), lotes = [];
        for (let i = 0; i < items.length; i += 400) {
          const b = writeBatch(db);
          items.slice(i, i + 400).forEach((x) => {
            const o = { n: x.n, s: '', cat: x.cat, w: true, pn: x.pk, c: x.pk ? costoDesde(x.pk, c) : 0, q: 0, min: 0, oh: false, alm: 1, ns: true };
            if (x.pk) o.ce = 1;
            b.set(doc(db, 'stores', sid, 'stock', 'al_' + X.rnd(10)), o);
          });
          lotes.push(b.commit());
        }
        return Promise.all(lotes).catch((e) => { failW(e); throw e; });
      } });
    else if (a === 'mvdes') mvCatDlg('Desayuno y merienda');
    else if (a === 'avoff') { try { localStorage.setItem('pk_av_' + el.dataset.v + '_' + X.sid(), '1'); } catch (e) { /* nada */ } renderStock(); }
    else if (a === 'qk') qkOpen();
    else if (a === 'qkman') qkShow('');
    else if (a === 'qkcamon') qkCamOn();
    else if (a === 'libre') libreDlg();
    else if (a === 'snocod') { S.stNoCod = !S.stNoCod; S.stLow = false; S.stCat = ''; renderStock(); }
    else if (a === 'asigcod') asigCod(id);
    else if (a === 'imp') impOpen();
    else if (a === 'impej') impEjemplo();
    else if (a === 'impgo') impRun();
    else if (a === 'scancaja') scanCaja();
    else if (a === 'scanstk') scanStock();
    else if (a === 'scanrepo') scanRepo();
    else if (a === 'scanfs') scanField();
  });
  // En la compu, la pistola lectora escribe como un teclado. Si lee un código sin que haya ningún
  // campo elegido (por ejemplo después de un clic en otro lado), lo mandamos al buscador de la pantalla:
  // así no hace falta hacer clic en el campo antes de escanear.
  if (PC) document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1 || e.key === ' ') return;
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    if (Array.prototype.some.call(document.body.children, (o) => o.style && o.style.position === 'fixed' && o.style.inset === '0px')) return; // hay una ventana abierta
    const t = ['qkcod', 'cjq', 'rq', 'aq', 'esq'].map((id) => $(id)).find((el) => el && el.offsetParent !== null && !el.disabled);
    if (!t) return;
    e.preventDefault();
    try { t.focus({ preventScroll: true }); } catch (er) { t.focus(); }
    t.value += e.key;
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.addEventListener('change', (e) => {
    if (!X.isAlm() || !e.target.dataset || !e.target.dataset.alm) return;
    S.month = e.target.value; S.tot = null; drawRes();
  });

  return {
    start, stop, redraw, publishSoon, drawCaja, drawFiado, drawStock, drawRes, cargarPedido, ventaPedido, apps, prePedido: (p) => { S.pedPre = p || null; renderCart(); },
    resetView() { if (S.imp && S.imp.step === 'run') return; qkStop(); S.edit = null; S.repo = null; S.imp = null; S.qk = null; $('s-stk').innerHTML = ''; }
  };
}
