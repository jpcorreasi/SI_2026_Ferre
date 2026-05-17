/* AppShell + router + contexts (Auth/Role, Theme).
   Hash-based router so a single HTML file is enough to navigate.
*/

const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment } = React;

// ── Route store (hash-based) ──────────────────────────────────────────
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, '') || '/login');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.replace(/^#/, '') || '/login');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((to) => {
    if (window.location.hash.replace(/^#/, '') === to) return;
    window.location.hash = to;
  }, []);
  return [hash, navigate];
}

// match /productos/:id style routes
function matchRoute(pattern, path) {
  const pp = pattern.split('/').filter(Boolean);
  const pa = path.split('/').filter(Boolean);
  if (pp.length !== pa.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(pa[i]);
    else if (pp[i] !== pa[i]) return null;
  }
  return params;
}

// ── Auth / Role context ────────────────────────────────────────────────
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fe:user')) || null; } catch { return null; }
  });
  const login = useCallback((u) => {
    localStorage.setItem('fe:user', JSON.stringify(u));
    setUser(u);
  }, []);
  const logout = useCallback(() => {
    localStorage.removeItem('fe:user');
    setUser(null);
    window.location.hash = '/login';
  }, []);
  const setRole = useCallback((role) => {
    setUser(prev => {
      const next = { ...prev, role };
      localStorage.setItem('fe:user', JSON.stringify(next));
      return next;
    });
  }, []);
  const value = useMemo(() => ({ user, login, logout, setRole, isAdmin: user?.role === 'ADMIN' }), [user, login, logout, setRole]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
function useAuth() { return useContext(AuthContext); }

// ── Theme (light/dark) ────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('fe:theme') ||
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fe:theme', theme);
    // theme-color for PWA
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0A0A0B' : '#FFFFFF');
  }, [theme]);
  return [theme, setTheme];
}

// ── Nav definitions ───────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/inicio',      label: 'Inicio',    icon: 'home' },
  { to: '/productos',   label: 'Productos', icon: 'package' },
  { to: '/ventas',      label: 'Ventas',    icon: 'shopping-cart' },
  { to: '/reportes',    label: 'Reportes',  icon: 'bar-chart-3' },
];

function pageTitle(path) {
  if (path === '/inicio' || path === '/') return 'Inicio';
  if (path.startsWith('/productos/bajo-stock')) return 'Productos · bajo stock';
  if (path.startsWith('/productos/')) return 'Detalle de producto';
  if (path === '/productos') return 'Productos';
  if (path === '/ventas/nueva') return 'Nueva venta';
  if (path.startsWith('/ventas/')) return 'Detalle de venta';
  if (path === '/ventas') return 'Ventas';
  if (path === '/reportes') return 'Reportes';
  if (path === '/dev/components') return 'Showcase de componentes';
  return 'Ferretería';
}

// ── TopBar ────────────────────────────────────────────────────────────
function TopBar({ path, onNavigate, onOpenSidebar }) {
  const { user, setRole, logout } = useAuth();
  const [theme, setTheme] = useTheme();
  const [roleMenu, setRoleMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  return (
    <header className="topbar">
      <button className="iconbtn" aria-label="Abrir menú" onClick={onOpenSidebar} style={{ '@media': '' }}>
        <Icon name="menu" />
      </button>
      <a className="topbar-brand" href="#/inicio" aria-label="Ir al inicio">
        <span className="topbar-brand-mark" aria-hidden="true">F</span>
        <span style={{ display: 'none' }} className="brand-text-md">Ferretería</span>
      </a>
      <h1 className="topbar-title" style={{ fontSize: 'var(--fs-base)' }}>{pageTitle(path)}</h1>
      <div className="topbar-actions">
        <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        <div style={{ position: 'relative' }}>
          <button
            className="role-pill"
            data-role={user?.role}
            aria-haspopup="menu"
            aria-expanded={roleMenu}
            onClick={() => setRoleMenu(v => !v)}
            title="Cambiar rol (demo)"
          >
            <span className="role-dot" aria-hidden="true" />
            <span>{user?.role}</span>
            <Icon name="chevron-down" size={14} />
          </button>
          {roleMenu && (
            <div role="menu" style={{
              position: 'absolute', right: 0, top: 'calc(100% + 4px)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)', boxShadow: 'var(--elev-2)',
              padding: 'var(--sp-1)', minWidth: 220, zIndex: 100,
            }} onMouseLeave={() => setRoleMenu(false)}>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)', padding: 'var(--sp-2) var(--sp-3)' }}>
                Vista de demostración — cambia rol para ver la UI por permisos
              </div>
              {['ADMIN', 'EMPLEADO'].map(r => (
                <button
                  key={r} role="menuitemradio" aria-checked={user?.role === r}
                  onClick={() => { setRole(r); setRoleMenu(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                    width: '100%', padding: 'var(--sp-2) var(--sp-3)',
                    border: 0, background: 'transparent', cursor: 'pointer',
                    fontSize: 'var(--fs-sm)', borderRadius: 'var(--r-sm)',
                    minHeight: 'var(--hit-min)', textAlign: 'left',
                    color: 'var(--fg)',
                  }}
                >
                  <Icon name={r === 'ADMIN' ? 'user' : 'users'} size={16} />
                  <span style={{ flex: 1 }}>{r}</span>
                  {user?.role === r && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <IconButton icon="user" label="Mi cuenta" onClick={() => setUserMenu(v => !v)} />
          {userMenu && (
            <div role="menu" style={{
              position: 'absolute', right: 0, top: 'calc(100% + 4px)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)', boxShadow: 'var(--elev-2)',
              padding: 'var(--sp-2)', minWidth: 220, zIndex: 100,
            }} onMouseLeave={() => setUserMenu(false)}>
              <div style={{ padding: 'var(--sp-2) var(--sp-3)' }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{user?.full_name}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-muted)' }}>{user?.email}</div>
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: 'var(--sp-1) 0' }} />
              <button onClick={logout} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                width: '100%', padding: 'var(--sp-2) var(--sp-3)',
                border: 0, background: 'transparent', cursor: 'pointer',
                fontSize: 'var(--fs-sm)', borderRadius: 'var(--r-sm)',
                minHeight: 'var(--hit-min)', color: 'var(--danger)', textAlign: 'left',
              }}>
                <Icon name="log-out" size={16} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Sidebar (desktop) ─────────────────────────────────────────────────
function Sidebar({ path }) {
  const { isAdmin } = useAuth();
  return (
    <aside className="sidebar" aria-label="Navegación principal">
      <div className="sidebar-section">Principal</div>
      <nav>
        {NAV_ITEMS.map(it => (
          <a key={it.to} className="sidebar-link" href={'#' + it.to}
             aria-current={path === it.to || path.startsWith(it.to + '/') ? 'page' : undefined}>
            <Icon name={it.icon} />
            <span>{it.label}</span>
          </a>
        ))}
      </nav>
      <div className="sidebar-section">Productos</div>
      <a className="sidebar-link" href="#/productos/bajo-stock"
         aria-current={path === '/productos/bajo-stock' ? 'page' : undefined}>
        <Icon name="alert-triangle" />
        <span>Bajo stock</span>
      </a>
      {isAdmin && (
        <>
          <div className="sidebar-section">Desarrollo</div>
          <a className="sidebar-link" href="#/dev/components"
             aria-current={path === '/dev/components' ? 'page' : undefined}>
            <Icon name="sliders" />
            <span>Showcase</span>
          </a>
        </>
      )}
    </aside>
  );
}

// ── BottomNav (mobile) ────────────────────────────────────────────────
function BottomNav({ path }) {
  return (
    <nav className="bottomnav" aria-label="Navegación inferior">
      {NAV_ITEMS.map(it => {
        const active = path === it.to || path.startsWith(it.to + '/');
        return (
          <a key={it.to} className="bottomnav-item" href={'#' + it.to}
             aria-current={active ? 'page' : undefined}>
            <Icon name={it.icon} size={22} />
            <span>{it.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────
function AppShell({ children, path, navigate }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <div className="shell">
      <a href="#main" className="skip-link" onClick={(e) => {
        e.preventDefault();
        document.getElementById('main')?.focus();
      }}>Saltar al contenido principal</a>
      <TopBar path={path} onNavigate={navigate} onOpenSidebar={() => setSheetOpen(true)} />
      <div className="shell-body">
        <Sidebar path={path} />
        <main id="main" className="main" tabIndex="-1">
          <div className="main-narrow">{children}</div>
        </main>
      </div>
      <BottomNav path={path} />
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Menú">
        <MobileMenu path={path} onNavigate={(to) => { setSheetOpen(false); navigate(to); }} />
      </Sheet>
    </div>
  );
}

function MobileMenu({ path, onNavigate }) {
  const { user, isAdmin, logout } = useAuth();
  const items = [
    ...NAV_ITEMS,
    { to: '/productos/bajo-stock', label: 'Bajo stock', icon: 'alert-triangle' },
    isAdmin && { to: '/dev/components', label: 'Showcase de componentes', icon: 'sliders' },
  ].filter(Boolean);
  return (
    <div className="col" style={{ gap: 'var(--sp-2)' }}>
      <div className="card" style={{ padding: 'var(--sp-3)' }}>
        <div style={{ fontWeight: 600 }}>{user?.full_name}</div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>{user?.email} · {user?.role}</div>
      </div>
      {items.map(it => (
        <a key={it.to} className="sidebar-link" href={'#' + it.to}
           onClick={(e) => { e.preventDefault(); onNavigate(it.to); }}
           aria-current={path === it.to ? 'page' : undefined}>
          <Icon name={it.icon} />
          <span>{it.label}</span>
        </a>
      ))}
      <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', color: 'var(--danger)' }} onClick={logout}>
        <Icon name="log-out" /> Cerrar sesión
      </button>
    </div>
  );
}

Object.assign(window, {
  useHashRoute, matchRoute,
  AuthProvider, useAuth, useTheme,
  AppShell, TopBar, Sidebar, BottomNav,
  pageTitle, NAV_ITEMS,
});
