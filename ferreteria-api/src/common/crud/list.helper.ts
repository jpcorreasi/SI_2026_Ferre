import { Request } from 'express';
import {
  parsePageParams,
  buildPaginated,
  Paginated,
} from '../pagination/pagination';
import { buildPrismaQuery, QueryConfig } from '../filtering/query-builder';

/** Delegate minimo de Prisma (count + findMany) que necesita el helper. */
export interface CountFindDelegate {
  count(args: { where: Record<string, any> }): Promise<number>;
  findMany(args: {
    where: Record<string, any>;
    orderBy: Record<string, any>[];
    skip: number;
    take: number;
    include?: Record<string, any>;
  }): Promise<any[]>;
}

interface ListOptions {
  baseWhere?: Record<string, any>;
  include?: Record<string, any>;
}

/**
 * Lista paginada + filtros/busqueda/orden, con la forma de respuesta DRF
 * `{count, next, previous, results}`. `map` transforma cada fila al DTO de salida.
 */
export async function listPaginated<R>(
  req: Request,
  model: CountFindDelegate,
  config: QueryConfig,
  map: (row: any) => R,
  options: ListOptions = {},
): Promise<Paginated<R>> {
  const page = parsePageParams(req);
  const { where, orderBy } = buildPrismaQuery(req, config);

  const merged =
    options.baseWhere && Object.keys(options.baseWhere).length > 0
      ? { AND: [options.baseWhere, where] }
      : where;

  const [count, rows] = await Promise.all([
    model.count({ where: merged }),
    model.findMany({
      where: merged,
      orderBy: orderBy.length > 0 ? orderBy : [{ id: 'asc' }],
      skip: page.skip,
      take: page.take,
      include: options.include,
    }),
  ]);

  return buildPaginated(req, count, rows.map(map), page);
}
