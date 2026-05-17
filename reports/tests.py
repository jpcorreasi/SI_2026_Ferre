"""
reports/tests.py
================
Integration tests for the reports app — 10 scenarios (HU-036).

Auth: APITestCase + force_authenticate.
setUp: admin, employee, two payment methods, customer, sales.

SalesByPayment  (01-10)
"""

from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import CustomUser
from customers.models import Customer
from sales.models import PaymentMethod, Sale


class SalesByPaymentTests(APITestCase):

    BASE_URL       = '/api/reports/sales-by-payment/'
    EXPORT_CSV_URL = '/api/reports/sales-by-payment/export-csv/'
    EXPORT_PDF_URL = '/api/reports/sales-by-payment/export-pdf/'

    def setUp(self):
        self.admin = CustomUser.objects.create_user(
            username='admin_rpt',
            password='Pass1234!',
            role=CustomUser.Role.ADMIN,
        )
        self.employee = CustomUser.objects.create_user(
            username='emp_rpt',
            password='Pass1234!',
            role=CustomUser.Role.EMPLEADO,
        )
        self.pm_cash   = PaymentMethod.objects.create(name='Efectivo')
        self.pm_nequi  = PaymentMethod.objects.create(name='Nequi')
        self.customer  = Customer.objects.create(
            full_name='Cliente Reporte',
            document_type=Customer.DocumentType.CC,
            document_number='5566778899',
            created_by=self.admin,
        )

        today = str(timezone.localdate())

        # 2 cash sales + 1 Nequi sale — all today
        Sale.objects.create(
            customer=self.customer,
            payment_method=self.pm_cash,
            employee=self.admin,
            total=Decimal('100000'),
            status=Sale.Status.COMPLETED,
        )
        Sale.objects.create(
            customer=self.customer,
            payment_method=self.pm_cash,
            employee=self.admin,
            total=Decimal('200000'),
            status=Sale.Status.COMPLETED,
        )
        Sale.objects.create(
            customer=self.customer,
            payment_method=self.pm_nequi,
            employee=self.admin,
            total=Decimal('150000'),
            status=Sale.Status.COMPLETED,
        )
        # Cancelled sale — must NOT appear in totals
        Sale.objects.create(
            customer=self.customer,
            payment_method=self.pm_cash,
            employee=self.admin,
            total=Decimal('999999'),
            status=Sale.Status.CANCELLED,
        )

    # ------------------------------------------------------------------

    def test_01_employee_gets_403(self):
        """El endpoint es exclusivo para ADMIN."""
        self.client.force_authenticate(user=self.employee)
        resp = self.client.get(self.BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_02_admin_gets_rows_per_payment_method(self):
        """La respuesta contiene una fila por cada modalidad de pago usada."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.BASE_URL, {'period': 'today'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {r['payment_method_name'] for r in resp.data['rows']}
        self.assertIn('Efectivo', names)
        self.assertIn('Nequi', names)

    def test_03_totals_are_correct(self):
        """Los totales por modalidad coinciden con la suma de ventas COMPLETED."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.BASE_URL, {'period': 'today'})
        rows = {r['payment_method_name']: r for r in resp.data['rows']}
        self.assertEqual(Decimal(str(rows['Efectivo']['total'])), Decimal('300000'))
        self.assertEqual(Decimal(str(rows['Nequi']['total'])),    Decimal('150000'))

    def test_04_grand_total_equals_sum_of_rows(self):
        """grand_total == suma de todos los totales de fila."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.BASE_URL, {'period': 'today'})
        row_sum = sum(Decimal(str(r['total'])) for r in resp.data['rows'])
        self.assertEqual(row_sum, Decimal(str(resp.data['grand_total'])))

    def test_05_percentages_sum_to_100(self):
        """Las columnas de porcentaje suman 100 (con tolerancia de redondeo)."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.BASE_URL, {'period': 'today'})
        total_pct = sum(r['percentage'] for r in resp.data['rows'])
        self.assertAlmostEqual(total_pct, 100.0, places=1)

    def test_06_cancelled_sales_are_excluded(self):
        """Las ventas CANCELLED no afectan totales ni conteo."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.BASE_URL, {'period': 'today'})
        rows = {r['payment_method_name']: r for r in resp.data['rows']}
        # Cash total must be 300 000, not 1 299 999 (which would include the cancelled sale)
        self.assertEqual(Decimal(str(rows['Efectivo']['total'])), Decimal('300000'))
        self.assertEqual(rows['Efectivo']['sale_count'], 2)

    def test_07_empty_period_returns_empty_rows(self):
        """Si no hay ventas en el período, rows=[] y grand_total=0."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.BASE_URL, {'start': '2000-01-01', 'end': '2000-01-31'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['rows'], [])
        self.assertEqual(Decimal(str(resp.data['grand_total'])), Decimal('0'))

    def test_08_custom_date_range_filter(self):
        """Filtro por rango personalizado start/end delimita correctamente."""
        from django.utils import timezone as tz
        today = str(tz.localdate())
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.BASE_URL, {'start': today, 'end': today})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreater(Decimal(str(resp.data['grand_total'])), Decimal('0'))

    def test_09_export_csv_returns_correct_content_type(self):
        """El endpoint de exportación CSV responde con content-type text/csv."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.EXPORT_CSV_URL, {'period': 'today'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('text/csv', resp['Content-Type'])
        self.assertIn('attachment', resp['Content-Disposition'])

    def test_10_export_pdf_returns_correct_content_type(self):
        """El endpoint de exportación PDF responde con content-type application/pdf."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(self.EXPORT_PDF_URL, {'period': 'today'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        self.assertIn('attachment', resp['Content-Disposition'])
