// Importar productos desde una planilla (Excel .xlsx o .csv), sin librerías externas.
// - .xlsx: es un zip con XML adentro. Se descomprime con DecompressionStream (lo traen los navegadores
//   modernos: Chrome/Android, Safari 16.4+ en iPhone) y se lee la primera hoja.
// - .csv: separado por ; , o tabulación; en UTF-8 o en Windows-1252 (lo que guarda Excel en español).
// - .xls (formato viejo de Excel): no se puede leer; se pide guardarlo como .xlsx.
// Las funciones de abajo de "lógica pura" no usan el navegador y tienen tests (planilla.test.js).

// ---------- campos que se importan ----------
export const CAMPOS = [
  { k: 'n', t: 'Nombre del producto', req: true, alias: ['nombre', 'producto', 'descripcion', 'descripción', 'articulo', 'artículo', 'detalle', 'item', 'denominacion'] },
  { k: 's', t: 'Código de barras', pri: ['barra', 'ean', 'upc', 'gtin'], alias: ['codigo de barras', 'código de barras', 'cod barras', 'barras', 'ean', 'ean13', 'upc', 'codigo', 'código', 'cod', 'sku', 'cod. barra', 'codbarra', 'plu'] },
  { k: 'pn', t: 'Precio de venta', alias: ['precio de venta', 'precio venta', 'venta', 'pvp', 'precio publico', 'precio público', 'p. venta', 'precio final', 'precio'] },
  { k: 'c', t: 'Costo', alias: ['costo', 'precio de costo', 'precio costo', 'compra', 'precio de compra', 'p. costo', 'costo unitario'] },
  { k: 'q', t: 'Stock', alias: ['stock', 'cantidad', 'existencia', 'existencias', 'unidades', 'cant', 'cant.', 'inventario'] },
  { k: 'cat', t: 'Categoría', alias: ['categoria', 'categoría', 'rubro', 'familia', 'seccion', 'sección', 'departamento', 'grupo'] },
  { k: 'w', t: 'Se vende por peso (kg)', alias: ['por peso', 'pesable', 'granel', 'suelto', 'unidad de medida', 'unidad', 'kg'] }
];

// ---------- lógica pura ----------
const sinAcento = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Números: de Excel vienen como número; escritos a mano pueden venir "$ 1.234,50", "1,234.50", "1234.5".
export function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v == null ? '' : v).replace(/[$\s ]/g, '').replace(/^ARS/i, '');
  if (!s) return NaN;
  const neg = /^-|^\(.*\)$/.test(s); s = s.replace(/[-()]/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (ld >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isNaN(n) ? NaN : (neg ? -n : n);
}
// Códigos: Excel guarda los códigos de barras como número (a veces "7.79E+12").
export function codigo(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return isFinite(v) ? (Number.isInteger(v) ? String(v) : String(v)) : '';
  let s = String(v).trim();
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) { const n = Number(s); if (Number.isSafeInteger(n)) s = String(n); }
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.slice(0, 40);
}
const SI = ['si', 'sí', 's', 'x', '1', 'true', 'verdadero', 'kg', 'kilo', 'kilos', 'peso', 'pesable', 'granel', 'suelto'];
export function siNo(v) { return SI.indexOf(sinAcento(v)) >= 0 || sinAcento(v) === 'si'; }

// CSV con comillas, separador ; , o tab (el que más aparezca en la primera línea).
export function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const cnt = (c) => first.split(c).length - 1;
  const sep = [';', ',', '\t'].sort((a, b) => cnt(b) - cnt(a))[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// Busca la fila de títulos (entre las primeras 15) y adivina qué columna es cada campo.
export function detectar(rows) {
  let best = { head: -1, map: {}, score: 0 };
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = rows[r].map(sinAcento), map = {}, used = new Set();
    let score = 0;
    CAMPOS.forEach((f) => {
      // primero coincidencia exacta, después "contiene"
      // los alias van en orden de prioridad ("código de barras" antes que "código")
      let ix = -1;
      // palabras que aseguran el campo (ej: "Cód. Barra" gana sobre "Código", que suele ser el código interno)
      if (f.pri) f.pri.some((w) => (ix = cells.findIndex((c, i) => !used.has(i) && c.split(' ').indexOf(w) >= 0 || (!used.has(i) && c.indexOf(w) >= 0 && w.length > 3))) >= 0);
      if (ix < 0) f.alias.some((a) => (ix = cells.findIndex((c, i) => !used.has(i) && c === sinAcento(a))) >= 0);
      if (ix < 0) f.alias.some((a) => sinAcento(a).length > 3 && (ix = cells.findIndex((c, i) => !used.has(i) && c.indexOf(sinAcento(a)) >= 0)) >= 0);
      if (ix >= 0) { map[f.k] = ix; used.add(ix); score += f.req ? 3 : 1; }
    });
    if (score > best.score) best = { head: r, map, score };
  }
  if (best.head < 0) { // sin títulos: se asume nombre en la primera columna de texto y precio en la primera numérica
    const r0 = rows[0] || [], map = {};
    const ti = r0.findIndex((c) => typeof c === 'string' && isNaN(num(c)) && c.trim()), ni = r0.findIndex((c, i) => i !== ti && !isNaN(num(c)));
    if (ti >= 0) map.n = ti; if (ni >= 0) map.pn = ni;
    return { head: -1, map };
  }
  return { head: best.head, map: best.map };
}

// Arma los productos a partir de las filas y el mapeo de columnas.
export function armar(rows, head, map) {
  const items = [], errores = [], porCod = {};
  const get = (r, k) => (map[k] == null || map[k] < 0 ? undefined : r[map[k]]);
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i], fila = i + 1;
    const n = String(get(r, 'n') == null ? '' : get(r, 'n')).trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!n) { if (r.some((c) => String(c).trim() !== '')) errores.push({ fila, motivo: 'Sin nombre' }); continue; }
    const o = { fila, n };
    const s = codigo(get(r, 's')); if (s) o.s = s;
    // precio que no es un número ("consultar", vacío): el producto se importa igual, sin precio
    const pn = num(get(r, 'pn')); if (map.pn != null && map.pn >= 0) o.pn = isNaN(pn) || pn < 0 ? 0 : Math.round(pn * 100) / 100;
    const c = num(get(r, 'c')); if (map.c != null && map.c >= 0 && !isNaN(c) && c >= 0) o.c = Math.round(c * 100) / 100;
    const q = num(get(r, 'q')); if (map.q != null && map.q >= 0 && !isNaN(q)) o.q = Math.round(q * 1000) / 1000;
    const cat = String(get(r, 'cat') == null ? '' : get(r, 'cat')).trim().slice(0, 40); if (cat) o.cat = cat;
    if (map.w != null && map.w >= 0) o.w = siNo(get(r, 'w'));
    if (o.q != null && !o.w && o.q !== Math.floor(o.q)) o.q = Math.round(o.q);
    if (s && porCod[s] != null) { items[porCod[s]] = o; o.dup = 1; continue; } // el mismo código dos veces: queda la última fila
    if (s) porCod[s] = items.length;
    items.push(o);
  }
  return { items, errores };
}

// Compara con los productos que ya existen (por código de barras; si no hay código, por nombre igual).
export function plan(items, existentes) {
  const byCod = {}, byNom = {};
  const vars = (c) => { c = String(c).trim().toLowerCase(); const v = [c]; if (/^\d{12}$/.test(c)) v.push('0' + c); if (/^0\d{12}$/.test(c)) v.push(c.slice(1)); return v; };
  existentes.forEach((p) => { if (p.s) vars(p.s).forEach((k) => { byCod[k] = p; }); byNom[sinAcento(p.n)] = byNom[sinAcento(p.n)] || p; });
  const nuevos = [], actualizar = [];
  items.forEach((it) => {
    let p = null;
    if (it.s) vars(it.s).some((k) => (p = byCod[k] || null));
    if (!p) { const q = byNom[sinAcento(it.n)]; if (q && (!it.s || !q.s)) p = q; }
    if (p) actualizar.push({ it, p }); else nuevos.push(it);
  });
  return { nuevos, actualizar };
}

// Planilla de ejemplo (CSV con ; y acentos, como la abre Excel en español).
export function ejemploCsv() {
  const L = [['Nombre', 'Código de barras', 'Categoría', 'Precio de venta', 'Costo', 'Stock', 'Por peso'],
    ['Coca-Cola 2,25 L', '7790895000997', 'Bebidas', '3100', '2300', '24', 'no'],
    ['Dulce de leche 400 g', '7790080033128', 'Lácteos', '2800', '2100', '12', 'no'],
    ['Queso cremoso', '', 'Fiambrería', '9500', '7000', '3,5', 'sí'],
    ['Yerba mate 1 kg', '7790387013111', 'Almacén', '4200', '3300', '18', 'no']];
  return '﻿' + L.map((r) => r.map((c) => (/[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(';')).join('\r\n');
}

// ---------- lectura de archivos (navegador) ----------
export function decodificar(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}
async function inflar(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
// Lee los archivos pedidos de un zip (busca el directorio central al final del archivo).
async function unzip(buf, want) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), td = new TextDecoder();
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out = {};
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
    if (want(name)) {
      const ln = dv.getUint16(loc + 26, true), lx = dv.getUint16(loc + 28, true), start = loc + 30 + ln + lx;
      const data = u8.subarray(start, start + csize);
      out[name] = method === 0 ? data : await inflar(data);
    }
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
const colIx = (ref) => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
async function leerXlsx(buf) {
  const files = await unzip(buf, (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(n));
  const td = new TextDecoder(), xml = (n) => (files[n] ? new DOMParser().parseFromString(td.decode(files[n]), 'application/xml') : null);
  const tag = (d, t) => Array.from(d.getElementsByTagName(t));
  // primera hoja del libro
  let sheet = Object.keys(files).filter((n) => /^xl\/worksheets\//.test(n)).sort()[0];
  const wb = xml('xl/workbook.xml'), rels = xml('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const s0 = tag(wb, 'sheet')[0], rid = s0 && (s0.getAttribute('r:id') || s0.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const rel = tag(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid);
    if (rel) { const t = rel.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, ''); if (files['xl/' + t]) sheet = 'xl/' + t; }
  }
  if (!sheet) throw new Error('hoja');
  const ss = xml('xl/sharedStrings.xml'), strs = ss ? tag(ss, 'si').map((si) => tag(si, 't').map((t) => t.textContent).join('')) : [];
  const d = xml(sheet), rows = [];
  tag(d, 'row').forEach((row) => {
    const r = []; let last = -1;
    tag(row, 'c').forEach((c) => {
      let ix = colIx(c.getAttribute('r')); if (ix < 0) ix = last + 1; last = ix;
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], val = v ? v.textContent : '';
      let out;
      if (t === 's') out = strs[+val] || '';
      else if (t === 'inlineStr') out = tag(c, 't').map((x) => x.textContent).join('');
      else if (t === 'str' || t === 'e') out = val;
      else if (t === 'b') out = val === '1' ? 'sí' : 'no';
      else out = val === '' ? '' : Number(val);
      while (r.length < ix) r.push('');
      r[ix] = out;
    });
    const rn = +row.getAttribute('r'); if (rn) { while (rows.length < rn - 1) rows.push([]); }
    rows.push(r);
  });
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}
// Devuelve las filas de la primera hoja: [[celda, ...], ...]
export async function leerArchivo(file) {
  const name = (file.name || '').toLowerCase(), buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 8));
  const isZip = head[0] === 0x50 && head[1] === 0x4b, isOle = head[0] === 0xd0 && head[1] === 0xcf;
  if (isOle || /\.xls$/.test(name)) { const e = new Error('xls'); e.code = 'xls'; throw e; }
  if (isZip) {
    if (typeof DecompressionStream === 'undefined') { const e = new Error('navegador'); e.code = 'nav'; throw e; }
    if (/\.ods$/.test(name)) { const e = new Error('ods'); e.code = 'ods'; throw e; }
    return leerXlsx(buf);
  }
  return parseCsv(decodificar(buf));
}
