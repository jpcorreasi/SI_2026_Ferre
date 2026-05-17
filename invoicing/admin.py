from django.contrib import admin

from invoicing.models import CreditNote, CreditNoteItem, CustomerInvoice, SupplierInvoice, SupplierInvoiceItem


class SupplierInvoiceItemInline(admin.TabularInline):
    model = SupplierInvoiceItem
    extra = 1
    fields = ['product', 'quantity', 'unit_cost', 'subtotal']


@admin.register(CustomerInvoice)
class CustomerInvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'customer', 'total', 'issued_at', 'status']
    search_fields = ['invoice_number', 'customer__full_name']
    list_filter = ['status', 'sent_by_email']
    # invoice_number is auto-generated; issued_at and generated_by are set on creation.
    readonly_fields = ['invoice_number', 'issued_at', 'generated_by']
    ordering = ['-issued_at']


@admin.register(SupplierInvoice)
class SupplierInvoiceAdmin(admin.ModelAdmin):
    list_display = ['supplier_invoice_number', 'supplier', 'total', 'received_at', 'registered_by']
    search_fields = ['supplier_invoice_number', 'supplier__business_name']
    list_filter = ['received_at']
    readonly_fields = ['created_at', 'updated_at', 'registered_by']
    ordering = ['-received_at']
    inlines = [SupplierInvoiceItemInline]


class CreditNoteItemInline(admin.TabularInline):
    model = CreditNoteItem
    extra = 0
    fields = ['product', 'sale_item', 'quantity_returned', 'unit_price', 'subtotal']
    readonly_fields = ['unit_price', 'subtotal']


@admin.register(CreditNote)
class CreditNoteAdmin(admin.ModelAdmin):
    list_display = ['credit_note_number', 'sale', 'total_refund', 'issued_at', 'status', 'generated_by']
    search_fields = ['credit_note_number', 'sale__id']
    list_filter = ['status', 'issued_at']
    readonly_fields = ['credit_note_number', 'issued_at', 'generated_by', 'total_refund']
    ordering = ['-issued_at']
    inlines = [CreditNoteItemInline]
