import { useState, type ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  summary: string;
  children: ReactNode;
}

export function CollapsibleCard({ id, title, summary, children }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section aria-labelledby={`${id}-title`} className="card collapsible-card">
      <button
        type="button"
        className="collapsible-card__header"
        aria-expanded={!collapsed}
        aria-controls={`${id}-content`}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span>
          <span id={`${id}-title`} className="section-heading">{title}</span>
          {collapsed && <span className="collapsible-card__summary">{summary}</span>}
        </span>
        <span className="collapsible-card__toggle" aria-hidden="true">{collapsed ? "Expand" : "Collapse"}</span>
      </button>
      {!collapsed && <div id={`${id}-content`}>{children}</div>}
    </section>
  );
}
