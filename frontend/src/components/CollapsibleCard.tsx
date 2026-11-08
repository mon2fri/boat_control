import { useState, type ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  summary: string;
  /** Optional accessible help affordance rendered next to the title. */
  hint?: ReactNode;
  headerActions?: ReactNode | ((expand: () => void) => ReactNode);
  showSummary?: boolean;
  children: ReactNode;
}

export function CollapsibleCard({ id, title, summary, hint, headerActions, showSummary = true, children }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section aria-labelledby={`${id}-title`} className="card collapsible-card">
      <div className="collapsible-card__header">
        <div className="collapsible-card__title-group">
          <button
            type="button"
            className="collapsible-card__toggle-region"
            aria-expanded={!collapsed}
            aria-controls={`${id}-content`}
            onClick={() => setCollapsed((current) => !current)}
          >
            <span id={`${id}-title`} className="section-heading">{title}</span>
          </button>
          {hint && <span className="collapsible-card__hint">{hint}</span>}
          {collapsed && showSummary && <span className="collapsible-card__summary">{summary}</span>}
        </div>
        <div className="collapsible-card__actions">
          {typeof headerActions === "function" ? headerActions(() => setCollapsed(false)) : headerActions}
          <button type="button" className="collapsible-card__toggle-region"
            aria-label={`${collapsed ? "Expand" : "Collapse"} section`}
            aria-expanded={!collapsed} aria-controls={`${id}-content`}
            onClick={() => setCollapsed((current) => !current)}>
            <span className="collapsible-card__toggle">{collapsed ? "Expand" : "Collapse"}</span>
          </button>
        </div>
      </div>
      {!collapsed && <div id={`${id}-content`}>{children}</div>}
    </section>
  );
}
