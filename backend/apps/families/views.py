from __future__ import annotations

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.families.serializers import (
    FamilyCreateSerializer,
    FamilySerializer,
    FamilyUpdateSerializer,
)
from apps.families.services import (
    FamilyConflictError,
    FamilyNameError,
    FamilyNotFoundError,
    create_family,
    delete_family,
    get_family,
    list_families,
    update_family,
)


class FamilyListView(APIView):  # type: ignore[misc]

    def get(self, request: Request) -> Response:
        families = list_families()
        serializer = FamilySerializer(families, many=True)
        return Response(serializer.data)

    def post(self, request: Request) -> Response:
        serializer = FamilyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            family = create_family(serializer.validated_data)
        except FamilyNameError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(family, status=201)


class FamilyDetailView(APIView):  # type: ignore[misc]

    def get(self, request: Request, name: str) -> Response:
        family = get_family(name)
        if family is None:
            return Response(
                {"error": f"Family '{name}' not found."}, status=404
            )
        return Response(family)

    def put(self, request: Request, name: str) -> Response:
        serializer = FamilyUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            family = update_family(
                name,
                serializer.validated_data,
                serializer.validated_data["version"],
            )
        except FamilyNotFoundError as exc:
            return Response({"error": str(exc)}, status=404)
        except FamilyConflictError as exc:
            return Response({"error": str(exc)}, status=409)
        except FamilyNameError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response(family)

    def delete(self, request: Request, name: str) -> Response:
        try:
            delete_family(name)
        except FamilyNotFoundError as exc:
            return Response({"error": str(exc)}, status=404)
        return Response(status=204)
