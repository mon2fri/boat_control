import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-dev-only-key-change-in-production",
)

DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() in ("true", "1", "yes")

ALLOWED_HOSTS: list[str] = ["127.0.0.1", "localhost"] if not DEBUG else ["*"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "apps.files",
    "apps.rules",
    "apps.runs",
    "apps.reports",
    "apps.settings",
    "apps.saved_filters",
    "apps.configs",
    "apps.families",
]

ROOT_URLCONF = "boat_control.urls"

MIDDLEWARE: list[str] = []

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [],
        },
    },
]

WSGI_APPLICATION = "boat_control.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "data" / "db.sqlite3",
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
RESULTS_DIR = DATA_DIR / "results"
CONFIG_DIR = BASE_DIR / "config"

for _d in (DATA_DIR, UPLOADS_DIR, RESULTS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = False

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
}

MAX_UPLOAD_SIZE_MB = 500
MAX_COLUMNS = 500
DEFAULT_RUN_RETENTION = 10

SETTINGS_FILE = BASE_DIR / ".config"
RULES_FILE = CONFIG_DIR / "rules" / "rules.yaml"
RULES_CONFIG_DIR = CONFIG_DIR / "rules"
ROWS_AND_COLUMNS_CONFIG_DIR = CONFIG_DIR / "rows_and_columns"
FILTERS_DIR = CONFIG_DIR / "filters"
FILTERS_CONFIG_DIR = CONFIG_DIR / "filters"
FAMILY_CONFIG_DIR = CONFIG_DIR / "families"
