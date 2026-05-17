from django.conf import settings
from django.db import models


class PaymentMethod(models.Model):
    name = models.CharField(max_length=50, unique=True, verbose_name='nombre')

    class Meta:
        verbose_name = 'método de pago'
        verbose_name_plural = 'métodos de pago'
        ordering = ['name']

    def __str__(self):
        return self.name


class Sale(models.Model):
    class Status(models.TextChoices):
        COMPLETED = 'COMPLETED', 'Completada'
        CANCELLED = 'CANCELLED', 'Cancelada'

    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='sales',
        verbose_name='cliente',
        db_index=True,
    )
    payment_method = models.ForeignKey(
        'sales.PaymentMethod',
        on_delete=models.PROTECT,
        related_name='sales',
        verbose_name='método de pago',
    )
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sales_made',
        verbose_name='empleado',
    )
    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='total',
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.COMPLETED,
        verbose_name='estado',
        db_index=True,
    )
    is_anonymous = models.BooleanField(default=False, verbose_name='venta anónima')
    sale_date = models.DateTimeField(
        auto_now_add=True,
        verbose_name='fecha de venta',
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de creación')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='fecha de actualización')

    class Meta:
        verbose_name = 'venta'
        verbose_name_plural = 'ventas'
        ordering = ['-sale_date']

    def __str__(self):
        customer_label = str(self.customer) if self.customer else 'Cliente anónimo'
        return f'Venta #{self.pk} — {customer_label} ({self.sale_date:%Y-%m-%d})'


class SaleItem(models.Model):
    sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='venta',
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='sale_items',
        verbose_name='producto',
        db_index=True,
    )
    quantity = models.IntegerField(verbose_name='cantidad')
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='precio unitario',
    )
    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='subtotal',
    )

    class Meta:
        verbose_name = 'ítem de venta'
        verbose_name_plural = 'ítems de venta'

    def __str__(self):
        return f'{self.product} x {self.quantity} @ {self.unit_price}'
