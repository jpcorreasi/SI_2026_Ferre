from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0002_initial'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='product',
            constraint=models.CheckConstraint(
                condition=models.Q(stock__gte=0),
                name='product_stock_non_negative',
            ),
        ),
    ]
