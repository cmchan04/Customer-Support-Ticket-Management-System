from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("modelops", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="modeldeployment",
            name="priority_macro_f1",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=6, null=True),
        ),
    ]
