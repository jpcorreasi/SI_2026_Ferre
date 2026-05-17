"""
sales/serializers.py
====================
PaymentMethodSerializer
SaleItemSerializer       — read (nested inside SaleSerializer)
SaleSerializer           — read (list/retrieve)
SaleItemWriteSerializer  — write input for each item in SaleCreateSerializer
SaleCreateSerializer     — write (create); calculates totals from product prices
SaleEditItemSerializer   — write input for each item in SaleEditSerializer
SaleEditSerializer       — write (update); reconciles stock, updates Transaction
"""

from decimal import Decimal

from django.db import transaction as db_transaction
from rest_framework import serializers

from products.models import Product
from sales.models import PaymentMethod, Sale, SaleItem


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = ['id', 'name']


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = ['id', 'product', 'product_name', 'quantity', 'unit_price', 'subtotal']

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None


class SaleSerializer(serializers.ModelSerializer):
    """Read serializer — includes nested items."""

    items = SaleItemSerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    payment_method_name = serializers.SerializerMethodField()
    invoice_id = serializers.SerializerMethodField()
    sent_by_email = serializers.SerializerMethodField()
    email_sent_to = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            'id', 'customer', 'customer_name', 'customer_email',
            'payment_method', 'payment_method_name',
            'employee', 'total', 'status', 'is_anonymous', 'sale_date',
            'items', 'invoice_id', 'sent_by_email', 'email_sent_to',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_customer_name(self, obj):
        if obj.is_anonymous or not obj.customer:
            return 'Anónimo'
        return obj.customer.full_name

    def get_customer_email(self, obj):
        return obj.customer.email if obj.customer else ''

    def get_payment_method_name(self, obj):
        return obj.payment_method.name if obj.payment_method else None

    def get_invoice_id(self, obj):
        try:
            return obj.invoice.id
        except Exception:
            return None

    def get_sent_by_email(self, obj):
        try:
            return obj.invoice.sent_by_email
        except Exception:
            return False

    def get_email_sent_to(self, obj):
        try:
            return obj.invoice.email_sent_to
        except Exception:
            return ''


# ---------------------------------------------------------------------------
# Write serializers
# ---------------------------------------------------------------------------

class SaleItemWriteSerializer(serializers.Serializer):
    """One line item in a sale creation request."""

    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(min_value=1)


class SaleCreateSerializer(serializers.ModelSerializer):
    """
    Write serializer for creating a Sale with its items in one request.

    Input:
      {
        "customer": 1,            // optional (null for anonymous)
        "payment_method": 1,
        "is_anonymous": false,
        "items": [
          {"product": 3, "quantity": 2},
          ...
        ]
      }

    Calculates unit_price from product.sale_price and subtotal automatically.
    employee is injected via perform_create(serializer.save(employee=request.user)).
    Raises DRF ValidationError (400) if any item has insufficient stock.
    Stock is decremented inside an atomic block in create(); the signal is a no-op.
    """

    items = SaleItemWriteSerializer(many=True, write_only=True)

    class Meta:
        model = Sale
        fields = ['customer', 'payment_method', 'is_anonymous', 'items']

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('La venta debe tener al menos un ítem.')

        # Lock the relevant product rows so concurrent requests don't read stale stock.
        product_ids = [item['product'].pk for item in value]
        with db_transaction.atomic():
            locked = {
                p.pk: p
                for p in Product.objects.select_for_update().filter(pk__in=product_ids)
            }
            for item_data in value:
                product = locked[item_data['product'].pk]
                quantity = item_data['quantity']
                if product.stock < quantity:
                    raise serializers.ValidationError(
                        f'Stock insuficiente para "{product.name}". '
                        f'Disponible: {product.stock}, solicitado: {quantity}.'
                    )
        return value

    def create(self, validated_data):
        items_data = validated_data.pop('items')

        with db_transaction.atomic():
            # Lock products again inside this transaction for the authoritative check
            # and decrement.
            product_ids = [item['product'].pk for item in items_data]
            locked = {
                p.pk: p
                for p in Product.objects.select_for_update().filter(pk__in=product_ids)
            }

            total = sum(
                locked[item['product'].pk].sale_price * item['quantity']
                for item in items_data
            )
            sale = Sale.objects.create(**validated_data, total=total)

            for item_data in items_data:
                product = locked[item_data['product'].pk]
                quantity = item_data['quantity']
                SaleItem.objects.create(
                    sale=sale,
                    product=product,
                    quantity=quantity,
                    unit_price=product.sale_price,
                    subtotal=product.sale_price * quantity,
                )
                # Decrement stock here instead of relying on the post_save signal.
                product.stock -= quantity
                product.save(update_fields=['stock'])

        return sale

    def to_representation(self, instance):
        """Return full SaleSerializer output after creation."""
        return SaleSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Edit serializers (HU-004)
# ---------------------------------------------------------------------------

class SaleEditItemSerializer(serializers.Serializer):
    """One line item in a sale edit request."""

    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(min_value=1)


class SaleEditSerializer(serializers.ModelSerializer):
    """
    Write serializer for editing an existing Sale (update/partial_update).

    Accepts:
      items           — full replacement list [{product, quantity}, ...]
      customer        — optional FK (null for anonymous)
      payment_method  — optional FK
      is_anonymous    — optional bool

    Stock reconciliation (within a single atomic transaction):
      1. Restore stock from all existing SaleItems.
      2. Delete existing SaleItems.
      3. Create new SaleItems → signal validates and decrements stock.
      4. Recalculate Sale.total.
      5. Update corresponding INCOME Transaction amount.

    Response includes invoice_warning when a CustomerInvoice exists, so the
    frontend can alert the admin that the invoice must also be reviewed.
    """

    items = SaleEditItemSerializer(many=True, write_only=True)

    class Meta:
        model = Sale
        fields = ['customer', 'payment_method', 'is_anonymous', 'items']

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('La venta debe tener al menos un ítem.')
        return value

    def validate(self, data):
        if self.instance and self.instance.status == Sale.Status.CANCELLED:
            raise serializers.ValidationError(
                'No se puede editar una venta cancelada.'
            )
        return data

    def update(self, instance, validated_data):
        from audit.models import AuditLog
        from finances.models import Transaction

        items_data = validated_data.pop('items')
        request = self.context.get('request')

        # Snapshot old items for audit log before any mutation.
        old_items_snapshot = [
            {
                'product_id': item.product_id,
                'product_name': item.product.name if item.product else str(item.product_id),
                'quantity': item.quantity,
                'unit_price': str(item.unit_price),
            }
            for item in instance.items.select_related('product').all()
        ]
        old_total = instance.total

        with db_transaction.atomic():
            # 1. Restore stock for every existing item.
            for old_item in instance.items.select_related('product').all():
                old_item.product.stock += old_item.quantity
                old_item.product.save(update_fields=['stock'])

            # 2. Delete old items (CASCADE-safe; no signal on delete).
            instance.items.all().delete()

            # 3. Lock new products, validate stock, create items, and decrement stock.
            new_product_ids = [item['product'].pk for item in items_data]
            locked = {
                p.pk: p
                for p in Product.objects.select_for_update().filter(pk__in=new_product_ids)
            }

            new_total = Decimal('0')
            new_items_snapshot = []
            for item_data in items_data:
                product = locked[item_data['product'].pk]
                quantity = item_data['quantity']
                if product.stock < quantity:
                    raise serializers.ValidationError({
                        'items': (
                            f'Stock insuficiente para "{product.name}". '
                            f'Disponible: {product.stock}, solicitado: {quantity}.'
                        )
                    })
                unit_price = product.sale_price
                subtotal = unit_price * quantity
                new_total += subtotal
                SaleItem.objects.create(
                    sale=instance,
                    product=product,
                    quantity=quantity,
                    unit_price=unit_price,
                    subtotal=subtotal,
                )
                product.stock -= quantity
                product.save(update_fields=['stock'])
                new_items_snapshot.append({
                    'product_id': product.pk,
                    'product_name': product.name,
                    'quantity': quantity,
                    'unit_price': str(unit_price),
                })

            # 4. Apply header-field changes and new total.
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.total = new_total
            instance.save()

            # 5. Update the INCOME Transaction amount if it exists.
            Transaction.objects.filter(
                reference_type=Transaction.ReferenceType.SALE,
                reference_id=instance.pk,
                type=Transaction.Type.INCOME,
            ).update(amount=new_total)

        # Audit log — record item-level changes beyond what AuditLogMixin captures.
        try:
            changed_fields = {
                'items': {
                    'old': old_items_snapshot,
                    'new': new_items_snapshot,
                },
            }
            if old_total != new_total:
                changed_fields['total'] = {
                    'old': str(old_total),
                    'new': str(new_total),
                }
            AuditLog.objects.create(
                user=request.user if request else None,
                action=AuditLog.Action.UPDATE,
                app_label=instance._meta.app_label,
                model_name=instance._meta.model_name,
                object_id=str(instance.pk),
                object_repr=str(instance)[:200],
                changed_fields=changed_fields,
                ip_address=request.META.get('REMOTE_ADDR') if request else None,
            )
        except Exception:
            pass  # never let audit failures break the response

        return instance

    def to_representation(self, instance):
        data = SaleSerializer(instance, context=self.context).data
        try:
            invoice_id = instance.invoice.id
            data['invoice_warning'] = (
                f'Esta venta tiene una factura generada (#{invoice_id}). '
                'Revise y actualice la factura si es necesario.'
            )
        except Exception:
            data['invoice_warning'] = None
        return data
