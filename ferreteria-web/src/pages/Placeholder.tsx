import { Icon } from '../components/Icon';

export function Placeholder({ title }: { title: string }) {
  return (
    <div className="placeholder-view">
      <Icon name="package" size={40} />
      <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--fg)' }}>
        {title}
      </h2>
      <p>Esta sección se migrará en una fase posterior del frontend React.</p>
    </div>
  );
}
