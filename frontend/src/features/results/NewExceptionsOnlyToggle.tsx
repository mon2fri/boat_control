interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
}

/**
 * Display/report scope switch. The backend still stores every exception for
 * the As-of Date; only results and ordinary reports narrow to New +
 * NotCommented. Commentary templates always include all exceptions.
 */
export function NewExceptionsOnlyToggle({ checked, onChange, disabled = false, busy = false }: Props) {
  const helpId = "new-exceptions-only-help";
  return (
    <div className="field new-exceptions-only">
      <label className="checkbox-row" htmlFor="new-exceptions-only">
        <input
          id="new-exceptions-only"
          type="checkbox"
          checked={checked}
          disabled={disabled || busy}
          aria-describedby={helpId}
          onChange={(event) => onChange(event.target.checked)}
        />
        New Exceptions Only
      </label>
      <span className="field-hint" id={helpId}>
        Includes new exceptions and recurring exceptions without commentary (NotCommented);
        commented exceptions are hidden from results and HTML/Excel reports. All exceptions
        remain stored, and the commentary template still includes every exception.
      </span>
      {busy && <span className="field-hint" role="status">Applying exception scope…</span>}
    </div>
  );
}
