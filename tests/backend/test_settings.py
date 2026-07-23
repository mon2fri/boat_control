from pathlib import Path

import yaml
from django.test.utils import override_settings
from rest_framework.test import APIClient

EXPECTED_DEFAULTS = {
    "application_name": "Boat Control",
    "default_remote_path": "",
    "rule_config_path": "config/rules",
    "rows_and_columns_config_path": "config/rows_and_columns",
    "filter_config_path": "config/filters",
    "family_config_path": "config/families",
    "full_set_confirmation_rows": 2000,
    "run_history_path": "data/results",
}


def test_settings_defaults_come_from_project_config(tmp_path: Path) -> None:
    config_file = tmp_path / ".config"
    config_file.write_text(yaml.safe_dump(EXPECTED_DEFAULTS))
    with override_settings(SETTINGS_FILE=config_file):
        response = APIClient().get("/api/settings/")
    assert response.status_code == 200
    assert response.json() == EXPECTED_DEFAULTS


def test_settings_put_updates_root_config(tmp_path: Path) -> None:
    config_file = tmp_path / ".config"
    payload = {
        **EXPECTED_DEFAULTS,
        "application_name": "Data Review",
        "default_remote_path": "/srv/files",
        "full_set_confirmation_rows": 3500,
    }
    with override_settings(
        BASE_DIR=tmp_path,
        SETTINGS_FILE=config_file,
        RULES_CONFIG_DIR=tmp_path / "config/rules",
        ROWS_AND_COLUMNS_CONFIG_DIR=tmp_path / "config/rows_and_columns",
        FILTERS_CONFIG_DIR=tmp_path / "config/filters",
        RESULTS_DIR=tmp_path / "data/results",
    ):
        response = APIClient().put("/api/settings/", payload, format="json")

    assert response.status_code == 200
    assert yaml.safe_load(config_file.read_text()) == payload


def test_settings_rejects_non_integer_confirmation_rows(tmp_path: Path) -> None:
    with override_settings(SETTINGS_FILE=tmp_path / ".config"):
        response = APIClient().put(
            "/api/settings/",
            {"full_set_confirmation_rows": "12.5"},
            format="json",
        )
    assert response.status_code == 400
