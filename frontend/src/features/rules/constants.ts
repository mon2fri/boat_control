import type { LogicOperator } from "../../api/domain";

/** Operators offered in rule conditions and logic clauses. */
export const LOGIC_OPERATORS: { value: LogicOperator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
];

/** Sentinel used by the Value-against-Column format for free-form input. */
export const OTHERS_VALUE = "__others__";
