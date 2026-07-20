import { useMemo } from "react";
import type { RunResult } from "../../api/domain";
import { sectionId } from "./anchors";
import { useActiveSection } from "./useActiveSection";

/**
 * Floating table of contents. Anchor links let users jump between the overall
 * result, the change details, and each rule's section. Uses native in-page
 * anchors so keyboard and screen-reader navigation work without scripting.
 *
 * The entry whose section is currently scrolled into the trigger band near
 * the top of the viewport is highlighted via the `toc__item--active` class
 * (and `aria-current="location"` for assistive tech).
 */
export function TableOfContents({ result }: { result: RunResult }) {
  const ids = useMemo(
    () => [
      "overall",
      "changes",
      ...result.ruleResults.map((rule) => sectionId(rule.ruleIndex)),
    ],
    [result.ruleResults],
  );
  const activeId = useActiveSection(ids);

  return (
    <nav className="toc card" aria-label="Result contents">
      <h2 className="toc-title">Contents</h2>
      <ul>
        <li className={activeId === "overall" ? "toc__item--active" : undefined}>
          <a href="#overall" aria-current={activeId === "overall" ? "location" : undefined}>
            Overall result
          </a>
        </li>
        <li className={activeId === "changes" ? "toc__item--active" : undefined}>
          <a href="#changes" aria-current={activeId === "changes" ? "location" : undefined}>
            Attribute changes
          </a>
        </li>
        {result.ruleResults.map((rule) => {
          const id = sectionId(rule.ruleIndex);
          const active = activeId === id;
          return (
            <li key={rule.ruleIndex} className={active ? "toc__item--active" : undefined}>
              <a href={`#${id}`} aria-current={active ? "location" : undefined}>
                {rule.ruleIndex} — {rule.ruleName}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
