import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SidebarNav } from './SidebarNav';
import { TITLES } from './nav';
import { Icon } from '../Icon';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

function UserFooter() {
  const { user, logout } = useAuth();
  const initials = (user?.full_name || user?.username || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="sidebar-footer">
      <div className="sidebar-user">
        <div className="sidebar-avatar">{initials}</div>
        <div className="sidebar-user-info">
          <strong>{user?.full_name || user?.username}</strong>
          <span>{user?.role === 'ADMIN' ? 'Administrador' : 'Empleado'}</span>
        </div>
      </div>
      <button className="nbtn nbtn-ghost nbtn-sm nbtn-block" onClick={logout}>
        <Icon name="log-out" size={16} /> Cerrar sesión
      </button>
    </div>
  );
}

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();

  const title =
    TITLES[location.pathname] ??
    (location.pathname.startsWith('/ventas/nueva') ? 'Nueva venta' : 'Ferretería');

  return (
    <div id="app">
      <aside id="sidebar">
        <SidebarNav />
        <UserFooter />
      </aside>

      <div id="main">
        <header id="topbar">
          <button
            id="hamburger"
            className="icon-btn-bare"
            onClick={() => setDrawerOpen(true)}
            aria-label="Menú"
          >
            <Icon name="menu" size={22} />
          </button>
          <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>{title}</h2>
          <div style={{ flex: 1 }} />
          <button
            className="icon-btn-bare"
            onClick={toggle}
            aria-label="Cambiar tema"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
          </button>
        </header>

        <main id="content">
          <Outlet />
        </main>
      </div>

      {drawerOpen && (
        <>
          <div className="fe-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="fe-drawer">
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            <UserFooter />
          </div>
        </>
      )}
    </div>
  );
}
