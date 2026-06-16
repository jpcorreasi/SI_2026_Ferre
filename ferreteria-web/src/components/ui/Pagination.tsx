interface PaginationProps {
  count: number;
  page: number;
  pageSize?: number;
  onPage: (page: number) => void;
}

/** Paginador para la forma DRF {count,next,previous,results}. */
export function Pagination({ count, page, pageSize = 20, onPage }: PaginationProps) {
  if (!count) return null;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button
        className="nbtn nbtn-ghost nbtn-sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ← Anterior
      </button>
      <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>
        Página {page} de {totalPages} · {count} resultados
      </span>
      <button
        className="nbtn nbtn-ghost nbtn-sm"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Siguiente →
      </button>
    </div>
  );
}
