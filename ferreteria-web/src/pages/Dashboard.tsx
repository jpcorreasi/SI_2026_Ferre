import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtCOP, fmtNumber } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Loading, ErrorState } from '../components/ui/States';
import {
  SalesSummary,
  TopProduct,
  LowStockRow,
  FinancialBalance,
} from '../types/api';

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function Dashboard() {
  const { isAdmin, user } = useAuth();

  const summary = useQuery({
    queryKey: ['sales-summary'],
    queryFn: () => api.get<SalesSummary>('/reports/sales-summary/'),
  });
  const top = useQuery({
    queryKey: ['top-products', 5],
    queryFn: () => api.get<TopProduct[]>('/reports/top-products/?limit=5'),
  });
  const low = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => api.get<LowStockRow[]>('/reports/low-stock/'),
  });
  const balance = useQuery({
    queryKey: ['financial-balance'],
    queryFn: () => api.get<FinancialBalance>('/reports/financial-balance/'),
    enabled: isAdmin,
  });

  return (
    <div className="view active">
      <div className="page-head">
        <div>
          <h1 className="page-h">Hola, {user?.full_name || user?.username} 👋</h1>
          <p className="page-sub">Resumen de la operación</p>
        </div>
      </div>

      {summary.isLoading ? (
        <Loading />
      ) : summary.isError ? (
        <ErrorState message="No se pudo cargar el resumen." />
      ) : (
        <div className="kpi-grid">
          <Kpi label="Ingresos (ventas)" value={fmtCOP(summary.data!.total_revenue)} />
          <Kpi label="Ventas completadas" value={fmtNumber(summary.data!.sale_count)} />
          <Kpi label="Ticket promedio" value={fmtCOP(summary.data!.average_ticket)} />
          {isAdmin ? (
            <Kpi
              label="Balance"
              value={balance.data ? fmtCOP(balance.data.balance) : '—'}
              hint={balance.data ? `Ingresos ${fmtCOP(balance.data.income)} · Egresos ${fmtCOP(balance.data.expense)}` : undefined}
            />
          ) : (
            <Kpi label="Productos bajo stock" value={low.data ? fmtNumber(low.data.length) : '—'} />
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--sp-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginTop: 'var(--sp-5)' }}>
        <section className="table-card">
          <div className="table-header"><h3>Productos más vendidos</h3></div>
          {top.isLoading ? (
            <Loading />
          ) : top.data && top.data.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>Producto</th><th className="num">Cant.</th><th className="num">Ingresos</th></tr>
              </thead>
              <tbody>
                {top.data.map((p) => (
                  <tr key={p.product__id}>
                    <td>{p.product__name ?? '—'}</td>
                    <td className="num nmono">{fmtNumber(p.total_quantity)}</td>
                    <td className="num nmono">{fmtCOP(p.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="state-block">Sin datos de ventas.</div>
          )}
        </section>

        <section className="table-card">
          <div className="table-header"><h3>Bajo stock</h3></div>
          {low.isLoading ? (
            <Loading />
          ) : low.data && low.data.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>Código</th><th>Producto</th><th className="num">Stock</th><th className="num">Mín.</th></tr>
              </thead>
              <tbody>
                {low.data.slice(0, 8).map((p) => (
                  <tr key={p.id}>
                    <td className="nmono">{p.code}</td>
                    <td>{p.name}</td>
                    <td className="num nmono">{p.stock}</td>
                    <td className="num nmono">{p.min_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="state-block">Todo el inventario está por encima del mínimo. ✅</div>
          )}
        </section>
      </div>
    </div>
  );
}
