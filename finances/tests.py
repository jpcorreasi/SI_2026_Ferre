"""
finances/tests.py
=================
Integration tests for the finances app — 26 scenarios.

Auth: APITestCase + force_authenticate (no JWT overhead in unit tests).
setUp builds: admin, employee, category, product, payment_method, customer.

Transaction   (01-06)
CashRegister  (07-11)
Withdrawal    (12-16) — HU-027
Expenses      (17-26) — HU-031
"""

from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import CustomUser
from customers.models import Customer
from employees.models import Employee, Payroll
from finances.models import CashRegister, Expense, ExpenseCategory, Transaction
from products.models import Category, Product
from sales.models import PaymentMethod, Sale
from suppliers.models import Supplier


class FinancesTests(APITestCase):
    """
    All 11 test cases share this fixture set.
    """

    # ------------------------------------------------------------------
    # setUp
    # ------------------------------------------------------------------

    def setUp(self):
        # Users
        self.admin = CustomUser.objects.create_user(
            username='admin_fin',
            password='Pass1234!',
            role=CustomUser.Role.ADMIN,
        )
        self.employee_user = CustomUser.objects.create_user(
            username='emp_fin',
            password='Pass1234!',
            role=CustomUser.Role.EMPLEADO,
        )

        # Catalogue
        self.category = Category.objects.create(name='Herramientas')
        self.product = Product.objects.create(
            code='MART-FIN-001',
            name='Martillo',
            category=self.category,
            sale_price=Decimal('50000'),
            cost_price=Decimal('30000'),
            stock=20,
            min_stock=3,
            created_by=self.admin,
        )

        # Sales fixtures
        self.payment_method = PaymentMethod.objects.create(name='Efectivo')
        self.customer = Customer.objects.create(
            full_name='Cliente Finanzas',
            document_type=Customer.DocumentType.CC,
            document_number='9876543210',
            created_by=self.admin,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _create_completed_sale(self, total=Decimal('100000')):
        """Create a COMPLETED Sale; the post_save signal creates an INCOME Transaction."""
        return Sale.objects.create(
            customer=self.customer,
            payment_method=self.payment_method,
            employee=self.admin,
            total=total,
            status=Sale.Status.COMPLETED,
        )

    def _open_cash_register(self, opening_amount='50000.00', user=None):
        """POST /api/cash-registers/ and return the response."""
        self.client.force_authenticate(user=user or self.admin)
        return self.client.post(
            '/api/cash-registers/',
            {'opening_amount': opening_amount},
            format='json',
        )

    # ==================================================================
    # TRANSACTION — tests 01-06
    # ==================================================================

    def test_01_employee_can_list_transactions(self):
        """EMPLEADO puede hacer GET /api/transactions/ y recibe 200."""
        self.client.force_authenticate(user=self.employee_user)

        response = self.client.get('/api/transactions/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_02_employee_cannot_create_edit_delete_transactions(self):
        """EMPLEADO recibe 403 al intentar POST, PATCH o DELETE en transacciones."""
        # Create a transaction via the model directly (not through the API).
        txn = Transaction.objects.create(
            type=Transaction.Type.INCOME,
            amount=Decimal('10000'),
            concept='Test directo',
            reference_type=Transaction.ReferenceType.OTHER,
            reference_id=1,
            transaction_date=timezone.localdate(),
            registered_by=self.admin,
        )

        self.client.force_authenticate(user=self.employee_user)

        post_response = self.client.post(
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
        patch_response = self.client.patch(
            f'/api/transactions/{txn.id}/',
            {'concept': 'Modificado'},
            format='json',
        )
        delete_response = self.client.delete(f'/api/transactions/{txn.id}/')

        self.assertEqual(post_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_03_admin_can_create_manual_transaction(self):
        """ADMIN puede crear una transacción manual; registered_by se asigna automáticamente."""
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            '/api/transactions/',
            {
                'type': 'INCOME',
                'amount': '25000.00',
                'concept': 'Pago adicional manual',
                'reference_type': 'OTHER',
                'reference_id': 0,
                'transaction_date': str(timezone.localdate()),
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        txn = Transaction.objects.get(pk=response.data['id'])
        self.assertEqual(txn.registered_by, self.admin)
        self.assertEqual(txn.amount, Decimal('25000.00'))

    def test_04_completed_sale_creates_income_transaction(self):
        """Crear una Sale con estado COMPLETED genera automáticamente una Transaction INCOME."""
        before = Transaction.objects.filter(
            type=Transaction.Type.INCOME,
            reference_type=Transaction.ReferenceType.SALE,
        ).count()

        sale = self._create_completed_sale(total=Decimal('75000'))

        after = Transaction.objects.filter(
            type=Transaction.Type.INCOME,
            reference_type=Transaction.ReferenceType.SALE,
        ).count()
        self.assertEqual(after, before + 1)

        txn = Transaction.objects.get(
            type=Transaction.Type.INCOME,
            reference_type=Transaction.ReferenceType.SALE,
            reference_id=sale.pk,
        )
        self.assertEqual(txn.amount, Decimal('75000'))

    def test_05_cancelled_sale_creates_expense_transaction(self):
        """Cancelar una Sale genera automáticamente una Transaction EXPENSE de reversión."""
        sale = self._create_completed_sale(total=Decimal('60000'))

        before = Transaction.objects.filter(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.SALE,
            reference_id=sale.pk,
        ).count()

        sale.status = Sale.Status.CANCELLED
        sale.save()

        after = Transaction.objects.filter(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.SALE,
            reference_id=sale.pk,
        ).count()
        self.assertEqual(after, before + 1)

        reversal = Transaction.objects.get(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.SALE,
            reference_id=sale.pk,
        )
        self.assertEqual(reversal.amount, Decimal('60000'))

    def test_06_approved_payroll_creates_expense_transaction(self):
        """Aprobar una Nómina (DRAFT → APPROVED) genera una Transaction EXPENSE automáticamente."""
        payroll = Payroll.objects.create(
            period_start='2025-04-01',
            period_end='2025-04-30',
            status=Payroll.Status.DRAFT,
            total_amount=Decimal('3000000'),
            generated_by=self.admin,
        )

        before = Transaction.objects.filter(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.PAYROLL,
            reference_id=payroll.pk,
        ).count()

        payroll.status = Payroll.Status.APPROVED
        payroll.save()

        after = Transaction.objects.filter(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.PAYROLL,
            reference_id=payroll.pk,
        ).count()
        self.assertEqual(after, before + 1)

        txn = Transaction.objects.get(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.PAYROLL,
            reference_id=payroll.pk,
        )
        self.assertEqual(txn.amount, Decimal('3000000'))

    # ==================================================================
    # CASH REGISTER — tests 07-11
    # ==================================================================

    def test_07_open_cash_register(self):
        """POST /api/cash-registers/ crea una caja con estado OPEN y el monto de apertura."""
        response = self._open_cash_register(opening_amount='100000.00')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], CashRegister.Status.OPEN)
        self.assertEqual(Decimal(response.data['opening_amount']), Decimal('100000.00'))

        register = CashRegister.objects.get(pk=response.data['id'])
        self.assertEqual(register.opened_by, self.admin)

    def test_08_close_register_expected_amount_calculation(self):
        """
        Cerrar la caja calcula expected_amount = opening + income − expense.
        Creamos una transacción INCOME (200 000) y una EXPENSE (50 000) después de abrir la caja.
        expected = 100 000 + 200 000 − 50 000 = 250 000.
        """
        open_resp = self._open_cash_register(opening_amount='100000.00')
        register_id = open_resp.data['id']

        # Transactions dated today (>= register open date) affect the calculation.
        today = timezone.localdate()
        Transaction.objects.create(
            type=Transaction.Type.INCOME,
            amount=Decimal('200000'),
            concept='Venta del día',
            reference_type=Transaction.ReferenceType.SALE,
            reference_id=1,
            transaction_date=today,
            registered_by=self.admin,
        )
        Transaction.objects.create(
            type=Transaction.Type.EXPENSE,
            amount=Decimal('50000'),
            concept='Compra proveedor',
            reference_type=Transaction.ReferenceType.SUPPLIER_INVOICE,
            reference_id=1,
            transaction_date=today,
            registered_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f'/api/cash-registers/{register_id}/close/',
            {'closing_amount': '250000.00'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], CashRegister.Status.CLOSED)
        self.assertEqual(Decimal(response.data['expected_amount']), Decimal('250000.00'))

    def test_09_reject_closing_already_closed_register(self):
        """Intentar cerrar una caja que ya está cerrada devuelve 400."""
        open_resp = self._open_cash_register(opening_amount='50000.00')
        register_id = open_resp.data['id']

        self.client.force_authenticate(user=self.admin)
        # First close — should succeed.
        r1 = self.client.post(
            f'/api/cash-registers/{register_id}/close/',
            {'closing_amount': '50000.00'},
            format='json',
        )
        self.assertEqual(r1.status_code, status.HTTP_200_OK)

        # Second close — must fail.
        r2 = self.client.post(
            f'/api/cash-registers/{register_id}/close/',
            {'closing_amount': '50000.00'},
            format='json',
        )
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_10_difference_is_closing_minus_expected(self):
        """
        difference = closing_amount − expected_amount.
        Si closing < expected la diferencia es negativa (faltante en caja).
        opening=100 000, sin transacciones → expected=100 000; closing=90 000 → diff=−10 000.
        """
        open_resp = self._open_cash_register(opening_amount='100000.00')
        register_id = open_resp.data['id']

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f'/api/cash-registers/{register_id}/close/',
            {'closing_amount': '90000.00'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['closing_amount']), Decimal('90000.00'))
        # expected depends on all transactions with transaction_date >= open_date;
        # since there may be transactions from other tests we use the returned values.
        expected = Decimal(response.data['expected_amount'])
        closing  = Decimal(response.data['closing_amount'])
        self.assertEqual(Decimal(response.data['difference']), closing - expected)

    def test_11_employee_can_open_but_not_edit_or_delete_register(self):
        """EMPLEADO puede POST (abrir caja) pero recibe 403 al PATCH o DELETE."""
        # Open — both roles are allowed.
        open_resp = self._open_cash_register(
            opening_amount='30000.00',
            user=self.employee_user,
        )
        self.assertEqual(open_resp.status_code, status.HTTP_201_CREATED)
        register_id = open_resp.data['id']

        self.client.force_authenticate(user=self.employee_user)

        patch_response = self.client.patch(
            f'/api/cash-registers/{register_id}/',
            {'opening_amount': '35000.00'},
            format='json',
        )
        delete_response = self.client.delete(f'/api/cash-registers/{register_id}/')

        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # WITHDRAWAL — tests 12-16 (HU-027)
    # ==================================================================

    def _open_register_with_balance(self, opening='200000.00'):
        """Open a cash register and return its id."""
        resp = self._open_cash_register(opening_amount=opening)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        return resp.data['id']

    def _withdraw(self, register_id, amount, concept='Pago servicios', user=None):
        """POST /api/cash-registers/{id}/withdraw/ as admin by default."""
        self.client.force_authenticate(user=user or self.admin)
        return self.client.post(
            f'/api/cash-registers/{register_id}/withdraw/',
            {'amount': str(amount), 'concept': concept},
            format='json',
        )

    def test_12_admin_can_register_withdrawal_and_balance_decreases(self):
        """
        POST withdraw crea un retiro y el nuevo saldo = opening - amount.
        La respuesta incluye new_balance correcto.
        """
        reg_id = self._open_register_with_balance(opening='200000.00')

        response = self._withdraw(reg_id, '50000.00')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Decimal(response.data['new_balance']), Decimal('150000.00'))

        # Balance endpoint confirms the change.
        self.client.force_authenticate(user=self.admin)
        bal_resp = self.client.get(f'/api/cash-registers/{reg_id}/balance/')
        self.assertEqual(Decimal(bal_resp.data['balance']), Decimal('150000.00'))

    def test_13_withdrawal_creates_expense_transaction_with_withdrawal_reference(self):
        """El retiro genera una Transaction de tipo EXPENSE con reference_type=WITHDRAWAL."""
        reg_id = self._open_register_with_balance()

        response = self._withdraw(reg_id, '30000.00', concept='Compra suministros')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        txn = Transaction.objects.get(pk=response.data['transaction_id'])
        self.assertEqual(txn.type, Transaction.Type.EXPENSE)
        self.assertEqual(txn.reference_type, Transaction.ReferenceType.WITHDRAWAL)
        self.assertEqual(txn.reference_id, reg_id)
        self.assertEqual(txn.amount, Decimal('30000.00'))
        self.assertEqual(txn.registered_by, self.admin)

    def test_14_reject_withdrawal_exceeding_balance(self):
        """Retirar más del saldo disponible devuelve 400 con mensaje descriptivo."""
        reg_id = self._open_register_with_balance(opening='100000.00')

        response = self._withdraw(reg_id, '200000.00')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('amount', response.data)
        self.assertIn('saldo', str(response.data['amount']).lower())

    def test_15_reject_withdrawal_with_empty_concept(self):
        """Omitir el motivo del retiro devuelve 400 indicando el campo requerido."""
        reg_id = self._open_register_with_balance()

        response = self._withdraw(reg_id, '10000.00', concept='')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('concept', response.data)

    def test_16_employee_cannot_withdraw(self):
        """EMPLEADO recibe 403 al intentar registrar un retiro."""
        reg_id = self._open_register_with_balance()

        response = self._withdraw(reg_id, '10000.00', user=self.employee_user)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ==================================================================
    # EXPENSES — tests 17-26 (HU-031)
    # ==================================================================

    def _create_expense_category(self, name='Servicios públicos'):
        """Create and return an ExpenseCategory via the API."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            '/api/expense-categories/',
            {'name': name, 'description': 'Categoría de prueba'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        return resp.data['id']

    def _create_expense(self, category_id, amount='80000.00', description='Pago luz',
                        expense_date=None, payment_method='CASH', user=None):
        """POST /api/expenses/ and return the response."""
        from django.utils import timezone as tz
        self.client.force_authenticate(user=user or self.admin)
        return self.client.post(
            '/api/expenses/',
            {
                'description': description,
                'category': category_id,
                'amount': amount,
                'expense_date': str(expense_date or tz.localdate()),
                'payment_method': payment_method,
            },
            format='json',
        )

    def test_17_admin_can_create_expense_category(self):
        """ADMIN puede crear una categoría de gasto y la lista correctamente."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            '/api/expense-categories/',
            {'name': 'Arriendo', 'description': 'Pago mensual de arriendo'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['name'], 'Arriendo')

        list_resp = self.client.get('/api/expense-categories/')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        names = [c['name'] for c in list_resp.data['results']]
        self.assertIn('Arriendo', names)

    def test_18_employee_cannot_create_expense_category(self):
        """EMPLEADO recibe 403 al intentar crear una categoría de gasto."""
        self.client.force_authenticate(user=self.employee_user)
        resp = self.client.post(
            '/api/expense-categories/',
            {'name': 'Categoría empleado'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_19_admin_can_create_expense_and_transaction_is_created(self):
        """
        Crear un gasto genera automáticamente una Transaction EXPENSE
        con reference_type=EXPENSE y el mismo monto.
        """
        cat_id = self._create_expense_category()

        before = Transaction.objects.filter(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.EXPENSE,
        ).count()

        resp = self._create_expense(cat_id, amount='120000.00', description='Pago agua')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        expense_id = resp.data['id']

        after = Transaction.objects.filter(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.EXPENSE,
        ).count()
        self.assertEqual(after, before + 1)

        txn = Transaction.objects.get(
            type=Transaction.Type.EXPENSE,
            reference_type=Transaction.ReferenceType.EXPENSE,
            reference_id=expense_id,
        )
        self.assertEqual(txn.amount, Decimal('120000.00'))
        self.assertEqual(txn.registered_by, self.admin)

    def test_20_registered_by_is_set_automatically(self):
        """registered_by en el gasto se asigna al usuario autenticado."""
        cat_id = self._create_expense_category()
        resp = self._create_expense(cat_id)

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        expense = Expense.objects.get(pk=resp.data['id'])
        self.assertEqual(expense.registered_by, self.admin)

    def test_21_reject_expense_with_zero_amount(self):
        """Monto cero devuelve 400 con mensaje descriptivo en 'amount'."""
        cat_id = self._create_expense_category()
        resp = self._create_expense(cat_id, amount='0.00')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('amount', resp.data)

    def test_22_reject_expense_with_negative_amount(self):
        """Monto negativo devuelve 400 con mensaje descriptivo en 'amount'."""
        cat_id = self._create_expense_category()
        resp = self._create_expense(cat_id, amount='-5000.00')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('amount', resp.data)

    def test_23_reject_expense_without_category(self):
        """Omitir category devuelve 400 indicando el campo requerido."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            '/api/expenses/',
            {
                'description': 'Sin categoría',
                'amount': '50000.00',
                'expense_date': '2026-04-13',
                'payment_method': 'CASH',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('category', resp.data)

    def test_24_expense_appears_in_transaction_history(self):
        """El gasto aparece en GET /api/transactions/ como EXPENSE."""
        cat_id = self._create_expense_category()
        create_resp = self._create_expense(
            cat_id, amount='45000.00', description='Papelería'
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        expense_id = create_resp.data['id']

        self.client.force_authenticate(user=self.admin)
        list_resp = self.client.get('/api/transactions/')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)

        txns = list_resp.data['results']
        matching = [
            t for t in txns
            if t['reference_type'] == 'EXPENSE' and t['reference_id'] == expense_id
        ]
        self.assertEqual(len(matching), 1)
        self.assertEqual(Decimal(matching[0]['amount']), Decimal('45000.00'))

    def test_25_updating_expense_syncs_transaction(self):
        """
        PATCH /api/expenses/{id}/ actualiza el monto y la Transaction
        vinculada refleja el nuevo valor.
        """
        cat_id = self._create_expense_category()
        create_resp = self._create_expense(
            cat_id, amount='30000.00', description='Transporte'
        )
        expense_id = create_resp.data['id']

        self.client.force_authenticate(user=self.admin)
        patch_resp = self.client.patch(
            f'/api/expenses/{expense_id}/',
            {'amount': '35000.00'},
            format='json',
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)

        txn = Transaction.objects.get(
            reference_type=Transaction.ReferenceType.EXPENSE,
            reference_id=expense_id,
        )
        self.assertEqual(txn.amount, Decimal('35000.00'))

    def test_26_employee_cannot_create_or_edit_expense(self):
        """EMPLEADO recibe 403 al intentar crear o editar un gasto."""
        cat_id = self._create_expense_category()

        # Create attempt
        create_resp = self._create_expense(cat_id, user=self.employee_user)
        self.assertEqual(create_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Create one directly and try to edit it
        expense = Expense.objects.create(
            description='Gasto directo',
            category=ExpenseCategory.objects.get(pk=cat_id),
            amount=Decimal('10000'),
            expense_date='2026-04-13',
            payment_method=Expense.PaymentMethod.CASH,
            registered_by=self.admin,
        )
        self.client.force_authenticate(user=self.employee_user)
        patch_resp = self.client.patch(
            f'/api/expenses/{expense.pk}/',
            {'amount': '99999.00'},
            format='json',
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_403_FORBIDDEN)
