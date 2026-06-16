import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtCOP } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, Employee, DocumentType } from '../types/api';

interface FormState {
  id?: number;
  username: string;
  password: string;
  full_name: string;
  document_type: DocumentType;
  document_number: string;
  position: string;
  hire_date: string;
  base_salary: string;
  phone: string;
  is_active: boolean;
}

const EMPTY: FormState = {
  username: '', password: '', full_name: '', document_type: 'CC', document_number: '',
  position: '', hire_date: new Date().toISOString().slice(0, 10), base_salary: '', phone: '', is_active: true,
};

export function Employees() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<FormState | null>(null);

  const params = new URLSearchParams({ page: String(page), ordering: 'full_name' });
  if (search) params.set('search', search);

  const employees = useQuery({
    queryKey: ['employees', params.toString()],
    queryFn: () => api.get<Paginated<Employee>>(`/employees/?${params}`),
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const base = {
        full_name: f.full_name, document_type: f.document_type, document_number: f.document_number,
        position: f.position, hire_date: f.hire_date, base_salary: f.base_salary,
        phone: f.phone, is_active: f.is_active,
      };
      const creds: Record<string, string> = {};
      if (f.username) creds.username = f.username;
      if (f.password) creds.password = f.password;
      if (f.id) return api.put(`/employees/${f.id}/`, { ...base, ...creds });
      return api.post('/employees/', { ...base, ...creds });
    },
    onSuccess: (_d, f) => {
      toast(f.id ? 'Empleado actualizado.' : 'Empleado creado.');
      setModal(null);
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al guardar.', 'error'),
  });

  function openEdit(e: Employee) {
    setModal({
      id: e.id, username: '', password: '', full_name: e.full_name,
      document_type: (e.document_type ?? 'CC') as DocumentType,
      document_number: e.document_number ?? '', position: e.position ?? '',
      hire_date: e.hire_date ?? '', base_salary: e.base_salary ?? '',
      phone: e.phone ?? '', is_active: e.is_active ?? true,
    });
  }

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Empleados</h1>
          <p className="page-sub">Personal y credenciales</p>
        </div>
        <button className="nbtn nbtn-primary" onClick={() => setModal({ ...EMPTY })}>
          <Icon name="plus" size={16} /> Nuevo empleado
        </button>
      </div>

      <div className="toolbar">
        <div className="input-wrap">
          <Icon name="search" size={16} />
          <input placeholder="Buscar por nombre o cargo…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-card">
        {employees.isLoading ? (
          <Loading />
        ) : employees.isError ? (
          <ErrorState message="No se pudieron cargar los empleados." />
        ) : employees.data!.results.length === 0 ? (
          <EmptyState message="No hay empleados que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Nombre</th><th>Documento</th><th>Cargo</th><th>Usuario</th><th className="num">Salario</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {employees.data!.results.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{e.full_name}</td>
                  <td className="nmono">{e.document_number}</td>
                  <td>{e.position}</td>
                  <td className="nmono">{e.username_display ?? '—'}</td>
                  <td className="num nmono">{fmtCOP(e.base_salary)}</td>
                  <td>
                    <span className={`nbadge ${e.is_active ? 'nbadge-success' : 'nbadge-danger'}`}>
                      {e.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="num">
                    <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => openEdit(e)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {employees.data && <Pagination count={employees.data.count} page={page} onPage={setPage} />}

      <Modal
        open={!!modal}
        title={modal?.id ? 'Editar empleado' : 'Nuevo empleado'}
        onClose={() => setModal(null)}
        large
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
              <label>Nombre completo *</label>
              <input value={modal.full_name} onChange={(e) => setModal({ ...modal, full_name: e.target.value })} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Tipo doc.</label>
                <select value={modal.document_type} onChange={(e) => setModal({ ...modal, document_type: e.target.value as DocumentType })}>
                  <option value="CC">C.C.</option><option value="NIT">NIT</option><option value="CE">C.E.</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Número documento *</label>
                <input value={modal.document_number} onChange={(e) => setModal({ ...modal, document_number: e.target.value })} />
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Cargo *</label>
                <input value={modal.position} onChange={(e) => setModal({ ...modal, position: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Fecha ingreso *</label>
                <input type="date" value={modal.hire_date} onChange={(e) => setModal({ ...modal, hire_date: e.target.value })} />
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Salario base *</label>
                <input inputMode="decimal" value={modal.base_salary} onChange={(e) => setModal({ ...modal, base_salary: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Teléfono</label>
                <input value={modal.phone} onChange={(e) => setModal({ ...modal, phone: e.target.value })} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-3)' }}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
                Credenciales de acceso {modal.id && <span style={{ fontWeight: 400, color: 'var(--fg-muted)' }}>(dejar en blanco para conservar)</span>}
              </div>
              <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Usuario {!modal.id && '*'}</label>
                  <input value={modal.username} autoComplete="off" onChange={(e) => setModal({ ...modal, username: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Contraseña {!modal.id && '*'}</label>
                  <input type="password" value={modal.password} autoComplete="new-password" onChange={(e) => setModal({ ...modal, password: e.target.value })} />
                </div>
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
