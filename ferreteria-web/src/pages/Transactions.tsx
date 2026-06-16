import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtCOP, fmtDate } from '../lib/format';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, Transaction, ReferenceType } from '../types/api';

const REF_LABEL: Record<ReferenceType, string> = {
  SALE: 'Venta',
  SUPPLIER_INVOICE: 'Factura proveedor',
  PAYROLL: 'Nómina',
  CREDIT_NOTE: 'Nota crédito',
  WITHDRAWAL: 'Retiro de caja',
  EXPENSE: 'Gasto',
  SERVICE: 'Servicio',
  OTHER: 'Otro',
};

export function Transactions() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [ref, setRef] = useState('');

  const params = new URLSearchParams({ page: String(page) });
  if (type) params.set('type', type);
  if (ref) params.set('reference_type', ref);

  const txs = useQuery({
    queryKey: ['transactions', params.toString()],
    queryFn: () => api.get<Paginated<Transaction>>(`/transactions/?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="view active">
      <div className="page-head">
        <h1 className="page-h">Transacciones</h1>
        <p className="page-sub">Libro contable (ingresos y egresos)</p>
      </div>

      <div className="toolbar">
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">Todos los tipos</option>
          <option value="INCOME">Ingresos</option>
          <option value="EXPENSE">Egresos</option>
        </select>
        <select value={ref} onChange={(e) => { setRef(e.target.value); setPage(1); }}>
          <option value="">Todo origen</option>
          {Object.entries(REF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="table-card">
        {txs.isLoading ? (
          <Loading />
        ) : txs.isError ? (
          <ErrorState message="No se pudieron cargar las transacciones." />
        ) : txs.data!.results.length === 0 ? (
          <EmptyState message="No hay transacciones que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Origen</th><th className="num">Monto</th></tr>
            </thead>
            <tbody>
              {txs.data!.results.map((t) => {
                const income = t.type === 'INCOME';
                return (
                  <tr key={t.id}>
                    <td>{fmtDate(t.transaction_date)}</td>
                    <td>
                      <span className={`nbadge ${income ? 'nbadge-success' : 'nbadge-danger'}`}>
                        {income ? 'Ingreso' : 'Egreso'}
                      </span>
                    </td>
                    <td>{t.concept}</td>
                    <td><span className="nbadge">{REF_LABEL[t.reference_type]}</span></td>
                    <td className="num nmono" style={{ color: income ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {income ? '+' : '−'}{fmtCOP(t.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {txs.data && <Pagination count={txs.data.count} page={page} onPage={setPage} />}
    </div>
  );
}
