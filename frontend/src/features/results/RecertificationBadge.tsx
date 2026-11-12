import { RECERTIFICATION_LABEL } from "../../api/domain";

interface Props {
  reason?: string | null | undefined;
  carriedFromExceptionId?: string | null | undefined;
  carriedFromAsOfDate?: string | null | undefined;
  carriedFromRuleIdentifier?: string | null | undefined;
  ruleEvolutionEventId?: string | null | undefined;
}

/**
 * Pending-recertification marker. Rendered separately from commentary text
 * in tracking and results views (including reloaded historical reports and
 * the offline HTML export, which clones this DOM). Never inferred from
 * nonblank text: parents render this only for authoritative pending state.
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
  const title = [
    reason || RECERTIFICATION_LABEL,
    ...(provenance.length > 0 ? [provenance.join(" · ")] : []),
  ].join(" — ");

  return (
    <span className="status-badge status-badge--recertification-required" title={title}>
      {RECERTIFICATION_LABEL}
    </span>
  );
}
