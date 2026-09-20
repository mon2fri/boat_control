import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="ValidationRuleIdentity",
            fields=[
                ("identifier", models.CharField(max_length=25, primary_key=True, serialize=False)),
                ("algorithm_version", models.PositiveSmallIntegerField(default=1)),
                ("full_digest", models.CharField(max_length=64, unique=True)),
                ("canonical_payload", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "rules_validation_rule_identity"},
        ),
        migrations.CreateModel(
            name="RuleStoreState",
            fields=[
                (
                    "singleton_key",
                    models.PositiveSmallIntegerField(
                        default=1, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("initialized", models.BooleanField(default=False)),
                ("next_index", models.PositiveBigIntegerField(default=1)),
                ("revision", models.PositiveBigIntegerField(default=0)),
            ],
            options={"db_table": "rules_rule_store_state"},
        ),
        migrations.CreateModel(
            name="StoredValidationRule",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("rule_id", models.CharField(max_length=32, unique=True)),
                ("catalog_position", models.PositiveBigIntegerField(unique=True)),
                ("authored_payload", models.JSONField()),
                ("enabled", models.BooleanField(db_index=True, default=False)),
                ("enabled_position", models.PositiveBigIntegerField(blank=True, null=True)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "identity",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="catalog_rule",
                        to="rules.validationruleidentity",
                    ),
                ),
            ],
            options={"db_table": "rules_stored_validation_rule"},
        ),
        migrations.AddConstraint(
            model_name="storedvalidationrule",
            constraint=models.UniqueConstraint(
                condition=Q(enabled=True, archived_at__isnull=True),
                fields=("enabled_position",),
                name="rules_enabled_position_unique",
            ),
        ),
        migrations.AddIndex(
            model_name="storedvalidationrule",
            index=models.Index(
                fields=["archived_at", "catalog_position"], name="rules_store_archived_pos_idx"
            ),
        ),
    ]
