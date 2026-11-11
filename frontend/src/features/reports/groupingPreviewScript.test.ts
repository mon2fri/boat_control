import { describe, expect, it } from "vitest";
import { GROUPING_PREVIEW_JS } from "./groupingPreviewScript";

describe("standalone grouping hover renderer", () => {
  it("uses one panel for all headings, preserves badges, and treats values as text", () => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    try {
      const data = { title: "Saved rule", sections: [{ title: "Expectations", clauses: [
        { id: "c0", label: 'Expectation 1: <img src=x onerror="alert(1)">' },
        { id: "c1", label: "Expectation 2: score equals 1" },
      ], tree: { kind: "or", children: [{ kind: "leaf", conditionId: "c0" }, { kind: "leaf", conditionId: "c1" }] }, errors: [], emptyText: "" }] };
      const first = doc.createElement("button");
      first.setAttribute("data-grouping-preview", JSON.stringify(data));
      const second = doc.createElement("button");
      second.setAttribute("data-grouping-preview", JSON.stringify({ ...data, title: "Another saved rule" }));
      doc.body.append(first, second);
      // Execute the same self-contained script embedded in every report.
      new Function("document", "window", "innerWidth", "innerHeight", GROUPING_PREVIEW_JS)(doc, frame.contentWindow, 1024, 768);
      first.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      const panel = doc.querySelector<HTMLElement>("#report-grouping-preview")!;
      expect(panel.hidden).toBe(false);
      expect(panel.querySelector(".group-number")!.textContent).toBe("Group 1");
      expect(panel.textContent).toContain("Expectation 1");
      expect(panel.querySelector("img")).toBeNull();
      second.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      expect(doc.querySelectorAll("#report-grouping-preview")).toHaveLength(1);
      expect(panel.querySelector("h3")!.textContent).toBe("Another saved rule");
      doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(panel.hidden).toBe(true);
    } finally { frame.remove(); }
  });
});
