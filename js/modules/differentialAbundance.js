import { state, subscribe, setSlot } from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { loadExampleDifferentialAbundance, loadRealDifferentialAbundance, mountExampleButtons } from '../lib/exampleData.js';
import { attachChartEditor } from '../lib/chartEditor.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = { top: 48, right: 28, bottom: 86, left: 58 };
const W = 900, H = 560;

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

// formas específicas de "log2 fold change" (evita cazar lfcSE, log10, etc.)
const LFC_STRONG = ['log2foldchange', 'log2fc', 'l2fc', 'logfoldchange', 'foldchange'];
const normHdr = (h) => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');
// columnas que NO son un log2FC aunque lo parezcan (error estándar, estadístico…)
const NOT_LFC = /(^|[^a-z])(se|stderr|std|error|stat|pval|pvalue|padj|fdr|qval|mean|rank|conf|lower|upper|neglog|log10)([^a-z]|$)/i;

// nombre legible de la comparación a partir del archivo de origen
// ("DESeq2_D_vs_Control.csv" -> "D vs Control")
function comparisonLabel(fileName) {
  if (!fileName) return null;
  const m = String(fileName).replace(/\.[^.]+$/, '').match(/([A-Za-z0-9]+)[_ ]v[s]?[_ ]([A-Za-z0-9]+)/i);
  if (m) return m[1] + ' vs ' + m[2];
  return null;
}

export function render(container) {
  let thresholds = { lfc: 1, padj: 0.05, labelN: 8 };
  let search = '';
  let sort = { key: 'padj', dir: 'asc' };
  let mapping = null;
  let showRScript = false;
  let chartType = 'volcano'; // 'volcano' | 'lollipop' | 'heatmap'
  let editor = null;

  // columnas de log2FoldChange presentes en la tabla (la mapeada + cualquier
  // otra que lo parezca, para el mapa de calor multi-comparación)
  function lfcColumns(headers) {
    const cols = [];
    headers.forEach((h, i) => {
      if (i === mapping.taxon || i === mapping.padj) return;
      if (i === mapping.lfc) { cols.push({ key: h, idx: i }); return; }
      const n = normHdr(h);
      const looksLfc = LFC_STRONG.some((k) => n.includes(k)) || /\blfc\b/i.test(String(h));
      if (looksLfc && !NOT_LFC.test(String(h))) cols.push({ key: h, idx: i });
    });
    if (!cols.some((c) => c.idx === mapping.lfc)) cols.unshift({ key: headers[mapping.lfc], idx: mapping.lfc });
    cols.sort((a, b) => (a.idx === mapping.lfc ? -1 : b.idx === mapping.lfc ? 1 : a.idx - b.idx));
    return cols;
  }

  function computeDerived() {
    const da = state.differentialAbundance;
    const headers = da.headers;
    const taxonKey = headers[mapping.taxon], lfcKey = headers[mapping.lfc], padjKey = headers[mapping.padj];
    const lfcCols = lfcColumns(headers);
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
      const lfcExtra = lfcCols.map((c) => { const v = parseFloat(r[c.key]); return isFinite(v) ? v : null; });
      out.push({ taxon, lfc, padj, neglog, status, capped: padj < 1e-10, lfcExtra });
    });
    return { data: out, skipped, taxonKey, lfcKey, padjKey, lfcCols };
  }

  function paint() {
    if (editor) { editor.destroy(); editor = null; }
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
        download: ['deseq2'],
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

    const { data, skipped, taxonKey, lfcKey, padjKey, lfcCols } = computeDerived();

    // ---- selector de tipo de gráfico ----
    const tabs = document.createElement('div');
    tabs.className = 'ql-tabs';
    [['volcano', t('differential.viewVolcano')], ['lollipop', t('differential.viewLollipop')], ['heatmap', t('differential.viewHeatmap')]]
      .forEach(([v, label]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ql-tab' + (chartType === v ? ' is-active' : '');
        b.textContent = label;
        b.addEventListener('click', () => { if (chartType !== v) { chartType = v; paint(); } });
        tabs.appendChild(b);
      });
    container.appendChild(tabs);

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    const chartNoteKey = chartType === 'lollipop' ? 'differential.chartNoteLolli'
      : chartType === 'heatmap' ? 'differential.chartNoteHeat' : 'differential.chartNote';
    chartPanel.innerHTML = '<p class="ql-panel-note" style="margin-bottom:4px;">' + t(chartNoteKey) + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap';
    const svg = svgEl('svg', { class: 'ql-svg', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('a11y.chartVolcano') });
    if (chartType === 'heatmap') chartWrap.classList.add('scroll-x');
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg);
    chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);
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

    let labelField = null;
    if (chartType === 'volcano') {
      labelField = document.createElement('div');
      labelField.className = 'ql-field';
      labelField.innerHTML = '<label>' + t('differential.labelN') + '</label><input type="number" min="0" max="25" step="1" value="' + thresholds.labelN + '" id="labelNInput" />';
      controls.appendChild(labelField);
    }

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
    let ceCfg = null; // config de chartEditor de la vista activa (la fija renderChart)

    function renderStats() {
      const up = data.filter((d) => d.status === 'up').length;
      const down = data.filter((d) => d.status === 'down').length;
      stats.innerHTML =
        '<div class="ql-stat"><div class="ql-stat-label">' + t('differential.statTaxa') + '</div><div class="ql-stat-value">' + data.length + '</div></div>' +
        '<div class="ql-stat"><div class="ql-stat-label">' + t('differential.statUp') + '</div><div class="ql-stat-value" style="color:var(--enriched)">' + up + '</div></div>' +
        '<div class="ql-stat"><div class="ql-stat-label">' + t('differential.statDown') + '</div><div class="ql-stat-value" style="color:var(--depleted)">' + down + '</div></div>';
    }
    function colorFor(status) { return status === 'up' ? 'var(--enriched)' : status === 'down' ? 'var(--depleted)' : 'var(--neutral)'; }

    // leyenda dentro del SVG (para que el editor la mueva y la exportación la incluya)
    function drawSvgLegend(parent, cx, y, which) {
      which = which || ['up', 'down', 'ns'];
      const up = data.filter((d) => d.status === 'up').length;
      const down = data.filter((d) => d.status === 'down').length;
      const ns = data.length - up - down;
      const all = {
        up: ['var(--enriched)', t('differential.legendUp') + ' (' + up + ')'],
        down: ['var(--depleted)', t('differential.legendDown') + ' (' + down + ')'],
        ns: ['var(--neutral)', t('differential.legendNs') + ' (' + ns + ')'],
      };
      const items = which.map((k) => all[k]);
      const g = svgEl('g', { 'data-ce': 'legend' });
      const GAP = 26, SW = 11, TXT = 6.2;
      const widths = items.map(([, label]) => SW + 6 + label.length * TXT);
      const total = widths.reduce((a, b) => a + b, 0) + GAP * (items.length - 1);
      let x = -total / 2;
      items.forEach(([col, label], i) => {
        g.appendChild(svgEl('rect', { x, y: -SW + 1, width: SW, height: SW, rx: 2, fill: col }));
        const tx = svgEl('text', { x: x + SW + 6, y: 0, class: 'ql-tick-label' });
        tx.textContent = label;
        g.appendChild(tx);
        x += widths[i] + GAP;
      });
      g.setAttribute('transform', 'translate(' + cx + ',' + y + ')');
      parent.appendChild(g);
    }

    // divergente por log2FC: azul (reducido) — neutro — rojo (enriquecido)
    function lfcFill(v, maxAbs) {
      if (v == null || !isFinite(v)) return 'var(--page)';
      const f = Math.max(0, Math.min(1, Math.abs(v) / (maxAbs || 1)));
      const pole = v >= 0 ? 'var(--enriched)' : 'var(--depleted)';
      return 'color-mix(in srgb, ' + pole + ' ' + Math.round(f * 100) + '%, var(--surface))';
    }

    const SIG_CAP = 40;
    function significantTaxa(searchTerm) {
      const all = data.filter((d) => d.status !== 'ns');
      const totalSig = all.length;
      // con búsqueda activa y coincidencias: solo esas (sin tope)
      if (searchTerm) {
        const m = all.filter((d) => d.taxon.toLowerCase().includes(searchTerm));
        if (m.length) return { sig: m.slice().sort((a, b) => b.lfc - a.lfc), capped: false, totalSig };
      }
      let sig = all;
      const capped = totalSig > SIG_CAP;
      // si hay que recortar, nos quedamos con los de |log2FC| más grande
      if (capped) sig = sig.slice().sort((a, b) => Math.abs(b.lfc) - Math.abs(a.lfc)).slice(0, SIG_CAP);
      return { sig: sig.slice().sort((a, b) => b.lfc - a.lfc), capped, totalSig };
    }

    function positionTooltip(cx, cy) {
      const wrapRect = chartWrap.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const sX = svgRect.width / (vb.width || W), sY = svgRect.height / (vb.height || H);
      tooltip.style.left = ((svgRect.left - wrapRect.left) + cx * sX + (chartWrap.scrollLeft || 0)) + 'px';
      tooltip.style.top = ((svgRect.top - wrapRect.top) + cy * sY) + 'px';
    }
    function showTooltip(d, cx, cy) {
      positionTooltip(cx, cy);
      const padjText = d.capped ? '< 1e-10' : d.padj.toExponential(2);
      tooltip.innerHTML = '<div class="ql-tt-name">' + escapeHtml(d.taxon) + '</div><div class="ql-tt-row">log2FC ' + d.lfc.toFixed(2) + ' · padj ' + padjText + '</div>';
      tooltip.classList.add('is-show');
    }
    function tooltipRaw(name, rowHtml, cx, cy) {
      positionTooltip(cx, cy);
      tooltip.innerHTML = '<div class="ql-tt-name">' + name + '</div><div class="ql-tt-row">' + rowHtml + '</div>';
      tooltip.classList.add('is-show');
    }

    // ---- despachador de vistas ----
    function renderChart() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.style.width = '';
      svg.style.maxWidth = '';
      svg.style.marginLeft = '';
      svg.style.marginRight = '';
      const term = search.trim().toLowerCase();
      if (chartType === 'lollipop') ceCfg = renderLollipop(term);
      else if (chartType === 'heatmap') ceCfg = renderHeatmap(term);
      else ceCfg = renderVolcano(term);
    }

    function noSigText(vbW, vbH) {
      svg.setAttribute('viewBox', '0 0 ' + vbW + ' ' + vbH);
      const tx = svgEl('text', { x: vbW / 2, y: vbH / 2, 'text-anchor': 'middle', class: 'ql-axis-label', fill: 'var(--ink-muted)' });
      tx.textContent = t('differential.noSig');
      svg.appendChild(tx);
    }
    function capText(x, y, totalSig) {
      const cn = svgEl('text', { x, y, 'text-anchor': 'middle', class: 'ql-tick-label', fill: 'var(--ink-muted)' });
      cn.textContent = t('differential.capNote', { cap: SIG_CAP, total: totalSig });
      svg.appendChild(cn);
    }

    // ===== Volcano =====
    function renderVolcano(searchTerm) {
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      const innerW = W - MARGIN.left - MARGIN.right, innerH = H - MARGIN.top - MARGIN.bottom;
      let maxAbsLfc = 0, maxNeglog = 0;
      data.forEach((d) => { maxAbsLfc = Math.max(maxAbsLfc, Math.abs(d.lfc)); maxNeglog = Math.max(maxNeglog, d.neglog); });
      const xMax = Math.max(maxAbsLfc * 1.2, thresholds.lfc * 1.6, 1.5);
      const yMax = Math.max(maxNeglog * 1.15, -Math.log10(thresholds.padj) * 1.3, 1);
      const xScale = (v) => MARGIN.left + ((v + xMax) / (2 * xMax)) * innerW;
      const yScale = (v) => MARGIN.top + innerH - (v / yMax) * innerH;

      const g = svgEl('g', {});
      svg.appendChild(g);

      const xStep = niceStep(2 * xMax, 6);
      const xStart = Math.ceil(-xMax / xStep) * xStep;
      for (let xv = xStart; xv <= xMax; xv += xStep) {
        const xPix = xScale(xv);
        g.appendChild(svgEl('line', { x1: xPix, x2: xPix, y1: MARGIN.top, y2: MARGIN.top + innerH, class: 'ql-gridline' }));
        const tk = svgEl('text', { x: xPix, y: MARGIN.top + innerH + 18, class: 'ql-tick-label', 'text-anchor': 'middle' });
        tk.textContent = (Math.round(xv * 100) / 100).toString();
        g.appendChild(tk);
      }
      const yStep = niceStep(yMax, 5);
      for (let yv = 0; yv <= yMax; yv += yStep) {
        const yPix = yScale(yv);
        g.appendChild(svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + innerW, y1: yPix, y2: yPix, class: 'ql-gridline' }));
        const tk = svgEl('text', { x: MARGIN.left - 10, y: yPix + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
        tk.textContent = (Math.round(yv * 10) / 10).toString();
        g.appendChild(tk);
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

      const xTitle = svgEl('text', { x: MARGIN.left + innerW / 2, y: H - 12, class: 'ql-axis-label', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
      xTitle.textContent = 'log2FoldChange';
      g.appendChild(xTitle);
      const yTitle = svgEl('text', { x: 16, y: MARGIN.top + innerH / 2, class: 'ql-axis-label', 'text-anchor': 'middle', transform: 'rotate(-90 16 ' + (MARGIN.top + innerH / 2) + ')', 'data-ce': 'ytitle' });
      yTitle.textContent = '−log10(padj)';
      g.appendChild(yTitle);

      drawSvgLegend(g, MARGIN.left + innerW / 2, H - 40);

      const hasSearch = searchTerm.length > 0;
      const pointsLayer = svgEl('g', {});
      g.appendChild(pointsLayer);
      const pointNodes = [];
      data.forEach((d) => {
        const cx = xScale(d.lfc), cy = yScale(d.neglog);
        const matches = hasSearch && d.taxon.toLowerCase().includes(searchTerm);
        const dim = hasSearch && !matches;
        if (matches) {
          pointsLayer.appendChild(svgEl('circle', { cx, cy, r: 9.5, fill: 'none', stroke: 'var(--surface)', 'stroke-width': 4 }));
          pointsLayer.appendChild(svgEl('circle', { cx, cy, r: 9.5, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2 }));
        }
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
        const tl = svgEl('text', { x: p.cx, y: p.cy + dy, class: 'ql-tick-label', 'text-anchor': 'middle' });
        tl.textContent = shortenTaxon(p.d.taxon);
        labelLayer.appendChild(tl);
        try {
          const bbox = tl.getBBox();
          const minX = MARGIN.left + 2, maxX = MARGIN.left + innerW - 2;
          if (bbox.x < minX) { tl.setAttribute('text-anchor', 'start'); tl.setAttribute('x', minX); }
          else if (bbox.x + bbox.width > maxX) { tl.setAttribute('text-anchor', 'end'); tl.setAttribute('x', maxX); }
        } catch (e) { /* getBBox puede fallar si aún no está en el DOM visible */ }
      });

      return {
        key: 'differentialAbundance',
        filename: t('differential.title') + '-volcano',
        elements: [
          { id: 'title', create: { text: t('differential.chartTitle'), x: W / 2, y: 26, anchor: 'middle', cls: 'ce-title' } },
          { id: 'xtitle', selector: '[data-ce="xtitle"]' },
          { id: 'ytitle', selector: '[data-ce="ytitle"]' },
          { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
        ],
      };
    }

    // ===== Lollipop =====
    const LOLLI_W = 780;
    function lolliCfg() {
      return {
        key: 'differentialAbundance-lollipop',
        filename: t('differential.title') + '-lollipop',
        elements: [
          { id: 'title', create: { text: t('differential.chartLolli'), x: LOLLI_W / 2, y: 24, anchor: 'middle', cls: 'ce-title' } },
          { id: 'xtitle', selector: '[data-ce="xtitle"]' },
          { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
        ],
      };
    }
    function renderLollipop(searchTerm) {
      const { sig, capped, totalSig } = significantTaxa(searchTerm);
      if (sig.length === 0) { noSigText(LOLLI_W, 300); return lolliCfg(); }
      const anyMatch = searchTerm && sig.some((d) => d.taxon.toLowerCase().includes(searchTerm));

      const rowH = 24, mL = 210, mR = 34, mT = 52, mB = 66;
      const innerW = LOLLI_W - mL - mR;
      const plotH = sig.length * rowH;
      const H2 = mT + plotH + mB;
      svg.setAttribute('viewBox', '0 0 ' + LOLLI_W + ' ' + H2);
      const g = svgEl('g', {});
      svg.appendChild(g);

      let maxAbs = 0;
      sig.forEach((d) => { maxAbs = Math.max(maxAbs, Math.abs(d.lfc)); });
      const xMax = Math.max(maxAbs * 1.12, thresholds.lfc * 1.4, 1);
      const xScale = (v) => mL + ((v + xMax) / (2 * xMax)) * innerW;

      const xStep = niceStep(2 * xMax, 6);
      const xStart = Math.ceil(-xMax / xStep) * xStep;
      for (let xv = xStart; xv <= xMax + 1e-9; xv += xStep) {
        const xp = xScale(xv);
        g.appendChild(svgEl('line', { x1: xp, x2: xp, y1: mT, y2: mT + plotH, class: 'ql-gridline' }));
        const tk = svgEl('text', { x: xp, y: mT + plotH + 18, class: 'ql-tick-label', 'text-anchor': 'middle' });
        tk.textContent = (Math.round(xv * 100) / 100).toString();
        g.appendChild(tk);
      }
      g.appendChild(svgEl('line', { x1: xScale(0), x2: xScale(0), y1: mT, y2: mT + plotH, class: 'ql-baseline-line' }));
      if (thresholds.lfc > 0 && thresholds.lfc < xMax) {
        [thresholds.lfc, -thresholds.lfc].forEach((v) => g.appendChild(svgEl('line', { x1: xScale(v), x2: xScale(v), y1: mT, y2: mT + plotH, class: 'ql-threshold-line' })));
      }

      sig.forEach((d, i) => {
        const y = mT + i * rowH + rowH / 2;
        const matches = anyMatch && d.taxon.toLowerCase().includes(searchTerm);
        const dim = anyMatch && !matches;
        const col = d.status === 'up' ? 'var(--enriched)' : 'var(--depleted)';
        const row = svgEl('g', dim ? { opacity: 0.25 } : {});
        if (matches) row.appendChild(svgEl('rect', { x: mL - 6, y: y - rowH / 2 + 1, width: innerW + 12, height: rowH - 2, fill: 'var(--accent-soft)', rx: 3 }));
        row.appendChild(svgEl('line', { x1: xScale(0), x2: xScale(d.lfc), y1: y, y2: y, stroke: col, 'stroke-width': 2 }));
        const dot = svgEl('circle', { cx: xScale(d.lfc), cy: y, r: 5, fill: col, stroke: 'var(--surface)', 'stroke-width': 1.4 });
        dot.addEventListener('mouseenter', () => showTooltip(d, xScale(d.lfc), y));
        dot.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
        row.appendChild(dot);
        const lbl = svgEl('text', { x: mL - 12, y: y + 4, class: 'ql-tick-label', 'text-anchor': 'end' });
        lbl.textContent = shortenTaxon(d.taxon);
        row.appendChild(lbl);
        g.appendChild(row);
      });

      const xt = svgEl('text', { x: mL + innerW / 2, y: H2 - 30, class: 'ql-axis-label', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
      xt.textContent = 'log2FoldChange';
      g.appendChild(xt);
      drawSvgLegend(g, mL + innerW / 2, H2 - 10, ['up', 'down']);
      if (capped) capText(LOLLI_W / 2, 42, totalSig);

      return lolliCfg();
    }

    // ===== Mapa de calor =====
    function heatCfg(HW) {
      return {
        key: 'differentialAbundance-heatmap',
        filename: t('differential.title') + '-heatmap',
        elements: [
          { id: 'title', create: { text: t('differential.chartHeat'), x: HW / 2, y: 22, anchor: 'middle', cls: 'ce-title' } },
          { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
        ],
      };
    }
    function renderHeatmap(searchTerm) {
      const { sig, capped, totalSig } = significantTaxa(searchTerm);
      const anyMatch = searchTerm && sig.some((d) => d.taxon.toLowerCase().includes(searchTerm));
      const single = lfcCols.length <= 1;
      const srcName = (state.files.find((f) => f.id === state.differentialAbundance.sourceFileId) || {}).name;
      const colLabels = single ? [comparisonLabel(srcName) || t('differential.heatOneCol')] : lfcCols.map((c) => c.key);
      const nCols = colLabels.length;
      const cellW = single ? 108 : Math.max(52, Math.min(104, 460 / nCols));
      const mL = 210, mR = 24, mT = single ? 74 : 100, mB = 78;
      const gridW = cellW * nCols;
      const HW = mL + gridW + mR;

      if (sig.length === 0) { noSigText(HW, 300); return heatCfg(HW); }

      const rowH = Math.max(15, Math.min(24, 520 / sig.length));
      const plotH = sig.length * rowH;
      const HH = mT + plotH + mB;
      svg.setAttribute('viewBox', '0 0 ' + HW + ' ' + HH);
      svg.style.width = (single ? HW : Math.max(HW, 460)) + 'px';
      svg.style.maxWidth = 'none';
      if (single) { svg.style.marginLeft = 'auto'; svg.style.marginRight = 'auto'; }
      const g = svgEl('g', {});
      svg.appendChild(g);

      let maxAbs = 0;
      sig.forEach((d) => (single ? [d.lfc] : d.lfcExtra).forEach((v) => { if (v != null && isFinite(v)) maxAbs = Math.max(maxAbs, Math.abs(v)); }));
      maxAbs = maxAbs || 1;

      sig.forEach((d, ri) => {
        const y = mT + ri * rowH;
        const matches = anyMatch && d.taxon.toLowerCase().includes(searchTerm);
        const dim = anyMatch && !matches;
        colLabels.forEach((cl, ci) => {
          const v = single ? d.lfc : d.lfcExtra[ci];
          const x = mL + ci * cellW;
          const rect = svgEl('rect', { x, y, width: cellW - 2, height: rowH - 2, rx: 2, fill: lfcFill(v, maxAbs), opacity: dim ? 0.3 : 1 });
          rect.addEventListener('mouseenter', () => tooltipRaw(escapeHtml(d.taxon), (nCols > 1 ? escapeHtml(cl) + ' · ' : '') + 'log2FC ' + (v == null ? '—' : v.toFixed(2)), x + cellW / 2, y + rowH / 2));
          rect.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
          g.appendChild(rect);
          if (v != null && isFinite(v) && cellW >= 40 && rowH >= 15) {
            const strong = Math.abs(v) / maxAbs > 0.55;
            const tx = svgEl('text', { x: x + (cellW - 2) / 2, y: y + rowH / 2 + 3, 'text-anchor': 'middle', 'font-size': Math.min(11, rowH * 0.5).toFixed(1), fill: strong ? 'var(--surface)' : 'var(--ink)', 'font-family': 'var(--font-mono)', 'pointer-events': 'none', opacity: dim ? 0.4 : 1 });
            tx.textContent = v.toFixed(1);
            g.appendChild(tx);
          }
        });
        const lbl = svgEl('text', { x: mL - 10, y: y + rowH / 2 + 3, class: 'ql-tick-label', 'text-anchor': 'end', opacity: dim ? 0.35 : 1 });
        lbl.textContent = shortenTaxon(d.taxon);
        g.appendChild(lbl);
      });

      colLabels.forEach((cl, ci) => {
        const x = mL + ci * cellW + (cellW - 2) / 2;
        const yy = mT - 10;
        const tx = svgEl('text', { x, y: yy, class: 'ql-tick-label', 'text-anchor': single ? 'middle' : 'end' });
        if (!single) tx.setAttribute('transform', 'rotate(-40 ' + x + ' ' + yy + ')');
        tx.textContent = cl.length > 24 ? cl.slice(0, 23) + '…' : cl;
        g.appendChild(tx);
      });

      const legG = svgEl('g', { 'data-ce': 'legend' });
      const defs = svgEl('defs', {});
      const grad = svgEl('linearGradient', { id: 'ql-da-scale', x1: '0', y1: '0', x2: '1', y2: '0' });
      grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': 'var(--depleted)' }));
      grad.appendChild(svgEl('stop', { offset: '0.5', 'stop-color': 'var(--surface)' }));
      grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': 'var(--enriched)' }));
      defs.appendChild(grad);
      svg.appendChild(defs);
      const barW = Math.min(200, Math.max(120, gridW + 30));
      legG.appendChild(svgEl('rect', { x: 0, y: 0, width: barW, height: 11, rx: 2, fill: 'url(#ql-da-scale)', stroke: 'var(--baseline)' }));
      [['−' + maxAbs.toFixed(1), 0, 'start'], ['0', barW / 2, 'middle'], ['+' + maxAbs.toFixed(1), barW, 'end']].forEach(([lab, xx, anc]) => {
        const lt = svgEl('text', { x: xx, y: 25, class: 'ql-tick-label', 'text-anchor': anc });
        lt.textContent = lab;
        legG.appendChild(lt);
      });
      const lnote = svgEl('text', { x: 0, y: 41, class: 'ql-tick-label', fill: 'var(--ink-muted)' });
      lnote.textContent = t('differential.heatLegendNote');
      legG.appendChild(lnote);
      legG.setAttribute('transform', 'translate(' + mL + ',' + (mT + plotH + 22) + ')');
      svg.appendChild(legG);

      if (capped) capText(HW / 2, single ? 40 : 20, totalSig);
      return heatCfg(HW);
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

    renderStats(); renderChart(); renderTable();

    editor = attachChartEditor({
      key: ceCfg.key,
      svg,
      mount: chartPanel,
      filename: ceCfg.filename,
      lang: getLang(),
      elements: ceCfg.elements,
      onReset: () => paint(),
    });

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
    if (labelNInput) labelNInput.addEventListener('input', () => { thresholds = { ...thresholds, labelN: parseInt(labelNInput.value, 10) || 0 }; refresh(); });
    searchInput.addEventListener('input', () => { search = searchInput.value; renderChart(); if (editor) editor.sync(); });
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
      renderStats(); renderChart(); renderTable();
      if (editor) editor.sync();
    }
  }

  paint();
  const stop = subscribe(paint);
  return () => { stop(); if (editor) { editor.destroy(); editor = null; } };
}
