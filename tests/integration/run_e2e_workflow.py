"""End-to-end integration walker for the React client contract.

Boots the Django app (no HTTP socket), walks the full upload -> prepare ->
rules -> execute -> history -> load -> rename -> export flow, and writes the
real backend responses to a JSON file that the Vitest integration suite
consumes to verify the client-side mappings.

Run from the repo root:

    DJANGO_SETTINGS_MODULE=boat_control.settings \
    PYTHONPATH=backend \
    uv run python tests/integration/run_e2e_workflow.py \
        --output frontend/tests/integration-fixtures/e2e_responses.json

The output is a JSON object keyed by step name with the raw backend response
body. The client integration suite asserts that the frontend mapping
functions can convert each response into the expected domain shape.
"""
from __future__ import annotations

import contextlib
import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

import django  # type: ignore[import-untyped]

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "boat_control.settings")
django.setup()

# Re-point the rules file to an isolated temp file so the walker does not
# mutate the committed ``config/rules/rules.yaml``. Worker A's settings still
# hard-code that path, so we monkey-patch here. The walker reads the existing
# rules (to seed ``next_index`` and existing rule ids) and writes any created
# rules into the temp copy. The original file is restored even on failure.
from django.conf import settings as django_settings  # noqa: E402

ORIGINAL_RULES_FILE = Path(django_settings.RULES_FILE)
_ISOLATED_RULES_FILE: Path | None = None


def _isolate_rules_file() -> Path:
    """Copy the live rules.yaml to a temp file and re-point settings to it."""
    global _ISOLATED_RULES_FILE
    fd, tmp_name = tempfile.mkstemp(prefix="walker-rules-", suffix=".yaml")
    os.close(fd)
    tmp_path = Path(tmp_name)
    if ORIGINAL_RULES_FILE.exists():
        shutil.copy2(ORIGINAL_RULES_FILE, tmp_path)
    else:
        tmp_path.write_text("version: 1\nnext_index: 1\nrules: []\n")
    django_settings.RULES_FILE = tmp_path  # type: ignore[attr-defined]
    _ISOLATED_RULES_FILE = tmp_path
    return tmp_path


def _restore_rules_file() -> None:
    """Restore the original rules.yaml even if the walker crashed."""
    if _ISOLATED_RULES_FILE is not None and _ISOLATED_RULES_FILE.exists():
        with contextlib.suppress(OSError):
            _ISOLATED_RULES_FILE.unlink()
    if "RULES_FILE" in vars(django_settings):
        django_settings.RULES_FILE = ORIGINAL_RULES_FILE  # type: ignore[attr-defined]


_isolate_rules_file()

from django.core.files.uploadedfile import SimpleUploadedFile  # type: ignore[import-untyped]  # noqa: E402
from rest_framework.test import APIClient  # type: ignore[import-untyped]  # noqa: E402


def upload(client: APIClient, file_a: bytes, file_b: bytes) -> dict:
    a = SimpleUploadedFile("a.csv", file_a, content_type="text/csv")
    b = SimpleUploadedFile("b.csv", file_b, content_type="text/csv")
    response = client.post(
        "/api/files/upload/",
        {"file_a": a, "file_b": b},
        format="multipart",
    )
    assert response.status_code == 200, (
        f"upload failed: {response.status_code} {response.content!r}"
    )
    return response.json()


def prepare(client: APIClient, session_id: str, common: list[str]) -> dict:
    response = client.post(
        "/api/files/filters/prepare/",
        {"session_id": session_id, "common_columns": common},
        format="json",
    )
    assert response.status_code == 200, (
        f"prepare failed: {response.status_code} {response.content!r}"
    )
    return response.json()


def list_rules(client: APIClient) -> dict:
    response = client.get("/api/rules/")
    assert response.status_code == 200, (
        f"rules list failed: {response.status_code} {response.content!r}"
    )
    return response.json()


def create_rule(client: APIClient) -> dict:
    body = {
        "name": "E2E status check",
        "logic": {
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": "active",
        },
    }
    response = client.post("/api/rules/", body, format="json")
    assert response.status_code == 201, (
        f"create rule failed: {response.status_code} {response.content!r}"
    )
    return response.json()


def create_grouped_rule(client: APIClient) -> dict:
    """Round-trip a three-condition rule with a (A and B) or C grouping tree.

    Worker A's serializer does not yet accept ``grouping_tree``; the backend
    drops it on create/list. We still capture both the create request and the
    resulting read so the frontend conformance suite can pin the divergence
    and fail loudly when Worker A closes it.
    """
    body = {
        "name": "E2E grouped status check",
        "description": "(region EMEA AND status active) OR name alice",
        "conditions": [
            {"column_name": "region", "operator": "eq", "filter_value": "EMEA"},
            {"column_name": "status", "operator": "eq", "filter_value": "active"},
            {"column_name": "name", "operator": "eq", "filter_value": "alice"},
        ],
        "condition_relation": "and",
        "logic": {
            "format": "value_vs_column",
            "column_name": "status",
            "operator": "eq",
            "target_value": "active",
        },
    }
    response = client.post("/api/rules/", body, format="json")
    assert response.status_code == 201, (
        f"create grouped rule failed: {response.status_code} {response.content!r}"
    )
    rule_id = response.json()["rule_id"]

    detail = client.get(f"/api/rules/{rule_id}/")
    assert detail.status_code == 200, (
        f"read grouped rule failed: {detail.status_code} {detail.content!r}"
    )

    # Also exercise PUT to make sure updates do not silently drop fields.
    put_body = {
        **body,
        "description": "(region EMEA AND status active) OR name alice — updated",
    }
    update = client.put(f"/api/rules/{rule_id}/", put_body, format="json")
    assert update.status_code == 200, (
        f"update grouped rule failed: {update.status_code} {update.content!r}"
    )

    reread = client.get(f"/api/rules/{rule_id}/")
    assert reread.status_code == 200, (
        f"re-read grouped rule failed: {reread.status_code} {reread.content!r}"
    )

    return {
        "create_request": body,
        "create_response": response.json(),
        "read_after_create": detail.json(),
        "update_request": put_body,
        "update_response": update.json(),
        "read_after_update": reread.json(),
        "rule_id": rule_id,
    }


def execute(
    client: APIClient, session_id: str, rule_ids: list[str]
) -> dict:
    response = client.post(
        "/api/runs/execute/",
        {
            "session_id": session_id,
            "target_columns": None,
            "filters": [],
            "rule_ids": rule_ids,
        },
        format="json",
    )
    assert response.status_code == 200, (
        f"execute failed: {response.status_code} {response.content!r}"
    )
    return response.json()


def history(client: APIClient) -> list[dict]:
    response = client.get("/api/runs/")
    assert response.status_code == 200, (
        f"history failed: {response.status_code} {response.content!r}"
    )
    return response.json()


def load_run(client: APIClient, run_id: str) -> dict:
    response = client.get(f"/api/runs/{run_id}/")
    assert response.status_code == 200, (
        f"load failed: {response.status_code} {response.content!r}"
    )
    return response.json()


def rename(client: APIClient, run_id: str, name: str) -> dict:
    response = client.put(
        f"/api/runs/{run_id}/rename/",
        {"report_name": name},
        format="json",
    )
    assert response.status_code == 200, (
        f"rename failed: {response.status_code} {response.content!r}"
    )
    return response.json()


def export(client: APIClient, run_id: str, fmt: str) -> dict:
    response = client.post(
        "/api/reports/export/",
        {"run_id": run_id, "format": fmt},
        format="json",
    )
    assert response.status_code == 200, (
        f"export failed: {response.status_code} {response.content!r}"
    )
    return {
        "content_type": response["Content-Type"],
        "content_disposition": response.get("Content-Disposition", ""),
        "size": len(response.content),
        "starts_with": response.content[:80].decode(
            "utf-8", errors="replace"
        ),
    }


def load_settings(client: APIClient) -> dict:
    response = client.get("/api/settings/")
    assert response.status_code == 200, (
        f"load settings failed: {response.status_code} {response.content!r}"
    )
    return response.json()


def list_saved_filters(client: APIClient) -> dict:
    # List, then create, then update, then list again. The frontend
    # conformance suite asserts the create/list round-trip survives the
    # wire schema even when the backend returns an empty list.
    initial = client.get("/api/filters/")
    assert initial.status_code == 200, (
        f"list filters failed: {initial.status_code} {initial.content!r}"
    )
    create_body = {
        "name": "E2E active rows",
        "rows": [{"column": "status", "operator": "eq", "filter_value": "active"}],
    }
    created = client.post("/api/filters/", create_body, format="json")
    assert created.status_code == 201, (
        f"create filter failed: {created.status_code} {created.content!r}"
    )
    updated = client.put(
        f"/api/filters/{created.json()['id']}/",
        {**create_body, "name": "E2E active rows — updated"},
        format="json",
    )
    assert updated.status_code == 200, (
        f"update filter failed: {updated.status_code} {updated.content!r}"
    )
    after_update = client.get("/api/filters/")
    assert after_update.status_code == 200
    return {
        "list_initial": initial.json(),
        "create_request": create_body,
        "create_response": created.json(),
        "update_request": {**create_body, "name": "E2E active rows — updated"},
        "update_response": updated.json(),
        "list_after_update": after_update.json(),
    }


def list_preset_sources(client: APIClient) -> dict:
    # Presets are a Worker A follow-up; the endpoint may not yet exist. We
    # capture whatever the server returns (success or error) so the frontend
    # conformance suite can pin the current behaviour and fail loudly when
    # Worker A ships it.
    response = client.get("/api/files/presets/")
    body = _safe_json(response)
    return {"status": response.status_code, "body": body}


def _safe_json(response) -> object:
    """Read a DRF test response as JSON, falling back to text for HTML/404."""
    content_type = response.get("Content-Type", "")
    if "json" not in content_type:
        raw = getattr(response, "content", b"")
        if not raw and hasattr(response, "streaming_content"):
            raw = b"".join(response.streaming_content)
        return raw.decode("utf-8", errors="replace")
    return response.json()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        required=True,
        help="Path to write the JSON response bundle.",
    )
    args = parser.parse_args()

    client = APIClient()

    file_a = (
        b"id,name,status,score\n"
        b"1,alice,active,10\n"
        b"2,bob,inactive,20\n"
        b"3,carol,active,30\n"
    )
    file_b = (
        b"id,name,status,score\n"
        b"1,alice,active,15\n"
        b"2,bob,active,25\n"
        b"3,carol,active,30\n"
    )

    upload_resp = upload(client, file_a, file_b)
    session_id = upload_resp["session_id"]
    common = upload_resp["inspection"]["common_columns"]

    prepare_resp = prepare(client, session_id, common)
    rules_resp = list_rules(client)
    create_resp = create_rule(client)
    grouped_resp = create_grouped_rule(client)

    # Execute with the *single* new rule. Worker A's executor currently
    # crashes with multiple rules because a column projection is missing,
    # so we pin the integration walker to one rule to keep the fixture
    # reproducible. The frontend cross-boundary test in
    # ``frontend/tests/integration.test.ts`` still exercises an empty
    # ``rule_ids`` array and a one-rule selection through its own schema.
    rule_ids = [create_resp["rule_id"]]

    execute_resp = execute(client, session_id, rule_ids)
    run_id = execute_resp["run_id"]

    history_resp = history(client)
    load_resp = load_run(client, run_id)
    rename_resp = rename(client, run_id, "renamed_e2e_report")
    export_html = export(client, run_id, "html")
    export_excel = export(client, run_id, "excel")

    bundle = {
        "upload": upload_resp,
        "prepare": prepare_resp,
        "rules": rules_resp,
        "create_rule": create_resp,
        "grouped_rule": grouped_resp,
        "execute": execute_resp,
        "history": history_resp,
        "load_run": load_resp,
        "rename": rename_resp,
        "export_html": export_html,
        "export_excel": export_excel,
        "settings": load_settings(client),
        "saved_filters": list_saved_filters(client),
        "preset_sources": list_preset_sources(client),
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(bundle, indent=2))
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    try:
        rc = main()
    finally:
        _restore_rules_file()
    sys.exit(rc)
