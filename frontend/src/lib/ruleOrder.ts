/** Presentation order for result rules; numeric indices precede unknown legacy IDs. */
export function compareRuleIndices(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true });
}
