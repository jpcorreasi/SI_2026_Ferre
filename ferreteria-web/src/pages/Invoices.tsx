import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { authedDownload } from '../lib/download';
import { fmtCOP, fmtDateTime } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, CustomerInvoice, Sale } from '../types/api';

export function Invoices() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ sale: '', tax: '0', discount: '0', notes: '' });
  const [emailFor, setEmailFor] = useState<CustomerInvoice | null>(null);
  const [recipient, setRecipient] = useState('');

  const params = new URLSearchParams({ page: String(page), ordering: '-issued_at' });
  if (search) params.set('search', search);

  const invoices = useQuery({
    queryKey: ['customer-invoices', params.toString()],
    queryFn: () => api.get<Paginated<CustomerInvoice>>(`/customer-invoices/?${params}`),
    placeholderData: keepPreviousData,
  });

  // Ventas completadas sin factura (para crear).
  const sales = useQuery({
    queryKey: ['sales-uninvoiced'],
    queryFn: () => api.get<Paginated<Sale>>('/sales/?status=COMPLETED&page_size=200&ordering=-sale_date'),
    enabled: createOpen,
  });
  const uninvoiced = sales.data?.results.filter((s) => s.invoice_id == null) ?? [];

  const create = useMutation({
    mutationFn: () =>
      api.post('/customer-invoices/', {
        sale: Number(form.sale),
        tax: form.tax || '0',
        discount: form.discount || '0',
        notes: form.notes,
      }),
    onSuccess: () => {
      toast('Factura generada.');
      setCreateOpen(false);
      setForm({ sale: '', tax: '0', discount: '0', notes: '' });
      qc.invalidateQueries({ queryKey: ['customer-invoices'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al generar la factura.', 'error'),
  });

  const sendEmail = useMutation({
    mutationFn: (id: number) => api.post(`/customer-invoices/${id}/send-email/`, { recipient_email: recipient }),
    onSuccess: () => {
      toast('Factura marcada como enviada.');
      setEmailFor(null);
      setRecipient('');
      qc.invalidateQueries({ queryKey: ['customer-invoices'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al enviar.', 'error'),
  });

  async function downloadPdf(id: number) {
    try {
      await authedDownload(`/customer-invoices/${id}/pdf/`, 'open');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Facturas de cliente</h1>
          <p className="page-sub">Facturación de ventas</p>
        </div>
        <button className="nbtn nbtn-primary" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={16} /> Nueva factura
        </button>
      </div>

      <div className="toolbar">
        <div className="input-wrap">
          <Icon name="search" size={16} />
          <input placeholder="Buscar por número o cliente…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-card">
        {invoices.isLoading ? (
          <Loading />
        ) : invoices.isError ? (
          <ErrorState message="No se pudieron cargar las facturas." />
        ) : invoices.data!.results.length === 0 ? (
          <EmptyState message="No hay facturas que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Número</th><th>Fecha</th><th className="num">Total</th><th>Estado</th><th>Email</th><th></th></tr>
            </thead>
            <tbody>
              {invoices.data!.results.map((inv) => (
                <tr key={inv.id}>
                  <td className="nmono">{inv.invoice_number}</td>
                  <td>{fmtDateTime(inv.issued_at)}</td>
                  <td className="num nmono">{fmtCOP(inv.total)}</td>
                  <td>
                    <span className={`nbadge ${inv.status === 'ISSUED' ? 'nbadge-success' : 'nbadge-danger'}`}>
                      {inv.status === 'ISSUED' ? 'Emitida' : 'Anulada'}
                    </span>
                  </td>
                  <td>
                    {inv.sent_by_email
                      ? <span className="nbadge nbadge-info">Enviada</span>
                      : <span style={{ color: 'var(--fg-subtle)' }}>—</span>}
                  </td>
                  <td className="num">
                    <div style={{ display: 'flex', gap: 'var(--sp-1)', justifyContent: 'flex-end' }}>
                      <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => downloadPdf(inv.id)}>
                        <Icon name="download" size={14} /> PDF
                      </button>
                      {!inv.sent_by_email && (
                        <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => { setEmailFor(inv); setRecipient(''); }}>
                          Enviar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {invoices.data && <Pagination count={invoices.data.count} page={page} onPage={setPage} />}

      {/* Crear factura */}
      <Modal
        open={createOpen}
        title="Nueva factura"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={create.isPending || !form.sale} onClick={() => create.mutate()}>
              {create.isPending ? 'Generando…' : 'Generar factura'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div className="form-group">
            <label>Venta a facturar *</label>
            {sales.isLoading ? (
              <Loading />
            ) : (
              <select value={form.sale} onChange={(e) => setForm({ ...form, sale: e.target.value })}>
                <option value="">Selecciona una venta…</option>
                {uninvoiced.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} · {s.customer_name} · {fmtCOP(s.total)}
                  </option>
                ))}
              </select>
            )}
            {!sales.isLoading && uninvoiced.length === 0 && (
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)', marginTop: 4 }}>
                No hay ventas completadas pendientes de facturar.
              </div>
            )}
          </div>
          <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>IVA</label>
              <input inputMode="decimal" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Descuento</label>
              <input inputMode="decimal" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>Notas</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Enviar por email */}
      <Modal
        open={!!emailFor}
        title={`Enviar factura ${emailFor?.invoice_number ?? ''}`}
        onClose={() => setEmailFor(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEmailFor(null)}>Cancelar</button>
            <button className="btn-primary" disabled={sendEmail.isPending || !recipient} onClick={() => emailFor && sendEmail.mutate(emailFor.id)}>
              {sendEmail.isPending ? 'Enviando…' : 'Enviar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Correo del destinatario *</label>
          <input type="email" placeholder="cliente@ejemplo.com" value={recipient}
            onChange={(e) => setRecipient(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
