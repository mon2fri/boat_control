from __future__ import annotations

import logging

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.files.preset_services import (
    get_preset_source,
    list_preset_sources,
    list_source_files,
    resolve_file_id,
)
from apps.files.services import inspect_headers, store_file
from apps.files.sessions import create_session

logger = logging.getLogger(__name__)


class PresetSourcesView(APIView):  # type: ignore[misc]
    def get(self, request: Request) -> Response:
        presets = list_preset_sources()
        return Response(presets)


class PresetSourceFilesView(APIView):  # type: ignore[misc]
    def get(self, request: Request, source_id: str) -> Response:
        files = list_source_files(source_id)
        return Response(files)


class PresetLoadView(APIView):  # type: ignore[misc]
    def post(self, request: Request) -> Response:
        preset_id = request.data.get("preset_id")
        file_a_id = request.data.get("file_a_id")
        file_b_id = request.data.get("file_b_id")

        if preset_id:
            preset = get_preset_source(preset_id)
            if preset is None:
                return Response(
                    {"error": f"Preset '{preset_id}' not found."}, status=404
                )

            if not preset.file_a.exists():
                return Response(
                    {"error": f"Source file not found: {preset.file_a.name}"},
                    status=404,
                )

            path_a = store_file(preset.file_a)

            if preset.file_b is not None:
                if not preset.file_b.exists():
                    return Response(
                        {
                            "error": (
                                f"Source file not found: {preset.file_b.name}"
                            )
                        },
                        status=404,
                    )
                path_b = store_file(preset.file_b)
            else:
                path_b = path_a

            file_a_name = preset.file_a.name
            file_b_name = (
                preset.file_b.name if preset.file_b else preset.file_a.name
            )
        elif file_a_id:
            file_a_path = resolve_file_id(file_a_id)
            if file_a_path is None:
                return Response(
                    {"error": "File not found."}, status=404
                )
            if not file_a_path.exists():
                return Response(
                    {"error": "Source file not found."}, status=404
                )

            path_a = store_file(file_a_path)
            file_a_name = file_a_path.name

            if file_b_id:
                file_b_path = resolve_file_id(file_b_id)
                if file_b_path is None:
                    return Response(
                        {"error": "File not found."}, status=404
                    )
                if not file_b_path.exists():
                    return Response(
                        {"error": "Source file not found."}, status=404
                    )
                path_b = store_file(file_b_path)
                file_b_name = file_b_path.name
            else:
                path_b = path_a
                file_b_name = file_a_path.name
        else:
            return Response(
                {
                    "error": (
                        "Either preset_id or file_a_id is required."
                    )
                },
                status=400,
            )

        try:
            result = inspect_headers(
                path_a, file_a_name, path_b, file_b_name
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        session = create_session(
            file_a_path=path_a,
            file_b_path=path_b,
            file_a_name=file_a_name,
            file_b_name=file_b_name,
            common_columns=result.common_columns,
            columns_a=result.columns_a,
            columns_b=result.columns_b,
            only_in_a=result.only_in_a,
            only_in_b=result.only_in_b,
        )

        return Response({
            "session_id": session.session_id,
            "file_a_name": file_a_name,
            "file_b_name": file_b_name,
            "inspection": {
                "columns_a": result.columns_a,
                "columns_b": result.columns_b,
                "common_columns": result.common_columns,
                "only_in_a": result.only_in_a,
                "only_in_b": result.only_in_b,
            },
        })
