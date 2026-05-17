"""
finances/serializers.py
=======================
TransactionSerializer
CashRegisterSerializer
ExpenseCategorySerializer
ExpenseSerializer
"""

from rest_framework import serializers

from finances.models import CashRegister, Expense, ExpenseCategory, Transaction


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            'id', 'type', 'amount', 'concept',
            'reference_type', 'reference_id',
            'transaction_date', 'registered_by', 'created_at',
        ]
        read_only_fields = ['registered_by', 'created_at']


class CashRegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashRegister
        fields = [
            'id', 'opened_by', 'closed_by', 'opening_amount',
            'closing_amount', 'expected_amount', 'difference',
            'opened_at', 'closed_at', 'status',
        ]
        read_only_fields = [
            'opened_by', 'closed_by',
            'expected_amount', 'difference',
            'opened_at', 'closed_at',
        ]


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ['id', 'name', 'description', 'created_at']
        read_only_fields = ['created_at']


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Expense
        fields = [
            'id', 'description', 'category', 'category_name',
            'amount', 'expense_date', 'payment_method',
            'receipt_reference', 'notes',
            'registered_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['registered_by', 'created_at', 'updated_at']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                'El monto debe ser mayor a cero.'
            )
        return value

    def validate_category(self, value):
        if value is None:
            raise serializers.ValidationError(
                'La categoría es obligatoria.'
            )
        return value
