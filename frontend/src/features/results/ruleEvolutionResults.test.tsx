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
    // A single small purple R beside the exception ID, never a verbose badge.
    const markers = screen.getAllByRole("img", { name: /Recertification due to rule change/ });
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveTextContent("R");
    expect(screen.queryByText("Recertification due to rule change")).not.toBeInTheDocument();
    expect(screen.getAllByText(`${IDENTITY}_id_9`).length).toBeGreaterThanOrEqual(1);
    // The accepted row's grid cell carries no marker.
    const gridCells = screen
      .getAllByText(`${IDENTITY}_id_9`)
      .map((node) => node.closest('[role="cell"]'))
      .filter((cell): cell is HTMLElement => cell !== null);
    expect(gridCells.length).toBeGreaterThanOrEqual(1);
    for (const cell of gridCells) {
      expect(cell.textContent).not.toContain("Recertification due to rule change");
      expect(cell.querySelector(".recertification-marker")).toBeNull();
    }
  });

  it("marks pending rows in per-rule detail tables with a single accessible R", () => {
    render(
      <DetailTable
        rows={[pendingRow(), acceptedRow()]}
        caption="Rule R001 exceptions"
        keyColumnNames={["id"]}
        showExceptionId
        hideComparison
        sequenceSource={[pendingRow(), acceptedRow()]}
      />,
    );
    // The marker's accessible name carries the exact label; the title tooltip
    // carries source revision/date provenance.
    const marker = screen.getByRole("img", { name: /Recertification due to rule change/ });
    expect(marker).toHaveTextContent("R");
    expect(marker.getAttribute("title")).toContain("2026-09-30");
    expect(marker.getAttribute("title")).toContain("OLD_id_7");
    // No duplicate verbose badge anywhere.
    expect(screen.queryByText("Recertification due to rule change")).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Recertification due to rule change/ })).toHaveLength(1);
    const acceptedCell = screen.getByText(`${IDENTITY}_id_9`).closest('[role="cell"]');
    expect(acceptedCell?.textContent).not.toContain("Recertification due to rule change");
    expect(acceptedCell?.querySelector(".recertification-marker")).toBeNull();
  });

  it("orders per-rule tables with a leading sequence and Exception ID last", () => {
    const { container } = render(
      <DetailTable
        rows={[pendingRow(), acceptedRow()]}
        caption="Rule R001 exceptions"
        keyColumnNames={["id"]}
        showExceptionId
        hideComparison
        sequenceSource={[pendingRow(), acceptedRow()]}
      />,
    );
    const headers = [...container.querySelectorAll(".detail-grid-header [role='columnheader']")]
      .map((cell) => cell.textContent);
    expect(headers[0]).toBe("#");
    expect(headers[headers.length - 1]).toBe("Exception ID");
    const bodyRows = [...container.querySelectorAll(".detail-grid-body > .detail-grid-row")];
    expect(bodyRows).toHaveLength(2);
    const firstCells = [...bodyRows[0]!.querySelectorAll("[role='cell']")].map((cell) => cell.textContent);
    const secondCells = [...bodyRows[1]!.querySelectorAll("[role='cell']")].map((cell) => cell.textContent);
    expect(firstCells[0]).toBe("1");
    expect(firstCells[firstCells.length - 1]).toContain(`${IDENTITY}_id_7`);
    expect(secondCells[0]).toBe("2");
    expect(secondCells[secondCells.length - 1]).toContain(`${IDENTITY}_id_9`);
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

  it("retains the pending marker and column order in the offline HTML export", async () => {
    render(
      <div data-export-source="result">
        <DetailTable
          rows={[pendingRow(), acceptedRow()]}
          caption="Rule R001 exceptions"
          keyColumnNames={["id"]}
          showExceptionId
          hideComparison
          sequenceSource={[pendingRow(), acceptedRow()]}
        />
      </div>,
    );
    const root = document.querySelector("[data-export-source='result']")!;
    const html = await readBlob(exportRenderedHtml(root, "report").blob);
    // The small purple R (with exact label + provenance) survives the clone…
    expect(html).toContain("recertification-marker");
    expect(html).toContain("Recertification due to rule change");
    expect(html).toContain("2026-09-30");
    // …exactly once in markup (no duplicate badge), with Exception ID still last.
    expect(html.match(/class="recertification-marker"/g)).toHaveLength(1);
    const headerOrder = [...root.querySelectorAll(".detail-grid-header [role='columnheader']")]
      .map((cell) => cell.textContent);
    expect(headerOrder[0]).toBe("#");
    expect(headerOrder[headerOrder.length - 1]).toBe("Exception ID");
    // The serialized export preserves that header order too.
    const sequenceHeaderPos = html.indexOf('aria-label="Sequence"');
    const exceptionIdHeaderPos = html.indexOf('aria-label="Exception ID"');
    expect(sequenceHeaderPos).toBeGreaterThanOrEqual(0);
    expect(exceptionIdHeaderPos).toBeGreaterThan(sequenceHeaderPos);
  });
});
