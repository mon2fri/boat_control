"""Seed an isolated rule-evolution preview home with synthetic data.

Builds the confirmed September-to-October scenario through the REAL
services (no direct writes into private tables, no live data touched):

1. September 30: rule R001 v1 runs; book ``xxxx`` violates it; September
   commentary is recorded against the v1 exception.
2. October 15: R001 is revised (modify current) through the real catalog
   save flow. No run occurs on this date.
3. October 30: R001 v2 runs; the same book still violates it; the September
   commentary carries forward as pending recertification with the exact
   ``Recertification due to rule change`` marker and full provenance.

A second rule (R002) is seeded untouched so the UI tester can exercise
save-as-new flows without disturbing the main scenario.

Usage (from the integration worktree)::

    GROUPED_VALIDATION_HOME=<preview-home> ... (set by this script)
    .venv/bin/python scripts/seed_rule_evolution_preview.py /tmp/boat-control-rule-evolution-preview-20261112

The script refuses to overwrite an existing preview home. It asserts every
step and fails loudly instead of seeding a half-built preview.
"""

from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path

SEPT_30 = date(2026, 9, 30)
OCT_30 = date(2026, 10, 30)
COMMENTARY = "September review note"
REASON = "Recertification due to rule change"

BOOK = "xxxx"
KEY_COLUMNS = ["book"]
COMPARISON_COLUMNS = ["book", "kind", "region", "status"]
TARGET_COLUMNS = ["status"]

RULE_1_V1 = {
    "name": "APAC status must be active",
    "description": "Seed rule v1: APAC books must carry an active status.",
    "conditions": [{"column_name": "region", "operator": "eq", "filter_value": "APAC"}],
    "logic": {
        "format": "value_vs_column",
        "column_name": "status",
        "operator": "eq",
        "target_value": "active",
    },
}
RULE_1_V2 = {
    "name": "APAC status must be active",
    "description": "Seed rule v2: refined to corporate APAC books.",
    "conditions": [
        {"column_name": "region", "operator": "eq", "filter_value": "APAC"},
        {"column_name": "kind", "operator": "eq", "filter_value": "corp"},
    ],
    "condition_relation": "and",
    "logic": {
        "format": "value_vs_column",
        "column_name": "status",
        "operator": "eq",
        "target_value": "active",
    },
}
RULE_2 = {
    "name": "Retail books must be active",
    "description": "Seed rule for save-as-new UI testing; flags nothing in the seed books.",
    "conditions": [{"column_name": "kind", "operator": "eq", "filter_value": "retail"}],
    "logic": {
        "format": "value_vs_column",
        "column_name": "status",
        "operator": "eq",
        "target_value": "active",
    },
}

CSV_A = """book,kind,region,status
xxxx,corp,APAC,active
yyyy,corp,EMEA,active
zzzz,retail,EMEA,active
"""
CSV_B = """book,kind,region,status
xxxx,corp,APAC,inactive
yyyy,corp,EMEA,active
zzzz,retail,EMEA,active
"""


def _fail(message: str) -> "NoReturn":
    raise RuntimeError(f"[seed] {message}")


from typing import NoReturn  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        _fail("usage: seed_rule_evolution_preview.py <preview-home>")
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
        "application_name: Boat Control rule-evolution preview\n"
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
    file_a = uploads_dir / "sept_books_a.csv"
    file_b = uploads_dir / "sept_books_b.csv"
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
    from apps.rules.models import RuleEvolutionHistory  # noqa: E402

    rules_yaml = config_rules_dir / "rules.yaml"
    rules_yaml.write_text(
        yaml.safe_dump(
            {
                "version": 1,
                "next_index": 3,
                "rules": [
                    {"rule_id": "R001", **RULE_1_V1},
                    {"rule_id": "R002", **RULE_2},
                ],
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )

    call_command("migrate", verbosity=0, interactive=False)
    call_command("migrate_rules_to_db", verbosity=1)
    tracking_db = Path(settings.EXCEPTION_TRACKING_DB)
    assert tracking_db.parent.exists(), "tracking DB directory was not created"

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

    def tracking_rows(as_of: date) -> list[dict]:
        response = client.get("/api/exception-tracking/", {"as_of_date": as_of.isoformat()})
        assert response.status_code == 200, f"tracking list {as_of}: {response.content!r}"
        body = response.json()
        return body.get("exceptions", body if isinstance(body, list) else [])

    sept_result = execute(SEPT_30, ["R001", "R002"])
    assert sept_result.get("run_id"), f"September run was not persisted: {sept_result}"

    sept_rows = tracking_rows(SEPT_30)
    sept_target = next(
        (
            row
            for row in sept_rows
            if row.get("book") == BOOK or BOOK in str(row.get("exception_id", ""))
        ),
        None,
    )
    if sept_target is None:
        sept_target = next(
            row
            for row in sept_rows
            if str(row.get("exception_id", "")).endswith(f"_{BOOK}")
        )
    sept_exception_id = str(sept_target["exception_id"])
    updated = update_commentaries(tracking_db, SEPT_30, {sept_exception_id: COMMENTARY})
    assert updated == 1, f"expected 1 September commentary update, got {updated}"
    sept_rows = tracking_rows(SEPT_30)
    sept_target = next(row for row in sept_rows if row["exception_id"] == sept_exception_id)
    assert sept_target["exception_commentary"] == COMMENTARY
    assert sept_target["status"] == "Commented", sept_target["status"]

    # October 15: recorded revision, no run. Ordinary refinement (the
    # original condition is retained), so no 409 confirmation is required;
    # the explicit decision mirrors the UI's modify-current choice.
    revision = client.put(
        "/api/rules/R001/",
        {**RULE_1_V2, "save_decision": "modify_current"},
        format="json",
    )
    assert revision.status_code == 200, f"Oct-15 revision: {revision.content!r}"
    revision_body = revision.json()
    assert revision_body.get("save_decision") == "modify_current", revision_body
    oct_identifier = str(revision_body.get("rule_identifier") or "")
    assert oct_identifier, revision_body
    event_id = str(revision_body.get("evolution_event_id") or "")
    assert event_id, revision_body
    lineage_id = str(revision_body.get("lineage_id") or "")
    assert lineage_id, revision_body
    current_r1 = str(revision_body.get("resulting_rule_id") or "")
    assert current_r1, revision_body

    history = client.get("/api/rules/R001/history/")
    assert history.status_code == 200, f"history: {history.content!r}"
    events = history.json().get("events", [])
    transition = next(
        (
            e
            for e in events
            if e.get("target_identifier") == oct_identifier
        ),
        None,
    )
    assert transition is not None, "v1 -> v2 transition missing from the persisted history"
    sept_identifier = str(transition.get("source_identifier") or "")
    assert sept_identifier and sept_identifier != oct_identifier, transition

    # Keep the YAML in sync (with explicit lineage metadata) so server
    # restarts re-sync idempotently instead of forking a new lineage.
    rules_yaml.write_text(
        yaml.safe_dump(
            {
                "version": 1,
                "next_index": 3,
                "rules": [
                    {"rule_id": "R001", **RULE_1_V2, "lineage_id": lineage_id},
                    {"rule_id": "R002", **RULE_2},
                ],
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    events_before = RuleEvolutionHistory.objects.count()
    call_command("migrate_rules_to_db", verbosity=0)
    assert RuleEvolutionHistory.objects.count() == events_before, (
        "startup re-sync duplicated history rows"
    )

    oct_result = execute(OCT_30, [current_r1, "R002"])
    assert oct_result.get("run_id"), f"October run was not persisted: {oct_result}"

    oct_rows = tracking_rows(OCT_30)
    oct_target = next(row for row in oct_rows if str(row.get("exception_id", "")).endswith(f"_{BOOK}"))
    oct_exception_id = str(oct_target["exception_id"])
    assert oct_exception_id != sept_exception_id, "October must keep its own exception ID"
    assert oct_target["exception_commentary"] == COMMENTARY, oct_target
    assert REASON not in oct_target["exception_commentary"], "marker leaked into commentary text"
    assert oct_target["status"] == "RecertificationRequired", oct_target
    assert oct_target.get("recertification_required") is True, oct_target
    assert oct_target.get("recertification_reason") == REASON, oct_target
    assert oct_target.get("carried_from_exception_id") == sept_exception_id, oct_target
    assert str(oct_target.get("carried_from_as_of_date")) == SEPT_30.isoformat(), oct_target
    assert oct_target.get("carried_from_rule_identifier") == sept_identifier, oct_target
    assert oct_target.get("rule_evolution_event_id") == event_id, oct_target

    sept_rows = tracking_rows(SEPT_30)
    sept_check = next(row for row in sept_rows if row["exception_id"] == sept_exception_id)
    assert sept_check["exception_commentary"] == COMMENTARY
    assert sept_check["status"] == "Commented", "September row must stay accepted"

    dates = client.get("/api/exception-tracking/dates/")
    assert dates.status_code == 200, dates.content
    assert "2026-10-15" not in str(dates.json()), "no October-15 run may exist"

    print("[seed] preview home ready:", home)
    print("[seed] R001 v1 identifier:", sept_identifier)
    print("[seed] R001 v2 identifier:", oct_identifier)
    print("[seed] Sept exception:", sept_exception_id, "(Commented)")
    print("[seed] Oct exception: ", oct_exception_id, "(RecertificationRequired)")
    print("[seed] evolution event:", event_id)
    print("[seed] Sept run:", sept_result.get("run_id"))
    print("[seed] Oct run: ", oct_result.get("run_id"))


if __name__ == "__main__":
    main()
