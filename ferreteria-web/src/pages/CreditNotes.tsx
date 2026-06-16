import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { authedDownload } from '../lib/download';
import { fmtCOP, fmtDateTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, CreditNote, Sale } from '../types/api';

export function CreditNotes() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saleId, setSaleId] = useState('');
  const [reason, setReason] = useState('');
  const [returns, setReturns] = useState<Record<number, number>>({});

  const params = new URLSearchParams({ page: String(page), ordering: '-issued_at' });
  if (status) params.set('status', status);

  const notes = useQuery({
    queryKey: ['credit-notes', params.toString()],
    queryFn: () => api.get<Paginated<CreditNote>>(`/credit-notes/?${params}`),
    placeholderData: keepPreviousData,
  });
  const sales = useQuery({
    queryKey: ['sales-completed'],
    queryFn: () => api.get<Paginated<Sale>>('/sales/?status=COMPLETED&page_size=200&ordering=-sale_date'),
    enabled: createOpen,
  });

  const selectedSale = useMemo(
    () => sales.data?.results.find((s) => String(s.id) === saleId),
    [sales.data, saleId],
  );

  const create = useMutation({
    mutationFn: () => api.post('/credit-notes/', {
      sale: Number(saleId),
      reason,
      items: Object.entries(returns)
        .filter(([, q]) => q > 0)
        .map(([saleItem, q]) => ({ sale_item: Number(saleItem), quantity_returned: q })),
    }),
    onSuccess: () => {
      toast('Nota crédito generada. Stock restaurado.');
      setCreateOpen(false); setSaleId(''); setReason(''); setReturns({});
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al generar.', 'error'),
  });

  async function downloadPdf(id: number) {
    try { await authedDownload(`/credit-notes/${id}/pdf/`, 'open'); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  const hasReturns = Object.values(returns).some((q) => q > 0);

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Notas crédito</h1>
          <p className="page-sub">Devoluciones sobre ventas</p>
        </div>
        {isAdmin && (
          <button className="nbtn nbtn-primary" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={16} /> Nueva nota crédito
          </button>
        )}
      </div>

      <div className="toolbar">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="ISSUED">Emitidas</option>
          <option value="CANCELLED">Anuladas</option>
        </select>
      </div>

      <div className="table-card">
        {notes.isLoading ? (
          <Loading />
        ) : notes.isError ? (
          <ErrorState message="No se pudieron cargar las notas crédito." />
        ) : notes.data!.results.length === 0 ? (
          <EmptyState message="No hay notas crédito que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Número</th><th>Venta</th><th>Fecha</th><th>Motivo</th><th className="num">Reembolso</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {notes.data!.results.map((n) => (
                <tr key={n.id}>
                  <td className="nmono">{n.credit_note_number}</td>
                  <td className="nmono">#{n.sale}</td>
                  <td>{fmtDateTime(n.issued_at)}</td>
                  <td>{n.reason}</td>
                  <td className="num nmono">{fmtCOP(n.total_refund)}</td>
                  <td><span className={`nbadge ${n.status === 'ISSUED' ? 'nbadge-success' : 'nbadge-danger'}`}>{n.status === 'ISSUED' ? 'Emitida' : 'Anulada'}</span></td>
                  <td className="num">
                    <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => downloadPdf(n.id)}>
                      <Icon name="download" size={14} /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {notes.data && <Pagination count={notes.data.count} page={page} onPage={setPage} />}

      {/* Crear */}
      <Modal open={createOpen} title="Nueva nota crédito" onClose={() => setCreateOpen(false)} large
        footer={<>
          <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancelar</button>
          <button className="btn-primary" disabled={!saleId || !reason || !hasReturns || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Generando…' : 'Generar'}
          </button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div className="form-group">
            <label>Venta *</label>
            {sales.isLoading ? <Loading /> : (
              <select value={saleId} onChange={(e) => { setSaleId(e.target.value); setReturns({}); }}>
                <option value="">Selecciona una venta…</option>
                {sales.data?.results.map((s) => (
                  <option key={s.id} value={s.id}>#{s.id} · {s.customer_name} · {fmtCOP(s.total)}</option>
                ))}
              </select>
            )}
          </div>

          {selectedSale && (
            <div>
              <label style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>Productos a devolver</label>
              <table className="data-table" style={{ marginTop: 'var(--sp-2)' }}>
                <thead><tr><th>Producto</th><th className="num">Vendido</th><th className="num">Devolver</th></tr></thead>
                <tbody>
                  {selectedSale.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.product_name ?? '—'}</td>
                      <td className="num nmono">{it.quantity}</td>
                      <td className="num">
                        <input type="number" min={0} max={it.quantity} value={returns[it.id] ?? 0}
                          onChange={(e) => setReturns((r) => ({ ...r, [it.id]: Math.max(0, Math.min(Number(e.target.value), it.quantity)) }))}
                          style={{ width: 70, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--fg)', textAlign: 'right' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="form-group">
            <label>Motivo de la devolución *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Producto defectuoso…" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
