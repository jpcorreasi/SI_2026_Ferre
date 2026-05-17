"""
suppliers/serializers.py
========================
SupplierSerializer
PurchaseOrderItemSerializer
PurchaseOrderSerializer       (nested items read-only — used for list/retrieve/update)
PurchaseOrderItemWriteSerializer
PurchaseOrderWriteSerializer  (write — used for create)
"""

from decimal import Decimal

from django.db import transaction as db_transaction
from rest_framework import serializers

from products.models import Product
from suppliers.models import OrderRequest, OrderRequestItem, PurchaseOrder, PurchaseOrderItem, Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            'id', 'business_name', 'nit', 'contact_name',
            'phone', 'email', 'address', 'is_active',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrderItem
        fields = ['id', 'product', 'product_name', 'quantity', 'unit_cost']

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None


class PurchaseOrderSerializer(serializers.ModelSerializer):
    """Read serializer — returned for list/retrieve/update."""

    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'supplier', 'supplier_name', 'status', 'notes', 'items',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_supplier_name(self, obj):
        return obj.supplier.business_name if obj.supplier else None


# ---------------------------------------------------------------------------
# Write serializer for creating a purchase order with items in one request
# ---------------------------------------------------------------------------

class PurchaseOrderItemWriteSerializer(serializers.Serializer):
    """One line item in a purchase order creation request."""

    product  = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0.01')
    )


class PurchaseOrderWriteSerializer(serializers.ModelSerializer):
    """
    Write serializer for creating a purchase order (frontend HU).

    Input:
      {
        "supplier": 3,
        "notes": "Pedido urgente",          // optional
        "items": [
          {"product": 5, "quantity": 10, "unit_cost": "45000.00"},
          {"product": 8, "quantity": 2,  "unit_cost": "120000.00"}
        ]
      }

    The order is created with status=DRAFT. Items are persisted atomically.
    created_by is injected by the view (perform_create).
    to_representation() returns the full PurchaseOrderSerializer so the
    frontend receives nested items immediately after creation.
    """

    items = PurchaseOrderItemWriteSerializer(many=True, write_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ['supplier', 'notes', 'items']

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Debe incluir al menos un producto.')
        return value

    def create(self, validated_data):
        items_data = validated_data.pop('items')

        with db_transaction.atomic():
            order = PurchaseOrder.objects.create(**validated_data)

            for item_data in items_data:
                PurchaseOrderItem.objects.create(
                    order=order,
                    product=item_data['product'],
                    quantity=item_data['quantity'],
                    unit_cost=item_data['unit_cost'],
                )

        return order

    def to_representation(self, instance):
        return PurchaseOrderSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# OrderRequest serializers — HU-033
# ---------------------------------------------------------------------------

class OrderRequestItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_code = serializers.CharField(source='product.code', read_only=True)
    current_stock = serializers.IntegerField(source='product.stock', read_only=True)

    class Meta:
        model = OrderRequestItem
        fields = ['id', 'product', 'product_name', 'product_code',
                  'current_stock', 'quantity_requested', 'notes']


class OrderRequestSerializer(serializers.ModelSerializer):
    """Read serializer — returned for list/retrieve."""
    items = OrderRequestItemSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.business_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = OrderRequest
        fields = [
            'id', 'supplier', 'supplier_name', 'status', 'notes',
            'items', 'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']


class OrderRequestItemWriteSerializer(serializers.Serializer):
    """One line item in an order request creation."""
    product            = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity_requested = serializers.IntegerField(min_value=1)
    notes              = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class OrderRequestWriteSerializer(serializers.ModelSerializer):
    """
    Write serializer for creating an order request with items in one request.

    Input:
      {
        "supplier": 3,
        "notes": "Faltan varios productos",   // optional
        "items": [
          {"product": 5, "quantity_requested": 20},
          {"product": 8, "quantity_requested": 5, "notes": "Urgente"}
        ]
      }

    created_by is injected by the view.
    to_representation() returns the full OrderRequestSerializer so the
    frontend receives nested items immediately after creation.
    """
    items = OrderRequestItemWriteSerializer(many=True, write_only=True)

    class Meta:
        model = OrderRequest
        fields = ['supplier', 'notes', 'items']

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Debe incluir al menos un producto.')
        return value

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        with db_transaction.atomic():
            request_obj = OrderRequest.objects.create(**validated_data)
            for item_data in items_data:
                OrderRequestItem.objects.create(
                    order_request=request_obj,
                    **item_data,
                )
        return request_obj

    def to_representation(self, instance):
        return OrderRequestSerializer(instance, context=self.context).data
