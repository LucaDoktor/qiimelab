// Construcción del árbol por Neighbor-Joining (Saitou & Nei 1987) a partir
// de una matriz de distancias — NO UPGMA (UPGMA asume reloj molecular
// constante, poco apropiado para secuencias de estudios/orígenes distintos).
//
// `neighborJoining()` es una función PURA (matriz de distancias + etiquetas
// -> árbol), aislada a propósito: así, si en el futuro se añade soporte
// bootstrap, basta con remuestrear columnas del alineamiento, recalcular la
// matriz de distancias y volver a llamar a esta misma función N veces — no
// hace falta tocar nada de aquí ni construir esa infraestructura ahora.
//
// Verificado frente a `ape::nj()` con el ejemplo de 5 taxones publicado en
// la entrada de Wikipedia "Neighbor joining" (mismos topología y longitudes
// de rama exactas) — ver tests/stats/neighborjoining.mjs.
//
// Forma del árbol: nodo = { id, label (string|null; null en internos),
// children: [{ node, length }, ...] }. Un árbol NJ es propiamente NO
// enraizado; aquí se representa con una trifurcación en la raíz (3 hijos)
// cuando hay >= 3 taxones — es la convención estándar (la usa por ejemplo
// `ape::nj()`), no una raíz artificial partiendo en dos la última rama.

/**
 * @param {number[][]} distMatrix matriz de distancias cuadrada
 * @param {string[]} labels
 * @returns {object} nodo raíz del árbol
 */
export function neighborJoining(distMatrix, labels) {
  const n = labels.length;
  if (n < 2) throw new Error('se necesitan al menos 2 secuencias para construir un árbol');

  const nodesById = new Map();
  labels.forEach((label, i) => nodesById.set(i, { id: i, label, children: [] }));
  let nextId = n;

  if (n === 2) {
    const d = distMatrix[0][1];
    return {
      id: nextId, label: null,
      children: [
        { node: nodesById.get(0), length: d / 2 },
        { node: nodesById.get(1), length: d / 2 },
      ],
    };
  }

  const dist = new Map();
  for (let i = 0; i < n; i++) {
    dist.set(i, new Map());
    for (let j = 0; j < n; j++) if (i !== j) dist.get(i).set(j, distMatrix[i][j]);
  }
  let activeIds = Array.from({ length: n }, (_, i) => i);

  while (activeIds.length > 3) {
    const r = activeIds.length;
    const rowSum = new Map();
    for (const i of activeIds) {
      let s = 0;
      for (const j of activeIds) if (j !== i) s += dist.get(i).get(j);
      rowSum.set(i, s);
    }
    let bestI = -1, bestJ = -1, bestQ = Infinity;
    for (let a = 0; a < activeIds.length; a++) {
      for (let b = a + 1; b < activeIds.length; b++) {
        const i = activeIds[a], j = activeIds[b];
        const q = (r - 2) * dist.get(i).get(j) - rowSum.get(i) - rowSum.get(j);
        if (q < bestQ) { bestQ = q; bestI = i; bestJ = j; }
      }
    }
    const dij = dist.get(bestI).get(bestJ);
    const li = 0.5 * dij + (rowSum.get(bestI) - rowSum.get(bestJ)) / (2 * (r - 2));
    const lj = dij - li;
    const newId = nextId++;
    nodesById.set(newId, {
      id: newId, label: null,
      children: [
        { node: nodesById.get(bestI), length: li },
        { node: nodesById.get(bestJ), length: lj },
      ],
    });
    const newDist = new Map();
    for (const k of activeIds) {
      if (k === bestI || k === bestJ) continue;
      const dk = 0.5 * (dist.get(bestI).get(k) + dist.get(bestJ).get(k) - dij);
      newDist.set(k, dk);
      dist.get(k).set(newId, dk);
    }
    dist.set(newId, newDist);
    activeIds = activeIds.filter((x) => x !== bestI && x !== bestJ);
    activeIds.push(newId);
  }

  const [p, q, rId] = activeIds;
  const dpq = dist.get(p).get(q), dpr = dist.get(p).get(rId), dqr = dist.get(q).get(rId);
  const lp = (dpq + dpr - dqr) / 2, lq = (dpq + dqr - dpr) / 2, lr = (dpr + dqr - dpq) / 2;
  return {
    id: nextId, label: null,
    children: [
      { node: nodesById.get(p), length: lp },
      { node: nodesById.get(q), length: lq },
      { node: nodesById.get(rId), length: lr },
    ],
  };
}

/** Hojas del árbol en orden de recorrido (izquierda a derecha) — orden de dibujo. */
export function collectLeaves(node, out) {
  out = out || [];
  if (!node.children.length) { out.push(node); return out; }
  for (const ch of node.children) collectLeaves(ch.node, out);
  return out;
}

/**
 * Profundidad acumulada (suma de longitudes de rama desde la raíz) de cada
 * nodo. Las longitudes negativas (artefacto conocido de NJ con datos
 * ruidosos) se recortan a 0 SOLO para esta profundidad de dibujo — el valor
 * real se conserva en el árbol y en el Newick exportado.
 * @returns {{ depths: Map<number,number>, clipped: number, maxDepth: number }}
 */
export function computeDrawDepths(root) {
  const depths = new Map();
  let clipped = 0, maxDepth = 0;
  depths.set(root.id, 0);
  function recurse(node, depth) {
    for (const { node: child, length } of node.children) {
      const len = length < 0 ? (clipped++, 0) : length;
      const d = depth + len;
      depths.set(child.id, d);
      maxDepth = Math.max(maxDepth, d);
      recurse(child, d);
    }
  }
  recurse(root, 0);
  return { depths, clipped, maxDepth };
}

function escapeNewickLabel(label) {
  return String(label).replace(/[\s():,;]+/g, '_');
}

function fmtLen(n) {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1e6) / 1e6;
  return String(r);
}

function newickRecurse(node) {
  if (!node.children.length) return escapeNewickLabel(node.label);
  const inner = node.children.map((ch) => newickRecurse(ch.node) + ':' + fmtLen(ch.length)).join(',');
  return '(' + inner + ')';
}

/** Exporta el árbol a formato Newick (para iTOL, MEGA, etc). */
export function toNewick(root) {
  return newickRecurse(root) + ';';
}
