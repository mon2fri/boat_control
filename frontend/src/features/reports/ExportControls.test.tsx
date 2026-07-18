/**
 * Tests for the export controls. The controls must:
 * - Use the server-supplied filename (never a user-typed one).
 * - Surface a progress bar while the response streams.
 * - Classify errors as cancelled / server / interrupted.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExportControls } from "./ExportControls";

function buildExportResponse(body: string, filename: string, contentLength?: number) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const data = enc.encode(body);
      controller.enqueue(data);
      controller.close();
    },
  });
  const headers: Record<string, string> = {
    "Content-Type": "text/html",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
  if (contentLength !== undefined) headers["Content-Length"] = String(contentLength);
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    body: stream,
    text: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob([body])),
  };
}

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
  it("uses the server-supplied filename for the saved file", async () => {
    const anchorMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const blobSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(buildExportResponse("<html/>", "user_report.html")),
    );
    render(<ExportControls runId="run-1" reportName="my_run" />);
    fireEvent.click(screen.getByRole("button", { name: "Export HTML" }));
    await waitFor(() => expect(screen.getByText(/Saved as/)).toBeInTheDocument());
    expect(screen.getByText("user_report.html")).toBeInTheDocument();
    expect(anchorMock).toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Export HTML" }));
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