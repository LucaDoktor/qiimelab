// Boxplot por grupo con test de Kruskal-Wallis (omnibus, informativo) y
// corchetes de significación POR PARES — Mann-Whitney con 2 grupos, Dunn
// post-hoc (+ ajuste de p elegido en el editor) con ≥3. Componente
// compartido por Diversidad alfa, Índices funcionales y Abundancia
// diferencial (vista cajas) — misma figura para no reescribirla tres veces.
// Ver Paso 2 de qiimelab-prompt-editor-fase-1-anotaciones-estadisticas.md.

import { kruskalWallis, quartiles } from './stats.js';
import { mannWhitneyU, dunnTest } from './pairwiseStats.js';
import { svgEl } from './dom.js';
import { showTooltip, hideTooltip } from './tooltip.js';
import { drawSignificanceBrackets, countBracketRows } from './statAnnotations.js';
import { getStatsOptions, getFigureOptions } from './chartEditor.js';

// paleta categórica por grupo — la misma en boxplot, curvas de rarefacción, etc.
export const CAT_VARS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7'];
/** Color CSS del grupo nº `i` (cicla si hay más de 7 grupos, como el resto de la app). */
export function groupColor(i) { return 'var(' + CAT_VARS[i % CAT_VARS.length] + ')'; }
/** PRNG determinista de 32 bits (mulberry32) — misma semilla, misma secuencia.
 *  Compartido: jitter del boxplot, posiciones iniciales del layout de fuerzas… */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t2 = Math.imul(a ^ (a >>> 15), 1 | a);
    t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
}

/** Etiqueta localizada (es/en, resto cae a es — mismo criterio que el resto
 *  de la app) de una posición predefinida de leyenda (Paso 4/G6). Este
 *  archivo no importa js/lib/i18n.js (es una librería de dibujo compartida,
 *  no un módulo de página), así que las 3 palabras que hacen falta viven
 *  aquí mismo en vez de forzar una dependencia nueva para tan poco texto. */
export function legendPositionLabel(id, lang) {
  const dict = {
    es: { bottom: 'Abajo', top: 'Arriba', right: 'Derecha' },
    en: { bottom: 'Bottom', top: 'Top', right: 'Right' },
  };
  return (dict[lang] || dict.es)[id] || id;
}

/** Comparaciones por pares: Mann-Whitney directo con exactamente 2 grupos
 *  (más simple que un post-hoc de Dunn con un solo par, y es lo que un
 *  usuario esperaría ver coincidir con un wilcox.test hecho a mano en R);
 *  Dunn post-hoc + el método de ajuste elegido con ≥3. `p` ya viene
 *  ajustado — drawSignificanceBrackets no vuelve a tocarlo. */
function computeSignificancePairs(groupNames, groupData, method) {
  if (groupNames.length === 2) {
    const mw = mannWhitneyU(groupData[groupNames[0]], groupData[groupNames[1]]);
    return [{ i: 0, j: 1, p: mw.p }];
  }
  if (groupNames.length >= 3) {
    const dt = dunnTest(groupNames.map((g) => ({ label: g, values: groupData[g] })));
    return dt.comparisons.map((c) => ({ i: groupNames.indexOf(c.a), j: groupNames.indexOf(c.b), p: c.adj[method] }));
  }
  return [];
}

/** Orden de categorías (Paso 2/G4 de qiimelab-prompt-editor-fase-4-ejes-
 *  rejilla-leyenda-lienzo.md) — 'original' (por defecto, tal como llega
 *  `groupNames`), alfabético A-Z/Z-A, o por la MEDIANA del grupo ascendente/
 *  descendente (no la media: mismo criterio robusto a outliers que ya usa
 *  el resto del boxplot). Devuelve un array NUEVO, no reordena in situ. */
function applyCategoryOrder(groupNames, groupData, orderMode) {
  if (!orderMode || orderMode === 'original') return groupNames;
  const medianOf = (g) => {
    const v = groupData[g].slice().sort((a, b) => a - b);
    const n = v.length;
    if (!n) return NaN;
    return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  };
  const arr = groupNames.slice();
  if (orderMode === 'alpha-asc') arr.sort((a, b) => String(a).localeCompare(String(b)));
  else if (orderMode === 'alpha-desc') arr.sort((a, b) => String(b).localeCompare(String(a)));
  else if (orderMode === 'value-asc') arr.sort((a, b) => medianOf(a) - medianOf(b));
  else if (orderMode === 'value-desc') arr.sort((a, b) => medianOf(b) - medianOf(a));
  return arr;
}

/** Kruskal-Wallis omnibus (se sigue mostrando en el cuadro de estadística de
 *  cada módulo — "¿hay ALGUNA diferencia?" — junto a los corchetes por
 *  pares, que responden "¿ENTRE QUÉ grupos?": son preguntas distintas, no
 *  hace falta elegir una). Opciones de anotación (Paso 3): modo/estilo/
 *  umbral/método de ajuste, persistidas por `key` en el editor de gráficos.
 *  Devuelve también las `xPositions`/`marginT`/`marginL`/`slotW` ya
 *  reservando sitio para las filas de corchetes que hagan falta — antes de
 *  saber cuántas hay no se puede fijar el margen superior del gráfico. */
function computeGroupStats(groupNames, groupData, key) {
  const kw = groupNames.length >= 2 ? kruskalWallis(groupNames.map((g) => groupData[g])) : null;

  const statsOpts = getStatsOptions(key);
  const mode = statsOpts.mode || 'stars+exact';
  const style = statsOpts.style || 'gp';
  const threshold = statsOpts.threshold != null ? statsOpts.threshold : 0.05;
  const method = statsOpts.method || 'holm';
  const sigPairs = computeSignificancePairs(groupNames, groupData, method);

  const marginL = 52, slotW = 140, rowHeight = 26;
  const xPositions = groupNames.map((_, gi) => marginL + slotW * gi + slotW / 2);
  const bracketRows = countBracketRows(sigPairs, xPositions, threshold);
  const marginT = bracketRows ? 44 + (bracketRows - 1) * rowHeight + 24 : 44;

  return { kw, sigPairs, mode, style, threshold, rowHeight, marginT, marginL, slotW, xPositions };
}

/**
 * Dibuja el boxplot por grupo dentro de `svg` (que se vacía primero).
 *
 * @param {object} o
 * @param {SVGSVGElement}   o.svg
 * @param {HTMLElement}     o.chartWrap   contenedor posicionado (para el tooltip)
 * @param {HTMLElement}     o.tooltip     .ql-tooltip
 * @param {string[]}        o.groupNames  orden de los grupos en el eje X
 * @param {Object.<string, number[]>} o.groupData  valores por grupo
 * @param {string}          o.title       título de la figura
 * @param {string}          o.xTitle      rótulo del eje X
 * @param {string}          o.yTitle      rótulo del eje Y
 * @param {string}          o.valueLabel  etiqueta del valor en el tooltip
 * @param {number}          [o.valueDecimals=3]
 * @param {string}          o.key  clave de persistencia del editor de gráficos
 *        (misma que se pasará a `attachChartEditor` — de aquí lee las
 *        opciones de anotación estadística del Paso 3, ANTES de calcular
 *        qué pares mostrar)
 * @returns {{ kw: (object|null), W: number, H: number, ceElements: Array,
 *             paletteSeries: Array, statsControls: {hasMultiGroup: boolean} }}
 */
export function drawGroupBoxplot(o) {
  const {
    svg, chartWrap, tooltip, groupData,
    title, xTitle, yTitle, valueLabel,
  } = o;
  const decimals = o.valueDecimals != null ? o.valueDecimals : 3;
  // Paso 2/G4 de qiimelab-prompt-editor-fase-4-ejes-rejilla-leyenda-lienzo.md
  const structOpts = getFigureOptions(o.key);
  const groupNames = applyCategoryOrder(o.groupNames, groupData, structOpts.categoryOrder);

  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const { kw, sigPairs, mode, style, threshold, rowHeight, marginT, marginL, slotW, xPositions } =
    computeGroupStats(groupNames, groupData, o.key);

  const legCols = groupNames.length > 5 ? 2 : 1;
  const legRows = Math.ceil(groupNames.length / legCols);
  const marginR = 20;
  const marginB = 58 + legRows * 15;
  const innerH = 360;
  const W = Math.max(marginL + marginR + slotW * groupNames.length, 420);
  const H = marginT + innerH + marginB;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

  const perSample = [];
  groupNames.forEach((g) => groupData[g].forEach((v) => perSample.push(v)));
  const vMin = Math.min(...perSample), vMax = Math.max(...perSample);
  const pad = (vMax - vMin) * 0.15 || 1;
  // G4: min/max manual del panel "Estructura" — sobrescribe el rango
  // auto-calculado con margen, no lo compone con él (si el usuario fija un
  // mínimo, es EL mínimo, no "el mínimo de los datos con más margen encima").
  const yMin = structOpts.axisMin != null ? structOpts.axisMin : vMin - pad;
  const yMax = structOpts.axisMax != null ? structOpts.axisMax : vMax + pad;
  const yScale = (v) => marginT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  // gridlines (mayor + G5 menor opcional, un punto medio entre cada par de
  // mayores — más tenue vía opacidad, sin necesitar una clase de rol nueva)
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = yMin + (i / ticks) * (yMax - yMin);
    const y = yScale(v);
    svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, class: 'ql-gridline' }));
    if (structOpts.gridMinor && i < ticks) {
      const yMid = yScale(v + (yMax - yMin) / ticks / 2);
      svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: yMid, y2: yMid, class: 'ql-gridline', opacity: 0.45 }));
    }
    const tk = svgEl('text', { x: marginL - 8, y: y + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
    tk.textContent = v.toFixed(2);
    svg.appendChild(tk);
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

    svg.appendChild(svgEl('line', { x1: cx, x2: cx, y1: yScale(whiskerLo), y2: yScale(q1), class: 'ql-baseline-line' }));
    svg.appendChild(svgEl('line', { x1: cx, x2: cx, y1: yScale(q3), y2: yScale(whiskerHi), class: 'ql-baseline-line' }));
    svg.appendChild(svgEl('line', { x1: cx - 10, x2: cx + 10, y1: yScale(whiskerLo), y2: yScale(whiskerLo), class: 'ql-baseline-line' }));
    svg.appendChild(svgEl('line', { x1: cx - 10, x2: cx + 10, y1: yScale(whiskerHi), y2: yScale(whiskerHi), class: 'ql-baseline-line' }));

    const seriesId = 's' + gi;
    svg.appendChild(svgEl('rect', {
      x: cx - boxW / 2, y: yScale(q3), width: boxW, height: Math.max(1, yScale(q1) - yScale(q3)),
      fill: 'var(' + colorVar + ')', 'fill-opacity': 0.16, stroke: 'var(' + colorVar + ')', 'stroke-width': 1.5, rx: 3,
      'data-ce-series-fill': seriesId, 'data-ce-series-stroke': seriesId,
    }));
    svg.appendChild(svgEl('line', {
      x1: cx - boxW / 2, x2: cx + boxW / 2, y1: yScale(median), y2: yScale(median), stroke: 'var(' + colorVar + ')', 'stroke-width': 2.5,
      'data-ce-series-stroke': seriesId,
    }));

    vals.forEach((v) => {
      const jitter = (rnd() - 0.5) * boxW * 0.7;
      const c = svgEl('circle', {
        cx: cx + jitter, cy: yScale(v), r: 3.2, fill: 'var(' + colorVar + ')', opacity: 0.75, stroke: 'var(--surface)', 'stroke-width': 1,
        'data-ce-series-fill': seriesId,
      });
      c.addEventListener('mouseenter', () => {
        showTooltip(chartWrap, cx + jitter, yScale(v), String(g), valueLabel + ': ' + v.toFixed(decimals), {
          svg, W, H, tooltip,
        });
      });
      c.addEventListener('mouseleave', () => hideTooltip(tooltip));
      svg.appendChild(c);
    });

    const labelT = svgEl('text', { x: cx, y: marginT + innerH + 24, class: 'ql-tick-label', 'text-anchor': 'middle' });
    labelT.textContent = String(g);
    svg.appendChild(labelT);
  });

  // corchetes de significación por pares (Mann-Whitney con 2 grupos, Dunn
  // post-hoc con ≥3 — ver computeSignificancePairs) — cero, uno o varios,
  // apilados si hace falta; formato/umbral/método ya resueltos en
  // computeGroupStats desde las opciones persistidas (Paso 3).
  if (sigPairs.length) {
    drawSignificanceBrackets(svg, {
      pairs: sigPairs, xPositions, yTop: marginT - 16, rowHeight,
      hideAbove: threshold, pFormat: { style, mode },
    });
  }

  const yT = svgEl('text', {
    x: 14, y: marginT + innerH / 2, class: 'ql-axis-label', 'text-anchor': 'middle',
    transform: 'rotate(-90 14 ' + (marginT + innerH / 2) + ')', 'data-ce': 'ytitle',
  });
  yT.textContent = yTitle;
  svg.appendChild(yT);

  const xLabelBase = marginT + innerH + 44;
  const xT = svgEl('text', { x: marginL + (W - marginL - marginR) / 2, y: xLabelBase, class: 'ql-axis-label', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
  xT.textContent = xTitle || '';
  svg.appendChild(xT);

  const legG = svgEl('g', { 'data-ce': 'legend' });
  const colW = Math.min(260, (W - marginL - marginR) / legCols);
  groupNames.forEach((g, i) => {
    const col = Math.floor(i / legRows), rw = i % legRows;
    const xx = col * colW, yy = rw * 15;
    legG.appendChild(svgEl('rect', {
      x: xx, y: yy - 8, width: 10, height: 10, rx: 2, fill: 'var(' + CAT_VARS[i % CAT_VARS.length] + ')',
      'data-ce-series-fill': 's' + i,
    }));
    const lt = svgEl('text', { x: xx + 15, y: yy, class: 'ql-tick-label' });
    lt.textContent = String(g) + ' (n=' + groupData[g].length + ')';
    legG.appendChild(lt);
  });
  const legNaturalX = marginL, legNaturalY = xLabelBase + 16;
  legG.setAttribute('transform', 'translate(' + legNaturalX + ',' + legNaturalY + ')');
  svg.appendChild(legG);

  const ceElements = [
    { id: 'title', create: { text: title, x: W / 2, y: 24, anchor: 'middle', cls: 'ce-title' } },
    { id: 'xtitle', selector: '[data-ce="xtitle"]' },
    { id: 'ytitle', selector: '[data-ce="ytitle"]' },
    { id: 'sig', selector: '[data-ce="sig"]', kind: 'group' },
    { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
  ];
  // una serie por grupo — para el selector de paleta del editor de gráficos
  const paletteSeries = groupNames.map((g, i) => ({ id: 's' + i, label: String(g) }));

  return {
    kw, W, H, ceElements, paletteSeries, statsControls: { hasMultiGroup: groupNames.length >= 3 },
    // Paso 4/G4-G5-G6 (qiimelab-prompt-editor-fase-4-ejes-rejilla-leyenda-
    // lienzo.md): el módulo que llama solo tiene que repartir esto en su
    // attachChartEditor({ ...figureOptions, legendPositions: ... }) — no
    // hace falta más código en cada uno de los 4 consumidores.
    figureOptions: { axis: { domain: [vMin - pad, vMax + pad] }, categoryOrder: true, gridMinor: true },
    legendPositions: legendPresetPositions(legNaturalX, legNaturalY, { marginL, marginT, marginR, innerH, W, colW }),
  };
}

/** 3 posiciones predefinidas de leyenda (Paso 4/G6) relativas a la posición
 *  NATURAL en la que cada draw* ya la coloca (abajo del eje X) — 'bottom'
 *  siempre es {dx:0,dy:0} (la posición de siempre), 'top'/'right' se
 *  calculan a partir del layout real de ESTE pintado concreto (no valores
 *  fijos) para que encajen razonablemente con cualquier tamaño de gráfico. */
function legendPresetPositions(naturalX, naturalY, geo) {
  const topY = 34; // justo debajo del título (y=24)
  const rightX = Math.max(geo.marginL, geo.W - geo.marginR - geo.colW);
  const midY = geo.marginT + geo.innerH / 2 - 20;
  return [
    { id: 'bottom', dx: 0, dy: 0 },
    { id: 'top', dx: 0, dy: topY - naturalY },
    { id: 'right', dx: rightX - naturalX, dy: midY - naturalY },
  ];
}

/**
 * Alternativa a `drawGroupBoxplot`: solo los puntos individuales (con
 * dispersión horizontal) y una marca de mediana por grupo — sin caja ni
 * bigotes. Con pocas réplicas por grupo (habitual en ensayos de laboratorio)
 * una caja de cuartiles puede sugerir una forma de distribución que 3-4
 * puntos no sostienen; esta vista deja ver los valores reales sin ese
 * resumen. Mismo test de Kruskal-Wallis, mismo corchete de significación,
 * misma firma de entrada/salida que `drawGroupBoxplot` — un módulo puede
 * alternar entre las dos sin tocar nada más que la llamada.
 *
 * @param {object} o  mismos parámetros que `drawGroupBoxplot` (incl. `o.key`)
 * @returns {{ kw: (object|null), W: number, H: number, ceElements: Array,
 *             paletteSeries: Array, statsControls: {hasMultiGroup: boolean} }}
 */
export function drawGroupStripPlot(o) {
  const {
    svg, chartWrap, tooltip, groupData,
    title, xTitle, yTitle, valueLabel,
  } = o;
  const decimals = o.valueDecimals != null ? o.valueDecimals : 3;
  const structOpts = getFigureOptions(o.key);
  const groupNames = applyCategoryOrder(o.groupNames, groupData, structOpts.categoryOrder);

  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const { kw, sigPairs, mode, style, threshold, rowHeight, marginT, marginL, slotW, xPositions } =
    computeGroupStats(groupNames, groupData, o.key);

  const legCols = groupNames.length > 5 ? 2 : 1;
  const legRows = Math.ceil(groupNames.length / legCols);
  const marginR = 20;
  const marginB = 58 + legRows * 15;
  const innerH = 360;
  const W = Math.max(marginL + marginR + slotW * groupNames.length, 420);
  const H = marginT + innerH + marginB;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

  const perSample = [];
  groupNames.forEach((g) => groupData[g].forEach((v) => perSample.push(v)));
  const vMin = Math.min(...perSample), vMax = Math.max(...perSample);
  const pad = (vMax - vMin) * 0.15 || 1;
  const yMin = structOpts.axisMin != null ? structOpts.axisMin : vMin - pad;
  const yMax = structOpts.axisMax != null ? structOpts.axisMax : vMax + pad;
  const yScale = (v) => marginT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = yMin + (i / ticks) * (yMax - yMin);
    const y = yScale(v);
    svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, class: 'ql-gridline' }));
    if (structOpts.gridMinor && i < ticks) {
      const yMid = yScale(v + (yMax - yMin) / ticks / 2);
      svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: yMid, y2: yMid, class: 'ql-gridline', opacity: 0.45 }));
    }
    const tk = svgEl('text', { x: marginL - 8, y: y + 3, class: 'ql-tick-label', 'text-anchor': 'end' });
    tk.textContent = v.toFixed(2);
    svg.appendChild(tk);
  }
  svg.appendChild(svgEl('line', { x1: marginL, x2: marginL, y1: marginT, y2: marginT + innerH, class: 'ql-baseline-line' }));

  const rnd = mulberry32(42);
  groupNames.forEach((g, gi) => {
    const cx = marginL + slotW * gi + slotW / 2;
    const vals = groupData[g].slice().sort((a, b) => a - b);
    const median = vals.length % 2
      ? vals[(vals.length - 1) / 2]
      : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
    const colorVar = CAT_VARS[gi % CAT_VARS.length];
    const jitterW = 60;

    const seriesId = 's' + gi;
    // marca de mediana — un trazo, no una caja: no implica cuartiles
    svg.appendChild(svgEl('line', {
      x1: cx - 18, x2: cx + 18, y1: yScale(median), y2: yScale(median),
      stroke: 'var(' + colorVar + ')', 'stroke-width': 2.5, 'data-ce-series-stroke': seriesId,
    }));

    vals.forEach((v) => {
      const jitter = (rnd() - 0.5) * jitterW;
      const c = svgEl('circle', {
        cx: cx + jitter, cy: yScale(v), r: 4, fill: 'var(' + colorVar + ')', opacity: 0.8, stroke: 'var(--surface)', 'stroke-width': 1,
        'data-ce-series-fill': seriesId,
      });
      c.addEventListener('mouseenter', () => {
        showTooltip(chartWrap, cx + jitter, yScale(v), String(g), valueLabel + ': ' + v.toFixed(decimals), {
          svg, W, H, tooltip,
        });
      });
      c.addEventListener('mouseleave', () => hideTooltip(tooltip));
      svg.appendChild(c);
    });

    const labelT = svgEl('text', { x: cx, y: marginT + innerH + 24, class: 'ql-tick-label', 'text-anchor': 'middle' });
    labelT.textContent = String(g);
    svg.appendChild(labelT);
  });

  if (sigPairs.length) {
    drawSignificanceBrackets(svg, {
      pairs: sigPairs, xPositions, yTop: marginT - 16, rowHeight,
      hideAbove: threshold, pFormat: { style, mode },
    });
  }

  const yT = svgEl('text', {
    x: 14, y: marginT + innerH / 2, class: 'ql-axis-label', 'text-anchor': 'middle',
    transform: 'rotate(-90 14 ' + (marginT + innerH / 2) + ')', 'data-ce': 'ytitle',
  });
  yT.textContent = yTitle;
  svg.appendChild(yT);

  const xLabelBase = marginT + innerH + 44;
  const xT = svgEl('text', { x: marginL + (W - marginL - marginR) / 2, y: xLabelBase, class: 'ql-axis-label', 'text-anchor': 'middle', 'data-ce': 'xtitle' });
  xT.textContent = xTitle || '';
  svg.appendChild(xT);

  const legG = svgEl('g', { 'data-ce': 'legend' });
  const colW = Math.min(260, (W - marginL - marginR) / legCols);
  groupNames.forEach((g, i) => {
    const col = Math.floor(i / legRows), rw = i % legRows;
    const xx = col * colW, yy = rw * 15;
    legG.appendChild(svgEl('rect', {
      x: xx, y: yy - 8, width: 10, height: 10, rx: 2, fill: 'var(' + CAT_VARS[i % CAT_VARS.length] + ')',
      'data-ce-series-fill': 's' + i,
    }));
    const lt = svgEl('text', { x: xx + 15, y: yy, class: 'ql-tick-label' });
    lt.textContent = String(g) + ' (n=' + groupData[g].length + ')';
    legG.appendChild(lt);
  });
  const legNaturalX = marginL, legNaturalY = xLabelBase + 16;
  legG.setAttribute('transform', 'translate(' + legNaturalX + ',' + legNaturalY + ')');
  svg.appendChild(legG);

  const ceElements = [
    { id: 'title', create: { text: title, x: W / 2, y: 24, anchor: 'middle', cls: 'ce-title' } },
    { id: 'xtitle', selector: '[data-ce="xtitle"]' },
    { id: 'ytitle', selector: '[data-ce="ytitle"]' },
    { id: 'sig', selector: '[data-ce="sig"]', kind: 'group' },
    { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
  ];
  const paletteSeries = groupNames.map((g, i) => ({ id: 's' + i, label: String(g) }));

  return {
    kw, W, H, ceElements, paletteSeries, statsControls: { hasMultiGroup: groupNames.length >= 3 },
    figureOptions: { axis: { domain: [vMin - pad, vMax + pad] }, categoryOrder: true, gridMinor: true },
    legendPositions: legendPresetPositions(legNaturalX, legNaturalY, { marginL, marginT, marginR, innerH, W, colW }),
  };
}
