"""Pure, database-free validation helpers shared by filters and rules.

This package intentionally imports no Django models or application services so
that rule/filter validation and evaluation can be reused from request parsing,
catalog code and runtime execution without creating a dependency cycle.
"""

from apps.validation_logic.predicates import (
    NEGATIVE_TEXT_OPERATORS,
    NUMERIC_OPERATORS,
    TEXT_OPERATORS,
    is_null_or_blank,
    matches_value,
    matches_values,
)
from apps.validation_logic.trees import (
    DEFAULT_MAX_TREE_DEPTH,
    DEFAULT_MAX_TREE_NODES,
    GroupingBranch,
    GroupingLeaf,
    GroupingNode,
    TreeValidationError,
    collect_leaf_ids,
    evaluate_grouping_tree,
    parse_grouping_tree,
    serialize_grouping_tree,
    validate_grouping_tree,
)

__all__ = [
    "DEFAULT_MAX_TREE_DEPTH",
    "DEFAULT_MAX_TREE_NODES",
    "GroupingBranch",
    "GroupingLeaf",
    "GroupingNode",
    "NEGATIVE_TEXT_OPERATORS",
    "NUMERIC_OPERATORS",
    "TEXT_OPERATORS",
    "TreeValidationError",
    "collect_leaf_ids",
    "evaluate_grouping_tree",
    "is_null_or_blank",
    "matches_value",
    "matches_values",
    "parse_grouping_tree",
    "serialize_grouping_tree",
    "validate_grouping_tree",
]
