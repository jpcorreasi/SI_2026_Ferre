export interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

// Estructura de navegación (paridad con el SPA; adminOnly = solo ADMIN).
export const NAV: NavSection[] = [
  {
    title: 'Principal',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: 'home' }],
  },
  {
    title: 'Operación',
    items: [
      { to: '/ventas', label: 'Ventas', icon: 'shopping-cart' },
      { to: '/ventas/nueva', label: 'Nueva venta', icon: 'plus' },
      { to: '/productos', label: 'Productos', icon: 'package' },
      { to: '/servicios', label: 'Servicios', icon: 'wrench' },
      { to: '/clientes', label: 'Clientes', icon: 'users' },
    ],
  },
  {
    title: 'Facturación',
    items: [
      { to: '/facturas', label: 'Facturas de cliente', icon: 'file-text' },
      { to: '/notas-credito', label: 'Notas crédito', icon: 'receipt' },
    ],
  },
  {
    title: 'Compras',
    items: [
      { to: '/proveedores', label: 'Proveedores', icon: 'truck', adminOnly: true },
      { to: '/ordenes-compra', label: 'Órdenes de compra', icon: 'clipboard', adminOnly: true },
      { to: '/solicitudes', label: 'Solicitudes de pedido', icon: 'list' },
      { to: '/facturas-proveedor', label: 'Facturas de proveedor', icon: 'file-text', adminOnly: true },
    ],
  },
  {
    title: 'Personal',
    items: [
      { to: '/empleados', label: 'Empleados', icon: 'briefcase', adminOnly: true },
      { to: '/nominas', label: 'Nóminas', icon: 'wallet', adminOnly: true },
      { to: '/horarios', label: 'Horarios', icon: 'calendar' },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { to: '/caja', label: 'Caja', icon: 'dollar-sign' },
      { to: '/gastos', label: 'Gastos', icon: 'credit-card', adminOnly: true },
      { to: '/transacciones', label: 'Transacciones', icon: 'bar-chart', adminOnly: true },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/reportes', label: 'Reportes', icon: 'bar-chart', adminOnly: true },
      { to: '/auditoria', label: 'Auditoría', icon: 'shield', adminOnly: true },
      { to: '/usuarios', label: 'Usuarios', icon: 'user', adminOnly: true },
    ],
  },
];

/** Título legible por ruta (para el topbar). */
export const TITLES: Record<string, string> = Object.fromEntries(
  NAV.flatMap((s) => s.items.map((i) => [i.to, i.label])),
);
