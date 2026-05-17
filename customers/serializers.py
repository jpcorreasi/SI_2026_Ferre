"""
customers/serializers.py
========================
Three variants:
  AdminCustomerSerializer        — all fields including plaintext document_number (ADMIN)
  EmployeeCustomerSerializer     — document_number masked as '***', read-only (EMPLEADO reads)
  EmployeeCustomerUpdateSerializer — only email/phone/address writable (EMPLEADO partial update)

The view selects the variant based on request.user.role and the action.
"""

from rest_framework import serializers

from customers.models import Customer


class AdminCustomerSerializer(serializers.ModelSerializer):
    """All fields visible to ADMIN."""

    class Meta:
        model = Customer
        fields = [
            'id', 'full_name', 'document_type', 'document_number',
            'email', 'phone', 'address', 'is_active',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']


class EmployeeCustomerSerializer(serializers.ModelSerializer):
    """document_number masked — for EMPLEADO role reads."""

    document_number = serializers.SerializerMethodField()

    def get_document_number(self, obj):
        return '***'

    class Meta:
        model = Customer
        fields = [
            'id', 'full_name', 'document_type', 'document_number',
            'email', 'phone', 'address', 'is_active',
        ]
        read_only_fields = [
            'id', 'full_name', 'document_type', 'document_number', 'is_active',
        ]


class EmployeeCustomerUpdateSerializer(serializers.ModelSerializer):
    """
    EMPLEADO partial update — only contact fields allowed.
    Identity fields (full_name, document_type, document_number, is_active)
    are excluded entirely so the API ignores them even if sent.
    """

    class Meta:
        model = Customer
        fields = ['email', 'phone', 'address']
