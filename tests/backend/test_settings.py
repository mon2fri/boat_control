from pathlib import Path

import pytest
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
    "exception_tracking_path": "data/exception_tracking.db",
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


def _settings_override(tmp_path: Path, **extra: object):  # type: ignore[no-untyped-def]
    values = {
        "BASE_DIR": tmp_path,
        "SETTINGS_FILE": tmp_path / ".config",
        "RULES_CONFIG_DIR": tmp_path / "config/rules",
        "ROWS_AND_COLUMNS_CONFIG_DIR": tmp_path / "config/rows_and_columns",
        "FILTERS_CONFIG_DIR": tmp_path / "config/filters",
        "FAMILY_CONFIG_DIR": tmp_path / "config/families",
        "RESULTS_DIR": tmp_path / "data/results",
    }
    values.update(extra)
    return override_settings(**values)


def test_settings_relative_tracking_path_is_persisted_verbatim(tmp_path: Path) -> None:
    payload = {**EXPECTED_DEFAULTS, "exception_tracking_path": "data/custom-tracking.db"}
    config_file = tmp_path / ".config"
    with _settings_override(tmp_path):
        response = APIClient().put("/api/settings/", payload, format="json")

    assert response.status_code == 200
    assert response.json()["exception_tracking_path"] == "data/custom-tracking.db"
    assert yaml.safe_load(config_file.read_text())["exception_tracking_path"] == (
        "data/custom-tracking.db"
    )
    assert (tmp_path / "data" / "custom-tracking.db").parent.is_dir()


def test_settings_linux_absolute_tracking_path_is_not_rewritten(tmp_path: Path) -> None:
    absolute = tmp_path / "elsewhere" / "tracking.db"
    payload = {**EXPECTED_DEFAULTS, "exception_tracking_path": str(absolute)}
    config_file = tmp_path / ".config"
    with _settings_override(tmp_path):
        response = APIClient().put("/api/settings/", payload, format="json")

    assert response.status_code == 200
    stored = yaml.safe_load(config_file.read_text())["exception_tracking_path"]
    assert stored == str(absolute)
    assert not stored.startswith(str(tmp_path / "data"))
    assert absolute.parent.is_dir()


def test_settings_rejects_tracking_path_whose_parent_is_a_file(tmp_path: Path) -> None:
    blocker = tmp_path / "not-a-directory"
    blocker.write_text("x")
    payload = {**EXPECTED_DEFAULTS, "exception_tracking_path": str(blocker / "tracking.db")}
    with _settings_override(tmp_path):
        response = APIClient().put("/api/settings/", payload, format="json")

    assert response.status_code == 400
    assert "exception tracking" in response.json()["error"].lower()


def test_settings_rejects_tracking_path_that_is_a_directory(tmp_path: Path) -> None:
    payload = {**EXPECTED_DEFAULTS, "exception_tracking_path": str(tmp_path)}
    with _settings_override(tmp_path):
        response = APIClient().put("/api/settings/", payload, format="json")

    assert response.status_code == 400
    assert "directory" in response.json()["error"].lower()


def test_settings_rejects_foreign_windows_path_on_this_host(tmp_path: Path) -> None:
    import os

    if os.name == "nt":
        pytest.skip("This assertion is for a non-Windows host")
    payload = {**EXPECTED_DEFAULTS, "exception_tracking_path": r"C:\data\tracking.db"}
    config_file = tmp_path / ".config"
    with _settings_override(tmp_path):
        response = APIClient().put("/api/settings/", payload, format="json")

    assert response.status_code == 400
    assert "Windows absolute path" in response.json()["error"]
    assert not config_file.exists()
