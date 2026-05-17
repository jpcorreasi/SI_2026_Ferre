"""
finances/signals.py
===================
Signal: keep the Transaction ledger in sync with Expense records.

  - Expense created  → EXPENSE Transaction created automatically.
  - Expense updated  → linked Transaction synced (amount, concept, date).
"""

from django.db.models.signals import post_save
from django.dispatch import receiver

from finances.models import Expense


@receiver(post_save, sender=Expense)
def sync_transaction_with_expense(sender, instance, created, **kwargs):
    """
    Create or update the finances.Transaction that mirrors this Expense.
    The Transaction always has:
      type            = EXPENSE
      reference_type  = EXPENSE
      reference_id    = expense.pk
    """
    from finances.models import Transaction

    concept = f'Gasto #{instance.pk} — {instance.description} [{instance.category}]'

    if created:
        Transaction.objects.create(
            type=Transaction.Type.EXPENSE,
            amount=instance.amount,
            concept=concept,
            reference_type=Transaction.ReferenceType.EXPENSE,
            reference_id=instance.pk,
            transaction_date=instance.expense_date,
            registered_by=instance.registered_by,
        )
    else:
        # Sync the existing Transaction (if it exists).
        Transaction.objects.filter(
            reference_type=Transaction.ReferenceType.EXPENSE,
            reference_id=instance.pk,
        ).update(
            amount=instance.amount,
            concept=concept,
            transaction_date=instance.expense_date,
        )
