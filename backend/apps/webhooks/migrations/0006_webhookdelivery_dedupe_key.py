from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("webhooks", "0005_webhookdeliverylog"),
    ]

    operations = [
        migrations.AddField(
            model_name="webhookdelivery",
            name="dedupe_key",
            field=models.CharField(
                blank=True,
                help_text=(
                    "Optional caller supplied key for the logical event. "
                    "Dispatching the same key to the same endpoint twice creates "
                    "only one delivery."
                ),
                max_length=128,
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name="webhookdelivery",
            constraint=models.UniqueConstraint(
                condition=models.Q(("dedupe_key__isnull", False)),
                fields=("endpoint", "dedupe_key"),
                name="webhooks_unique_dedupe_key_per_endpoint",
            ),
        ),
    ]
