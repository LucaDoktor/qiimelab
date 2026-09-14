// Motor de diagramas aluviales (Alluvial/Sankey) en SVG puro.
// Calcula las coordenadas de nodos (rectángulos) y enlaces (curvas de Bézier cúbicas)
// para visualizar flujos y dinámicas de composición taxonómica a través de grupos
// o puntos temporales. Sin dependencias externas.

/**
 * Genera la cadena de comando SVG path (d) para una cinta/flujo aluvial entre dos nodos.
 *
 * Fórmula estricta requerida:
 * M {x0},{y0} C {cx},{y0} {cx},{y1} {x1},{y1} L {x1},{y1+h1} C {cx},{y1+h1} {cx},{y0+h0} {x0},{y0+h0} Z
 * (donde cx = (x0 + x1) / 2).
 *
 * @param {number} x0 - Borde derecho del nodo origen
 * @param {number} y0 - Coordenada superior del flujo en origen
 * @param {number} h0 - Altura del flujo en origen
 * @param {number} x1 - Borde izquierdo del nodo destino
 * @param {number} y1 - Coordenada superior del flujo en destino
 * @param {number} h1 - Altura del flujo en destino
 * @returns {string} Cadena d de comando path SVG
 */
export function buildAlluvialLinkPath(x0, y0, h0, x1, y1, h1) {
  const cx = (x0 + x1) / 2;
  const fx0 = +x0.toFixed(2);
  const fy0 = +y0.toFixed(2);
  const fh0 = +h0.toFixed(2);
  const fx1 = +x1.toFixed(2);
  const fy1 = +y1.toFixed(2);
  const fh1 = +h1.toFixed(2);
  const fcx = +cx.toFixed(2);

  const y1_h1 = +(fy1 + fh1).toFixed(2);
  const y0_h0 = +(fy0 + fh0).toFixed(2);

  return `M ${fx0},${fy0} C ${fcx},${fy0} ${fcx},${fy1} ${fx1},${fy1} L ${fx1},${y1_h1} C ${fcx},${y1_h1} ${fcx},${y0_h0} ${fx0},${y0_h0} Z`;
}

/**
 * Calcula la matriz taxonómica promediada por grupos a partir de las filas de abundancia.
 *
 * @param {Array<Object>} rows - Filas de la tabla (muestras)
 * @param {string} sampleKey - Nombre de la clave de muestra
 * @param {Array<string>} taxonHeaders - Encabezados de taxones
 * @param {Function} [resolveGroup] - Función (sampleId) => groupName
 * @param {Object} [opts] - Opciones (preAggOtherHeaders, otherTaxa)
 * @returns {{ groups: string[], matrix: Object.<string, Object.<string, number>>, sampleCounts: Object.<string, number> }}
 */
export function computeGroupTaxaMatrix(rows, sampleKey, taxonHeaders, resolveGroup, opts = {}) {
  const preAggOther = opts.preAggOtherHeaders || [];
  const otherTaxa = new Set(opts.otherTaxa || []);
  const hasOther = otherTaxa.size > 0 || preAggOther.length > 0;

  const rowSum = (row) => {
    let sum = 0;
    for (let i = 0; i < taxonHeaders.length; i++) {
      sum += parseFloat(row[taxonHeaders[i]]) || 0;
    }
    for (let i = 0; i < preAggOther.length; i++) {
      sum += parseFloat(row[preAggOther[i]]) || 0;
    }
    return sum;
  };

  const groupValues = {};
  const groupCounts = {};

  rows.forEach((row) => {
    const sampleId = String(row[sampleKey] || '').trim();
    const group = (resolveGroup ? resolveGroup(sampleId) : '') || sampleId || 'Muestra';
    if (!group) return;

    groupCounts[group] = (groupCounts[group] || 0) + 1;
    if (!groupValues[group]) groupValues[group] = {};

    const total = rowSum(row) || 1;

    let otherVal = 0;
    taxonHeaders.forEach((th) => {
      const v = (parseFloat(row[th]) || 0) / total;
      if (otherTaxa.has(th)) {
        otherVal += v;
      } else {
        if (!groupValues[group][th]) groupValues[group][th] = [];
        groupValues[group][th].push(v);
      }
    });

    preAggOther.forEach((poh) => {
      otherVal += (parseFloat(row[poh]) || 0) / total;
    });

    if (hasOther) {
      if (!groupValues[group]['__other__']) groupValues[group]['__other__'] = [];
      groupValues[group]['__other__'].push(otherVal);
    }
  });

  const groups = Object.keys(groupValues).sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  );

  const matrix = {};
  groups.forEach((g) => {
    matrix[g] = {};
    const gVals = groupValues[g];
    let sumMeans = 0;
    for (const key in gVals) {
      const arr = gVals[key];
      const mean = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
      matrix[g][key] = mean;
      sumMeans += mean;
    }
    if (sumMeans > 0) {
      for (const key in matrix[g]) {
        matrix[g][key] = matrix[g][key] / sumMeans;
      }
    }
  });

  return { groups, matrix, sampleCounts: groupCounts };
}

/**
 * Calcula el diseño y coordenadas de nodos y enlaces para un diagrama aluvial en SVG.
 *
 * @param {Object} input - { groups: string[], taxa: Array<{ key, label, colorVar }>, matrix: Object, sampleCounts?: Object }
 * @param {Object} [options] - Opciones geométricas ({ width, height, margin, nodeWidth, nodeGap })
 * @returns {Object} { nodes: Array, links: Array, columns: Array, width: number, height: number }
 */
export function computeAlluvialLayout(input, options = {}) {
  const groups = input.groups || [];
  const taxa = input.taxa || [];
  const matrix = input.matrix || {};
  const sampleCounts = input.sampleCounts || {};

  const width = Math.max(300, options.width || 800);
  const height = Math.max(200, options.height || 420);
  const margin = Object.assign({ top: 40, right: 35, bottom: 50, left: 45 }, options.margin);
  const nodeWidth = options.nodeWidth || 20;
  const nodeGap = typeof options.nodeGap === 'number' ? options.nodeGap : 2;

  const usableWidth = Math.max(10, width - margin.left - margin.right);
  const usableHeight = Math.max(10, height - margin.top - margin.bottom);

  const numGroups = groups.length;
  const stepX = numGroups > 1 ? (usableWidth - nodeWidth) / (numGroups - 1) : 0;

  const columns = [];
  const nodes = [];
  const nodesByGroupAndTaxon = {};

  // 1. Nodos de cada columna
  for (let j = 0; j < numGroups; j++) {
    const group = groups[j];
    const colX = margin.left + j * stepX;
    nodesByGroupAndTaxon[j] = {};

    columns.push({
      group,
      index: j,
      x: colX,
      width: nodeWidth,
      sampleCount: sampleCounts[group] || 0,
    });

    const gValues = matrix[group] || {};
    let sumVal = 0;
    let presentCount = 0;
    taxa.forEach((tax) => {
      const v = Math.max(0, parseFloat(gValues[tax.key]) || 0);
      sumVal += v;
      if (v > 0) presentCount++;
    });

    const totalGaps = Math.max(0, presentCount - 1) * nodeGap;
    const effectiveHeight = Math.max(0, usableHeight - totalGaps);

    let currentY = margin.top;
    for (let i = 0; i < taxa.length; i++) {
      const tax = taxa[i];
      const val = Math.max(0, parseFloat(gValues[tax.key]) || 0);
      const frac = sumVal > 0 ? val / sumVal : 0;
      const nodeH = frac > 0 ? Math.max(1, frac * effectiveHeight) : 0;

      const node = {
        id: `node_${j}_${tax.key}`,
        taxonKey: tax.key,
        taxonLabel: tax.label,
        colorVar: tax.colorVar,
        color: tax.color || '',
        group,
        groupIndex: j,
        x: colX,
        y: currentY,
        width: nodeWidth,
        height: nodeH,
        value: val,
        fraction: frac,
      };

      nodes.push(node);
      nodesByGroupAndTaxon[j][tax.key] = node;

      if (nodeH > 0) {
        currentY += nodeH + nodeGap;
      }
    }
  }

  // 2. Enlaces entre columnas consecutivas
  const links = [];
  for (let j = 0; j < numGroups - 1; j++) {
    const srcGroup = groups[j];
    const tgtGroup = groups[j + 1];

    for (let i = 0; i < taxa.length; i++) {
      const tax = taxa[i];
      const srcNode = nodesByGroupAndTaxon[j][tax.key];
      const tgtNode = nodesByGroupAndTaxon[j + 1][tax.key];

      if (!srcNode || !tgtNode) continue;
      if (srcNode.height <= 0 && tgtNode.height <= 0) continue;

      const x0 = srcNode.x + srcNode.width;
      const y0 = srcNode.y;
      const h0 = srcNode.height;

      const x1 = tgtNode.x;
      const y1 = tgtNode.y;
      const h1 = tgtNode.height;

      const d = buildAlluvialLinkPath(x0, y0, h0, x1, y1, h1);

      links.push({
        id: `link_${j}_${j + 1}_${tax.key}`,
        taxonKey: tax.key,
        taxonLabel: tax.label,
        colorVar: tax.colorVar,
        color: tax.color || '',
        sourceGroup: srcGroup,
        targetGroup: tgtGroup,
        sourceIndex: j,
        targetIndex: j + 1,
        x0, y0, h0,
        x1, y1, h1,
        cx: (x0 + x1) / 2,
        d,
        sourceValue: srcNode.value,
        targetValue: tgtNode.value,
        sourceFraction: srcNode.fraction,
        targetFraction: tgtNode.fraction,
      });
    }
  }

  return {
    nodes,
    links,
    columns,
    width,
    height,
    margin,
  };
}
