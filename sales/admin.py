from django.contrib import admin

from sales.models import PaymentMethod, Sale, SaleItem


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    fields = ['product', 'quantity', 'unit_price', 'subtotal']
    readonly_fields = ['subtotal']


@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ['name']
    search_fields = ['name']
    ordering = ['name']


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ['id', 'customer', 'employee', 'total', 'payment_method', 'sale_date', 'status']
    search_fields = ['customer__full_name', 'employee__username']
    list_filter = ['status', 'payment_method', 'sale_date']
    readonly_fields = ['sale_date', 'created_at', 'updated_at']
    ordering = ['-sale_date']
    inlines = [SaleItemInline]
