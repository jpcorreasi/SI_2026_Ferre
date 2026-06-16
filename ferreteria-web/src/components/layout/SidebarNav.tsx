import { NavLink } from 'react-router-dom';
import { NAV } from './nav';
import { Icon } from '../Icon';
import { useAuth } from '../../context/AuthContext';

/** Contenido de navegación reutilizado por el sidebar y el drawer móvil. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin } = useAuth();

  return (
    <>
      <div className="sidebar-logo">
        <div className="sidebar-brand-mark">F</div>
        <div className="sidebar-logo-text">
          <strong>Ferretería</strong>
          <span>Gestión · v2.0</span>
        </div>
      </div>

      <nav style={{ flex: 1, padding: 'var(--sp-2)' }}>
        {NAV.map((section) => {
          const items = section.items.filter((i) => !i.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={section.title}>
              <div className="sidebar-section">{section.title}</div>
              <ul style={{ listStyle: 'none' }}>
                {items.map((item) => (
                  <li className="nav-item" key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/ventas'}
                      onClick={onNavigate}
                      className={({ isActive }) => (isActive ? 'active' : '')}
                    >
                      <Icon name={item.icon} size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </>
  );
}
