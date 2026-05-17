"""
products/views.py
=================
CategoryViewSet  -> ADMIN only
ProductViewSet:
  list/retrieve  -> both roles; EMPLEADO sees ProductListSerializer (no cost_price)
  create/update/destroy -> ADMIN only
  Extra action: GET /api/products/low-stock/
"""

import django_filters
from django.db.models import F
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from audit.mixins import AuditLogMixin
from products.models import Category, Product
from products.serializers import CategorySerializer, ProductListSerializer, ProductSerializer


class ProductFilter(django_filters.FilterSet):
    category = django_filters.NumberFilter(field_name='category__id')
    is_active = django_filters.BooleanFilter(field_name='is_active')
    min_price = django_filters.NumberFilter(field_name='sale_price', lookup_expr='gte')
    max_price = django_filters.NumberFilter(field_name='sale_price', lookup_expr='lte')

    class Meta:
        model = Product
        fields = ['category', 'is_active', 'min_price', 'max_price']


class CategoryViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all().order_by('name')
    serializer_class = CategorySerializer
    permission_classes = [IsAdminRole]
    search_fields = ['name']
    ordering_fields = ['name']


class ProductViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category', 'supplier').order_by('name')
    filterset_class = ProductFilter
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'sale_price', 'stock']

    def get_permissions(self):
        # HU-006: both roles may create products.
        # Only ADMIN may replace (PUT), partially update (PATCH), or delete.
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ProductSerializer
        if self.request.user.role == 'ADMIN':
            return ProductSerializer
        return ProductListSerializer

    def perform_create(self, serializer):
        serializer.validated_data['created_by'] = self.request.user
        super().perform_create(serializer)

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        """GET /api/products/low-stock/ — products where stock <= min_stock."""
        qs = Product.objects.filter(stock__lte=F('min_stock')).select_related('category', 'supplier')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)
