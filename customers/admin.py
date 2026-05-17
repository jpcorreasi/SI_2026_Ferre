from django.contrib import admin

from customers.models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'document_type', 'email', 'phone', 'is_active']
    search_fields = ['full_name', 'document_number']
    list_filter = ['is_active', 'document_type']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    ordering = ['full_name']
