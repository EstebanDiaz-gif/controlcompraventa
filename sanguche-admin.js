// Configuración de "Armá tu sánguche" (app → Equipo). Guarda stores/{sid}/public/sanguche.
// abrirArmadorCfg({ leer: () => Promise<cfg>, guardar: (cfg) => Promise, productos: () => [{ id, n, w, cat }], money, fail })

import { PASOS_DEF, TAM_DEF, limpiarCfg, sugerirPaso, porcionDef } from './sanguche.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function abrirArmadorCfg(o) {
  const old = document.getElementById('swcfg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'swcfg';
  d.style.cssText = 'position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
  d.innerHTML = '<div id="swbox" style="background:var(--bg,#fff);color:var(--ink,#111);width:100%;max-width:560px;max-height:94vh;overflow:auto;border-radius:22px 22px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))"><div class="k">Cargando…</div></div>';
  if (!document.getElementById('swcfgcss')) {
    const st = document.createElement('style'); st.id = 'swcfgcss';
    st.textContent = '#swcfg input:not([type=checkbox]){padding:9px 11px;font-size:15px;border-radius:11px;min-height:0;height:auto}#swcfg .x{font-size:14px}#swcfg label{font-size:14px}';
    document.head.appendChild(st);
  }
  document.body.appendChild(d);
  const box = d.querySelector('#swbox');
  let C = null, busca = {};   // busca[idPaso] = texto del buscador abierto en ese paso
  const prods = () => (o.productos() || []).filter((p) => p && p.id && p.n);
  const prod = (id) => prods().find((p) => p.id === id);

  o.leer().then((c0) => {
    const c = c0 || {};
    C = {
      on: c.on !== false && !!c0, t: c.t || 'Armá tu sánguche', ex: c.ex || 0,
      tam: (c.tam && c.tam.length ? c.tam : TAM_DEF).map((x) => ({ n: x.n, p: x.p || '', inc: x.inc })),
      pasos: PASOS_DEF.map((p) => { const g = (c.pasos || []).find((x) => x.id === p.id) || {}; return { id: p.id, t: g.t || p.t, max: g.max || p.max, min: g.min != null ? g.min : p.min, cu: g.cu != null ? g.cu : p.cu, it: (g.it || []).slice() }; }),
    };
    if (!c0) C.on = true;
    pintar();
  }).catch((e) => { box.innerHTML = '<div class="k">No pude cargar la configuración.</div>'; if (o.fail) o.fail(e); });

  const lbl = (t, extra) => '<div style="font-weight:800;font-size:15px;margin:16px 0 6px' + (extra || '') + '">' + t + '</div>';
  function pintar() {
    const st = box.scrollTop;
    let h = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:20px">🥪 Armá tu sánguche</b><button type="button" class="x" data-sx="1" style="font-weight:700;text-decoration:underline">Cerrar</button></div>' +
      '<div class="k" style="margin-top:4px">Tus clientes eligen el tamaño, el pan, los fiambres, los quesos y los aderezos desde el catálogo, como en McDonald\'s, y te llega por WhatsApp.</div>' +
      '<label style="display:flex;gap:10px;align-items:center;margin:14px 0 0;font-weight:700"><input type="checkbox" id="swon" style="width:auto;margin:0"' + (C.on ? ' checked' : '') + '> Mostrar el armador en mi catálogo</label>' +
      '<label style="margin-top:10px">Nombre del botón</label><input id="swt" maxlength="40" value="' + esc(C.t) + '">';
    // tamaños
    h += lbl('1. Tamaños y precios') + '<div class="k" style="margin:-2px 0 6px">Precio fijo por tamaño, con una cantidad de fiambres y quesos incluidos.</div>';
    C.tam.forEach((t, i) => {
      h += '<div style="display:grid;grid-template-columns:1.2fr 1fr .8fr auto;gap:6px;align-items:end;margin-top:6px">' +
        '<div><div class="k" style="margin:0 0 2px">Tamaño</div><input data-tn="' + i + '" maxlength="20" value="' + esc(t.n) + '" style="margin:0"></div>' +
        '<div><div class="k" style="margin:0 0 2px">Precio $</div><input data-tp="' + i + '" type="number" inputmode="numeric" min="0" value="' + esc(t.p) + '" style="margin:0"></div>' +
        '<div><div class="k" style="margin:0 0 2px">Incluye</div><input data-ti="' + i + '" type="number" inputmode="numeric" min="0" max="20" value="' + esc(t.inc) + '" style="margin:0"></div>' +
        '<button type="button" class="x" data-tdel="' + i + '" aria-label="Quitar tamaño" style="font-size:20px;padding:8px">×</button></div>';
    });
    if (C.tam.length < 4) h += '<button type="button" class="x" data-tadd="1" style="margin-top:8px;font-weight:700;text-decoration:underline">+ Agregar tamaño</button>';
    h += '<div style="display:flex;gap:8px;align-items:center;margin-top:12px"><span style="flex:1;font-weight:600">Cada fiambre o queso extra (si se pasan de lo incluido)</span><span>$</span><input id="swex" type="number" inputmode="numeric" min="0" value="' + esc(C.ex || '') + '" style="width:110px;margin:0"></div>';
    // pasos
    h += lbl('2. Ingredientes de tu stock') + '<div class="k" style="margin:-2px 0 6px">En cada paso elegí qué productos pueden elegir y cuánto se usa por sánguche (la porción).</div>' +
      '<button type="button" class="go alt" data-auto="1" style="margin:4px 0 0">✨ Completar solo con lo que tengo en Stock</button>';
    C.pasos.forEach((p) => {
      h += '<div style="background:var(--card,#f4f3f0);border-radius:16px;padding:12px;margin-top:10px">' +
        '<div style="display:flex;gap:8px;align-items:center"><input data-pt="' + p.id + '" maxlength="24" value="' + esc(p.t) + '" style="flex:1;margin:0;font-weight:800"><span class="k" style="margin:0">hasta</span><input data-pm="' + p.id + '" type="number" min="1" max="10" value="' + p.max + '" style="width:64px;margin:0"></div>' +
        '<label style="display:flex;gap:8px;align-items:center;margin:8px 0 0;font-size:14px;font-weight:600"><input type="checkbox" data-pc="' + p.id + '" style="width:auto;margin:0"' + (p.cu ? ' checked' : '') + '> Cuenta como ingrediente del tamaño</label>' +
        (p.id === 'pan' ? '<div class="k" style="margin:4px 0 0">El pan es obligatorio: el cliente elige uno.</div>' : '');
      if (!p.it.length) h += '<div class="k" style="margin:8px 0 0">Todavía no elegiste productos para este paso.</div>';
      p.it.forEach((x, j) => {
        const pr = prod(x.i), w = pr ? !!pr.w : !!x.w;
        h += '<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><span style="flex:1;min-width:0;font-weight:600">' + esc(pr ? pr.n : x.n) + (pr ? '' : ' <small style="color:#b3261e">(ya no está en Stock)</small>') + '</span>' +
          '<input data-por="' + p.id + ':' + j + '" type="number" inputmode="decimal" min="0" step="' + (w ? 5 : 1) + '" value="' + (w ? Math.round((x.por || 0) * 1000) : (x.por || 1)) + '" style="width:72px;margin:0" aria-label="Porción"><span class="k" style="margin:0;width:16px">' + (w ? 'g' : 'u') + '</span>' +
          '<button type="button" class="x" data-idel="' + p.id + ':' + j + '" aria-label="Quitar" style="font-size:20px;padding:4px 8px">×</button></div>';
      });
      if (busca[p.id] != null) {
        const q = sinAc(busca[p.id]), ya = p.it.map((x) => x.i);
        const l = prods().filter((x) => ya.indexOf(x.id) < 0 && (!q || sinAc(x.n).indexOf(q) >= 0))
          .sort((a, b) => (sugerirPaso(b.n) === p.id) - (sugerirPaso(a.n) === p.id) || a.n.localeCompare(b.n)).slice(0, 30);
        h += '<input data-bq="' + p.id + '" placeholder="Buscar en tu stock…" value="' + esc(busca[p.id]) + '" style="margin:10px 0 4px" autocomplete="off">' +
          (l.length ? l.map((x) => '<button type="button" data-iadd="' + p.id + ':' + esc(x.id) + '" style="display:flex;width:100%;justify-content:space-between;gap:8px;border:0;border-bottom:1px solid var(--line);background:none;color:inherit;font:inherit;padding:9px 2px;text-align:left;cursor:pointer"><span>' + esc(x.n) + (sugerirPaso(x.n) === p.id ? ' <small style="color:#2f8a3e">✓ sugerido</small>' : '') + '</span><b>+</b></button>').join('') : '<div class="k">No encontré productos.</div>') +
          '<button type="button" class="x" data-bcl="' + p.id + '" style="margin-top:6px;font-weight:700;text-decoration:underline">Listo</button>';
      } else h += '<button type="button" class="x" data-bop="' + p.id + '" style="margin-top:8px;font-weight:700;text-decoration:underline">+ Agregar de mi stock</button>';
      h += '</div>';
    });
    h += '<div class="k" id="swmsg" style="margin-top:12px;font-weight:600"></div><button type="button" class="go" id="swok" style="margin-top:8px">Guardar</button>';
    box.innerHTML = h; box.scrollTop = st;
    const bq = box.querySelector('[data-bq]'); if (bq && document.activeElement !== bq && bq.dataset.focus !== '0') { const v = bq.value; bq.focus(); bq.setSelectionRange(v.length, v.length); }
  }

  const paso = (id) => C.pasos.find((p) => p.id === id);
  d.addEventListener('input', (e) => {
    const t = e.target, ds = t.dataset; if (!C) return;
    if (t.id === 'swt') C.t = t.value; else if (t.id === 'swex') C.ex = t.value;
    else if (ds.tn != null) C.tam[+ds.tn].n = t.value; else if (ds.tp != null) C.tam[+ds.tp].p = t.value; else if (ds.ti != null) C.tam[+ds.ti].inc = t.value;
    else if (ds.pt) paso(ds.pt).t = t.value; else if (ds.pm) paso(ds.pm).max = t.value;
    else if (ds.por) { const [pid, j] = ds.por.split(':'), x = paso(pid).it[+j], pr = prod(x.i), w = pr ? !!pr.w : !!x.w; x.por = w ? (+t.value || 0) / 1000 : (+t.value || 0); }
    else if (ds.bq) { busca[ds.bq] = t.value; clearTimeout(d._t); d._t = setTimeout(pintar, 200); }
  });
  d.addEventListener('change', (e) => { const t = e.target; if (!C) return; if (t.id === 'swon') C.on = t.checked; else if (t.dataset.pc) paso(t.dataset.pc).cu = t.checked ? 1 : 0; });
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-sx]')) { d.remove(); return; }
    const b = e.target.closest('button'); if (!b || !C) return; const ds = b.dataset;
    if (ds.tadd) C.tam.push({ n: '', p: '', inc: 3 });
    else if (ds.tdel != null) C.tam.splice(+ds.tdel, 1);
    else if (ds.bop) busca[ds.bop] = '';
    else if (ds.bcl) delete busca[ds.bcl];
    else if (ds.iadd) { const k = ds.iadd.indexOf(':'), pid = ds.iadd.slice(0, k), id = ds.iadd.slice(k + 1), pr = prod(id); if (pr) paso(pid).it.push({ i: pr.id, n: pr.n, w: pr.w ? 1 : 0, por: porcionDef(pid, pr.w) }); }
    else if (ds.idel) { const [pid, j] = ds.idel.split(':'); paso(pid).it.splice(+j, 1); }
    else if (ds.auto) {
      let n = 0;
      prods().forEach((pr) => { const pid = sugerirPaso(pr.n); if (!pid) return; const p = paso(pid); if (!p || p.it.some((x) => x.i === pr.id) || p.it.length >= 15) return; p.it.push({ i: pr.id, n: pr.n, w: pr.w ? 1 : 0, por: porcionDef(pid, pr.w) }); n++; });
      setTimeout(() => { const m = box.querySelector('#swmsg'); if (m) m.textContent = n ? '✨ Agregué ' + n + ' productos. Revisá y quitá los que no van.' : 'No encontré productos nuevos para sugerir.'; }, 0);
    }
    else if (b.id === 'swok') { guardar(); return; }
    else return;
    pintar();
  });

  function guardar() {
    const out = limpiarCfg({ on: C.on, t: C.t, ex: C.ex, tam: C.tam, pasos: C.pasos.map((p) => Object.assign({}, p, { it: p.it.map((x) => ({ i: x.i, n: (prod(x.i) || x).n, por: x.por, w: x.w })) })) });
    const m = box.querySelector('#swmsg');
    if (out.on && !out.tam.length) { m.textContent = '⚠️ Poné al menos un tamaño con precio.'; return; }
    if (out.on && !out.pasos.some((p) => p.id === 'pan')) { m.textContent = '⚠️ Elegí al menos un pan en el paso del pan.'; return; }
    if (out.on && out.pasos.length < 2) { m.textContent = '⚠️ Elegí ingredientes en al menos otro paso además del pan.'; return; }
    const pan = out.pasos.find((p) => p.id === 'pan'); if (pan) pan.min = 1;
    const btn = box.querySelector('#swok'); btn.disabled = true; btn.textContent = 'Guardando…';
    o.guardar(Object.assign(out, { at: Date.now() })).then(() => { d.remove(); alert(out.on ? '¡Listo! El armador de sánguches ya se ve en tu catálogo.' : 'Guardado. El armador está apagado.'); })
      .catch((e) => { btn.disabled = false; btn.textContent = 'Guardar'; if (o.fail) o.fail(e); });
  }
  return d;
}
