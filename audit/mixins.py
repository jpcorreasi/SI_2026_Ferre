"""
audit/mixins.py
===============
AuditLogMixin — add to any ModelViewSet to automatically record
CREATE, UPDATE, and DELETE events in the AuditLog table.

Usage:
    class MyViewSet(AuditLogMixin, viewsets.ModelViewSet):
        ...

The mixin never raises; audit failures are silently swallowed so that
a logging error never breaks the main API response.
"""

from audit.models import AuditLog


def _get_client_ip(request):
    """Extract the real client IP, handling proxied requests."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


class AuditLogMixin:
    """
    Override perform_create / perform_update / perform_destroy to
    write AuditLog records automatically.
    """

    def perform_create(self, serializer):
        instance = serializer.save()
        try:
            AuditLog.objects.create(
                user=self.request.user,
                action=AuditLog.Action.CREATE,
                app_label=instance._meta.app_label,
                model_name=instance._meta.model_name,
                object_id=str(instance.pk),
                object_repr=str(instance)[:200],
                ip_address=_get_client_ip(self.request),
            )
        except Exception:
            pass

    def perform_update(self, serializer):
        # Capture old field values before the save.
        old_instance = serializer.instance
        old_values = {
            field.name: getattr(old_instance, field.name)
            for field in old_instance._meta.concrete_fields
        }

        instance = serializer.save()

        try:
            changed = {}
            for field in instance._meta.concrete_fields:
                old_val = old_values.get(field.name)
                new_val = getattr(instance, field.name)
                if old_val != new_val:
                    changed[field.name] = {
                        'old': str(old_val),
                        'new': str(new_val),
                    }

            AuditLog.objects.create(
                user=self.request.user,
                action=AuditLog.Action.UPDATE,
                app_label=instance._meta.app_label,
                model_name=instance._meta.model_name,
                object_id=str(instance.pk),
                object_repr=str(instance)[:200],
                changed_fields=changed if changed else None,
                ip_address=_get_client_ip(self.request),
            )
        except Exception:
            pass

    def perform_destroy(self, instance):
        try:
            AuditLog.objects.create(
                user=self.request.user,
                action=AuditLog.Action.DELETE,
                app_label=instance._meta.app_label,
                model_name=instance._meta.model_name,
                object_id=str(instance.pk),
                object_repr=str(instance)[:200],
                ip_address=_get_client_ip(self.request),
            )
        except Exception:
            pass
        instance.delete()
