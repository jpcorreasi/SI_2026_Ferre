/* Stub screens for nav targets not in the priority set (Ventas list, Reportes)
   + /dev/components showcase.
   These keep the app navigable; they're intentionally lighter than the priority screens.
*/

const { useState, useMemo } = React;

// ════════════════════════════════════════════════════════════════════════════
// Ventas · lista (stub — completa con detalle/cancelar en próxima iteración)
// ════════════════════════════════════════════════════════════════════════════
function SalesListPage() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let arr = window.SALES;
    if (status !== 'all') arr = arr.filter(s => s.status === status);
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(s => s.number.toLowerCase().includes(q) ||
        window.customerById(s.customer_id)?.name.toLowerCase().includes(q));
    }
    return arr;
  }, [status, search]);

  return (
    <div className="section">
      <div className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-h1">Ventas</h1>
            <div className="page-sub" aria-live="polite">{filtered.length} ventas</div>
          </div>
          <a href="#/ventas/nueva" className="btn btn-primary"><Icon name="plus" /> Nueva venta</a>
        </div>
      </div>

      <div className="filterbar">
        <InputAffix left={<Icon name="search" />}>
          <input className="input" type="search" placeholder="Buscar por número o cliente…"
                 value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar ventas" />
        </InputAffix>
        <div className="seg" role="radiogroup" aria-label="Estado">
          {[['all', 'Todas'], ['COMPLETED', 'Completadas'], ['CANCELLED', 'Canceladas']].map(([v, l]) => (
            <button key={v} role="radio" aria-checked={status === v} aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="dt-cards">
        {filtered.length === 0 ? (
          <EmptyState icon="shopping-cart" title="Sin ventas" desc="Cuando registres ventas aparecerán aquí." />
        ) : filtered.map(s => {
          const cust = window.customerById(s.customer_id);
          const pay = window.paymentMethodById(s.payment_method_id);
          return (
            <article key={s.id} className="dt-card">
              <div className="dt-card-head">
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 'var(--sp-2)', marginBottom: 4 }}>
                    <span className="mono" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{s.number}</span>
                    <SaleStatusBadge status={s.status} />
                  </div>
                  <div className="dt-card-sub">{cust?.name || 'Venta anónima'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tabular" style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>{window.FMT.cop(s.total)}</div>
                  <div className="dt-card-sub">{pay?.name}</div>
                </div>
              </div>
              <div className="row-between" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>
                <span>{window.FMT.datetime(s.created_at)} · {s.employee}</span>
                <span>{s.items.length} {s.items.length === 1 ? 'producto' : 'productos'}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Reportes (stub — solo home con StatCards y placeholders)
// ════════════════════════════════════════════════════════════════════════════
function ReportsPage() {
  const { isAdmin } = useAuth();
  const d = window.DASHBOARD;
  return (
    <div className="section">
      <div className="page-head">
        <h1 className="page-h1">Reportes</h1>
        <div className="page-sub">Resumen de operación y desempeño financiero.</div>
      </div>

      <div className="grid-stats">
        <StatCard label="Ventas hoy" value={window.FMT.cop(d.sales_today_total)} delta={d.sales_today_delta_pct} icon="shopping-cart" />
        <StatCard label="Esta semana" value={window.FMT.copShort(d.sales_week_total)} icon="trending-up" />
        <StatCard label="Bajo stock" value={d.low_stock_count} icon="alert-triangle" hint="referencias" />
        {isAdmin && <StatCard label="Balance del mes" value={window.FMT.copShort(d.financial_balance_month)} delta={d.financial_balance_delta_pct} icon="bar-chart-3" />}
      </div>

      <div className="grid-cards">
        <Card>
          <h2 style={{ fontSize: 'var(--fs-base)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>Top productos</h2>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)', marginBottom: 'var(--sp-3)' }}>Los más vendidos en los últimos 30 días.</p>
          <Button variant="secondary" iconRight="chevron-right" block>Ver detalle</Button>
        </Card>
        <Card>
          <h2 style={{ fontSize: 'var(--fs-base)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>Resumen de ventas</h2>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)', marginBottom: 'var(--sp-3)' }}>Ventas por día, comparativos y promedios.</p>
          <Button variant="secondary" iconRight="chevron-right" block>Ver detalle</Button>
        </Card>
        {isAdmin && (
          <Card>
            <div className="row-between" style={{ marginBottom: 'var(--sp-2)' }}>
              <h2 style={{ fontSize: 'var(--fs-base)', fontWeight: 600 }}>Ventas por método de pago</h2>
              <Badge tone="accent">Admin</Badge>
            </div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)', marginBottom: 'var(--sp-3)' }}>Distribución, total por método y exportación CSV / PDF.</p>
            <Button variant="secondary" iconRight="chevron-right" block>Ver detalle</Button>
          </Card>
        )}
      </div>

      <Alert tone="info" title="Próxima iteración">
        El detalle de cada reporte y los exports CSV/PDF entran en la siguiente pasada. La arquitectura
        (api-client con Bearer + Blob downloads, RequireRole guards) ya está prevista en <span className="mono">src/lib/</span>.
      </Alert>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// /dev/components — Showcase
// ════════════════════════════════════════════════════════════════════════════
function ShowcasePage() {
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [val, setVal] = useState('');

  const tokenSwatches = [
    ['--surface', 'Superficie base'],
    ['--surface-elevated', 'Elevada (cards)'],
    ['--surface-sunken', 'Hundida (fondos)'],
    ['--border', 'Borde sutil'],
    ['--border-strong', 'Borde fuerte'],
    ['--fg', 'Texto principal'],
    ['--fg-muted', 'Texto secundario'],
    ['--fg-subtle', 'Texto sutil'],
    ['--accent', 'Acento'],
    ['--accent-soft', 'Acento suave'],
    ['--success', 'Éxito'],
    ['--warning', 'Advertencia'],
    ['--danger', 'Peligro'],
    ['--info', 'Información'],
  ];

  return (
    <div className="section">
      <div className="page-head">
        <h1 className="page-h1">Showcase de componentes</h1>
        <div className="page-sub">
          Sustituye a Figma. Cada primitivo y su set de variantes en una sola página. Disponible solo en{' '}
          <span className="mono">import.meta.env.DEV</span>.
        </div>
      </div>

      {/* Tokens */}
      <section className="showcase-section">
        <h2 className="showcase-title">Tokens · Color</h2>
        <div className="showcase-grid" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {tokenSwatches.map(([token, label]) => (
            <div key={token} className="swatch-row">
              <div className="swatch" style={{ background: `var(${token})` }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>{label}</div>
                <div className="swatch-label">{token}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="showcase-section">
        <h2 className="showcase-title">Tokens · Tipografía</h2>
        <div className="showcase-grid" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--sp-2)' }}>
          {[
            ['fs-4xl', 'Display 36/40', '--fs-4xl', '--lh-4xl'],
            ['fs-3xl', 'H1 desktop 30/36', '--fs-3xl', '--lh-3xl'],
            ['fs-2xl', 'H1 mobile 24/32', '--fs-2xl', '--lh-2xl'],
            ['fs-xl',  'H2 20/28', '--fs-xl', '--lh-xl'],
            ['fs-lg',  'H3 18/28', '--fs-lg', '--lh-lg'],
            ['fs-base','Body 16/24', '--fs-base', '--lh-base'],
            ['fs-sm',  'Small 14/20', '--fs-sm', '--lh-sm'],
            ['fs-xs',  'Micro 12/16', '--fs-xs', '--lh-xs'],
          ].map(([k, label, fs, lh]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)' }}>
              <span style={{ fontSize: `var(${fs})`, lineHeight: `var(${lh})`, fontWeight: 600 }}>Ferretería 1.234</span>
              <span className="swatch-label">{fs}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Buttons */}
      <section className="showcase-section">
        <h2 className="showcase-title">Button</h2>
        <div className="showcase-grid">
          <span className="showcase-label">Variants</span>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="showcase-grid">
          <span className="showcase-label">Sizes</span>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" size="md">Medium</Button>
          <Button variant="primary" size="lg">Large</Button>
        </div>
        <div className="showcase-grid">
          <span className="showcase-label">States</span>
          <Button variant="primary" icon="plus">Con icono</Button>
          <Button variant="primary" iconRight="chevron-right">Continuar</Button>
          <Button variant="primary" loading>Guardando…</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <IconButton icon="more-horizontal" label="Más" />
        </div>
      </section>

      {/* Inputs */}
      <section className="showcase-section">
        <h2 className="showcase-title">Input · FormField</h2>
        <div className="showcase-grid" style={{ flexDirection: 'column', alignItems: 'stretch', maxWidth: 480 }}>
          <FormField label="Nombre completo" hint="Como aparece en tu documento" required>
            {(p) => <input {...p} className="input" autoComplete="name" value={val} onChange={(e) => setVal(e.target.value)} />}
          </FormField>
          <FormField label="Correo electrónico" error="Ingresa un correo válido (incluye @)">
            {(p) => <input {...p} className="input" type="email" inputMode="email" autoComplete="email" defaultValue="admin@ferreteria" />}
          </FormField>
          <FormField label="Precio" hint="En pesos colombianos">
            {(p) => (
              <InputAffix left={<span style={{ color: 'var(--fg-muted)' }}>$</span>} right={<span style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-xs)' }}>COP</span>}>
                <input {...p} className="input" type="text" inputMode="decimal" defaultValue="48.500" />
              </InputAffix>
            )}
          </FormField>
        </div>
      </section>

      {/* Badges */}
      <section className="showcase-section">
        <h2 className="showcase-title">Badge</h2>
        <div className="showcase-grid">
          <Badge>Neutral</Badge>
          <Badge tone="success" icon="check">En stock</Badge>
          <Badge tone="warning" icon="alert-triangle">Bajo stock</Badge>
          <Badge tone="danger" icon="alert-triangle">Sin stock</Badge>
          <Badge tone="info" icon="info">Info</Badge>
          <Badge tone="accent">Acento</Badge>
          <SaleStatusBadge status="COMPLETED" />
          <SaleStatusBadge status="CANCELLED" />
          <SaleStatusBadge status="PENDING" />
        </div>
      </section>

      {/* StatCards */}
      <section className="showcase-section">
        <h2 className="showcase-title">StatCard</h2>
        <div className="grid-stats">
          <StatCard label="Ventas hoy" value="$766.100" delta={12.4} icon="shopping-cart" />
          <StatCard label="Esta semana" value="$4.189.300" delta={-3.1} icon="trending-up" />
          <StatCard label="Bajo stock" value="4" icon="alert-triangle" hint="referencias" />
          <StatCard label="Clientes" value="128" icon="users" />
        </div>
      </section>

      {/* Sheet + Dialog + Toast */}
      <section className="showcase-section">
        <h2 className="showcase-title">Feedback</h2>
        <div className="showcase-grid">
          <Button variant="secondary" onClick={() => toast.success('Cambios guardados', 'Tus modificaciones quedaron registradas.')}>Toast éxito</Button>
          <Button variant="secondary" onClick={() => toast.error('Error de red', 'No pudimos conectar. Reintenta.')}>Toast error</Button>
          <Button variant="secondary" onClick={() => toast.info('Aviso', 'Mensaje informativo.')}>Toast info</Button>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>Abrir Dialog</Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>Abrir Sheet</Button>
        </div>
      </section>

      {/* Alerts */}
      <section className="showcase-section">
        <h2 className="showcase-title">Alert</h2>
        <div className="col">
          <Alert tone="info" title="Información">Mensaje neutral con contexto adicional.</Alert>
          <Alert tone="warning" title="Atención">Algo requiere tu revisión antes de continuar.</Alert>
          <Alert tone="danger" title="Cuenta bloqueada temporalmente">Demasiados intentos fallidos. Intenta nuevamente en <strong>29:42</strong>.</Alert>
        </div>
      </section>

      {/* Skeleton */}
      <section className="showcase-section">
        <h2 className="showcase-title">Skeleton</h2>
        <div className="showcase-grid" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <Skeleton height={32} width="50%" />
          <Skeleton height={16} />
          <Skeleton height={16} width="80%" />
        </div>
      </section>

      {/* Empty / Error */}
      <section className="showcase-section">
        <h2 className="showcase-title">EmptyState / ErrorState</h2>
        <div className="grid-2">
          <Card pad={false}>
            <EmptyState icon="inbox" title="Sin resultados" desc="Ajusta los filtros e inténtalo de nuevo." action={<Button variant="secondary">Limpiar filtros</Button>} />
          </Card>
          <Card pad={false}>
            <ErrorState onRetry={() => toast.info('Reintentando…')} />
          </Card>
        </div>
      </section>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="¿Cancelar venta V-001847?"
        description="Esta acción restaurará el stock y no se puede deshacer."
        footer={<>
          <Button variant="ghost" onClick={() => setDialogOpen(false)}>Volver</Button>
          <Button variant="danger" onClick={() => { setDialogOpen(false); toast.success('Venta cancelada'); }}>Sí, cancelar</Button>
        </>}
      >
        <FormField label="Motivo (opcional)">
          {(p) => <textarea {...p} className="textarea" placeholder="Producto presentaba defecto…" />}
        </FormField>
      </Dialog>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filtros"
             footer={<><Button variant="ghost" onClick={() => setSheetOpen(false)}>Limpiar</Button><Button variant="primary" onClick={() => setSheetOpen(false)}>Aplicar</Button></>}>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>Ejemplo de Sheet lateral (derecha en desktop, inferior en móvil).</p>
      </Sheet>
    </div>
  );
}

Object.assign(window, { SalesListPage, ReportsPage, ShowcasePage });
