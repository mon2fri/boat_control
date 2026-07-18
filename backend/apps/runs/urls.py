from django.urls import path

from apps.runs.persistence_views import RunDetailView, RunRenameView, RunsListView
from apps.runs.views import ExecuteComparisonView

app_name = "runs"

urlpatterns = [
    path("execute/", ExecuteComparisonView.as_view(), name="execute-comparison"),
    path("", RunsListView.as_view(), name="runs-list"),
    path("<str:run_id>/", RunDetailView.as_view(), name="run-detail"),
    path("<str:run_id>/rename/", RunRenameView.as_view(), name="run-rename"),
]
