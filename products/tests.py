"""
products/tests.py
=================
Unit tests for products app.

ProductModelTest (3 tests) — model properties and DB constraints.
ProductHU006Test (7 tests) — HU-006: Registrar Producto (Empleado).
"""

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import CustomUser
from products.models import Category, Product
from suppliers.models import Supplier


class ProductModelTest(TestCase):

    def setUp(self):
        self.user = CustomUser.objects.create_user(
            username='admin_prod',
            password='Pass1234!',
        )
        self.category = Category.objects.create(name='Herramientas')
        # stock=3 < min_stock=5 => low stock by default
        self.product = Product.objects.create(
            code='PROD-001',
            name='Producto Test',
            category=self.category,
            sale_price=Decimal('10000'),
            cost_price=Decimal('6000'),
            stock=3,
            min_stock=5,
            created_by=self.user,
        )

    # ------------------------------------------------------------------
    # Test 1
    # ------------------------------------------------------------------

    def test_is_low_stock_retorna_true_cuando_stock_bajo(self):
        """is_low_stock debe ser True cuando stock <= min_stock."""
        # stock=3, min_stock=5 => True
        self.assertTrue(self.product.is_low_stock)

    # ------------------------------------------------------------------
    # Test 2
    # ------------------------------------------------------------------

    def test_is_low_stock_retorna_false_cuando_stock_suficiente(self):
        """is_low_stock debe ser False cuando stock > min_stock."""
        self.product.stock = 10
        self.product.save(update_fields=['stock'])
        # stock=10, min_stock=5 => False
        self.assertFalse(self.product.is_low_stock)

    # ------------------------------------------------------------------
    # Test 3
    # ------------------------------------------------------------------

    def test_codigo_unico_lanza_integrity_error(self):
        """Crear un producto con codigo ya existente debe lanzar IntegrityError."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Product.objects.create(
                    code='PROD-001',        # codigo duplicado
                    name='Producto Duplicado',
                    category=self.category,
                    sale_price=Decimal('5000'),
                    cost_price=Decimal('3000'),
                    stock=0,
                    min_stock=1,
                    created_by=self.user,
                )


# ===========================================================================
# HU-006: Registrar Producto (Empleado)
# ===========================================================================

class ProductHU006Test(APITestCase):
    """
    API integration tests for HU-006.

    Verifies that an authenticated EMPLEADO can register new products,
    that business validations (name uniqueness, required fields) are enforced,
    and that created_by is auto-populated from the request user.
    """

    def setUp(self):
        self.admin = CustomUser.objects.create_user(
            username='admin_hu006',
            password='Pass1234!',
            role=CustomUser.Role.ADMIN,
        )
        self.employee = CustomUser.objects.create_user(
            username='emp_hu006',
            password='Pass1234!',
            role=CustomUser.Role.EMPLEADO,
        )
        self.category = Category.objects.create(name='Ferretería HU006')
        self.supplier = Supplier.objects.create(
            business_name='Proveedor HU006 S.A.',
            nit='800000001-1',
            created_by=self.admin,
        )
        # Existing product used to test name/code collision.
        self.existing = Product.objects.create(
            code='EXIST-001',
            name='Martillo Existente',
            category=self.category,
            sale_price=Decimal('45000'),
            cost_price=Decimal('25000'),
            stock=10,
            min_stock=2,
            created_by=self.admin,
        )

    def _valid_payload(self, **overrides):
        """Return a minimal valid product creation payload."""
        payload = {
            'code':       'HU006-001',
            'name':       'Destornillador HU006',
            'description': 'Destornillador de pala 6"',
            'category':   self.category.id,
            'supplier':   self.supplier.id,
            'sale_price': '18000.00',
            'cost_price': '9000.00',
            'stock':      15,
            'min_stock':  3,
        }
        payload.update(overrides)
        return payload

    # ------------------------------------------------------------------
    # Test 01
    # ------------------------------------------------------------------

    def test_01_employee_can_create_product(self):
        """EMPLEADO puede POST /api/products/ y obtiene 201."""
        self.client.force_authenticate(user=self.employee)

        response = self.client.post('/api/products/', self._valid_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(Product.objects.filter(code='HU006-001').exists())

    # ------------------------------------------------------------------
    # Test 02
    # ------------------------------------------------------------------

    def test_02_created_by_is_set_to_authenticated_user(self):
        """El campo created_by debe asignarse automáticamente al usuario autenticado."""
        self.client.force_authenticate(user=self.employee)

        response = self.client.post('/api/products/', self._valid_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        product = Product.objects.get(code='HU006-001')
        self.assertEqual(product.created_by, self.employee)

    # ------------------------------------------------------------------
    # Test 03
    # ------------------------------------------------------------------

    def test_03_product_available_in_catalog_after_creation(self):
        """El producto creado aparece en GET /api/products/ inmediatamente."""
        self.client.force_authenticate(user=self.employee)
        self.client.post('/api/products/', self._valid_payload(), format='json')

        list_r = self.client.get('/api/products/?search=Destornillador+HU006')

        self.assertEqual(list_r.status_code, status.HTTP_200_OK)
        names = [p['name'] for p in (list_r.data.get('results') or list_r.data)]
        self.assertIn('Destornillador HU006', names)

    # ------------------------------------------------------------------
    # Test 04
    # ------------------------------------------------------------------

    def test_04_duplicate_name_returns_400_with_message(self):
        """
        Intentar crear un producto con un nombre ya registrado devuelve 400
        con el mensaje exacto definido en la HU.
        """
        self.client.force_authenticate(user=self.employee)
        payload = self._valid_payload(
            code='DIFFER-001',
            name='Martillo Existente',  # same as self.existing (case-exact)
        )

        response = self.client.post('/api/products/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        error_text = str(response.data)
        self.assertIn('Ya existe un producto con este nombre', error_text)

    # ------------------------------------------------------------------
    # Test 05
    # ------------------------------------------------------------------

    def test_05_duplicate_name_case_insensitive(self):
        """La validación de nombre duplicado es case-insensitive."""
        self.client.force_authenticate(user=self.employee)
        payload = self._valid_payload(
            code='DIFFER-002',
            name='MARTILLO EXISTENTE',  # uppercase variant
        )

        response = self.client.post('/api/products/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Ya existe un producto con este nombre', str(response.data))

    # ------------------------------------------------------------------
    # Test 06
    # ------------------------------------------------------------------

    def test_06_duplicate_code_returns_400(self):
        """Intentar crear un producto con código duplicado devuelve 400."""
        self.client.force_authenticate(user=self.employee)
        payload = self._valid_payload(
            code='EXIST-001',   # same as self.existing
            name='Producto Código Repetido',
        )

        response = self.client.post('/api/products/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # Test 07
    # ------------------------------------------------------------------

    def test_07_missing_required_fields_returns_400(self):
        """Omitir campos obligatorios devuelve 400 indicando qué campos faltan."""
        self.client.force_authenticate(user=self.employee)

        # Send only name — omit code, category, sale_price.
        response = self.client.post(
            '/api/products/',
            {'name': 'Solo nombre'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # At least one of the missing required fields must appear in the error.
        missing = {'code', 'category', 'sale_price'}
        error_keys = set(response.data.keys())
        self.assertTrue(
            missing & error_keys,
            f'Se esperaba alguno de {missing} en los errores, se obtuvo: {error_keys}',
        )
