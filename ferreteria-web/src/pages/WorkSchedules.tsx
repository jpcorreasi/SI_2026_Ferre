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
import { Paginated, WorkSchedule, Employee } from '../types/api';

const DAYS = [
  { v: 1, l: 'Lunes' }, { v: 2, l: 'Martes' }, { v: 3, l: 'Miércoles' },
  { v: 4, l: 'Jueves' }, { v: 5, l: 'Viernes' }, { v: 6, l: 'Sábado' }, { v: 7, l: 'Domingo' },
];

interface ShiftLine { day_of_week: string; start_time: string; end_time: string }

export function WorkSchedules() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [employee, setEmployee] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [notes, setNotes] = useState('');
  const [shifts, setShifts] = useState<ShiftLine[]>([{ day_of_week: '1', start_time: '08:00', end_time: '17:00' }]);
  const [detail, setDetail] = useState<WorkSchedule | null>(null);

  const schedules = useQuery({
    queryKey: ['work-schedules', page],
    queryFn: () => api.get<Paginated<WorkSchedule>>(`/work-schedules/?page=${page}&ordering=-week_start`),
    placeholderData: keepPreviousData,
  });
  const employees = useQuery({
    queryKey: ['employees-select'],
    queryFn: () => api.get<Paginated<Employee>>('/employees/?page_size=200&ordering=full_name'),
    enabled: isAdmin && createOpen,
  });

  const create = useMutation({
    mutationFn: () => api.post('/work-schedules/', {
      employee: Number(employee), week_start: weekStart, notes,
      shifts: shifts.map((s) => ({ day_of_week: Number(s.day_of_week), start_time: s.start_time, end_time: s.end_time })),
    }),
    onSuccess: () => {
      toast('Horario creado.');
      setCreateOpen(false); setEmployee(''); setWeekStart(''); setNotes('');
      setShifts([{ day_of_week: '1', start_time: '08:00', end_time: '17:00' }]);
      qc.invalidateQueries({ queryKey: ['work-schedules'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al crear.', 'error'),
  });
  const copy = useMutation({
    mutationFn: (id: number) => api.post(`/work-schedules/${id}/copy-to-next-week/`),
    onSuccess: () => { toast('Horario copiado a la siguiente semana.'); qc.invalidateQueries({ queryKey: ['work-schedules'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error.', 'error'),
  });

  const setShift = (i: number, patch: Partial<ShiftLine>) => setShifts((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const valid = employee && weekStart && shifts.length > 0;

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Horarios</h1>
          <p className="page-sub">{isAdmin ? 'Horarios laborales del personal' : 'Tu horario laboral'}</p>
        </div>
        {isAdmin && (
          <button className="nbtn nbtn-primary" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={16} /> Nuevo horario
          </button>
        )}
      </div>

      <div className="table-card">
        {schedules.isLoading ? (
          <Loading />
        ) : schedules.isError ? (
          <ErrorState message="No se pudieron cargar los horarios." />
        ) : schedules.data!.results.length === 0 ? (
          <EmptyState message="No hay horarios registrados." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Empleado</th><th>Semana del</th><th className="num">Turnos</th><th></th></tr>
            </thead>
            <tbody>
              {schedules.data!.results.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.employee_name}</td>
                  <td>{fmtDate(s.week_start)}</td>
                  <td className="num nmono">{s.shifts.length}</td>
                  <td className="num">
                    <div style={{ display: 'flex', gap: 'var(--sp-1)', justifyContent: 'flex-end' }}>
                      <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => setDetail(s)}>Ver</button>
                      {isAdmin && (
                        <button className="nbtn nbtn-ghost nbtn-sm" disabled={copy.isPending} onClick={() => copy.mutate(s.id)}>
                          <Icon name="chevron-right" size={14} /> Copiar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {schedules.data && <Pagination count={schedules.data.count} page={page} onPage={setPage} />}

      {/* Crear */}
      <Modal open={createOpen} title="Nuevo horario" onClose={() => setCreateOpen(false)} large
        footer={<>
          <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancelar</button>
          <button className="btn-primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creando…' : 'Crear'}
          </button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Empleado *</label>
              <select value={employee} onChange={(e) => setEmployee(e.target.value)}>
                <option value="">Selecciona…</option>
                {employees.data?.results.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Semana (lunes) *</label>
              <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>Turnos *</label>
            {shifts.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', alignItems: 'center' }}>
                <select style={{ flex: 1 }} value={s.day_of_week} onChange={(e) => setShift(i, { day_of_week: e.target.value })}>
                  {DAYS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                </select>
                <input type="time" value={s.start_time} onChange={(e) => setShift(i, { start_time: e.target.value })} />
                <span style={{ color: 'var(--fg-muted)' }}>→</span>
                <input type="time" value={s.end_time} onChange={(e) => setShift(i, { end_time: e.target.value })} />
                <button className="icon-btn-bare" onClick={() => setShifts((ss) => ss.filter((_, idx) => idx !== i))} aria-label="Quitar"><Icon name="trash-2" size={16} /></button>
              </div>
            ))}
            <button className="nbtn nbtn-ghost nbtn-sm" style={{ marginTop: 'var(--sp-2)' }} onClick={() => setShifts((ss) => [...ss, { day_of_week: '1', start_time: '08:00', end_time: '17:00' }])}>
              <Icon name="plus" size={14} /> Añadir turno
            </button>
          </div>
          <div className="form-group">
            <label>Notas</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Detalle */}
      <Modal open={!!detail} title={detail ? `Horario · ${detail.employee_name}` : ''} onClose={() => setDetail(null)}>
        {detail && (
          <div>
            <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-2)' }}>Semana del {fmtDate(detail.week_start)}</p>
            <table className="data-table">
              <thead><tr><th>Día</th><th>Entrada</th><th>Salida</th></tr></thead>
              <tbody>
                {detail.shifts.map((sh) => (
                  <tr key={sh.id}><td>{sh.day_of_week_label}</td><td className="nmono">{sh.start_time}</td><td className="nmono">{sh.end_time}</td></tr>
                ))}
              </tbody>
            </table>
            {detail.notes && <p style={{ marginTop: 'var(--sp-3)', color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>{detail.notes}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
