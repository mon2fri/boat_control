from django.urls import include, path

urlpatterns = [
    path("api/health/", include("apps.health.urls")),
    path("api/files/", include("apps.files.urls")),
    path("api/rules/", include("apps.rules.urls")),
    path("api/runs/", include("apps.runs.urls")),
    path("api/reports/", include("apps.reports.urls")),
]
