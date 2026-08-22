from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("tickets", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="ticket",
            name="client_request_key",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddConstraint(
            model_name="ticket",
            constraint=models.UniqueConstraint(
                condition=Q(client_request_key__gt=""),
                fields=("customer", "client_request_key"),
                name="unique_customer_client_request_key",
            ),
        ),
        migrations.AddIndex(
            model_name="ticket",
            index=models.Index(fields=("customer", "client_request_key"), name="tickets_tic_custome_83dc4f_idx"),
        ),
    ]
