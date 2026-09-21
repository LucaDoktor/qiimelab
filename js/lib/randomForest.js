// Random Forest de clasificación — bagging de árboles CART (Gini) con
// submuestreo de variables por corte, e importancia "Mean Decrease Gini"
// (misma definición que randomForest(..., importance=TRUE)$importance[,
// "MeanDecreaseGini"] de R). Implementación propia, sin dependencias — no
// había ningún método de clasificación/ML en el proyecto antes de esto.
//
// Verificado (tests/stats/randomforest.mjs) por correlación de rango
// (Spearman) contra randomForest() de R sobre un dataset sintético pequeño
// con variables informativas conocidas + ruido puro: no es razonable pedir
// una coincidencia numérica exacta (cada bosque muestrea con su propio PRNG),
// pero SÍ que ambos bosques identifiquen las mismas variables como las más
// importantes y el ruido como el menos importante.
//
// Usado en taxaBarplot.js (pestaña Biomarcadores, bmMethod='rf') junto con
// un criterio de significancia tomado de Boruta (Kursa & Rudnicki 2010):
// cada variable real se entrena a la vez que una copia "sombra" de sí misma
// con los valores barajados al azar entre muestras (rompe cualquier relación
// con el grupo por construcción); una variable real se considera relevante
// si su importancia supera a la más fuerte de todas las sombras — un único
// entrenamiento, sin necesidad de repetir el bosque para calcular un p-valor.

import { mulberry32 } from './groupBoxplot.js';

function giniImpurity(counts, total) {
  let g = 1;
  for (const k in counts) { const p = counts[k] / total; g -= p * p; }
  return g;
}

function countLabels(labels, idx) {
  const c = {};
  idx.forEach((i) => { c[labels[i]] = (c[labels[i]] || 0) + 1; });
  return c;
}

function majorityLabel(counts) {
  let best = null, bestN = -1;
  for (const k in counts) if (counts[k] > bestN) { bestN = counts[k]; best = k; }
  return best;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Construye un árbol CART de clasificación sobre los índices `idx`
// (bootstrap in-bag), eligiendo en cada nodo `mtry` variables al azar y,
// entre ellas, el punto de corte de menor impureza Gini ponderada — el
// propio "random" de Random Forest. Acumula en `importance` la reducción de
// Gini de cada corte, ponderada por la fracción de muestras del dataset
// completo que pasan por ese nodo (Mean Decrease Impurity).
function buildTree(X, y, idx, nFeatures, mtry, rng, importance, opts) {
  const counts = countLabels(y, idx);
  const total = idx.length;
  const gini = giniImpurity(counts, total);
  const nClasses = Object.keys(counts).length;
  if (nClasses <= 1 || total < opts.minSamplesSplit || gini === 0) {
    return { leaf: majorityLabel(counts) };
  }

  const featPool = shuffleInPlace(Array.from({ length: nFeatures }, (_, i) => i), rng);
  const candidates = featPool.slice(0, Math.min(mtry, featPool.length));

  let best = null; // { feature, threshold, gain, leftIdx, rightIdx }
  candidates.forEach((f) => {
    const uniq = Array.from(new Set(idx.map((i) => X[i][f]))).sort((a, b) => a - b);
    for (let k = 0; k < uniq.length - 1; k++) {
      const thr = (uniq[k] + uniq[k + 1]) / 2;
      const leftIdx = [], rightIdx = [];
      idx.forEach((i) => { (X[i][f] <= thr ? leftIdx : rightIdx).push(i); });
      if (leftIdx.length === 0 || rightIdx.length === 0) continue;
      const gL = giniImpurity(countLabels(y, leftIdx), leftIdx.length);
      const gR = giniImpurity(countLabels(y, rightIdx), rightIdx.length);
      const weighted = (leftIdx.length / total) * gL + (rightIdx.length / total) * gR;
      const gain = gini - weighted;
      if (!best || gain > best.gain) best = { feature: f, threshold: thr, gain, leftIdx, rightIdx };
    }
  });

  if (!best || best.gain <= 1e-12) return { leaf: majorityLabel(counts) };

  importance[best.feature] += (total / opts.nTotal) * best.gain;

  return {
    feature: best.feature,
    threshold: best.threshold,
    left: buildTree(X, y, best.leftIdx, nFeatures, mtry, rng, importance, opts),
    right: buildTree(X, y, best.rightIdx, nFeatures, mtry, rng, importance, opts),
  };
}

function predictTree(node, x) {
  while (node.leaf === undefined) node = x[node.feature] <= node.threshold ? node.left : node.right;
  return node.leaf;
}

/**
 * @param {number[][]} X  n muestras × p variables (p.ej. abundancia relativa por taxón)
 * @param {string[]} y    n etiquetas de clase (grupo)
 * @param {object} [opts]
 * @param {number} [opts.nTree=200]
 * @param {number} [opts.mtry]  variables candidatas por corte — por defecto round(sqrt(p)), mínimo 1 (heurística estándar de clasificación de randomForest())
 * @param {number} [opts.minSamplesSplit=2]
 * @param {number} [opts.seed=42]
 * @param {boolean} [opts.shadows=false]  añade una copia barajada de cada variable (Boruta-lite) y devuelve shadowMax
 * @returns {{ importance:number[], shadowMax:number|null, oobAccuracy:number|null, nTree:number, mtry:number }}
 */
export function randomForest(X, y, opts = {}) {
  const n = X.length;
  const nFeatures = X[0]?.length || 0;
  if (n < 4) throw new Error('Hacen falta al menos 4 muestras.');
  if (nFeatures < 1) throw new Error('No hay ninguna variable (taxón) con la que entrenar.');
  const classes = new Set(y);
  if (classes.size < 2) throw new Error('Hacen falta al menos 2 grupos distintos.');

  const nTree = opts.nTree ?? 200;
  const mtry = Math.max(1, Math.round(opts.mtry ?? Math.sqrt(nFeatures)));
  const minSamplesSplit = opts.minSamplesSplit ?? 2;
  const rng = mulberry32(opts.seed ?? 42);

  let Xfull = X, totalFeatures = nFeatures;
  if (opts.shadows) {
    const shadowCols = Array.from({ length: nFeatures }, (_, f) => shuffleInPlace(X.map((row) => row[f]), rng));
    Xfull = X.map((row, i) => row.concat(shadowCols.map((c) => c[i])));
    totalFeatures = nFeatures * 2;
  }

  const importance = new Array(totalFeatures).fill(0);
  let oobCorrect = 0, oobTotal = 0;

  for (let t = 0; t < nTree; t++) {
    const inBag = [];
    const inBagSet = new Set();
    for (let i = 0; i < n; i++) { const pick = Math.floor(rng() * n); inBag.push(pick); inBagSet.add(pick); }
    const tree = buildTree(Xfull, y, inBag, totalFeatures, mtry, rng, importance, { minSamplesSplit, nTotal: n });
    for (let i = 0; i < n; i++) {
      if (inBagSet.has(i)) continue;
      oobTotal++;
      if (predictTree(tree, Xfull[i]) === y[i]) oobCorrect++;
    }
  }

  const realImportance = importance.slice(0, nFeatures).map((v) => v / nTree);
  const shadowImportance = opts.shadows ? importance.slice(nFeatures).map((v) => v / nTree) : null;
  return {
    importance: realImportance,
    shadowMax: shadowImportance ? Math.max(0, ...shadowImportance) : null,
    oobAccuracy: oobTotal > 0 ? oobCorrect / oobTotal : null,
    nTree, mtry,
  };
}
