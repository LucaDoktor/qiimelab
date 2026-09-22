// statAnnotations.js — dibujo de corchetes de significación por pares,
// compartido por groupBoxplot.js (alfa/funcional/diferencial-boxplot),
// microbialCounts.js y correlogram.js. Separado de pairwiseStats.js (que se
// mantiene puro, sin DOM, igual que stats.js) y de groupBoxplot.js (que no
// es el único consumidor). Ver Paso 1 de
// qiimelab-prompt-editor-fase-1-anotaciones-estadisticas.md.

import { svgEl } from './dom.js';
import { formatPStyled } from './pFormat.js';

// asigna cada par a la fila apilada más baja donde no choca en X con otro ya
// colocado — mismo criterio que `step.increase` de ggprism::add_pvalue.
function stackPairs(pairs, xPositions) {
  const rows = []; // rows[k] = [[x1,x2], ...] ya colocados en esa fila
  return pairs.map((pr) => {
    const x1 = Math.min(xPositions[pr.i], xPositions[pr.j]);
    const x2 = Math.max(xPositions[pr.i], xPositions[pr.j]);
    let row = 0;
    while (rows[row] && rows[row].some(([a1, a2]) => x1 < a2 && a1 < x2)) row++;
    (rows[row] = rows[row] || []).push([x1, x2]);
    return { ...pr, x1, x2, row };
  });
}

/**
 * Cuántas filas apiladas ocuparán estos pares una vez filtrados por
 * `hideAbove` — para que quien llama reserve el margen superior ANTES de
 * saber dónde cae `yTop` (drawSignificanceBrackets hace el mismo cálculo
 * internamente al dibujar; esta función no toca el DOM).
 * @param {{i:number,j:number,p:number}[]} pairs
 * @param {number[]} xPositions
 * @param {number} [hideAbove=Infinity]
 * @returns {number}  0 si no hay nada que dibujar
 */
export function countBracketRows(pairs, xPositions, hideAbove = Infinity) {
  const visible = (pairs || []).filter((pr) => isFinite(pr.p) && pr.p <= hideAbove);
  if (!visible.length) return 0;
  return Math.max(...stackPairs(visible, xPositions).map((pr) => pr.row)) + 1;
}

/**
 * Dibuja uno o más corchetes de significación, apilando verticalmente los
 * que se solapan en X — mismo criterio que `step.increase` de
 * ggprism::add_pvalue: cada corchete nuevo ocupa la fila más baja
 * disponible que no choca en X con uno ya colocado en esa fila.
 *
 * @param {SVGElement} svg
 * @param {object} o
 * @param {{i:number, j:number, p:number, label?:string}[]} o.pairs
 *        índices en `xPositions`; si `label` viene dado se usa TAL CUAL
 *        (para reproducir el texto exacto de hoy, p.ej. el corchete
 *        omnibus de Kruskal-Wallis) — si no, se genera con `formatPStyled`.
 * @param {number[]} o.xPositions  centro X de cada grupo/columna
 * @param {number} o.yTop  y del corchete más bajo (el más cercano a los datos)
 * @param {number} [o.rowHeight=26]  separación vertical entre filas apiladas
 * @param {object} [o.pFormat]  opciones para formatPStyled (style/mode/strict/ns)
 *        cuando el par no trae `label` propio
 * @param {number} [o.hideAbove=Infinity]  oculta pares con p > este umbral
 * @returns {{ height: number, topY: number, count: number }}
 *        alto total ocupado (para reservar margen arriba) y la y más alta usada;
 *        count=0 si no se dibujó nada (todos ocultos o `pairs` vacío).
 */
export function drawSignificanceBrackets(svg, o) {
  const { pairs, xPositions, yTop, rowHeight = 26, pFormat = {} } = o;
  const hideAbove = o.hideAbove != null ? o.hideAbove : Infinity;
  const visible = (pairs || []).filter((pr) => isFinite(pr.p) && pr.p <= hideAbove);
  if (!visible.length) return { height: 0, topY: yTop, count: 0 };

  const placed = stackPairs(visible, xPositions);
  const maxRow = Math.max(...placed.map((pr) => pr.row));
  const g = svgEl('g', { 'data-ce': 'sig' });
  placed.forEach((pr) => {
    const by = yTop - pr.row * rowHeight;
    g.appendChild(svgEl('path', {
      d: 'M' + pr.x1 + ' ' + (by + 6) + ' V' + by + ' H' + pr.x2 + ' V' + (by + 6),
      fill: 'none', class: 'ql-baseline-line',
    }));
    const label = pr.label != null ? pr.label : formatPStyled(pr.p, pFormat);
    const txt = svgEl('text', { x: (pr.x1 + pr.x2) / 2, y: by - 5, class: 'ql-axis-label', 'text-anchor': 'middle' });
    txt.textContent = label;
    g.appendChild(txt);
  });
  svg.appendChild(g);

  return { height: (maxRow + 1) * rowHeight + 10, topY: yTop - maxRow * rowHeight, count: placed.length };
}
