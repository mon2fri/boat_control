import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Native modal keeps focus in the editor and makes the page behind it inert. */
export function RuleEditorOverlay({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.close) dialog.close();
      previousFocus?.focus();
    };
  }, []);
  return createPortal(
    <dialog ref={ref} className="rule-editor-overlay" aria-label="Rule editor" onCancel={(event) => event.preventDefault()}>
      {children}
    </dialog>,
    document.body,
  );
}
