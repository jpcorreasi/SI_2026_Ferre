import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Icon } from '../components/Icon';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ kind: 'danger' | 'warning'; title: string; body: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (!username || !password) {
      setAlert({ kind: 'danger', title: 'Datos incompletos', body: 'Ingresa usuario y contraseña.' });
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        setAlert({
          kind: 'warning',
          title: 'Cuenta bloqueada',
          body: err.message || 'Demasiados intentos fallidos. Intenta más tarde.',
        });
      } else if (err instanceof ApiError && err.status === 401) {
        setAlert({ kind: 'danger', title: 'Credenciales inválidas', body: 'Verifica tu usuario y contraseña.' });
      } else {
        setAlert({ kind: 'danger', title: 'Error', body: (err as Error).message });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="login-screen" className="active">
      <div className="login-wrap">
        <div className="login-header">
          <div className="login-brand-mark">F</div>
          <h1>Ferretería</h1>
          <p>Punto de venta y gestión de inventario</p>
        </div>

        <form className="login-card" onSubmit={onSubmit}>
          <h2>Iniciar sesión</h2>

          {alert && (
            <div className={`login-alert login-alert-${alert.kind} active`}>
              <Icon name={alert.kind === 'warning' ? 'alert-triangle' : 'alert-circle'} size={16} />
              <div>
                <div className="login-alert-title">{alert.title}</div>
                <div className="login-alert-body">{alert.body}</div>
              </div>
            </div>
          )}

          <div className="field">
            <label className="field-label">Usuario</label>
            <div className="input-wrap">
              <input
                type="text"
                autoComplete="username"
                placeholder="admin_test"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label">Contraseña</label>
            <div className="input-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPwd((s) => !s)}
                aria-label={showPwd ? 'Ocultar' : 'Mostrar'}
              >
                <Icon name={showPwd ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
          </div>

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <div className="login-footer">Ferretería SI-2026 · v2.0 (React + TypeScript)</div>
      </div>
    </div>
  );
}
