// Formato es-CO (paridad con el SPA).

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export const fmtCOP = (v: number | string | null | undefined): string =>
  cop.format(Number(v ?? 0));

export const fmtDate = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('es-CO') : '—';

export const fmtDateTime = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleString('es-CO') : '—';

export const fmtNumber = (v: number | string | null | undefined): string =>
  new Intl.NumberFormat('es-CO').format(Number(v ?? 0));
