// Evolución temporal (#/temporal) — prompt "quick wins" del 22 sep 2026,
// punto 5. Módulo nuevo: combina datos de varios orígenes YA cargados
// (ninguno propio) — una métrica de diversidad alfa (alphaMetrics.js),
// la abundancia relativa de un taxón (taxaAbundance.js) o cualquier
// columna numérica del metadata — contra una columna del metadata como
// eje X (tratada como numérica/ordenable, NUNCA parseada como fecha
// estricta), con agrupación categórica opcional y 2 modos: "Media ± error"
// (una línea por grupo, conectando el promedio en cada punto de X) o
// "Individual" (trayectoria de cada muestra — spaghetti plot si hay una
// columna de sujeto/individuo, puntos sueltos si no).
//
// No persiste nada propio en js/state.js (solo lee slots ya existentes) ni
// en su propio localStorage — la selección de variables se resetea al
// volver a entrar, igual que pcoaPlotStyle en betaDiversity.js o plotStyle
// en alphaDiversity.js (mismo criterio ya establecido para preferencias de
// vista, no de datos).

import { state, subscribe } from '../state.js';
import { t, getLang } from '../lib/i18n.js';
import { mean, stdDev, standardError } from '../lib/stats.js';
import { collectAlphaMetrics } from '../lib/alphaMetrics.js';
import { taxaRelativeAbundance } from '../lib/taxaAbundance.js';
import { makeGroupResolver, matchSampleId } from '../lib/sampleMatch.js';
import { CAT_VARS, groupColor } from '../lib/groupBoxplot.js';
import { attachChartEditor, getFigureOptions } from '../lib/chartEditor.js';
import { svgEl, escapeHtml, delegateHover } from '../lib/dom.js';
import { showTooltip, hideTooltip } from '../lib/tooltip.js';
import { chartTypeField } from '../lib/chartTypeSelector.js';

const NUM_RE = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
// nombres de columna que sugieren un eje temporal — resalta la opción en el
// selector de eje X sin bloquear ninguna otra (el prompt pide exactamente
// esto: no forzar parseo de fechas, solo ayudar a encontrarla)
const TIME_NAME_RE = /d[ií]a|dia|semana|tiempo|punto.?temporal|timepoint|day|week|time/i;

/** Columnas de metadatos con >=60% de sus valores no vacíos parseables como
 *  número — mismo criterio que numericMetaColumns() en betaDiversity.js /
 *  collectVariables() en correlogram.js (duplicado a propósito: son 3
 *  módulos con un criterio idéntico pero sin un lugar común natural donde
 *  vivir sin forzar una dependencia nueva por 10 líneas). */
function numericMetaColumns(cols) {
  if (!state.metadata) return [];
  return cols.filter((col) => {
    let seen = 0, numeric = 0;
    state.metadata.rows.forEach((r) => {
      const raw = r[col];
      if (raw == null || String(raw).trim() === '') return;
      seen++;
      if (NUM_RE.test(String(raw).trim())) numeric++;
    });
    return numeric >= 3 && numeric >= seen * 0.6;
  });
}

export function render(container) {
  let yType = null;       // 'alpha' | 'taxon' | 'metanum'
  let yAlphaMetric = null;
  let yTaxon = null;
  let yMetaCol = null;
  let taxonSearch = '';
  let yTypeUserPicked = false; // mientras el usuario no elija a mano, re-evaluar
                                // el mejor yType disponible en CADA repintado —
                                // ingest() puede rellenar los slots de datos en
                                // varios pasos (metadata, luego taxaCounts, luego
                                // alphaDiversity calculada a partir de esos
                                // conteos), y cada uno dispara su propio
                                // subscribe(paint); sin este flag, un primer
                                // repintado con datos aún incompletos podía fijar
                                // yType='metanum' y quedarse ahí para siempre
                                // aunque luego SÍ hubiera métricas de alfa
                                // diversidad disponibles (seguía siendo "válido").
  let xCol = null;
  let groupCol = '';      // '' = sin agrupar
  let subjectCol = '';    // '' = sin sujeto (solo aplica a viewMode==='individual')
  let viewMode = 'mean';  // 'mean' | 'individual'
  let errBar = 'sd';      // 'sd' | 'se'
  let editor = null;
  let wasEditing = false;

  function paint() {
    wasEditing = editor && editor.isEditing ? editor.isEditing() : false;
    if (editor) { editor.destroy(); editor = null; }
    container.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'ql-page-header';
    header.innerHTML =
      '<p class="ql-eyebrow">' + t('temporal.eyebrow') + '</p>' +
      '<h1 class="ql-page-title">' + t('temporal.title') + '</h1>' +
      '<p class="ql-page-sub">' + t('temporal.subtitle') + '</p>';
    container.appendChild(header);

    const allMetrics = collectAlphaMetrics();
    const taxaAb = taxaRelativeAbundance();
    const metaCols = state.metadata ? state.metadata.headers.filter((h) => h !== state.metadata.sampleIdKey) : [];
    const numericCols = numericMetaColumns(metaCols);
    const haveAnyY = allMetrics.length > 0 || (taxaAb && taxaAb.ranked.length > 0) || numericCols.length > 0;

    if (!state.metadata || !haveAnyY) {
      const card = document.createElement('div');
      card.className = 'ql-card ql-panel';
      const missing = [];
      if (!state.metadata) missing.push(t('temporal.needMeta'));
      if (!haveAnyY) missing.push(t('temporal.needY'));
      card.innerHTML =
        '<div class="ql-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 20h16M4 20V4"/><path d="M4 15.5 9 10l4 3 7-7.5"/></svg>' +
        '<h3>' + t('temporal.emptyTitle') + '</h3><p>' + t('temporal.emptyNeed', { list: missing.join(t('ui.needAnd')) }) + '</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"><a href="#/cargar" class="ql-btn">' + t('ui.goLoadData') + '</a></div></div>';
      container.appendChild(card);
      return;
    }

    // ---- resolver el tipo de Y por defecto / validar el elegido ----
    const yTypeOptions = [];
    if (allMetrics.length > 0) yTypeOptions.push('alpha');
    if (taxaAb && taxaAb.ranked.length > 0) yTypeOptions.push('taxon');
    if (numericCols.length > 0) yTypeOptions.push('metanum');
    if (!yTypeUserPicked || !yType || !yTypeOptions.includes(yType)) yType = yTypeOptions[0];

    if (yType === 'alpha' && (!yAlphaMetric || !allMetrics.some((m) => m.name === yAlphaMetric))) yAlphaMetric = allMetrics[0].name;
    if (yType === 'taxon' && (!yTaxon || !taxaAb.ranked.includes(yTaxon))) yTaxon = taxaAb.ranked[0];
    if (yType === 'metanum' && (!yMetaCol || !numericCols.includes(yMetaCol))) yMetaCol = numericCols[0];

    if (!xCol || !metaCols.includes(xCol)) {
      xCol = metaCols.find((c) => TIME_NAME_RE.test(c)) || metaCols[0] || null;
    }
    if (groupCol && !metaCols.includes(groupCol)) groupCol = '';
    if (subjectCol && !metaCols.includes(subjectCol)) subjectCol = '';

    const grid = document.createElement('div');
    grid.className = 'ql-grid-2';

    const chartPanel = document.createElement('section');
    chartPanel.className = 'ql-card ql-panel';
    chartPanel.innerHTML = '<p class="ql-panel-note" style="margin-bottom:4px;">' +
      t(viewMode === 'individual' ? 'temporal.individualNote' : 'temporal.meanNote') + '</p>';
    const chartWrap = document.createElement('div');
    chartWrap.className = 'ql-chartwrap scroll-x';
    const svg = svgEl('svg', { class: 'ql-svg', role: 'img', 'aria-label': t('a11y.chartTemporal') });
    const tooltip = document.createElement('div');
    tooltip.className = 'ql-tooltip';
    chartWrap.appendChild(svg); chartWrap.appendChild(tooltip);
    chartPanel.appendChild(chartWrap);
    grid.appendChild(chartPanel);

    const controls = document.createElement('aside');
    controls.className = 'ql-card ql-panel';
    controls.innerHTML = '<h2>' + t('ui.controls') + '</h2>';

    // ---- variable Y: tipo + selector concreto ----
    if (yTypeOptions.length > 1) {
      controls.appendChild(chartTypeField({
        labelKey: 'temporal.ySourceLabel',
        options: yTypeOptions.map((v) => ({ value: v, labelKey: 'temporal.ySource_' + v })),
        active: yType,
        onChange: (v) => { yType = v; yTypeUserPicked = true; paint(); },
      }));
    }
    if (yType === 'alpha') {
      const f = document.createElement('div'); f.className = 'ql-field';
      f.innerHTML = '<label>' + t('temporal.yMetricLabel') + '</label>';
      const sel = document.createElement('select');
      allMetrics.forEach((m) => {
        const o = document.createElement('option'); o.value = m.name; o.textContent = m.label;
        if (m.name === yAlphaMetric) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', () => { yAlphaMetric = sel.value; paint(); });
      f.appendChild(sel); controls.appendChild(f);
    } else if (yType === 'taxon') {
      const f = document.createElement('div'); f.className = 'ql-field';
      f.innerHTML = '<label>' + t('temporal.yTaxonLabel') + '</label>';
      const search = document.createElement('input');
      search.type = 'text'; search.placeholder = t('temporal.yTaxonSearch'); search.value = taxonSearch;
      search.addEventListener('input', () => { taxonSearch = search.value; renderTaxonOptions(); });
      f.appendChild(search);
      const sel = document.createElement('select');
      sel.style.marginTop = '6px';
      f.appendChild(sel); controls.appendChild(f);
      function renderTaxonOptions() {
        sel.innerHTML = '';
        const q = taxonSearch.trim().toLowerCase();
        const filtered = q ? taxaAb.ranked.filter((tx) => tx.toLowerCase().includes(q)) : taxaAb.ranked;
        filtered.slice(0, 200).forEach((tx) => {
          const o = document.createElement('option'); o.value = tx; o.textContent = tx;
          if (tx === yTaxon) o.selected = true; sel.appendChild(o);
        });
        if (filtered.length && !filtered.includes(yTaxon)) { yTaxon = filtered[0]; sel.value = yTaxon; }
      }
      renderTaxonOptions();
      sel.addEventListener('change', () => { yTaxon = sel.value; paint(); });
    } else if (yType === 'metanum') {
      const f = document.createElement('div'); f.className = 'ql-field';
      f.innerHTML = '<label>' + t('temporal.yMetaLabel') + '</label>';
      const sel = document.createElement('select');
      numericCols.forEach((c) => {
        const o = document.createElement('option'); o.value = c; o.textContent = c;
        if (c === yMetaCol) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', () => { yMetaCol = sel.value; paint(); });
      f.appendChild(sel); controls.appendChild(f);
    }

    // ---- eje X: cualquier columna de metadata, sugerida si el nombre encaja ----
    {
      const f = document.createElement('div'); f.className = 'ql-field';
      f.innerHTML = '<label>' + t('temporal.xColLabel') + '</label>';
      const sel = document.createElement('select');
      metaCols.forEach((c) => {
        const o = document.createElement('option'); o.value = c;
        o.textContent = c + (TIME_NAME_RE.test(c) ? ' ' + t('temporal.suggested') : '');
        if (c === xCol) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', () => { xCol = sel.value; paint(); });
      f.appendChild(sel);
      f.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('temporal.xColHelp') + '</p>');
      controls.appendChild(f);
    }

    // ---- agrupación opcional ----
    {
      const f = document.createElement('div'); f.className = 'ql-field';
      f.innerHTML = '<label>' + t('temporal.groupLabel') + '</label>';
      const sel = document.createElement('select');
      const noneOpt = document.createElement('option'); noneOpt.value = ''; noneOpt.textContent = t('temporal.groupNone');
      if (!groupCol) noneOpt.selected = true; sel.appendChild(noneOpt);
      metaCols.forEach((c) => {
        const o = document.createElement('option'); o.value = c; o.textContent = c;
        if (c === groupCol) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', () => { groupCol = sel.value; paint(); });
      f.appendChild(sel); controls.appendChild(f);
    }

    // ---- modo: media±error / individual ----
    controls.appendChild(chartTypeField({
      labelKey: 'temporal.viewModeLabel',
      options: [
        { value: 'mean', labelKey: 'temporal.viewModeMean' },
        { value: 'individual', labelKey: 'temporal.viewModeIndividual' },
      ],
      active: viewMode,
      onChange: (v) => { viewMode = v; paint(); },
      helpKey: 'temporal.viewModeHelp',
    }));

    if (viewMode === 'mean') {
      const f = document.createElement('div'); f.className = 'ql-field';
      f.innerHTML = '<label>' + t('temporal.errBarLabel') + '</label>';
      const seg = document.createElement('div'); seg.className = 'ql-segmented';
      [['sd', t('temporal.sdFull')], ['se', t('temporal.seFull')]].forEach(([v, lbl]) => {
        const b = document.createElement('button'); b.type = 'button';
        b.className = 'ql-seg-btn' + (errBar === v ? ' is-on' : '');
        b.textContent = lbl;
        b.addEventListener('click', () => { if (errBar !== v) { errBar = v; paint(); } });
        seg.appendChild(b);
      });
      f.appendChild(seg); controls.appendChild(f);
    } else {
      const f = document.createElement('div'); f.className = 'ql-field';
      f.innerHTML = '<label>' + t('temporal.subjectLabel') + '</label>';
      const sel = document.createElement('select');
      const noneOpt = document.createElement('option'); noneOpt.value = ''; noneOpt.textContent = t('temporal.subjectNone');
      if (!subjectCol) noneOpt.selected = true; sel.appendChild(noneOpt);
      metaCols.forEach((c) => {
        const o = document.createElement('option'); o.value = c; o.textContent = c;
        if (c === subjectCol) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', () => { subjectCol = sel.value; paint(); });
      f.appendChild(sel);
      f.insertAdjacentHTML('beforeend', '<p class="ql-field-help">' + t('temporal.subjectHelp') + '</p>');
      controls.appendChild(f);
    }

    grid.appendChild(controls);
    container.appendChild(grid);

    // ---- ensamblar los datos: valor Y + X + grupo + sujeto por muestra ----
    const yValues = (() => {
      if (yType === 'alpha') { const m = allMetrics.find((mm) => mm.name === yAlphaMetric); return m ? m.values : {}; }
      if (yType === 'taxon') {
        const map = taxaAb.bySample[yTaxon] || new Map();
        const obj = {}; map.forEach((v, k) => { obj[k] = v; }); return obj;
      }
      // metanum: leer directamente de metadata, indexado por su propio sampleIdKey
      const obj = {};
      state.metadata.rows.forEach((r) => {
        const sid = String(r[state.metadata.sampleIdKey]).trim();
        const raw = r[yMetaCol];
        if (raw != null && NUM_RE.test(String(raw).trim())) obj[sid] = parseFloat(raw);
      });
      return obj;
    })();
    const yLabel = yType === 'alpha' ? (allMetrics.find((m) => m.name === yAlphaMetric) || {}).label
      : yType === 'taxon' ? yTaxon : yMetaCol;

    const resolveX = makeGroupResolver(state.metadata, xCol);
    const resolveGroup = groupCol ? makeGroupResolver(state.metadata, groupCol) : null;
    const resolveSubject = subjectCol ? makeGroupResolver(state.metadata, subjectCol) : null;

    const points = [];
    Object.keys(yValues).forEach((sid) => {
      const yv = yValues[sid];
      if (yv == null || !isFinite(yv)) return;
      const xRaw = resolveX(sid);
      if (xRaw == null || !NUM_RE.test(String(xRaw).trim())) return;
      const xv = parseFloat(xRaw);
      const g = resolveGroup ? resolveGroup(sid) : null;
      const subj = resolveSubject ? resolveSubject(sid) : null;
      points.push({ sid, x: xv, y: yv, group: g, subject: subj });
    });

    if (points.length === 0) {
      chartWrap.innerHTML = '<p class="ql-field-help" style="padding:20px;">' + t('temporal.noMatch') + '</p>';
      return;
    }

    const groups = groupCol ? Array.from(new Set(points.map((p) => p.group).filter((g) => g != null))).sort() : [null];

    // ---- series a dibujar ----
    let series; // [{ id, label, points: [{x,y,sd?,se?,n?,sid?}] (ordenados por x) }]
    if (viewMode === 'mean') {
      series = groups.map((g, gi) => {
        const gp = points.filter((p) => (groupCol ? p.group === g : true));
        const byX = new Map();
        gp.forEach((p) => { if (!byX.has(p.x)) byX.set(p.x, []); byX.get(p.x).push(p.y); });
        const pts = Array.from(byX.entries()).map(([x, ys]) => ({
          x, y: mean(ys), sd: stdDev(ys), se: standardError(ys), n: ys.length,
        })).sort((a, b) => a.x - b.x);
        return { id: 's' + gi, label: g == null ? t('temporal.allSamples') : String(g), points: pts };
      });
    } else if (subjectCol) {
      const subjectsSeen = new Set();
      series = [];
      groups.forEach((g, gi) => {
        const gp = points.filter((p) => (groupCol ? p.group === g : true) && p.subject != null);
        const bySubj = new Map();
        gp.forEach((p) => { if (!bySubj.has(p.subject)) bySubj.set(p.subject, []); bySubj.get(p.subject).push(p); });
        bySubj.forEach((arr, subj) => {
          const key = (groupCol ? g + '|' : '') + subj;
          if (subjectsSeen.has(key)) return; subjectsSeen.add(key);
          series.push({ id: 's' + gi, label: (g == null ? '' : g + ' · ') + subj, points: arr.slice().sort((a, b) => a.x - b.x), isSpaghetti: true });
        });
      });
    } else {
      // sin columna de sujeto: puntos sueltos por grupo, sin conectar (el prompt pide
      // explícitamente no forzar conexiones arbitrarias cuando no hay sujeto)
      series = groups.map((g, gi) => ({
        id: 's' + gi, label: g == null ? t('temporal.allSamples') : String(g),
        points: points.filter((p) => (groupCol ? p.group === g : true)).sort((a, b) => a.x - b.x),
        noLine: true,
      }));
    }

    const auto = drawChart(svg, chartWrap, tooltip, series, { xCol, yLabel, viewMode, subjectCol, groups, groupCol });

    const paletteSeries = groups.map((g, i) => ({ id: 's' + i, label: g == null ? t('temporal.allSamples') : String(g) }));
    editor = attachChartEditor({
      key: 'temporal-' + viewMode, svg, mount: chartPanel, filename: t('temporal.title') + '-' + (yLabel || 'y'), lang: getLang(),
      elements: [
        { id: 'title', create: { text: t('temporal.title'), x: 8, y: 14, anchor: 'start', cls: 'ce-title' } },
        { id: 'xtitle', selector: '[data-ce="xtitle"]' },
        { id: 'ytitle', selector: '[data-ce="ytitle"]' },
        { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
      ],
      paletteSeries, paletteType: 'categorical',
      // rangos de ejes (Ajustes > Estructura): dominios AUTOMÁTICOS como valor por defecto
      figureOptions: { axis: { domain: auto.y }, axisX: { domain: auto.x } },
      onFigureOptionsChange: () => paint(),
      onReset: () => paint(),
      startEditing: wasEditing,
    });
  }

  function drawChart(svg, chartWrap, tooltip, series, o) {
    const allPts = series.flatMap((s) => s.points);
    const xs = allPts.map((p) => p.x);
    const errOf = (p) => (o.viewMode === 'mean' ? (p[errBar] || 0) : 0);
    const yErrHi = allPts.map((p) => p.y + errOf(p));
    const yErrLo = allPts.map((p) => p.y - errOf(p));

    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMinRaw = Math.min(...yErrLo), yMaxRaw = Math.max(...yErrHi);
    const xPad = (xMax - xMin) * 0.06 || 1, yPad = (yMaxRaw - yMinRaw) * 0.12 || 1;
    const autoX = [xMin - xPad, xMax + xPad], autoY = [yMinRaw - yPad, yMaxRaw + yPad];
    const so = getFigureOptions('temporal-' + o.viewMode);
    const xLo = so.axisXMin != null ? so.axisXMin : autoX[0], xHi = so.axisXMax != null ? so.axisXMax : autoX[1];
    const yLo = so.axisMin != null ? so.axisMin : autoY[0], yHi = so.axisMax != null ? so.axisMax : autoY[1];

    const mL = 64, mR = 20, mT = 30, mB = 70;
    const W = 760, innerH = 380;
    const legRows = Math.ceil(series.length / 3);
    const H = mT + innerH + mB + legRows * 16;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const sx = (v) => mL + ((v - xLo) / (xHi - xLo)) * (W - mL - mR);
    const sy = (v) => mT + innerH - ((v - yLo) / (yHi - yLo)) * innerH;

    for (let i = 0; i <= 4; i++) {
      const yv = yLo + (i / 4) * (yHi - yLo);
      const gy = sy(yv);
      svg.appendChild(svgEl('line', { x1: mL, x2: W - mR, y1: gy, y2: gy, class: 'ql-gridline' }));
      const tk = svgEl('text', { x: mL - 8, y: gy + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
      tk.textContent = yv.toFixed(2); svg.appendChild(tk);
    }
    for (let i = 0; i <= 5; i++) {
      const xv = xLo + (i / 5) * (xHi - xLo);
      const gx = sx(xv);
      const tk = svgEl('text', { x: gx, y: mT + innerH + 18, class: 'ql-tick-label', 'text-anchor': 'middle' });
      tk.textContent = (Math.round(xv * 100) / 100).toString(); svg.appendChild(tk);
    }
    svg.appendChild(svgEl('line', { x1: mL, x2: mL, y1: mT, y2: mT + innerH, class: 'ql-baseline-line' }));
    svg.appendChild(svgEl('line', { x1: mL, x2: W - mR, y1: mT + innerH, y2: mT + innerH, class: 'ql-baseline-line' }));

    // los datos se recortan al área de trazado: con un rango de eje manual más
    // estrecho que los datos, nada se dibuja por encima de ejes ni márgenes
    const clipId = 'ql-clip-temporal';
    const defs = svgEl('defs', {});
    defs.appendChild(svgEl('clipPath', { id: clipId }));
    defs.firstChild.appendChild(svgEl('rect', { x: mL, y: mT, width: W - mL - mR, height: innerH }));
    svg.appendChild(defs);
    const layer = svgEl('g', { 'clip-path': 'url(#' + clipId + ')' });
    svg.appendChild(layer);

    series.forEach((s, si) => {
      const colorVar = CAT_VARS[si % CAT_VARS.length];
      if (s.points.length >= 2 && !s.noLine) {
        const d = s.points.map((p) => sx(p.x) + ',' + sy(p.y)).join(' ');
        layer.appendChild(svgEl('polyline', { points: d, fill: 'none', stroke: 'var(' + colorVar + ')', 'stroke-width': 2, 'data-ce-series-stroke': s.id, 'data-ce-role': 'line', opacity: s.isSpaghetti ? 0.55 : 1 }));
      }
      s.points.forEach((p, pi) => {
        if (o.viewMode === 'mean' && p[errBar] > 0) {
          const y1 = sy(p.y - p[errBar]), y2 = sy(p.y + p[errBar]);
          layer.appendChild(svgEl('line', { x1: sx(p.x), x2: sx(p.x), y1, y2, stroke: 'var(' + colorVar + ')', 'stroke-width': 1.4, 'data-ce-role': 'line', opacity: 0.85 }));
        }
        const c = svgEl('circle', {
          cx: sx(p.x), cy: sy(p.y), r: s.isSpaghetti ? 3 : 4, fill: 'var(' + colorVar + ')', stroke: 'var(--surface)', 'stroke-width': 1, 'data-ce-role': 'marker',
          'data-ce-series-fill': s.id, 'data-si': si, 'data-pi': pi,
        });
        c.addEventListener('mouseenter', () => {
          const lines = [escapeHtml(s.label), o.xCol + ': ' + p.x];
          if (o.viewMode === 'mean') lines.push(o.yLabel + ': ' + p.y.toFixed(3) + ' ± ' + p[errBar].toFixed(3) + ' (n=' + p.n + ')');
          else { lines.push(o.yLabel + ': ' + p.y.toFixed(3)); if (p.sid) lines.push(p.sid); }
          showTooltip(chartWrap, sx(p.x), sy(p.y), '', lines.join('<br>'), { svg, W, H, tooltip, rawHtml: true });
        });
        c.addEventListener('mouseleave', () => hideTooltip(tooltip));
        layer.appendChild(c);
      });
    });

    const xT = svgEl('text', { x: mL + (W - mL - mR) / 2, y: mT + innerH + 44, class: 'ql-axis-label', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
    xT.textContent = o.xCol; svg.appendChild(xT);
    const yT = svgEl('text', { x: 14, y: mT + innerH / 2, class: 'ql-axis-label', 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + (mT + innerH / 2) + ')', 'data-ce': 'ytitle' });
    yT.textContent = o.yLabel || ''; svg.appendChild(yT);

    if (o.groupCol) {
      // en modo individual+spaghetti puede haber varias series por grupo
      // (una por sujeto), todas con el MISMO id 's'+gi a propósito -- la
      // leyenda lista una entrada por GRUPO, no una por sujeto
      const seenIds = new Set();
      const legEntries = [];
      series.forEach((s) => {
        if (seenIds.has(s.id)) return; seenIds.add(s.id);
        const idx = parseInt(s.id.slice(1), 10);
        legEntries.push({ id: s.id, idx, label: o.groups[idx] == null ? t('temporal.allSamples') : String(o.groups[idx]) });
      });
      const legG = svgEl('g', { 'data-ce': 'legend' });
      const perRow = 3, colW = (W - mL - mR) / perRow;
      legEntries.forEach((e, i) => {
        const col = i % perRow, rw = Math.floor(i / perRow);
        const xx = col * colW, yy = rw * 16;
        legG.appendChild(svgEl('rect', { x: xx, y: yy - 8, width: 10, height: 10, rx: 2, fill: 'var(' + CAT_VARS[e.idx % CAT_VARS.length] + ')', 'data-ce-series-fill': e.id }));
        const lt = svgEl('text', { x: xx + 15, y: yy, class: 'ql-tick-label' });
        lt.textContent = e.label;
        legG.appendChild(lt);
      });
      legG.setAttribute('transform', 'translate(' + mL + ',' + (mT + innerH + 60) + ')');
      svg.appendChild(legG);
    }
    return { x: autoX, y: autoY };
  }

  paint();
  const stop = subscribe(paint);
  return () => { stop(); if (editor) { editor.destroy(); editor = null; } };
}
