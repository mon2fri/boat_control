from django.urls import path

from apps.configs.views import RulesConfigDetailView, RulesConfigListView
from apps.rules.views import RuleDetailView, RulesListView

app_name = "rules"

urlpatterns = [
    path("", RulesListView.as_view(), name="rules-list"),
    path("configs/", RulesConfigListView.as_view(), name="rules-config-list"),
    path("configs/<str:name>/", RulesConfigDetailView.as_view(), name="rules-config-detail"),
    path("<str:rule_id>/", RuleDetailView.as_view(), name="rule-detail"),
]
