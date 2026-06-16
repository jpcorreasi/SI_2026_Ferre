import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, Supplier } from '../types/api';

interface FormState {
  id?: number;
  business_name: string;
  nit: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
}

const EMPTY: FormState = {
  business_name: '', nit: '', contact_name: '', phone: '', email: '', address: '', is_active: true,
};

export function Suppliers() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<FormState | null>(null);

  const params = new URLSearchParams({ page: String(page), ordering: 'business_name' });
  if (search) params.set('search', search);

  const suppliers = useQuery({
    queryKey: ['suppliers', params.toString()],
    queryFn: () => api.get<Paginated<Supplier>>(`/suppliers/?${params}`),
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        business_name: f.business_name, nit: f.nit, contact_name: f.contact_name,
        phone: f.phone, email: f.email, address: f.address, is_active: f.is_active,
      };
      return f.id ? api.put(`/suppliers/${f.id}/`, body) : api.post('/suppliers/', body);
    },
    onSuccess: (_d, f) => {
      toast(f.id ? 'Proveedor actualizado.' : 'Proveedor creado.');
      setModal(null);
      qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al guardar.', 'error'),
  });

  function openEdit(s: Supplier) {
    setModal({
      id: s.id, business_name: s.business_name, nit: s.nit, contact_name: s.contact_name,
      phone: s.phone, email: s.email, address: s.address, is_active: s.is_active,
    });
  }

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Proveedores</h1>
          <p className="page-sub">Directorio de proveedores</p>
        </div>
        <button className="nbtn nbtn-primary" onClick={() => setModal({ ...EMPTY })}>
          <Icon name="plus" size={16} /> Nuevo proveedor
        </button>
      </div>

      <div className="toolbar">
        <div className="input-wrap">
          <Icon name="search" size={16} />
          <input placeholder="Buscar por razón social, contacto o email…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-card">
        {suppliers.isLoading ? (
          <Loading />
        ) : suppliers.isError ? (
          <ErrorState message="No se pudieron cargar los proveedores." />
        ) : suppliers.data!.results.length === 0 ? (
          <EmptyState message="No hay proveedores que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Razón social</th><th>NIT</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {suppliers.data!.results.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.business_name}</td>
                  <td className="nmono">{s.nit}</td>
                  <td>{s.contact_name || '—'}</td>
                  <td>{s.phone || '—'}</td>
                  <td>{s.email || '—'}</td>
                  <td>
                    <span className={`nbadge ${s.is_active ? 'nbadge-success' : 'nbadge-danger'}`}>
                      {s.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="num">
                    <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => openEdit(s)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {suppliers.data && <Pagination count={suppliers.data.count} page={page} onPage={setPage} />}

      <Modal
        open={!!modal}
        title={modal?.id ? 'Editar proveedor' : 'Nuevo proveedor'}
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
              <div className="form-group" style={{ flex: 2 }}>
                <label>Razón social *</label>
                <input value={modal.business_name} onChange={(e) => setModal({ ...modal, business_name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>NIT *</label>
                <input value={modal.nit} onChange={(e) => setModal({ ...modal, nit: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Nombre de contacto</label>
              <input value={modal.contact_name} onChange={(e) => setModal({ ...modal, contact_name: e.target.value })} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Teléfono</label>
                <input value={modal.phone} onChange={(e) => setModal({ ...modal, phone: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Email</label>
                <input type="email" value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Dirección</label>
              <input value={modal.address} onChange={(e) => setModal({ ...modal, address: e.target.value })} />
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
