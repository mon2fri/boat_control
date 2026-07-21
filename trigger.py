#!/usr/bin/env python
"""Boat Control target-machine launcher.

Run ``python trigger.py`` after deploying a prebuilt release. This launcher
uses the bundled ``frontend/dist`` files and starts Django only; it never
runs npm, Vite, uv sync, or a package installer.

Required before launch:

* a Python environment with the project's dependencies already installed;
* the prebuilt ``frontend/dist/index.html`` and assets; and
* the project-root ``.config`` and configuration files.

Set ``BOAT_CONTROL_PYTHON`` to the deployed Python executable when the
environment is not located at ``.venv``. ``BOAT_CONTROL_HOST`` and
``BOAT_CONTROL_PORT`` default to ``0.0.0.0`` and ``8000`` respectively.
"""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_DIR / "backend"
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"


def info(message: str) -> None:
    print(f"[trigger] {message}", flush=True)


def deployed_python() -> Path:
    configured = os.environ.get("BOAT_CONTROL_PYTHON")
    if configured:
        executable = Path(configured)
    elif os.name == "nt":
        executable = PROJECT_DIR / ".venv" / "Scripts" / "python.exe"
    else:
        executable = PROJECT_DIR / ".venv" / "bin" / "python"

    if not executable.is_file():
        raise SystemExit(
            "[trigger] No deployed Python environment found. Set BOAT_CONTROL_PYTHON "
            "or deploy .venv with the application's Python dependencies."
        )
    return executable


def require_release_files() -> None:
    required = {
        "backend/manage.py": BACKEND_DIR / "manage.py",
        "frontend/dist/index.html": FRONTEND_DIST / "index.html",
        ".config": PROJECT_DIR / ".config",
    }
    missing = [name for name, path in required.items() if not path.is_file()]
    if missing:
        raise SystemExit(
            "[trigger] Deployment is incomplete; missing: " + ", ".join(missing)
        )


def run(command: Sequence[str]) -> None:
    info("$ " + " ".join(command))
    completed = subprocess.run(command, cwd=PROJECT_DIR)
    if completed.returncode != 0:
        raise SystemExit(f"[trigger] Command exited with status {completed.returncode}.")


def main() -> int:
    require_release_files()
    python = deployed_python()
    host = os.environ.get("BOAT_CONTROL_HOST", "0.0.0.0")
    port = os.environ.get("BOAT_CONTROL_PORT", "8000")

    if os.environ.get("BOAT_CONTROL_SKIP_MIGRATIONS") != "1":
        info("Applying local database migrations...")
        run(
            [
                str(python),
                str(BACKEND_DIR / "manage.py"),
                "migrate",
                "--settings=boat_control.settings",
                "--noinput",
            ]
        )

    command = [
        str(python),
        str(BACKEND_DIR / "manage.py"),
        "runserver",
        f"{host}:{port}",
        "--noreload",
        "--settings=boat_control.settings",
    ]
    info(f"Starting Boat Control at http://{host}:{port}/")
    info("Using prebuilt frontend files; npm and Vite are not required.")
    os.execv(str(python), command)
    return 0  # Unreachable, retained for type checkers.


if __name__ == "__main__":
    sys.exit(main())
