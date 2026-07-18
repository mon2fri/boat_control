from rest_framework.request import Request  # type: ignore[import-untyped]
from rest_framework.response import Response  # type: ignore[import-untyped]
from rest_framework.views import APIView  # type: ignore[import-untyped]


class HealthView(APIView):  # type: ignore[misc]
    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})
