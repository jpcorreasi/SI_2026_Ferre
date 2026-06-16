"""
ETL · Paso 1 — Export desde la BD de Django a etl/dump.json
===========================================================
Lee cada tabla de las apps de negocio con un cursor CRUDO (no via ORM), de modo
que los campos cifrados (document_number con Fernet) se exportan como el TOKEN
almacenado tal cual — el backend NestJS los descifra luego con la MISMA clave.

Funciona con la BD que tenga configurada Django (por defecto SQLite db.sqlite3).

Uso (desde la raíz del repo, con el venv activado):
    python etl/export_from_django.py
"""

import os
import sys
import json
import decimal
from datetime import datetime, date, time, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.db import connection  # noqa: E402

# Orden no importa para exportar; el import lo reordena por dependencias.
TABLES = [
    "accounts_customuser",
    "accounts_auditsession",
    "customers_customer",
    "suppliers_supplier",
    "products_category",
    "products_product",
    "suppliers_purchaseorder",
    "suppliers_purchaseorderitem",
    "suppliers_orderrequest",
    "suppliers_orderrequestitem",
    "sales_paymentmethod",
    "sales_sale",
    "sales_saleitem",
    "employees_employee",
    "employees_payroll",
    "employees_payrollitem",
    "employees_workschedule",
    "employees_workshift",
    "invoicing_customerinvoice",
    "invoicing_creditnote",
    "invoicing_creditnoteitem",
    "invoicing_supplierinvoice",
    "invoicing_supplierinvoiceitem",
    "finances_transaction",
    "finances_cashregister",
    "finances_expensecategory",
    "finances_expense",
    "services_servicetype",
    "services_service",
    "audit_auditlog",
]


def encode(o):
    """Serializa tipos no-JSON. Las fechas aware se normalizan a UTC naive."""
    if isinstance(o, datetime):
        if o.tzinfo is not None:
            o = o.astimezone(timezone.utc).replace(tzinfo=None)
        return o.isoformat(sep=" ")
    if isinstance(o, (date, time)):
        return o.isoformat()
    if isinstance(o, decimal.Decimal):
        return str(o)
    if isinstance(o, (bytes, bytearray, memoryview)):
        return bytes(o).decode("utf-8", "replace")
    return str(o)


def main():
    out_path = BASE_DIR / "etl" / "dump.json"
    data = {}
    total = 0

    print(f"\nExportando desde: {connection.settings_dict.get('ENGINE')}")
    with connection.cursor() as cur:
        for table in TABLES:
            cur.execute(f'SELECT * FROM "{table}"')
            colnames = [c[0] for c in cur.description]
            rows = [dict(zip(colnames, r)) for r in cur.fetchall()]
            data[table] = rows
            total += len(rows)
            print(f"  {table:<32} {len(rows):>6} filas")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, default=encode, ensure_ascii=False)

    print(f"\n[OK] {total} filas en {len(TABLES)} tablas -> {out_path}\n")


if __name__ == "__main__":
    main()
