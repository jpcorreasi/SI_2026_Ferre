"""
suppliers/views.py
==================
SupplierViewSet      -> ADMIN only
PurchaseOrderViewSet -> ADMIN only
  Extra action: POST /api/purchase-orders/{id}/receive/
"""

import django_filters
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from audit.mixins import AuditLogMixin
from suppliers.models import OrderRequest, PurchaseOrder, Supplier
from suppliers.serializers import (
    OrderRequestSerializer,
    OrderRequestWriteSerializer,
    PurchaseOrderSerializer,
    PurchaseOrderWriteSerializer,
    SupplierSerializer,
)


class SupplierViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by('business_name')
    serializer_class = SupplierSerializer
    permission_classes = [IsAdminRole]
    search_fields = ['business_name', 'contact_name', 'email']
    ordering_fields = ['business_name']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class PurchaseOrderViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.prefetch_related('items__product').order_by('-created_at')
    permission_classes = [IsAdminRole]
    ordering_fields = ['created_at', 'expected_date']

    def get_serializer_class(self):
        if self.action == 'create':
            return PurchaseOrderWriteSerializer
        return PurchaseOrderSerializer

    def perform_create(self, serializer):
        serializer.validated_data['created_by'] = self.request.user
        super().perform_create(serializer)

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        """
        POST /api/purchase-orders/{id}/receive/
        Transitions the order to RECEIVED, triggering the signal that
        increments product stock for each PurchaseOrderItem.
        """
        order = self.get_object()
        if order.status == PurchaseOrder.Status.RECEIVED:
            return Response(
                {'detail': 'La orden ya fue recibida.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if order.status == PurchaseOrder.Status.CANCELLED:
            return Response(
                {'detail': 'No se puede recibir una orden cancelada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = PurchaseOrder.Status.RECEIVED
        order.save()  # fires suppliers/signals.py -> increments stock
        return Response(PurchaseOrderSerializer(order).data)


class OrderRequestFilter(django_filters.FilterSet):
    supplier = django_filters.NumberFilter(field_name='supplier__id')
    status   = django_filters.ChoiceFilter(
        field_name='status',
        choices=OrderRequest.Status.choices,
    )

    class Meta:
        model = OrderRequest
        fields = ['supplier', 'status']


class OrderRequestViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    /api/order-requests/
    Employee-created product request lists for admin review.

    list/retrieve → both roles
    create        → both roles (created_by auto-set)
    update/delete → admin only
    """

    queryset = (
        OrderRequest.objects
        .select_related('supplier', 'created_by')
        .prefetch_related('items__product')
        .order_by('-created_at')
    )
    filterset_class = OrderRequestFilter
    filter_backends = [
        django_filters.rest_framework.DjangoFilterBackend,
        filters.OrderingFilter,
    ]
    ordering_fields = ['created_at', 'status']

    def get_serializer_class(self):
        if self.action == 'create':
            return OrderRequestWriteSerializer
        return OrderRequestSerializer

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.validated_data['created_by'] = self.request.user
        super().perform_create(serializer)

    @action(detail=True, methods=['post'], url_path='mark-reviewed')
    def mark_reviewed(self, request, pk=None):
        """
        POST /api/order-requests/{id}/mark-reviewed/
        Transitions a PENDING request to REVIEWED. Admin only.
        """
        if request.user.role != request.user.Role.ADMIN:
            return Response(
                {'detail': 'Solo el administrador puede marcar solicitudes como revisadas.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        req = self.get_object()
        if req.status == OrderRequest.Status.REVIEWED:
            return Response(
                {'detail': 'La solicitud ya fue marcada como revisada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        req.status = OrderRequest.Status.REVIEWED
        req.save()
        return Response(OrderRequestSerializer(req).data)
