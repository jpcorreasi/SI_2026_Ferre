from django.conf import settings
from django.db import models, transaction
from django.utils import timezone


class CreditNote(models.Model):
    """
    Nota crédito parcial asociada a una venta (HU-005).

    Permite devolver uno o varios productos de una venta COMPLETADA
    sin necesidad de cancelar la venta completa.

    Efectos al crear:
      - Stock restaurado por las cantidades devueltas.
      - Transacción EXPENSE creada en finanzas.
    """

    class Status(models.TextChoices):
        ISSUED = 'ISSUED', 'Emitida'
        CANCELLED = 'CANCELLED', 'Anulada'

    credit_note_number = models.CharField(
        max_length=25,
        unique=True,
        editable=False,
        verbose_name='número de nota crédito',
    )
    sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.PROTECT,
        related_name='credit_notes',
        verbose_name='venta',
        db_index=True,
    )
    invoice = models.ForeignKey(
        'invoicing.CustomerInvoice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='credit_notes',
        verbose_name='factura original',
    )
    reason = models.CharField(max_length=500, verbose_name='motivo de devolución')
    total_refund = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='total a reembolsar',
    )
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='credit_notes_generated',
        verbose_name='generada por',
    )
    issued_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de emisión')
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.ISSUED,
        verbose_name='estado',
        db_index=True,
    )

    class Meta:
        verbose_name = 'nota crédito'
        verbose_name_plural = 'notas crédito'
        ordering = ['-issued_at']

    def __str__(self):
        return f'{self.credit_note_number} — Venta #{self.sale_id} ({self.get_status_display()})'

    def save(self, *args, **kwargs):
        if not self.credit_note_number:
            prefix = f"NC-{timezone.now().strftime('%Y%m%d')}"
            with transaction.atomic():
                last = (
                    CreditNote.objects
                    .select_for_update()
                    .filter(credit_note_number__startswith=prefix)
                    .order_by('credit_note_number')
                    .last()
                )
                seq = (int(last.credit_note_number.split('-')[-1]) + 1) if last else 1
                self.credit_note_number = f'{prefix}-{seq:04d}'
                super().save(*args, **kwargs)
        else:
            super().save(*args, **kwargs)


class CreditNoteItem(models.Model):
    credit_note = models.ForeignKey(
        'invoicing.CreditNote',
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='nota crédito',
    )
    sale_item = models.ForeignKey(
        'sales.SaleItem',
        on_delete=models.PROTECT,
        related_name='credit_note_items',
        verbose_name='ítem de venta original',
        db_index=True,
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='credit_note_items',
        verbose_name='producto',
    )
    quantity_returned = models.IntegerField(verbose_name='cantidad devuelta')
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='precio unitario original',
    )
    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='subtotal devuelto',
    )

    class Meta:
        verbose_name = 'ítem de nota crédito'
        verbose_name_plural = 'ítems de nota crédito'

    def __str__(self):
        return f'{self.product} x {self.quantity_returned} — NC {self.credit_note_id}'


class CustomerInvoice(models.Model):
    class Status(models.TextChoices):
        ISSUED = 'ISSUED', 'Emitida'
        CANCELLED = 'CANCELLED', 'Anulada'

    invoice_number = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        verbose_name='número de factura',
    )
    sale = models.OneToOneField(
        'sales.Sale',
        on_delete=models.PROTECT,
        related_name='invoice',
        verbose_name='venta',
    )
    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='invoices',
        verbose_name='cliente',
        db_index=True,
    )
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='invoices_generated',
        verbose_name='generada por',
    )
    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='total',
    )
    tax = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name='impuesto',
    )
    discount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name='descuento',
        help_text='Monto de descuento aplicado por el administrador.',
    )
    notes = models.TextField(
        blank=True,
        verbose_name='notas adicionales',
        help_text='Notas especiales o condiciones adicionales de la factura.',
    )
    issued_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de emisión')
    sent_by_email = models.BooleanField(default=False, verbose_name='enviada por correo')
    email_sent_to = models.EmailField(
        blank=True,
        verbose_name='correo destinatario',
        help_text='Dirección de correo a la que se enviará/envió la factura.',
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.ISSUED,
        verbose_name='estado',
        db_index=True,
    )

    class Meta:
        verbose_name = 'factura de cliente'
        verbose_name_plural = 'facturas de cliente'
        ordering = ['-issued_at']

    def __str__(self):
        return f'{self.invoice_number} — {self.customer or "Anónimo"} ({self.get_status_display()})'

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            prefix = f"FV-{timezone.now().strftime('%Y%m%d')}"
            with transaction.atomic():
                last = (
                    CustomerInvoice.objects
                    .select_for_update()
                    .filter(invoice_number__startswith=prefix)
                    .order_by('invoice_number')
                    .last()
                )
                seq = (int(last.invoice_number.split('-')[-1]) + 1) if last else 1
                self.invoice_number = f'{prefix}-{seq:04d}'
                super().save(*args, **kwargs)
        else:
            super().save(*args, **kwargs)


class SupplierInvoice(models.Model):
    class PaymentStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pendiente'
        PAID    = 'PAID',    'Pagada'

    supplier_invoice_number = models.CharField(
        max_length=50,
        verbose_name='número de factura del proveedor',
    )
    supplier = models.ForeignKey(
        'suppliers.Supplier',
        on_delete=models.PROTECT,
        related_name='supplier_invoices',
        verbose_name='proveedor',
        db_index=True,
    )
    purchase_order = models.ForeignKey(
        'suppliers.PurchaseOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supplier_invoices',
        verbose_name='orden de compra',
    )
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='supplier_invoices_registered',
        verbose_name='registrada por',
    )
    payment_status = models.CharField(
        max_length=10,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
        verbose_name='estado de pago',
        db_index=True,
    )
    tax = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name='IVA',
        help_text='Monto de IVA incluido en la factura.',
    )
    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='total',
    )
    received_at = models.DateField(verbose_name='fecha de recepción', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de creación')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='fecha de actualización')

    class Meta:
        verbose_name = 'factura de proveedor'
        verbose_name_plural = 'facturas de proveedor'
        ordering = ['-received_at']
        # A supplier cannot have two invoices with the same number.
        unique_together = [('supplier', 'supplier_invoice_number')]

    def __str__(self):
        return f'{self.supplier_invoice_number} — {self.supplier}'


class SupplierInvoiceItem(models.Model):
    invoice = models.ForeignKey(
        'invoicing.SupplierInvoice',
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='factura de proveedor',
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='supplier_invoice_items',
        verbose_name='producto',
        db_index=True,
    )
    quantity = models.IntegerField(verbose_name='cantidad')
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='costo unitario',
    )
    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='subtotal',
    )

    class Meta:
        verbose_name = 'ítem de factura de proveedor'
        verbose_name_plural = 'ítems de factura de proveedor'

    def __str__(self):
        return f'{self.product} x {self.quantity} @ {self.unit_cost}'
