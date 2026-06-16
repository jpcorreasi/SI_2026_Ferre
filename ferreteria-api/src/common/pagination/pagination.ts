import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Paginacion identica a config.pagination.StandardPagination (DRF):
 *   - ?page=N (1-based), ?page_size=N (default 20, max 200)
 *   - respuesta { count, next, previous, results }
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 200;

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function parsePageParams(req: Request): PageParams {
  const page = toPositiveInt(req.query.page, 1, 'page');
  const requested = req.query.page_size
    ? toPositiveInt(req.query.page_size, DEFAULT_PAGE_SIZE, 'page_size')
    : DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(requested, MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export function buildPaginated<T>(
  req: Request,
  count: number,
  results: T[],
  params: PageParams,
): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(count / params.pageSize));
  return {
    count,
    next: params.page < totalPages ? pageUrl(req, params.page + 1) : null,
    previous: params.page > 1 ? pageUrl(req, params.page - 1) : null,
    results,
  };
}

function pageUrl(req: Request, page: number): string {
  const proto =
    (req.headers['x-forwarded-proto'] as string)?.split(',')[0] ?? req.protocol;
  const host = req.get('host');
  const url = new URL(`${proto}://${host}${req.baseUrl}${req.path}`);
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'page') continue;
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, String(v)));
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set('page', String(page));
  return url.toString();
}

function toPositiveInt(raw: unknown, fallback: number, field: string): number {
  if (raw === undefined) {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException(`Parametro '${field}' invalido.`);
  }
  return n;
}
