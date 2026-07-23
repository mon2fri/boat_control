/**
 * Tests for the export controls. The controls must:
 * - Export HTML from the actual rendered result element.
 * - Use the server-supplied filename for CSV.
 * - Surface a progress bar while the response streams.
 * - Classify errors as cancelled / server / interrupted.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExportControls } from "./ExportControls";

function buildErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    body: null,
    text: () => Promise.resolve(body),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("ExportControls", () => {
  it("exports HTML from the rendered result element without calling the backend", async () => {
    const anchorMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    let exportedBlob: Blob | undefined;
    const blobSpy = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      exportedBlob = blob as Blob;
      return "blob:test";
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <div data-export-source="result">
        <div className="results-header">
          <div className="report-name">
            <button>my_run</button>
            <button className="pencil">✎</button>
          </div>
        </div>
        <h2>Exact result content</h2>
        <details open><summary>Aggregation</summary><p>EMEA: 12</p></details>
        <ExportControls runId="run-1" reportName="my_run" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export HTML" }));
    await waitFor(() => expect(screen.getByText(/Saved as/)).toBeInTheDocument());
    expect(screen.getByText("my_run.html")).toBeInTheDocument();
    expect(anchorMock).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(exportedBlob).toBeDefined();
    const exportedText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(exportedBlob!);
    });
    expect(exportedText).toContain("Exact result content");
    expect(exportedText).toContain("<details open");
    expect(exportedText).toContain("EMEA: 12");
    expect(exportedText).not.toContain("Export HTML");
    expect(exportedText).toContain("export-report-header");
    expect(exportedText).toContain("export-report-name");
    expect(exportedText).not.toContain("✎");
    blobSpy.mockRestore();
    revoke.mockRestore();
    vi.unstubAllGlobals();
  });

  it("surfaces server errors with the response message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(buildErrorResponse(500, JSON.stringify({ error: "Export too large" }))),
    );
    render(<ExportControls runId="run-1" reportName="my_run" />);
    fireEvent.click(screen.getByRole("button", { name: "Export Excel" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Export failed: Export too large/),
    );
    vi.unstubAllGlobals();
  });

  it("classifies user-cancelled exports distinctly from server errors", async () => {
    // Hold the fetch open until the test aborts it, so we can verify that the
    // ExportControls catch block recognises the user-cancelled case.
    let rejecter: ((reason: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejecter = reject;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ExportControls runId="run-1" reportName="my_run" />);
    fireEvent.click(screen.getByRole("button", { name: "Export Excel" }));
    const cancelBtn = await screen.findByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);
    // Simulate the browser aborting the underlying fetch.
    const r = rejecter as ((reason: unknown) => void) | undefined;
    if (r) r(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Export cancelled/),
    );
    vi.unstubAllGlobals();
  });
});
