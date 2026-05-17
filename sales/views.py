"""
sales/views.py
==============
PaymentMethodViewSet:
  read-only for EMPLEADO, full CRUD for ADMIN

SaleViewSet:
  list/retrieve  -> both roles
  create         -> both roles (employee auto-set to request.user)
  update/destroy -> ADMIN only
  Extra action: POST /api/sales/{id}/cancel/
"""

import django_filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminOrReadOnly, IsAdminRole
from audit.mixins import AuditLogMixin
from sales.models import PaymentMethod, Sale
from sales.serializers import (
    PaymentMethodSerializer,
    SaleCreateSerializer,
    SaleEditSerializer,
    SaleSerializer,
)


class SaleFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(
        field_name='status',
        choices=Sale.Status.choices,
    )
    payment_method = django_filters.NumberFilter(field_name='payment_method__id')
    date_from = django_filters.DateFilter(field_name='sale_date', lookup_expr='date__gte')
    date_to = django_filters.DateFilter(field_name='sale_date', lookup_expr='date__lte')
    # HU-004: search by sale number (exact).
    sale_id = django_filters.NumberFilter(field_name='id')

    class Meta:
        model = Sale
        fields = ['status', 'payment_method', 'date_from', 'date_to', 'sale_id']


class PaymentMethodViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = PaymentMethod.objects.all().order_by('name')
    serializer_class = PaymentMethodSerializer
    permission_classes = [IsAdminOrReadOnly]
    search_fields = ['name']
    ordering_fields = ['name']


class SaleViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = (
        Sale.objects
        .select_related('customer', 'payment_method', 'employee', 'invoice')
        .prefetch_related('items__product')
        .order_by('-sale_date')
    )
    filterset_class = SaleFilter
    search_fields = ['customer__full_name', 'id']
    ordering_fields = ['sale_date', 'total', 'id']

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'create':
            return SaleCreateSerializer
        if self.action in ('update', 'partial_update'):
            return SaleEditSerializer
        return SaleSerializer

    def perform_create(self, serializer):
        # employee is always the logged-in user — injected before super() so
        # AuditLogMixin.perform_create can call serializer.save() cleanly.
        serializer.validated_data['employee'] = self.request.user
        super().perform_create(serializer)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """
        POST /api/sales/{id}/cancel/
        Sets status to CANCELLED, triggering the signal that restores stock.
        """
        sale = self.get_object()
        if sale.status == Sale.Status.CANCELLED:
            return Response(
                {'detail': 'La venta ya esta cancelada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sale.status = Sale.Status.CANCELLED
        sale.save()  # fires sales/signals.py -> restore_stock_on_cancellation
        return Response(SaleSerializer(sale).data)
