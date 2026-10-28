// Vendedores de Pekeron (instaladores Llave en mano en otras ciudades).
// vendedores/{CODIGO} = { code, n, tel, zona, pct (% del abono mientras el cliente pague), meta (clientes nuevos que pagan en el mes),
//   bono ($ extra si llega a la meta), on, at, pagos: { 'AAAA-MM': { at, monto } } }
// Cada tienda guarda stores/{sid}.vend = CODIGO (se carga al crearla con el código o el link del vendedor; el dueño lo puede cambiar).
// La instalación la cobra el vendedor directo al negocio; el abono lo sigue cobrando Pekeron.
// Panel propio del vendedor: el propietario le manda un link con una clave (vendClaves/{CODIGO} = { clave });
// el vendedor entra con su cuenta y queda vinculado (vendUid/{uid} = { code, email }). Ve solo el nombre y el estado
// de sus clientes, su link y lo que le corresponde cobrar.
import { doc, setDoc, getDoc, getDocs, collection, deleteField, writeBatch, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export function createVendedores(X) {
  const db = X.db, esc = X.esc, money = X.money;
  const S = { list: null, busy: false, open: false, mes: '', uids: [] };
  const mesHoy = () => X.today().slice(0, 7);
  const mesTxt = (m) => { const [y, mm] = m.split('-'); return ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+mm - 1] + ' ' + y; };
  const limpio = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

  // ---------- código en el alta de la tienda ----------
  // El link del vendedor es pekeronapp.com/?v=CODIGO (o app.html?v=CODIGO): queda guardado en este dispositivo.
  function desdeLink() {
    try { const v = new URLSearchParams(location.search).get('v'); if (v) localStorage.setItem('pk_vend', limpio(v)); return localStorage.getItem('pk_vend') || ''; } catch (e) { return ''; }
  }
  function validar(code) {
    code = limpio(code); if (!code) return Promise.resolve('');
    return getDoc(doc(db, 'vendedores', code)).then((s) => (s.exists() && s.data().on !== false ? code : null), () => null);
  }

  // ---------- datos ----------
  function cargar() {
    if (S.busy) return; S.busy = true;
    Promise.all([getDocs(collection(db, 'vendedores')), getDocs(collection(db, 'vendUid')).catch(() => null)]).then(([sn, su]) => {
      S.list = []; sn.forEach((d) => S.list.push(d.data())); S.list.sort((a, b) => (a.n || '').localeCompare(b.n || ''));
      S.uids = []; if (su) su.forEach((d) => S.uids.push({ uid: d.id, code: d.data().code, email: d.data().email || '' }));
      S.busy = false; X.changed();
    }, () => { S.list = []; S.busy = false; X.changed(); });
  }
  const precio = (x) => { const a = x.acc || {}, p = X.cfg().plans[a.effectivePlan || a.paidPlan || a.chosenPlan || 'inicial'] || X.cfg().plans.inicial; return x.mon === 'USD' ? { v: p.priceUSD || 0, mon: 'USD' } : { v: p.priceARS || 0, mon: 'ARS' }; };
  // Resumen de un vendedor para un mes: clientes, los que pagan, nuevos del mes que ya pagaron, comisión y bono.
  function cuenta(v, mes, lista) {
    const L = (lista || X.stores() || []).filter((x) => !x.main && x.vend === v.code);
    const ini = new Date(+mes.slice(0, 4), +mes.slice(5) - 1, 1).getTime(), fin = new Date(+mes.slice(0, 4), +mes.slice(5), 1).getTime();
    let pagan = 0, prueba = 0, nuevos = 0, nuevosPagan = 0; const com = { ARS: 0, USD: 0 };
    L.forEach((x) => {
      const st = X.estado(x);
      const paga = st === 'paid' || st === 'life';
      if (paga) { pagan++; if (st !== 'life') { const p = precio(x); com[p.mon] += Math.round(p.v * (v.pct || 0) / 100); } }
      if (st === 'trial') prueba++;
      if (x.created >= ini && x.created < fin) { nuevos++; if (paga) nuevosPagan++; }
    });
    const bono = v.meta > 0 && nuevosPagan >= v.meta ? (v.bono || 0) : 0;
    return { L, pagan, prueba, nuevos, nuevosPagan, com, bono, total: com.ARS + bono };
  }

  // ---------- panel (en Empresas) ----------
  function card() {
    if (S.list == null) { cargar(); return '<div class="card"><b>🤝 Vendedores</b><div class="k" style="margin-top:6px">Cargando…</div></div>'; }
    const mes = S.mes || mesHoy();
    let h = '<details class="card emp" id="vdc"' + (S.open ? ' open' : '') + '><summary><span class="ems"><b>🤝 Vendedores (' + S.list.length + ')</b><small>Instaladores Llave en mano: sus clientes y lo que les toca cobrar</small></span></summary>';
    h += '<div class="k" style="margin:2px 0 10px">La instalación la cobra el vendedor directo al negocio. Vos le pagás una <b>comisión</b> (un % del abono de cada cliente suyo mientras siga pagando) y un <b>bonus</b> si en el mes suma la cantidad de clientes nuevos que pagan que le pusiste de meta.</div>';
    h += '<label>Mes</label><select id="vdm">' + [0, 1, 2, 3, 4, 5].map((i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const m = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); return '<option value="' + m + '"' + (m === mes ? ' selected' : '') + '>' + mesTxt(m) + '</option>'; }).join('') + '</select>';
    if (!S.list.length) h += '<div class="k" style="margin-top:10px">Todavía no cargaste vendedores.</div>';
    S.list.forEach((v) => {
      const c = cuenta(v, mes), pg = v.pagos && v.pagos[mes], link = X.base() + '?v=' + v.code;
      h += '<div style="margin-top:12px;padding:12px 14px;border-radius:16px;background:var(--bg)' + (v.on === false ? ';opacity:.6' : '') + '">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><span><b>' + esc(v.n) + '</b><small style="display:block;color:var(--mut)">Código <b>' + esc(v.code) + '</b>' + (v.zona ? ' · ' + esc(v.zona) : '') + (v.on === false ? ' · desactivado' : '') + '</small></span><b style="font-size:18px;white-space:nowrap">' + money(c.total) + (c.com.USD ? ' + US$ ' + c.com.USD : '') + '</b></div>' +
        '<div class="rows" style="margin:8px 0 0"><div class="r2"><span>Clientes</span><b>' + c.L.length + '<small style="font-weight:400">' + c.pagan + ' pagando · ' + c.prueba + ' en prueba</small></b></div>' +
        '<div class="r2"><span>Nuevos en ' + mesTxt(mes).split(' ')[0] + '</span><b>' + c.nuevos + '<small style="font-weight:400">' + c.nuevosPagan + ' ya pagan' + (v.meta ? ' · meta ' + v.meta : '') + '</small></b></div>' +
        '<div class="r2"><span>Comisión (' + (v.pct || 0) + '% del abono)</span><b>' + money(c.com.ARS) + (c.com.USD ? ' + US$ ' + c.com.USD : '') + '</b></div>' +
        '<div class="r2"><span>Bonus' + (v.meta ? '<small>' + (c.bono ? '¡llegó a la meta! ✓' : 'le faltan ' + Math.max(0, v.meta - c.nuevosPagan) + ' para ' + money(v.bono || 0)) + '</small>' : '') + '</span><b>' + money(c.bono) + '</b></div></div>' +
        (c.L.length ? '<small style="display:block;color:var(--mut);margin-top:6px">' + c.L.map((x) => esc(x.name) + ' (' + ({ paid: 'paga', life: 'pago único', trial: 'prueba', exp: 'vencida', paused: 'pausada', free: 'libre' })[X.estado(x)] + ')').join(' · ') + '</small>' : '') +
        '<div class="k" style="margin-top:8px;font-size:13px">Link para sus clientes: <a href="' + esc(link) + '" target="_blank" rel="noopener" style="color:var(--sell);word-break:break-all">' + esc(link) + '</a></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">' +
        (pg ? '<button class="go alt" disabled style="margin:0">Pagado ✓ ' + money(pg.monto) + '</button>' : '<button class="go" data-vdp="' + esc(v.code) + '" style="margin:0">Marcar pagado</button>') +
        '<a class="go alt" style="margin:0;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center" target="_blank" rel="noopener" href="' + esc(waResumen(v, c, mes)) + '">Mandarle el resumen</a></div>' +
        (() => { const us = S.uids.filter((u) => u.code === v.code); return '<div class="k" style="margin-top:10px;font-size:13px">📱 Su panel: ' + (us.length ? 'entra con <b>' + us.map((u) => esc(u.email || 'su cuenta')).join(', ') + '</b>' : 'todavía no entró') + '</div>' +
          '<button class="go alt" data-vdi="' + esc(v.code) + '" style="margin:8px 0 0">' + (us.length ? 'Mandarle un link nuevo para entrar' : 'Invitarlo a su panel') + '</button>'; })() +
        '<div style="display:flex;gap:14px;justify-content:center;margin-top:8px;flex-wrap:wrap"><button class="x" data-vde="' + esc(v.code) + '" style="font-size:13px;text-decoration:underline">Editar</button><button class="x" data-vdo="' + esc(v.code) + '" style="font-size:13px;text-decoration:underline">' + (v.on === false ? 'Activar' : 'Desactivar') + '</button><button class="x" data-vdx="' + esc(v.code) + '" style="font-size:13px;text-decoration:underline;color:#c0392b">Eliminar</button></div></div>';
    });
    h += '<button class="go alt" data-vdn="1" style="margin-top:14px">+ Nuevo vendedor</button>';
    return h + '</details>';
  }
  function waResumen(v, c, mes) {
    const l = ['Hola ' + (v.n || '').split(' ')[0] + '! Resumen de Pekeron App de ' + mesTxt(mes) + ':', '',
      '👥 Clientes: ' + c.L.length + ' (' + c.pagan + ' pagando, ' + c.prueba + ' en prueba)',
      '🆕 Nuevos este mes: ' + c.nuevos + ' (' + c.nuevosPagan + ' ya pagan)' + (v.meta ? ' · meta: ' + v.meta : ''),
      '💵 Comisión (' + (v.pct || 0) + '%): ' + money(c.com.ARS) + (c.com.USD ? ' + US$ ' + c.com.USD : ''),
      '🎯 Bonus: ' + money(c.bono) + (v.meta && !c.bono ? ' (te faltan ' + Math.max(0, v.meta - c.nuevosPagan) + ')' : ''),
      '', '*Total: ' + money(c.total) + (c.com.USD ? ' + US$ ' + c.com.USD : '') + '*', '', 'Tu link para nuevos clientes: ' + X.base() + '?v=' + v.code];
    const tel = String(v.tel || '').replace(/\D/g, '');
    return 'https://wa.me/' + (tel ? (tel.length <= 10 ? '549' + tel : tel) : '') + '?text=' + encodeURIComponent(l.join('\n'));
  }
  function form(v) {
    const nuevo = !v; v = v || { pct: 20, meta: 5, bono: 30000 };
    const o = X.modal('<b style="font-size:19px">' + (nuevo ? 'Nuevo vendedor' : 'Editar vendedor') + '</b>' +
      '<label>Nombre</label><input id="vfn" maxlength="50" autocomplete="off" value="' + esc(v.n || '') + '" placeholder="Ej: Marcos Pérez">' +
      '<div class="row"><div><label>WhatsApp</label><input id="vft" inputmode="tel" maxlength="20" value="' + esc(v.tel || '') + '" placeholder="381 555 1234"></div><div><label>Ciudad / zona</label><input id="vfz" maxlength="40" value="' + esc(v.zona || '') + '" placeholder="Ej: Salta capital"></div></div>' +
      '<label>Código (lo usan sus clientes)</label><input id="vfc" maxlength="10" autocomplete="off" value="' + esc(v.code || '') + '" placeholder="Ej: MARCOS"' + (nuevo ? '' : ' disabled') + ' style="text-transform:uppercase">' +
      '<div class="row"><div><label>Comisión (% del abono)</label><input id="vfp" type="number" inputmode="decimal" min="0" max="100" value="' + (v.pct || 0) + '"></div><div><label>Meta (clientes nuevos que pagan en el mes)</label><input id="vfm" type="number" inputmode="numeric" min="0" value="' + (v.meta || 0) + '"></div></div>' +
      '<label>Bonus si llega a la meta ($)</label><input id="vfb" type="number" inputmode="decimal" min="0" value="' + (v.bono || 0) + '">' +
      '<button class="go" id="vfok">Guardar</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const nm = o.querySelector('#vfn'), cd = o.querySelector('#vfc');
    if (nuevo) nm.oninput = () => { if (!cd.dataset.t) cd.value = limpio(nm.value.split(' ')[0]).slice(0, 8); }; cd.oninput = () => { cd.dataset.t = '1'; };
    o.querySelector('#vfok').onclick = () => {
      const n = nm.value.trim(), code = nuevo ? limpio(cd.value) : v.code;
      if (!n || !code) { alert('Completá el nombre y el código.'); return; }
      if (code.length < 3) { alert('El código tiene que tener al menos 3 letras o números.'); return; }
      if (nuevo && (S.list || []).some((x) => x.code === code)) { alert('Ya hay un vendedor con ese código.'); return; }
      const d = { code, n, tel: o.querySelector('#vft').value.trim(), zona: o.querySelector('#vfz').value.trim(), pct: Math.max(0, Math.min(100, +o.querySelector('#vfp').value || 0)), meta: Math.max(0, Math.floor(+o.querySelector('#vfm').value || 0)), bono: Math.max(0, Math.round(+o.querySelector('#vfb').value || 0)) };
      if (nuevo) { d.on = true; d.at = Date.now(); }
      setDoc(doc(db, 'vendedores', code), d, { merge: true }).then(() => { o.remove(); S.list = null; S.open = true; X.changed(); }).catch(X.fail);
    };
    setTimeout(() => nm.focus(), 50);
  }
  function pagar(code) {
    const v = (S.list || []).find((x) => x.code === code); if (!v) return;
    const mes = S.mes || mesHoy(), c = cuenta(v, mes);
    const m = prompt('¿Cuánto le pagaste a ' + v.n + ' por ' + mesTxt(mes) + '?', String(c.total)); if (m === null) return;
    const monto = Math.max(0, Math.round(+String(m).replace(/[^\d]/g, '') || 0));
    setDoc(doc(db, 'vendedores', code), { pagos: { [mes]: { at: Date.now(), monto } } }, { merge: true }).then(() => { S.list = null; S.open = true; X.changed(); }).catch(X.fail);
  }
  function click(e) {
    const t = e.target;
    const q = (s) => t.closest && t.closest(s);
    let b;
    if ((b = q('[data-vdn]'))) { form(null); return true; }
    if ((b = q('[data-vde]'))) { form((S.list || []).find((x) => x.code === b.dataset.vde)); return true; }
    if ((b = q('[data-vdp]'))) { pagar(b.dataset.vdp); return true; }
    if ((b = q('[data-vdo]'))) { const v = (S.list || []).find((x) => x.code === b.dataset.vdo); if (v) setDoc(doc(db, 'vendedores', v.code), { on: v.on === false }, { merge: true }).then(() => { S.list = null; S.open = true; X.changed(); }).catch(X.fail); return true; }
    if ((b = q('[data-vda]'))) { asignar(b.dataset.vda); return true; }
    if ((b = q('[data-vdx]'))) { eliminar(b.dataset.vdx); return true; }
    if ((b = q('[data-vdi]'))) { invitar(b.dataset.vdi); return true; }
    return false;
  }
  function change(e) { if (e.target.id === 'vdm') { S.mes = e.target.value; S.open = true; X.changed(); return true; } return false; }
  function toggle(e) { if (e.target.id === 'vdc') S.open = e.target.open; }
  // En cada tienda (Empresas): quién la trajo, y cambiarlo.
  function fila(x) {
    const v = (S.list || []).find((y) => y.code === x.vend);
    return '<div class="r2"><span>Vendedor</span><b style="font-size:15px">' + (x.vend ? esc(v ? v.n : x.vend) + ' <small style="font-weight:400">' + esc(x.vend) + '</small>' : '<span style="color:var(--mut);font-weight:400">ninguno</span>') + ' <button class="x" data-vda="' + esc(x.sid) + '" style="font-size:13px;text-decoration:underline">Cambiar</button></b></div>';
  }
  function asignar(sid) {
    const x = (X.stores() || []).find((y) => y.sid === sid); if (!x) return;
    const ops = (S.list || []).map((v) => v.code + ' (' + v.n + ')').join(', ');
    const c = prompt('Código del vendedor que trajo a "' + x.name + '".' + (ops ? '\n\nVendedores: ' + ops : '') + '\n\nDejalo vacío para sacarlo.', x.vend || ''); if (c === null) return;
    const code = limpio(c);
    if (code && !(S.list || []).some((v) => v.code === code)) { alert('No hay ningún vendedor con el código ' + code + '.'); return; }
    setDoc(doc(db, 'stores', sid), { vend: code || deleteField() }, { merge: true }).then(() => { x.vend = code; X.changed(); }).catch(X.fail);
  }
  // ---------- eliminar ----------
  // Sus negocios quedan sin vendedor (se pueden asignar a otro con "Cambiar"); se borra también su acceso al panel.
  function eliminar(code) {
    const v = (S.list || []).find((x) => x.code === code); if (!v) return;
    const L = (X.stores() || []).filter((x) => x.vend === code), us = S.uids.filter((u) => u.code === code);
    if (!confirm('¿Eliminar a ' + v.n + ' (' + code + ')?\n\n' + (L.length ? L.length + ' negocio' + (L.length > 1 ? 's quedan' : ' queda') + ' sin vendedor (después los podés asignar a otro con "Cambiar").\n' : '') + 'Se borra también su historial de pagos y deja de poder entrar a su panel. No se puede deshacer.')) return;
    const b = writeBatch(db);
    b.delete(doc(db, 'vendedores', code)); b.delete(doc(db, 'vendClaves', code));
    us.forEach((u) => b.delete(doc(db, 'vendUid', u.uid)));
    L.forEach((x) => b.set(doc(db, 'stores', x.sid), { vend: deleteField() }, { merge: true }));
    b.commit().then(() => { L.forEach((x) => { x.vend = ''; }); S.list = null; S.open = true; X.changed(); }).catch(X.fail);
  }

  // ---------- invitación a su panel ----------
  const ALF = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const clave = () => { const a = new Uint32Array(6); crypto.getRandomValues(a); return Array.from(a, (n) => ALF[n % ALF.length]).join(''); };
  function invitar(code) {
    const v = (S.list || []).find((x) => x.code === code); if (!v) return;
    const k = clave(), link = X.base() + 'app.html?vinv=' + code + '-' + k;
    // Abrimos WhatsApp antes de guardar para que el celular no bloquee la ventana.
    const tel = String(v.tel || '').replace(/\D/g, '');
    const txt = ['Hola ' + (v.n || '').split(' ')[0] + '! Ya tenés tu panel de vendedor de Pekeron App 🤝', '', 'Ahí ves tus clientes, cuánto llevás ganado en el mes y tu link para compartir.', '', '1) Entrá a este link: ' + link, '2) Creá tu cuenta o entrá con la que ya tengas.', '', 'Si te pide un código, es: ' + code + '-' + k, '(Es personal: no lo compartas)'].join('\n');
    const w = window.open('https://wa.me/' + (tel ? (tel.length <= 10 ? '549' + tel : tel) : '') + '?text=' + encodeURIComponent(txt), '_blank');
    setDoc(doc(db, 'vendClaves', code), { clave: k, at: Date.now() }).then(() => { if (!w) prompt('Mandale este link a ' + v.n + ':', link); }).catch((e) => { if (w) w.close(); X.fail(e); });
  }
  // El vendedor usa el link (app.html?vinv=CODIGO-CLAVE) o pega el código en "Unirme con un código".
  const esInvitacion = (c) => /^[A-Z0-9]{3,10}-[A-Z0-9]{6}$/.test(String(c || '').trim().toUpperCase());
  function invDesdeLink() {
    try { const v = new URLSearchParams(location.search).get('vinv'); if (v && esInvitacion(v)) localStorage.setItem('pk_vinv', v.toUpperCase()); return localStorage.getItem('pk_vinv') || ''; } catch (e) { return ''; }
  }
  function vincular(uid, email, txt) {
    const [code, k] = String(txt).trim().toUpperCase().split('-');
    const b = writeBatch(db);
    b.set(doc(db, 'vendUid', uid), { code, clave: k, email: email || '', at: Date.now() });
    b.delete(doc(db, 'vendClaves', code));
    return b.commit().then(() => { try { localStorage.removeItem('pk_vinv'); } catch (e) {} return code; },
      (e) => { try { localStorage.removeItem('pk_vinv'); } catch (e2) {} throw e; });
  }

  // ---------- panel del vendedor ----------
  const P = { code: '', v: null, list: null, mes: '', err: '' };
  const EST = { paid: ['pagando', '#1a8f4c'], life: ['pago único', '#1a8f4c'], trial: ['en prueba', '#b7791f'], exp: ['vencida', '#c0392b'], paused: ['pausada', '#7a7a7a'], free: ['activa', '#1a8f4c'] };
  function panelCargar(code) {
    P.code = code; P.list = null; P.err = '';
    Promise.all([getDoc(doc(db, 'vendedores', code)), getDocs(query(collection(db, 'stores'), where('vend', '==', code)))]).then(([vs, sn]) => {
      if (!vs.exists()) { P.err = 'Tu cuenta de vendedor ya no está activa. Escribile a Pekeron.'; X.panelDraw(); return; }
      P.v = vs.data();
      const ps = []; sn.forEach((d) => { const st = d.data(); ps.push(getDoc(doc(db, 'stores', d.id, 'billing', 'access')).then((a) => ({ sid: d.id, name: st.name || 'Tienda', created: st.created || 0, mon: st.mon || 'ARS', main: st.main || '', vend: st.vend, acc: a.exists() ? a.data() : null }), () => ({ sid: d.id, name: st.name || 'Tienda', created: st.created || 0, mon: st.mon || 'ARS', main: st.main || '', vend: st.vend, acc: null }))); });
      return Promise.all(ps).then((l) => { P.list = l.sort((a, b) => b.created - a.created); X.panelDraw(); });
    }).catch(() => { P.err = 'No pude cargar tu panel. Revisá tu conexión y probá de nuevo.'; X.panelDraw(); });
  }
  function panel() {
    let h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:20px">🤝 Panel de vendedor</b><button class="x" data-vpx="1" style="font-size:14px;text-decoration:underline">Volver</button></div>';
    if (P.err) return h + '<div class="k" style="margin-top:10px">' + esc(P.err) + '</div></div>';
    if (!P.v || !P.list) return h + '<div class="k" style="margin-top:10px">Cargando…</div></div>';
    const v = P.v, mes = P.mes || mesHoy(), c = cuenta(v, mes, P.list), pg = v.pagos && v.pagos[mes], link = X.base() + '?v=' + v.code;
    h += '<div class="k" style="margin-top:4px">Hola ' + esc((v.n || '').split(' ')[0]) + '! Tu código es <b>' + esc(v.code) + '</b>' + (v.zona ? ' · ' + esc(v.zona) : '') + (v.on === false ? ' · <b style="color:#c0392b">desactivado</b>' : '') + '</div>';
    h += '<label>Mes</label><select id="vpm">' + [0, 1, 2, 3, 4, 5].map((i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const m = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); return '<option value="' + m + '"' + (m === mes ? ' selected' : '') + '>' + mesTxt(m) + '</option>'; }).join('') + '</select>';
    h += '<div style="margin-top:12px;padding:16px;border-radius:18px;background:var(--ink);color:var(--card)"><small style="opacity:.75;font-weight:700">' + (mes === mesHoy() ? 'LLEVÁS GANADO ESTE MES' : 'GANASTE EN ' + mesTxt(mes).toUpperCase()) + '</small><div style="font-size:34px;font-weight:900;letter-spacing:-.02em;margin-top:2px">' + money(c.total) + (c.com.USD ? ' <span style="font-size:20px">+ US$ ' + c.com.USD + '</span>' : '') + '</div>' +
      '<small style="opacity:.85">' + (pg ? '✓ Te pagaron ' + money(pg.monto) + ' el ' + new Date(pg.at).toLocaleDateString('es-AR') : 'Comisión ' + money(c.com.ARS) + ' + bonus ' + money(c.bono)) + '</small></div>';
    if (v.meta) {
      const pc = Math.min(100, Math.round(c.nuevosPagan / v.meta * 100));
      h += '<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px"><span>🎯 Meta del mes: ' + c.nuevosPagan + ' de ' + v.meta + '</span><span>' + money(v.bono || 0) + '</span></div>' +
        '<div style="height:10px;border-radius:99px;background:var(--line);margin-top:6px;overflow:hidden"><div style="height:100%;width:' + pc + '%;background:#1a8f4c;border-radius:99px"></div></div>' +
        '<div class="k" style="margin-top:6px;font-size:13px">' + (c.bono ? '¡Llegaste a la meta! Ganaste el bonus ✓' : 'Te faltan ' + Math.max(0, v.meta - c.nuevosPagan) + ' clientes nuevos que paguen este mes para el bonus.') + '</div></div>';
    }
    h += '<div class="rows" style="margin-top:12px"><div class="r2"><span>Clientes</span><b>' + c.L.length + '<small style="font-weight:400">' + c.pagan + ' pagando · ' + c.prueba + ' en prueba</small></b></div>' +
      '<div class="r2"><span>Nuevos en ' + mesTxt(mes).split(' ')[0] + '</span><b>' + c.nuevos + '<small style="font-weight:400">' + c.nuevosPagan + ' ya pagan</small></b></div>' +
      '<div class="r2"><span>Tu comisión</span><b>' + (v.pct || 0) + '%<small style="font-weight:400">del abono, mientras sigan pagando</small></b></div></div></div>';
    h += '<div class="card"><b>Tu link para nuevos clientes</b><div class="k" style="margin-top:4px">El negocio que crea su tienda desde este link queda registrado como tuyo. También puede poner tu código <b>' + esc(v.code) + '</b> al crearla.</div>' +
      '<div style="margin-top:10px;padding:12px;border-radius:12px;background:var(--bg);font-weight:700;word-break:break-all">' + esc(link) + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><button class="go" data-vpc="' + esc(link) + '" style="margin:0">Copiar link</button><a class="go alt" style="margin:0;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('Hola! Te paso el link para crear tu tienda en Pekeron App (caja, stock, fiado y catálogo online): ' + link) + '">Compartir</a></div></div>';
    h += '<div class="card"><b>Tus clientes (' + c.L.length + ')</b>' + (c.L.length ? c.L.map((x) => { const e = EST[X.estado(x)] || EST.free; return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line)"><span style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(x.name) + '</b><small style="color:var(--mut)">desde el ' + (x.created ? new Date(x.created).toLocaleDateString('es-AR') : '—') + '</small></span><span style="flex:none;font-size:12.5px;font-weight:800;color:#fff;background:' + e[1] + ';border-radius:99px;padding:4px 10px">' + e[0] + '</span></div>'; }).join('') : '<div class="k" style="margin-top:6px">Todavía no tenés clientes. Compartí tu link para sumar el primero.</div>') + '</div>';
    const pgs = Object.keys(v.pagos || {}).sort().reverse();
    if (pgs.length) h += '<div class="card"><b>Pagos que recibiste</b>' + pgs.map((m) => '<div class="r2" style="padding:8px 0;border-top:1px solid var(--line)"><span>' + mesTxt(m) + '</span><b>' + money(v.pagos[m].monto) + '</b></div>').join('') + '</div>';
    h += '<div class="card"><b>Cómo se calcula</b><div class="k" style="margin-top:6px">• Cobrás la instalación directo al negocio.<br>• Cada mes ganás el ' + (v.pct || 0) + '% del abono de cada cliente tuyo que esté pagando (los que están en prueba o vencidos no suman).' + (v.meta ? '<br>• Si en el mes sumás ' + v.meta + ' clientes nuevos que ya pagan, ganás un bonus de ' + money(v.bono || 0) + '.' : '') + '</div></div>';
    return h;
  }
  function panelClick(e) {
    const t = e.target, b = t.closest && t.closest('[data-vpc]');
    if (b) { const l = b.dataset.vpc; (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => { b.textContent = '¡Copiado!'; setTimeout(() => { b.textContent = 'Copiar link'; }, 1500); }, () => prompt('Copiá tu link:', l)); return true; }
    return false;
  }
  function panelChange(e) { if (e.target.id === 'vpm') { P.mes = e.target.value; X.panelDraw(); return true; } return false; }
  return { desdeLink, validar, card, click, change, toggle, fila, recargar: () => { S.list = null; }, esInvitacion, invDesdeLink, vincular, panelCargar, panel, panelClick, panelChange };
}
