import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Sales } from './pages/Sales';
import { NewSale } from './pages/NewSale';
import { Customers } from './pages/Customers';
import { Services } from './pages/Services';
import { Suppliers } from './pages/Suppliers';
import { Reports } from './pages/Reports';
import { Invoices } from './pages/Invoices';
import { Employees } from './pages/Employees';
import { Payrolls } from './pages/Payrolls';
import { CashRegister } from './pages/CashRegister';
import { Expenses } from './pages/Expenses';
import { Transactions } from './pages/Transactions';
import { PurchaseOrders } from './pages/PurchaseOrders';
import { OrderRequests } from './pages/OrderRequests';
import { Placeholder } from './pages/Placeholder';
import { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

// Rutas aún no migradas -> Placeholder (la navegación ya funciona).
const PENDING: [string, string][] = [
  ['notas-credito', 'Notas crédito'],
  ['facturas-proveedor', 'Facturas de proveedor'],
  ['horarios', 'Horarios'],
  ['auditoria', 'Auditoría'],
  ['usuarios', 'Usuarios'],
];

export function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="productos" element={<Products />} />
        <Route path="ventas" element={<Sales />} />
        <Route path="ventas/nueva" element={<NewSale />} />
        <Route path="clientes" element={<Customers />} />
        <Route path="servicios" element={<Services />} />
        <Route path="proveedores" element={<Suppliers />} />
        <Route path="reportes" element={<Reports />} />
        <Route path="facturas" element={<Invoices />} />
        <Route path="empleados" element={<Employees />} />
        <Route path="nominas" element={<Payrolls />} />
        <Route path="caja" element={<CashRegister />} />
        <Route path="gastos" element={<Expenses />} />
        <Route path="transacciones" element={<Transactions />} />
        <Route path="ordenes-compra" element={<PurchaseOrders />} />
        <Route path="solicitudes" element={<OrderRequests />} />
        {PENDING.map(([path, title]) => (
          <Route key={path} path={path} element={<Placeholder title={title} />} />
        ))}
        <Route path="*" element={<Placeholder title="Página no encontrada" />} />
      </Route>
    </Routes>
  );
}
