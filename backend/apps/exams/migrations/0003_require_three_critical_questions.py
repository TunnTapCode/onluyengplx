from django.db import migrations, models


def force_critical_policy(apps, schema_editor):
    ExamConfiguration = apps.get_model("exams", "ExamConfiguration")
    ExamConfiguration.objects.using(schema_editor.connection.alias).update(
        critical_question_policy="fail_on_wrong",
    )


class Migration(migrations.Migration):
    dependencies = [
        ("exams", "0002_alter_examsession_user"),
        ("question_bank", "0003_license_class_legal_data"),
    ]

    operations = [
        migrations.RunPython(force_critical_policy, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="examconfiguration",
            name="critical_question_policy",
            field=models.CharField(
                choices=[("fail_on_wrong", "Fail on wrong critical question")],
                default="fail_on_wrong",
                max_length=24,
            ),
        ),
    ]
