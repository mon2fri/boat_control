/** One offline hover renderer shared by every preview in a standalone report. */
export const GROUPING_PREVIEW_JS = String.raw`
(function () {
  var panel = document.createElement('div');
  panel.className = 'rule-grouping-preview';
  panel.id = 'report-grouping-preview';
  panel.setAttribute('role', 'tooltip');
  panel.hidden = true;
  document.body.appendChild(panel);
  var active = null;
  var timer;
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function label(text) {
    var match = /^(Filter|Condition|Expectation|Group) (\d+)(?::\s*(.*))?$/i.exec(text);
    if (!match) return element('span', '', text);
    var wrapper = element('span', 'group-clause-label');
    wrapper.appendChild(element('span', 'condition-number' + (match[1].toLowerCase() === 'group' ? ' group-number' : ''), match[1] + ' ' + match[2]));
    if (match[3]) wrapper.appendChild(element('span', '', match[3]));
    return wrapper;
  }
  function tree(node, labels, groups) {
    var item = element('li', 'group-tree-node');
    var row = element('span', 'group-tree-member-row');
    if (node.kind === 'leaf') {
      row.appendChild(label(labels[node.conditionId] || 'Unavailable clause'));
    } else {
      row.appendChild(label('Group ' + groups.get(node)));
      row.appendChild(element('span', 'group-tree-type group-tree-type--group', node.kind.toUpperCase()));
    }
    item.appendChild(row);
    if (node.kind !== 'leaf') {
      var children = element('ul', 'group-tree-children');
      node.children.forEach(function (child) { children.appendChild(tree(child, labels, groups)); });
      item.appendChild(children);
    }
    return item;
  }
  function hide() {
    clearTimeout(timer);
    panel.hidden = true;
    if (active) active.removeAttribute('aria-describedby');
    active = null;
  }
  function scheduleHide() { clearTimeout(timer); timer = setTimeout(hide, 120); }
  function show(button) {
    clearTimeout(timer);
    if (active === button && !panel.hidden) return;
    hide();
    var data;
    try { data = JSON.parse(button.getAttribute('data-grouping-preview')); }
    catch (_) { return; }
    panel.replaceChildren();
    panel.appendChild(element('h3', '', data.title));
    if (data.description) panel.appendChild(element('p', 'field-hint', data.description));
    var columns = element('div', 'rule-grouping-preview__columns');
    data.sections.forEach(function (section) {
      var column = element('section', '');
      column.setAttribute('aria-label', section.title);
      column.appendChild(element('h4', '', section.title));
      if (section.errors && section.errors.length) {
        var warning = element('p', 'alert alert--error', section.errors.join(' '));
        warning.setAttribute('role', 'alert');
        column.appendChild(warning);
      }
      if (section.tree) {
        var groups = new Map();
        function number(node) {
          if (node.kind === 'leaf') return;
          node.children.forEach(number);
          groups.set(node, groups.size + 1);
        }
        number(section.tree);
        var labels = Object.create(null);
        section.clauses.forEach(function (clause) { labels[clause.id] = clause.label; });
        var list = element('ul', 'group-tree-children group-tree-children--root');
        list.appendChild(tree(section.tree, labels, groups));
        column.appendChild(list);
      } else if (section.clauses.length) {
        var list = element('ul', '');
        section.clauses.forEach(function (clause) {
          var item = element('li', ''); item.appendChild(label(clause.label)); list.appendChild(item);
        });
        column.appendChild(list);
      } else column.appendChild(element('p', 'field-hint', section.emptyText));
      columns.appendChild(column);
    });
    panel.appendChild(columns);
    active = button;
    button.setAttribute('aria-describedby', panel.id);
    panel.hidden = false;
    var anchor = button.getBoundingClientRect();
    var bounds = panel.getBoundingClientRect();
    panel.style.left = Math.max(16, Math.min(anchor.left, innerWidth - bounds.width - 16)) + 'px';
    var top = anchor.bottom + 8;
    if (top + bounds.height > innerHeight - 16) top = anchor.top - bounds.height - 8;
    panel.style.top = Math.max(16, Math.min(top, innerHeight - bounds.height - 16)) + 'px';
  }
  document.addEventListener('mouseover', function (event) {
    var button = event.target.closest && event.target.closest('[data-grouping-preview]');
    if (button) show(button);
    else if (panel.contains(event.target)) clearTimeout(timer);
  });
  document.addEventListener('mouseout', function (event) {
    if (!active) return;
    var next = event.relatedTarget;
    if (next && (panel.contains(next) || active.contains(next))) return;
    if (panel.contains(event.target) || active.contains(event.target)) scheduleHide();
  });
  document.addEventListener('focusin', function (event) {
    var button = event.target.closest && event.target.closest('[data-grouping-preview]');
    if (button) show(button);
  });
  document.addEventListener('focusout', scheduleHide);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide);
  window.addEventListener('resize', hide);
})();
`;
