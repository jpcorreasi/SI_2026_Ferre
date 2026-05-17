"""
employees/serializers.py
========================
EmployeeSerializer       — creates/updates the linked user account atomically.
                           Masks document_number and base_salary for EMPLEADO role.
PayrollItemSerializer
PayrollSerializer        (nested items read-only)
WorkShiftSerializer      (read)
WorkScheduleSerializer   (read — nested shifts)
WorkShiftWriteSerializer (write — used inside WorkScheduleWriteSerializer)
WorkScheduleWriteSerializer (write — atomic create with nested shifts)
"""

from django.db import transaction as db_transaction
from rest_framework import serializers

from employees.models import Employee, Payroll, PayrollItem, WorkSchedule, WorkShift


class EmployeeSerializer(serializers.ModelSerializer):
    """
    Write fields (accepted on create/update, never returned):
      username  — login username for the linked CustomUser account
      password  — password (required on create; leave blank on update to keep current)

    Read field:
      username_display — current username of the linked account

    Sensitive fields masked for EMPLEADO role:
      document_number → '***'
      base_salary     → '***'
    """

    username = serializers.CharField(
        write_only=True,
        required=False,
        help_text='Nombre de usuario para iniciar sesión.',
    )
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        style={'input_type': 'password'},
        help_text='Contraseña. Dejar en blanco al editar para conservar la actual.',
    )
    username_display = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = [
            'id', 'user', 'username', 'password', 'username_display',
            'full_name', 'document_type', 'document_number',
            'position', 'hire_date', 'base_salary', 'phone', 'is_active',
        ]
        read_only_fields = ['user']

    # ------------------------------------------------------------------ #
    # Helpers                                                              #
    # ------------------------------------------------------------------ #

    def _is_admin(self):
        request = self.context.get('request')
        return request and request.user.is_authenticated and request.user.role == 'ADMIN'

    def get_username_display(self, obj):
        return obj.user.username if obj.user_id else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self._is_admin():
            data['document_number'] = '***'
            data['base_salary'] = '***'
        return data

    # ------------------------------------------------------------------ #
    # Validation                                                           #
    # ------------------------------------------------------------------ #

    def validate(self, data):
        if not self.instance:
            # CREATE — both fields required
            if not data.get('username'):
                raise serializers.ValidationError(
                    {'username': 'El nombre de usuario es requerido.'}
                )
            if not data.get('password'):
                raise serializers.ValidationError(
                    {'password': 'La contraseña es requerida.'}
                )
        return data

    # ------------------------------------------------------------------ #
    # Write operations                                                     #
    # ------------------------------------------------------------------ #

    def create(self, validated_data):
        from accounts.models import CustomUser

        username = validated_data.pop('username')
        password = validated_data.pop('password')

        with db_transaction.atomic():
            user = CustomUser.objects.create_user(
                username=username,
                password=password,
                role=CustomUser.Role.EMPLEADO,
                is_active=True,
            )
            employee = Employee.objects.create(user=user, **validated_data)
        return employee

    def update(self, instance, validated_data):
        username = validated_data.pop('username', None)
        password = validated_data.pop('password', None)

        with db_transaction.atomic():
            if username or password:
                user = instance.user
                if username:
                    user.username = username
                if password:
                    user.set_password(password)
                user.save()
            instance = super().update(instance, validated_data)
        return instance


class PayrollItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollItem
        fields = [
            'id', 'employee', 'base_salary', 'health_deduction',
            'pension_deduction', 'overtime', 'net_salary',
        ]


class PayrollSerializer(serializers.ModelSerializer):
    items = PayrollItemSerializer(many=True, read_only=True)

    class Meta:
        model = Payroll
        fields = [
            'id', 'period_start', 'period_end', 'status',
            'total_amount', 'generated_by', 'items', 'created_at',
        ]
        read_only_fields = ['generated_by', 'created_at']


# ---------------------------------------------------------------------------
# WorkSchedule serializers (HU-040)
# ---------------------------------------------------------------------------

class WorkShiftSerializer(serializers.ModelSerializer):
    day_of_week_label = serializers.CharField(
        source='get_day_of_week_display',
        read_only=True,
    )

    class Meta:
        model = WorkShift
        fields = ['id', 'day_of_week', 'day_of_week_label', 'start_time', 'end_time']


class WorkScheduleSerializer(serializers.ModelSerializer):
    """Read-only serializer — used for list/retrieve responses."""
    shifts = WorkShiftSerializer(many=True, read_only=True)
    employee_name = serializers.CharField(
        source='employee.full_name',
        read_only=True,
    )
    created_by_username = serializers.CharField(
        source='created_by.username',
        read_only=True,
    )

    class Meta:
        model = WorkSchedule
        fields = [
            'id', 'employee', 'employee_name',
            'week_start', 'notes',
            'created_by', 'created_by_username',
            'created_at', 'updated_at',
            'shifts',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']


class WorkShiftWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkShift
        fields = ['day_of_week', 'start_time', 'end_time']

    def validate(self, data):
        if data.get('end_time') and data.get('start_time'):
            if data['end_time'] <= data['start_time']:
                raise serializers.ValidationError(
                    {'end_time': 'La hora de salida debe ser posterior a la hora de entrada.'}
                )
        return data


class WorkScheduleWriteSerializer(serializers.ModelSerializer):
    """
    Write serializer — accepts nested shifts on create/update.
    Validates:
      - week_start must be a Monday
      - shifts list must not be empty
      - no duplicate day_of_week within the list
    Creates schedule + shifts atomically.
    """
    shifts = WorkShiftWriteSerializer(many=True)

    class Meta:
        model = WorkSchedule
        fields = ['id', 'employee', 'week_start', 'notes', 'shifts']

    def validate_week_start(self, value):
        if value.weekday() != 0:
            raise serializers.ValidationError(
                'La fecha de inicio de semana debe ser un lunes.'
            )
        return value

    def validate_shifts(self, value):
        if not value:
            raise serializers.ValidationError(
                'El horario debe incluir al menos un turno.'
            )
        days = [s['day_of_week'] for s in value]
        if len(days) != len(set(days)):
            raise serializers.ValidationError(
                'No puede haber dos turnos para el mismo día.'
            )
        return value

    def create(self, validated_data):
        shifts_data = validated_data.pop('shifts')
        with db_transaction.atomic():
            schedule = WorkSchedule.objects.create(**validated_data)
            WorkShift.objects.bulk_create([
                WorkShift(schedule=schedule, **s) for s in shifts_data
            ])
        return schedule

    def update(self, instance, validated_data):
        shifts_data = validated_data.pop('shifts', None)
        with db_transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            if shifts_data is not None:
                instance.shifts.all().delete()
                WorkShift.objects.bulk_create([
                    WorkShift(schedule=instance, **s) for s in shifts_data
                ])
        return instance

    def to_representation(self, instance):
        return WorkScheduleSerializer(instance, context=self.context).data
