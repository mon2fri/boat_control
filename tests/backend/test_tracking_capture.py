from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from apps.runs import tracking_capture
from apps.runs.services import (
    ComparisonResult,
    ExecutionResult,
    ValidationResult,
    ValidationViolation,
)
from apps.runs.tracking_capture import (
    ExceptionCaptureError,
    ExceptionTrackingDependencyError,
    build_occurrences,
    capture_run_exceptions,
    resolve_tracking_db_path,
)


def make_result(
    *,
    key_columns: list[str] | None = None,
    violations_by_rule: dict[str, list[ValidationViolation]] | None = None,
    rule_bindings: dict[str, str] | None = None,
    rule_summaries: dict[str, dict[str, Any]] | None = None,
    commentary_template_columns: list[str] | None = None,
) -> ExecutionResult:
    violations = violations_by_rule or {}
    validation = ValidationResult(
        total_violations=sum(len(items) for items in violations.values()),
        distinct_violating_rows=0,
        distinct_violating_attributes=0,
        violations_by_rule=violations,
        violation_count_by_rule={rule: len(items) for rule, items in violations.items()},
        violating_rows_by_rule={},
        violating_attributes_by_rule={},
        rule_summaries=rule_summaries or {},
    )
    comparison = ComparisonResult(
        total_rows_a=1,
        total_rows_b=1,
        matched_rows=1,
        rows_with_changes=0,
        total_attribute_changes=0,
        row_details=[],
    )
    return ExecutionResult(
        comparison=comparison,
        validation=validation,
        common_columns=["id"],
        target_columns=["status"],
        key_columns=key_columns if key_columns is not None else ["id"],
        filters_applied=[],
        rule_bindings=rule_bindings or {},
        commentary_template_columns=commentary_template_columns or [],
    )


def violation(
    *,
    rule_id: str = "R001",
    rule_identifier: str | None = "CBR1_00000000000000000000",
    key_columns: dict[str, Any] | None = None,
    row_index: int = 0,
    detail_values: dict[str, str] | None = None,
) -> ValidationViolation:
    return ValidationViolation(
        row_index=row_index,
        rule_id=rule_id,
        rule_name="Rule",
        key_columns=key_columns if key_columns is not None else {"id": "1"},
        details="bad",
        violating_column="status",
        violating_value="inactive",
        rule_logic="status equals 'active'",
        rule_identifier=rule_identifier,
        detail_values=detail_values or {},
    )


class FakeStore:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.calls: list[dict[str, Any]] = []

    def capture_exceptions(
        self,
        as_of_date: date,
        occurrences: list[dict[str, object]],
        *,
        db_path: Path | None = None,
        extra_columns: list[str] | None = None,
    ) -> object:
        self.calls.append(
            {
                "as_of_date": as_of_date,
                "occurrences": occurrences,
                "db_path": db_path,
                "extra_columns": extra_columns,
            }
        )
        if self.error is not None:
            raise self.error
        return {"captured": len(occurrences)}


class TestBuildOccurrences:
    def test_builds_ordered_key_columns_and_utc_timestamp(self) -> None:
        captured_at = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
        result = make_result(
            key_columns=["region", "id"],
            violations_by_rule={
                "R001": [
                    violation(
                        key_columns={"region": "EMEA", "id": "42"},
                    )
                ]
            },
        )

        occurrences = build_occurrences(result, captured_at=captured_at)

        assert occurrences == [
            {
                "exception_rule_identifier": "CBR1_00000000000000000000",
                "key_columns": (("region", "EMEA"), ("id", "42")),
                "exception_timestamp": captured_at,
                "exception_rule_index": "R001",
                "exception_extra_values": {},
            }
        ]

    def test_key_column_order_follows_run_configuration_not_dict_order(self) -> None:
        result = make_result(
            key_columns=["id", "region"],
            violations_by_rule={
                "R001": [violation(key_columns={"region": "EMEA", "id": "42"})]
            },
        )

        occurrence = build_occurrences(result)[0]

        assert occurrence["key_columns"] == (("id", "42"), ("region", "EMEA"))

    def test_captures_ordered_commentary_template_values_and_rule_index(self) -> None:
        result = make_result(
            commentary_template_columns=["Region", "Score", "Missing"],
            violations_by_rule={
                "R001": [
                    violation(
                        row_index=7,
                        detail_values={"Region": "EMEA", "Score": 42},
                    )
                ]
            },
        )

        occurrence = build_occurrences(result)[0]

        assert occurrence["exception_rule_index"] == "R001"
        assert occurrence["exception_extra_values"] == {
            "Region": "EMEA",
            "Score": "42",
            "Missing": "",
        }
        assert list(occurrence["exception_extra_values"]) == [
            "Region",
            "Score",
            "Missing",
        ]

    def test_duplicate_rule_and_key_collapse_to_one_exception(self) -> None:
        first = violation(key_columns={"id": "1"})
        second = replace(
            violation(key_columns={"id": "1"}, row_index=9),
            violating_column="score",
            violating_value="0",
        )
        result = make_result(violations_by_rule={"R001": [first, second]})

        occurrences = build_occurrences(result)

        assert len(occurrences) == 1
        assert occurrences[0]["key_columns"] == (("id", "1"),)

    def test_same_key_under_different_rules_stays_distinct(self) -> None:
        result = make_result(
            violations_by_rule={
                "R001": [violation(rule_identifier="CBR1_00000000000000000000")],
                "R002": [violation(rule_identifier="CBR1_11111111111111111111")],
            }
        )

        occurrences = build_occurrences(result)

        assert [item["exception_rule_identifier"] for item in occurrences] == [
            "CBR1_00000000000000000000",
            "CBR1_11111111111111111111",
        ]

    def test_uses_run_binding_when_violation_identifier_is_absent(self) -> None:
        result = make_result(
            violations_by_rule={"R001": [violation(rule_identifier=None)]},
            rule_bindings={"R001": "CBR1_22222222222222222222"},
        )

        assert build_occurrences(result)[0]["exception_rule_identifier"] == (
            "CBR1_22222222222222222222"
        )

    def test_uses_summary_identifier_when_binding_is_absent(self) -> None:
        result = make_result(
            violations_by_rule={"R001": [violation(rule_identifier=None)]},
            rule_summaries={
                "R001": {
                    "name": "Rule",
                    "rule_identifier": "CBR1_33333333333333333333",
                }
            },
        )

        assert build_occurrences(result)[0]["exception_rule_identifier"] == (
            "CBR1_33333333333333333333"
        )

    def test_missing_canonical_identifier_is_actionable_and_never_guessed(self) -> None:
        result = make_result(
            violations_by_rule={"R001": [violation(rule_identifier=None)]},
        )

        with pytest.raises(ExceptionCaptureError, match="no canonical rule identifier"):
            build_occurrences(result)
        with pytest.raises(ExceptionCaptureError, match="No exception ID was guessed"):
            build_occurrences(result)

    def test_missing_configured_key_column_is_actionable(self) -> None:
        result = make_result(
            key_columns=["id", "region"],
            violations_by_rule={"R001": [violation(key_columns={"id": "1"})]},
        )

        with pytest.raises(ExceptionCaptureError, match="missing configured key column 'region'"):
            build_occurrences(result)

    def test_null_key_value_is_actionable(self) -> None:
        result = make_result(
            violations_by_rule={"R001": [violation(key_columns={"id": None})]},
        )

        with pytest.raises(ExceptionCaptureError, match="null value for key column 'id'"):
            build_occurrences(result)

    def test_empty_key_value_is_actionable(self) -> None:
        result = make_result(
            violations_by_rule={"R001": [violation(key_columns={"id": ""})]},
        )

        with pytest.raises(ExceptionCaptureError, match="empty value for key column 'id'"):
            build_occurrences(result)

    def test_run_without_key_columns_is_actionable(self) -> None:
        result = make_result(
            key_columns=[],
            violations_by_rule={"R001": [violation()]},
        )

        with pytest.raises(ExceptionCaptureError, match="no configured key columns"):
            build_occurrences(result)

    def test_preserves_unicode_and_underscore_key_values_literally(self) -> None:
        result = make_result(
            key_columns=["id"],
            violations_by_rule={
                "R001": [violation(key_columns={"id": "café_rocket_🚀"})]
            },
        )

        assert build_occurrences(result)[0]["key_columns"] == (
            ("id", "café_rocket_🚀"),
        )

    def test_empty_run_produces_no_occurrences(self) -> None:
        assert build_occurrences(make_result(violations_by_rule={})) == []

    def test_naive_timestamp_is_rejected(self) -> None:
        result = make_result(violations_by_rule={"R001": [violation()]})

        with pytest.raises(ExceptionCaptureError, match="timezone-aware"):
            build_occurrences(result, captured_at=datetime(2026, 10, 30, 12, 0))

    def test_aware_timestamp_is_converted_to_utc(self) -> None:
        result = make_result(violations_by_rule={"R001": [violation()]})
        local = datetime(
            2026, 10, 30, 9, 0, tzinfo=timezone(timedelta(hours=-5))
        )

        occurrence = build_occurrences(result, captured_at=local)[0]

        timestamp = occurrence["exception_timestamp"]
        assert isinstance(timestamp, datetime)
        assert timestamp == local
        assert timestamp.utcoffset() == timedelta(0)

    def test_datetime_key_values_use_iso_8601_text(self) -> None:
        result = make_result(
            violations_by_rule={
                "R001": [
                    violation(
                        key_columns={
                            "id": datetime(2026, 10, 30, 12, 15, tzinfo=UTC)
                        }
                    )
                ]
            },
        )

        occurrence = build_occurrences(result)[0]

        assert occurrence["key_columns"] == (
            ("id", "2026-10-30T12:15:00+00:00"),
        )


class TestCaptureRunExceptions:
    def test_calls_store_with_date_occurrences_and_path(self, tmp_path: Path) -> None:
        store = FakeStore()
        result = make_result(violations_by_rule={"R001": [violation()]})
        captured_at = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
        db_path = tmp_path / "tracking.db"

        captured = capture_run_exceptions(
            result,
            date(2026, 10, 30),
            captured_at=captured_at,
            db_path=db_path,
            store=store,
            template_columns=["Region"],
        )

        assert captured == {"captured": 1}
        assert len(store.calls) == 1
        call = store.calls[0]
        assert call["as_of_date"] == date(2026, 10, 30)
        assert call["db_path"] == db_path
        assert call["extra_columns"] == ["Region"]
        assert call["occurrences"][0]["exception_timestamp"] == captured_at

    def test_empty_run_still_calls_store_to_create_date_table(self, tmp_path: Path) -> None:
        store = FakeStore()

        capture_run_exceptions(
            make_result(violations_by_rule={}),
            date(2026, 10, 30),
            db_path=tmp_path / "tracking.db",
            store=store,
        )

        assert store.calls[0]["occurrences"] == []

    def test_store_failure_is_wrapped_with_retry_guidance(self, tmp_path: Path) -> None:
        store = FakeStore(error=OSError("disk is read-only"))

        with pytest.raises(ExceptionCaptureError) as captured:
            capture_run_exceptions(
                make_result(violations_by_rule={"R001": [violation()]}),
                date(2026, 10, 30),
                db_path=tmp_path / "tracking.db",
                store=store,
            )

        message = str(captured.value)
        assert "disk is read-only" in message
        assert "The run was not saved" in message
        assert "same-date captures are idempotent" in message

    def test_rejects_datetime_as_of_date(self, tmp_path: Path) -> None:
        with pytest.raises(ExceptionCaptureError, match="ISO calendar As-of Date"):
            capture_run_exceptions(
                make_result(violations_by_rule={}),
                datetime(2026, 10, 30, tzinfo=UTC),  # type: ignore[arg-type]
                db_path=tmp_path / "tracking.db",
                store=FakeStore(),
            )

    def test_nonempty_selection_requires_worker_a_extra_columns_contract(
        self, tmp_path: Path
    ) -> None:
        class LegacyStore:
            def capture_exceptions(
                self,
                as_of_date: date,
                occurrences: list[dict[str, object]],
                *,
                db_path: Path | None = None,
            ) -> object:
                return {"captured": len(occurrences)}

        with pytest.raises(ExceptionTrackingDependencyError, match="extra_columns"):
            capture_run_exceptions(
                make_result(
                    violations_by_rule={"R001": [violation()]},
                    commentary_template_columns=["Region"],
                ),
                date(2026, 10, 30),
                db_path=tmp_path / "tracking.db",
                store=LegacyStore(),
            )

    def test_empty_selection_remains_backward_compatible_with_legacy_store(
        self, tmp_path: Path
    ) -> None:
        class LegacyStore:
            def __init__(self) -> None:
                self.called = False

            def capture_exceptions(
                self,
                as_of_date: date,
                occurrences: list[dict[str, object]],
                *,
                db_path: Path | None = None,
            ) -> object:
                self.called = True
                return {"captured": len(occurrences)}

        store = LegacyStore()
        capture_run_exceptions(
            make_result(violations_by_rule={"R001": [violation()]}),
            date(2026, 10, 30),
            db_path=tmp_path / "tracking.db",
            store=store,
        )
        assert store.called is True


class TestDependencyErrors:
    def test_missing_store_module_is_visible_and_actionable(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def missing(_name: str) -> object:
            raise ImportError("no module")

        monkeypatch.setattr(tracking_capture.importlib, "import_module", missing)

        with pytest.raises(ExceptionTrackingDependencyError, match="Worker A"):
            tracking_capture._load_store()

    def test_missing_settings_path_resolver_is_visible_and_actionable(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from types import SimpleNamespace

        monkeypatch.setattr(
            tracking_capture.importlib,
            "import_module",
            lambda _name: SimpleNamespace(),
        )

        with pytest.raises(ExceptionTrackingDependencyError, match="Worker B"):
            resolve_tracking_db_path()
