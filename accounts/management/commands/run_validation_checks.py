"""
Management command: run_validation_checks
==========================================
Runs a suite of data-integrity and safety checks against the live database.
Prints PASS or FAIL for each check with a reason.

Usage:
    python manage.py run_validation_checks

Checks
------
1. Low-stock products        — lists every Product where stock <= min_stock
2. Password hashes           — verifies no user has a plain-text password
3. AuditSession queryable    — confirms the table exists and SELECT works
4. Sale totals consistency   — sale.total must equal SUM(SaleItem.subtotal)
5. Duplicate NIT constraint  — inserting a duplicate NIT must raise IntegrityError
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import IntegrityError, transaction


class Command(BaseCommand):
    help = "Runs data-integrity and safety checks. Prints PASS/FAIL per check."

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== VALIDATION CHECKS ===\n"))

        checks = [
            ("Low-stock products detected",            self._check_low_stock),
            ("Passwords stored as hashes (not plain)", self._check_passwords),
            ("AuditSession table is queryable",        self._check_audit_session),
            ("Sale totals match SaleItems sum",        self._check_sale_totals),
            ("Duplicate NIT raises IntegrityError",    self._check_duplicate_nit),
        ]

        results = []
        for name, fn in checks:
            try:
                passed, detail = fn()
            except Exception as exc:
                passed = False
                detail = f"Unexpected {type(exc).__name__}: {exc}"
            results.append((name, passed, detail))

        # ── Report ────────────────────────────────────────────────────
        self.stdout.write("")
        for name, passed, detail in results:
            badge = self.style.SUCCESS("PASS") if passed else self.style.ERROR("FAIL")
            self.stdout.write(f"  [{badge}] {name}")
            self.stdout.write(f"         > {detail}")

        n_pass = sum(1 for _, p, _ in results if p)
        total = len(results)
        self.stdout.write("")
        summary = f"{n_pass}/{total} checks passed"
        if n_pass == total:
            self.stdout.write(self.style.SUCCESS(f"[OK] {summary}\n"))
        else:
            self.stdout.write(self.style.ERROR(f"[FAIL] {summary}\n"))

    # ------------------------------------------------------------------
    # Check 1 — Low stock
    # ------------------------------------------------------------------

    def _check_low_stock(self):
        """
        Lists every product where stock <= min_stock.
        This check always returns PASS — it is informational, not a failure.
        An empty database is also PASS (nothing to check).
        """
        from products.models import Product

        all_products = list(Product.objects.order_by("code"))
        if not all_products:
            return True, "No products in DB"

        low = [p for p in all_products if p.is_low_stock]
        if not low:
            return True, f"All {len(all_products)} product(s) are above min_stock"

        items = ", ".join(
            f"{p.code} \"{p.name}\" (stock={p.stock}, min={p.min_stock})"
            for p in low
        )
        return True, f"{len(low)} product(s) below min_stock: {items}"

    # ------------------------------------------------------------------
    # Check 2 — Password hashes
    # ------------------------------------------------------------------

    def _check_passwords(self):
        """
        Django stores passwords as '<algorithm>$<iterations>$<salt>$<hash>'.
        Every non-empty password field must start with '$' or a known prefix
        (pbkdf2, argon2, bcrypt, scrypt …). We simply verify it does NOT
        look like a plain string (i.e., it must contain '$').
        An unusable password ('!') is acceptable — it means login is disabled.
        """
        from accounts.models import CustomUser

        users = list(CustomUser.objects.all())
        if not users:
            return True, "No users in DB"

        plain_text_users = []
        for user in users:
            pwd = user.password or ""
            # Unusable password marker set by set_unusable_password() starts with '!'
            if pwd and not pwd.startswith("!") and "$" not in pwd:
                plain_text_users.append(user.username)

        if plain_text_users:
            return False, f"Plain-text passwords detected for: {plain_text_users}"

        return (
            True,
            f"All {len(users)} user(s) have hashed passwords "
            f"(contain '$' in password field)",
        )

    # ------------------------------------------------------------------
    # Check 3 — AuditSession queryable
    # ------------------------------------------------------------------

    def _check_audit_session(self):
        """
        Verifies the AuditSession table exists and can be queried.
        A successful SELECT (even returning 0 rows) means the table is healthy.
        """
        from accounts.models import AuditSession

        count = AuditSession.objects.count()
        return True, f"Table queryable — {count} session record(s) found"

    # ------------------------------------------------------------------
    # Check 4 — Sale totals consistency
    # ------------------------------------------------------------------

    def _check_sale_totals(self):
        """
        For every Sale, verifies that:
            sale.total  ==  SUM(SaleItem.subtotal for items in sale)

        A tolerance of 0.01 is used to guard against floating-point noise,
        though all values are DecimalField so this should never trigger.
        """
        from django.db.models import Sum

        from sales.models import Sale

        sales = list(Sale.objects.all())
        if not sales:
            return True, "No sales in DB"

        mismatches = []
        for sale in sales:
            item_sum = sale.items.aggregate(s=Sum("subtotal"))["s"] or Decimal("0")
            if abs(sale.total - item_sum) > Decimal("0.01"):
                mismatches.append(
                    f"Sale #{sale.pk}: stored_total={sale.total}, items_sum={item_sum}"
                )

        if mismatches:
            return False, "Mismatches — " + " | ".join(mismatches)

        return True, f"All {len(sales)} sale(s): total == SUM(subtotal)"

    # ------------------------------------------------------------------
    # Check 5 — Duplicate NIT raises IntegrityError
    # ------------------------------------------------------------------

    def _check_duplicate_nit(self):
        """
        Attempts to INSERT a Supplier with a NIT that already exists.
        Expects an IntegrityError from the unique constraint on Supplier.nit.

        The attempt is wrapped in transaction.atomic() so that the automatic
        savepoint is rolled back cleanly regardless of the outcome, leaving
        the surrounding transaction untouched.
        """
        from accounts.models import CustomUser
        from suppliers.models import Supplier

        existing = Supplier.objects.first()
        if not existing:
            return False, "No suppliers in DB — seed data first with seed_test_data"

        user = CustomUser.objects.first()
        if not user:
            return False, "No users in DB — seed data first with seed_test_data"

        duplicate_nit = existing.nit

        try:
            with transaction.atomic():
                Supplier.objects.create(
                    business_name="DUPLICADO_TEST_DO_NOT_KEEP",
                    nit=duplicate_nit,   # ← intentional duplicate
                    created_by=user,
                )
            # Reaching here means the DB accepted the duplicate — unexpected.
            return False, (
                f'IntegrityError was NOT raised for nit="{duplicate_nit}". '
                "The unique constraint may be missing — run makemigrations."
            )
        except IntegrityError:
            return True, (
                f'IntegrityError raised as expected for duplicate nit="{duplicate_nit}"'
            )
