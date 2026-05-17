from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from sales.models import Sale, SaleItem


@receiver(post_save, sender=SaleItem)
def decrement_stock_on_sale_item(sender, instance, created, **kwargs):
    """
    No-op. Stock decrement and validation are now handled atomically inside
    SaleCreateSerializer.create() and SaleEditSerializer.update() to avoid
    the antipattern of raising exceptions inside a post_save signal.
    """


@receiver(pre_save, sender=Sale)
def cache_sale_previous_status(sender, instance, **kwargs):
    """
    Capture the current status before saving so the post_save signal
    can detect the transition to CANCELLED.
    """
    if instance.pk:
        try:
            instance._previous_status = Sale.objects.get(pk=instance.pk).status
        except Sale.DoesNotExist:
            instance._previous_status = None
    else:
        instance._previous_status = None


@receiver(post_save, sender=Sale)
def restore_stock_on_cancellation(sender, instance, created, **kwargs):
    """
    Restore product.stock for every SaleItem when a Sale transitions to CANCELLED.
    Only fires on the COMPLETED → CANCELLED transition (not on creation).
    """
    if created:
        return

    previous = getattr(instance, '_previous_status', None)
    if previous != Sale.Status.CANCELLED and instance.status == Sale.Status.CANCELLED:
        for item in instance.items.select_related('product').all():
            item.product.stock += item.quantity
            item.product.save(update_fields=['stock'])


@receiver(post_save, sender=Sale)
def sync_transaction_with_sale(sender, instance, created, **kwargs):
    """
    Keep the financial ledger in sync with sales:
      - New completed sale  → INCOME transaction
      - Sale cancelled      → EXPENSE reversal transaction
    Uses deferred import to avoid circular dependency (sales ↔ finances).
    """
    from finances.models import Transaction

    customer_label = str(instance.customer) if instance.customer else 'Cliente anónimo'

    if created and instance.status == Sale.Status.COMPLETED:
        Transaction.objects.create(
            type=Transaction.Type.INCOME,
            amount=instance.total,
            concept=f'Venta #{instance.pk} — {customer_label}',
            reference_type=Transaction.ReferenceType.SALE,
            reference_id=instance.pk,
            transaction_date=timezone.localdate(),
            registered_by=instance.employee,
        )
        return

    # Cancellation reversal
    previous = getattr(instance, '_previous_status', None)
    if (
        not created
        and previous != Sale.Status.CANCELLED
        and instance.status == Sale.Status.CANCELLED
    ):
        Transaction.objects.create(
            type=Transaction.Type.EXPENSE,
            amount=instance.total,
            concept=f'Anulación Venta #{instance.pk} — {customer_label}',
            reference_type=Transaction.ReferenceType.SALE,
            reference_id=instance.pk,
            transaction_date=timezone.localdate(),
            registered_by=instance.employee,
        )
