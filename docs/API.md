# API REST — Ferretería

Documentación de los endpoints expuestos por el backend Django + DRF.

- **Base URL (dev)**: `http://127.0.0.1:8000`
- **Prefijo API**: `/api/`
- **Autenticación**: JWT (Bearer) vía `djangorestframework-simplejwt`
- **Roles**: `ADMIN` · `EMPLEADO` (campo `role` en `CustomUser`)
- **Paginación por defecto**: `PageNumberPagination` con `page_size=20` (override con `?page_size=N`, `?page=N`)
- **Backends de filtro globales**: `DjangoFilterBackend` + `SearchFilter` (?search=) + `OrderingFilter` (?ordering=)
- **Idioma**: `es-co` · zona horaria `America/Bogotá`

---

## Tabla de contenidos

1. [Convenciones](#convenciones)
2. [Autenticación](#autenticación)
3. [Usuarios](#usuarios)
4. [Clientes](#clientes)
5. [Productos y categorías](#productos-y-categorías)
6. [Proveedores y órdenes de compra](#proveedores-y-órdenes-de-compra)
7. [Ventas](#ventas)
8. [Facturación](#facturación)
9. [Empleados y nómina](#empleados-y-nómina)
10. [Finanzas (caja, transacciones, gastos)](#finanzas)
11. [Servicios](#servicios)
12. [Auditoría](#auditoría)
13. [Reportes](#reportes)

---

## Convenciones

### Cabeceras

| Cabecera | Valor | Cuándo |
|---|---|---|
| `Authorization` | `Bearer <access_token>` | Todos los endpoints excepto `POST /api/token/` |
| `Content-Type` | `application/json` | En requests con body |

### Respuesta paginada

```json
{
  "count": 42,
  "next": "http://.../api/products/?page=2",
  "previous": null,
  "results": [ /* objetos */ ]
}
```

### Respuesta de error 400

```json
{ "field_name": ["mensaje"] }   // o
{ "detail": "mensaje" }
```

### Códigos HTTP usados

- `200 OK` — read / update exitoso
- `201 Created` — create exitoso
- `204 No Content` — destroy exitoso
- `400 Bad Request` — validación / regla de negocio fallida
- `401 Unauthorized` — falta o expiró el token (intenta `/api/token/refresh/`)
- `403 Forbidden` — autenticado pero sin permisos para el recurso
- `404 Not Found` — recurso no existe
- `423 Locked` — cuenta bloqueada por 5 intentos fallidos de login

### Permisos por rol

| Permiso | Significado |
|---|---|
| `IsAuthenticated` | Cualquier sesión válida (ADMIN o EMPLEADO) |
| `IsAdminRole` | Solo `role == 'ADMIN'` |
| `IsAdminOrReadOnly` | ADMIN puede CRUD; EMPLEADO solo GET |

---

## Autenticación

### `POST /api/token/`

Login. **Público** (no requiere Authorization).

**Body**:
```json
{ "username": "admin_test", "password": "Admin1234!" }
```

**Response 200**:
```json
{
  "access":  "eyJhbGciOiJI...",
  "refresh": "eyJhbGciOiJI...",
  "user": {
    "id": 1,
    "username": "admin_test",
    "role": "ADMIN",
    "full_name": "Admin Test"
  }
}
```

**Errores**:
- `400` — falta `username` o `password`
- `401` — credenciales inválidas
- `423` — cuenta bloqueada (5 intentos fallidos → 30 min)
  ```json
  { "detail": "Cuenta bloqueada por demasiados intentos fallidos. Intente de nuevo en N minuto(s).",
    "locked_until": "2026-05-16T22:00:00Z" }
  ```

### `POST /api/token/refresh/`

Renueva el `access` token usando el `refresh`. **Público**.

**Body**: `{ "refresh": "<refresh_token>" }`
**Response 200**: `{ "access": "<new_access_token>" }` (o `{access, refresh}` si la rotación está activa)

### `POST /api/token/logout/`

Cierra la `AuditSession` abierta y opcionalmente blacklistea el refresh token. **`IsAuthenticated`**.

**Body** (opcional): `{ "refresh": "<refresh_token>" }`
**Response 200**: `{ "detail": "Sesion cerrada exitosamente." }`

---

## Usuarios

`UserViewSet` — **`IsAdminRole`** en todos los métodos.

| Verbo | Ruta | Acción |
|---|---|---|
| `GET` | `/api/users/` | list (paginado) |
| `POST` | `/api/users/` | create |
| `GET` | `/api/users/{id}/` | retrieve |
| `PUT` | `/api/users/{id}/` | update completo |
| `PATCH` | `/api/users/{id}/` | update parcial |
| `DELETE` | `/api/users/{id}/` | destroy |

Ordering default: `username`.

---

## Clientes

`CustomerViewSet`. Document number cifrado con Fernet (`EncryptedCharField`).

| Verbo | Ruta | Permiso | Notas |
|---|---|---|---|
| `GET` | `/api/customers/` | `IsAuthenticated` | EMPLEADO ve `document_number: '***'` |
| `POST` | `/api/customers/` | `IsAdminRole` | |
| `GET` | `/api/customers/{id}/` | `IsAuthenticated` | EMPLEADO ve documento enmascarado |
| `PUT` | `/api/customers/{id}/` | `IsAdminRole` | |
| `PATCH` | `/api/customers/{id}/` | `IsAuthenticated` | EMPLEADO solo puede modificar `email`, `phone`, `address` |
| `DELETE` | `/api/customers/{id}/` | `IsAdminRole` | |

**Body (create — ADMIN)**:
```json
{
  "full_name": "Juan Pérez",
  "document_type": "CC",      // CC | CE | NIT
  "document_number": "1234567890",
  "email": "juan@example.com",
  "phone": "3001234567",
  "address": "Calle 123",
  "is_active": true
}
```

**Filtros**: `?is_active=true|false`, `?document_type=CC|CE|NIT`
**Search**: `?search=` aplica a `full_name` + `email`
**Ordering**: `?ordering=full_name|-created_at`

---

## Productos y categorías

### Categorías — `CategoryViewSet` (**`IsAdminRole`**)

| Verbo | Ruta | Body |
|---|---|---|
| `GET` | `/api/categories/` | — |
| `POST` | `/api/categories/` | `{ "name": "Herramientas", "description": "" }` |
| `GET` | `/api/categories/{id}/` | — |
| `PUT` / `PATCH` | `/api/categories/{id}/` | mismo shape |
| `DELETE` | `/api/categories/{id}/` | — |

**Search**: `?search=name`

### Productos — `ProductViewSet`

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/products/` | `IsAuthenticated` (EMPLEADO recibe `ProductListSerializer` sin `cost_price`) |
| `POST` | `/api/products/` | `IsAuthenticated` (ambos roles crean) |
| `GET` | `/api/products/{id}/` | `IsAuthenticated` |
| `PUT` / `PATCH` | `/api/products/{id}/` | `IsAdminRole` |
| `DELETE` | `/api/products/{id}/` | `IsAdminRole` |
| `GET` | `/api/products/low-stock/` | `IsAuthenticated` (productos con `stock <= min_stock`) |

**Body (create)**:
```json
{
  "code": "MART-001",          // unique
  "name": "Martillo carpintero",
  "description": "",
  "category": 3,               // FK id
  "sale_price": "50000.00",
  "cost_price": "30000.00",    // opcional para EMPLEADO; default 0
  "stock": 20,
  "min_stock": 5,
  "supplier": 2,               // opcional
  "is_active": true
}
```

**Filtros**: `?category=N`, `?is_active=true|false`, `?min_price=N`, `?max_price=N`
**Search**: `?search=` aplica a `name` + `code`
**Ordering**: `?ordering=name|-sale_price|stock`

---

## Proveedores y órdenes de compra

### Proveedores — `SupplierViewSet` (**`IsAdminRole`**)

| Verbo | Ruta |
|---|---|
| `GET` / `POST` | `/api/suppliers/` |
| `GET` / `PUT` / `PATCH` / `DELETE` | `/api/suppliers/{id}/` |

**Body (create)**:
```json
{
  "business_name": "Proveedor S.A.",
  "nit": "900000001-1",        // unique
  "contact_name": "Pepe Picapiedra",
  "phone": "601-1234567",
  "email": "ventas@proveedor.co",
  "address": "Carrera 5 #6-7",
  "is_active": true
}
```

**Search**: `?search=` (business_name + contact_name + email)
**Ordering**: `?ordering=business_name`

### Órdenes de compra — `PurchaseOrderViewSet` (**`IsAdminRole`**)

| Verbo | Ruta | Acción |
|---|---|---|
| `GET` | `/api/purchase-orders/` | list (con nested items) |
| `POST` | `/api/purchase-orders/` | create + items atómico |
| `GET` | `/api/purchase-orders/{id}/` | retrieve |
| `PUT` / `PATCH` | `/api/purchase-orders/{id}/` | update header (sin items) |
| `DELETE` | `/api/purchase-orders/{id}/` | destroy |
| `POST` | `/api/purchase-orders/{id}/receive/` | **transiciona a `RECEIVED` y suma stock vía signal** |

**Body (create)**:
```json
{
  "supplier": 2,
  "notes": "Pedido urgente",
  "items": [
    { "product": 5, "quantity": 10, "unit_cost": "45000.00" },
    { "product": 8, "quantity": 2,  "unit_cost": "120000.00" }
  ]
}
```

Status válidos: `DRAFT` (default) · `SENT` · `RECEIVED` · `CANCELLED`.
`receive/` rechaza con 400 si la orden ya está `RECEIVED` o `CANCELLED`.

### Solicitudes de pedido — `OrderRequestViewSet`

Lista de productos que un EMPLEADO sugiere reordenar; luego ADMIN la revisa.

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/order-requests/` | `IsAuthenticated` |
| `POST` | `/api/order-requests/` | `IsAuthenticated` (ambos roles crean) |
| `GET` | `/api/order-requests/{id}/` | `IsAuthenticated` |
| `PUT` / `PATCH` / `DELETE` | `/api/order-requests/{id}/` | `IsAdminRole` |
| `POST` | `/api/order-requests/{id}/mark-reviewed/` | `IsAdminRole` (transiciona `PENDING → REVIEWED`) |

**Body (create)**:
```json
{
  "supplier": 2,
  "notes": "Faltan varios productos",
  "items": [
    { "product": 5, "quantity_requested": 20 },
    { "product": 8, "quantity_requested": 5, "notes": "Urgente" }
  ]
}
```

**Filtros**: `?supplier=N`, `?status=PENDING|REVIEWED`

---

## Ventas

### Métodos de pago — `PaymentMethodViewSet` (**`IsAdminOrReadOnly`**)

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/payment-methods/` | `IsAuthenticated` |
| `POST` | `/api/payment-methods/` | `IsAdminRole` |
| `GET` | `/api/payment-methods/{id}/` | `IsAuthenticated` |
| `PUT` / `PATCH` / `DELETE` | `/api/payment-methods/{id}/` | `IsAdminRole` |

Body: `{ "name": "Efectivo" }`

### Ventas — `SaleViewSet`

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/sales/` | `IsAuthenticated` |
| `POST` | `/api/sales/` | `IsAuthenticated` (employee = request.user) |
| `GET` | `/api/sales/{id}/` | `IsAuthenticated` |
| `PUT` / `PATCH` | `/api/sales/{id}/` | `IsAdminRole` (edita header + items con `SaleEditSerializer`) |
| `DELETE` | `/api/sales/{id}/` | `IsAdminRole` |
| `POST` | `/api/sales/{id}/cancel/` | `IsAdminRole` (transiciona a `CANCELLED` y restaura stock vía signal) |

**Body (create)** — `SaleCreateSerializer`:
```json
{
  "customer": 7,                    // null para "Venta al Público"
  "payment_method": 1,
  "is_anonymous": false,
  "items": [
    { "product": 5, "quantity": 2 },
    { "product": 8, "quantity": 1 }
  ]
}
```

El backend calcula `unit_price`, `subtotal`, `total` desde `Product.sale_price`. Si algún item supera el stock disponible → `400` con detalle por producto.

**Filtros**: `?status=PENDING|COMPLETED|CANCELLED`, `?payment_method=N`, `?date_from=YYYY-MM-DD`, `?date_to=YYYY-MM-DD`, `?sale_id=N`
**Search**: `?search=` (customer.full_name + id)
**Ordering**: `?ordering=sale_date|-total|id`

Campos read-only relevantes en la respuesta: `customer_name`, `payment_method_name`, `invoice_id` (null si no hay factura), `sent_by_email`, `email_sent_to`.

---

## Facturación

### Facturas de cliente — `CustomerInvoiceViewSet`

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/customer-invoices/` | `IsAuthenticated` |
| `POST` | `/api/customer-invoices/` | `IsAuthenticated` (generated_by = request.user) |
| `GET` | `/api/customer-invoices/{id}/` | `IsAuthenticated` |
| `PUT` / `PATCH` | `/api/customer-invoices/{id}/` | `IsAdminRole` |
| `DELETE` | `/api/customer-invoices/{id}/` | `IsAdminRole` |
| `GET` | `/api/customer-invoices/{id}/pdf/` | `IsAuthenticated` → `application/pdf` |
| `POST` | `/api/customer-invoices/{id}/send-email/` | `IsAuthenticated` |

**Body (create)**:
```json
{
  "sale": 42,           // FK a Sale (debe estar COMPLETED y sin factura previa)
  "discount": "0.00",   // ≤ 30% del total de la venta
  "tax": "0.00",
  "notes": ""
}
```

`invoice_number` se genera automáticamente con formato `FV-YYYYMMDD-NNNN`.

**Body (send-email)**:
```json
{ "recipient_email": "cliente@ejemplo.com" }
```
Rechaza si email ya fue enviado o si el formato es inválido.

**Edit (PATCH)** — campo extra `force_update: true` requerido si existen notas crédito activas o si la transacción cae en una caja cerrada.

**Search**: `?search=` (invoice_number + customer.full_name)
**Ordering**: `?ordering=issued_at|-total`

### Facturas de proveedor — `SupplierInvoiceViewSet` (**`IsAdminRole`**)

| Verbo | Ruta |
|---|---|
| `GET` / `POST` | `/api/supplier-invoices/` |
| `GET` / `PUT` / `PATCH` / `DELETE` | `/api/supplier-invoices/{id}/` |

**Body (create)** — incrementa stock de cada item y crea `Transaction(EXPENSE)`:
```json
{
  "supplier": 2,
  "supplier_invoice_number": "FAC-2025-001",  // unique por proveedor
  "received_at": "2026-05-15",
  "payment_status": "PENDING",                 // PENDING | PAID
  "tax": "0.00",
  "items": [
    { "product": 5, "quantity": 10, "unit_cost": "30000.00" }
  ]
}
```

**Filtros**: `?payment_status=PENDING|PAID`, `?supplier=N`
**Search**: `?search=` (supplier_invoice_number + supplier.business_name)
**Ordering**: `?ordering=received_at|-total|payment_status`

### Notas crédito — `CreditNoteViewSet`

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/credit-notes/` | `IsAuthenticated` |
| `POST` | `/api/credit-notes/` | `IsAdminRole` (devuelve stock + crea `Transaction(EXPENSE)`) |
| `GET` | `/api/credit-notes/{id}/` | `IsAuthenticated` |
| `PUT` / `PATCH` / `DELETE` | `/api/credit-notes/{id}/` | `IsAdminRole` |
| `GET` | `/api/credit-notes/{id}/pdf/` | `IsAuthenticated` → `application/pdf` |

**Body (create)**:
```json
{
  "sale": 42,                        // venta debe estar COMPLETED
  "reason": "Producto defectuoso",
  "items": [
    { "sale_item": 17, "quantity_returned": 2 }
  ]
}
```

`credit_note_number` se genera con formato `NC-YYYYMMDD-NNNN`. La cantidad devuelta no puede superar la cantidad vendida acumulada.

**Filtros**: `?sale=N`, `?status=ACTIVE|VOID`
**Search**: `?search=` (credit_note_number + customer.full_name)

---

## Empleados y nómina

### Empleados — `EmployeeViewSet` (**`IsAdminRole`**)

| Verbo | Ruta |
|---|---|
| `GET` / `POST` | `/api/employees/` |
| `GET` / `PUT` / `PATCH` / `DELETE` | `/api/employees/{id}/` |

**Body (create)** — crea atómicamente `CustomUser(role=EMPLEADO)` + `Employee`:
```json
{
  "username": "vendedor1",      // write-only — crea el user
  "password": "Pwd1234!",       // write-only — required en create
  "full_name": "María García",
  "document_type": "CC",        // CC | CE | NIT
  "document_number": "1234567890",
  "position": "Vendedora",
  "hire_date": "2026-05-01",
  "base_salary": "1500000.00",
  "phone": "3001234567",
  "is_active": true
}
```

EMPLEADO recibe `document_number` y `base_salary` enmascarados como `'***'` si llega a ver el endpoint (normalmente bloqueado por `IsAdminRole`).

**Search**: `?search=full_name|position`
**Ordering**: `?ordering=full_name|hire_date`

### Nóminas — `PayrollViewSet` (**`IsAdminRole`**)

| Verbo | Ruta | Acción |
|---|---|---|
| `GET` / `POST` | `/api/payrolls/` | list / create |
| `GET` / `PUT` / `PATCH` / `DELETE` | `/api/payrolls/{id}/` | CRUD |
| `POST` | `/api/payrolls/{id}/approve/` | `DRAFT → APPROVED` + auto-crea `Transaction(EXPENSE)` |

**Body (create)**:
```json
{
  "period_start": "2026-05-01",
  "period_end":   "2026-05-31",
  "total_amount": "8500000.00"
}
```

Status: `DRAFT` (default) · `APPROVED` · `PAID`. `approve/` rechaza si ya está `APPROVED` o `PAID`.

### Horarios laborales — `WorkScheduleViewSet`

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/work-schedules/` | `IsAuthenticated` (EMPLEADO ve solo su propio horario) |
| `POST` | `/api/work-schedules/` | `IsAdminRole` |
| `GET` | `/api/work-schedules/{id}/` | `IsAuthenticated` (filtrado a su empleado si EMPLEADO) |
| `PUT` / `PATCH` / `DELETE` | `/api/work-schedules/{id}/` | `IsAdminRole` |
| `POST` | `/api/work-schedules/{id}/copy-to-next-week/` | `IsAdminRole` |

**Body (create)** — atómico, crea schedule + shifts:
```json
{
  "employee": 3,
  "week_start": "2026-05-11",        // debe ser un lunes
  "notes": "",
  "shifts": [
    { "day_of_week": 1, "start_time": "08:00", "end_time": "17:00" },
    { "day_of_week": 2, "start_time": "08:00", "end_time": "17:00" }
  ]
}
```

`day_of_week`: 1 = Lunes … 7 = Domingo (no se permite duplicar día en un mismo schedule). `end_time` debe ser posterior a `start_time`. `week_start` no-lunes → 400.

**Ordering**: `?ordering=week_start|employee__full_name`

---

## Finanzas

### Transacciones — `TransactionViewSet` (**`IsAdminOrReadOnly`**)

Ledger central; muchas transacciones se crean automáticamente vía signals (no necesitas POST directo).

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/transactions/` | `IsAuthenticated` |
| `POST` | `/api/transactions/` | `IsAdminRole` |
| `GET` | `/api/transactions/{id}/` | `IsAuthenticated` |
| `PUT` / `PATCH` / `DELETE` | `/api/transactions/{id}/` | `IsAdminRole` |

**Body (create)**:
```json
{
  "type": "EXPENSE",                  // INCOME | EXPENSE
  "amount": "100000.00",
  "concept": "Pago servicios",
  "reference_type": "OTHER",          // SALE | SUPPLIER_INVOICE | PAYROLL | CREDIT_NOTE | WITHDRAWAL | EXPENSE | SERVICE | OTHER
  "reference_id": null,
  "transaction_date": "2026-05-16"
}
```

Ordering default: `-transaction_date, -created_at`.

### Caja — `CashRegisterViewSet`

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/cash-registers/` | `IsAuthenticated` |
| `POST` | `/api/cash-registers/` | `IsAuthenticated` (opened_by = request.user) |
| `GET` | `/api/cash-registers/{id}/` | `IsAuthenticated` |
| `PUT` / `PATCH` / `DELETE` | `/api/cash-registers/{id}/` | `IsAdminRole` |
| `GET` | `/api/cash-registers/{id}/balance/` | `IsAuthenticated` |
| `POST` | `/api/cash-registers/{id}/close/` | `IsAuthenticated` |
| `POST` | `/api/cash-registers/{id}/withdraw/` | `IsAdminRole` |

**Body (create — abrir)**: `{ "opening_amount": "50000.00" }` → status `OPEN`.

**`GET balance/`**:
```json
{
  "register_id": 12,
  "opening_amount": "50000.00",
  "income":  "320000.00",
  "expense": "15000.00",
  "balance": "355000.00",
  "status":  "OPEN"
}
```

**`POST close/`**: `{ "closing_amount": "350000.00" }` — calcula `expected_amount = opening + income - expense` y `difference = closing - expected`. Status → `CLOSED`.

**`POST withdraw/`**: `{ "amount": "20000.00", "concept": "Pago servicios" }` — crea `Transaction(EXPENSE, reference_type=WITHDRAWAL)`. Rechaza si la caja no está `OPEN` o si `amount > balance disponible`.

### Categorías de gasto — `ExpenseCategoryViewSet` (**`IsAdminRole`**)

| Verbo | Ruta |
|---|---|
| `GET` / `POST` | `/api/expense-categories/` |
| `GET` / `PUT` / `PATCH` / `DELETE` | `/api/expense-categories/{id}/` |

Body: `{ "name": "Servicios", "description": "" }`.

### Gastos — `ExpenseViewSet` (**`IsAdminRole`**)

| Verbo | Ruta |
|---|---|
| `GET` / `POST` | `/api/expenses/` |
| `GET` / `PUT` / `PATCH` / `DELETE` | `/api/expenses/{id}/` |

**Body (create)** — `post_save` signal mantiene un `Transaction(EXPENSE)` espejo:
```json
{
  "description": "Pago internet",
  "category": 4,
  "amount": "120000.00",
  "expense_date": "2026-05-16",
  "payment_method": "TRANSFER",      // CASH | CARD | TRANSFER | OTHER
  "receipt_reference": "FAC-001",
  "notes": ""
}
```

---

## Servicios

### Tipos de servicio — `ServiceTypeViewSet` (**`IsAdminOrReadOnly`**)

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/service-types/` | `IsAuthenticated` |
| `POST` | `/api/service-types/` | `IsAdminRole` |
| `GET` | `/api/service-types/{id}/` | `IsAuthenticated` |
| `PUT` / `PATCH` / `DELETE` | `/api/service-types/{id}/` | `IsAdminRole` |

Body: `{ "name": "Instalación", "description": "" }`.

### Servicios — `ServiceViewSet`

| Verbo | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/services/` | `IsAuthenticated` |
| `POST` | `/api/services/` | `IsAuthenticated` (registered_by = request.user; signal crea `Transaction(INCOME)`) |
| `GET` | `/api/services/{id}/` | `IsAuthenticated` |
| `PUT` / `PATCH` / `DELETE` | `/api/services/{id}/` | `IsAdminRole` |

**Body (create)**:
```json
{
  "service_type": 1,
  "customer": 7,
  "performed_by": 3,           // FK Employee (opcional)
  "description": "Instalación de duchas",
  "price": "180000.00",
  "service_date": "2026-05-16"
}
```

**Filtros**: `?service_type=N`, `?service_date_after=YYYY-MM-DD`, `?service_date_before=YYYY-MM-DD`
**Search**: `?search=` (description + customer.full_name + service_type.name)
**Ordering**: `?ordering=service_date|price|created_at`

---

## Auditoría

`AuditLogViewSet` — **`IsAdminRole`**, **read-only** (no POST/PATCH/DELETE).

| Verbo | Ruta |
|---|---|
| `GET` | `/api/audit-logs/` |
| `GET` | `/api/audit-logs/{id}/` |

Cada write de cualquier ViewSet con `AuditLogMixin` genera una entrada. En `UPDATE` el campo `changed_fields` lista diffs `{field: {old, new}}`.

**Filtros**:
- `?action=CREATE|UPDATE|DELETE`
- `?model_name=Customer` (iexact)
- `?username=admin` (icontains)
- `?timestamp_from=ISO`, `?timestamp_to=ISO`

**Search**: `?search=` (object_repr + model_name + user.username)
**Ordering**: `?ordering=-timestamp` (default)

---

## Reportes

Todos bajo `/api/reports/`. **Read-only** (solo GET).

### `GET /api/reports/sales-summary/` (**`IsAuthenticated`**)

Resumen de ventas en un rango. Query params: `?start=YYYY-MM-DD&end=YYYY-MM-DD` (opcionales, default último mes).

### `GET /api/reports/top-products/` (**`IsAuthenticated`**)

Productos más vendidos. Query: `?limit=N` (default 10).

### `GET /api/reports/low-stock/` (**`IsAuthenticated`**)

Productos con `stock <= min_stock`. Sin parámetros.

### `GET /api/reports/financial-balance/` (**`IsAdminRole`**)

Balance del mes. Query: `?month=1..12&year=YYYY` (default mes actual).

### `GET /api/reports/sales-by-payment/` (**`IsAdminRole`**)

Ventas agrupadas por método de pago con totales y porcentajes. Query: `?period=today|week|month|range` + `?start=YYYY-MM-DD&end=YYYY-MM-DD` para `range`.

⚠️ **Sensible a zona horaria** (`America/Bogotá` vs UTC). Las dos pruebas que la suite reporta como fallidas en `sales/tests.py` son por este boundary; no editar las fechas seeded para "arreglarlo".

### `GET /api/reports/sales-by-payment/export-csv/` (**`IsAdminRole`**)

CSV de la misma data, prefijado con UTF-8 BOM para Excel. Mismos query params.
`Content-Type: text/csv; charset=utf-8`

### `GET /api/reports/sales-by-payment/export-pdf/` (**`IsAdminRole`**)

PDF generado con ReportLab. Mismos query params. `Content-Type: application/pdf`.

---

## Comportamientos transversales

Estos efectos los disparan signals del backend, no tienes que llamarlos:

| Acción | Efecto |
|---|---|
| `POST /api/sales/` con items | Decrementa `product.stock` atómicamente (rollback si stock insuficiente) |
| `POST /api/sales/{id}/cancel/` | Restaura `product.stock` |
| `POST /api/purchase-orders/{id}/receive/` | Incrementa `product.stock` por cada `PurchaseOrderItem` |
| `POST /api/supplier-invoices/` | Incrementa stock y crea `Transaction(EXPENSE, reference_type=SUPPLIER_INVOICE)` |
| `POST /api/credit-notes/` | Restaura stock y crea `Transaction(EXPENSE, reference_type=CREDIT_NOTE)` |
| `POST /api/payrolls/{id}/approve/` | Crea `Transaction(EXPENSE, reference_type=PAYROLL)` |
| `POST /api/expenses/` | Crea/sincroniza `Transaction(EXPENSE, reference_type=EXPENSE)` |
| `POST /api/services/` | Crea/sincroniza `Transaction(INCOME, reference_type=SERVICE)` |
| `POST /api/cash-registers/{id}/withdraw/` | Crea `Transaction(EXPENSE, reference_type=WITHDRAWAL)` |
| 5 logins fallidos | `locked_until = now() + 30min` (`POST /api/token/` devuelve `423`) |
| Cualquier write via ViewSet | `AuditLogMixin` crea entrada en `AuditLog` con IP, user, diff de campos |

---

## Descargas de archivos (PDF/CSV) desde el frontend

Como las descargas requieren `Authorization: Bearer <token>` y `<a download>` no permite headers personalizados, el patrón en el SPA es:

```js
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
const blob = await res.blob();
const objUrl = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = objUrl; a.download = filename;
a.click();
URL.revokeObjectURL(objUrl);
```

Aplica a `customer-invoices/{id}/pdf/`, `credit-notes/{id}/pdf/`, `reports/sales-by-payment/export-csv/` y `export-pdf/`.
