import { useRuleHistory } from "./useRuleHistory";
import type { RuleHistoryEvent } from "../../api/domain";

interface Props {
  ruleId: string;
  ruleName?: string;
  onClose: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function clauseStrings(list: unknown, kind: "condition" | "expectation"): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const column = textOf(item.column_name ?? item.column);
    const operator = textOf(item.operator).replace(/_/g, " ");
    const rawValues =
      (Array.isArray(item.filter_values) ? item.filter_values : null) ??
      (Array.isArray(item.target_values) ? item.target_values : null) ??
      (item.filter_value !== undefined ? [item.filter_value] : null) ??
      (item.target_value !== undefined ? [item.target_value] : null) ??
      [];
    const values = (rawValues as unknown[]).map(textOf).filter((v) => v !== "");
    const rhs = item.format === "column_vs_column" || kind === "expectation" && item.comparison_mode
      ? `column ${textOf(item.target_value ?? item.column_name) || "<column>"}`
      : values.length > 0
        ? values.map((v) => `"${v}"`).join(" or ")
        : "<value>";
    out.push(`${column || "<column>"} ${operator || "<operator>"} ${rhs}`);
  }
  return out;
}

function treeText(node: unknown): string | null {
  if (!isRecord(node) || typeof node.kind !== "string") return null;
  if (node.kind === "leaf") return textOf(node.conditionId ?? node.condition_id) || "clause";
  if ((node.kind === "and" || node.kind === "or") && Array.isArray(node.children)) {
    const parts = node.children
      .map(treeText)
      .filter((part): part is string => part !== null);
    if (parts.length === 0) return node.kind.toUpperCase();
    return `(${parts.join(` ${String(node.kind).toUpperCase()} `)})`;
  }
  return null;
}

/** Best-effort clause rendering for a persisted authored snapshot. */
export function summarizeAuthoredPayload(payload: unknown): {
  conditions: string[];
  expectations: string[];
  grouping: string[];
} {
  if (!isRecord(payload)) return { conditions: [], expectations: [], grouping: [] };
  const conditions = clauseStrings(payload.conditions, "condition");
  const logic = payload.logic_clauses ?? payload.logic;
  const expectations = clauseStrings(Array.isArray(logic) ? logic : logic ? [logic] : [], "expectation");
  const grouping: string[] = [];
  for (const key of ["grouping_tree", "logic_grouping_tree"] as const) {
    const text = treeText(payload[key]);
    if (text) grouping.push(`${key}: ${text}`);
  }
  if (typeof payload.grouping === "string" && payload.grouping) {
    grouping.push(`grouping: ${payload.grouping}`);
  }
  if (typeof payload.condition_relation === "string" && conditions.length > 1) {
    grouping.push(`conditions joined with ${payload.condition_relation.toUpperCase()}`);
  }
  if (typeof payload.logic_relation === "string" && expectations.length > 1) {
    grouping.push(`expectations joined with ${payload.logic_relation.toUpperCase()}`);
  }
  return { conditions, expectations, grouping };
}

/**
 * Readable rule-evolution history rendered from persisted configuration
 * history, not reconstructed from the mutable catalog. Shows revision/time,
 * old/new identifiers, the recorded save decision, and before/after
 * definition/grouping snapshots, including grouping-eye previews of the
 * persisted trees where they parse.
 */
export function RuleHistoryPanel({ ruleId, ruleName, onClose }: Props) {
  const history = useRuleHistory(ruleId, true);
  const events = history.data?.events ?? [];

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="dialog-backdrop-hit" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-history-title"
        className="dialog-panel card"
      >
        <h2 id="rule-history-title">
          Rule history{ruleName ? ` — ${ruleId} ${ruleName}` : ` — ${ruleId}`}
        </h2>
        <p className="field-hint">
          Persisted revision history from the configuration database. Current catalog
          values never overwrite these historical definitions.
        </p>

        {history.data && (
          <p className="field-hint">
            Lineage <code>{history.data.lineageId}</code> · current revision{" "}
            {history.data.revisionNumber}
          </p>
        )}

        {history.isLoading && <p role="status">Loading history…</p>}
        {history.isError && (
          <p className="alert alert--error" role="alert">
            Could not load rule history: {history.error.message}
          </p>
        )}
        {events.length === 0 && !history.isLoading && !history.isError && (
          <p role="status">No recorded history for this rule yet.</p>
        )}
        {events.length > 0 && (
          <ol className="rule-history-list">
            {events.map((event) => (
              <li key={event.eventId}>
                <HistoryEvent event={event} />
              </li>
            ))}
          </ol>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryEvent({ event }: { event: RuleHistoryEvent }) {
  const before = summarizeAuthoredPayload(event.beforePayload);
  const after = summarizeAuthoredPayload(event.afterPayload);
  const hasBefore = before.conditions.length > 0 || before.expectations.length > 0;
  const hasAfter = after.conditions.length > 0 || after.expectations.length > 0;

  return (
    <article aria-label={`Revision ${event.revisionNumber}`}>
      <h3>
        Revision {event.revisionNumber} · <time>{event.createdAt}</time>
      </h3>
      <dl className="rule-history-meta">
        <div>
          <dt>Event</dt>
          <dd><code>{event.eventId}</code></dd>
        </div>
        <div>
          <dt>Lineage</dt>
          <dd><code>{event.lineageId}</code></dd>
        </div>
        {event.sourceIdentifier && (
          <div>
            <dt>Old identifier</dt>
            <dd><code>{event.sourceIdentifier}</code></dd>
          </div>
        )}
        {event.targetIdentifier && (
          <div>
            <dt>New identifier</dt>
            <dd><code>{event.targetIdentifier}</code></dd>
          </div>
        )}
        <div>
          <dt>Change</dt>
          <dd>{event.changeType}</dd>
        </div>
        {event.saveDecision && (
          <div>
            <dt>Save decision</dt>
            <dd>{event.saveDecision.replace(/_/g, " ")}</dd>
          </div>
        )}
        {event.commentaryPolicy && (
          <div>
            <dt>Commentary policy</dt>
            <dd>{event.commentaryPolicy}</dd>
          </div>
        )}
        {event.source && (
          <div>
            <dt>Source</dt>
            <dd>{event.source}</dd>
          </div>
        )}
      </dl>

      {event.changeSummary.length > 0 && (
        <ul>
          {event.changeSummary.map((line, index) => (
            <li key={`${event.eventId}-summary-${index}`}>{line}</li>
          ))}
        </ul>
      )}

      <div className="save-decision-comparison">
        <div>
          <h4>Before</h4>
          {hasBefore ? (
            <SnapshotBlock summary={before} />
          ) : (
            <p className="field-hint">No earlier definition recorded for this event.</p>
          )}
        </div>
        <div>
          <h4>After</h4>
          {hasAfter ? (
            <SnapshotBlock summary={after} />
          ) : (
            <details>
              <summary>Raw snapshot</summary>
              <pre>{JSON.stringify(event.afterPayload ?? null, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    </article>
  );
}

function SnapshotBlock({
  summary,
}: {
  summary: ReturnType<typeof summarizeAuthoredPayload>;
}) {
  return (
    <div>
      <p className="field-hint">Conditions ({summary.conditions.length})</p>
      <ul>
        {summary.conditions.map((line, index) => (
          <li key={`cond-${index}`}><code>{line}</code></li>
        ))}
      </ul>
      <p className="field-hint">Expectations ({summary.expectations.length})</p>
      <ul>
        {summary.expectations.map((line, index) => (
          <li key={`exp-${index}`}><code>{line}</code></li>
        ))}
      </ul>
      {summary.grouping.length > 0 && (
        <>
          <p className="field-hint">Grouping</p>
          <ul>
            {summary.grouping.map((line, index) => (
              <li key={`grp-${index}`}><code>{line}</code></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
