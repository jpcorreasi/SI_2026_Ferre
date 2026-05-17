/* Screens · Login, Dashboard, Productos (list/detail/bajo-stock), Nueva venta */

const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment } = React;

// ════════════════════════════════════════════════════════════════════════════
// Login
// ════════════════════════════════════════════════════════════════════════════
function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const [user, setUser] = useState('admin_test');
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [lockout, setLockout] = useState(null); // { until: Date }
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!lockout) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [lockout]);

  const remaining = useMemo(() => {
    if (!lockout) return null;
    const s = Math.max(0, Math.ceil((lockout.until - Date.now()) / 1000));
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return { s, label: `${m}:${sec}` };
  }, [lockout, tick]);

  const onSubmit = (e) => {
    e.preventDefault();
    setErrors({});
    if (!user) return setErrors({ user: 'Ingresa tu usuario.' });
    if (!pwd) return setErrors({ pwd: 'Ingresa tu contraseña.' });
    setSubmitting(true);

    setTimeout(() => {
      setSubmitting(false);
      // demo: any password "Admin1234!" → ADMIN, "Emp1234!" → EMPLEADO,
      // "lockout" → simulate 423
      if (pwd === 'lockout') {
        setLockout({ until: Date.now() + 30 * 60 * 1000 });
        return;
      }
      if (pwd === 'Admin1234!') {
        login({ id: 1, username: user, full_name: 'Admin Demo', email: 'admin@ferreteria.test', role: 'ADMIN' });
        toast.success('Bienvenido', 'Sesión iniciada como ADMIN.');
        window.location.hash = '/inicio';
        return;
      }
      if (pwd === 'Emp1234!') {
        login({ id: 2, username: user, full_name: 'Empleado Demo', email: 'empleado@ferreteria.test', role: 'EMPLEADO' });
        toast.success('Bienvenido', 'Sesión iniciada como EMPLEADO.');
        window.location.hash = '/inicio';
        return;
      }
      setErrors({ pwd: 'Usuario o contraseña incorrectos.' });
    }, 600);
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center',
      padding: 'var(--sp-4)', background: 'var(--surface-sunken)',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-6)' }}>
          <div className="topbar-brand-mark" style={{
            width: 56, height: 56, margin: '0 auto var(--sp-3)',
            fontSize: 24, borderRadius: 'var(--r-lg)',
          }}>F</div>
          <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, letterSpacing: '-0.02em' }}>Ferretería</h1>
          <p style={{ color: 'var(--fg-muted)', marginTop: 'var(--sp-1)', fontSize: 'var(--fs-sm)' }}>
            Punto de venta y gestión de inventario
          </p>
        </div>

        <Card>
          <form className="col" style={{ gap: 'var(--sp-4)' }} onSubmit={onSubmit} noValidate>
            <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Iniciar sesión</h2>

            {lockout && remaining && remaining.s > 0 && (
              <Alert tone="danger" title="Cuenta bloqueada temporalmente">
                <div>Demasiados intentos fallidos. Intenta nuevamente en{' '}
                  <span aria-live="polite" className="tabular" style={{ fontWeight: 600 }}>{remaining.label}</span>.
                </div>
              </Alert>
            )}

            <FormField label="Usuario" required error={errors.user}>
              {(p) => <input {...p} className="input" type="text" inputMode="text" autoComplete="username"
                              value={user} onChange={(e) => setUser(e.target.value)} disabled={!!remaining && remaining.s > 0} />}
            </FormField>

            <FormField
              label="Contraseña"
              required
              error={errors.pwd}
              hint="Demo: Admin1234! · Emp1234! · lockout (para simular 423)"
            >
              {(p) => (
                <InputAffix right={
                  <button type="button" className="iconbtn" style={{ width: 36, height: 36 }}
                          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          onClick={() => setShow(s => !s)}>
                    <Icon name={show ? 'eye-off' : 'eye'} size={18} />
                  </button>
                }>
                  <input {...p} className="input" type={show ? 'text' : 'password'} autoComplete="current-password"
                         value={pwd} onChange={(e) => setPwd(e.target.value)}
                         disabled={!!remaining && remaining.s > 0} />
                </InputAffix>
              )}
            </FormField>

            <Button type="submit" variant="primary" size="lg" block loading={submitting}
                    disabled={!!remaining && remaining.s > 0}>
              {submitting ? 'Ingresando…' : 'Ingresar'}
            </Button>

            <div style={{ textAlign: 'center', fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>
              ¿Olvidaste tu contraseña? Habla con tu administrador.
            </div>
          </form>
        </Card>

        <div style={{ marginTop: 'var(--sp-4)', textAlign: 'center', fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
          v1.0 · CaD · es-CO
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Dashboard / Inicio
// ════════════════════════════════════════════════════════════════════════════
function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const d = window.DASHBOARD;
  const lows = window.lowStockProducts();

  return (
    <div className="section">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-h1">Hola, {user?.full_name?.split(' ')[0]}</h1>
            <div className="page-sub">Resumen de hoy · {window.FMT.date(new Date())}</div>
          </div>
          <a className="btn btn-primary" href="#/ventas/nueva">
            <Icon name="plus" /> Nueva venta
          </a>
        </div>
      </div>

      <div className="grid-stats">
        <StatCard label="Ventas hoy" value={window.FMT.cop(d.sales_today_total)} delta={d.sales_today_delta_pct} icon="shopping-cart" hint={`${d.sales_today_count} ventas`} />
        <StatCard label="Esta semana" value={window.FMT.cop(d.sales_week_total)} icon="trending-up" />
        <StatCard label="Bajo stock" value={d.low_stock_count} icon="alert-triangle" hint="referencias" href="#/productos/bajo-stock" />
        {isAdmin ? (
          <StatCard label="Balance del mes" value={window.FMT.copShort(d.financial_balance_month)} delta={d.financial_balance_delta_pct} icon="bar-chart-3" hint="ingresos − egresos" />
        ) : (
          <StatCard label="Clientes activos" value={d.active_customers} icon="users" hint="últimos 90 días" />
        )}
      </div>

      <div className="grid-2">
        <Card>
          <div className="row-between" style={{ marginBottom: 'var(--sp-3)' }}>
            <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Productos bajo stock</h2>
            <a className="btn btn-ghost btn-sm" href="#/productos/bajo-stock">Ver todos<Icon name="chevron-right" size={16} /></a>
          </div>
          {lows.length === 0 ? (
            <EmptyState icon="check-circle" title="Todo en orden" desc="Ningún producto está por debajo de su mínimo." />
          ) : (
            <div className="col" style={{ gap: 'var(--sp-2)' }}>
              {lows.slice(0, 5).map(p => (
                <a key={p.id} href={`#/productos/${p.id}`} className="row-between" style={{
                  padding: 'var(--sp-2)', borderRadius: 'var(--r-md)',
                  color: 'inherit', cursor: 'pointer',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }} className="mono">{p.code}</div>
                  </div>
                  <div className="row" style={{ gap: 'var(--sp-2)' }}>
                    <div className="tabular" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>{p.stock}/{p.min_stock}</div>
                    <StockBadge stock={p.stock} minStock={p.min_stock} />
                  </div>
                </a>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="row-between" style={{ marginBottom: 'var(--sp-3)' }}>
            <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Top productos · 30 días</h2>
            <Badge>por unidades</Badge>
          </div>
          <div className="col" style={{ gap: 'var(--sp-3)' }}>
            {d.top_products_30d.map((row, i) => {
              const p = window.productById(row.product_id);
              const max = Math.max(...d.top_products_30d.map(r => r.qty));
              const pct = (row.qty / max) * 100;
              return (
                <div key={row.product_id}>
                  <div className="row-between" style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {i + 1}. {p?.name}
                    </div>
                    <div className="tabular" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>{row.qty} u</div>
                  </div>
                  <div style={{
                    height: 6, background: 'var(--surface-sunken)', borderRadius: 'var(--r-full)',
                    overflow: 'hidden',
                  }}>
                    <div style={{ width: pct + '%', height: '100%', background: 'var(--accent)', borderRadius: 'var(--r-full)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 'var(--sp-3)' }}>Accesos rápidos</h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
          <a href="#/ventas/nueva" className="btn btn-primary"><Icon name="plus" /> Nueva venta</a>
          <a href="#/ventas" className="btn btn-secondary"><Icon name="shopping-cart" /> Ver ventas</a>
          <a href="#/productos" className="btn btn-secondary"><Icon name="package" /> Catálogo</a>
          {isAdmin && <a href="#/productos/bajo-stock" className="btn btn-secondary"><Icon name="alert-triangle" /> Reposición</a>}
          <a href="#/reportes" className="btn btn-secondary"><Icon name="bar-chart-3" /> Reportes</a>
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Productos · Lista
// ════════════════════════════════════════════════════════════════════════════
function ProductsListPage({ lowStockOnly }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [active, setActive] = useState('all');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pageSize = 10;

  const filtered = useMemo(() => {
    let arr = window.PRODUCTS;
    if (lowStockOnly) arr = arr.filter(p => p.stock <= p.min_stock);
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q));
    }
    if (categoryId) arr = arr.filter(p => p.category_id === Number(categoryId));
    if (active !== 'all') arr = arr.filter(p => active === 'active' ? p.active : !p.active);
    return arr;
  }, [search, categoryId, active, lowStockOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const filterCount = [categoryId, active !== 'all' ? active : null].filter(Boolean).length;

  useEffect(() => { setPage(1); }, [search, categoryId, active, lowStockOnly]);

  return (
    <div className="section">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-h1">{lowStockOnly ? 'Productos bajo stock' : 'Productos'}</h1>
            <div className="page-sub" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'producto' : 'productos'}</div>
          </div>
          {isAdmin && !lowStockOnly && (
            <Button variant="primary" icon="plus" onClick={() => toast.info('Demo', 'Formulario de creación pendiente en esta vista.')}>
              Nuevo producto
            </Button>
          )}
        </div>
      </div>

      <div className="filterbar">
        <InputAffix left={<Icon name="search" />}>
          <input className="input" type="search" placeholder="Buscar por nombre, código o marca…"
                 value={search} onChange={(e) => setSearch(e.target.value)}
                 aria-label="Buscar productos" />
        </InputAffix>
        <Button variant="secondary" icon="filter" onClick={() => setFiltersOpen(true)}>
          Filtros{filterCount ? ` (${filterCount})` : ''}
        </Button>
      </div>

      {/* desktop table */}
      <div className="dt-wrap" style={{ display: 'none' }} data-show-md>
        <table className="dt tabular">
          <caption className="sr-only">Listado de productos</caption>
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Producto</th>
              <th scope="col">Categoría</th>
              <th scope="col" className="num">Precio</th>
              {isAdmin && <th scope="col" className="num">Costo</th>}
              <th scope="col" className="num">Stock</th>
              <th scope="col">Estado</th>
              <th scope="col"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={isAdmin ? 8 : 7}>
                <EmptyState icon="search" title="Sin resultados" desc="Ajusta los filtros o el buscador." />
              </td></tr>
            ) : visible.map(p => {
              const cat = window.categoryById(p.category_id);
              return (
                <tr key={p.id}>
                  <td className="mono" style={{ color: 'var(--fg-muted)' }}>{p.code}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>{p.brand} · {p.unit}</div>
                  </td>
                  <td><Badge>{cat?.name}</Badge></td>
                  <td className="num">{window.FMT.cop(p.price)}</td>
                  {isAdmin && <td className="num" style={{ color: 'var(--fg-muted)' }}>{window.FMT.cop(p.cost)}</td>}
                  <td className="num">{p.stock}</td>
                  <td><StockBadge stock={p.stock} minStock={p.min_stock} /></td>
                  <td>
                    <a className="btn btn-ghost btn-sm" href={`#/productos/${p.id}`} aria-label={`Ver detalle de ${p.name}`}>
                      Ver <Icon name="chevron-right" size={16} />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {/* mobile cards */}
      <div className="dt-cards" data-hide-md>
        {visible.length === 0 ? (
          <EmptyState icon="search" title="Sin resultados" desc="Ajusta los filtros o el buscador." />
        ) : visible.map(p => {
          const cat = window.categoryById(p.category_id);
          return (
            <a key={p.id} href={`#/productos/${p.id}`} className="dt-card" style={{ color: 'inherit', textDecoration: 'none' }}>
              <div className="dt-card-head">
                <div style={{ minWidth: 0 }}>
                  <div className="dt-card-title">{p.name}</div>
                  <div className="dt-card-sub mono">{p.code} · {p.brand}</div>
                </div>
                <StockBadge stock={p.stock} minStock={p.min_stock} />
              </div>
              <dl>
                <dt>Categoría</dt><dd>{cat?.name}</dd>
                <dt>Precio</dt><dd style={{ fontWeight: 600 }}>{window.FMT.cop(p.price)}</dd>
                {isAdmin && <><dt>Costo</dt><dd>{window.FMT.cop(p.cost)}</dd></>}
                <dt>Stock</dt><dd>{p.stock} {p.unit}</dd>
              </dl>
            </a>
          );
        })}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros"
             footer={<>
               <Button variant="ghost" onClick={() => { setCategoryId(''); setActive('all'); }}>Limpiar</Button>
               <Button variant="primary" onClick={() => setFiltersOpen(false)}>Aplicar</Button>
             </>}>
        <div className="col">
          <FormField label="Categoría">
            {(p) => (
              <select {...p} className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Todas</option>
                {window.CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </FormField>
          <FormField label="Estado">
            <div className="seg" role="radiogroup" aria-label="Estado">
              {[['all', 'Todos'], ['active', 'Activos'], ['inactive', 'Inactivos']].map(([v, l]) => (
                <button key={v} role="radio" aria-checked={active === v} aria-pressed={active === v} onClick={() => setActive(v)}>{l}</button>
              ))}
            </div>
          </FormField>
        </div>
      </Sheet>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Producto · detalle
// ════════════════════════════════════════════════════════════════════════════
function ProductDetailPage({ id }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const p = window.productById(Number(id));
  if (!p) {
    return <EmptyState icon="package" title="Producto no encontrado" desc="Revisa el código o vuelve al catálogo."
      action={<a className="btn btn-secondary" href="#/productos"><Icon name="arrow-left" /> Volver</a>} />;
  }
  const cat = window.categoryById(p.category_id);
  const margin = isAdmin ? Math.round(((p.price - p.cost) / p.price) * 100) : null;

  return (
    <div className="section">
      <div>
        <a className="btn btn-ghost btn-sm" href="#/productos" style={{ paddingLeft: 0 }}>
          <Icon name="arrow-left" size={16} /> Catálogo
        </a>
      </div>
      <div className="page-head">
        <div className="page-head-row">
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 'var(--sp-2)', marginBottom: 'var(--sp-1)' }}>
              <span className="mono" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>{p.code}</span>
              <StockBadge stock={p.stock} minStock={p.min_stock} />
              {!p.active && <Badge tone="neutral">Inactivo</Badge>}
            </div>
            <h1 className="page-h1">{p.name}</h1>
            <div className="page-sub">{p.brand} · {cat?.name}</div>
          </div>
          {isAdmin && (
            <Button variant="secondary" icon="edit-3" onClick={() => toast.info('Demo', 'Edición disponible en la próxima iteración.')}>Editar</Button>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        <Card>
          <div className="placeholder-image" style={{ minHeight: 240 }}>
            producto: {p.name.toLowerCase()}
          </div>
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <div className="showcase-label" style={{ marginBottom: 'var(--sp-2)' }}>Descripción</div>
            <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--fg-muted)' }}>{p.description}</p>
          </div>
        </Card>

        <div className="col">
          <Card>
            <div className="row-between" style={{ marginBottom: 'var(--sp-3)' }}>
              <span className="showcase-label">Precio de venta</span>
              {margin != null && <Badge tone="info">{margin}% margen</Badge>}
            </div>
            <div style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, letterSpacing: '-0.02em' }} className="tabular">
              {window.FMT.cop(p.price)}
            </div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)', marginTop: 'var(--sp-1)' }}>
              por {p.unit}
            </div>
          </Card>

          <Card>
            <dl className="info-dl">
              <div>
                <dt>Stock disponible</dt>
                <dd>{p.stock} {p.unit}</dd>
              </div>
              <div>
                <dt>Stock mínimo</dt>
                <dd>{p.min_stock} {p.unit}</dd>
              </div>
              {isAdmin && (
                <>
                  <div>
                    <dt>Costo unitario</dt>
                    <dd>{window.FMT.cop(p.cost)}</dd>
                  </div>
                  <div>
                    <dt>Utilidad / unidad</dt>
                    <dd>{window.FMT.cop(p.price - p.cost)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Marca</dt>
                <dd style={{ fontVariantNumeric: 'normal' }}>{p.brand}</dd>
              </div>
              <div>
                <dt>Categoría</dt>
                <dd style={{ fontVariantNumeric: 'normal' }}>{cat?.name}</dd>
              </div>
            </dl>
          </Card>

          {!isAdmin && (
            <Alert tone="info" title="Vista limitada">
              Como EMPLEADO no puedes ver costo unitario, utilidad ni editar este producto.
              Pídele a un administrador si necesitas hacer cambios.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Nueva venta
// ════════════════════════════════════════════════════════════════════════════
function NewSalePage() {
  const toast = useToast();
  const [items, setItems] = useState([]); // {product_id, qty, unit_price, error?}
  const [comboQ, setComboQ] = useState('');
  const [comboOpen, setComboOpen] = useState(false);
  const [paymentId, setPaymentId] = useState(1);
  const [customerId, setCustomerId] = useState(null);
  const [anonymous, setAnonymous] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(() => items.reduce((s, it) => s + it.qty * it.unit_price, 0), [items]);

  const searchResults = useMemo(() => {
    if (!comboQ) return [];
    const q = comboQ.toLowerCase();
    return window.PRODUCTS
      .filter(p => p.active && (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [comboQ]);

  const addProduct = (p) => {
    setItems(prev => {
      const ex = prev.find(it => it.product_id === p.id);
      if (ex) return prev.map(it => it.product_id === p.id ? { ...it, qty: it.qty + 1, error: undefined } : it);
      return [...prev, { product_id: p.id, qty: 1, unit_price: p.price }];
    });
    setComboQ(''); setComboOpen(false);
    // simulate stock error for one product to demo error handling
  };

  const updateQty = (productId, delta) => {
    setItems(prev => prev.map(it => {
      if (it.product_id !== productId) return it;
      const p = window.productById(it.product_id);
      const next = Math.max(1, it.qty + delta);
      if (next > p.stock) return { ...it, qty: p.stock, error: `Solo hay ${p.stock} unidades en stock.` };
      return { ...it, qty: next, error: undefined };
    }));
  };
  const removeItem = (productId) => setItems(prev => prev.filter(it => it.product_id !== productId));

  const submit = () => {
    if (items.length === 0) return toast.error('Agrega productos', 'No puedes registrar una venta vacía.');
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setConfirming(false);
      toast.success('Venta registrada', `Total ${window.FMT.cop(total)} · método ${window.paymentMethodById(paymentId)?.name}.`);
      setItems([]); setComboQ(''); setCustomerId(null); setAnonymous(true);
      window.location.hash = '/ventas';
    }, 800);
  };

  return (
    <div className="section">
      <div>
        <a className="btn btn-ghost btn-sm" href="#/ventas" style={{ paddingLeft: 0 }}>
          <Icon name="arrow-left" size={16} /> Ventas
        </a>
      </div>
      <div className="page-head">
        <h1 className="page-h1">Nueva venta</h1>
        <div className="page-sub">Agrega productos, elige método de pago y confirma.</div>
      </div>

      {/* Paso 1 — buscar / agregar */}
      <Card>
        <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
          <span className="badge badge-accent" style={{ minWidth: 24, justifyContent: 'center' }}>1</span>
          <h2 style={{ fontSize: 'var(--fs-base)', fontWeight: 600 }}>Productos</h2>
        </div>
        <div style={{ position: 'relative' }}>
          <InputAffix left={<Icon name="search" />}>
            <input
              className="input" type="search" placeholder="Buscar por nombre o código…"
              value={comboQ}
              onChange={(e) => { setComboQ(e.target.value); setComboOpen(true); }}
              onFocus={() => setComboOpen(true)}
              aria-label="Buscar producto"
            />
          </InputAffix>
          {comboOpen && comboQ && (
            <div className="combo-results" style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10,
              boxShadow: 'var(--elev-2)',
            }}>
              {searchResults.length === 0
                ? <div style={{ padding: 'var(--sp-3)', color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>Sin resultados para "{comboQ}"</div>
                : searchResults.map(p => (
                    <button key={p.id} type="button" onClick={() => addProduct(p)} disabled={p.stock === 0}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="combo-name">{p.name}</div>
                        <div className="combo-meta">
                          <span className="mono">{p.code}</span> · stock {p.stock} {p.unit}
                          {p.stock === 0 && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>(sin stock)</span>}
                        </div>
                      </div>
                      <span className="combo-price">{window.FMT.cop(p.price)}</span>
                    </button>
                  ))
              }
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div style={{ marginTop: 'var(--sp-4)', textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)', border: '1px dashed var(--border)', borderRadius: 'var(--r-md)' }}>
            Aún no has agregado productos. Empieza buscando arriba.
          </div>
        ) : (
          <div style={{ marginTop: 'var(--sp-3)' }}>
            {items.map(it => {
              const p = window.productById(it.product_id);
              return (
                <div key={it.product_id} className="item-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="item-row-name">{p.name}</div>
                    <div className="item-row-meta mono">{p.code} · {window.FMT.cop(it.unit_price)} / {p.unit}</div>
                    {it.error && <div className="field-error" role="alert" style={{ marginTop: 4 }}>
                      <Icon name="alert-circle" size={14} /> {it.error}
                    </div>}
                  </div>
                  <div className="row" style={{ gap: 'var(--sp-3)' }}>
                    <div className="qty-stepper" role="group" aria-label={`Cantidad de ${p.name}`}>
                      <button type="button" onClick={() => updateQty(it.product_id, -1)} aria-label="Disminuir">
                        <Icon name="minus" size={16} />
                      </button>
                      <span className="qty-val tabular">{it.qty}</span>
                      <button type="button" onClick={() => updateQty(it.product_id, +1)} aria-label="Aumentar">
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                    <div className="item-row-total tabular" style={{ minWidth: 96, textAlign: 'right' }}>
                      {window.FMT.cop(it.qty * it.unit_price)}
                    </div>
                    <IconButton icon="trash-2" label={`Quitar ${p.name}`} onClick={() => removeItem(it.product_id)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Paso 2 — cliente */}
      <Card>
        <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
          <span className="badge badge-accent" style={{ minWidth: 24, justifyContent: 'center' }}>2</span>
          <h2 style={{ fontSize: 'var(--fs-base)', fontWeight: 600 }}>Cliente</h2>
        </div>
        <div className="col">
          <label className="check">
            <input type="checkbox" checked={anonymous} onChange={(e) => { setAnonymous(e.target.checked); if (e.target.checked) setCustomerId(null); }} />
            Venta anónima (sin cliente asociado)
          </label>
          {!anonymous && (
            <FormField label="Cliente">
              {(p) => (
                <select {...p} className="select" value={customerId || ''} onChange={(e) => setCustomerId(Number(e.target.value) || null)}>
                  <option value="">Selecciona un cliente…</option>
                  {window.CUSTOMERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </FormField>
          )}
        </div>
      </Card>

      {/* Paso 3 — pago */}
      <Card>
        <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
          <span className="badge badge-accent" style={{ minWidth: 24, justifyContent: 'center' }}>3</span>
          <h2 style={{ fontSize: 'var(--fs-base)', fontWeight: 600 }}>Método de pago</h2>
        </div>
        <div className="pay-grid" role="radiogroup" aria-label="Método de pago">
          {window.PAYMENT_METHODS.map(m => (
            <button key={m.id} type="button" className="pay-card" role="radio"
                    aria-pressed={paymentId === m.id} aria-checked={paymentId === m.id}
                    onClick={() => setPaymentId(m.id)}>
              <Icon name={m.icon} />
              <div className="pay-card-name">{m.name}</div>
              <div className="pay-card-hint">{m.hint}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Cobrar bar */}
      <div className="cobrar-bar">
        <div className="cobrar-total">
          <span className="cobrar-total-label">Total ({items.reduce((s, it) => s + it.qty, 0)} u)</span>
          <span className="cobrar-total-value">{window.FMT.cop(total)}</span>
        </div>
        <Button variant="primary" size="lg" disabled={items.length === 0} onClick={() => setConfirming(true)}>
          Cobrar {window.FMT.cop(total)}
        </Button>
      </div>

      <Dialog
        open={confirming}
        onClose={() => !submitting && setConfirming(false)}
        title="Confirmar venta"
        description={`${items.length} ${items.length === 1 ? 'producto' : 'productos'} · ${window.paymentMethodById(paymentId)?.name}`}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirming(false)} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={submitting}>{submitting ? 'Procesando…' : 'Confirmar y cobrar'}</Button>
        </>}
      >
        <div className="card-pad" style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
          <div className="row-between" style={{ fontSize: 'var(--fs-sm)' }}>
            <span>Subtotal</span>
            <span className="tabular">{window.FMT.cop(total)}</span>
          </div>
          <div className="row-between" style={{ fontSize: 'var(--fs-sm)', marginTop: 4 }}>
            <span>IVA incluido</span>
            <span className="tabular" style={{ color: 'var(--fg-muted)' }}>{window.FMT.cop(Math.round(total * 0.19 / 1.19))}</span>
          </div>
          <div className="row-between" style={{ marginTop: 'var(--sp-2)', paddingTop: 'var(--sp-2)', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600 }}>Total a cobrar</span>
            <span className="tabular" style={{ fontWeight: 700, fontSize: 'var(--fs-lg)' }}>{window.FMT.cop(total)}</span>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

Object.assign(window, {
  LoginPage, DashboardPage, ProductsListPage, ProductDetailPage, NewSalePage,
});
