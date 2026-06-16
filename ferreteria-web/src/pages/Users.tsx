import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, User, Role } from '../types/api';

interface FormState {
  id?: number;
  username: string;
  email: string;
  role: Role;
  is_active: boolean;
  password: string;
}

const EMPTY: FormState = { username: '', email: '', role: 'EMPLEADO', is_active: true, password: '' };

export function Users() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<FormState | null>(null);

  const users = useQuery({
    queryKey: ['users', page],
    queryFn: () => api.get<Paginated<User>>(`/users/?page=${page}`),
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body: Record<string, unknown> = {
        username: f.username, email: f.email, role: f.role, is_active: f.is_active,
      };
      if (f.password) body.password = f.password;
      return f.id ? api.put(`/users/${f.id}/`, body) : api.post('/users/', body);
    },
    onSuccess: (_d, f) => {
      toast(f.id ? 'Usuario actualizado.' : 'Usuario creado.');
      setModal(null);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al guardar.', 'error'),
  });

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Usuarios</h1>
          <p className="page-sub">Cuentas y roles del sistema</p>
        </div>
        <button className="nbtn nbtn-primary" onClick={() => setModal({ ...EMPTY })}>
          <Icon name="plus" size={16} /> Nuevo usuario
        </button>
      </div>

      <div className="table-card">
        {users.isLoading ? (
          <Loading />
        ) : users.isError ? (
          <ErrorState message="No se pudieron cargar los usuarios." />
        ) : users.data!.results.length === 0 ? (
          <EmptyState message="No hay usuarios." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {users.data!.results.map((u) => (
                <tr key={u.id}>
                  <td className="nmono" style={{ fontWeight: 500 }}>{u.username}</td>
                  <td>{u.email || '—'}</td>
                  <td>
                    <span className={`nbadge ${u.role === 'ADMIN' ? 'nbadge-accent' : 'nbadge'}`}>
                      {u.role === 'ADMIN' ? 'Administrador' : 'Empleado'}
                    </span>
                  </td>
                  <td>
                    <span className={`nbadge ${u.is_active ? 'nbadge-success' : 'nbadge-danger'}`}>
                      {u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="num">
                    <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => setModal({
                      id: u.id, username: u.username, email: u.email, role: u.role, is_active: u.is_active, password: '',
                    })}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {users.data && <Pagination count={users.data.count} page={page} onPage={setPage} />}

      <Modal
        open={!!modal}
        title={modal?.id ? 'Editar usuario' : 'Nuevo usuario'}
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
              <label>Usuario *</label>
              <input value={modal.username} autoComplete="off" onChange={(e) => setModal({ ...modal, username: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Rol</label>
                <select value={modal.role} onChange={(e) => setModal({ ...modal, role: e.target.value as Role })}>
                  <option value="EMPLEADO">Empleado</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Contraseña {modal.id ? '(en blanco conserva)' : '*'}</label>
                <input type="password" value={modal.password} autoComplete="new-password" onChange={(e) => setModal({ ...modal, password: e.target.value })} />
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
