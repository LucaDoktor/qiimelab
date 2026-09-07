import { state, subscribe, setSlot } from '../state.js';
import { t } from '../lib/i18n.js';
import { loadExampleDifferentialAbundance, loadRealDifferentialAbundance, mountExampleButtons } from '../lib/exampleData.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = { top: 26, right: 28, bottom: 54, left: 58 };
const W = 900, H = 520;

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function shortenTaxon(name) {
  const parts = String(name).split(' ');
  if (parts.length <= 1) return name;
  return parts[0].charAt(0) + '. ' + parts.slice(1).join(' ');
}
function niceStep(range, targetTicks) {
  if (range <= 0) return 1;
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1; else if (norm < 3) step = 2; else if (norm < 7) step = 5; else step = 10;
  return step * mag;
}

function buildRScript(taxonCol, lfcCol, padjCol, lfcThresh, padjThresh, sourceFileName) {
  return `# Volcano plot de abundancia diferencial — generado por QiimeLab
# Reproduce, en R, el mismo gráfico y los mismos umbrales que has usado aquí.

library(ggplot2)

## 1. Cargar tu tabla de resultados (la misma que subiste: ${sourceFileName || 'tu_tabla.csv'})
res <- read.csv("${sourceFileName || 'tu_tabla.csv'}", check.names = FALSE)

## Renombra si tus columnas no se llaman exactamente así:
## res\$taxon           <- res\$${taxonCol}
## res\$log2FoldChange  <- res\$${lfcCol}
## res\$padj            <- res\$${padjCol}

## 2. Umbrales (los mismos que en QiimeLab)
lfc_threshold  <- ${lfcThresh}
padj_threshold <- ${padjThresh}

res$estado <- "No significativo"
res$estado[res$${lfcCol} >=  lfc_threshold & res$${padjCol} < padj_threshold] <- "Enriquecido"
res$estado[res$${lfcCol} <= -lfc_threshold & res$${padjCol} < padj_threshold] <- "Reducido"

## 3. Volcano plot
ggplot(res, aes(x = ${lfcCol}, y = -log10(${padjCol}), color = estado)) +
  geom_point(alpha = 0.85, size = 2) +
  scale_color_manual(values = c(
    "Enriquecido"        = "#e34948",
    "Reducido"           = "#2a78d6",
    "No significativo"   = "#a6a49c"
  )) +
  geom_vline(xintercept = c(-lfc_threshold, lfc_threshold), linetype = "dashed", color = "grey50") +
  geom_hline(yintercept = -log10(padj_threshold), linetype = "dashed", color = "grey50") +
  theme_minimal(base_size = 13) +
  labs(x = "log2 Fold Change", y = expression(-log[10](padj)), color = NULL,
       title = "Abundancia diferencial")

## 4. Exportar los taxones significativos
write.csv(subset(res, estado != "No significativo"),
          "taxones_significativos.csv", row.names = FALSE)

## --------------------------------------------------------------------
## Si en cambio partes de conteos crudos (no de una tabla ya calculada),
## el pipeline habitual con DESeq2 sería:
##
## library(DESeq2)
## counts   <- read.delim("feature-table.tsv", row.names = 1, check.names = FALSE)
## metadata <- read.delim("metadata.tsv", row.names = 1)
## dds <- DESeqDataSetFromMatrix(counts, metadata, design = ~ <tu_variable_de_grupo>)
## dds <- DESeq(dds)
## res <- as.data.frame(results(dds))
## res$taxon <- rownames(res)
## (y continuar desde el paso 2 de arriba)
`;
}

export function render(container) {
  let thresholds = { lfc: 1, padj: 0.05, labelN: 8 };
  let search = '';
  let sort = { key: 'padj', dir: 'asc' };
  let mapping = null;
  let showRScript = false;

  function computeDerived() {
    const da = state.differentialAbundance;
    const headers = da.headers;
    const taxonKey = headers[mapping.taxon], lfcKey = headers[mapping.lfc], padjKey = headers[mapping.padj];
    const out = [];
    let skipped = 0;
    da.rows.forEach((r) => {
      const taxon = String(r[taxonKey] || '').trim();
      const lfc = parseFloat(r[lfcKey]);
      const padj = parseFloat(r[padjKey]);
      if (!taxon || !isFinite(lfc) || !isFinite(padj) || padj < 0) { skipped++; return; }
      const padjEff = Math.max(padj, 1e-10);
      const neglog = -Math.log10(padjEff);
      let status = 'ns';
      if (padj < thresholds.padj) {
        if (lfc >= thresholds.lfc) status = 'up';
        else if (lfc <= -thresholds.lfc) status = 'down';
      }
      out.push({ taxon, lfc, padj, neglog, status, capped: padj < 1e-10 });
    });
    return { data: out, skipped, taxonKey, lfcKey, padjKey };
  }

  function paint() {
    container.innerHTML = '';
    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('differential.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('differential.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('differential.subtitle') + '</p>';
    container.appendChild(header);

    if (!state.differentialAbundance) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      card.innerHTML =
        '<div class="ql-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 20h18"/><circle cx="12" cy="9" r="3"/><circle cx="6" cy="14" r="1.4"/><circle cx="18" cy="16" r="1.6"/></svg>' +
        '<h3>' + t('differential.emptyTitle') + '</h3>' +
        '<p>' + t('differential.emptyDesc') + '</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
        '<a href="#/cargar" class="ql-btn">' + t('ui.goLoadData') + '</a></div></div>';
      container.appendChild(card);
      mountExampleButtons(card.querySelector('.ql-empty'), {
        real: () => loadRealDifferentialAbundance(),
        synthetic: loadExampleDifferentialAbundance,
        realLabel: t('differential.exampleLabel'),
      });
      return;
    }

    const da = state.differentialAbundance;
    if (!mapping) mapping = { ...da.mapping };

    // ---- mapeo de columnas ----
    const mapCard = document.createElement('section');
    mapCard.className = 'ql-card ql-panel';
    mapCard.style.marginBottom = '20px';
    mapCard.innerHTML = '<h2>' + t('differential.columnsTitle') + '</h2><p class="ql-panel-note">' + t('differential.columnsNote') + '</p>';
    const mapGrid = document.createElement('div');
    mapGrid.className = 'ql-mapping-grid';
    ['taxon', 'lfc', 'padj'].forEach((key) => {
      const f = document.createElement('div');
      f.className = 'ql-field';
      f.innerHTML = '<label>' + ({ taxon: t('differential.colTaxon'), lfc: t('differential.colLfc'), padj: t('differential.colPadj') }[key]) + '</label>';
      const sel = document.createElement('select');
      da.headers.forEach((h, i) => {
        const opt = document.createElement('option');
        opt.value = String(i); opt.textContent = h || t('ui.columnN', { n: i + 1 });
        if (mapping[key] === i) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => {
        mapping = { ...mapping, [key]: parseInt(sel.value, 10) };
        setSlot('differentialAbundance', { ...da, mapping });
      });
      f.appendChild(sel);
      mapGrid.appendChild(f);
    });
    mapCard.appendChild(mapGrid);
    container.appendChild(mapCard);

    const { data, skipped, taxonKey, lfcKey, padjKey } = computeDerived();

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<h2>' + t('differential.chartTitle') + '</h2><p class="ql-panel-note">' + t('differential.chartNote') + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap';
    const svg = svgEl('svg', { class: 'ql-svg', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('a11y.chartVolcano') });
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg);
    chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);
    const legend = document.createElement('div');
    legend.className = 'ql-legend';
    legend.style.cssText = 'margin-top:14px;padding-top:14px;border-top:1px solid var(--border);';
    chartPanel.appendChild(legend);
    grid.appendChild(chartPanel);

    const controls = document.createElement('aside');
    controls.className = 'ql-card ql-panel';
    controls.innerHTML = '<h2>' + t('ui.controls') + '</h2>';

    const stats = document.createElement('div');
    stats.className = 'ql-stats';
    stats.style.marginBottom = '16px';
    controls.appendChild(stats);

    const lfcField = document.createElement('div');
    lfcField.className = 'ql-field';
    lfcField.innerHTML = '<label>' + t('differential.thrLfc') + '</label><div class="ql-inputrow">' +
      '<input type="range" min="0" max="4" step="0.1" value="' + thresholds.lfc + '" id="lfcRange" />' +
      '<input type="number" class="ql-num-small tabular" min="0" max="10" step="0.1" value="' + thresholds.lfc + '" id="lfcInput" /></div>';
    controls.appendChild(lfcField);

    const padjField = document.createElement('div');
    padjField.className = 'ql-field';
    padjField.innerHTML = '<label>' + t('differential.thrPadj') + '</label><div class="ql-inputrow">' +
      '<input type="range" min="0.001" max="0.2" step="0.001" value="' + thresholds.padj + '" id="padjRange" />' +
      '<input type="number" class="ql-num-small tabular" min="0.0001" max="1" step="0.001" value="' + thresholds.padj + '" id="padjInput" /></div>';
    controls.appendChild(padjField);

    const labelField = document.createElement('div');
    labelField.className = 'ql-field';
    labelField.innerHTML = '<label>' + t('differential.labelN') + '</label><input type="number" min="0" max="25" step="1" value="' + thresholds.labelN + '" id="labelNInput" />';
    controls.appendChild(labelField);

    const searchField = document.createElement('div');
    searchField.className = 'ql-field';
    searchField.innerHTML = '<label>' + t('differential.searchLabel') + '</label><input type="text" id="searchInput" placeholder="' + t('differential.searchPlaceholder') + '" value="' + escapeHtml(search) + '" />';
    controls.appendChild(searchField);

    const rBtn = document.createElement('button');
    rBtn.type = 'button';
    rBtn.className = 'ql-btn ql-btn-primary';
    rBtn.style.width = '100%';
    rBtn.textContent = showRScript ? t('differential.hideRscript') : t('differential.genRscript');
    controls.appendChild(rBtn);

    grid.appendChild(controls);
    container.appendChild(grid);

    if (showRScript) {
      const rCard = document.createElement('section');
      rCard.className = 'ql-card ql-panel';
      rCard.style.marginTop = '20px';
      rCard.innerHTML = '<h2>' + t('differential.rTitle') + '</h2><p class="ql-panel-note">' + t('differential.rNote') + '</p>';
      const code = document.createElement('pre');
      code.className = 'ql-code';
      const script = buildRScript(taxonKey, lfcKey, padjKey, thresholds.lfc.toFixed(2), thresholds.padj, (state.files.find(f => f.id === da.sourceFileId) || {}).name);
      code.textContent = script;
      rCard.appendChild(code);
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ql-btn';
      copyBtn.style.marginTop = '10px';
      copyBtn.type = 'button';
      copyBtn.textContent = t('differential.copyClipboard');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(script);
          copyBtn.textContent = t('differential.copied');
          setTimeout(() => { copyBtn.textContent = t('differential.copyClipboard'); }, 1800);
        } catch (e) {
          copyBtn.textContent = t('differential.copyManual');
        }
      });
      rCard.appendChild(copyBtn);
      container.appendChild(rCard);
    }

    // tabla
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t('differential.tableTitle') + '</h2><p class="ql-panel-note">' + t('differential.rowsCount', { n: data.length }) + (skipped ? ' · ' + t('differential.rowsSkipped', { n: skipped }) : '') + '</p>';
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    tbl.innerHTML = '<thead><tr>' +
      '<th><button type="button" data-sort="taxon">' + t('differential.colTaxon') + '</button></th>' +
      '<th><button type="button" data-sort="lfc">log2FC</button></th>' +
      '<th><button type="button" data-sort="padj">padj</button></th>' +
      '<th><button type="button" data-sort="neglog">−log10(padj)</button></th>' +
      '<th><button type="button" data-sort="status">' + t('differential.colStatus') + '</button></th></tr></thead>';
    const tbody = document.createElement('tbody');
    tbl.appendChild(tbody);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);
    container.appendChild(tableCard);

    // ---- render dinámico: stats, legend, chart, tabla ----
    function renderStats() {
      const up = data.filter((d) => d.status === 'up').length;
      const down = data.filter((d) => d.status === 'down').length;
      stats.innerHTML =
        '<div class="ql-stat"><div class="ql-stat-label">' + t('differential.statTaxa') + '</div><div class="ql-stat-value">' + data.length + '</div></div>' +
        '<div class="ql-stat"><div class="ql-stat-label">' + t('differential.statUp') + '</div><div class="ql-stat-value" style="color:var(--enriched)">' + up + '</div></div>' +
        '<div class="ql-stat"><div class="ql-stat-label">' + t('differential.statDown') + '</div><div class="ql-stat-value" style="color:var(--depleted)">' + down + '</div></div>';
    }
    function renderLegend() {
      const up = data.filter((d) => d.status === 'up').length;
      const down = data.filter((d) => d.status === 'down').length;
      const ns = data.length - up - down;
      legend.innerHTML =
        '<span class="ql-legend-item"><span class="ql-legend-swatch" style="background:var(--enriched)"></span>' + t('differential.legendUp') + ' (' + up + ')</span>' +
        '<span class="ql-legend-item"><span class="ql-legend-swatch" style="background:var(--depleted)"></span>' + t('differential.legendDown') + ' (' + down + ')</span>' +
        '<span class="ql-legend-item"><span class="ql-legend-swatch" style="background:var(--neutral)"></span>' + t('differential.legendNs') + ' (' + ns + ')</span>';
    }
    function colorFor(status) { return status === 'up' ? 'var(--enriched)' : status === 'down' ? 'var(--depleted)' : 'var(--neutral)'; }

    function renderChart() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const innerW = W - MARGIN.left - MARGIN.right, innerH = H - MARGIN.top - MARGIN.bottom;
      let maxAbsLfc = 0, maxNeglog = 0;
      data.forEach((d) => { maxAbsLfc = Math.max(maxAbsLfc, Math.abs(d.lfc)); maxNeglog = Math.max(maxNeglog, d.neglog); });
      const xMax = Math.max(maxAbsLfc * 1.2, thresholds.lfc * 1.6, 1.5);
      const yMax = Math.max(maxNeglog * 1.15, -Math.log10(thresholds.padj) * 1.3, 1);
      function xScale(v) { return MARGIN.left + ((v + xMax) / (2 * xMax)) * innerW; }
      function yScale(v) { return MARGIN.top + innerH - (v / yMax) * innerH; }

      const g = svgEl('g', {});
      svg.appendChild(g);

      const xStep = niceStep(2 * xMax, 6);
      const xStart = Math.ceil(-xMax / xStep) * xStep;
      for (let xv = xStart; xv <= xMax; xv += xStep) {
        const xPix = xScale(xv);
        g.appendChild(svgEl('line', { x1: xPix, x2: xPix, y1: MARGIN.top, y2: MARGIN.top + innerH, class: 'ql-gridline' }));
        const t = svgEl('text', { x: xPix, y: MARGIN.top + innerH + 18, class: 'ql-tick-label', 'text-anchor': 'middle' });
        t.textContent = (Math.round(xv * 100) / 100).toString();
        g.appendChild(t);
      }
      const yStep = niceStep(yMax, 5);
      for (let yv = 0; yv <= yMax; yv += yStep) {
        const yPix = yScale(yv);
        g.appendChild(svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + innerW, y1: yPix, y2: yPix, class: 'ql-gridline' }));
        const t = svgEl('text', { x: MARGIN.left - 10, y: yPix + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
        t.textContent = (Math.round(yv * 10) / 10).toString();
        g.appendChild(t);
      }
      g.appendChild(svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + innerW, y1: MARGIN.top + innerH, y2: MARGIN.top + innerH, class: 'ql-baseline-line' }));
      g.appendChild(svgEl('line', { x1: MARGIN.left, x2: MARGIN.left, y1: MARGIN.top, y2: MARGIN.top + innerH, class: 'ql-baseline-line' }));

      if (thresholds.lfc > 0 && thresholds.lfc < xMax) {
        [thresholds.lfc, -thresholds.lfc].forEach((v) => {
          const xp = xScale(v);
          g.appendChild(svgEl('line', { x1: xp, x2: xp, y1: MARGIN.top, y2: MARGIN.top + innerH, class: 'ql-threshold-line' }));
        });
      }
      const padjY = -Math.log10(thresholds.padj);
      if (padjY > 0 && padjY < yMax) {
        const yp = yScale(padjY);
        g.appendChild(svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + innerW, y1: yp, y2: yp, class: 'ql-threshold-line' }));
      }

      const xTitle = svgEl('text', { x: MARGIN.left + innerW / 2, y: H - 10, class: 'ql-axis-label', 'text-anchor': 'middle' });
      xTitle.textContent = 'log2FoldChange';
      g.appendChild(xTitle);
      const yTitle = svgEl('text', { x: 16, y: MARGIN.top + innerH / 2, class: 'ql-axis-label', 'text-anchor': 'middle', transform: 'rotate(-90 16 ' + (MARGIN.top + innerH / 2) + ')' });
      yTitle.textContent = '−log10(padj)';
      g.appendChild(yTitle);

      const searchTerm = search.trim().toLowerCase();
      const hasSearch = searchTerm.length > 0;
      const pointsLayer = svgEl('g', {});
      g.appendChild(pointsLayer);
      const pointNodes = [];
      data.forEach((d) => {
        const cx = xScale(d.lfc), cy = yScale(d.neglog);
        const matches = hasSearch && d.taxon.toLowerCase().includes(searchTerm);
        const dim = hasSearch && !matches;
        if (matches) pointsLayer.appendChild(svgEl('circle', { cx, cy, r: 9, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2 }));
        const c = svgEl('circle', { cx, cy, r: d.status === 'ns' ? 4 : 4.6, fill: colorFor(d.status), opacity: dim ? 0.2 : (d.status === 'ns' ? 0.55 : 0.92), stroke: 'var(--surface)', 'stroke-width': 1.6 });
        c.addEventListener('mouseenter', () => showTooltip(d, cx, cy));
        c.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
        pointsLayer.appendChild(c);
        pointNodes.push({ d, cx, cy });
      });

      const labelN = Math.max(0, Math.min(25, thresholds.labelN | 0));
      const sig = pointNodes.filter((p) => p.d.status !== 'ns').sort((a, b) => a.d.padj - b.d.padj).slice(0, labelN);
      const labelLayer = svgEl('g', {});
      g.appendChild(labelLayer);
      sig.forEach((p, i) => {
        const tier = i % 3;
        const dy = -10 - tier * 11;
        const t = svgEl('text', { x: p.cx, y: p.cy + dy, class: 'ql-tick-label', 'text-anchor': 'middle' });
        t.textContent = shortenTaxon(p.d.taxon);
        labelLayer.appendChild(t);
        try {
          const bbox = t.getBBox();
          const minX = MARGIN.left + 2, maxX = MARGIN.left + innerW - 2;
          if (bbox.x < minX) { t.setAttribute('text-anchor', 'start'); t.setAttribute('x', minX); }
          else if (bbox.x + bbox.width > maxX) { t.setAttribute('text-anchor', 'end'); t.setAttribute('x', maxX); }
        } catch (e) { /* getBBox puede fallar si aún no está en el DOM visible */ }
      });
    }

    function showTooltip(d, cx, cy) {
      const wrapRect = chartWrap.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const scaleX = svgRect.width / W, scaleY = svgRect.height / H;
      tooltip.style.left = ((svgRect.left - wrapRect.left) + cx * scaleX) + 'px';
      tooltip.style.top = ((svgRect.top - wrapRect.top) + cy * scaleY) + 'px';
      const padjText = d.capped ? '< 1e-10' : d.padj.toExponential(2);
      tooltip.innerHTML = '<div class="ql-tt-name">' + escapeHtml(d.taxon) + '</div><div class="ql-tt-row">log2FC ' + d.lfc.toFixed(2) + ' · padj ' + padjText + '</div>';
      tooltip.classList.add('is-show');
    }

    function renderTable() {
      const sorted = data.slice().sort((a, b) => {
        const dir = sort.dir === 'asc' ? 1 : -1;
        let av = a[sort.key], bv = b[sort.key];
        if (typeof av === 'string') return av.localeCompare(bv) * dir;
        return (av - bv) * dir;
      });
      tbody.innerHTML = '';
      if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ink-muted);padding:24px;">' + t('differential.noRows') + '</td></tr>';
        return;
      }
      const frag = document.createDocumentFragment();
      sorted.forEach((d) => {
        const tr = document.createElement('tr');
        const pillClass = d.status === 'up' ? 'ql-pill-up' : d.status === 'down' ? 'ql-pill-down' : 'ql-pill-ns';
        const pillText = d.status === 'up' ? t('differential.pillUp') : d.status === 'down' ? t('differential.pillDown') : t('differential.pillNs');
        const padjText = d.capped ? '&lt; 1e-10' : d.padj.toExponential(2);
        tr.innerHTML = '<td>' + escapeHtml(d.taxon) + '</td>' +
          '<td class="ql-num tabular">' + d.lfc.toFixed(2) + '</td>' +
          '<td class="ql-num tabular">' + padjText + '</td>' +
          '<td class="ql-num tabular">' + d.neglog.toFixed(2) + '</td>' +
          '<td><span class="ql-pill ' + pillClass + '">' + pillText + '</span></td>';
        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
    }

    renderStats(); renderLegend(); renderChart(); renderTable();

    // eventos
    const lfcRange = controls.querySelector('#lfcRange'), lfcInput = controls.querySelector('#lfcInput');
    const padjRange = controls.querySelector('#padjRange'), padjInput = controls.querySelector('#padjInput');
    const labelNInput = controls.querySelector('#labelNInput');
    const searchInput = controls.querySelector('#searchInput');

    function syncPair(range, input, key) {
      range.addEventListener('input', () => { input.value = range.value; thresholds = { ...thresholds, [key]: parseFloat(range.value) }; refresh(); });
      input.addEventListener('input', () => { const v = parseFloat(input.value); if (!isFinite(v)) return; range.value = v; thresholds = { ...thresholds, [key]: v }; refresh(); });
    }
    syncPair(lfcRange, lfcInput, 'lfc');
    syncPair(padjRange, padjInput, 'padj');
    labelNInput.addEventListener('input', () => { thresholds = { ...thresholds, labelN: parseInt(labelNInput.value, 10) || 0 }; refresh(); });
    searchInput.addEventListener('input', () => { search = searchInput.value; renderChart(); });
    rBtn.addEventListener('click', () => { showRScript = !showRScript; paint(); });
    tbl.querySelectorAll('th button[data-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-sort');
        if (sort.key === key) sort = { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
        else sort = { key, dir: 'asc' };
        renderTable();
      });
    });

    function refresh() {
      const recomputed = computeDerived();
      data.length = 0;
      recomputed.data.forEach((d) => data.push(d));
      renderStats(); renderLegend(); renderChart(); renderTable();
    }
  }

  paint();
  return subscribe(paint);
}
