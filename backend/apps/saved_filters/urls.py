from django.urls import path

from apps.configs.views import FiltersConfigDetailView, FiltersConfigListView
from apps.saved_filters.views import SavedFilterDetailView, SavedFilterListView

urlpatterns = [
    path("", SavedFilterListView.as_view(), name="saved-filter-list"),
    path("configs/", FiltersConfigListView.as_view(), name="filters-config-list"),
    path("configs/<str:name>/", FiltersConfigDetailView.as_view(), name="filters-config-detail"),
    path("<str:filter_id>/", SavedFilterDetailView.as_view(), name="saved-filter-detail"),
]
