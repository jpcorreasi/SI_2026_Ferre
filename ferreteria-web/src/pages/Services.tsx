import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtCOP, fmtDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, Service, ServiceType, Customer, Employee } from '../types/api';

interface FormState {
  id?: number;
  service_type: string;
  description: string;
  price: string;
  customer: string;
  performed_by: string;
  service_date: string;
  notes: string;
}

function emptyForm(performedBy: number): FormState {
  return {
    service_type: '', description: '', price: '', customer: '',
    performed_by: String(performedBy),
    service_date: new Date().toISOString().slice(0, 10),
    notes: '',
  };
}

export function Services() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [modal, setModal] = useState<FormState | null>(null);

  const params = new URLSearchParams({ page: String(page), ordering: '-service_date' });
  if (search) params.set('search', search);
  if (type) params.set('service_type', type);
  if (from) params.set('service_date_after', from);
  if (to) params.set('service_date_before', to);

  const services = useQuery({
    queryKey: ['services', params.toString()],
    queryFn: () => api.get<Paginated<Service>>(`/services/?${params}`),
    placeholderData: keepPreviousData,
  });
  const types = useQuery({
    queryKey: ['service-types-all'],
    queryFn: () => api.get<Paginated<ServiceType>>('/service-types/?page_size=200'),
  });
  const clients = useQuery({
    queryKey: ['customers-select'],
    queryFn: () => api.get<Paginated<Customer>>('/customers/?page_size=200&is_active=true&ordering=full_name'),
  });
  const employees = useQuery({
    queryKey: ['employees-select'],
    queryFn: () => api.get<Paginated<Employee>>('/employees/?page_size=200'),
    enabled: isAdmin,
  });

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        service_type: Number(f.service_type),
        description: f.description,
        price: f.price,
        customer: f.customer ? Number(f.customer) : null,
        performed_by: Number(f.performed_by),
        service_date: f.service_date,
        notes: f.notes,
      };
      return f.id ? api.put(`/services/${f.id}/`, body) : api.post('/services/', body);
    },
    onSuccess: (_d, f) => {
      toast(f.id ? 'Servicio actualizado.' : 'Servicio registrado.');
      setModal(null);
      qc.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al guardar.', 'error'),
  });

  function openType(id: string) {
    // Autocompletar precio con el precio por defecto del tipo.
    const t = types.data?.results.find((x) => String(x.id) === id);
    setModal((m) => (m ? { ...m, service_type: id, price: m.price || (t?.default_price ?? '') } : m));
  }

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Servicios</h1>
          <p className="page-sub">Servicios prestados</p>
        </div>
        <button className="nbtn nbtn-primary" onClick={() => setModal(emptyForm(user!.id))}>
          <Icon name="plus" size={16} /> Nuevo servicio
        </button>
      </div>

      <div className="toolbar">
        <div className="input-wrap">
          <Icon name="search" size={16} />
          <input placeholder="Buscar por descripción o cliente…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">Todos los tipos</option>
          {types.data?.results.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </div>

      <div className="table-card">
        {services.isLoading ? (
          <Loading />
        ) : services.isError ? (
          <ErrorState message="No se pudieron cargar los servicios." />
        ) : services.data!.results.length === 0 ? (
          <EmptyState message="No hay servicios que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Cliente</th><th>Realizó</th><th className="num">Precio</th><th></th></tr>
            </thead>
            <tbody>
              {services.data!.results.map((s) => (
                <tr key={s.id}>
                  <td>{fmtDate(s.service_date)}</td>
                  <td>{s.service_type_name && <span className="nbadge nbadge-accent">{s.service_type_name}</span>}</td>
                  <td>{s.description}</td>
                  <td>{s.customer_name ?? '—'}</td>
                  <td>{s.performed_by_name || '—'}</td>
                  <td className="num nmono">{fmtCOP(s.price)}</td>
                  <td className="num">
                    {isAdmin && (
                      <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => setModal({
                        id: s.id, service_type: String(s.service_type), description: s.description,
                        price: s.price, customer: s.customer ? String(s.customer) : '',
                        performed_by: String(s.performed_by), service_date: s.service_date, notes: s.notes,
                      })}>Editar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {services.data && <Pagination count={services.data.count} page={page} onPage={setPage} />}

      <Modal
        open={!!modal}
        title={modal?.id ? 'Editar servicio' : 'Nuevo servicio'}
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
            <div className="form-group">
              <label>Tipo de servicio *</label>
              <select value={modal.service_type} onChange={(e) => openType(e.target.value)}>
                <option value="">Selecciona…</option>
                {types.data?.results.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Descripción *</label>
              <input value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Precio *</label>
                <input inputMode="decimal" value={modal.price} onChange={(e) => setModal({ ...modal, price: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Fecha *</label>
                <input type="date" value={modal.service_date} onChange={(e) => setModal({ ...modal, service_date: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Cliente</label>
              <select value={modal.customer} onChange={(e) => setModal({ ...modal, customer: e.target.value })}>
                <option value="">Sin cliente</option>
                {clients.data?.results.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            {isAdmin && (
              <div className="form-group">
                <label>Realizado por</label>
                <select value={modal.performed_by} onChange={(e) => setModal({ ...modal, performed_by: e.target.value })}>
                  <option value={String(user!.id)}>Yo ({user!.full_name || user!.username})</option>
                  {employees.data?.results.map((emp) => <option key={emp.id} value={emp.user}>{emp.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Notas</label>
              <textarea value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
