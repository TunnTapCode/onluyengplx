from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("exams", "0003_require_three_critical_questions"),
    ]

    operations = [
        migrations.AlterField(
            model_name="examconfiguration",
            name="duration_seconds",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="examconfiguration",
            name="passing_score",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="examconfiguration",
            name="fixed_question_ids",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
