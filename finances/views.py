"""
finances/views.py
=================
TransactionViewSet:
  read-only for EMPLEADO, full CRUD for ADMIN

CashRegisterViewSet:
  create → both roles (opened_by auto-set)
  Extra actions: POST /api/cash-registers/{id}/close/
                 GET  /api/cash-registers/{id}/balance/
                 POST /api/cash-registers/{id}/withdraw/

ExpenseCategoryViewSet: admin-only CRUD
ExpenseViewSet: admin-only CRUD; registered_by auto-set on create
"""

from decimal import Decimal, InvalidOperation

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminOrReadOnly, IsAdminRole
from audit.mixins import AuditLogMixin
from finances.models import CashRegister, Expense, ExpenseCategory, Transaction
from finances.serializers import (
    CashRegisterSerializer,
    ExpenseCategorySerializer,
    ExpenseSerializer,
    TransactionSerializer,
)


def _register_balance(register):
    """Return a dict with income, expense and available balance for an open register."""
    agg = Transaction.objects.filter(
        created_at__gte=register.opened_at,
    ).aggregate(
        income=Sum('amount', filter=Q(type=Transaction.Type.INCOME)),
        expense=Sum('amount', filter=Q(type=Transaction.Type.EXPENSE)),
    )
    income  = agg['income']  or Decimal('0')
    expense = agg['expense'] or Decimal('0')
    return {
        'income':  income,
        'expense': expense,
        'balance': register.opening_amount + income - expense,
    }


class TransactionViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Transaction.objects.order_by('-transaction_date', '-created_at')
    serializer_class = TransactionSerializer
    permission_classes = [IsAdminOrReadOnly]

    def perform_create(self, serializer):
        serializer.validated_data['registered_by'] = self.request.user
        super().perform_create(serializer)


class CashRegisterViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = CashRegister.objects.order_by('-opened_at')
    serializer_class = CashRegisterSerializer

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy', 'withdraw'):
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.validated_data['opened_by'] = self.request.user
        super().perform_create(serializer)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """
        POST /api/cash-registers/{id}/close/
        Body: {"closing_amount": "150000.00"}

        Calculates expected_amount = opening_amount + income - expense,
        considering only transactions whose created_at falls within the
        half-open interval [register.opened_at, now).

        Filtering by created_at (DateTimeField) instead of transaction_date
        (DateField) avoids two problems:
          1. Multiple registers open on the same calendar day would
             otherwise share each other's transactions.
          2. A register open past midnight would incorrectly include
             transactions from previous calendar days.
        """
        register = self.get_object()

        if register.status == CashRegister.Status.CLOSED:
            return Response(
                {'detail': 'La caja ya esta cerrada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw = request.data.get('closing_amount')
        if raw is None:
            return Response(
                {'detail': 'Se requiere closing_amount.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            closing_amount = Decimal(str(raw))
        except InvalidOperation:
            return Response(
                {'detail': 'closing_amount debe ser un numero decimal valido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Capture the close timestamp once so the upper bound is consistent.
        closed_at = timezone.now()

        agg = Transaction.objects.filter(
            created_at__gte=register.opened_at,
            created_at__lte=closed_at,
        ).aggregate(
            income=Sum('amount', filter=Q(type=Transaction.Type.INCOME)),
            expense=Sum('amount', filter=Q(type=Transaction.Type.EXPENSE)),
        )
        income  = agg['income']  or Decimal('0')
        expense = agg['expense'] or Decimal('0')
        expected = register.opening_amount + income - expense

        register.closing_amount  = closing_amount
        register.expected_amount = expected
        register.difference      = closing_amount - expected
        register.closed_by       = request.user
        register.closed_at       = closed_at
        register.status          = CashRegister.Status.CLOSED
        register.save()

        return Response(CashRegisterSerializer(register).data)

    @action(detail=True, methods=['get'], url_path='balance')
    def balance(self, request, pk=None):
        """
        GET /api/cash-registers/{id}/balance/
        Returns the current income, expense totals and available balance for the register.
        """
        register = self.get_object()
        data = _register_balance(register)
        return Response({
            'register_id':     register.pk,
            'opening_amount':  str(register.opening_amount),
            'income':          str(data['income']),
            'expense':         str(data['expense']),
            'balance':         str(data['balance']),
            'status':          register.status,
        })

    @action(detail=True, methods=['post'], url_path='withdraw')
    def withdraw(self, request, pk=None):
        """
        POST /api/cash-registers/{id}/withdraw/
        Body: {"amount": "50000.00", "concept": "Pago servicios públicos"}

        Registers a cash withdrawal (EXPENSE Transaction) tied to this register.
        Blocked if:
          - The register is not OPEN.
          - concept is blank.
          - amount exceeds the current available balance.
        """
        register = self.get_object()

        if register.status != CashRegister.Status.OPEN:
            return Response(
                {'detail': 'Solo se puede retirar dinero de una caja abierta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- Validate concept ---
        concept = request.data.get('concept', '').strip()
        if not concept:
            return Response(
                {'concept': 'El motivo del retiro es obligatorio.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- Validate amount ---
        raw_amount = request.data.get('amount')
        if raw_amount is None:
            return Response(
                {'amount': 'El monto es obligatorio.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            amount = Decimal(str(raw_amount))
        except InvalidOperation:
            return Response(
                {'amount': 'El monto debe ser un número decimal válido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if amount <= Decimal('0'):
            return Response(
                {'amount': 'El monto debe ser mayor a cero.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- Check available balance ---
        bal = _register_balance(register)
        available = bal['balance']
        if amount > available:
            return Response(
                {
                    'amount': (
                        f'El monto a retirar (${amount:,.2f}) supera el saldo '
                        f'disponible en caja (${available:,.2f}).'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- Register the withdrawal ---
        txn = Transaction.objects.create(
            type=Transaction.Type.EXPENSE,
            amount=amount,
            concept=concept,
            reference_type=Transaction.ReferenceType.WITHDRAWAL,
            reference_id=register.pk,
            transaction_date=timezone.localdate(),
            registered_by=request.user,
        )

        new_balance = available - amount
        return Response(
            {
                'detail': 'Retiro registrado correctamente.',
                'transaction_id': txn.pk,
                'amount':         str(amount),
                'concept':        concept,
                'new_balance':    str(new_balance),
                'registered_by':  request.user.username,
            },
            status=status.HTTP_201_CREATED,
        )


class ExpenseCategoryViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    /api/expense-categories/   — admin-only CRUD for expense categories.
    """
    queryset = ExpenseCategory.objects.order_by('name')
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAdminRole]


class ExpenseViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    /api/expenses/   — admin-only CRUD for operational expenses.
    registered_by is set automatically on create.
    The post_save signal in finances/signals.py keeps the Transaction ledger in sync.
    """
    queryset = Expense.objects.select_related('category', 'registered_by').order_by(
        '-expense_date', '-created_at'
    )
    serializer_class = ExpenseSerializer
    permission_classes = [IsAdminRole]

    def perform_create(self, serializer):
        serializer.validated_data['registered_by'] = self.request.user
        super().perform_create(serializer)
