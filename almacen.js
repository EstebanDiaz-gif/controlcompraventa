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
import { openScanner, scanButton, findByCode, beep, canScan } from './scanner.js';
// Computadora (mouse, sin pantalla táctil): ahí se usa la pistola lectora en vez de la cámara.
const PC = (() => { try { return matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(any-pointer: coarse)').matches; } catch (e) { return false; } })();
import { CAMPOS, leerArchivo, detectar, armar, plan, ejemploCsv } from './planilla.js';
export { CATS, PAY };

// ---------- módulo de pantalla ----------
// X = contexto que pasa app.html: db, $, esc, money, today, fail, canWrite, blockedCard, nm, rnd, readPhoto,
// mlabel, gTotal(mes), y getters de estado: sid(), role(), user(), st(), sname(), isAlm().
export function createAlmacen(X) {
  const { db, $, esc, money } = X;
  const S = {
    cart: [], q: '', cat: '', pay: 'ef', cli: '', cliQ: '', paga: '', last: '',
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
      box.innerHTML = '<div class="card"><div class="empty">' + (load() ? 'Todavía no cargaste productos. Empezá por el Stock.' : 'Todavía no hay productos cargados. Un administrador tiene que cargarlos.') + '</div>' + (load() ? '<button class="go" data-t="stk">Ir a Stock</button>' : '') + '</div>';
      return;
    }
    if (!$('cjq')) {
      box.innerHTML = '<div class="card"><div style="display:flex;gap:8px;align-items:center"><input id="cjq" type="search" enterkeyhint="go" placeholder="Buscar producto o código" autocomplete="off" style="flex:1;min-width:0" value="' + esc(S.q) + '">' + scanButton('scancaja') + '</div>' +
        '<button class="x" data-al="libre" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin-top:8px">+ Importe libre (algo que no está cargado)</button>' +
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
    if (p) { if (p.pn) beep(true); addProd(p); } else if (/^\d{6,}$/.test(q)) { beep(false); if (load() && confirm('El código ' + q + ' no está cargado. ¿Lo cargás ahora?')) qkModal(q, (np) => addProd(np)); } // código que no existe
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
    if (S.edit || S.repo || S.imp || S.qk) return; // hay un formulario abierto: no lo pisamos
    if (!$('aq')) {
      box.innerHTML = (load() ? '<div class="row" style="gap:8px;margin-bottom:6px"><button class="go" data-al="newp" style="margin-top:0">+ Producto</button><button class="go alt" data-al="repo" style="margin-top:0">Reponer</button></div><button class="go" data-al="qk" style="margin:4px 0 6px">📷 Carga rápida escaneando</button><div class="row" style="gap:8px;margin:4px 0 14px"><button class="go alt" data-al="imp" style="margin-top:0">Importar desde Excel</button>' + (adm() ? '<button class="go alt" data-al="precios" style="margin-top:0">Precios por %</button>' : '') + '</div>' : '') +
        '<div style="display:flex;gap:8px;align-items:center"><input id="aq" type="search" placeholder="Buscar producto o código" autocomplete="off" style="flex:1;min-width:0" value="' + esc(S.stQ) + '">' + scanButton('scanstk') + '</div><div id="acats" class="chips" style="margin:10px 0 12px"></div><div id="abody"></div>';
      $('aq').oninput = function () { S.stQ = this.value; renderStock(); };
    }
    renderStock();
  }
  function renderStock() {
    const all = P(), low = all.filter((p) => p.q <= (p.min || 0) && (p.min || p.q <= 0)).length, sinCod = all.filter((p) => !p.s).length;
    if (!sinCod) S.stNoCod = false;
    $('acats').innerHTML = '<button class="ch' + (!S.stCat && !S.stLow ? ' on' : '') + '" data-al="scat" data-v="">Todos (' + all.length + ')</button>' +
      '<button class="ch' + (S.stLow ? ' on' : '') + '" data-al="slow">Por reponer (' + low + ')</button>' +
      (load() && sinCod ? '<button class="ch' + (S.stNoCod ? ' on' : '') + '" data-al="snocod">Sin código (' + sinCod + ')</button>' : '') +
      usedCats().map((c) => '<button class="ch' + (S.stCat === c ? ' on' : '') + '" data-al="scat" data-v="' + esc(c) + '">' + esc(c) + '</button>').join('');
    const l = all.filter((p) => (!S.stNoCod || !p.s) && (!S.stCat || p.cat === S.stCat) && (!S.stLow || (p.q <= (p.min || 0) && (p.min || p.q <= 0))) && match(p.n + ' ' + p.s + ' ' + p.cat, S.stQ)).sort((a, b) => a.n.localeCompare(b.n));
    let val = 0; all.forEach((p) => { val += Math.max(p.q, 0) * (p.c || 0); });
    let h = adm() ? '<div class="k" style="margin:0 4px 10px">' + all.length + ' productos · mercadería en stock (a costo): <b>' + money(val) + '</b></div>' : '';
    h += '<div class="card">';
    if (S.stNoCod && l.length) h += '<div class="k" style="margin-bottom:6px">Tocá "Escanear código" en cada producto y pasale la cámara por el código de barras. También podés escanear desde el buscador: si el código no existe, te deja elegir a qué producto asignarlo.</div>';
    if (!l.length) h += '<div class="empty">' + (all.length ? 'No hay productos en esta vista.' : (load() ? 'Cargá tu primer producto con "+ Producto".' : 'Todavía no hay productos cargados.')) + '</div>';
    const shown = l.slice(0, 300);
    shown.forEach((p) => {
      const lw = p.q <= (p.min || 0) && (p.min || p.q <= 0), mg = p.pn && p.c ? Math.round((p.pn - p.c) / p.pn * 100) : null;
      h += '<div class="it"><div>' + (p.img ? '<img src="' + p.img + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:10px;float:left;margin:0 10px 4px 0">' : '') + '<b>' + esc(p.n) + '</b>' + (p.s ? '<span class="sku">' + esc(p.s) + '</span>' : '') +
        '<small>' + (p.cat ? '<em class="tag">' + esc(p.cat) + '</em>' : '') + priceTxt(p) + (adm() && p.c ? ' · costo ' + money(p.c) + (p.ce ? ' (estimado)' : '') + (mg != null ? ' · margen ' + mg + '%' : '') : '') + '</small>' +
        (load() ? '<button class="x" data-al="editp" data-id="' + esc(p.id) + '" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin-top:4px">Editar</button>' : '') +
        (load() && S.stNoCod ? '<button class="x" data-al="asigcod" data-id="' + esc(p.id) + '" style="font-size:14px;font-weight:700;text-decoration:underline;color:var(--ink);margin:4px 0 0 14px">Escanear código</button>' : '') + '</div>' +
        '<div class="amt"><b class="' + (p.q < 0 ? 'neg' : lw ? 'neg' : '') + '">' + fq(p.q, p.w) + '</b><small>' + (lw ? 'reponer' : 'en stock') + '</small></div></div>';
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
      '<button class="go" data-al="savep">Guardar</button>' + (p && adm() ? '<button class="x" data-al="delp" style="display:block;margin:18px auto 0;font-size:14px;text-decoration:underline;color:var(--buy)">Eliminar este producto</button>' : '') + '</div>';
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
  const NOMC = {};
  function buscarNombre(code) {
    if (!/^\d{8,14}$/.test(code)) return Promise.resolve('');
    if (NOMC[code] != null) return Promise.resolve(NOMC[code]);
    const one = (host) => {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(() => ctl && ctl.abort(), 3500);
      return fetch('https://' + host + '/api/v2/product/' + code + '.json?fields=product_name_es,product_name,brands,quantity', ctl ? { signal: ctl.signal } : {})
        .then((r) => (r.ok ? r.json() : null)).then((j) => {
          clearTimeout(t); const p = j && j.status === 1 && j.product; if (!p) return '';
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
    e.innerHTML = S.qk.n ? '<div class="card"><b>Cargados ahora: ' + S.qk.n + '</b>' + S.qk.log.slice(0, 10).map((p) => '<div class="it"><div><b>' + esc(p.n) + '</b><small>' + (p.s ? esc(p.s) + ' · ' : '') + (p.ce ? 'costo estimado' : p.c ? 'costo ' + money(p.c) : 'sin costo') + '</small></div><div class="amt"><b>' + (p.pn ? money(p.pn) : 'sin precio') + '</b><small>stock ' + fq(p.q, p.w) + '</small></div></div>').join('') + '</div>' : '';
  }
  // Formulario corto, reutilizado por la carga rápida y por la caja (código desconocido).
  function qkForm(box, code, cb) {
    const c = qkCfg(), p = code ? findByCode(P(), code) : null;
    const catOpts = CATS.map((x) => '<option value="' + esc(x) + '"' + ((p ? p.cat : S.qkCat) === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    box.innerHTML = '<div class="card" style="border:2px solid var(--ink)">' +
      (p ? '<b style="font-size:18px">' + esc(p.n) + '</b><div class="k">Ya está cargado · código ' + esc(p.s) + ' · stock ' + fq(p.q, p.w) + '</div>'
        : '<b style="font-size:18px">Producto nuevo</b><div class="k">' + (code ? 'Código ' + esc(code) : 'Sin código de barras') + '</div>' +
          '<label>Nombre</label><input id="qk_n" maxlength="80" autocomplete="off" placeholder="' + (code ? 'Buscando el nombre…' : 'Ej: Queso cremoso') + '"><div class="k" id="qk_nf" style="margin-top:4px"></div>' +
          '<label>Categoría</label><select id="qk_c"><option value="">Sin categoría</option>' + catOpts + '</select>' +
          '<label class="row" style="align-items:center;gap:8px;margin-top:12px;font-weight:600;color:var(--ink)"><input id="qk_w" type="checkbox" style="width:auto"' + (code ? '' : ' checked') + '> Se vende por peso (kg)</label>') +
      '<div class="row"><div><label id="qk_lp">Precio de venta</label><input id="qk_p" type="number" inputmode="decimal" min="0" placeholder="0" value="' + (p && p.pn ? p.pn : '') + '"></div>' +
      '<div><label id="qk_lc">Costo' + (p ? '' : ' (opcional)') + '</label><input id="qk_co" type="number" inputmode="decimal" min="0" placeholder="' + (p && p.c ? p.c : 'si no sabés, vacío') + '" value=""></div></div>' +
      '<div class="k" id="qk_hint" style="margin-top:6px"></div>' +
      '<label id="qk_lq">' + (p ? '¿Cuántos hay? (stock contado)' : '¿Cuántos hay?') + '</label><input id="qk_q" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (p ? n3(p.q) : '') + '" enterkeyhint="done">' +
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
    if (!p) { q('qk_w').onchange = labels; q('qk_c').onchange = () => { S.qkCat = q('qk_c').value; }; }
    labels(); hint();
    const first = p ? q('qk_q') : q('qk_n');
    setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, 120);
    if (!p && code) buscarNombre(code).then((n) => {
      const el = q('qk_n'); if (!el) return;
      el.placeholder = 'Ej: Galletitas Oreo 118 g';
      if (n && !el.value) { el.value = n; q('qk_nf').textContent = '✓ Nombre encontrado en la base de productos (podés corregirlo)'; try { q('qk_p').focus({ preventScroll: true }); } catch (e) { /* nada */ } }
      else if (!n) q('qk_nf').textContent = 'No lo encontré en la base de productos: escribí el nombre.';
    });
    q('qk_q').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); q('qk_ok').click(); } };
    q('qk_x').onclick = () => cb.onCancel();
    q('qk_ok').onclick = () => {
      const pr = +q('qk_p').value || 0, coIn = q('qk_co').value === '' ? null : +q('qk_co').value, qs = q('qk_q').value.trim(), cant = qs === '' ? null : r3(pnum(qs)), w = isW();
      if (pr < 0 || (coIn != null && coIn < 0)) { alert('Los precios no pueden ser negativos.'); return; }
      if (/^\d{8,14}$/.test(qs)) { q('qk_q').value = ''; beep(false); alert('Eso parece un código de barras, no una cantidad. Terminá este producto (escribí cuántos hay y tocá Guardar) antes de pasar el siguiente.'); q('qk_q').focus(); return; }
      if (cant != null && (isNaN(cant) || cant < 0)) { alert('Revisá la cantidad (usá números, por ejemplo 12 o 1,5).'); return; }
      if (cant != null && !w && cant !== Math.floor(cant)) { alert('Este producto se vende por unidad: la cantidad tiene que ser entera.'); return; }
      if (p) {
        const o = {};
        if (pr > 0 && pr !== p.pn) o.pn = pr;
        if (coIn != null && coIn > 0) { o.c = coIn; o.ce = deleteField(); }
        if (cant != null) o.q = cant;
        const done = Object.assign({}, p, { pn: o.pn || p.pn, c: o.c || p.c, q: cant != null ? cant : p.q, ce: o.c ? 0 : p.ce });
        if (!Object.keys(o).length) { cb.onDone(done); return; }
        q('qk_ok').disabled = true;
        setDoc(ref('stock', p.id), o, { merge: true }).catch(failW); cb.onDone(done); return;
      }
      const n = q('qk_n').value.trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!n) { alert('Escribí el nombre del producto.'); q('qk_n').focus(); return; }
      if (code && findByCode(P(), code)) { alert('Ese código ya está cargado.'); return; }
      const ce = coIn == null && pr > 0, co = coIn != null ? coIn : (pr > 0 ? costoDesde(pr, c) : 0);
      const id = 'al_' + X.rnd(10), o = { n, s: code || '', cat: q('qk_c').value, w, pn: pr, c: co, q: cant || 0, min: 0, oh: false, alm: 1 };
      if (ce) o.ce = 1;
      q('qk_ok').disabled = true;
      setDoc(ref('stock', id), o, { merge: true }).catch(failW);
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
      if (S.repo) { S.repo.id = p.id; S.repo.note = 0; renderRepo(); }
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
        if (!p && load()) { later(() => qkModal(code, (np) => addProd(np))); return { ok: false, close: true, msg: 'Código nuevo: cargalo y sigue la venta' }; }
        if (!p) return { ok: false, msg: 'No hay ningún producto con el código ' + code + '. Avisale a quien carga los productos.' };
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
    else if (a === 'delp') { if (adm()) delProd(); }
    else if (a === 'cancel') closeForms();
    else if (a === 'repo') repoForm(null);
    else if (a === 'rpick') { S.repo.id = id || null; S.repo.note = 0; renderRepo(); }
    else if (a === 'saver') saveRepo();
    else if (a === 'delc') delCompra(id);
    else if (a === 'precios') preciosDlg();
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
  document.addEventListener('change', (e) => {
    if (!X.isAlm() || !e.target.dataset || !e.target.dataset.alm) return;
    S.month = e.target.value; S.tot = null; drawRes();
  });

  return {
    start, stop, redraw, publishSoon, drawCaja, drawFiado, drawStock, drawRes,
    resetView() { if (S.imp && S.imp.step === 'run') return; qkStop(); S.edit = null; S.repo = null; S.imp = null; S.qk = null; $('s-stk').innerHTML = ''; }
  };
}
