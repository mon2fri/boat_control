"""Shared pytest isolation for the exception-tracking SQLite database.

Run submission captures exceptions as part of its success contract. Every pytest
test therefore gets a temporary tracking database path, including tests that do
not explicitly opt in. This is a safety guard: no test may read or write the
user's live ``data/exception_tracking.db``.

Tests that need a specific database still use ``override_settings`` or pass an
explicit path to Worker A's store; nested overrides take precedence over this
fixture.
"""

import pytest


@pytest.fixture(autouse=True)
def isolated_exception_tracking_db(settings, tmp_path):
    settings.EXCEPTION_TRACKING_DB = tmp_path / "exception_tracking.db"
