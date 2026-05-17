"""
customers/views.py
==================
CustomerViewSet:
  list/retrieve      -> both roles; EMPLEADO sees masked document_number
  create/update/destroy -> ADMIN only
  partial_update     -> both roles; EMPLEADO restricted to email/phone/address only
"""

import django_filters
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdminRole
from audit.mixins import AuditLogMixin
from customers.models import Customer
from customers.serializers import (
    AdminCustomerSerializer,
    EmployeeCustomerSerializer,
    EmployeeCustomerUpdateSerializer,
)


class CustomerFilter(django_filters.FilterSet):
    is_active = django_filters.BooleanFilter(field_name='is_active')
    document_type = django_filters.ChoiceFilter(
        field_name='document_type',
        choices=Customer.DocumentType.choices,
    )

    class Meta:
        model = Customer
        fields = ['is_active', 'document_type']


class CustomerViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by('full_name')
    filterset_class = CustomerFilter
    search_fields = ['full_name', 'email']
    ordering_fields = ['full_name', 'created_at']

    def get_permissions(self):
        # EMPLEADO may only do safe reads + partial_update (contact fields only).
        # Full create, replace (PUT), and destroy are ADMIN-only.
        if self.action in ('create', 'update', 'destroy'):
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        role = self.request.user.role
        if role == 'ADMIN':
            return AdminCustomerSerializer
        # EMPLEADO partial update — contact fields only
        if self.action == 'partial_update':
            return EmployeeCustomerUpdateSerializer
        return EmployeeCustomerSerializer

    def perform_create(self, serializer):
        serializer.validated_data['created_by'] = self.request.user
        super().perform_create(serializer)
