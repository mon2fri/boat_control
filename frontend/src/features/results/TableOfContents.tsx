import type { RunResult } from "../../api/domain";
import { sectionId } from "./anchors";

/**
 * Floating table of contents. Anchor links let users jump between the overall
 * result, the change details, and each rule's section. Uses native in-page
 * anchors so keyboard and screen-reader navigation work without scripting.
 */
export function TableOfContents({ result }: { result: RunResult }) {
  return (
    <nav className="toc card" aria-label="Result contents">
      <h2 className="toc-title">Contents</h2>
      <ul>
        <li>
          <a href="#overall">Overall result</a>
        </li>
        <li>
          <a href="#changes">Attribute changes</a>
        </li>
        {result.ruleResults.map((rule) => (
          <li key={rule.ruleIndex}>
            <a href={`#${sectionId(rule.ruleIndex)}`}>
              {rule.ruleIndex} — {rule.ruleName}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
