import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtCOP, fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, Payroll } from '../types/api';

const STATUS: Record<Payroll['status'], { label: string; cls: string }> = {
  DRAFT: { label: 'Borrador', cls: 'nbadge-warning' },
  APPROVED: { label: 'Aprobada', cls: 'nbadge-success' },
  PAID: { label: 'Pagada', cls: 'nbadge-info' },
};

export function Payrolls() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ period_start: '', period_end: '', total_amount: '' });

  const payrolls = useQuery({
    queryKey: ['payrolls', page],
    queryFn: () => api.get<Paginated<Payroll>>(`/payrolls/?page=${page}&ordering=-period_end`),
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: () => api.post('/payrolls/', { ...form, status: 'DRAFT' }),
    onSuccess: () => {
      toast('Nómina creada en borrador.');
      setCreateOpen(false);
      setForm({ period_start: '', period_end: '', total_amount: '' });
      qc.invalidateQueries({ queryKey: ['payrolls'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al crear.', 'error'),
  });

  const approve = useMutation({
    mutationFn: (id: number) => api.post(`/payrolls/${id}/approve/`),
    onSuccess: () => {
      toast('Nómina aprobada. Se registró el egreso.');
      qc.invalidateQueries({ queryKey: ['payrolls'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al aprobar.', 'error'),
  });

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Nóminas</h1>
          <p className="page-sub">Períodos de pago al personal</p>
        </div>
        <button className="nbtn nbtn-primary" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={16} /> Nueva nómina
        </button>
      </div>

      <div className="table-card">
        {payrolls.isLoading ? (
          <Loading />
        ) : payrolls.isError ? (
          <ErrorState message="No se pudieron cargar las nóminas." />
        ) : payrolls.data!.results.length === 0 ? (
          <EmptyState message="Aún no hay nóminas." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Período</th><th>Estado</th><th className="num">Total</th><th>Creada</th><th></th></tr>
            </thead>
            <tbody>
              {payrolls.data!.results.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.period_start)} — {fmtDate(p.period_end)}</td>
                  <td><span className={`nbadge ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span></td>
                  <td className="num nmono">{fmtCOP(p.total_amount)}</td>
                  <td>{fmtDate(p.created_at)}</td>
                  <td className="num">
                    {p.status === 'DRAFT' && (
                      <button className="nbtn nbtn-primary nbtn-sm" disabled={approve.isPending}
                        onClick={() => approve.mutate(p.id)}>
                        <Icon name="check" size={14} /> Aprobar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {payrolls.data && <Pagination count={payrolls.data.count} page={page} onPage={setPage} />}

      <Modal
        open={createOpen}
        title="Nueva nómina"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button className="btn-primary"
              disabled={create.isPending || !form.period_start || !form.period_end || !form.total_amount}
              onClick={() => create.mutate()}>
              {create.isPending ? 'Creando…' : 'Crear'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Inicio del período *</label>
              <input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Fin del período *</label>
              <input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>Monto total *</label>
            <input inputMode="decimal" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>
            Se crea en estado <strong>borrador</strong>. Al aprobarla se registra el egreso en finanzas.
          </div>
        </div>
      </Modal>
    </div>
  );
}
