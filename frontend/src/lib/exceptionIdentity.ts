/**
 * Stable exception identity for result tables.
 *
 * The backend builds an exception ID as the canonical rule identifier followed
 * by the configured key-column values, joined literally with underscores.
 * Prefer a backend-supplied `exceptionId`; otherwise derive the exact same
 * literal from canonical values. Never derive identity from row position.
 */
const CANONICAL_RULE_IDENTIFIER = /^CBR1_[0-9A-HJKMNP-TV-Z]{20}$/;

export function buildExceptionId(
  ruleIdentifier: string | null | undefined,
  keyColumnNames: string[],
  keyColumns: Record<string, string | null>,
): string | null {
  if (!ruleIdentifier || !CANONICAL_RULE_IDENTIFIER.test(ruleIdentifier) || keyColumnNames.length === 0) {
    return null;
  }
  const values: string[] = [];
  for (const column of keyColumnNames) {
    const value = keyColumns[column];
    if (value === null || value === undefined || value === "") return null;
    values.push(value);
  }
  return [ruleIdentifier, ...values].join("_");
}

export function resolveExceptionId(
  supplied: string | null | undefined,
  ruleIdentifier: string | null | undefined,
  keyColumnNames: string[],
  keyColumns: Record<string, string | null>,
): string | null {
  return typeof supplied === "string" && supplied.trim().length > 0
    ? supplied
    : buildExceptionId(ruleIdentifier, keyColumnNames, keyColumns);
}
