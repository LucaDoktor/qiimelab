import { state, subscribe } from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { kruskalWallis, quartiles, formatP } from '../lib/stats.js';
import { loadExampleCommunityData, loadRealCommunityData, mountExampleButtons } from '../lib/exampleData.js';
import { attachChartEditor } from '../lib/chartEditor.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CAT_VARS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7'];

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

    const kw = groupNames.length >= 2 ? kruskalWallis(groupNames.map((g) => groupData[g])) : null;

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

    // ---- dibujar boxplot ----
    const kwSig = kw && isFinite(kw.p) && kw.p < 0.05;
    const legCols = groupNames.length > 5 ? 2 : 1;
    const legRows = Math.ceil(groupNames.length / legCols);
    const marginL = 52, marginR = 20, marginT = kwSig ? 68 : 44;
    const marginB = 58 + legRows * 15;
    const innerH = 360;
    const slotW = 140;
    const W = Math.max(marginL + marginR + slotW * groupNames.length, 420);
    const H = marginT + innerH + marginB;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    const allVals = perSampleRows.map((r) => r.value);
    const vMin = Math.min(...allVals), vMax = Math.max(...allVals);
    const pad = (vMax - vMin) * 0.15 || 1;
    const yMin = vMin - pad, yMax = vMax + pad;
    function yScale(v) { return marginT + innerH - ((v - yMin) / (yMax - yMin)) * innerH; }

    // gridlines
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = yMin + (i / ticks) * (yMax - yMin);
      const y = yScale(v);
      svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, class: 'ql-gridline' }));
      const t = svgEl('text', { x: marginL - 8, y: y + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
      t.textContent = v.toFixed(2);
      svg.appendChild(t);
    }
    svg.appendChild(svgEl('line', { x1: marginL, x2: marginL, y1: marginT, y2: marginT + innerH, class: 'ql-baseline-line' }));

    const rnd = mulberry32(42);
    groupNames.forEach((g, gi) => {
      const cx = marginL + slotW * gi + slotW / 2;
      const vals = groupData[g].slice().sort((a, b) => a - b);
      const { q1, median, q3 } = quartiles(vals);
      const iqr = q3 - q1;
      const loFence = q1 - 1.5 * iqr, hiFence = q3 + 1.5 * iqr;
      const whiskerLo = Math.min(...vals.filter((v) => v >= loFence));
      const whiskerHi = Math.max(...vals.filter((v) => v <= hiFence));
      const colorVar = CAT_VARS[gi % CAT_VARS.length];
      const boxW = 44;

      // bigotes
      svg.appendChild(svgEl('line', { x1: cx, x2: cx, y1: yScale(whiskerLo), y2: yScale(q1), class: 'ql-baseline-line' }));
      svg.appendChild(svgEl('line', { x1: cx, x2: cx, y1: yScale(q3), y2: yScale(whiskerHi), class: 'ql-baseline-line' }));
      svg.appendChild(svgEl('line', { x1: cx - 10, x2: cx + 10, y1: yScale(whiskerLo), y2: yScale(whiskerLo), class: 'ql-baseline-line' }));
      svg.appendChild(svgEl('line', { x1: cx - 10, x2: cx + 10, y1: yScale(whiskerHi), y2: yScale(whiskerHi), class: 'ql-baseline-line' }));

      // caja
      svg.appendChild(svgEl('rect', {
        x: cx - boxW / 2, y: yScale(q3), width: boxW, height: Math.max(1, yScale(q1) - yScale(q3)),
        fill: 'var(' + colorVar + ')', 'fill-opacity': 0.16, stroke: 'var(' + colorVar + ')', 'stroke-width': 1.5, rx: 3,
      }));
      // mediana
      svg.appendChild(svgEl('line', { x1: cx - boxW / 2, x2: cx + boxW / 2, y1: yScale(median), y2: yScale(median), stroke: 'var(' + colorVar + ')', 'stroke-width': 2.5 }));

      // puntos individuales con jitter
      vals.forEach((v) => {
        const jitter = (rnd() - 0.5) * boxW * 0.7;
        const c = svgEl('circle', { cx: cx + jitter, cy: yScale(v), r: 3.2, fill: 'var(' + colorVar + ')', opacity: 0.75, stroke: 'var(--surface)', 'stroke-width': 1 });
        c.addEventListener('mouseenter', () => {
          const wrapRect = chartWrap.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();
          const scaleX = svgRect.width / W, scaleY = svgRect.height / H;
          tooltip.style.left = ((svgRect.left - wrapRect.left) + (cx + jitter) * scaleX) + 'px';
          tooltip.style.top = ((svgRect.top - wrapRect.top) + yScale(v) * scaleY) + 'px';
          tooltip.innerHTML = '<div class="ql-tt-name">' + escapeHtml(String(g)) + '</div><div class="ql-tt-row">' + metric + ': ' + v.toFixed(3) + '</div>';
          tooltip.classList.add('is-show');
        });
        c.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
        svg.appendChild(c);
      });

      const labelT = svgEl('text', { x: cx, y: marginT + innerH + 24, class: 'ql-tick-label', 'text-anchor': 'middle' });
      labelT.textContent = String(g);
      svg.appendChild(labelT);
    });

    // Anotación de significación (propuesta propia): si el test global de
    // Kruskal-Wallis sale significativo, un corchete arriba con los
    // asteriscos y la p. No sustituye al panel de estadística, lo refleja
    // en la propia figura para que se lea sin salir del gráfico.
    if (kwSig && groupNames.length >= 2) {
      const stars = kw.p < 0.001 ? '∗∗∗' : kw.p < 0.01 ? '∗∗' : '∗';
      const bx1 = marginL + slotW / 2;
      const bx2 = marginL + slotW * (groupNames.length - 1) + slotW / 2;
      const by = marginT - 16;
      const gSig = svgEl('g', { 'data-ce': 'sig' });
      gSig.appendChild(svgEl('path', {
        d: 'M' + bx1 + ' ' + (by + 6) + ' V' + by + ' H' + bx2 + ' V' + (by + 6),
        fill: 'none', class: 'ql-baseline-line',
      }));
      const sigT = svgEl('text', { x: (bx1 + bx2) / 2, y: by - 5, class: 'ql-axis-label', 'text-anchor': 'middle' });
      sigT.textContent = t('alpha.kwBracket', { stars, p: formatP(kw.p) });
      gSig.appendChild(sigT);
      svg.appendChild(gSig);
    }

    const yTitle = svgEl('text', {
      x: 14, y: marginT + innerH / 2, class: 'ql-axis-label', 'text-anchor': 'middle',
      transform: 'rotate(-90 14 ' + (marginT + innerH / 2) + ')', 'data-ce': 'ytitle',
    });
    yTitle.textContent = metric;
    svg.appendChild(yTitle);

    const xLabelBase = marginT + innerH + 44;
    const xTitle = svgEl('text', { x: marginL + (W - marginL - marginR) / 2, y: xLabelBase, class: 'ql-axis-label', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
    xTitle.textContent = groupCol || '';
    svg.appendChild(xTitle);

    // leyenda dentro del SVG (editable + exportable)
    const legG = svgEl('g', { 'data-ce': 'legend' });
    const colW = Math.min(260, (W - marginL - marginR) / legCols);
    groupNames.forEach((g, i) => {
      const col = Math.floor(i / legRows), rw = i % legRows;
      const xx = col * colW, yy = rw * 15;
      legG.appendChild(svgEl('rect', { x: xx, y: yy - 8, width: 10, height: 10, rx: 2, fill: 'var(' + CAT_VARS[i % CAT_VARS.length] + ')' }));
      const lt = svgEl('text', { x: xx + 15, y: yy, class: 'ql-tick-label' });
      lt.textContent = String(g) + ' (n=' + groupData[g].length + ')';
      legG.appendChild(lt);
    });
    legG.setAttribute('transform', 'translate(' + marginL + ',' + (xLabelBase + 16) + ')');
    svg.appendChild(legG);

    editor = attachChartEditor({
      key: 'alphaDiversity', svg, mount: chartPanel, filename: t('alpha.title') + '-' + metric, lang: getLang(),
      elements: [
        { id: 'title', create: { text: t('alpha.title'), x: W / 2, y: 24, anchor: 'middle', cls: 'ce-title' } },
        { id: 'xtitle', selector: '[data-ce="xtitle"]' },
        { id: 'ytitle', selector: '[data-ce="ytitle"]' },
        { id: 'sig', selector: '[data-ce="sig"]', kind: 'group' },
        { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
      ],
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
