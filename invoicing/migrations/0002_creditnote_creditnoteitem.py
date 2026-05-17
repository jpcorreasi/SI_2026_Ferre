# Generated manually 2026-04-13 — HU-005 Devolución parcial con nota crédito

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('invoicing', '0001_initial'),
        ('products', '0002_initial'),
        ('sales', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CreditNote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('credit_note_number', models.CharField(editable=False, max_length=25, unique=True, verbose_name='número de nota crédito')),
                ('reason', models.CharField(max_length=500, verbose_name='motivo de devolución')),
                ('total_refund', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='total a reembolsar')),
                ('issued_at', models.DateTimeField(auto_now_add=True, verbose_name='fecha de emisión')),
                ('status', models.CharField(choices=[('ISSUED', 'Emitida'), ('CANCELLED', 'Anulada')], db_index=True, default='ISSUED', max_length=10, verbose_name='estado')),
                ('generated_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='credit_notes_generated', to=settings.AUTH_USER_MODEL, verbose_name='generada por')),
                ('invoice', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='credit_notes', to='invoicing.customerinvoice', verbose_name='factura original')),
                ('sale', models.ForeignKey(db_index=True, on_delete=django.db.models.deletion.PROTECT, related_name='credit_notes', to='sales.sale', verbose_name='venta')),
            ],
            options={
                'verbose_name': 'nota crédito',
                'verbose_name_plural': 'notas crédito',
                'ordering': ['-issued_at'],
            },
        ),
        migrations.CreateModel(
            name='CreditNoteItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity_returned', models.IntegerField(verbose_name='cantidad devuelta')),
                ('unit_price', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='precio unitario original')),
                ('subtotal', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='subtotal devuelto')),
                ('credit_note', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='invoicing.creditnote', verbose_name='nota crédito')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='credit_note_items', to='products.product', verbose_name='producto')),
                ('sale_item', models.ForeignKey(db_index=True, on_delete=django.db.models.deletion.PROTECT, related_name='credit_note_items', to='sales.saleitem', verbose_name='ítem de venta original')),
            ],
            options={
                'verbose_name': 'ítem de nota crédito',
                'verbose_name_plural': 'ítems de nota crédito',
            },
        ),
    ]
