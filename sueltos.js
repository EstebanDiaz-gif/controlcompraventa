// Productos sueltos (a granel, se venden por peso) listos para agregar al stock sin escribirlos uno por uno.
// abrirSueltos({ existe: (nombre) => bool, guardar: (items) => Promise, money })
//   items: [{ n, cat, pk (precio por kg), e (emoji) }]

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// [nombre, emoji]; f = lo que más se vende suelto en almacenes y dietéticas (viene marcado)
export const SUELTOS = [
  { cat: 'Frutos secos', e: '🥜', l: [['Nueces', 'f'], ['Almendras', 'f'], ['Maní tostado salado', 'f'], ['Maní pelado sin sal'], ['Castañas de cajú', 'f'], ['Avellanas'], ['Pistachos'], ['Mix de frutos secos', 'f'], ['Pasas de uva', 'f'], ['Pasas de uva rubias'], ['Ciruelas pasa'], ['Dátiles'], ['Higos secos'], ['Orejones de durazno'], ['Banana chips'], ['Garrapiñada de maní']] },
  { cat: 'Cereales', e: '🥣', l: [['Cereal azucarado', 'f'], ['Copos de maíz sin azúcar'], ['Almohaditas de frutilla', 'f'], ['Almohaditas de chocolate'], ['Aritos frutales'], ['Bolitas de chocolate'], ['Granola', 'f'], ['Avena arrollada', 'f'], ['Salvado de avena'], ['Arroz inflado']] },
  { cat: 'Semillas', e: '🌱', l: [['Mix de semillas', 'f'], ['Lino', 'f'], ['Chía', 'f'], ['Sésamo'], ['Girasol pelado'], ['Semillas de zapallo'], ['Quinoa']] },
  { cat: 'Repostería', e: '🧁', l: [['Harina de almendras', 'f'], ['Polvo para hornear', 'f'], ['Coco rallado', 'f'], ['Azúcar impalpable', 'f'], ['Gelatina sin sabor', 'f'], ['Cacao amargo'], ['Azúcar mascabo'], ['Bicarbonato de sodio'], ['Fécula de maíz'], ['Grana de colores'], ['Chips de chocolate']] },
  { cat: 'Golosinas sueltas', e: '🍬', l: [['Maní con chocolate', 'f'], ['Almendras con chocolate', 'f'], ['Pasas con chocolate'], ['Gomitas', 'f'], ['Rocklets', 'f'], ['Caramelos surtidos'], ['Malvaviscos']] },
  { cat: 'Snacks sueltos', e: '🍿', l: [['Papas pay', 'f'], ['Palitos salados'], ['Chizitos'], ['Mix salado'], ['Garbanzos tostados']] },
  { cat: 'Legumbres y granos', e: '🫘', l: [['Lentejas'], ['Garbanzos'], ['Porotos negros'], ['Porotos alubia'], ['Arvejas secas'], ['Arroz integral'], ['Arroz yamaní'], ['Polenta']] },
  { cat: 'Especias', e: '🌶️', l: [['Orégano'], ['Pimentón'], ['Ají molido'], ['Comino'], ['Pimienta negra molida'], ['Canela molida'], ['Nuez moscada'], ['Ajo en polvo'], ['Provenzal'], ['Curry'], ['Cúrcuma'], ['Sal marina'], ['Sal del Himalaya']] },
];
export const CAT_ICON = SUELTOS.reduce((o, g) => { o[g.cat] = g.e; return o; }, {});

const UNI = [['100', 'por 100 g', 10], ['250', 'por ¼ kg', 4], ['1000', 'por kg', 1]];

export function abrirSueltos(o) {
  const old = document.getElementById('sudlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'sudlg';
  d.style.cssText = 'position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
  if (!document.getElementById('sucss')) {
    const st = document.createElement('style'); st.id = 'sucss';
    st.textContent = '#sudlg input[type=number]{width:96px;margin:0;padding:8px 10px;font-size:15px;border-radius:10px;min-height:0;height:auto}#sudlg .sur{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid var(--line)}#sudlg .sur label{flex:1;min-width:0;display:flex;align-items:center;gap:10px;margin:0;font-weight:600;font-size:15px;cursor:pointer}#sudlg .sur.ya{opacity:.5}#sudlg .suh{display:flex;justify-content:space-between;align-items:center;margin:16px 0 4px}#sudlg .suh b{font-size:16px}';
    document.head.appendChild(st);
  }
  const sel = {}, precio = {};
  let uni = '100', q = '';
  SUELTOS.forEach((g) => g.l.forEach(([n, f]) => { if (f && !o.existe(n)) sel[n] = true; }));
  d.innerHTML = '<div id="subox" style="background:var(--bg,#fff);color:var(--ink,#111);width:100%;max-width:560px;max-height:94vh;display:flex;flex-direction:column;border-radius:22px 22px 0 0">' +
    '<div style="padding:18px 16px 6px"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:20px">🫙 Productos sueltos</b><button type="button" class="x" data-sux="1" style="font-weight:700;text-decoration:underline">Cerrar</button></div>' +
    '<div class="k" style="margin-top:4px">Marcá los que vendés y poné el precio (opcional, lo podés cargar después). Se agregan por peso, sin control de stock.</div>' +
    '<input id="suq" placeholder="Buscar en la lista…" autocomplete="off" style="margin:10px 0 0">' +
    '<div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap"><span class="k" style="margin:0">El precio que escribo es</span>' + UNI.map((u) => '<button type="button" class="ch" data-suu="' + u[0] + '" style="margin:0">' + u[1] + '</button>').join('') + '</div></div>' +
    '<div id="sul" style="flex:1;overflow:auto;padding:0 16px"></div>' +
    '<div style="padding:12px 16px calc(14px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line)"><button type="button" class="go" id="suok" style="margin:0"></button></div></div>';
  document.body.appendChild(d);
  const $ = (id) => d.querySelector('#' + id);
  function pinta() {
    const t = sinAc(q); let h = '';
    SUELTOS.forEach((g) => {
      const l = g.l.filter(([n]) => !t || sinAc(n).indexOf(t) >= 0); if (!l.length) return;
      const libres = l.filter(([n]) => !o.existe(n)), todos = libres.length && libres.every(([n]) => sel[n]);
      h += '<div class="suh"><b>' + g.e + ' ' + esc(g.cat) + '</b>' + (libres.length ? '<button type="button" class="x" data-sug="' + esc(g.cat) + '" style="font-size:13.5px;font-weight:700;text-decoration:underline">' + (todos ? 'Desmarcar todos' : 'Marcar todos') + '</button>' : '') + '</div>';
      l.forEach(([n]) => {
        const ya = o.existe(n);
        h += '<div class="sur' + (ya ? ' ya' : '') + '"><label><input type="checkbox" data-sun="' + esc(n) + '" style="width:auto;margin:0"' + (sel[n] ? ' checked' : '') + (ya ? ' disabled' : '') + '>' + esc(n) + (ya ? ' <small style="font-weight:500">(ya lo tenés)</small>' : '') + '</label>' +
          (ya ? '' : '<span class="k" style="margin:0">$</span><input type="number" inputmode="numeric" min="0" placeholder="precio" data-sup="' + esc(n) + '" value="' + esc(precio[n] || '') + '">') + '</div>';
      });
    });
    $('sul').innerHTML = h || '<div class="k" style="margin:16px 0">No encontré nada con ese nombre.</div>';
    cuenta();
  }
  function cuenta() {
    d.querySelectorAll('[data-suu]').forEach((b) => b.classList.toggle('on', b.dataset.suu === uni));
    const n = Object.keys(sel).filter((k) => sel[k]).length;
    $('suok').disabled = !n; $('suok').textContent = n ? 'Agregar ' + n + ' producto' + (n > 1 ? 's' : '') : 'Marcá los productos que vendés';
  }
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-sux]')) { d.remove(); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.suu) { uni = b.dataset.suu; cuenta(); }
    else if (b.dataset.sug) { const g = SUELTOS.find((x) => x.cat === b.dataset.sug), libres = g.l.filter(([n]) => !o.existe(n)), todos = libres.every(([n]) => sel[n]); libres.forEach(([n]) => { sel[n] = !todos; }); pinta(); }
  });
  d.addEventListener('change', (e) => { const t = e.target; if (t.dataset.sun) { sel[t.dataset.sun] = t.checked; cuenta(); } });
  d.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'suq') { q = t.value; clearTimeout(d._t); d._t = setTimeout(pinta, 150); }
    else if (t.dataset.sup) { precio[t.dataset.sup] = t.value; if (+t.value > 0 && !sel[t.dataset.sup]) { sel[t.dataset.sup] = true; const c = d.querySelector('[data-sun="' + CSS.escape(t.dataset.sup) + '"]'); if (c) c.checked = true; cuenta(); } }
  });
  $('suok').onclick = () => {
    const f = (UNI.find((u) => u[0] === uni) || UNI[0])[2], items = [];
    SUELTOS.forEach((g) => g.l.forEach(([n]) => { if (sel[n] && !o.existe(n)) items.push({ n, cat: g.cat, e: g.e, pk: Math.round((+precio[n] || 0) * f) }); }));
    if (!items.length) return;
    $('suok').disabled = true; $('suok').textContent = 'Agregando…';
    o.guardar(items).then(() => { d.remove(); alert('¡Listo! Se agregaron ' + items.length + ' productos sueltos. Los que no tienen precio no se ven en el catálogo hasta que se lo pongas (Stock → Editar).'); })
      .catch(() => { $('suok').disabled = false; cuenta(); });
  };
  pinta();
  return d;
}
