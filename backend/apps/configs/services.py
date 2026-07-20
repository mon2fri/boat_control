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
    content: Any


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


def _wrap_for_storage(content: Any) -> dict[str, Any]:
    """Wrap content in a dict so ``_version`` can be persisted alongside it.

    The on-disk YAML is always a top-level mapping. Callers may pass a
    mapping directly, or a list (e.g. a rules array), in which case it
    is stored under the ``items`` key. The original ``content`` is returned
    to API consumers unchanged by ``_unwrap_from_storage`` on read.
    """
    if isinstance(content, list):
        return {"items": content}
    if not isinstance(content, dict):
        raise ConfigNameError(
            "Configuration content must be a JSON object or array."
        )
    return dict(content)


def _unwrap_from_storage(data: Any) -> Any:
    """Strip the storage envelope and ``_version`` so callers see the
    content they originally saved."""
    if not isinstance(data, dict):
        return data
    if "items" in data and len(data) == 2 and "_version" in data:
        return data["items"]
    return {k: v for k, v in data.items() if k != "_version"}


def list_configs(directory: Path) -> list[ConfigFile]:
    directory.mkdir(parents=True, exist_ok=True)
    configs: list[ConfigFile] = []
    for p in sorted(directory.glob("*.yaml")):
        with open(p) as f:
            data = yaml.safe_load(f) or {}
        if not isinstance(data, dict):
            continue
        configs.append(
            ConfigFile(
                name=p.stem,
                version=data.get("_version", 1),
                content=_unwrap_from_storage(data),
            )
        )
    return configs


def get_config(directory: Path, name: str) -> ConfigFile | None:
    path = _config_path(directory, name)
    if not path.exists():
        return None
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        return None
    return ConfigFile(
        name=name,
        version=data.get("_version", 1),
        content=_unwrap_from_storage(data),
    )


def create_config(
    directory: Path, name: str, content: Any
) -> ConfigFile:
    valid_name = validate_config_name(name)
    path = _config_path(directory, valid_name)
    if path.exists():
        raise ConfigNameError(
            f"A configuration named '{valid_name}' already exists."
        )
    data = _wrap_for_storage(content)
    data["_version"] = 1
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", dir=directory, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(data, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)
    return ConfigFile(name=valid_name, version=1, content=content)


def update_config(
    directory: Path, name: str, content: Any, expected_version: int
) -> ConfigFile:
    valid_name = validate_config_name(name)
    path = _config_path(directory, valid_name)
    if not path.exists():
        raise ConfigNotFoundError(
            f"Configuration '{valid_name}' not found."
        )
    with open(path) as f:
        existing = yaml.safe_load(f) or {}
    current_version = (
        existing.get("_version", 1) if isinstance(existing, dict) else 1
    )
    if current_version != expected_version:
        raise ConfigConflictError(
            f"Configuration '{valid_name}' has been modified by another "
            f"session. Expected version {expected_version}, "
            f"got {current_version}. Reload and try again."
        )
    data = _wrap_for_storage(content)
    data["_version"] = current_version + 1
    with tempfile.NamedTemporaryFile(
        mode="w", dir=directory, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(data, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)
    return ConfigFile(
        name=valid_name, version=current_version + 1, content=content
    )


def delete_config(directory: Path, name: str) -> None:
    valid_name = validate_config_name(name)
    path = _config_path(directory, valid_name)
    if not path.exists():
        raise ConfigNotFoundError(
            f"Configuration '{valid_name}' not found."
        )
    path.unlink()
