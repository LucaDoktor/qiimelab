import { state, subscribe } from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { upgma, leafOrder } from '../lib/stats.js';
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
function line(x1, y1, x2, y2) {
  return svgEl('line', { x1, y1, x2, y2, class: 'ql-baseline-line' });
}
function drawDendrogram(node, svg, xOf, yScale) {
  if (!node.left && !node.right) return { x: xOf(node.label), y: yScale(0) };
  const L = drawDendrogram(node.left, svg, xOf, yScale);
  const R = drawDendrogram(node.right, svg, xOf, yScale);
  const y = yScale(node.height);
  svg.appendChild(line(L.x, L.y, L.x, y));
  svg.appendChild(line(R.x, R.y, R.x, y));
  svg.appendChild(line(L.x, y, R.x, y));
  return { x: (L.x + R.x) / 2, y };
}

// explicación llana de una métrica de distancia, por su nombre
const BETA_EXPLAIN = [
  [/bray.?curtis/i, 'beta.exBray'],
  [/jaccard/i, 'beta.exJaccard'],
  [/unweighted.*unifrac/i, 'beta.exUwUnifrac'],
  [/weighted.*unifrac/i, 'beta.exWUnifrac'],
  [/unifrac/i, 'beta.exUnifrac'],
  [/aitchison/i, 'beta.exAitchison'],
];
function explainBetaMetric(name) {
  const n = String(name || '').trim();
  for (const [re, key] of BETA_EXPLAIN) if (re.test(n)) return t(key);
  return null;
}
function metricExplainEl(name) {
  const txt = explainBetaMetric(name);
  if (!txt) return null;
  const p = document.createElement('p');
  p.className = 'ql-metric-explain';
  p.innerHTML = '<strong>' + escapeHtml(String(name)) + '.</strong> ' + escapeHtml(txt);
  return p;
}

// muestra → grupo, tolerante a sufijos (A-1 ↔ A-1-16S-…)
function groupResolver(meta, groupCol) {
  const map = {};
  meta.rows.forEach((r) => {
    const id = String(r[meta.sampleIdKey] ?? '').trim();
    const g = String(r[groupCol] ?? '').trim();
    if (id && g) map[id] = g;
  });
  return (sid) => {
    if (map[sid] != null) return map[sid];
    const hit = Object.keys(map).find((k) => sid.startsWith(k) || k.startsWith(sid));
    return hit ? map[hit] : null;
  };
}

export function render(container) {
  let view = 'heatmap';
  let metric = null;
  let orderMode = 'clustering';
  let pcX = 0, pcY = 1;
  let pcoaGroupCol = null;
  let editor = null;

  function paint() {
    if (editor) { editor.destroy(); editor = null; }
    container.innerHTML = '';
    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('beta.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('beta.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('beta.subtitle') + '</p>';
    container.appendChild(header);

    const hasHeat = !!state.betaDiversity;
    const hasPcoa = !!state.ordination;

    if (!hasHeat && !hasPcoa) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      card.innerHTML =
        '<div class="ql-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="17" r="2.4"/><circle cx="17" cy="17" r="2.4"/><circle cx="12" cy="7" r="2.4"/><path d="m9 15.5 1.7-6M15 15.5l-1.7-6"/></svg>' +
        '<h3>' + t('beta.emptyTitle') + '</h3><p>' + t('beta.emptyDesc') + '</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
        '<a href="#/cargar" class="ql-btn">' + t('ui.goLoadData') + '</a></div></div>';
      container.appendChild(card);
      mountExampleButtons(card.querySelector('.ql-empty'), { real: loadRealCommunityData, synthetic: loadExampleCommunityData, download: ['betaqza', 'pcoa', 'metadata'] });
      return;
    }

    if (view === 'heatmap' && !hasHeat) view = 'pcoa';
    if (view === 'pcoa' && !hasPcoa && hasHeat) view = 'heatmap';

    const tabs = document.createElement('div');
    tabs.className = 'ql-tabs';
    [['heatmap', t('beta.tabHeatmap')], ['pcoa', t('beta.tabPcoa')]].forEach(([v, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ql-tab' + (view === v ? ' is-active' : '');
      b.textContent = label;
      b.addEventListener('click', () => { view = v; paint(); });
      tabs.appendChild(b);
    });
    container.appendChild(tabs);

    if (view === 'heatmap') renderHeatmap();
    else renderPcoa(hasPcoa);
  }

  // =========================================================================
  //  MAPA DE CALOR + DENDROGRAMA
  // =========================================================================
  function renderHeatmap() {
    const metrics = Object.keys(state.betaDiversity.metrics);
    if (!metric || !metrics.includes(metric)) metric = metrics[0];
    const data = state.betaDiversity.metrics[metric];

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<p class="ql-panel-note" style="margin-bottom:4px;">' + t('beta.chartNote') + '</p>';
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
        const o = document.createElement('option'); o.value = m; o.textContent = m;
        if (m === metric) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', () => { metric = sel.value; paint(); });
      f.appendChild(sel);
      controls.appendChild(f);
    }
    const betaEx = metricExplainEl(metric);
    if (betaEx) controls.appendChild(betaEx);

    const fOrder = document.createElement('div');
    fOrder.className = 'ql-field';
    fOrder.innerHTML = '<label>' + t('beta.orderLabel') + '</label>';
    const selOrder = document.createElement('select');
    [['clustering', t('beta.orderClustering')], ['original', t('beta.orderOriginal')]].forEach(([v, lbl]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = lbl;
      if (v === orderMode) o.selected = true; selOrder.appendChild(o);
    });
    selOrder.addEventListener('change', () => { orderMode = selOrder.value; paint(); });
    fOrder.appendChild(selOrder);
    controls.appendChild(fOrder);

    const statsBox = document.createElement('div');
    statsBox.innerHTML = '<div class="ql-stats">' +
      '<div class="ql-stat"><div class="ql-stat-label">' + t('beta.statSamples') + '</div><div class="ql-stat-value" style="font-size:20px;">' + data.sampleIds.length + '</div></div></div>';
    controls.appendChild(statsBox);

    const privacy = document.createElement('p');
    privacy.className = 'ql-privacy';
    privacy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"/></svg>' + t('beta.upgmaLocal');
    controls.appendChild(privacy);

    grid.appendChild(controls);
    container.appendChild(grid);

    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t('beta.tableTitle') + '</h2><p class="ql-panel-note">' + t('beta.tableNote') + '</p>';
    container.appendChild(tableCard);

    // ---- orden ----
    const clustered = orderMode === 'clustering' && data.sampleIds.length > 1;
    const tree = clustered ? upgma(data.matrix, data.sampleIds) : null;
    const order = tree ? leafOrder(tree) : data.sampleIds.slice();
    const idxOf = {};
    data.sampleIds.forEach((id, i) => { idxOf[id] = i; });

    // ---- layout ----
    const n = order.length;
    const cellSize = Math.max(10, Math.min(28, 640 / n));
    const dendroH = clustered ? 62 : 0;
    const marginL = 120, marginR = 20, marginT = 46 + dendroH, marginB = 64;
    const gridSize = cellSize * n;
    const W = Math.max(marginL + gridSize + marginR, 420);
    const H = marginT + gridSize + marginB;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.width = W + 'px';
    svg.style.maxWidth = 'none';
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const defs = svgEl('defs', {});
    const grad = svgEl('linearGradient', { id: 'ql-beta-scale', x1: '0', y1: '0', x2: '1', y2: '0' });
    grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': 'var(--surface)' }));
    grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': 'var(--depleted)' }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    function xOf(label) { return marginL + order.indexOf(label) * cellSize + cellSize / 2; }
    if (clustered) {
      const dendroTop = marginT - dendroH + 6, dendroBottom = marginT - 6;
      const maxHeight = tree.height || 1e-9;
      drawDendrogram(tree, svg, xOf, (h) => dendroBottom - (h / maxHeight) * (dendroBottom - dendroTop));
    }

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

    const showEvery = n > 30 ? Math.ceil(n / 30) : 1;
    order.forEach((id, i) => {
      if (i % showEvery !== 0) return;
      const tx = svgEl('text', { x: marginL - 8, y: marginT + i * cellSize + cellSize / 2 + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
      tx.textContent = id;
      svg.appendChild(tx);
    });

    const yTitle = svgEl('text', {
      x: 15, y: marginT + gridSize / 2, class: 'ql-axis-label', 'text-anchor': 'middle',
      transform: 'rotate(-90 15 ' + (marginT + gridSize / 2) + ')', 'data-ce': 'ytitle',
    });
    yTitle.textContent = t('beta.axisSamples');
    svg.appendChild(yTitle);

    const legG = svgEl('g', { 'data-ce': 'legend' });
    const barW = Math.min(160, gridSize * 0.6);
    legG.appendChild(svgEl('rect', { x: 0, y: 0, width: barW, height: 11, rx: 2, fill: 'url(#ql-beta-scale)', stroke: 'var(--baseline)' }));
    const l0 = svgEl('text', { x: 0, y: 26, class: 'ql-tick-label' }); l0.textContent = t('beta.legendSimilar');
    const l1 = svgEl('text', { x: barW, y: 26, class: 'ql-tick-label', 'text-anchor': 'end' }); l1.textContent = t('beta.legendDistinct');
    legG.appendChild(l0); legG.appendChild(l1);
    legG.setAttribute('transform', 'translate(' + marginL + ',' + (marginT + gridSize + 22) + ')');
    svg.appendChild(legG);

    editor = attachChartEditor({
      key: 'betaDiversity', svg, mount: chartPanel, filename: t('beta.title') + '-' + metric, lang: getLang(),
      elements: [
        { id: 'title', create: { text: metric, x: W / 2, y: 22, anchor: 'middle', cls: 'ce-title' } },
        { id: 'ytitle', selector: '[data-ce="ytitle"]' },
        { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
      ],
      onReset: () => paint(),
    });

    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll scroll-x';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    let theadHtml = '<thead><tr><th><button type="button">' + t('beta.colSample') + '</button></th>';
    order.forEach((id) => { theadHtml += '<th><button type="button">' + escapeHtml(id) + '</button></th>'; });
    tbl.innerHTML = theadHtml + '</tr></thead>';
    const tbody = document.createElement('tbody');
    order.forEach((rowId) => {
      const tr = document.createElement('tr');
      let cells = '<td>' + escapeHtml(rowId) + '</td>';
      order.forEach((colId) => { cells += '<td class="ql-num tabular">' + data.matrix[idxOf[rowId]][idxOf[colId]].toFixed(3) + '</td>'; });
      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);
  }

  // =========================================================================
  //  PCoA (coordenadas ya calculadas — ordination.txt de scikit-bio)
  // =========================================================================
  function renderPcoa(hasPcoa) {
    if (!hasPcoa) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      card.style.marginTop = '18px';
      card.innerHTML = '<div class="ql-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="14" r="2.2"/><circle cx="15" cy="7" r="2.2"/><circle cx="18" cy="16" r="2.2"/><circle cx="9" cy="18" r="2.2"/></svg>' +
        '<h3>' + t('beta.pcoaEmptyTitle') + '</h3><p>' + t('beta.pcoaEmptyDesc') + '</p></div>';
      container.appendChild(card);
      mountExampleButtons(card.querySelector('.ql-empty'), { real: loadRealCommunityData, realLabel: t('beta.pcoaLoadExample'), download: ['pcoa', 'metadata'] });
      return;
    }

    const ord = state.ordination;
    const nAxes = ord.coords[0].length;
    const maxPC = Math.min(5, nAxes);
    if (pcX >= maxPC) pcX = 0;
    if (pcY >= maxPC || pcY === pcX) pcY = pcX === 1 ? 0 : 1;

    const groupOptions = state.metadata ? state.metadata.headers.filter((h) => h !== state.metadata.sampleIdKey) : [];
    if (state.metadata && (!pcoaGroupCol || !groupOptions.includes(pcoaGroupCol))) pcoaGroupCol = groupOptions[0] || null;
    const resolve = (state.metadata && pcoaGroupCol) ? groupResolver(state.metadata, pcoaGroupCol) : null;

    const groupOf = {};
    ord.sampleIds.forEach((s) => { groupOf[s] = resolve ? resolve(s) : null; });
    const groups = Array.from(new Set(Object.values(groupOf).filter(Boolean))).sort();
    const colorForGroup = (g) => g == null ? 'var(--depleted)' : 'var(' + CAT_VARS[groups.indexOf(g) % CAT_VARS.length] + ')';

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<p class="ql-panel-note" style="margin-bottom:4px;">' + t('beta.pcoaNote') + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': 'PCoA' });
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg); chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);
    grid.appendChild(chartPanel);

    const controls = document.createElement('aside');
    controls.className = 'ql-card ql-panel';
    controls.innerHTML = '<h2>' + t('ui.controls') + '</h2>';
    const pcoaEx = metricExplainEl(ord.metricName);
    if (pcoaEx) controls.appendChild(pcoaEx);
    const mkPCsel = (label, cur, cb) => {
      const f = document.createElement('div'); f.className = 'ql-field';
      f.innerHTML = '<label>' + label + '</label>';
      const sel = document.createElement('select');
      for (let i = 0; i < maxPC; i++) {
        const o = document.createElement('option'); o.value = String(i);
        o.textContent = t('beta.pcAxis', { n: i + 1, pct: (ord.proportionExplained[i] || 0).toFixed(1) });
        if (i === cur) o.selected = true; sel.appendChild(o);
      }
      sel.addEventListener('change', () => { cb(parseInt(sel.value, 10)); paint(); });
      f.appendChild(sel); controls.appendChild(f);
    };
    mkPCsel(t('beta.axisX'), pcX, (v) => { pcX = v; });
    mkPCsel(t('beta.axisY'), pcY, (v) => { pcY = v; });

    if (groupOptions.length) {
      const f = document.createElement('div'); f.className = 'ql-field';
      f.innerHTML = '<label>' + t('beta.colorBy') + '</label>';
      const sel = document.createElement('select');
      groupOptions.forEach((h) => {
        const o = document.createElement('option'); o.value = h; o.textContent = h;
        if (h === pcoaGroupCol) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', () => { pcoaGroupCol = sel.value; paint(); });
      f.appendChild(sel); controls.appendChild(f);
    } else {
      const p = document.createElement('p'); p.className = 'ql-field-help'; p.textContent = t('beta.noMeta');
      controls.appendChild(p);
    }

    const cum3 = ord.proportionExplained.slice(0, 3).reduce((a, b) => a + b, 0);
    const sb = document.createElement('div');
    sb.style.marginTop = '10px';
    sb.innerHTML = '<p class="ql-field-help">' + t('beta.pcoaScree', { n: 3, pct: cum3.toFixed(1) }) + '</p>';
    controls.appendChild(sb);

    grid.appendChild(controls);
    container.appendChild(grid);

    // ---- dibujar scatter ----
    const W = 660, H = 520;
    const m = { t: 46, r: 20, b: 78, l: 62 };
    const innerW = W - m.l - m.r, innerH = H - m.t - m.b;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    const xs = ord.coords.map((c) => c[pcX]);
    const ys = ord.coords.map((c) => c[pcY]);
    const xr = [Math.min(...xs), Math.max(...xs)], yr = [Math.min(...ys), Math.max(...ys)];
    const padX = (xr[1] - xr[0]) * 0.08 || 0.1, padY = (yr[1] - yr[0]) * 0.08 || 0.1;
    const xMin = xr[0] - padX, xMax = xr[1] + padX, yMin = yr[0] - padY, yMax = yr[1] + padY;
    const sx = (v) => m.l + ((v - xMin) / (xMax - xMin)) * innerW;
    const sy = (v) => m.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    for (let k = 0; k <= 4; k++) {
      const gx = m.l + (k / 4) * innerW, gy = m.t + (k / 4) * innerH;
      svg.appendChild(svgEl('line', { x1: gx, x2: gx, y1: m.t, y2: m.t + innerH, class: 'ql-gridline' }));
      svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + innerW, y1: gy, y2: gy, class: 'ql-gridline' }));
    }
    // ejes 0 (si caen dentro)
    if (xMin < 0 && xMax > 0) svg.appendChild(svgEl('line', { x1: sx(0), x2: sx(0), y1: m.t, y2: m.t + innerH, class: 'ql-baseline-line' }));
    if (yMin < 0 && yMax > 0) svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + innerW, y1: sy(0), y2: sy(0), class: 'ql-baseline-line' }));
    svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + innerW, y1: m.t + innerH, y2: m.t + innerH, class: 'ql-baseline-line' }));
    svg.appendChild(svgEl('line', { x1: m.l, x2: m.l, y1: m.t, y2: m.t + innerH, class: 'ql-baseline-line' }));

    // ticks
    [xMin, (xMin + xMax) / 2, xMax].forEach((v) => {
      const tx = svgEl('text', { x: sx(v), y: m.t + innerH + 16, class: 'ql-tick-label', 'text-anchor': 'middle' });
      tx.textContent = v.toFixed(2); svg.appendChild(tx);
    });
    [yMin, (yMin + yMax) / 2, yMax].forEach((v) => {
      const tx = svgEl('text', { x: m.l - 8, y: sy(v) + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
      tx.textContent = v.toFixed(2); svg.appendChild(tx);
    });

    const pts = svgEl('g', {});
    svg.appendChild(pts);
    ord.sampleIds.forEach((sid, i) => {
      const cx = sx(ord.coords[i][pcX]), cy = sy(ord.coords[i][pcY]);
      const g = groupOf[sid];
      const c = svgEl('circle', { cx, cy, r: 5, fill: colorForGroup(g), 'fill-opacity': 0.85, stroke: 'var(--surface)', 'stroke-width': 1.4 });
      c.addEventListener('mouseenter', () => {
        const wr = chartWrap.getBoundingClientRect(), sr = svg.getBoundingClientRect();
        tooltip.style.left = ((sr.left - wr.left) + cx * (sr.width / W)) + 'px';
        tooltip.style.top = ((sr.top - wr.top) + cy * (sr.height / H)) + 'px';
        tooltip.innerHTML = '<div class="ql-tt-name">' + escapeHtml(sid) + (g ? ' · ' + escapeHtml(g) : '') + '</div>' +
          '<div class="ql-tt-row">PCo' + (pcX + 1) + ' ' + ord.coords[i][pcX].toFixed(3) + ' · PCo' + (pcY + 1) + ' ' + ord.coords[i][pcY].toFixed(3) + '</div>';
        tooltip.classList.add('is-show');
      });
      c.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
      pts.appendChild(c);
    });

    const xTitle = svgEl('text', { x: m.l + innerW / 2, y: H - 40, class: 'ql-axis-label', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
    xTitle.textContent = t('beta.pcAxis', { n: pcX + 1, pct: (ord.proportionExplained[pcX] || 0).toFixed(1) });
    svg.appendChild(xTitle);
    const yTitle = svgEl('text', { x: 16, y: m.t + innerH / 2, class: 'ql-axis-label', 'text-anchor': 'middle', transform: 'rotate(-90 16 ' + (m.t + innerH / 2) + ')', 'data-ce': 'ytitle' });
    yTitle.textContent = t('beta.pcAxis', { n: pcY + 1, pct: (ord.proportionExplained[pcY] || 0).toFixed(1) });
    svg.appendChild(yTitle);

    // leyenda de grupos
    if (groups.length) {
      const legG = svgEl('g', { 'data-ce': 'legend' });
      const perRow = Math.max(1, Math.floor(innerW / 130));
      groups.forEach((g, i) => {
        const col = i % perRow, rw = Math.floor(i / perRow);
        const xx = col * 130, yy = rw * 15;
        legG.appendChild(svgEl('rect', { x: xx, y: yy - 8, width: 10, height: 10, rx: 5, fill: colorForGroup(g) }));
        const tx = svgEl('text', { x: xx + 15, y: yy, class: 'ql-tick-label' });
        tx.textContent = g.length > 16 ? g.slice(0, 15) + '…' : g;
        legG.appendChild(tx);
      });
      if (groups.length > CAT_VARS.length) {
        const nt = svgEl('text', { x: 0, y: Math.ceil(groups.length / perRow) * 15 + 4, class: 'ql-tick-label' });
        nt.setAttribute('fill', 'var(--ink-muted)');
        nt.textContent = t('ui.colorsRepeat');
        legG.appendChild(nt);
      }
      legG.setAttribute('transform', 'translate(' + m.l + ',' + (H - 22) + ')');
      svg.appendChild(legG);
    }

    editor = attachChartEditor({
      key: 'betaPcoa', svg, mount: chartPanel, filename: 'pcoa-' + ord.metricName, lang: getLang(),
      elements: [
        { id: 'title', create: { text: t('beta.pcoaFigTitle', { metric: ord.metricName }), x: W / 2, y: 24, anchor: 'middle', cls: 'ce-title' } },
        { id: 'xtitle', selector: '[data-ce="xtitle"]' },
        { id: 'ytitle', selector: '[data-ce="ytitle"]' },
        { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
      ],
      onReset: () => paint(),
    });

    // ---- tabla ----
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t('beta.pcoaTableTitle') + '</h2>';
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll scroll-x';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    let th = '<thead><tr><th>' + t('beta.colSample') + '</th>';
    if (groups.length) th += '<th>' + escapeHtml(pcoaGroupCol) + '</th>';
    for (let i = 0; i < maxPC; i++) th += '<th>PCo' + (i + 1) + '</th>';
    tbl.innerHTML = th + '</tr></thead>';
    const tb = document.createElement('tbody');
    ord.sampleIds.forEach((sid, i) => {
      const tr = document.createElement('tr');
      let c = '<td>' + escapeHtml(sid) + '</td>';
      if (groups.length) c += '<td>' + escapeHtml(groupOf[sid] || '—') + '</td>';
      for (let k = 0; k < maxPC; k++) c += '<td class="ql-num tabular">' + ord.coords[i][k].toFixed(4) + '</td>';
      tr.innerHTML = c;
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);
    container.appendChild(tableCard);
  }

  paint();
  const stop = subscribe(paint);
  return () => { stop(); if (editor) { editor.destroy(); editor = null; } };
}
