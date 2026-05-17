from django.conf import settings
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name='nombre')
    description = models.TextField(blank=True, verbose_name='descripción')

    class Meta:
        verbose_name = 'categoría'
        verbose_name_plural = 'categorías'
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=255, verbose_name='nombre')
    code = models.CharField(max_length=50, unique=True, verbose_name='código', db_index=True)
    description = models.TextField(blank=True, verbose_name='descripción')
    category = models.ForeignKey(
        'products.Category',
        on_delete=models.PROTECT,
        related_name='products',
        verbose_name='categoría',
        db_index=True,
    )
    sale_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='precio de venta',
    )
    cost_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='precio de costo',
    )
    stock = models.IntegerField(default=0, verbose_name='stock')
    min_stock = models.IntegerField(default=5, verbose_name='stock mínimo')
    supplier = models.ForeignKey(
        'suppliers.Supplier',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='products',
        verbose_name='proveedor',
    )
    is_active = models.BooleanField(default=True, verbose_name='activo')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='products_created',
        verbose_name='creado por',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='fecha de creación')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='fecha de actualización')

    class Meta:
        verbose_name = 'producto'
        verbose_name_plural = 'productos'
        ordering = ['name']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(stock__gte=0),
                name='product_stock_non_negative',
            ),
        ]

    def __str__(self):
        return f'[{self.code}] {self.name}'

    @property
    def is_low_stock(self) -> bool:
        return self.stock <= self.min_stock
