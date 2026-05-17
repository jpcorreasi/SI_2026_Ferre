"""
services/signals.py
===================
Signal: keep the Transaction ledger in sync with Service records.

  - Service created → INCOME Transaction created automatically.
  - Service updated → linked Transaction synced (amount, concept, date).
"""

from django.db.models.signals import post_save
from django.dispatch import receiver

from services.models import Service


@receiver(post_save, sender=Service)
def sync_transaction_with_service(sender, instance, created, **kwargs):
    """
    Create or update the finances.Transaction that mirrors this Service.
    The Transaction always has:
      type            = INCOME
      reference_type  = SERVICE
      reference_id    = service.pk
    """
    from finances.models import Transaction

    customer_label = str(instance.customer) if instance.customer else 'Sin cliente'
    concept = (
        f'Servicio #{instance.pk} — {instance.service_type} | {customer_label}'
    )

    if created:
        Transaction.objects.create(
            type=Transaction.Type.INCOME,
            amount=instance.price,
            concept=concept,
            reference_type=Transaction.ReferenceType.SERVICE,
            reference_id=instance.pk,
            transaction_date=instance.service_date,
            registered_by=instance.registered_by,
        )
    else:
        Transaction.objects.filter(
            reference_type=Transaction.ReferenceType.SERVICE,
            reference_id=instance.pk,
        ).update(
            amount=instance.price,
            concept=concept,
            transaction_date=instance.service_date,
        )
