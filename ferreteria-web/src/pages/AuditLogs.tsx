import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, AuditLog, AuditAction } from '../types/api';

const ACTION: Record<AuditAction, { label: string; cls: string }> = {
  CREATE: { label: 'Creación', cls: 'nbadge-success' },
  UPDATE: { label: 'Actualización', cls: 'nbadge-info' },
  DELETE: { label: 'Eliminación', cls: 'nbadge-danger' },
  VIEW: { label: 'Consulta', cls: 'nbadge' },
};

export function AuditLogs() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [model, setModel] = useState('');
  const [username, setUsername] = useState('');
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const params = new URLSearchParams({ page: String(page) });
  if (action) params.set('action', action);
  if (model) params.set('model_name', model);
  if (username) params.set('username', username);

  const logs = useQuery({
    queryKey: ['audit-logs', params.toString()],
    queryFn: () => api.get<Paginated<AuditLog>>(`/audit-logs/?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="view active">
      <div className="page-head">
        <h1 className="page-h">Auditoría</h1>
        <p className="page-sub">Registro de actividad del sistema</p>
      </div>

      <div className="toolbar">
        <div className="input-wrap">
          <Icon name="search" size={16} />
          <input placeholder="Usuario…" value={username}
            onChange={(e) => { setUsername(e.target.value); setPage(1); }} />
        </div>
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input placeholder="Modelo (ej. sale)" value={model}
          onChange={(e) => { setModel(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)', background: 'var(--surface)', color: 'var(--fg)', fontSize: 'var(--fs-sm)' }} />
      </div>

      <div className="table-card">
        {logs.isLoading ? (
          <Loading />
        ) : logs.isError ? (
          <ErrorState message="No se pudo cargar la auditoría." />
        ) : logs.data!.results.length === 0 ? (
          <EmptyState message="No hay registros que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Objeto</th><th>IP</th><th></th></tr>
            </thead>
            <tbody>
              {logs.data!.results.map((l) => (
                <tr key={l.id}>
                  <td>{fmtDateTime(l.timestamp)}</td>
                  <td>{l.username}</td>
                  <td><span className={`nbadge ${ACTION[l.action].cls}`}>{ACTION[l.action].label}</span></td>
                  <td>
                    <div>{l.object_repr}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>{l.app_label}.{l.model_name} #{l.object_id}</div>
                  </td>
                  <td className="nmono" style={{ fontSize: 'var(--fs-xs)' }}>{l.ip_address ?? '—'}</td>
                  <td className="num">
                    {l.changed_fields && (
                      <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => setDetail(l)}>Cambios</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {logs.data && <Pagination count={logs.data.count} page={page} onPage={setPage} />}

      <Modal open={!!detail} title={detail ? `Cambios · ${detail.object_repr}` : ''} onClose={() => setDetail(null)} large>
        {detail?.changed_fields && (
          <table className="data-table">
            <thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
            <tbody>
              {Object.entries(detail.changed_fields).map(([field, diff]) => (
                <tr key={field}>
                  <td className="nmono">{field}</td>
                  <td style={{ color: 'var(--danger)' }}>{String(diff.old)}</td>
                  <td style={{ color: 'var(--success)' }}>{String(diff.new)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
