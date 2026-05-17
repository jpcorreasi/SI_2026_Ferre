from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoicing', '0004_customerinvoice_discount_notes'),
    ]

    operations = [
        migrations.AddField(
            model_name='supplierinvoice',
            name='payment_status',
            field=models.CharField(
                choices=[('PENDING', 'Pendiente'), ('PAID', 'Pagada')],
                db_index=True,
                default='PENDING',
                max_length=10,
                verbose_name='estado de pago',
            ),
        ),
        migrations.AddField(
            model_name='supplierinvoice',
            name='tax',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Monto de IVA incluido en la factura.',
                max_digits=12,
                verbose_name='IVA',
            ),
        ),
    ]
