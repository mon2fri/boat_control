"""Seed an isolated Round-2 preview: pending carry, upload matrix, recurrence.

Reproduces the Round-2 scenarios through the real services (no direct writes
into private tables, no live data touched):

1. October 31: rule R001 v1 runs; books Mia/Harry violate it. Commentary is
   uploaded for Mia (simulating the XLSX import).
2. Rule R001 is revised (modify current); no run occurs on the edit date.
3. November 1: R001 v2 runs. Mia carries forward as pending recertification
   (exact reason + provenance); Harry stays Not Commented (uncommented
   cross-revision recurrence, no recertification).
4. November 2: R001 v2 runs unchanged. Mia's pending mark propagates with
   the text; Harry remains Not Commented.

The November-2 Mia row is left PENDING so the UI tester can exercise Keep
Current / Updated / Blank, invalid values, and Recertify selected. Harry
covers the ordinary/never-commented paths.

Usage (from the integration worktree)::

    .venv/bin/python scripts/seed_rule_evolution_round2_preview.py /tmp/boat-control-rule-evolution-preview-round2-20261112

Refuses to overwrite an existing preview home. Asserts every step.
"""

from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path
from typing import NoReturn

OCT_31 = date(2026, 10, 31)
NOV_1 = date(2026, 11, 1)
NOV_2 = date(2026, 11, 2)
KEY_COLUMNS = ["id", "name"]
COMPARISON_COLUMNS = ["id", "name", "region", "status", "score"]
TARGET_COLUMNS = ["status"]
REASON = "Recertification due to rule change"

RULE_V1 = {
    "name": "North status must be active",
    "description": "Round-2 seed rule v1.",
    "conditions": [],
    "logic": {
        "format": "value_vs_column",
        "column_name": "status",
        "operator": "eq",
        "target_value": "active",
    },
}
RULE_V2 = {
    "name": "North status must be active",
    "description": "Round-2 seed rule v2: corporate scope.",
    "conditions": [{"column_name": "region", "operator": "eq", "filter_value": "North"}],
    "condition_relation": "and",
    "logic": {
        "format": "value_vs_column",
        "column_name": "status",
        "operator": "eq",
        "target_value": "active",
    },
}

CSV_A = """id,name,region,status,score
13,Mia,North,active,91
17,Quinn,North,active,94
34,Harry,North,active,92
35,Iris,North,active,81
"""
CSV_B = """id,name,region,status,score
13,Mia,North,inactive,91
17,Quinn,North,inactive,94
34,Harry,North,inactive,92
35,Iris,North,active,81
"""


def _fail(message: str) -> NoReturn:
    raise RuntimeError(f"[seed-round2] {message}")


def main() -> None:
    if len(sys.argv) != 2:
        _fail("usage: seed_rule_evolution_round2_preview.py <preview-home>")
    home = Path(sys.argv[1]).expanduser().resolve()
    if home.exists():
        _fail(f"preview home already exists, refusing to overwrite: {home}")

    data_dir = home / "data"
    uploads_dir = data_dir / "uploads"
    config_rules_dir = home / "config" / "rules"
    for path in (
        data_dir,
        uploads_dir,
        data_dir / "results",
        data_dir / "prepare_cache",
        config_rules_dir,
        home / "config" / "rows_and_columns",
        home / "config" / "filters",
        home / "config" / "families",
    ):
        path.mkdir(parents=True, exist_ok=False)

    (home / ".config").write_text(
        "application_name: Boat Control rule-evolution Round-2 preview\n"
        "default_remote_path: ''\n"
        "rule_config_path: config/rules\n"
        "rows_and_columns_config_path: config/rows_and_columns\n"
        "filter_config_path: config/filters\n"
        "family_config_path: config/families\n"
        "full_set_confirmation_rows: 2000\n"
        "run_history_path: data/results\n"
        "exception_tracking_path: data/exception_tracking.db\n"
        "skip_migrations: false\n",
        encoding="utf-8",
    )
    file_a = uploads_dir / "round2_books_a.csv"
    file_b = uploads_dir / "round2_books_b.csv"
    file_a.write_text(CSV_A, encoding="utf-8")
    file_b.write_text(CSV_B, encoding="utf-8")

    os.environ["GROUPED_VALIDATION_HOME"] = str(home)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "boat_control.grouped_validation_settings")
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "backend"))
    import django  # noqa: E402

    django.setup()

    import yaml  # noqa: E402
    from django.conf import settings  # noqa: E402
    from django.core.management import call_command  # noqa: E402
    from rest_framework.test import APIClient  # noqa: E402

    from apps.exception_tracking.repository import update_commentaries  # noqa: E402
    from apps.files.sessions import create_session  # noqa: E402

    config_rules_dir.joinpath("rules.yaml").write_text(
        yaml.safe_dump(
            {"version": 1, "next_index": 2, "rules": [{"rule_id": "R001", **RULE_V1}]},
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    call_command("migrate", verbosity=0, interactive=False)
    call_command("migrate_rules_to_db", verbosity=0)
    tracking_db = Path(settings.EXCEPTION_TRACKING_DB)
    client = APIClient()

    def execute(as_of: date, rule_ids: list[str]) -> dict:
        session = create_session(
            file_a_path=file_a,
            file_b_path=file_b,
            file_a_name=file_a.name,
            file_b_name=file_b.name,
            common_columns=list(COMPARISON_COLUMNS),
            columns_a=list(COMPARISON_COLUMNS),
            columns_b=list(COMPARISON_COLUMNS),
            only_in_a=[],
            only_in_b=[],
            as_of_date=as_of.isoformat(),
        )
        response = client.post(
            "/api/runs/execute/",
            {
                "session_id": session.session_id,
                "comparison_columns": list(COMPARISON_COLUMNS),
                "target_columns": list(TARGET_COLUMNS),
                "key_columns": list(KEY_COLUMNS),
                "rule_ids": list(rule_ids),
                "as_of_date": as_of.isoformat(),
            },
            format="json",
        )
        assert response.status_code == 200, f"execute {as_of}: {response.content!r}"
        return response.json()

    def rows(as_of: date) -> dict[str, dict]:
        response = client.get("/api/exception-tracking/", {"as_of_date": as_of.isoformat()})
        assert response.status_code == 200, f"tracking {as_of}: {response.content!r}"
        return {row["exception_id"]: row for row in response.json()["exceptions"]}

    execute(OCT_31, ["R001"])
    oct_rows = rows(OCT_31)
    assert len(oct_rows) == 3, sorted(oct_rows)
    mia_oct = next(i for i in oct_rows if i.endswith("_13_Mia"))
    assert update_commentaries(tracking_db, OCT_31, {mia_oct: "KZ updated"}) == 1

    revision = client.put("/api/rules/R001/", {**RULE_V2, "save_decision": "modify_current"}, format="json")
    assert revision.status_code == 200, f"revision: {revision.content!r}"
    current_r1 = str(revision.json()["resulting_rule_id"])
    assert current_r1 != "R001"

    execute(NOV_1, [current_r1])
    nov1 = rows(NOV_1)
    mia_nov1 = next(i for i in nov1 if i.endswith("_13_Mia"))
    assert nov1[mia_nov1]["exception_commentary"] == "KZ updated"
    assert nov1[mia_nov1]["status"] == "RecertificationRequired"
    assert nov1[mia_nov1]["recertification_reason"] == REASON
    harry_nov1 = next(i for i in nov1 if i.endswith("_34_Harry"))
    assert harry_nov1 != next(i for i in oct_rows if i.endswith("_34_Harry"))
    assert nov1[harry_nov1]["exception_commentary"] == ""
    assert nov1[harry_nov1]["status"] in ("New", "NotCommented"), nov1[harry_nov1]

    execute(NOV_2, [current_r1])
    nov2 = rows(NOV_2)
    mia_nov2 = next(i for i in nov2 if i.endswith("_13_Mia"))
    assert nov2[mia_nov2]["exception_commentary"] == "KZ updated"
    assert nov2[mia_nov2]["status"] == "RecertificationRequired"
    harry_nov2 = next(i for i in nov2 if i.endswith("_34_Harry"))
    assert nov2[harry_nov2]["exception_commentary"] == ""
    assert nov2[harry_nov2]["status"] in ("New", "NotCommented")

    print("[seed-round2] preview home ready:", home)
    print("[seed-round2] Mia Nov-2:", mia_nov2, "(pending, left for UI testing)")
    print("[seed-round2] Harry Nov-2:", harry_nov2, "(uncommented)")


if __name__ == "__main__":
    main()
