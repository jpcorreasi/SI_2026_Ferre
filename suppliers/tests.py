"""
suppliers/tests.py
==================
Unit tests for suppliers app — signal behaviour and constraints.
Integration tests for OrderRequest — HU-033.

Coverage targets (RNF-MNT-001):
  - PurchaseOrder SENT->RECEIVED transition increments product stock
  - Unique constraint on Supplier.nit raises IntegrityError on duplicate

OrderRequest (01-10) — HU-033
"""

from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import CustomUser
from products.models import Category, Product
from suppliers.models import OrderRequest, PurchaseOrder, PurchaseOrderItem, Supplier


class PurchaseOrderTest(TestCase):

    def setUp(self):
        self.user = CustomUser.objects.create_user(
            username='compras',
            password='Pass1234!',
        )
        self.supplier = Supplier.objects.create(
            business_name='Proveedor Test',
            nit='800123456',
            created_by=self.user,
        )
        category = Category.objects.create(name='Materiales')
        self.product = Product.objects.create(
            code='TORN-001',
            name='Tornillo',
            category=category,
            sale_price=Decimal('500'),
            cost_price=Decimal('300'),
            stock=10,
            min_stock=5,
            created_by=self.user,
        )
        # Order already in SENT state so the signal detects SENT->RECEIVED
        self.order = PurchaseOrder.objects.create(
            supplier=self.supplier,
            status=PurchaseOrder.Status.SENT,
            created_by=self.user,
        )
        PurchaseOrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=5,
            unit_cost=Decimal('300'),
        )

    # ------------------------------------------------------------------
    # Test 1
    # ------------------------------------------------------------------

    def test_orden_recibida_incrementa_stock(self):
        """Transicion SENT->RECEIVED debe incrementar el stock de cada producto del pedido."""
        self.order.status = PurchaseOrder.Status.RECEIVED
        self.order.save()

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 15)  # 10 + 5

    # ------------------------------------------------------------------
    # Test 2
    # ------------------------------------------------------------------

    def test_nit_duplicado_lanza_integrity_error(self):
        """Crear un proveedor con NIT ya existente debe lanzar IntegrityError."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Supplier.objects.create(
                    business_name='Proveedor Duplicado',
                    nit='800123456',        # NIT duplicado
                    created_by=self.user,
                )


# ===========================================================================
# ORDER REQUEST — tests 01-10  (HU-033)
# ===========================================================================

class OrderRequestTests(APITestCase):
    """Integration tests for the order-request endpoint."""

    def setUp(self):
        self.admin = CustomUser.objects.create_user(
            username='admin_or',
            password='Pass1234!',
            role=CustomUser.Role.ADMIN,
        )
        self.employee = CustomUser.objects.create_user(
            username='emp_or',
            password='Pass1234!',
            role=CustomUser.Role.EMPLEADO,
        )
        self.supplier = Supplier.objects.create(
            business_name='Ferretería Central',
            nit='900555444',
            created_by=self.admin,
        )
        category = Category.objects.create(name='Fijación')
        self.product_a = Product.objects.create(
            code='TORN-OR-001',
            name='Tornillo 3×20',
            category=category,
            sale_price=Decimal('200'),
            cost_price=Decimal('100'),
            stock=5,
            min_stock=10,
            created_by=self.admin,
        )
        self.product_b = Product.objects.create(
            code='CLAV-OR-001',
            name='Clavo 2"',
            category=category,
            sale_price=Decimal('150'),
            cost_price=Decimal('80'),
            stock=2,
            min_stock=15,
            created_by=self.admin,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _post_request(self, items=None, supplier_id=None, notes='', user=None):
        """POST /api/order-requests/ and return the response."""
        self.client.force_authenticate(user=user or self.employee)
        if items is None:
            items = [{'product': self.product_a.pk, 'quantity_requested': 20}]
        payload = {
            'supplier': supplier_id or self.supplier.pk,
            'items': items,
        }
        if notes:
            payload['notes'] = notes
        return self.client.post('/api/order-requests/', payload, format='json')

    # ------------------------------------------------------------------
    # Tests
    # ------------------------------------------------------------------

    def test_01_employee_can_create_order_request(self):
        """EMPLEADO puede crear una solicitud de pedido con proveedor e ítems."""
        resp = self._post_request(
            items=[
                {'product': self.product_a.pk, 'quantity_requested': 20},
                {'product': self.product_b.pk, 'quantity_requested': 50},
            ]
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(len(resp.data['items']), 2)
        self.assertEqual(resp.data['status'], OrderRequest.Status.PENDING)

    def test_02_created_by_is_set_automatically(self):
        """created_by se asigna al usuario autenticado."""
        resp = self._post_request(user=self.employee)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        req = OrderRequest.objects.get(pk=resp.data['id'])
        self.assertEqual(req.created_by, self.employee)

    def test_03_admin_can_also_create_order_request(self):
        """ADMIN también puede crear una solicitud de pedido."""
        resp = self._post_request(user=self.admin)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_04_both_roles_can_list_order_requests(self):
        """Ambos roles pueden listar las solicitudes de pedido."""
        self._post_request()  # create one

        for user in (self.admin, self.employee):
            self.client.force_authenticate(user=user)
            resp = self.client.get('/api/order-requests/')
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            self.assertGreaterEqual(len(resp.data['results']), 1)

    def test_05_reject_request_without_items(self):
        """Omitir ítems devuelve 400 con mensaje en 'items'."""
        resp = self._post_request(items=[])
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('items', resp.data)

    def test_06_reject_item_with_zero_quantity(self):
        """Cantidad 0 en un ítem devuelve 400."""
        resp = self._post_request(
            items=[{'product': self.product_a.pk, 'quantity_requested': 0}]
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_07_response_includes_product_details(self):
        """La respuesta incluye nombre, código y stock actual del producto."""
        resp = self._post_request(
            items=[{'product': self.product_a.pk, 'quantity_requested': 10}]
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        item = resp.data['items'][0]
        self.assertEqual(item['product_name'], self.product_a.name)
        self.assertEqual(item['product_code'], self.product_a.code)
        self.assertEqual(item['current_stock'], self.product_a.stock)

    def test_08_employee_cannot_update_or_delete(self):
        """EMPLEADO recibe 403 al intentar PATCH o DELETE."""
        create_resp = self._post_request()
        req_id = create_resp.data['id']

        self.client.force_authenticate(user=self.employee)
        patch_resp = self.client.patch(
            f'/api/order-requests/{req_id}/',
            {'notes': 'Intento de modificación'},
            format='json',
        )
        delete_resp = self.client.delete(f'/api/order-requests/{req_id}/')

        self.assertEqual(patch_resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_09_admin_can_mark_request_as_reviewed(self):
        """ADMIN puede marcar una solicitud PENDING como REVIEWED."""
        create_resp = self._post_request()
        req_id = create_resp.data['id']

        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f'/api/order-requests/{req_id}/mark-reviewed/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['status'], OrderRequest.Status.REVIEWED)

    def test_10_cannot_mark_already_reviewed_request(self):
        """Marcar como revisada una solicitud ya revisada devuelve 400."""
        create_resp = self._post_request()
        req_id = create_resp.data['id']

        self.client.force_authenticate(user=self.admin)
        self.client.post(f'/api/order-requests/{req_id}/mark-reviewed/')  # first time
        resp = self.client.post(f'/api/order-requests/{req_id}/mark-reviewed/')  # second time

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
