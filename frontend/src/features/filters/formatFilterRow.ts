import type { FilterRow } from "../../api/domain";

const OPERATOR_LABELS: Record<string, string> = {
  equals: "equals",
  not_equals: "not equal to",
  contains: "contains",
  not_contains: "not contain",
};

export function formatFilterRow(row: FilterRow): string {
  const op = OPERATOR_LABELS[row.operator] ?? row.operator;
  const connector = row.operator === "not_equals" || row.operator === "not_contains" ? " and " : " or ";
  const vals = row.values.map((v) => `"${v}"`).join(connector);
  return `${row.column} ${op} ${vals}`;
}
