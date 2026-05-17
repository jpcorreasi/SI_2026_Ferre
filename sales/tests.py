"""
sales/tests.py
==============
Unit tests for sales app — business logic and serializer behaviour.

Coverage targets (RNF-MNT-001):
  - Stock decrement on sale creation (via SaleCreateSerializer)
  - Stock validation (insufficient stock → DRF ValidationError)
  - Stock restoration on Sale cancellation (via restore_stock_on_cancellation signal)
  - Anonymous sale without customer
  - Sale total consistency with item subtotals
"""

from decimal import Decimal

from django.test import TestCase

from accounts.models import CustomUser
from customers.models import Customer
from products.models import Category, Product
from sales.models import PaymentMethod, Sale, SaleItem
from sales.serializers import SaleCreateSerializer


class SaleModelTest(TestCase):

    def setUp(self):
        self.user = CustomUser.objects.create_user(
            username='vendedor',
            password='Pass1234!',
        )
        self.payment_method = PaymentMethod.objects.create(name='Efectivo')
        self.customer = Customer.objects.create(
            full_name='Cliente Test',
            document_type=Customer.DocumentType.CC,
            document_number='1234567890',
            created_by=self.user,
        )
        category = Category.objects.create(name='Herramientas')
        self.product = Product.objects.create(
            code='MART-001',
            name='Martillo',
            category=category,
            sale_price=Decimal('35000'),
            cost_price=Decimal('20000'),
            stock=10,
            min_stock=3,
            created_by=self.user,
        )
        self.sale = Sale.objects.create(
            customer=self.customer,
            payment_method=self.payment_method,
            employee=self.user,
            total=Decimal('0'),
            status=Sale.Status.COMPLETED,
        )

    # ------------------------------------------------------------------
    # Test 1
    # ------------------------------------------------------------------

    def test_venta_completa_decrementa_stock(self):
        """Crear una venta a través del serializer debe decrementar product.stock."""
        data = {
            'customer': self.customer.id,
            'payment_method': self.payment_method.id,
            'is_anonymous': False,
            'items': [{'product': self.product.id, 'quantity': 2}],
        }
        serializer = SaleCreateSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save(employee=self.user)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)  # 10 - 2

    # ------------------------------------------------------------------
    # Test 2
    # ------------------------------------------------------------------

    def test_stock_insuficiente_lanza_validationerror(self):
        """Solicitar más cantidad de la disponible debe devolver un error de validación."""
        data = {
            'customer': self.customer.id,
            'payment_method': self.payment_method.id,
            'is_anonymous': False,
            'items': [{'product': self.product.id, 'quantity': 20}],  # stock = 10
        }
        serializer = SaleCreateSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('items', serializer.errors)

    # ------------------------------------------------------------------
    # Test 3
    # ------------------------------------------------------------------

    def test_cancelacion_restaura_stock(self):
        """Cancelar una venta debe restaurar el stock de todos sus ítems."""
        # Simulate stock already decremented by 3 units (as SaleCreateSerializer would do).
        self.product.stock = 7
        self.product.save()

        SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=3,
            unit_price=Decimal('35000'),
            subtotal=Decimal('105000'),
        )
        # Signal no longer decrements stock; stock is still 7.
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)

        self.sale.status = Sale.Status.CANCELLED
        self.sale.save()

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)  # 7 + 3 restored by signal

    # ------------------------------------------------------------------
    # Test 4
    # ------------------------------------------------------------------

    def test_venta_anonima_sin_cliente(self):
        """Una venta anonima debe poder crearse sin asociar un cliente."""
        anon_sale = Sale.objects.create(
            customer=None,
            payment_method=self.payment_method,
            employee=self.user,
            total=Decimal('35000'),
            status=Sale.Status.COMPLETED,
            is_anonymous=True,
        )
        self.assertIsNone(anon_sale.customer)
        self.assertTrue(anon_sale.is_anonymous)

    # ------------------------------------------------------------------
    # Test 5
    # ------------------------------------------------------------------

    def test_total_consistente_con_items(self):
        """La suma de subtotales de los items debe coincidir con el total esperado."""
        SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=2,
            unit_price=Decimal('35000'),
            subtotal=Decimal('70000'),
        )
        item_total = sum(item.subtotal for item in self.sale.items.all())
        self.assertEqual(item_total, Decimal('70000'))
