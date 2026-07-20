from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from django.test.utils import override_settings
from rest_framework.test import APIClient


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def tmp_rules_dir() -> Path:
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


@pytest.fixture
def tmp_filters_dir() -> Path:
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


@pytest.fixture
def tmp_rows_and_columns_dir() -> Path:
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


class TestNamedRulesConfigsAPI:
    def test_create_and_list(self, api_client: APIClient, tmp_rules_dir: Path) -> None:
        with override_settings(RULES_CONFIG_DIR=tmp_rules_dir):
            resp = api_client.post(
                "/api/rules/configs/",
                {"name": "my-rules", "content": {"version": 1, "rules": []}},
                format="json",
            )
            assert resp.status_code == 201

            list_resp = api_client.get("/api/rules/configs/")
            assert len(list_resp.json()) == 1

    def test_create_with_list_content(
        self, api_client: APIClient, tmp_rules_dir: Path
    ) -> None:
        """Saving a rules config sends the rules array as content; the API
        must accept the list and return 201 instead of 500."""
        with override_settings(RULES_CONFIG_DIR=tmp_rules_dir):
            rules = [
                {"rule_id": "R001", "name": "Active status", "logic": {}},
                {"rule_id": "R002", "name": "Low score", "logic": {}},
            ]
            resp = api_client.post(
                "/api/rules/configs/",
                {"name": "my-rules", "content": rules},
                format="json",
            )
            assert resp.status_code == 201, resp.content
            assert resp.json() == {"name": "my-rules", "version": 1}

            detail = api_client.get("/api/rules/configs/my-rules/")
            assert detail.status_code == 200
            assert detail.json()["content"] == rules
            assert detail.json()["version"] == 1


class TestNamedFiltersConfigsAPI:
    def test_create_and_list(self, api_client: APIClient, tmp_filters_dir: Path) -> None:
        with override_settings(FILTERS_CONFIG_DIR=tmp_filters_dir):
            resp = api_client.post(
                "/api/filters/configs/",
                {"name": "my-filters", "content": {"rows": []}},
                format="json",
            )
            assert resp.status_code == 201

            list_resp = api_client.get("/api/filters/configs/")
            assert len(list_resp.json()) == 1


class TestRowsAndColumnsConfigsAPI:
    def test_create_and_list(
        self, api_client: APIClient, tmp_rows_and_columns_dir: Path
    ) -> None:
        with override_settings(ROWS_AND_COLUMNS_CONFIG_DIR=tmp_rows_and_columns_dir):
            response = api_client.post(
                "/api/rows-and-columns/configs/",
                {"name": "layout", "content": {"keyColumns": ["id"]}},
                format="json",
            )
            assert response.status_code == 201

            listed = api_client.get("/api/rows-and-columns/configs/")
            assert len(listed.json()) == 1
