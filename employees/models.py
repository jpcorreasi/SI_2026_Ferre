from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

# RNF-PRI-001: document_number is stored encrypted (AES via Fernet).
from encrypted_model_fields.fields import EncryptedCharField  # noqa: E402


class Employee(models.Model):
    class DocumentType(models.TextChoices):
        CC = 'CC', 'Cédula de Ciudadanía'
        NIT = 'NIT', 'NIT'
        CE = 'CE', 'Cédula de Extranjería'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='employee_profile',
        verbose_name='usuario',
    )
    full_name = models.CharField(max_length=255, verbose_name='nombre completo')
    document_type = models.CharField(
        max_length=3,
        choices=DocumentType.choices,
        verbose_name='tipo de documento',
    )
    document_number = EncryptedCharField(
        max_length=20,
        verbose_name='número de documento',
    )
    position = models.CharField(max_length=100, verbose_name='cargo')
    hire_date = models.DateField(verbose_name='fecha de contratación')
    base_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='salario base',
    )
    phone = models.CharField(max_length=20, blank=True, verbose_name='teléfono')
    is_active = models.BooleanField(default=True, verbose_name='activo')

    class Meta:
        verbose_name = 'empleado'
        verbose_name_plural = 'empleados'
        ordering = ['full_name']

    def __str__(self):
        return f'{self.full_name} — {self.position}'


class Payroll(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Borrador'
        APPROVED = 'APPROVED', 'Aprobada'
        PAID = 'PAID', 'Pagada'

    period_start = models.DateField(verbose_name='inicio del período')
    period_end = models.DateField(verbose_name='fin del período')
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='estado',
        db_index=True,
    )
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='monto total',
    )
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='payrolls_generated',
        verbose_name='generada por',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de creación')

    class Meta:
        verbose_name = 'nómina'
        verbose_name_plural = 'nóminas'
        ordering = ['-period_end']

    def __str__(self):
        return f'Nómina {self.period_start} — {self.period_end} ({self.get_status_display()})'


class PayrollItem(models.Model):
    payroll = models.ForeignKey(
        'employees.Payroll',
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='nómina',
    )
    employee = models.ForeignKey(
        'employees.Employee',
        on_delete=models.PROTECT,
        related_name='payroll_items',
        verbose_name='empleado',
        db_index=True,
    )
    base_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='salario base',
    )
    health_deduction = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='descuento salud',
    )
    pension_deduction = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='descuento pensión',
    )
    overtime = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name='horas extras',
    )
    net_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='salario neto',
    )

    class Meta:
        verbose_name = 'ítem de nómina'
        verbose_name_plural = 'ítems de nómina'
        unique_together = [('payroll', 'employee')]

    def __str__(self):
        return f'{self.employee} — neto: {self.net_salary}'


class WorkSchedule(models.Model):
    """
    Weekly schedule for one employee.
    week_start must always be a Monday; enforced in clean().
    unique_together prevents two schedules for the same employee in the same week.
    """

    employee = models.ForeignKey(
        'employees.Employee',
        on_delete=models.PROTECT,
        related_name='schedules',
        verbose_name='empleado',
        db_index=True,
    )
    week_start = models.DateField(
        verbose_name='inicio de semana (lunes)',
        db_index=True,
    )
    notes = models.TextField(blank=True, verbose_name='notas')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='schedules_created',
        verbose_name='creado por',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de creación')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='última actualización')

    class Meta:
        verbose_name = 'horario laboral'
        verbose_name_plural = 'horarios laborales'
        unique_together = [('employee', 'week_start')]
        ordering = ['-week_start', 'employee__full_name']

    def clean(self):
        if self.week_start and self.week_start.weekday() != 0:
            raise ValidationError(
                {'week_start': 'La fecha de inicio de semana debe ser un lunes.'}
            )

    def __str__(self):
        return f'Horario {self.employee.full_name} — semana {self.week_start}'


class WorkShift(models.Model):
    """
    A single day-shift within a WorkSchedule.
    unique_together prevents two shifts for the same day in one schedule.
    clean() ensures end_time > start_time.
    """

    class Day(models.IntegerChoices):
        MONDAY    = 1, 'Lunes'
        TUESDAY   = 2, 'Martes'
        WEDNESDAY = 3, 'Miércoles'
        THURSDAY  = 4, 'Jueves'
        FRIDAY    = 5, 'Viernes'
        SATURDAY  = 6, 'Sábado'
        SUNDAY    = 7, 'Domingo'

    schedule = models.ForeignKey(
        'employees.WorkSchedule',
        on_delete=models.CASCADE,
        related_name='shifts',
        verbose_name='horario',
    )
    day_of_week = models.IntegerField(
        choices=Day.choices,
        verbose_name='día de la semana',
        db_index=True,
    )
    start_time = models.TimeField(verbose_name='hora de entrada')
    end_time   = models.TimeField(verbose_name='hora de salida')

    class Meta:
        verbose_name = 'turno'
        verbose_name_plural = 'turnos'
        unique_together = [('schedule', 'day_of_week')]
        ordering = ['day_of_week']

    def clean(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError(
                {'end_time': 'La hora de salida debe ser posterior a la hora de entrada.'}
            )

    def __str__(self):
        return (
            f'{self.get_day_of_week_display()} '
            f'{self.start_time}–{self.end_time}'
        )
