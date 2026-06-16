import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { authedDownload } from '../lib/download';
import { fmtCOP, fmtNumber } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Loading, ErrorState } from '../components/ui/States';
import { SalesSummary, FinancialBalance, SalesByPayment } from '../types/api';

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

export function Reports() {
  const { toast } = useToast();

  // Resumen de ventas (rango)
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  // Balance (mes/año)
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(now.getFullYear()));
  // Ventas por pago (periodo)
  const [period, setPeriod] = useState('month');

  const summaryParams = new URLSearchParams();
  if (start) summaryParams.set('start', start);
  if (end) summaryParams.set('end', end);
  const summary = useQuery({
    queryKey: ['rep-summary', summaryParams.toString()],
    queryFn: () => api.get<SalesSummary>(`/reports/sales-summary/?${summaryParams}`),
  });

  const balance = useQuery({
    queryKey: ['rep-balance', month, year],
    queryFn: () => api.get<FinancialBalance>(`/reports/financial-balance/?month=${month}&year=${year}`),
  });

  const sbpParams = `period=${period}`;
  const sbp = useQuery({
    queryKey: ['rep-sbp', period],
    queryFn: () => api.get<SalesByPayment>(`/reports/sales-by-payment/?${sbpParams}`),
  });

  async function exportFile(kind: 'csv' | 'pdf') {
    try {
      await authedDownload(`/reports/sales-by-payment/export-${kind}/?${sbpParams}`, 'download');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="view active">
      <div className="page-head"><h1 className="page-h">Reportes</h1></div>

      {/* Resumen de ventas */}
      <section className="table-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
        <div className="page-head-row" style={{ marginBottom: 'var(--sp-3)' }}>
          <h3>Resumen de ventas</h3>
          <div className="toolbar" style={{ margin: 0 }}>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {summary.isLoading ? (
          <Loading />
        ) : summary.isError ? (
          <ErrorState message="No se pudo cargar el resumen." />
        ) : (
          <div className="kpi-grid">
            <Kpi label="Ingresos" value={fmtCOP(summary.data!.total_revenue)} />
            <Kpi label="Ventas completadas" value={fmtNumber(summary.data!.sale_count)} />
            <Kpi label="Ticket promedio" value={fmtCOP(summary.data!.average_ticket)} />
          </div>
        )}
      </section>

      {/* Balance financiero */}
      <section className="table-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
        <div className="page-head-row" style={{ marginBottom: 'var(--sp-3)' }}>
          <h3>Balance financiero</h3>
          <div className="toolbar" style={{ margin: 0 }}>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input type="number" value={year} style={{ width: 90 }} onChange={(e) => setYear(e.target.value)} />
          </div>
        </div>
        {balance.isLoading ? (
          <Loading />
        ) : balance.isError ? (
          <ErrorState message="No se pudo cargar el balance." />
        ) : (
          <div className="kpi-grid">
            <Kpi label="Ingresos" value={fmtCOP(balance.data!.income)} />
            <Kpi label="Egresos" value={fmtCOP(balance.data!.expense)} />
            <Kpi label="Balance" value={fmtCOP(balance.data!.balance)} />
          </div>
        )}
      </section>

      {/* Ventas por modalidad de pago */}
      <section className="table-card" style={{ padding: 'var(--sp-4)' }}>
        <div className="page-head-row" style={{ marginBottom: 'var(--sp-3)', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
          <h3>Ventas por modalidad de pago</h3>
          <div className="toolbar" style={{ margin: 0 }}>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="today">Hoy</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
            </select>
            <button className="nbtn nbtn-secondary nbtn-sm" onClick={() => exportFile('csv')}>
              <Icon name="download" size={14} /> CSV
            </button>
            <button className="nbtn nbtn-secondary nbtn-sm" onClick={() => exportFile('pdf')}>
              <Icon name="download" size={14} /> PDF
            </button>
          </div>
        </div>
        {sbp.isLoading ? (
          <Loading />
        ) : sbp.isError ? (
          <ErrorState message="No se pudo cargar el reporte." />
        ) : sbp.data!.rows.length === 0 ? (
          <div className="state-block">Sin ventas en el período seleccionado.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Modalidad</th><th className="num">N° ventas</th><th className="num">Total</th><th className="num">%</th></tr>
            </thead>
            <tbody>
              {sbp.data!.rows.map((r) => (
                <tr key={r.payment_method_id ?? r.payment_method_name}>
                  <td>{r.payment_method_name}</td>
                  <td className="num nmono">{fmtNumber(r.sale_count)}</td>
                  <td className="num nmono">{fmtCOP(r.total)}</td>
                  <td className="num nmono">{r.percentage.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ fontWeight: 600 }}>TOTAL</td>
                <td className="num nmono" style={{ fontWeight: 600 }}>{fmtNumber(sbp.data!.total_sales)}</td>
                <td className="num nmono" style={{ fontWeight: 600 }}>{fmtCOP(sbp.data!.grand_total)}</td>
                <td className="num nmono" style={{ fontWeight: 600 }}>100%</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  );
}
