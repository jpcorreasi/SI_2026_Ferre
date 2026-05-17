from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoicing', '0003_customerinvoice_email_sent_to'),
    ]

    operations = [
        migrations.AddField(
            model_name='customerinvoice',
            name='discount',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Monto de descuento aplicado por el administrador.',
                max_digits=12,
                verbose_name='descuento',
            ),
        ),
        migrations.AddField(
            model_name='customerinvoice',
            name='notes',
            field=models.TextField(
                blank=True,
                help_text='Notas especiales o condiciones adicionales de la factura.',
                verbose_name='notas adicionales',
            ),
        ),
    ]
