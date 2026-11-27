"""Seed an isolated Round-1 preview: unchanged-rule Oct-31 -> Nov-1 carry.

Reproduces the reported scenario through the real services (no direct writes
into private tables, no live data touched):

1. October 31: an UNCHANGED rule runs; books Mia/Quinn violate it; commentary
   is uploaded (simulating the XLSX import) BEFORE the next run.
2. November 1: the same rule runs unchanged; the same books still violate it;
   the October 31 commentary carries forward as ordinary commented text
   (no recertification: the rule never changed). A third violating book with
   no commentary stays new.

Usage (from the integration worktree)::

    .venv/bin/python scripts/seed_rule_evolution_round1_preview.py /tmp/boat-control-rule-evolution-preview-round1-20261112

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
KEY_COLUMNS = ["id", "name"]
COMPARISON_COLUMNS = ["id", "name", "region", "status", "score"]
TARGET_COLUMNS = ["status"]

RULE = {
    "name": "North status must be active",
    "description": "Round-1 seed rule: never revised during the scenario.",
    "conditions": [],
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
    raise RuntimeError(f"[seed-round1] {message}")


def main() -> None:
    if len(sys.argv) != 2:
        _fail("usage: seed_rule_evolution_round1_preview.py <preview-home>")
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
        "application_name: Boat Control rule-evolution Round-1 preview\n"
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
    file_a = uploads_dir / "round1_books_a.csv"
    file_b = uploads_dir / "round1_books_b.csv"
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

    rules_yaml = config_rules_dir / "rules.yaml"
    rules_yaml.write_text(
        yaml.safe_dump(
            {"version": 1, "next_index": 2, "rules": [{"rule_id": "R001", **RULE}]},
            sort_keys=False,
        ),
        encoding="utf-8",
    )

    call_command("migrate", verbosity=0, interactive=False)
    call_command("migrate_rules_to_db", verbosity=0)
    tracking_db = Path(settings.EXCEPTION_TRACKING_DB)

    client = APIClient()

    def execute(as_of: date) -> dict:
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
                "rule_ids": ["R001"],
                "as_of_date": as_of.isoformat(),
            },
            format="json",
        )
        assert response.status_code == 200, f"execute {as_of}: {response.content!r}"
        return response.json()

    def tracking_ids(as_of: date) -> list[str]:
        response = client.get("/api/exception-tracking/", {"as_of_date": as_of.isoformat()})
        assert response.status_code == 200, f"tracking {as_of}: {response.content!r}"
        return sorted(row["exception_id"] for row in response.json().get("exceptions", []))

    oct_result = execute(OCT_31)
    assert oct_result.get("run_id"), "October run was not persisted"
    oct_ids = tracking_ids(OCT_31)
    assert len(oct_ids) == 3, f"expected Mia/Quinn/Harry, got {oct_ids}"
    mia_oct = next(i for i in oct_ids if i.endswith("_13_Mia"))
    quinn_oct = next(i for i in oct_ids if i.endswith("_17_Quinn"))

    # XLSX-style upload BEFORE the November run.
    assert update_commentaries(tracking_db, OCT_31, {mia_oct: "KZ updated"}) == 1
    assert update_commentaries(tracking_db, OCT_31, {quinn_oct: "KZ updated"}) == 1

    nov_result = execute(NOV_1)
    assert nov_result.get("run_id"), "November run was not persisted"

    nov_rows = {
        row["exception_id"]: row
        for row in client.get(
            "/api/exception-tracking/", {"as_of_date": NOV_1.isoformat()}
        ).json()["exceptions"]
    }
    assert len(nov_rows) == 3, sorted(nov_rows)
    for old_id, book in ((mia_oct, "Mia"), (quinn_oct, "Quinn")):
        new_id = next(i for i in nov_rows if i.endswith(book))
        assert new_id == old_id, "unchanged rule keeps identical exception IDs"
        row = nov_rows[new_id]
        assert row["exception_commentary"] == "KZ updated", row
        assert row["status"] == "Commented", row
        assert not row.get("recertification_required"), row
    harry = next(r for i, r in nov_rows.items() if i.endswith("_34_Harry"))
    assert harry["exception_commentary"] == ""
    assert harry["status"] in ("New", "NotCommented"), harry

    print("[seed-round1] preview home ready:", home)
    print("[seed-round1] Oct-31 run:", oct_result.get("run_id"))
    print("[seed-round1] Nov-1 run: ", nov_result.get("run_id"))


if __name__ == "__main__":
    main()
