from django.urls import path

from apps.reports.views import ExportView

app_name = "reports"

urlpatterns = [
    path("export/", ExportView.as_view(), name="export"),
]
