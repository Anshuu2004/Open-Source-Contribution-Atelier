from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("progress", "0040_leaderboardarchive"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="xpevent",
            index=models.Index(
                fields=["user", "created_at"], name="idx_xp_user_created"
            ),
        ),
        migrations.AddIndex(
            model_name="lessonprogress",
            index=models.Index(fields=["updated_at"], name="idx_progress_updated"),
        ),
    ]
