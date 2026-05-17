/* Mock data — ferretería (Bogotá, Colombia). Hardcoded en cliente. */

window.FMT = {
  cop: (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0),
  copShort: (n) => {
    if (n == null) return '$0';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return '$' + (n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + ' M';
    if (abs >= 1_000) return '$' + Math.round(n / 1_000) + 'k';
    return '$' + n;
  },
  int: (n) => new Intl.NumberFormat('es-CO').format(n || 0),
  date: (d) => new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }).format(d instanceof Date ? d : new Date(d)),
  datetime: (d) => new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }).format(d instanceof Date ? d : new Date(d)),
  time: (d) => new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }).format(d instanceof Date ? d : new Date(d)),
};

window.CATEGORIES = [
  { id: 1, name: 'Herramientas eléctricas' },
  { id: 2, name: 'Herramientas manuales' },
  { id: 3, name: 'Tornillería y fijación' },
  { id: 4, name: 'Pinturas y solventes' },
  { id: 5, name: 'Plomería' },
  { id: 6, name: 'Eléctrico' },
  { id: 7, name: 'Construcción' },
  { id: 8, name: 'Seguridad industrial' },
];

window.PAYMENT_METHODS = [
  { id: 1, code: 'EFECTIVO', name: 'Efectivo', hint: 'Caja registradora', icon: 'banknote' },
  { id: 2, code: 'DEBITO', name: 'Débito', hint: 'PSE / datafono', icon: 'credit-card' },
  { id: 3, code: 'CREDITO', name: 'Crédito', hint: 'Datafono', icon: 'credit-card' },
  { id: 4, code: 'TRANSFER', name: 'Transferencia', hint: 'Bancolombia, Nequi', icon: 'arrow-right-left' },
];

window.PRODUCTS = [
  { id: 1,  code: 'FE-001', name: 'Taladro percutor inalámbrico 18V Bosch GSB',  category_id: 1, price: 489900, cost: 322000, stock: 14, min_stock: 5, brand: 'Bosch', unit: 'unidad', active: true,  description: 'Taladro percutor 18V con batería de litio 4Ah, cargador rápido, maletín y juego de brocas.' },
  { id: 2,  code: 'FE-002', name: 'Pulidora angular 4-1/2" 850W',                  category_id: 1, price: 219000, cost: 142500, stock: 8,  min_stock: 4, brand: 'DeWalt', unit: 'unidad', active: true,  description: 'Pulidora angular 850W con disco de corte y empuñadura lateral antivibración.' },
  { id: 3,  code: 'FE-003', name: 'Sierra circular 1400W con guía láser',          category_id: 1, price: 379500, cost: 248000, stock: 3,  min_stock: 4, brand: 'Stanley', unit: 'unidad', active: true,  description: 'Disco 7-1/4", profundidad de corte 65mm, guía láser y base de aluminio.' },
  { id: 4,  code: 'FE-101', name: 'Martillo de uña 16oz mango fibra',              category_id: 2, price: 38900,  cost: 21500,  stock: 42, min_stock: 10, brand: 'Truper', unit: 'unidad', active: true,  description: 'Martillo de uña 16oz con cabeza forjada y mango ergonómico de fibra.' },
  { id: 5,  code: 'FE-102', name: 'Juego de destornilladores 6 piezas',            category_id: 2, price: 54900,  cost: 32000,  stock: 19, min_stock: 8, brand: 'Stanley', unit: 'juego',  active: true,  description: '3 planos, 3 estrella, mango bimaterial antideslizante.' },
  { id: 6,  code: 'FE-103', name: 'Llave inglesa 12" cromada',                     category_id: 2, price: 47500,  cost: 27000,  stock: 24, min_stock: 6, brand: 'Bahco', unit: 'unidad', active: true,  description: 'Llave inglesa 12" con acabado cromo mate y escala precisa.' },
  { id: 7,  code: 'FE-104', name: 'Alicate universal 8" aislado 1000V',            category_id: 2, price: 62900,  cost: 38000,  stock: 16, min_stock: 6, brand: 'Knipex', unit: 'unidad', active: true,  description: 'Mango aislado certificado 1000V, mordazas dentadas y filo de corte.' },
  { id: 8,  code: 'FE-105', name: 'Flexómetro 5m × 19mm con clip',                 category_id: 2, price: 18500,  cost: 9200,   stock: 67, min_stock: 20, brand: 'Stanley', unit: 'unidad', active: true,  description: 'Cinta métrica 5m con freno, clip metálico y caja antichoque.' },
  { id: 9,  code: 'FE-201', name: 'Tornillo autoperforante 8×1" galv. (caja 500)', category_id: 3, price: 29900,  cost: 14500,  stock: 38, min_stock: 12, brand: 'Hilti', unit: 'caja',   active: true,  description: 'Tornillo autoperforante punta broca, cabeza hexagonal con rondana neopreno.' },
  { id: 10, code: 'FE-202', name: 'Tornillo drywall 6×1-1/4" (caja 1000)',         category_id: 3, price: 24500,  cost: 12000,  stock: 22, min_stock: 10, brand: 'Pavco', unit: 'caja',   active: true,  description: 'Tornillo fosfatado para drywall, rosca gruesa y punta aguda.' },
  { id: 11, code: 'FE-203', name: 'Chazo plástico expansivo 1/4" (bolsa 100)',     category_id: 3, price: 8900,   cost: 4200,   stock: 4,  min_stock: 8, brand: 'Fischer', unit: 'bolsa', active: true,  description: 'Chazo plástico universal para muro sólido, expansión cuádruple.' },
  { id: 12, code: 'FE-301', name: 'Pintura acrílica blanca tipo 1 — 5 gal',        category_id: 4, price: 159000, cost: 105000, stock: 11, min_stock: 5, brand: 'Pintuco', unit: 'galón',  active: true,  description: 'Pintura vinilo acrílica blanco tipo 1, alto cubrimiento, lavable.' },
  { id: 13, code: 'FE-302', name: 'Esmalte sintético rojo — 1 gal',                category_id: 4, price: 48500,  cost: 30200,  stock: 9,  min_stock: 4, brand: 'Pintuco', unit: 'galón',  active: true,  description: 'Esmalte sintético rojo señal, secado rápido, alto brillo.' },
  { id: 14, code: 'FE-303', name: 'Rodillo felpa 9" + base',                       category_id: 4, price: 14500,  cost: 7800,   stock: 31, min_stock: 10, brand: 'Toolcraft', unit: 'unidad', active: true,  description: 'Rodillo de felpa 9 pulgadas con base metálica reforzada.' },
  { id: 15, code: 'FE-401', name: 'Tubo PVC sanitario 4" × 6m',                    category_id: 5, price: 89500,  cost: 58000,  stock: 18, min_stock: 6, brand: 'Pavco', unit: 'unidad', active: true,  description: 'Tubo PVC sanitario norma NTC 1087, ideal para desagüe doméstico.' },
  { id: 16, code: 'FE-402', name: 'Llave de paso 1/2" bronce',                     category_id: 5, price: 23900,  cost: 12500,  stock: 27, min_stock: 8, brand: 'Grival', unit: 'unidad', active: true,  description: 'Llave de paso 1/2 pulgada en bronce, manija mariposa.' },
  { id: 17, code: 'FE-501', name: 'Cable encauchetado 3×12 AWG — metro',           category_id: 6, price: 4800,   cost: 2700,   stock: 240, min_stock: 80, brand: 'Centelsa', unit: 'metro',  active: true,  description: 'Cable encauchetado 3×12 AWG, aislamiento PVC certificado RETIE.' },
  { id: 18, code: 'FE-502', name: 'Tomacorriente doble polo a tierra blanco',      category_id: 6, price: 11500,  cost: 6200,   stock: 2,  min_stock: 8, brand: 'Schneider', unit: 'unidad', active: true,  description: 'Tomacorriente doble 15A con polo a tierra, color blanco.' },
  { id: 19, code: 'FE-503', name: 'Bombillo LED 9W luz cálida E27',                category_id: 6, price: 9900,   cost: 5400,   stock: 86, min_stock: 30, brand: 'Sylvania', unit: 'unidad', active: true,  description: 'Bombillo LED 9W equivalente a 60W, luz cálida 3000K.' },
  { id: 20, code: 'FE-601', name: 'Cemento gris 50 kg',                            category_id: 7, price: 39500,  cost: 28000,  stock: 56, min_stock: 20, brand: 'Argos', unit: 'bulto',  active: true,  description: 'Cemento gris portland tipo I, bulto de 50 kg.' },
  { id: 21, code: 'FE-602', name: 'Arena de río — bulto 30 kg',                    category_id: 7, price: 22500,  cost: 14000,  stock: 0,  min_stock: 12, brand: 'Local', unit: 'bulto',  active: true,  description: 'Arena lavada de río, bulto de 30 kg.' },
  { id: 22, code: 'FE-701', name: 'Casco de seguridad clase B amarillo',           category_id: 8, price: 27500,  cost: 16500,  stock: 22, min_stock: 6, brand: '3M', unit: 'unidad', active: true,  description: 'Casco de seguridad clase B con suspensión de 6 puntos, certificación ANSI Z89.1.' },
  { id: 23, code: 'FE-702', name: 'Guante de carnaza tipo ingeniero',              category_id: 8, price: 12900,  cost: 6800,   stock: 48, min_stock: 16, brand: 'Truper', unit: 'par',    active: true,  description: 'Guante de carnaza vacuno con refuerzo, ideal para construcción.' },
  { id: 24, code: 'FE-703', name: 'Gafas seguridad lente claro antiempañante',     category_id: 8, price: 8500,   cost: 4200,   stock: 5,  min_stock: 10, brand: '3M', unit: 'unidad', active: true,  description: 'Gafas de seguridad transparente, tratamiento antiempañante.' },
];

window.CUSTOMERS = [
  { id: 1, name: 'Constructora Andina S.A.S.', document: '900.123.456-7', email: 'compras@andina.co', phone: '+57 310 555 4421' },
  { id: 2, name: 'María Elena González', document: '52.789.123', email: 'maria.gonzalez@correo.co', phone: '+57 320 111 8800' },
  { id: 3, name: 'Carlos Restrepo Ltda.', document: '900.876.543-2', email: 'admin@restrepo.com.co', phone: '+57 314 992 1010' },
  { id: 4, name: 'Diego Acosta', document: '1.020.456.789', email: 'diego.acosta@correo.co', phone: '+57 318 445 6677' },
  { id: 5, name: 'Inversiones El Roble', document: '901.555.222-1', email: 'pagos@elroble.co', phone: '+57 601 444 5566' },
];

// helper: today minus N days at random hour
function _ago(days, hour = 9 + (days % 8)) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, (days * 7) % 60, 0, 0);
  return d.toISOString();
}

window.SALES = [
  {
    id: 1, number: 'V-001847', status: 'COMPLETED', payment_method_id: 2, customer_id: 1,
    employee: 'Laura M.', created_at: _ago(0, 14), total: 689400,
    items: [
      { product_id: 1, qty: 1, unit_price: 489900, total: 489900 },
      { product_id: 12, qty: 1, unit_price: 159000, total: 159000 },
      { product_id: 23, qty: 2, unit_price: 12900, total: 25800 },
      { product_id: 11, qty: 2, unit_price: 7300, total: 14600 },
    ],
  },
  {
    id: 2, number: 'V-001846', status: 'COMPLETED', payment_method_id: 1, customer_id: null,
    employee: 'Andrés P.', created_at: _ago(0, 11), total: 76700,
    items: [
      { product_id: 4, qty: 1, unit_price: 38900, total: 38900 },
      { product_id: 6, qty: 1, unit_price: 47500, total: 47500 },
    ],
  },
  {
    id: 3, number: 'V-001845', status: 'CANCELLED', payment_method_id: 3, customer_id: 2,
    employee: 'Andrés P.', created_at: _ago(1, 10), total: 219000,
    items: [{ product_id: 2, qty: 1, unit_price: 219000, total: 219000 }],
    cancelled_at: _ago(1, 14), cancel_reason: 'Producto presentaba defecto de fábrica.',
  },
  {
    id: 4, number: 'V-001844', status: 'COMPLETED', payment_method_id: 4, customer_id: 3,
    employee: 'Laura M.', created_at: _ago(1, 16), total: 1247500,
    items: [
      { product_id: 20, qty: 25, unit_price: 39500, total: 987500 },
      { product_id: 15, qty: 2, unit_price: 89500, total: 179000 },
      { product_id: 16, qty: 3, unit_price: 23900, total: 71700 },
    ],
  },
  {
    id: 5, number: 'V-001843', status: 'COMPLETED', payment_method_id: 1, customer_id: null,
    employee: 'Laura M.', created_at: _ago(2, 9), total: 38400,
    items: [
      { product_id: 19, qty: 2, unit_price: 9900, total: 19800 },
      { product_id: 5, qty: 1, unit_price: 18600, total: 18600 },
    ],
  },
  {
    id: 6, number: 'V-001842', status: 'COMPLETED', payment_method_id: 2, customer_id: 4,
    employee: 'Andrés P.', created_at: _ago(2, 15), total: 158400,
    items: [
      { product_id: 17, qty: 30, unit_price: 4800, total: 144000 },
      { product_id: 19, qty: 1, unit_price: 9900, total: 9900 },
    ],
  },
  {
    id: 7, number: 'V-001841', status: 'COMPLETED', payment_method_id: 1, customer_id: null,
    employee: 'Andrés P.', created_at: _ago(3, 12), total: 56400,
    items: [
      { product_id: 22, qty: 1, unit_price: 27500, total: 27500 },
      { product_id: 23, qty: 2, unit_price: 12900, total: 25800 },
      { product_id: 24, qty: 1, unit_price: 3100, total: 3100 },
    ],
  },
];

// Dashboard pre-computed (deterministic, no math at render)
window.DASHBOARD = {
  sales_today_total: 766100,
  sales_today_count: 2,
  sales_today_delta_pct: 12.4,
  sales_week_total: 4189300,
  low_stock_count: 4,
  active_customers: 128,
  financial_balance_month: 28473100, // ADMIN only
  financial_balance_delta_pct: 8.2,
  top_products_30d: [
    { product_id: 19, qty: 142, revenue: 1405800 },
    { product_id: 17, qty: 510, revenue: 2448000 },
    { product_id: 4,  qty: 38, revenue: 1478200 },
    { product_id: 9,  qty: 22, revenue: 657800 },
    { product_id: 20, qty: 84, revenue: 3318000 },
  ],
};

// helpers
window.productById = (id) => window.PRODUCTS.find(p => p.id === id);
window.categoryById = (id) => window.CATEGORIES.find(c => c.id === id);
window.customerById = (id) => window.CUSTOMERS.find(c => c.id === id);
window.paymentMethodById = (id) => window.PAYMENT_METHODS.find(m => m.id === id);
window.lowStockProducts = () => window.PRODUCTS.filter(p => p.stock <= p.min_stock);

window.maskDocument = (doc) => doc ? '***' : '';
