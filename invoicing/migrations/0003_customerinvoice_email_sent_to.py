from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoicing', '0002_creditnote_creditnoteitem'),
    ]

    operations = [
        migrations.AddField(
            model_name='customerinvoice',
            name='email_sent_to',
            field=models.EmailField(
                blank=True,
                verbose_name='correo destinatario',
                help_text='Dirección de correo a la que se enviará/envió la factura.',
            ),
        ),
    ]
