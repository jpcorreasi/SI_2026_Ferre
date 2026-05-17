from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = 'CREATE', 'Crear'
        UPDATE = 'UPDATE', 'Actualizar'
        DELETE = 'DELETE', 'Eliminar'
        VIEW = 'VIEW', 'Visualizar'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        verbose_name='usuario',
    )
    action = models.CharField(
        max_length=6,
        choices=Action.choices,
        verbose_name='acción',
        db_index=True,
    )
    app_label = models.CharField(max_length=50, verbose_name='aplicación')
    model_name = models.CharField(max_length=100, verbose_name='modelo', db_index=True)
    object_id = models.CharField(max_length=50, verbose_name='ID del objeto')
    object_repr = models.CharField(max_length=200, verbose_name='representación del objeto')
    changed_fields = models.JSONField(
        null=True,
        blank=True,
        verbose_name='campos modificados',
        help_text='Formato: {"campo": {"old": valor_anterior, "new": valor_nuevo}}',
    )
    timestamp = models.DateTimeField(
        auto_now_add=True,
        verbose_name='fecha y hora',
        db_index=True,
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        verbose_name='dirección IP',
    )

    class Meta:
        verbose_name = 'registro de auditoría'
        verbose_name_plural = 'registros de auditoría'
        ordering = ['-timestamp']

    def __str__(self):
        return (
            f'{self.get_action_display()} — {self.app_label}.{self.model_name} '
            f'#{self.object_id} por {self.user} ({self.timestamp:%Y-%m-%d %H:%M})'
        )
