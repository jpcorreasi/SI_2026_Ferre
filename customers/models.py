from django.conf import settings
from django.db import models

# RNF-PRI-001: document_number is stored encrypted (AES via Fernet).
from encrypted_model_fields.fields import EncryptedCharField  # noqa: E402


class Customer(models.Model):
    class DocumentType(models.TextChoices):
        CC = 'CC', 'Cédula de Ciudadanía'
        NIT = 'NIT', 'NIT'
        CE = 'CE', 'Cédula de Extranjería'

    full_name = models.CharField(max_length=255, verbose_name='nombre completo')
    document_type = models.CharField(
        max_length=3,
        choices=DocumentType.choices,
        verbose_name='tipo de documento',
    )
    document_number = EncryptedCharField(
        max_length=20,
        verbose_name='número de documento',
    )
    email = models.EmailField(blank=True, verbose_name='correo electrónico')
    phone = models.CharField(max_length=20, blank=True, verbose_name='teléfono')
    address = models.TextField(blank=True, verbose_name='dirección')
    is_active = models.BooleanField(default=True, verbose_name='activo')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='customers_created',
        verbose_name='creado por',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de creación')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='fecha de actualización')

    class Meta:
        verbose_name = 'cliente'
        verbose_name_plural = 'clientes'
        ordering = ['full_name']

    def __str__(self):
        return f'{self.full_name} ({self.document_type}: {self.document_number})'
