"""
employees/signals.py
====================
Signal: when a Payroll transitions to APPROVED, automatically create a
finances.Transaction of type EXPENSE so the financial ledger stays in sync.

Pattern mirrors suppliers/signals.py and sales/signals.py:
  - pre_save caches the previous status on the instance
  - post_save detects the transition and acts only once
"""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from employees.models import Payroll


@receiver(pre_save, sender=Payroll)
def cache_payroll_previous_status(sender, instance, **kwargs):
    """Store the DB status before the save so post_save can detect transitions."""
    if instance.pk:
        try:
            instance._previous_status = Payroll.objects.get(pk=instance.pk).status
        except Payroll.DoesNotExist:
            instance._previous_status = None
    else:
        instance._previous_status = None


@receiver(post_save, sender=Payroll)
def create_transaction_on_payroll_approved(sender, instance, created, **kwargs):
    """
    Create a finances.Transaction (EXPENSE) when a Payroll is approved.
    Only fires on the DRAFT → APPROVED transition (not on creation or on
    subsequent saves that keep the status at APPROVED).
    """
    if created:
        return

    previous = getattr(instance, '_previous_status', None)
    if (
        previous != Payroll.Status.APPROVED
        and instance.status == Payroll.Status.APPROVED
    ):
        # Deferred import to avoid circular dependency (employees ↔ finances)
        from django.utils import timezone

        from finances.models import Transaction

        Transaction.objects.create(
            type=Transaction.Type.EXPENSE,
            amount=instance.total_amount,
            concept=(
                f'Nómina {instance.period_start} — {instance.period_end}'
            ),
            reference_type=Transaction.ReferenceType.PAYROLL,
            reference_id=instance.pk,
            transaction_date=timezone.now().date(),
            registered_by=instance.generated_by,
        )
