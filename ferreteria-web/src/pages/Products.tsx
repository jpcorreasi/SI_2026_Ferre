import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtCOP } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, Product, Category } from '../types/api';

interface FormState {
  id?: number;
  code: string;
  name: string;
  description: string;
  category: string;
  sale_price: string;
  cost_price: string;
  stock: string;
  min_stock: string;
  is_active: boolean;
}

const EMPTY: FormState = {
  code: '', name: '', description: '', category: '',
  sale_price: '', cost_price: '0', stock: '0', min_stock: '5', is_active: true,
};

export function Products() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState('');
  const [modal, setModal] = useState<FormState | null>(null);

  const params = new URLSearchParams({ page: String(page), ordering: 'name' });
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  if (active) params.set('is_active', active);

  const products = useQuery({
    queryKey: ['products', params.toString()],
    queryFn: () => api.get<Paginated<Product>>(`/products/?${params}`),
    placeholderData: keepPreviousData,
  });

  const categories = useQuery({
    queryKey: ['categories-all'],
    queryFn: () => api.get<Paginated<Category>>('/categories/?page_size=200'),
  });

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        code: f.code,
        name: f.name,
        description: f.description,
        category: Number(f.category),
        sale_price: f.sale_price,
        cost_price: f.cost_price || '0',
        stock: Number(f.stock),
        min_stock: Number(f.min_stock),
        is_active: f.is_active,
      };
      return f.id ? api.put(`/products/${f.id}/`, body) : api.post('/products/', body);
    },
    onSuccess: (_d, f) => {
      toast(f.id ? 'Producto actualizado.' : 'Producto creado.');
      setModal(null);
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al guardar.', 'error'),
  });

  function openCreate() { setModal({ ...EMPTY }); }
  function openEdit(p: Product) {
    setModal({
      id: p.id, code: p.code, name: p.name, description: p.description,
      category: String(p.category), sale_price: p.sale_price,
      cost_price: p.cost_price ?? '0', stock: String(p.stock),
      min_stock: String(p.min_stock), is_active: p.is_active,
    });
  }

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Productos</h1>
          <p className="page-sub">Catálogo e inventario</p>
        </div>
        <button className="nbtn nbtn-primary" onClick={openCreate}>
          <Icon name="plus" size={16} /> Nuevo producto
        </button>
      </div>

      <div className="toolbar">
        <div className="input-wrap">
          <Icon name="search" size={16} />
          <input
            placeholder="Buscar por nombre o código…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">Todas las categorías</option>
          {categories.data?.results.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      <div className="table-card">
        {products.isLoading ? (
          <Loading />
        ) : products.isError ? (
          <ErrorState message="No se pudieron cargar los productos." />
        ) : products.data!.results.length === 0 ? (
          <EmptyState message="No hay productos que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th><th>Producto</th><th>Categoría</th>
                <th className="num">Precio</th><th className="num">Stock</th>
                <th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {products.data!.results.map((p) => (
                <tr key={p.id}>
                  <td className="nmono">{p.code}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    {p.supplier_name && (
                      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>{p.supplier_name}</div>
                    )}
                  </td>
                  <td>{p.category_name && <span className="nbadge nbadge-accent">{p.category_name}</span>}</td>
                  <td className="num nmono">{fmtCOP(p.sale_price)}</td>
                  <td className="num nmono">
                    <span className={`nbadge ${p.is_low_stock ? 'nbadge-warning' : 'nbadge-success'}`}>
                      {p.stock}
                    </span>
                  </td>
                  <td>
                    <span className={`nbadge ${p.is_active ? 'nbadge-success' : 'nbadge-danger'}`}>
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="num">
                    {isAdmin && (
                      <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => openEdit(p)}>
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {products.data && (
        <Pagination count={products.data.count} page={page} onPage={setPage} />
      )}

      <Modal
        open={!!modal}
        title={modal?.id ? 'Editar producto' : 'Nuevo producto'}
        onClose={() => setModal(null)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => modal && save.mutate(modal)}>
              {save.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        {modal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Código *</label>
                <input value={modal.code} onChange={(e) => setModal({ ...modal, code: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Nombre *</label>
                <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Categoría *</label>
              <select value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value })}>
                <option value="">Selecciona…</option>
                {categories.data?.results.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Precio venta *</label>
                <input inputMode="decimal" value={modal.sale_price} onChange={(e) => setModal({ ...modal, sale_price: e.target.value })} />
              </div>
              {isAdmin && (
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Precio costo</label>
                  <input inputMode="decimal" value={modal.cost_price} onChange={(e) => setModal({ ...modal, cost_price: e.target.value })} />
                </div>
              )}
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Stock</label>
                <input inputMode="numeric" value={modal.stock} onChange={(e) => setModal({ ...modal, stock: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Stock mínimo</label>
                <input inputMode="numeric" value={modal.min_stock} onChange={(e) => setModal({ ...modal, min_stock: e.target.value })} />
              </div>
            </div>
            <label className="form-check" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <input type="checkbox" checked={modal.is_active} onChange={(e) => setModal({ ...modal, is_active: e.target.checked })} />
              Activo
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
