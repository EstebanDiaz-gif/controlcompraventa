// QR en PNG para los mails (Gmail y Outlook no muestran imágenes SVG ni "data:").
// Usa el mismo generador de QR que la app (qr.js) y arma el PNG a mano (escala de grises, sin librerías).
import { qrMatriz } from '../../qr.js';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(tipo, datos) {
  const out = new Uint8Array(12 + datos.length), dv = new DataView(out.buffer);
  dv.setUint32(0, datos.length);
  for (let i = 0; i < 4; i++) out[4 + i] = tipo.charCodeAt(i);
  out.set(datos, 8);
  dv.setUint32(8 + datos.length, crc32(out.subarray(4, 8 + datos.length)));
  return out;
}
async function zlib(datos) {
  const cs = new CompressionStream('deflate'), w = cs.writable.getWriter();
  w.write(datos); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

// Devuelve los bytes del PNG: módulos de `px` píxeles y margen de 4 módulos (lo que pide el estándar).
export async function qrPng(texto, px, color) {
  const m = qrMatriz(texto, 'M'), k = Math.max(2, Math.min(16, px || 8)), mg = 4, lado = (m.n + mg * 2) * k;
  const tinta = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#000000';
  // Escala de grises: un tono oscuro (el color del local, oscurecido si hace falta para que se lea bien) y blanco.
  const n = parseInt(tinta.slice(1), 16), lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  const osc = Math.min(70, Math.round(lum));
  const fila = lado + 1, crudo = new Uint8Array(fila * lado);
  for (let y = 0; y < lado; y++) {
    crudo[y * fila] = 0; // sin filtro
    const r = Math.floor(y / k) - mg;
    for (let x = 0; x < lado; x++) {
      const c = Math.floor(x / k) - mg;
      crudo[y * fila + 1 + x] = r >= 0 && c >= 0 && r < m.n && c < m.n && m.oscuro(r, c) ? osc : 255;
    }
  }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, lado); dv.setUint32(4, lado); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const partes = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await zlib(crudo)), chunk('IEND', new Uint8Array(0))];
  const tot = partes.reduce((a, p) => a + p.length, 0), png = new Uint8Array(tot);
  let o = 0; for (const p of partes) { png.set(p, o); o += p.length; }
  return png;
}
