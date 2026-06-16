import { AuditLogsService } from './audit-logs.service';

describe('AuditLogsService', () => {
  let prisma: any;
  let service: AuditLogsService;

  beforeEach(() => {
    prisma = {
      auditLog: { count: jest.fn(), findMany: jest.fn() },
    };
    service = new AuditLogsService(prisma);
    jest.clearAllMocks();
  });

  it('list: mapea username (o "Sistema" si no hay usuario) y forma DRF', async () => {
    prisma.auditLog.count.mockResolvedValue(2);
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 7,
        user: { username: 'admin_test' },
        action: 'CREATE',
        appLabel: 'sales',
        modelName: 'sale',
        objectId: '99',
        objectRepr: 'Venta #99',
        changedFields: null,
        timestamp: new Date('2026-06-15T10:00:00Z'),
        ipAddress: '1.2.3.4',
      },
      {
        id: 2,
        userId: null,
        user: null,
        action: 'UPDATE',
        appLabel: 'finances',
        modelName: 'expense',
        objectId: '5',
        objectRepr: 'Gasto #5',
        changedFields: { amount: { old: '1', new: '2' } },
        timestamp: new Date('2026-06-15T11:00:00Z'),
        ipAddress: null,
      },
    ]);

    const req: any = { query: {} };
    const res = await service.list(req);

    expect(res.count).toBe(2);
    expect(res.results[0]).toMatchObject({
      id: 1,
      username: 'admin_test',
      action: 'CREATE',
      model_name: 'sale',
      object_repr: 'Venta #99',
    });
    // sin usuario -> "Sistema"
    expect(res.results[1].username).toBe('Sistema');
    expect(res.results[1].changed_fields).toEqual({ amount: { old: '1', new: '2' } });
  });

  it('list: aplica filtros action/model_name/username y rango de fecha', async () => {
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.auditLog.findMany.mockResolvedValue([]);

    const req: any = {
      query: {
        action: 'DELETE',
        model_name: 'Sale',
        username: 'admin',
        timestamp_from: '2026-06-01',
      },
    };
    await service.list(req);

    const where = prisma.auditLog.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('DELETE');
    expect(JSON.stringify(where)).toContain('insensitive');
  });
});
