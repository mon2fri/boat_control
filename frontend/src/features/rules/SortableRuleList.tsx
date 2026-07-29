import { useCallback, useRef, useState, useMemo } from "react";
import type { Rule } from "../../api/domain";
import { describeLogic } from "./useRules";

interface Props {
  rules: Rule[];
  selected: string[];
  validColumns: string[];
  disabled?: boolean;
  onToggle: (ruleId: string) => void;
  onToggleAll: (ruleIds: string[]) => void;
  onEdit: (rule: Rule) => void;
  onDelete: (rule: Rule) => void;
  onReorder: (ruleIds: string[]) => void;
}

type KeyboardDrag = {
  ruleId: string;
  fromIndex: number;
  currentIndex: number;
} | null;

const PAGE_SIZE = 10;

function referencedColumns(rule: Rule): string[] {
  const columns = new Set(rule.conditions.map((condition) => condition.column));
  columns.add(rule.logic.column);
  if (rule.logic.format === "column") columns.add(rule.logic.target);
  for (const column of rule.extraColumns ?? []) columns.add(column);
  return [...columns].filter(Boolean);
}

export function SortableRuleList({
  rules,
  selected,
  validColumns,
  disabled = false,
  onToggle,
  onToggleAll,
  onEdit,
  onDelete,
  onReorder,
}: Props) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [keyboardDrag, setKeyboardDrag] = useState<KeyboardDrag>(null);
  const [announcement, setAnnouncement] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const draggedRuleRef = useRef<string | null>(null);
  const valid = new Set(validColumns);

  const totalPages = Math.ceil(rules.length / PAGE_SIZE);
  const effectivePage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const paginatedRules = useMemo(() => {
    const start = effectivePage * PAGE_SIZE;
    return rules.slice(start, start + PAGE_SIZE);
  }, [rules, effectivePage]);

  const allSelected = rules.length > 0 && rules.every((r) => selected.includes(r.index));

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  function move(ruleId: string, toIndex: number): void {
    const fromIndex = rules.findIndex((rule) => rule.index === ruleId);
    if (fromIndex < 0 || fromIndex === toIndex) return;
    const next = rules.map((rule) => rule.index);
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved!);
    onReorder(next);
    announce(`Moved ${ruleId} to position ${toIndex + 1} of ${next.length}.`);
  }

  function handleKeyDown(event: React.KeyboardEvent, rule: Rule, index: number): void {
    if (disabled) return;
    if (keyboardDrag?.ruleId === rule.index) {
      if (event.key === "Escape") {
        setKeyboardDrag(null);
        announce(`Cancelled moving ${rule.index}.`);
        event.preventDefault();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const direction = event.key === "ArrowUp" ? -1 : 1;
        const currentIndex = Math.max(
          0,
          Math.min(rules.length - 1, keyboardDrag.currentIndex + direction),
        );
        setKeyboardDrag({ ...keyboardDrag, currentIndex });
        announce(`Moving ${rule.index} to position ${currentIndex + 1} of ${rules.length}.`);
        event.preventDefault();
      } else if (event.key === " " || event.key === "Enter") {
        move(rule.index, keyboardDrag.currentIndex);
        setKeyboardDrag(null);
        event.preventDefault();
      }
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      setKeyboardDrag({ ruleId: rule.index, fromIndex: index, currentIndex: index });
      announce(`Picked up ${rule.index}, position ${index + 1} of ${rules.length}. Use arrow keys to move, space to drop, escape to cancel.`);
      event.preventDefault();
    }
  }

  function handleToggleAll() {
    if (allSelected) {
      onToggleAll([]);
    } else {
      onToggleAll(rules.map((r) => r.index));
    }
  }

  return (
    <>
      <p className="field-hint rule-order-hint">Drag rules to change their saved order.</p>

      {rules.length >= 2 && (
        <div className="config-inline-row" style={{ marginBottom: "var(--space)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = !allSelected && rules.some((r) => selected.includes(r.index));
              }}
              onChange={handleToggleAll}
              disabled={disabled}
            />
            Select all
          </label>
        </div>
      )}

      <ul className="rule-select-list" aria-label="Rules">
        {paginatedRules.map((rule, pageIndex) => {
          const globalIndex = effectivePage * PAGE_SIZE + pageIndex;
          const invalid = referencedColumns(rule).some((column) => !valid.has(column));
          return (
            <li
              key={rule.index}
              className={[
                invalid ? "rule-select-list__item--warn" : "",
                dragOverIndex === globalIndex ? "rule-select-list__item--drop-target" : "",
              ].filter(Boolean).join(" ")}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverIndex(globalIndex);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const ruleId = draggedRuleRef.current;
                draggedRuleRef.current = null;
                setDragOverIndex(null);
                if (ruleId) move(ruleId, globalIndex);
              }}
            >
              <div className="rule-select-list__main">
                <span
                  className="drag-handle"
                  draggable={!disabled}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-roledescription="sortable"
                  aria-label={`Drag to reorder ${rule.index} ${rule.name}`}
                  aria-pressed={keyboardDrag?.ruleId === rule.index}
                  onDragStart={(event) => {
                    draggedRuleRef.current = rule.index;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", rule.index);
                  }}
                  onDragEnd={() => {
                    draggedRuleRef.current = null;
                    setDragOverIndex(null);
                  }}
                  onKeyDown={(event) => handleKeyDown(event, rule, globalIndex)}
                >
                  ⠿
                </span>
                <span className="rule-order-number" aria-hidden="true">{globalIndex + 1}.</span>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(rule.index)}
                    onChange={() => onToggle(rule.index)}
                  />{" "}
                  <strong>{rule.index}</strong> — {rule.name}
                  {invalid && <span className="rule-warn-badge" title="References columns not in current comparison selection">⚠</span>}
                </label>
              </div>
              <div className="rule-actions">
                <code className="rule-logic">{describeLogic(rule)}</code>
                <button type="button" className="btn" onClick={() => onEdit(rule)}>Edit</button>
                <button type="button" className="btn btn--danger" onClick={() => onDelete(rule)}>Delete</button>
              </div>
            </li>
          );
        })}
      </ul>

      {totalPages > 1 && (
        <nav aria-label="Rule list pagination" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space)", marginTop: "var(--space)" }}>
          <button
            type="button"
            className="btn"
            disabled={effectivePage === 0}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            Previous
          </button>
          <span style={{ fontSize: "0.85rem", color: "var(--color-muted)" }}>
            Page {effectivePage + 1} of {totalPages}
          </span>
          <button
            type="button"
            className="btn"
            disabled={effectivePage >= totalPages - 1}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next
          </button>
        </nav>
      )}

      <span className="visually-hidden" aria-live="polite">{announcement}</span>
    </>
  );
}
