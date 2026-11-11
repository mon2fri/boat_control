"""Container paths; keep user-edited settings in the persistent data volume."""

from boat_control.settings import *  # noqa: F403

SETTINGS_FILE = BASE_DIR / "data" / ".config"  # noqa: F405
