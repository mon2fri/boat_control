from __future__ import annotations

import tempfile
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import yaml
from django.conf import settings

_settings_lock = threading.Lock()

DEFAULT_SETTINGS: dict[str, Any] = {
    "application_name": "Boat Control",
    "default_remote_path": "",
    "rule_config_path": "config/rules",
    "rows_and_columns_config_path": "config/rows_and_columns",
    "filter_config_path": "config/filters",
    "full_set_confirmation_rows": 2000,
    "run_history_path": "data/results",
}


@dataclass
class AppSettings:
    application_name: str = "Boat Control"
    default_remote_path: str = ""
    rule_config_path: str = "config/rules"
    rows_and_columns_config_path: str = "config/rows_and_columns"
    filter_config_path: str = "config/filters"
    full_set_confirmation_rows: int = 2000
    run_history_path: str = "data/results"

    @property
    def preset_source_paths(self) -> list[str]:
        """Compatibility view used by the remote-source service."""
        return [self.default_remote_path] if self.default_remote_path.strip() else []


def _settings_path() -> Path:
    return Path(settings.SETTINGS_FILE)


def _project_path(value: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = Path(settings.BASE_DIR) / path
    return path.resolve()


def _configured_path(value: str, setting_name: str, default: str) -> Path:
    """Resolve a .config path while retaining explicit Django test overrides."""
    configured = _project_path(value)
    django_path = Path(getattr(settings, setting_name)).resolve()
    default_path = _project_path(default)
    return django_path if django_path != default_path else configured


def load_settings() -> AppSettings:
    target = _settings_path()
    data: dict[str, Any] = {}
    if target.exists():
        with open(target) as file:
            loaded = yaml.safe_load(file) or {}
        if isinstance(loaded, dict):
            data = loaded

    values = {**DEFAULT_SETTINGS, **data}
    threshold = values["full_set_confirmation_rows"]
    if not isinstance(threshold, int) or isinstance(threshold, bool) or threshold < 1:
        threshold = DEFAULT_SETTINGS["full_set_confirmation_rows"]

    return AppSettings(
        application_name=str(values["application_name"]),
        default_remote_path=str(values["default_remote_path"]),
        rule_config_path=str(values["rule_config_path"]),
        rows_and_columns_config_path=str(values["rows_and_columns_config_path"]),
        filter_config_path=str(values["filter_config_path"]),
        full_set_confirmation_rows=threshold,
        run_history_path=str(values["run_history_path"]),
    )


def save_settings(app_settings: AppSettings) -> None:
    target = _settings_path()
    target.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(
        mode="w", dir=target.parent, delete=False, suffix=".config"
    ) as temporary:
        yaml.safe_dump(
            asdict(app_settings),
            temporary,
            default_flow_style=False,
            sort_keys=False,
        )
        temporary_path = Path(temporary.name)
    temporary_path.replace(target)

    # Managed application directories are created after a successful save.
    get_rule_config_dir(app_settings).mkdir(parents=True, exist_ok=True)
    get_rows_and_columns_config_dir(app_settings).mkdir(parents=True, exist_ok=True)
    get_filter_config_dir(app_settings).mkdir(parents=True, exist_ok=True)
    get_run_history_dir(app_settings).mkdir(parents=True, exist_ok=True)


def update_settings(updates: dict[str, Any]) -> AppSettings:
    with _settings_lock:
        current = load_settings()
        for field_name in DEFAULT_SETTINGS:
            if field_name in updates:
                setattr(current, field_name, updates[field_name])

        threshold = current.full_set_confirmation_rows
        if (
            not isinstance(threshold, int)
            or isinstance(threshold, bool)
            or threshold < 1
        ):
            raise ValueError("full_set_confirmation_rows must be a positive integer")
        if not current.application_name.strip():
            raise ValueError("application_name must not be empty")
        for field_name in (
            "rule_config_path",
            "rows_and_columns_config_path",
            "filter_config_path",
            "run_history_path",
        ):
            if not str(getattr(current, field_name)).strip():
                raise ValueError(f"{field_name} must not be empty")

        save_settings(current)
        return current


def get_rule_config_dir(app_settings: AppSettings | None = None) -> Path:
    current = app_settings or load_settings()
    return _configured_path(current.rule_config_path, "RULES_CONFIG_DIR", "config/rules")


def get_rules_file(app_settings: AppSettings | None = None) -> Path:
    current = app_settings or load_settings()
    configured_dir = get_rule_config_dir(current)
    django_file = Path(settings.RULES_FILE).resolve()
    default_file = _project_path("config/rules/rules.yaml")
    return django_file if django_file != default_file else configured_dir / "rules.yaml"


def get_rows_and_columns_config_dir(app_settings: AppSettings | None = None) -> Path:
    current = app_settings or load_settings()
    return _configured_path(
        current.rows_and_columns_config_path,
        "ROWS_AND_COLUMNS_CONFIG_DIR",
        "config/rows_and_columns",
    )


def get_filter_config_dir(app_settings: AppSettings | None = None) -> Path:
    current = app_settings or load_settings()
    return _configured_path(current.filter_config_path, "FILTERS_CONFIG_DIR", "config/filters")


def get_saved_filters_dir(app_settings: AppSettings | None = None) -> Path:
    current = app_settings or load_settings()
    configured_dir = get_filter_config_dir(current)
    django_dir = Path(settings.FILTERS_DIR).resolve()
    default_dir = _project_path("config/filters")
    return django_dir if django_dir != default_dir else configured_dir


def get_run_history_dir(app_settings: AppSettings | None = None) -> Path:
    current = app_settings or load_settings()
    return _configured_path(current.run_history_path, "RESULTS_DIR", "data/results")
