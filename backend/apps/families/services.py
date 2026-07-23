from __future__ import annotations

import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from apps.settings.services import get_family_config_dir

_FAMILY_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


class FamilyNameError(ValueError):
    pass


class FamilyNotFoundError(ValueError):
    pass


class FamilyConflictError(ValueError):
    pass


@dataclass
class ColumnFamily:
    kind: str = "column"
    name: str = ""
    columns: list[str] | None = None

    def __post_init__(self) -> None:
        if self.columns is None:
            self.columns = []


@dataclass
class ValueFamilyOwner:
    kind: str  # "column" | "column_family"
    name: str


@dataclass
class ValueFamily:
    kind: str = "value"
    name: str = ""
    owner: ValueFamilyOwner | None = None
    values: list[str] | None = None

    def __post_init__(self) -> None:
        if self.values is None:
            self.values = []


def _validate_name(name: str) -> str:
    if not name or not name.strip():
        raise FamilyNameError("Family name must not be empty.")
    name = name.strip()
    if not _FAMILY_NAME_RE.match(name):
        raise FamilyNameError(
            "Family name must start with a letter and contain only "
            "letters, digits, and underscores."
        )
    return name


def _family_path(directory: Path, name: str) -> Path:
    return directory / f"{name}.yaml"


def _validate_record(data: dict[str, Any]) -> dict[str, Any]:
    kind = data.get("kind")
    if kind not in ("column", "value"):
        raise FamilyNameError("Family kind must be 'column' or 'value'.")

    name = data.get("name", "")
    _validate_name(name)

    if kind == "column":
        columns = data.get("columns")
        if not isinstance(columns, list) or len(columns) < 1:
            raise FamilyNameError(
                "Column family must contain at least one column."
            )
        for c in columns:
            if not isinstance(c, str) or not c.strip():
                raise FamilyNameError(
                    "Each column in a column family must be a non-empty string."
                )
        seen: list[str] = []
        for c in columns:
            if c not in seen:
                seen.append(c)
        data["columns"] = seen
        if "owner" in data:
            del data["owner"]
    elif kind == "value":
        owner = data.get("owner")
        if not isinstance(owner, dict):
            raise FamilyNameError(
                "Value family must have an owner with 'kind' and 'name'."
            )
        if owner.get("kind") not in ("column", "column_family"):
            raise FamilyNameError(
                "Value family owner kind must be 'column' or 'column_family'."
            )
        if not isinstance(owner.get("name"), str) or not owner["name"].strip():
            raise FamilyNameError(
                "Value family owner name must be a non-empty string."
            )
        values = data.get("values")
        if not isinstance(values, list) or len(values) < 1:
            raise FamilyNameError(
                "Value family must contain at least one value."
            )
        for v in values:
            if not isinstance(v, str):
                raise FamilyNameError(
                    "Each value in a value family must be a string."
                )
        seen_v: list[str] = []
        for v in values:
            if v not in seen_v:
                seen_v.append(v)
        data["values"] = seen_v
    return data


def list_families(directory: Path | None = None) -> list[dict[str, Any]]:
    if directory is None:
        directory = get_family_config_dir()
    directory.mkdir(parents=True, exist_ok=True)
    families: list[dict[str, Any]] = []
    for p in sorted(directory.glob("*.yaml")):
        try:
            with open(p) as f:
                data = yaml.safe_load(f) or {}
            if not isinstance(data, dict):
                continue
            validated = _validate_record(data)
            validated["name"] = p.stem
            families.append(validated)
        except Exception:
            continue
    return families


def get_family(name: str, directory: Path | None = None) -> dict[str, Any] | None:
    if directory is None:
        directory = get_family_config_dir()
    path = _family_path(directory, name)
    if not path.exists():
        return None
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        return None
    try:
        return _validate_record(data)
    except FamilyNameError:
        return None


def create_family(
    data: dict[str, Any], directory: Path | None = None
) -> dict[str, Any]:
    if directory is None:
        directory = get_family_config_dir()
    validated = _validate_record(data)
    name = validated["name"]
    path = _family_path(directory, name)
    if path.exists():
        raise FamilyNameError(
            f"A family named '{name}' already exists."
        )
    directory.mkdir(parents=True, exist_ok=True)
    record = {k: v for k, v in validated.items() if v is not None}
    record["_version"] = 1
    with tempfile.NamedTemporaryFile(
        mode="w", dir=directory, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(record, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)
    return validated


def update_family(
    name: str, data: dict[str, Any], expected_version: int,
    directory: Path | None = None,
) -> dict[str, Any]:
    if directory is None:
        directory = get_family_config_dir()
    validated = _validate_record(data)
    validated["name"] = name
    path = _family_path(directory, name)
    if not path.exists():
        raise FamilyNotFoundError(f"Family '{name}' not found.")
    with open(path) as f:
        existing = yaml.safe_load(f) or {}
    current_version = (
        existing.get("_version", 1) if isinstance(existing, dict) else 1
    )
    if current_version != expected_version:
        raise FamilyConflictError(
            f"Family '{name}' has been modified by another "
            f"session. Expected version {expected_version}, "
            f"got {current_version}. Reload and try again."
        )
    record = {k: v for k, v in validated.items() if v is not None}
    record["_version"] = current_version + 1
    with tempfile.NamedTemporaryFile(
        mode="w", dir=directory, delete=False, suffix=".yaml"
    ) as tmp:
        yaml.dump(record, tmp, default_flow_style=False, sort_keys=False)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)
    return validated


def delete_family(name: str, directory: Path | None = None) -> None:
    if directory is None:
        directory = get_family_config_dir()
    path = _family_path(directory, name)
    if not path.exists():
        raise FamilyNotFoundError(f"Family '{name}' not found.")
    path.unlink()
