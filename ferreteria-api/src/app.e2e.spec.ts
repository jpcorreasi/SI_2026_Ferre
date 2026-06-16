import { randomBytes } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// --- Configura entorno ANTES de cargar el modulo (dotenv no pisa process.env) ---
const FERNET_KEY = randomBytes(32).toString('base64url');
process.env.JWT_SECRET = 'test-secret';
process.env.FIELD_ENCRYPTION_KEY = FERNET_KEY;
process.env.JWT_ACCESS_TTL = '5m';
process.env.JWT_REFRESH_TTL = '24h';

import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { Fernet } from './common/crypto/fernet';
import { makePassword } from './common/crypto/django-password';

// Usuarios de prueba (hash PBKDF2 estilo Django generado por nuestro util).
const ADMIN = {
  id: 1,
  username: 'admin_test',
  password: makePassword('Admin1234!'),
  email: 'a@x.co',
  firstName: 'Ada',
  lastName: 'Min',
  role: 'ADMIN',
  isActive: true,
  failedLoginAttempts: 0,
  lockedUntil: null,
};
const EMP = {
  ...ADMIN,
  id: 2,
  username: 'empleado_test',
  role: 'EMPLEADO',
};

const CUSTOMER = {
  id: 10,
  fullName: 'Juan Pérez',
  documentType: 'CC',
  documentNumber: new Fernet(FERNET_KEY).encrypt('1098765432'),
  email: 'juan@x.co',
  phone: '300',
  address: 'Calle 1',
  isActive: true,
  createdById: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

function buildPrismaMock() {
  const byUsername: Record<string, any> = {
    admin_test: ADMIN,
    empleado_test: EMP,
  };
  const byId: Record<number, any> = { 1: ADMIN, 2: EMP };
  return {
    user: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          where.username ? byUsername[where.username] : byId[where.id],
        ),
      ),
      update: jest.fn(() => Promise.resolve(ADMIN)),
    },
    auditSession: {
      create: jest.fn(() => Promise.resolve({ id: 1 })),
      findFirst: jest.fn(() => Promise.resolve(null)),
      update: jest.fn(() => Promise.resolve({})),
    },
    customer: {
      count: jest.fn(() => Promise.resolve(1)),
      findMany: jest.fn(() => Promise.resolve([CUSTOMER])),
    },
    auditLog: { create: jest.fn(() => Promise.resolve({})) },
  };
}

describe('Ferreteria API (F2 + F3)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(buildPrismaMock())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('GET /api/health es publico', async () => {
    await request(server()).get('/api/health').expect(200);
  });

  it('GET /api/users sin token -> 401', async () => {
    await request(server()).get('/api/users').expect(401);
  });

  it('login con credenciales correctas -> 200 + tokens', async () => {
    const res = await request(server())
      .post('/api/token/')
      .send({ username: 'admin_test', password: 'Admin1234!' })
      .expect(200);
    expect(res.body.access).toBeDefined();
    expect(res.body.refresh).toBeDefined();
    expect(res.body.user).toMatchObject({ username: 'admin_test', role: 'ADMIN' });
  });

  it('login con credenciales incorrectas -> 401', async () => {
    await request(server())
      .post('/api/token/')
      .send({ username: 'admin_test', password: 'mala' })
      .expect(401);
  });

  async function tokenFor(username: string, password: string) {
    const res = await request(server())
      .post('/api/token/')
      .send({ username, password });
    return res.body.access as string;
  }

  it('ADMIN ve document_number descifrado en /api/customers', async () => {
    const token = await tokenFor('admin_test', 'Admin1234!');
    const res = await request(server())
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.count).toBe(1);
    expect(res.body.results[0].document_number).toBe('1098765432');
    expect(res.body).toHaveProperty('next');
    expect(res.body).toHaveProperty('previous');
  });

  it('EMPLEADO ve document_number enmascarado en /api/customers', async () => {
    const token = await tokenFor('empleado_test', 'Admin1234!');
    const res = await request(server())
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.results[0].document_number).toBe('***');
  });

  it('EMPLEADO no puede crear categorias (solo ADMIN) -> 403', async () => {
    const token = await tokenFor('empleado_test', 'Admin1234!');
    await request(server())
      .post('/api/categories/')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' })
      .expect(403);
  });
});
