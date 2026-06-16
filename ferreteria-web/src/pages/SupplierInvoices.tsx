import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtCOP, fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, SupplierInvoice, Supplier, Product } from '../types/api';

interface Line { product: string; quantity: string; unit_cost: string }

export function SupplierInvoices() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [payStatus, setPayStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ supplier: '', number: '', received_at: new Date().toISOString().slice(0, 10), payment_status: 'PENDING', tax: '0' });
  const [lines, setLines] = useState<Line[]>([{ product: '', quantity: '1', unit_cost: '' }]);
  const [detail, setDetail] = useState<SupplierInvoice | null>(null);

  const params = new URLSearchParams({ page: String(page), ordering: '-received_at' });
  if (payStatus) params.set('payment_status', payStatus);

  const invoices = useQuery({
    queryKey: ['supplier-invoices', params.toString()],
    queryFn: () => api.get<Paginated<SupplierInvoice>>(`/supplier-invoices/?${params}`),
    placeholderData: keepPreviousData,
  });
  const suppliers = useQuery({
    queryKey: ['suppliers-select'],
    queryFn: () => api.get<Paginated<Supplier>>('/suppliers/?page_size=200&is_active=true&ordering=business_name'),
  });
  const products = useQuery({
    queryKey: ['products-select'],
    queryFn: () => api.get<Paginated<Product>>('/products/?page_size=300&ordering=name'),
    enabled: createOpen,
  });

  const create = useMutation({
    mutationFn: () => api.post('/supplier-invoices/', {
      supplier_invoice_number: form.number,
      supplier: Number(form.supplier),
      received_at: form.received_at,
      payment_status: form.payment_status,
      tax: form.tax || '0',
      items: lines.filter((l) => l.product).map((l) => ({ product: Number(l.product), quantity: Number(l.quantity), unit_cost: l.unit_cost })),
    }),
    onSuccess: () => {
      toast('Factura de proveedor registrada. Stock actualizado.');
      setCreateOpen(false);
      setForm({ supplier: '', number: '', received_at: new Date().toISOString().slice(0, 10), payment_status: 'PENDING', tax: '0' });
      setLines([{ product: '', quantity: '1', unit_cost: '' }]);
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al registrar.', 'error'),
  });

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const subtotal = lines.reduce((a, l) => a + (Number(l.unit_cost) || 0) * (Number(l.quantity) || 0), 0);
  const total = subtotal + (Number(form.tax) || 0);
  const valid = form.supplier && form.number && lines.some((l) => l.product && Number(l.unit_cost) > 0);

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Facturas de proveedor</h1>
          <p className="page-sub">Compras y entrada de inventario</p>
        </div>
        <button className="nbtn nbtn-primary" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={16} /> Nueva factura
        </button>
      </div>

      <div className="toolbar">
        <select value={payStatus} onChange={(e) => { setPayStatus(e.target.value); setPage(1); }}>
          <option value="">Todos los pagos</option>
          <option value="PENDING">Pendientes</option>
          <option value="PAID">Pagadas</option>
        </select>
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
              <tr><th>Número</th><th>Proveedor</th><th>Recibida</th><th>Pago</th><th className="num">Total</th><th></th></tr>
            </thead>
            <tbody>
              {invoices.data!.results.map((inv) => (
                <tr key={inv.id}>
                  <td className="nmono">{inv.supplier_invoice_number}</td>
                  <td>{inv.supplier_name}</td>
                  <td>{fmtDate(inv.received_at)}</td>
                  <td><span className={`nbadge ${inv.payment_status === 'PAID' ? 'nbadge-success' : 'nbadge-warning'}`}>{inv.payment_status === 'PAID' ? 'Pagada' : 'Pendiente'}</span></td>
                  <td className="num nmono">{fmtCOP(inv.total)}</td>
                  <td className="num"><button className="nbtn nbtn-ghost nbtn-sm" onClick={() => setDetail(inv)}>Ver <Icon name="chevron-right" size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {invoices.data && <Pagination count={invoices.data.count} page={page} onPage={setPage} />}

      {/* Crear */}
      <Modal open={createOpen} title="Nueva factura de proveedor" onClose={() => setCreateOpen(false)} large
        footer={<>
          <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancelar</button>
          <button className="btn-primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Registrando…' : `Registrar · ${fmtCOP(total)}`}
          </button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Proveedor *</label>
              <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}>
                <option value="">Selecciona…</option>
                {suppliers.data?.results.map((s) => <option key={s.id} value={s.id}>{s.business_name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>N° factura *</label>
              <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
            </div>
          </div>
          <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Fecha recepción *</label>
              <input type="date" value={form.received_at} onChange={(e) => setForm({ ...form, received_at: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Estado de pago</label>
              <select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })}>
                <option value="PENDING">Pendiente</option>
                <option value="PAID">Pagada</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>IVA</label>
              <input inputMode="decimal" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>Productos *</label>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', alignItems: 'center' }}>
                <select style={{ flex: 2 }} value={l.product} onChange={(e) => setLine(i, { product: e.target.value })}>
                  <option value="">Producto…</option>
                  {products.data?.results.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input style={{ width: 70 }} inputMode="numeric" placeholder="Cant." value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <input style={{ width: 110 }} inputMode="decimal" placeholder="Costo unit." value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} />
                <button className="icon-btn-bare" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} aria-label="Quitar"><Icon name="trash-2" size={16} /></button>
              </div>
            ))}
            <button className="nbtn nbtn-ghost nbtn-sm" style={{ marginTop: 'var(--sp-2)' }} onClick={() => setLines((ls) => [...ls, { product: '', quantity: '1', unit_cost: '' }])}>
              <Icon name="plus" size={14} /> Añadir producto
            </button>
          </div>
          <div style={{ textAlign: 'right', fontWeight: 600 }}>
            Subtotal {fmtCOP(subtotal)} · IVA {fmtCOP(Number(form.tax) || 0)} · <strong>Total {fmtCOP(total)}</strong>
          </div>
        </div>
      </Modal>

      {/* Detalle */}
      <Modal open={!!detail} title={detail ? detail.supplier_invoice_number : ''} onClose={() => setDetail(null)} large>
        {detail && (
          <table className="data-table">
            <thead><tr><th>Producto</th><th className="num">Cant.</th><th className="num">Costo unit.</th><th className="num">Subtotal</th></tr></thead>
            <tbody>
              {detail.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name ?? '—'}</td>
                  <td className="num nmono">{it.quantity}</td>
                  <td className="num nmono">{fmtCOP(it.unit_cost)}</td>
                  <td className="num nmono">{fmtCOP(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3} className="num" style={{ fontWeight: 600 }}>Total (con IVA {fmtCOP(detail.tax)})</td><td className="num nmono" style={{ fontWeight: 600 }}>{fmtCOP(detail.total)}</td></tr></tfoot>
          </table>
        )}
      </Modal>
    </div>
  );
}
