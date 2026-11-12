import { useId, type ReactNode } from "react";

interface Props {
  /** Accessible name for the hint trigger, e.g. "Row filters help". */
  label: string;
  children: ReactNode;
}

/**
 * Circular exclamation-mark hint placed next to a section title.
 *
 * The trigger is a focusable span rather than a button so it can sit next to
 * (and inside) headings without creating nested interactive controls. The
 * tooltip is shown on hover and keyboard focus via the shared `.value-hint`
 * styling, so the explanatory copy stays out of the way until requested.
 */
export function SectionHint({ label, children }: Props) {
  const id = useId();
  return (
    <span
      className="value-hint section-hint-icon"
      tabIndex={0}
      role="img"
      aria-label={label}
      aria-describedby={id}
    >
      <span aria-hidden="true">!</span>
      <span role="tooltip" id={id}>
        {children}
      </span>
    </span>
  );
}
