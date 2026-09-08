// Boxplot por grupo con test de Kruskal-Wallis y corchete de significación.
// Componente compartido por Diversidad alfa e Índices funcionales — misma
// figura (cajas, jitter, corchete, leyenda) para no reescribirla dos veces.

import { t } from './i18n.js';
import { kruskalWallis, quartiles, formatP } from './stats.js';

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
    let t2 = Math.imul(a ^ (a >>> 15), 1 | a);
    t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
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
 * @param {string}          [o.bracketKey='alpha.kwBracket']  clave i18n {stars} {p}
 * @returns {{ kw: (object|null), W: number, H: number, ceElements: Array }}
 */
export function drawGroupBoxplot(o) {
  const {
    svg, chartWrap, tooltip, groupNames, groupData,
    title, xTitle, yTitle, valueLabel,
  } = o;
  const decimals = o.valueDecimals != null ? o.valueDecimals : 3;
  const bracketKey = o.bracketKey || 'alpha.kwBracket';

  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const kw = groupNames.length >= 2
    ? kruskalWallis(groupNames.map((g) => groupData[g]))
    : null;
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

  const perSample = [];
  groupNames.forEach((g) => groupData[g].forEach((v) => perSample.push(v)));
  const vMin = Math.min(...perSample), vMax = Math.max(...perSample);
  const pad = (vMax - vMin) * 0.15 || 1;
  const yMin = vMin - pad, yMax = vMax + pad;
  const yScale = (v) => marginT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  // gridlines
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = yMin + (i / ticks) * (yMax - yMin);
    const y = yScale(v);
    svg.appendChild(svgEl('line', { x1: marginL, x2: W - marginR, y1: y, y2: y, class: 'ql-gridline' }));
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

    svg.appendChild(svgEl('rect', {
      x: cx - boxW / 2, y: yScale(q3), width: boxW, height: Math.max(1, yScale(q1) - yScale(q3)),
      fill: 'var(' + colorVar + ')', 'fill-opacity': 0.16, stroke: 'var(' + colorVar + ')', 'stroke-width': 1.5, rx: 3,
    }));
    svg.appendChild(svgEl('line', { x1: cx - boxW / 2, x2: cx + boxW / 2, y1: yScale(median), y2: yScale(median), stroke: 'var(' + colorVar + ')', 'stroke-width': 2.5 }));

    vals.forEach((v) => {
      const jitter = (rnd() - 0.5) * boxW * 0.7;
      const c = svgEl('circle', { cx: cx + jitter, cy: yScale(v), r: 3.2, fill: 'var(' + colorVar + ')', opacity: 0.75, stroke: 'var(--surface)', 'stroke-width': 1 });
      c.addEventListener('mouseenter', () => {
        const wrapRect = chartWrap.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        const scaleX = svgRect.width / W, scaleY = svgRect.height / H;
        tooltip.style.left = ((svgRect.left - wrapRect.left) + (cx + jitter) * scaleX) + 'px';
        tooltip.style.top = ((svgRect.top - wrapRect.top) + yScale(v) * scaleY) + 'px';
        tooltip.innerHTML = '<div class="ql-tt-name">' + escapeHtml(String(g)) + '</div><div class="ql-tt-row">' + escapeHtml(valueLabel) + ': ' + v.toFixed(decimals) + '</div>';
        tooltip.classList.add('is-show');
      });
      c.addEventListener('mouseleave', () => tooltip.classList.remove('is-show'));
      svg.appendChild(c);
    });

    const labelT = svgEl('text', { x: cx, y: marginT + innerH + 24, class: 'ql-tick-label', 'text-anchor': 'middle' });
    labelT.textContent = String(g);
    svg.appendChild(labelT);
  });

  // corchete de significación cuando Kruskal-Wallis sale p < 0.05
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
    sigT.textContent = t(bracketKey, { stars, p: formatP(kw.p) });
    gSig.appendChild(sigT);
    svg.appendChild(gSig);
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
    legG.appendChild(svgEl('rect', { x: xx, y: yy - 8, width: 10, height: 10, rx: 2, fill: 'var(' + CAT_VARS[i % CAT_VARS.length] + ')' }));
    const lt = svgEl('text', { x: xx + 15, y: yy, class: 'ql-tick-label' });
    lt.textContent = String(g) + ' (n=' + groupData[g].length + ')';
    legG.appendChild(lt);
  });
  legG.setAttribute('transform', 'translate(' + marginL + ',' + (xLabelBase + 16) + ')');
  svg.appendChild(legG);

  const ceElements = [
    { id: 'title', create: { text: title, x: W / 2, y: 24, anchor: 'middle', cls: 'ce-title' } },
    { id: 'xtitle', selector: '[data-ce="xtitle"]' },
    { id: 'ytitle', selector: '[data-ce="ytitle"]' },
    { id: 'sig', selector: '[data-ce="sig"]', kind: 'group' },
    { id: 'legend', selector: '[data-ce="legend"]', kind: 'group' },
  ];

  return { kw, W, H, ceElements };
}
