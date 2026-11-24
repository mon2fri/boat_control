import { useEffect, useId, useRef, useState } from "react";

interface Props {
  id: string;
  value: string;
  paths: string[];
  onChange: (path: string) => void;
}

export function RecentTrackingPathInput({ id, value, paths, onChange }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const expanded = open && paths.length > 0;
  const activeOption = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeOption.current?.scrollIntoView?.({ block: "nearest" });
  }, [active, expanded]);

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function select(path: string) {
    onChange(path);
    close();
  }

  return (
    <div className="tracking-path-input">
      <input
        id={id}
        role="combobox"
        aria-autocomplete="none"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="/absolute/path/to/exception_tracking.db"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={close}
        onKeyDown={(event) => {
          if (event.key === "Escape" && expanded) {
            event.preventDefault();
            close();
          } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && paths.length) {
            event.preventDefault();
            setOpen(true);
            const index = event.key === "ArrowDown"
              ? Math.min(active + 1, paths.length - 1)
              : active < 0 ? paths.length - 1 : Math.max(active - 1, 0);
            setActive(index);
          } else if (event.key === "Enter" && expanded && paths[active] !== undefined) {
            event.preventDefault();
            select(paths[active]);
          }
        }}
      />
      {expanded && (
        <ul id={listId} className="combobox-list" role="listbox" aria-label="Recent database paths">
          {paths.map((path, index) => (
            <li
              key={path}
              ref={index === active ? activeOption : undefined}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={path === value}
              className={`combobox-option${index === active ? " is-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(path)}
            >
              {path}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
