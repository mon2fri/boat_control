from django.urls import path

from apps.configs.views import SettingsConfigDetailView, SettingsConfigListView
from apps.settings.views import SettingsView

urlpatterns = [
    path("", SettingsView.as_view(), name="settings"),
    path("configs/", SettingsConfigListView.as_view(), name="settings-config-list"),
    path("configs/<str:name>/", SettingsConfigDetailView.as_view(), name="settings-config-detail"),
]
