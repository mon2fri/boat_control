/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DetailRow, RuleResult } from "../../api/domain";
import { mapViolation } from "../../api/mapping";
import { ExceptionTable } from "./ExceptionTable";
import { DetailTable } from "./DetailTable";
import { OverallSummaryCards } from "./OverallSummaryCards";
import { exportRenderedHtml } from "../reports/exportRenderedHtml";

const IDENTITY = "CBR1_AAAAAAAAAAAAAAAAAAAA";

function pendingRow(): DetailRow {
  return mapViolation(
    {
      row_index: 0,
      rule_id: "R001",
      rule_name: "Region check",
      rule_identifier: IDENTITY,
      key_columns: { id: "7" },
      details: "Violated region check",
      exception_id: `${IDENTITY}_id_7`,
      exception_status: "RecertificationRequired",
      recertification_required: true,
      recertification_reason: "Recertification due to rule change",
      carried_from_exception_id: "OLD_id_7",
      carried_from_as_of_date: "2026-09-30",
      carried_from_rule_identifier: "CBR1_OLD0000000000000001",
      rule_evolution_event_id: "evt-1",
    },
    0,
    { keyColumnNames: ["id"] },
  );
}

function acceptedRow(): DetailRow {
  return mapViolation(
    {
      row_index: 1,
      rule_id: "R001",
      rule_name: "Region check",
      rule_identifier: IDENTITY,
      key_columns: { id: "9" },
      details: "Violated region check",
      exception_id: `${IDENTITY}_id_9`,
    },
    1,
    { keyColumnNames: ["id"] },
  );
}

function ruleResults(): RuleResult[] {
  return [
    {
      ruleIndex: "R001",
      ruleName: "Region check",
      ruleIdentifier: IDENTITY,
      logicSummary: "status must equal active",
      violationRowCount: 2,
      violationAttributeCount: 2,
      details: [pendingRow(), acceptedRow()],
      hideComparison: true,
    },
  ];
}

async function readBlob(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Blob read failed"));
    reader.readAsText(blob);
  });
}

describe("rule-evolution results views", () => {
  it("keeps historical review state through the wire/domain mapping", () => {
    const row = pendingRow();
    expect(row.exceptionStatus).toBe("RecertificationRequired");
    expect(row.recertificationReason).toBe("Recertification due to rule change");
    expect(row.carriedFromAsOfDate).toBe("2026-09-30");
  });

  it("marks pending rows in the cross-rule exception table without touching accepted rows", () => {
    render(
      <ExceptionTable
        ruleResults={ruleResults()}
        keyColumnNames={["id"]}
        aggregationColumnLabels={{}}
        exceptionColumns={[]}
      />,
    );
    const badges = screen.getAllByText("Recertification due to rule change");
    expect(badges).toHaveLength(1);
    expect(screen.getAllByText(`${IDENTITY}_id_9`).length).toBeGreaterThanOrEqual(1);
    // The accepted row's grid cell carries no marker.
    const gridCells = screen
      .getAllByText(`${IDENTITY}_id_9`)
      .map((node) => node.closest('[role="cell"]'))
      .filter((cell): cell is HTMLElement => cell !== null);
    expect(gridCells.length).toBeGreaterThanOrEqual(1);
    for (const cell of gridCells) {
      expect(cell.textContent).not.toContain("Recertification due to rule change");
    }
  });

  it("marks pending rows in per-rule detail tables", () => {
    render(
      <DetailTable
        rows={[pendingRow(), acceptedRow()]}
        caption="Rule R001 exceptions"
        keyColumnNames={["id"]}
        showExceptionId
        hideComparison
      />,
    );
    // The marker's title carries source revision/date provenance.
    const badge = screen.getByText("Recertification due to rule change");
    expect(badge.title).toContain("2026-09-30");
    expect(badge.title).toContain("OLD_id_7");
    const acceptedCell = screen.getByText(`${IDENTITY}_id_9`).closest('[role="cell"]');
    expect(acceptedCell?.textContent).not.toContain("Recertification due to rule change");
  });

  it("keeps the Overall result card uncluttered", () => {
    render(
      <OverallSummaryCards
        summary={{
          recordsLoaded: 10,
          ruleViolationRowCount: 1,
          ruleViolationAttributeCount: 1,
          changedRowCount: 0,
          changedAttributeCount: 0,
        }}
      />,
    );
    expect(screen.queryByText(/ecertification/)).not.toBeInTheDocument();
  });

  it("retains the pending marker in the offline HTML export", async () => {
    const host = document.createElement("div");
    render(
      <div data-export-source="result">
        <span className="status-badge status-badge--recertification-required" title="carried from 2026-09-30">
          Recertification due to rule change
        </span>
      </div>,
      { container: host },
    );
    const root = host.querySelector("[data-export-source='result']")!;
    const html = await readBlob(exportRenderedHtml(root, "report").blob);
    expect(html).toContain("Recertification due to rule change");
    expect(html).toContain("status-badge--recertification-required");
  });
});
