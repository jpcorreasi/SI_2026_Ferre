# Generated manually 2026-04-13 — HU-005 adds CREDIT_NOTE reference type

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finances', '0001_initial'),
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
                    ('OTHER', 'Otro'),
                ],
                max_length=20,
                verbose_name='tipo de referencia',
            ),
        ),
    ]
