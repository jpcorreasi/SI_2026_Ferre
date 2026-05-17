from django.conf import settings
from django.db import models


class Supplier(models.Model):
    business_name = models.CharField(max_length=255, verbose_name='razón social')
    nit = models.CharField(max_length=20, unique=True, verbose_name='NIT', db_index=True)
    contact_name = models.CharField(max_length=255, blank=True, verbose_name='nombre de contacto')
    phone = models.CharField(max_length=20, blank=True, verbose_name='teléfono')
    email = models.EmailField(blank=True, verbose_name='correo electrónico')
    address = models.TextField(blank=True, verbose_name='dirección')
    is_active = models.BooleanField(default=True, verbose_name='activo')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='suppliers_created',
        verbose_name='creado por',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de creación')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='fecha de actualización')

    class Meta:
        verbose_name = 'proveedor'
        verbose_name_plural = 'proveedores'
        ordering = ['business_name']

    def __str__(self):
        return f'{self.business_name} (NIT: {self.nit})'


class PurchaseOrder(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Borrador'
        SENT = 'SENT', 'Enviada'
        RECEIVED = 'RECEIVED', 'Recibida'
        CANCELLED = 'CANCELLED', 'Cancelada'

    supplier = models.ForeignKey(
        'suppliers.Supplier',
        on_delete=models.PROTECT,
        related_name='purchase_orders',
        verbose_name='proveedor',
        db_index=True,
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='estado',
        db_index=True,
    )
    notes = models.TextField(blank=True, verbose_name='observaciones')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='purchase_orders_created',
        verbose_name='creado por',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de creación')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='fecha de actualización')

    class Meta:
        verbose_name = 'orden de compra'
        verbose_name_plural = 'órdenes de compra'
        ordering = ['-created_at']

    def __str__(self):
        return f'OC-{self.pk:06d} — {self.supplier} ({self.get_status_display()})'


class PurchaseOrderItem(models.Model):
    order = models.ForeignKey(
        'suppliers.PurchaseOrder',
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='orden de compra',
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='purchase_order_items',
        verbose_name='producto',
        db_index=True,
    )
    quantity = models.IntegerField(verbose_name='cantidad')
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='costo unitario',
    )

    class Meta:
        verbose_name = 'ítem de orden de compra'
        verbose_name_plural = 'ítems de orden de compra'

    def __str__(self):
        return f'{self.product} x {self.quantity} @ {self.unit_cost}'


class OrderRequest(models.Model):
    """
    Employee-created list of products that need to be reordered from a supplier.
    Visible to both roles; only admins can update status or delete.
    """

    class Status(models.TextChoices):
        PENDING  = 'PENDING',  'Pendiente'
        REVIEWED = 'REVIEWED', 'Revisada'

    supplier = models.ForeignKey(
        'suppliers.Supplier',
        on_delete=models.PROTECT,
        related_name='order_requests',
        verbose_name='proveedor',
        db_index=True,
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='estado',
        db_index=True,
    )
    notes = models.TextField(blank=True, default='', verbose_name='observaciones')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='order_requests_created',
        verbose_name='creado por',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de creación')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='fecha de actualización')

    class Meta:
        verbose_name = 'solicitud de pedido'
        verbose_name_plural = 'solicitudes de pedido'
        ordering = ['-created_at']

    def __str__(self):
        return f'SR-{self.pk:06d} — {self.supplier} ({self.get_status_display()})'


class OrderRequestItem(models.Model):
    order_request = models.ForeignKey(
        'suppliers.OrderRequest',
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='solicitud de pedido',
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='order_request_items',
        verbose_name='producto',
        db_index=True,
    )
    quantity_requested = models.PositiveIntegerField(verbose_name='cantidad a pedir')
    notes = models.CharField(
        max_length=255, blank=True, default='', verbose_name='notas'
    )

    class Meta:
        verbose_name = 'ítem de solicitud'
        verbose_name_plural = 'ítems de solicitud'

    def __str__(self):
        return f'{self.product} × {self.quantity_requested}'
