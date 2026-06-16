import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { fmtCOP } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { Icon } from '../components/Icon';
import { Loading } from '../components/ui/States';
import { Paginated, Product, PaymentMethod, Customer } from '../types/api';

interface CartItem {
  id: number;
  name: string;
  price: number;
  qty: number;
  stock: number;
}

export function NewSale() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');

  const products = useQuery({
    queryKey: ['products-search', search],
    queryFn: () => api.get<Paginated<Product>>(`/products/?search=${encodeURIComponent(search)}&page_size=15`),
    enabled: search.trim().length > 0,
  });

  const methods = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => api.get<Paginated<PaymentMethod>>('/payment-methods/?page_size=200'),
  });

  const clients = useQuery({
    queryKey: ['customers-select'],
    queryFn: () => api.get<Paginated<Customer>>('/customers/?page_size=200&is_active=true&ordering=full_name'),
  });

  const total = cart.reduce((acc, i) => acc + i.price * i.qty, 0);

  function addToCart(p: Product) {
    if (p.stock <= 0) { toast(`"${p.name}" sin stock.`, 'error'); return; }
    setCart((c) => {
      const ex = c.find((i) => i.id === p.id);
      if (ex) {
        if (ex.qty >= ex.stock) { toast('No hay más stock disponible.', 'info'); return c; }
        return c.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...c, { id: p.id, name: p.name, price: Number(p.sale_price), qty: 1, stock: p.stock }];
    });
  }
  function setQty(id: number, qty: number) {
    setCart((c) => c.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.min(qty, i.stock)) } : i)));
  }
  function remove(id: number) {
    setCart((c) => c.filter((i) => i.id !== id));
  }

  const create = useMutation({
    mutationFn: () =>
      api.post('/sales/', {
        customer: isAnonymous ? null : Number(customerId),
        payment_method: Number(paymentMethodId),
        is_anonymous: isAnonymous,
        items: cart.map((i) => ({ product: i.id, quantity: i.qty })),
      }),
    onSuccess: () => {
      toast('Venta registrada con éxito.');
      navigate('/ventas');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error al registrar la venta.', 'error'),
  });

  function confirm() {
    if (cart.length === 0) { toast('El carrito está vacío.', 'error'); return; }
    if (!paymentMethodId) { toast('Selecciona un método de pago.', 'error'); return; }
    if (!isAnonymous && !customerId) { toast('Selecciona un cliente o marca venta anónima.', 'error'); return; }
    create.mutate();
  }

  return (
    <div className="view active">
      <div className="page-head">
        <h1 className="page-h">Nueva venta</h1>
        <p className="page-sub">Paso {step} de 2 · {step === 1 ? 'Selecciona productos' : 'Cliente y pago'}</p>
      </div>

      {step === 1 ? (
        <div style={{ display: 'grid', gap: 'var(--sp-4)', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)' }}>
          {/* Búsqueda de productos */}
          <section className="table-card">
            <div className="toolbar" style={{ margin: 'var(--sp-3)' }}>
              <div className="input-wrap">
                <Icon name="search" size={16} />
                <input placeholder="Buscar producto por nombre o código…" value={search}
                  onChange={(e) => setSearch(e.target.value)} autoFocus />
              </div>
            </div>
            {search.trim() === '' ? (
              <div className="state-block">Escribe para buscar productos.</div>
            ) : products.isLoading ? (
              <Loading />
            ) : products.data && products.data.results.length > 0 ? (
              <table className="data-table">
                <thead><tr><th>Producto</th><th className="num">Precio</th><th className="num">Stock</th><th></th></tr></thead>
                <tbody>
                  {products.data.results.map((p) => (
                    <tr key={p.id}>
                      <td><div style={{ fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>{p.code}</div></td>
                      <td className="num nmono">{fmtCOP(p.sale_price)}</td>
                      <td className="num nmono">{p.stock}</td>
                      <td className="num">
                        <button className="nbtn nbtn-ghost nbtn-sm" disabled={p.stock <= 0} onClick={() => addToCart(p)}>
                          <Icon name="plus" size={14} /> Añadir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="state-block">Sin resultados.</div>
            )}
          </section>

          {/* Carrito */}
          <aside className="table-card" style={{ padding: 'var(--sp-4)', alignSelf: 'start' }}>
            <h3 style={{ marginBottom: 'var(--sp-3)' }}>Carrito ({cart.length})</h3>
            {cart.length === 0 ? (
              <div className="state-block">Aún no has añadido productos.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                {cart.map((i) => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--sp-2)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 'var(--fs-sm)' }}>{i.name}</div>
                      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>{fmtCOP(i.price)} c/u</div>
                    </div>
                    <input type="number" min={1} max={i.stock} value={i.qty}
                      onChange={(e) => setQty(i.id, Number(e.target.value))}
                      style={{ width: 56, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--fg)' }} />
                    <div className="nmono" style={{ width: 84, textAlign: 'right', fontSize: 'var(--fs-sm)' }}>{fmtCOP(i.price * i.qty)}</div>
                    <button className="icon-btn-bare" onClick={() => remove(i.id)} aria-label="Quitar"><Icon name="trash-2" size={16} /></button>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginTop: 'var(--sp-2)' }}>
                  <span>Total</span><span className="nmono">{fmtCOP(total)}</span>
                </div>
              </div>
            )}
            <button className="nbtn nbtn-primary nbtn-block" style={{ marginTop: 'var(--sp-4)' }}
              disabled={cart.length === 0} onClick={() => setStep(2)}>
              Continuar <Icon name="chevron-right" size={16} />
            </button>
          </aside>
        </div>
      ) : (
        <div style={{ maxWidth: 520 }}>
          <section className="table-card" style={{ padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <label className="form-check" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
              Venta anónima (sin cliente)
            </label>

            {!isAnonymous && (
              <div className="form-group">
                <label>Cliente *</label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {clients.data?.results.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Método de pago *</label>
              <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
                <option value="">Selecciona…</option>
                {methods.data?.results.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>
                <span>{cart.length} producto(s)</span>
                <span>{cart.reduce((a, i) => a + i.qty, 0)} unidades</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 'var(--fs-xl)', marginTop: 'var(--sp-1)' }}>
                <span>Total</span><span className="nmono">{fmtCOP(total)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <button className="nbtn nbtn-secondary" onClick={() => setStep(1)}>
                <Icon name="chevron-left" size={16} /> Volver
              </button>
              <button className="nbtn nbtn-primary" style={{ flex: 1 }} disabled={create.isPending} onClick={confirm}>
                {create.isPending ? 'Registrando…' : `Confirmar venta · ${fmtCOP(total)}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
