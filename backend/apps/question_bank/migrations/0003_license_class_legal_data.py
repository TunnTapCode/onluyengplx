from django.db import migrations, models


SOURCE = (
    "https://xaydungchinhsach.chinhphu.vn/"
    "tu-1-1-2025-co-nhung-hang-giay-phep-lai-xe-nao-119240812165630751.htm"
)

LICENSE_CLASSES = (
    ("A1", "Mô tô hai bánh đến 125 cm³ hoặc xe điện đến 11 kW; bao gồm xe mô tô ba bánh dành cho người khuyết tật."),
    ("A", "Mô tô hai bánh trên 125 cm³ hoặc xe điện trên 11 kW; bao gồm phương tiện thuộc hạng A1."),
    ("B1", "Xe mô tô ba bánh; bao gồm phương tiện thuộc hạng A1."),
    ("B", "Ô tô chở người đến 8 chỗ (không kể ghế lái), ô tô tải và ô tô chuyên dùng đến 3.500 kg; kéo rơ moóc đến 750 kg."),
    ("C1", "Ô tô tải và ô tô chuyên dùng trên 3.500 kg đến 7.500 kg; kéo rơ moóc đến 750 kg; bao gồm phương tiện thuộc hạng B."),
    ("C", "Ô tô tải và ô tô chuyên dùng trên 7.500 kg; kéo rơ moóc đến 750 kg; bao gồm phương tiện thuộc hạng B và C1."),
    ("D1", "Ô tô chở người trên 8 đến 16 chỗ (không kể ghế lái); kéo rơ moóc đến 750 kg; bao gồm phương tiện thuộc hạng B, C1 và C."),
    ("D2", "Ô tô chở người trên 16 đến 29 chỗ; kéo rơ moóc đến 750 kg; bao gồm phương tiện thuộc hạng B, C1, C và D1."),
    ("D", "Ô tô chở người trên 29 chỗ; bao gồm phương tiện thuộc hạng B, C1, C, D1 và D2."),
    ("BE", "Xe thuộc hạng B kéo rơ moóc có khối lượng thiết kế trên 750 kg."),
    ("C1E", "Xe thuộc hạng C1 kéo rơ moóc có khối lượng thiết kế trên 750 kg."),
    ("CE", "Xe thuộc hạng C kéo rơ moóc có khối lượng thiết kế trên 750 kg."),
    ("DE", "Xe thuộc hạng D kéo rơ moóc có khối lượng thiết kế trên 750 kg."),
    ("D1E", "Xe thuộc hạng D1 kéo rơ moóc có khối lượng thiết kế trên 750 kg."),
    ("D2E", "Xe thuộc hạng D2 kéo rơ moóc có khối lượng thiết kế trên 750 kg."),
)


def add_legal_license_classes(apps, schema_editor):
    LicenseClass = apps.get_model("question_bank", "LicenseClass")
    database = schema_editor.connection.alias
    for code, description in LICENSE_CLASSES:
        LicenseClass.objects.using(database).update_or_create(
            code=code,
            defaults={
                "name": f"Hạng {code}",
                "description": description,
                "legal_source": SOURCE,
                "is_active": True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("question_bank", "0002_alter_questionreport_reason"),
    ]

    operations = [
        migrations.AddField(
            model_name="licenseclass",
            name="legal_source",
            field=models.URLField(blank=True),
        ),
        migrations.RunPython(add_legal_license_classes, migrations.RunPython.noop),
    ]
