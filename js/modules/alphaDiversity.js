import { state, subscribe } from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { formatP } from '../lib/stats.js';
import { drawGroupBoxplot } from '../lib/groupBoxplot.js';
import {
  collectAlphaMetrics, groupRichnessEstimators, RICHNESS_ESTIMATORS,
} from '../lib/alphaMetrics.js';
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

function fmt(v, d) {
  return (typeof v === 'number' && isFinite(v)) ? v.toFixed(d) : '—';
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

    const allMetrics = collectAlphaMetrics();
    const haveData = allMetrics.length > 0;

    if (!haveData || !state.metadata) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      const missing = [];
      if (!haveData) missing.push(t('alpha.needMetric'));
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
        download: ['shannon', 'observed', 'counts', 'metadata'],
      });
      return;
    }

    const metricNames = allMetrics.map((m) => m.name);
    if (!metric || !metricNames.includes(metric)) metric = metricNames[0];
    const curMetric = allMetrics.find((m) => m.name === metric);
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

    if (allMetrics.length > 1) {
      const f = document.createElement('div');
      f.className = 'ql-field';
      f.innerHTML = '<label>' + t('alpha.metricLabel') + '</label>';
      const sel = document.createElement('select');
      allMetrics.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.label + (m.computed ? ' · ' + t('alpha.computedTag') : '');
        if (m.name === metric) opt.selected = true;
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

    // aviso si se mezclan métricas de archivo (posible nivel ASV) con calculadas
    if (allMetrics.some((m) => m.computed) && allMetrics.some((m) => !m.computed)) {
      const mix = document.createElement('p');
      mix.className = 'ql-field-help';
      mix.textContent = t('alpha.computedNote');
      controls.appendChild(mix);
    }

    const statsBox = document.createElement('div');
    statsBox.style.marginTop = '18px';
    controls.appendChild(statsBox);

    grid.appendChild(controls);
    container.appendChild(grid);

    // tabla por muestra
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t('alpha.tableTitle') + '</h2>';
    container.appendChild(tableCard);

    if (!groupCol) return;

    // ---- construir grupos ----
    const values = curMetric.values;
    const metaByKey = {};
    state.metadata.rows.forEach((r) => { metaByKey[r[state.metadata.sampleIdKey]] = r; });
    // resolutor tolerante a sufijos (A-1 ↔ A-1-16S-…)
    const metaKeys = Object.keys(metaByKey);
    const resolveMeta = (sid) => {
      if (metaByKey[sid]) return metaByKey[sid];
      const hit = metaKeys.find((k) => sid.startsWith(k) || k.startsWith(sid));
      return hit ? metaByKey[hit] : undefined;
    };

    const groupNames = [];
    const groupData = {};
    const perSampleRows = [];
    Object.keys(values).forEach((sampleId) => {
      const v = values[sampleId];
      if (typeof v !== 'number' || !isFinite(v)) return;
      const meta = resolveMeta(sampleId);
      const g = meta ? meta[groupCol] : undefined;
      if (g === undefined || g === '') return;
      if (!groupData[g]) { groupData[g] = []; groupNames.push(g); }
      groupData[g].push(v);
      perSampleRows.push({ sampleId, group: g, value: v });
    });
    groupNames.sort();

    if (groupNames.length === 0) {
      statsBox.innerHTML = '<p class="ql-field-help">' + t('alpha.noMatch') + '</p>';
      renderGroupEstimators(groupCol);
      return;
    }

    const decimals = /^(chao1|observed)$/.test(metric) ? 2 : 3;
    const { kw, ceElements } = drawGroupBoxplot({
      svg, chartWrap, tooltip, groupNames, groupData,
      title: t('alpha.title'), xTitle: groupCol, yTitle: curMetric.label, valueLabel: curMetric.label,
      valueDecimals: decimals,
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
      escapeHtml(groupCol) + '</button></th><th><button type="button">' + escapeHtml(curMetric.label) + '</button></th></tr></thead>';
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

    renderGroupEstimators(groupCol);
  }

  // Tabla comparativa por grupo: Chao2, jackknife 1º/2º orden, bootstrap — todos
  // por INCIDENCIA (en cuántas muestras del grupo aparece cada taxón). No son de
  // una muestra suelta, por eso van en su propia tabla y no en el boxplot.
  function renderGroupEstimators(groupCol) {
    const rows = groupRichnessEstimators(groupCol);
    if (!rows || rows.length === 0) return;

    const card = document.createElement('section');
    card.className = 'ql-card ql-panel';
    card.style.marginTop = '20px';
    card.innerHTML =
      '<h2>' + t('alpha.groupRichTitle') + '</h2>' +
      '<p class="ql-panel-note">' + t('alpha.groupRichNote') + '</p>';

    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    let head = '<thead><tr><th>' + escapeHtml(groupCol) + '</th><th>n</th>';
    RICHNESS_ESTIMATORS.forEach((e) => { head += '<th>' + escapeHtml(e.label) + '</th>'; });
    tbl.innerHTML = head + '</tr></thead>';
    const tbody = document.createElement('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      let cells = '<td>' + escapeHtml(String(r.group)) + '</td><td class="ql-num tabular">' + r.n + '</td>';
      RICHNESS_ESTIMATORS.forEach((e) => {
        const se = e.se && isFinite(r[e.se]) ? ' <span class="ql-se">± ' + r[e.se].toFixed(1) + '</span>' : '';
        cells += '<td class="ql-num tabular">' + fmt(r[e.key], 1) + se + '</td>';
      });
      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    scrollDiv.appendChild(tbl);
    card.appendChild(scrollDiv);

    const dl = document.createElement('dl');
    dl.className = 'ql-metric-defs';
    RICHNESS_ESTIMATORS.forEach((e) => {
      const dt = document.createElement('dt');
      dt.textContent = e.label;
      const dd = document.createElement('dd');
      dd.textContent = t(e.ex);
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    card.appendChild(dl);
    container.appendChild(card);
  }

  paint();
  const stop = subscribe(paint);
  return () => { stop(); if (editor) { editor.destroy(); editor = null; } };
}
