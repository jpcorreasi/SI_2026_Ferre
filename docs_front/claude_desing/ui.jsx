/* UI primitives — Ferretería design system
   Button, IconButton, Input, FormField, Select, Badge, StatCard, Card,
   Sheet, Dialog, Toaster, Skeleton, EmptyState, ErrorState, DataTable, Pagination
*/

const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment } = React;

// ── Button ─────────────────────────────────────────────────────────────
function Button({ variant = 'secondary', size = 'md', icon, iconRight, block, type = 'button', loading, disabled, children, ...rest }) {
  const cls = [
    'btn',
    'btn-' + variant,
    size === 'sm' && 'btn-sm',
    size === 'lg' && 'btn-lg',
    block && 'btn-block',
    rest.className,
  ].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {loading ? 'Cargando…' : children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </button>
  );
}

function IconButton({ icon, label, size = 20, ...rest }) {
  return (
    <button type="button" className="iconbtn" aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

// ── FormField + Input ─────────────────────────────────────────────────
function FormField({ id: idProp, label, hint, error, required, children }) {
  const reactId = React.useId();
  const id = idProp || reactId;
  const hintId = hint ? id + '-hint' : undefined;
  const errId = error ? id + '-err' : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  // children is a render fn(ids) or a single element to clone
  let control;
  if (typeof children === 'function') {
    control = children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined, 'aria-required': required ? 'true' : undefined });
  } else {
    control = React.cloneElement(children, {
      id,
      'aria-describedby': describedBy,
      'aria-invalid': error ? 'true' : undefined,
      'aria-required': required ? 'true' : undefined,
    });
  }
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}{required && <span aria-hidden="true" style={{ color: 'var(--danger)' }}> *</span>}
      </label>
      {control}
      {hint && !error && <div id={hintId} className="field-hint">{hint}</div>}
      {error && <div id={errId} className="field-error" role="alert">
        <Icon name="alert-circle" size={14} /> {error}
      </div>}
    </div>
  );
}

function Input(props) {
  return <input className={'input ' + (props.className || '')} {...props} />;
}

function InputAffix({ left, right, children }) {
  return (
    <div className="input-affix">
      {left}
      {children}
      {right}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────
function Badge({ tone = 'neutral', icon, children }) {
  const cls = 'badge ' + (tone === 'neutral' ? '' : 'badge-' + tone);
  return (
    <span className={cls.trim()}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

// status badge for sales — color + icon + text (never color-only)
function SaleStatusBadge({ status }) {
  switch (status) {
    case 'COMPLETED': return <Badge tone="success" icon="check-circle">Completada</Badge>;
    case 'CANCELLED': return <Badge tone="danger" icon="x">Cancelada</Badge>;
    case 'PENDING':   return <Badge tone="warning" icon="circle">Pendiente</Badge>;
    default:          return <Badge>{status}</Badge>;
  }
}

function StockBadge({ stock, minStock }) {
  if (stock === 0) return <Badge tone="danger" icon="alert-triangle">Sin stock</Badge>;
  if (stock <= minStock) return <Badge tone="warning" icon="alert-triangle">Bajo stock</Badge>;
  return <Badge tone="success" icon="check">En stock</Badge>;
}

// ── StatCard ──────────────────────────────────────────────────────────
function StatCard({ label, value, delta, hint, icon, href, onClick }) {
  const isUp = delta != null && delta >= 0;
  const Tag = href ? 'a' : (onClick ? 'button' : 'div');
  const interactive = !!(href || onClick);
  return (
    <Tag
      className="stat"
      href={href}
      onClick={onClick}
      style={interactive ? { cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' } : undefined}
      type={onClick && !href ? 'button' : undefined}
    >
      <div className="stat-label">
        {icon && <Icon name={icon} size={16} />}
        <span>{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {(delta != null || hint) && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {delta != null && (
            <span className={'stat-delta ' + (isUp ? 'stat-delta-up' : 'stat-delta-down')}>
              <Icon name={isUp ? 'trending-up' : 'trending-down'} size={14} />
              {isUp ? '+' : ''}{delta.toFixed(1)}%
            </span>
          )}
          {hint && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>{hint}</span>}
        </div>
      )}
    </Tag>
  );
}

// ── Card ──────────────────────────────────────────────────────────────
function Card({ className = '', pad = true, children, ...rest }) {
  return (
    <div className={'card ' + (pad ? 'card-pad-6 ' : '') + className} {...rest}>{children}</div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────
function Skeleton({ width = '100%', height = 16, radius, style, ...rest }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-busy="true" {...rest} />;
}

// ── EmptyState / ErrorState ───────────────────────────────────────────
function EmptyState({ icon = 'inbox', title, desc, action }) {
  return (
    <div className="state" role="status">
      <div className="state-icon"><Icon name={icon} size={24} /></div>
      <div className="state-title">{title}</div>
      {desc && <div className="state-desc">{desc}</div>}
      {action}
    </div>
  );
}
function ErrorState({ title = 'No pudimos cargar la información', desc = 'Revisa tu conexión e inténtalo de nuevo.', onRetry }) {
  return (
    <div className="state" role="alert">
      <div className="state-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger-soft-fg)' }}>
        <Icon name="wifi-off" size={24} />
      </div>
      <div className="state-title">{title}</div>
      <div className="state-desc">{desc}</div>
      {onRetry && <Button variant="secondary" icon="refresh-cw" onClick={onRetry}>Reintentar</Button>}
    </div>
  );
}

// ── Sheet (drawer) — right on desktop, bottom on mobile ───────────────
function Sheet({ open, onClose, title, side = 'right', children, footer }) {
  const ref = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // focus first interactive
    requestAnimationFrame(() => {
      const focusable = ref.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      triggerRef.current?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Fragment>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={ref}
        className={'sheet sheet-' + side}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'sheet-title' : undefined}
      >
        {title && (
          <div className="sheet-head">
            <div id="sheet-title" className="sheet-title">{title}</div>
            <IconButton icon="x" label="Cerrar" onClick={onClose} />
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </Fragment>
  );
}

// ── Dialog ────────────────────────────────────────────────────────────
function Dialog({ open, onClose, title, description, children, footer, tone = 'neutral' }) {
  const ref = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const focusable = ref.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      triggerRef.current?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="dialog"
        role="dialog" aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-desc' : undefined}
        onClick={e => e.stopPropagation()}
      >
        <div>
          <div id="dialog-title" className="dialog-title">{title}</div>
          {description && <div id="dialog-desc" className="dialog-desc" style={{ marginTop: 6 }}>{description}</div>}
        </div>
        {children}
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ── Toaster ───────────────────────────────────────────────────────────
const ToastContext = createContext(null);
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    const toast = { id, tone: 'success', timeout: 4000, ...t };
    setToasts(arr => [...arr, toast]);
    if (toast.timeout) setTimeout(() => setToasts(arr => arr.filter(x => x.id !== id)), toast.timeout);
  }, []);
  const api = useMemo(() => ({
    success: (title, desc) => push({ tone: 'success', title, desc }),
    error: (title, desc) => push({ tone: 'danger', title, desc, timeout: 6000 }),
    info: (title, desc) => push({ tone: 'info', title, desc }),
  }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toaster" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} className={'toast toast-' + t.tone} role={t.tone === 'danger' ? 'alert' : 'status'}>
            <Icon className="toast-icon" name={t.tone === 'success' ? 'check-circle' : t.tone === 'danger' ? 'alert-circle' : 'info'} />
            <div className="toast-body">
              {t.title && <div className="toast-title">{t.title}</div>}
              {t.desc && <div className="toast-desc">{t.desc}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
function useToast() { return useContext(ToastContext); }

// ── Pagination ────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  // window pages
  const pages = [];
  const start = Math.max(1, Math.min(page - 1, totalPages - 2));
  const end = Math.min(totalPages, start + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <nav className="pagination" aria-label="Paginación">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior">
        <Icon name="chevron-left" />
      </button>
      {start > 1 && <button onClick={() => onChange(1)} aria-label="Página 1">1</button>}
      {start > 2 && <span style={{ padding: '0 4px', color: 'var(--fg-muted)' }}>…</span>}
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined} aria-label={'Página ' + p}>
          {p}
        </button>
      ))}
      {end < totalPages - 1 && <span style={{ padding: '0 4px', color: 'var(--fg-muted)' }}>…</span>}
      {end < totalPages && <button onClick={() => onChange(totalPages)} aria-label={'Página ' + totalPages}>{totalPages}</button>}
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Página siguiente">
        <Icon name="chevron-right" />
      </button>
    </nav>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────
function Alert({ tone = 'info', title, children, icon }) {
  const iconName = icon || (tone === 'danger' ? 'alert-triangle' : tone === 'warning' ? 'alert-triangle' : 'info');
  return (
    <div className={'alert alert-' + tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={iconName} className="alert-icon" />
      <div>
        {title && <div className="alert-title">{title}</div>}
        <div className="alert-body">{children}</div>
      </div>
    </div>
  );
}

// ── Switch ────────────────────────────────────────────────────────────
function Switch({ checked, onChange, label, id: idProp }) {
  const id = idProp || React.useId();
  return (
    <label className="row" htmlFor={id} style={{ cursor: 'pointer', gap: 'var(--sp-3)' }}>
      <span className="switch">
        <input id={id} type="checkbox" role="switch" checked={!!checked} onChange={e => onChange(e.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
      </span>
      {label && <span style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>}
    </label>
  );
}

Object.assign(window, {
  Button, IconButton, FormField, Input, InputAffix,
  Badge, SaleStatusBadge, StockBadge,
  StatCard, Card, Skeleton, EmptyState, ErrorState,
  Sheet, Dialog, ToastProvider, useToast, Pagination, Alert, Switch,
});
