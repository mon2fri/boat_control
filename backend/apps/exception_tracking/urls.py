from django.urls import path

from apps.exception_tracking.views import (
    AvailableDatesView,
    CommentaryTemplateExportView,
    CommentaryTemplateImportView,
    ExceptionListView,
    RecertifyView,
)

app_name = "exception_tracking"

urlpatterns = [
    path("dates/", AvailableDatesView.as_view(), name="available-dates"),
    path("recertify/", RecertifyView.as_view(), name="recertify"),
    path("export/", CommentaryTemplateExportView.as_view(), name="template-export"),
    path("import/", CommentaryTemplateImportView.as_view(), name="template-import"),
    path("", ExceptionListView.as_view(), name="exception-list"),
]
