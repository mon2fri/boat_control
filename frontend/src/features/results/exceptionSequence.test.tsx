/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DetailRow } from "../../api/domain";
import { filterDetailRows, DetailTable } from "./DetailTable";
import {
  buildViolationSequenceIndex,
  sortBySequence,
  violationSequenceKey,
  violationSequenceNumber,
} from "./exceptionSequence";

const IDENTITY = "CBR1_AAAAAAAAAAAAAAAAAAAA";

function violationRow(id: string, keyId: string, extra?: Partial<DetailRow>): DetailRow {
  return {
    rowKey: `${keyId}#0#${keyId}`,
    exceptionId: `${IDENTITY}_${id}`,
    keyColumns: { id: keyId },
    column: "status",
    file1Value: "old",
    file2Value: "new",
    kind: "exception",
    ...extra,
  };
}

function orderedSet(): DetailRow[] {
  return [violationRow("id_7", "7"), violationRow("id_8", "8"), violationRow("id_9", "9")];
}

describe("per-rule exception sequence mapping", () => {
  it("numbers the rule's ordered violation set 1..n", () => {
    const rows = orderedSet();
    const index = buildViolationSequenceIndex(rows);
    expect(rows.map((row) => violationSequenceNumber(index, row))).toEqual([1, 2, 3]);
  });

  it("keys numbers by stable rowKey, not by mutable identity", () => {
    const rows = orderedSet();
    const index = buildViolationSequenceIndex(rows);
    const renamed: DetailRow = { ...rows[1]!, exceptionId: "BACKEND_SUPPLIED_ID" };
    expect(violationSequenceKey(renamed)).toBe(violationSequenceKey(rows[1]!));
    expect(violationSequenceNumber(index, renamed)).toBe(2);
  });

  it("returns null for rows outside the ordered set", () => {
    const index = buildViolationSequenceIndex(orderedSet());
    expect(violationSequenceNumber(index, violationRow("id_X", "X"))).toBeNull();
  });

  it("keeps numbers stable across filtering", () => {
    const rows = orderedSet();
    const index = buildViolationSequenceIndex(rows);
    const filtered = filterDetailRows(rows, { key_id: ["8", "9"] });
    expect(filtered.map((row) => violationSequenceNumber(index, row))).toEqual([2, 3]);
  });

  it("keeps numbers attached to rows across sorting", () => {
    const rows = orderedSet();
    const index = buildViolationSequenceIndex(rows);
    const sorted = sortBySequence(rows, index, "desc");
    expect(sorted.map((row) => row.exceptionId)).toEqual([
      `${IDENTITY}_id_9`,
      `${IDENTITY}_id_8`,
      `${IDENTITY}_id_7`,
    ]);
    expect(sorted.map((row) => violationSequenceNumber(index, row))).toEqual([3, 2, 1]);
    const restored = sortBySequence(rows, index, "asc");
    expect(restored.map((row) => violationSequenceNumber(index, row))).toEqual([1, 2, 3]);
  });

  it("sorts index-missing rows last in both directions", () => {
    const rows = orderedSet();
    const index = buildViolationSequenceIndex(rows);
    const stranger = violationRow("id_X", "X");
    expect(sortBySequence([...rows, stranger], index, "asc").map((r) => r.exceptionId))
      .toEqual([`${IDENTITY}_id_7`, `${IDENTITY}_id_8`, `${IDENTITY}_id_9`, `${IDENTITY}_id_X`]);
    expect(sortBySequence([stranger, ...rows], index, "desc").map((r) => r.exceptionId))
      .toEqual([`${IDENTITY}_id_9`, `${IDENTITY}_id_8`, `${IDENTITY}_id_7`, `${IDENTITY}_id_X`]);
  });
});

describe("per-rule exception table sequencing (rendered)", () => {
  it("keeps filtered/sorted page rows numbered from the rule's ordered set", () => {
    const source = orderedSet();
    render(
      <DetailTable
        rows={source}
        caption="Rule R001 exceptions"
        keyColumnNames={["id"]}
        showExceptionId
        hideComparison
        sequenceSource={source}
      />,
    );
    // Unfiltered page: 1..n in order.
    let cells = screen.getAllByRole("cell", { name: /^[123]$/ });
    expect(cells.map((cell) => cell.textContent)).toEqual(["1", "2", "3"]);

    // Sort by key id descending: rows reorder, numbers travel with their rows.
    fireEvent.click(screen.getByRole("button", { name: "Sort id ascending" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort id descending" }));
    cells = screen.getAllByRole("cell", { name: /^[123]$/ });
    expect(cells.map((cell) => cell.textContent)).toEqual(["3", "2", "1"]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText(`${IDENTITY}_id_9`)).toBeInTheDocument();

    // Sort by sequence ascending restores violation-set order.
    fireEvent.click(screen.getByRole("button", { name: /Sort Sequence/ }));
    cells = screen.getAllByRole("cell", { name: /^[123]$/ });
    expect(cells.map((cell) => cell.textContent)).toEqual(["1", "2", "3"]);
  });
});
