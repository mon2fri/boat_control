import { useCallback, useState, useMemo } from "react";
import { useFamilies } from "../settings/useSettings";
import type { ValueFamily } from "../../api/domain";

interface Props {
  column: string;
  selectedValues: string[];
  onAddValues: (values: string[]) => void;
}

export function ValueFamilyAddButton({ column, selectedValues, onAddValues }: Props) {
  const { data: families } = useFamilies();
  const [open, setOpen] = useState(false);

  const columnFamilies = useMemo(() => (families ?? []).filter((f): f is ValueFamily => f.kind === "value"), [families]);

  const matchingFamilies = useMemo(() => {
    return columnFamilies.filter((f) => {
      return f.owners.some((o) => {
        if (o.kind === "column" && o.name === column) return true;
        if (o.kind === "column_family") {
          const cf = (families ?? []).find((x) => x.kind === "column" && x.name === o.name);
          return cf?.kind === "column" && cf.columns.includes(column);
        }
        return false;
      });
    });
  }, [columnFamilies, column, families]);

  const handleAdd = useCallback(
    (family: ValueFamily) => {
      const merged = [...selectedValues, ...family.values];
      const unique = [...new Set(merged)];
      onAddValues(unique);
      setOpen(false);
    },
    [selectedValues, onAddValues],
  );

  if (matchingFamilies.length === 0) return null;

  return (
    <div className="field" style={{ marginTop: "calc(var(--space) / 2)" }}>
      <button type="button" className="btn btn--small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Add value family
      </button>
      {open && (
        <ul className="dropdown-menu" role="menu" style={{ marginTop: "calc(var(--space) / 2)" }}>
          {matchingFamilies.map((f) => (
            <li key={f.name} role="none">
              <button
                type="button"
                className="dropdown-item"
                role="menuitem"
                onClick={() => handleAdd(f)}
              >
                {f.name} ({f.values.length} values)
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
