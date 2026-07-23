export interface RenderedHtmlExport {
  blob: Blob;
  filename: string;
}

/**
 * Build a standalone HTML file from the result page's actual rendered DOM.
 * This intentionally avoids maintaining a second result-page template.
 */
export function exportRenderedHtml(
  root: Element,
  reportName: string,
): RenderedHtmlExport {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-export-exclude]").forEach((element) => element.remove());

  const css = collectDocumentCss();
  const serializedResult = new XMLSerializer().serializeToString(clone);
  const theme = document.documentElement.dataset.theme;
  const title = escapeHtml(reportName);
  const themeAttribute = theme ? ` data-theme="${escapeHtml(theme)}"` : "";
  const html = [
    "<!DOCTYPE html>",
    `<html lang="en"${themeAttribute}>`,
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${title}</title>`,
    `<style>${css}</style>`,
    "</head>",
    `<body><main class="app-main">${serializedResult}</main></body>`,
    "</html>",
  ].join("\n");

  return {
    blob: new Blob([html], { type: "text/html;charset=utf-8" }),
    filename: `${safeFilename(reportName)}.html`,
  };
}

function collectDocumentCss(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      chunks.push(Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"));
    } catch {
      // Ignore inaccessible cross-origin stylesheets. Application styles are
      // same-origin and remain available through cssRules.
    }
  }
  return chunks.join("\n");
}

function safeFilename(value: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9 _-]/g, "_")
    .trim()
    .slice(0, 200);
  return cleaned || "export";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
