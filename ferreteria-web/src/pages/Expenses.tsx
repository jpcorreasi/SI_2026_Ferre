import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtCOP, fmtDate } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Loading, ErrorState, EmptyState } from '../components/ui/States';
import { Paginated, Expense, ExpenseCategory, ExpensePaymentMethod } from '../types/api';

const PAY_LABEL: Record<ExpensePaymentMethod, string> = {
  CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', OTHER: 'Otro',
};

interface FormState {
  id?: number;
  description: string;
  category: string;
  amount: string;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  receipt_reference: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    description: '', category: '', amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    payment_method: 'CASH', receipt_reference: '', notes: '',
  };
}

export function Expenses() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [modal, setModal] = useState<FormState | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [newCat, setNewCat] = useState('');

  const params = new URLSearchParams({ page: String(page) });
  if (category) params.set('category', category);

  const expenses = useQuery({
    queryKey: ['expenses', params.toString()],
    queryFn: () => api.get<Paginated<Expense>>(`/expenses/?${params}`),
    placeholderData: keepPreviousData,
  });
  const cats = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get<Paginated<ExpenseCategory>>('/expense-categories/?page_size=200'),
  });

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        description: f.description, category: Number(f.category), amount: f.amount,
        expense_date: f.expense_date, payment_method: f.payment_method,
        receipt_reference: f.receipt_reference, notes: f.notes,
      };
      return f.id ? api.put(`/expenses/${f.id}/`, body) : api.post('/expenses/', body);
    },
    onSuccess: (_d, f) => {
      toast(f.id ? 'Gasto actualizado.' : 'Gasto registrado.');
      setModal(null);
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al guardar.', 'error'),
  });

  const addCat = useMutation({
    mutationFn: () => api.post('/expense-categories/', { name: newCat }),
    onSuccess: () => {
      toast('Categoría creada.');
      setNewCat('');
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error.', 'error'),
  });

  return (
    <div className="view active">
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-h">Gastos</h1>
          <p className="page-sub">Gastos operativos</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button className="nbtn nbtn-secondary" onClick={() => setCatsOpen(true)}>
            <Icon name="list" size={16} /> Categorías
          </button>
          <button className="nbtn nbtn-primary" onClick={() => setModal(emptyForm())}>
            <Icon name="plus" size={16} /> Nuevo gasto
          </button>
        </div>
      </div>

      <div className="toolbar">
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">Todas las categorías</option>
          {cats.data?.results.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="table-card">
        {expenses.isLoading ? (
          <Loading />
        ) : expenses.isError ? (
          <ErrorState message="No se pudieron cargar los gastos." />
        ) : expenses.data!.results.length === 0 ? (
          <EmptyState message="No hay gastos que coincidan." />
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Pago</th><th className="num">Monto</th><th></th></tr>
            </thead>
            <tbody>
              {expenses.data!.results.map((x) => (
                <tr key={x.id}>
                  <td>{fmtDate(x.expense_date)}</td>
                  <td>{x.description}</td>
                  <td>{x.category_name && <span className="nbadge nbadge-accent">{x.category_name}</span>}</td>
                  <td>{PAY_LABEL[x.payment_method]}</td>
                  <td className="num nmono">{fmtCOP(x.amount)}</td>
                  <td className="num">
                    <button className="nbtn nbtn-ghost nbtn-sm" onClick={() => setModal({
                      id: x.id, description: x.description, category: String(x.category),
                      amount: x.amount, expense_date: x.expense_date, payment_method: x.payment_method,
                      receipt_reference: x.receipt_reference, notes: x.notes,
                    })}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {expenses.data && <Pagination count={expenses.data.count} page={page} onPage={setPage} />}

      {/* Form de gasto */}
      <Modal
        open={!!modal}
        title={modal?.id ? 'Editar gasto' : 'Nuevo gasto'}
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
              <label>Descripción *</label>
              <input value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Categoría *</label>
                <select value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {cats.data?.results.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Monto *</label>
                <input inputMode="decimal" value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} />
              </div>
            </div>
            <div className="form-row" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Fecha *</label>
                <input type="date" value={modal.expense_date} onChange={(e) => setModal({ ...modal, expense_date: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Método de pago</label>
                <select value={modal.payment_method} onChange={(e) => setModal({ ...modal, payment_method: e.target.value as ExpensePaymentMethod })}>
                  {Object.entries(PAY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Referencia del recibo</label>
              <input value={modal.receipt_reference} onChange={(e) => setModal({ ...modal, receipt_reference: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Notas</label>
              <textarea value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>

      {/* Gestión de categorías */}
      <Modal open={catsOpen} title="Categorías de gasto" onClose={() => setCatsOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <div className="input-wrap" style={{ flex: 1 }}>
              <input placeholder="Nueva categoría…" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            </div>
            <button className="nbtn nbtn-primary" disabled={!newCat || addCat.isPending} onClick={() => addCat.mutate()}>
              Añadir
            </button>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
            {cats.data?.results.map((c) => (
              <li key={c.id} style={{ padding: 'var(--sp-2)', borderBottom: '1px solid var(--border)' }}>{c.name}</li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
