"""
invoicing/tests.py
==================
Integration tests for the invoicing app — 34 scenarios.

Auth: APITestCase + force_authenticate (no JWT overhead in unit tests).
setUp builds: admin, employee, category, product (stock=20→12 after sale),
              payment method, customer, supplier, one COMPLETED Sale with
              two SaleItems (item1: qty=5, item2: qty=3, total=400 000).

CustomerInvoice          (01-10)
CreditNote               (11-17)
SupplierInvoice create   (18-20)
CustomerInvoice edit     (21-26) — HU-018
SupplierInvoice edit     (27-34) — HU-020
"""

from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import CustomUser
from customers.models import Customer
from finances.models import Transaction
from invoicing.models import CreditNote, CustomerInvoice, SupplierInvoice
from products.models import Category, Product
from sales.models import PaymentMethod, Sale, SaleItem
from suppliers.models import Supplier


class InvoicingTests(APITestCase):
    """
    All 20 test cases share this fixture set.

    Stock note: SaleItems are created directly (bypassing SaleCreateSerializer)
    so stock is decremented manually in setUp:
        item1 (qty=5) + item2 (qty=3) → stock 20 → 12.
    """

    # ------------------------------------------------------------------
    # setUp
    # ------------------------------------------------------------------

    def setUp(self):
        # Users
        self.admin = CustomUser.objects.create_user(
            username='admin_inv',
            password='Pass1234!',
            role=CustomUser.Role.ADMIN,
        )
        self.employee = CustomUser.objects.create_user(
            username='emp_inv',
            password='Pass1234!',
            role=CustomUser.Role.EMPLEADO,
        )

        # Catalogue
        self.category = Category.objects.create(name='Herramientas')
        self.product = Product.objects.create(
            code='MART-001',
            name='Martillo',
            category=self.category,
            sale_price=Decimal('50000'),
            cost_price=Decimal('30000'),
            stock=20,
            min_stock=3,
            created_by=self.admin,
        )
        self.supplier = Supplier.objects.create(
            business_name='Proveedor Test S.A.',
            nit='900000001-1',
            created_by=self.admin,
        )

        # Sales fixtures
        self.payment_method = PaymentMethod.objects.create(name='Efectivo')
        self.customer = Customer.objects.create(
            full_name='Cliente Test',
            document_type=Customer.DocumentType.CC,
            document_number='1234567890',
            created_by=self.admin,
        )

        # Sale total: 5 × 50 000 + 3 × 50 000 = 400 000
        self.sale = Sale.objects.create(
            customer=self.customer,
            payment_method=self.payment_method,
            employee=self.admin,
            total=Decimal('400000'),
            status=Sale.Status.COMPLETED,
        )
        self.item1 = SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=5,
            unit_price=Decimal('50000'),
            subtotal=Decimal('250000'),
        )
        self.item2 = SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=3,
            unit_price=Decimal('50000'),
            subtotal=Decimal('150000'),
        )
        # Reflect stock decrement that the serializer would have done.
        self.product.stock -= 8   # item1(5) + item2(3); stock = 12
        self.product.save()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _post_invoice(self, user=None, **extra):
        """POST /api/customer-invoices/ as *user* (default: admin)."""
        self.client.force_authenticate(user=user or self.admin)
        payload = {'sale': self.sale.id}
        payload.update(extra)
        return self.client.post('/api/customer-invoices/', payload, format='json')

    def _make_invoice(self, **extra):
        """Create an invoice for self.sale and return the CustomerInvoice instance."""
        self._post_invoice(**extra)
        return CustomerInvoice.objects.get(sale=self.sale)

    def _post_credit_note(self, items, sale_id=None, user=None):
        """POST /api/credit-notes/ as *user* (default: admin)."""
        self.client.force_authenticate(user=user or self.admin)
        return self.client.post(
            '/api/credit-notes/',
            {
                'sale': sale_id or self.sale.id,
                'reason': 'Producto defectuoso',
                'items': items,
            },
            format='json',
        )

    def _post_supplier_invoice(self, number='FAC-2025-001', qty=10, **extra):
        """POST /api/supplier-invoices/ as admin."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            'supplier': self.supplier.id,
            'supplier_invoice_number': number,
            'received_at': '2025-04-15',
            'payment_status': 'PENDING',
            'tax': '0.00',
            'items': [
                {
                    'product': self.product.id,
                    'quantity': qty,
                    'unit_cost': '30000.00',
                }
            ],
        }
        payload.update(extra)
        return self.client.post('/api/supplier-invoices/', payload, format='json')

    # ==================================================================
    # CUSTOMER INVOICE — tests 01-10
    # ==================================================================

    def test_01_create_invoice_success(self):
        """POST para una venta completada devuelve 201 y persiste la factura."""
        response = self._post_invoice()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('invoice_number', response.data)
        self.assertTrue(CustomerInvoice.objects.filter(sale=self.sale).exists())

    def test_02_invoice_number_format(self):
        """El número de factura debe tener formato FV-YYYYMMDD-NNNN."""
        import re

        response = self._post_invoice()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        today = timezone.localdate().strftime('%Y%m%d')
        self.assertRegex(response.data['invoice_number'], rf'^FV-{today}-\d{{4}}$')

    def test_03_invoice_with_discount_and_tax_calculates_total(self):
        """total = sale.total − discount + tax se calcula en el servidor."""
        discount = Decimal('60000')   # 15 % de 400 000 — dentro del límite del 30 %
        tax      = Decimal('10000')

        response = self._post_invoice(
            discount=str(discount),
            tax=str(tax),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        expected = Decimal('400000') - discount + tax  # 350 000
        self.assertEqual(Decimal(response.data['total']), expected)

    def test_04_reject_discount_exceeds_30_pct(self):
        """Descuento > 30 % del total de la venta devuelve 400."""
        # 30 % de 400 000 = 120 000; enviamos 120 001.
        response = self._post_invoice(discount='120001.00')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('discount', response.data)

    def test_05_reject_duplicate_invoice_for_same_sale(self):
        """No se puede crear una segunda factura para la misma venta."""
        self._post_invoice()            # primera → 201
        response = self._post_invoice() # segunda → 400

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_06_reject_invoice_for_cancelled_sale(self):
        """Una venta cancelada no puede facturarse."""
        cancelled_sale = Sale.objects.create(
            customer=self.customer,
            payment_method=self.payment_method,
            employee=self.admin,
            total=Decimal('50000'),
            status=Sale.Status.CANCELLED,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            '/api/customer-invoices/',
            {'sale': cancelled_sale.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_07_generated_by_is_authenticated_user(self):
        """generated_by debe ser el usuario que realizó la petición."""
        self._post_invoice()
        invoice = CustomerInvoice.objects.get(sale=self.sale)

        self.assertEqual(invoice.generated_by, self.admin)

    def test_08_pdf_endpoint_returns_application_pdf(self):
        """GET /api/customer-invoices/{id}/pdf/ devuelve Content-Type: application/pdf."""
        invoice = self._make_invoice()
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(f'/api/customer-invoices/{invoice.id}/pdf/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')

    def test_09_send_email_rejects_invalid_format(self):
        """send-email rechaza una dirección de correo con formato inválido."""
        invoice = self._make_invoice()
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            f'/api/customer-invoices/{invoice.id}/send-email/',
            {'recipient_email': 'no-es-un-email'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        invoice.refresh_from_db()
        self.assertFalse(invoice.sent_by_email)

    def test_10_send_email_rejects_resend(self):
        """send-email devuelve 400 si la factura ya fue enviada anteriormente."""
        invoice = self._make_invoice()
        self.client.force_authenticate(user=self.admin)
        url     = f'/api/customer-invoices/{invoice.id}/send-email/'
        payload = {'recipient_email': 'cliente@ejemplo.com'}

        r1 = self.client.post(url, payload, format='json')  # primer envío — OK
        r2 = self.client.post(url, payload, format='json')  # reenvío — falla

        self.assertEqual(r1.status_code, status.HTTP_200_OK)
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        # El email_sent_to debe haberse guardado en el primer envío.
        invoice.refresh_from_db()
        self.assertEqual(invoice.email_sent_to, 'cliente@ejemplo.com')

    # ==================================================================
    # CREDIT NOTE — tests 11-17
    # ==================================================================

    def test_11_create_credit_note_success(self):
        """Devolución parcial de item1 (2 de 5 uds) devuelve 201."""
        response = self._post_credit_note(
            items=[{'sale_item': self.item1.id, 'quantity_returned': 2}]
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(CreditNote.objects.filter(sale=self.sale).exists())
        note = CreditNote.objects.get(sale=self.sale)
        today = timezone.localdate().strftime('%Y%m%d')
        self.assertRegex(note.credit_note_number, rf'^NC-{today}-\d{{4}}$')

    def test_12_credit_note_restores_stock(self):
        """Devolver 2 uds de item1 debe sumar 2 al stock del producto."""
        stock_before = self.product.stock  # 12

        self._post_credit_note(
            items=[{'sale_item': self.item1.id, 'quantity_returned': 2}]
        )

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, stock_before + 2)

    def test_13_credit_note_creates_expense_transaction(self):
        """Crear una nota crédito debe registrar una Transaction de tipo EXPENSE."""
        before = Transaction.objects.filter(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.CREDIT_NOTE,
        ).count()

        self._post_credit_note(
            items=[{'sale_item': self.item1.id, 'quantity_returned': 2}]
        )

        after = Transaction.objects.filter(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.CREDIT_NOTE,
        ).count()
        self.assertEqual(after, before + 1)

    def test_14_reject_quantity_returned_exceeds_sold(self):
        """Devolver más unidades que las vendidas debe devolver 400 y no tocar el stock."""
        response = self._post_credit_note(
            items=[{'sale_item': self.item1.id, 'quantity_returned': 99}]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 12)  # sin cambios

    def test_15_reject_credit_note_for_cancelled_sale(self):
        """No se puede crear nota crédito para una venta cancelada."""
        cancelled = Sale.objects.create(
            customer=self.customer,
            payment_method=self.payment_method,
            employee=self.admin,
            total=Decimal('50000'),
            status=Sale.Status.CANCELLED,
        )
        # El validador de estado dispara antes de revisar los ítems.
        response = self._post_credit_note(
            sale_id=cancelled.id,
            items=[{'sale_item': self.item1.id, 'quantity_returned': 1}],
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('sale', response.data)

    def test_16_reject_sale_item_from_different_sale(self):
        """Un sale_item perteneciente a otra venta debe ser rechazado."""
        other_sale = Sale.objects.create(
            customer=self.customer,
            payment_method=self.payment_method,
            employee=self.admin,
            total=Decimal('50000'),
            status=Sale.Status.COMPLETED,
        )
        other_item = SaleItem.objects.create(
            sale=other_sale,
            product=self.product,
            quantity=1,
            unit_price=Decimal('50000'),
            subtotal=Decimal('50000'),
        )
        # Intentar usar other_item en una nota crédito de self.sale.
        response = self._post_credit_note(
            items=[{'sale_item': other_item.id, 'quantity_returned': 1}]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('items', response.data)

    def test_17_credit_note_qty_accumulation(self):
        """
        Tras devolver 2 de las 5 uds de item1 quedan 3 disponibles.
        Un intento de devolver 4 en una segunda nota debe ser rechazado.
        """
        r1 = self._post_credit_note(
            items=[{'sale_item': self.item1.id, 'quantity_returned': 2}]
        )
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED, r1.data)

        r2 = self._post_credit_note(
            items=[{'sale_item': self.item1.id, 'quantity_returned': 4}]
        )
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('items', r2.data)

    # ==================================================================
    # SUPPLIER INVOICE — tests 18-20
    # ==================================================================

    def test_18_create_supplier_invoice_updates_stock(self):
        """Registrar una factura de proveedor incrementa el stock del producto recibido."""
        stock_before = self.product.stock  # 12

        response = self._post_supplier_invoice(qty=10)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, stock_before + 10)

    def test_19_supplier_invoice_creates_expense_transaction(self):
        """Registrar una factura de proveedor debe crear una Transaction tipo EXPENSE."""
        before = Transaction.objects.filter(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.SUPPLIER_INVOICE,
        ).count()

        self._post_supplier_invoice()

        after = Transaction.objects.filter(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.SUPPLIER_INVOICE,
        ).count()
        self.assertEqual(after, before + 1)

    def test_20_reject_duplicate_supplier_invoice_number(self):
        """Un proveedor no puede tener dos facturas con el mismo número."""
        r1 = self._post_supplier_invoice(number='FAC-DUP-001')
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)

        r2 = self._post_supplier_invoice(number='FAC-DUP-001')

        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        # El modelo tiene unique_together → DRF devuelve 'non_field_errors';
        # el serializer también valida explícitamente con clave 'supplier_invoice_number'.
        # Aceptamos cualquiera de las dos formas de señalar el conflicto.
        has_error = (
            'supplier_invoice_number' in r2.data
            or 'non_field_errors' in r2.data
        )
        self.assertTrue(has_error, f'Respuesta inesperada: {r2.data}')

    # ==================================================================
    # CUSTOMER INVOICE EDIT — tests 21-26 (HU-018)
    # ==================================================================

    def _patch_invoice(self, invoice_id, user=None, **payload):
        """PATCH /api/customer-invoices/{id}/ as *user* (default: admin)."""
        self.client.force_authenticate(user=user or self.admin)
        return self.client.patch(
            f'/api/customer-invoices/{invoice_id}/',
            payload,
            format='json',
        )

    def test_21_admin_can_edit_invoice_and_total_is_recalculated(self):
        """PATCH con nuevo discount y tax recalcula total en el servidor."""
        invoice = self._make_invoice()
        # Original: total = 400 000 − 0 + 0 = 400 000

        response = self._patch_invoice(
            invoice.id,
            discount='40000.00',   # 10 % — dentro del límite
            tax='20000.00',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        invoice.refresh_from_db()
        # total = 400 000 - 40 000 + 20 000 = 380 000
        self.assertEqual(invoice.total, Decimal('380000'))
        self.assertEqual(invoice.discount, Decimal('40000'))
        self.assertEqual(invoice.tax, Decimal('20000'))

    def test_22_edit_resets_sent_by_email_allowing_resend(self):
        """Editar una factura ya enviada restablece sent_by_email=False."""
        invoice = self._make_invoice()
        # Mark as sent manually.
        invoice.sent_by_email = True
        invoice.email_sent_to = 'original@test.com'
        invoice.save(update_fields=['sent_by_email', 'email_sent_to'])

        response = self._patch_invoice(invoice.id, notes='Nota de corrección')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        invoice.refresh_from_db()
        self.assertFalse(invoice.sent_by_email, 'sent_by_email debe resetearse tras edición')

    def test_23_edit_blocked_when_credit_notes_exist_without_force(self):
        """PATCH sin force_update devuelve 400 si hay notas crédito activas."""
        invoice = self._make_invoice()
        # Create a credit note linked to this invoice.
        self._post_credit_note(
            items=[{'sale_item': self.item1.id, 'quantity_returned': 1}]
        )

        response = self._patch_invoice(invoice.id, notes='Intento sin force')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('credit_notes_warning', response.data)

    def test_24_edit_proceeds_with_force_update_despite_credit_notes(self):
        """PATCH con force_update=true procede aunque existan notas crédito activas."""
        invoice = self._make_invoice()
        self._post_credit_note(
            items=[{'sale_item': self.item1.id, 'quantity_returned': 1}]
        )

        response = self._patch_invoice(
            invoice.id,
            notes='Corrección confirmada',
            force_update=True,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.notes, 'Corrección confirmada')

    def test_25_employee_cannot_edit_invoice(self):
        """EMPLEADO recibe 403 al intentar PATCH sobre una factura."""
        invoice = self._make_invoice()

        response = self._patch_invoice(invoice.id, user=self.employee, notes='Intento empleado')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_26_edit_creates_audit_log_record(self):
        """Editar una factura genera un registro en AuditLog con los campos cambiados."""
        from audit.models import AuditLog

        invoice = self._make_invoice()

        self._patch_invoice(invoice.id, discount='30000.00', tax='5000.00')

        log = AuditLog.objects.filter(
            action=AuditLog.Action.UPDATE,
            model_name='customerinvoice',
            object_id=str(invoice.id),
        ).last()
        self.assertIsNotNone(log, 'No se encontró entrada de AuditLog para la edición')
        self.assertIsNotNone(log.changed_fields)
        self.assertIn('total', log.changed_fields)

    # ==================================================================
    # SUPPLIER INVOICE EDIT — tests 27-34 (HU-020)
    # ==================================================================

    def _patch_supplier_invoice(self, invoice_id, user=None, **payload):
        """PATCH /api/supplier-invoices/{id}/ as *user* (default: admin)."""
        self.client.force_authenticate(user=user or self.admin)
        return self.client.patch(
            f'/api/supplier-invoices/{invoice_id}/',
            payload,
            format='json',
        )

    def _make_supplier_invoice(self, qty=10, number='FAC-EDIT-001', tax='0.00'):
        """Create a supplier invoice and return the instance."""
        resp = self._post_supplier_invoice(number=number, qty=qty, tax=tax)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        return SupplierInvoice.objects.get(supplier_invoice_number=number)

    def test_27_admin_can_edit_header_fields(self):
        """PATCH en campos de cabecera actualiza la factura sin tocar el stock."""
        inv = self._make_supplier_invoice()       # stock +10 in DB
        self.product.refresh_from_db()
        stock_before = self.product.stock         # 22 (12+10), after actual DB update

        response = self._patch_supplier_invoice(
            inv.id,
            payment_status='PAID',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        inv.refresh_from_db()
        self.assertEqual(inv.payment_status, 'PAID')
        # Stock must not change when items are not included in the PATCH.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, stock_before)

    def test_28_edit_items_adjusts_stock_correctly(self):
        """
        Replacing items reverts the old stock contribution and applies new quantities.
        Net change = new_qty − old_qty.
        """
        inv = self._make_supplier_invoice(qty=10)  # stock: 12 → 22 in DB
        self.product.refresh_from_db()
        stock_after_create = self.product.stock    # 22

        # Replace qty=10 with qty=6 → net = 6 − 10 = −4 → new stock = 22 − 4 = 18
        response = self._patch_supplier_invoice(
            inv.id,
            items=[{'product': self.product.id, 'quantity': 6, 'unit_cost': '30000.00'}],
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, stock_after_create - 10 + 6)  # 18

    def test_29_edit_items_recalculates_total(self):
        """Reemplazar ítems recalcula total = Σ(qty × cost) + tax."""
        inv = self._make_supplier_invoice(qty=10, tax='10000.00')
        # Original total: 10 × 30 000 + 10 000 = 310 000

        response = self._patch_supplier_invoice(
            inv.id,
            tax='20000.00',
            items=[{'product': self.product.id, 'quantity': 5, 'unit_cost': '40000.00'}],
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        inv.refresh_from_db()
        # 5 × 40 000 + 20 000 = 220 000
        self.assertEqual(inv.total, Decimal('220000'))

    def test_30_stock_warning_when_items_change_causes_negative_stock(self):
        """
        Reducir ítems por debajo del stock disponible devuelve 400 con stock_warning.
        Scenario: create invoice with qty=10 (stock: 12→22), simulate sales consuming
        all but 5 units (DB stock → 5), then try to reduce qty from 10 to 1:
          net = 1 − 10 = −9 → new stock = 5 − 9 = −4 → warning.
        """
        from products.models import Product as Prod

        inv = self._make_supplier_invoice(qty=10)  # stock → 22

        # Simulate stock consumption (bypass model validators via QuerySet.update).
        Prod.objects.filter(pk=self.product.pk).update(stock=5)

        response = self._patch_supplier_invoice(
            inv.id,
            items=[{'product': self.product.id, 'quantity': 1, 'unit_cost': '30000.00'}],
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('stock_warning', response.data)

    def test_31_valid_items_replacement_succeeds(self):
        """Reemplazar ítems con cantidad que mantiene stock ≥ 0 retorna 200."""
        inv = self._make_supplier_invoice(qty=10)  # stock: 12 → 22
        self.product.refresh_from_db()
        stock_before = self.product.stock          # 22

        # Reduce to qty=8: net = 8 − 10 = −2 → new stock = 22 − 2 = 20 ≥ 0
        response = self._patch_supplier_invoice(
            inv.id,
            items=[{'product': self.product.id, 'quantity': 8, 'unit_cost': '30000.00'}],
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, stock_before - 2)  # 20

    def test_32_related_expense_transaction_updated_after_total_change(self):
        """Editar ítems actualiza el monto de la Transaction EXPENSE vinculada."""
        inv = self._make_supplier_invoice(qty=10)
        txn = Transaction.objects.get(
            reference_type=Transaction.ReferenceType.SUPPLIER_INVOICE,
            reference_id=inv.pk,
        )
        original_amount = txn.amount

        self._patch_supplier_invoice(
            inv.id,
            items=[{'product': self.product.id, 'quantity': 3, 'unit_cost': '30000.00'}],
        )

        txn.refresh_from_db()
        self.assertNotEqual(txn.amount, original_amount)
        # new total = 3 × 30 000 = 90 000
        self.assertEqual(txn.amount, Decimal('90000'))

    def test_33_edit_creates_audit_log_record(self):
        """Editar una factura de proveedor genera un registro AuditLog con los cambios."""
        from audit.models import AuditLog

        inv = self._make_supplier_invoice()
        self._patch_supplier_invoice(inv.id, payment_status='PAID')

        log = AuditLog.objects.filter(
            action=AuditLog.Action.UPDATE,
            model_name='supplierinvoice',
            object_id=str(inv.id),
        ).last()
        self.assertIsNotNone(log, 'No se encontró AuditLog para la edición de factura proveedor')
        self.assertIsNotNone(log.changed_fields)
        self.assertIn('payment_status', log.changed_fields)

    def test_34_closed_register_warning_bypassed_with_force_update(self):
        """
        Si la transacción cae en un período de caja cerrado:
          - Sin force_update → 400 con closed_register_warning.
          - Con force_update=true → 200 (warning bypassed).
        """
        from finances.models import CashRegister

        inv = self._make_supplier_invoice()
        txn = Transaction.objects.get(
            reference_type=Transaction.ReferenceType.SUPPLIER_INVOICE,
            reference_id=inv.pk,
        )

        # Create a closed register whose window brackets the transaction's created_at.
        # CashRegister.opened_at is auto_now_add, so use QuerySet.update to backdate it.
        cr = CashRegister.objects.create(
            opened_by=self.admin,
            opening_amount=Decimal('0'),
        )
        before = txn.created_at - timezone.timedelta(seconds=1)
        after  = txn.created_at + timezone.timedelta(seconds=1)
        CashRegister.objects.filter(pk=cr.pk).update(
            opened_at=before,
            closed_at=after,
            status=CashRegister.Status.CLOSED,
            closed_by_id=self.admin.pk,
            closing_amount=Decimal('0'),
            expected_amount=Decimal('0'),
            difference=Decimal('0'),
        )

        # Without force_update: blocked.
        r1 = self._patch_supplier_invoice(inv.id, payment_status='PAID')
        self.assertEqual(r1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('closed_register_warning', r1.data)

        # With force_update: proceeds.
        r2 = self._patch_supplier_invoice(inv.id, payment_status='PAID', force_update=True)
        self.assertEqual(r2.status_code, status.HTTP_200_OK, r2.data)
