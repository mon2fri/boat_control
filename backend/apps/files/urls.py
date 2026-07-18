from django.urls import path

from apps.files.filter_views import (
    FilterPreparationView,
    FilterValidationView,
    TargetColumnsInputView,
    TargetColumnsView,
)
from apps.files.views import FileUploadView, HeaderInspectionView

app_name = "files"

urlpatterns = [
    path("upload/", FileUploadView.as_view(), name="file-upload"),
    path("inspect/", HeaderInspectionView.as_view(), name="header-inspection"),
    path("filters/prepare/", FilterPreparationView.as_view(), name="filter-prepare"),
    path("filters/validate/", FilterValidationView.as_view(), name="filter-validate"),
    path("targets/validate/", TargetColumnsView.as_view(), name="target-validate"),
    path("targets/input/", TargetColumnsInputView.as_view(), name="target-input"),
]
