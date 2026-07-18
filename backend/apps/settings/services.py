from __future__ import annotations

import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from django.conf import settings

_settings_lock = threading.Lock()

DEFAULT_SETTINGS: dict[str, Any] = {
    "preset_source_paths": [],
    "rules_config_path": "",
    "filters_config_path": "",
    "full_set_threshold": 2000,
}


@dataclass
class AppSettings:
    preset_source_paths: list[str] = field(default_factory=list)
    rules_config_path: str = ""
    filters_config_path: str = ""
    full_set_threshold: int = 2000


def _settings_path() -> Path:
    return settings.SETTINGS_FILE


def load_settings() -> AppSettings:
    target = _settings_path()
    if not target.exists():
        return AppSettings()

    with open(target) as f:
        data = yaml.safe_load(f) or {}

    return AppSettings(
        preset_source_paths=data.get("preset_source_paths", []),
        rules_config_path=data.get("rules_config_path", ""),
        filters_config_path=data.get("filters_config_path", ""),
        full_set_threshold=data.get("full_set_threshold", 2000),
    )


def save_settings(app_settings: AppSettings) -> None:
    target = _settings_path()
    target.parent.mkdir(parents=True, exist_ok=True)

    data: dict[str, Any] = {
        "preset_source_paths": app_settings.preset_source_paths,
        "rules_config_path": app_settings.rules_config_path,
        "filters_config_path": app_settings.filters_config_path,
        "full_set_threshold": app_settings.full_set_threshold,
    }

    import tempfile

    with tempfile.NamedTemporaryFile(
        mode="w", dir=target.parent, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(data, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)

    tmp_path.replace(target)


def update_settings(updates: dict[str, Any]) -> AppSettings:
    with _settings_lock:
        current = load_settings()
        if "preset_source_paths" in updates:
            current.preset_source_paths = updates["preset_source_paths"]
        if "rules_config_path" in updates:
            current.rules_config_path = updates["rules_config_path"]
        if "filters_config_path" in updates:
            current.filters_config_path = updates["filters_config_path"]
        if "full_set_threshold" in updates:
            val = updates["full_set_threshold"]
            if not isinstance(val, int) or val < 1:
                raise ValueError("full_set_threshold must be a positive integer")
            current.full_set_threshold = val
        save_settings(current)
        return current
