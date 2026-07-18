from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from apps.settings.services import load_settings


@dataclass
class PresetSource:
    id: str
    name: str
    description: str | None
    kind: str  # "single" | "pair"
    file_a: Path
    file_b: Path | None
    root: Path


def list_preset_sources() -> list[dict[str, Any]]:
    settings = load_settings()
    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    for root_str in settings.preset_source_paths:
        root = Path(root_str).resolve()
        if not root.is_dir():
            continue

        preset_yaml = root / "preset.yaml"
        if preset_yaml.is_file():
            preset = _load_preset_yaml(preset_yaml, root)
            if preset is not None and preset.id not in seen:
                seen.add(preset.id)
                results.append(_preset_to_dict(preset))
        else:
            preset = _infer_preset_from_dir(root)
            if preset is not None and preset.id not in seen:
                seen.add(preset.id)
                results.append(_preset_to_dict(preset))

    return results


def get_preset_source(preset_id: str) -> PresetSource | None:
    settings = load_settings()

    for root_str in settings.preset_source_paths:
        root = Path(root_str).resolve()
        if not root.is_dir():
            continue

        preset_yaml = root / "preset.yaml"
        if preset_yaml.is_file():
            preset = _load_preset_yaml(preset_yaml, root)
            if preset is not None and preset.id == preset_id:
                return preset
        else:
            preset = _infer_preset_from_dir(root)
            if preset is not None and preset.id == preset_id:
                return preset

    return None


def list_source_files(source_id: str) -> list[dict[str, Any]]:
    settings = load_settings()
    for root_str in settings.preset_source_paths:
        root = Path(root_str).resolve()
        if not root.is_dir():
            continue

        source_name = _resolve_source_name(root)
        if source_name != source_id:
            continue

        files: list[dict[str, Any]] = []
        for csv_path in sorted(root.glob("*.csv")):
            rel = csv_path.relative_to(root)
            file_id = _opaque_file_id(root, rel)
            files.append({
                "id": file_id,
                "name": csv_path.name,
                "size": csv_path.stat().st_size,
            })
        return files

    return []


def resolve_file_id(file_id: str) -> Path | None:
    settings = load_settings()
    for root_str in settings.preset_source_paths:
        root = Path(root_str).resolve()
        if not root.is_dir():
            continue
        for csv_path in root.rglob("*.csv"):
            try:
                rel = csv_path.relative_to(root)
            except ValueError:
                continue
            if _opaque_file_id(root, rel) == file_id:
                _check_path_safe(csv_path, root)
                return csv_path
    return None


def _resolve_source_name(root: Path) -> str:
    preset_yaml = root / "preset.yaml"
    if preset_yaml.is_file():
        with open(preset_yaml) as f:
            data = yaml.safe_load(f)
        if isinstance(data, dict) and "id" in data:
            return str(data["id"])
    return root.name


def _opaque_file_id(root: Path, relative_path: Path) -> str:
    raw = f"{root}:{relative_path}".encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def _load_preset_yaml(path: Path, root: Path) -> PresetSource | None:
    with open(path) as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        return None

    pid = str(data.get("id", root.name))
    name = str(data.get("name", root.name))
    description = data.get("description")
    kind = str(data.get("kind", "pair"))
    file_a_rel = str(data.get("file_a", ""))
    file_b_rel = str(data.get("file_b")) if data.get("file_b") else None

    file_a = (root / file_a_rel).resolve()
    _check_path_safe(file_a, root)

    file_b: Path | None = None
    if file_b_rel:
        file_b = (root / file_b_rel).resolve()
        _check_path_safe(file_b, root)

    return PresetSource(
        id=pid,
        name=name,
        description=description or None,
        kind=kind,
        file_a=file_a,
        file_b=file_b,
        root=root,
    )


def _infer_preset_from_dir(root: Path) -> PresetSource | None:
    csv_files = sorted(root.glob("*.csv"))
    if not csv_files:
        return None

    file_a = csv_files[0]
    file_b = csv_files[1] if len(csv_files) > 1 else None
    kind = "pair" if file_b else "single"

    return PresetSource(
        id=root.name,
        name=root.name,
        description=None,
        kind=kind,
        file_a=file_a,
        file_b=file_b,
        root=root,
    )


def _check_path_safe(resolved: Path, root: Path) -> None:
    if not str(resolved).startswith(str(root)):
        raise ValueError(f"Path {resolved} escapes root {root}")


def _preset_to_dict(preset: PresetSource) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": preset.id,
        "name": preset.name,
        "kind": preset.kind,
    }
    if preset.description:
        d["description"] = preset.description
    return d
