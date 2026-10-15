// Pantalla "Promociones" de la app (administrador). Sirve para todos los rubros.
// Guarda en stores/{sid}/public/promos = {list:[...]} y la foto de cada promo en public/promoimg_{id}.
import { doc, setDoc, writeBatch, deleteField } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { MAX_PROMOS, vigentes, tituloCant, precioNormal, ahorro } from './promos.js';

// X: db, $, esc, money, fail, canWrite, blockedCard, sid(), biz(), prm(), productos() → [{id,n,pn,img}], cats() → [..], readPhoto, rnd, tab(), show(t)
export function createPromos(X) {
  const { db, $, esc, money } = X;
  let E = null, Q = '';            // promo en edición, búsqueda de productos
  const ref = (id) => doc(db, 'stores', X.sid(), 'public', id);
  const list = () => (X.prm() || []).slice();
  const fdate = (ms) => { const d = new Date(ms); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };
  const dval = (ms) => { if (!ms) return ''; const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const unidad = () => X.biz() === 'almacen' ? 'productos' : X.biz() === 'servicios' ? '' : 'prendas';
  const prodById = (id) => X.productos().find((p) => p.id === id);
  function failW(e) { if (e && /permission/.test(String(e.code || e.message))) alert('No se pudo guardar: tu usuario no tiene permiso (solo administradores).'); else X.fail(e); }
  function guardar(nueva, extra) {
    const b = writeBatch(db);
    b.set(ref('promos'), { list: nueva, at: Date.now() });
    (extra || []).forEach((f) => f(b));
    return b.commit().catch(failW);
  }

  function draw() {
    const box = $('s-promo');
    if (!X.canWrite()) { box.innerHTML = X.blockedCard(); return; }
    if (E) { drawEdit(); return; }
    const L = list(), now = Date.now(), vig = vigentes(L, now).map((p) => p.id);
    let h = '<button class="x" data-pm="back" style="font-size:14px;text-decoration:underline;margin-bottom:10px">← Volver</button>' +
      '<div class="card"><b style="font-size:19px">🔥 Promociones</b><div class="k" style="margin-top:4px">Aparecen arriba de todo en tu catálogo y tus clientes las agregan al pedido.' + (X.biz() === 'almacen' ? ' También las cobrás desde la Caja.' : '') + '</div>' +
      '<div class="row" style="gap:8px;margin-top:6px"><button class="go" data-pm="new" data-t2="combo">+ Combo o precio especial</button><button class="go alt" data-pm="new" data-t2="cant">+ Descuento por cantidad</button></div>' +
      '<div class="k" style="margin-top:10px">Ejemplos: <i>Fernet + Coca a $12.000</i> · <i>Corte + barba de regalo</i> · <i>Llevando 2 o más prendas, 15% OFF</i></div></div>';
    h += '<div class="card"><b>Tus promociones</b>';
    if (!L.length) h += '<div class="empty">Todavía no creaste promociones.</div>';
    L.forEach((p) => {
      const on = vig.indexOf(p.id) >= 0, venc = p.hasta && now > p.hasta;
      const t = p.t === 'cant' ? tituloCant(p, unidad()) : p.titulo;
      const det = p.t === 'cant' ? 'Descuento automático en el pedido' : money(p.precio) + (p.antes > p.precio ? ' <s style="opacity:.6">' + money(p.antes) + '</s> · ahorrás ' + ahorro(p) + '%' : '') + (p.items && p.items.length ? ' · ' + p.items.map((i) => (i.q > 1 ? i.q + '× ' : '') + esc(i.n)).join(' + ') : '');
      h += '<div class="it"><div><b>' + (p.t === 'cant' ? '🏷️ ' : '🔥 ') + esc(t) + '</b><small>' + det + '</small><small>' + (venc ? '<span class="neg">Vencida el ' + fdate(p.hasta) + '</span>' : p.on === false ? 'Pausada' : (p.hasta ? 'Activa hasta el ' + fdate(p.hasta) : 'Activa')) + '</small></div>' +
        '<div style="white-space:nowrap"><button class="x" data-pm="edit" data-id="' + esc(p.id) + '" style="font-size:14px;text-decoration:underline">Editar</button> <button class="x" data-pm="tog" data-id="' + esc(p.id) + '" style="font-size:14px;text-decoration:underline">' + (p.on === false ? 'Activar' : 'Pausar') + '</button> <button class="x" data-pm="del" data-id="' + esc(p.id) + '" aria-label="Borrar">×</button></div></div>';
    });
    box.innerHTML = h + '</div>';
  }

  function nuevo(t) {
    E = t === 'cant' ? { id: 'p' + X.rnd(9), t: 'cant', min: 2, pct: 10, cat: '', on: true, _new: 1 }
      : { id: 'p' + X.rnd(9), t: 'combo', titulo: '', desc: '', precio: '', antes: '', items: [], on: true, _new: 1 };
    Q = ''; draw(); window.scrollTo(0, 0);
  }
  function editar(id) { const p = list().find((x) => x.id === id); if (!p) return; E = JSON.parse(JSON.stringify(p)); E.items = E.items || []; Q = ''; draw(); window.scrollTo(0, 0); }

  function drawEdit() {
    const box = $('s-promo'), cats = X.cats(), sinProd = X.biz() === 'servicios';
    let h = '<button class="x" data-pm="cancel" style="font-size:14px;text-decoration:underline;margin-bottom:10px">← Volver a promociones</button><div class="card">';
    if (E.t === 'cant') {
      h += '<b style="font-size:19px">Descuento por cantidad</b><div class="k" style="margin-top:4px">Se aplica solo en el pedido cuando el cliente lleva la cantidad mínima.</div>' +
        '<div class="row"><div><label>Llevando (mínimo)</label><input id="pe_min" type="number" inputmode="numeric" min="2" value="' + esc(E.min) + '"></div><div><label>Descuento %</label><input id="pe_pct" type="number" inputmode="numeric" min="1" max="90" value="' + esc(E.pct) + '"></div></div>' +
        '<label>¿En qué productos?</label><select id="pe_cat"><option value="">En todos</option>' + cats.map((c) => '<option' + (E.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>' +
        (cats.length ? '' : '<div class="k" style="margin-top:6px">Para aplicarlo a una sola categoría, primero poné categorías a tus productos (Stock → Editar).</div>') +
        '<div class="bn" id="pe_prev" style="margin:14px 0 0"></div>';
    } else {
      const its = E.items.map((it, i) => '<div class="it"><div><b>' + esc(it.n) + '</b>' + (prodById(it.id) ? '<small>' + money(prodById(it.id).pn || 0) + ' c/u</small>' : '') + '</div><div style="display:flex;gap:6px;align-items:center"><button class="qb" data-pm="iq" data-i="' + i + '" data-d="-1">−</button><b style="min-width:22px;text-align:center">' + it.q + '</b><button class="qb" data-pm="iq" data-i="' + i + '" data-d="1">+</button><button class="x" data-pm="irm" data-i="' + i + '" aria-label="Quitar">×</button></div></div>').join('');
      const normal = precioNormal(E.items, (id) => (prodById(id) || {}).pn);
      h += '<b style="font-size:19px">' + (E._new ? 'Nueva promo' : 'Editar promo') + '</b>' +
        '<label>Título</label><input id="pe_tit" maxlength="60" autocomplete="off" placeholder="' + (X.biz() === 'almacen' ? 'Ej: Fernet + Coca' : sinProd ? 'Ej: Corte + barba de regalo' : 'Ej: 2 remeras básicas') + '" value="' + esc(E.titulo) + '">' +
        '<label>Descripción (opcional)</label><input id="pe_desc" maxlength="140" autocomplete="off" placeholder="' + (sinProd ? 'Ej: Válido de lunes a jueves' : 'Ej: Fernet Branca 750 ml + Coca-Cola 2,25 L') + '" value="' + esc(E.desc) + '">' +
        (sinProd ? '' : '<label>¿Qué productos incluye? (opcional)</label><div class="k" style="margin:0 0 6px">Si los elegís, ' + (X.biz() === 'almacen' ? 'al cobrarla en la Caja se descuentan del stock y ' : '') + 'el catálogo muestra sus fotos.</div><div id="pe_items">' + (its || '') + '</div>' +
          '<input id="pe_q" type="search" placeholder="Buscar producto para agregar" autocomplete="off" value="' + esc(Q) + '" style="margin-top:6px"><div id="pe_res"></div>') +
        '<div class="row"><div><label>Precio de la promo</label><input id="pe_pre" type="number" inputmode="numeric" min="0" placeholder="0" value="' + esc(E.precio) + '"></div><div><label>Precio normal (opcional)</label><input id="pe_ant" type="number" inputmode="numeric" min="0" placeholder="' + (normal ? normal : 'Para mostrar el ahorro') + '" value="' + esc(E.antes || '') + '"></div></div>' +
        '<div class="tot" id="pe_ah"></div>' +
        '<label>Foto (opcional)</label><div style="display:flex;gap:12px;align-items:center"><img id="pe_ph" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:12px;' + (E._img ? '' : 'display:none') + '" src="' + esc(E._img || '') + '"><input id="pe_f" type="file" accept="image/*" style="flex:1"></div>' +
        (E.img && !E._img ? '<div class="k" style="margin-top:6px">Ya tiene una foto cargada. Elegí otra para reemplazarla.</div>' : '');
    }
    h += '<label>Válida hasta (opcional)</label><input id="pe_has" type="date" value="' + dval(E.hasta) + '">' +
      '<label style="display:flex;gap:10px;align-items:center;margin-top:14px;font-weight:600"><input id="pe_on" type="checkbox" style="width:auto"' + (E.on !== false ? ' checked' : '') + '> Activa</label>' +
      '<button class="go" data-pm="save">Guardar promo</button>' + (E._new ? '' : '<button class="x" data-pm="del" data-id="' + esc(E.id) + '" style="display:block;margin:16px auto 0;font-size:14px;text-decoration:underline;color:var(--buy)">Borrar esta promo</button>') + '</div>';
    box.innerHTML = h;
    sync();
    if (E.t === 'cant') { ['pe_min', 'pe_pct', 'pe_cat'].forEach((i) => { $(i).oninput = prev; $(i).onchange = prev; }); prev(); return; }
    const q = $('pe_q');
    if (q) { q.oninput = () => { Q = q.value; res(); }; res(); }
    ['pe_pre', 'pe_ant'].forEach((i) => { $(i).oninput = ah; }); ah();
    $('pe_f').onchange = function () { const f = this.files && this.files[0]; if (!f) return; X.readPhoto(f, (o) => { if (!o) { alert('No pude leer esa foto.'); return; } E._img = o; const v = $('pe_ph'); v.src = o; v.style.display = ''; }); };
  }
  // guarda en E lo que se escribió (para no perderlo al redibujar)
  function sync() {
    const v = (i) => ($(i) ? $(i).value : undefined);
    if (E.t === 'cant') { if (v('pe_min') !== undefined) { E.min = Math.floor(+v('pe_min')) || 0; E.pct = Math.floor(+v('pe_pct')) || 0; E.cat = v('pe_cat'); } }
    else if (v('pe_tit') !== undefined) { E.titulo = v('pe_tit'); E.desc = v('pe_desc'); E.precio = v('pe_pre'); E.antes = v('pe_ant'); }
    if (v('pe_has') !== undefined) { const d = v('pe_has'); E.hasta = d ? new Date(d + 'T23:59:59').getTime() : 0; E.on = $('pe_on').checked; }
  }
  function prev() { sync(); const e = $('pe_prev'); if (e) e.innerHTML = '<b>Así se ve en el catálogo:</b><br>🏷️ ' + esc(tituloCant(E, unidad())); }
  function ah() {
    const e = $('pe_ah'); if (!e) return;
    const pre = +$('pe_pre').value, ant = +$('pe_ant').value || precioNormal(E.items, (id) => (prodById(id) || {}).pn);
    e.textContent = pre > 0 && ant > pre ? 'El cliente ahorra ' + money(ant - pre) + ' (' + Math.round((1 - pre / ant) * 100) + '%)' : '';
  }
  function res() {
    const e = $('pe_res'); if (!e) return;
    const t = Q.trim().toLowerCase();
    if (!t) { e.innerHTML = ''; return; }
    const r = X.productos().filter((p) => (p.n + ' ' + (p.s || '')).toLowerCase().indexOf(t) >= 0 && !E.items.some((i) => i.id === p.id)).slice(0, 8);
    e.innerHTML = r.map((p) => '<button class="pl" data-pm="iadd" data-id="' + esc(p.id) + '"><span><b>' + esc(p.n) + '</b><small>' + (p.pn ? money(p.pn) : 'sin precio') + '</small></span><b>+</b></button>').join('') || '<div class="k" style="margin-top:6px">No encontré ese producto.</div>';
  }

  function save() {
    sync();
    const L = list(), i = L.findIndex((x) => x.id === E.id);
    if (i < 0 && L.length >= MAX_PROMOS) { alert('Podés tener hasta ' + MAX_PROMOS + ' promociones. Borrá alguna que ya no uses.'); return; }
    let p;
    if (E.t === 'cant') {
      if (!(E.min >= 2)) { alert('El mínimo tiene que ser 2 o más.'); return; }
      if (!(E.pct >= 1 && E.pct <= 90)) { alert('El descuento tiene que estar entre 1% y 90%.'); return; }
      p = { id: E.id, t: 'cant', min: E.min, pct: E.pct, cat: E.cat || '', on: E.on !== false };
    } else {
      const tit = String(E.titulo || '').trim(), pre = Math.round(+E.precio);
      if (!tit) { alert('Escribí el título de la promo.'); return; }
      if (!(pre > 0)) { alert('Poné el precio de la promo.'); return; }
      const ant = Math.round(+E.antes) || precioNormal(E.items, (id) => (prodById(id) || {}).pn) || 0;
      p = { id: E.id, t: 'combo', titulo: tit.slice(0, 60), desc: String(E.desc || '').trim().slice(0, 140), precio: pre, antes: ant > pre ? ant : 0,
        items: E.items.map((it) => ({ id: it.id, n: it.n, q: it.q })), on: E.on !== false };
      if (E._img || E.img) p.img = 1;
    }
    if (E.hasta) p.hasta = E.hasta;
    if (i >= 0) L[i] = p; else L.unshift(p);
    const img = E._img, id = E.id;
    guardar(L, img ? [(b) => b.set(ref('promoimg_' + id), { f: img })] : []);
    E = null; draw();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-pm]'); if (!el || X.tab() !== 'promo') return;
    const a = el.dataset.pm, id = el.dataset.id, i = +el.dataset.i;
    if (a === 'back') X.show(X.volver());
    else if (a === 'new') nuevo(el.dataset.t2);
    else if (a === 'edit') editar(id);
    else if (a === 'cancel') { E = null; draw(); }
    else if (a === 'save') save();
    else if (a === 'tog') { const L = list(), p = L.find((x) => x.id === id); if (p) { p.on = p.on === false; guardar(L); } }
    else if (a === 'del') {
      const L = list(), p = L.find((x) => x.id === id); if (!p) { E = null; draw(); return; }
      if (!confirm('¿Borrar esta promo?')) return;
      guardar(L.filter((x) => x.id !== id), [(b) => b.delete(ref('promoimg_' + id))]); E = null; draw();
    }
    else if (a === 'iadd') { sync(); const p = prodById(id); if (p) E.items.push({ id: p.id, n: p.n, q: 1 }); Q = ''; drawEdit(); const q = $('pe_q'); if (q) q.focus(); }
    else if (a === 'iq') { sync(); const it = E.items[i]; if (it) it.q = Math.max(1, it.q + +el.dataset.d); drawEdit(); }
    else if (a === 'irm') { sync(); E.items.splice(i, 1); drawEdit(); }
  });

  return {
    draw, editing: () => !!E,
    // tarjeta para Equipo
    card() {
      const L = vigentes(X.prm(), Date.now());
      return '<div class="card"><b>🔥 Promociones</b><div class="k" style="margin:4px 0 0">Combos, precios especiales y descuentos por cantidad que se muestran en tu catálogo.</div>' +
        (L.length ? '<div class="k" style="margin-top:8px"><b>' + L.length + ' activa' + (L.length === 1 ? '' : 's') + ':</b> ' + L.slice(0, 3).map((p) => esc(p.t === 'cant' ? tituloCant(p, unidad()) : p.titulo)).join(' · ') + (L.length > 3 ? '…' : '') + '</div>' : '') +
        '<button class="go alt" data-t="promo">Administrar promociones</button></div>';
    }
  };
}
