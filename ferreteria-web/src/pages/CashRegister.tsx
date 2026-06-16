import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtCOP, fmtDateTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, CashRegister as Reg, CashBalance } from '../types/api';

export function CashRegister() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [openModal, setOpenModal] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closeModal, setCloseModal] = useState<Reg | null>(null);
  const [closingAmount, setClosingAmount] = useState('');
  const [wdModal, setWdModal] = useState<Reg | null>(null);
  const [wd, setWd] = useState({ amount: '', concept: '' });

  const registers = useQuery({
    queryKey: ['cash-registers', page],
    queryFn: () => api.get<Paginated<Reg>>(`/cash-registers/?page=${page}&ordering=-opened_at`),
    placeholderData: keepPreviousData,
  });

  const open = registers.data?.results.find((r) => r.status === 'OPEN');

  const balance = useQuery({
    queryKey: ['cash-balance', open?.id],
    queryFn: () => api.get<CashBalance>(`/cash-registers/${open!.id}/balance/`),
    enabled: !!open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cash-registers'] });
    qc.invalidateQueries({ queryKey: ['cash-balance'] });
  };

  const openReg = useMutation({
    mutationFn: () => api.post('/cash-registers/', { opening_amount: openingAmount }),
    onSuccess: () => { toast('Caja abierta.'); setOpenModal(false); setOpeningAmount(''); invalidate(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error.', 'error'),
  });
  const closeReg = useMutation({
    mutationFn: (id: number) => api.post(`/cash-registers/${id}/close/`, { closing_amount: closingAmount }),
    onSuccess: () => { toast('Caja cerrada.'); setCloseModal(null); setClosingAmount(''); invalidate(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error.', 'error'),
  });
  const withdraw = useMutation({
    mutationFn: (id: number) => api.post(`/cash-registers/${id}/withdraw/`, wd),
    onSuccess: (r: any) => { toast(`Retiro registrado. Saldo: ${fmtCOP(r?.new_balance)}`); setWdModal(null); setWd({ amount: '', concept: '' }); invalidate(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error.', 'error'),
  });

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Caja</h1>
          <p className="page-sub">Apertura, retiros y cierre</p>
        </div>
        {!open && (
          <button className="nbtn nbtn-primary" onClick={() => setOpenModal(true)}>
            <Icon name="plus" size={16} /> Abrir caja
          </button>
        )}
      </div>

      {/* Caja abierta */}
      {open && (
        <section className="table-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
          <div className="page-head-row" style={{ marginBottom: 'var(--sp-3)' }}>
            <h3>Caja abierta · #{open.id}</h3>
            <span className="nbadge nbadge-success">Abierta desde {fmtDateTime(open.opened_at)}</span>
          </div>
          {balance.isLoading ? (
            <Loading />
          ) : balance.data ? (
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-label">Apertura</div><div className="kpi-value">{fmtCOP(balance.data.opening_amount)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Ingresos</div><div className="kpi-value">{fmtCOP(balance.data.income)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Egresos</div><div className="kpi-value">{fmtCOP(balance.data.expense)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Saldo</div><div className="kpi-value">{fmtCOP(balance.data.balance)}</div></div>
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
            {isAdmin && (
              <button className="nbtn nbtn-secondary" onClick={() => setWdModal(open)}>
                <Icon name="minus" size={16} /> Retirar
              </button>
            )}
            <button className="nbtn nbtn-danger" onClick={() => setCloseModal(open)}>
              Cerrar caja
            </button>
          </div>
        </section>
      )}

      {/* Historial */}
      <h3 style={{ marginBottom: 'var(--sp-2)' }}>Historial</h3>
      <div className="table-card">
        {registers.isLoading ? (
          <Loading />
        ) : registers.isError ? (
          <ErrorState message="No se pudo cargar el historial." />
        ) : registers.data!.results.length === 0 ? (
          <EmptyState message="Aún no hay cajas registradas." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Apertura</th><th>Cierre</th><th className="num">Inicial</th><th className="num">Esperado</th><th className="num">Diferencia</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {registers.data!.results.map((r) => (
                <tr key={r.id}>
                  <td className="nmono">#{r.id}</td>
                  <td>{fmtDateTime(r.opened_at)}</td>
                  <td>{r.closed_at ? fmtDateTime(r.closed_at) : '—'}</td>
                  <td className="num nmono">{fmtCOP(r.opening_amount)}</td>
                  <td className="num nmono">{r.expected_amount != null ? fmtCOP(r.expected_amount) : '—'}</td>
                  <td className="num nmono" style={{ color: r.difference && Number(r.difference) < 0 ? 'var(--danger)' : undefined }}>
                    {r.difference != null ? fmtCOP(r.difference) : '—'}
                  </td>
                  <td>
                    <span className={`nbadge ${r.status === 'OPEN' ? 'nbadge-success' : 'nbadge'}`}>
                      {r.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {registers.data && <Pagination count={registers.data.count} page={page} onPage={setPage} />}

      {/* Abrir */}
      <Modal open={openModal} title="Abrir caja" onClose={() => setOpenModal(false)}
        footer={<>
          <button className="btn-secondary" onClick={() => setOpenModal(false)}>Cancelar</button>
          <button className="btn-primary" disabled={!openingAmount || openReg.isPending} onClick={() => openReg.mutate()}>
            {openReg.isPending ? 'Abriendo…' : 'Abrir'}
          </button>
        </>}>
        <div className="form-group">
          <label>Monto de apertura *</label>
          <input inputMode="decimal" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} autoFocus />
        </div>
      </Modal>

      {/* Cerrar */}
      <Modal open={!!closeModal} title={`Cerrar caja #${closeModal?.id ?? ''}`} onClose={() => setCloseModal(null)}
        footer={<>
          <button className="btn-secondary" onClick={() => setCloseModal(null)}>Cancelar</button>
          <button className="btn-primary" disabled={!closingAmount || closeReg.isPending} onClick={() => closeModal && closeReg.mutate(closeModal.id)}>
            {closeReg.isPending ? 'Cerrando…' : 'Cerrar'}
          </button>
        </>}>
        <div className="form-group">
          <label>Monto contado en caja *</label>
          <input inputMode="decimal" value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} autoFocus />
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)', marginTop: 4 }}>
            Se comparará contra el saldo esperado y se calculará la diferencia.
          </div>
        </div>
      </Modal>

      {/* Retiro */}
      <Modal open={!!wdModal} title="Retiro de caja" onClose={() => setWdModal(null)}
        footer={<>
          <button className="btn-secondary" onClick={() => setWdModal(null)}>Cancelar</button>
          <button className="btn-primary" disabled={!wd.amount || !wd.concept || withdraw.isPending} onClick={() => wdModal && withdraw.mutate(wdModal.id)}>
            {withdraw.isPending ? 'Registrando…' : 'Retirar'}
          </button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div className="form-group">
            <label>Monto *</label>
            <input inputMode="decimal" value={wd.amount} onChange={(e) => setWd({ ...wd, amount: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Motivo *</label>
            <input value={wd.concept} onChange={(e) => setWd({ ...wd, concept: e.target.value })} placeholder="Pago servicios públicos…" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
