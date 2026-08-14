export interface RenderedHtmlExport {
  blob: Blob;
  filename: string;
}

/**
 * Build a standalone HTML file from the result page's actual rendered DOM.
 * This intentionally avoids maintaining a second result-page template.
 *
 * The cloned tree includes `data-agg-toggle` / `data-agg-detail` hooks on the
 * nested aggregation nodes so the inline script below can wire up
 * expand/collapse clicks without needing a framework runtime.
 *
 * A floating "Contents" button is appended to the body so the exported report
 * has the same hover-to-reveal section navigation as the live sidebar. The
 * button scans the cloned DOM for anchor targets (`#overall`, `#changes…`,
 * `#rule-…`) and renders them as a popup.
 */
export function exportRenderedHtml(
  root: Element,
  reportName: string,
): RenderedHtmlExport {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-export-exclude]").forEach((element) => element.remove());
  normalizeReportHeader(clone, reportName);

  const css = `${collectDocumentCss()}\n${EXPORT_ONLY_CSS}`;
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
    `<body><main class="app-main">${serializedResult}</main>${TOC_FAB_HTML}</body>`,
    `<script>${EXPORT_INTERACTIVE_JS}</script>`,
    "</html>",
  ].join("\n");

  return {
    blob: new Blob([html], { type: "text/html;charset=utf-8" }),
    filename: `${safeFilename(reportName)}.html`,
  };
}

const EXPORT_ONLY_CSS = `
.th-filter-dropdown[hidden] {
  display: none !important;
}
.detail-grid-body > .detail-grid-row[hidden] {
  display: none !important;
}
.export-report-header {
  top: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}
.export-report-name {
  margin: 0 !important;
}
/* Override the result-page sticky offset so the report name sits at the
   very top of the exported document, immediately under the page chrome. */
.results-header {
  top: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}

/* Anchor jumps in the exported HTML only need to clear the report name bar
   (there is no app header in the export). The 64px value matches the
   results-header's padding + content so the section heading lands flush
   under the bar. */
#overall,
#changes,
#exception-rule-summary,
#exception-table,
[id^="rule-"],
[id^="changes-"] {
  scroll-margin-top: 64px !important;
}

/* Floating hover-triggered Table of Contents for the exported report. The
   trigger button sits in the top-right corner; the popup panel appears
   below it on hover/focus and disappears when the cursor leaves both
   elements (with a short grace window so users can move the mouse onto a
   link without the popup vanishing). */
.export-toc-fab {
  position: fixed;
  right: 24px;
  top: 24px;
  z-index: 1000;
  font-family: var(--font-sans);
}
.export-toc-fab__trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--color-accent);
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
.export-toc-fab__trigger:hover,
.export-toc-fab.is-open .export-toc-fab__trigger {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
  transform: translateY(1px);
}
.export-toc-fab__trigger:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
.export-toc-fab__trigger svg {
  width: 14px;
  height: 14px;
}
.export-toc-fab__panel {
  position: absolute;
  right: 0;
  top: calc(100% + 12px);
  width: 280px;
  max-height: 60vh;
  overflow-y: auto;
  padding: calc(var(--space) * 1.5);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius);
  background: var(--color-surface);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-6px);
  transition: opacity 0.15s, transform 0.15s, visibility 0s linear 0.15s;
}
.export-toc-fab.is-open .export-toc-fab__panel {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  transition: opacity 0.15s, transform 0.15s, visibility 0s linear 0s;
}
.export-toc-fab__title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 400;
  margin: 0 0 calc(var(--space) * 1);
  padding-bottom: calc(var(--space) * 1);
  border-bottom: 1px solid var(--color-rule);
  color: var(--color-text);
  letter-spacing: -0.005em;
}
.export-toc-fab__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.export-toc-fab__list li {
  padding: 0;
}
.export-toc-fab__list a {
  display: block;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  color: var(--color-text-soft);
  text-decoration: none;
  border-left: 2px solid transparent;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.export-toc-fab__list a:hover,
.export-toc-fab__list a:focus-visible {
  background: var(--color-surface-hover);
  color: var(--color-accent);
  border-left-color: var(--color-accent);
  outline: none;
}
.export-toc-fab__list .is-current a {
  color: var(--color-accent);
  font-weight: 600;
  border-left-color: var(--color-accent);
}
.export-toc-fab__empty {
  color: var(--color-muted);
  font-size: 0.85rem;
  font-style: italic;
}
@media (max-width: 640px) {
  .export-toc-fab { right: 16px; top: 16px; }
  .export-toc-fab__panel { width: min(280px, calc(100vw - 32px)); }
}
`;

/**
 * Floating action button markup. The panel itself is empty on the server —
 * the script below populates it with anchor links discovered in the cloned
 * DOM. The `aria-controls` / `aria-expanded` pair makes the trigger behave
 * like a real disclosure for screen readers.
 */
const TOC_FAB_HTML = `
<div class="export-toc-fab" data-export-toc-fab>
  <button
    type="button"
    class="export-toc-fab__trigger"
    aria-haspopup="true"
    aria-expanded="false"
    aria-controls="export-toc-panel"
    data-export-toc-trigger
  >
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h8" stroke-linecap="round" />
    </svg>
    <span>Contents</span>
  </button>
  <nav
    id="export-toc-panel"
    class="export-toc-fab__panel"
    aria-label="Result sections"
    data-export-toc-panel
  >
    <h2 class="export-toc-fab__title">Result contents</h2>
    <ul class="export-toc-fab__list" data-export-toc-list></ul>
  </nav>
</div>
`;

/**
 * Wire up expand/collapse interactions for the aggregation tree in the
 * exported HTML and the floating Table-of-Contents popup.
 *
 * - Click on `[data-agg-toggle]` toggles its sibling `[data-agg-detail]`
 *   container and updates `aria-expanded` / chevron.
 * - Click on `[data-agg-action="expand-all|collapse-all"]` bulk-toggles every
 *   toggle in the panel.
 * - Detail-table filter buttons open their cloned option lists; search,
 *   checkbox, and clear interactions filter the standalone table rows.
 * - Hover or focus on `[data-export-toc-trigger]` reveals the TOC popup;
 *   leaving both the trigger and the popup hides it again. The popup's own
 *   scrollable list is populated from the cloned DOM at load time.
 */
const EXPORT_INTERACTIVE_JS = `
(function () {
  function sync(btn, expanded) {
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    var icon = btn.querySelector('.nested-agg-toggle-icon');
    if (icon) icon.textContent = expanded ? '\\u25BC' : '\\u25B6';
    var sibling = btn.nextElementSibling;
    while (sibling) {
      if (sibling.hasAttribute && sibling.hasAttribute('data-agg-detail')) {
        sibling.hidden = !expanded;
        break;
      }
      sibling = sibling.nextElementSibling;
    }
  }
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var btn = target.closest('[data-agg-toggle]');
    if (!btn) return;
    var expanded = btn.getAttribute('aria-expanded') === 'true';
    sync(btn, !expanded);
  });
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var btn = target.closest('[data-agg-action]');
    if (!btn) return;
    var expand = btn.getAttribute('data-agg-action') === 'expand-all';
    var toggles = document.querySelectorAll('[data-agg-toggle]');
    for (var i = 0; i < toggles.length; i++) sync(toggles[i], expand);
  });

  // --- Detail-table column filters ---
  function filterHeaderOf(node) {
    return node && node.closest ? node.closest('.filterable-th') : null;
  }
  function checkedValues(header) {
    var selected = [];
    var checks = header.querySelectorAll('.th-filter-option input[type="checkbox"]');
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].checked) selected.push(checks[i].value);
    }
    return selected;
  }
  function syncFilterHeader(header) {
    var selected = checkedValues(header);
    var button = header.querySelector('.th-filter-btn');
    var count = header.querySelector('.th-filter-count');
    var clear = header.querySelector('.th-filter-clear');
    if (button) button.classList.toggle('th-filter-btn--active', selected.length > 0);
    if (!count && selected.length > 0 && button) {
      count = document.createElement('span');
      count.className = 'th-filter-count';
      button.appendChild(count);
    }
    if (count) {
      count.textContent = String(selected.length);
      count.hidden = selected.length === 0;
    }
    if (clear) clear.hidden = selected.length === 0;
  }
  function applyDetailFilters(grid) {
    var headers = grid.querySelectorAll('.detail-grid-header .filterable-th');
    var active = [];
    for (var i = 0; i < headers.length; i++) {
      var values = checkedValues(headers[i]);
      if (values.length === 0) continue;
      var headerRow = headers[i].parentElement;
      var headerCells = headerRow ? headerRow.children : [];
      var columnIndex = Array.prototype.indexOf.call(headerCells, headers[i]);
      active.push({ index: columnIndex, values: values });
    }
    var rows = grid.querySelectorAll('.detail-grid-body > .detail-grid-row');
    for (var j = 0; j < rows.length; j++) {
      var visible = true;
      for (var k = 0; k < active.length; k++) {
        var cell = rows[j].children[active[k].index];
        var value = cell ? cell.textContent.trim() : '';
        if (active[k].values.indexOf(value) === -1) {
          visible = false;
          break;
        }
      }
      rows[j].hidden = !visible;
    }
  }

  // --- Detail-table column sorting ---
  function applyDetailSort(button) {
    var header = button.closest('[role="columnheader"]');
    var grid = button.closest('.detail-grid');
    if (!header || !grid) return;
    var headerCells = header.parentElement ? header.parentElement.children : [];
    var columnIndex = Array.prototype.indexOf.call(headerCells, header);
    if (columnIndex < 0) return;
    var sortKey = button.getAttribute('data-detail-sort') || '';
    var previousKey = grid.getAttribute('data-sort-key');
    var previousDirection = grid.getAttribute('data-sort-direction');
    var direction = previousKey === sortKey && previousDirection === 'asc' ? 'desc' : 'asc';
    grid.setAttribute('data-sort-key', sortKey);
    grid.setAttribute('data-sort-direction', direction);

    var body = grid.querySelector('.detail-grid-body');
    if (!body) return;
    var rows = Array.prototype.slice.call(body.querySelectorAll(':scope > .detail-grid-row'));
    rows = rows.map(function (row, index) { return { row: row, index: index }; });
    rows.sort(function (left, right) {
      var leftCell = left.row.children[columnIndex];
      var rightCell = right.row.children[columnIndex];
      var a = leftCell ? leftCell.textContent.trim() : '';
      var b = rightCell ? rightCell.textContent.trim() : '';
      if ((a === '' || a === '\\u2014') && b !== '' && b !== '\\u2014') return 1;
      if ((b === '' || b === '\\u2014') && a !== '' && a !== '\\u2014') return -1;
      var compared = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      return compared === 0 ? left.index - right.index : compared * (direction === 'asc' ? 1 : -1);
    });
    for (var i = 0; i < rows.length; i++) {
      rows[i].row.setAttribute('aria-rowindex', String(i + 2));
      body.appendChild(rows[i].row);
    }

    var headers = grid.querySelectorAll('[role="columnheader"]');
    for (var j = 0; j < headers.length; j++) headers[j].setAttribute('aria-sort', 'none');
    header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
    var buttons = grid.querySelectorAll('[data-detail-sort]');
    for (var k = 0; k < buttons.length; k++) {
      var active = buttons[k] === button;
      buttons[k].classList.toggle('th-sort-btn--active', active);
      buttons[k].setAttribute('data-sort-direction', active ? direction : 'none');
    }
  }
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var sortButton = target.closest('[data-detail-sort]');
    if (sortButton) applyDetailSort(sortButton);
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var filterButton = target.closest('.th-filter-btn');
    if (filterButton) {
      var header = filterHeaderOf(filterButton);
      var dropdown = header && header.querySelector('.th-filter-dropdown');
      if (!dropdown) return;
      var opening = dropdown.hidden;
      var allDropdowns = document.querySelectorAll('.th-filter-dropdown');
      for (var i = 0; i < allDropdowns.length; i++) allDropdowns[i].hidden = true;
      var allButtons = document.querySelectorAll('.th-filter-btn');
      for (var j = 0; j < allButtons.length; j++) {
        allButtons[j].setAttribute('aria-expanded', 'false');
      }
      dropdown.hidden = !opening;
      filterButton.setAttribute('aria-expanded', opening ? 'true' : 'false');
      if (opening) {
        var search = dropdown.querySelector('.th-filter-search');
        if (search) search.focus();
      }
      return;
    }
    var clear = target.closest('.th-filter-clear');
    if (clear) {
      var clearHeader = filterHeaderOf(clear);
      if (!clearHeader) return;
      var checks = clearHeader.querySelectorAll('input[type="checkbox"]');
      for (var k = 0; k < checks.length; k++) checks[k].checked = false;
      var searchInput = clearHeader.querySelector('.th-filter-search');
      if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      syncFilterHeader(clearHeader);
      var clearGrid = clearHeader.closest('.detail-grid');
      if (clearGrid) applyDetailFilters(clearGrid);
    }
  });
  document.addEventListener('change', function (event) {
    var target = event.target;
    if (!target || !target.matches ||
        !target.matches('.th-filter-option input[type="checkbox"]')) return;
    var header = filterHeaderOf(target);
    if (!header) return;
    syncFilterHeader(header);
    var grid = header.closest('.detail-grid');
    if (grid) applyDetailFilters(grid);
  });
  document.addEventListener('input', function (event) {
    var target = event.target;
    if (!target || !target.matches || !target.matches('.th-filter-search')) return;
    var query = target.value.trim().toLowerCase();
    var header = filterHeaderOf(target);
    if (!header) return;
    var options = header.querySelectorAll('.th-filter-option');
    var visibleCount = 0;
    for (var i = 0; i < options.length; i++) {
      var label = options[i].textContent.trim().toLowerCase();
      var visible = !query || label.indexOf(query) !== -1;
      options[i].hidden = !visible;
      if (visible) visibleCount++;
    }
    var empty = header.querySelector('.th-filter-empty');
    if (empty) empty.hidden = visibleCount !== 0;
  });
  // Exported reports always start with filter menus closed, even if a menu
  // happened to be open on the live page when the DOM was cloned.
  var exportedFilterDropdowns = document.querySelectorAll('.th-filter-dropdown');
  for (var dropdownIndex = 0; dropdownIndex < exportedFilterDropdowns.length; dropdownIndex++) {
    exportedFilterDropdowns[dropdownIndex].hidden = true;
    var exportedHeader = exportedFilterDropdowns[dropdownIndex].closest('.filterable-th');
    var exportedButton = exportedHeader && exportedHeader.querySelector('.th-filter-btn');
    if (exportedButton) exportedButton.setAttribute('aria-expanded', 'false');
  }
  var detailGrids = document.querySelectorAll('.detail-grid');
  for (var detailIndex = 0; detailIndex < detailGrids.length; detailIndex++) {
    var filterHeaders = detailGrids[detailIndex].querySelectorAll('.filterable-th');
    for (var headerIndex = 0; headerIndex < filterHeaders.length; headerIndex++) {
      syncFilterHeader(filterHeaders[headerIndex]);
    }
    applyDetailFilters(detailGrids[detailIndex]);
  }

  // --- Floating Table of Contents ---
  var fab = document.querySelector('[data-export-toc-fab]');
  var list = document.querySelector('[data-export-toc-list]');
  var trigger = document.querySelector('[data-export-toc-trigger]');
  var panel = document.querySelector('[data-export-toc-panel]');
  if (!fab || !list || !trigger || !panel) return;

  // Discover anchorable sections from the cloned DOM. Anything with an id
  // matching one of these patterns counts as a top-level section. The exact
  // match list — in the order the TOC should display them — is:
  //   1. Overall result       (#overall)
  //   2. Exception rule summary (#exception-rule-summary)
  //   3. Attribute compare cards (#changes, #changes-…)
  //   4. Per rule             (#rule-…)
  //   5. Exception table      (#exception-table)
  var SECTION_IDS = {
    overall: 0,
    'exception-rule-summary': 1,
    changes: 2,
    rule: 3,
    'exception-table': 4,
  };
  function sectionOrder(id) {
    if (id === 'overall') return SECTION_IDS.overall;
    if (id === 'exception-rule-summary') return SECTION_IDS['exception-rule-summary'];
    if (id === 'changes') return SECTION_IDS.changes;
    // Attribute compare cards live at #changes-{sectionId}. Their inner
    // headings expose ids like #changes-title-{sectionId}; we want only the
    // outer section id, not the heading, in the TOC.
    if (id.indexOf('changes-') === 0 && id.indexOf('changes-title-') !== 0) {
      return SECTION_IDS.changes;
    }
    if (id.indexOf('rule-') === 0) return SECTION_IDS.rule;
    if (id === 'exception-table') return SECTION_IDS['exception-table'];
    return 99;
  }
  var seen = [];
  var nodes = document.querySelectorAll('main [id]');
  for (var i = 0; i < nodes.length; i++) {
    var id = nodes[i].id;
    if (sectionOrder(id) !== 99) seen.push(id);
  }
  seen.sort(function (a, b) {
    return sectionOrder(a) - sectionOrder(b);
  });

  if (seen.length === 0) {
    var empty = document.createElement('li');
    empty.className = 'export-toc-fab__empty';
    empty.textContent = 'No sections to jump to.';
    list.appendChild(empty);
    fab.style.display = 'none';
    return;
  }

  for (var j = 0; j < seen.length; j++) {
    var sectionId = seen[j];
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#' + sectionId;
    a.textContent = labelFor(sectionId);
    li.appendChild(a);
    list.appendChild(li);
  }

  function labelFor(id) {
    if (id === 'overall') return 'Overall result';
    if (id === 'new-books') return 'New Books';
    if (id === 'exception-rule-summary') return 'Exception rule summary';
    if (id === 'changes') return 'Attribute changes';
    if (id.indexOf('changes-') === 0) {
      var heading = document.getElementById(id);
      if (heading) {
        // User-defined comparison cards expose a heading whose id starts with
        // the prefix 'changes-title-'; fall back to the first heading
        // otherwise.
        var titled = heading.querySelector('[id^="changes-title-"]');
        if (titled) return titled.textContent.trim();
        var firstHeading = heading.querySelector('h1, h2, h3');
        if (firstHeading) return firstHeading.textContent.trim();
      }
      return 'Attribute changes — ' + id.slice('changes-'.length);
    }
    if (id.indexOf('rule-') === 0) {
      var ruleSection = document.getElementById(id);
      if (ruleSection) {
        var heading2 = ruleSection.querySelector('h1, h2, h3');
        if (heading2) return heading2.textContent.trim();
      }
      return id;
    }
    if (id === 'exception-table') return 'Exception Table';
    return id;
  }

  // Reveal on hover/focus, hide when the cursor leaves the FAB wrapper.
  // We listen on the wrapper so that moving from the trigger onto the panel
  // does not dismiss the popup prematurely.
  var hideTimer = null;
  function show() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    fab.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
  }
  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      fab.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }, 160);
  }
  fab.addEventListener('mouseenter', show);
  fab.addEventListener('mouseleave', scheduleHide);
  trigger.addEventListener('focus', show);
  trigger.addEventListener('blur', scheduleHide);
  // Click the trigger toggles the popup for keyboard / touch users.
  trigger.addEventListener('click', function (event) {
    event.preventDefault();
    if (fab.classList.contains('is-open')) scheduleHide();
    else show();
  });

  // Highlight the currently-visible section in the TOC as the user scrolls.
  var links = list.querySelectorAll('a');
  function syncActive() {
    var fromTop = window.scrollY + 120;
    var current = null;
    for (var k = 0; k < seen.length; k++) {
      var el = document.getElementById(seen[k]);
      if (el && el.offsetTop <= fromTop) current = seen[k];
    }
    for (var m = 0; m < links.length; m++) {
      var li = links[m].parentNode;
      if (links[m].getAttribute('href') === '#' + current) {
        li.classList.add('is-current');
      } else {
        li.classList.remove('is-current');
      }
    }
  }
  window.addEventListener('scroll', syncActive, { passive: true });
  syncActive();
})();
`;

function normalizeReportHeader(clone: HTMLElement, reportName: string): void {
  const header = clone.querySelector(".results-header");
  header?.classList.add("export-report-header");

  const reportNameContainer = clone.querySelector(".report-name, .report-name-edit");
  if (!reportNameContainer) return;
  const heading = document.createElement("h1");
  heading.className = "section-heading export-report-name";
  heading.textContent = reportName;
  reportNameContainer.replaceWith(heading);
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
