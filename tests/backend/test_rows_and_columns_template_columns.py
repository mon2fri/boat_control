from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from django.test.utils import override_settings
from rest_framework.test import APIClient  # type: ignore[import-untyped]

pytestmark = pytest.mark.django_db

FIELD = "commentaryTemplateColumns"


def _content(**overrides: object) -> dict[str, object]:
    content: dict[str, object] = {
        "keyColumns": [{"kind": "column", "name": "id"}],
        "extraColumns": [{"kind": "column", "name": "status"}],
    }
    content.update(overrides)
    return content


def test_missing_selection_is_normalized_to_empty_on_create_and_get(
    tmp_path: Path,
) -> None:
    client = APIClient()
    with override_settings(ROWS_AND_COLUMNS_CONFIG_DIR=tmp_path):
        created = client.post(
            "/api/rows-and-columns/configs/",
            {"name": "legacy", "content": _content()},
            format="json",
        )
        loaded = client.get("/api/rows-and-columns/configs/legacy/")

    assert created.status_code == 201, created.content
    assert loaded.status_code == 200
    assert loaded.json()["content"][FIELD] == []


def test_ordered_selection_roundtrips_independently_of_extra_columns(
    tmp_path: Path,
) -> None:
    selection = [
        {"kind": "column", "name": "region"},
        "score",
        {"kind": "column_family", "name": "Desk Family"},
    ]
    client = APIClient()
    with override_settings(ROWS_AND_COLUMNS_CONFIG_DIR=tmp_path):
        created = client.post(
            "/api/rows-and-columns/configs/",
            {
                "name": "ordered",
                "content": _content(**{FIELD: selection}),
            },
            format="json",
        )
        loaded = client.get("/api/rows-and-columns/configs/ordered/")

    assert created.status_code == 201
    content = loaded.json()["content"]
    assert content[FIELD] == selection
    # The existing Extra Column setting is preserved independently.
    assert content["extraColumns"] == [{"kind": "column", "name": "status"}]


def test_empty_selection_roundtrips_explicitly(tmp_path: Path) -> None:
    client = APIClient()
    with override_settings(ROWS_AND_COLUMNS_CONFIG_DIR=tmp_path):
        client.post(
            "/api/rows-and-columns/configs/",
            {"name": "empty-selection", "content": _content(**{FIELD: []})},
            format="json",
        )
        loaded = client.get("/api/rows-and-columns/configs/empty-selection/")

    assert loaded.status_code == 200
    assert loaded.json()["content"][FIELD] == []


def test_old_yaml_without_field_loads_as_empty_and_update_persists_it(
    tmp_path: Path,
) -> None:
    old_path = tmp_path / "old-layout.yaml"
    old_path.write_text(
        yaml.safe_dump(
            {
                "_version": 3,
                "keyColumns": ["id"],
                "extraColumns": ["status"],
            },
            sort_keys=False,
        )
    )
    client = APIClient()
    with override_settings(ROWS_AND_COLUMNS_CONFIG_DIR=tmp_path):
        loaded = client.get("/api/rows-and-columns/configs/old-layout/")
        updated = client.put(
            "/api/rows-and-columns/configs/old-layout/",
            {
                "version": 3,
                "content": {
                    "keyColumns": [{"kind": "column", "name": "id"}],
                    "extraColumns": [{"kind": "column", "name": "status"}],
                },
            },
            format="json",
        )

    assert loaded.status_code == 200
    assert loaded.json()["content"][FIELD] == []
    assert updated.status_code == 200
    stored = yaml.safe_load(old_path.read_text())
    assert stored[FIELD] == []
    assert stored["extraColumns"] == [{"kind": "column", "name": "status"}]


@pytest.mark.parametrize(
    ("selection", "message"),
    [
        ("region", "ordered list"),
        ([{"kind": "column", "name": ""}], "must not be empty"),
        ([{"kind": "column", "name": "A"}, "a"], "duplicate"),
        (["rule index"], "reserved template header"),
        ([42], "column name or column reference"),
    ],
)
def test_invalid_selection_is_rejected(
    tmp_path: Path, selection: object, message: str
) -> None:
    client = APIClient()
    with override_settings(ROWS_AND_COLUMNS_CONFIG_DIR=tmp_path):
        response = client.post(
            "/api/rows-and-columns/configs/",
            {"name": "bad", "content": _content(**{FIELD: selection})},
            format="json",
        )

    assert response.status_code == 400
    if message:
        assert message in response.json()["error"]


def test_source_status_column_saves_and_passes_run_validation(tmp_path: Path) -> None:
    from apps.runs.template_columns import validate_concrete_columns

    selection = [{"kind": "column", "name": "status"}]
    client = APIClient()
    with override_settings(ROWS_AND_COLUMNS_CONFIG_DIR=tmp_path):
        created = client.post(
            "/api/rows-and-columns/configs/",
            {"name": "status-source", "content": _content()}, format="json",
        )
        assert created.status_code == 201, created.content
        updated = client.put(
            "/api/rows-and-columns/configs/status-source/",
            {"version": created.json()["version"], "content": _content(**{FIELD: selection})},
            format="json",
        )
    assert updated.status_code == 200, updated.content
    assert updated.json()["content"][FIELD] == selection
    assert validate_concrete_columns(["name", "status", "region"]) == [
        "name", "status", "region"
    ]
