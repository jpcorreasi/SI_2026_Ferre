import { Request } from 'express';

/**
 * Traduce los parametros de consulta estilo DRF a `where`/`orderBy` de Prisma.
 *
 *   - SearchFilter:   ?search=texto  -> OR contains (insensitive) sobre searchFields
 *   - OrderingFilter: ?ordering=campo,-otro -> [{campo:'asc'},{otro:'desc'}]
 *   - DjangoFilterBackend: ?param=valor -> igualdad exacta sobre filterFields
 *
 * Los nombres que envia el cliente (snake_case, como DRF) se mapean al campo
 * Prisma (camelCase) mediante FieldMap. searchFields usa rutas Prisma directas
 * (admite 'category.name' para relaciones).
 */
export interface FieldMap {
  /** Nombre que envia el cliente (?param= o ?ordering=param). */
  param: string;
  /** Ruta del campo en Prisma (camelCase, admite punto para relaciones). */
  field: string;
}

export interface QueryConfig {
  searchFields?: string[];
  filterFields?: Array<string | FieldMap>;
  orderingFields?: Array<string | FieldMap>;
  defaultOrdering?: Record<string, 'asc' | 'desc'>[];
}

export interface PrismaQuery {
  where: Record<string, any>;
  orderBy: Record<string, any>[];
}

function normalize(entry: string | FieldMap): FieldMap {
  return typeof entry === 'string' ? { param: entry, field: entry } : entry;
}

function setDeep(target: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    node[parts[i]] = node[parts[i]] ?? {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

function buildLeaf(path: string, value: any): Record<string, any> {
  const obj: Record<string, any> = {};
  setDeep(obj, path, value);
  return obj;
}

function coerce(raw: string): any {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && /^-?\d+$/.test(raw)) {
    return Number(raw);
  }
  return raw;
}

export function buildPrismaQuery(req: Request, config: QueryConfig): PrismaQuery {
  const and: Record<string, any>[] = [];

  // --- DjangoFilterBackend: igualdad exacta sobre campos permitidos ---
  for (const entry of config.filterFields ?? []) {
    const { param, field } = normalize(entry);
    const raw = req.query[param];
    if (raw === undefined) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    and.push(buildLeaf(field, coerce(String(value))));
  }

  // --- SearchFilter: OR contains insensitive ---
  const searchRaw = req.query.search;
  const search = Array.isArray(searchRaw) ? searchRaw[0] : searchRaw;
  if (search && (config.searchFields?.length ?? 0) > 0) {
    const or = config.searchFields!.map((field) =>
      buildLeaf(field, { contains: String(search), mode: 'insensitive' }),
    );
    and.push({ OR: or });
  }

  const where = and.length > 0 ? { AND: and } : {};

  // --- OrderingFilter ---
  let orderBy = config.defaultOrdering ?? [];
  const orderingRaw = req.query.ordering;
  const ordering = Array.isArray(orderingRaw) ? orderingRaw[0] : orderingRaw;
  if (ordering) {
    const allowed = new Map(
      (config.orderingFields ?? []).map((e) => {
        const m = normalize(e);
        return [m.param, m.field];
      }),
    );
    const parsed = String(ordering)
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => {
        const desc = token.startsWith('-');
        const param = desc ? token.slice(1) : token;
        return { param, dir: desc ? 'desc' : ('asc' as 'asc' | 'desc') };
      })
      .filter((o) => allowed.has(o.param))
      .map((o) => buildLeaf(allowed.get(o.param)!, o.dir));
    if (parsed.length > 0) {
      orderBy = parsed;
    }
  }

  return { where, orderBy };
}
