from django.conf import settings
from django.db import models


class Transaction(models.Model):
    class Type(models.TextChoices):
        INCOME = 'INCOME', 'Ingreso'
        EXPENSE = 'EXPENSE', 'Egreso'

    class ReferenceType(models.TextChoices):
        SALE = 'SALE', 'Venta'
        SUPPLIER_INVOICE = 'SUPPLIER_INVOICE', 'Factura de proveedor'
        PAYROLL = 'PAYROLL', 'Nómina'
        CREDIT_NOTE = 'CREDIT_NOTE', 'Nota crédito'
        WITHDRAWAL = 'WITHDRAWAL', 'Retiro de caja'
        EXPENSE = 'EXPENSE', 'Gasto operativo'
        SERVICE = 'SERVICE', 'Servicio'
        OTHER = 'OTHER', 'Otro'

    type = models.CharField(
        max_length=7,
        choices=Type.choices,
        verbose_name='tipo',
        db_index=True,
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='monto',
    )
    concept = models.CharField(max_length=255, verbose_name='concepto')
    reference_type = models.CharField(
        max_length=20,
        choices=ReferenceType.choices,
        verbose_name='tipo de referencia',
    )
    reference_id = models.IntegerField(
        verbose_name='ID de referencia',
        help_text='PK del objeto relacionado (venta, factura, nómina, etc.)',
    )
    transaction_date = models.DateField(
        verbose_name='fecha de transacción',
        db_index=True,
    )
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='transactions_registered',
        verbose_name='registrada por',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de creación')

    class Meta:
        verbose_name = 'transacción'
        verbose_name_plural = 'transacciones'
        ordering = ['-transaction_date', '-created_at']

    def __str__(self):
        return f'{self.get_type_display()} — {self.concept}: {self.amount} ({self.transaction_date})'


class CashRegister(models.Model):
    class Status(models.TextChoices):
        OPEN = 'OPEN', 'Abierta'
        CLOSED = 'CLOSED', 'Cerrada'

    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='opened_registers',
        verbose_name='abierta por',
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='closed_registers',
        verbose_name='cerrada por',
    )
    opening_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='monto de apertura',
    )
    closing_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='monto de cierre',
    )
    expected_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='monto esperado',
    )
    difference = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='diferencia',
    )
    opened_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de apertura')
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name='fecha de cierre')
    status = models.CharField(
        max_length=6,
        choices=Status.choices,
        default=Status.OPEN,
        verbose_name='estado',
        db_index=True,
    )

    class Meta:
        verbose_name = 'caja'
        verbose_name_plural = 'cajas'
        ordering = ['-opened_at']

    def __str__(self):
        return f'Caja #{self.pk} — {self.opened_by} ({self.get_status_display()})'


class ExpenseCategory(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name='nombre')
    description = models.CharField(
        max_length=255, blank=True, default='', verbose_name='descripción'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'categoría de gasto'
        verbose_name_plural = 'categorías de gasto'
        ordering = ['name']

    def __str__(self):
        return self.name


class Expense(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = 'CASH', 'Efectivo'
        CARD = 'CARD', 'Tarjeta'
        TRANSFER = 'TRANSFER', 'Transferencia'
        OTHER = 'OTHER', 'Otro'

    description = models.CharField(max_length=255, verbose_name='descripción')
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='expenses',
        verbose_name='categoría',
    )
    amount = models.DecimalField(
        max_digits=12, decimal_places=2, verbose_name='monto'
    )
    expense_date = models.DateField(verbose_name='fecha del gasto', db_index=True)
    payment_method = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        verbose_name='medio de pago',
    )
    receipt_reference = models.CharField(
        max_length=100, blank=True, default='', verbose_name='comprobante'
    )
    notes = models.TextField(blank=True, default='', verbose_name='notas')
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='expenses_registered',
        verbose_name='registrado por',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'gasto'
        verbose_name_plural = 'gastos'
        ordering = ['-expense_date', '-created_at']

    def __str__(self):
        return f'Gasto #{self.pk} — {self.description}: {self.amount} ({self.expense_date})'
