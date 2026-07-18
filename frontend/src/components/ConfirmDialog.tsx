import { useEffect, useRef } from "react";

interface Props {
  title: string;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  confirmTone?: "primary" | "danger";
  children: React.ReactNode;
}

/**
 * Accessible confirmation dialog. Traps initial focus, closes on Escape, and
 * is labelled for screen readers. Rendered inline (no portal) to keep the DOM
 * simple; the backdrop click cancels.
 */
export function ConfirmDialog({
  title,
  open,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  confirmTone = "primary",
  children,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      {/* Backdrop click cancels; clicks inside the panel are stopped. */}
      <div className="dialog-backdrop-hit" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="dialog-panel card"
      >
        <h2 id="dialog-title">{title}</h2>
        <div>{children}</div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={confirmTone === "danger" ? "btn btn--danger" : "btn btn--primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
