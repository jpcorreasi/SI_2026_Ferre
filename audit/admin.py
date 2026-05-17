from django.contrib import admin

from audit.models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'action', 'model_name', 'object_repr', 'timestamp']
    search_fields = ['user__username', 'model_name', 'object_repr', 'object_id']
    list_filter = ['action', 'model_name']
    ordering = ['-timestamp']

    def get_readonly_fields(self, request, obj=None):
        # Every concrete field is read-only — audit logs are immutable.
        return [f.name for f in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
