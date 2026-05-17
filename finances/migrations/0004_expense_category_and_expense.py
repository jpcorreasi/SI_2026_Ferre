# Generated manually 2026-04-13 — HU-031 adds ExpenseCategory, Expense, and EXPENSE reference type

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finances', '0003_add_withdrawal_reference_type'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Add EXPENSE to Transaction.reference_type choices
        migrations.AlterField(
            model_name='transaction',
            name='reference_type',
            field=models.CharField(
                choices=[
                    ('SALE', 'Venta'),
                    ('SUPPLIER_INVOICE', 'Factura de proveedor'),
                    ('PAYROLL', 'Nómina'),
                    ('CREDIT_NOTE', 'Nota crédito'),
                    ('WITHDRAWAL', 'Retiro de caja'),
                    ('EXPENSE', 'Gasto operativo'),
                    ('OTHER', 'Otro'),
                ],
                max_length=20,
                verbose_name='tipo de referencia',
            ),
        ),
        # 2. Create ExpenseCategory
        migrations.CreateModel(
            name='ExpenseCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True, verbose_name='nombre')),
                ('description', models.CharField(blank=True, default='', max_length=255, verbose_name='descripción')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'categoría de gasto',
                'verbose_name_plural': 'categorías de gasto',
                'ordering': ['name'],
            },
        ),
        # 3. Create Expense
        migrations.CreateModel(
            name='Expense',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('description', models.CharField(max_length=255, verbose_name='descripción')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='monto')),
                ('expense_date', models.DateField(db_index=True, verbose_name='fecha del gasto')),
                ('payment_method', models.CharField(
                    choices=[
                        ('CASH', 'Efectivo'),
                        ('CARD', 'Tarjeta'),
                        ('TRANSFER', 'Transferencia'),
                        ('OTHER', 'Otro'),
                    ],
                    max_length=10,
                    verbose_name='medio de pago',
                )),
                ('receipt_reference', models.CharField(blank=True, default='', max_length=100, verbose_name='comprobante')),
                ('notes', models.TextField(blank=True, default='', verbose_name='notas')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('category', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='expenses',
                    to='finances.expensecategory',
                    verbose_name='categoría',
                )),
                ('registered_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='expenses_registered',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='registrado por',
                )),
            ],
            options={
                'verbose_name': 'gasto',
                'verbose_name_plural': 'gastos',
                'ordering': ['-expense_date', '-created_at'],
            },
        ),
    ]
