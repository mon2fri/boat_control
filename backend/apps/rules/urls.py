from django.urls import path

from apps.configs.views import RuleConfigImportView, RulesConfigDetailView, RulesConfigListView
from apps.rules.views import (
    EnablementView,
    ReorderRulesView,
    ReplaceRulesView,
    RuleDetailView,
    RulesListView,
)

app_name = "rules"

urlpatterns = [
    path("", RulesListView.as_view(), name="rules-list"),
    path("replace/", ReplaceRulesView.as_view(), name="rules-replace"),
    path("reorder/", ReorderRulesView.as_view(), name="rules-reorder"),
    path("enablement/", EnablementView.as_view(), name="rules-enablement"),
    path("configs/", RulesConfigListView.as_view(), name="rules-config-list"),
    path("configs/import/", RuleConfigImportView.as_view(), name="rules-config-import"),
    path("configs/<str:name>/", RulesConfigDetailView.as_view(), name="rules-config-detail"),
    path("<str:rule_id>/", RuleDetailView.as_view(), name="rule-detail"),
]
