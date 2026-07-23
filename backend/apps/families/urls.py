from django.urls import path

from apps.families.views import FamilyDetailView, FamilyListView

urlpatterns = [
    path("", FamilyListView.as_view(), name="family-list"),
    path("<str:name>/", FamilyDetailView.as_view(), name="family-detail"),
]
