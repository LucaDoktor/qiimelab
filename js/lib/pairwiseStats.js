// pairwiseStats.js — comparaciones estadísticas por pares que hoy faltan en
// stats.js: Mann-Whitney U, t de Welch/Student, Wilcoxon con signo (pareado),
// post-hoc de Dunn (tras Kruskal-Wallis) y un pAdjust genérico con los 5
// métodos de `p.adjust` de R. Funciones puras, sin dependencias — mismo
// patrón de verificación que el resto de stats.js: node tests/stats/
// pairwisestats.mjs compara contra fixtures ancladas a R (y contra R en vivo
// si hay Rscript en la máquina). Ver Paso 5 de
// qiimelab-prompt-editor-fase-0-fundamentos.md.
//
// pAdjust('BH') delega en benjaminiHochberg() de stats.js en vez de
// duplicarla — es la única superposición real con ese archivo.

import { mean, stdDev, studentTwoTailedP, benjaminiHochberg, stdNormalCdf } from './stats.js';

// -------------------------------------------------- rangos con desempate --
function rankWithTies(all) {
  // all: array de números. Devuelve { ranks, ties } — ranks 1..N (media en
  // empates) y ties = tamaños de cada grupo de empate (>1), para la
  // corrección de varianza de Mann-Whitney/Dunn.
  const order = all.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const N = order.length;
  const ranks = new Array(N);
  const ties = [];
  let k = 0;
  while (k < N) {
    let j = k;
    while (j + 1 < N && order[j + 1].v === order[k].v) j++;
    const r = (k + j) / 2 + 1;
    for (let m = k; m <= j; m++) ranks[order[m].i] = r;
    if (j > k) ties.push(j - k + 1);
    k = j + 1;
  }
  return { ranks, ties };
}

// --------------------------------------------- Mann-Whitney U (no pareado) --
// c(m,n,u) = nº de particiones con U=u, vía la recursión estándar de la
// distribución exacta de Wilcoxon rank-sum (la misma que usa cwilcox() en R).
const _cwilcoxCache = new Map();
function cwilcox(m, n, u) {
  if (u < 0 || u > m * n) return 0;
  if (m === 0 || n === 0) return u === 0 ? 1 : 0;
  const key = m + ',' + n + ',' + u;
  const hit = _cwilcoxCache.get(key);
  if (hit !== undefined) return hit;
  const v = cwilcox(m - 1, n, u - n) + cwilcox(m, n - 1, u);
  _cwilcoxCache.set(key, v);
  return v;
}
function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}
/** P(U <= u) exacta, U ~ Mann-Whitney(m,n) sin empates. */
function pwilcox(u, m, n) {
  if (u < 0) return 0;
  if (u >= m * n) return 1;
  const total = choose(m + n, m);
  let s = 0;
  for (let k = 0; k <= Math.floor(u); k++) s += cwilcox(m, n, k);
  return s / total;
}

/**
 * Mann-Whitney U (= Wilcoxon rank-sum) para dos muestras independientes,
 * mismo criterio que `wilcox.test(x, y)` de R: exacta si n1+n2 < 50 y sin
 * empates, si no aproximación normal con corrección de continuidad y
 * varianza corregida por empates.
 * @param {number[]} x @param {number[]} y
 * @returns {{ W:number, p:number, method:'exact'|'asymptotic', hasTies:boolean, n1:number, n2:number }}
 */
export function mannWhitneyU(x, y) {
  const n1 = x.length, n2 = y.length;
  const all = x.concat(y);
  const { ranks, ties } = rankWithTies(all);
  const R1 = ranks.slice(0, n1).reduce((a, b) => a + b, 0);
  const W = R1 - (n1 * (n1 + 1)) / 2; // U de x frente a y
  const hasTies = ties.length > 0;
  const N = n1 + n2;
  const mu = (n1 * n2) / 2;

  let p, method;
  if (N < 50 && !hasTies) {
    method = 'exact';
    p = W > mu ? 2 * (1 - pwilcox(W - 1, n1, n2)) : 2 * pwilcox(W, n1, n2);
    p = Math.min(1, p);
  } else {
    method = 'asymptotic';
    const tieSum = ties.reduce((a, t) => a + (t * t * t - t), 0);
    const sigma2 = (n1 * n2 / 12) * ((N + 1) - tieSum / (N * (N - 1)));
    const sigma = Math.sqrt(sigma2);
    const z0 = W - mu;
    const cc = Math.sign(z0) * 0.5; // corrección de continuidad
    const z = sigma > 0 ? (z0 - cc) / sigma : 0;
    p = Math.min(1, 2 * (1 - stdNormalCdf(Math.abs(z))));
  }
  return { W, p, method, hasTies, n1, n2 };
}

// --------------------------------------------------------- t de dos muestras --
/** t de Student (varianza combinada, homocedástico) para dos muestras independientes. */
export function studentT(x, y) {
  const n1 = x.length, n2 = y.length;
  const df = n1 + n2 - 2;
  if (df <= 0) return { t: NaN, df: NaN, p: NaN };
  const s1 = stdDev(x), s2 = stdDev(y);
  const sp2 = ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / df;
  const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
  const diff = mean(x) - mean(y);
  const t = se > 0 ? diff / se : (diff === 0 ? 0 : (diff > 0 ? Infinity : -Infinity));
  const p = se > 0 ? studentTwoTailedP(t, df) : (diff === 0 ? 1 : 0);
  return { t, df, p };
}

/** t de Welch (varianzas separadas, heterocedástico) — grados de libertad de Satterthwaite. */
export function welchT(x, y) {
  const n1 = x.length, n2 = y.length;
  const s1 = stdDev(x), s2 = stdDev(y);
  const v1 = (s1 * s1) / n1, v2 = (s2 * s2) / n2;
  const se = Math.sqrt(v1 + v2);
  const diff = mean(x) - mean(y);
  const t = se > 0 ? diff / se : (diff === 0 ? 0 : (diff > 0 ? Infinity : -Infinity));
  const df = (v1 + v2) > 0 && (v1 * v1 || v2 * v2)
    ? ((v1 + v2) * (v1 + v2)) / ((v1 * v1) / (n1 - 1) + (v2 * v2) / (n2 - 1))
    : NaN;
  const p = se > 0 && isFinite(df) ? studentTwoTailedP(t, df) : (diff === 0 ? 1 : 0);
  return { t, df, p };
}

// ------------------------------------------------- Wilcoxon con signo (pareado) --
/**
 * Wilcoxon con signo para muestras pareadas — `wilcox.test(x, y, paired=TRUE)`
 * de R: descarta diferencias cero, exacta si n≤50 (tras descartar ceros) y
 * sin empates entre |diferencias|, si no aproximación normal con corrección
 * de continuidad y varianza corregida por empates.
 * @param {number[]} x @param {number[]} y (misma longitud, pares alineados)
 * @returns {{ V:number, p:number, method:'exact'|'asymptotic', nNonZero:number }}
 */
export function wilcoxonSignedRank(x, y) {
  const diffs = x.map((v, i) => v - y[i]).filter((d) => d !== 0);
  const n = diffs.length;
  const { ranks, ties } = rankWithTies(diffs.map(Math.abs));
  const V = diffs.reduce((s, d, i) => s + (d > 0 ? ranks[i] : 0), 0);
  const hasTies = ties.length > 0;
  const mu = (n * (n + 1)) / 4;

  let p, method;
  if (n <= 50 && !hasTies) {
    method = 'exact';
    // distribución exacta del estadístico con signo: misma recursión que
    // Mann-Whitney con "n2 infinito" no aplica — se usa la generatriz propia
    // de Wilcoxon signed-rank: c(n,v) = c(n-1,v) + c(n-1,v-n).
    const total = Math.pow(2, n);
    const cache = new Map();
    const csigned = (k, v) => {
      if (v < 0 || v > (k * (k + 1)) / 2) return 0;
      if (k === 0) return v === 0 ? 1 : 0;
      const key = k + ',' + v;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const r = csigned(k - 1, v) + csigned(k - 1, v - k);
      cache.set(key, r);
      return r;
    };
    const vRound = Math.round(V);
    let cdf = 0;
    for (let k = 0; k <= vRound; k++) cdf += csigned(n, k);
    // misma rama que wilcox.test: V > n(n+1)/4 usa la cola superior (V-1),
    // si no la inferior — no es simétrico tomar siempre el mínimo de ambas.
    p = V > mu ? 2 * (1 - (cdf - csigned(n, vRound)) / total) : 2 * (cdf / total);
    p = Math.min(1, p);
  } else {
    method = 'asymptotic';
    const tieSum = ties.reduce((a, t) => a + (t * t * t - t), 0);
    const sigma2 = (n * (n + 1) * (2 * n + 1)) / 24 - tieSum / 48;
    const sigma = Math.sqrt(sigma2);
    const z0 = V - mu;
    const cc = Math.sign(z0) * 0.5;
    const z = sigma > 0 ? (z0 - cc) / sigma : 0;
    p = Math.min(1, 2 * (1 - stdNormalCdf(Math.abs(z))));
  }
  return { V, p, method, nNonZero: n };
}

/** t pareado = t de una muestra sobre las diferencias x−y. */
export function pairedT(x, y) {
  const diffs = x.map((v, i) => v - y[i]);
  const n = diffs.length;
  const df = n - 1;
  if (df <= 0) return { t: NaN, df: NaN, p: NaN };
  const se = stdDev(diffs) / Math.sqrt(n);
  const d = mean(diffs);
  const t = se > 0 ? d / se : (d === 0 ? 0 : (d > 0 ? Infinity : -Infinity));
  const p = se > 0 ? studentTwoTailedP(t, df) : (d === 0 ? 1 : 0);
  return { t, df, p };
}

// ------------------------------------------------------------------ pAdjust --
/**
 * Ajuste de múltiples comparaciones, mismos métodos y mismo orden de salida
 * que `p.adjust(p, method)` de R (los q-valores vuelven en el orden
 * ORIGINAL de `pvals`, no ordenados).
 * @param {number[]} pvals
 * @param {'none'|'bonferroni'|'holm'|'hochberg'|'BH'|'BY'} method
 * @returns {number[]}
 */
export function pAdjust(pvals, method) {
  const m = pvals.length;
  if (m === 0) return [];
  if (method === 'none') return pvals.slice();
  if (method === 'BH') return benjaminiHochberg(pvals);
  if (method === 'bonferroni') return pvals.map((p) => Math.min(1, p * m));

  if (method === 'holm') {
    const idx = pvals.map((_, i) => i).sort((a, b) => pvals[a] - pvals[b]); // ascendente
    const adj = new Array(m);
    let running = 0;
    for (let k = 0; k < m; k++) {
      const i = idx[k];
      running = Math.max(running, (m - k) * pvals[i]);
      adj[i] = Math.min(1, running);
    }
    return adj;
  }

  if (method === 'hochberg') {
    const idx = pvals.map((_, i) => i).sort((a, b) => pvals[b] - pvals[a]); // descendente
    const adj = new Array(m);
    let running = Infinity;
    for (let k = 0; k < m; k++) {
      const i = idx[k];
      const rank = m - k; // m, m-1, …, 1
      running = Math.min(running, (m - rank + 1) * pvals[i]);
      adj[i] = Math.min(1, running);
    }
    return adj;
  }

  if (method === 'BY') {
    const c = Array.from({ length: m }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0); // suma armónica
    const idx = pvals.map((_, i) => i).sort((a, b) => pvals[b] - pvals[a]); // descendente
    const adj = new Array(m);
    let running = Infinity;
    for (let k = 0; k < m; k++) {
      const i = idx[k];
      const rank = m - k;
      running = Math.min(running, (m * c / rank) * pvals[i]);
      adj[i] = Math.min(1, running);
    }
    return adj;
  }

  throw new Error('pAdjust: método desconocido "' + method + '"');
}

// ------------------------------------------------------- post-hoc de Dunn --
const PADJUST_METHODS = ['none', 'bonferroni', 'holm', 'hochberg', 'BH', 'BY'];

/**
 * Post-hoc de Dunn (1964) tras Kruskal-Wallis, con corrección por empates —
 * mismo estadístico z que `dunn.test::dunn.test()` de R (rangos calculados
 * UNA vez sobre todos los grupos juntos, no por pareja).
 * @param {{label:string, values:number[]}[]} groups
 * @returns {{ meanRanks: Record<string,number>,
 *             comparisons: { a:string, b:string, z:number, p:number,
 *               adj: Record<'none'|'bonferroni'|'holm'|'hochberg'|'BH'|'BY', number> }[] }}
 */
export function dunnTest(groups) {
  const all = [];
  groups.forEach((g, gi) => g.values.forEach((v) => all.push({ v, gi })));
  const { ranks, ties } = rankWithTies(all.map((a) => a.v));
  const N = all.length;

  const rankSum = groups.map(() => 0);
  all.forEach((a, i) => { rankSum[a.gi] += ranks[i]; });
  const ns = groups.map((g) => g.values.length);
  const meanRanksArr = rankSum.map((s, i) => s / ns[i]);
  const meanRanks = {};
  groups.forEach((g, i) => { meanRanks[g.label] = meanRanksArr[i]; });

  const tieSum = ties.reduce((a, t) => a + (t * t * t - t), 0);
  const varTerm = (N * (N + 1)) / 12 - tieSum / (12 * (N - 1));

  const comparisons = [];
  const rawPs = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const se = Math.sqrt(varTerm * (1 / ns[i] + 1 / ns[j]));
      const z = se > 0 ? (meanRanksArr[i] - meanRanksArr[j]) / se : 0;
      const p = Math.min(1, 2 * (1 - stdNormalCdf(Math.abs(z))));
      comparisons.push({ a: groups[i].label, b: groups[j].label, z, p });
      rawPs.push(p);
    }
  }
  PADJUST_METHODS.forEach((method) => {
    const adj = pAdjust(rawPs, method);
    comparisons.forEach((c, k) => { c.adj = c.adj || {}; c.adj[method] = adj[k]; });
  });

  return { meanRanks, comparisons };
}
