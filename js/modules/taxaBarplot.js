import { state, subscribe } from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { loadExampleCommunityData, loadRealCommunityData, mountExampleButtons } from '../lib/exampleData.js';
import { attachChartEditor } from '../lib/chartEditor.js';
import { makeGroupResolver } from '../lib/sampleMatch.js';
import { groupColor } from '../lib/groupBoxplot.js';
import { kruskalWallis, benjaminiHochberg, cliffsDelta, quartiles, formatP } from '../lib/stats.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CAT_VARS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7'];
const OTHER_VAR = '--cat-8';
const TOP_N_DEFAULT = 7, TOP_N_MIN = 3, TOP_N_MAX = 20;
const OTHER_COL_RE = /^(others?|otros?|resto)$/i;

function shortTaxonName(fullTax) {
  const parts = fullTax.split(';').map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || fullTax;
  const cleaned = last.replace(/^[a-z]__/i, '');
  return cleaned || t('barplots.unclassified');
}

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function emptyState(container, title, desc) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'ql-empty';
  box.innerHTML =
    '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>' +
    '<h3>' + title + '</h3><p>' + desc + '</p>';
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;';
  const goUpload = document.createElement('a');
  goUpload.href = '#/cargar';
  goUpload.className = 'ql-btn';
  goUpload.textContent = t('ui.goLoadData');
  btnRow.appendChild(goUpload);
  box.appendChild(btnRow);
  mountExampleButtons(box, {
    real: loadRealCommunityData,
    synthetic: loadExampleCommunityData,
    download: ['barplot', 'taxonomy', 'metadata'],
  });
  container.appendChild(box);
}

export function render(container) {
  let level = null;
  let sortByGroup = true;
  let groupCol = null;
  let topN = TOP_N_DEFAULT;
  let minPrev = 0;             // prevalencia mínima (% de muestras con el taxón presente)
  let view = 'barplot';        // 'barplot' | 'biomarkers'
  let qThresh = 0.05;          // umbral q (BH) de la vista de biomarcadores
  let bmSort = { key: 'delta', dir: 'desc' };
  let editor = null;

  function paint() {
    if (editor) { editor.destroy(); editor = null; }
    container.innerHTML = '';
    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('barplots.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('barplots.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('barplots.subtitle', { n: topN }) + '</p>';
    container.appendChild(header);

    if (!state.taxaBarplot) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      emptyState(card, t('barplots.emptyTitle'), t('barplots.emptyDesc'));
      container.appendChild(card);
      return;
    }

    // pestañas: Barplot | Biomarcadores
    const tabs = document.createElement('div');
    tabs.className = 'ql-tabs';
    [['barplot', t('barplots.tabBarplot')], ['biomarkers', t('barplots.tabBiomarkers')]].forEach(([v, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ql-tab' + (view === v ? ' is-active' : '');
      b.textContent = label;
      b.addEventListener('click', () => { if (view !== v) { view = v; paint(); } });
      tabs.appendChild(b);
    });
    container.appendChild(tabs);

    const levels = Object.keys(state.taxaBarplot.levels).sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(b));
    if (level === null || !levels.includes(String(level))) level = levels[levels.length - 1];
    const table = state.taxaBarplot.levels[level];

    // detectar columna de grupo en metadatos, si hay
    let groupOptions = [];
    if (state.metadata) {
      groupOptions = state.metadata.headers.filter((h) => h !== state.metadata.sampleIdKey);
      if (!groupCol && groupOptions.length > 0) groupCol = groupOptions[0];
    }

    if (view === 'biomarkers') { renderBiomarkers(table, levels, groupOptions); return; }

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    // ---- panel principal: gráfico ----
    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<p class="ql-panel-note" style="margin-bottom:4px;">' + t('barplots.chartNote') + '</p>';

    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap scroll-x';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': t('a11y.chartBarplot') });
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg);
    chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);

    grid.appendChild(chartPanel);

    // ---- panel lateral: controles ----
    const controls = document.createElement('aside');
    controls.className = 'ql-card ql-panel';
    controls.innerHTML = '<h2>' + t('ui.controls') + '</h2>';

    const levelField = document.createElement('div');
    levelField.className = 'ql-field';
    levelField.innerHTML = '<label>' + t('barplots.levelLabel') + '</label>';
    const levelSelect = document.createElement('select');
    levels.forEach((lv) => {
      const opt = document.createElement('option');
      opt.value = lv;
      opt.textContent = t('barplots.level', { n: lv }) + (Number(lv) === 6 ? t('barplots.levelGenus') : Number(lv) === 2 ? t('barplots.levelPhylum') : '');
      if (String(level) === lv) opt.selected = true;
      levelSelect.appendChild(opt);
    });
    levelField.appendChild(levelSelect);
    controls.appendChild(levelField);

    const topField = document.createElement('div');
    topField.className = 'ql-field';
    topField.innerHTML = '<label for="qlTopN">' + t('barplots.topNLabel') + '</label>' +
      '<div class="ql-inputrow">' +
      '<input type="range" id="qlTopNr" min="' + TOP_N_MIN + '" max="' + TOP_N_MAX + '" step="1" value="' + topN + '" />' +
      '<input type="number" id="qlTopN" class="ql-num-small tabular" min="' + TOP_N_MIN + '" max="' + TOP_N_MAX + '" step="1" value="' + topN + '" /></div>' +
      '<p class="ql-field-help">' + t('barplots.topNHelp') + '</p>';
    controls.appendChild(topField);

    const prevField = document.createElement('div');
    prevField.className = 'ql-field';
    prevField.innerHTML = '<label for="qlPrev">' + t('barplots.prevLabel') + '</label>' +
      '<div class="ql-inputrow">' +
      '<input type="range" id="qlPrevR" min="0" max="100" step="5" value="' + minPrev + '" />' +
      '<input type="number" id="qlPrev" class="ql-num-small tabular" min="0" max="100" step="5" value="' + minPrev + '" /></div>' +
      '<p class="ql-field-help">' + t('barplots.prevHelp') + '</p>';
    controls.appendChild(prevField);

    if (groupOptions.length > 0) {
      const groupField = document.createElement('div');
      groupField.className = 'ql-field';
      groupField.innerHTML = '<label>' + t('barplots.groupLabel') + '</label>';
      const groupSelect = document.createElement('select');
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = t('barplots.groupNone');
      groupSelect.appendChild(noneOpt);
      groupOptions.forEach((g) => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        if (sortByGroup && groupCol === g) opt.selected = true;
        groupSelect.appendChild(opt);
      });
      if (!sortByGroup) noneOpt.selected = true;
      groupField.appendChild(groupSelect);
      controls.appendChild(groupField);
      groupSelect.addEventListener('change', () => {
        sortByGroup = groupSelect.value !== '';
        groupCol = groupSelect.value || groupCol;
        paint();
      });
    } else {
      const note = document.createElement('p');
      note.className = 'ql-field-help';
      note.textContent = t('barplots.groupHint');
      controls.appendChild(note);
    }

    const privacy = document.createElement('p');
    privacy.className = 'ql-privacy';
    privacy.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"/></svg>' + t('barplots.localCalc');
    controls.appendChild(privacy);

    grid.appendChild(controls);
    container.appendChild(grid);

    levelSelect.addEventListener('change', () => { level = levelSelect.value; paint(); });
    {
      const nInput = topField.querySelector('#qlTopN');
      const rInput = topField.querySelector('#qlTopNr');
      const apply = (v) => {
        const nv = Math.max(TOP_N_MIN, Math.min(TOP_N_MAX, parseInt(v, 10) || TOP_N_DEFAULT));
        if (nv !== topN) { topN = nv; paint(); }
      };
      nInput.addEventListener('change', () => apply(nInput.value));
      rInput.addEventListener('change', () => apply(rInput.value));
      rInput.addEventListener('input', () => { nInput.value = rInput.value; });
    }
    {
      const nInput = prevField.querySelector('#qlPrev');
      const rInput = prevField.querySelector('#qlPrevR');
      const apply = (v) => {
        const nv = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
        if (nv !== minPrev) { minPrev = nv; paint(); }
      };
      nInput.addEventListener('change', () => apply(nInput.value));
      rInput.addEventListener('change', () => apply(rInput.value));
      rInput.addEventListener('input', () => { nInput.value = rInput.value; });
    }

    // ---- tabla ----
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t('barplots.tableTitle') + '</h2>';
    container.appendChild(tableCard);

    // ---- datos ----
    const sampleKey = table.headers[0];
    // una columna "Others"/"Otros"/"resto" que ya venga en el archivo (formato
    // TOP14 de QIIME2) se pliega SIEMPRE dentro de "Otros" — nunca se dibuja
    // como un taxón con su propio color.
    const OTHER_COL_RE = /^(others?|otros?|resto)$/i;
    const taxonHeaders = table.headers.filter((h, i) => i !== 0 && !OTHER_COL_RE.test(String(h).trim()));
    const preAggOtherHeaders = table.headers.filter((h, i) => i !== 0 && OTHER_COL_RE.test(String(h).trim()));

    // Cada fila se normaliza por su propia suma: así las barras suman 100%
    // tanto si el archivo trae conteos crudos, como porcentajes (0–100) o
    // fracciones (0–1). Es lo correcto para un barplot de abundancia RELATIVA.
    const rowSum = (row) =>
      taxonHeaders.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0) +
      preAggOtherHeaders.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0);
    const otherRaw = (row) =>
      otherTaxa.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0) +
      preAggOtherHeaders.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0);

    const nRows = table.rows.length || 1;
    const means = taxonHeaders.map((h) => {
      let present = 0;
      const vals = table.rows.map((r) => {
        const t = rowSum(r);
        const v = parseFloat(r[h]) || 0;
        if (v > 0) present++;
        return t > 0 ? v / t : 0;
      });
      return { header: h, mean: vals.reduce((a, b) => a + b, 0) / (vals.length || 1), prev: present / nRows };
    }).sort((a, b) => b.mean - a.mean);

    // filtro de prevalencia: los taxones presentes en menos del umbral % de
    // muestras no compiten por un color propio; se pliegan dentro de "Otros".
    const eligible = means.filter((m) => m.prev * 100 >= minPrev);
    const belowPrev = means.length - eligible.length;
    const topSet = new Set(eligible.slice(0, topN).map((m) => m.header));
    const topTaxa = means.filter((m) => topSet.has(m.header)).map((m) => m.header);
    const otherTaxa = means.filter((m) => !topSet.has(m.header)).map((m) => m.header);

    if (minPrev > 0) {
      tableCard.insertAdjacentHTML('beforeend',
        '<p class="ql-field-help" style="margin-top:0">' +
        t('barplots.prevApplied', { pct: minPrev, n: belowPrev, total: means.length }) + '</p>');
    }

    let sampleOrder = table.rows.map((r) => r[sampleKey]);
    let groupBySample = {};
    if (state.metadata && groupCol) {
      const metaByKey = {};
      state.metadata.rows.forEach((r) => { metaByKey[r[state.metadata.sampleIdKey]] = r[groupCol]; });
      groupBySample = metaByKey;
      if (sortByGroup) {
        sampleOrder = sampleOrder.slice().sort((a, b) => {
          const ga = metaByKey[a] || '', gb = metaByKey[b] || '';
          return ga === gb ? String(a).localeCompare(String(b)) : String(ga).localeCompare(String(gb));
        });
      }
    }

    const rowsBySample = {};
    table.rows.forEach((r) => { rowsBySample[r[sampleKey]] = r; });

    // Hasta 7 taxones = un color de la paleta categórica cada uno. A partir de
    // ahí los colores se repiten (como en el barplot de QIIME2): la identidad
    // la lleva la leyenda + el tooltip + la tabla, no el color solo.
    const series = topTaxa.map((h, i) => ({ key: h, label: shortTaxonName(h), colorVar: CAT_VARS[i % CAT_VARS.length] }));
    // "Otros" solo si de verdad agrupa algo (taxones fuera del top o una
    // columna "Other" ya venía en el archivo). Si el top abarca todos los
    // taxones no se pinta una serie gris de 0 %.
    const hasOther = otherTaxa.length > 0 || preAggOtherHeaders.length > 0;
    if (hasOther) {
      const otherLabel = preAggOtherHeaders.length
        ? t('barplots.othersNplus', { n: otherTaxa.length })
        : t('barplots.othersN', { n: otherTaxa.length });
      series.push({ key: '__other__', label: otherLabel, colorVar: OTHER_VAR });
    }
    const colorsRepeat = topTaxa.length > CAT_VARS.length;

    // chart
    const legCols = series.length > 13 ? 3 : series.length > 6 ? 2 : 1;
    const legRows = Math.ceil(series.length / legCols);
    const marginL = 56, marginR = 12, marginT = 42;
    // Las etiquetas de muestra van rotadas -55°: cuánto bajan depende de su
    // longitud. Reservamos hueco real para que el título del eje X no se
    // solape con ellas (bug de maquetado que se veía con IDs largos).
    const showEvery = sampleOrder.length > 24 ? Math.ceil(sampleOrder.length / 24) : 1;
    const maxLabelChars = sampleOrder.reduce((m, s, si) => (si % showEvery === 0 ? Math.max(m, String(s).length) : m), 0);
    const labelDrop = 14 + Math.min(104, Math.round(maxLabelChars * 6.4 * 0.82)); // 0.82 ≈ sin(55°)
    const xTitleGap = labelDrop + 14;
    const marginB = xTitleGap + 20 + legRows * 15 + (colorsRepeat ? 20 : 4);
    const slotW = Math.max(18, Math.min(46, 900 / Math.max(sampleOrder.length, 1)));
    const barW = Math.min(24, slotW * 0.7);
    const innerH = 380;
    const W = Math.max(marginL + marginR + slotW * sampleOrder.length, 420);
    const H = marginT + innerH + marginB;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.width = W + 'px'; // ancho real en px: si no caben todas las muestras, el contenedor hace scroll horizontal en vez de aplastar las barras
    svg.style.maxWidth = 'none';
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // gridlines y-axis (0/25/50/75/100 %)
    [0, 0.25, 0.5, 0.75, 1].forEach((frac) => {
      const y = marginT + innerH - frac * innerH;
      svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, class: 'ql-gridline' }));
      const t = svgEl('text', { x: marginL - 8, y: y + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
      t.textContent = Math.round(frac * 100) + '%';
      svg.appendChild(t);
    });
    svg.appendChild(svgEl('line', { x1: marginL, x2: marginL, y1: marginT, y2: marginT + innerH, class: 'ql-baseline-line' }));

    const gap = 2; // separador entre segmentos apilados
    sampleOrder.forEach((sampleId, si) => {
      const row = rowsBySample[sampleId];
      if (!row) return;
      const cx = marginL + si * slotW + slotW / 2;
      const total = rowSum(row) || 1;
      let cumulative = 0;
      series.forEach((s) => {
        let val;
        if (s.key === '__other__') {
          val = otherRaw(row) / total;
        } else {
          val = (parseFloat(row[s.key]) || 0) / total;
        }
        if (val <= 0) { return; }
        const yTop = marginT + innerH - (cumulative + val) * innerH;
        const yBot = marginT + innerH - cumulative * innerH;
        const h = Math.max(0, yBot - yTop - gap);
        const rect = svgEl('rect', {
          x: cx - barW / 2, y: yTop, width: barW, height: Math.max(h, 0),
          fill: 'var(' + s.colorVar + ')',
          ...(s.key === '__other__' ? {} : { 'data-ce-series-fill': 's' + CAT_VARS.indexOf(s.colorVar) }),
        });
        rect.addEventListener('mouseenter', () => showTooltip(sampleId, s.label, val, cx, yTop, chartWrap, svg, W, H, tooltip));
        rect.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
        svg.appendChild(rect);
        cumulative += val;
      });
    });

    // etiquetas eje X (rotadas si hay muchas muestras)
    sampleOrder.forEach((sampleId, si) => {
      if (si % showEvery !== 0) return;
      const cx = marginL + si * slotW + slotW / 2;
      const t = svgEl('text', {
        x: cx, y: marginT + innerH + 16, class: 'ql-tick-label', 'text-anchor': 'end',
        transform: 'rotate(-55 ' + cx + ' ' + (marginT + innerH + 16) + ')',
      });
      t.textContent = sampleId;
      svg.appendChild(t);
    });

    const xLabelBase = marginT + innerH + xTitleGap; // bajo las etiquetas de muestra rotadas
    const xTitle = svgEl('text', { x: marginL + (W - marginL - marginR) / 2, y: xLabelBase, class: 'ql-axis-label', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
    xTitle.textContent = groupCol ? t('barplots.axisSamplesBy', { col: groupCol }) : t('barplots.axisSamples');
    svg.appendChild(xTitle);

    const yTitle = svgEl('text', {
      x: 15, y: marginT + innerH / 2, class: 'ql-axis-label', 'text-anchor': 'middle',
      transform: 'rotate(-90 15 ' + (marginT + innerH / 2) + ')', 'data-ce': 'ytitle',
    });
    yTitle.textContent = t('barplots.axisPct');
    svg.appendChild(yTitle);

    // leyenda dentro del SVG (editable + exportable), 1-3 columnas
    const legG = svgEl('g', { 'data-ce': 'legend' });
    const colW = Math.min(260, Math.max(150, (W - marginL - marginR) / legCols));
    series.forEach((s, i) => {
      const col = Math.floor(i / legRows), rw = i % legRows;
      const xx = col * colW, yy = rw * 15;
      legG.appendChild(svgEl('rect', {
        x: xx, y: yy - 8, width: 10, height: 10, rx: 2, fill: 'var(' + s.colorVar + ')',
        ...(s.key === '__other__' ? {} : { 'data-ce-series-fill': 's' + CAT_VARS.indexOf(s.colorVar) }),
      }));
      const lt = svgEl('text', { x: xx + 15, y: yy, class: 'ql-tick-label' });
      lt.textContent = s.label;
      legG.appendChild(lt);
    });
    if (colorsRepeat) {
      const nt = svgEl('text', { x: 0, y: legRows * 15 + 4, class: 'ql-tick-label' });
      nt.setAttribute('fill', 'var(--ink-muted)');
      nt.textContent = t('barplots.colorsRepeat');
      legG.appendChild(nt);
    }
    legG.setAttribute('transform', 'translate(' + marginL + ',' + (xLabelBase + 18) + ')');
    svg.appendChild(legG);

    if (editor) editor.destroy();
    editor = attachChartEditor({
      key: 'taxaBarplot', svg, mount: chartPanel, filename: t('barplots.title'), lang: getLang(),
      elements: [
        { id: 'title', create: { text: t('barplots.chartFigTitle'), x: W / 2, y: 24, anchor: 'middle', cls: 'ce-title' } },
        { id: 'xtitle', selector: '[data-ce="xtitle"]' },
        { id: 'ytitle', selector: '[data-ce="ytitle"]' },
        { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
      ],
      paletteSeries: CAT_VARS.map((cv, i) => ({
        id: 's' + i,
        label: (series.find((s) => s.colorVar === cv) || {}).label || t('barplots.paletteSlotN', { n: i + 1 }),
      })),
      paletteType: 'categorical',
      onReset: () => paint(),
    });

    // tabla
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll scroll-x';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th><button type="button">' + t('barplots.colSample') + '</button></th>' +
      (groupCol ? '<th><button type="button">' + escapeHtml(groupCol) + '</button></th>' : '') +
      series.map((s) => '<th><button type="button">' + escapeHtml(s.label) + '</button></th>').join('') + '</tr>';
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    sampleOrder.forEach((sampleId) => {
      const row = rowsBySample[sampleId];
      if (!row) return;
      const tr = document.createElement('tr');
      let cells = '<td>' + escapeHtml(sampleId) + '</td>';
      if (groupCol) cells += '<td>' + escapeHtml(groupBySample[sampleId] || '—') + '</td>';
      const total = rowSum(row) || 1;
      series.forEach((s) => {
        const val = (s.key === '__other__' ? otherRaw(row) : (parseFloat(row[s.key]) || 0)) / total;
        cells += '<td class="ql-num tabular">' + (val * 100).toFixed(1) + '%</td>';
      });
      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);
  }

  // =========================================================================
  //  VISTA BIOMARCADORES — inspirada en LEfSe, SIN LDA
  //  Kruskal-Wallis por taxón → BH (FDR) → grupo enriquecido (mediana más
  //  alta) → delta de Cliff one-vs-rest como tamaño de efecto (barra).
  //  Toda la estadística está ya verificada en stats.js.
  // =========================================================================
  function renderBiomarkers(table, levels, groupOptions) {
    // aviso honesto: esto NO es LEfSe
    const disc = document.createElement('p');
    disc.className = 'ql-panel-note';
    disc.style.margin = '0 0 14px';
    disc.textContent = t('barplots.bmDisclaimer');
    container.appendChild(disc);

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<p class="ql-panel-note" style="margin-bottom:4px;">' + t('barplots.bmChartNote') + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': t('a11y.chartBiomarkers') });
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg); chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);
    grid.appendChild(chartPanel);

    const controls = document.createElement('aside');
    controls.className = 'ql-card ql-panel';
    controls.innerHTML = '<h2>' + t('ui.controls') + '</h2>';

    // nivel taxonómico (compartido con el barplot)
    if (levels.length > 1) {
      const lf = document.createElement('div');
      lf.className = 'ql-field';
      lf.innerHTML = '<label>' + t('barplots.levelLabel') + '</label>';
      const sel = document.createElement('select');
      levels.forEach((lv) => {
        const o = document.createElement('option');
        o.value = lv;
        o.textContent = t('barplots.level', { n: lv }) + (Number(lv) === 6 ? t('barplots.levelGenus') : Number(lv) === 2 ? t('barplots.levelPhylum') : '');
        if (String(level) === lv) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { level = sel.value; paint(); });
      lf.appendChild(sel);
      controls.appendChild(lf);
    }

    // columna de grupo
    if (groupOptions.length > 0) {
      const gf = document.createElement('div');
      gf.className = 'ql-field';
      gf.innerHTML = '<label>' + t('barplots.groupLabel') + '</label>';
      const sel = document.createElement('select');
      groupOptions.forEach((g) => {
        const o = document.createElement('option'); o.value = g; o.textContent = g;
        if (g === groupCol) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { groupCol = sel.value; paint(); });
      gf.appendChild(sel);
      controls.appendChild(gf);
    }

    // umbral q
    const qf = document.createElement('div');
    qf.className = 'ql-field';
    qf.innerHTML = '<label for="bmQ">' + t('barplots.bmQLabel') + '</label>' +
      '<div class="ql-inputrow">' +
      '<input type="range" id="bmQr" min="0.001" max="0.25" step="0.001" value="' + qThresh + '" />' +
      '<input type="number" id="bmQ" class="ql-num-small tabular" min="0.0001" max="1" step="0.001" value="' + qThresh + '" /></div>' +
      '<p class="ql-field-help">' + t('barplots.bmQHelp') + '</p>';
    controls.appendChild(qf);
    const qR = qf.querySelector('#bmQr'), qN = qf.querySelector('#bmQ');
    const applyQ = (v) => { const nv = Math.max(0.0001, Math.min(1, Number(v))); if (isFinite(nv) && nv !== qThresh) { qThresh = nv; paint(); } };
    qR.addEventListener('input', () => { qN.value = qR.value; });
    qR.addEventListener('change', () => applyQ(qR.value));
    qN.addEventListener('change', () => applyQ(qN.value));

    const method = document.createElement('p');
    method.className = 'ql-field-help';
    method.style.marginTop = '14px';
    method.textContent = t('barplots.bmMethod');
    controls.appendChild(method);

    grid.appendChild(controls);
    container.appendChild(grid);

    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t('barplots.bmTableTitle') + '</h2>';
    container.appendChild(tableCard);

    // --- necesitamos metadatos + ≥2 grupos ---
    if (!state.metadata || !groupCol) {
      chartPanel.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('barplots.bmNeedGroup') + '</p>');
      return;
    }

    // --- abundancia relativa (%) por taxón y muestra, agrupada ---
    const sampleKey = table.headers[0];
    const abundHeaders = table.headers.filter((h, i) => i !== 0); // taxones + posible "Otros"
    const taxonHeaders = abundHeaders.filter((h) => !OTHER_COL_RE.test(String(h).trim()));
    const rowSum = (row) => abundHeaders.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0);
    const resolveGroup = makeGroupResolver(state.metadata, groupCol);

    const relByTaxon = {}; // taxon -> { group -> number[] }
    const groupSet = new Set();
    table.rows.forEach((row) => {
      const g = resolveGroup(String(row[sampleKey]).trim());
      if (!g) return;
      groupSet.add(g);
      const total = rowSum(row) || 1;
      taxonHeaders.forEach((h) => {
        const rel = (parseFloat(row[h]) || 0) / total * 100;
        const byG = (relByTaxon[h] = relByTaxon[h] || {});
        (byG[g] = byG[g] || []).push(rel);
      });
    });
    const groups = [...groupSet].sort();

    if (groups.length < 2) {
      chartPanel.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('barplots.bmNeed2Groups') + '</p>');
      return;
    }

    // --- Kruskal-Wallis por taxón (solo los presentes en TODOS los grupos) ---
    const tested = [];
    taxonHeaders.forEach((h) => {
      const perGroup = groups.map((g) => relByTaxon[h][g] || []);
      if (perGroup.some((arr) => arr.length === 0)) return;
      const kw = kruskalWallis(perGroup);
      if (!isFinite(kw.p)) return;
      tested.push({ taxon: h, label: shortTaxonName(h), p: kw.p, perGroup });
    });

    // --- BH sobre TODOS los p testados ---
    const q = benjaminiHochberg(tested.map((x) => x.p));
    tested.forEach((x, i) => { x.q = q[i]; });

    // --- significativos: grupo enriquecido (mediana más alta) + delta de Cliff ---
    const sig = tested.filter((x) => x.q < qThresh).map((x) => {
      const medians = x.perGroup.map((arr) => quartiles(arr.slice().sort((a, b) => a - b)).median);
      let bi = 0;
      for (let i = 1; i < medians.length; i++) if (medians[i] > medians[bi]) bi = i;
      const inGroup = x.perGroup[bi];
      const rest = x.perGroup.filter((_, i) => i !== bi).flat();
      return { ...x, enrichedGroup: groups[bi], enrichedIdx: bi, delta: cliffsDelta(inGroup, rest) };
    });
    sig.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    chartPanel.insertAdjacentHTML('beforeend',
      '<p class="ql-field-help" style="margin-top:6px;">' +
      t('barplots.bmCount', { n: sig.length, total: tested.length, q: qThresh }) + '</p>');

    // --- gráfico: barras horizontales tipo LEfSe ---
    drawBiomarkerBars(svg, chartPanel, chartWrap, tooltip, sig, groups);

    // --- tabla ordenable ---
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    const cols = [
      ['label', t('barplots.bmColTaxon')],
      ['enrichedGroup', t('barplots.bmColGroup')],
      ['delta', t('barplots.bmColDelta')],
      ['q', t('barplots.bmColQ')],
    ];
    let thead = '<thead><tr>';
    cols.forEach(([key, lbl]) => {
      const on = bmSort.key === key;
      thead += '<th aria-sort="' + (on ? (bmSort.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" data-sort="' + key + '">' + escapeHtml(lbl) +
        (on ? ' <span aria-hidden="true">' + (bmSort.dir === 'asc' ? '▲' : '▼') + '</span>' : '') + '</button></th>';
    });
    tbl.innerHTML = thead + '</tr></thead>';
    const tb = document.createElement('tbody');
    if (sig.length === 0) {
      tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--ink-muted);padding:20px;">' + t('barplots.bmNone') + '</td></tr>';
    } else {
      const dir = bmSort.dir === 'asc' ? 1 : -1;
      const rows = sig.slice().sort((a, b) => {
        const av = a[bmSort.key], bv = b[bmSort.key];
        if (bmSort.key === 'delta') return (Math.abs(av) - Math.abs(bv)) * dir;
        if (typeof av === 'string') return av.localeCompare(bv) * dir;
        return (av - bv) * dir;
      });
      rows.forEach((r) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escapeHtml(r.label) + '</td>' +
          '<td><span class="ql-bm-swatch" style="background:' + groupColor(r.enrichedIdx) + '"></span>' + escapeHtml(r.enrichedGroup) + '</td>' +
          '<td class="ql-num tabular">' + r.delta.toFixed(3) + '</td>' +
          '<td class="ql-num tabular">' + formatP(r.q) + '</td>';
        tb.appendChild(tr);
      });
    }
    tbl.appendChild(tb);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);
    tbl.querySelectorAll('th button[data-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-sort');
        if (bmSort.key === key) bmSort = { key, dir: bmSort.dir === 'asc' ? 'desc' : 'asc' };
        // por defecto: nombres y q ascendente; δ (efecto) descendente
        else bmSort = { key, dir: key === 'delta' ? 'desc' : 'asc' };
        paint();
      });
    });
  }

  function drawBiomarkerBars(svg, mount, chartWrap, tooltip, sig, groups) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (sig.length === 0) {
      svg.setAttribute('viewBox', '0 0 400 80');
      const tx = svgEl('text', { x: 200, y: 44, 'text-anchor': 'middle', class: 'ql-axis-label', fill: 'var(--ink-muted)' });
      tx.textContent = t('barplots.bmNone');
      svg.appendChild(tx);
      editor = attachChartEditor({ key: 'taxaBiomarkers', svg, mount, filename: t('barplots.bmTitle'), lang: getLang(), elements: [], onReset: () => paint() });
      return;
    }
    const labelChars = Math.max(...sig.map((s) => s.label.length), 8);
    const marginL = Math.min(240, 26 + Math.min(labelChars, 34) * 6.3);
    const marginR = 52, marginT = 40;
    const rowH = 24;
    const innerW = 380;
    const barsBottom = marginT + sig.length * rowH;

    // leyenda al pie, envolviendo por filas si no cabe
    const shown = [...new Set(sig.map((s) => s.enrichedIdx))].sort((a, b) => a - b);
    const legItems = shown.map((gi) => ({ gi, text: t('barplots.bmEnrichedIn', { group: groups[gi] }) }));
    const legItemW = (it) => 15 + it.text.length * 6 + 18;
    let legRows = 1, lx = 0;
    legItems.forEach((it) => {
      const w = legItemW(it);
      if (lx + w > innerW + marginR && lx > 0) { legRows++; lx = 0; }
      it._x = lx; it._row = legRows - 1; lx += w;
    });

    const tickY = barsBottom + 15;
    const axisY = tickY + 16;
    const legY = axisY + 12;
    const marginB = (legY - barsBottom) + legRows * 15 + 6;
    const W = marginL + innerW + marginR;
    const H = marginT + sig.length * rowH + marginB;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.width = '';
    svg.style.maxWidth = '';

    const maxAbs = Math.max(...sig.map((s) => Math.abs(s.delta)), 0.2);
    const x = (d) => marginL + (Math.abs(d) / maxAbs) * innerW;

    // rejilla vertical + eje
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const dv = (i / ticks) * maxAbs;
      const xx = marginL + (i / ticks) * innerW;
      svg.appendChild(svgEl('line', { x1: xx, x2: xx, y1: marginT - 6, y2: barsBottom, class: 'ql-gridline' }));
      const tk = svgEl('text', { x: xx, y: tickY, class: 'ql-tick-label', 'text-anchor': 'middle' });
      tk.textContent = dv.toFixed(2);
      svg.appendChild(tk);
    }
    svg.appendChild(svgEl('line', { x1: marginL, x2: marginL, y1: marginT - 6, y2: barsBottom, class: 'ql-baseline-line' }));

    const axT = svgEl('text', { x: marginL + innerW / 2, y: axisY, class: 'ql-axis-label', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
    axT.textContent = t('barplots.bmAxisDelta');
    svg.appendChild(axT);

    const barsG = svgEl('g', { 'data-ce': 'bars' });
    const labelsG = svgEl('g', { 'data-ce': 'labels' });
    sig.forEach((s, i) => {
      const y = marginT + i * rowH;
      const bh = rowH - 8;
      const w = Math.max(1.5, x(s.delta) - marginL);
      const rect = svgEl('rect', {
        x: marginL, y: y + 3, width: w, height: bh, rx: 2,
        fill: groupColor(s.enrichedIdx), 'fill-opacity': 0.85,
        'data-ce-series-fill': 's' + s.enrichedIdx,
      });
      rect.addEventListener('mouseenter', () => {
        const wr = chartWrap.getBoundingClientRect(), sr = svg.getBoundingClientRect();
        tooltip.style.left = ((sr.left - wr.left) + (marginL + w) * (sr.width / W)) + 'px';
        tooltip.style.top = ((sr.top - wr.top) + (y + rowH / 2) * (sr.height / H)) + 'px';
        tooltip.innerHTML = '<div class="ql-tt-name">' + escapeHtml(s.label) + '</div>' +
          '<div class="ql-tt-row">' + escapeHtml(t('barplots.bmEnrichedIn', { group: s.enrichedGroup })) +
          ' · δ = ' + s.delta.toFixed(3) + ' · q = ' + formatP(s.q) + '</div>';
        tooltip.classList.add('is-show');
      });
      rect.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
      barsG.appendChild(rect);

      const lt = svgEl('text', { x: marginL - 8, y: y + rowH / 2 + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
      lt.textContent = s.label.length > 34 ? s.label.slice(0, 33) + '…' : s.label;
      labelsG.appendChild(lt);

      const vt = svgEl('text', { x: marginL + w + 5, y: y + rowH / 2 + 3, class: 'ql-tick-label' });
      vt.textContent = s.delta.toFixed(2);
      barsG.appendChild(vt);
    });
    svg.appendChild(barsG);
    svg.appendChild(labelsG);

    // leyenda al pie: grupos que aparecen como "enriquecido"
    const legG = svgEl('g', { 'data-ce': 'legend' });
    legItems.forEach((it) => {
      const xx = it._x, yy = it._row * 15;
      legG.appendChild(svgEl('rect', { x: xx, y: yy - 8, width: 10, height: 10, rx: 2, fill: groupColor(it.gi), 'data-ce-series-fill': 's' + it.gi }));
      const lt = svgEl('text', { x: xx + 15, y: yy, class: 'ql-tick-label' });
      lt.textContent = it.text;
      legG.appendChild(lt);
    });
    legG.setAttribute('transform', 'translate(' + marginL + ',' + legY + ')');
    svg.appendChild(legG);

    editor = attachChartEditor({
      key: 'taxaBiomarkers', svg, mount, filename: t('barplots.bmTitle'), lang: getLang(),
      elements: [
        { id: 'title', create: { text: t('barplots.bmTitle'), x: W / 2, y: 22, anchor: 'middle', cls: 'ce-title' } },
        { id: 'xtitle', selector: '[data-ce="xtitle"]' },
        { id: 'labels', selector: '[data-ce="labels"]', kind: 'group' },
        { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
      ],
      paletteSeries: groups.map((g, i) => ({ id: 's' + i, label: g })),
      paletteType: 'categorical',
      onReset: () => paint(),
    });
  }

  function showTooltip(sampleId, taxonLabel, val, cx, cy, wrap, svgEl_, W, H, tooltipEl) {
    const wrapRect = wrap.getBoundingClientRect();
    const svgRect = svgEl_.getBoundingClientRect();
    const scaleX = svgRect.width / W, scaleY = svgRect.height / H;
    const left = (svgRect.left - wrapRect.left) + cx * scaleX + wrap.scrollLeft;
    const top = (svgRect.top - wrapRect.top) + cy * scaleY;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
    tooltipEl.innerHTML = '<div class="ql-tt-name">' + escapeHtml(sampleId) + '</div>' +
      '<div class="ql-tt-row">' + escapeHtml(taxonLabel) + ' · ' + (val * 100).toFixed(2) + '%</div>';
    tooltipEl.classList.add('is-show');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  paint();
  const stop = subscribe(paint);
  return () => { stop(); if (editor) { editor.destroy(); editor = null; } };
}
