# Ferretería API — NestJS + Prisma (migración desde Django/DRF)

Reescritura del backend Django/DRF (`../`) a **NestJS + Prisma + PostgreSQL**,
conservando el contrato de la API `/api/...` para que el SPA actual
(`../frontend/templates/frontend/index.html` y `mobile.html`) siga funcionando
sin cambios.

> Estado: **F0–F2 completas** (andamiaje, núcleo transversal y autenticación).
> Los módulos de negocio (F3+) aún no están portados. Ver "Hoja de ruta".

## Requisitos

- Node.js 20+ (probado con 24).
- PostgreSQL 14+.
- La **misma `FIELD_ENCRYPTION_KEY`** (clave Fernet) del proyecto Django, para
  poder descifrar los `document_number` migrados.

## Puesta en marcha

```bash
npm install
cp .env.example .env          # y completa DATABASE_URL, JWT_SECRET, FIELD_ENCRYPTION_KEY
npx prisma generate
npx prisma migrate dev --name init   # crea el esquema en Postgres
npm run start:dev             # API en http://localhost:3000/api
```

Verificación rápida: `GET http://localhost:3000/api/health` → `{ "status": "ok" }`.

## Comandos

```bash
npm run build            # compila TypeScript (nest build)
npm run start:dev        # dev con watch
npm test                 # Jest (unit)
npx prisma studio        # explorador de datos
npx prisma migrate dev   # crear/aplicar migración

# Comandos de gestión (paridad con los management commands de Django)
npm run seed             # datos de prueba (admin_test/Admin1234!, empleado_test/Emp1234!)
npm run validate         # 5 chequeos de integridad de datos
npm run readiness        # 6 condiciones de producción (exit 1 si falla)
```

## Arquitectura (equivalencias con Django)

| Django/DRF | Aquí |
|---|---|
| App + router | Módulo Nest + Controller |
| `signals.py` | Lógica explícita en el `service` dentro de `prisma.$transaction` |
| `AuditLogMixin` | `common/audit/AuditService` (diff `{old,new}`, traga errores) |
| `IsAdminRole`/permisos | `RolesGuard` + `@Roles('ADMIN')`; `JwtAuthGuard` global |
| `get_serializer_class` por rol | DTOs/mapeo por rol en el service |
| `EncryptedCharField` (Fernet) | `common/crypto/FieldCryptoService` (Fernet compatible) |
| Hash PBKDF2 de Django | `common/crypto/django-password` (verifica hashes migrados) |
| `PageNumberPagination` | `common/pagination` (`{count,next,previous,results}`) |
| `DjangoFilterBackend`/search/order | `common/filtering/query-builder` |
| simplejwt | `@nestjs/jwt` + Passport (`auth/`) |

### Compatibilidad criptográfica verificada

`src/common/crypto/fernet.ts` y `django-password.ts` se probaron **de forma
cruzada contra Python/Django**: un token Fernet y un hash PBKDF2 generados con
`cryptography`/Django se descifran y validan correctamente en Node. Esto permite
migrar datos sin recifrar y sin forzar reseteo de contraseñas.

## Hoja de ruta de migración

- [x] **F0** Andamiaje: proyecto, `schema.prisma` (28 modelos), Prisma, bootstrap.
- [x] **F1** Núcleo: cripto Fernet/PBKDF2, `AuditService`, paginación, filtros, guards.
- [x] **F2** Auth: login con bloqueo (HTTP 423), refresh, logout, `AuditSession`.
- [x] **F3** Catálogos base: `users` (ADMIN), `customers` (máscara/descifrado por rol),
      `categories` (ADMIN), `products` (`cost_price` por rol + `low-stock`),
      `suppliers` (ADMIN). Verificado por test e2e sin DB (`src/app.e2e.spec.ts`).
- [x] **F4** Operación (completo):
  - [x] **sales** + `payment-methods`: creación atómica con bloqueo `FOR UPDATE`,
        cálculo de total, decremento de stock, `Transaction` INCOME; edición con
        reconciliación de stock; `cancel` restaura stock + `Transaction` EXPENSE.
        Verificado en `sales.service.spec.ts`.
  - [x] `purchase-orders` (ADMIN, creación atómica de items; **incremento de stock**
        en la transición a `RECEIVED` vía `receive` o `PATCH` de estado) +
        `order-requests` (CRUD por rol, `mark-reviewed`). Verificado en
        `purchase-orders.service.spec.ts`.
  - [x] **invoicing**: `customer-invoices` (numeración atómica `FV-` con
        `pg_advisory_xact_lock`, total = venta − desc + IVA con tope 30%, PDF, `send-email`),
        `supplier-invoices` (items + **stock** + `Transaction(EXPENSE)`, update con delta neto),
        `credit-notes` (validación de cantidad devolible, numeración `NC-`, **restaura stock**,
        `Transaction(EXPENSE)`, PDF). PDFs con **pdfkit**. Verificado en `invoicing.service.spec.ts`.
  - [x] **finances**: `transactions` (read todos / write ADMIN), `cash-registers`
        (`close` = apertura + ingresos − egresos por `created_at`; `balance`; `withdraw`
        con validación de saldo → `Transaction(WITHDRAWAL)`), `expense-categories`,
        `expenses` (alta/edición sincroniza `Transaction(EXPENSE)`). Verificado en
        `finances.service.spec.ts`.
  - [x] **employees**: `employees` (el alta crea el `User` vinculado, documento cifrado),
        `payrolls` (`approve` DRAFT→APPROVED → `Transaction(EXPENSE)`), `work-schedules`
        (turnos anidados, validación lunes / día duplicado / hora, `copy-to-next-week`,
        EMPLEADO ve solo su horario). Verificado en `employees.service.spec.ts`.
  - [x] **services**: `service-types` (IsAdminOrReadOnly), `services`
        (alta/edición → `Transaction(INCOME)`). Verificado en `services.service.spec.ts`.
- [x] **F5** Reportes: `sales-summary`, `top-products`, `low-stock` (auth),
      `financial-balance`, `sales-by-payment` (+ `export-csv` con BOM y `export-pdf`)
      (ADMIN). Agregaciones con `groupBy`/`aggregate`, resolución de período
      (today/week/month) y filtrado de fechas TZ-Bogotá. Verificado en `reports.service.spec.ts`.
- [x] **F6** `audit-logs` (solo lectura, ADMIN; filtros action/model/username/fechas) +
      comandos `npm run seed` / `validate` / `readiness` (`scripts/`). Verificado en
      `audit-logs.service.spec.ts`.
- [ ] **F7** ETL de datos desde Django + verificación de paridad contra el SPA.

## Notas de paridad importantes

- **Bloqueo de cuenta:** se revisa `locked_until` **antes** de validar
  credenciales → **HTTP 423**; 5 fallos = bloqueo (`ACCOUNT_LOCKOUT_MINUTES`,
  por defecto 3 min, igual que el código Django actual).
- **`Transaction` con FK genérica** (`reference_type` + `reference_id`): se
  conserva el patrón; los signals que la creaban se reimplementan como llamadas
  explícitas en los services (F4).
- **Zona horaria** `America/Bogota`: el filtrado de fechas de reportes es
  sensible a TZ (ver F5).
- Tablas mapeadas a los nombres de Django (`@@map`) para que el ETL (F7) sea casi
  una copia directa.
