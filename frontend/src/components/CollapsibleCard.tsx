import { useState, type ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  summary: string;
  /** Optional accessible help affordance rendered next to the title. */
  hint?: ReactNode;
  children: ReactNode;
}

export function CollapsibleCard({ id, title, summary, hint, children }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section aria-labelledby={`${id}-title`} className="card collapsible-card">
      <div className="collapsible-card__header">
        <button
          type="button"
          className="collapsible-card__toggle-region"
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
        {hint && <span className="collapsible-card__hint">{hint}</span>}
      </div>
      {!collapsed && <div id={`${id}-content`}>{children}</div>}
    </section>
  );
}
