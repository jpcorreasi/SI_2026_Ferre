"""
services/models.py
==================
ServiceType — catalog of service types offered by the store.
Service     — an actual service rendered to a customer.

Each completed Service generates a finances.Transaction (INCOME) via
services/signals.py, keeping the financial ledger in sync without
touching the Sale model.
"""

from django.conf import settings
from django.db import models


class ServiceType(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name='nombre')
    description = models.CharField(
        max_length=255, blank=True, default='', verbose_name='descripción'
    )
    default_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='precio base',
        help_text='Precio sugerido; puede ajustarse al registrar el servicio.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'tipo de servicio'
        verbose_name_plural = 'tipos de servicio'
        ordering = ['name']

    def __str__(self):
        return self.name


class Service(models.Model):
    service_type = models.ForeignKey(
        ServiceType,
        on_delete=models.PROTECT,
        related_name='services',
        verbose_name='tipo de servicio',
    )
    description = models.CharField(max_length=255, verbose_name='descripción')
    price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='precio',
    )
    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='services',
        verbose_name='cliente',
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='services_performed',
        verbose_name='realizado por',
    )
    service_date = models.DateField(verbose_name='fecha del servicio', db_index=True)
    notes = models.TextField(blank=True, default='', verbose_name='notas')
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='services_registered',
        verbose_name='registrado por',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'servicio'
        verbose_name_plural = 'servicios'
        ordering = ['-service_date', '-created_at']

    def __str__(self):
        customer_label = str(self.customer) if self.customer else 'Sin cliente'
        return f'Servicio #{self.pk} — {self.service_type} | {customer_label} ({self.service_date})'
