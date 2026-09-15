import { state, subscribe } from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { loadExampleCommunityData, loadRealCommunityData, mountExampleButtons } from '../lib/exampleData.js';
import { attachChartEditor, openChartEditor } from '../lib/chartEditor.js';
import { makeGroupResolver } from '../lib/sampleMatch.js';
import { groupColor } from '../lib/groupBoxplot.js';
import { kruskalWallis, benjaminiHochberg, cliffsDelta, quartiles, formatP, lefseLdaScore } from '../lib/stats.js';
import { computeGroupTaxaMatrix, computeAlluvialLayout } from '../lib/alluvial.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const CAT_VARS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7'];
export const OTHER_VAR = '--cat-8';
export const TOP_N_DEFAULT = 15, TOP_N_MIN = 5, TOP_N_MAX = 50;
export const MIN_ABUND_DEFAULT = 1, MIN_ABUND_MIN = 0, MIN_ABUND_MAX = 10;
export const OTHER_COLOR = '#d3d3d3';
export const OTHER_COL_RE = /^(others?|otros?|resto)$/i;

export function shortTaxonName(fullTax) {
  if (!fullTax) return t('barplots.unclassified') || 'Sin clasificar';
  const parts = String(fullTax).split(';').map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || fullTax;
  const cleaned = String(last).replace(/^[a-z]__/i, '');
  return cleaned || t('barplots.unclassified') || 'Sin clasificar';
}

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

const CAT_HEX_FALLBACKS = {
  '--cat-1': '#2a78d6',
  '--cat-2': '#d97706',
  '--cat-3': '#10b981',
  '--cat-4': '#ef4444',
  '--cat-5': '#8b5cf6',
  '--cat-6': '#ec4899',
  '--cat-7': '#06b6d4',
  '--cat-8': '#6b7280',
};

function resolveVarHex(cv) {
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    try {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(cv).trim();
      if (raw && raw.startsWith('#')) return raw;
      if (raw && raw.startsWith('rgb')) {
        const rgb = raw.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          return '#' + rgb.slice(0, 3).map((x) => parseInt(x, 10).toString(16).padStart(2, '0')).join('');
        }
      }
    } catch (e) {}
  }
  return CAT_HEX_FALLBACKS[cv] || '#2a78d6';
}

/**
 * Agrupa los taxones minoritarios bajo la categoría "Otros" según su abundancia relativa
 * dataset-wide y el límite topN.
 *
 * @param {Object|Array} data - Objeto { headers, rows } o Array de filas (objetos de muestra)
 * @param {number|Object} [minAbundanceOrOpts=1] - Umbral de abundancia mínima (ej. 1 para 1%, o 0.01) u objeto de opciones
 * @param {number} [topNParam=15] - Cantidad máxima de taxones principales a conservar (5-50)
 * @param {Object} [options={}] - Opciones adicionales ({ minPrev, sampleKey, isPercentage })
 * @returns {{
 *   headers: string[],
 *   rows: Object[],
 *   topTaxa: string[],
 *   otherTaxa: string[],
 *   preAggOtherHeaders: string[],
 *   means: Array<{ header: string, mean: number, prev: number }>,
 *   series: Array<{ key: string, label: string, colorVar?: string, color?: string, isOther?: boolean }>,
 *   sampleKey: string,
 *   hasOther: boolean,
 *   minAbundance: number,
 *   topN: number,
 *   minPrev: number
 * }}
 */
export function groupTaxaByAbundance(data, minAbundanceOrOpts = 1, topNParam = 15, options = {}) {
  let minAbundance = 1;
  let topN = 15;
  let opts = {};

  if (typeof minAbundanceOrOpts === 'object' && minAbundanceOrOpts !== null) {
    opts = { ...minAbundanceOrOpts };
    minAbundance = opts.minAbundance !== undefined ? opts.minAbundance : 1;
    topN = opts.topN !== undefined ? opts.topN : (topNParam !== undefined ? topNParam : 15);
  } else {
    opts = { ...options };
    minAbundance = minAbundanceOrOpts !== undefined ? minAbundanceOrOpts : 1;
    topN = topNParam !== undefined ? topNParam : 15;
  }

  // Convertir minAbundance a fracción decimal (ej: 1 o 1% -> 0.01, 5 -> 0.05, 0.01 -> 0.01)
  let minAbundFrac = 0;
  if (typeof minAbundance === 'number' && !isNaN(minAbundance)) {
    if (opts.isPercentage) {
      minAbundFrac = minAbundance / 100;
    } else if (minAbundance > 1) {
      minAbundFrac = minAbundance / 100;
    } else if (minAbundance === 1 && !opts.isFraction) {
      minAbundFrac = 0.01;
    } else {
      minAbundFrac = Math.max(0, minAbundance);
    }
  }

  const minPrev = typeof opts.minPrev === 'number' ? opts.minPrev : 0;

  let headers = [];
  let rows = [];
  let sampleKey = opts.sampleKey || null;

  if (data && Array.isArray(data.rows) && Array.isArray(data.headers)) {
    headers = data.headers.slice();
    rows = data.rows;
    sampleKey = sampleKey || headers[0] || 'SampleID';
  } else if (Array.isArray(data)) {
    rows = data;
    if (rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null) {
      headers = Object.keys(rows[0]);
      sampleKey = sampleKey || headers[0] || 'SampleID';
    }
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.rows)) rows = data.rows;
    if (Array.isArray(data.headers)) headers = data.headers.slice();
    sampleKey = sampleKey || (headers.length > 0 ? headers[0] : 'SampleID');
  }

  const taxonHeaders = headers.filter((h, i) => h !== sampleKey && !OTHER_COL_RE.test(String(h).trim()));
  const preAggOtherHeaders = headers.filter((h, i) => h !== sampleKey && OTHER_COL_RE.test(String(h).trim()));

  const rowSum = (row) => {
    let sum = 0;
    for (let i = 0; i < taxonHeaders.length; i++) {
      sum += parseFloat(row[taxonHeaders[i]]) || 0;
    }
    for (let i = 0; i < preAggOtherHeaders.length; i++) {
      sum += parseFloat(row[preAggOtherHeaders[i]]) || 0;
    }
    return sum;
  };

  const nRows = rows.length || 1;
  const means = taxonHeaders.map((h) => {
    let present = 0;
    let sumFrac = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const t = rowSum(r);
      const val = parseFloat(r[h]) || 0;
      if (val > 0) present++;
      if (t > 0) sumFrac += (val / t);
    }
    return {
      header: h,
      mean: sumFrac / nRows,
      prev: present / nRows,
    };
  }).sort((a, b) => b.mean - a.mean);

  // Filtro de elegibilidad: cumple umbral de abundancia mínima y prevalencia mínima
  const eligible = means.filter((m) => {
    const meetsAbund = m.mean >= (minAbundFrac - 1e-9);
    const meetsPrev = (m.prev * 100) >= (minPrev - 1e-9);
    return meetsAbund && meetsPrev;
  });

  const targetTopN = Math.max(1, topN);
  const topEligible = eligible.slice(0, targetTopN);
  const topSet = new Set(topEligible.map((m) => m.header));

  const topTaxa = means.filter((m) => topSet.has(m.header)).map((m) => m.header);
  const otherTaxa = means.filter((m) => !topSet.has(m.header)).map((m) => m.header);
  const hasOther = otherTaxa.length > 0 || preAggOtherHeaders.length > 0;

  // Suma de abundancias de taxones minoritarios muestra por muestra asignadas a 'Otros'
  const groupedRows = rows.map((row) => {
    const newRow = {};
    if (sampleKey) newRow[sampleKey] = row[sampleKey];
    const total = rowSum(row) || 1;

    topTaxa.forEach((th) => {
      newRow[th] = row[th] !== undefined ? row[th] : 0;
    });

    let otherSum = 0;
    otherTaxa.forEach((th) => {
      otherSum += parseFloat(row[th]) || 0;
    });
    preAggOtherHeaders.forEach((poh) => {
      otherSum += parseFloat(row[poh]) || 0;
    });

    newRow['Otros'] = otherSum;
    newRow['__other__'] = otherSum;
    newRow['Other'] = otherSum;

    newRow['_relative'] = {};
    topTaxa.forEach((th) => {
      newRow['_relative'][th] = (parseFloat(row[th]) || 0) / total;
    });
    newRow['_relative']['Otros'] = otherSum / total;
    newRow['_relative']['__other__'] = otherSum / total;

    return newRow;
  });

  const groupedHeaders = [
    sampleKey,
    ...topTaxa,
    ...(hasOther ? ['Otros'] : [])
  ];

  // Configuración visual: series. "Otros" siempre al final de la pila con color gris neutro fijo #d3d3d3
  const series = topTaxa.map((h, i) => ({
    key: h,
    label: shortTaxonName(h),
    colorVar: CAT_VARS[i % CAT_VARS.length],
  }));

  if (hasOther) {
    const otherLabel = preAggOtherHeaders.length
      ? (t('barplots.othersNplus', { n: otherTaxa.length }) || 'Otros')
      : (otherTaxa.length ? (t('barplots.othersN', { n: otherTaxa.length }) || 'Otros') : (t('barplots.others') || 'Otros'));
    series.push({
      key: '__other__',
      label: otherLabel,
      colorVar: null,
      color: OTHER_COLOR,
      isOther: true,
    });
  }

  return {
    headers: groupedHeaders,
    rows: groupedRows,
    topTaxa,
    otherTaxa,
    preAggOtherHeaders,
    means,
    series,
    sampleKey,
    hasOther,
    minAbundance: minAbundFrac,
    topN: targetTopN,
    minPrev,
  };
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
  let minAbundance = MIN_ABUND_DEFAULT;
  let minPrev = 0;             // prevalencia mínima (% de muestras con el taxón presente)
  let orientation = 'vertical'; // 'vertical' | 'horizontal' (barras apiladas)
  let view = 'barplot';        // 'barplot' | 'alluvial' | 'biomarkers'
  let qThresh = 0.05;          // umbral q (BH) de la vista de biomarcadores
  let bmScore = 'cliffs';      // 'cliffs' | 'lda' — qué score manda en el gráfico y el orden por defecto
  let bmSort = { key: 'delta', dir: 'desc' };
  let editor = null;
  let alluvialNodeWidth = 20;
  let alluvialNodeGap = 2;
  let alluvialLinkOpacity = 0.4;
  let chartFontFamily = 'var(--font-body)';
  let chartIsBold = false;
  let chartIsItalic = false;
  let chartFontSize = 13;
  let seriesColorOverrides = {};
  let openTaxaChartEditor = () => {};

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

    // pestañas: Barplot (Barras clásicas) | Flujos (Aluvial) | Biomarcadores
    const tabs = document.createElement('div');
    tabs.className = 'ql-tabs';
    [['barplot', t('barplots.tabBarplot')], ['alluvial', t('barplots.tabAlluvial')], ['biomarkers', t('barplots.tabBiomarkers')]].forEach(([v, label]) => {
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

    const chartHeader = document.createElement('div');
    chartHeader.className = 'ql-chart-header';
    const noteP = document.createElement('p');
    noteP.className = 'ql-panel-note';
    noteP.style.margin = '0';
    noteP.textContent = (view === 'alluvial' ? t('barplots.alluvialNote') : t('barplots.chartNote'));
    chartHeader.appendChild(noteP);

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'ql-btn ql-btn-sm ql-btn-settings';
    settingsBtn.title = t('barplots.settingsBtnTitle');
    settingsBtn.setAttribute('aria-label', t('barplots.settingsBtnTitle'));
    settingsBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> <span>' + t('barplots.settingsBtn') + '</span>';
    if (view !== 'alluvial') {
      settingsBtn.style.display = 'none';
    }
    settingsBtn.addEventListener('click', () => {
      openTaxaChartEditor();
    });
    chartHeader.appendChild(settingsBtn);
    chartPanel.appendChild(chartHeader);

    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap scroll-x';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': view === 'alluvial' ? t('barplots.alluvialFigTitle') : t('a11y.chartBarplot') });
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

    // Selector de tipo de visualización (Barras clásicas | Flujos Aluvial)
    const typeField = document.createElement('div');
    typeField.className = 'ql-field';
    typeField.innerHTML = '<label>' + t('barplots.chartType') + '</label>';
    const typeSeg = document.createElement('div');
    typeSeg.className = 'ql-segmented';
    [['barplot', t('barplots.chartTypeBars')], ['alluvial', t('barplots.chartTypeAlluvial')]].forEach(([v, lbl]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ql-seg-btn' + (view === v ? ' is-on' : '');
      b.textContent = lbl;
      b.addEventListener('click', () => { if (view !== v) { view = v; paint(); } });
      typeSeg.appendChild(b);
    });
    typeField.appendChild(typeSeg);
    controls.appendChild(typeField);

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
    topField.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
      '<label for="qlTopNr" style="margin:0;">' + t('barplots.topNLabel') + '</label>' +
      '<span id="qlTopNVal" class="ql-badge">' + topN + '</span>' +
      '</div>' +
      '<div class="ql-inputrow">' +
      '<input type="range" id="qlTopNr" min="' + TOP_N_MIN + '" max="' + TOP_N_MAX + '" step="1" value="' + topN + '" style="flex:1;" />' +
      '<input type="number" id="qlTopN" class="ql-num-small tabular" min="' + TOP_N_MIN + '" max="' + TOP_N_MAX + '" step="1" value="' + topN + '" /></div>' +
      '<p class="ql-field-help">' + t('barplots.topNHelp') + '</p>';
    controls.appendChild(topField);

    const minAbundField = document.createElement('div');
    minAbundField.className = 'ql-field';
    minAbundField.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
      '<label for="qlMinAbundR" style="margin:0;">' + t('barplots.minAbundLabel') + '</label>' +
      '<span id="qlMinAbundVal" class="ql-badge">' + minAbundance + '%</span>' +
      '</div>' +
      '<div class="ql-inputrow">' +
      '<input type="range" id="qlMinAbundR" min="' + MIN_ABUND_MIN + '" max="' + MIN_ABUND_MAX + '" step="0.5" value="' + minAbundance + '" style="flex:1;" />' +
      '<input type="number" id="qlMinAbund" class="ql-num-small tabular" min="' + MIN_ABUND_MIN + '" max="' + MIN_ABUND_MAX + '" step="0.5" value="' + minAbundance + '" /></div>' +
      '<p class="ql-field-help">' + t('barplots.minAbundHelp') + '</p>';
    controls.appendChild(minAbundField);

    const prevField = document.createElement('div');
    prevField.className = 'ql-field';
    prevField.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
      '<label for="qlPrevR" style="margin:0;">' + t('barplots.prevLabel') + '</label>' +
      '<span id="qlPrevVal" class="ql-badge">' + minPrev + '%</span>' +
      '</div>' +
      '<div class="ql-inputrow">' +
      '<input type="range" id="qlPrevR" min="0" max="100" step="5" value="' + minPrev + '" style="flex:1;" />' +
      '<input type="number" id="qlPrev" class="ql-num-small tabular" min="0" max="100" step="5" value="' + minPrev + '" /></div>' +
      '<p class="ql-field-help">' + t('barplots.prevHelp') + '</p>';
    controls.appendChild(prevField);

    if (view === 'barplot') {
      const orientField = document.createElement('div');
      orientField.className = 'ql-field';
      orientField.innerHTML = '<label>' + t('barplots.orientLabel') + '</label>';
      const orientSeg = document.createElement('div');
      orientSeg.className = 'ql-segmented';
      [['vertical', t('barplots.orientVertical')], ['horizontal', t('barplots.orientHorizontal')]].forEach(([v, lbl]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ql-seg-btn' + (orientation === v ? ' is-on' : '');
        b.textContent = lbl;
        b.addEventListener('click', () => { if (orientation !== v) { orientation = v; paint(); } });
        orientSeg.appendChild(b);
      });
      orientField.appendChild(orientSeg);
      orientField.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('barplots.orientHelp') + '</p>');
      controls.appendChild(orientField);
    }

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

    // ---- tabla ----
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    container.appendChild(tableCard);

    levelSelect.addEventListener('change', () => { level = levelSelect.value; paint(); });

    let rafId = null;
    function scheduleRender() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        renderChartAndTable();
      });
    }

    {
      const nInput = topField.querySelector('#qlTopN');
      const rInput = topField.querySelector('#qlTopNr');
      const valBadge = topField.querySelector('#qlTopNVal');
      const sync = (v, full) => {
        const nv = Math.max(TOP_N_MIN, Math.min(TOP_N_MAX, parseInt(v, 10) || TOP_N_DEFAULT));
        topN = nv;
        nInput.value = nv;
        rInput.value = nv;
        if (valBadge) valBadge.textContent = nv;
        if (full) {
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          renderChartAndTable();
        } else {
          scheduleRender();
        }
      };
      rInput.addEventListener('input', () => sync(rInput.value, false));
      rInput.addEventListener('change', () => sync(rInput.value, true));
      nInput.addEventListener('input', () => sync(nInput.value, false));
      nInput.addEventListener('change', () => sync(nInput.value, true));
    }

    {
      const nInput = minAbundField.querySelector('#qlMinAbund');
      const rInput = minAbundField.querySelector('#qlMinAbundR');
      const valBadge = minAbundField.querySelector('#qlMinAbundVal');
      const sync = (v, full) => {
        const nv = Math.max(MIN_ABUND_MIN, Math.min(MIN_ABUND_MAX, parseFloat(v) || 0));
        minAbundance = nv;
        nInput.value = nv;
        rInput.value = nv;
        if (valBadge) valBadge.textContent = nv + '%';
        if (full) {
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          renderChartAndTable();
        } else {
          scheduleRender();
        }
      };
      rInput.addEventListener('input', () => sync(rInput.value, false));
      rInput.addEventListener('change', () => sync(rInput.value, true));
      nInput.addEventListener('input', () => sync(nInput.value, false));
      nInput.addEventListener('change', () => sync(nInput.value, true));
    }

    {
      const nInput = prevField.querySelector('#qlPrev');
      const rInput = prevField.querySelector('#qlPrevR');
      const valBadge = prevField.querySelector('#qlPrevVal');
      const sync = (v, full) => {
        const nv = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
        minPrev = nv;
        nInput.value = nv;
        rInput.value = nv;
        if (valBadge) valBadge.textContent = nv + '%';
        if (full) {
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          renderChartAndTable();
        } else {
          scheduleRender();
        }
      };
      rInput.addEventListener('input', () => sync(rInput.value, false));
      rInput.addEventListener('change', () => sync(rInput.value, true));
      nInput.addEventListener('input', () => sync(nInput.value, false));
      nInput.addEventListener('change', () => sync(nInput.value, true));
    }

    function renderChartAndTable() {
      if (editor) { editor.destroy(); editor = null; }
      const grouped = groupTaxaByAbundance(table, minAbundance, topN, { minPrev, isPercentage: true });
      const { topTaxa, otherTaxa, preAggOtherHeaders, series, means, hasOther } = grouped;
      const colorsRepeat = topTaxa.length > CAT_VARS.length;

      const pageSub = header.querySelector('.ql-page-sub');
      if (pageSub) {
        pageSub.textContent = t('barplots.subtitle', { n: topTaxa.length });
      }

      tableCard.innerHTML = '<h2>' + (view === 'alluvial' ? t('barplots.tableAlluvialTitle') : t('barplots.tableTitle')) + '</h2>';
      if (minPrev > 0) {
        const eligible = means.filter((m) => m.prev * 100 >= minPrev);
        const belowPrev = means.length - eligible.length;
        tableCard.insertAdjacentHTML('beforeend',
          '<p class="ql-field-help" style="margin-top:0">' +
          t('barplots.prevApplied', { pct: minPrev, n: belowPrev, total: means.length }) + '</p>');
      }

      const sampleKey = table.headers[0];
      const OTHER_COL_RE = /^(others?|otros?|resto)$/i;
      const taxonHeaders = table.headers.filter((h, i) => i !== 0 && !OTHER_COL_RE.test(String(h).trim()));

      const rowSum = (row) =>
        taxonHeaders.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0) +
        preAggOtherHeaders.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0);
      const otherRaw = (row) =>
        otherTaxa.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0) +
        preAggOtherHeaders.reduce((a, h) => a + (parseFloat(row[h]) || 0), 0);

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

    if (view === 'alluvial') {
      const resolveGroup = (sortByGroup && groupCol && state.metadata)
        ? (sampleId) => groupBySample[sampleId]
        : null;

      const groupMatrixData = computeGroupTaxaMatrix(
        table.rows,
        sampleKey,
        taxonHeaders,
        resolveGroup,
        { preAggOtherHeaders, otherTaxa }
      );

      if (groupMatrixData.groups.length < 2) {
        const msg = document.createElement('p');
        msg.className = 'ql-field-help';
        msg.style.padding = '36px 16px';
        msg.style.textAlign = 'center';
        msg.textContent = t('barplots.alluvialNeedGroups');
        chartWrap.appendChild(msg);
        return;
      }

      let W = 680;
      let H = 450;
      let customChartTitle = null;
      let customXTitle = null;
      let customYTitle = null;

      function drawAlluvialSvg() {
        const legCols = series.length > 13 ? 3 : series.length > 6 ? 2 : 1;
        const legRows = Math.ceil(series.length / legCols);
        const colorsRepeat = topTaxa.length > CAT_VARS.length;

        const marginL = 56, marginR = 36, marginT = 44;
        const usableH = 340;
        const numG = groupMatrixData.groups.length;
        const colStep = Math.max(120, Math.min(240, 800 / Math.max(numG - 1, 1)));
        W = Math.max(680, marginL + marginR + (numG - 1) * colStep + 30);
        const axisGap = 54;
        const marginB = axisGap + 16 + legRows * 15 + (colorsRepeat ? 20 : 4);
        H = marginT + usableH + marginB;

        const layout = computeAlluvialLayout(
          {
            groups: groupMatrixData.groups,
            taxa: series,
            matrix: groupMatrixData.matrix,
            sampleCounts: groupMatrixData.sampleCounts,
          },
          {
            width: W,
            height: marginT + usableH + 30,
            margin: { top: marginT, right: marginR, bottom: 30, left: marginL },
            nodeWidth: alluvialNodeWidth,
            nodeGap: alluvialNodeGap,
          }
        );

        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        svg.style.width = W + 'px';
        svg.style.maxWidth = 'none';
        svg.style.fontFamily = chartFontFamily;
        if (chartIsBold) svg.style.fontWeight = 'bold';
        else svg.style.removeProperty('font-weight');
        if (chartIsItalic) svg.style.fontStyle = 'italic';
        else svg.style.removeProperty('font-style');
        if (chartFontSize) svg.style.fontSize = chartFontSize + 'px';
        else svg.style.removeProperty('font-size');

        const existingTitle = svg.querySelector('.ce-title');
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        // Líneas de referencia del eje Y (0%, 25%, 50%, 75%, 100%)
        [0, 0.25, 0.5, 0.75, 1].forEach((frac) => {
          const y = marginT + usableH - frac * usableH;
          svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, class: 'ql-gridline' }));
          const tk = svgEl('text', { x: marginL - 8, y: y + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
          tk.textContent = Math.round(frac * 100) + '%';
          svg.appendChild(tk);
        });
        svg.appendChild(svgEl('line', { x1: marginL, x2: marginL, y1: marginT, y2: marginT + usableH, class: 'ql-baseline-line' }));

        // Título eje Y
        const yTitle = svgEl('text', {
          x: 15, y: marginT + usableH / 2, class: 'ql-axis-label ql-chart-y-title', 'text-anchor': 'middle',
          transform: 'rotate(-90 15 ' + (marginT + usableH / 2) + ')', 'data-ce': 'ytitle',
        });
        yTitle.textContent = customYTitle !== null ? customYTitle : t('barplots.axisPct');
        svg.appendChild(yTitle);

        // Resaltado interactivo de linaje (hover: 100% activo, 10% el resto)
        const highlightTaxon = (taxonKey) => {
          svg.classList.add('is-highlighting');
          svg.querySelectorAll('[data-taxon-key]').forEach((el) => {
            el.classList.toggle('is-highlighted', el.getAttribute('data-taxon-key') === taxonKey);
          });
        };

        const clearHighlight = () => {
          svg.classList.remove('is-highlighting');
          svg.querySelectorAll('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
          tooltip.classList.remove('is-show');
        };

        // Enlaces (flujos aluviales Bézier)
        const linksG = svgEl('g', { class: 'ql-alluvial-links' });
        layout.links.forEach((link) => {
          const fillCol = (link.taxonKey === '__other__') ? OTHER_COLOR : (seriesColorOverrides[link.taxonKey] || (link.colorVar ? 'var(' + link.colorVar + ')' : '#2a78d6'));
          const path = svgEl('path', {
            d: link.d,
            class: 'ql-alluvial-link',
            fill: fillCol,
            style: 'fill-opacity: ' + alluvialLinkOpacity + ';',
            'data-taxon-key': link.taxonKey,
            ...(link.taxonKey === '__other__' ? {} : { 'data-ce-series-fill': 's' + CAT_VARS.indexOf(link.colorVar) }),
          });
          path.addEventListener('mouseenter', () => {
            highlightTaxon(link.taxonKey);
            const midY = (link.y0 + link.h0 / 2 + link.y1 + link.h1 / 2) / 2;
            const detail = '<strong>' + escapeHtml(link.taxonLabel) + '</strong><br>' +
              escapeHtml(link.sourceGroup) + ': ' + (link.sourceFraction * 100).toFixed(1) + '% &rarr; ' +
              escapeHtml(link.targetGroup) + ': ' + (link.targetFraction * 100).toFixed(1) + '%';
            showAlluvialTooltip(link.taxonLabel, detail, link.cx, midY, chartWrap, svg, W, H, tooltip);
          });
          path.addEventListener('mouseleave', clearHighlight);
          linksG.appendChild(path);
        });
        svg.appendChild(linksG);

        // Nodos (bloques apilados en cada columna)
        const nodesG = svgEl('g', { class: 'ql-alluvial-nodes' });
        layout.nodes.forEach((node) => {
          if (node.height <= 0) return;
          const fillCol = (node.taxonKey === '__other__') ? OTHER_COLOR : (seriesColorOverrides[node.taxonKey] || (node.colorVar ? 'var(' + node.colorVar + ')' : '#2a78d6'));
          const rect = svgEl('rect', {
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            rx: 2,
            class: 'ql-alluvial-node',
            fill: fillCol,
            'data-taxon-key': node.taxonKey,
            ...(node.taxonKey === '__other__' ? {} : { 'data-ce-series-fill': 's' + CAT_VARS.indexOf(node.colorVar) }),
          });
          rect.addEventListener('mouseenter', () => {
            highlightTaxon(node.taxonKey);
            const detail = '<strong>' + escapeHtml(node.taxonLabel) + '</strong><br>' +
              escapeHtml(node.group) + ': ' + (node.fraction * 100).toFixed(1) + '%';
            showAlluvialTooltip(node.taxonLabel, detail, node.x + node.width / 2, node.y, chartWrap, svg, W, H, tooltip);
          });
          rect.addEventListener('mouseleave', clearHighlight);
          nodesG.appendChild(rect);
        });
        svg.appendChild(nodesG);

        // Etiquetas de columnas (grupos) y tamaño muestral (n)
        layout.columns.forEach((col) => {
          const cx = col.x + col.width / 2;
          const gt = svgEl('text', {
            x: cx,
            y: marginT + usableH + 18,
            class: 'ql-tick-label',
            'text-anchor': 'middle',
            'font-weight': '600',
          });
          gt.textContent = col.group;
          svg.appendChild(gt);

          if (col.sampleCount > 0) {
            const nt = svgEl('text', {
              x: cx,
              y: marginT + usableH + 32,
              class: 'ql-tick-label',
              'text-anchor': 'middle',
              fill: 'var(--ink-muted)',
            });
            nt.textContent = 'n = ' + col.sampleCount;
            svg.appendChild(nt);
          }
        });

        // Título eje X
        const xLabelBase = marginT + usableH + 48;
        const xTitle = svgEl('text', {
          x: marginL + (W - marginL - marginR) / 2,
          y: xLabelBase,
          class: 'ql-axis-label ql-chart-x-title',
          'text-anchor': 'middle',
          'data-ce': 'xtitle',
        });
        xTitle.textContent = customXTitle !== null ? customXTitle : ((sortByGroup && groupCol) ? t('barplots.axisSamplesBy', { col: groupCol }) : t('barplots.alluvialAxisGroups'));
        svg.appendChild(xTitle);

        if (customChartTitle !== null) {
          const mainTitle = svg.querySelector('.ql-chart-main-title, .ce-title, [data-ce="title"]');
          if (mainTitle) mainTitle.textContent = customChartTitle;
        }

        // Leyenda integrada en SVG
        const legTranslateX = marginL;
        const legTranslateY = xLabelBase + 18;
        const legG = svgEl('g', { 'data-ce': 'legend' });
        const colW = Math.min(260, Math.max(150, (W - legTranslateX - 12) / legCols));
        series.forEach((s, i) => {
          const col = Math.floor(i / legRows), rw = i % legRows;
          const xx = col * colW, yy = rw * 15;
          const itemG = svgEl('g', { class: 'ql-alluvial-leg-item', style: 'cursor:pointer;', 'data-taxon-key': s.key });
          const fillCol = (s.key === '__other__') ? OTHER_COLOR : (seriesColorOverrides[s.key] || (s.colorVar ? 'var(' + s.colorVar + ')' : '#2a78d6'));
          itemG.appendChild(svgEl('rect', {
            x: xx, y: yy - 8, width: 10, height: 10, rx: 2, fill: fillCol,
            ...(s.key === '__other__' ? {} : { 'data-ce-series-fill': 's' + CAT_VARS.indexOf(s.colorVar) }),
          }));
          const lt = svgEl('text', { x: xx + 15, y: yy, class: 'ql-tick-label' });
          lt.textContent = s.label;
          itemG.appendChild(lt);
          itemG.addEventListener('mouseenter', () => highlightTaxon(s.key));
          itemG.addEventListener('mouseleave', clearHighlight);
          legG.appendChild(itemG);
        });
        if (colorsRepeat) {
          const nt = svgEl('text', { x: 0, y: legRows * 15 + 4, class: 'ql-tick-label' });
          nt.setAttribute('fill', 'var(--ink-muted)');
          nt.textContent = t('barplots.colorsRepeat');
          legG.appendChild(nt);
        }
        legG.setAttribute('transform', 'translate(' + legTranslateX + ', ' + legTranslateY + ')');
        svg.appendChild(legG);

        if (existingTitle) {
          svg.appendChild(existingTitle);
        }

        // Si el editor ya existía, sincronizar cambios en caliente
        if (editor && editor.sync) {
          editor.sync();
        }
      }

      openTaxaChartEditor = () => {
        const configOptions = {
          title: t('chartEditor.title') || 'Ajustes de la figura',
          typography: {
            fontFamily: chartFontFamily,
            isBold: chartIsBold,
            isItalic: chartIsItalic,
            fontSize: chartFontSize,
          },
          colors: {
            series: series.map((s) => ({
              id: s.key,
              label: s.label,
              color: (s.key === '__other__') ? OTHER_COLOR : (seriesColorOverrides[s.key] || (s.colorVar ? resolveVarHex(s.colorVar) : '#2a78d6')),
            })),
            linkOpacity: alluvialLinkOpacity,
          },
          geometry: {
            sliders: [
              {
                id: 'nodeWidth',
                label: t('chartEditor.nodeWidth') || 'Ancho de los nodos/barras',
                min: 6,
                max: 60,
                step: 2,
                value: alluvialNodeWidth,
                unit: 'px',
              },
              {
                id: 'nodeGap',
                label: t('chartEditor.nodeGap') || 'Separación entre nodos',
                min: 0,
                max: 15,
                step: 1,
                value: alluvialNodeGap,
                unit: 'px',
              },
              {
                id: 'linkOpacity',
                label: t('chartEditor.linkOpacity') || 'Opacidad de los flujos',
                min: 0.1,
                max: 0.95,
                step: 0.05,
                value: alluvialLinkOpacity,
                isPercent: true,
              },
            ],
          },
        };

        openChartEditor(svg, configOptions, (action, payload) => {
          if (action === 'nodeWidth') {
            alluvialNodeWidth = Number(payload);
          } else if (action === 'nodeGap') {
            alluvialNodeGap = Number(payload);
          } else if (action === 'linkOpacity') {
            alluvialLinkOpacity = Number(payload);
          } else if (action === 'fontFamily') {
            chartFontFamily = String(payload);
          } else if (action === 'isBold') {
            chartIsBold = Boolean(payload);
          } else if (action === 'isItalic') {
            chartIsItalic = Boolean(payload);
          } else if (action === 'fontSize') {
            chartFontSize = Number(payload);
          } else if (action === 'seriesColor') {
            if (payload && payload.id) {
              seriesColorOverrides[payload.id] = payload.color;
            }
          } else if (action === 'title') {
            customChartTitle = String(payload);
          } else if (action === 'xtitle') {
            customXTitle = String(payload);
          } else if (action === 'ytitle') {
            customYTitle = String(payload);
          } else if (action === 'reset') {
            alluvialNodeWidth = 20;
            alluvialNodeGap = 2;
            alluvialLinkOpacity = 0.4;
            chartFontFamily = 'var(--font-body)';
            chartIsBold = false;
            chartIsItalic = false;
            chartFontSize = 13;
            seriesColorOverrides = {};
            customChartTitle = null;
            customXTitle = null;
            customYTitle = null;
          }
          drawAlluvialSvg();
        });
      };

      drawAlluvialSvg();

      // Editor de gráfico
      if (editor) editor.destroy();
      editor = attachChartEditor({
        key: 'taxaBarplot-alluvial', svg, mount: chartPanel, filename: t('barplots.alluvialFigTitle'), lang: getLang(),
        elements: [
          { id: 'title', create: { text: t('barplots.alluvialFigTitle'), x: W / 2, y: 24, anchor: 'middle', cls: 'ce-title ql-chart-main-title' } },
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

      // Tabla de abundancia relativa media por grupo
      const scrollDiv = document.createElement('div');
      scrollDiv.className = 'ql-table-scroll scroll-x';
      const tbl = document.createElement('table');
      tbl.className = 'ql-table';
      const thead = document.createElement('thead');
      const groupColLabel = (sortByGroup && groupCol) ? groupCol : t('barplots.axisSamples');
      thead.innerHTML = '<tr><th><button type="button">' + escapeHtml(groupColLabel) + '</button></th>' +
        '<th><button type="button">' + t('barplots.colSamplesCount') + '</button></th>' +
        series.map((s) => '<th><button type="button">' + escapeHtml(s.label) + '</button></th>').join('') + '</tr>';
      tbl.appendChild(thead);
      const tbody = document.createElement('tbody');
      groupMatrixData.groups.forEach((g) => {
        const gVals = groupMatrixData.matrix[g] || {};
        const count = groupMatrixData.sampleCounts[g] || 0;
        const tr = document.createElement('tr');
        let cells = '<td><strong>' + escapeHtml(g) + '</strong></td>' +
          '<td class="ql-num tabular">' + count + '</td>';
        series.forEach((s) => {
          const val = gVals[s.key] || 0;
          cells += '<td class="ql-num tabular">' + (val * 100).toFixed(1) + '%</td>';
        });
        tr.innerHTML = cells;
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      scrollDiv.appendChild(tbl);
      tableCard.appendChild(scrollDiv);
    } else {
      // chart
      const legCols = series.length > 13 ? 3 : series.length > 6 ? 2 : 1;
      const legRows = Math.ceil(series.length / legCols);
      const horizontal = orientation === 'horizontal';
    const gap = 2; // separador entre segmentos apilados
    let W, H, xLabelBase, legTranslateX, legTranslateY;

    if (!horizontal) {
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
      W = Math.max(marginL + marginR + slotW * sampleOrder.length, 420);
      H = marginT + innerH + marginB;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.style.width = W + 'px'; // ancho real en px: si no caben todas las muestras, el contenedor hace scroll horizontal en vez de aplastar las barras
      svg.style.maxWidth = 'none';
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      // gridlines y-axis (0/25/50/75/100 %)
      [0, 0.25, 0.5, 0.75, 1].forEach((frac) => {
        const y = marginT + innerH - frac * innerH;
        svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, class: 'ql-gridline' }));
        const tk = svgEl('text', { x: marginL - 8, y: y + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
        tk.textContent = Math.round(frac * 100) + '%';
        svg.appendChild(tk);
      });
      svg.appendChild(svgEl('line', { x1: marginL, x2: marginL, y1: marginT, y2: marginT + innerH, class: 'ql-baseline-line' }));

      sampleOrder.forEach((sampleId, si) => {
        const row = rowsBySample[sampleId];
        if (!row) return;
        const cx = marginL + si * slotW + slotW / 2;
        const total = rowSum(row) || 1;
        let cumulative = 0;
        series.forEach((s) => {
          let val;
          if (s.key === '__other__') val = otherRaw(row) / total;
          else val = (parseFloat(row[s.key]) || 0) / total;
          if (val <= 0) return;
          const yTop = marginT + innerH - (cumulative + val) * innerH;
          const yBot = marginT + innerH - cumulative * innerH;
          const h = Math.max(0, yBot - yTop - gap);
          const fillCol = (s.key === '__other__') ? OTHER_COLOR : (seriesColorOverrides[s.key] || (s.colorVar ? 'var(' + s.colorVar + ')' : '#2a78d6'));
          const rect = svgEl('rect', {
            x: cx - barW / 2, y: yTop, width: barW, height: Math.max(h, 0),
            fill: fillCol,
            'data-sample': sampleId,
            'data-tax': s.label,
            'data-val': val,
            'data-cx': cx,
            'data-cy': yTop,
            ...(s.key === '__other__' ? {} : { 'data-ce-series-fill': 's' + CAT_VARS.indexOf(s.colorVar) }),
          });
          svg.appendChild(rect);
          cumulative += val;
        });
      });

      // etiquetas eje X (rotadas si hay muchas muestras)
      sampleOrder.forEach((sampleId, si) => {
        if (si % showEvery !== 0) return;
        const cx = marginL + si * slotW + slotW / 2;
        const tx = svgEl('text', {
          x: cx, y: marginT + innerH + 16, class: 'ql-tick-label', 'text-anchor': 'end',
          transform: 'rotate(-55 ' + cx + ' ' + (marginT + innerH + 16) + ')',
        });
        tx.textContent = sampleId;
        svg.appendChild(tx);
      });

      xLabelBase = marginT + innerH + xTitleGap; // bajo las etiquetas de muestra rotadas
      const xTitle = svgEl('text', { x: marginL + (W - marginL - marginR) / 2, y: xLabelBase, class: 'ql-axis-label ql-chart-x-title', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
      xTitle.textContent = groupCol ? t('barplots.axisSamplesBy', { col: groupCol }) : t('barplots.axisSamples');
      svg.appendChild(xTitle);

      const yTitle = svgEl('text', {
        x: 15, y: marginT + innerH / 2, class: 'ql-axis-label ql-chart-y-title', 'text-anchor': 'middle',
        transform: 'rotate(-90 15 ' + (marginT + innerH / 2) + ')', 'data-ce': 'ytitle',
      });
      yTitle.textContent = t('barplots.axisPct');
      svg.appendChild(yTitle);

      legTranslateX = marginL; legTranslateY = xLabelBase + 18;
    } else {
      // ---- orientación horizontal: una fila por muestra, sin rotar
      // etiquetas — pensada para muchas muestras con nombres largos, que en
      // vertical solo cabían rotadas -55°. ----
      const maxLabelChars = sampleOrder.reduce((m, s) => Math.max(m, String(s).length), 0);
      const labelW = Math.min(200, maxLabelChars * 6.3);
      const axisTitleGap = 26;
      const marginL = axisTitleGap + labelW + 14, marginR = 16, marginT = 42;
      const rowH = Math.max(16, Math.min(34, 480 / Math.max(sampleOrder.length, 1)));
      const barH = Math.min(22, rowH * 0.72);
      const innerW = 420;
      const innerCat = rowH * sampleOrder.length;
      const marginB = 14 + 22 + legRows * 15 + (colorsRepeat ? 20 : 4);
      W = Math.max(marginL + innerW + marginR, 420);
      H = marginT + innerCat + marginB;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.style.width = ''; // el ancho es fijo (el eje de valor); solo la altura crece con el nº de muestras
      svg.style.maxWidth = '';
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      // gridlines eje de valor (0/25/50/75/100 %), arriba de las barras
      [0, 0.25, 0.5, 0.75, 1].forEach((frac) => {
        const x = marginL + frac * innerW;
        svg.appendChild(svgEl('line', { x1: x, x2: x, y1: marginT, y2: marginT + innerCat, class: 'ql-gridline' }));
        const tk = svgEl('text', { x, y: marginT - 8, class: 'ql-tick-label', 'text-anchor': 'middle' });
        tk.textContent = Math.round(frac * 100) + '%';
        svg.appendChild(tk);
      });
      svg.appendChild(svgEl('line', { x1: marginL, x2: marginL, y1: marginT, y2: marginT + innerCat, class: 'ql-baseline-line' }));

      sampleOrder.forEach((sampleId, si) => {
        const row = rowsBySample[sampleId];
        if (!row) return;
        const cy = marginT + si * rowH + rowH / 2;
        const total = rowSum(row) || 1;
        let cumulative = 0;
        series.forEach((s) => {
          let val;
          if (s.key === '__other__') val = otherRaw(row) / total;
          else val = (parseFloat(row[s.key]) || 0) / total;
          if (val <= 0) return;
          const xL = marginL + cumulative * innerW;
          const xR = marginL + (cumulative + val) * innerW;
          const w = Math.max(0, xR - xL - gap);
          const fillCol = (s.key === '__other__') ? OTHER_COLOR : (seriesColorOverrides[s.key] || (s.colorVar ? 'var(' + s.colorVar + ')' : '#2a78d6'));
          const rect = svgEl('rect', {
            x: xL, y: cy - barH / 2, width: Math.max(w, 0), height: barH,
            fill: fillCol,
            'data-sample': sampleId,
            'data-tax': s.label,
            'data-val': val,
            'data-cx': xR,
            'data-cy': cy,
            ...(s.key === '__other__' ? {} : { 'data-ce-series-fill': 's' + CAT_VARS.indexOf(s.colorVar) }),
          });
          svg.appendChild(rect);
          cumulative += val;
        });
      });

      // etiquetas de muestra: normales, a la izquierda — el motivo del modo horizontal
      sampleOrder.forEach((sampleId, si) => {
        const cy = marginT + si * rowH + rowH / 2;
        const tx = svgEl('text', { x: marginL - 8, y: cy + 4, class: 'ql-tick-label', 'text-anchor': 'end' });
        tx.textContent = sampleId;
        svg.appendChild(tx);
      });

      xLabelBase = marginT + innerCat + 34;
      const xTitle = svgEl('text', { x: marginL + innerW / 2, y: xLabelBase, class: 'ql-axis-label ql-chart-x-title', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
      xTitle.textContent = t('barplots.axisPct');
      svg.appendChild(xTitle);

      const yTitle = svgEl('text', {
        x: 15, y: marginT + innerCat / 2, class: 'ql-axis-label ql-chart-y-title', 'text-anchor': 'middle',
        transform: 'rotate(-90 15 ' + (marginT + innerCat / 2) + ')', 'data-ce': 'ytitle',
      });
      yTitle.textContent = groupCol ? t('barplots.axisSamplesBy', { col: groupCol }) : t('barplots.axisSamples');
      svg.appendChild(yTitle);

      legTranslateX = marginL; legTranslateY = xLabelBase + 18;
    }

    // leyenda dentro del SVG (editable + exportable), 1-3 columnas — común a las dos orientaciones
    const legG = svgEl('g', { 'data-ce': 'legend' });
    const colW = Math.min(260, Math.max(150, (W - legTranslateX - 12) / legCols));
    series.forEach((s, i) => {
      const col = Math.floor(i / legRows), rw = i % legRows;
      const xx = col * colW, yy = rw * 15;
      const fillCol = (s.key === '__other__') ? OTHER_COLOR : (seriesColorOverrides[s.key] || (s.colorVar ? 'var(' + s.colorVar + ')' : '#2a78d6'));
      legG.appendChild(svgEl('rect', {
        x: xx, y: yy - 8, width: 10, height: 10, rx: 2, fill: fillCol,
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
    legG.setAttribute('transform', 'translate(' + legTranslateX + ',' + legTranslateY + ')');
    svg.appendChild(legG);

    svg.addEventListener('pointerover', (e) => {
      const target = e.target;
      if (!target || !target.getAttribute) return;
      const sample = target.getAttribute('data-sample');
      const tax = target.getAttribute('data-tax');
      if (!sample || !tax) return;
      const val = parseFloat(target.getAttribute('data-val')) || 0;
      const cx = parseFloat(target.getAttribute('data-cx')) || 0;
      const cy = parseFloat(target.getAttribute('data-cy')) || 0;
      showTooltip(sample, tax, val, cx, cy, chartWrap, svg, W, H, tooltip);
    });
    svg.addEventListener('pointerout', (e) => {
      const target = e.target;
      if (!target || !target.getAttribute || !target.getAttribute('data-sample')) return;
      const rel = e.relatedTarget;
      if (rel && rel.getAttribute && rel.getAttribute('data-sample')) return;
      tooltip.classList.remove('is-show');
    });

    if (editor) editor.destroy();
    editor = attachChartEditor({
      key: horizontal ? 'taxaBarplot-horizontal' : 'taxaBarplot', svg, mount: chartPanel, filename: t('barplots.title'), lang: getLang(),
      elements: [
        { id: 'title', create: { text: t('barplots.chartFigTitle'), x: W / 2, y: 24, anchor: 'middle', cls: 'ce-title ql-chart-main-title' } },
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
    }

    renderChartAndTable();
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

    // score del gráfico: δ de Cliff (no asume normalidad) o LDA bootstrapeado
    // (el nombre que la gente espera de "LEfSe") — las dos quedan siempre
    // visibles en la tabla; este selector solo decide cuál manda en la
    // longitud de las barras y el orden por defecto.
    const scoreField = document.createElement('div');
    scoreField.className = 'ql-field';
    scoreField.innerHTML = '<label>' + t('barplots.bmScoreLabel') + '</label>';
    const scoreSeg = document.createElement('div');
    scoreSeg.className = 'ql-segmented';
    [['cliffs', t('barplots.bmScoreCliffs')], ['lda', t('barplots.bmScoreLda')]].forEach(([v, lbl]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ql-seg-btn' + (bmScore === v ? ' is-on' : '');
      b.textContent = lbl;
      b.addEventListener('click', () => { if (bmScore !== v) { bmScore = v; bmSort = { key: v === 'lda' ? 'ldaScore' : 'delta', dir: 'desc' }; paint(); } });
      scoreSeg.appendChild(b);
    });
    scoreField.appendChild(scoreSeg);
    scoreField.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + (bmScore === 'lda' ? t('barplots.bmScoreLdaHelp') : t('barplots.bmScoreCliffsHelp')) + '</p>');
    controls.appendChild(scoreField);

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

    // --- significativos: grupo enriquecido (mediana más alta) + dos scores
    // de tamaño de efecto, calculados los dos siempre (no uno u otro):
    // delta de Cliff (one-vs-rest, no asume normalidad) y el LDA univariante
    // bootstrapeado al estilo LEfSe (one-vs-rest, mismo split). ---
    const sig = tested.filter((x) => x.q < qThresh).map((x) => {
      const medians = x.perGroup.map((arr) => quartiles(arr.slice().sort((a, b) => a - b)).median);
      let bi = 0;
      for (let i = 1; i < medians.length; i++) if (medians[i] > medians[bi]) bi = i;
      const inGroup = x.perGroup[bi];
      const rest = x.perGroup.filter((_, i) => i !== bi).flat();
      const lda = lefseLdaScore(inGroup, rest);
      return {
        ...x, enrichedGroup: groups[bi], enrichedIdx: bi,
        delta: cliffsDelta(inGroup, rest),
        ldaScore: lda.error ? null : lda.score,
      };
    });
    const scoreOf = (x) => (bmScore === 'lda' ? x.ldaScore : x.delta);
    sig.sort((a, b) => Math.abs(scoreOf(b) ?? -Infinity) - Math.abs(scoreOf(a) ?? -Infinity));
    const ldaMissing = sig.filter((x) => x.ldaScore == null).length;

    chartPanel.insertAdjacentHTML('beforeend',
      '<p class="ql-field-help" style="margin-top:6px;">' +
      t('barplots.bmCount', { n: sig.length, total: tested.length, q: qThresh }) + '</p>');
    if (bmScore === 'lda' && ldaMissing > 0) {
      chartPanel.insertAdjacentHTML('beforeend',
        '<p class="ql-field-help">' + t('barplots.bmLdaMissing', { n: ldaMissing }) + '</p>');
    }

    // --- gráfico: barras horizontales tipo LEfSe ---
    const sigForChart = bmScore === 'lda' ? sig.filter((x) => x.ldaScore != null) : sig;
    drawBiomarkerBars(svg, chartPanel, chartWrap, tooltip, sigForChart, groups, bmScore);

    // --- tabla ordenable ---
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    const cols = [
      ['label', t('barplots.bmColTaxon')],
      ['enrichedGroup', t('barplots.bmColGroup')],
      ['delta', t('barplots.bmColDelta')],
      ['ldaScore', t('barplots.bmColLda')],
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
      tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ink-muted);padding:20px;">' + t('barplots.bmNone') + '</td></tr>';
    } else {
      const dir = bmSort.dir === 'asc' ? 1 : -1;
      const absSortKeys = new Set(['delta', 'ldaScore']);
      const rows = sig.slice().sort((a, b) => {
        const av = a[bmSort.key], bv = b[bmSort.key];
        if (absSortKeys.has(bmSort.key)) return ((Math.abs(av) || -Infinity) - (Math.abs(bv) || -Infinity)) * dir;
        if (typeof av === 'string') return av.localeCompare(bv) * dir;
        return (av - bv) * dir;
      });
      rows.forEach((r) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escapeHtml(r.label) + '</td>' +
          '<td><span class="ql-bm-swatch" style="background:' + groupColor(r.enrichedIdx) + '"></span>' + escapeHtml(r.enrichedGroup) + '</td>' +
          '<td class="ql-num tabular">' + r.delta.toFixed(3) + '</td>' +
          '<td class="ql-num tabular">' + (r.ldaScore == null ? '—' : r.ldaScore.toFixed(3)) + '</td>' +
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
        // por defecto: nombres y q ascendente; scores de efecto (δ, LDA) descendente
        else bmSort = { key, dir: (key === 'delta' || key === 'ldaScore') ? 'desc' : 'asc' };
        paint();
      });
    });
  }

  function drawBiomarkerBars(svg, mount, chartWrap, tooltip, sig, groups, bmScore) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (sig.length === 0) {
      svg.setAttribute('viewBox', '0 0 400 80');
      const tx = svgEl('text', { x: 200, y: 44, 'text-anchor': 'middle', class: 'ql-axis-label', fill: 'var(--ink-muted)' });
      tx.textContent = t('barplots.bmNone');
      svg.appendChild(tx);
      if (editor) { editor.destroy(); editor = null; }
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

    const scoreOf = (s) => (bmScore === 'lda' ? s.ldaScore : s.delta);
    const maxAbs = Math.max(...sig.map((s) => Math.abs(scoreOf(s))), 0.2);
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
    axT.textContent = bmScore === 'lda' ? t('barplots.bmAxisLda') : t('barplots.bmAxisDelta');
    svg.appendChild(axT);

    const barsG = svgEl('g', { 'data-ce': 'bars' });
    const labelsG = svgEl('g', { 'data-ce': 'labels' });
    sig.forEach((s, i) => {
      const y = marginT + i * rowH;
      const bh = rowH - 8;
      const sv = scoreOf(s);
      const w = Math.max(1.5, x(sv) - marginL);
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
          ' · δ = ' + s.delta.toFixed(3) + (s.ldaScore == null ? '' : ' · LDA = ' + s.ldaScore.toFixed(3)) +
          ' · q = ' + formatP(s.q) + '</div>';
        tooltip.classList.add('is-show');
      });
      rect.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
      barsG.appendChild(rect);

      const lt = svgEl('text', { x: marginL - 8, y: y + rowH / 2 + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
      lt.textContent = s.label.length > 34 ? s.label.slice(0, 33) + '…' : s.label;
      labelsG.appendChild(lt);

      const vt = svgEl('text', { x: marginL + w + 5, y: y + rowH / 2 + 3, class: 'ql-tick-label' });
      vt.textContent = sv.toFixed(2);
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

    if (editor) { editor.destroy(); editor = null; }
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

  function showAlluvialTooltip(taxonLabel, detailHtml, cx, cy, wrap, svgEl_, W, H, tooltipEl) {
    const wrapRect = wrap.getBoundingClientRect();
    const svgRect = svgEl_.getBoundingClientRect();
    const scaleX = svgRect.width / W, scaleY = svgRect.height / H;
    const left = (svgRect.left - wrapRect.left) + cx * scaleX + wrap.scrollLeft;
    const top = (svgRect.top - wrapRect.top) + cy * scaleY;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
    tooltipEl.innerHTML = '<div class="ql-tt-name">' + escapeHtml(taxonLabel) + '</div>' +
      '<div class="ql-tt-row">' + detailHtml + '</div>';
    tooltipEl.classList.add('is-show');
  }


  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  paint();
  const stop = subscribe(paint);
  return () => { stop(); if (editor) { editor.destroy(); editor = null; } };
}
