import { RECERTIFICATION_LABEL } from "../../api/domain";

interface Props {
  reason?: string | null | undefined;
  carriedFromExceptionId?: string | null | undefined;
  carriedFromAsOfDate?: string | null | undefined;
  carriedFromRuleIdentifier?: string | null | undefined;
  ruleEvolutionEventId?: string | null | undefined;
}

/**
 * Pending-recertification marker: a small purple "R" rendered beside
 * exception IDs that still await explicit recertification.
 *
 * The exact label ("Recertification due to rule change") plus source
 * revision/date provenance stay in the title tooltip and in the accessible
 * name — never as a second visible badge. Parents render this only for
 * authoritative pending state; it is never inferred from nonblank text.
 * The offline HTML export clones this DOM, so the marker travels with it.
 */
export function RecertificationBadge({
  reason,
  carriedFromExceptionId,
  carriedFromAsOfDate,
  carriedFromRuleIdentifier,
  ruleEvolutionEventId,
}: Props) {
  const provenance: string[] = [];
  if (carriedFromAsOfDate) provenance.push(`carried from ${carriedFromAsOfDate}`);
  if (carriedFromExceptionId) provenance.push(`source ${carriedFromExceptionId}`);
  if (carriedFromRuleIdentifier) provenance.push(`rule ${carriedFromRuleIdentifier}`);
  if (ruleEvolutionEventId) provenance.push(`event ${ruleEvolutionEventId}`);
  const label = [
    reason || RECERTIFICATION_LABEL,
    ...(provenance.length > 0 ? [provenance.join(" · ")] : []),
  ].join(" — ");

  return (
    <span className="recertification-marker" title={label} aria-label={label} role="img">
      R
    </span>
  );
}
