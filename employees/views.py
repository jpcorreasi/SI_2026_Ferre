"""
employees/views.py
==================
EmployeeViewSet      -> ADMIN only
PayrollViewSet       -> ADMIN only
  Extra action: POST /api/payrolls/{id}/approve/
  (signal employees/signals.py creates finances.Transaction on approval)
WorkScheduleViewSet  -> ADMIN: full CRUD + copy-to-next-week
                        EMPLEADO: list/retrieve filtered to own employee profile
"""

import datetime

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from audit.mixins import AuditLogMixin
from employees.models import Employee, Payroll, WorkSchedule
from employees.serializers import (
    EmployeeSerializer,
    PayrollSerializer,
    WorkScheduleSerializer,
    WorkScheduleWriteSerializer,
)


class EmployeeViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Employee.objects.select_related('user').order_by('full_name')
    serializer_class = EmployeeSerializer
    permission_classes = [IsAdminRole]
    search_fields = ['full_name', 'position']
    ordering_fields = ['full_name', 'hire_date']


class PayrollViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Payroll.objects.prefetch_related('items').order_by('-period_end')
    serializer_class = PayrollSerializer
    permission_classes = [IsAdminRole]
    ordering_fields = ['period_start', 'period_end']

    def perform_create(self, serializer):
        serializer.validated_data['generated_by'] = self.request.user
        super().perform_create(serializer)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        POST /api/payrolls/{id}/approve/
        Transitions the payroll from DRAFT to APPROVED.
        employees/signals.py detects the transition and automatically
        creates a finances.Transaction of type EXPENSE.
        """
        payroll = self.get_object()
        if payroll.status == Payroll.Status.APPROVED:
            return Response(
                {'detail': 'La nomina ya esta aprobada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if payroll.status == Payroll.Status.PAID:
            return Response(
                {'detail': 'No se puede aprobar una nomina ya pagada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payroll.status = Payroll.Status.APPROVED
        payroll.save()  # fires employees/signals.py -> creates Transaction(EXPENSE)
        return Response(PayrollSerializer(payroll).data)


class WorkScheduleViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    GET    /api/work-schedules/              → list
    POST   /api/work-schedules/              → create (ADMIN only)
    GET    /api/work-schedules/{id}/         → retrieve
    PUT/PATCH /api/work-schedules/{id}/      → update (ADMIN only)
    DELETE /api/work-schedules/{id}/         → destroy (ADMIN only)
    POST   /api/work-schedules/{id}/copy-to-next-week/  → copy (ADMIN only)

    EMPLEADO: list/retrieve filtered to their own Employee profile.
    ADMIN:    unrestricted access to all schedules.
    """

    ordering_fields = ['week_start', 'employee__full_name']

    def get_queryset(self):
        qs = (
            WorkSchedule.objects
            .select_related('employee', 'created_by')
            .prefetch_related('shifts')
            .order_by('-week_start', 'employee__full_name')
        )
        user = self.request.user
        if user.role != 'ADMIN':
            # EMPLEADO sees only their own schedule
            try:
                employee_id = user.employee_profile.pk
            except Employee.DoesNotExist:
                return qs.none()
            qs = qs.filter(employee_id=employee_id)
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return WorkScheduleWriteSerializer
        return WorkScheduleSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'copy_to_next_week'):
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.validated_data['created_by'] = self.request.user
        super().perform_create(serializer)

    @action(detail=True, methods=['post'], url_path='copy-to-next-week')
    def copy_to_next_week(self, request, pk=None):
        """
        POST /api/work-schedules/{id}/copy-to-next-week/
        Duplicates all shifts into a new WorkSchedule one week later.
        Returns 400 if a schedule for that employee + next week already exists.
        """
        source = self.get_object()
        next_monday = source.week_start + datetime.timedelta(weeks=1)

        if WorkSchedule.objects.filter(
            employee=source.employee, week_start=next_monday
        ).exists():
            return Response(
                {'detail': f'Ya existe un horario para la semana del {next_monday}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from employees.models import WorkShift
        from django.db import transaction as db_transaction

        with db_transaction.atomic():
            new_schedule = WorkSchedule.objects.create(
                employee=source.employee,
                week_start=next_monday,
                notes=source.notes,
                created_by=request.user,
            )
            WorkShift.objects.bulk_create([
                WorkShift(
                    schedule=new_schedule,
                    day_of_week=shift.day_of_week,
                    start_time=shift.start_time,
                    end_time=shift.end_time,
                )
                for shift in source.shifts.all()
            ])

        return Response(
            WorkScheduleSerializer(new_schedule, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )
