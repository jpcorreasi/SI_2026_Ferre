import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, Customer, DocumentType } from '../types/api';

interface FormState {
  id?: number;
  full_name: string;
  document_type: DocumentType;
  document_number: string;
  email: string;
  phone: string;
  address: string;
  is_active: boolean;
}

const EMPTY: FormState = {
  full_name: '', document_type: 'CC', document_number: '',
  email: '', phone: '', address: '', is_active: true,
};

const DOC_LABEL: Record<DocumentType, string> = { CC: 'C.C.', NIT: 'NIT', CE: 'C.E.' };

export function Customers() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [docType, setDocType] = useState('');
  const [modal, setModal] = useState<FormState | null>(null);

  const params = new URLSearchParams({ page: String(page), ordering: 'full_name' });
  if (search) params.set('search', search);
  if (active) params.set('is_active', active);
  if (docType) params.set('document_type', docType);

  const customers = useQuery({
    queryKey: ['customers', params.toString()],
    queryFn: () => api.get<Paginated<Customer>>(`/customers/?${params}`),
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: (f: FormState) => {
      // EMPLEADO: solo puede editar datos de contacto (el backend ignora el resto).
      const adminFields = {
        full_name: f.full_name,
        document_type: f.document_type,
        document_number: f.document_number,
        is_active: f.is_active,
      };
      const body = {
        ...(isAdmin ? adminFields : {}),
        email: f.email,
        phone: f.phone,
        address: f.address,
      };
      if (f.id) return api.patch(`/customers/${f.id}/`, body);
      return api.post('/customers/', { ...adminFields, email: f.email, phone: f.phone, address: f.address });
    },
    onSuccess: (_d, f) => {
      toast(f.id ? 'Cliente actualizado.' : 'Cliente creado.');
      setModal(null);
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al guardar.', 'error'),
  });

  function openEdit(c: Customer) {
    setModal({
      id: c.id, full_name: c.full_name, document_type: c.document_type,
      document_number: c.document_number, email: c.email, phone: c.phone,
      address: c.address, is_active: c.is_active,
    });
  }

  // EMPLEADO solo edita contacto; ADMIN edita/crea todo.
  const restricted = !isAdmin && !!modal?.id;

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Clientes</h1>
          <p className="page-sub">Directorio de clientes</p>
        </div>
        {isAdmin && (
          <button className="nbtn nbtn-primary" onClick={() => setModal({ ...EMPTY })}>
            <Icon name="plus" size={16} /> Nuevo cliente
          </button>
        )}
      </div>

      <div className="toolbar">
        <div className="input-wrap">
          <Icon name="search" size={16} />
          <input
            placeholder="Buscar por nombre o email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select value={docType} onChange={(e) => { setDocType(e.target.value); setPage(1); }}>
          <option value="">Todo documento</option>
          <option value="CC">C.C.</option>
          <option value="NIT">NIT</option>
          <option value="CE">C.E.</option>
        </select>
        <select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      <div className="table-card">
        {customers.isLoading ? (
          <Loading />
        ) : customers.isError ? (
          <ErrorState message="No se pudieron cargar los clientes." />
        ) : customers.data!.results.length === 0 ? (
          <EmptyState message="No hay clientes que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th><th>Documento</th><th>Email</th><th>Teléfono</th>
                <th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {customers.data!.results.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.full_name}</td>
                  <td className="nmono">
                    <span className="nbadge">{DOC_LABEL[c.document_type]}</span> {c.document_number}
                  </td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>
                    <span className={`nbadge ${c.is_active ? 'nbadge-success' : 'nbadge-danger'}`}>
                      {c.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="num">
                    <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => openEdit(c)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {customers.data && <Pagination count={customers.data.count} page={page} onPage={setPage} />}

      <Modal
        open={!!modal}
        title={modal?.id ? 'Editar cliente' : 'Nuevo cliente'}
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
            {restricted && (
              <div className="login-alert login-alert-warning active" style={{ display: 'flex' }}>
                <Icon name="info" size={16} />
                <div className="login-alert-body">Como empleado solo puedes editar los datos de contacto.</div>
              </div>
            )}
            <div className="form-group">
              <label>Nombre completo *</label>
              <input value={modal.full_name} disabled={restricted}
                onChange={(e) => setModal({ ...modal, full_name: e.target.value })} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Tipo doc.</label>
                <select value={modal.document_type} disabled={restricted}
                  onChange={(e) => setModal({ ...modal, document_type: e.target.value as DocumentType })}>
                  <option value="CC">C.C.</option>
                  <option value="NIT">NIT</option>
                  <option value="CE">C.E.</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Número documento *</label>
                <input value={modal.document_number} disabled={restricted}
                  onChange={(e) => setModal({ ...modal, document_number: e.target.value })} />
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Email</label>
                <input type="email" value={modal.email}
                  onChange={(e) => setModal({ ...modal, email: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Teléfono</label>
                <input value={modal.phone}
                  onChange={(e) => setModal({ ...modal, phone: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Dirección</label>
              <input value={modal.address}
                onChange={(e) => setModal({ ...modal, address: e.target.value })} />
            </div>
            {!restricted && (
              <label className="form-check" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <input type="checkbox" checked={modal.is_active}
                  onChange={(e) => setModal({ ...modal, is_active: e.target.checked })} />
                Activo
              </label>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
