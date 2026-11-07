from __future__ import annotations

from dataclasses import replace
from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest
from apps.runs.services import (
    ComparisonResult,
    ExecutionResult,
    ValidationResult,
    ValidationViolation,
    compute_group_statistics,
)
from apps.runs.tracking_capture import ExceptionCaptureError
from apps.runs.tracking_context import (
    enrich_execution_result,
    filter_result_for_new_exceptions,
    parse_new_exceptions_only,
    refresh_result_dict,
    resolve_run_document,
)


def _violation(
    key: str,
    status: str | None,
    *,
    rule_id: str = "R001",
    column: str = "status",
) -> ValidationViolation:
    return ValidationViolation(
        row_index=0 if key == "1" else 1,
        rule_id=rule_id,
        rule_name="Rule",
        key_columns={"id": key},
        details="bad",
        violating_column=column,
        violating_value="inactive",
        rule_logic="status equals 'active'",
        rule_identifier="CBR1_00000000000000000000",
        grouping_values={"region": "EMEA" if key == "1" else "APAC"},
        exception_id=f"EXC_{key}",
        exception_status=status,
    )


def _result(violations: list[ValidationViolation]) -> ExecutionResult:
    validation = ValidationResult(
        total_violations=len(violations),
        distinct_violating_rows=len({item.row_index for item in violations}),
        distinct_violating_attributes=len(
            {(item.row_index, item.violating_column) for item in violations}
        ),
        violations_by_rule={"R001": violations},
        violation_count_by_rule={"R001": len(violations)},
        violating_rows_by_rule={"R001": len({item.row_index for item in violations})},
        violating_attributes_by_rule={
            "R001": len({(item.row_index, item.violating_column) for item in violations})
        },
        rule_summaries={
            "R001": {
                "name": "Rule",
                "rule_identifier": "CBR1_00000000000000000000",
            }
        },
    )
    comparison = ComparisonResult(
        total_rows_a=2,
        total_rows_b=2,
        matched_rows=2,
        rows_with_changes=0,
        total_attribute_changes=0,
        row_details=[],
    )
    return ExecutionResult(
        comparison=comparison,
        validation=validation,
        common_columns=["id", "region", "status"],
        target_columns=["status"],
        key_columns=["id"],
        filters_applied=[],
        aggregation_columns=["region"],
        group_statistics=compute_group_statistics([], {"R001": violations}, ["region"]),
        rule_bindings={"R001": "CBR1_00000000000000000000"},
    )


def _document(violations: list[ValidationViolation]) -> dict[str, Any]:
    result = _result(violations)
    return {
        "run_id": "run1",
        "as_of_date": "2026-10-30",
        "result": {
            "comparison": {
                "total_rows_a": 2,
                "total_rows_b": 2,
                "rows_with_changes": 0,
                "total_attribute_changes": 0,
                "row_details": [],
                "new_book_count": 0,
                "new_book_details": [],
            },
            "validation": {
                "total_violations": result.validation.total_violations,
                "distinct_violating_rows": result.validation.distinct_violating_rows,
                "distinct_violating_attributes": result.validation.distinct_violating_attributes,
                "violations_by_rule": {
                    rule: [
                        {
                            "row_index": item.row_index,
                            "rule_id": item.rule_id,
                            "rule_name": item.rule_name,
                            "key_columns": item.key_columns,
                            "details": item.details,
                            "violating_column": item.violating_column,
                            "violating_value": item.violating_value,
                            "rule_logic": item.rule_logic,
                            "rule_identifier": item.rule_identifier,
                            "grouping_values": item.grouping_values,
                            "exception_id": item.exception_id,
                            "exception_status": item.exception_status,
                        }
                        for item in items
                    ]
                    for rule, items in result.validation.violations_by_rule.items()
                },
                "violation_count_by_rule": result.validation.violation_count_by_rule,
                "violating_rows_by_rule": result.validation.violating_rows_by_rule,
                "violating_attributes_by_rule": (
                    result.validation.violating_attributes_by_rule
                ),
                "rule_summaries": result.validation.rule_summaries,
            },
            "rule_bindings": result.rule_bindings,
            "key_columns": ["id"],
            "aggregation_columns": ["region"],
            "group_statistics": result.group_statistics,
            "new_exceptions_only": True,
        },
    }


class TestParseNewExceptionsOnly:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            (None, True),
            ("", True),
            (True, True),
            (False, False),
            ("true", True),
            ("false", False),
            ("1", True),
            ("0", False),
        ],
    )
    def test_parses(self, value: object, expected: bool) -> None:
        assert parse_new_exceptions_only(value) is expected

    def test_invalid_value_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="true or false"):
            parse_new_exceptions_only("maybe")


class TestFiltering:
    def test_filters_commented_but_keeps_new_and_not_commented(self) -> None:
        document = _document(
            [
                _violation("1", "New"),
                _violation("2", "NotCommented"),
                _violation("3", "Commented"),
            ]
        )

        filtered = filter_result_for_new_exceptions(document["result"], True)

        validation = filtered["validation"]
        assert validation["total_violations"] == 2
        assert validation["distinct_violating_rows"] == 2
        assert validation["violation_count_by_rule"] == {"R001": 2}
        assert [item["exception_id"] for item in validation["violations_by_rule"]["R001"]] == [
            "EXC_1",
            "EXC_2",
        ]
        assert validation["rule_summaries"]["R001"]["name"] == "Rule"
        group = filtered["group_statistics"]["validation_rules"]["R001"][0]
        assert group["unique_count"] == 2
        assert group["attribute_count"] == 2

    def test_false_keeps_every_status_and_does_not_mutate_input(self) -> None:
        document = _document(
            [
                _violation("1", "New"),
                _violation("2", "Commented"),
            ]
        )
        original = document["result"]["validation"]["violations_by_rule"]["R001"]

        filtered = filter_result_for_new_exceptions(document["result"], False)

        assert filtered["validation"]["violations_by_rule"]["R001"] == original
        assert filtered["new_exceptions_only"] is False

    def test_unknown_status_is_retained_for_legacy_visibility(self) -> None:
        document = _document([_violation("1", None)])

        filtered = filter_result_for_new_exceptions(document["result"], True)

        assert filtered["validation"]["total_violations"] == 1

    def test_all_commented_produces_consistent_empty_counts(self) -> None:
        document = _document(
            [
                _violation("1", "Commented"),
                _violation("2", "Commented"),
            ]
        )

        filtered = filter_result_for_new_exceptions(document["result"], True)

        validation = filtered["validation"]
        assert validation["total_violations"] == 0
        assert validation["distinct_violating_rows"] == 0
        assert validation["distinct_violating_attributes"] == 0
        assert validation["violations_by_rule"] == {"R001": []}
        group = filtered["group_statistics"]["validation_rules"]["R001"][0]
        assert group["unique_count"] == 0

    def test_resolve_run_document_uses_requested_scope(self) -> None:
        document = _document([_violation("1", "New"), _violation("2", "Commented")])

        filtered = resolve_run_document(document, new_exceptions_only=True, refresh=False)
        unfiltered = resolve_run_document(
            document, new_exceptions_only=False, refresh=False
        )

        assert filtered["result"]["validation"]["total_violations"] == 1
        assert unfiltered["result"]["validation"]["total_violations"] == 2
        assert filtered["new_exceptions_only"] is True
        assert unfiltered["new_exceptions_only"] is False


class TestTrackingRecords:
    def _record(self, key: str, status: str) -> SimpleNamespace:
        return SimpleNamespace(
            exception_id=f"EXC_{key}",
            exception_rule_identifier="CBR1_00000000000000000000",
            key_column_pairs=(("id", key),),
            status=status,
            exception_commentary="",
            exception_as_of_date=date(2026, 10, 30),
            exception_first_seen_as_of_date=date(2026, 10, 30),
        )

    def test_enrich_execution_result_attaches_id_and_status(self) -> None:
        result = _result(
            [
                replace(_violation("1", None), exception_id=None),
                replace(_violation("2", None), exception_id=None),
            ]
        )
        repository = SimpleNamespace(
            list_exceptions=lambda _date: [
                self._record("1", "New"),
                self._record("2", "Commented"),
            ]
        )

        enriched = enrich_execution_result(
            result, date(2026, 10, 30), repository=repository
        )

        violations = enriched.validation.violations_by_rule["R001"]
        assert [(item.exception_id, item.exception_status) for item in violations] == [
            ("EXC_1", "New"),
            ("EXC_2", "Commented"),
        ]

    def test_enrich_is_strict_when_no_record_matches(self) -> None:
        result = _result([replace(_violation("9", None), exception_id=None)])
        repository = SimpleNamespace(list_exceptions=lambda _date: [])

        with pytest.raises(ExceptionCaptureError, match="capture verification failed"):
            enrich_execution_result(result, date(2026, 10, 30), repository=repository)

    def test_refresh_result_dict_updates_statuses_from_authoritative_records(self) -> None:
        document = _document([_violation("1", "New")])
        repository = SimpleNamespace(
            list_exceptions=lambda _date: [self._record("1", "Commented")]
        )

        refreshed = refresh_result_dict(
            document["result"],
            "2026-10-30",
            repository=repository,
        )

        violation = refreshed["validation"]["violations_by_rule"]["R001"][0]
        assert violation["exception_status"] == "Commented"
        assert violation["exception_id"] == "EXC_1"

    def test_refresh_without_date_is_a_safe_copy(self) -> None:
        document = _document([_violation("1", "New")])

        refreshed = refresh_result_dict(document["result"], None)

        assert refreshed == document["result"]
        assert refreshed is not document["result"]
