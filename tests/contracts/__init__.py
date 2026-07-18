"""Contract version marker and process definition."""
from __future__ import annotations

CONTRACT_VERSION = 1

CHANGELOG = [
    {
        "version": 1,
        "date": "2026-07-18",
        "description": "Initial frozen contract. Published by Worker C.",
        "breaking_changes": [],
    },
]


def describe_version(version: int) -> str:
    """Return the description for a given contract version."""
    for entry in CHANGELOG:
        if entry["version"] == version:
            return entry["description"]
    raise ValueError(f"Unknown contract version: {version}")


def is_compatible(old_version: int, new_version: int) -> bool:
    """Check if a new contract version is backward-compatible with an old one.

    For now, any version change is considered breaking until a non-breaking
    change process is defined.
    """
    return old_version == new_version
