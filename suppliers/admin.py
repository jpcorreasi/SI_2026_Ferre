from django.contrib import admin

from suppliers.models import PurchaseOrder, PurchaseOrderItem, Supplier


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 1
    fields = ['product', 'quantity', 'unit_cost']


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['business_name', 'nit', 'contact_name', 'phone', 'is_active']
    search_fields = ['business_name', 'nit', 'contact_name']
    list_filter = ['is_active']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    ordering = ['business_name']


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'supplier', 'status', 'created_at', 'created_by']
    search_fields = ['supplier__business_name', 'supplier__nit']
    list_filter = ['status']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    ordering = ['-created_at']
    inlines = [PurchaseOrderItemInline]
