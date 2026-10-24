// Demo para mostrar a clientes: llena una tienda de almacén vacía con productos de ejemplo,
// fotos (dibujadas en el celular con emojis), categorías, destacados, portada y catálogo activado.
// Solo lo ve el dueño de la plataforma (ver almacen.js). Los productos quedan marcados con demo: 1
// para poder borrarlos todos juntos.
import { doc, setDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// [nombre, categoría, precio, costo, stock, porPeso, emoji, destacado(orden), precioAnterior]
const SETS = {
  super: {
    titulo: 'Supermercado', tag: 'Tu súper de barrio, ahora online', emoji: '🛒', fondo: ['#0E4D45', '#1F7A5C'],
    p: [
      ['Coca-Cola 2,25 L', 'Bebidas', 3100, 2300, 24, 0, '🥤', 1, 3500],
      ['Agua mineral 2 L', 'Bebidas', 1300, 850, 30, 0, '💧'],
      ['Cerveza lata 473 ml', 'Bebidas', 1900, 1300, 48, 0, '🍺', 4],
      ['Jugo de naranja 1 L', 'Bebidas', 1700, 1150, 18, 0, '🧃'],
      ['Vino tinto 750 ml', 'Bebidas', 5200, 3600, 12, 0, '🍷'],
      ['Yerba mate 1 kg', 'Almacén', 4200, 3100, 20, 0, '🧉', 2],
      ['Fideos spaghetti 500 g', 'Almacén', 1100, 750, 40, 0, '🍝'],
      ['Arroz largo fino 1 kg', 'Almacén', 1500, 1050, 25, 0, '🍚'],
      ['Aceite de girasol 900 ml', 'Almacén', 2600, 1900, 15, 0, '🌻'],
      ['Café molido 250 g', 'Almacén', 4500, 3200, 10, 0, '☕'],
      ['Atún en lata', 'Almacén', 2300, 1600, 20, 0, '🐟'],
      ['Leche entera 1 L', 'Lácteos', 1250, 900, 30, 0, '🥛'],
      ['Manteca 200 g', 'Lácteos', 2400, 1700, 12, 0, '🧈'],
      ['Huevos x 12', 'Lácteos', 3800, 2800, 15, 0, '🥚', 5],
      ['Queso cremoso', 'Fiambrería', 9500, 6800, 5, 1, '🧀', 3, 10500],
      ['Jamón cocido', 'Fiambrería', 12000, 8800, 4, 1, '🍖'],
      ['Pan francés', 'Panadería', 2200, 1300, 8, 1, '🥖'],
      ['Medialunas x 6', 'Panadería', 3000, 1800, 10, 0, '🥐'],
      ['Manzana roja', 'Verdulería', 2800, 1800, 15, 1, '🍎'],
      ['Banana', 'Verdulería', 2400, 1500, 15, 1, '🍌'],
      ['Tomate', 'Verdulería', 2600, 1700, 12, 1, '🍅'],
      ['Papa', 'Verdulería', 1200, 700, 30, 1, '🥔'],
      ['Galletitas Oreo 118 g', 'Galletitas y golosinas', 1350, 950, 30, 0, '🍪'],
      ['Chocolate 100 g', 'Galletitas y golosinas', 1900, 1300, 20, 0, '🍫'],
      ['Papas fritas 150 g', 'Galletitas y golosinas', 2100, 1450, 18, 0, '🍟'],
      ['Helado 1 kg', 'Congelados', 6500, 4300, 6, 0, '🍨'],
      ['Hamburguesas x 4', 'Congelados', 4200, 2900, 10, 0, '🍔'],
      ['Lavandina 1 L', 'Limpieza', 950, 600, 20, 0, '🧴', 0, 1200],
      ['Detergente 750 ml', 'Limpieza', 1600, 1100, 15, 0, '🧽'],
      ['Papel higiénico x 4', 'Limpieza', 2900, 2000, 12, 0, '🧻'],
      ['Jabón de tocador x 3', 'Perfumería', 2200, 1500, 15, 0, '🧼'],
      ['Pasta dental 90 g', 'Perfumería', 1800, 1200, 15, 0, '🪥']
    ]
  },
  carne: {
    titulo: 'Carnicería', tag: 'Cortes frescos todos los días', emoji: '🥩', fondo: ['#5C1A1B', '#9C2B23'],
    p: [
      ['Asado de tira', 'Carne vacuna', 11000, 8200, 15, 1, '🥩', 1, 12500],
      ['Vacío', 'Carne vacuna', 12500, 9300, 10, 1, '🥩', 2],
      ['Matambre', 'Carne vacuna', 13000, 9800, 6, 1, '🥩'],
      ['Nalga para milanesas', 'Carne vacuna', 10500, 7800, 12, 1, '🥩'],
      ['Carne picada especial', 'Carne vacuna', 7800, 5600, 15, 1, '🥩', 3],
      ['Bife de chorizo', 'Carne vacuna', 14500, 10800, 8, 1, '🥩'],
      ['Milanesas de carne (listas)', 'Elaborados', 9800, 6500, 8, 1, '🍽️'],
      ['Hamburguesas caseras x 4', 'Elaborados', 5200, 3400, 12, 0, '🍔'],
      ['Pollo entero', 'Pollo', 4200, 3000, 20, 1, '🍗', 4],
      ['Pechuga de pollo', 'Pollo', 6900, 5000, 10, 1, '🍗'],
      ['Patamuslo', 'Pollo', 4800, 3400, 12, 1, '🍗'],
      ['Bondiola de cerdo', 'Cerdo', 9800, 7100, 6, 1, '🍖'],
      ['Costillitas de cerdo', 'Cerdo', 8900, 6400, 8, 1, '🍖'],
      ['Chorizo parrillero', 'Embutidos', 7500, 5200, 15, 1, '🌭', 5],
      ['Morcilla', 'Embutidos', 5200, 3500, 10, 1, '🌭'],
      ['Carbón 4 kg', 'Para el asado', 4500, 3000, 20, 0, '🔥'],
      ['Chimichurri casero', 'Para el asado', 2500, 1200, 15, 0, '🌿'],
      ['Pan de campo', 'Para el asado', 2800, 1600, 10, 0, '🥖']
    ]
  },
  kiosco: {
    titulo: 'Kiosco y drugstore', tag: 'Todo lo que necesitás, a una cuadra', emoji: '🍫', fondo: ['#2B2A6B', '#4C3FB0'],
    p: [
      ['Alfajor triple', 'Golosinas', 900, 600, 48, 0, '🍫', 1],
      ['Chocolate con maní', 'Golosinas', 1600, 1100, 20, 0, '🍫'],
      ['Caramelos surtidos', 'Golosinas', 300, 150, 100, 0, '🍬'],
      ['Chicles x 10', 'Golosinas', 700, 450, 40, 0, '🍬'],
      ['Turrón de maní', 'Golosinas', 400, 250, 50, 0, '🥜'],
      ['Gaseosa 500 ml', 'Bebidas', 1500, 1000, 36, 0, '🥤', 2],
      ['Agua 500 ml', 'Bebidas', 900, 550, 36, 0, '💧'],
      ['Bebida energizante', 'Bebidas', 2300, 1600, 24, 0, '⚡', 3, 2600],
      ['Papas fritas 80 g', 'Snacks', 1500, 1000, 20, 0, '🍟'],
      ['Maní salado 100 g', 'Snacks', 1100, 700, 20, 0, '🥜'],
      ['Galletitas dulces', 'Snacks', 1200, 800, 20, 0, '🍪'],
      ['Desodorante', 'Perfumería', 3200, 2200, 12, 0, '🧴', 4],
      ['Protector solar', 'Perfumería', 8900, 6200, 6, 0, '☀️'],
      ['Toallitas húmedas', 'Perfumería', 2400, 1600, 12, 0, '🧻'],
      ['Curitas x 10', 'Perfumería', 1300, 800, 15, 0, '🩹'],
      ['Pilas AA x 2', 'Varios', 2600, 1700, 20, 0, '🔋', 5],
      ['Cargador USB', 'Varios', 6500, 4200, 6, 0, '🔌'],
      ['Encendedor', 'Varios', 900, 500, 30, 0, '🔥']
    ]
  }
};
export const DEMO_TIPOS = Object.keys(SETS).map((k) => [k, SETS[k].titulo]);

const PASTEL = ['#FFF4D6', '#E7F5DC', '#FFE3E3', '#DDEBFA', '#F1E6FF', '#FFE9D6'];
// Foto del producto: el emoji grande sobre un fondo suave (cada celular lo dibuja con sus emojis).
function foto(emoji, i) {
  const c = document.createElement('canvas'); c.width = c.height = 360;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 360, 360);
  x.fillStyle = PASTEL[i % PASTEL.length]; x.beginPath(); x.arc(180, 190, 150, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#000';
  x.font = '190px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(emoji, 180, 200);
  return c.toDataURL('image/jpeg', 0.85);
}
function portada(set) {
  const c = document.createElement('canvas'); c.width = 900; c.height = 900;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 900, 900);
  g.addColorStop(0, set.fondo[0]); g.addColorStop(1, set.fondo[1]); x.fillStyle = g; x.fillRect(0, 0, 900, 900);
  x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.arc(450, 470, 330, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#000';
  x.font = '420px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(set.emoji, 450, 490);
  return c.toDataURL('image/jpeg', 0.85);
}
// Código de barras de ejemplo (EAN-13 válido, empieza con 779 como los argentinos).
function ean(n) {
  const b = '779' + String(9000000000 + n * 7919).slice(-9);
  let s = 0; for (let i = 0; i < 12; i++) s += (+b[i]) * (i % 2 ? 3 : 1);
  return b + ((10 - (s % 10)) % 10);
}

export async function cargarDemo({ db, sid, sname, tipo }) {
  const set = SETS[tipo] || SETS.super;
  const ops = set.p.map((r, i) => {
    const [n, cat, pn, c, q, w, em, dt, pa] = r, id = 'demo_' + tipo + '_' + i;
    const o = { n, s: w ? '' : ean(i + 1 + (tipo === 'carne' ? 100 : tipo === 'kiosco' ? 200 : 0)), cat, pn, c, q, min: w ? 1 : 3, oh: false, alm: 1, w: !!w, img: foto(em, i), demo: 1 };
    if (dt) o.dt = dt;
    if (pa) o.pa = pa;
    return [id, o];
  });
  for (let i = 0; i < ops.length; i += 15) {
    const b = writeBatch(db);
    ops.slice(i, i + 15).forEach(([id, o]) => b.set(doc(db, 'stores', sid, 'stock', id), o));
    await b.commit();
  }
  await setDoc(doc(db, 'stores', sid, 'public', 'portada'), { f: portada(set), at: Date.now() });
  await setDoc(doc(db, 'stores', sid, 'public', 'info'), { enabled: true, alm: true, name: sname, tag: set.tag, hours: 'Lun a Sáb de 8 a 21', pt: 1 }, { merge: true });
  return ops.length;
}
export async function borrarDemo({ db, sid, ids }) {
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => b.delete(doc(db, 'stores', sid, 'stock', id)));
    await b.commit();
  }
}
