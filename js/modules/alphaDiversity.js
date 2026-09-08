import { state, subscribe } from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { formatP } from '../lib/stats.js';
import { drawGroupBoxplot } from '../lib/groupBoxplot.js';
import { loadExampleCommunityData, loadRealCommunityData, mountExampleButtons } from '../lib/exampleData.js';
import { attachChartEditor } from '../lib/chartEditor.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function render(container) {
  let metric = null;
  let groupCol = null;
  let editor = null;

  function paint() {
    if (editor) { editor.destroy(); editor = null; }
    container.innerHTML = '';
    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('alpha.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('alpha.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('alpha.subtitle') + '</p>';
    container.appendChild(header);

    if (!state.alphaDiversity || !state.metadata) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      const missing = [];
      if (!state.alphaDiversity) missing.push(t('alpha.needMetric'));
      if (!state.metadata) missing.push(t('alpha.needMeta'));
      card.innerHTML =
        '<div class="ql-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4" y="9" width="4" height="11"/><rect x="10" y="4" width="4" height="16"/><rect x="16" y="12" width="4" height="8"/></svg>' +
        '<h3>' + t('alpha.emptyTitle') + '</h3><p>' + t('alpha.emptyNeed', { list: missing.join(t('ui.needAnd')) }) + '</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
        '<a href="#/cargar" class="ql-btn">' + t('ui.goLoadData') + '</a></div></div>';
      container.appendChild(card);
      mountExampleButtons(card.querySelector('.ql-empty'), {
        real: loadRealCommunityData,
        synthetic: loadExampleCommunityData,
        download: ['shannon', 'observed', 'metadata'],
      });
      return;
    }

    const metrics = Object.keys(state.alphaDiversity.metrics);
    if (!metric || !metrics.includes(metric)) metric = metrics[0];
    const groupOptions = state.metadata.headers.filter((h) => h !== state.metadata.sampleIdKey);
    if (!groupCol || !groupOptions.includes(groupCol)) groupCol = groupOptions[0] || null;

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<p class="ql-panel-note" style="margin-bottom:4px;">' + t('alpha.chartNote') + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': t('a11y.chartBoxplotAlpha') });
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg);
    chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);
    grid.appendChild(chartPanel);

    const controls = document.createElement('aside');
    controls.className = 'ql-card ql-panel';
    controls.innerHTML = '<h2>' + t('ui.controls') + '</h2>';

    if (metrics.length > 1) {
      const f = document.createElement('div');
      f.className = 'ql-field';
      f.innerHTML = '<label>' + t('alpha.metricLabel') + '</label>';
      const sel = document.createElement('select');
      metrics.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        if (m === metric) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => { metric = sel.value; paint(); });
      f.appendChild(sel);
      controls.appendChild(f);
    }

    if (groupOptions.length > 0) {
      const f = document.createElement('div');
      f.className = 'ql-field';
      f.innerHTML = '<label>' + t('alpha.groupLabel') + '</label>';
      const sel = document.createElement('select');
      groupOptions.forEach((g) => {
        const opt = document.createElement('option');
        opt.value = g; opt.textContent = g;
        if (g === groupCol) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => { groupCol = sel.value; paint(); });
      f.appendChild(sel);
      controls.appendChild(f);
    }

    const statsBox = document.createElement('div');
    statsBox.style.marginTop = '18px';
    controls.appendChild(statsBox);

    grid.appendChild(controls);
    container.appendChild(grid);

    // tabla
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t('alpha.tableTitle') + '</h2>';
    container.appendChild(tableCard);

    if (!groupCol) return;

    // ---- construir grupos ----
    const values = state.alphaDiversity.metrics[metric].values;
    const metaByKey = {};
    state.metadata.rows.forEach((r) => { metaByKey[r[state.metadata.sampleIdKey]] = r; });

    const groupNames = [];
    const groupData = {};
    const perSampleRows = [];
    Object.keys(values).forEach((sampleId) => {
      const meta = metaByKey[sampleId];
      const g = meta ? meta[groupCol] : undefined;
      if (g === undefined || g === '') return;
      if (!groupData[g]) { groupData[g] = []; groupNames.push(g); }
      groupData[g].push(values[sampleId]);
      perSampleRows.push({ sampleId, group: g, value: values[sampleId] });
    });
    groupNames.sort();

    if (groupNames.length === 0) {
      statsBox.innerHTML = '<p class="ql-field-help">' + t('alpha.noMatch') + '</p>';
      return;
    }

    const { kw, ceElements } = drawGroupBoxplot({
      svg, chartWrap, tooltip, groupNames, groupData,
      title: t('alpha.title'), xTitle: groupCol, yTitle: metric, valueLabel: metric,
    });

    statsBox.innerHTML =
      '<div class="ql-stats">' +
      '<div class="ql-stat"><div class="ql-stat-label">' + t('alpha.statGroups') + '</div><div class="ql-stat-value" style="font-size:20px;">' + groupNames.length + '</div></div>' +
      '<div class="ql-stat"><div class="ql-stat-label">' + t('alpha.statSamples') + '</div><div class="ql-stat-value" style="font-size:20px;">' + perSampleRows.length + '</div></div>' +
      '</div>' +
      (kw ? '<div style="margin-top:14px;padding:12px;border-radius:var(--radius-md);background:var(--page);border:1px solid var(--border);">' +
        '<div style="font-size:11px;color:var(--ink-muted);margin-bottom:4px;">Kruskal-Wallis</div>' +
        '<div class="mono tabular" style="font-size:13px;">H = ' + kw.H.toFixed(3) + ', df = ' + kw.df + '</div>' +
        '<div class="mono tabular" style="font-size:13px;">p = ' + formatP(kw.p) + (kw.p < 0.05 ? ' <span class="ql-badge ql-badge-good" style="margin-left:6px;">' + t('alpha.kwSignificant') + '</span>' : '') + '</div>' +
        '</div>' +
        '<p class="ql-field-help">' + t('alpha.kwHelp') + '</p>'
        : '<p class="ql-field-help">' + t('alpha.kwOneGroup') + '</p>');

    editor = attachChartEditor({
      key: 'alphaDiversity', svg, mount: chartPanel, filename: t('alpha.title') + '-' + metric, lang: getLang(),
      elements: ceElements,
      onReset: () => paint(),
    });

    // tabla
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    tbl.innerHTML = '<thead><tr><th><button type="button">' + t('alpha.colSample') + '</button></th><th><button type="button">' +
      escapeHtml(groupCol) + '</button></th><th><button type="button">' + escapeHtml(metric) + '</button></th></tr></thead>';
    const tbody = document.createElement('tbody');
    perSampleRows.sort((a, b) => a.group === b.group ? a.value - b.value : String(a.group).localeCompare(String(b.group)))
      .forEach((r) => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + escapeHtml(r.sampleId) + '</td><td>' + escapeHtml(String(r.group)) + '</td><td class="ql-num tabular">' + r.value.toFixed(4) + '</td>';
        tbody.appendChild(tr);
      });
    tbl.appendChild(tbody);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);
  }

  paint();
  const stop = subscribe(paint);
  return () => { stop(); if (editor) { editor.destroy(); editor = null; } };
}
