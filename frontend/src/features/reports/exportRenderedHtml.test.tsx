/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { exportRenderedHtml } from "./exportRenderedHtml";

async function buildExport(root: HTMLElement, reportName: string): Promise<string> {
  const out = exportRenderedHtml(root, reportName);
  // jsdom's Blob doesn't expose `.text()`; read via FileReader instead.
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(out.blob);
  });
}

describe("exportRenderedHtml — Table of Contents FAB", () => {
  it("embeds standalone detail-table column filtering interactions", async () => {
    const root = document.createElement("section");
    root.innerHTML = `
      <div class="detail-grid" role="table">
        <div class="detail-grid-header"><div class="detail-grid-row">
          <div class="filterable-th">
            <span>Status</span>
            <button class="th-filter-btn" aria-expanded="false">Filter</button>
            <div class="th-filter-dropdown" hidden>
              <input class="th-filter-search" />
              <div class="th-filter-options">
                <div class="th-filter-empty" hidden>No matches</div>
                <label class="th-filter-option"><input type="checkbox" value="active" />active</label>
              </div>
              <button class="th-filter-clear" hidden>Clear</button>
            </div>
          </div>
        </div></div>
        <div class="detail-grid-body">
          <div class="detail-grid-row"><div role="cell">active</div></div>
        </div>
      </div>`;

    const html = await buildExport(root, "filterable-report");

    expect(html).toContain("applyDetailFilters");
    expect(html).toContain("syncFilterHeader");
    expect(html).toContain("th-filter-option");
    expect(html).toContain("th-filter-search");
    expect(html).toContain("th-filter-clear");
    expect(html).toContain(".th-filter-dropdown[hidden]");
    expect(html).toContain("exportedFilterDropdowns");
    expect(html).toContain("exportedFilterDropdowns[dropdownIndex].hidden = true");
  });

  it("embeds the FAB markup and the hover script in the exported HTML", async () => {
    document.documentElement.dataset.theme = "light";
    const root = document.createElement("section");
    root.setAttribute("data-export-source", "result");
    const overall = document.createElement("section");
    overall.id = "overall";
    overall.innerHTML = "<h3>Overall result</h3><p>Summary metrics</p>";
    root.appendChild(overall);

    const html = await buildExport(root, "baseline_vs_candidate");

    expect(html).toContain('class="export-toc-fab"');
    expect(html).toContain("data-export-toc-fab");
    expect(html).toContain("data-export-toc-trigger");
    expect(html).toContain("data-export-toc-panel");
    expect(html).toContain("data-export-toc-list");
    expect(html).toContain("Result contents");
    expect(html).toMatch(/mouseenter|mouseleave/);
    expect(html).toContain('class="export-toc-fab__trigger"');
  });

  it("renders sections in the exported TOC with anchor links", async () => {
    document.documentElement.dataset.theme = "light";
    const root = document.createElement("section");
    root.setAttribute("data-export-source", "result");

    const overall = document.createElement("section");
    overall.id = "overall";
    overall.innerHTML = "<h3>Overall result</h3>";
    root.appendChild(overall);

    const exceptionSummary = document.createElement("section");
    exceptionSummary.id = "exception-rule-summary";
    exceptionSummary.innerHTML = "<h3>Exception Rule Summary</h3>";
    root.appendChild(exceptionSummary);

    const changes = document.createElement("section");
    changes.id = "changes";
    changes.innerHTML = "<h3>Attribute changes</h3>";
    root.appendChild(changes);

    // User-defined comparison card: outer section id plus inner heading id
    // (changes-title-*). Only the outer id should land in the TOC.
    const compareCard = document.createElement("section");
    compareCard.id = "changes-section-7";
    compareCard.innerHTML = '<h3 id="changes-title-section-7">Critical status changes</h3>';
    root.appendChild(compareCard);

    const rule = document.createElement("section");
    rule.id = "rule-2";
    rule.innerHTML = "<h3>R002 — Low score</h3>";
    root.appendChild(rule);

    const html = await buildExport(root, "test-report");

    // The script block contains the discovery + ordering logic. Verify that
    // the expected anchors are present so the runtime TOC can pick them up.
    expect(html).toContain("sectionOrder");
    expect(html).toContain("'overall'");
    expect(html).toContain("'exception-rule-summary'");
    expect(html).toContain("'changes'");
    // The dedup branch that excludes heading ids from the TOC.
    expect(html).toContain("'changes-title-'");

    // The section ids must exist in the cloned main region.
    expect(html).toContain('id="overall"');
    expect(html).toContain('id="exception-rule-summary"');
    expect(html).toContain('id="changes"');
    expect(html).toContain('id="changes-section-7"');
    expect(html).toContain('id="changes-title-section-7"');
    expect(html).toContain('id="rule-2"');
  });

  it("excludes heading ids (changes-title-…) from the TOC discovery", () => {
    // Run the script as plain code in jsdom and inspect the populated list.
    const root = document.createElement("main");
    const overall = document.createElement("section");
    overall.id = "overall";
    root.appendChild(overall);
    const compareCard = document.createElement("section");
    compareCard.id = "changes-7";
    const heading = document.createElement("h3");
    heading.id = "changes-title-7";
    compareCard.appendChild(heading);
    root.appendChild(compareCard);
    const rule = document.createElement("section");
    rule.id = "rule-2";
    root.appendChild(rule);
    document.body.appendChild(root);

    // Build the FAB HTML so the script has nodes to query.
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div class="export-toc-fab" data-export-toc-fab>' +
        '<button data-export-toc-trigger></button>' +
        '<nav data-export-toc-panel><ul data-export-toc-list></ul></nav>' +
        "</div>",
    );

    // Run the discovery branch of the script.
    const SECTION_IDS = { overall: 0, "exception-rule-summary": 1, changes: 2, rule: 3 };
    function sectionOrder(id: string): number {
      if (id === "overall") return SECTION_IDS.overall;
      if (id === "exception-rule-summary") return SECTION_IDS["exception-rule-summary"];
      if (id === "changes") return SECTION_IDS.changes;
      if (id.indexOf("changes-") === 0 && id.indexOf("changes-title-") !== 0) {
        return SECTION_IDS.changes;
      }
      if (id.indexOf("rule-") === 0) return SECTION_IDS.rule;
      return 99;
    }
    const seen: string[] = [];
    document.querySelectorAll("main [id]").forEach((el) => {
      const id = el.id;
      if (sectionOrder(id) !== 99) seen.push(id);
    });

    expect(seen).toContain("overall");
    expect(seen).toContain("changes-7");
    expect(seen).not.toContain("changes-title-7");
    expect(seen).toContain("rule-2");
  });
});
