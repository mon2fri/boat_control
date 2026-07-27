import { useCallback, useRef, useState } from "react";

interface Props {
  columns: string[];
  onChange: (columns: string[]) => void;
  displayNames?: Record<string, string>;
  onDisplayNamesChange?: (displayNames: Record<string, string>) => void;
}

type KeyboardDrag = {
  column: string;
  fromIndex: number;
  currentIndex: number;
} | null;

export function AggregationColumnList({
  columns,
  onChange,
  displayNames = {},
  onDisplayNamesChange,
}: Props) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [keyboardDrag, setKeyboardDrag] = useState<KeyboardDrag>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const dragColumnRef = useRef<string | null>(null);

  const announce = useCallback((msg: string) => {
    setLiveMessage("");
    requestAnimationFrame(() => setLiveMessage(msg));
  }, []);

  function handleDragStart(e: React.DragEvent, column: string, index: number) {
    dragColumnRef.current = column;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }

  function handleDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault();
    const fromColumn = dragColumnRef.current;
    setDragOverIndex(null);
    dragColumnRef.current = null;
    if (!fromColumn) return;

    const fromIndex = columns.indexOf(fromColumn);
    if (fromIndex === -1 || fromIndex === toIndex) return;

    const next = [...columns];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, fromColumn);
    onChange(next);
    announce(`Moved ${fromColumn} to position ${toIndex + 1} of ${next.length}.`);
  }

  function handleDragEnd() {
    setDragOverIndex(null);
    dragColumnRef.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent, column: string, index: number) {
    if (keyboardDrag) {
      // Already in keyboard-drag mode
      if (e.key === "Escape") {
        setKeyboardDrag(null);
        announce(`Cancelled dragging ${column}.`);
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const dir = e.key === "ArrowUp" ? -1 : 1;
        const newIdx = Math.max(0, Math.min(columns.length - 1, keyboardDrag.currentIndex + dir));
        if (newIdx !== keyboardDrag.currentIndex) {
          setKeyboardDrag({ ...keyboardDrag, currentIndex: newIdx });
          announce(`Moved ${column} to position ${newIdx + 1} of ${columns.length}.`);
        }
        e.preventDefault();
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        // Drop at new position
        const { fromIndex, currentIndex } = keyboardDrag;
        const next = [...columns];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(currentIndex, 0, moved!);
        setKeyboardDrag(null);
        onChange(next);
        announce(`Dropped ${column} at position ${currentIndex + 1} of ${next.length}.`);
        e.preventDefault();
        return;
      }
      return;
    }

    // Not in keyboard-drag mode
    if (e.key === " " || e.key === "Enter") {
      setKeyboardDrag({ column, fromIndex: index, currentIndex: index });
      announce(`Picked up ${column}, position ${index + 1} of ${columns.length}. Use arrow keys to move, space to drop, escape to cancel.`);
      e.preventDefault();
    }
  }

  return (
    <div>
      <p className="field-hint" style={{ marginTop: "var(--space)", marginBottom: "var(--space-0)" }}>
        Ordered hierarchy (drag to reorder):
      </p>
      <ul aria-label="Aggregation columns (drag to reorder)" className="chip-list">
        {columns.map((column, index) => {
          const isDragging = dragColumnRef.current === column;
          const isDropTarget = dragOverIndex === index && dragColumnRef.current !== column;
          const kbDragIndex = keyboardDrag?.column === column ? keyboardDrag.currentIndex : null;
          const isKbDragging = keyboardDrag?.column === column;
          const displayIndex = kbDragIndex ?? index;

          return (
            <li
              key={column}
              className="chip-list-item"
              style={{
                opacity: isDragging ? 0.5 : 1,
                background: isDropTarget ? "var(--color-highlight, #e3f2fd)" : undefined,
                outline: isKbDragging ? "2px solid var(--color-focus, #1976d2)" : undefined,
              }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
            >
              <span
                className="drag-handle"
                draggable
                onDragStart={(e) => handleDragStart(e, column, index)}
                onDragEnd={handleDragEnd}
                onKeyDown={(e) => handleKeyDown(e, column, index)}
                tabIndex={0}
                role="button"
                aria-roledescription="sortable"
                aria-label={`Drag to reorder ${column}`}
                aria-pressed={isKbDragging}
                aria-dropeffect="move"
                style={{ cursor: "grab", userSelect: "none", padding: "2px 6px" }}
              >
                ⠿
              </span>
              <span className="chip-index">{displayIndex + 1}.</span>
              <span className="tag">{column}</span>
              <label className="aggregation-display-name">
                <span className="visually-hidden">Display column name for {column}</span>
                <input
                  value={displayNames[column] ?? ""}
                  placeholder="Display column name"
                  aria-label={`Display column name for ${column}`}
                  onChange={(event) => {
                    const next = { ...displayNames };
                    const value = event.target.value;
                    if (value.trim()) next[column] = value;
                    else delete next[column];
                    onDisplayNamesChange?.(next);
                  }}
                />
              </label>
              <button
                type="button"
                className="btn chip-remove"
                onClick={() => {
                  const next = columns.filter((c) => c !== column);
                  onChange(next);
                }}
                aria-label={`Remove aggregation column ${column}`}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
    </div>
  );
}
