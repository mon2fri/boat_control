from django.urls import path

from apps.health.views import HealthView

urlpatterns = [
    path("", HealthView.as_view(), name="health"),
]
