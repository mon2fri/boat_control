"""Actionable errors for the exception-tracking storage layer.

All errors subclass :class:`ValueError` so API adapters can map them to a
client-visible validation response without importing a storage-specific base.
The storage layer never silently skips a row or invents an identity; every error
names the offending date, rule, column, ID, or path.
"""

from __future__ import annotations


class ExceptionTrackingError(ValueError):
    """Base class for every exception-tracking storage/identity error."""


class InvalidAsOfDateError(ExceptionTrackingError):
    """The as-of date is not a strict ISO calendar date."""


class InvalidRuleIdentifierError(ExceptionTrackingError):
    """The rule identifier is not a canonical ``CBR1_...`` catalog identifier."""


class MissingKeyValueError(ExceptionTrackingError):
    """A configured key column is missing, null, or blank."""


class InvalidKeyColumnsError(ExceptionTrackingError):
    """The configured key-column order or supplied key mapping is invalid."""


class InvalidExtraColumnsError(ExceptionTrackingError):
    """The ordered commentary extra-column selection or values are invalid."""


class ExceptionIdentityCollisionError(ExceptionTrackingError):
    """Two different key-value tuples serialize to the same literal exception ID."""

    def __init__(
        self,
        message: str,
        *,
        exception_id: str,
        existing_rule_identifier: str,
        existing_key_columns: str,
        incoming_rule_identifier: str,
        incoming_key_columns: str,
    ) -> None:
        super().__init__(message)
        self.exception_id = exception_id
        self.existing_rule_identifier = existing_rule_identifier
        self.existing_key_columns = existing_key_columns
        self.incoming_rule_identifier = incoming_rule_identifier
        self.incoming_key_columns = incoming_key_columns


class UnknownExceptionError(ExceptionTrackingError):
    """A commentary update named exception IDs that are not present on the date."""

    def __init__(self, message: str, *, unknown_ids: list[str]) -> None:
        super().__init__(message)
        self.unknown_ids = tuple(sorted(unknown_ids))


class StaleRevisionTokenError(ExceptionTrackingError):
    """A recertification request carried an out-of-date revision token."""

    def __init__(self, message: str, *, exception_ids: list[str]) -> None:
        super().__init__(message)
        self.exception_ids = tuple(sorted(exception_ids))


class BlankCommentaryCertificationError(ExceptionTrackingError):
    """A recertification request tried to certify blank commentary as reviewed."""

    def __init__(self, message: str, *, exception_ids: list[str]) -> None:
        super().__init__(message)
        self.exception_ids = tuple(sorted(exception_ids))


class SchemaMismatchError(ExceptionTrackingError):
    """An existing date table is missing one or more required columns."""


class InvalidDatabasePathError(ExceptionTrackingError):
    """The tracking database path cannot be used on this host."""
