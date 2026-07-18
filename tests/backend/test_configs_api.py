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
def tmp_settings_dir() -> Path:
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


@pytest.fixture
def tmp_rules_dir() -> Path:
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


@pytest.fixture
def tmp_filters_dir() -> Path:
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


class TestNamedSettingsConfigsAPI:
    def test_list_configs_empty(self, api_client: APIClient, tmp_settings_dir: Path) -> None:
        with override_settings(SETTINGS_CONFIG_DIR=tmp_settings_dir):
            resp = api_client.get("/api/settings/configs/")
            assert resp.status_code == 200
            assert resp.json() == []

    def test_create_and_get_config(self, api_client: APIClient, tmp_settings_dir: Path) -> None:
        with override_settings(SETTINGS_CONFIG_DIR=tmp_settings_dir):
            content = {
                "preset_source_paths": [],
                "rules_config_path": "",
                "filters_config_path": "",
                "full_set_threshold": 5000,
            }
            create_resp = api_client.post(
                "/api/settings/configs/",
                {"name": "prod", "content": content},
                format="json",
            )
            assert create_resp.status_code == 201
            name = create_resp.json()["name"]
            assert name == "prod"

            list_resp = api_client.get("/api/settings/configs/")
            assert len(list_resp.json()) == 1

            get_resp = api_client.get(f"/api/settings/configs/{name}/")
            assert get_resp.status_code == 200
            assert get_resp.json()["content"]["full_set_threshold"] == 5000

    def test_create_invalid_name(self, api_client: APIClient, tmp_settings_dir: Path) -> None:
        with override_settings(SETTINGS_CONFIG_DIR=tmp_settings_dir):
            resp = api_client.post(
                "/api/settings/configs/",
                {"name": "../evil", "content": {}},
                format="json",
            )
            assert resp.status_code == 400

    def test_update_with_version(self, api_client: APIClient, tmp_settings_dir: Path) -> None:
        with override_settings(SETTINGS_CONFIG_DIR=tmp_settings_dir):
            create_resp = api_client.post(
                "/api/settings/configs/",
                {"name": "cfg1", "content": {"threshold": 100}},
                format="json",
            )
            assert create_resp.status_code == 201
            version = create_resp.json()["version"]

            update_resp = api_client.put(
                "/api/settings/configs/cfg1/",
                {"content": {"threshold": 200}, "version": version},
                format="json",
            )
            assert update_resp.status_code == 200
            assert update_resp.json()["version"] == version + 1

    def test_update_conflict(self, api_client: APIClient, tmp_settings_dir: Path) -> None:
        with override_settings(SETTINGS_CONFIG_DIR=tmp_settings_dir):
            api_client.post(
                "/api/settings/configs/",
                {"name": "conf", "content": {"v": 1}},
                format="json",
            )

            resp = api_client.put(
                "/api/settings/configs/conf/",
                {"content": {"v": 2}, "version": 999},
                format="json",
            )
            assert resp.status_code == 409

    def test_delete_config(self, api_client: APIClient, tmp_settings_dir: Path) -> None:
        with override_settings(SETTINGS_CONFIG_DIR=tmp_settings_dir):
            api_client.post(
                "/api/settings/configs/",
                {"name": "todel", "content": {}},
                format="json",
            )
            del_resp = api_client.delete("/api/settings/configs/todel/")
            assert del_resp.status_code == 204

            list_resp = api_client.get("/api/settings/configs/")
            assert len(list_resp.json()) == 0


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
