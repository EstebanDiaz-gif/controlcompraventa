// AGENDA de turnos (rubro servicios / ambos).
// - Pestaña Agenda: turnos del día por profesional, agendar a mano, bloquear horarios, cancelar (con aviso por
//   WhatsApp), Atender (abre la atención con los datos del turno) y recordatorio por WhatsApp.
// - Configuración (administrador): turnos online sí/no, horarios por día, intervalo, anticipación, días hacia
//   adelante, quiénes atienden y días cerrados. Se guarda en cfg/servicios.ag.
// - Publica stores/{sid}/public/agenda: lo que el catálogo necesita para mostrar la carta y los horarios libres
//   (sin datos de clientes). Ver turnos.js para cómo se evitan los turnos superpuestos.
import { collection, doc, setDoc, getDocs, onSnapshot, writeBatch, query, where, deleteField } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { DIAS, DEF_CFG, hm, toMin, ymd, addDays, fechaLargaT, fechaCorta, normDur, durTxt, lockIds, busyFromTurnos, libres, elegirPro, desdeHoy, hToRows, rowsToH } from './turnos.js';

const DURS = [15, 20, 30, 40, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240];
export { DURS };

// X: db, $, esc, money, rnd, today, fail, canWrite, blockedCard, nm, sid(), role(), user(), cs(), sv(), mem(),
//    pub(), sname(), tab(), isAg(), startAtt(pre)
export function createAgenda(X) {
  const { db, $, esc, money } = X;
  const S = { day: X.today(), list: [], pro: null, ag: null, agOk: false, edit: false, cz: null, lastPub: null, dayCache: {} };
  const un = {};
  const off = (k) => { if (un[k]) { un[k](); delete un[k]; } };
  const adm = () => X.role() === 'admin';
  const uid = () => (X.user() || {}).uid;
  const col = (n) => collection(db, 'stores', X.sid(), n);
  const ref = (...p) => doc(db, 'stores', X.sid(), ...p);
  const cfg = () => Object.assign({}, DEF_CFG, (X.cs() && X.cs().ag) || {});
  const svcs = () => (X.sv() || []).filter((s) => s.a !== false).sort((a, b) => a.n.localeCompare(b.n));
  const svOf = (id) => (X.sv() || []).find((s) => s.id === id) || null;
  // Quiénes atienden. El administrador los toma de los miembros; el resto, de lo publicado (no lee miembros).
  function pros() {
    if (adm()) {
      const sel = cfg().pros, m = (X.mem() || []).map((x) => ({ id: x.id, n: x.name || (x.email || '').split('@')[0] || 'Sin nombre' }));
      return (sel ? m.filter((x) => sel.indexOf(x.id) >= 0) : m).sort((a, b) => a.n.localeCompare(b.n));
    }
    const l = (S.ag && S.ag.pros) || [];
    return l.length ? l : [{ id: uid(), n: X.nm() }];
  }
  const proName = (id) => { const p = pros().find((x) => x.id === id); return p ? p.n : (S.ag && (S.ag.pros || []).find((x) => x.id === id) || {}).n || ''; };
  function waNorm(w) { w = String(w || '').replace(/\D/g, '').replace(/^0+/, ''); if (w.length === 10) w = '549' + w; else if (/^54[1-8]\d{9}$/.test(w)) w = '549' + w.slice(2); return w; }
  const waUrl = (tel, m) => 'https://wa.me/' + waNorm(tel) + '?text=' + encodeURIComponent(m);
  function modal(html) {
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto';
    o.innerHTML = '<div style="background:var(--card);color:var(--ink);border-radius:22px;padding:20px;max-width:440px;width:100%;margin:auto">' + html + '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o || (e.target.dataset && e.target.dataset.close)) o.remove(); });
    return o;
  }

  // ---------- escuchas ----------
  function start() {
    if (un.ag) return;
    un.ag = onSnapshot(ref('public', 'agenda'), (sn) => { S.ag = sn.exists() ? sn.data() : null; S.agOk = true; if (S.lastPub === null && adm()) publishSoon(); if (X.tab() === 'agd') draw(); }, () => {});
    listenDay();
  }
  function stop() { Object.keys(un).forEach(off); S.list = []; S.ag = null; S.agOk = false; S.lastPub = null; S.edit = false; S.dayCache = {}; S.pro = null; }
  function listenDay() {
    off('day');
    const d = S.day;
    un.day = onSnapshot(query(col('turnos'), where('d', '==', d)), (sn) => {
      if (S.day !== d) return;
      const l = []; sn.forEach((x) => l.push(x.data())); S.list = l; S.dayCache[d] = l;
      if (X.tab() === 'agd') drawList();
    }, () => { S.list = []; if (X.tab() === 'agd') drawList(); });
  }
  // Turnos de otro día (para calcular horarios libres al agendar).
  function dayTurnos(d) {
    if (d === S.day) return Promise.resolve(S.list);
    return getDocs(query(col('turnos'), where('d', '==', d))).then((sn) => { const l = []; sn.forEach((x) => l.push(x.data())); S.dayCache[d] = l; return l; });
  }

  // ---------- publicar lo que ve el catálogo ----------
  let pubT = 0;
  function publishSoon() { if (!adm() || !X.isAg()) return; clearTimeout(pubT); pubT = setTimeout(publish, 2500); }
  function payload() {
    const c = cfg(), sv = svcs().map((s) => { const o = { id: s.id, n: s.n, p: s.p || 0, dur: normDur(s.dur || 30) }; if (s.d) o.d = s.d; return o; });
    const pr = pros(), t = X.today();
    return { on: !!c.on && pr.length > 0 && sv.length > 0, paso: c.paso, ant: c.ant, max: c.max, h: c.h, cz: (c.cz || []).filter((d) => d >= t), pros: pr, sv };
  }
  function publish() {
    if (!adm() || !X.isAg() || !S.agOk || !X.mem() || !X.mem().length) return;
    const p = payload(), j = JSON.stringify(p);
    const cur = S.ag ? JSON.stringify((({ at, ...r }) => r)(S.ag)) : '';
    S.lastPub = j;
    if (j === cur) { syncInfo(p); return; }
    setDoc(ref('public', 'agenda'), Object.assign({ at: Date.now() }, p)).then(() => syncInfo(p)).catch(() => {});
  }
  // public/info.ag avisa al catálogo que tiene que mostrar la carta (1 lectura menos para el resto).
  function syncInfo(p) {
    const info = X.pub(), want = p.sv.length ? 1 : 0;
    if (!info || (info.ag ? 1 : 0) === want) return;
    setDoc(ref('public', 'info'), { ag: want ? 1 : deleteField() }, { merge: true }).catch(() => {});
  }

  // ---------- pantalla ----------
  const dayTitle = (d) => { const t = X.today(); return d === t ? 'Hoy' : d === addDays(t, 1) ? 'Mañana' : d === addDays(t, -1) ? 'Ayer' : fechaLargaT(d); };
  function draw() {
    const box = $('s-agd');
    if (S.edit) { if (!$('ag_cfg')) drawCfg(); return; }
    const c = cfg(), pr = pros();
    if (S.pro === null) S.pro = !adm() && pr.some((p) => p.id === uid()) ? uid() : '';
    let h = '';
    if (adm() && !c.on) h += '<div class="bn"><b>Turnos online apagados.</b> Configurá tus horarios y activalos para que tus clientes reserven solos desde el catálogo.<button class="go" data-ag="cfg" style="margin-top:10px">Configurar turnos</button></div>';
    else if (adm() && S.ag && !S.ag.on) h += '<div class="bn warn">Los turnos online están activados, pero falta ' + (!svcs().length ? 'cargar al menos un servicio' : 'elegir quién atiende') + ' para que aparezcan en el catálogo.</div>';
    h += '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
      '<button class="ch" data-ag="prev" aria-label="Día anterior" style="font-size:18px;padding:6px 14px">‹</button>' +
      '<div style="text-align:center;flex:1"><b style="font-size:19px;display:block">' + esc(dayTitle(S.day)) + '</b><span class="k">' + esc(fechaCorta(S.day)) + '</span></div>' +
      '<button class="ch" data-ag="next" aria-label="Día siguiente" style="font-size:18px;padding:6px 14px">›</button></div>' +
      '<div class="row" style="margin-top:10px;align-items:center"><input id="ag_day" type="date" value="' + S.day + '" style="flex:1">' + (S.day !== X.today() ? '<button class="ch" data-ag="hoy">Hoy</button>' : '') + '</div>' +
      (pr.length > 1 ? '<div class="chips"><button class="ch' + (S.pro ? '' : ' on') + '" data-ag="pro" data-v="">Todos</button>' + pr.map((p) => '<button class="ch' + (S.pro === p.id ? ' on' : '') + '" data-ag="pro" data-v="' + esc(p.id) + '">' + esc(p.n) + '</button>').join('') + '</div>' : '') +
      '<div id="ag_list"></div></div>';
    h += X.canWrite() ? '<div class="row" style="gap:8px"><button class="go" data-ag="new" style="margin-top:0">+ Agendar turno</button><button class="go alt" data-ag="block" style="margin-top:0">Bloquear horario</button></div>' : X.blockedCard();
    if (adm()) h += '<button class="x" data-ag="cfg" style="display:block;margin:16px auto 0;font-size:14px;text-decoration:underline">Configurar turnos online y horarios</button>';
    box.innerHTML = h;
    $('ag_day').onchange = function () { if (this.value) setDay(this.value); };
    drawList();
  }
  function drawList() {
    const e = $('ag_list'); if (!e) { if (X.tab() === 'agd' && !S.edit) draw(); return; }
    const l = S.list.filter((t) => !S.pro || t.e === S.pro).sort((a, b) => a.i - b.i || String(a.e).localeCompare(String(b.e)));
    const multi = pros().length > 1 && !S.pro;
    if (!l.length) { e.innerHTML = '<div class="empty">No hay turnos ' + (S.day === X.today() ? 'hoy' : 'este día') + '.</div>'; return; }
    e.innerHTML = l.map((t) => {
      const done = t.st === 'done', blk = !!t.b;
      return '<div class="it" style="' + (done || blk ? 'opacity:.62' : '') + '"><div style="min-width:0"><b>' + hm(t.i) + ' – ' + hm(t.f) + ' · ' + esc(t.sn || (blk ? 'Bloqueado' : 'Turno')) + '</b>' +
        '<small>' + (multi ? esc(t.en || proName(t.e)) + (blk ? '' : ' · ') : '') + (blk ? '' : esc(t.cl || 'Sin nombre') + (t.tel ? ' · ' + esc(t.tel) : '')) + '</small>' +
        '<small>' + (blk ? '<em class="tag">Bloqueado</em>' : '') + (t.src === 'web' ? '<em class="tag">Reservó online</em>' : '') + (done ? '<em class="tag">Atendido ✓</em>' : '') + (!blk && t.p ? money(t.p) : '') + '</small>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px">' +
        (!blk && !done && X.canWrite() ? '<button class="x" data-ag="att" data-id="' + esc(t.id) + '" style="font-size:14px;font-weight:700;color:var(--ink)">Atender</button>' : '') +
        (!blk && t.tel ? '<a class="x" target="_blank" rel="noopener" href="' + esc(waUrl(t.tel, recordatorio(t))) + '" style="font-size:14px">WhatsApp</a>' : '') +
        (X.canWrite() && (adm() || t.e === uid() || t.by === uid()) ? '<button class="x" data-ag="del" data-id="' + esc(t.id) + '" style="font-size:14px;color:#b3261e">' + (blk ? 'Quitar bloqueo' : done ? 'Borrar' : 'Cancelar') + '</button>' : '') +
        '</div></div></div>';
    }).join('');
  }
  const recordatorio = (t) => 'Hola ' + (t.cl || '') + '! Te recordamos tu turno en ' + X.sname() + ': ' + fechaLargaT(t.d) + ' a las ' + hm(t.i) + ' (' + t.sn + '). ¡Te esperamos!';
  function setDay(d) { S.day = d; S.list = S.dayCache[d] || []; listenDay(); draw(); }

  // ---------- agendar a mano ----------
  function newDlg() {
    const sv = svcs(), pr = pros();
    if (!sv.length) { alert(adm() ? 'Primero cargá tus servicios (Atender → Servicios, precios y comisiones).' : 'Todavía no hay servicios cargados.'); return; }
    const o = modal('<b style="font-size:19px">Agendar turno</b>' +
      '<label>Servicio</label><select id="nt_s">' + sv.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.n) + ' · ' + durTxt(normDur(s.dur || 30)) + '</option>').join('') + '</select>' +
      '<label>Con quién</label><select id="nt_e">' + (pr.length > 1 ? '<option value="*">Cualquiera</option>' : '') + pr.map((p) => '<option value="' + esc(p.id) + '"' + (S.pro === p.id ? ' selected' : '') + '>' + esc(p.n) + '</option>').join('') + '</select>' +
      '<label>Día</label><input id="nt_d" type="date" value="' + S.day + '">' +
      '<label>Horario</label><div id="nt_h" class="chips" style="margin-top:0"></div><div class="row" style="align-items:center;margin-top:8px"><span class="k" style="white-space:nowrap">u otra hora:</span><input id="nt_t" type="time" step="300"></div>' +
      '<div class="row"><div><label>Cliente</label><input id="nt_c" maxlength="60" placeholder="Nombre" autocomplete="off"></div><div><label>WhatsApp (opcional)</label><input id="nt_w" inputmode="tel" maxlength="20" placeholder="381 555 1234" autocomplete="off"></div></div>' +
      '<div class="tot" id="nt_tot"></div><button class="go" id="nt_ok">Guardar turno</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const q = (s) => o.querySelector(s);
    let pick = null;
    const refresh = () => {
      const s = svOf(q('#nt_s').value), d = q('#nt_d').value, ev = q('#nt_e').value; if (!s || !d) return;
      const dur = normDur(s.dur || 30), ids = ev === '*' ? pr.map((p) => p.id) : [ev];
      q('#nt_h').innerHTML = '<span class="k">Buscando horarios…</span>';
      dayTurnos(d).then((l) => {
        const busy = busyFromTurnos(l), fr = libres(cfg(), d, dur, ids, busy, desdeHoy(d, new Date(), 0));
        q('#nt_h').innerHTML = fr.length ? fr.map((x) => '<button class="ch" data-m="' + x.m + '">' + hm(x.m) + '</button>').join('') : '<span class="k">No quedan horarios libres en el horario de atención. Podés poner otra hora.</span>';
        q('#nt_h').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; pick = +b.dataset.m; q('#nt_t').value = ''; q('#nt_h').querySelectorAll('.ch').forEach((x) => x.classList.toggle('on', x === b)); tot(); };
        o._busy = busy;
      }).catch(() => { q('#nt_h').innerHTML = '<span class="k">No pude ver los horarios. Podés poner la hora a mano.</span>'; });
      pick = null; tot();
    };
    const tot = () => { const s = svOf(q('#nt_s').value), m = pick != null ? pick : toMin(q('#nt_t').value); q('#nt_tot').textContent = s && !isNaN(m) && m != null ? fechaCorta(q('#nt_d').value) + ' · ' + hm(m) + ' a ' + hm(m + normDur(s.dur || 30)) : ''; };
    q('#nt_s').onchange = refresh; q('#nt_e').onchange = refresh; q('#nt_d').onchange = refresh;
    q('#nt_t').oninput = () => { pick = null; q('#nt_h').querySelectorAll('.ch').forEach((x) => x.classList.remove('on')); tot(); };
    refresh();
    q('#nt_ok').onclick = () => {
      const s = svOf(q('#nt_s').value), d = q('#nt_d').value, m = pick != null ? pick : toMin(q('#nt_t').value), cl = q('#nt_c').value.trim().slice(0, 60);
      if (!s || !d) return;
      if (isNaN(m)) { alert('Elegí un horario o escribí la hora.'); return; }
      if (!cl) { alert('Escribí el nombre del cliente.'); return; }
      const dur = normDur(s.dur || 30), busy = o._busy || new Set();
      let e = q('#nt_e').value;
      if (e === '*') { const fr = pr.map((p) => p.id).filter((x) => lockIds(d, x, m, m + dur).every((k) => !busy.has(k))); if (!fr.length) { alert('A esa hora no hay nadie libre.'); return; } e = elegirPro(fr, busy, d); }
      if (lockIds(d, e, m, m + dur).some((k) => busy.has(k)) && !confirm('Ese horario se superpone con otro turno de ' + proName(e) + '. ¿Lo guardo igual?')) return;
      save({ d, e, i: m, f: m + dur, sv: s.id, sn: s.n, p: s.p || 0, cl, tel: q('#nt_w').value.trim().slice(0, 20) }, q('#nt_ok'), () => { o.remove(); if (d !== S.day) setDay(d); });
    };
  }
  // Guarda turno + bloques ocupados (todo o nada). Si un bloque ya existe, Firebase rechaza todo.
  function save(t, btn, done) {
    const id = 'a' + Date.now().toString(36) + X.rnd(4);
    const o = Object.assign({ id, en: proName(t.e), src: 'app', st: 'ok', at: Date.now(), by: uid() }, t);
    const b = writeBatch(db);
    b.set(ref('turnos', id), o);
    const overlap = (S.dayCache[t.d] || []).some((x) => x.e === t.e && x.i < t.f && t.i < x.f);
    if (!overlap) lockIds(t.d, t.e, t.i, t.f).forEach((k) => b.set(ref('ocupado', k), { t: id, d: t.d, e: t.e, m: +k.split('_').pop() }));
    else { // el usuario confirmó la superposición: solo se bloquean los minutos que quedaban libres
      const busy = busyFromTurnos(S.dayCache[t.d] || []);
      lockIds(t.d, t.e, t.i, t.f).filter((k) => !busy.has(k)).forEach((k) => b.set(ref('ocupado', k), { t: id, d: t.d, e: t.e, m: +k.split('_').pop() }));
    }
    if (btn) btn.disabled = true;
    b.commit().then(done).catch((e) => {
      if (btn) btn.disabled = false;
      if (/permission/i.test(String(e && (e.code || e.message)))) alert('Ese horario se acaba de ocupar (alguien reservó online). Elegí otro.');
      else X.fail(e);
    });
  }

  // ---------- bloquear horario (almuerzo, trámite, día libre de alguien) ----------
  function blockDlg() {
    const pr = pros();
    const o = modal('<b style="font-size:19px">Bloquear horario</b><div class="k" style="margin-top:4px">Ese rato no se va a poder reservar online.</div>' +
      '<label>Quién</label><select id="bl_e">' + (pr.length > 1 ? '<option value="*">Todos</option>' : '') + pr.map((p) => '<option value="' + esc(p.id) + '"' + (S.pro === p.id ? ' selected' : '') + '>' + esc(p.n) + '</option>').join('') + '</select>' +
      '<label>Día</label><input id="bl_d" type="date" value="' + S.day + '">' +
      '<div class="row"><div><label>Desde</label><input id="bl_a" type="time" step="900" value="13:00"></div><div><label>Hasta</label><input id="bl_b" type="time" step="900" value="14:00"></div></div>' +
      '<label class="row" style="align-items:center;gap:8px;font-weight:600;color:var(--ink)"><input id="bl_all" type="checkbox" style="width:auto"> Todo el día</label>' +
      '<label>Motivo (opcional)</label><input id="bl_m" maxlength="40" placeholder="Ej: Almuerzo" autocomplete="off">' +
      '<button class="go" id="bl_ok">Bloquear</button><button class="x" data-close="1" style="display:block;margin:12px auto 0;font-size:14px;text-decoration:underline">Cancelar</button>');
    const q = (s) => o.querySelector(s);
    q('#bl_ok').onclick = () => {
      const d = q('#bl_d').value, all = q('#bl_all').checked;
      let a = all ? 0 : toMin(q('#bl_a').value), z = all ? 1440 : toMin(q('#bl_b').value);
      if (!d || isNaN(a) || isNaN(z) || z <= a) { alert('Revisá el horario: "hasta" tiene que ser después de "desde".'); return; }
      a = Math.floor(a / 15) * 15; z = Math.ceil(z / 15) * 15;
      const who = q('#bl_e').value === '*' ? pr.map((p) => p.id) : [q('#bl_e').value];
      q('#bl_ok').disabled = true;
      dayTurnos(d).then((l) => {
        const busy = busyFromTurnos(l), b = writeBatch(db);
        who.forEach((e) => {
          const id = 'b' + Date.now().toString(36) + X.rnd(4);
          b.set(ref('turnos', id), { id, d, e, en: proName(e), i: a, f: z, b: 1, sv: '', sn: q('#bl_m').value.trim().slice(0, 40) || 'Bloqueado', cl: '', src: 'app', st: 'ok', at: Date.now(), by: uid() });
          lockIds(d, e, a, z).filter((k) => !busy.has(k)).forEach((k) => b.set(ref('ocupado', k), { t: id, d, e, m: +k.split('_').pop() }));
        });
        return b.commit();
      }).then(() => { o.remove(); if (d !== S.day) setDay(d); }).catch((e) => { q('#bl_ok').disabled = false; X.fail(e); });
    };
  }

  // ---------- cancelar ----------
  function del(id) {
    const t = S.list.find((x) => x.id === id); if (!t) return;
    const what = t.b ? '¿Quitar este bloqueo?' : t.st === 'done' ? '¿Borrar este turno de la agenda? (La atención cobrada no se borra.)' : '¿Cancelar el turno de ' + (t.cl || 'este cliente') + ' (' + hm(t.i) + ')? El horario vuelve a quedar libre.';
    if (!confirm(what)) return;
    const b = writeBatch(db);
    b.delete(ref('turnos', id));
    // Solo se liberan los bloques que son de este turno.
    const mine = lockIds(t.d, t.e, t.i, t.f), others = busyFromTurnos(S.list.filter((x) => x.id !== id && x.e === t.e));
    mine.filter((k) => !others.has(k)).forEach((k) => b.delete(ref('ocupado', k)));
    b.commit().then(() => {
      if (!t.b && t.st !== 'done' && t.tel && confirm('¿Le avisás a ' + (t.cl || 'el cliente') + ' por WhatsApp?'))
        window.open(waUrl(t.tel, 'Hola ' + (t.cl || '') + '! Te escribimos de ' + X.sname() + ' por tu turno del ' + fechaLargaT(t.d) + ' a las ' + hm(t.i) + ': lo tuvimos que cancelar. ¿Querés que lo pasemos a otro horario?'), '_blank');
    }).catch(X.fail);
  }

  // ---------- configuración ----------
  function drawCfg() {
    const c = cfg(), rows = hToRows(c.h), mem = (X.mem() || []).slice().sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
    if (S.cz === null) S.cz = (c.cz || []).filter((d) => d >= X.today()).sort();
    const sel = (id, opts, v) => '<select id="' + id + '">' + opts.map(([k, t]) => '<option value="' + k + '"' + (String(k) === String(v) ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
    let h = '<button class="x" data-ag="back" style="font-size:14px;text-decoration:underline;margin-bottom:10px">← Volver a la agenda</button><div class="card" id="ag_cfg"><b style="font-size:19px">Turnos online</b>' +
      '<label class="row" style="align-items:center;gap:10px;font-weight:700;color:var(--ink);margin-top:12px"><input id="ag_on" type="checkbox" style="width:auto"' + (c.on ? ' checked' : '') + '> Mis clientes pueden reservar desde el catálogo</label>' +
      '<div class="k" style="margin-top:4px">Eligen servicio, profesional, día y horario libre, y el turno queda reservado. Te aparece en esta agenda y el cliente te avisa por WhatsApp.</div>' +
      '<label style="margin-top:18px">Días y horarios de atención</label><div class="k" style="margin:0 0 6px">Si cortás al mediodía, completá el segundo horario.</div>';
    [1, 2, 3, 4, 5, 6, 0].forEach((w) => {
      const r = rows[w], open = r.length > 0, r1 = r[0] || ['09:00', '13:00'], r2 = r[1] || ['', ''];
      h += '<div class="ag-day" data-w="' + w + '" style="padding:10px 0;border-top:1px solid var(--line)"><label class="row" style="align-items:center;gap:10px;margin:0;font-weight:700;color:var(--ink)"><input class="ag-open" type="checkbox" style="width:auto"' + (open ? ' checked' : '') + '> ' + DIAS[w] + '</label>' +
        '<div class="ag-hrs"' + (open ? '' : ' hidden') + '><div class="row" style="align-items:center;margin-top:8px"><input class="ag-a1" type="time" step="900" style="flex:1;min-width:0;padding:12px 10px" value="' + r1[0] + '"><span class="k">a</span><input class="ag-b1" type="time" step="900" style="flex:1;min-width:0;padding:12px 10px" value="' + r1[1] + '"></div>' +
        '<div class="row" style="align-items:center;margin-top:6px"><span class="k" style="white-space:nowrap">y de</span><input class="ag-a2" type="time" step="900" style="flex:1;min-width:0;padding:12px 10px" value="' + r2[0] + '"><span class="k">a</span><input class="ag-b2" type="time" step="900" style="flex:1;min-width:0;padding:12px 10px" value="' + r2[1] + '"></div></div></div>';
    });
    h += '<label>Cada cuánto puede empezar un turno</label>' + sel('ag_paso', [[15, 'Cada 15 minutos'], [30, 'Cada 30 minutos'], [60, 'Cada 1 hora']], c.paso) +
      '<label>Anticipación mínima</label>' + sel('ag_ant', [[0, 'Sin mínimo'], [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [240, '4 horas antes'], [1440, 'Un día antes']], c.ant) +
      '<label>Se puede reservar hasta</label>' + sel('ag_max', [[7, '1 semana adelante'], [14, '2 semanas adelante'], [30, '1 mes adelante'], [60, '2 meses adelante']], c.max) +
      '<label>Quiénes atienden</label><div class="k" style="margin:0 0 6px">Cada uno tiene su propia agenda. Para sumar a alguien, invitalo en Equipo.</div>' +
      mem.map((m) => '<label class="row" style="align-items:center;gap:10px;margin:6px 0;font-weight:600;color:var(--ink)"><input class="ag-pro" data-id="' + esc(m.id) + '" type="checkbox" style="width:auto"' + (!c.pros || c.pros.indexOf(m.id) >= 0 ? ' checked' : '') + '> ' + esc(m.name || m.email || 'Sin nombre') + '</label>').join('') +
      '<label>Días cerrados (feriados, vacaciones)</label><div id="ag_cz"></div><div class="row" style="align-items:center"><input id="ag_czd" type="date" min="' + X.today() + '"><button class="ch" data-ag="czadd">Agregar</button></div>' +
      '<button class="go" data-ag="savecfg">Guardar</button></div>' +
      '<div class="card"><b>La carta de tu catálogo</b><div class="k" style="margin-top:4px">Tus servicios activos aparecen en el catálogo con precio y duración, y con el botón Reservar si los turnos online están activados. La duración y la descripción de cada uno se cargan en Servicios.</div><button class="go alt" data-t="svc">Editar servicios</button></div>';
    $('s-agd').innerHTML = h;
    drawCz();
    $('s-agd').querySelectorAll('.ag-open').forEach((x) => { x.onchange = () => { x.closest('.ag-day').querySelector('.ag-hrs').hidden = !x.checked; }; });
  }
  function drawCz() { const e = $('ag_cz'); if (!e) return; e.innerHTML = S.cz.length ? '<div class="chips" style="margin:0 0 8px">' + S.cz.map((d, i) => '<button class="ch" data-ag="czdel" data-i="' + i + '">' + esc(fechaCorta(d)) + ' ×</button>').join('') + '</div>' : ''; }
  function saveCfg() {
    const rows = {};
    $('s-agd').querySelectorAll('.ag-day').forEach((el) => {
      const w = +el.dataset.w, v = (c) => el.querySelector(c).value;
      rows[w] = el.querySelector('.ag-open').checked ? [[v('.ag-a1'), v('.ag-b1')], [v('.ag-a2'), v('.ag-b2')]] : [];
    });
    const h = rowsToH(rows);
    const bad = Object.keys(rows).some((w) => rows[w].length && !h[w].length);
    if (bad) { alert('Revisá los horarios: en cada día abierto, la hora de cierre tiene que ser después de la de apertura.'); return; }
    const all = (X.mem() || []).map((m) => m.id), chk = [];
    $('s-agd').querySelectorAll('.ag-pro').forEach((x) => { if (x.checked) chk.push(x.dataset.id); });
    const on = $('ag_on').checked;
    if (on && !chk.length) { alert('Elegí al menos una persona que atienda.'); return; }
    const ag = { on, paso: +$('ag_paso').value, ant: +$('ag_ant').value, max: +$('ag_max').value, h, cz: S.cz.slice(), pros: chk.length === all.length ? null : chk };
    setDoc(doc(db, 'stores', X.sid(), 'cfg', 'servicios'), { ag }, { merge: true }).then(() => {
      S.edit = false; S.cz = null; draw(); publishSoon();
      if (on && X.pub() && !X.pub().enabled) alert('Guardado. Ojo: tu catálogo está desactivado. Activalo en Equipo para que tus clientes puedan reservar.');
    }).catch(X.fail);
  }

  // ---------- clics ----------
  document.addEventListener('click', (e) => {
    if (!X.isAg() || X.tab() !== 'agd') return;
    const el = e.target.closest && e.target.closest('[data-ag]'); if (!el) return;
    const a = el.dataset.ag;
    if (a === 'prev') setDay(addDays(S.day, -1));
    else if (a === 'next') setDay(addDays(S.day, 1));
    else if (a === 'hoy') setDay(X.today());
    else if (a === 'pro') { S.pro = el.dataset.v; draw(); }
    else if (a === 'new') newDlg();
    else if (a === 'block') blockDlg();
    else if (a === 'del') del(el.dataset.id);
    else if (a === 'att') { const t = S.list.find((x) => x.id === el.dataset.id); if (t) X.startAtt({ sv: t.sv, emp: t.e, cl: t.cl, tid: t.id, txt: hm(t.i) + ' · ' + (t.cl || '') + ' · ' + t.sn }); }
    else if (a === 'cfg') { S.edit = true; S.cz = null; drawCfg(); window.scrollTo(0, 0); }
    else if (a === 'back') { S.edit = false; S.cz = null; draw(); }
    else if (a === 'savecfg') saveCfg();
    else if (a === 'czadd') { const v = $('ag_czd').value; if (v && S.cz.indexOf(v) < 0) { S.cz.push(v); S.cz.sort(); drawCz(); } }
    else if (a === 'czdel') { S.cz.splice(+el.dataset.i, 1); drawCz(); }
  });

  return { start, stop, draw, publishSoon, editing: () => S.edit, resetView() { S.edit = false; S.cz = null; } };
}
