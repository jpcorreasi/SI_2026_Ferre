# Generated manually 2026-04-13 — HU-027 adds WITHDRAWAL reference type

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finances', '0002_alter_transaction_reference_type'),
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
                    ('OTHER', 'Otro'),
                ],
                max_length=20,
                verbose_name='tipo de referencia',
            ),
        ),
    ]
