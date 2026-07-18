from django.urls import path

from apps.rules.views import RemoteRulesView, RuleDetailView, RulesListView

app_name = "rules"

urlpatterns = [
    path("", RulesListView.as_view(), name="rules-list"),
    path("<str:rule_id>/", RuleDetailView.as_view(), name="rule-detail"),
    path("remote/", RemoteRulesView.as_view(), name="rules-remote"),
]
