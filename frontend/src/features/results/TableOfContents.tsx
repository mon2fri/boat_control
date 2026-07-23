import { useMemo } from "react";
import type { RunResult } from "../../api/domain";
import { sectionId } from "./anchors";
import { useActiveSection } from "./useActiveSection";

function TocLinks({ result, activeId }: { result: RunResult; activeId: string | null }) {
  return (
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
  );
}

/**
 * Floating table of contents. Anchor links let users jump between the overall
 * result, the change details, and each rule's section. Uses native in-page
 * anchors so keyboard and screen-reader navigation work without scripting.
 *
 * When placed in the sidebar (`variant="sidebar"`, default) it renders inside a
 * card. In the primary navigation (`variant="nav"`) it omits the card wrapper
 * so it fits inside the app-nav area.
 */
export function TableOfContents({
  result,
  variant = "sidebar",
}: {
  result: RunResult;
  variant?: "sidebar" | "nav";
}) {
  const ids = useMemo(
    () => [
      "overall",
      "changes",
      ...result.ruleResults.map((rule) => sectionId(rule.ruleIndex)),
    ],
    [result.ruleResults],
  );
  const activeId = useActiveSection(ids);

  if (variant === "nav") {
    return (
      <>
        <h2 className="toc-title">Result contents</h2>
        <TocLinks result={result} activeId={activeId} />
      </>
    );
  }

  return (
    <nav className="toc card" aria-label="Result contents">
      <h2 className="toc-title">Contents</h2>
      <TocLinks result={result} activeId={activeId} />
    </nav>
  );
}
