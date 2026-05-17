"""
services/tests.py
=================
Integration tests for the services app — 10 scenarios (HU-032).

Auth: APITestCase + force_authenticate.
setUp builds: admin, employee, customer, service_type.

ServiceType  (01-03)
Service      (04-10)
"""

from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import CustomUser
from customers.models import Customer
from finances.models import Transaction
from services.models import Service, ServiceType


class ServicesTests(APITestCase):

    # ------------------------------------------------------------------
    # setUp
    # ------------------------------------------------------------------

    def setUp(self):
        self.admin = CustomUser.objects.create_user(
            username='admin_svc',
            password='Pass1234!',
            role=CustomUser.Role.ADMIN,
        )
        self.employee = CustomUser.objects.create_user(
            username='emp_svc',
            password='Pass1234!',
            role=CustomUser.Role.EMPLEADO,
        )
        self.customer = Customer.objects.create(
            full_name='Cliente Servicios',
            document_type=Customer.DocumentType.CC,
            document_number='1122334455',
            created_by=self.admin,
        )
        self.service_type = ServiceType.objects.create(
            name='Ponchado de cable',
            description='Instalación de conector RJ45',
            default_price=Decimal('15000'),
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _create_service(self, price='50000.00', service_type_id=None,
                        customer_id=None, performed_by_id=None, user=None):
        """POST /api/services/ and return the response."""
        self.client.force_authenticate(user=user or self.admin)
        return self.client.post(
            '/api/services/',
            {
                'service_type': service_type_id or self.service_type.pk,
                'description': 'Ponchado cable red',
                'price': price,
                'customer': customer_id or self.customer.pk,
                'performed_by': performed_by_id or self.admin.pk,
                'service_date': str(timezone.localdate()),
            },
            format='json',
        )

    # ==================================================================
    # SERVICE TYPE — tests 01-03
    # ==================================================================

    def test_01_admin_can_create_service_type(self):
        """ADMIN puede crear un tipo de servicio."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            '/api/service-types/',
            {'name': 'Corte de tubería', 'description': 'Corte con sierra', 'default_price': '8000.00'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['name'], 'Corte de tubería')

    def test_02_employee_can_list_but_not_create_service_types(self):
        """EMPLEADO puede listar tipos de servicio pero no crear."""
        self.client.force_authenticate(user=self.employee)

        list_resp = self.client.get('/api/service-types/')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)

        create_resp = self.client.post(
            '/api/service-types/',
            {'name': 'Instalación'},
            format='json',
        )
        self.assertEqual(create_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_03_service_type_name_must_be_unique(self):
        """Crear un tipo de servicio con nombre duplicado devuelve 400."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            '/api/service-types/',
            {'name': 'Ponchado de cable'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', resp.data)

    # ==================================================================
    # SERVICE — tests 04-10
    # ==================================================================

    def test_04_both_roles_can_register_service(self):
        """ADMIN y EMPLEADO pueden registrar un servicio."""
        admin_resp = self._create_service(user=self.admin)
        self.assertEqual(admin_resp.status_code, status.HTTP_201_CREATED, admin_resp.data)

        emp_resp = self._create_service(user=self.employee)
        self.assertEqual(emp_resp.status_code, status.HTTP_201_CREATED, emp_resp.data)

    def test_05_registered_by_is_set_automatically(self):
        """registered_by se asigna al usuario autenticado, no al cuerpo de la petición."""
        resp = self._create_service(user=self.employee)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        svc = Service.objects.get(pk=resp.data['id'])
        self.assertEqual(svc.registered_by, self.employee)

    def test_06_service_creates_income_transaction(self):
        """Registrar un servicio genera automáticamente una Transaction INCOME con reference_type=SERVICE."""
        before = Transaction.objects.filter(
            type=Transaction.Type.INCOME,
            reference_type=Transaction.ReferenceType.SERVICE,
        ).count()

        resp = self._create_service(price='75000.00')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        service_id = resp.data['id']

        after = Transaction.objects.filter(
            type=Transaction.Type.INCOME,
            reference_type=Transaction.ReferenceType.SERVICE,
        ).count()
        self.assertEqual(after, before + 1)

        txn = Transaction.objects.get(
            type=Transaction.Type.INCOME,
            reference_type=Transaction.ReferenceType.SERVICE,
            reference_id=service_id,
        )
        self.assertEqual(txn.amount, Decimal('75000.00'))
        self.assertEqual(txn.registered_by, self.admin)

    def test_07_reject_service_with_zero_price(self):
        """Precio cero devuelve 400 con mensaje en 'price'."""
        resp = self._create_service(price='0.00')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('price', resp.data)

    def test_08_reject_service_with_negative_price(self):
        """Precio negativo devuelve 400 con mensaje en 'price'."""
        resp = self._create_service(price='-1000.00')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('price', resp.data)

    def test_09_reject_service_without_service_type(self):
        """Omitir service_type devuelve 400."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            '/api/services/',
            {
                'description': 'Sin tipo',
                'price': '20000.00',
                'performed_by': self.admin.pk,
                'service_date': str(timezone.localdate()),
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('service_type', resp.data)

    def test_10_updating_service_syncs_transaction(self):
        """
        PATCH /api/services/{id}/ por ADMIN actualiza el precio y la Transaction
        vinculada refleja el nuevo valor.
        """
        resp = self._create_service(price='40000.00')
        service_id = resp.data['id']

        self.client.force_authenticate(user=self.admin)
        patch_resp = self.client.patch(
            f'/api/services/{service_id}/',
            {'price': '45000.00'},
            format='json',
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)

        txn = Transaction.objects.get(
            reference_type=Transaction.ReferenceType.SERVICE,
            reference_id=service_id,
        )
        self.assertEqual(txn.amount, Decimal('45000.00'))
