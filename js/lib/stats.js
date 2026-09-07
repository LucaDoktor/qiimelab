// Estadística mínima, sin dependencias, para los módulos de diversidad.
// Cada función se verificó contra valores de referencia conocidos antes de
// integrarla (ver README, sección "Notas de desarrollo").

export function mean(arr) {
  if (arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1);
  return Math.sqrt(v);
}

export function quartiles(sortedArr) {
  // método "exclusivo" de percentiles (el habitual en boxplots de ggplot2/Tukey)
  const n = sortedArr.length;
  function pct(p) {
    const idx = (n - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sortedArr[lo];
    return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
  }
  return { q1: pct(0.25), median: pct(0.5), q3: pct(0.75) };
}

// ---------- función gamma (para el p-valor de chi-cuadrado) ----------

function logGamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function gammaP(a, x) {
  let sum = 1 / a, term = 1 / a, ap = a;
  for (let n = 1; n < 500; n++) {
    ap += 1;
    term *= x / ap;
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function gammaQcf(a, x) {
  const FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** p-valor de la cola superior de una chi-cuadrado con `df` grados de libertad. */
export function chiSquarePValue(x, df) {
  if (x <= 0) return 1;
  const a = df / 2, xx = x / 2;
  return xx < a + 1 ? 1 - gammaP(a, xx) : gammaQcf(a, xx);
}

// ---------- Kruskal-Wallis ----------

/**
 * Test de Kruskal-Wallis (alternativa no paramétrica a ANOVA de un factor),
 * con corrección por empates. `groups` es un array de arrays numéricos
 * (uno por grupo). Devuelve { H, df, p }.
 */
export function kruskalWallis(groups) {
  const valid = groups.filter((g) => g.length > 0);
  const all = [];
  valid.forEach((g, gi) => g.forEach((v) => all.push({ v, gi })));
  all.sort((a, b) => a.v - b.v);
  const N = all.length;
  const ranks = new Array(N);
  let i = 0;
  while (i < N) {
    let j = i;
    while (j + 1 < N && all[j + 1].v === all[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }
  const rankSums = valid.map(() => 0);
  for (let k = 0; k < N; k++) rankSums[all[k].gi] += ranks[k];
  let H = 0;
  valid.forEach((g, gi) => { H += (rankSums[gi] * rankSums[gi]) / g.length; });
  H = (12 / (N * (N + 1))) * H - 3 * (N + 1);

  let tieSum = 0, i2 = 0;
  while (i2 < N) {
    let j2 = i2;
    while (j2 + 1 < N && all[j2 + 1].v === all[i2].v) j2++;
    const t = j2 - i2 + 1;
    tieSum += t * t * t - t;
    i2 = j2 + 1;
  }
  const C = N > 1 ? 1 - tieSum / (N * N * N - N) : 1;
  const Hc = C > 0 ? H / C : H;
  const df = valid.length - 1;
  const p = df > 0 ? chiSquarePValue(Hc, df) : NaN;
  return { H: Hc, df, p };
}

// ---------- UPGMA (clustering jerárquico para el mapa de calor beta) ----------

/**
 * Clustering jerárquico UPGMA (average linkage) sobre una matriz de
 * distancias cuadrada. Devuelve el nodo raíz de un árbol binario:
 * hojas = { label, height: 0, size: 1 }; nodos internos = { height, size, left, right }.
 */
export function upgma(distMatrix, labels) {
  const n = labels.length;
  const nodes = new Map();
  for (let i = 0; i < n; i++) nodes.set(i, { id: i, label: labels[i], height: 0, size: 1, left: null, right: null });
  const dist = new Map();
  for (let i = 0; i < n; i++) {
    dist.set(i, new Map());
    for (let j = 0; j < n; j++) if (i !== j) dist.get(i).set(j, distMatrix[i][j]);
  }
  let nextId = n;
  let activeIds = Array.from({ length: n }, (_, i) => i);

  while (activeIds.length > 1) {
    let bestI = -1, bestJ = -1, bestD = Infinity;
    for (let a = 0; a < activeIds.length; a++) {
      for (let b = a + 1; b < activeIds.length; b++) {
        const ii = activeIds[a], jj = activeIds[b];
        const d = dist.get(ii).get(jj);
        if (d < bestD) { bestD = d; bestI = ii; bestJ = jj; }
      }
    }
    const ni = nodes.get(bestI), nj = nodes.get(bestJ);
    const newNode = { id: nextId, label: null, height: bestD, size: ni.size + nj.size, left: ni, right: nj };
    nodes.set(nextId, newNode);
    const newDist = new Map();
    for (const k of activeIds) {
      if (k === bestI || k === bestJ) continue;
      const dik = dist.get(bestI).get(k);
      const djk = dist.get(bestJ).get(k);
      const dnew = (ni.size * dik + nj.size * djk) / (ni.size + nj.size);
      newDist.set(k, dnew);
      dist.get(k).set(nextId, dnew);
    }
    dist.set(nextId, newDist);
    activeIds = activeIds.filter((x) => x !== bestI && x !== bestJ);
    activeIds.push(nextId);
    nextId++;
  }
  return nodes.get(nextId - 1);
}

/** Recorre el árbol UPGMA en orden y devuelve las etiquetas de las hojas en el orden de clustering. */
export function leafOrder(node, out) {
  out = out || [];
  if (!node.left && !node.right) { out.push(node.label); return out; }
  if (node.left) leafOrder(node.left, out);
  if (node.right) leafOrder(node.right, out);
  return out;
}

export function formatP(p) {
  if (!isFinite(p)) return '—';
  if (p < 0.0001) return '< 0.0001';
  return p.toFixed(4);
}
