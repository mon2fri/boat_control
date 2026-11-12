from __future__ import annotations

import tempfile
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from apps.runs.grouped_logic import (
    GroupingNode,
    parse_grouping_tree,
    serialize_grouping_tree,
    validate_filter_grouping,
)
from apps.settings.services import get_saved_filters_dir

_filters_lock = threading.Lock()


@dataclass
class FilterRow:
    column: str
    operator: str
    filter_value: str
    filter_values: list[str] = field(default_factory=list)


@dataclass
class SavedFilter:
    id: str
    name: str
    rows: list[FilterRow]
    filter_relation: str | None = None
    filter_grouping_tree: GroupingNode | None = None


def _row_values(data: dict[str, Any]) -> list[str]:
    values = data.get("filter_values")
    if isinstance(values, list):
        return [str(value) for value in values]
    legacy = data.get("filter_value", "")
    return [str(legacy)] if legacy != "" else []


def _parse_row(data: dict[str, Any]) -> FilterRow:
    values = _row_values(data)
    return FilterRow(
        column=str(data.get("column", "")),
        operator=str(data.get("operator", "")),
        filter_value=values[0] if values else "",
        filter_values=values,
    )


def _validate_saved_filter(
    rows: list[FilterRow],
    filter_relation: str | None,
    filter_grouping_tree: dict[str, Any] | None,
) -> GroupingNode | None:
    errors = validate_filter_grouping(
        rows, filter_relation, filter_grouping_tree
    )
    if errors:
        raise ValueError("; ".join(errors))
    for index, row in enumerate(rows, start=1):
        if not row.column:
            raise ValueError(f"Filter row {index} requires a column.")
        if row.operator not in {"eq", "neq", "contains", "ncontains"}:
            raise ValueError(
                f"Invalid operator at filter row {index}: '{row.operator}'."
            )
        if not row.filter_values:
            raise ValueError(f"Filter row {index} requires at least one value.")
    return parse_grouping_tree(filter_grouping_tree)


def _saved_filter_from_data(data: dict[str, Any], fallback_id: str) -> SavedFilter:
    return SavedFilter(
        id=str(data.get("id", fallback_id)),
        name=str(data.get("name", "")),
        rows=[_parse_row(row) for row in data.get("rows", [])],
        filter_relation=data.get("filter_relation"),
        filter_grouping_tree=parse_grouping_tree(
            data.get("filter_grouping_tree")
        ),
    )


def _filters_dir() -> Path:
    d = get_saved_filters_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d


def _filter_path(filter_id: str) -> Path:
    return _filters_dir() / f"{filter_id}.yaml"


def list_filters() -> list[SavedFilter]:
    filters: list[SavedFilter] = []
    for p in sorted(_filters_dir().glob("*.yaml")):
        with open(p) as f:
            data = yaml.safe_load(f) or {}
        filters.append(_saved_filter_from_data(data, p.stem))
    return filters


def get_filter(filter_id: str) -> SavedFilter | None:
    path = _filter_path(filter_id)
    if not path.exists():
        return None
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    return _saved_filter_from_data(data, filter_id)


def create_filter(
    name: str,
    rows: list[dict[str, Any]],
    filter_relation: str | None = None,
    filter_grouping_tree: dict[str, Any] | None = None,
) -> SavedFilter:
    with _filters_lock:
        filter_id = uuid.uuid4().hex[:12]
        filter_rows = [_parse_row(row) for row in rows]
        tree = _validate_saved_filter(
            filter_rows, filter_relation, filter_grouping_tree
        )
        saved = SavedFilter(
            id=filter_id,
            name=name,
            rows=filter_rows,
            filter_relation=filter_relation,
            filter_grouping_tree=tree,
        )
        _save_filter(saved)
        return saved


def update_filter(
    filter_id: str,
    name: str,
    rows: list[dict[str, Any]],
    filter_relation: str | None = None,
    filter_grouping_tree: dict[str, Any] | None = None,
) -> SavedFilter:
    with _filters_lock:
        existing = get_filter(filter_id)
        if existing is None:
            raise ValueError(f"Filter {filter_id} not found.")
        filter_rows = [_parse_row(row) for row in rows]
        tree = _validate_saved_filter(
            filter_rows, filter_relation, filter_grouping_tree
        )
        saved = SavedFilter(
            id=filter_id,
            name=name,
            rows=filter_rows,
            filter_relation=filter_relation,
            filter_grouping_tree=tree,
        )
        _save_filter(saved)
        return saved


def delete_filter(filter_id: str) -> None:
    with _filters_lock:
        path = _filter_path(filter_id)
        if not path.exists():
            raise ValueError(f"Filter {filter_id} not found.")
        path.unlink()


def _save_filter(saved: SavedFilter) -> None:
    path = _filter_path(saved.id)
    data: dict[str, Any] = {
        "id": saved.id,
        "name": saved.name,
        "rows": [
            {
                "column": r.column,
                "operator": r.operator,
                "filter_value": r.filter_value,
                "filter_values": list(r.filter_values or [r.filter_value]),
            }
            for r in saved.rows
        ],
    }
    if saved.filter_relation is not None:
        data["filter_relation"] = saved.filter_relation
    serialized_tree = serialize_grouping_tree(saved.filter_grouping_tree)
    if serialized_tree is not None:
        data["filter_grouping_tree"] = serialized_tree
    with tempfile.NamedTemporaryFile(
        mode="w", dir=path.parent, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(data, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)
