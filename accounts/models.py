from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.db import models


class CustomUser(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Administrador'
        EMPLEADO = 'EMPLEADO', 'Empleado'

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.EMPLEADO,
        verbose_name='rol',
    )
    # AbstractUser already provides is_active; redeclared to set Spanish verbose_name.
    is_active = models.BooleanField(default=True, verbose_name='activo')
    failed_login_attempts = models.IntegerField(
        default=0,
        verbose_name='intentos fallidos de inicio de sesión',
    )
    locked_until = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='bloqueado hasta',
    )

    class Meta:
        verbose_name = 'usuario'
        verbose_name_plural = 'usuarios'

    def __str__(self):
        return f'{self.get_full_name() or self.username} ({self.get_role_display()})'


class AuditSession(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_sessions',
        verbose_name='usuario',
    )
    login_at = models.DateTimeField(verbose_name='inicio de sesión')
    logout_at = models.DateTimeField(null=True, blank=True, verbose_name='cierre de sesión')
    ip_address = models.GenericIPAddressField(verbose_name='dirección IP')

    class Meta:
        verbose_name = 'sesión de auditoría'
        verbose_name_plural = 'sesiones de auditoría'
        ordering = ['-login_at']

    def __str__(self):
        return f'{self.user} — {self.login_at:%Y-%m-%d %H:%M}'
