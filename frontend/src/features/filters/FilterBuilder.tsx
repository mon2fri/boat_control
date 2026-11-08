import { useEffect, useMemo, useRef, useState } from "react";
import type { FilterRow, GroupNode } from "../../api/domain";
import { nextId } from "../../lib/id";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { SectionHint } from "../../components/SectionHint";
import { FilterRowEditor } from "./FilterRowEditor";
import { GroupingTreeEditor } from "../rules/GroupingTreeEditor";
import { PER_GROUPING_HELP_TEXT } from "../rules/groupingEditorSupport";
import {
  clearFilterGrouping,
  defaultFilterGrouping,
  EMPTY_FILTER_GROUPING,
  filterRowLabel,
  filterRowsAsConditions,
  formatFilterGroupingHierarchy,
  repairFilterGroupingTree,
  validateFilterGrouping,
  type FilterGrouping,
  type FilterGroupingMode,
} from "./filterGrouping";

interface Props {
  columns: string[];
  rows: FilterRow[];
  columnValues: Record<string, { value: string; starred: boolean }[]>;
  loadingValues: boolean;
  onChange: (rows: FilterRow[]) => void;
  /**
   * Optional controlled grouping state (Worker C persistence wiring). When
   * omitted, the builder owns the grouping locally so the visual interaction
   * and previews remain usable while transport work is pending.
   */
  grouping?: FilterGrouping | null;
  onGroupingChange?: (grouping: FilterGrouping | null) => void;
}

function newFilterRow(): FilterRow {
  return { id: nextId("filter"), column: "", operator: "equals", values: [] };
}

/** Manages the ordered list of filter rows (add / edit / remove / reorder). */
export function FilterBuilder({
  columns,
  rows,
  columnValues,
  loadingValues,
  onChange,
  grouping,
  onGroupingChange,
}: Props) {
  const controlled = grouping !== undefined;
  const [groupingReset, setGroupingReset] = useState(0);
  const [localGrouping, setLocalGrouping] = useState<FilterGrouping>(() =>
    defaultFilterGrouping(rows),
  );
  const [controlledMode, setControlledMode] = useState<FilterGroupingMode | null>(() =>
    defaultFilterGrouping(rows).mode,
  );
  const activeGrouping = controlled
    ? {
        ...(grouping ?? EMPTY_FILTER_GROUPING),
        // A controlled `null` (or a null mode) is an explicit "remove all
        // groups" choice; only an omitted grouping falls back to the locally
        // remembered mode.
        mode: grouping === null ? null : grouping ? grouping.mode : controlledMode,
      }
    : localGrouping;

  // A config load replaces every row id. Reset the local grouping to the
  // legacy-compatible default instead of carrying stale references into the
  // loaded configuration. Partial edits keep their tree so removals surface a
  // repairable error rather than silently broadening the expression.
  const rowIdsKey = rows.map((row) => row.id).join("|");
  const previousRowIds = useRef(rowIdsKey);
  useEffect(() => {
    const previous = previousRowIds.current.split("|").filter(Boolean);
    const next = rowIdsKey.split("|").filter(Boolean);
    const replacedAll = previous.length > 0
      && next.length > 0
      && !next.some((id) => previous.includes(id));
    if (replacedAll || next.length === 0) {
      const nextGrouping = defaultFilterGrouping(rows);
      setLocalGrouping(nextGrouping);
      setGroupingReset((version) => version + 1);
      setControlledMode(nextGrouping.mode);
    }
    previousRowIds.current = rowIdsKey;
  }, [rowIdsKey, controlled, rows]);

  const conditions = useMemo(() => filterRowsAsConditions(rows), [rows]);
  const validation = validateFilterGrouping(rows, activeGrouping);
  const preview = formatFilterGroupingHierarchy(rows, activeGrouping);

  function updateGrouping(next: FilterGrouping): void {
    setLocalGrouping(next);
    setControlledMode(next.mode);
    onGroupingChange?.(next);
  }

  function updateRow(next: FilterRow): void {
    onChange(rows.map((r) => (r.id === next.id ? next : r)));
  }

  function removeRow(id: string): void {
    onChange(rows.filter((r) => r.id !== id));
  }

  function moveRow(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange(next);
  }

  function changeMode(mode: FilterGroupingMode | null): void {
    updateGrouping({ ...activeGrouping, mode });
  }

  function conditionLabel(conditionId: string): string {
    const index = rows.findIndex((row) => row.id === conditionId);
    return index >= 0
      ? filterRowLabel(rows[index]!, index)
      : `<missing filter ${conditionId}>`;
  }

  const hasRepairTargets =
    activeGrouping.mode === "custom"
    && activeGrouping.tree !== null
    && (validation.unknownIds.length > 0
      || validation.missingIds.length > 0
      || validation.structuralErrors.length > 0);

  return (
    <CollapsibleCard
      id="filters"
      title="Row filters"
      summary={rows.length === 0
        ? "No filters configured. Expand to change."
        : `${rows.length} filter${rows.length === 1 ? "" : "s"} configured. Expand to change.`}
      headerActions={(expand) => (
        <button type="button" className="btn" onClick={() => { expand(); onChange([...rows, newFilterRow()]); }}>
          + Add filter
        </button>
      )}
      hint={(
        <SectionHint label="Row filters help">
          Each row applies one condition. Multiple values within a row are combined with OR for
          <code> equals</code>/<code>contains</code> (matches if any value matches) and with AND for
          <code> not equals</code>/<code>not contains</code> (matches if the value is not equal to /
          does not contain any of the selected values). Null or blank cells never satisfy
          <code> equals</code> or <code>contains</code>; they satisfy <code>not equal to</code> and
          <code>not contains</code>. Leave the list empty to run against the full set.
        </SectionHint>
      )}
    >
      {rows.length === 0 ? (
        <p role="status">No filters added — the run will cover all rows.</p>
      ) : (
        <div className="filter-rows">{rows.map((row, index) => (
          <FilterRowEditor
            key={row.id}
            row={row}
            index={index}
            columns={columns}
            columnValues={columnValues}
            loadingValues={loadingValues}
            onChange={updateRow}
            onRemove={() => removeRow(row.id)}
            onMoveUp={() => moveRow(index, -1)}
            onMoveDown={() => moveRow(index, 1)}
            canMoveUp={index > 0}
            canMoveDown={index < rows.length - 1}
          />
        ))}</div>
      )}

      {rows.length > 1 && (
        <section className="filter-grouping" aria-label="Filter grouping configuration">
          <div className="field">
            <label htmlFor="filter-relation">Combining Filters with</label>
            <select
              id="filter-relation"
              value={activeGrouping.mode ?? ""}
              aria-invalid={activeGrouping.mode === null}
              onChange={(event) => changeMode((event.target.value || null) as FilterGroupingMode | null)}
            >
              <option value="">Choose…</option>
              <option value="and">AND — all must match</option>
              <option value="or">OR — any may match</option>
              <option value="custom">CUSTOM GROUPS — nested groups</option>
            </select>
          </div>

          {activeGrouping.mode === "custom" && (
            <div className="field">
              <div className="group-tree-title-row">
                <span className="field-label">Filter groups</span>
                <SectionHint label="Filter groups help">{PER_GROUPING_HELP_TEXT}</SectionHint>
              </div>
              <GroupingTreeEditor
                key={groupingReset}
                conditions={conditions}
                value={activeGrouping.tree}
                onChange={(tree: GroupNode | null) =>
                  updateGrouping({ ...activeGrouping, tree })
                }
                groupingMode="per_grouping"
                showHelp={false}
                conditionLabel={(condition) => conditionLabel(condition.id)}
              />
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => { setGroupingReset((version) => version + 1); updateGrouping(clearFilterGrouping()); }}
                >
                  Remove all groups
                </button>
                {hasRepairTargets && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() =>
                      updateGrouping(repairFilterGroupingTree(rows, activeGrouping))
                    }
                  >
                    Remove stale filter references
                  </button>
                )}
              </div>
            </div>
          )}

          <p className="field-hint" data-testid="filter-grouping-preview">
            <span className="visually-hidden">Filter expression: </span>
            <code style={{ whiteSpace: "pre-wrap" }}>{preview}</code>
          </p>

          {!validation.valid && (
            <ul className="alert alert--error" role="alert" aria-live="polite">
              {validation.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </CollapsibleCard>
  );
}
