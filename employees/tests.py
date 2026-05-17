"""
employees/tests.py
==================
Unit / integration tests for the employees app.

PayrollTest (2 tests)          — signal behaviour on payroll approval
WorkScheduleTests (10 tests)   — HU-040: create / read / copy / conflict detection
"""

import datetime
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase
from django.test import TestCase

from accounts.models import CustomUser
from employees.models import Employee, Payroll, WorkSchedule, WorkShift
from finances.models import Transaction


class PayrollTest(TestCase):

    def setUp(self):
        self.user = CustomUser.objects.create_user(
            username='rrhh',
            password='Pass1234!',
        )
        employee_user = CustomUser.objects.create_user(
            username='empleado1',
            password='Pass1234!',
        )
        self.employee = Employee.objects.create(
            user=employee_user,
            full_name='Juan Empleado',
            document_type=Employee.DocumentType.CC,
            document_number='12345678',
            position='Vendedor',
            hire_date=datetime.date(2023, 1, 1),
            base_salary=Decimal('1500000'),
        )
        self.payroll = Payroll.objects.create(
            period_start=datetime.date(2024, 1, 1),
            period_end=datetime.date(2024, 1, 31),
            status=Payroll.Status.DRAFT,
            total_amount=Decimal('1500000'),
            generated_by=self.user,
        )

    # ------------------------------------------------------------------
    # Test 1
    # ------------------------------------------------------------------

    def test_nomina_aprobada_genera_transaccion_financiera(self):
        """Aprobar una nomina debe crear exactamente una Transaction de tipo EXPENSE."""
        self.assertEqual(Transaction.objects.count(), 0)

        self.payroll.status = Payroll.Status.APPROVED
        self.payroll.save()

        self.assertEqual(Transaction.objects.count(), 1)
        tx = Transaction.objects.first()
        self.assertEqual(tx.type, Transaction.Type.EXPENSE)
        self.assertEqual(tx.amount, Decimal('1500000'))
        self.assertEqual(tx.reference_type, Transaction.ReferenceType.PAYROLL)
        self.assertEqual(tx.reference_id, self.payroll.pk)
        self.assertEqual(tx.registered_by, self.user)

    # ------------------------------------------------------------------
    # Test 2
    # ------------------------------------------------------------------

    def test_segunda_aprobacion_no_duplica_transaccion(self):
        """Guardar una nomina ya aprobada no debe crear una segunda Transaction."""
        self.payroll.status = Payroll.Status.APPROVED
        self.payroll.save()
        self.assertEqual(Transaction.objects.count(), 1)

        # Save again without changing status — signal must not fire again
        self.payroll.save()
        self.assertEqual(Transaction.objects.count(), 1)


# ---------------------------------------------------------------------------
# HU-040: WorkSchedule integration tests
# ---------------------------------------------------------------------------

class WorkScheduleTests(APITestCase):
    """
    10 integration tests for the work-schedules endpoint.

    setUp: admin, employee user + Employee profile, a Monday date.
    """

    BASE_URL = '/api/work-schedules/'

    def setUp(self):
        self.admin = CustomUser.objects.create_user(
            username='admin_sched',
            password='Pass1234!',
            role=CustomUser.Role.ADMIN,
        )
        self.emp_user = CustomUser.objects.create_user(
            username='emp_sched',
            password='Pass1234!',
            role=CustomUser.Role.EMPLEADO,
        )
        self.employee = Employee.objects.create(
            user=self.emp_user,
            full_name='Empleado Horario',
            document_type=Employee.DocumentType.CC,
            document_number='11223344',
            position='Vendedor',
            hire_date=datetime.date(2024, 1, 1),
            base_salary=Decimal('1500000'),
        )
        # Create a second employee owned by a different user (for isolation tests)
        self.emp2_user = CustomUser.objects.create_user(
            username='emp2_sched',
            password='Pass1234!',
            role=CustomUser.Role.EMPLEADO,
        )
        self.employee2 = Employee.objects.create(
            user=self.emp2_user,
            full_name='Otro Empleado',
            document_type=Employee.DocumentType.CC,
            document_number='99887766',
            position='Cajero',
            hire_date=datetime.date(2024, 1, 1),
            base_salary=Decimal('1400000'),
        )
        # A known Monday
        self.monday = datetime.date(2026, 4, 13)  # Monday

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _schedule_payload(self, employee_id=None, week_start=None):
        return {
            'employee': employee_id or self.employee.pk,
            'week_start': str(week_start or self.monday),
            'notes': 'Semana normal',
            'shifts': [
                {'day_of_week': 1, 'start_time': '08:00', 'end_time': '17:00'},
                {'day_of_week': 2, 'start_time': '08:00', 'end_time': '17:00'},
                {'day_of_week': 5, 'start_time': '08:00', 'end_time': '13:00'},
            ],
        }

    # ------------------------------------------------------------------

    def test_01_employee_cannot_create_schedule(self):
        """EMPLEADO recibe 403 al intentar crear un horario."""
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.post(self.BASE_URL, self._schedule_payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_02_admin_creates_schedule_with_shifts(self):
        """ADMIN crea horario con turnos anidados — devuelve 201 y los shifts en la respuesta."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(self.BASE_URL, self._schedule_payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(resp.data['shifts']), 3)
        self.assertEqual(WorkSchedule.objects.count(), 1)
        self.assertEqual(WorkShift.objects.count(), 3)

    def test_03_created_by_auto_set_to_request_user(self):
        """created_by se establece automáticamente al usuario autenticado."""
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.BASE_URL, self._schedule_payload(), format='json')
        schedule = WorkSchedule.objects.get()
        self.assertEqual(schedule.created_by, self.admin)

    def test_04_duplicate_week_per_employee_rejected(self):
        """Crear un segundo horario para el mismo empleado y semana devuelve 400."""
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.BASE_URL, self._schedule_payload(), format='json')
        resp = self.client.post(self.BASE_URL, self._schedule_payload(), format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_05_non_monday_week_start_rejected(self):
        """week_start que no es lunes debe ser rechazado con 400."""
        self.client.force_authenticate(user=self.admin)
        tuesday = self.monday + datetime.timedelta(days=1)
        resp = self.client.post(
            self.BASE_URL,
            self._schedule_payload(week_start=tuesday),
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_06_duplicate_day_in_shifts_rejected(self):
        """Dos turnos para el mismo día dentro del mismo horario deben ser rechazados."""
        self.client.force_authenticate(user=self.admin)
        payload = self._schedule_payload()
        payload['shifts'] = [
            {'day_of_week': 1, 'start_time': '08:00', 'end_time': '12:00'},
            {'day_of_week': 1, 'start_time': '13:00', 'end_time': '17:00'},
        ]
        resp = self.client.post(self.BASE_URL, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_07_end_time_before_start_time_rejected(self):
        """Turno con hora de salida <= hora de entrada debe ser rechazado."""
        self.client.force_authenticate(user=self.admin)
        payload = self._schedule_payload()
        payload['shifts'] = [
            {'day_of_week': 1, 'start_time': '17:00', 'end_time': '08:00'},
        ]
        resp = self.client.post(self.BASE_URL, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_08_employee_sees_only_own_schedules(self):
        """EMPLEADO solo ve sus propios horarios, no los de otros empleados."""
        self.client.force_authenticate(user=self.admin)
        # Schedule for employee (self.emp_user's employee)
        self.client.post(self.BASE_URL, self._schedule_payload(), format='json')
        # Schedule for employee2 on the same week
        self.client.post(
            self.BASE_URL,
            self._schedule_payload(employee_id=self.employee2.pk),
            format='json',
        )
        self.assertEqual(WorkSchedule.objects.count(), 2)

        # emp_user should see only their own schedule
        self.client.force_authenticate(user=self.emp_user)
        resp = self.client.get(self.BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get('results', resp.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['employee'], self.employee.pk)

    def test_09_copy_to_next_week_creates_new_schedule(self):
        """copy-to-next-week duplica el horario para la semana siguiente."""
        self.client.force_authenticate(user=self.admin)
        create_resp = self.client.post(self.BASE_URL, self._schedule_payload(), format='json')
        schedule_id = create_resp.data['id']

        copy_resp = self.client.post(f'{self.BASE_URL}{schedule_id}/copy-to-next-week/')
        self.assertEqual(copy_resp.status_code, status.HTTP_201_CREATED)

        next_monday = self.monday + datetime.timedelta(weeks=1)
        self.assertEqual(copy_resp.data['week_start'], str(next_monday))
        self.assertEqual(len(copy_resp.data['shifts']), 3)
        self.assertEqual(WorkSchedule.objects.count(), 2)

    def test_10_copy_to_next_week_fails_if_target_exists(self):
        """copy-to-next-week devuelve 400 si ya existe horario para esa semana."""
        self.client.force_authenticate(user=self.admin)
        # Create source schedule
        create_resp = self.client.post(self.BASE_URL, self._schedule_payload(), format='json')
        schedule_id = create_resp.data['id']

        # Pre-create next week's schedule
        next_monday = self.monday + datetime.timedelta(weeks=1)
        self.client.post(
            self.BASE_URL,
            self._schedule_payload(week_start=next_monday),
            format='json',
        )

        # Now copy should fail
        copy_resp = self.client.post(f'{self.BASE_URL}{schedule_id}/copy-to-next-week/')
        self.assertEqual(copy_resp.status_code, status.HTTP_400_BAD_REQUEST)
