// Buscador de fotos publicitarias (bancos gratuitos Pixabay o Pexels, a través del servidor de Pekeron).
// Sirve para productos sin foto propia: fiambres, quesos, bebidas, panes… La foto elegida se baja,
// se achica como las fotos propias (fotos.js) y queda como foto del producto.
// Se muestra el banco de donde salen y el autor de cada foto.
//
// abrirFotos({ q, buscar(q, p) → Promise<{ fotos, total }>, proxy: 'https://…/img', onPick(thumb, hd, qs) })

import { makePhotos } from './fotos.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Del nombre del producto saca medidas y números ("Jamón cocido 500 g x6" → "jamón cocido").
export function consulta(n) {
  return String(n || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\b\d+[.,]?\d*\s*(g|gr|grs|kg|ml|cc|l|lt|lts|cm|u|un|unid)\b/g, ' ')
    .replace(/\bx\s*\d+\b/g, ' ').replace(/[\d.,]+/g, ' ').replace(/[^\p{L} ]+/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
}

export function abrirFotos(o) {
  const old = document.getElementById('pxdlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'pxdlg';
  d.style.cssText = 'position:fixed;inset:0;z-index:96;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
  d.innerHTML = '<div style="background:var(--bg,#fff);color:var(--ink,#111);width:100%;max-width:560px;height:92vh;display:flex;flex-direction:column;border-radius:22px 22px 0 0;padding:16px 14px calc(14px + env(safe-area-inset-bottom,0px))">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:19px">🖼️ Foto publicitaria</b><button type="button" class="x" data-pxx="1" style="font-weight:700;text-decoration:underline">Cerrar</button></div>' +
    '<form id="pxf" style="display:flex;gap:8px;margin:10px 0 6px"><input id="pxq" type="search" enterkeyhint="search" autocomplete="off" placeholder="Ej: jamón cocido, gaseosa, pan" style="flex:1;margin:0"><button class="go" style="margin:0;width:auto;padding:0 18px">Buscar</button></form>' +
    '<div class="k" style="margin-bottom:8px">Fotos gratis de <a id="pxsrc" href="https://pixabay.com" target="_blank" rel="noopener" style="font-weight:700">Pixabay</a>. Probá con palabras simples; a veces en inglés salen más (ham, cheese, soda).</div>' +
    '<div id="pxl" style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;align-content:start"></div>' +
    '<button type="button" class="go alt" id="pxm" style="margin-top:8px" hidden>Ver más</button><div class="k" id="pxmsg" style="font-weight:600;margin-top:6px"></div></div>';
  document.body.appendChild(d);
  const $ = (id) => d.querySelector('#' + id), msg = (t) => { $('pxmsg').textContent = t || ''; };
  let q = '', pg = 1, fotos = [], busy = false;
  const pintar = () => {
    $('pxl').innerHTML = fotos.map((f, i) => '<button type="button" data-pxi="' + i + '" style="position:relative;border:0;padding:0;border-radius:10px;overflow:hidden;aspect-ratio:1;background:#eee;cursor:pointer">' +
      '<img src="' + esc(f.m) + '" alt="' + esc(f.alt) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">' +
      '<span style="position:absolute;left:0;right:0;bottom:0;padding:3px 6px;font-size:11px;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.65));text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📷 ' + esc(f.ph) + '</span></button>').join('');
  };
  const buscar = (mas) => {
    if (busy) return; const v = $('pxq').value.trim(); if (v.length < 2) { msg('Escribí qué foto buscás.'); return; }
    if (!mas) { q = v; pg = 1; fotos = []; $('pxl').innerHTML = ''; } else pg++;
    busy = true; msg('Buscando…');
    o.buscar(q, pg).then((r) => {
      busy = false; fotos = fotos.concat(r.fotos || []); pintar();
      if (r.fuente && r.fuente.n) { const a = $('pxsrc'); a.textContent = r.fuente.n; a.href = r.fuente.url || a.href; }
      $('pxm').hidden = !(r.total > fotos.length && pg < 10);
      msg(fotos.length ? '' : 'No encontré fotos para "' + q + '". Probá con otra palabra.');
    }, (e) => { busy = false; if (mas) pg--; msg((e && e.message) || 'No pude buscar fotos ahora.'); });
  };
  const bajar = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error('img'); return r.blob(); });
  const elegir = (f) => {
    msg('Preparando la foto…');
    bajar(f.l).catch(() => (o.proxy ? bajar(o.proxy + '?u=' + encodeURIComponent(f.l)) : Promise.reject()))
      .then((bl) => makePhotos(bl)).then((r) => {
        if (!r || !r.thumb) throw new Error('img');
        d.remove(); o.onPick(r.thumb, r.hd || '', r.qs || 0, { ph: f.ph, url: f.url });
      }).catch(() => msg('No pude bajar esa foto. Probá con otra.'));
  };
  $('pxf').onsubmit = (e) => { e.preventDefault(); buscar(false); };
  $('pxm').onclick = () => buscar(true);
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-pxx]')) { d.remove(); return; }
    const b = e.target.closest('[data-pxi]'); if (b) elegir(fotos[+b.dataset.pxi]);
  });
  $('pxq').value = consulta(o.q) || '';
  if ($('pxq').value.length >= 2) buscar(false); else setTimeout(() => $('pxq').focus(), 80);
  return d;
}
