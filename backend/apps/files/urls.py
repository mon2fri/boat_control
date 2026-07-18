from django.urls import path

from apps.files.column_values import ColumnValuesView
from apps.files.filter_views import (
    FilterPreparationView,
    FilterValidationView,
    TargetColumnsInputView,
    TargetColumnsView,
)
from apps.files.preset_views import PresetLoadView, PresetSourceFilesView, PresetSourcesView
from apps.files.views import FileUploadView, HeaderInspectionView

app_name = "files"

urlpatterns = [
    path("upload/", FileUploadView.as_view(), name="file-upload"),
    path("inspect/", HeaderInspectionView.as_view(), name="header-inspection"),
    path("filters/prepare/", FilterPreparationView.as_view(), name="filter-prepare"),
    path("filters/validate/", FilterValidationView.as_view(), name="filter-validate"),
    path("targets/validate/", TargetColumnsView.as_view(), name="target-validate"),
    path("targets/input/", TargetColumnsInputView.as_view(), name="target-input"),
    path("<str:session_id>/values/", ColumnValuesView.as_view(), name="column-values"),
    path("presets/", PresetSourcesView.as_view(), name="preset-sources"),
    path("presets/load/", PresetLoadView.as_view(), name="preset-load"),
    path(
        "presets/<str:source_id>/files/",
        PresetSourceFilesView.as_view(),
        name="preset-source-files",
    ),
]
