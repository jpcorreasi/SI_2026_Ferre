import { Icon } from '../Icon';

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="state-block">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state-block state-error">
      <Icon name="alert-triangle" size={20} />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ message = 'Sin resultados.' }: { message?: string }) {
  return (
    <div className="state-block">
      <Icon name="info" size={20} />
      <span>{message}</span>
    </div>
  );
}
