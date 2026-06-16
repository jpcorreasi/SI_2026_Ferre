# F7 — Migración de datos (ETL) Django → PostgreSQL

Guía para migrar los datos de la BD de Django a la nueva BD PostgreSQL que usa
el backend NestJS/Prisma. El ETL aprovecha que el `schema.prisma` mapea las
tablas/columnas a los **mismos nombres de Django** (`@@map`/`@map`), por lo que
es prácticamente una copia directa.

Dos pasos:

1. **Export** — `etl/export_from_django.py` (Python, venv de Django) → `etl/dump.json`
2. **Import** — `ferreteria-api/scripts/etl-import.ts` (Node/Prisma) → PostgreSQL

---

## Requisitos

- PostgreSQL en marcha y una base de datos vacía para el proyecto.
- `ferreteria-api/.env` configurado:
  - `DATABASE_URL="postgresql://usuario:pass@host:5432/ferreteria_db?schema=public"`
  - **`FIELD_ENCRYPTION_KEY`** = la **misma clave Fernet** del `.env` de Django
    (necesaria para que el backend cifre/descifre de forma consistente; ver nota).
  - `JWT_SECRET` configurado.
- El proyecto Django funcionando (su `.env` con `SECRET_KEY`, `FIELD_ENCRYPTION_KEY`, etc.).

---

## Paso 1 — Crear el esquema en PostgreSQL

Desde `ferreteria-api/`:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init      # crea todas las tablas en Postgres
```

> En un entorno ya provisionado usa `npx prisma migrate deploy`.

## Paso 2 — Exportar desde Django

Desde la **raíz del repo**, con el venv de Django activado
(`venv\Scripts\activate` en Windows):

```bash
python etl/export_from_django.py
```

Genera `etl/dump.json` (no se commitea — contiene PII y hashes). Lee con cursor
**crudo**, así que los campos cifrados se exportan como el token almacenado tal
cual, sin descifrar.

## Paso 3 — Importar a PostgreSQL

Desde `ferreteria-api/`:

```bash
npm run etl:import                       # usa ../etl/dump.json
# o con ruta explícita:
npm run etl:import -- ../etl/dump.json
```

El import:

- Hace `TRUNCATE ... RESTART IDENTITY CASCADE` (es **idempotente**, se puede repetir).
- Inserta en **orden de dependencias** preservando los `id` originales (para que
  las FKs encajen).
- Castea tipos automáticamente vía `information_schema` (`udt_name`): enums,
  `jsonb`, booleanos, fechas, decimales.
- Fija la zona horaria de sesión a **UTC** (las fechas se guardaron en UTC).
- **Resetea las secuencias** de `id` al máximo importado, para que los próximos
  inserts no colisionen.

## Paso 4 — Verificar

Desde `ferreteria-api/`:

```bash
npm run validate          # totales de venta, hashes de contraseña, NIT único, etc.
npm run start:dev         # arranca la API en http://localhost:3000/api
```

Pruebas recomendadas:

- `POST /api/token/` con un usuario migrado (p. ej. `admin_test` / su contraseña)
  → debe devolver tokens (verifica el hash PBKDF2 heredado).
- `GET /api/sales/` y `GET /api/reports/sales-summary/` → conteos coherentes con Django.
- **Paridad del SPA:** apunta el front (`frontend/.../index.html`) a la API nueva
  y recorre los flujos clave (login, ventas, facturas, reportes).

---

## Notas importantes

### Campos cifrados (`document_number`)

`Customer.document_number` y `Employee.document_number` se copian **tal cual**:

- Si el valor almacenado es un **token Fernet**, el backend lo descifra con
  `FIELD_ENCRYPTION_KEY` (la misma clave de Django).
- Si está en **texto plano** (datos heredados/sembrados sin cifrar), el
  `FieldCryptoService.decrypt()` es **tolerante**: detecta que no es un token
  válido y devuelve el valor tal cual — igual que el comportamiento de Django al
  leer datos heredados. **No se pierde ni rompe nada.**

> En la BD de desarrollo (`db.sqlite3`) estos campos están en texto plano. Los
> **registros nuevos** creados desde la API sí se cifran si `FIELD_ENCRYPTION_KEY`
> está configurada. Si quieres homogeneizar (cifrar los heredados), puede hacerse
> en una pasada posterior; no es necesario para operar.

### Fechas y zonas horarias

Django (con `USE_TZ`) guarda en **UTC**. El export normaliza cualquier fecha
*aware* a UTC naive y el import fija la sesión a UTC, de modo que los instantes
se preservan exactamente. Las columnas `@db.Date`/`@db.Time` se copian como
`YYYY-MM-DD` / `HH:MM:SS`.

### Origen SQLite vs PostgreSQL

El ETL está pensado para el `db.sqlite3` actual de Django (lo más común). Como el
export usa el cursor de Django, **también funciona si Django apunta a Postgres**
(las fechas *aware* se normalizan igual).

### Idempotencia y reintentos

El import trunca antes de insertar, así que puedes re-ejecutarlo sin duplicar. Si
falla a mitad (p. ej. una FK inesperada), corrige y vuelve a correr.

---

## Resolución de problemas

| Síntoma | Causa probable / solución |
|---|---|
| `relation "..." does not exist` | Falta correr `prisma migrate dev` (Paso 1). |
| `invalid input value for enum` | Un valor de estado en los datos no coincide con el enum del schema; revisa esa fila en `dump.json`. |
| `violates foreign key constraint` | Datos huérfanos en origen; revisa la FK señalada (el orden de inserción ya respeta dependencias). |
| Login falla para usuarios migrados | Verifica que la contraseña sea la correcta; el hash PBKDF2 se valida tal cual. Si el usuario tenía contraseña inutilizable (`!`), no puede iniciar sesión (esperado). |
| `document_number` se ve como `***` | Es un usuario con rol EMPLEADO (enmascarado por diseño); como ADMIN se ve el valor. |
