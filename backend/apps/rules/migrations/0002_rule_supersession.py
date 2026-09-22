from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("rules", "0001_rule_catalog")]

    operations = [
        migrations.AddField(
            model_name="storedvalidationrule",
            name="superseded_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="supersedes",
                to="rules.storedvalidationrule",
            ),
        ),
    ]
