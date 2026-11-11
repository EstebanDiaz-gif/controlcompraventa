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
      ['Papas fritas 150 g', 'Snacks', 2100, 1450, 18, 0, '🍟'],
      ['Helado 1 kg', 'Congelados', 6500, 4300, 6, 0, '🍨'],
      ['Hamburguesas x 4', 'Congelados', 4200, 2900, 10, 0, '🍔'],
      ['Lavandina 1 L', 'Limpieza', 950, 600, 20, 0, '🧴', 0, 1200],
      ['Detergente 750 ml', 'Limpieza', 1600, 1100, 15, 0, '🧽'],
      ['Papel higiénico x 4', 'Limpieza', 2900, 2000, 12, 0, '🧻'],
      ['Jabón de tocador x 3', 'Perfumería', 2200, 1500, 15, 0, '🧼'],
      ['Pasta dental 90 g', 'Perfumería', 1800, 1200, 15, 0, '🪥']
    ]
  },
  panaderia: {
    titulo: 'Panadería', tag: 'Pan calentito y facturas recién hechas', emoji: '🥐', fondo: ['#6B3E1F', '#A0612F'],
    p: [
      ['Pan francés', 'Panadería', 2400, 1300, 20, 1, '🥖', 1],
      ['Pan de campo', 'Panadería', 3200, 1800, 8, 1, '🍞'],
      ['Pan lactal casero', 'Panadería', 2800, 1500, 10, 0, '🍞'],
      ['Medialunas de manteca x 6', 'Facturas', 3300, 1700, 15, 0, '🥐', 2, 3800],
      ['Facturas surtidas x 12', 'Facturas', 6500, 3400, 10, 0, '🥐', 3],
      ['Bolas de fraile x 6', 'Facturas', 3600, 1900, 8, 0, '🍩'],
      ['Criollos', 'Facturas', 4200, 2200, 6, 1, '🥨'],
      ['Torta selva negra', 'Tortas y postres', 28000, 15000, 2, 0, '🎂', 4],
      ['Lemon pie', 'Tortas y postres', 18000, 9500, 3, 0, '🥧'],
      ['Masas finas x 1/2 kg', 'Masas y confitería', 9500, 5200, 5, 0, '🧁'],
      ['Alfajores de maicena x 6', 'Masas y confitería', 4500, 2300, 8, 0, '🍪'],
      ['Sándwiches de miga x 12', 'Sándwiches y salados', 9000, 5000, 6, 0, '🥪', 5],
      ['Empanadas x 6', 'Sándwiches y salados', 7200, 3900, 6, 0, '🥟'],
      ['Budín de limón', 'Galletitas y budines', 4800, 2500, 6, 0, '🍰'],
      ['Gaseosa cola 2,25 L', 'Bebidas', 3300, 2400, 12, 0, '🥤'],
      ['Jugo de naranja 1 L', 'Bebidas', 1800, 1200, 12, 0, '🧃'],
      ['Agua mineral 500 ml', 'Bebidas', 900, 550, 24, 0, '💧'],
      ['Yerba mate 1 kg', 'Almacén', 4300, 3150, 10, 0, '🧉'],
      ['Café molido 250 g', 'Almacén', 4600, 3300, 6, 0, '☕'],
      ['Té en saquitos x 25', 'Almacén', 1500, 950, 10, 0, '🍵'],
      ['Mate cocido x 25', 'Almacén', 1600, 1000, 10, 0, '🧉'],
      ['Leche entera 1 L', 'Lácteos', 1300, 920, 12, 0, '🥛'],
      ['Dulce de leche 400 g', 'Lácteos', 3200, 2200, 8, 0, '🍯']
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

// ---------- Gastronomía: menú con descripciones, opciones (tamaño, extras, "sin cebolla"), combos y pedidos de ejemplo ----------
// Cada plato: { n, cat, p (precio), c (costo), em (emoji si no hay foto), f (foto: img/demo/<f>.jpg, si existe), d, op (opciones), dt (destacado), pa (precio anterior) }
const T = (t, min, max, o) => ({ t, min, max, o: o.map((x) => (Array.isArray(x) ? { n: x[0], p: x[1] } : { n: x, p: 0 })) });
const OP_BURGER = [T('Tamaño', 1, 1, [['Simple', 0], ['Doble', 2500], ['Triple', 4500]]), T('Punto de la carne', 1, 1, ['A punto', 'Jugosa', 'Bien cocida']),
  T('Sacale', 0, 4, ['Sin cebolla', 'Sin tomate', 'Sin pepinos', 'Sin salsa']), T('Agregados', 0, 3, [['Extra cheddar', 1500], ['Doble bacon', 2000], ['Huevo a la plancha', 1200], ['Aros de cebolla', 1500]])];
const OP_PAPAS = [T('Tamaño', 1, 1, [['Medianas', 0], ['Grandes', 1500]]), T('Agregale', 0, 3, [['Cheddar', 1500], ['Panceta', 1500], ['Verdeo', 500]])];
const OP_COMBO = [T('Bebida', 1, 1, ['Coca-Cola', 'Coca-Cola Zero', 'Sprite', 'Agua mineral']), T('Papas', 1, 1, [['Clásicas', 0], ['Cheddar y bacon', 2500]]), T('Agregados', 0, 3, [['Extra cheddar', 1500], ['Doble bacon', 2000]])];
const OP_PIZZA = [T('Tamaño', 1, 1, [['Grande (8 porciones)', 0], ['Gigante (12 porciones)', 4500]]), T('Borde', 1, 1, [['Clásico', 0], ['Relleno de queso', 2500]]), T('Agregados', 0, 3, [['Extra muzzarella', 2000], ['Jamón', 1800], ['Aceitunas', 800], ['Huevo duro', 900]])];
const GAS = {
  burger: {
    titulo: 'Hamburguesería', tag: 'Hamburguesas a la parrilla · Envíos y retiro', emoji: '🍔', fondo: ['#1C1917', '#B45309'], hours: 'Mar a Dom de 19:30 a 00:30', env: 1500,
    p: [
      { n: 'American Onion', cat: 'Hamburguesas', p: 14499, c: 6200, em: '🍔', f: 'burger-american', d: 'Cheddar, panceta crocante y aros de cebolla en pan brioche.', op: OP_BURGER, dt: 1 },
      { n: 'Cheeseburger clásica', cat: 'Hamburguesas', p: 11999, c: 4800, em: '🍔', f: 'burger-cheese', d: 'Smash con doble cheddar, pepinos, cebolla y salsa de la casa.', op: OP_BURGER, dt: 2 },
      { n: 'Criolla', cat: 'Hamburguesas', p: 13499, c: 5600, em: '🍔', f: 'burger-criolla', d: 'Lechuga, tomate, cebolla morada, cheddar y salsa criolla.', op: OP_BURGER, dt: 3 },
      { n: 'BBQ Bacon', cat: 'Hamburguesas', p: 14499, pa: 16499, c: 6100, em: '🍔', f: 'burger-bbq', d: 'Salsa barbacoa, panceta ahumada, cheddar y cebolla crispy.', op: OP_BURGER },
      { n: 'Blue Cheese', cat: 'Hamburguesas', p: 14999, c: 6400, em: '🍔', f: 'burger-blue', d: 'Queso azul, rúcula fresca y cebolla caramelizada.', op: OP_BURGER },
      { n: 'Veggie', cat: 'Hamburguesas', p: 12999, c: 5000, em: '🥗', f: 'burger-veggie', d: 'Medallón de garbanzos y quinoa, palta, tomate y mayonesa de ajo.', op: [OP_BURGER[0], OP_BURGER[2]] },
      { n: 'Combo American', cat: 'Combos', p: 18999, c: 8200, em: '🍟', f: 'combo-american', d: 'American Onion + papas + bebida a elección.', op: OP_COMBO, dt: 4 },
      { n: 'Combo Clásico', cat: 'Combos', p: 15999, c: 6900, em: '🍟', f: 'combo-clasico', d: 'Cheeseburger clásica + papas + bebida a elección.', op: OP_COMBO },
      { n: 'Combo Pareja', cat: 'Combos', p: 29999, c: 13000, em: '🍔', f: 'combo-pareja', d: '2 hamburguesas clásicas + papas grandes + 2 bebidas.', op: [T('Bebidas', 2, 2, ['Coca-Cola', 'Coca-Cola Zero', 'Sprite', 'Agua mineral'])], dt: 5 },
      { n: 'Papas fritas', cat: 'Papas', p: 4999, c: 1500, em: '🍟', f: 'papas', d: 'Papas bastón crocantes con sal marina.', op: OP_PAPAS },
      { n: 'Papas cheddar y bacon', cat: 'Papas', p: 7999, c: 2900, em: '🍟', f: 'papas-cheddar', d: 'Bañadas en cheddar, con panceta crocante y verdeo.', op: [OP_PAPAS[0]] },
      { n: 'Aros de cebolla x 8', cat: 'Papas', p: 5499, c: 1700, em: '🧅', f: 'aros', d: 'Rebozados y crocantes, con salsa a elección.', op: [T('Salsa', 1, 1, ['Barbacoa', 'Alioli', 'Mostaza y miel', 'Ketchup'])] },
      { n: 'Nuggets de pollo x 6', cat: 'Papas', p: 5999, c: 2100, em: '🍗', f: 'nuggets', d: 'Pollo empanado casero, con salsa a elección.', op: [T('Salsa', 1, 1, ['Barbacoa', 'Alioli', 'Mostaza y miel', 'Ketchup'])] },
      { n: 'Coca-Cola 500 ml', cat: 'Bebidas', p: 2500, c: 1300, em: '🥤', f: 'coca' },
      { n: 'Coca-Cola Zero 500 ml', cat: 'Bebidas', p: 2500, c: 1300, em: '🥤', f: 'coca-zero' },
      { n: 'Agua mineral 500 ml', cat: 'Bebidas', p: 1800, c: 800, em: '💧', f: 'agua' },
      { n: 'Cerveza IPA artesanal 500 ml', cat: 'Bebidas', p: 4500, c: 2200, em: '🍺', f: 'cerveza', d: 'Pinta de IPA de cervecería local.' },
      { n: 'Limonada con menta y jengibre', cat: 'Bebidas', p: 3500, c: 900, em: '🍋', f: 'limonada', d: 'Jarra de 500 ml, hecha en el momento.' },
      { n: 'Brownie con helado', cat: 'Postres', p: 5500, c: 1800, em: '🍫', f: 'brownie', d: 'Brownie tibio con una bocha de helado de vainilla.' },
      { n: 'Cheesecake de frutos rojos', cat: 'Postres', p: 5800, c: 2000, em: '🍰', f: 'cheesecake', d: 'Porción con coulis de frutos rojos.' },
    ],
  },
  pizza: {
    titulo: 'Pizzería', tag: 'Pizzas al horno de barro · Envíos y retiro', emoji: '🍕', fondo: ['#7F1D1D', '#B3261E'], hours: 'Todos los días de 19 a 00', env: 1800,
    p: [
      { n: 'Muzzarella', cat: 'Pizzas', p: 11999, c: 4200, em: '🍕', f: 'pizza-muzza', d: 'Salsa de tomate, abundante muzzarella, orégano y aceitunas.', op: OP_PIZZA, dt: 1 },
      { n: 'Napolitana', cat: 'Pizzas', p: 13499, c: 4800, em: '🍕', f: 'pizza-napo', d: 'Muzzarella, rodajas de tomate, ajo y perejil.', op: OP_PIZZA, dt: 2 },
      { n: 'Fugazzeta', cat: 'Pizzas', p: 13999, c: 4900, em: '🧅', f: 'pizza-fugazzeta', d: 'Rellena de muzzarella con cebolla dorada arriba.', op: OP_PIZZA },
      { n: 'Jamón y morrones', cat: 'Pizzas', p: 14499, c: 5300, em: '🍕', f: 'pizza-jamon', d: 'Muzzarella, jamón cocido y morrones asados.', op: OP_PIZZA },
      { n: 'Pepperoni', cat: 'Pizzas', p: 15499, c: 5800, em: '🍕', f: 'pizza-pepperoni', d: 'Muzzarella y pepperoni crocante.', op: OP_PIZZA, dt: 3 },
      { n: 'Cuatro quesos', cat: 'Pizzas', p: 15999, c: 6100, em: '🧀', f: 'pizza-4quesos', d: 'Muzzarella, roquefort, provolone y parmesano.', op: OP_PIZZA },
      { n: 'Rúcula y crudo', cat: 'Pizzas', p: 16999, pa: 18499, c: 6800, em: '🍕', f: 'pizza-rucula', d: 'Muzzarella, jamón crudo, rúcula fresca y parmesano.', op: OP_PIZZA, dt: 4 },
      { n: 'Promo Muzza + Coca 1,5 L', cat: 'Promos', p: 14999, c: 5800, em: '🔥', f: 'promo-muzza', d: 'Pizza grande de muzzarella y una Coca-Cola de 1,5 L.', dt: 5 },
      { n: 'Promo 2 pizzas', cat: 'Promos', p: 23999, c: 9000, em: '🍕', f: 'promo-2pizzas', d: 'Elegí dos gustos de pizza grande.', op: [T('Gustos', 2, 2, ['Muzzarella', 'Napolitana', 'Fugazzeta', 'Jamón y morrones', 'Pepperoni'])] },
      { n: 'Empanada de carne', cat: 'Empanadas', p: 1500, c: 550, em: '🥟', f: 'empanada-carne', d: 'Cortada a cuchillo, al horno.' },
      { n: 'Empanada de jamón y queso', cat: 'Empanadas', p: 1500, c: 500, em: '🥟', f: 'empanada-jyq' },
      { n: 'Empanada de pollo', cat: 'Empanadas', p: 1500, c: 520, em: '🥟', f: 'empanada-pollo' },
      { n: 'Docena de empanadas', cat: 'Empanadas', p: 16000, c: 6000, em: '🥟', f: 'empanadas-docena', d: 'Armala con los gustos que quieras.', op: [T('Gustos', 1, 4, ['Carne', 'Jamón y queso', 'Pollo', 'Humita', 'Verdura'])] },
      { n: 'Fainá', cat: 'Pizzas', p: 2500, c: 600, em: '🫓', f: 'faina', d: 'Porción grande para acompañar.' },
      { n: 'Coca-Cola 1,5 L', cat: 'Bebidas', p: 4200, c: 2300, em: '🥤', f: 'coca15' },
      { n: 'Cerveza rubia 1 L', cat: 'Bebidas', p: 4800, c: 2600, em: '🍺', f: 'cerveza1l' },
      { n: 'Agua mineral 500 ml', cat: 'Bebidas', p: 1800, c: 800, em: '💧', f: 'agua' },
      { n: 'Vino Malbec 750 ml', cat: 'Bebidas', p: 9500, c: 5200, em: '🍷', f: 'vino' },
      { n: 'Flan casero con dulce de leche', cat: 'Postres', p: 4500, c: 1200, em: '🍮', f: 'flan' },
      { n: 'Tiramisú', cat: 'Postres', p: 5500, c: 1800, em: '🍰', f: 'tiramisu' },
    ],
  },
};
// Búsqueda de foto real para cada plato (banco de fotos gratuitas del servidor: Pixabay o Pexels), si está disponible.
const QFOTO = {"burger-american": "hamburguesa bacon aros de cebolla", "burger-cheese": "cheeseburger", "burger-criolla": "hamburguesa lechuga tomate", "burger-bbq": "hamburguesa barbacoa bacon", "burger-blue": "hamburguesa queso azul", "burger-veggie": "hamburguesa vegetariana", "combo-american": "hamburguesa papas fritas gaseosa", "combo-clasico": "combo hamburguesa papas", "combo-pareja": "dos hamburguesas papas", "papas": "papas fritas", "papas-cheddar": "papas fritas queso cheddar", "aros": "aros de cebolla", "nuggets": "nuggets de pollo", "coca": "coca cola botella", "coca-zero": "gaseosa cola botella", "agua": "botella de agua", "cerveza": "cerveza ipa vaso", "limonada": "limonada menta", "brownie": "brownie helado", "cheesecake": "cheesecake frutos rojos", "pizza-muzza": "pizza muzzarella", "pizza-napo": "pizza napolitana tomate", "pizza-fugazzeta": "pizza cebolla queso", "pizza-jamon": "pizza jamon morrones", "pizza-pepperoni": "pizza pepperoni", "pizza-4quesos": "pizza cuatro quesos", "pizza-rucula": "pizza rucula jamon crudo", "promo-muzza": "pizza y gaseosa", "promo-2pizzas": "dos pizzas", "empanada-carne": "empanadas de carne", "empanada-jyq": "empanadas horno", "empanada-pollo": "empanadas", "empanadas-docena": "docena de empanadas", "faina": "faina", "coca15": "gaseosa cola", "cerveza1l": "cerveza rubia", "vino": "copa de vino tinto", "flan": "flan con dulce de leche", "tiramisu": "tiramisu", "portada-burger": "hamburguesa gourmet", "portada-pizza": "pizza horno de leña"};
const usadas = {};
function fotoBanco(fotos, nombre, L) {
  const q = QFOTO[nombre]; if (!fotos || !q) return Promise.resolve(null);
  return fotos.buscar(q).then((d) => {
    const l = ((d && d.fotos) || []).filter((x) => x.l || x.m), x = l.find((y) => !usadas[y.id]) || l[0]; if (!x) return null; usadas[x.id] = 1;
    const u = fotos.proxy + '?u=' + encodeURIComponent(x.l || x.m);
    return new Promise((ok) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { try { const c = document.createElement('canvas'), s = Math.min(im.width, im.height), W = L || 720, H = L ? Math.round(L * 0.5) : 720; c.width = W; c.height = H;
      const sw = L ? im.width : s, sh = L ? Math.min(im.height, im.width * 0.5) : s; c.getContext('2d').drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, 0, 0, W, H); ok(c.toDataURL('image/jpeg', 0.82)); } catch (e) { ok(null); } }; im.onerror = () => ok(null); im.src = u; });
  }).catch(() => null);
}
// Foto real si está en img/demo/<nombre>.jpg (se achica y se recorta cuadrada); si no, el dibujo con emoji.
function fotoArchivo(nombre) {
  return fetch('img/demo/' + nombre + '.jpg').then((r) => (r.ok ? r.blob() : null)).then((b) => {
    if (!b) return null;
    return new Promise((ok) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'), L = 720, s = Math.min(im.width, im.height); c.width = c.height = L; c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, L, L); ok(c.toDataURL('image/jpeg', 0.82)); }; im.onerror = () => ok(null); im.src = URL.createObjectURL(b); });
  }).catch(() => null);
}
function opsDe(op, base) {   // -1 en "Chica" = mitad de precio
  return (op || []).map((g) => ({ t: g.t, min: g.min, max: g.max, o: g.o.map((x) => ({ n: x.n, p: x.p === -1 ? 0 : x.p })) }));
}
async function cargarGas({ db, sid, sname, tipo, fotos, avance }) {
  const set = GAS[tipo], ops = [];
  for (let i = 0; i < set.p.length; i++) {
    const x = set.p[i], id = 'demo_' + tipo + '_' + i;
    if (avance) avance('Cargando ' + (i + 1) + ' de ' + set.p.length + '…');
    const img = (x.f && (await fotoArchivo(x.f) || await fotoBanco(fotos, x.f))) || foto(x.em, i);
    const o = { n: x.n, s: '', cat: x.cat, pn: x.p, c: x.c, q: 0, min: 0, oh: false, alm: 1, w: false, ns: true, img, demo: 1 };
    if (x.d) o.d = x.d; if (x.dt) o.dt = x.dt; if (x.pa) o.pa = x.pa; if (x.op) o.op = opsDe(x.op, x.p);
    ops.push([id, o]);
  }
  for (let i = 0; i < ops.length; i += 10) {
    const b = writeBatch(db);
    ops.slice(i, i + 10).forEach(([id, o]) => b.set(doc(db, 'stores', sid, 'stock', id), o));
    await b.commit();
  }
  const pt = (await fotoArchivo('portada-' + tipo)) || (await fotoBanco(fotos, 'portada-' + tipo, 1200)) || portada(set);
  await setDoc(doc(db, 'stores', sid, 'public', 'portada'), { f: pt, at: Date.now() });
  await setDoc(doc(db, 'stores', sid, 'cfg', 'servicios'), { tipo, biz: 'almacen' }, { merge: true });
  await setDoc(doc(db, 'stores', sid, 'public', 'info'), { enabled: true, alm: true, biz: 'almacen', tp: tipo, est: '', name: sname, tag: set.tag, hours: set.hours, pt: 1, cerr: false,
    addr: 'Av. Aconquija 1234, Yerba Buena, Tucumán', env: { on: true, precio: set.env }, ped: { on: true, mesa: true, nm: 12 },
    pagos: { ef: { on: true, p: 0 }, tr: { on: true, alias: 'demo.pekeron', tit: 'Demo Pekeron', p: 0 } } }, { merge: true });
  // Pedidos de ejemplo para que el panel de Pedidos se vea con movimiento
  const ahora = Date.now(), P = (i) => ops[i][1], it = (i, q, sel, x) => { const o = { k: ops[i][0], n: P(i).n, q, u: P(i).pn }; if (sel) { o.o = sel; o.x = x; } return o; };
  const ej = tipo === 'burger' ? [
    { st: 'nuevo', tipo: 'env', cl: 'Martina Rossi', tel: '381 555 1234', dir: 'Las Heras 450, Barrio Norte', it: [Object.assign(it(0, 2, '0;0;;0', 'Simple, A punto, Extra cheddar'), { u: 15999 }), it(10, 1, '0', 'Medianas')], env: set.env, pago: 'Efectivo', paga: 50000, m: 1 },
    { st: 'ok', tipo: 'mesa', mesa: '4', cl: 'Lucía', it: [Object.assign(it(6, 2, '0;0;', 'Coca-Cola, Clásicas'), {}), it(18, 1)], pago: 'Transferencia', pg: true, min: 20, m: 9 },
    { st: 'listo', tipo: 'ret', cl: 'Joaquín P.', tel: '381 444 9876', it: [Object.assign(it(1, 1, '1;0;;', 'Doble, A punto'), { u: 14499 }), it(13, 2)], pago: 'Efectivo', m: 16 },
    { st: 'camino', tipo: 'env', cl: 'Sofía G.', tel: '381 333 2211', dir: 'San Martín 1200, Centro', it: [it(8, 1, '0,2', 'Coca-Cola, Sprite'), Object.assign(it(9, 1, '1;', 'Grandes'), { u: 6499 })], env: set.env, pago: 'Mercado Pago', pg: true, min: 30, m: 34 },
  ] : [
    { st: 'nuevo', tipo: 'env', cl: 'Martina Rossi', tel: '381 555 1234', dir: 'Las Heras 450, Barrio Norte', it: [it(0, 1, '0;0;', 'Grande (8 porciones), Clásico'), it(14, 1)], env: set.env, pago: 'Efectivo', paga: 20000, m: 1 },
    { st: 'ok', tipo: 'mesa', mesa: '7', cl: 'Lucía', it: [Object.assign(it(4, 1, '0;1;', 'Grande (8 porciones), Relleno de queso'), { u: 17999 }), it(15, 2)], pago: 'Transferencia', pg: true, min: 25, m: 11 },
    { st: 'listo', tipo: 'ret', cl: 'Joaquín P.', tel: '381 444 9876', it: [it(12, 1, '0,1,3', 'Carne, Jamón y queso, Humita')], pago: 'Efectivo', m: 18 },
  ];
  const b = writeBatch(db);
  ej.forEach((e, j) => {
    const id = 'demo' + tipo + 'ped' + j + Math.random().toString(36).slice(2, 10), sub = e.it.reduce((a, l) => a + l.u * l.q, 0), at = ahora - e.m * 60000;
    const d = Object.assign({ id, at, src: 'web', tot: sub + (e.env || 0), demo: 1 }, e); delete d.m;
    if (e.st !== 'nuevo') { d.acc = at + 60000; d.imp = true; }
    b.set(doc(db, 'stores', sid, 'pedidos', id), d);
  });
  await b.commit();
  return ops.length;
}

export const DEMO_TIPOS = Object.keys(SETS).map((k) => [k, SETS[k].titulo]).concat(Object.keys(GAS).map((k) => [k, GAS[k].titulo + ' (con pedidos)']));

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

export async function cargarDemo({ db, sid, sname, tipo, fotos, avance }) {
  if (GAS[tipo]) return cargarGas({ db, sid, sname, tipo, fotos, avance });
  const set = SETS[tipo] || SETS.super;
  const ops = set.p.map((r, i) => {
    const [n, cat, pn, c, q, w, em, dt, pa] = r, id = 'demo_' + tipo + '_' + i;
    const o = { n, s: w ? '' : ean(i + 1 + (tipo === 'carne' ? 100 : tipo === 'kiosco' ? 200 : tipo === 'panaderia' ? 300 : 0)), cat, pn, c, q, min: w ? 1 : 3, oh: false, alm: 1, w: !!w, img: foto(em, i), demo: 1 };
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

// ---------- Demo de servicios (barbería / estética): servicios con foto, productos, agenda online y catálogo ----------
const SERV = {
  barberia: {
    titulo: 'Barbería', tag: 'Tu estilo. Tu momento.', svs: 'barber', emoji: '💈', fondo: ['#1B1B1B', '#4A3B24'],
    sv: [
      ['Corte clásico', 12000, 30, '✂️', 'Tijera o máquina, con lavado.'],
      ['Corte + barba', 16000, 45, '🧔', 'Corte completo y perfilado de barba con toalla caliente.'],
      ['Fade / degradé', 14000, 40, '💈', 'Degradé a máquina con terminación a navaja.'],
      ['Perfilado de barba', 7000, 15, '🪒', 'Rebaje y perfilado con navaja.'],
      ['Corte infantil', 9000, 30, '👦', 'Hasta 12 años.'],
      ['Color / mechas', 22000, 60, '🎨', 'Incluye lavado y secado.']
    ],
    pr: [['Cera mate 85 g', 9500, 5800, 10, '🫙'], ['Shampoo para barba 250 ml', 11000, 7000, 8, '🧴'], ['Aceite para barba 30 ml', 8500, 5200, 8, '💧'], ['Pomada de brillo', 9000, 5500, 8, '✨'], ['Máquina de corte profesional', 85000, 60000, 3, '🔌']]
  },
  estetica: {
    titulo: 'Estética y belleza', tag: 'Tu momento de belleza', svs: 'rosa', emoji: '💅', fondo: ['#F7D6DC', '#E8A2B4'],
    sv: [
      ['Limpieza facial profunda', 18000, 60, '🧖‍♀️', 'Limpieza, exfoliación y mascarilla según tu piel.'],
      ['Manicura semipermanente', 12000, 60, '💅', 'Esmaltado semipermanente con diseño simple.'],
      ['Lifting de pestañas', 15000, 60, '👁️', 'Curvado natural que dura hasta 6 semanas.'],
      ['Perfilado de cejas', 6000, 20, '✨', 'Diseño y perfilado con pinza o hilo.'],
      ['Masaje descontracturante', 20000, 60, '💆‍♀️', 'Espalda, cuello y hombros.'],
      ['Maquillaje social', 25000, 60, '💄', 'Para eventos, con prueba de tonos.']
    ],
    pr: [['Crema hidratante facial', 14000, 8500, 8, '🧴'], ['Sérum vitamina C', 18000, 11000, 6, '💧'], ['Protector solar FPS 50', 12000, 7500, 8, '☀️'], ['Aceite para cutículas', 5000, 2800, 10, '🌸'], ['Kit de uñas', 9000, 5500, 6, '💅']]
  }
};
export const DEMO_SV = Object.keys(SERV).map((k) => [k, SERV[k].titulo]);

export async function cargarDemoServ({ db, sid, sname, tipo, uid, bn, hoy }) {
  const set = SERV[tipo] || SERV.barberia;
  const b = writeBatch(db), t0 = Date.now();
  set.sv.forEach(([n, p, dur, em, d], i) => {
    const id = 'demo_' + tipo + '_' + i;
    b.set(doc(db, 'stores', sid, 'servicios', id), { n, p, dur, d, a: true, ins: [], f: 1, demo: 1 });
    b.set(doc(db, 'stores', sid, 'public', 'svfoto_' + id), { f: foto(em, i), at: t0 });
  });
  await b.commit();
  // productos: como en las tiendas de productos, el stock sale de una compra
  const b2 = writeBatch(db);
  set.pr.forEach(([n, pn, c, q, em], i) => {
    const s = 'DEMO-' + (i + 1), mid = t0 + i, k = s.toLowerCase();
    b2.set(doc(db, 'stores', sid, 'movs', String(mid)), { id: mid, t: 'c', d: hoy, p: n, s, z: '', q, u: c, k: '', by: uid, bn });
    b2.set(doc(db, 'stores', sid, 'stock', k), { n, s, z: '', q, pn, pm: 0, cat: 'Productos', img: foto(em, i + 3), demo: 1 });
  });
  await b2.commit();
  const h = { 0: [], 1: [540, 1200], 2: [540, 1200], 3: [540, 1200], 4: [540, 1200], 5: [540, 1200], 6: [540, 1080] };
  await setDoc(doc(db, 'stores', sid, 'cfg', 'servicios'), { biz: 'ambos', ag: { on: true, paso: 30, ant: 60, max: 14, h, cz: [], pros: null } }, { merge: true });
  await setDoc(doc(db, 'stores', sid, 'public', 'portada'), { f: portada(set), at: Date.now() });
  await setDoc(doc(db, 'stores', sid, 'public', 'info'), { enabled: true, biz: 'ambos', svs: set.svs, name: sname, tag: set.tag, hours: 'Lun a Vie de 9 a 20 · Sáb de 9 a 18', pt: 1 }, { merge: true });
  return set.sv.length;
}
