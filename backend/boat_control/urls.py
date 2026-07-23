from apps.configs.views import (
    RowsAndColumnsConfigDetailView,
    RowsAndColumnsConfigListView,
)
from django.conf import settings
from django.http import FileResponse, HttpResponseNotFound
from django.urls import include, path

_family_patterns = ([
    path("", include("apps.families.urls")),
], "families")

_api_patterns = [
    path("api/health/", include("apps.health.urls")),
    path("api/files/", include("apps.files.urls")),
    path("api/rules/", include("apps.rules.urls")),
    path("api/runs/", include("apps.runs.urls")),
    path("api/reports/", include("apps.reports.urls")),
    path("api/settings/", include("apps.settings.urls")),
    path("api/filters/", include("apps.saved_filters.urls")),
    path("api/families/", include(_family_patterns)),
    path(
        "api/rows-and-columns/configs/",
        RowsAndColumnsConfigListView.as_view(),
        name="rows-and-columns-config-list",
    ),
    path(
        "api/rows-and-columns/configs/<str:name>/",
        RowsAndColumnsConfigDetailView.as_view(),
        name="rows-and-columns-config-detail",
    ),
]


def _serve_spa(request, path=""):  # type: ignore[no-untyped-def]
    dist = settings.FRONTEND_DIST
    if not dist.exists():
        return HttpResponseNotFound("Frontend build not found")
    target = dist / path if path else dist / "index.html"
    if target.is_file():
        return FileResponse(target.open("rb"))
    return FileResponse((dist / "index.html").open("rb"))


urlpatterns = _api_patterns + [
    path("<path:path>", _serve_spa),
    path("", _serve_spa),
]
