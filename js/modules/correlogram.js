// Correlograma: matriz de correlación (Pearson o Spearman) entre las
// variables numéricas que ya haya cargadas — columnas numéricas de los
// metadatos, abundancia relativa de los taxones más abundantes (mismo
// criterio "top N" que el barplot) y métricas de diversidad alfa.
//
// Dos vistas sobre el MISMO cálculo (una sola pasada de pearson/spearman):
//   · «Matriz»: mapa de calor divergente + tabla de todas las parejas.
//   · «Red»:    grafo de co-ocurrencia — nodos = variables, aristas = parejas
//               que superan los umbrales |r| y p, disposición por fuerzas
//               determinista (js/lib/forceLayout.js, semilla fija).
//
// Entrada: state.metadata + state.taxaBarplot|state.taxaCounts +
//          state.alphaDiversity (cualquier combinación; mínimo 2 variables).
// No consume datos propios: reutiliza lo que cargan los demás módulos.

import { state, subscribe } from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { pearson, spearman, formatP } from '../lib/stats.js';
import { attachChartEditor } from '../lib/chartEditor.js';
import { forceLayout } from '../lib/forceLayout.js';
import { loadExampleCommunityData, loadRealCommunityData, mountExampleButtons } from '../lib/exampleData.js';

const NET_SEED = 0x9E3779B9; // semilla fija → layout de fuerzas determinista

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOP_N_DEFAULT = 7, TOP_N_MIN = 3, TOP_N_MAX = 20;
const NUM_RE = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function shortTaxon(full) {
  const parts = String(full).split(';').map((p) => p.trim()).filter(Boolean);
  return (parts[parts.length - 1] || String(full)).replace(/^[a-z]__/i, '') || String(full);
}
const OTHER_RE = /^(others?|otros?|resto)$/i;

// muestra → valor, tolerante a sufijos en los IDs (A-1 ↔ A-1-16S-…)
function resolve(vmap, sid) {
  if (vmap.has(sid)) return vmap.get(sid);
  for (const k of vmap.keys()) {
    if (sid.startsWith(k) || k.startsWith(sid)) return vmap.get(k);
  }
  return undefined;
}

// --- recolectar variables numéricas de lo que haya en el estado ---
function collectVariables(topN) {
  const vars = [];

  // 1. columnas numéricas de los metadatos
  if (state.metadata) {
    const idKey = state.metadata.sampleIdKey;
    state.metadata.headers.filter((h) => h !== idKey).forEach((col) => {
      const vals = new Map();
      let seen = 0;
      state.metadata.rows.forEach((r) => {
        const raw = r[col];
        if (raw == null || String(raw).trim() === '') return;
        seen++;
        const s = String(raw).trim();
        if (NUM_RE.test(s)) vals.set(String(r[idKey]).trim(), parseFloat(s));
      });
      if (vals.size >= 3 && vals.size >= seen * 0.6) {
        vars.push({ id: 'meta:' + col, label: col, group: 'meta', values: vals });
      }
    });
  }

  // 2. abundancia relativa de los taxones top-N (criterio del barplot)
  const relByTaxon = taxaRelativeAbundance();
  if (relByTaxon) {
    relByTaxon.ranked.slice(0, topN).forEach((taxon) => {
      vars.push({
        id: 'taxon:' + taxon, label: shortTaxon(taxon), group: 'taxon',
        values: relByTaxon.bySample[taxon],
      });
    });
  }

  // 3. métricas de diversidad alfa
  if (state.alphaDiversity) {
    Object.entries(state.alphaDiversity.metrics).forEach(([name, m]) => {
      const vals = new Map();
      Object.entries(m.values).forEach(([sid, v]) => {
        if (typeof v === 'number' && isFinite(v)) vals.set(String(sid).trim(), v);
      });
      if (vals.size >= 3) vars.push({ id: 'alpha:' + name, label: name, group: 'alpha', values: vals });
    });
  }

  return vars;
}

// Abundancia relativa (%) por muestra de cada taxón, con el mismo criterio de
// ranking que el barplot (media de la abundancia relativa por muestra).
function taxaRelativeAbundance() {
  // preferimos taxaBarplot (ya es por muestra); si no, taxaCounts (taxón × muestra)
  if (state.taxaBarplot) {
    const levels = Object.keys(state.taxaBarplot.levels).sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(b));
    const table = state.taxaBarplot.levels[levels[levels.length - 1]];
    const sampleKey = table.headers[0];
    const taxonCols = table.headers.filter((h, i) => i !== 0 && !OTHER_RE.test(String(h).trim()));
    const otherCols = table.headers.filter((h, i) => i !== 0 && OTHER_RE.test(String(h).trim()));
    const bySample = {};
    taxonCols.forEach((tx) => { bySample[tx] = new Map(); });
    const meanAcc = {};
    taxonCols.forEach((tx) => { meanAcc[tx] = 0; });
    table.rows.forEach((r) => {
      const sid = String(r[sampleKey]).trim();
      const rowSum = taxonCols.concat(otherCols).reduce((a, h) => a + (parseFloat(r[h]) || 0), 0);
      if (rowSum <= 0) return;
      taxonCols.forEach((tx) => {
        const rel = (parseFloat(r[tx]) || 0) / rowSum * 100;
        bySample[tx].set(sid, rel);
        meanAcc[tx] += rel / table.rows.length;
      });
    });
    return { bySample, ranked: taxonCols.slice().sort((a, b) => meanAcc[b] - meanAcc[a]) };
  }

  if (state.taxaCounts) {
    const tc = state.taxaCounts;
    const taxonKey = tc.taxonKey || tc.headers[0];
    const sampleCols = tc.headers.filter((h) => h !== taxonKey);
    const totals = {};
    sampleCols.forEach((s) => { totals[s] = tc.rows.reduce((a, r) => a + (parseFloat(r[s]) || 0), 0); });
    const bySample = {}; const meanAcc = {};
    tc.rows.forEach((r) => {
      const taxon = String(r[taxonKey]).trim();
      bySample[taxon] = new Map(); meanAcc[taxon] = 0;
      sampleCols.forEach((s) => {
        if (!(totals[s] > 0)) return;
        const rel = (parseFloat(r[s]) || 0) / totals[s] * 100;
        bySample[taxon].set(s, rel);
        meanAcc[taxon] += rel / sampleCols.length;
      });
    });
    return { bySample, ranked: Object.keys(meanAcc).sort((a, b) => meanAcc[b] - meanAcc[a]) };
  }

  return null;
}

function corrFill(r) {
  if (!isFinite(r)) return 'var(--corr-zero)';
  const pct = Math.round(Math.min(1, Math.abs(r)) * 100);
  return 'color-mix(in srgb, ' + (r >= 0 ? 'var(--corr-pos)' : 'var(--corr-neg)') + ' ' + pct + '%, var(--corr-zero))';
}
function stars(p) {
  if (!isFinite(p)) return '';
  if (p < 0.001) return '∗∗∗';
  if (p < 0.01) return '∗∗';
  if (p < 0.05) return '∗';
  return '';
}

export function render(container) {
  let method = 'pearson';        // 'pearson' | 'spearman' — compartido por las dos vistas
  let topN = TOP_N_DEFAULT;
  let selected = null;           // Set de ids de variable; null = aún sin inicializar
  let view = 'matrix';           // 'matrix' | 'network'
  let rThresh = 0.3;             // |r| mínimo para dibujar una arista (solo vista red)
  let pThresh = 0.05;            // p máximo (solo vista red)
  let netSort = { key: 'r', dir: 'desc' };
  let editor = null;

  function paint() {
    if (editor) { editor.destroy(); editor = null; }
    container.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('correlogram.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('correlogram.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('correlogram.subtitle') + '</p>';
    container.appendChild(header);

    const available = collectVariables(topN);

    if (available.length < 2) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      card.innerHTML =
        '<div class="ql-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' +
        '<h3>' + t('correlogram.emptyTitle') + '</h3><p>' + t('correlogram.emptyDesc') + '</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"><a href="#/cargar" class="ql-btn">' + t('ui.goLoadData') + '</a></div></div>';
      container.appendChild(card);
      mountExampleButtons(card.querySelector('.ql-empty'), {
        real: loadRealCommunityData,
        synthetic: loadExampleCommunityData,
        download: ['metadata', 'barplot', 'shannon'],
      });
      return;
    }

    const availIds = available.map((v) => v.id);
    if (selected === null) {
      // primera vez: metadatos + alfa + hasta 5 taxones, para no arrancar gigante
      selected = new Set();
      let taxaAdded = 0;
      available.forEach((v) => {
        if (v.group === 'taxon') { if (taxaAdded < 5) { selected.add(v.id); taxaAdded++; } }
        else selected.add(v.id);
      });
    } else {
      // limpiar ids que ya no existen (p. ej. bajó el top-N)
      [...selected].forEach((id) => { if (!availIds.includes(id)) selected.delete(id); });
    }

    // ---- pestañas: Matriz | Red ----
    const tabs = document.createElement('div');
    tabs.className = 'ql-tabs';
    [['matrix', t('correlogram.tabMatrix')], ['network', t('correlogram.tabNetwork')]].forEach(([v, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ql-tab' + (view === v ? ' is-active' : '');
      b.textContent = label;
      b.addEventListener('click', () => { if (view !== v) { view = v; paint(); } });
      tabs.appendChild(b);
    });
    container.appendChild(tabs);

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    // ---- panel del gráfico ----
    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<p class="ql-panel-note" style="margin-bottom:4px;">' +
      t(view === 'network' ? 'correlogram.netNote' : 'correlogram.chartNote') + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap' + (view === 'matrix' ? ' scroll-x' : '');
    const svg = svgEl('svg', {
      class: 'ql-svg', role: 'img',
      'aria-label': t(view === 'network' ? 'a11y.chartNetwork' : 'a11y.chartCorrelogram'),
    });
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg); chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);
    grid.appendChild(chartPanel);

    // ---- panel de controles ----
    const controls = document.createElement('aside');
    controls.className = 'ql-card ql-panel';
    controls.innerHTML = '<h2>' + t('ui.controls') + '</h2>';

    // método (compartido por las dos vistas)
    const mField = document.createElement('div');
    mField.className = 'ql-field';
    mField.innerHTML = '<label>' + t('correlogram.methodLabel') + '</label>';
    const seg = document.createElement('div');
    seg.className = 'ql-segmented';
    [['pearson', t('correlogram.pearson')], ['spearman', t('correlogram.spearman')]].forEach(([val, lbl]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ql-seg-btn' + (method === val ? ' is-on' : '');
      b.textContent = lbl;
      b.addEventListener('click', () => { if (method !== val) { method = val; paint(); } });
      seg.appendChild(b);
    });
    mField.appendChild(seg);
    mField.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('correlogram.methodHelp') + '</p>');
    controls.appendChild(mField);

    // umbrales de la red (solo en la vista de red)
    if (view === 'network') {
      const thr = document.createElement('div');
      thr.className = 'ql-field';
      thr.innerHTML = '<label for="clR">' + t('correlogram.rThreshLabel') + '</label>' +
        '<div class="ql-inputrow">' +
        '<input type="range" id="clRr" min="0" max="0.95" step="0.05" value="' + rThresh + '" />' +
        '<input type="number" id="clR" class="ql-num-small tabular" min="0" max="1" step="0.05" value="' + rThresh + '" /></div>' +
        '<label for="clP" style="margin-top:10px;">' + t('correlogram.pThreshLabel') + '</label>' +
        '<div class="ql-inputrow">' +
        '<input type="range" id="clPr" min="0.001" max="1" step="0.001" value="' + pThresh + '" />' +
        '<input type="number" id="clP" class="ql-num-small tabular" min="0.0001" max="1" step="0.001" value="' + pThresh + '" /></div>' +
        '<p class="ql-field-help">' + t('correlogram.netThreshHelp') + '</p>';
      controls.appendChild(thr);
      const rR = thr.querySelector('#clRr'), rN = thr.querySelector('#clR');
      const pR = thr.querySelector('#clPr'), pN = thr.querySelector('#clP');
      const applyR = (val) => {
        const nv = Math.max(0, Math.min(1, Number(val)));
        if (isFinite(nv) && nv !== rThresh) { rThresh = nv; paint(); }
      };
      const applyP = (val) => {
        const nv = Math.max(0.0001, Math.min(1, Number(val)));
        if (isFinite(nv) && nv !== pThresh) { pThresh = nv; paint(); }
      };
      rR.addEventListener('input', () => { rN.value = rR.value; });
      rR.addEventListener('change', () => applyR(rR.value));
      rN.addEventListener('change', () => applyR(rN.value));
      pR.addEventListener('input', () => { pN.value = pR.value; });
      pR.addEventListener('change', () => applyP(pR.value));
      pN.addEventListener('change', () => applyP(pN.value));
    }

    // top-N de taxones (solo si hay taxones disponibles)
    if (available.some((v) => v.group === 'taxon')) {
      const tField = document.createElement('div');
      tField.className = 'ql-field';
      tField.innerHTML = '<label for="clTopN">' + t('correlogram.topNLabel') + '</label>' +
        '<div class="ql-inputrow">' +
        '<input type="range" id="clTopNr" min="' + TOP_N_MIN + '" max="' + TOP_N_MAX + '" step="1" value="' + topN + '" />' +
        '<input type="number" id="clTopN" class="ql-num-small tabular" min="' + TOP_N_MIN + '" max="' + TOP_N_MAX + '" step="1" value="' + topN + '" /></div>' +
        '<p class="ql-field-help">' + t('correlogram.topNHelp') + '</p>';
      controls.appendChild(tField);
      const apply = (v) => {
        const nv = Math.max(TOP_N_MIN, Math.min(TOP_N_MAX, Math.round(Number(v) || TOP_N_DEFAULT)));
        if (nv !== topN) { topN = nv; paint(); }
      };
      const rEl = tField.querySelector('#clTopNr'), nEl = tField.querySelector('#clTopN');
      rEl.addEventListener('input', () => { nEl.value = rEl.value; });
      rEl.addEventListener('change', () => apply(rEl.value));
      nEl.addEventListener('change', () => apply(nEl.value));
    }

    // checklist de variables, agrupada
    const vField = document.createElement('div');
    vField.className = 'ql-field';
    vField.innerHTML = '<label>' + t('correlogram.varsLabel') + ' (' + selected.size + ')</label>';
    const groups = [['meta', t('correlogram.grpMeta')], ['taxon', t('correlogram.grpTaxa')], ['alpha', t('correlogram.grpAlpha')]];
    groups.forEach(([g, glabel]) => {
      const inGroup = available.filter((v) => v.group === g);
      if (inGroup.length === 0) return;
      const gh = document.createElement('div');
      gh.className = 'ql-checkgroup-h';
      gh.textContent = glabel;
      vField.appendChild(gh);
      inGroup.forEach((v) => {
        const row = document.createElement('label');
        row.className = 'ql-checkrow';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.has(v.id);
        cb.addEventListener('change', () => {
          if (cb.checked) selected.add(v.id); else selected.delete(v.id);
          paint();
        });
        row.appendChild(cb);
        row.appendChild(document.createTextNode(' ' + v.label));
        vField.appendChild(row);
      });
    });
    controls.appendChild(vField);

    // enlace discreto al script de R
    const rNote = document.createElement('p');
    rNote.className = 'ql-field-help';
    rNote.style.marginTop = '14px';
    rNote.innerHTML = t('correlogram.rNote') + ' <a href="#/recursos">' + t('correlogram.rLink') + '</a>.';
    controls.appendChild(rNote);

    grid.appendChild(controls);
    container.appendChild(grid);

    // ---- tabla ----
    const tableCard = document.createElement('section');
    tableCard.className = 'ql-card ql-panel';
    tableCard.style.marginTop = '20px';
    tableCard.innerHTML = '<h2>' + t(view === 'network' ? 'correlogram.netTableTitle' : 'correlogram.tableTitle') + '</h2>';
    container.appendChild(tableCard);

    const chosen = available.filter((v) => selected.has(v.id));
    if (chosen.length < 2) {
      chartPanel.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('correlogram.pickTwo') + '</p>');
      return;
    }

    // ---- universo de muestras + arrays alineados (compartido por las dos vistas) ----
    let universe;
    if (state.metadata) {
      universe = state.metadata.rows.map((r) => String(r[state.metadata.sampleIdKey]).trim()).filter(Boolean);
    } else {
      const set = new Set();
      chosen.forEach((v) => v.values.forEach((_, k) => set.add(k)));
      universe = [...set];
    }
    const aligned = chosen.map((v) => universe.map((sid) => {
      const val = resolve(v.values, sid);
      return (typeof val === 'number' && isFinite(val)) ? val : NaN;
    }));

    // ---- UNA sola pasada de correlación (idéntica a la que ya rellenaba la matriz) ----
    const k = chosen.length;
    const results = Array.from({ length: k }, () => new Array(k).fill(null));
    let nMin = Infinity, nMax = 0;
    for (let i = 0; i < k; i++) {
      for (let j = i; j < k; j++) {
        if (i === j) { results[i][j] = { r: 1, p: NaN, n: aligned[i].filter(isFinite).length }; continue; }
        const x = [], y = [];
        for (let s = 0; s < universe.length; s++) {
          if (isFinite(aligned[i][s]) && isFinite(aligned[j][s])) { x.push(aligned[i][s]); y.push(aligned[j][s]); }
        }
        const res = x.length >= 3 ? (method === 'pearson' ? pearson(x, y) : spearman(x, y)) : { r: NaN, p: NaN, n: x.length };
        results[i][j] = res; results[j][i] = res;
        if (isFinite(res.r)) { nMin = Math.min(nMin, res.n); nMax = Math.max(nMax, res.n); }
      }
    }
    const nLabel = nMin === Infinity ? '—' : (nMin === nMax ? String(nMin) : nMin + '–' + nMax);

    const ctx = { svg, chartPanel, chartWrap, tooltip, tableCard, chosen, results, k, nLabel };
    if (view === 'network') renderNetwork(ctx);
    else renderMatrix(ctx);
  }

  // =====================================================================
  //  VISTA MATRIZ — mapa de calor divergente + tabla de todas las parejas
  // =====================================================================
  function renderMatrix(ctx) {
    const { svg, chartPanel, chartWrap, tooltip, tableCard, chosen, results, k, nLabel } = ctx;

    const cell = Math.max(16, Math.min(34, 560 / k));
    const labelChars = Math.max(...chosen.map((v) => v.label.length));
    const marginL = Math.min(200, 30 + labelChars * 6.2);
    const marginR = 16;
    const marginT = 44;
    const marginB = Math.min(180, 30 + labelChars * 6.2 * 0.72) + 54; // etiquetas rotadas + leyenda
    const gridS = cell * k;
    const W = Math.max(marginL + gridS + marginR, 420);
    const H = marginT + gridS + marginB;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.width = W + 'px';
    svg.style.maxWidth = 'none';
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const res = results[i][j];
        const isDiag = i === j;
        const x = marginL + j * cell, y = marginT + i * cell;
        const rect = svgEl('rect', {
          x, y, width: cell - 1.5, height: cell - 1.5, rx: 2,
          fill: isDiag ? 'color-mix(in srgb, var(--baseline) 55%, var(--surface))' : corrFill(res.r),
        });
        if (!isDiag) {
          rect.addEventListener('mouseenter', () => {
            const wrapRect = chartWrap.getBoundingClientRect();
            const svgRect = svg.getBoundingClientRect();
            const sX = svgRect.width / W, sY = svgRect.height / H;
            tooltip.style.left = ((svgRect.left - wrapRect.left) + (x + cell / 2) * sX + chartWrap.scrollLeft) + 'px';
            tooltip.style.top = ((svgRect.top - wrapRect.top) + (y + cell / 2) * sY) + 'px';
            tooltip.innerHTML =
              '<div class="ql-tt-name">' + escapeHtml(chosen[i].label) + ' × ' + escapeHtml(chosen[j].label) + '</div>' +
              '<div class="ql-tt-row">r = ' + (isFinite(res.r) ? res.r.toFixed(3) : '—') +
              ' · p = ' + formatP(res.p) + ' · n = ' + res.n + '</div>';
            tooltip.classList.add('is-show');
          });
          rect.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
        }
        svg.appendChild(rect);

        if (!isDiag) {
          const st = stars(res.p);
          if (st) {
            const strong = isFinite(res.r) && Math.abs(res.r) > 0.5;
            const tx = svgEl('text', {
              x: x + (cell - 1.5) / 2, y: y + (cell - 1.5) / 2 + 3.5,
              'text-anchor': 'middle', 'font-size': Math.min(13, cell * 0.42),
              'font-weight': 700, fill: strong ? 'var(--surface)' : 'var(--ink)',
              'font-family': 'var(--font-mono)', 'pointer-events': 'none',
            });
            tx.textContent = st;
            svg.appendChild(tx);
          }
        }
      }
    }

    // etiquetas de fila (izquierda) y columna (abajo, rotadas)
    const rowLabels = svgEl('g', { 'data-ce': 'rowlabels' });
    const colLabels = svgEl('g', { 'data-ce': 'collabels' });
    chosen.forEach((v, i) => {
      const yr = marginT + i * cell + cell / 2 + 3;
      const rt = svgEl('text', { x: marginL - 8, y: yr, class: 'ql-tick-label', 'text-anchor': 'end' });
      rt.textContent = v.label;
      rowLabels.appendChild(rt);
      const xc = marginL + i * cell + cell / 2;
      const yc = marginT + gridS + 12;
      const ct = svgEl('text', {
        x: xc, y: yc, class: 'ql-tick-label', 'text-anchor': 'end',
        transform: 'rotate(-45 ' + xc + ' ' + yc + ')',
      });
      ct.textContent = v.label;
      colLabels.appendChild(ct);
    });
    svg.appendChild(rowLabels);
    svg.appendChild(colLabels);

    // leyenda: barra divergente -1 … 0 … +1
    const legG = svgEl('g', { 'data-ce': 'legend' });
    const defs = svgEl('defs', {});
    const grad = svgEl('linearGradient', { id: 'ql-corr-scale', x1: '0', y1: '0', x2: '1', y2: '0' });
    grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': 'var(--corr-neg)' }));
    grad.appendChild(svgEl('stop', { offset: '0.5', 'stop-color': 'var(--corr-zero)' }));
    grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': 'var(--corr-pos)' }));
    defs.appendChild(grad);
    svg.appendChild(defs);
    const barW = Math.min(180, gridS * 0.7);
    legG.appendChild(svgEl('rect', { x: 0, y: 0, width: barW, height: 11, rx: 2, fill: 'url(#ql-corr-scale)', stroke: 'var(--baseline)' }));
    [['−1', 0, 'start'], ['0', barW / 2, 'middle'], ['+1', barW, 'end']].forEach(([lab, xx, anchor]) => {
      const lt = svgEl('text', { x: xx, y: 25, class: 'ql-tick-label', 'text-anchor': anchor });
      lt.textContent = lab;
      legG.appendChild(lt);
    });
    const legNote = svgEl('text', { x: 0, y: 42, class: 'ql-tick-label', fill: 'var(--ink-muted)' });
    legNote.textContent = t('correlogram.legendStars');
    legG.appendChild(legNote);
    legG.setAttribute('transform', 'translate(' + marginL + ',' + (marginT + gridS + marginB - 50) + ')');
    svg.appendChild(legG);

    editor = attachChartEditor({
      key: 'correlogram', svg, mount: chartPanel, lang: getLang(),
      filename: t('correlogram.title') + '-' + method,
      elements: [
        { id: 'title', create: { text: t('correlogram.figTitle', { method: method === 'pearson' ? t('correlogram.pearson') : t('correlogram.spearman') }), x: W / 2, y: 22, anchor: 'middle', cls: 'ce-title' } },
        { id: 'rowlabels', selector: '[data-ce="rowlabels"]', kind: 'group' },
        { id: 'collabels', selector: '[data-ce="collabels"]', kind: 'group' },
        { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
      ],
      onReset: () => paint(),
    });

    // subtítulo informativo (fuera de la figura)
    chartPanel.insertAdjacentHTML('beforeend',
      '<p class="ql-field-help" style="margin-top:6px;">' +
      t('correlogram.figMeta', { method: method === 'pearson' ? t('correlogram.pearson') : t('correlogram.spearman'), k, n: nLabel }) +
      '</p>');

    // ---- tabla de todas las parejas ----
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    tbl.innerHTML = '<thead><tr><th>' + t('correlogram.colPairA') + '</th><th>' + t('correlogram.colPairB') +
      '</th><th>r</th><th>p</th><th>n</th></tr></thead>';
    const tbody = document.createElement('tbody');
    const flat = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) flat.push({ i, j, res: results[i][j] });
    flat.sort((a, b) => (Math.abs(b.res.r) || 0) - (Math.abs(a.res.r) || 0));
    flat.forEach(({ i, j, res }) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(chosen[i].label) + '</td>' +
        '<td>' + escapeHtml(chosen[j].label) + '</td>' +
        '<td class="ql-num tabular">' + (isFinite(res.r) ? res.r.toFixed(3) : '—') +
        (stars(res.p) ? ' <span class="mono">' + stars(res.p) + '</span>' : '') + '</td>' +
        '<td class="ql-num tabular">' + formatP(res.p) + '</td>' +
        '<td class="ql-num tabular">' + res.n + '</td>';
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);
  }

  // =====================================================================
  //  VISTA RED de co-ocurrencia — layout de fuerzas determinista
  // =====================================================================
  function renderNetwork(ctx) {
    const { svg, chartPanel, chartWrap, tooltip, tableCard, chosen, results, k } = ctx;

    // aristas: parejas del triángulo superior que superan AMBOS umbrales
    const edges = [];
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const res = results[i][j];
        if (isFinite(res.r) && Math.abs(res.r) >= rThresh && isFinite(res.p) && res.p <= pThresh) {
          edges.push({
            i, j, r: res.r, p: res.p, n: res.n,
            source: chosen[i].id, target: chosen[j].id, weight: Math.abs(res.r),
          });
        }
      }
    }
    const degree = new Array(k).fill(0);
    edges.forEach((e) => { degree[e.i]++; degree[e.j]++; });

    const W = 640, H = 480;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.width = '';
    svg.style.maxWidth = '';
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const pos = forceLayout(chosen.map((v) => v.id), edges, { width: W, height: H, seed: NET_SEED, iterations: 300 });
    const P = chosen.map((v) => pos[v.id] || { x: W / 2, y: H / 2 });
    const edgeColor = (r) => (r >= 0 ? 'var(--corr-pos)' : 'var(--corr-neg)');

    // aristas primero (debajo de los nodos)
    const edgeLayer = svgEl('g', {});
    svg.appendChild(edgeLayer);
    const edgeEls = [];
    edges.forEach((e) => {
      const a = P[e.i], b = P[e.j];
      const w = Math.abs(e.r);
      const baseOpacity = (0.22 + w * 0.6).toFixed(2);
      const ln = svgEl('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: edgeColor(e.r), 'stroke-width': (1 + w * 4.5).toFixed(2),
        'stroke-opacity': baseOpacity, 'stroke-linecap': 'round',
      });
      ln.addEventListener('mouseenter', () => {
        ln.setAttribute('stroke-opacity', '1');
        showTip(tooltip, chartWrap, svg, W, H, (a.x + b.x) / 2, (a.y + b.y) / 2,
          '<div class="ql-tt-name">' + escapeHtml(chosen[e.i].label) + ' × ' + escapeHtml(chosen[e.j].label) + '</div>' +
          '<div class="ql-tt-row">r = ' + e.r.toFixed(3) + ' · p = ' + formatP(e.p) + ' · n = ' + e.n + '</div>');
      });
      ln.addEventListener('mouseleave', () => { ln.setAttribute('stroke-opacity', baseOpacity); tooltip.classList.remove('is-show'); });
      edgeLayer.appendChild(ln);
      edgeEls.push({ el: ln, e, baseOpacity });
    });

    // nodos + etiquetas
    const nodeLayer = svgEl('g', {});
    const labelLayer = svgEl('g', { 'data-ce': 'labels' });
    svg.appendChild(nodeLayer); svg.appendChild(labelLayer);
    chosen.forEach((v, i) => {
      const p = P[i];
      const rad = 5 + Math.min(6, degree[i] * 1.1);
      const c = svgEl('circle', {
        cx: p.x, cy: p.y, r: rad,
        fill: 'var(--accent-soft)', stroke: 'var(--accent)', 'stroke-width': 1.5,
      });
      c.addEventListener('mouseenter', () => {
        edgeEls.forEach(({ el, e }) => { if (e.i === i || e.j === i) el.setAttribute('stroke-opacity', '1'); });
        showTip(tooltip, chartWrap, svg, W, H, p.x, p.y,
          '<div class="ql-tt-name">' + escapeHtml(v.label) + '</div>' +
          '<div class="ql-tt-row">' + t('correlogram.netNodeDegree', { n: degree[i] }) + '</div>');
      });
      c.addEventListener('mouseleave', () => {
        edgeEls.forEach(({ el, baseOpacity }) => el.setAttribute('stroke-opacity', baseOpacity));
        tooltip.classList.remove('is-show');
      });
      nodeLayer.appendChild(c);

      const anchor = p.x > W * 0.66 ? 'end' : (p.x < W * 0.34 ? 'start' : 'middle');
      const dx = anchor === 'end' ? -(rad + 4) : anchor === 'start' ? (rad + 4) : 0;
      const dy = anchor === 'middle' ? -(rad + 5) : 3.5;
      const lbl = svgEl('text', { x: p.x + dx, y: p.y + dy, 'text-anchor': anchor, class: 'ql-tick-label' });
      lbl.textContent = v.label.length > 22 ? v.label.slice(0, 21) + '…' : v.label;
      labelLayer.appendChild(lbl);
    });

    // leyenda: signo + grosor por |r|
    const legG = svgEl('g', { 'data-ce': 'legend' });
    legG.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 26, y2: 0, stroke: 'var(--corr-pos)', 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
    const lt1 = svgEl('text', { x: 32, y: 3.5, class: 'ql-tick-label' }); lt1.textContent = t('correlogram.netLegendPos');
    legG.appendChild(lt1);
    legG.appendChild(svgEl('line', { x1: 0, y1: 16, x2: 26, y2: 16, stroke: 'var(--corr-neg)', 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
    const lt2 = svgEl('text', { x: 32, y: 19.5, class: 'ql-tick-label' }); lt2.textContent = t('correlogram.netLegendNeg');
    legG.appendChild(lt2);
    const lt3 = svgEl('text', { x: 0, y: 34, class: 'ql-tick-label', fill: 'var(--ink-muted)' });
    lt3.textContent = t('correlogram.netLegendWidth');
    legG.appendChild(lt3);
    legG.setAttribute('transform', 'translate(14,' + (H - 42) + ')');
    svg.appendChild(legG);

    if (edges.length === 0) {
      const tx = svgEl('text', { x: W / 2, y: 26, 'text-anchor': 'middle', class: 'ql-axis-label', fill: 'var(--ink-muted)' });
      tx.textContent = t('correlogram.netNoEdges');
      svg.appendChild(tx);
    }

    editor = attachChartEditor({
      key: 'correlogramNetwork', svg, mount: chartPanel, lang: getLang(),
      filename: t('correlogram.title') + '-red-' + method,
      elements: [
        { id: 'title', create: { text: t('correlogram.netFigTitle', { method: method === 'pearson' ? t('correlogram.pearson') : t('correlogram.spearman') }), x: W / 2, y: 20, anchor: 'middle', cls: 'ce-title' } },
        { id: 'labels', selector: '[data-ce="labels"]', kind: 'group' },
        { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
      ],
      onReset: () => paint(),
    });

    chartPanel.insertAdjacentHTML('beforeend',
      '<p class="ql-field-help" style="margin-top:6px;">' +
      t('correlogram.netMeta', {
        edges: edges.length, k,
        r: rThresh.toFixed(2), p: formatP(pThresh),
      }) + '</p>');

    // ---- tabla de conexiones (ordenable) ----
    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'ql-table-scroll';
    const tbl = document.createElement('table');
    tbl.className = 'ql-table';
    const cols = [
      ['a', t('correlogram.colPairA')], ['b', t('correlogram.colPairB')],
      ['r', 'r'], ['p', 'p'], ['n', 'n'],
    ];
    let thead = '<thead><tr>';
    cols.forEach(([key, lbl]) => {
      const on = netSort.key === key;
      thead += '<th aria-sort="' + (on ? (netSort.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" data-sort="' + key + '">' + escapeHtml(lbl) +
        (on ? ' <span aria-hidden="true">' + (netSort.dir === 'asc' ? '▲' : '▼') + '</span>' : '') + '</button></th>';
    });
    tbl.innerHTML = thead + '</tr></thead>';
    const tb = document.createElement('tbody');
    const rows = edges.map((e) => ({ a: chosen[e.i].label, b: chosen[e.j].label, r: e.r, p: e.p, n: e.n }));
    const dir = netSort.dir === 'asc' ? 1 : -1;
    rows.sort((x, y) => {
      const xv = x[netSort.key], yv = y[netSort.key];
      if (typeof xv === 'string') return xv.localeCompare(yv) * dir;
      return ((xv || 0) - (yv || 0)) * dir;
    });
    if (rows.length === 0) {
      tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ink-muted);padding:20px;">' +
        t('correlogram.netNoEdges') + '</td></tr>';
    } else {
      rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escapeHtml(row.a) + '</td>' +
          '<td>' + escapeHtml(row.b) + '</td>' +
          '<td class="ql-num tabular">' + row.r.toFixed(3) + (stars(row.p) ? ' <span class="mono">' + stars(row.p) + '</span>' : '') + '</td>' +
          '<td class="ql-num tabular">' + formatP(row.p) + '</td>' +
          '<td class="ql-num tabular">' + row.n + '</td>';
        tb.appendChild(tr);
      });
    }
    tbl.appendChild(tb);
    scrollDiv.appendChild(tbl);
    tableCard.appendChild(scrollDiv);
    tbl.querySelectorAll('th button[data-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-sort');
        if (netSort.key === key) netSort = { key, dir: netSort.dir === 'asc' ? 'desc' : 'asc' };
        // por defecto: nombres y p ascendente (más útil), r y n descendente
        else netSort = { key, dir: (key === 'a' || key === 'b' || key === 'p') ? 'asc' : 'desc' };
        paint();
      });
    });
  }

  // tooltip a partir de coordenadas del viewBox (compartido por nodos y aristas)
  function showTip(tip, wrap, svgNode, W, H, cx, cy, html) {
    const wr = wrap.getBoundingClientRect(), sr = svgNode.getBoundingClientRect();
    tip.style.left = ((sr.left - wr.left) + cx * (sr.width / W) + (wrap.scrollLeft || 0)) + 'px';
    tip.style.top = ((sr.top - wr.top) + cy * (sr.height / H)) + 'px';
    tip.innerHTML = html;
    tip.classList.add('is-show');
  }

  paint();
  const stop = subscribe(paint);
  return () => { stop(); if (editor) { editor.destroy(); editor = null; } };
}
