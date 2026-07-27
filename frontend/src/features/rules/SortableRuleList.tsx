import { useCallback, useRef, useState } from "react";
import type { Rule } from "../../api/domain";
import { describeLogic } from "./useRules";

interface Props {
  rules: Rule[];
  selected: string[];
  validColumns: string[];
  disabled?: boolean;
  onToggle: (ruleId: string) => void;
  onEdit: (rule: Rule) => void;
  onDelete: (rule: Rule) => void;
  onReorder: (ruleIds: string[]) => void;
}

type KeyboardDrag = {
  ruleId: string;
  fromIndex: number;
  currentIndex: number;
} | null;

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
  onEdit,
  onDelete,
  onReorder,
}: Props) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [keyboardDrag, setKeyboardDrag] = useState<KeyboardDrag>(null);
  const [announcement, setAnnouncement] = useState("");
  const draggedRuleRef = useRef<string | null>(null);
  const valid = new Set(validColumns);

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

  return (
    <>
      <p className="field-hint rule-order-hint">Drag rules to change their saved order.</p>
      <ul className="rule-select-list" aria-label="Rules">
        {rules.map((rule, index) => {
          const invalid = referencedColumns(rule).some((column) => !valid.has(column));
          const keyboardPosition = keyboardDrag?.ruleId === rule.index
            ? keyboardDrag.currentIndex
            : index;
          return (
            <li
              key={rule.index}
              className={[
                invalid ? "rule-select-list__item--warn" : "",
                dragOverIndex === index ? "rule-select-list__item--drop-target" : "",
              ].filter(Boolean).join(" ")}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverIndex(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const ruleId = draggedRuleRef.current;
                draggedRuleRef.current = null;
                setDragOverIndex(null);
                if (ruleId) move(ruleId, index);
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
                  onKeyDown={(event) => handleKeyDown(event, rule, index)}
                >
                  ⠿
                </span>
                <span className="rule-order-number" aria-hidden="true">{keyboardPosition + 1}.</span>
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
      <span className="visually-hidden" aria-live="polite">{announcement}</span>
    </>
  );
}
