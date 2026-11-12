import { useLayoutEffect, useRef, type HTMLAttributes, type RefObject } from "react";

interface Props extends HTMLAttributes<HTMLUListElement> {
  anchorRef: RefObject<HTMLInputElement | null>;
  onDismiss: () => void;
}

/** Keep menus above card stacking/scroll containers without moving their ARIA subtree. */
export function FloatingListbox({ anchorRef, onDismiss, children, ...props }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useLayoutEffect(() => {
    const list = listRef.current;
    const anchor = anchorRef.current;
    if (!list || !anchor) return;
    // Native popovers occupy the browser's top layer, escaping overflow clipping.
    // Fixed positioning also supplies a fallback where the Popover API is absent.
    if (typeof list.showPopover === "function") list.showPopover();
    function position() {
      if (!list || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const upwards = below < Math.min(240, above);
      const maxHeight = Math.max(0, Math.min(648, upwards ? above : below));
      const width = Math.min(rect.width, Math.max(0, window.innerWidth - 16));
      Object.assign(list.style, {
        width: `${width}px`,
        left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`,
        maxHeight: `${maxHeight}px`,
        top: `${upwards ? Math.max(8, rect.top - Math.min(list.scrollHeight + 2, maxHeight) - 2) : rect.bottom + 2}px`,
      });
    }
    function outside(event: Event) {
      const target = event.target;
      if (target instanceof Node && !list?.contains(target) && !anchor?.contains(target)) {
        dismissRef.current();
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") dismissRef.current();
    }
    position();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(anchor);
    observer?.observe(list);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", escape, true);
      if (typeof list.hidePopover === "function" && list.isConnected) list.hidePopover();
    };
  }, [anchorRef]);

  return (
    <ul {...props} ref={listRef} popover="manual"
      className="combobox-list combobox-list--floating"
      style={{ position: "fixed", inset: "auto", margin: 0, boxSizing: "border-box", zIndex: 10000 }}
      onToggle={(event) => {
        if ((event.nativeEvent as ToggleEvent).newState === "closed") dismissRef.current();
      }}>
      {children}
    </ul>
  );
}
