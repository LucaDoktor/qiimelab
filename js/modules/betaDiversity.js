import { state, subscribe } from '../state.js';
import { t } from '../lib/i18n.js';
import { upgma, leafOrder } from '../lib/stats.js';
import { loadExampleCommunityData, loadRealCommunityData, mountExampleButtons } from '../lib/exampleData.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function line(x1, y1, x2, y2) {
  return svgEl('line', { x1, y1, x2, y2, class: 'ql-baseline-line' });
}

function drawDendrogram(node, svg, xOf, yScale) {
  if (!node.left && !node.right) {
    return { x: xOf(node.label), y: yScale(0) };
  }
  const L = drawDendrogram(node.left, svg, xOf, yScale);
  const R = drawDendrogram(node.right, svg, xOf, yScale);
  const y = yScale(node.height);
  svg.appendChild(line(L.x, L.y, L.x, y));
  svg.appendChild(line(R.x, R.y, R.x, y));
  svg.appendChild(line(L.x, y, R.x, y));
  return { x: (L.x + R.x) / 2, y };
}

export function render(container) {
  let metric = null;

  function paint() {
    container.innerHTML = '';
    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('beta.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('beta.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('beta.subtitle') + '</p>';
    container.appendChild(header);

    if (!state.betaDiversity) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      card.innerHTML =
        '<div class="ql-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="17" r="2.4"/><circle cx="17" cy="17" r="2.4"/><circle cx="12" cy="7" r="2.4"/><path d="m9 15.5 1.7-6M15 15.5l-1.7-6"/></svg>' +
        '<h3>' + t('beta.emptyTitle') + '</h3>' +
        '<p>' + t('beta.emptyDesc') + '</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
        '<a href="#/cargar" class="ql-btn">' + t('ui.goLoadData') + '</a></div></div>';
      container.appendChild(card);
      mountExampleButtons(card.querySelector('.ql-empty'), {
        real: loadRealCommunityData,
        synthetic: loadExampleCommunityData,
      });
      return;
    }

    const metrics = Object.keys(state.betaDiversity.metrics);
    if (!metric || !metrics.includes(metric)) metric = metrics[0];
    const data = state.betaDiversity.metrics[metric];

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<h2>' + escapeHtml(metric) + '</h2><p class="ql-panel-note">' + t('beta.chartNote') + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap scroll-x';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': t('a11y.chartHeatmapBeta') });
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
      f.innerHTML = '<label>' + t('beta.metricLabel') + '</label>';
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
    const statsBox = document.createElement('div');
    statsBox.innerHTML = '<div class="ql-stats">' +
      '<div class="ql-stat"><div class="ql-stat-label">' + t('beta.statSamples') + '</div><div class="ql-stat-value" style="font-size:20px;">' + data.sampleIds.length + '</div></div></div>';
    controls.appendChild(statsBox);

    const legendBox = document.createElement('div');
    legendBox.style.marginTop = '18px';
    legendBox.innerHTML = '<div class="ql-field-help" style="margin-bottom:6px;">' + t('beta.legendTitle') + '</div>' +
      '<div style="height:12px;border-radius:4px;background:linear-gradient(90deg, var(--surface), var(--depleted));border:1px solid var(--border);"></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-muted);margin-top:4px;"><span>' + t('beta.legendSimilar') + '</span><span>' + t('beta.legendDistinct') + '</span></div>';
    controls.appendChild(legendBox);

    const privacy = document.createElement('p');
    privacy.className = 'ql-privacy';
    privacy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"/></svg>' + t('beta.upgmaLocal');
    controls.appendChild(privacy);

    grid.appendChild(controls);
    container.appendChild(grid);

    // tabla
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t('beta.tableTitle') + '</h2><p class="ql-panel-note">' + t('beta.tableNote') + '</p>';
    container.appendChild(tableCard);

    // ---- clustering ----
    const tree = data.sampleIds.length > 1 ? upgma(data.matrix, data.sampleIds) : null;
    const order = tree ? leafOrder(tree) : data.sampleIds.slice();
    const idxOf = {};
    data.sampleIds.forEach((id, i) => { idxOf[id] = i; });

    // ---- layout ----
    const n = order.length;
    const cellSize = Math.max(10, Math.min(28, 640 / n));
    const marginL = 120, marginR = 20, marginT = 90, marginB = 20;
    const gridSize = cellSize * n;
    const W = marginL + gridSize + marginR;
    const H = marginT + gridSize + marginB;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.width = W + 'px';
    svg.style.maxWidth = 'none';
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    function xOf(label) { return marginL + order.indexOf(label) * cellSize + cellSize / 2; }
    const dendroTop = 10, dendroBottom = marginT - 6;
    const maxHeight = tree ? tree.height || 1e-9 : 1;
    function yScaleDendro(h) { return dendroBottom - (h / maxHeight) * (dendroBottom - dendroTop); }

    if (tree && n > 1) drawDendrogram(tree, svg, xOf, yScaleDendro);

    // heatmap
    const allDistances = [];
    data.matrix.forEach((row) => row.forEach((v) => allDistances.push(v)));
    const maxDist = Math.max(...allDistances, 1e-9);

    order.forEach((rowId, ri) => {
      order.forEach((colId, ci) => {
        const v = data.matrix[idxOf[rowId]][idxOf[colId]];
        const frac = Math.max(0, Math.min(1, v / maxDist));
        const rect = svgEl('rect', {
          x: marginL + ci * cellSize, y: marginT + ri * cellSize, width: cellSize - 1, height: cellSize - 1,
          fill: 'color-mix(in srgb, var(--depleted) ' + Math.round(frac * 100) + '%, var(--surface))',
        });
        rect.addEventListener('mouseenter', () => {
          const wrapRect = chartWrap.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();
          const scaleX = svgRect.width / W, scaleY = svgRect.height / H;
          const cx = marginL + ci * cellSize + cellSize / 2, cy = marginT + ri * cellSize + cellSize / 2;
          tooltip.style.left = ((svgRect.left - wrapRect.left) + cx * scaleX + chartWrap.scrollLeft) + 'px';
          tooltip.style.top = ((svgRect.top - wrapRect.top) + cy * scaleY) + 'px';
          tooltip.innerHTML = '<div class="ql-tt-name">' + escapeHtml(rowId) + ' — ' + escapeHtml(colId) + '</div><div class="ql-tt-row">' + t('beta.ttDistance') + ': ' + v.toFixed(4) + '</div>';
          tooltip.classList.add('is-show');
        });
        rect.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
        svg.appendChild(rect);
      });
    });

    // etiquetas de fila
    const showEvery = n > 30 ? Math.ceil(n / 30) : 1;
    order.forEach((id, i) => {
      if (i % showEvery !== 0) return;
      const t = svgEl('text', { x: marginL - 8, y: marginT + i * cellSize + cellSize / 2 + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
      t.textContent = id;
      svg.appendChild(t);
    });

    // tabla
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll scroll-x';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    let theadHtml = '<thead><tr><th><button type="button">' + t('beta.colSample') + '</button></th>';
    order.forEach((id) => { theadHtml += '<th><button type="button">' + escapeHtml(id) + '</button></th>'; });
    theadHtml += '</tr></thead>';
    tbl.innerHTML = theadHtml;
    const tbody = document.createElement('tbody');
    order.forEach((rowId) => {
      const tr = document.createElement('tr');
      let cells = '<td>' + escapeHtml(rowId) + '</td>';
      order.forEach((colId) => {
        cells += '<td class="ql-num tabular">' + data.matrix[idxOf[rowId]][idxOf[colId]].toFixed(3) + '</td>';
      });
      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);
  }

  paint();
  return subscribe(paint);
}
