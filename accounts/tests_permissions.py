"""
accounts/tests_permissions.py
==============================
Permission matrix integration tests — 21 scenarios.

Verifies that RBAC is enforced correctly across every endpoint registered
in config/urls.py, covering:

  EMPLEADO allowed:
    Products read (no cost_price), customers read (masked) + PATCH contact fields,
    sales list + create, customer invoice create, cash register list + open,
    transactions read, operational reports.

  EMPLEADO forbidden (→ 403):
    Products write, customers create/delete, suppliers, purchase-orders,
    employees, payrolls, sales edit/delete, transactions write,
    audit-logs, financial-balance report.

  Unauthenticated → 401 on every major endpoint.

  Login lockout: 5 bad attempts → HTTP 423 on the 6th.
  Login success: resets failed_login_attempts counter.

Auth strategy:
  force_authenticate for role-permission tests (fast, no JWT round-trip).
  Real POST /api/token/ for login-lockout tests (signals must fire).
"""

from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import CustomUser
from customers.models import Customer
from finances.models import CashRegister, Transaction
from products.models import Category, Product
from sales.models import PaymentMethod, Sale


class PermissionMatrixTests(APITestCase):
    """
    Complete RBAC permission matrix for the Ferretería system.

    Fixture created in setUp:
      admin, employee users
      category, product (stock=20, min_stock=2)
      payment_method, customer
      sale (COMPLETED, total=25 000) — used for invoice creation test
      cash_register (OPEN, opening=100 000) — used for PATCH/DELETE restriction test
    """

    # ------------------------------------------------------------------
    # setUp
    # ------------------------------------------------------------------

    def setUp(self):
        # Users
        self.admin = CustomUser.objects.create_user(
            username='admin_perm',
            password='Pass1234!',
            role=CustomUser.Role.ADMIN,
        )
        self.employee = CustomUser.objects.create_user(
            username='emp_perm',
            password='Pass1234!',
            role=CustomUser.Role.EMPLEADO,
        )

        # Catalogue
        self.category = Category.objects.create(name='Cat_Perm')
        self.product = Product.objects.create(
            code='PERM-001',
            name='Producto Permiso',
            category=self.category,
            sale_price=Decimal('25000'),
            cost_price=Decimal('15000'),
            stock=20,
            min_stock=2,
            created_by=self.admin,
        )

        # Sales fixtures
        self.payment_method = PaymentMethod.objects.create(name='Efectivo_Perm')
        self.customer = Customer.objects.create(
            full_name='Cliente Permisos',
            document_type=Customer.DocumentType.CC,
            document_number='1111111111',
            created_by=self.admin,
        )

        # Completed sale — needed by test_12 (invoice creation as EMPLEADO)
        self.sale = Sale.objects.create(
            customer=self.customer,
            payment_method=self.payment_method,
            employee=self.admin,
            total=Decimal('25000'),
            status=Sale.Status.COMPLETED,
        )

        # Open cash register — needed by test_14 (PATCH/DELETE restriction)
        self.cash_register = CashRegister.objects.create(
            opened_by=self.admin,
            opening_amount=Decimal('100000'),
            status=CashRegister.Status.OPEN,
        )

    # ==================================================================
    # PRODUCTS — tests 01-02
    # ==================================================================

    def test_01_employee_can_list_products_without_cost_price(self):
        """EMPLEADO recibe 200 en GET /api/products/ y cost_price NO aparece en la respuesta."""
        self.client.force_authenticate(user=self.employee)

        response = self.client.get('/api/products/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Works with both paginated (results key) and non-paginated responses.
        items = response.data.get('results', response.data)
        self.assertGreater(len(items), 0, 'La lista de productos está vacía')
        for item in items:
            self.assertNotIn(
                'cost_price', item,
                'cost_price NO debe exponerse a EMPLEADO',
            )

    def test_02_employee_can_create_but_not_edit_or_delete_products(self):
        """
        HU-006: EMPLEADO puede POST (crear) productos pero recibe 403 en PUT y DELETE.
        cost_price es opcional; si no se envía el backend lo defaultea a 0.
        """
        self.client.force_authenticate(user=self.employee)
        payload = {
            'code': 'EMP-NEW-001',
            'name': 'Producto Creado Por Empleado',
            'category': self.category.id,
            'sale_price': '10000.00',
            'stock': 5,
            'min_stock': 1,
        }

        post_r   = self.client.post('/api/products/', payload, format='json')
        put_r    = self.client.put(f'/api/products/{self.product.id}/', payload, format='json')
        delete_r = self.client.delete(f'/api/products/{self.product.id}/')

        self.assertEqual(post_r.status_code,   status.HTTP_201_CREATED, post_r.data)
        self.assertEqual(put_r.status_code,    status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_r.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # CUSTOMERS — tests 03-05
    # ==================================================================

    def test_03_employee_sees_masked_document_number(self):
        """EMPLEADO recibe 200 en GET /api/customers/ y document_number de cada cliente es '***'."""
        self.client.force_authenticate(user=self.employee)

        response = self.client.get('/api/customers/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        items = response.data.get('results', response.data)
        self.assertGreater(len(items), 0, 'La lista de clientes está vacía')
        for item in items:
            self.assertEqual(
                item['document_number'], '***',
                f'document_number debe ser "***" para EMPLEADO, se obtuvo: {item["document_number"]}',
            )

    def test_04_employee_can_patch_customer_contact_fields(self):
        """EMPLEADO puede PATCH de email, phone y address; los campos de identidad no cambian."""
        self.client.force_authenticate(user=self.employee)
        payload = {
            'email':   'nuevo@email.com',
            'phone':   '3001234567',
            'address': 'Calle 123 #45-67',
        }

        response = self.client.patch(
            f'/api/customers/{self.customer.id}/',
            payload,
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.email,   'nuevo@email.com')
        self.assertEqual(self.customer.phone,   '3001234567')
        self.assertEqual(self.customer.address, 'Calle 123 #45-67')
        # Identity fields must remain untouched.
        self.assertEqual(self.customer.full_name,        'Cliente Permisos')
        self.assertEqual(self.customer.document_number,  '1111111111')

    def test_05_employee_cannot_create_or_delete_customers(self):
        """EMPLEADO recibe 403 al intentar POST o DELETE en /api/customers/."""
        self.client.force_authenticate(user=self.employee)

        post_r   = self.client.post(
            '/api/customers/',
            {'full_name': 'Nuevo', 'document_type': 'CC', 'document_number': '9999999999'},
            format='json',
        )
        delete_r = self.client.delete(f'/api/customers/{self.customer.id}/')

        self.assertEqual(post_r.status_code,   status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_r.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # SUPPLIERS & PURCHASE ORDERS — tests 06-07
    # ==================================================================

    def test_06_employee_forbidden_from_suppliers(self):
        """EMPLEADO recibe 403 en GET y POST de /api/suppliers/ (recurso sólo ADMIN)."""
        self.client.force_authenticate(user=self.employee)

        get_r  = self.client.get('/api/suppliers/')
        post_r = self.client.post(
            '/api/suppliers/',
            {'business_name': 'Test S.A.', 'nit': '000000001-0'},
            format='json',
        )

        self.assertEqual(get_r.status_code,  status.HTTP_403_FORBIDDEN)
        self.assertEqual(post_r.status_code, status.HTTP_403_FORBIDDEN)

    def test_07_employee_forbidden_from_purchase_orders(self):
        """EMPLEADO recibe 403 en GET y POST de /api/purchase-orders/ (recurso sólo ADMIN)."""
        self.client.force_authenticate(user=self.employee)

        get_r  = self.client.get('/api/purchase-orders/')
        post_r = self.client.post('/api/purchase-orders/', {}, format='json')

        self.assertEqual(get_r.status_code,  status.HTTP_403_FORBIDDEN)
        self.assertEqual(post_r.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # EMPLOYEES & PAYROLLS — tests 08-09
    # ==================================================================

    def test_08_employee_forbidden_from_employees_endpoint(self):
        """EMPLEADO recibe 403 en GET y POST de /api/employees/ (recurso sólo ADMIN)."""
        self.client.force_authenticate(user=self.employee)

        get_r  = self.client.get('/api/employees/')
        post_r = self.client.post('/api/employees/', {}, format='json')

        self.assertEqual(get_r.status_code,  status.HTTP_403_FORBIDDEN)
        self.assertEqual(post_r.status_code, status.HTTP_403_FORBIDDEN)

    def test_09_employee_forbidden_from_payrolls(self):
        """EMPLEADO recibe 403 en GET y POST de /api/payrolls/ (recurso sólo ADMIN)."""
        self.client.force_authenticate(user=self.employee)

        get_r  = self.client.get('/api/payrolls/')
        post_r = self.client.post('/api/payrolls/', {}, format='json')

        self.assertEqual(get_r.status_code,  status.HTTP_403_FORBIDDEN)
        self.assertEqual(post_r.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # SALES — tests 10-11
    # ==================================================================

    def test_10_employee_can_list_and_create_sales(self):
        """EMPLEADO puede GET 200 y POST 201 en /api/sales/."""
        self.client.force_authenticate(user=self.employee)

        list_r = self.client.get('/api/sales/')
        self.assertEqual(list_r.status_code, status.HTTP_200_OK)

        create_r = self.client.post(
            '/api/sales/',
            {
                'customer':       self.customer.id,
                'payment_method': self.payment_method.id,
                'is_anonymous':   False,
                'items': [{'product': self.product.id, 'quantity': 1}],
            },
            format='json',
        )
        self.assertEqual(create_r.status_code, status.HTTP_201_CREATED)
        # The employee injected by the view must be the logged-in employee.
        self.assertEqual(create_r.data['employee'], self.employee.id)

    def test_11_employee_cannot_edit_or_delete_sales(self):
        """EMPLEADO recibe 403 al intentar PUT o DELETE en /api/sales/{id}/."""
        self.client.force_authenticate(user=self.employee)

        put_r    = self.client.put(f'/api/sales/{self.sale.id}/', {}, format='json')
        delete_r = self.client.delete(f'/api/sales/{self.sale.id}/')

        self.assertEqual(put_r.status_code,    status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_r.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # CUSTOMER INVOICES — test 12
    # ==================================================================

    def test_12_employee_can_create_customer_invoice(self):
        """EMPLEADO puede POST 201 en /api/customer-invoices/ para una venta completada."""
        self.client.force_authenticate(user=self.employee)

        response = self.client.post(
            '/api/customer-invoices/',
            {'sale': self.sale.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIn('invoice_number', response.data)
        # generated_by must be the employee who made the request.
        self.assertEqual(response.data['generated_by'], self.employee.id)

    # ==================================================================
    # CASH REGISTERS — tests 13-14
    # ==================================================================

    def test_13_employee_can_list_and_open_cash_registers(self):
        """EMPLEADO puede GET 200 y POST 201 (abrir caja) en /api/cash-registers/."""
        self.client.force_authenticate(user=self.employee)

        list_r = self.client.get('/api/cash-registers/')
        self.assertEqual(list_r.status_code, status.HTTP_200_OK)

        open_r = self.client.post(
            '/api/cash-registers/',
            {'opening_amount': '50000.00'},
            format='json',
        )
        self.assertEqual(open_r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(open_r.data['status'], CashRegister.Status.OPEN)
        # opened_by debe ser el empleado autenticado.
        self.assertEqual(open_r.data['opened_by'], self.employee.id)

    def test_14_employee_cannot_edit_or_delete_cash_registers(self):
        """EMPLEADO recibe 403 al intentar PATCH o DELETE en /api/cash-registers/{id}/."""
        self.client.force_authenticate(user=self.employee)

        patch_r  = self.client.patch(
            f'/api/cash-registers/{self.cash_register.id}/',
            {'opening_amount': '999.00'},
            format='json',
        )
        delete_r = self.client.delete(f'/api/cash-registers/{self.cash_register.id}/')

        self.assertEqual(patch_r.status_code,  status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_r.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # TRANSACTIONS — test 15
    # ==================================================================

    def test_15_employee_readonly_on_transactions(self):
        """EMPLEADO puede GET 200 pero recibe 403 en POST, PATCH y DELETE de /api/transactions/."""
        # Pre-create a transaction so PATCH/DELETE have a target.
        txn = Transaction.objects.create(
            type=Transaction.Type.INCOME,
            amount=Decimal('1000'),
            concept='Fixture permisos',
            reference_type=Transaction.ReferenceType.OTHER,
            reference_id=0,
            transaction_date=timezone.localdate(),
            registered_by=self.admin,
        )

        self.client.force_authenticate(user=self.employee)

        list_r = self.client.get('/api/transactions/')
        self.assertEqual(list_r.status_code, status.HTTP_200_OK)

        post_r = self.client.post(
            '/api/transactions/',
            {
                'type': 'INCOME',
                'amount': '5000.00',
                'concept': 'Empleado intenta crear',
                'reference_type': 'OTHER',
                'reference_id': 1,
                'transaction_date': str(timezone.localdate()),
            },
            format='json',
        )
        patch_r  = self.client.patch(
            f'/api/transactions/{txn.id}/', {'concept': 'Modificado'}, format='json'
        )
        delete_r = self.client.delete(f'/api/transactions/{txn.id}/')

        self.assertEqual(post_r.status_code,   status.HTTP_403_FORBIDDEN)
        self.assertEqual(patch_r.status_code,  status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_r.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # AUDIT LOGS — test 16
    # ==================================================================

    def test_16_employee_forbidden_from_audit_logs(self):
        """EMPLEADO recibe 403 en GET /api/audit-logs/ (recurso sólo ADMIN)."""
        self.client.force_authenticate(user=self.employee)

        response = self.client.get('/api/audit-logs/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # REPORTS — tests 17-18
    # ==================================================================

    def test_17_employee_can_access_operational_reports(self):
        """EMPLEADO recibe 200 en sales-summary, top-products y low-stock."""
        self.client.force_authenticate(user=self.employee)

        r_summary = self.client.get('/api/reports/sales-summary/')
        r_top     = self.client.get('/api/reports/top-products/')
        r_low     = self.client.get('/api/reports/low-stock/')

        self.assertEqual(r_summary.status_code, status.HTTP_200_OK)
        self.assertEqual(r_top.status_code,     status.HTTP_200_OK)
        self.assertEqual(r_low.status_code,     status.HTTP_200_OK)

    def test_18_employee_forbidden_from_financial_balance(self):
        """EMPLEADO recibe 403 en GET /api/reports/financial-balance/ (sólo ADMIN)."""
        self.client.force_authenticate(user=self.employee)

        response = self.client.get('/api/reports/financial-balance/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # UNAUTHENTICATED — test 19
    # ==================================================================

    def test_19_unauthenticated_receives_401_on_all_endpoints(self):
        """
        Peticiones sin credenciales reciben 401 en todos los endpoints principales.
        Se prueba una muestra representativa de cada app registrada en el router.
        """
        endpoints = [
            '/api/products/',
            '/api/categories/',
            '/api/customers/',
            '/api/suppliers/',
            '/api/purchase-orders/',
            '/api/payment-methods/',
            '/api/sales/',
            '/api/customer-invoices/',
            '/api/credit-notes/',
            '/api/supplier-invoices/',
            '/api/employees/',
            '/api/payrolls/',
            '/api/transactions/',
            '/api/cash-registers/',
            '/api/audit-logs/',
            '/api/reports/sales-summary/',
            '/api/reports/top-products/',
            '/api/reports/low-stock/',
            '/api/reports/financial-balance/',
        ]

        # Ensure no authenticated session is active.
        self.client.force_authenticate(user=None)

        for url in endpoints:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_401_UNAUTHORIZED,
                    f'Se esperaba 401 en {url}, se obtuvo {response.status_code}',
                )

    # ==================================================================
    # LOGIN SECURITY — tests 20-21
    # ==================================================================

    def test_20_five_failed_logins_lock_account(self):
        """
        Cinco intentos fallidos consecutivos bloquean la cuenta y el sexto
        intento devuelve HTTP 423 LOCKED.

        La señal on_login_failed (accounts/signals.py) incrementa
        failed_login_attempts; al llegar a 5 establece locked_until = now + 3 min.
        La vista LoginView comprueba locked_until ANTES de llamar a authenticate(),
        por lo que el 6.º intento devuelve 423 sin llegar al backend de autenticación.
        """
        CustomUser.objects.create_user(
            username='lockout_test',
            password='Correcto1!',
            role=CustomUser.Role.EMPLEADO,
        )

        # Attempts 1–5: authenticate fails → signal increments counter → 401
        for i in range(5):
            r = self.client.post(
                '/api/token/',
                {'username': 'lockout_test', 'password': 'MalaClave'},
                format='json',
            )
            self.assertEqual(
                r.status_code, status.HTTP_401_UNAUTHORIZED,
                f'Intento {i + 1}: se esperaba 401, se obtuvo {r.status_code}',
            )

        # After 5 failures the model must be locked.
        locked_user = CustomUser.objects.get(username='lockout_test')
        self.assertEqual(locked_user.failed_login_attempts, 5)
        self.assertIsNotNone(locked_user.locked_until)
        self.assertGreater(locked_user.locked_until, timezone.now())

        # 6th attempt: lockout check fires first → 423
        r6 = self.client.post(
            '/api/token/',
            {'username': 'lockout_test', 'password': 'MalaClave'},
            format='json',
        )
        self.assertEqual(r6.status_code, status.HTTP_423_LOCKED)

    def test_21_successful_login_resets_failed_counter(self):
        """
        Un login exitoso restablece failed_login_attempts a 0 y borra locked_until.
        Se simulan 3 intentos fallidos previos directamente en el modelo (por debajo
        del umbral de bloqueo) para comprobar que el reset ocurre en el login OK.
        """
        reset_user = CustomUser.objects.create_user(
            username='reset_test',
            password='Correcto1!',
            role=CustomUser.Role.EMPLEADO,
        )
        # Simulate 3 prior failures without triggering the lockout (threshold = 5).
        reset_user.failed_login_attempts = 3
        reset_user.save(update_fields=['failed_login_attempts'])

        response = self.client.post(
            '/api/token/',
            {'username': 'reset_test', 'password': 'Correcto1!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

        reset_user.refresh_from_db()
        self.assertEqual(reset_user.failed_login_attempts, 0)
        self.assertIsNone(reset_user.locked_until)
