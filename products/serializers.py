"""
products/serializers.py
=======================
CategorySerializer     — full CRUD for ADMIN
ProductSerializer      — full detail including cost_price (used for write and ADMIN reads)
ProductListSerializer  — lighter list view; omits cost_price for EMPLEADO reads
"""

from decimal import Decimal

from rest_framework import serializers

from products.models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'description']


class ProductSerializer(serializers.ModelSerializer):
    """Full product detail — includes cost_price. Used for create/update and ADMIN reads."""

    is_low_stock = serializers.ReadOnlyField()
    category_name = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()

    # cost_price is optional on creation (HU-006: employees may omit it and it defaults to 0).
    cost_price = serializers.DecimalField(
        max_digits=12, decimal_places=2,
        required=False, default=Decimal('0'),
    )

    class Meta:
        model = Product
        fields = [
            'id', 'code', 'name', 'description', 'category', 'category_name',
            'sale_price', 'cost_price', 'stock', 'min_stock',
            'supplier', 'supplier_name', 'is_active', 'is_low_stock',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_supplier_name(self, obj):
        return obj.supplier.business_name if obj.supplier else None

    def validate_name(self, value):
        """Reject names that already exist (case-insensitive, HU-006)."""
        qs = Product.objects.filter(name__iexact=value.strip())
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                'Ya existe un producto con este nombre. Verifique el catálogo.'
            )
        return value.strip()


class ProductListSerializer(serializers.ModelSerializer):
    """
    Lighter serializer for list/retrieve views shown to EMPLEADO.
    cost_price is omitted.
    """

    is_low_stock = serializers.ReadOnlyField()
    category_name = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'code', 'name', 'description', 'category', 'category_name',
            'sale_price', 'stock', 'min_stock',
            'supplier', 'supplier_name', 'is_active', 'is_low_stock',
        ]

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_supplier_name(self, obj):
        return obj.supplier.business_name if obj.supplier else None
