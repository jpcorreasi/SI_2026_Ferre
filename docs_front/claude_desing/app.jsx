/* App root — router, providers, tweaks panel. */

const { useState, useEffect, useMemo } = React;

const APP_TWEAKS = /*EDITMODE-BEGIN*/{
  "accent": "blue"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(APP_TWEAKS);

  // Apply accent → data-accent on <html>
  useEffect(() => {
    if (t.accent && t.accent !== 'blue') {
      document.documentElement.setAttribute('data-accent', t.accent);
    } else {
      document.documentElement.removeAttribute('data-accent');
    }
  }, [t.accent]);

  return (
    <AuthProvider>
      <ToastProvider>
        <Router />
        <TweaksPanel title="Tweaks">
          <TweakSection label="Tema">
            <TweakColor
              label="Acento"
              value={t.accent}
              options={[
                { value: 'blue',   color: '#2563EB' },
                { value: 'orange', color: '#EA580C' },
                { value: 'red',    color: '#DC2626' },
                { value: 'green',  color: '#15803D' },
              ].map(o => o.color)}
              onChange={(hex) => {
                const map = { '#2563EB': 'blue', '#EA580C': 'orange', '#DC2626': 'red', '#15803D': 'green' };
                setTweak('accent', map[hex.toUpperCase()] || 'blue');
              }}
            />
            <ThemeToggleTweak />
          </TweakSection>
        </TweaksPanel>
      </ToastProvider>
    </AuthProvider>
  );
}

function ThemeToggleTweak() {
  const [theme, setTheme] = useTheme();
  return (
    <TweakToggle
      label="Modo oscuro"
      value={theme === 'dark'}
      onChange={(on) => setTheme(on ? 'dark' : 'light')}
    />
  );
}

function Router() {
  const [path] = useHashRoute();
  const { user } = useAuth();

  // Auth guard
  if (!user) {
    return <LoginPage />;
  }
  if (path === '/login') {
    window.location.hash = '/inicio';
    return null;
  }

  // Routes
  let content = null;
  const params =
    matchRoute('/productos/:id', path);
  if (path === '/' || path === '/inicio') content = <DashboardPage />;
  else if (path === '/productos') content = <ProductsListPage />;
  else if (path === '/productos/bajo-stock') content = <ProductsListPage lowStockOnly />;
  else if (params) content = <ProductDetailPage id={params.id} />;
  else if (path === '/ventas') content = <SalesListPage />;
  else if (path === '/ventas/nueva') content = <NewSalePage />;
  else if (path === '/reportes') content = <ReportsPage />;
  else if (path === '/dev/components') content = <ShowcasePage />;
  else content = <EmptyState icon="alert-triangle" title="Ruta no encontrada" desc={`La ruta ${path} no existe.`} action={<a className="btn btn-secondary" href="#/inicio">Ir al inicio</a>} />;

  return (
    <AppShell path={path} navigate={(to) => window.location.hash = to}>
      {content}
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
