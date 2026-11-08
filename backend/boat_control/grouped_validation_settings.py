"""Isolated settings for grouped-validation review/tests and UI verification.

Set ``GROUPED_VALIDATION_HOME`` to a dedicated writable directory.  The module
intentionally refuses to fall back to the regular checkout's data/config paths.
"""

import os
from pathlib import Path

from boat_control.settings import *  # noqa: F403

_home_value = os.environ.get("GROUPED_VALIDATION_HOME")
if not _home_value:
    raise RuntimeError("GROUPED_VALIDATION_HOME must point to isolated review storage")

GROUPED_VALIDATION_HOME = Path(_home_value).expanduser().resolve()
DATA_DIR = GROUPED_VALIDATION_HOME / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
RESULTS_DIR = DATA_DIR / "results"
PREPARE_CACHE_DIR = DATA_DIR / "prepare_cache"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DATA_DIR / "db.sqlite3",
    }
}
SETTINGS_FILE = GROUPED_VALIDATION_HOME / ".config"
CONFIG_DIR = GROUPED_VALIDATION_HOME / "config"
RULES_FILE = CONFIG_DIR / "rules" / "rules.yaml"
RULES_CONFIG_DIR = CONFIG_DIR / "rules"
ROWS_AND_COLUMNS_CONFIG_DIR = CONFIG_DIR / "rows_and_columns"
FILTERS_DIR = CONFIG_DIR / "filters"
FILTERS_CONFIG_DIR = FILTERS_DIR
FAMILY_CONFIG_DIR = CONFIG_DIR / "families"
EXCEPTION_TRACKING_DB = DATA_DIR / "exception_tracking.db"

for _path in (
    DATA_DIR,
    UPLOADS_DIR,
    RESULTS_DIR,
    PREPARE_CACHE_DIR,
    RULES_CONFIG_DIR,
    ROWS_AND_COLUMNS_CONFIG_DIR,
    FILTERS_DIR,
    FAMILY_CONFIG_DIR,
):
    _path.mkdir(parents=True, exist_ok=True)
