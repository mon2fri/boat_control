"""Exception tracking storage, identity, and run-capture adapters.

Worker B imports the HTTP-facing repository from
:mod:`apps.exception_tracking.repository`; Worker C imports
:func:`apps.exception_tracking.store.capture_exceptions`.  This package has no
Django models and keeps the tracking SQLite file separate from the application
database.
"""

from __future__ import annotations

from apps.exception_tracking.columns import (
    RESERVED_EXTRA_COLUMN_NAMES,
    deserialize_column_selection,
    deserialize_extra_values,
    normalize_column_key,
    normalize_extra_value,
    serialize_column_selection,
    serialize_extra_values,
    validate_extra_columns,
)
from apps.exception_tracking.domain import (
    ExceptionOccurrence,
    ExceptionRecord,
    ExceptionStatus,
    RecordingSummary,
    status_for,
)
from apps.exception_tracking.errors import (
    ExceptionIdentityCollisionError,
    ExceptionTrackingError,
    InvalidAsOfDateError,
    InvalidDatabasePathError,
    InvalidExtraColumnsError,
    InvalidKeyColumnsError,
    InvalidRuleIdentifierError,
    MissingKeyValueError,
    SchemaMismatchError,
    UnknownExceptionError,
)
from apps.exception_tracking.identity import (
    ExceptionIdentity,
    build_exception_id,
    build_exception_identity,
    date_from_table_name,
    deserialize_key_columns,
    is_canonical_rule_identifier,
    parse_as_of_date,
    serialize_key_columns,
    table_name_for_date,
    validate_rule_identifier,
)
from apps.exception_tracking.repository import (
    DEFAULT_DATABASE_RELATIVE_PATH,
    ExceptionTrackingRepository,
    default_database_path,
    get_exception,
    get_extra_column_union,
    get_extra_columns,
    get_extra_values,
    list_as_of_dates,
    list_exception_history,
    list_exceptions,
    migrate_schema,
    record_exceptions,
    resolve_database_path,
    update_commentaries,
)
from apps.exception_tracking.store import capture_exceptions

__all__ = [
    "DEFAULT_DATABASE_RELATIVE_PATH",
    "RESERVED_EXTRA_COLUMN_NAMES",
    "ExceptionIdentity",
    "ExceptionIdentityCollisionError",
    "ExceptionOccurrence",
    "ExceptionRecord",
    "ExceptionStatus",
    "ExceptionTrackingError",
    "ExceptionTrackingRepository",
    "InvalidAsOfDateError",
    "InvalidDatabasePathError",
    "InvalidExtraColumnsError",
    "InvalidKeyColumnsError",
    "InvalidRuleIdentifierError",
    "MissingKeyValueError",
    "RecordingSummary",
    "SchemaMismatchError",
    "UnknownExceptionError",
    "build_exception_id",
    "build_exception_identity",
    "capture_exceptions",
    "date_from_table_name",
    "default_database_path",
    "deserialize_column_selection",
    "deserialize_extra_values",
    "deserialize_key_columns",
    "get_exception",
    "get_extra_column_union",
    "get_extra_columns",
    "get_extra_values",
    "is_canonical_rule_identifier",
    "list_as_of_dates",
    "list_exception_history",
    "list_exceptions",
    "migrate_schema",
    "normalize_column_key",
    "normalize_extra_value",
    "parse_as_of_date",
    "record_exceptions",
    "resolve_database_path",
    "serialize_column_selection",
    "serialize_extra_values",
    "serialize_key_columns",
    "status_for",
    "table_name_for_date",
    "update_commentaries",
    "validate_extra_columns",
    "validate_rule_identifier",
]
