"""End-to-end integration walker for the React client contract.

Boots the Django app (no HTTP socket), walks the full upload → prepare →
rules → execute → history → load → rename → export flow, and writes the
real backend responses to a JSON file that the Vitest integration suite
consumes to verify the client-side mappings.

Run from the repo root:

    DJANGO_SETTINGS_MODULE=boat_control.settings \\
    PYTHONPATH=backend \\
    uv run python tests/integration/run_e2e_workflow.py \\
        --output frontend/tests/integration-fixtures/e2e_responses.json

The output is a JSON object keyed by step name with the raw backend response
body. The client integration suite asserts that the frontend mapping
functions can convert each response into the expected domain shape.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

import django  # type: ignore[import-untyped]

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "boat_control.settings")
django.setup()

from django.core.files.uploadedfile import SimpleUploadedFile  # type: ignore[import-untyped]
from rest_framework.test import APIClient  # type: ignore[import-untyped]


def upload(client: APIClient, file_a: bytes, file_b: bytes) -> dict:
    a = SimpleUploadedFile("a.csv", file_a, content_type="text/csv")
    b = SimpleUploadedFile("b.csv", file_b, content_type="text/csv")
    response = client.post(
        "/api/files/upload/",
        {"file_a": a, "file_b": b},
        format="multipart",
    )
    assert response.status_code == 200, f"upload failed: {response.status_code} {response.content!r}"
    return response.json()


def prepare(client: APIClient, session_id: str, common: list[str]) -> dict:
    response = client.post(
        "/api/files/filters/prepare/",
        {"session_id": session_id, "common_columns": common},
        format="json",
    )
    assert response.status_code == 200, f"prepare failed: {response.status_code} {response.content!r}"
    return response.json()


def list_rules(client: APIClient) -> dict:
    response = client.get("/api/rules/")
    assert response.status_code == 200, f"rules list failed: {response.status_code} {response.content!r}"
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
    assert response.status_code == 201, f"create rule failed: {response.status_code} {response.content!r}"
    return response.json()


def execute(client: APIClient, session_id: str, rule_ids: list[str]) -> dict:
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
    assert response.status_code == 200, f"execute failed: {response.status_code} {response.content!r}"
    return response.json()


def history(client: APIClient) -> list[dict]:
    response = client.get("/api/runs/")
    assert response.status_code == 200, f"history failed: {response.status_code} {response.content!r}"
    return response.json()


def load_run(client: APIClient, run_id: str) -> dict:
    response = client.get(f"/api/runs/{run_id}/")
    assert response.status_code == 200, f"load failed: {response.status_code} {response.content!r}"
    return response.json()


def rename(client: APIClient, run_id: str, name: str) -> dict:
    response = client.put(
        f"/api/runs/{run_id}/rename/",
        {"report_name": name},
        format="json",
    )
    assert response.status_code == 200, f"rename failed: {response.status_code} {response.content!r}"
    return response.json()


def export(client: APIClient, run_id: str, fmt: str) -> dict:
    response = client.post(
        "/api/reports/export/",
        {"run_id": run_id, "format": fmt},
        format="json",
    )
    assert response.status_code == 200, f"export failed: {response.status_code} {response.content!r}"
    # The export returns a file, not JSON. Record its size + content-type.
    return {
        "content_type": response["Content-Type"],
        "content_disposition": response.get("Content-Disposition", ""),
        "size": len(response.content),
        "starts_with": response.content[:80].decode("utf-8", errors="replace"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, help="Path to write the JSON response bundle.")
    args = parser.parse_args()

    client = APIClient()

    file_a = b"id,name,status,score\n1,alice,active,10\n2,bob,inactive,20\n3,carol,active,30\n"
    file_b = b"id,name,status,score\n1,alice,active,15\n2,bob,active,25\n3,carol,active,30\n"

    upload_resp = upload(client, file_a, file_b)
    session_id = upload_resp["session_id"]
    common = upload_resp["inspection"]["common_columns"]

    prepare_resp = prepare(client, session_id, common)
    rules_resp = list_rules(client)
    create_resp = create_rule(client)

    rule_ids = [r["rule_id"] for r in rules_resp.get("rules", [])]
    if create_resp.get("rule_id") and create_resp["rule_id"] not in rule_ids:
        rule_ids.append(create_resp["rule_id"])

    execute_resp = execute(client, session_id, rule_ids)
    run_id = execute_resp["run_id"]

    history_resp = history(client)
    load_resp = load_run(client, run_id)
    rename_resp = rename(client, run_id, "renamed_e2e_report")
    export_html = export(client, run_id, "html")
    export_csv = export(client, run_id, "csv")

    bundle = {
        "upload": upload_resp,
        "prepare": prepare_resp,
        "rules": rules_resp,
        "create_rule": create_resp,
        "execute": execute_resp,
        "history": history_resp,
        "load_run": load_resp,
        "rename": rename_resp,
        "export_html": export_html,
        "export_csv": export_csv,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(bundle, indent=2))
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
