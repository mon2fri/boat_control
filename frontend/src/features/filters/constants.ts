import type { FilterOperator } from "../../api/domain";

/** Operators offered on filter rows, in display order. */
export const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "equals", label: "equals to" },
  { value: "not_equals", label: "not equal to" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
];
