# Generated manually 2026-04-13 — HU-032 adds SERVICE reference type to Transaction

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finances', '0004_expense_category_and_expense'),
    ]

    operations = [
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
                    ('SERVICE', 'Servicio'),
                    ('OTHER', 'Otro'),
                ],
                max_length=20,
                verbose_name='tipo de referencia',
            ),
        ),
    ]
