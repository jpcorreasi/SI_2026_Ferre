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
9. [v1 — versión original (Django)](#9-v1--versión-original-django)

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

## 9. v1 — versión original (Django)

El proyecto **Django original sigue en el repositorio** (apps `accounts/`, `sales/`, `invoicing/`, … + `config/`, `manage.py`, `requirements.txt`, y el SPA en `frontend/templates/frontend/index.html`). Permanece **intacto y funcional** como referencia y respaldo hasta completar la transición a la v2; el detalle de su diseño (modelos, signals, endpoints) está documentado en el historial del repositorio.

```bash
# Ejecutar la v1 (Django) — requiere venv y .env
python manage.py migrate
python manage.py runserver        # SPA + API en http://127.0.0.1:8000
```
