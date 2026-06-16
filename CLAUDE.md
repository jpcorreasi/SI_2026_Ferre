# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Django 6.0.4 + DRF backend for a Colombian hardware-store management system ("Ferretería"). Single repo serves both the JSON API (`/api/...`) and a vanilla-JS + Tailwind SPA (`/`) from the `frontend` app. Source-of-truth docs are in `README.md` (Spanish, very detailed).

## Common commands

All commands assume the venv at `venv/` is activated (`venv\Scripts\activate` on Windows).

```bash
# Run dev server
python manage.py runserver

# Migrations
python manage.py makemigrations
python manage.py migrate

# Seed sample data (creates admin_test / Admin1234! and empleado_test / Emp1234!)
python manage.py seed_test_data

# Data-integrity validations (5 checks, used by the team as a smoke test)
python manage.py run_validation_checks

# Production-readiness check (6 conditions; exit code 1 on any failure)
python manage.py check_production_readiness
```

### Tests

The team runs tests app-by-app, not via a top-level `python manage.py test` — `audit`, `customers`, and `frontend` have empty stub `tests.py` files, and bare `test` discovery can pull in unintended modules. **`invoicing` does have tests** (34 scenarios in `invoicing/tests.py`, the largest test file in the repo) — include it in the command:

```bash
# Full suite — all apps that have real tests
python manage.py test sales products suppliers accounts employees finances services reports invoicing --verbosity=2

# Single app / class / method
python manage.py test finances
python manage.py test finances.tests.ExpenseTests
python manage.py test finances.tests.ExpenseTests.test_expense_creates_transaction

# Coverage (install separately: pip install coverage — not in requirements.txt)
coverage run manage.py test sales products suppliers accounts employees finances services reports invoicing
coverage report --include="sales/*,products/*,suppliers/*,accounts/*,employees/*,finances/*,services/*,reports/*,invoicing/*" --omit="*/migrations/*"
```

Test counts per app (via `grep -c "def test_"`): invoicing 34, finances 26, suppliers 12, employees 12, products 10, services 10, reports 10, sales 5, accounts 3 → **~122 tests total.** Expect all-passing **except two preexisting timezone failures in `sales`** (UTC vs `America/Bogota` boundary on the seeded `NC-20260413` credit-note date). Don't "fix" them by editing the seed dates — verify the failure is the known timezone case before touching anything. The README's "113 tests / 111 passing" claim is stale; it predates the invoicing test suite.

## Architecture — the bits that span multiple files

### App layering (matters for migrations and signal wiring)

The order in `INSTALLED_APPS` (see `config/settings.py`) encodes a strict dependency DAG. **Do not reorder it** — `accounts` must be first because it defines `AUTH_USER_MODEL`, and downstream apps assume the layering below:

```
accounts (AUTH_USER_MODEL)
  ↓
customers · suppliers · products       (level 1 — no cross-FKs to each other)
  ↓
sales · employees                       (level 2)
  ↓
invoicing · finances                    (level 3)
  ↓
services                                (level 4 — depends on finances + customers)

audit · reports · frontend              (cross-cutting; no inbound FKs from business apps)
```

Cross-app FKs **must** use string references (`'customers.Customer'`, `settings.AUTH_USER_MODEL`) to avoid the import cycles this layering would otherwise create.

### Signals are the business logic

A lot of state transitions that look like "the view did it" are actually signals. Before modifying a view or model, check the app's `signals.py`:

- `sales` — `SaleItem` post_save decrements `Product.stock` (and raises `ValidationError` if insufficient); `Sale` cancellation restores it. Uses `pre_save` to cache `_previous_status` so the post_save can detect transitions.
- `suppliers` — `PurchaseOrder` transitioning to `RECEIVED` increments stock for all items.
- `employees` — `Payroll` `DRAFT → APPROVED` auto-creates a `finances.Transaction(EXPENSE)`.
- `finances` — `Expense` post_save creates/updates a matching `Transaction(EXPENSE)`.
- `services` — `Service` post_save creates/updates a matching `Transaction(INCOME)`.
- `accounts` — failed-login signal increments `failed_login_attempts`; 5 failures sets `locked_until = now() + 30min`. `LoginView` checks this *before* `authenticate()` and returns HTTP 423.

Two conventions to keep when adding signals:
1. **Sync signals use `QuerySet.update()`, not `instance.save()`**, to avoid recursion.
2. **Imports of `finances.Transaction` happen inside the receiver function**, not at module top, to dodge the circular import that the layering would otherwise produce.

`finances/apps.py` and `services/apps.py` import their `signals` module in `ready()` — when adding a new app with signals, mirror this pattern.

### Atomic write paths

`SaleCreateSerializer.create()` and `OrderRequestWriteSerializer.create()` wrap the parent + children in `transaction.atomic()`. If the stock-decrement signal raises mid-sale, the whole sale rolls back. Any new "header + items" write path should follow this — partial writes will leave orphan rows and break the audit trail.

### Role-based serializer dispatch (ADMIN vs EMPLEADO)

`accounts.CustomUser` has `role ∈ {ADMIN, EMPLEADO}`. Several ViewSets return a **different serializer per role** rather than relying purely on permissions:

| Resource | ADMIN serializer | EMPLEADO serializer |
|---|---|---|
| `Customer`  | `AdminCustomerSerializer` (real `document_number`) | `EmployeeCustomerSerializer` (masks to `"***"`) |
| `Product`   | `ProductSerializer` (includes `cost_price`) | `ProductListSerializer` (no `cost_price`) |
| `Employee`  | full salary + document | both masked to `"***"` |

Pattern: override `get_serializer_class` and branch on `self.request.user.role`. When adding a new sensitive field, decide which variant to put it in — don't just add it to the shared serializer.

Permission classes live in `accounts/permissions.py`: `IsAdminRole`, `IsAdminOrReadOnly`, `IsOwnerOrAdmin`.

### Auditing — every write goes through `AuditLogMixin`

`audit/mixins.py` defines `AuditLogMixin` which overrides `perform_create` / `perform_update` / `perform_destroy` to write `AuditLog` rows. **Every write ViewSet must inherit from it before `viewsets.ModelViewSet`:**

```python
class MyViewSet(AuditLogMixin, viewsets.ModelViewSet):
    ...
```

The mixin swallows its own exceptions — an audit failure must never break the API response. On UPDATE it diffs `concrete_fields` and stores `changed_fields = {"field": {"old": ..., "new": ...}}`. IP is read from `HTTP_X_FORWARDED_FOR` (first hop) then `REMOTE_ADDR`.

### `finances.Transaction` uses a generic-FK pattern

Rather than Django's `ContentType`, `Transaction` has `reference_type` (choices: `SALE`, `SUPPLIER_INVOICE`, `PAYROLL`, `CREDIT_NOTE`, `WITHDRAWAL`, `EXPENSE`, `SERVICE`, `OTHER`) + `reference_id` (int). When you introduce a new source of income/expense, add a new `reference_type` choice and wire a signal that creates/syncs the `Transaction` — don't bypass `Transaction` by adding a new ledger model.

### Sensitive fields are encrypted at rest

`Customer.document_number` and `Employee.document_number` use `EncryptedCharField` from `django-encrypted-model-fields`. The Fernet key lives in `.env` as `FIELD_ENCRYPTION_KEY` — losing it makes existing rows unreadable. If you need to query these fields, do exact matches in Python after fetching; SQL `LIKE`/range queries won't work on ciphertext.

### Conventions worth keeping consistent

- Money is always `DecimalField(max_digits=12, decimal_places=2)`. Never `FloatField`.
- All business-data models carry `created_by` (FK to `AUTH_USER_MODEL`, `on_delete=PROTECT`), `created_at`, `updated_at`. Serializers must declare `read_only_fields = ['created_by', 'created_at', 'updated_at']` and the ViewSet's `perform_create` injects `request.user`.
- `verbose_name` / `verbose_name_plural` are written in Spanish in every model `Meta`.
- CSV exports prefix UTF-8 BOM (`'﻿'`) so Excel detects the encoding.
- `db_index=True` on FKs and status fields that get filtered/ordered (status, date fields, FKs in `search_fields`).

## Config / environment

- `.env` is **required** — `config/settings.py` reads `SECRET_KEY` and `FIELD_ENCRYPTION_KEY` with no defaults (the app won't start without them). `CORS_ALLOWED_ORIGINS` defaults to `[]` and `DATABASE_URL` defaults to local SQLite (`sqlite:///db.sqlite3`) — so dev runs on SQLite out of the box; set `DATABASE_URL=postgres://…` (psycopg2 is installed) for Postgres. Copy from `.env.example` and fill in. Generate the Fernet key with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
- `ALLOWED_HOSTS` is currently **hardcoded to `['*']`** in `settings.py` (line 36) for ngrok development — the `.env`-driven version is commented out one line above. Before deploying, restore the env-driven line and run `check_production_readiness`.
- `CSRF_TRUSTED_ORIGINS` is set to `https://*.ngrok-free.app` for the same reason.
- Default pagination is `config.pagination.StandardPagination`, `PAGE_SIZE=20`.
- Timezone is `America/Bogota`, `USE_TZ=True` — be careful with date-range filters (the `sales-by-payment` report and the two known-failing tests are timezone-sensitive).

## Frontend

The `frontend` app serves **two** self-contained SPA templates (vanilla JS + Tailwind CDN, no build step), both via `TemplateView` in `frontend/views.py`:
- `index.html` at `/` (`FrontendView`) — the main desktop SPA.
- `mobile.html` at `/m/` (`MobileFrontendView`) — a mobile-oriented variant.

Both call the same `/api/...` endpoints with `Authorization: Bearer <jwt>`. File downloads (PDF/CSV) are fetched as a Blob and triggered via an object URL because the auth header can't be set on a plain `<a download>`. When changing shared API behavior, check whether **both** templates consume the affected endpoint.

## Reports

`reports/urls.py` exposes a handful of analytics endpoints under `/api/reports/`:

- `sales-summary/` · `top-products/` · `low-stock/` · `financial-balance/` — JSON
- `sales-by-payment/` — JSON with period filters (today/week/month/range); the date filtering is **timezone-sensitive** (see the known sales-test failures)
- `sales-by-payment/export-csv/` — UTF-8 BOM-prefixed CSV so Excel detects encoding
- `sales-by-payment/export-pdf/` — ReportLab-generated PDF

The CSV/PDF export endpoints pair with the frontend's "Blob + object URL + JWT" download pattern (see Frontend section). When adding new exports, follow both conventions: BOM-prefix CSV output, and serve PDF via ReportLab from a `@action(detail=…)` so the SPA's blob-download helper works without changes.

## Things the README claims that may have drifted

The README is dated 2026-04-13 and lists the URL router, but `config/urls.py` has since added routes the README doesn't mention: `work-schedules` (employees), `credit-notes` (invoicing). Treat the README as the design spec, not a current inventory — when in doubt, read `config/urls.py` and the app's `views.py`. Note also that `config/urls.py` registers more resources than the README documents (e.g. `order-requests`, `expense-categories`, `expenses`, `service-types`, `services`, `cash-registers`, `audit-logs`).

## Other docs

- `docs/API.md` — endpoint reference (Spanish), base URL and auth flow.
- `docs_front/` — design PDFs (V1/V2 dashboard & login mockups) for the SPA. Not code; design intent for the frontend.
