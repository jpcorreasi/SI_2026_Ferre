from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from accounts.models import AuditSession, CustomUser


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ['username', 'email', 'role', 'is_active', 'failed_login_attempts']
    list_filter = ['role', 'is_active']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering = ['username']
    # Append our custom fields to the existing UserAdmin fieldsets.
    fieldsets = UserAdmin.fieldsets + (
        ('Ferretería', {
            'fields': ('role', 'failed_login_attempts', 'locked_until'),
        }),
    )


@admin.register(AuditSession)
class AuditSessionAdmin(admin.ModelAdmin):
    list_display = ['user', 'login_at', 'logout_at', 'ip_address']
    list_filter = ['login_at']
    search_fields = ['user__username', 'ip_address']
    readonly_fields = ['user', 'login_at', 'logout_at', 'ip_address']
    ordering = ['-login_at']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
