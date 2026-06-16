import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtCOP, fmtDateTime } from '../lib/format';
import { authedDownload } from '../lib/download';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, Sale } from '../types/api';

export function Sales() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState<Sale | null>(null);

  const params = new URLSearchParams({ page: String(page), ordering: '-sale_date' });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (from) params.set('date_from', from);
  if (to) params.set('date_to', to);

  const sales = useQuery({
    queryKey: ['sales', params.toString()],
    queryFn: () => api.get<Paginated<Sale>>(`/sales/?${params}`),
    placeholderData: keepPreviousData,
  });

  const cancel = useMutation({
    mutationFn: (id: number) => api.post(`/sales/${id}/cancel/`),
    onSuccess: () => {
      toast('Venta cancelada. Stock restaurado.');
      setDetail(null);
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al cancelar.', 'error'),
  });

  async function downloadInvoice(id: number) {
    try {
      await authedDownload(`/customer-invoices/${id}/pdf/`, 'open');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="view active">
      <div className="page-head"><h1 className="page-h">Ventas</h1></div>

      <div className="toolbar">
        <div className="input-wrap">
          <Icon name="search" size={16} />
          <input
            placeholder="Buscar por cliente o # venta…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="COMPLETED">Completadas</option>
          <option value="CANCELLED">Canceladas</option>
        </select>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </div>

      <div className="table-card">
        {sales.isLoading ? (
          <Loading />
        ) : sales.isError ? (
          <ErrorState message="No se pudieron cargar las ventas." />
        ) : sales.data!.results.length === 0 ? (
          <EmptyState message="No hay ventas que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th><th>Fecha</th><th>Cliente</th><th>Pago</th>
                <th className="num">Total</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sales.data!.results.map((s) => (
                <tr key={s.id}>
                  <td className="nmono">#{s.id}</td>
                  <td>{fmtDateTime(s.sale_date)}</td>
                  <td>{s.customer_name}</td>
                  <td>{s.payment_method_name ?? '—'}</td>
                  <td className="num nmono">{fmtCOP(s.total)}</td>
                  <td>
                    <span className={`nbadge ${s.status === 'COMPLETED' ? 'nbadge-success' : 'nbadge-danger'}`}>
                      {s.status === 'COMPLETED' ? 'Completada' : 'Cancelada'}
                    </span>
                  </td>
                  <td className="num">
                    <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => setDetail(s)}>
                      Ver <Icon name="chevron-right" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sales.data && <Pagination count={sales.data.count} page={page} onPage={setPage} />}

      <Modal
        open={!!detail}
        title={detail ? `Venta #${detail.id}` : ''}
        onClose={() => setDetail(null)}
        large
        footer={
          detail && (
            <>
              {detail.invoice_id && (
                <button className="nbtn nbtn-secondary" onClick={() => downloadInvoice(detail.invoice_id!)}>
                  <Icon name="download" size={16} /> Factura PDF
                </button>
              )}
              {detail.status === 'COMPLETED' && (
                <button className="btn-danger" disabled={cancel.isPending} onClick={() => cancel.mutate(detail.id)}>
                  {cancel.isPending ? 'Cancelando…' : 'Cancelar venta'}
                </button>
              )}
              <button className="btn-secondary" onClick={() => setDetail(null)}>Cerrar</button>
            </>
          )
        }
      >
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--sp-6)', flexWrap: 'wrap', color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>
              <div><strong style={{ color: 'var(--fg)' }}>Cliente:</strong> {detail.customer_name}</div>
              <div><strong style={{ color: 'var(--fg)' }}>Fecha:</strong> {fmtDateTime(detail.sale_date)}</div>
              <div><strong style={{ color: 'var(--fg)' }}>Pago:</strong> {detail.payment_method_name ?? '—'}</div>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>Producto</th><th className="num">Cant.</th><th className="num">Precio</th><th className="num">Subtotal</th></tr>
              </thead>
              <tbody>
                {detail.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.product_name ?? '—'}</td>
                    <td className="num nmono">{it.quantity}</td>
                    <td className="num nmono">{fmtCOP(it.unit_price)}</td>
                    <td className="num nmono">{fmtCOP(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="num" style={{ fontWeight: 600 }}>Total</td>
                  <td className="num nmono" style={{ fontWeight: 600 }}>{fmtCOP(detail.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
