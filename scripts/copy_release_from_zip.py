#!/usr/bin/env python3
"""Copy the deployable release files from a ZIP without touching runtime data."""

from __future__ import annotations

import argparse
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy backend and frontend release files from a ZIP."
    )
    parser.add_argument("zip_path", type=Path, help="Path to the release ZIP.")
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="Destination project root (defaults to the repository root).",
    )
    parser.add_argument(
        "--copy-project-config",
        action="store_true",
        help="Also replace the destination .config file.",
    )
    return parser.parse_args()


def validate_zip_members(archive: zipfile.ZipFile) -> None:
    for member in archive.infolist():
        member_path = Path(member.filename)
        if member_path.is_absolute() or ".." in member_path.parts:
            raise ValueError(f"Unsafe ZIP member path: {member.filename}")
        mode = (member.external_attr >> 16) & 0xFFFF
        if stat.S_IFMT(mode) == stat.S_IFLNK:
            raise ValueError(f"Symlinks are not allowed in release ZIPs: {member.filename}")


def find_archive_root(extracted_root: Path) -> Path:
    matches = [
        path.parent.parent
        for path in extracted_root.rglob("manage.py")
        if path.parent.name == "backend"
    ]
    if len(matches) != 1:
        raise ValueError("The ZIP must contain exactly one backend/manage.py file.")
    return matches[0]


def copy_release(zip_path: Path, project_root: Path, copy_project_config: bool) -> None:
    zip_path = zip_path.expanduser().resolve()
    project_root = project_root.expanduser().resolve()
    if not zip_path.is_file():
        raise FileNotFoundError(zip_path)
    if not project_root.is_dir():
        raise NotADirectoryError(project_root)

    with tempfile.TemporaryDirectory(prefix="boat-control-release-") as temporary:
        extracted_root = Path(temporary)
        with zipfile.ZipFile(zip_path) as archive:
            validate_zip_members(archive)
            archive.extractall(extracted_root)

        archive_root = find_archive_root(extracted_root)
        required = (
            archive_root / "backend",
            archive_root / "frontend" / "dist",
            archive_root / "trigger.py",
            archive_root / "pyproject.toml",
        )
        missing = [str(path.relative_to(archive_root)) for path in required if not path.exists()]
        if missing:
            raise FileNotFoundError(
                "The ZIP is missing required release files: " + ", ".join(missing)
            )

        # These are the only destination paths permitted by this helper.
        shutil.copytree(archive_root / "backend", project_root / "backend", dirs_exist_ok=True)
        shutil.copytree(
            archive_root / "frontend" / "dist",
            project_root / "frontend" / "dist",
            dirs_exist_ok=True,
        )
        shutil.copy2(archive_root / "trigger.py", project_root / "trigger.py")
        shutil.copy2(archive_root / "pyproject.toml", project_root / "pyproject.toml")

        if copy_project_config:
            config = archive_root / ".config"
            if not config.is_file():
                raise FileNotFoundError("The ZIP does not contain .config.")
            shutil.copy2(config, project_root / ".config")


def main() -> int:
    args = parse_args()
    copy_release(args.zip_path, args.project_root, args.copy_project_config)
    print("Copied backend, frontend/dist, trigger.py, and pyproject.toml.")
    if args.copy_project_config:
        print("Copied .config. Root config/ and data/ were not touched.")
    else:
        print("Preserved the existing .config. Root config/ and data/ were not touched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
