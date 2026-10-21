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
import { collection, doc, setDoc, getDocs, deleteDoc, onSnapshot, writeBatch, increment, query, where, deleteField } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { fotoId } from './fotos.js';
import { combos, descuento, tituloCant, repartir } from './promos.js';
import { CATS, PAY, r2, r3, pnum, n3, fq, lineTotal, cartTotals, newAvgCost, roundPrice, match, lastMonths, buildLista } from './almacen-calc.js';
import { openScanner, scanButton, findByCode, beep } from './scanner.js';
export { CATS, PAY };

// ---------- módulo de pantalla ----------
// X = contexto que pasa app.html: db, $, esc, money, today, fail, canWrite, blockedCard, nm, rnd, readPhoto,
// mlabel, gTotal(mes), y getters de estado: sid(), role(), user(), st(), sname(), isAlm().
export function createAlmacen(X) {
  const { db, $, esc, money } = X;
  const S = {
    cart: [], q: '', cat: '', pay: 'ef', cli: '', cliQ: '', paga: '', last: '',
    cl: [], clErr: false, fq: '', sel: null, fmov: null,
    stQ: '', stCat: '', stLow: false, edit: null, repo: null, rq: '', rcomp: null,
    month: X.today().slice(0, 7), tot: null, totM: null, hoy: [], hoyDay: '', day: X.today(), dayV: null
  };
  const un = {};
  const off = (k) => { if (un[k]) { un[k](); delete un[k]; } };
  const adm = () => X.role() === 'admin';
  const P = () => X.st();
  const prod = (id) => P().find((p) => p.id === id) || null;
  const cli = (id) => S.cl.find((c) => c.id === id) || null;
  const ref = (...p) => doc(db, 'stores', X.sid(), ...p);
  const col = (n) => collection(db, 'stores', X.sid(), n);
  const now = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const dmy = (d) => String(d || '').split('-').reverse().join('/');
  const uid = () => Date.now() + '-' + X.rnd(4);
  const cats = () => { const o = {}; CATS.forEach((c) => { o[c] = 0; }); P().forEach((p) => { if (p.cat) o[p.cat] = (o[p.cat] || 0) + 1; }); return o; };
  const usedCats = () => { const o = cats(); return Object.keys(o).filter((c) => o[c] > 0).sort((a, b) => CATS.indexOf(a) - CATS.indexOf(b) || a.localeCompare(b)); };
  const priceTxt = (p) => (p.pn ? money(p.pn) + (p.w ? ' / kg' : '') : 'sin precio');
  const deny = (e) => e && /permission/.test(String(e.code || e.message));
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
      sn.forEach((d) => { const x = d.data(); S.cl.push({ id: d.id, n: x.n || '', tel: x.tel || '', s: r2(x.s || 0), u: x.u || 0 }); });
      redraw();
    }, () => { S.clErr = true; redraw(); });
    listenHoy();
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
  function stop() { clearTimeout(pubT); S.lista = null; Object.keys(un).forEach(off); S.cart = []; S.cl = []; S.sel = null; S.edit = null; S.repo = null; S.hoy = []; S.tot = null; S.totM = null; S.dayV = null; S.rcomp = null; }

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
      box.innerHTML = '<div class="card"><div class="empty">' + (adm() ? 'Todavía no cargaste productos. Empezá por el Stock.' : 'Todavía no hay productos cargados. Un administrador tiene que cargarlos.') + '</div>' + (adm() ? '<button class="go" data-t="stk">Ir a Stock</button>' : '') + '</div>';
      return;
    }
    if (!$('cjq')) {
      box.innerHTML = '<div class="card"><div style="display:flex;gap:8px;align-items:center"><input id="cjq" type="search" enterkeyhint="go" placeholder="Buscar producto o código" autocomplete="off" style="flex:1;min-width:0" value="' + esc(S.q) + '">' + scanButton('scancaja') + '</div>' +
        '<div id="cjcats" class="chips"></div><div id="cjres"></div></div><div id="cjcart"></div><div id="cjhoy"></div>';
      const qi = $('cjq');
      qi.oninput = () => { S.q = qi.value; if (S.cat && S.q.trim()) { S.cat = ''; renderCats(); } renderRes(); };
      qi.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); enterAdd(); } };
    }
    renderCats(); renderRes(); renderHoy();
    // Si el cajero está escribiendo (paga con, buscar cliente), no le borramos lo que escribe.
    const fa = document.activeElement;
    if (!(fa && fa.closest && fa.closest('#cjcart'))) renderCart();
  }
  function renderCats() {
    const e = $('cjcats'); if (!e) return;
    e.innerHTML = usedCats().map((c) => '<button class="ch' + (S.cat === c ? ' on' : '') + '" data-al="cat" data-v="' + esc(c) + '">' + esc(c) + '</button>').join('');
  }
  function results() {
    if (!S.q.trim() && !S.cat) return null;
    return P().filter((p) => (!S.cat || p.cat === S.cat) && match(p.n + ' ' + p.s + ' ' + p.cat, S.q))
      .sort((a, b) => a.n.localeCompare(b.n)).slice(0, 40);
  }
  function renderRes() {
    const e = $('cjres'); if (!e) return;
    const r = results();
    if (!r) {
      const ps = combos(X.promos(), Date.now());
      e.innerHTML = (ps.length ? '<div class="k" style="margin:12px 0 2px"><b>🔥 Promos</b></div>' + ps.map((p) => '<button class="pl" data-al="addpromo" data-id="' + esc(p.id) + '"><span><b>' + esc(p.titulo) + '</b>' + (p.items && p.items.length ? '<small>' + p.items.map((i) => (i.q > 1 ? i.q + '× ' : '') + esc(i.n)).join(' + ') + '</small>' : '') + '</span><b>' + money(p.precio) + '</b></button>').join('') : '') +
        '<div class="k" style="margin-top:10px">Escribí el nombre o el código, o elegí una categoría. Para escanear, tocá el botón de la cámara o usá un lector de códigos: el producto se agrega solo.</div>';
      return;
    }
    if (!r.length) { e.innerHTML = '<div class="empty">No encontré productos.</div>'; return; }
    e.innerHTML = r.map((p) => '<button class="pl" data-al="add" data-id="' + esc(p.id) + '"><span><b>' + esc(p.n) + '</b><small>' + (p.w ? 'por peso · ' : '') + 'stock ' + fq(p.q, p.w) + '</small></span><b>' + priceTxt(p) + '</b></button>').join('');
  }
  function enterAdd() {
    const q = S.q.trim().toLowerCase(); if (!q) return;
    let p = findByCode(P(), q);
    if (!p) { const r = results() || []; if (r.length === 1) p = r[0]; }
    if (p) { if (p.pn) beep(true); addProd(p); } else if (/^\d{6,}$/.test(q)) beep(false); // código que no existe
  }
  function clearSearch(noFocus) { S.q = ''; const qi = $('cjq'); if (qi) { qi.value = ''; renderRes(); if (!noFocus) qi.focus(); } }
  function addProd(p, noFocus) {
    if (!p.pn) { alert('"' + p.n + '" no tiene precio de venta. Cargalo en Stock → Editar.'); return; }
    if (p.w) { weightDlg(p); return; }
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
  function renderCart() {
    const e = $('cjcart'); if (!e) return;
    if (!S.cart.length) { e.innerHTML = S.last ? '<div class="card"><div class="tot" style="color:var(--sell);font-size:16px;margin:0">' + S.last + '</div></div>' : ''; return; }
    const EF = efectivo(), { tot } = cartTotals(EF.lines);
    let h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>Venta en curso</b><button class="x" data-al="clear" style="font-size:14px;text-decoration:underline">Vaciar</button></div>';
    S.cart.forEach((l, i) => {
      h += '<div class="it"><div><b>' + esc(l.n) + '</b>' + (l.items && l.items.length ? '<small>' + l.items.map((x) => (x.q > 1 ? x.q + '× ' : '') + esc(x.n)).join(' + ') + '</small>' : '') + '<small>' + fq(l.q, l.w) + ' × ' + money(l.u) + (l.w ? '/kg' : '') + '</small></div>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
        (l.w ? '<button class="qb" data-al="wedit" data-i="' + i + '" aria-label="Cambiar peso">✎</button>' : '<button class="qb" data-al="dec" data-i="' + i + '" aria-label="Uno menos">−</button><button class="qb" data-al="inc" data-i="' + i + '" aria-label="Uno más">+</button>') +
        '<b style="min-width:76px;text-align:right">' + money(lineTotal(l)) + '</b><button class="x" data-al="rm" data-i="' + i + '" aria-label="Quitar">×</button></div></div>';
    });
    if (EF.dsc) h += '<div class="it" style="color:var(--buy);font-weight:800"><div>🏷️ ' + esc(EF.dsc.t) + '</div><div>−' + money(EF.dsc.m) + '</div></div>';
    else if (EF.cerca) h += '<div class="k" style="margin-top:8px">🏷️ Sumá ' + EF.cerca.faltan + ' más' + (EF.cerca.p.cat ? ' de ' + esc(EF.cerca.p.cat) : '') + ' y tiene ' + EF.cerca.p.pct + '% OFF.</div>';
    h += '<div class="big" style="font-size:40px;margin:14px 0 4px">' + money(tot) + '</div>';
    h += '<div class="seg" style="flex-wrap:wrap">' + Object.keys(PAY).map((k) => '<button class="pay' + (S.pay === k ? ' on' : '') + '" data-al="pay" data-v="' + k + '">' + PAY[k] + '</button>').join('') + '</div>';
    if (S.pay === 'ef') {
      const pg = +S.paga;
      h += '<div class="row"><div><label>Paga con (opcional)</label><input id="cjpg" type="number" inputmode="decimal" placeholder="0" value="' + esc(S.paga) + '"></div><div><label>Vuelto</label><div class="v" id="cjvu" style="padding:12px 0">' + (pg >= tot ? money(pg - tot) : '—') + '</div></div></div>';
    }
    if (S.pay === 'fi') h += cliPicker();
    h += '<button class="go" data-al="cobrar">' + (S.pay === 'fi' ? 'Anotar en el fiado ' : 'Cobrar ') + money(tot) + '</button></div>';
    e.innerHTML = h;
    const pg = $('cjpg');
    if (pg) pg.oninput = () => { S.paga = pg.value; const v = +pg.value; $('cjvu').textContent = v >= tot ? money(v - tot) : '—'; };
    const cq = $('cjcq');
    if (cq) cq.oninput = () => { S.cliQ = cq.value; const l = $('cjcl'); if (l) l.innerHTML = cliList(); };
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
  function cobrar() {
    if (!S.cart.length) return;
    if (!X.canWrite()) { alert('El acceso de la tienda venció.'); return; }
    if (S.pay === 'fi' && !cli(S.cli)) { alert('Elegí a quién le fiás.'); return; }
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
    const { tot, cost } = cartTotals(it);
    const id = uid();
    const v = { id, d, m, h: now(), it, tot, cost, pay: S.pay, by: u.uid, bn: X.nm() };
    if (EF.dsc) v.dsc = EF.dsc;
    const b = writeBatch(db);
    if (S.pay === 'fi') {
      const c = cli(S.cli), fid = uid();
      v.cli = c.id; v.cn = c.n; v.fid = fid;
      b.set(doc(db, 'stores', sid, 'fiado', fid), { id: fid, cid: c.id, t: 'f', a: tot, d, m, vid: id, det: it.map((x) => x.n + (x.w ? ' ' + fq(x.q, 1) : (x.q > 1 ? ' x' + n3(x.q) : ''))).join(', ').slice(0, 300), by: u.uid, bn: X.nm() });
      b.update(doc(db, 'stores', sid, 'clientes', c.id), { s: increment(tot), u: Date.now() });
    }
    b.set(doc(db, 'stores', sid, 'ventas', id), v);
    it.forEach((x) => { if (prod(x.id)) b.update(doc(db, 'stores', sid, 'stock', x.id), { q: increment(-x.q) }); });
    b.set(doc(db, 'stores', sid, 'totales', m), { v: increment(tot), c: increment(cost), n: increment(1), pay: { [S.pay]: increment(tot) }, dias: { [dd]: { v: increment(tot), c: increment(cost), n: increment(1) } } }, { merge: true });
    b.commit().catch(failW);
    const pg = +S.paga;
    S.last = (S.pay === 'fi' ? 'Anotado en el fiado de ' + esc(cli(S.cli).n) + ': ' : 'Cobrado ✓ ') + money(tot) + (S.pay === 'ef' && pg >= tot && pg > 0 ? ' · Vuelto ' + money(pg - tot) : '');
    S.cart = []; S.paga = ''; S.cli = ''; S.cliQ = ''; S.pay = 'ef'; S.cat = ''; renderCats();
    renderCart(); clearSearch();
  }
  function renderHoy() {
    const e = $('cjhoy'); if (!e) return;
    let t = 0; S.hoy.forEach((v) => { t += v.tot || 0; });
    let h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>' + (adm() ? 'Ventas de hoy' : 'Tus ventas de hoy') + '</b><b>' + money(t) + '</b></div><div class="k">' + S.hoy.length + ' venta' + (S.hoy.length === 1 ? '' : 's') + '</div>';
    h += ventasHtml(S.hoy.slice(0, 15), adm());
    if (S.hoy.length > 15) h += '<div class="k" style="margin-top:8px">' + (adm() ? 'Ves todas en Resumen.' : 'Se muestran las últimas 15.') + '</div>';
    e.innerHTML = h + '</div>';
  }
  function ventasHtml(l, canDel) {
    return l.map((v) => '<div class="it"><div><b>' + money(v.tot) + '</b> <em class="tag">' + (PAY[v.pay] || v.pay) + '</em>' + (v.cn ? '<span class="sku">' + esc(v.cn) + '</span>' : '') +
      '<small>' + (v.h || '') + (v.d !== X.today() ? ' · ' + dmy(v.d) : '') + ' · ' + (v.it || []).map((x) => esc(x.n) + (x.w ? ' ' + fq(x.q, 1) : (x.q !== 1 ? ' x' + n3(x.q) : ''))).join(', ') + (adm() && v.bn ? ' · ' + esc(v.bn) : '') + '</small></div>' +
      (canDel ? '<button class="x" data-al="delv" data-id="' + esc(v.id) + '" aria-label="Anular venta">×</button>' : '') + '</div>').join('');
  }
  function delVenta(id) {
    const v = S.hoy.concat(S.dayV || []).find((x) => String(x.id) === String(id)); if (!v) return;
    if (!confirm('¿Anular esta venta de ' + money(v.tot) + '? La mercadería vuelve al stock' + (v.fid ? ' y se descuenta del fiado de ' + v.cn : '') + '.')) return;
    const sid = X.sid(), b = writeBatch(db), dd = v.d.slice(8, 10);
    b.delete(doc(db, 'stores', sid, 'ventas', String(v.id)));
    (v.it || []).forEach((x) => { if (prod(x.id)) b.update(doc(db, 'stores', sid, 'stock', x.id), { q: increment(x.q) }); });
    b.set(doc(db, 'stores', sid, 'totales', v.m || v.d.slice(0, 7)), { v: increment(-v.tot), c: increment(-(v.cost || 0)), n: increment(-1), pay: { [v.pay]: increment(-v.tot) }, dias: { [dd]: { v: increment(-v.tot), c: increment(-(v.cost || 0)), n: increment(-1) } } }, { merge: true });
    if (v.fid) { b.delete(doc(db, 'stores', sid, 'fiado', v.fid)); if (cli(v.cli)) b.update(doc(db, 'stores', sid, 'clientes', v.cli), { s: increment(-v.tot) }); }
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
        '<button class="go alt" data-al="newcli" style="margin:0 0 14px">+ Cliente nuevo</button><div id="filist"></div>';
      $('fiq').oninput = function () { S.fq = this.value; renderFiList(); };
    }
    renderFiList();
  }
  function renderFiList() {
    let t = 0, n = 0; S.cl.forEach((c) => { if (c.s > 0) { t += c.s; n++; } });
    $('fitot').textContent = money(t); $('ficnt').textContent = n + ' cliente' + (n === 1 ? '' : 's') + ' con deuda';
    const l = S.cl.filter((c) => match(c.n + ' ' + c.tel, S.fq)).sort((a, b) => (b.s > 0) - (a.s > 0) || b.s - a.s || a.n.localeCompare(b.n));
    $('filist').innerHTML = '<div class="card">' + (l.length ? l.map((c) => '<button class="pl" data-al="opencli" data-id="' + esc(c.id) + '"><span><b>' + esc(c.n) + '</b><small>' + (c.tel ? esc(c.tel) + ' · ' : '') + (c.u ? 'último movimiento ' + new Date(c.u).toLocaleDateString('es-AR') : 'sin movimientos') + '</small></span><b class="' + (c.s > 0 ? 'neg' : 'pos') + '">' + (c.s > 0 ? money(c.s) : (c.s < 0 ? 'a favor ' + money(-c.s) : 'al día')) + '</b></button>').join('') :
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
      (isP ? '<label>Forma de pago</label><select id="mp"><option value="ef">Efectivo</option><option value="tr">Transferencia</option><option value="tj">Tarjeta</option></select>' : '<label>Detalle</label><input id="md" maxlength="120" autocomplete="off" placeholder="Ej: Deuda de la libreta">') +
      '<label>Fecha</label><input id="mf" type="date" value="' + X.today() + '">' +
      '<button class="go" id="mok">Guardar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    o.querySelector('#mok').onclick = () => {
      const a = Math.round(+o.querySelector('#ma').value), d = o.querySelector('#mf').value || X.today();
      if (!(a > 0)) { alert('Escribí el monto.'); return; }
      const id = uid(), sid = X.sid(), u = X.user(), b = writeBatch(db);
      const f = { id, cid: c.id, t: isP ? 'p' : 'f', a, d, m: d.slice(0, 7), by: u.uid, bn: X.nm() };
      if (isP) f.pay = o.querySelector('#mp').value; else f.det = o.querySelector('#md').value.trim().slice(0, 120) || 'Deuda anotada';
      b.set(doc(db, 'stores', sid, 'fiado', id), f);
      b.update(doc(db, 'stores', sid, 'clientes', c.id), { s: increment(isP ? -a : a), u: Date.now() });
      if (isP) b.set(doc(db, 'stores', sid, 'totales', f.m), { cob: increment(a), cobp: { [f.pay]: increment(a) } }, { merge: true });
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
    if (S.edit || S.repo) return; // hay un formulario abierto: no lo pisamos
    if (!$('aq')) {
      box.innerHTML = (adm() ? '<div class="row" style="gap:8px;margin-bottom:6px"><button class="go" data-al="newp" style="margin-top:0">+ Producto</button><button class="go alt" data-al="repo" style="margin-top:0">Reponer</button></div><button class="go alt" data-al="precios" style="margin:4px 0 14px">Actualizar precios por %</button>' : '') +
        '<div style="display:flex;gap:8px;align-items:center"><input id="aq" type="search" placeholder="Buscar producto o código" autocomplete="off" style="flex:1;min-width:0" value="' + esc(S.stQ) + '">' + scanButton('scanstk') + '</div><div id="acats" class="chips" style="margin:10px 0 12px"></div><div id="abody"></div>';
      $('aq').oninput = function () { S.stQ = this.value; renderStock(); };
    }
    renderStock();
  }
  function renderStock() {
    const all = P(), low = all.filter((p) => p.q <= (p.min || 0) && (p.min || p.q <= 0)).length;
    $('acats').innerHTML = '<button class="ch' + (!S.stCat && !S.stLow ? ' on' : '') + '" data-al="scat" data-v="">Todos (' + all.length + ')</button>' +
      '<button class="ch' + (S.stLow ? ' on' : '') + '" data-al="slow">Por reponer (' + low + ')</button>' +
      usedCats().map((c) => '<button class="ch' + (S.stCat === c ? ' on' : '') + '" data-al="scat" data-v="' + esc(c) + '">' + esc(c) + '</button>').join('');
    const l = all.filter((p) => (!S.stCat || p.cat === S.stCat) && (!S.stLow || (p.q <= (p.min || 0) && (p.min || p.q <= 0))) && match(p.n + ' ' + p.s + ' ' + p.cat, S.stQ)).sort((a, b) => a.n.localeCompare(b.n));
    let val = 0; all.forEach((p) => { val += Math.max(p.q, 0) * (p.c || 0); });
    let h = adm() ? '<div class="k" style="margin:0 4px 10px">' + all.length + ' productos · mercadería en stock (a costo): <b>' + money(val) + '</b></div>' : '';
    h += '<div class="card">';
    if (!l.length) h += '<div class="empty">' + (all.length ? 'No hay productos en esta vista.' : (adm() ? 'Cargá tu primer producto con "+ Producto".' : 'Todavía no hay productos cargados.')) + '</div>';
    const shown = l.slice(0, 300);
    shown.forEach((p) => {
      const lw = p.q <= (p.min || 0) && (p.min || p.q <= 0), mg = p.pn && p.c ? Math.round((p.pn - p.c) / p.pn * 100) : null;
      h += '<div class="it"><div>' + (p.img ? '<img src="' + p.img + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:10px;float:left;margin:0 10px 4px 0">' : '') + '<b>' + esc(p.n) + '</b>' + (p.s ? '<span class="sku">' + esc(p.s) + '</span>' : '') +
        '<small>' + (p.cat ? '<em class="tag">' + esc(p.cat) + '</em>' : '') + priceTxt(p) + (adm() && p.c ? ' · costo ' + money(p.c) + (mg != null ? ' · margen ' + mg + '%' : '') : '') + '</small>' +
        (adm() ? '<button class="x" data-al="editp" data-id="' + esc(p.id) + '" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin-top:4px">Editar</button>' : '') + '</div>' +
        '<div class="amt"><b class="' + (p.q < 0 ? 'neg' : lw ? 'neg' : '') + '">' + fq(p.q, p.w) + '</b><small>' + (lw ? 'reponer' : 'en stock') + '</small></div></div>';
    });
    if (l.length > shown.length) h += '<div class="k" style="margin-top:8px">Mostrando 300 de ' + l.length + '. Buscá para encontrar el resto.</div>';
    $('abody').innerHTML = h + '</div>';
  }
  function closeForms() { S.edit = null; S.repo = null; $('s-stk').innerHTML = ''; drawStock(); }

  function prodForm(id, code) {
    const p = id ? prod(id) : null;
    if (id && !p) return;
    S.edit = { id: id || null, img: undefined };
    const c = p || { n: '', s: code || '', cat: S.stCat || '', w: false, pn: '', c: '', q: '', min: '' };
    const catOpts = Array.from(new Set(CATS.concat(usedCats()))).map((x) => '<option value="' + esc(x) + '"' + (c.cat === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    let h = '<button class="x" data-al="cancel" style="font-size:14px;text-decoration:underline;margin-bottom:10px">← Volver al stock</button><div class="card"><b style="font-size:19px">' + (p ? 'Editar producto' : 'Producto nuevo') + '</b>' +
      '<label>Nombre</label><input id="fn" autocomplete="off" maxlength="80" placeholder="Ej: Coca-Cola 2,25 L" value="' + esc(c.n) + '">' +
      '<label>Código de barras o código propio (opcional)</label><div style="display:flex;gap:8px;align-items:center"><input id="fs" autocomplete="off" maxlength="40" placeholder="Ej: 7790895000997" style="flex:1;min-width:0" value="' + esc(c.s) + '">' + scanButton('scanfs') + '</div>' +
      '<label>Categoría</label><select id="fc"><option value="">Sin categoría</option>' + catOpts + '</select>' +
      '<label>Descripción para el catálogo (opcional)</label><textarea id="fdsc" maxlength="160" rows="2" placeholder="Ej: Dulce de leche clásico, pote de 200 g." style="width:100%;padding:14px 16px;border:0;border-radius:14px;background-color:var(--line);color:var(--ink);font:inherit;font-weight:600;outline:none;resize:vertical">' + esc(c.d || '') + '</textarea>' +
      '<label>¿Cómo se vende?</label><div class="seg"><button class="pay' + (!c.w ? ' on' : '') + '" data-al="fw" data-v="0">Por unidad</button><button class="pay' + (c.w ? ' on' : '') + '" data-al="fw" data-v="1">Por peso (kg)</button></div>' +
      '<div class="row"><div><label id="lpn">Precio de venta</label><input id="fpn" type="number" inputmode="decimal" min="0" placeholder="0" value="' + (c.pn || '') + '"></div><div><label id="lco">Costo</label><input id="fco" type="number" inputmode="decimal" min="0" placeholder="0" value="' + (c.c || '') + '"></div></div><div class="tot" id="fmg"></div>' +
      '<div class="row"><div><label id="lq">' + (p ? 'Stock actual (contado)' : 'Stock inicial') + '</label><input id="fq" type="text" inputmode="decimal" placeholder="0" autocomplete="off" value="' + (p ? n3(c.q) : '') + '"></div><div><label>Avisar cuando quede (opcional)</label><input id="fmin" type="text" inputmode="decimal" placeholder="Ej: 3" autocomplete="off" value="' + (c.min ? n3(c.min) : '') + '"></div></div>' +
      (p ? '<div class="k" style="margin-top:6px">Si contás la mercadería y no coincide, corregí el stock acá. Para cargar mercadería que compraste usá Reponer (así se calcula bien el costo).</div>' : '') +
      (c.img && !c.hd ? '<div class="bn warn" style="margin:14px 0 0;font-size:13px">Esta foto se subió con la versión anterior y se ve en baja calidad. Volvé a elegirla para que se vea nítida en el catálogo.</div>' : '') + '<label style="margin-top:14px">Foto (opcional)</label><div style="display:flex;gap:12px;align-items:center"><img id="fph" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:12px;' + (c.img ? '' : 'display:none') + '" src="' + (c.img || '') + '"><input id="fpf" type="file" accept="image/*" style="flex:1"></div>' +
      '<label>Precio anterior (opcional)</label><input id="fpa" type="number" inputmode="decimal" min="0" placeholder="Ej: 2200" value="' + (c.pa || '') + '"><div class="k" style="margin-top:6px">Se muestra tachado en el catálogo, con el % de descuento. Tiene que ser mayor que el precio de venta.</div>' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:14px;font-weight:600"><input id="fdt" type="checkbox" style="width:auto"' + (c.dt ? ' checked' : '') + '> ⭐ Destacar en el catálogo (sale arriba, en el carrusel)</label>' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:14px;font-weight:600"><input id="foh" type="checkbox" style="width:auto"' + (c.oh ? ' checked' : '') + '> No mostrar en el catálogo</label>' +
      '<button class="go" data-al="savep">Guardar</button>' + (p ? '<button class="x" data-al="delp" style="display:block;margin:18px auto 0;font-size:14px;text-decoration:underline;color:var(--buy)">Eliminar este producto</button>' : '') + '</div>';
    $('s-stk').innerHTML = h;
    S.edit.w = !!c.w;
    const mg = () => { const pn = +$('fpn').value, co = +$('fco').value; $('fmg').textContent = pn > 0 && co > 0 ? 'Ganás ' + money(pn - co) + (S.edit.w ? ' por kilo' : ' por unidad') + ' (' + Math.round((pn - co) / pn * 100) + '% del precio)' : ''; };
    const lbl = () => { $('lpn').textContent = S.edit.w ? 'Precio de venta por kilo' : 'Precio de venta'; $('lco').textContent = S.edit.w ? 'Costo por kilo' : 'Costo por unidad'; $('lq').textContent = (p ? 'Stock actual (contado)' : 'Stock inicial') + (S.edit.w ? ' en kg' : ''); };
    $('fpn').oninput = mg; $('fco').oninput = mg; mg(); lbl(); S.edit.lbl = () => { lbl(); mg(); };
    $('fpf').onchange = function () { const f = this.files && this.files[0]; if (!f) return; X.readPhoto(f, (o, hd) => { if (!o) { alert('No pude leer esa foto. Probá con otra.'); return; } S.edit.img = o; S.edit.hd = hd || ''; const v = $('fph'); v.src = o; v.style.display = ''; }); };
    window.scrollTo(0, 0);
    if (!p) setTimeout(() => $('fn').focus(), 50);
  }
  function saveProd() {
    const E = S.edit, p = E.id ? prod(E.id) : null;
    const n = $('fn').value.trim(), s = $('fs').value.trim(), cat = $('fc').value, pn = +$('fpn').value || 0, co = +$('fco').value || 0;
    const qs = $('fq').value.trim(), q = qs === '' ? 0 : r3(pnum(qs)), mins = $('fmin').value.trim(), min = mins === '' ? 0 : r3(pnum(mins));
    if (!n) { alert('Escribí el nombre del producto.'); return; }
    if (isNaN(q) || isNaN(min) || min < 0) { alert('Revisá el stock (usá números, por ejemplo 12 o 1,5).'); return; }
    if (!E.w && q !== Math.floor(q)) { alert('Este producto se vende por unidad: el stock tiene que ser un número entero.'); return; }
    const d = $('fdsc').value.trim().replace(/\s+/g, ' ').slice(0, 160), pa = +$('fpa').value || 0, dt = $('fdt').checked;
    if (pn < 0 || co < 0 || pa < 0) { alert('Los precios no pueden ser negativos.'); return; }
    if (pa > 0 && pa <= pn) { alert('El precio anterior tiene que ser mayor que el precio de venta (' + money(pn) + '). Si no hay descuento, dejalo vacío.'); return; }
    if (s && P().some((x) => x.id !== E.id && x.s && x.s.toLowerCase() === s.toLowerCase())) { alert('Ya hay otro producto con el código ' + s + '.'); return; }
    if (!E.id && P().some((x) => x.n.toLowerCase() === n.toLowerCase()) && !confirm('Ya existe "' + n + '". ¿Crear otro con el mismo nombre?')) return;
    const id = E.id || 'al_' + X.rnd(10);
    const o = { n, s, cat, w: E.w, pn, c: co, min, oh: $('foh').checked, alm: 1, d, pa, dt };
    const b = writeBatch(db);
    if (E.img !== undefined) {
      o.img = E.img; o.hd = E.hd ? 1 : deleteField();
      if (E.hd) b.set(ref('public', fotoId(id)), { f: E.hd, at: Date.now() }); else b.delete(ref('public', fotoId(id)));
    }
    if (p) { const dq = r3(q - p.q); if (dq !== 0) o.q = increment(dq); } else o.q = q;
    b.set(ref('stock', id), o, { merge: true });
    b.commit().catch(failW);
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
    if (!S.rcomp || S.rcomp.m !== X.today().slice(0, 7)) loadCompras();
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
      const cl = S.rcomp && S.rcomp.list;
      h += '<div class="card"><b>Compras de este mes</b>';
      if (S.rcomp && S.rcomp.err) h += rulesCard();
      else if (!cl) h += '<div class="empty">Cargando…</div>';
      else if (!cl.length) h += '<div class="empty">Todavía no cargaste compras este mes.</div>';
      else { let t = 0; cl.forEach((x) => { t += x.tot; }); h += '<div class="k">Total ' + money(t) + '</div>' + cl.slice(0, 50).map((x) => '<div class="it"><div><b>' + esc(x.n) + '</b><small>' + dmy(x.d) + ' · ' + fq(x.q, x.w) + ' × ' + money(x.u) + (x.prov ? ' · ' + esc(x.prov) : '') + '</small></div><div class="amt"><b class="neg">−' + money(x.tot) + '</b></div><button class="x" data-al="delc" data-id="' + esc(x.id) + '" aria-label="Borrar">×</button></div>').join(''); }
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
    b.update(doc(db, 'stores', sid, 'stock', p.id), { q: increment(q), c: newAvgCost(p.q, p.c, q, cu), pn });
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
    listenTot(); listenHoy();
    const t = S.tot || {}, pay = t.pay || {}, gas = X.gTotal(S.month);
    const v = t.v || 0, c = t.c || 0, gross = v - c, gain = gross - gas;
    let deben = 0; S.cl.forEach((x) => { if (x.s > 0) deben += x.s; });
    const ms = lastMonths(13, X.today().slice(0, 7));
    let h = '<div class="card hero"><select data-alm="1">' + ms.map((m) => '<option value="' + m + '"' + (m === S.month ? ' selected' : '') + '>' + X.mlabel(m) + '</option>').join('') + '</select>' +
      (S.tot === null ? '<div class="big">…</div>' : '<div class="big ' + (gain >= 0 ? 'pos' : 'neg') + '">' + money(gain) + '</div>') +
      '<div class="k">Ganancia del mes: lo vendido, menos lo que te costó esa mercadería, menos los gastos</div></div>' +
      '<div class="rows">' +
      '<div class="r2"><span>Vendí<small>' + (t.n || 0) + ' ventas' + (t.n ? ' · ticket promedio ' + money(v / t.n) : '') + '</small></span><b class="pos">' + money(v) + '</b></div>' +
      '<div class="r2"><span>Costo de lo vendido</span><b class="neg">' + money(c) + '</b></div>' +
      '<div class="r2"><span>Ganancia de las ventas<small>antes de gastos' + (v ? ' · ' + Math.round(gross / v * 100) + '%' : '') + '</small></span><b class="' + (gross >= 0 ? 'pos' : 'neg') + '">' + money(gross) + '</b></div>' +
      '<div class="r2"><span>Gastos del mes<small>alquiler, luz, sueldos…</small></span><b class="neg">' + money(gas) + '</b></div>' +
      '<div class="r2"><span>Compré mercadería<small>reposición cargada este mes</small></span><b>' + money(t.co || 0) + '</b></div></div>' +
      '<div class="card"><b>Cómo te pagaron</b><div class="rows" style="margin:6px 0 0">' + Object.keys(PAY).map((k) => '<div class="r2"><span>' + PAY[k] + '</span><b>' + money(pay[k] || 0) + '</b></div>').join('') +
      '<div class="r2"><span>Cobré de fiados<small>pagos de deudas este mes</small></span><b class="pos">' + money(t.cob || 0) + '</b></div>' +
      '<div class="r2"><span>Te deben hoy<small>total de la libreta</small></span><b class="neg">' + money(deben) + '</b></div></div></div>';
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
  function loadDay() {
    const d = S.day;
    getDocs(query(col('ventas'), where('d', '==', d))).then((sn) => { if (S.day !== d) return; const l = []; sn.forEach((x) => l.push(x.data())); l.sort((a, b) => String(b.id).localeCompare(String(a.id))); S.dayV = l; if (X.tab() === 'res') drawRes(); })
      .catch(() => { S.dayV = []; if (X.tab() === 'res') drawRes(); });
  }

  // ---------- escáner con la cámara (scanner.js) ----------
  const later = (f) => setTimeout(f, 320); // después de que se cierra el escáner
  const offerNew = (code) => {
    if (!adm()) { alert('No hay ningún producto con el código ' + code + '.'); return; }
    if (confirm('No hay ningún producto con el código ' + code + '.\n¿Lo cargás como producto nuevo?')) { S.repo = null; prodForm(null, code); }
  };
  function scanCaja() {
    openScanner({
      title: 'Escaneá los productos', multi: true,
      onCode(code) {
        const p = findByCode(P(), code);
        if (!p) return { ok: false, msg: 'No hay ningún producto con el código ' + code + (adm() ? '. Cargalo en Stock.' : '.') };
        if (!p.pn) return { ok: false, msg: '"' + p.n + '" no tiene precio de venta. Cargalo en Stock → Editar.' };
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
    else if (a === 'inc') { S.cart[i].q += 1; renderCart(); }
    else if (a === 'dec') { if (S.cart[i].q > 1) S.cart[i].q -= 1; else S.cart.splice(i, 1); renderCart(); }
    else if (a === 'rm') { S.cart.splice(i, 1); renderCart(); }
    else if (a === 'wedit') { const l = S.cart[i], p = prod(l.id) || { n: l.n, pn: l.u }; weightDlg(Object.assign({}, p, { pn: l.u }), i); }
    else if (a === 'clear') { if (confirm('¿Vaciar la venta en curso?')) { S.cart = []; S.paga = ''; renderCart(); } }
    else if (a === 'pay') { S.pay = el.dataset.v; renderCart(); }
    else if (a === 'pickcli') { S.cli = id || ''; renderCart(); }
    else if (a === 'cobrar') cobrar();
    else if (a === 'delv') delVenta(id);
    else if (a === 'newcli') cliDlg(null, !!el.dataset.pick);
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
    else if (a === 'fw') { S.edit.w = el.dataset.v === '1'; el.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); S.edit.lbl(); }
    else if (a === 'savep') saveProd();
    else if (a === 'delp') delProd();
    else if (a === 'cancel') closeForms();
    else if (a === 'repo') repoForm(null);
    else if (a === 'rpick') { S.repo.id = id || null; S.repo.note = 0; renderRepo(); }
    else if (a === 'saver') saveRepo();
    else if (a === 'delc') delCompra(id);
    else if (a === 'precios') preciosDlg();
    else if (a === 'scancaja') scanCaja();
    else if (a === 'scanstk') scanStock();
    else if (a === 'scanrepo') scanRepo();
    else if (a === 'scanfs') scanField();
  });
  document.addEventListener('change', (e) => {
    if (!X.isAlm() || !e.target.dataset || !e.target.dataset.alm) return;
    S.month = e.target.value; S.tot = null; drawRes();
  });

  return {
    start, stop, redraw, publishSoon, drawCaja, drawFiado, drawStock, drawRes,
    resetView() { if (S.edit || S.repo) { S.edit = null; S.repo = null; } $('s-stk').innerHTML = ''; }
  };
}
