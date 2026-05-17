"""
invoicing/serializers.py
========================
CustomerInvoiceSerializer
SupplierInvoiceItemSerializer
SupplierInvoiceSerializer     (nested items read-only)
CreditNoteItemWriteSerializer — write input for each returned item
CreditNoteSerializer          — write (create) + read; handles stock restore and Transaction
CreditNoteReadSerializer      — read (list/retrieve) with nested items
"""

from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from invoicing.models import CreditNote, CreditNoteItem, CustomerInvoice, SupplierInvoice, SupplierInvoiceItem
from products.models import Product
from sales.models import Sale, SaleItem

# Maximum discount the admin may apply (percentage of the sale gross total).
MAX_DISCOUNT_PCT = Decimal('30')


class CustomerInvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerInvoice
        fields = [
            'id', 'invoice_number', 'sale', 'customer',
            'generated_by', 'total', 'tax', 'discount', 'notes',
            'issued_at', 'sent_by_email', 'email_sent_to', 'status',
        ]
        # total is always computed server-side from sale.total - discount + tax
        read_only_fields = ['invoice_number', 'generated_by', 'issued_at', 'total']

    def validate(self, data):
        sale = data.get('sale') or (self.instance.sale if self.instance else None)
        discount = data.get(
            'discount',
            self.instance.discount if self.instance else Decimal('0'),
        )

        if sale and self.instance is None:  # creation only
            # Duplicate invoice check
            if CustomerInvoice.objects.filter(sale=sale).exists():
                raise serializers.ValidationError(
                    {'sale': 'Esta venta ya tiene una factura generada.'}
                )
            # Sale must not be cancelled
            if sale.status == 'CANCELLED':
                raise serializers.ValidationError(
                    {'sale': 'No se puede generar una factura para una venta cancelada.'}
                )

        # Discount bounds
        if discount < 0:
            raise serializers.ValidationError(
                {'discount': 'El descuento no puede ser negativo.'}
            )
        if sale and discount > 0:
            max_allowed = (sale.total * MAX_DISCOUNT_PCT / Decimal('100')).quantize(Decimal('0.01'))
            if discount > max_allowed:
                raise serializers.ValidationError({
                    'discount': (
                        f'El descuento ${discount:,.2f} supera el margen máximo permitido '
                        f'del {MAX_DISCOUNT_PCT}% (${max_allowed:,.2f}).'
                    )
                })

        # Update-only: warn if active credit notes exist, require explicit confirmation.
        if self.instance:
            has_credit_notes = self.instance.credit_notes.filter(status='ISSUED').exists()
            force = bool(
                self.context.get('request') and
                self.context['request'].data.get('force_update')
            )
            if has_credit_notes and not force:
                raise serializers.ValidationError({
                    'credit_notes_warning': (
                        'Esta factura tiene notas crédito activas asociadas. '
                        'La modificación puede afectar la consistencia contable. '
                        'Reenvíe la solicitud con force_update=true para confirmar.'
                    )
                })

        return data

    def create(self, validated_data):
        sale = validated_data['sale']
        discount = validated_data.get('discount', Decimal('0'))
        tax = validated_data.get('tax', Decimal('0'))

        # Derive customer from sale when not explicitly provided
        if not validated_data.get('customer'):
            validated_data['customer'] = sale.customer

        # Server-side total: gross sale amount minus discount, plus tax
        validated_data['total'] = sale.total - discount + tax

        return super().create(validated_data)

    def update(self, instance, validated_data):
        # The sale FK cannot be changed after creation.
        validated_data.pop('sale', None)

        # Recalculate total from the fixed sale amount.
        sale = instance.sale
        discount = validated_data.get('discount', instance.discount)
        tax = validated_data.get('tax', instance.tax)
        validated_data['total'] = sale.total - discount + tax

        # Allow resend: reset sent_by_email so admin can re-send after editing.
        if instance.sent_by_email:
            validated_data['sent_by_email'] = False

        return super().update(instance, validated_data)


class SupplierInvoiceItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()

    class Meta:
        model = SupplierInvoiceItem
        fields = ['id', 'product', 'product_name', 'quantity', 'unit_cost', 'subtotal']

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None


class SupplierInvoiceSerializer(serializers.ModelSerializer):
    """Read serializer — returned for list/retrieve/update."""

    items = SupplierInvoiceItemSerializer(many=True, read_only=True)
    supplier_name = serializers.SerializerMethodField()
    registered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SupplierInvoice
        fields = [
            'id', 'supplier_invoice_number', 'supplier', 'supplier_name',
            'purchase_order', 'registered_by', 'registered_by_name',
            'payment_status', 'tax', 'total', 'received_at', 'items',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['registered_by', 'registered_by_name', 'created_at', 'updated_at']

    def get_supplier_name(self, obj):
        return obj.supplier.business_name if obj.supplier else None

    def get_registered_by_name(self, obj):
        u = obj.registered_by
        return (u.get_full_name() or u.username) if u else None


# ---------------------------------------------------------------------------
# Supplier Invoice write serializer (HU-019)
# ---------------------------------------------------------------------------

class SupplierInvoiceItemWriteSerializer(serializers.Serializer):
    """One line item in a supplier invoice creation request."""
    product  = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0.01')
    )


class SupplierInvoiceWriteSerializer(serializers.ModelSerializer):
    """
    Write serializer for registering a supplier invoice (HU-019).

    Input:
      {
        "supplier": 3,
        "supplier_invoice_number": "FAC-2025-001",
        "received_at": "2025-04-15",
        "purchase_order": null,          // optional
        "payment_status": "PENDING",     // optional, default PENDING
        "tax": "95000.00",               // optional, default 0
        "items": [
          {"product": 5, "quantity": 10, "unit_cost": "45000.00"},
          {"product": 8, "quantity": 2,  "unit_cost": "120000.00"}
        ]
      }

    Side effects (atomic):
      - Creates SupplierInvoiceItem rows.
      - Adds received quantities to product.stock.
      - Creates a finances.Transaction of type EXPENSE.
    """

    items = SupplierInvoiceItemWriteSerializer(many=True, write_only=True)

    class Meta:
        model = SupplierInvoice
        fields = [
            'supplier_invoice_number', 'supplier', 'purchase_order',
            'received_at', 'payment_status', 'tax', 'items',
        ]

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Debe incluir al menos un producto.')
        return value

    def validate(self, data):
        supplier = data.get('supplier')
        number   = data.get('supplier_invoice_number', '').strip()
        if supplier and number:
            if SupplierInvoice.objects.filter(
                supplier=supplier, supplier_invoice_number=number
            ).exists():
                raise serializers.ValidationError({
                    'supplier_invoice_number': (
                        f'Ya existe una factura con el número "{number}" '
                        f'para el proveedor "{supplier.business_name}". '
                        'Verifique si ya fue registrada anteriormente.'
                    )
                })
        return data

    def create(self, validated_data):
        from finances.models import Transaction

        items_data = validated_data.pop('items')
        tax = validated_data.get('tax', Decimal('0'))

        # Calculate total from line items + tax
        items_subtotal = sum(
            item['unit_cost'] * item['quantity'] for item in items_data
        )
        validated_data['total'] = items_subtotal + tax

        with db_transaction.atomic():
            invoice = SupplierInvoice.objects.create(**validated_data)

            for item_data in items_data:
                subtotal = item_data['unit_cost'] * item_data['quantity']
                SupplierInvoiceItem.objects.create(
                    invoice=invoice,
                    product=item_data['product'],
                    quantity=item_data['quantity'],
                    unit_cost=item_data['unit_cost'],
                    subtotal=subtotal,
                )
                # Update stock with received quantities
                product = item_data['product']
                product.stock += item_data['quantity']
                product.save(update_fields=['stock'])

            # Financial record (egreso)
            Transaction.objects.create(
                type=Transaction.Type.EXPENSE,
                amount=invoice.total,
                concept=(
                    f'Factura proveedor {invoice.supplier_invoice_number} '
                    f'— {invoice.supplier.business_name}'
                ),
                reference_type=Transaction.ReferenceType.SUPPLIER_INVOICE,
                reference_id=invoice.pk,
                transaction_date=invoice.received_at,
                registered_by=invoice.registered_by,
            )

        return invoice

    def to_representation(self, instance):
        return SupplierInvoiceSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Supplier Invoice update serializer (HU-020)
# ---------------------------------------------------------------------------

class SupplierInvoiceUpdateSerializer(serializers.ModelSerializer):
    """
    Write serializer for updating a supplier invoice (HU-020).

    Input (all fields optional — PATCH semantics):
      {
        "supplier_invoice_number": "FAC-CORR-001",
        "received_at": "2025-04-20",
        "payment_status": "PAID",
        "tax": "50000.00",
        "items": [                                    // full replacement when provided
          {"product": 5, "quantity": 8, "unit_cost": "45000.00"}
        ],
        "force_update": true                          // bypass warnings
      }

    Validations:
      - Duplicate invoice number (same supplier, different instance).
      - Warns if any CLOSED CashRegister period covers the original EXPENSE transaction.
      - Warns if item quantity changes would leave a product with negative stock.
      - Both warnings require force_update=true to bypass.

    Side effects (atomic):
      - If items provided: reverts old stock, deletes old items, creates new items,
        decrements stock for new items.
      - Recalculates total from new items + tax.
      - Updates the related EXPENSE Transaction (amount, concept, transaction_date).
    """

    items = SupplierInvoiceItemWriteSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = SupplierInvoice
        fields = [
            'supplier_invoice_number', 'supplier', 'purchase_order',
            'received_at', 'payment_status', 'tax', 'items',
        ]

    def _force(self):
        return bool(
            self.context.get('request') and
            self.context['request'].data.get('force_update')
        )

    def validate_items(self, value):
        if value is not None and len(value) == 0:
            raise serializers.ValidationError('Debe incluir al menos un producto.')
        return value

    def validate(self, data):
        instance = self.instance
        force = self._force()

        # Duplicate number check (exclude current instance).
        supplier = data.get('supplier', instance.supplier if instance else None)
        number = data.get(
            'supplier_invoice_number',
            instance.supplier_invoice_number if instance else '',
        )
        if supplier and number and instance:
            if SupplierInvoice.objects.filter(
                supplier=supplier, supplier_invoice_number=number
            ).exclude(pk=instance.pk).exists():
                raise serializers.ValidationError({
                    'supplier_invoice_number': (
                        f'Ya existe una factura con el número "{number}" '
                        f'para el proveedor "{supplier.business_name}".'
                    )
                })

        from finances.models import CashRegister, Transaction as Txn

        # Warn if invoice's EXPENSE transaction falls inside a closed register
        # (bypassed with force_update=true).
        if instance and not force:
            try:
                txn = Txn.objects.get(
                    reference_type=Txn.ReferenceType.SUPPLIER_INVOICE,
                    reference_id=instance.pk,
                )
                if CashRegister.objects.filter(
                    status=CashRegister.Status.CLOSED,
                    opened_at__lte=txn.created_at,
                    closed_at__gte=txn.created_at,
                ).exists():
                    raise serializers.ValidationError({
                        'closed_register_warning': (
                            'Esta factura fue registrada durante un período de caja ya cerrado. '
                            'Modificarla puede afectar la conciliación contable. '
                            'Reenvíe con force_update=true para confirmar.'
                        )
                    })
            except Txn.DoesNotExist:
                pass

        # Hard-block if item replacement would leave any product with negative stock.
        # Correct net formula: current stock + (new_qty − old_qty).
        # Creating a supplier invoice ADDED stock; reverting means SUBTRACTING old_qty
        # and ADDING new_qty.
        if instance:
            items_data = data.get('items')
            if items_data is not None:
                old_items = list(instance.items.select_related('product').all())
                net = {}
                for item in old_items:
                    net[item.product.pk] = net.get(item.product.pk, 0) - item.quantity
                for item_data in items_data:
                    pid = item_data['product'].pk
                    net[pid] = net.get(pid, 0) + item_data['quantity']

                from products.models import Product as Prod
                for pid, delta in net.items():
                    prod = Prod.objects.get(pk=pid)
                    if prod.stock + delta < 0:
                        raise serializers.ValidationError({
                            'stock_warning': (
                                f'La modificación dejaría "{prod.name}" con stock negativo '
                                f'({prod.stock + delta} uds). '
                                'Corrija las cantidades antes de guardar.'
                            )
                        })

        return data

    def update(self, instance, validated_data):
        from finances.models import Transaction as Txn

        items_data = validated_data.pop('items', None)

        with db_transaction.atomic():
            if items_data is not None:
                from django.db.models import F
                from products.models import Product as Prod

                # Compute net stock delta per product:
                #   creating the invoice ADDED stock → reverting means subtracting old_qty.
                #   new items are RECEIVED → add new_qty.
                net = {}
                for old in instance.items.all():
                    net[old.product_id] = net.get(old.product_id, 0) - old.quantity
                for item_data in items_data:
                    pid = item_data['product'].pk
                    net[pid] = net.get(pid, 0) + item_data['quantity']

                # Apply net stock changes atomically (single UPDATE per product).
                for pid, delta in net.items():
                    Prod.objects.filter(pk=pid).update(stock=F('stock') + delta)

                # Replace items.
                instance.items.all().delete()

                items_subtotal = Decimal('0')
                for item_data in items_data:
                    subtotal = item_data['unit_cost'] * item_data['quantity']
                    items_subtotal += subtotal
                    SupplierInvoiceItem.objects.create(
                        invoice=instance,
                        product=item_data['product'],
                        quantity=item_data['quantity'],
                        unit_cost=item_data['unit_cost'],
                        subtotal=subtotal,
                    )

                tax = validated_data.get('tax', instance.tax)
                validated_data['total'] = items_subtotal + tax

            elif 'tax' in validated_data:
                # Only tax changed — recalculate from existing item subtotals.
                existing_subtotal = sum(
                    item.subtotal for item in instance.items.all()
                )
                validated_data['total'] = existing_subtotal + validated_data['tax']

            # Save scalar field changes.
            updated = super().update(instance, validated_data)

            # Keep the related EXPENSE transaction in sync.
            try:
                txn = Txn.objects.get(
                    reference_type=Txn.ReferenceType.SUPPLIER_INVOICE,
                    reference_id=updated.pk,
                )
                changed = []
                new_amount = updated.total
                new_concept = (
                    f'Factura proveedor {updated.supplier_invoice_number} '
                    f'— {updated.supplier.business_name}'
                )
                new_date = updated.received_at
                if txn.amount != new_amount:
                    txn.amount = new_amount
                    changed.append('amount')
                if txn.concept != new_concept:
                    txn.concept = new_concept
                    changed.append('concept')
                if txn.transaction_date != new_date:
                    txn.transaction_date = new_date
                    changed.append('transaction_date')
                if changed:
                    txn.save(update_fields=changed)
            except Txn.DoesNotExist:
                pass

        return updated

    def to_representation(self, instance):
        return SupplierInvoiceSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Credit Note serializers (HU-005)
# ---------------------------------------------------------------------------

class CreditNoteItemReadSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()

    class Meta:
        model = CreditNoteItem
        fields = [
            'id', 'sale_item', 'product', 'product_name',
            'quantity_returned', 'unit_price', 'subtotal',
        ]

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None


class CreditNoteReadSerializer(serializers.ModelSerializer):
    """Read serializer — includes nested items and computed fields."""

    items = CreditNoteItemReadSerializer(many=True, read_only=True)
    generated_by_name = serializers.SerializerMethodField()
    invoice_number = serializers.SerializerMethodField()

    class Meta:
        model = CreditNote
        fields = [
            'id', 'credit_note_number', 'sale', 'invoice', 'invoice_number',
            'reason', 'total_refund', 'generated_by', 'generated_by_name',
            'issued_at', 'status', 'items',
        ]

    def get_generated_by_name(self, obj):
        user = obj.generated_by
        return user.get_full_name() or user.username if user else None

    def get_invoice_number(self, obj):
        return obj.invoice.invoice_number if obj.invoice_id else None


class CreditNoteItemWriteSerializer(serializers.Serializer):
    """One returned item in a credit note creation request."""

    sale_item = serializers.PrimaryKeyRelatedField(queryset=SaleItem.objects.all())
    quantity_returned = serializers.IntegerField(min_value=1)


class CreditNoteSerializer(serializers.ModelSerializer):
    """
    Write serializer for creating a CreditNote (HU-005).

    Input:
      {
        "sale": 5,
        "reason": "Producto defectuoso",
        "items": [
          {"sale_item": 12, "quantity_returned": 2},
          {"sale_item": 13, "quantity_returned": 1}
        ]
      }

    Validations:
      - sale must be COMPLETED (not CANCELLED).
      - each sale_item must belong to the given sale.
      - quantity_returned ≤ (original quantity − already returned in active credit notes).
      - At least one item required.

    Side effects (atomic):
      - Restores product.stock for each returned item.
      - Creates a EXPENSE Transaction in finances.
    """

    items = CreditNoteItemWriteSerializer(many=True, write_only=True)

    class Meta:
        model = CreditNote
        fields = ['sale', 'reason', 'items']

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Debe incluir al menos un ítem para devolver.')
        return value

    def validate(self, data):
        sale = data.get('sale')
        items_data = data.get('items', [])

        if sale and sale.status == Sale.Status.CANCELLED:
            raise serializers.ValidationError(
                {'sale': 'No se puede crear una nota crédito para una venta cancelada.'}
            )

        # Validate each sale_item belongs to the sale and quantity is available.
        for item_data in items_data:
            sale_item = item_data['sale_item']
            qty = item_data['quantity_returned']

            if sale_item.sale_id != sale.pk:
                raise serializers.ValidationError({
                    'items': f'El ítem #{sale_item.pk} no pertenece a la venta #{sale.pk}.',
                })

            already_returned = (
                CreditNoteItem.objects
                .filter(
                    sale_item=sale_item,
                    credit_note__status=CreditNote.Status.ISSUED,
                )
                .aggregate(total=Sum('quantity_returned'))['total']
            ) or 0

            available = sale_item.quantity - already_returned
            if qty > available:
                raise serializers.ValidationError({
                    'items': (
                        f'No puede devolver {qty} uds de "{sale_item.product.name}". '
                        f'Disponible para devolución: {available} uds '
                        f'(vendido: {sale_item.quantity}, ya devuelto: {already_returned}).'
                    ),
                })

        return data

    def create(self, validated_data):
        from finances.models import Transaction

        items_data = validated_data.pop('items')
        sale = validated_data['sale']

        # Derive invoice if one exists.
        try:
            invoice = sale.invoice
        except Exception:
            invoice = None

        with db_transaction.atomic():
            # Create the credit note shell (total_refund calculated below).
            note = CreditNote.objects.create(
                **validated_data,
                invoice=invoice,
                total_refund=Decimal('0'),
            )

            total_refund = Decimal('0')
            for item_data in items_data:
                sale_item = item_data['sale_item']
                qty = item_data['quantity_returned']
                unit_price = sale_item.unit_price
                subtotal = unit_price * qty
                total_refund += subtotal

                CreditNoteItem.objects.create(
                    credit_note=note,
                    sale_item=sale_item,
                    product=sale_item.product,
                    quantity_returned=qty,
                    unit_price=unit_price,
                    subtotal=subtotal,
                )

                # Restore stock.
                product = sale_item.product
                product.stock += qty
                product.save(update_fields=['stock'])

            # Persist final total.
            note.total_refund = total_refund
            note.save(update_fields=['total_refund'])

            # Financial record.
            customer_label = str(sale.customer) if sale.customer else 'Cliente anónimo'
            Transaction.objects.create(
                type=Transaction.Type.EXPENSE,
                amount=total_refund,
                concept=f'Nota crédito {note.credit_note_number} — Venta #{sale.pk} — {customer_label}',
                reference_type=Transaction.ReferenceType.CREDIT_NOTE,
                reference_id=note.pk,
                transaction_date=timezone.localdate(),
                registered_by=validated_data['generated_by'],
            )

        return note

    def to_representation(self, instance):
        return CreditNoteReadSerializer(instance, context=self.context).data
