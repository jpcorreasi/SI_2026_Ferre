import { tokens } from './auth';

/**
 * Descarga un archivo protegido (PDF/CSV) adjuntando el JWT, lo recibe como
 * Blob y dispara la descarga vía object URL — paridad con el patrón del SPA
 * (el header Authorization no puede ir en un <a download> normal).
 *
 * @param mode 'download' fuerza la descarga; 'open' lo abre en otra pestaña.
 */
export async function authedDownload(
  path: string,
  mode: 'download' | 'open' = 'download',
  fallbackName = 'archivo',
): Promise<void> {
  const access = tokens.access();
  const res = await fetch(`/api${path}`, {
    headers: access ? { Authorization: `Bearer ${access}` } : {},
  });
  if (!res.ok) throw new Error(`Error ${res.status} al descargar el archivo.`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  if (mode === 'open') {
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const cd = res.headers.get('Content-Disposition') ?? '';
  const match = cd.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : fallbackName;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
