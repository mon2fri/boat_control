from __future__ import annotations

import json

SCHEMA = {
    "upload": {
        "request": {
            "file_a": "file",
            "file_b": "file",
        },
        "response": {
            "session_id": "string",
            "file_a_name": "string",
            "file_b_name": "string",
            "inspection": {
                "columns_a": "list[string]",
                "columns_b": "list[string]",
                "common_columns": "list[string]",
                "only_in_a": "list[string]",
                "only_in_b": "list[string]",
            },
        },
    },
    "filter_preparation": {
        "request": {
            "session_id": "string",
            "common_columns": "list[string] (optional)",
        },
        "response": {
            "session_id": "string",
            "columns": "list[string]",
            "column_values": "dict[string, list[dict]]",
            "total_rows_a": "int",
            "total_rows_b": "int",
            "requires_confirmation": "bool",
        },
    },
    "filter_validation": {
        "request": {
            "column": "string",
            "operator": "string",
            "filter_value": "string",
            "common_columns": "list[string]",
        },
        "response": {
            "valid": "bool",
            "errors": "list[string]",
        },
    },
    "target_columns": {
        "request": {
            "session_id": "string",
            "target_columns": "list[string] (optional)",
        },
        "response": {
            "session_id": "string",
            "valid_columns": "list[string]",
            "invalid_columns": "list[string]",
            "all_common_columns": "list[string]",
        },
    },
    "execute": {
        "request": {
            "session_id": "string",
            "target_columns": "list[string] (optional)",
            "key_columns": "list[string] (optional)",
            "filters": "list[dict] (optional)",
            "rule_ids": "list[string] (optional)",
        },
        "response": {
            "run_id": "string",
            "report_name": "string",
            "file_a_name": "string",
            "file_b_name": "string",
            "created_at": "string (ISO)",
            "result": {
                "comparison": {
                    "total_rows_a": "int",
                    "total_rows_b": "int",
                    "rows_with_changes": "int",
                    "total_attribute_changes": "int",
                    "row_details": "list[dict]",
                },
                "validation": {
                    "total_violations": "int",
                    "violations_by_rule": "dict[string, list[dict]]",
                    "violation_count_by_rule": "dict[string, int]",
                },
                "common_columns": "list[string]",
                "target_columns": "list[string]",
                "filters_applied": "list[dict]",
            },
        },
    },
    "rules_list": {
        "request": None,
        "response": {
            "version": "int",
            "rules": "list[dict]",
        },
    },
    "rule_create": {
        "request": {
            "name": "string",
            "description": "string (optional)",
            "logic": {
                "format": "string (value_vs_column|column_vs_column)",
                "column_name": "string",
                "operator": "string",
                "target_value": "string",
            },
            "conditions": "list[dict] (optional)",
            "condition_relation": "string (and|or, optional)",
            "grouping": "list[string] (optional)",
        },
        "response": {
            "rule_id": "string (Rxxx)",
            "message": "string",
        },
    },
    "runs_list": {
        "request": None,
        "response": {
            "runs": "list[dict]",
        },
    },
    "run_detail": {
        "request": None,
        "response": "dict (same as execute response)",
    },
    "run_rename": {
        "request": {
            "report_name": "string",
        },
        "response": {
            "run_id": "string",
            "message": "string",
        },
    },
    "export": {
        "request": {
            "run_id": "string",
            "format": "string (html|excel)",
        },
        "response": "binary (file download)",
    },
}


class TestContractSchema:
    def test_schema_has_all_endpoints(self) -> None:
        required = [
            "upload", "filter_preparation", "filter_validation",
            "target_columns", "execute", "rules_list", "rule_create",
            "runs_list", "run_detail", "run_rename", "export",
        ]
        for endpoint in required:
            assert endpoint in SCHEMA, f"Missing endpoint: {endpoint}"

    def test_upload_request_shape(self) -> None:
        req = SCHEMA["upload"]["request"]
        assert "file_a" in req
        assert "file_b" in req

    def test_upload_response_shape(self) -> None:
        resp = SCHEMA["upload"]["response"]
        assert "session_id" in resp
        assert "inspection" in resp
        assert "common_columns" in resp["inspection"]

    def test_execute_request_shape(self) -> None:
        req = SCHEMA["execute"]["request"]
        assert "session_id" in req
        assert "target_columns" in req
        assert "key_columns" in req
        assert "filters" in req
        assert "rule_ids" in req

    def test_execute_response_shape(self) -> None:
        resp = SCHEMA["execute"]["response"]
        assert "run_id" in resp
        assert "result" in resp
        assert "comparison" in resp["result"]
        assert "validation" in resp["result"]

    def test_rule_schema_shape(self) -> None:
        rule = SCHEMA["rule_create"]["request"]
        assert "name" in rule
        assert "logic" in rule
        assert "format" in rule["logic"]
        assert "column_name" in rule["logic"]
        assert "operator" in rule["logic"]
        assert "target_value" in rule["logic"]

    def test_schema_json_roundtrip(self) -> None:
        dumped = json.dumps(SCHEMA, indent=2)
        loaded = json.loads(dumped)
        assert loaded == SCHEMA
