"""
Management command: seed_test_data
===================================
Creates a fixed set of test objects. Safe to run multiple times:
every creation uses get_or_create so existing rows are never duplicated.

Usage:
    python manage.py seed_test_data

Signal interaction
------------------
The sales.signals.decrement_stock_on_sale_item signal fires on every new
SaleItem and decrements product.stock. It raises ValidationError if stock
would go negative.  The Destornillador product is seeded with stock=0, so
creating a SaleItem for it is EXPECTED to fail. That failure is caught with
a savepoint so the rest of the transaction stays intact.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Seeds the DB with test data. Idempotent — safe to run multiple times."

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _ok(self, label, model_name, pk, detail):
        """Print a green CREATED or plain EXISTS line."""
        if label == "CREATED":
            tag = self.style.SUCCESS("CREATED")
        else:
            tag = label
        self.stdout.write(f"  [{tag}] {model_name} pk={pk} — {detail}")

    def _section(self, title):
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n--- {title} ---"))

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== SEED TEST DATA ==="))

        self._section("Users")
        admin_user, employee_user = self._create_users()

        self._section("Customers")
        customer1, customer2 = self._create_customers(admin_user)

        self._section("Suppliers")
        self._create_supplier(admin_user)

        self._section("Categories")
        cat_tools, cat_materials = self._create_categories()

        self._section("Products")
        products = self._create_products(cat_tools, cat_materials, admin_user)

        self._section("Payment Methods")
        payment_methods = self._create_payment_methods()

        self._section("Sale + SaleItems")
        sale = self._create_sale(
            customer=customer1,
            payment_method=payment_methods["Efectivo"],
            employee=employee_user,
            products=products,
        )

        self._print_summary(products, sale)

    # ------------------------------------------------------------------
    # Step creators
    # ------------------------------------------------------------------

    def _create_users(self):
        from accounts.models import CustomUser

        admin, created = CustomUser.objects.get_or_create(
            username="admin_test",
            defaults={
                "role": CustomUser.Role.ADMIN,
                "is_superuser": True,
                "is_staff": True,
                "email": "admin@test.com",
                "first_name": "Admin",
                "last_name": "Test",
            },
        )
        if created:
            admin.set_password("Admin1234!")
            admin.save(update_fields=["password"])
        self._ok("CREATED" if created else "EXISTS", "CustomUser", admin.pk,
                 f"username={admin.username}  role={admin.role}  superuser={admin.is_superuser}")

        employee, created = CustomUser.objects.get_or_create(
            username="empleado_test",
            defaults={
                "role": CustomUser.Role.EMPLEADO,
                "is_superuser": False,
                "is_staff": False,
                "email": "empleado@test.com",
                "first_name": "Empleado",
                "last_name": "Test",
            },
        )
        if created:
            employee.set_password("Emp1234!")
            employee.save(update_fields=["password"])
        self._ok("CREATED" if created else "EXISTS", "CustomUser", employee.pk,
                 f"username={employee.username}  role={employee.role}")

        return admin, employee

    def _create_customers(self, created_by):
        from customers.models import Customer

        c1, created = Customer.objects.get_or_create(
            document_number="1234567890",
            defaults={
                "full_name": "Juan Pérez",
                "document_type": Customer.DocumentType.CC,
                "email": "juan@test.com",
                "created_by": created_by,
            },
        )
        self._ok("CREATED" if created else "EXISTS", "Customer", c1.pk, str(c1))

        c2, created = Customer.objects.get_or_create(
            document_number="900123456",
            defaults={
                "full_name": "Empresa ABC",
                "document_type": Customer.DocumentType.NIT,
                "email": "abc@empresa.com",
                "created_by": created_by,
            },
        )
        self._ok("CREATED" if created else "EXISTS", "Customer", c2.pk, str(c2))

        return c1, c2

    def _create_supplier(self, created_by):
        from suppliers.models import Supplier

        supplier, created = Supplier.objects.get_or_create(
            nit="800987654",
            defaults={
                "business_name": "Ferreimportados S.A.",
                "contact_name": "Carlos Ruiz",
                "phone": "3001234567",
                "email": "ventas@ferreimportados.com",
                "created_by": created_by,
            },
        )
        self._ok("CREATED" if created else "EXISTS", "Supplier", supplier.pk, str(supplier))
        return supplier

    def _create_categories(self):
        from products.models import Category

        tools, created = Category.objects.get_or_create(name="Herramientas")
        self._ok("CREATED" if created else "EXISTS", "Category", tools.pk, tools.name)

        materials, created = Category.objects.get_or_create(
            name="Materiales de construcción"
        )
        self._ok("CREATED" if created else "EXISTS", "Category", materials.pk, materials.name)

        return tools, materials

    def _create_products(self, cat_tools, cat_materials, created_by):
        from products.models import Product

        specs = [
            {
                "code": "MART-001",
                "defaults": {
                    "name": "Martillo carpintero",
                    "category": cat_tools,
                    "sale_price": Decimal("35000"),
                    "cost_price": Decimal("20000"),
                    "stock": 10,
                    "min_stock": 3,
                    "created_by": created_by,
                },
            },
            {
                "code": "PUNT-002",
                "defaults": {
                    "name": "Puntilla 2 pulgadas",
                    "category": cat_materials,
                    "sale_price": Decimal("8000"),
                    "cost_price": Decimal("4500"),
                    "stock": 2,
                    "min_stock": 5,   # intentionally low stock
                    "created_by": created_by,
                },
            },
            {
                "code": "DEST-003",
                "defaults": {
                    "name": "Destornillador estrella",
                    "category": cat_tools,
                    "sale_price": Decimal("15000"),
                    "cost_price": Decimal("9000"),
                    "stock": 0,
                    "min_stock": 3,   # intentionally out of stock
                    "created_by": created_by,
                },
            },
        ]

        products = {}
        for spec in specs:
            product, created = Product.objects.get_or_create(
                code=spec["code"], defaults=spec["defaults"]
            )
            self._ok(
                "CREATED" if created else "EXISTS",
                "Product", product.pk,
                f"code={product.code}  name=\"{product.name}\"  "
                f"stock={product.stock}  min_stock={product.min_stock}",
            )
            products[spec["code"]] = product

        return products

    def _create_payment_methods(self):
        from sales.models import PaymentMethod

        methods = {}
        for name in ["Efectivo", "Nequi", "Tarjeta débito"]:
            pm, created = PaymentMethod.objects.get_or_create(name=name)
            self._ok("CREATED" if created else "EXISTS", "PaymentMethod", pm.pk, pm.name)
            methods[name] = pm

        return methods

    def _create_sale(self, customer, payment_method, employee, products):
        from sales.models import Sale, SaleItem

        # ── Sale ──────────────────────────────────────────────────────
        # Use customer + employee as the idempotency key (no natural unique
        # field on Sale). The total covers only the Martillo because the
        # Destornillador is expected to fail the stock check.
        existing_sale = Sale.objects.filter(
            customer=customer, employee=employee
        ).first()

        if existing_sale:
            sale = existing_sale
            self._ok("EXISTS", "Sale", sale.pk,
                     f"total={sale.total}  status={sale.status}")
        else:
            sale = Sale.objects.create(
                customer=customer,
                payment_method=payment_method,
                employee=employee,
                total=Decimal("70000"),   # 2 × 35 000 (Martillo only)
                status=Sale.Status.COMPLETED,
                is_anonymous=False,
            )
            self._ok("CREATED", "Sale", sale.pk,
                     f"total={sale.total}  status={sale.status}")

        # ── SaleItem 1: Martillo ───────────────────────────────────────
        # Stock before the first creation: 10. Signal decrements it to 8.
        # On subsequent runs get_or_create returns the existing row
        # (created=False), the signal does NOT fire again, stock stays at 8.
        martillo = products["MART-001"]
        martillo.refresh_from_db()
        stock_before = martillo.stock

        item1, item1_created = SaleItem.objects.get_or_create(
            sale=sale,
            product=martillo,
            defaults={
                "quantity": 2,
                "unit_price": Decimal("35000"),
                "subtotal": Decimal("70000"),
            },
        )
        martillo.refresh_from_db()   # pick up signal's update

        if item1_created:
            self._ok(
                "CREATED", "SaleItem", item1.pk,
                f"Martillo x2 @ 35 000 — "
                f"stock {stock_before} -> {martillo.stock} (signal fired OK)",
            )
        else:
            self._ok(
                "EXISTS", "SaleItem", item1.pk,
                f"Martillo x2 @ 35 000 — current stock={martillo.stock}",
            )

        # ── SaleItem 2: Destornillador (out of stock — signal must raise) ─
        dest = products["DEST-003"]
        dest.refresh_from_db()

        existing_dest_item = SaleItem.objects.filter(sale=sale, product=dest).first()
        if existing_dest_item:
            self._ok("EXISTS", "SaleItem", existing_dest_item.pk,
                     f"Destornillador x1 @ 15 000 (was created in a previous run)")
        else:
            # The signal raises ValidationError AFTER the INSERT.
            # We wrap in transaction.atomic() so the implicit savepoint is
            # rolled back automatically when the exception propagates out.
            try:
                with transaction.atomic():
                    SaleItem.objects.create(
                        sale=sale,
                        product=dest,
                        quantity=1,
                        unit_price=Decimal("15000"),
                        subtotal=Decimal("15000"),
                    )
                # We only reach here if no exception was raised (unexpected).
                self.stdout.write(
                    self.style.WARNING(
                        "  [WARNING] Destornillador SaleItem was created — "
                        "did the stock change?"
                    )
                )
            except ValidationError as exc:
                msg = exc.messages[0] if exc.messages else str(exc)
                self.stdout.write(
                    f"  [{self.style.WARNING('EXPECTED ERROR')}] "
                    f"signal blocked Destornillador SaleItem — {msg}"
                )

        return sale

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def _print_summary(self, products, sale):
        from decimal import Decimal as D
        from django.db.models import Sum

        from accounts.models import CustomUser
        from customers.models import Customer
        from employees.models import Employee
        from finances.models import CashRegister, Transaction
        from invoicing.models import CustomerInvoice, SupplierInvoice
        from products.models import Category, Product
        from sales.models import PaymentMethod, Sale, SaleItem
        from suppliers.models import PurchaseOrder, Supplier

        self.stdout.write(self.style.MIGRATE_HEADING("\n=== SUMMARY ==="))

        # ── Object counts ─────────────────────────────────────────────
        self.stdout.write("\nObject counts:")
        rows = [
            ("CustomUser",     CustomUser.objects.count()),
            ("Customer",       Customer.objects.count()),
            ("Supplier",       Supplier.objects.count()),
            ("Category",       Category.objects.count()),
            ("Product",        Product.objects.count()),
            ("PaymentMethod",  PaymentMethod.objects.count()),
            ("Sale",           Sale.objects.count()),
            ("SaleItem",       SaleItem.objects.count()),
        ]
        for name, count in rows:
            self.stdout.write(f"  {name:<18} {count}")

        # ── Stock levels ──────────────────────────────────────────────
        self.stdout.write("\nStock levels (all products):")
        self.stdout.write(
            f"  {'Code':<12} {'Name':<32} {'Stock':>6}  {'Min':>4}  Status"
        )
        self.stdout.write("  " + "-" * 70)
        for p in Product.objects.order_by("code"):
            if p.stock == 0:
                status = self.style.ERROR("SIN STOCK")
            elif p.is_low_stock:
                status = self.style.WARNING("BAJO STOCK")
            else:
                status = self.style.SUCCESS("OK")
            self.stdout.write(
                f"  {p.code:<12} {p.name:<32} {p.stock:>6}  {p.min_stock:>4}  {status}"
            )

        # ── Signal test ───────────────────────────────────────────────
        martillo = products["MART-001"]
        martillo.refresh_from_db()
        signal_ok = martillo.stock == 8
        result = self.style.SUCCESS("PASS") if signal_ok else self.style.ERROR("FAIL")
        self.stdout.write(
            f"\nSIGNAL TEST [{result}]: "
            f"Martillo stock should be 8, actual: {martillo.stock}"
        )

        # ── Low-stock test ────────────────────────────────────────────
        low_stock_list = [
            f"{p.code} ({p.stock}/{p.min_stock})"
            for p in Product.objects.order_by("code")
            if p.is_low_stock
        ]
        self.stdout.write(
            f"LOW STOCK TEST: Products below min_stock: {low_stock_list}"
        )

        self.stdout.write(self.style.SUCCESS("\n[OK] Seed completed.\n"))
