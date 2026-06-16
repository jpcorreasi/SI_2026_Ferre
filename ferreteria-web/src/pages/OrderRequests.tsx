import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, OrderRequest, Supplier, Product } from '../types/api';

interface Line { product: string; quantity_requested: string; notes: string }

export function OrderRequests() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ product: '', quantity_requested: '1', notes: '' }]);
  const [detail, setDetail] = useState<OrderRequest | null>(null);

  const params = new URLSearchParams({ page: String(page) });
  if (supplierFilter) params.set('supplier', supplierFilter);
  if (status) params.set('status', status);

  const requests = useQuery({
    queryKey: ['order-requests', params.toString()],
    queryFn: () => api.get<Paginated<OrderRequest>>(`/order-requests/?${params}`),
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
    mutationFn: () => api.post('/order-requests/', {
      supplier: Number(supplier),
      notes,
      items: lines.filter((l) => l.product).map((l) => ({
        product: Number(l.product), quantity_requested: Number(l.quantity_requested), notes: l.notes,
      })),
    }),
    onSuccess: () => {
      toast('Solicitud creada.');
      setCreateOpen(false); setSupplier(''); setNotes(''); setLines([{ product: '', quantity_requested: '1', notes: '' }]);
      qc.invalidateQueries({ queryKey: ['order-requests'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al crear.', 'error'),
  });
  const review = useMutation({
    mutationFn: (id: number) => api.post(`/order-requests/${id}/mark-reviewed/`),
    onSuccess: () => { toast('Solicitud marcada como revisada.'); setDetail(null); qc.invalidateQueries({ queryKey: ['order-requests'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error.', 'error'),
  });

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const valid = supplier && lines.some((l) => l.product);

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Solicitudes de pedido</h1>
          <p className="page-sub">Solicitudes de reabastecimiento</p>
        </div>
        <button className="nbtn nbtn-primary" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={16} /> Nueva solicitud
        </button>
      </div>

      <div className="toolbar">
        <select value={supplierFilter} onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }}>
          <option value="">Todos los proveedores</option>
          {suppliers.data?.results.map((s) => <option key={s.id} value={s.id}>{s.business_name}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendientes</option>
          <option value="REVIEWED">Revisadas</option>
        </select>
      </div>

      <div className="table-card">
        {requests.isLoading ? (
          <Loading />
        ) : requests.isError ? (
          <ErrorState message="No se pudieron cargar las solicitudes." />
        ) : requests.data!.results.length === 0 ? (
          <EmptyState message="No hay solicitudes que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Proveedor</th><th>Estado</th><th className="num">Ítems</th><th>Creada por</th><th>Fecha</th><th></th></tr>
            </thead>
            <tbody>
              {requests.data!.results.map((r) => (
                <tr key={r.id}>
                  <td className="nmono">#{r.id}</td>
                  <td>{r.supplier_name}</td>
                  <td><span className={`nbadge ${r.status === 'PENDING' ? 'nbadge-warning' : 'nbadge-success'}`}>{r.status === 'PENDING' ? 'Pendiente' : 'Revisada'}</span></td>
                  <td className="num nmono">{r.items.length}</td>
                  <td>{r.created_by_name ?? '—'}</td>
                  <td>{fmtDate(r.created_at)}</td>
                  <td className="num">
                    <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => setDetail(r)}>Ver <Icon name="chevron-right" size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {requests.data && <Pagination count={requests.data.count} page={page} onPage={setPage} />}

      {/* Crear */}
      <Modal open={createOpen} title="Nueva solicitud" onClose={() => setCreateOpen(false)} large
        footer={<>
          <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancelar</button>
          <button className="btn-primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creando…' : 'Crear'}
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
                  {products.data?.results.map((p) => <option key={p.id} value={p.id}>{p.name} (stock {p.stock})</option>)}
                </select>
                <input style={{ width: 80 }} inputMode="numeric" placeholder="Cant." value={l.quantity_requested} onChange={(e) => setLine(i, { quantity_requested: e.target.value })} />
                <input style={{ flex: 1 }} placeholder="Notas (opcional)" value={l.notes} onChange={(e) => setLine(i, { notes: e.target.value })} />
                <button className="icon-btn-bare" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} aria-label="Quitar"><Icon name="trash-2" size={16} /></button>
              </div>
            ))}
            <button className="nbtn nbtn-ghost nbtn-sm" style={{ marginTop: 'var(--sp-2)' }}
              onClick={() => setLines((ls) => [...ls, { product: '', quantity_requested: '1', notes: '' }])}>
              <Icon name="plus" size={14} /> Añadir producto
            </button>
          </div>
          <div className="form-group">
            <label>Notas generales</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Detalle */}
      <Modal open={!!detail} title={detail ? `Solicitud #${detail.id}` : ''} onClose={() => setDetail(null)} large
        footer={detail && (
          <>
            {isAdmin && detail.status === 'PENDING' && (
              <button className="nbtn nbtn-primary" disabled={review.isPending} onClick={() => review.mutate(detail.id)}>
                <Icon name="check" size={16} /> Marcar revisada
              </button>
            )}
            <button className="btn-secondary" onClick={() => setDetail(null)}>Cerrar</button>
          </>
        )}>
        {detail && (
          <table className="data-table">
            <thead><tr><th>Producto</th><th>Código</th><th className="num">Stock actual</th><th className="num">Solicitado</th><th>Notas</th></tr></thead>
            <tbody>
              {detail.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name ?? '—'}</td>
                  <td className="nmono">{it.product_code ?? '—'}</td>
                  <td className="num nmono">{it.current_stock ?? '—'}</td>
                  <td className="num nmono">{it.quantity_requested}</td>
                  <td>{it.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
