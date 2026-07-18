from __future__ import annotations

import tempfile
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from django.conf import settings

_filters_lock = threading.Lock()


@dataclass
class FilterRow:
    column: str
    operator: str
    filter_value: str


@dataclass
class SavedFilter:
    id: str
    name: str
    rows: list[FilterRow]


def _filters_dir() -> Path:
    d = settings.FILTERS_DIR
    d.mkdir(parents=True, exist_ok=True)
    return d


def _filter_path(filter_id: str) -> Path:
    return _filters_dir() / f"{filter_id}.yaml"


def list_filters() -> list[SavedFilter]:
    filters: list[SavedFilter] = []
    for p in sorted(_filters_dir().glob("*.yaml")):
        with open(p) as f:
            data = yaml.safe_load(f) or {}
        rows = [
            FilterRow(
                column=r["column"],
                operator=r["operator"],
                filter_value=r["filter_value"],
            )
            for r in data.get("rows", [])
        ]
        filters.append(
            SavedFilter(
                id=data.get("id", p.stem),
                name=data.get("name", ""),
                rows=rows,
            )
        )
    return filters


def get_filter(filter_id: str) -> SavedFilter | None:
    path = _filter_path(filter_id)
    if not path.exists():
        return None
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    rows = [
        FilterRow(
            column=r["column"],
            operator=r["operator"],
            filter_value=r["filter_value"],
        )
        for r in data.get("rows", [])
    ]
    return SavedFilter(
        id=data.get("id", filter_id),
        name=data.get("name", ""),
        rows=rows,
    )


def create_filter(name: str, rows: list[dict[str, str]]) -> SavedFilter:
    with _filters_lock:
        filter_id = uuid.uuid4().hex[:12]
        filter_rows = [
            FilterRow(
                column=r["column"],
                operator=r["operator"],
                filter_value=r["filter_value"],
            )
            for r in rows
        ]
        saved = SavedFilter(id=filter_id, name=name, rows=filter_rows)
        _save_filter(saved)
        return saved


def update_filter(filter_id: str, name: str, rows: list[dict[str, str]]) -> SavedFilter:
    with _filters_lock:
        existing = get_filter(filter_id)
        if existing is None:
            raise ValueError(f"Filter {filter_id} not found.")
        filter_rows = [
            FilterRow(
                column=r["column"],
                operator=r["operator"],
                filter_value=r["filter_value"],
            )
            for r in rows
        ]
        saved = SavedFilter(id=filter_id, name=name, rows=filter_rows)
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
            }
            for r in saved.rows
        ],
    }
    with tempfile.NamedTemporaryFile(
        mode="w", dir=path.parent, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(data, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)
