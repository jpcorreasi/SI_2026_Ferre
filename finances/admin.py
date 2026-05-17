from django.contrib import admin

from finances.models import CashRegister, Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ['type', 'concept', 'amount', 'reference_type', 'transaction_date']
    search_fields = ['concept']
    list_filter = ['type', 'reference_type', 'transaction_date']
    readonly_fields = ['created_at', 'registered_by']
    ordering = ['-transaction_date', '-created_at']


@admin.register(CashRegister)
class CashRegisterAdmin(admin.ModelAdmin):
    list_display = ['pk', 'opened_by', 'status', 'opening_amount', 'closing_amount', 'opened_at']
    search_fields = ['opened_by__username']
    list_filter = ['status']
    readonly_fields = ['opened_at', 'opened_by']
    ordering = ['-opened_at']
