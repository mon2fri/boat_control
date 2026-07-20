import { useEffect, useState } from "react";

/**
 * Scroll-spy hook. Returns the id of the section whose top edge is closest to
 * (but past) a horizontal line near the top of the viewport. Uses
 * IntersectionObserver with a `rootMargin` that defines a narrow "trigger
 * zone" — when a section's top crosses into it, that section becomes active.
 *
 * Falls back to the first id when nothing is observed yet (e.g. the page
 * hasn't been scrolled, or no targets exist in the DOM).
 */
export function useActiveSection(ids: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    // Trigger band: top 25% down to top 50% of the viewport. A section
    // becomes active once its top enters this band, and stays active until
    // another section's top enters it.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        }
        if (visible.size > 0) {
          // Pick the first visible section in document order.
          const next = ids.find((id) => visible.has(id));
          if (next) setActiveId(next);
        }
      },
      { rootMargin: "-25% 0px -50% 0px", threshold: 0 },
    );
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, [ids]);

  return activeId;
}
