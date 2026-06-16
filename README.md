# Ferretería SI-2026 — Sistema de Gestión

Sistema de gestión integral para una ferretería: inventario, ventas, facturación, proveedores, empleados, finanzas, servicios, gastos operativos, solicitudes de pedido y auditoría.

> **El proyecto fue refactorizado a una arquitectura full‑stack en Node.js + TypeScript (v2.0).**
> Backend **NestJS + Prisma + PostgreSQL** (`ferreteria-api/`) y frontend **React + TypeScript + Vite** (`ferreteria-web/`), unificando todo el stack en **un solo lenguaje: TypeScript**.

---

## Índice

1. [Versionado: v1 vs v2](#1-versionado-v1-vs-v2)
2. [Stack tecnológico (v2)](#2-stack-tecnológico-v2)
3. [Estructura del repositorio](#3-estructura-del-repositorio)
4. [Resultado de la refactorización](#4-resultado-de-la-refactorización)
5. [Arquitectura](#5-arquitectura)
6. [Puesta en marcha](#6-puesta-en-marcha)
7. [¿Por qué full‑stack Node.js + TypeScript?](#7-por-qué-full-stack-nodejs--typescript)
8. [Estado del proyecto](#8-estado-del-proyecto)
9. [Documentación detallada del proyecto](#9-documentación-detallada-del-proyecto) — *modelos, señales, endpoints, convenciones, seguridad*

---

## 1. Versionado: v1 vs v2

| | **v1.0** (original) | **v2.0** (refactorización) |
|---|---|---|
| **Backend** | Django 6 + Django REST Framework | **NestJS 10** (modular, inyección de dependencias) |
| **Lenguaje backend** | Python | **TypeScript** |
| **ORM / datos** | Django ORM | **Prisma 5** (esquema tipado, migraciones) |
| **Base de datos** | SQLite / PostgreSQL | **PostgreSQL** |
| **Frontend** | SPA monolítica en un solo `index.html` (vanilla JS, ~11.000 líneas) servida por Django | **React 18 + TypeScript + Vite** (SPA modular) |
| **Lenguaje frontend** | JavaScript (sin tipos, sin build) | **TypeScript** (tipado, con build) |
| **Lenguajes del stack** | Python **y** JavaScript | **TypeScript de extremo a extremo** |
| **Auth** | SimpleJWT | JWT (`@nestjs/jwt` + Passport) — login con bloqueo (HTTP 423) |
| **Validación** | Serializers DRF | class-validator / class-transformer |
| **Reglas de negocio** | `signals.py` | Lógica explícita en *services* dentro de `prisma.$transaction` |
| **Auditoría** | `AuditLogMixin` | `AuditService` (diff `{old,new}`) |
| **Permisos por rol** | Permission classes | Guards + `@Roles()` |
| **Cifrado de campos** | `EncryptedCharField` (Fernet) | Fernet **compatible** (misma clave, verificado contra Python) |
| **PDF (facturas/reportes)** | ReportLab | pdfkit |
| **Pruebas** | `manage.py test` | **Jest + Supertest** (68 ✓) |
| **Estado del servidor (front)** | DOM manual + `fetch` | **TanStack Query** (cache, refetch, paginación) |

**La v2 conserva el mismo contrato `/api/...`**, por lo que ambos frontends son intercambiables durante la transición.

---

## 2. Stack tecnológico (v2)

### Backend — `ferreteria-api/`
- **Runtime:** Node.js 24
- **Lenguaje:** TypeScript 5.5
- **Framework:** NestJS 10
- **ORM:** Prisma 5
- **Base de datos:** PostgreSQL
- **Auth/Seguridad:** JWT (Passport), bloqueo de cuenta, cifrado Fernet de campos sensibles, auditoría automática
- **PDF:** pdfkit · **Validación:** class-validator · **Pruebas:** Jest + Supertest

### Frontend — `ferreteria-web/`
- **Build:** Vite 5 · **UI:** React 18 · **Lenguaje:** TypeScript 5
- **Routing:** React Router 6 · **Estado servidor:** TanStack Query 5
- **Estilos:** design system propio portado (CSS variables + modo oscuro)

### Datos / migración — `etl/`
- Export desde Django (Python) → `dump.json` → import a PostgreSQL vía Prisma

---

## 3. Estructura del repositorio

```
Ferreteria/
├── ferreteria-api/      ⭐ v2 — Backend NestJS + Prisma (TypeScript)
│   ├── prisma/schema.prisma     (≈28 modelos, mapeados a las tablas de Django)
│   ├── src/modules/             (accounts, customers, products, sales, invoicing,
│   │                             finances, employees, services, suppliers, reports, audit)
│   ├── src/common/              (crypto Fernet/PBKDF2, auditoría, paginación, guards…)
│   ├── scripts/                 (seed, validate, readiness, etl-import)
│   ├── README.md  ·  ETL.md
│
├── ferreteria-web/      ⭐ v2 — Frontend React + TypeScript (Vite)
│   ├── src/  (pages, components, context, lib, types, styles)
│   └── README.md
│
├── etl/                 ⭐ v2 — Migración de datos Django → PostgreSQL
│   └── export_from_django.py
│
├── frontend/            v1 — SPA original (index.html) servida por Django
├── accounts/ customers/ products/ sales/ invoicing/ finances/
├── employees/ services/ suppliers/ reports/ audit/   v1 — apps Django
├── config/  manage.py  requirements.txt              v1 — proyecto Django
└── README.md
```

---

## 4. Resultado de la refactorización

Toda la funcionalidad de negocio se reescribió **con paridad verificada por pruebas**:

- **Backend (100% migrado):** ≈28 modelos, **más de 120 endpoints** en ~25 recursos REST + 7 reportes, **68 tests Jest** en verde.
  - Los **signals** de Django pasaron a lógica explícita en los *services* dentro de `prisma.$transaction` (decremento de stock atómico con `SELECT … FOR UPDATE`, sincronización del libro de `Transaction`, numeración atómica de facturas `FV-`/`NC-` con `pg_advisory_xact_lock`).
  - **Compatibilidad criptográfica con Django verificada de extremo a extremo** (Fernet + PBKDF2 con la misma clave/algoritmo) → se migran datos **sin recifrar ni resetear contraseñas**.
  - Auditoría, permisos por rol (ADMIN/EMPLEADO), bloqueo de cuenta (HTTP 423), exportación CSV (con BOM) y PDF.
- **Frontend (fundación + núcleo):** login (con manejo de 401/423), layout responsive con modo oscuro, cliente HTTP con **refresco automático de JWT**, y pantallas Dashboard, Productos y Ventas; el resto con ruta y menú listos.
- **Migración de datos:** scripts ETL que copian la BD de Django a PostgreSQL (los nombres de tabla/columna ya están alineados vía `@@map`).

> Métricas detalladas y comandos: [`ferreteria-api/README.md`](ferreteria-api/README.md) y [`ferreteria-web/README.md`](ferreteria-web/README.md).

---

## 5. Arquitectura

```
┌──────────────────────────┐      HTTP /api  (JWT Bearer)      ┌──────────────────────────┐
│  ferreteria-web (React)  │ ───────────────────────────────▶ │  ferreteria-api (NestJS) │
│  Vite · TanStack Query   │ ◀─────────────────────────────── │  Prisma · Guards · Audit │
└──────────────────────────┘        JSON (contrato DRF)        └────────────┬─────────────┘
                                                                            │ Prisma
                                                                            ▼
                                                                  ┌──────────────────┐
                                                                  │   PostgreSQL     │
                                                                  └──────────────────┘

   etl/ ── Django (datos v1) ──▶ dump.json ──▶ npm run etl:import ──▶ PostgreSQL
```

- El frontend es una SPA *stateless* que autentica con JWT y consume `/api/...`.
- El backend aplica permisos por rol, audita cada escritura y mantiene el libro contable (`Transaction`).
- Las reglas de negocio viven en *services* transaccionales (no en signals).

---

## 6. Puesta en marcha

### Backend (`ferreteria-api/`)
```bash
cd ferreteria-api
npm install
cp .env.example .env          # DATABASE_URL, JWT_SECRET, FIELD_ENCRYPTION_KEY
npx prisma migrate dev --name init
npm run seed                  # datos de prueba (admin_test / Admin1234!)
npm run start:dev             # API en http://localhost:3000/api
```

### Frontend (`ferreteria-web/`)
```bash
cd ferreteria-web
npm install
cp .env.example .env          # VITE_API_TARGET=http://localhost:3000
npm run dev                   # http://localhost:5173  (proxy /api -> backend)
```

### Migración de datos (opcional, desde la BD de Django)
```bash
python etl/export_from_django.py     # con el venv de Django -> etl/dump.json
cd ferreteria-api && npm run etl:import
```
Guía completa: [`ferreteria-api/ETL.md`](ferreteria-api/ETL.md).

---

## 7. ¿Por qué full‑stack Node.js + TypeScript?

El motor de la refactorización es tener **un único lenguaje (TypeScript) de extremo a extremo** — backend y frontend.

**🔧 Mantenibilidad (un solo lenguaje)**
- **Una sola base de conocimiento:** el mismo equipo trabaja back y front sin cambiar de mentalidad, sintaxis ni herramientas.
- **Tipos compartidos end‑to‑end:** un cambio en el contrato de la API **rompe la compilación** del front en vez de fallar en runtime.
- **Un único toolchain:** mismo gestor de paquetes (npm), linter/formatter (ESLint/Prettier), runner de tests (Jest) y CI.
- **Contratación y onboarding más simples:** se busca *un* perfil (TypeScript full‑stack) en lugar de Python **y** JavaScript.
- **Refactors seguros:** el tipado estático y el autocompletado (Prisma genera tipos del esquema) hacen verificables los renombres/movimientos.

**📈 Escalabilidad**
- **Concurrencia de I/O eficiente:** el modelo *event‑loop* no bloqueante de Node.js atiende muchas peticiones con menos recursos.
- **Arquitectura modular (NestJS):** módulos + DI para crecer en features, aislar dominios y, si hiciera falta, **extraer microservicios**.
- **Escalado horizontal sencillo:** procesos *stateless* (JWT) que se replican; encaja con contenedores y *serverless*.
- **Ecosistema unificado:** un solo registro (npm) para compartir validación, formato y lógica de dominio entre cliente y servidor.
- **Datos con Prisma:** migraciones versionadas y consultas tipadas reducen el SQL manual al evolucionar el esquema.

En conjunto: **menos fricción para mantener** (un lenguaje, un tooling, tipos compartidos) y **más capacidad de crecer** (concurrencia, modularidad, despliegue homogéneo).

---

## 8. Estado del proyecto

| Componente | Estado |
|---|---|
| Backend NestJS + Prisma (`ferreteria-api`) | ✅ **Completo** — 11 áreas migradas, 68 tests ✓ |
| Migración de datos (`etl`) | ✅ Scripts listos (ejecución contra tu PostgreSQL) |
| Frontend React (`ferreteria-web`) | 🟡 **Fundación + núcleo** (login, dashboard, productos, ventas); resto de pantallas en progreso |

**Roadmap del frontend:** nueva venta (carrito), clientes, servicios, solicitudes, horarios, facturas (cliente/proveedor), notas crédito, proveedores, órdenes de compra, empleados, nóminas, caja, gastos, transacciones, reportes, auditoría, usuarios. Todas ya tienen ruta y entrada de menú.

---

## 9. Documentación detallada del proyecto

> Documentación de dominio: modelos por aplicación, reglas de negocio, endpoints, filtros, auditoría, convenciones y seguridad. Escrita originalmente para la **v1 (Django)**; **sigue vigente para la v2**, que conserva el mismo modelo de datos y el mismo contrato de API. Donde se mencionan mecanismos de Django (signals, serializers, mixins), su equivalente en la v2 está en la [tabla v1 vs v2](#1-versionado-v1-vs-v2).

## Índice

1. [Estado actual del proyecto](#1-estado-actual-del-proyecto)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [Configuración (`config/settings.py`)](#4-configuración)
5. [Modelos por aplicación](#5-modelos-por-aplicación)
6. [Admin por aplicación](#6-admin-por-aplicación)
7. [Señales (signals)](#7-señales-signals)
8. [API — Permisos y serializers](#8-api--permisos-y-serializers)
9. [Endpoints de la API](#9-endpoints-de-la-api)
10. [Filtros, búsqueda y paginación](#10-filtros-búsqueda-y-paginación)
11. [Auditoría automática (AuditLogMixin)](#11-auditoría-automática-auditlogmixin)
12. [Grafo de dependencias entre apps](#12-grafo-de-dependencias-entre-apps)
13. [Convenciones de código](#13-convenciones-de-código)
14. [Seguridad y requerimientos no funcionales](#14-seguridad-y-requerimientos-no-funcionales)
15. [Puesta en marcha](#15-puesta-en-marcha)
16. [Tests](#16-tests)
17. [Trabajo pendiente](#17-trabajo-pendiente)

---

## 1. Estado actual del proyecto

| Capa | Estado | Detalle |
|---|---|---|
| `requirements.txt` | Completo | Ver §2 |
| Modelos (`models.py`) | Completo | Todas las apps incluyendo `services`, `ExpenseCategory`, `Expense`, `OrderRequest` |
| Admin (`admin.py`) | Completo | Todas las apps con inlines y readonly_fields |
| Señales (`signals.py`) | Completo | `accounts`, `sales`, `suppliers`, `employees`, `finances`, `services` |
| `config/settings.py` | Completo | `environ.Env()`, DRF, JWT, CORS, i18n, paginación, filtros, encriptación |
| Variables de entorno | Completo | `.env` + `.env.example` + `.gitignore` vía `django-environ` |
| Migraciones | Completo | Todas aplicadas; `finances` tiene `0004` y `0005` para gastos y servicios |
| Encriptación de campos | Completo | `EncryptedCharField` activo en `customers` y `employees`; clave Fernet en `.env` |
| `locked_until` en login | Completo | `LoginView` verifica lockout antes de autenticar; devuelve HTTP 423 |
| Serializers (`serializers.py`) | Completo | Todas las apps; variantes Admin/Empleado donde aplica |
| Vistas (`views.py`) | Completo | `ModelViewSet` + acciones extra + `AuditLogMixin` + FilterSets en todas las apps |
| Paginación global | Completo | `PageNumberPagination` — PAGE_SIZE=20 en todos los endpoints de lista |
| Filtros y búsqueda | Completo | `DjangoFilterBackend` + `SearchFilter` + `OrderingFilter` en ViewSets clave |
| URLs (`config/urls.py`) | Completo | Router + auth endpoints + reports |
| Permisos (`permissions.py`) | Completo | `IsAdminRole`, `IsAdminOrReadOnly`, `IsOwnerOrAdmin` |
| Auditoría automática | Completo | `AuditLogMixin` escribe `AuditLog` en CREATE / UPDATE / DELETE de todos los ViewSets |
| PDF de facturas | Completo | `GET /api/customer-invoices/{id}/pdf/` genera PDF real con ReportLab |
| PDF de reporte de ventas | Completo | `GET /api/reports/sales-by-payment/export-pdf/` genera PDF con tabla estilizada |
| Exportación CSV | Completo | `GET /api/reports/sales-by-payment/export-csv/` — UTF-8 BOM para Excel |
| Envío por email | Completo | `POST /api/customer-invoices/{id}/send-email/` marca `sent_by_email=True` |
| Gastos operativos | Completo | `ExpenseCategory` + `Expense`; signal auto-crea `Transaction(EXPENSE)` |
| Servicios | Completo | `ServiceType` + `Service`; signal auto-crea `Transaction(INCOME)` |
| Solicitudes de pedido | Completo | `OrderRequest` + `OrderRequestItem`; empleados crean, admin revisa |
| Reporte ventas por pago | Completo | Filtros por período (hoy/semana/mes/rango); totales + porcentajes + exportación |
| Configuración producción | Completo | `check_production_readiness` verifica 6 condiciones; sale código 1 si falla |
| Tests de integración | Completo | 113 tests — 10 apps — 111/113 passing (2 fallos de zona horaria UTC preexistentes) |
| Datos de prueba | Completo | `python manage.py seed_test_data` |
| Validaciones de datos | Completo | `python manage.py run_validation_checks` — 5/5 PASS |
| Frontend SPA | Completo | SPA de una sola página en `frontend/templates/frontend/index.html` (vanilla JS + Tailwind) |

---

## 2. Stack tecnológico

| Componente | Versión / Detalle |
|---|---|
| Python | Virtualenv en `venv/` |
| Django | 6.0.4 |
| Django REST Framework | Latest |
| Autenticación API | `djangorestframework-simplejwt` (JWT) |
| CORS | `django-cors-headers` |
| Encriptación de campos | `django-encrypted-model-fields` (activo, clave Fernet real en `.env`) |
| Variables de entorno | `django-environ` — `.env` en raíz del proyecto |
| Filtros/búsqueda | `django-filter` — `DjangoFilterBackend` global |
| PDF | `reportlab` — facturas de cliente y reporte de ventas por modalidad de pago |
| PostgreSQL (producción) | `psycopg2-binary` — activar via `DATABASE_URL` en `.env` |
| Imágenes | `Pillow` |
| Base de datos (dev) | SQLite 3 (`db.sqlite3`) |
| Frontend | SPA vanilla JS + Tailwind CDN — servido por Django como template estático |

### `requirements.txt`

```
Django==6.0.4
djangorestframework
djangorestframework-simplejwt
django-encrypted-model-fields
django-cors-headers
django-environ
django-filter
psycopg2-binary
reportlab
Pillow
```

---

## 3. Estructura del proyecto

```
Ferreteria/
├── .env                             Variables de entorno (NO en git)
├── .env.example                     Plantilla para nuevos desarrolladores
├── .gitignore
├── requirements.txt
├── manage.py
├── db.sqlite3                       SQLite con datos de prueba
├── config/
│   ├── settings.py                  environ.Env() + DRF + JWT + CORS + paginación + filtros
│   ├── urls.py                      Router + auth + reports
│   └── asgi.py / wsgi.py
├── accounts/
│   ├── models.py        Completo
│   ├── serializers.py   Completo
│   ├── views.py         Completo    LoginView, LogoutView, UserViewSet
│   ├── permissions.py   Completo    IsAdminRole, IsAdminOrReadOnly, IsOwnerOrAdmin
│   ├── signals.py       Completo
│   ├── admin.py         Completo
│   ├── tests.py         Completo    AccountLockoutTest (3 tests)
│   └── management/commands/
│       ├── seed_test_data.py
│       ├── run_validation_checks.py
│       └── check_production_readiness.py   6 verificaciones; exit 1 si falla
├── audit/
│   ├── models.py        Completo
│   ├── serializers.py   Completo
│   ├── mixins.py        Completo    AuditLogMixin — escribe en CREATE/UPDATE/DELETE
│   └── views.py         Completo    AuditLogViewSet (read-only) + AuditLogFilter
├── customers/
│   ├── models.py        Completo
│   ├── serializers.py   Completo    AdminCustomerSerializer, EmployeeCustomerSerializer
│   └── views.py         Completo    CustomerViewSet + CustomerFilter
├── products/
│   ├── models.py        Completo
│   ├── serializers.py   Completo    CategorySerializer, ProductSerializer, ProductListSerializer
│   └── views.py         Completo    CategoryViewSet, ProductViewSet (+low-stock) + ProductFilter
├── suppliers/
│   ├── models.py        Completo    Supplier, PurchaseOrder, PurchaseOrderItem, OrderRequest, OrderRequestItem
│   ├── serializers.py   Completo
│   ├── signals.py       Completo
│   └── views.py         Completo    SupplierViewSet, PurchaseOrderViewSet (+receive), OrderRequestViewSet (+mark-reviewed)
├── sales/
│   ├── models.py        Completo
│   ├── serializers.py   Completo    SaleSerializer, SaleCreateSerializer
│   ├── signals.py       Completo
│   ├── views.py         Completo    PaymentMethodViewSet, SaleViewSet (+cancel) + SaleFilter
│   └── tests.py         Completo    SaleModelTest (5 tests)
├── employees/
│   ├── models.py        Completo
│   ├── serializers.py   Completo    EmployeeSerializer (salary enmascarado para EMPLEADO)
│   ├── signals.py       Completo    Payroll→APPROVED → Transaction(EXPENSE)
│   ├── views.py         Completo    EmployeeViewSet, PayrollViewSet (+approve)
│   └── tests.py         Completo    PayrollTest (2 tests)
├── invoicing/
│   ├── models.py        Completo
│   ├── serializers.py   Completo
│   └── views.py         Completo    CustomerInvoiceViewSet (+pdf, +send-email), SupplierInvoiceViewSet
├── finances/
│   ├── models.py        Completo    Transaction, CashRegister, ExpenseCategory, Expense
│   ├── serializers.py   Completo    ExpenseCategorySerializer, ExpenseSerializer incluidos
│   ├── signals.py       Completo    Expense → auto-crea/actualiza Transaction(EXPENSE)
│   ├── apps.py          Completo    ready() importa finances.signals
│   ├── views.py         Completo    TransactionViewSet, CashRegisterViewSet (+close), ExpenseCategoryViewSet, ExpenseViewSet
│   └── tests.py         Completo    26 tests — incluye ExpenseCategoryTests + ExpenseTests
├── services/
│   ├── models.py        Completo    ServiceType, Service
│   ├── serializers.py   Completo    ServiceTypeSerializer, ServiceSerializer
│   ├── signals.py       Completo    Service → auto-crea/actualiza Transaction(INCOME)
│   ├── apps.py          Completo    ready() importa services.signals
│   ├── views.py         Completo    ServiceTypeViewSet, ServiceViewSet + ServiceFilter
│   ├── tests.py         Completo    10 tests
│   └── migrations/
│       └── 0001_initial.py
├── reports/
│   ├── views.py         Completo    SalesSummaryView, TopProductsView, LowStockReportView,
│   │                                FinancialBalanceView, SalesByPaymentView,
│   │                                SalesByPaymentExportCSVView, SalesByPaymentExportPDFView
│   ├── urls.py          Completo
│   └── tests.py         Completo    SalesByPaymentTests (10 tests)
├── frontend/
│   ├── views.py                     Sirve index.html
│   └── templates/frontend/
│       └── index.html               SPA completa — vanilla JS + Tailwind
└── venv/
```

---

## 4. Configuración

**Archivo:** `config/settings.py`

Todas las credenciales se leen desde `.env` usando `django-environ`. Nunca hay valores hardcodeados en el código fuente.

### `.env` (ejemplo — ver `.env.example`)

```env
SECRET_KEY=<genera con python -c "import secrets; print(secrets.token_urlsafe(50))">
DEBUG=True
FIELD_ENCRYPTION_KEY=<genera con Fernet.generate_key().decode()>
DATABASE_URL=sqlite:///db.sqlite3
# Producción: DATABASE_URL=postgres://user:password@host:5432/ferreteria_db
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
ALLOWED_HOSTS=localhost,127.0.0.1
```

### Variables clave en settings.py

```python
import environ

env = environ.Env(DEBUG=(bool, True))
environ.Env.read_env(BASE_DIR / '.env')

SECRET_KEY           = env('SECRET_KEY')
DEBUG                = env('DEBUG')
ALLOWED_HOSTS        = env('ALLOWED_HOSTS')
FIELD_ENCRYPTION_KEY = env('FIELD_ENCRYPTION_KEY')
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS   = env('CORS_ALLOWED_ORIGINS')
DATABASES = {'default': env.db('DATABASE_URL')}
STATIC_ROOT = BASE_DIR / 'staticfiles'
```

### INSTALLED_APPS (orden con justificación)

```python
INSTALLED_APPS = [
    # Django built-ins
    'django.contrib.admin', 'django.contrib.auth',
    'django.contrib.contenttypes', 'django.contrib.sessions',
    'django.contrib.messages', 'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'corsheaders',
    'django_filters',
    # Level 0 — define AUTH_USER_MODEL
    'accounts',
    # Level 1 — sin FK cruzadas entre ellas
    'customers', 'suppliers', 'products',
    # Level 2 — dependen del nivel 1
    'sales', 'employees',
    # Level 3 — dependen del nivel 2
    'invoicing', 'finances',
    # Level 4 — dependen de finances y sales
    'services',
    # Cross-cutting
    'reports', 'audit',
    # Frontend SPA
    'frontend',
]
```

### REST_FRAMEWORK

```python
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}
```

---

## 5. Modelos por aplicación

### 5.1 `accounts` — Usuarios y Sesiones

#### `CustomUser(AbstractUser)`

| Campo | Tipo | Detalle |
|---|---|---|
| `username`, `email`, `password`, `first_name`, `last_name` | — | Heredados de AbstractUser |
| `role` | CharField | Choices: `ADMIN`, `EMPLEADO` · Default: `EMPLEADO` |
| `is_active` | BooleanField | Default: `True` |
| `failed_login_attempts` | IntegerField | Default: `0` · gestionado por signal |
| `locked_until` | DateTimeField | Null/Blank · gestionado por signal |

#### `AuditSession`

| Campo | Tipo | Detalle |
|---|---|---|
| `user` | FK → `AUTH_USER_MODEL` | `SET_NULL` |
| `login_at` | DateTimeField | Asignado por signal `user_logged_in` |
| `logout_at` | DateTimeField | Null/Blank · actualizado por `LogoutView` |
| `ip_address` | GenericIPAddressField | Extraído del request por signal |

---

### 5.2 `customers` — Clientes

#### `Customer`

| Campo | Tipo | Detalle |
|---|---|---|
| `full_name` | CharField(255) | — |
| `document_type` | CharField | Choices: `CC`, `NIT`, `CE` |
| `document_number` | **EncryptedCharField(20)** | **Cifrado en reposo (RNF-PRI-001)** |
| `email` | EmailField | Blank |
| `phone` | CharField(20) | Blank |
| `address` | TextField | Blank |
| `is_active` | BooleanField | Default: `True` |
| `created_by` | FK → `AUTH_USER_MODEL` | `PROTECT` |
| `created_at` / `updated_at` | DateTimeField | auto |

---

### 5.3 `products` — Productos y Categorías

#### `Category`

| Campo | Tipo | Detalle |
|---|---|---|
| `name` | CharField(100) | Unique |
| `description` | TextField | Blank |

#### `Product`

| Campo | Tipo | Detalle |
|---|---|---|
| `name` | CharField(255) | — |
| `code` | CharField(50) | Unique · `db_index=True` |
| `description` | TextField | Blank |
| `category` | FK → `products.Category` | `PROTECT` · `db_index=True` |
| `sale_price` / `cost_price` | DecimalField(12,2) | — |
| `stock` | IntegerField | Default: `0` · modificado por signals |
| `min_stock` | IntegerField | Default: `5` |
| `supplier` | FK → `suppliers.Supplier` | Null · `SET_NULL` |
| `is_active` | BooleanField | Default: `True` |
| `created_by` | FK → `AUTH_USER_MODEL` | `PROTECT` |
| `created_at` / `updated_at` | DateTimeField | auto |

**Property:** `is_low_stock → bool` (`stock <= min_stock`)

---

### 5.4 `suppliers` — Proveedores, Órdenes de Compra y Solicitudes de Pedido

#### `Supplier`

| Campo | Tipo | Detalle |
|---|---|---|
| `business_name` | CharField(255) | — |
| `nit` | CharField(20) | Unique · `db_index=True` |
| `contact_name` / `phone` / `email` / `address` | — | Blank |
| `is_active` | BooleanField | Default: `True` |
| `created_by` | FK → `AUTH_USER_MODEL` | `PROTECT` |
| `created_at` / `updated_at` | DateTimeField | auto |

#### `PurchaseOrder`

| Campo | Tipo | Detalle |
|---|---|---|
| `supplier` | FK → `suppliers.Supplier` | `PROTECT` · `db_index=True` |
| `status` | CharField | Choices: `DRAFT`, `SENT`, `RECEIVED`, `CANCELLED` · `db_index=True` |
| `notes` | TextField | Blank |
| `created_by` | FK → `AUTH_USER_MODEL` | `PROTECT` |
| `created_at` / `updated_at` | DateTimeField | auto |

> **Signal:** al cambiar a `RECEIVED` → incrementa stock de todos los `PurchaseOrderItem`.

#### `PurchaseOrderItem`

| Campo | Tipo | Detalle |
|---|---|---|
| `order` | FK → `suppliers.PurchaseOrder` | `CASCADE` |
| `product` | FK → `products.Product` | `PROTECT` · `db_index=True` |
| `quantity` | IntegerField | — |
| `unit_cost` | DecimalField(12,2) | — |

#### `OrderRequest` *(HU-033)*

Lista de productos a pedir creada por empleados para revisión del administrador.

| Campo | Tipo | Detalle |
|---|---|---|
| `supplier` | FK → `suppliers.Supplier` | `PROTECT` · `related_name='order_requests'` |
| `status` | CharField | Choices: `PENDING`, `REVIEWED` · Default: `PENDING` · `db_index=True` |
| `notes` | TextField | Blank |
| `created_by` | FK → `AUTH_USER_MODEL` | `PROTECT` · `related_name='order_requests_created'` |
| `created_at` / `updated_at` | DateTimeField | auto |

#### `OrderRequestItem` *(HU-033)*

| Campo | Tipo | Detalle |
|---|---|---|
| `order_request` | FK → `suppliers.OrderRequest` | `CASCADE` · `related_name='items'` |
| `product` | FK → `products.Product` | `PROTECT` · `related_name='order_request_items'` |
| `quantity_requested` | PositiveIntegerField | — |
| `notes` | CharField(255) | Blank |

---

### 5.5 `sales` — Ventas

#### `PaymentMethod`

| Campo | Tipo | Detalle |
|---|---|---|
| `name` | CharField(50) | Unique — ej: Efectivo, Nequi, Tarjeta |

#### `Sale`

| Campo | Tipo | Detalle |
|---|---|---|
| `customer` | FK → `customers.Customer` | Null · `db_index=True` |
| `payment_method` | FK → `sales.PaymentMethod` | `PROTECT` |
| `employee` | FK → `AUTH_USER_MODEL` | `PROTECT` |
| `total` | DecimalField(12,2) | — |
| `status` | CharField | Choices: `COMPLETED`, `CANCELLED` · `db_index=True` |
| `is_anonymous` | BooleanField | Default: `False` |
| `sale_date` | DateTimeField | `auto_now_add` · `db_index=True` |
| `created_at` / `updated_at` | DateTimeField | auto |

> **Signals:** `pre_save` captura estado anterior; `post_save` restaura stock si → `CANCELLED`.

#### `SaleItem`

| Campo | Tipo | Detalle |
|---|---|---|
| `sale` | FK → `sales.Sale` | `CASCADE` |
| `product` | FK → `products.Product` | `PROTECT` · `db_index=True` |
| `quantity` | IntegerField | — |
| `unit_price` / `subtotal` | DecimalField(12,2) | — |

> **Signal:** `post_save` (created) → descuenta `product.stock`; lanza `ValidationError` si stock insuficiente.

---

### 5.6 `employees` — Empleados y Nómina

#### `Employee`

| Campo | Tipo | Detalle |
|---|---|---|
| `user` | OneToOneField → `AUTH_USER_MODEL` | `PROTECT` |
| `full_name` | CharField(255) | — |
| `document_type` | CharField | Choices: `CC`, `NIT`, `CE` |
| `document_number` | **EncryptedCharField(20)** | **Cifrado en reposo (RNF-PRI-001)** |
| `position` | CharField(100) | — |
| `hire_date` | DateField | — |
| `base_salary` | DecimalField(12,2) | — |
| `phone` | CharField(20) | Blank |
| `is_active` | BooleanField | Default: `True` |

#### `Payroll`

| Campo | Tipo | Detalle |
|---|---|---|
| `period_start` / `period_end` | DateField | — |
| `status` | CharField | Choices: `DRAFT`, `APPROVED`, `PAID` · `db_index=True` |
| `total_amount` | DecimalField(12,2) | — |
| `generated_by` | FK → `AUTH_USER_MODEL` | `PROTECT` |
| `created_at` | DateTimeField | auto |

> **Signal:** `DRAFT → APPROVED` → crea `finances.Transaction(type=EXPENSE)` automáticamente.

#### `PayrollItem`

| Campo | Tipo | Detalle |
|---|---|---|
| `payroll` | FK → `employees.Payroll` | `CASCADE` |
| `employee` | FK → `employees.Employee` | `PROTECT` · `db_index=True` |
| `base_salary` / `health_deduction` / `pension_deduction` / `overtime` / `net_salary` | DecimalField(12,2) | `overtime` default `0` |

**Constraint:** `unique_together = [('payroll', 'employee')]`

---

### 5.7 `invoicing` — Facturación

#### `CustomerInvoice`

Número generado automáticamente en `save()` — formato `FV-YYYYMMDD-NNNN`.

| Campo | Tipo | Detalle |
|---|---|---|
| `invoice_number` | CharField(20) | Unique · `editable=False` · auto-generado |
| `sale` | OneToOneField → `sales.Sale` | `PROTECT` |
| `customer` | FK → `customers.Customer` | Null · `db_index=True` |
| `generated_by` | FK → `AUTH_USER_MODEL` | `PROTECT` |
| `total` / `tax` | DecimalField(12,2) | `tax` default `0` |
| `issued_at` | DateTimeField | `auto_now_add` |
| `sent_by_email` | BooleanField | Default: `False` · actualizado por acción `send-email` |
| `status` | CharField | Choices: `ISSUED`, `CANCELLED` · `db_index=True` |

#### `SupplierInvoice`

| Campo | Tipo | Detalle |
|---|---|---|
| `supplier_invoice_number` | CharField(50) | Único por proveedor |
| `supplier` | FK → `suppliers.Supplier` | `PROTECT` · `db_index=True` |
| `purchase_order` | FK → `suppliers.PurchaseOrder` | Null · `SET_NULL` |
| `registered_by` | FK → `AUTH_USER_MODEL` | `PROTECT` |
| `total` | DecimalField(12,2) | — |
| `received_at` | DateField | `db_index=True` |
| `created_at` / `updated_at` | DateTimeField | auto |

**Constraint:** `unique_together = [('supplier', 'supplier_invoice_number')]`

#### `SupplierInvoiceItem`

| Campo | Tipo | Detalle |
|---|---|---|
| `invoice` | FK → `invoicing.SupplierInvoice` | `CASCADE` |
| `product` | FK → `products.Product` | `PROTECT` · `db_index=True` |
| `quantity` | IntegerField | — |
| `unit_cost` / `subtotal` | DecimalField(12,2) | — |

---

### 5.8 `finances` — Transacciones, Caja y Gastos Operativos

#### `Transaction`

Usa **Generic FK pattern** (`reference_type` + `reference_id`).

| Campo | Tipo | Detalle |
|---|---|---|
| `type` | CharField | Choices: `INCOME`, `EXPENSE` · `db_index=True` |
| `amount` | DecimalField(12,2) | — |
| `concept` | CharField(255) | — |
| `reference_type` | CharField | Choices: `SALE`, `SUPPLIER_INVOICE`, `PAYROLL`, `CREDIT_NOTE`, `WITHDRAWAL`, `EXPENSE`, `SERVICE`, `OTHER` |
| `reference_id` | IntegerField | PK del objeto relacionado |
| `transaction_date` | DateField | `db_index=True` |
| `registered_by` | FK → `AUTH_USER_MODEL` | `PROTECT` |
| `created_at` | DateTimeField | auto |

> Los tipos `EXPENSE` y `SERVICE` fueron añadidos (HU-031 y HU-032) para soportar las señales de gastos y servicios.

#### `CashRegister`

| Campo | Tipo | Detalle |
|---|---|---|
| `opened_by` | FK → `AUTH_USER_MODEL` | `PROTECT` · `related_name='opened_registers'` |
| `closed_by` | FK → `AUTH_USER_MODEL` | Null · `SET_NULL` · `related_name='closed_registers'` |
| `opening_amount` | DecimalField(12,2) | — |
| `closing_amount` / `expected_amount` / `difference` | DecimalField(12,2) | Null/Blank — calculados al cierre |
| `opened_at` | DateTimeField | `auto_now_add` |
| `closed_at` | DateTimeField | Null/Blank |
| `status` | CharField | Choices: `OPEN`, `CLOSED` · `db_index=True` |

#### `ExpenseCategory` *(HU-031)*

| Campo | Tipo | Detalle |
|---|---|---|
| `name` | CharField(100) | Unique |
| `description` | CharField(255) | Blank |
| `created_at` | DateTimeField | auto |

#### `Expense` *(HU-031)*

Gasto operativo de la ferretería. Al guardarse, dispara señal que crea/actualiza un `Transaction(type=EXPENSE)`.

| Campo | Tipo | Detalle |
|---|---|---|
| `description` | CharField(255) | — |
| `category` | FK → `finances.ExpenseCategory` | `PROTECT` |
| `amount` | DecimalField(12,2) | Validado > 0 |
| `expense_date` | DateField | `db_index=True` |
| `payment_method` | CharField | Choices: `CASH`, `CARD`, `TRANSFER`, `OTHER` |
| `receipt_reference` | CharField(100) | Blank — número de comprobante |
| `notes` | TextField | Blank |
| `registered_by` | FK → `AUTH_USER_MODEL` | `PROTECT` |
| `created_at` / `updated_at` | DateTimeField | auto |

> **Signal:** `post_save(Expense)` → crea `Transaction(EXPENSE)` si es nuevo; actualiza si ya existe.

---

### 5.9 `services` — Tipos de Servicio y Servicios *(HU-032)*

#### `ServiceType`

Catálogo de tipos de servicio ofrecidos por la ferretería.

| Campo | Tipo | Detalle |
|---|---|---|
| `name` | CharField(100) | Unique |
| `description` | CharField(255) | Blank |
| `default_price` | DecimalField(12,2) | Null/Blank — precio sugerido |

#### `Service`

Registro individual de un servicio prestado. Al guardarse, dispara señal que crea/actualiza un `Transaction(type=INCOME)`.

| Campo | Tipo | Detalle |
|---|---|---|
| `service_type` | FK → `services.ServiceType` | `PROTECT` |
| `description` | CharField(255) | — |
| `price` | DecimalField(12,2) | Validado > 0 |
| `customer` | FK → `customers.Customer` | Null · `SET_NULL` |
| `performed_by` | FK → `AUTH_USER_MODEL` | `PROTECT` · `related_name='services_performed'` |
| `service_date` | DateField | `db_index=True` |
| `notes` | TextField | Blank |
| `registered_by` | FK → `AUTH_USER_MODEL` | `PROTECT` · `related_name='services_registered'` |
| `created_at` / `updated_at` | DateTimeField | auto |

> **Signal:** `post_save(Service)` → crea `Transaction(INCOME, reference_type=SERVICE)` si es nuevo; actualiza monto, concepto y fecha si ya existe.

---

### 5.10 `audit` — Auditoría

#### `AuditLog`

| Campo | Tipo | Detalle |
|---|---|---|
| `user` | FK → `AUTH_USER_MODEL` | Null · `SET_NULL` |
| `action` | CharField | Choices: `CREATE`, `UPDATE`, `DELETE`, `VIEW` · `db_index=True` |
| `app_label` | CharField(50) | — |
| `model_name` | CharField(100) | `db_index=True` |
| `object_id` | CharField(50) | — |
| `object_repr` | CharField(200) | — |
| `changed_fields` | JSONField | Null · formato: `{"campo": {"old": x, "new": y}}` |
| `timestamp` | DateTimeField | `auto_now_add` · `db_index=True` |
| `ip_address` | GenericIPAddressField | Null/Blank |

---

### 5.11 `reports`

Sin modelos persistentes. Los reportes se generan on-demand consultando los modelos de otras apps.

---

## 6. Admin por aplicación

| App | Modelos registrados | Inlines | Notas |
|---|---|---|---|
| `accounts` | `CustomUser`, `AuditSession` | — | `CustomUser` extiende `UserAdmin`; `AuditSession` es read-only |
| `customers` | `Customer` | — | `readonly_fields`: `created_at`, `updated_at`, `created_by` |
| `products` | `Category`, `Product` | — | `list_filter` por `category` e `is_active` |
| `suppliers` | `Supplier`, `PurchaseOrder`, `OrderRequest` | `PurchaseOrderItemInline`, `OrderRequestItemInline` | — |
| `sales` | `PaymentMethod`, `Sale` | `SaleItemInline` | `list_filter` incluye `sale_date` |
| `invoicing` | `CustomerInvoice`, `SupplierInvoice` | `SupplierInvoiceItemInline` | `invoice_number` readonly |
| `employees` | `Employee`, `Payroll` | `PayrollItemInline` | — |
| `finances` | `Transaction`, `CashRegister`, `ExpenseCategory`, `Expense` | — | — |
| `services` | `ServiceType`, `Service` | — | — |
| `audit` | `AuditLog` | — | Todos los campos readonly; sin add/change/delete |

---

## 7. Señales (signals)

### `accounts/signals.py`

| Signal receptor | Evento Django | Acción |
|---|---|---|
| `on_login_failed` | `user_login_failed` | Incrementa `failed_login_attempts`; si >= 5 → `locked_until = now() + 30 min` |
| `on_login_success` | `user_logged_in` | Resetea contadores; crea `AuditSession` con IP del request |

### `sales/signals.py`

| Signal receptor | Evento Django | Acción |
|---|---|---|
| `decrement_stock_on_sale_item` | `post_save(SaleItem, created=True)` | `product.stock -= quantity`; lanza `ValidationError` si insuficiente |
| `cache_sale_previous_status` | `pre_save(Sale)` | Guarda `instance._previous_status` |
| `restore_stock_on_cancellation` | `post_save(Sale, created=False)` | Si `!= CANCELLED → CANCELLED`: restaura stock de todos los items |

### `suppliers/signals.py`

| Signal receptor | Evento Django | Acción |
|---|---|---|
| `cache_purchase_order_previous_status` | `pre_save(PurchaseOrder)` | Guarda `instance._previous_status` |
| `increment_stock_on_received` | `post_save(PurchaseOrder, created=False)` | Si `!= RECEIVED → RECEIVED`: incrementa stock de todos los items |

### `employees/signals.py`

| Signal receptor | Evento Django | Acción |
|---|---|---|
| `cache_payroll_previous_status` | `pre_save(Payroll)` | Guarda `instance._previous_status` |
| `create_transaction_on_payroll_approved` | `post_save(Payroll, created=False)` | Si `DRAFT → APPROVED`: crea `Transaction(type=EXPENSE, reference_type=PAYROLL)` |

### `finances/signals.py` *(HU-031)*

| Signal receptor | Evento Django | Acción |
|---|---|---|
| `sync_transaction_with_expense` | `post_save(Expense, created=True)` | Crea `Transaction(type=EXPENSE, reference_type=EXPENSE)` con concepto, monto y fecha del gasto |
| `sync_transaction_with_expense` | `post_save(Expense, created=False)` | Actualiza el `Transaction` existente (monto, concepto, fecha) via `QuerySet.update()` |

> Registrado en `finances/apps.py → ready()`.

### `services/signals.py` *(HU-032)*

| Signal receptor | Evento Django | Acción |
|---|---|---|
| `sync_transaction_with_service` | `post_save(Service, created=True)` | Crea `Transaction(type=INCOME, reference_type=SERVICE)` con concepto, precio y fecha del servicio |
| `sync_transaction_with_service` | `post_save(Service, created=False)` | Actualiza el `Transaction` existente via `QuerySet.update()` |

> Registrado en `services/apps.py → ready()`.

---

## 8. API — Permisos y serializers

### Clases de permiso (`accounts/permissions.py`)

| Clase | Regla |
|---|---|
| `IsAdminRole` | Solo usuarios con `role == 'ADMIN'` |
| `IsAdminOrReadOnly` | ADMIN: acceso completo; EMPLEADO: solo GET/HEAD/OPTIONS |
| `IsOwnerOrAdmin` | ADMIN: cualquier objeto; EMPLEADO: solo objetos propios (`created_by`) |

### Decisiones de serializer por rol

| Recurso | ADMIN | EMPLEADO |
|---|---|---|
| `Customer` | `AdminCustomerSerializer` — `document_number` visible | `EmployeeCustomerSerializer` — `document_number` → `"***"` |
| `Product` (list/retrieve) | `ProductSerializer` — incluye `cost_price` | `ProductListSerializer` — sin `cost_price` |
| `Employee` | `EmployeeSerializer` — `document_number` y `base_salary` reales | `EmployeeSerializer` — ambos → `"***"` |
| Resto | Serializer único | Mismo serializer (acceso restringido por permiso) |

### Reglas generales de serializers

- `read_only_fields = ['created_by', 'created_at', 'updated_at']` en todos los modelos que los tengan.
- `created_by` / `generated_by` / `registered_by` / `opened_by` se inyectan via `perform_create(serializer.save(...=request.user))`.
- `employee` en `Sale` se inyecta automáticamente desde `request.user`.
- `SaleCreateSerializer.create()` envuelve en `transaction.atomic()` — si el signal de stock falla, toda la venta se revierte.
- `OrderRequestWriteSerializer.create()` es atómico: crea el `OrderRequest` y todos sus `OrderRequestItem` en una sola transacción. `to_representation` devuelve el serializer de lectura completo.

---

## 9. Endpoints de la API

### Autenticación

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| POST | `/api/token/` | Público | Login — devuelve `access` + `refresh` JWT |
| POST | `/api/token/refresh/` | Público | Renueva el access token con el refresh token |
| POST | `/api/token/logout/` | Autenticado | Cierra sesión; registra `logout_at` en `AuditSession` |

### Usuarios (`/api/users/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/users/` | ADMIN | Lista usuarios |
| POST | `/api/users/` | ADMIN | Crea usuario |
| GET/PUT/PATCH/DELETE | `/api/users/{id}/` | ADMIN | CRUD usuario |

### Clientes (`/api/customers/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/customers/` | Autenticado | Lista; EMPLEADO ve `document_number` = `"***"` |
| POST | `/api/customers/` | ADMIN | Crea cliente |
| GET | `/api/customers/{id}/` | Autenticado | Detalle |
| PUT/PATCH/DELETE | `/api/customers/{id}/` | ADMIN | Actualiza / elimina |

### Categorías (`/api/categories/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET/POST | `/api/categories/` | ADMIN | Lista / crea |
| GET/PUT/PATCH/DELETE | `/api/categories/{id}/` | ADMIN | CRUD |

### Productos (`/api/products/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/products/` | Autenticado | Lista; EMPLEADO no ve `cost_price` |
| POST | `/api/products/` | ADMIN | Crea producto |
| GET | `/api/products/{id}/` | Autenticado | Detalle |
| PUT/PATCH/DELETE | `/api/products/{id}/` | ADMIN | Actualiza / elimina |
| GET | `/api/products/low-stock/` | Autenticado | Productos con `stock <= min_stock` |

### Proveedores (`/api/suppliers/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET/POST | `/api/suppliers/` | ADMIN | Lista / crea |
| GET/PUT/PATCH/DELETE | `/api/suppliers/{id}/` | ADMIN | CRUD |

### Órdenes de compra (`/api/purchase-orders/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET/POST | `/api/purchase-orders/` | ADMIN | Lista / crea |
| GET/PUT/PATCH/DELETE | `/api/purchase-orders/{id}/` | ADMIN | CRUD |
| POST | `/api/purchase-orders/{id}/receive/` | ADMIN | Transición a `RECEIVED`; signal incrementa stock |

### Solicitudes de pedido (`/api/order-requests/`) *(HU-033)*

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/order-requests/` | Autenticado | Lista (ambos roles) |
| POST | `/api/order-requests/` | Autenticado | Crea solicitud con items; `created_by` = `request.user` |
| GET | `/api/order-requests/{id}/` | Autenticado | Detalle |
| PUT/PATCH/DELETE | `/api/order-requests/{id}/` | ADMIN | Modifica / elimina |
| POST | `/api/order-requests/{id}/mark-reviewed/` | ADMIN | Transición `PENDING → REVIEWED`; devuelve 400 si ya revisada |

### Métodos de pago (`/api/payment-methods/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/payment-methods/` | Autenticado | Lista |
| POST/PUT/PATCH/DELETE | `/api/payment-methods/{id}/` | ADMIN | CRUD |

### Ventas (`/api/sales/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/sales/` | Autenticado | Lista ventas |
| POST | `/api/sales/` | Autenticado | Crea venta con items; `employee` = `request.user`; valida stock |
| GET | `/api/sales/{id}/` | Autenticado | Detalle |
| PUT/PATCH/DELETE | `/api/sales/{id}/` | ADMIN | Modifica / elimina |
| POST | `/api/sales/{id}/cancel/` | Autenticado | Cancela venta; signal restaura stock |

### Facturas de cliente (`/api/customer-invoices/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET/POST | `/api/customer-invoices/` | Autenticado | Lista / crea |
| GET | `/api/customer-invoices/{id}/` | Autenticado | Detalle |
| PUT/PATCH/DELETE | `/api/customer-invoices/{id}/` | ADMIN | Modifica / elimina |
| GET | `/api/customer-invoices/{id}/pdf/` | Autenticado | PDF real generado con ReportLab (`Content-Type: application/pdf`) |
| POST | `/api/customer-invoices/{id}/send-email/` | Autenticado | Marca `sent_by_email=True` |

### Facturas de proveedor (`/api/supplier-invoices/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET/POST | `/api/supplier-invoices/` | ADMIN | Lista / crea |
| GET/PUT/PATCH/DELETE | `/api/supplier-invoices/{id}/` | ADMIN | CRUD |

### Empleados (`/api/employees/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET/POST | `/api/employees/` | ADMIN | Lista / crea |
| GET/PUT/PATCH/DELETE | `/api/employees/{id}/` | ADMIN | CRUD |

### Nóminas (`/api/payrolls/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET/POST | `/api/payrolls/` | ADMIN | Lista / crea |
| GET/PUT/PATCH/DELETE | `/api/payrolls/{id}/` | ADMIN | CRUD |
| POST | `/api/payrolls/{id}/approve/` | ADMIN | Aprueba nómina; signal crea `Transaction(EXPENSE)` |

### Transacciones financieras (`/api/transactions/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/transactions/` | Autenticado | Lista |
| POST/PUT/PATCH/DELETE | `/api/transactions/{id}/` | ADMIN | CRUD |

### Cajas (`/api/cash-registers/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET/POST | `/api/cash-registers/` | Autenticado | Lista / abre caja |
| GET | `/api/cash-registers/{id}/` | Autenticado | Detalle |
| PUT/PATCH/DELETE | `/api/cash-registers/{id}/` | ADMIN | Modifica / elimina |
| POST | `/api/cash-registers/{id}/close/` | Autenticado | Cierra caja; calcula `expected_amount` y `difference` |

### Categorías de gasto (`/api/expense-categories/`) *(HU-031)*

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET/POST | `/api/expense-categories/` | ADMIN | Lista / crea categoría |
| GET/PUT/PATCH/DELETE | `/api/expense-categories/{id}/` | ADMIN | CRUD |

### Gastos operativos (`/api/expenses/`) *(HU-031)*

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET/POST | `/api/expenses/` | ADMIN | Lista / registra gasto; signal auto-crea `Transaction(EXPENSE)` |
| GET/PUT/PATCH/DELETE | `/api/expenses/{id}/` | ADMIN | CRUD; signal sincroniza `Transaction` en UPDATE |

### Tipos de servicio (`/api/service-types/`) *(HU-032)*

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/service-types/` | Autenticado | Lista catálogo |
| POST | `/api/service-types/` | ADMIN | Crea tipo |
| GET/PUT/PATCH/DELETE | `/api/service-types/{id}/` | ADMIN | CRUD |

### Servicios (`/api/services/`) *(HU-032)*

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/services/` | Autenticado | Lista servicios (ambos roles) |
| POST | `/api/services/` | Autenticado | Registra servicio; `registered_by` = `request.user`; signal auto-crea `Transaction(INCOME)` |
| GET | `/api/services/{id}/` | Autenticado | Detalle |
| PUT/PATCH/DELETE | `/api/services/{id}/` | ADMIN | Modifica / elimina; signal sincroniza `Transaction` en UPDATE |

### Reportes (`/api/reports/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/reports/sales-summary/` | Autenticado | Total, conteo y ticket promedio; params: `start`, `end` (YYYY-MM-DD) |
| GET | `/api/reports/top-products/` | Autenticado | Productos por cantidad vendida; param: `limit` (default 10) |
| GET | `/api/reports/low-stock/` | Autenticado | Productos bajo `min_stock` con proveedor |
| GET | `/api/reports/financial-balance/` | ADMIN | Ingreso vs egreso; params: `month`, `year` |
| GET | `/api/reports/sales-by-payment/` | ADMIN | Ventas por modalidad de pago con totales y porcentajes *(HU-036)* |
| GET | `/api/reports/sales-by-payment/export-csv/` | ADMIN | Exporta reporte como CSV (UTF-8 BOM para Excel) *(HU-036)* |
| GET | `/api/reports/sales-by-payment/export-pdf/` | ADMIN | Exporta reporte como PDF con ReportLab *(HU-036)* |

#### Parámetros del reporte de ventas por modalidad (`sales-by-payment`)

| Parámetro | Valores | Descripción |
|---|---|---|
| `period` | `today` \| `week` \| `month` | Atajos de período — prioridad sobre `start`/`end` |
| `start` | `YYYY-MM-DD` | Inicio de rango personalizado |
| `end` | `YYYY-MM-DD` | Fin de rango personalizado |

Respuesta JSON: `{ period, grand_total, total_sales, rows: [{payment_method_id, payment_method_name, sale_count, total, percentage}] }`

### Auditoría (`/api/audit-logs/`)

| Método | URL | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/audit-logs/` | ADMIN | Lista paginada de registros |
| GET | `/api/audit-logs/{id}/` | ADMIN | Detalle de registro |

---

## 10. Filtros, búsqueda y paginación

Todos los endpoints de lista están paginados (20 resultados por página). Usar `?page=N` para navegar.

### Parámetros globales

| Parámetro | Descripción | Ejemplo |
|---|---|---|
| `?search=texto` | Búsqueda en campos declarados en `search_fields` | `?search=martillo` |
| `?ordering=campo` | Ordenar ascendente / `-campo` descendente | `?ordering=-sale_date` |
| `?page=N` | Paginación | `?page=2` |

### FilterSets por recurso

| Recurso | Filtros disponibles |
|---|---|
| `customers` | `is_active`, `document_type` |
| `products` | `category` (id), `is_active`, `min_price`, `max_price` |
| `sales` | `status`, `payment_method` (id), `date_from`, `date_to` |
| `services` | `service_type` (id), `service_date_after`, `service_date_before` |
| `order-requests` | `supplier` (id), `status` (`PENDING` \| `REVIEWED`) |
| `audit-logs` | `action`, `model_name`, `timestamp_from`, `timestamp_to`, `user` (id) |

### Campos de búsqueda (`?search=`)

| Recurso | Campos |
|---|---|
| `customers` | `full_name`, `email` |
| `products` | `name`, `code` |
| `sales` | `customer__full_name` |
| `suppliers` | `business_name`, `contact_name`, `email` |
| `service-types` | `name` |
| `services` | `description`, `customer__full_name`, `service_type__name` |
| `employees` | `full_name`, `position` |
| `customer-invoices` | `invoice_number`, `customer__full_name` |
| `audit-logs` | `object_repr`, `model_name` |

### Ejemplos

```bash
# Ventas completadas entre fechas
GET /api/sales/?status=COMPLETED&date_from=2026-01-01&date_to=2026-03-31

# Productos de la categoría 3, baratos, ordenados por precio
GET /api/products/?category=3&max_price=50000&ordering=sale_price

# Logs de DELETE de la última semana
GET /api/audit-logs/?action=DELETE&timestamp_from=2026-04-06T00:00:00

# Segunda página de clientes activos
GET /api/customers/?is_active=true&page=2

# Servicios de tipo 2 realizados en abril
GET /api/services/?service_type=2&service_date_after=2026-04-01&service_date_before=2026-04-30

# Solicitudes pendientes del proveedor 5
GET /api/order-requests/?supplier=5&status=PENDING

# Reporte de ventas por pago — semana actual
GET /api/reports/sales-by-payment/?period=week
```

---

## 11. Auditoría automática (AuditLogMixin)

**Archivo:** `audit/mixins.py`

Todos los ViewSets heredan de `AuditLogMixin` antes de `viewsets.ModelViewSet`. El mixin sobreescribe tres métodos:

| Método | Acción registrada | Campos extra |
|---|---|---|
| `perform_create` | `CREATE` | — |
| `perform_update` | `UPDATE` | `changed_fields: {"campo": {"old": x, "new": y}}` |
| `perform_destroy` | `DELETE` | — |

Siempre registra: `user`, `app_label`, `model_name`, `object_id`, `object_repr`, `ip_address`.  
La IP se extrae del header `HTTP_X_FORWARDED_FOR` (proxies) o `REMOTE_ADDR`.  
Las excepciones dentro del mixin se suprimen — un fallo de auditoría nunca interrumpe la respuesta API.

---

## 12. Grafo de dependencias entre apps

```
AUTH_USER_MODEL (accounts.CustomUser)
         |
         v (todas las apps tienen FK a este modelo)
[accounts]  CustomUser · AuditSession

[customers] Customer
[suppliers] Supplier / PurchaseOrder / PurchaseOrderItem --> products.Product
            OrderRequest / OrderRequestItem --> products.Product
[products]  Category / Product

[sales]     PaymentMethod / Sale --> customers.Customer
            SaleItem --> products.Product

[employees] Employee (1:1 CustomUser) / Payroll / PayrollItem --> Employee

[invoicing] CustomerInvoice --> sales.Sale + customers.Customer
            SupplierInvoice --> suppliers.Supplier + suppliers.PurchaseOrder
            SupplierInvoiceItem --> products.Product

[finances]  Transaction (generic FK: SALE|SUPPLIER_INVOICE|PAYROLL|CREDIT_NOTE|WITHDRAWAL|EXPENSE|SERVICE|OTHER)
            CashRegister
            ExpenseCategory / Expense  (signal → Transaction)

[services]  ServiceType / Service --> customers.Customer  (signal → finances.Transaction)

[audit]     AuditLog (FK solo a AUTH_USER_MODEL)

[reports]   Sin modelos — queries agregadas sobre otras apps
            _sales_by_payment_data() → sales.Sale · sales.PaymentMethod
```

---

## 13. Convenciones de código

- **Campos monetarios:** `DecimalField(max_digits=12, decimal_places=2)` en todo el proyecto.
- **FK al usuario:** siempre `settings.AUTH_USER_MODEL`, nunca import directo de `CustomUser`.
- **FK cruzadas entre apps:** string references (`'customers.Customer'`) para evitar imports circulares.
- **Índices (RNF-MNT-002):** `db_index=True` en campos frecuentemente consultados.
- **Meta:** todos los modelos tienen `verbose_name` y `verbose_name_plural` en español.
- **Auditoría de escrituras:** todo modelo data tiene `created_by`, `created_at`, `updated_at`.
- **`read_only_fields`:** todos los serializers declaran `['created_by', 'created_at', 'updated_at']`.
- **`perform_create`:** todos los ViewSets inyectan `request.user` en el campo de autoría.
- **Imports circulares:** señales usan imports diferidos dentro del receptor para `finances.Transaction`.
- **Auditoría API:** `AuditLogMixin` antes de `ModelViewSet` en todos los ViewSets de escritura.
- **Validaciones en serializers:** `validate_amount` / `validate_price` rechazan valores ≤ 0 con `ValidationError`.
- **Señales de sincronización:** usan `QuerySet.update()` (no `instance.save()`) para evitar recursión en UPDATE.
- **CSV para Excel:** prefijo UTF-8 BOM (`'\ufeff'`) para que Excel detecte la codificación correctamente.
- **Descargas autenticadas:** el frontend usa `fetch()` con header `Authorization: Bearer` y convierte la respuesta a Blob para disparar la descarga vía URL de objeto temporal.

---

## 14. Seguridad y requerimientos no funcionales

### RNF-PRI-001 — Encriptación de campos sensibles (ACTIVO)

`document_number` en `customers.Customer` y `employees.Employee` usa `EncryptedCharField`.  
Clave Fernet activa en `FIELD_ENCRYPTION_KEY` (leída de `.env`). Migración `0002_encrypt_document_number` aplicada.

### RNF-SEG — Contraseñas

Django hashea automáticamente via `AbstractUser`.

### RNF-SEG — Bloqueo de cuenta

Implementado end-to-end:
- `accounts/signals.py`: 5 fallos → `locked_until = now() + 30 min`
- `LoginView`: verifica `locked_until > now()` → HTTP 423 antes de llamar `authenticate()`
- `LogoutView`: registra `logout_at` en `AuditSession`

### RNF-MNT-001 — Cobertura de tests >= 70%

113 tests de integración, 111/113 passing. Los 2 fallos son preexistentes y se deben a diferencia de zona horaria UTC entre los tests (`NC-20260413`) y la fecha actual (`NC-20260414`). Cubren 10 módulos críticos de negocio.

### RNF-SEG — Variables de entorno

Todas las credenciales (`SECRET_KEY`, `FIELD_ENCRYPTION_KEY`, `DATABASE_URL`) se leen desde `.env`.  
`.env` está en `.gitignore` — nunca entra al repositorio.

### RNF-SEG — Verificación de producción

```bash
python manage.py check_production_readiness
```

Verifica 6 condiciones: DEBUG off, SECRET_KEY no-insecure, PostgreSQL, CORS restringido, clave Fernet válida, ALLOWED_HOSTS configurado. Sale con código 1 si alguna falla.

### CORS

```python
CORS_ALLOW_ALL_ORIGINS = False           # siempre False
CORS_ALLOWED_ORIGINS = [                 # leído de .env
    'http://localhost:3000',
    'http://localhost:5173',
]
```

---

## 15. Puesta en marcha

```bash
# 1. Activar entorno virtual
venv\Scripts\activate          # Windows
source venv/bin/activate       # Linux/Mac

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Copiar y configurar variables de entorno
copy .env.example .env         # Windows
cp .env.example .env           # Linux/Mac
# Editar .env con valores reales

# 4. Aplicar migraciones
python manage.py migrate

# 5. Poblar datos de prueba
python manage.py seed_test_data

# 6. Ejecutar validaciones de integridad
python manage.py run_validation_checks

# 7. Verificar configuración de producción (antes de deploy)
python manage.py check_production_readiness

# 8. Levantar servidor de desarrollo
python manage.py runserver

# 9. Colectar estáticos (solo producción)
python manage.py collectstatic
```

**Credenciales de prueba (seed_test_data):**

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin_test` | `Admin1234!` | ADMIN |
| `empleado_test` | `Emp1234!` | EMPLEADO |

**Probar la API:**

```bash
# Login
curl -X POST http://127.0.0.1:8000/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin_test","password":"Admin1234!"}'

# Usar el access token
curl http://127.0.0.1:8000/api/products/ \
  -H "Authorization: Bearer <access_token>"

# Registrar un gasto
curl -X POST http://127.0.0.1:8000/api/expenses/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"description":"Compra escobas","category":1,"amount":"25000","expense_date":"2026-04-13","payment_method":"CASH"}'

# Registrar un servicio
curl -X POST http://127.0.0.1:8000/api/services/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"service_type":1,"description":"Instalación llave","price":"80000","service_date":"2026-04-13","performed_by":1}'

# Reporte de ventas por modalidad — semana actual (JSON)
curl "http://127.0.0.1:8000/api/reports/sales-by-payment/?period=week" \
  -H "Authorization: Bearer <access_token>"

# Exportar reporte en PDF
curl "http://127.0.0.1:8000/api/reports/sales-by-payment/export-pdf/?period=today" \
  -H "Authorization: Bearer <access_token>" \
  --output reporte_pagos.pdf

# PDF de factura
curl http://127.0.0.1:8000/api/customer-invoices/1/pdf/ \
  -H "Authorization: Bearer <access_token>" \
  --output factura.pdf
```

---

## 16. Tests

```bash
# Ejecutar suite completa
python manage.py test sales products suppliers accounts employees finances services reports --verbosity=2

# Con cobertura
pip install coverage
coverage run manage.py test
coverage report --include="sales/*,products/*,suppliers/*,accounts/*,employees/*,finances/*,services/*,reports/*" --omit="*/migrations/*"
coverage html
```

**Resultado actual:** 111/113 passing (2 fallos preexistentes de zona horaria UTC).

| App | Clase de test | Tests | Cubre |
|---|---|---|---|
| `sales` | `SaleModelTest` | 5 | Stock decrement, ValidationError, cancel restore, anonymous sale, total check |
| `products` | `ProductModelTest` | 3 | `is_low_stock` true/false, unique code constraint |
| `suppliers` | `PurchaseOrderTest` | 2 | Stock increment on receive, duplicate NIT constraint |
| `suppliers` | `OrderRequestTests` | 10 | Permisos, creación, mark-reviewed, ítems vacíos, duplicados, filtros |
| `accounts` | `AccountLockoutTest` | 3 | Counter increment, lock after 5 failures, reset on success |
| `employees` | `PayrollTest` | 2 | Transaction created on approval, no duplicate on re-save |
| `finances` | `FinancesTests` | 16 | Transacciones, cajas, balance, retiro, balance register |
| `finances` | `ExpenseCategoryTests` | 5 | CRUD categorías, permiso ADMIN, nombre único |
| `finances` | `ExpenseTests` | 5 | Registro, monto cero rechazado, categoría requerida, Transaction auto-creada, UPDATE sincroniza Transaction |
| `services` | `ServiceTests` | 10 | Tipos de servicio, ambos roles registran, registered_by auto-set, Transaction INCOME creada, precio ≤ 0 rechazado, tipo requerido, PATCH sincroniza Transaction |
| `reports` | `SalesByPaymentTests` | 10 | Empleado 403, filas por modalidad, totales correctos, grand_total = suma, porcentajes suman 100, CANCELLED excluidas, período vacío, rango personalizado, CSV content-type, PDF content-type |

**Total: 113 tests — 111/113 passing**

---

## 17. Trabajo pendiente

### Prioridad media (funcionalidad)

- [ ] Verificación de `locked_until` en el middleware de sesión Django (para el admin panel)
- [ ] Lógica de envío real de email en `POST /api/customer-invoices/{id}/send-email/` (Celery + SendGrid / SES)
- [ ] Reporte de gastos por categoría con exportación PDF/CSV (análogo a `sales-by-payment`)

### Prioridad baja

- [ ] Tarea periódica (Celery / cron) para alertas de stock mínimo
- [ ] Configurar `SECURE_SSL_REDIRECT`, `HSTS`, `SESSION_COOKIE_SECURE` para deploy con HTTPS
- [ ] Rate limiting en `POST /api/token/` para mitigar ataques de fuerza bruta a nivel HTTP
- [ ] Filtro de servicios por empleado (`performed_by`) en el frontend
- [ ] Dashboard de métricas en tiempo real para el panel de administración

---

*Actualizado 2026-04-13 — Django 6.0.4 — API completa con DRF + JWT + filtros + auditoría + PDF + gastos + servicios + solicitudes de pedido + reporte ventas por modalidad de pago*
