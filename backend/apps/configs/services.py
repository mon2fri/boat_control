from __future__ import annotations

import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

_NAME_RE = re.compile(r"^[a-zA-Z0-9_\- ]+$")
_MAX_NAME_LENGTH = 120


class ConfigNameError(ValueError):
    pass


class ConfigNotFoundError(ValueError):
    pass


class ConfigConflictError(ValueError):
    pass


@dataclass
class ConfigFile:
    name: str
    version: int
    content: dict[str, Any]


def validate_config_name(name: str) -> str:
    if not name or not name.strip():
        raise ConfigNameError("Configuration name must not be empty.")
    name = name.strip()
    if len(name) > _MAX_NAME_LENGTH:
        raise ConfigNameError(
            f"Configuration name must be at most {_MAX_NAME_LENGTH} characters."
        )
    if name in (".", ".."):
        raise ConfigNameError("Configuration name must not be '.' or '..'.")
    if "/" in name or "\\" in name:
        raise ConfigNameError("Configuration name must not contain path separators.")
    for ch in name:
        if ord(ch) < 32 or ch in ("<", ">", ":", '"', "|", "?", "*"):
            raise ConfigNameError(
                "Configuration name must not contain control characters or "
                "reserved characters."
            )
    if not _NAME_RE.match(name):
        raise ConfigNameError(
            "Configuration name may only contain letters, digits, spaces, "
            "hyphens, and underscores."
        )
    return name


def _config_path(directory: Path, name: str) -> Path:
    return directory / f"{name}.yaml"


def list_configs(directory: Path) -> list[ConfigFile]:
    directory.mkdir(parents=True, exist_ok=True)
    configs: list[ConfigFile] = []
    for p in sorted(directory.glob("*.yaml")):
        with open(p) as f:
            data = yaml.safe_load(f) or {}
        configs.append(
            ConfigFile(
                name=p.stem,
                version=data.get("_version", 1),
                content=data,
            )
        )
    return configs


def get_config(directory: Path, name: str) -> ConfigFile | None:
    path = _config_path(directory, name)
    if not path.exists():
        return None
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    return ConfigFile(
        name=name,
        version=data.get("_version", 1),
        content=data,
    )


def create_config(
    directory: Path, name: str, content: dict[str, Any]
) -> ConfigFile:
    valid_name = validate_config_name(name)
    path = _config_path(directory, valid_name)
    if path.exists():
        raise ConfigNameError(
            f"A configuration named '{valid_name}' already exists."
        )
    data = dict(content)
    data["_version"] = 1
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", dir=directory, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(data, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)
    return ConfigFile(name=valid_name, version=1, content=data)


def update_config(
    directory: Path, name: str, content: dict[str, Any], expected_version: int
) -> ConfigFile:
    valid_name = validate_config_name(name)
    path = _config_path(directory, valid_name)
    if not path.exists():
        raise ConfigNotFoundError(
            f"Configuration '{valid_name}' not found."
        )
    with open(path) as f:
        existing = yaml.safe_load(f) or {}
    current_version = existing.get("_version", 1)
    if current_version != expected_version:
        raise ConfigConflictError(
            f"Configuration '{valid_name}' has been modified by another "
            f"session. Expected version {expected_version}, "
            f"got {current_version}. Reload and try again."
        )
    data = dict(content)
    data["_version"] = current_version + 1
    with tempfile.NamedTemporaryFile(
        mode="w", dir=directory, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(data, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)
    return ConfigFile(
        name=valid_name, version=current_version + 1, content=data
    )


def delete_config(directory: Path, name: str) -> None:
    valid_name = validate_config_name(name)
    path = _config_path(directory, valid_name)
    if not path.exists():
        raise ConfigNotFoundError(
            f"Configuration '{valid_name}' not found."
        )
    path.unlink()
