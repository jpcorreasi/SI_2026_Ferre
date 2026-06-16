import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtCOP, fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, PurchaseOrder, PurchaseOrderStatus, Supplier, Product } from '../types/api';

const STATUS: Record<PurchaseOrderStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Borrador', cls: 'nbadge-warning' },
  SENT: { label: 'Enviada', cls: 'nbadge-info' },
  RECEIVED: { label: 'Recibida', cls: 'nbadge-success' },
  CANCELLED: { label: 'Cancelada', cls: 'nbadge-danger' },
};

interface Line { product: string; quantity: string; unit_cost: string }

export function PurchaseOrders() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ product: '', quantity: '1', unit_cost: '' }]);
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);

  const orders = useQuery({
    queryKey: ['purchase-orders', page],
    queryFn: () => api.get<Paginated<PurchaseOrder>>(`/purchase-orders/?page=${page}&ordering=-created_at`),
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
    mutationFn: () => api.post('/purchase-orders/', {
      supplier: Number(supplier),
      notes,
      items: lines.filter((l) => l.product).map((l) => ({
        product: Number(l.product), quantity: Number(l.quantity), unit_cost: l.unit_cost,
      })),
    }),
    onSuccess: () => {
      toast('Orden de compra creada.');
      setCreateOpen(false); setSupplier(''); setNotes(''); setLines([{ product: '', quantity: '1', unit_cost: '' }]);
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al crear.', 'error'),
  });

  const receive = useMutation({
    mutationFn: (id: number) => api.post(`/purchase-orders/${id}/receive/`),
    onSuccess: () => { toast('Orden recibida. Stock actualizado.'); setDetail(null); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error.', 'error'),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => api.patch(`/purchase-orders/${id}/`, { status: 'CANCELLED' }),
    onSuccess: () => { toast('Orden cancelada.'); setDetail(null); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error.', 'error'),
  });

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + (Number(l.unit_cost) || 0) * (Number(l.quantity) || 0), 0);
  const valid = supplier && lines.some((l) => l.product && Number(l.unit_cost) > 0);

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Órdenes de compra</h1>
          <p className="page-sub">Pedidos a proveedores</p>
        </div>
        <button className="nbtn nbtn-primary" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={16} /> Nueva orden
        </button>
      </div>

      <div className="table-card">
        {orders.isLoading ? (
          <Loading />
        ) : orders.isError ? (
          <ErrorState message="No se pudieron cargar las órdenes." />
        ) : orders.data!.results.length === 0 ? (
          <EmptyState message="Aún no hay órdenes de compra." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Proveedor</th><th>Estado</th><th className="num">Ítems</th><th>Fecha</th><th></th></tr>
            </thead>
            <tbody>
              {orders.data!.results.map((o) => (
                <tr key={o.id}>
                  <td className="nmono">#{o.id}</td>
                  <td>{o.supplier_name}</td>
                  <td><span className={`nbadge ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span></td>
                  <td className="num nmono">{o.items.length}</td>
                  <td>{fmtDate(o.created_at)}</td>
                  <td className="num">
                    <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => setDetail(o)}>Ver <Icon name="chevron-right" size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {orders.data && <Pagination count={orders.data.count} page={page} onPage={setPage} />}

      {/* Crear orden */}
      <Modal open={createOpen} title="Nueva orden de compra" onClose={() => setCreateOpen(false)} large
        footer={<>
          <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancelar</button>
          <button className="btn-primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creando…' : `Crear · ${fmtCOP(total)}`}
          </button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div className="form-group">
            <label>Proveedor *</label>
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">Selecciona…</option>
              {suppliers.data?.results.map((s) => <option key={s.id} value={s.id}>{s.business_name}</option>)}
            </select>
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
            <button className="nbtn nbtn-ghost nbtn-sm" style={{ marginTop: 'var(--sp-2)' }}
              onClick={() => setLines((ls) => [...ls, { product: '', quantity: '1', unit_cost: '' }])}>
              <Icon name="plus" size={14} /> Añadir producto
            </button>
          </div>
          <div className="form-group">
            <label>Notas</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div style={{ textAlign: 'right', fontWeight: 600 }}>Total: {fmtCOP(total)}</div>
        </div>
      </Modal>

      {/* Detalle */}
      <Modal open={!!detail} title={detail ? `Orden #${detail.id}` : ''} onClose={() => setDetail(null)} large
        footer={detail && (
          <>
            {(detail.status === 'DRAFT' || detail.status === 'SENT') && (
              <>
                <button className="btn-danger" disabled={cancel.isPending} onClick={() => cancel.mutate(detail.id)}>Cancelar orden</button>
                <button className="nbtn nbtn-primary" disabled={receive.isPending} onClick={() => receive.mutate(detail.id)}>
                  <Icon name="check" size={16} /> Recibir
                </button>
              </>
            )}
            <button className="btn-secondary" onClick={() => setDetail(null)}>Cerrar</button>
          </>
        )}>
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--sp-6)', color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>
              <div><strong style={{ color: 'var(--fg)' }}>Proveedor:</strong> {detail.supplier_name}</div>
              <div><strong style={{ color: 'var(--fg)' }}>Estado:</strong> {STATUS[detail.status].label}</div>
            </div>
            <table className="data-table">
              <thead><tr><th>Producto</th><th className="num">Cant.</th><th className="num">Costo unit.</th><th className="num">Subtotal</th></tr></thead>
              <tbody>
                {detail.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.product_name ?? '—'}</td>
                    <td className="num nmono">{it.quantity}</td>
                    <td className="num nmono">{fmtCOP(it.unit_cost)}</td>
                    <td className="num nmono">{fmtCOP(Number(it.unit_cost) * it.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.notes && <div style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>Notas: {detail.notes}</div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
