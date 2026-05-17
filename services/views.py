"""
services/views.py
=================
ServiceTypeViewSet:
  GET → both roles (read catalog)
  POST/PUT/PATCH/DELETE → admin only

ServiceViewSet:
  GET  → both roles
  POST → both roles (registered_by auto-set)
  PUT/PATCH/DELETE → admin only
"""

import django_filters
from rest_framework import filters, viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdminOrReadOnly, IsAdminRole
from audit.mixins import AuditLogMixin
from services.models import Service, ServiceType
from services.serializers import ServiceSerializer, ServiceTypeSerializer


class ServiceFilter(django_filters.FilterSet):
    service_date_after  = django_filters.DateFilter(field_name='service_date', lookup_expr='gte')
    service_date_before = django_filters.DateFilter(field_name='service_date', lookup_expr='lte')
    service_type        = django_filters.NumberFilter(field_name='service_type__id')

    class Meta:
        model = Service
        fields = ['service_type', 'service_date_after', 'service_date_before']


class ServiceTypeViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    /api/service-types/
    Catalog of service types.  Read-only for employees; full CRUD for admins.
    """
    queryset = ServiceType.objects.order_by('name')
    serializer_class = ServiceTypeSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']


class ServiceViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    /api/services/
    Registered service records.
    Both roles can list and create; only admins can update or delete.
    registered_by is set automatically on create.
    """
    queryset = Service.objects.select_related(
        'service_type', 'customer', 'performed_by', 'registered_by'
    ).order_by('-service_date', '-created_at')
    serializer_class = ServiceSerializer
    filterset_class = ServiceFilter
    filter_backends = [
        django_filters.rest_framework.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ['description', 'customer__full_name', 'service_type__name']
    ordering_fields = ['service_date', 'price', 'created_at']

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.validated_data['registered_by'] = self.request.user
        super().perform_create(serializer)
