"""Initialize persistent state, migrate, and replace this process with Gunicorn."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path("/app")
port = int(os.environ.get("BOAT_CONTROL_PORT", "45303"))
if not 1 <= port <= 65535:
    raise SystemExit("BOAT_CONTROL_PORT must be between 1 and 65535")
settings_file = ROOT / "data" / ".config"
if not settings_file.exists():
    shutil.copyfile(ROOT / "default.config", settings_file)

for command in ("migrate", "migrate_rules_to_db"):
    args = [sys.executable, str(ROOT / "backend" / "manage.py"), command]
    if command == "migrate":
        args.append("--noinput")
    subprocess.run(args, check=True)

# A single worker preserves the application's process-local background state.
os.execvp("gunicorn", [
    "gunicorn", "boat_control.wsgi:application",
    "--bind", f"0.0.0.0:{port}", "--workers", "1", "--threads", "4",
    "--timeout", "300", "--access-logfile", "-", "--error-logfile", "-",
])
