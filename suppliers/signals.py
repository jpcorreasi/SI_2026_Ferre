from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from suppliers.models import PurchaseOrder


@receiver(pre_save, sender=PurchaseOrder)
def cache_purchase_order_previous_status(sender, instance, **kwargs):
    """
    Capture the current status before saving so the post_save signal
    can detect the transition to RECEIVED.
    """
    if instance.pk:
        try:
            instance._previous_status = PurchaseOrder.objects.get(pk=instance.pk).status
        except PurchaseOrder.DoesNotExist:
            instance._previous_status = None
    else:
        instance._previous_status = None


@receiver(post_save, sender=PurchaseOrder)
def increment_stock_on_received(sender, instance, created, **kwargs):
    """
    Increment product.stock for every PurchaseOrderItem when a PurchaseOrder
    transitions to RECEIVED. Only fires once on the SENT → RECEIVED transition.
    """
    if created:
        return

    previous = getattr(instance, '_previous_status', None)
    if previous != PurchaseOrder.Status.RECEIVED and instance.status == PurchaseOrder.Status.RECEIVED:
        for item in instance.items.select_related('product').all():
            item.product.stock += item.quantity
            item.product.save(update_fields=['stock'])
