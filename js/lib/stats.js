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

/** Error estándar de la media = desviación típica muestral / √n. 0 si n < 2.
 *  (idéntico a `sd(x)/sqrt(length(x))` en R.) */
export function standardError(arr) {
  if (arr.length < 2) return 0;
  return stdDev(arr) / Math.sqrt(arr.length);
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

// ---------- diversidad alfa (índices por muestra) ----------
// Verificados contra vegan::diversity() / vegan::estimateR() (ver README,
// "Notas de desarrollo"). Todos toman un vector de CONTEOS (o abundancias) por
// taxón; los ceros y negativos se ignoran.

/** Proporciones que suman 1 sobre las entradas > 0. Devuelve [] si no hay ninguna. */
function toProportions(counts) {
  let sum = 0;
  for (let i = 0; i < counts.length; i++) if (counts[i] > 0) sum += counts[i];
  if (!(sum > 0)) return [];
  const p = [];
  for (let i = 0; i < counts.length; i++) if (counts[i] > 0) p.push(counts[i] / sum);
  return p;
}

/** Riqueza observada: nº de taxones con conteo > 0. */
export function observedRichness(counts) {
  let s = 0;
  for (let i = 0; i < counts.length; i++) if (counts[i] > 0) s++;
  return s;
}

/** Índice de Shannon H' con logaritmo natural — como vegan::diversity(x, "shannon"). */
export function shannonIndex(counts) {
  const p = toProportions(counts);
  let h = 0;
  for (let i = 0; i < p.length; i++) h -= p[i] * Math.log(p[i]);
  return h;
}

/** Simpson 1 − D (Gini-Simpson) — como vegan::diversity(x, "simpson"). */
export function simpsonIndex(counts) {
  const p = toProportions(counts);
  if (p.length === 0) return NaN;
  let d = 0;
  for (let i = 0; i < p.length; i++) d += p[i] * p[i];
  return 1 - d;
}

/**
 * Equidad de Pielou J' = H' / ln(S), con S = riqueza observada.
 * No está definida con S < 2 (ln 1 = 0) → NaN, igual que vegan.
 * Se puede pasar (shannon, richness) ya calculados o un vector de conteos.
 */
export function pielouEvenness(a, richness) {
  let h, s;
  if (Array.isArray(a)) { h = shannonIndex(a); s = observedRichness(a); }
  else { h = a; s = richness; }
  if (!(s >= 2)) return NaN;
  return h / Math.log(s);
}

/**
 * Chao1 corregido por sesgo (Chao 1987) — como vegan::estimateR(x)["S.chao1"]:
 *   Sobs + F1·(F1−1) / (2·(F2+1))
 * F1 / F2 = nº de taxones con exactamente 1 / 2 lecturas (singletons/doubletons).
 * El +1 del denominador lo hace estable cuando F2 = 0. Necesita conteos
 * ENTEROS (redondea por si el archivo trae "9.0").
 */
export function chao1(counts) {
  let sObs = 0, f1 = 0, f2 = 0;
  for (let i = 0; i < counts.length; i++) {
    const v = Math.round(counts[i]);
    if (v <= 0) continue;
    sObs++;
    if (v === 1) f1++;
    else if (v === 2) f2++;
  }
  return sObs + (f1 * (f1 - 1)) / (2 * (f2 + 1));
}

/**
 * Curva de rarefacción ANALÍTICA (esperanza de riqueza, Hurlbert 1971) — sin
 * remuestreo aleatorio. Para una submuestra de `n` lecturas sin reemplazo:
 *
 *   S(n) = Sobs − Σ_i  C(N − Nᵢ, n) / C(N, n)     (solo taxones con Nᵢ > 0)
 *
 * El término es la probabilidad de NO ver el taxón i en la submuestra. Los
 * combinatorios se hacen con logGamma para no desbordar el factorial. Es la
 * misma fórmula que `vegan::rarefy()` / `rarecurve()`.
 *
 * @param {number[]} counts       conteos por taxón de UNA muestra (se redondean; ceros/negativos se ignoran)
 * @param {number}   [nPoints=50] nº de profundidades donde evaluar (incluye 0 y N)
 * @returns {{ N:number, sObs:number, depths:number[], richness:number[] }}
 */
export function rarefactionCurve(counts, nPoints = 50) {
  const ni = [];
  let N = 0;
  for (let k = 0; k < counts.length; k++) {
    const c = Math.round(counts[k]);
    if (c > 0) { ni.push(c); N += c; }
  }
  const sObs = ni.length;
  if (N === 0) return { N: 0, sObs: 0, depths: [0], richness: [0] };

  // profundidades: 0, N, y ~nPoints puntos repartidos uniformemente (enteros, sin duplicados)
  const m = Math.max(2, Math.floor(nPoints));
  const set = new Set([0, N]);
  for (let j = 1; j < m; j++) set.add(Math.round((j / m) * N));
  const depths = [...set].filter((d) => d >= 0 && d <= N).sort((a, b) => a - b);

  const lgN1 = logGamma(N + 1);
  const richness = depths.map((n) => {
    if (n <= 0) return 0;
    if (n >= N) return sObs;
    const lgNn1 = logGamma(N - n + 1);
    let notSeen = 0;
    for (let i = 0; i < ni.length; i++) {
      const rem = N - ni[i];        // lecturas de los OTROS taxones
      if (rem < n) continue;        // imposible no muestrear el taxón i → término 0
      notSeen += Math.exp(logGamma(rem + 1) - logGamma(rem - n + 1) - lgN1 + lgNn1);
    }
    return sObs - notSeen;
  });

  return { N, sObs, depths, richness };
}

// ---------- estimadores de riqueza por INCIDENCIA (por grupo de muestras) ----------
// Reproducen vegan::specpool() con su valor por defecto smallsample = TRUE, que
// aplica el factor de muestra pequeña ssc = (n−1)/n. Verificados número a número
// contra la salida real de specpool() (ver README, "Notas de desarrollo").

/**
 * @param {number[][]} siteBySpecies  matriz muestra × taxón: n filas (muestras
 *   del grupo) × S columnas (taxones). Solo importa si cada celda es > 0.
 * @returns {{n:number, sObs:number, chao2:number, chao2SE:number,
 *   jack1:number, jack1SE:number, jack2:number, boot:number, bootSE:number}}
 */
export function incidenceRichnessEstimators(siteBySpecies) {
  const n = siteBySpecies.length;
  const empty = { n, sObs: 0, chao2: NaN, chao2SE: NaN, jack1: NaN, jack1SE: NaN, jack2: NaN, boot: NaN, bootSE: NaN };
  if (n === 0) return empty;
  const S = siteBySpecies[0].length;

  // frecuencia de incidencia (en cuántas muestras del grupo aparece cada taxón)
  const freq = new Array(S).fill(0);
  for (let si = 0; si < n; si++) {
    const row = siteBySpecies[si];
    for (let j = 0; j < S; j++) if (row[j] > 0) freq[j]++;
  }

  const ssc = (n - 1) / n;
  let sObs = 0, a1 = 0, a2 = 0;
  for (let j = 0; j < S; j++) {
    if (freq[j] > 0) sObs++;
    if (freq[j] === 1) a1++;
    else if (freq[j] === 2) a2++;
  }
  if (sObs === 0) return { ...empty, sObs: 0 };

  // Chao2: vegan usa a1²/(2·a2) si a2 > 0; si no, a1·(a1−1)/2. Ambos × ssc.
  const chao2 = a2 > 0
    ? sObs + ssc * a1 * a1 / 2 / a2
    : sObs + ssc * a1 * (a1 - 1) / 2;

  const jack1 = sObs + a1 * (n - 1) / n;
  const jack2 = n > 1
    ? sObs + a1 * (2 * n - 3) / n - a2 * (n - 2) * (n - 2) / n / (n - 1)
    : sObs;

  // Bootstrap: Sobs + Σ (1 − p_j)^n sobre los taxones observados, p_j = freq_j/n
  let boot = sObs;
  for (let j = 0; j < S; j++) if (freq[j] > 0) boot += Math.pow(1 - freq[j] / n, n);

  // --- varianzas (idénticas a specpool) ---
  let varChao;
  if (a2 > 0) {
    const aa = a1 / a2;
    varChao = a1 * ssc * (0.5 + ssc * (1 + aa / 4) * aa) * aa;
  } else {
    varChao = ssc * (ssc * (a1 * (2 * a1 - 1) * (2 * a1 - 1) / 4 - a1 * a1 * a1 * a1 / chao2 / 4) + a1 * (a1 - 1) / 2);
  }

  let varJack1 = 0;
  if (a1 > 0) {
    const uniqueCols = [];
    for (let j = 0; j < S; j++) if (freq[j] === 1) uniqueCols.push(j);
    let sumSq = 0;
    for (let si = 0; si < n; si++) {
      let cnt = 0;
      for (let u = 0; u < uniqueCols.length; u++) if (siteBySpecies[si][uniqueCols[u]] > 0) cnt++;
      sumSq += cnt * cnt;
    }
    varJack1 = (sumSq - a1 / n) * (n - 1) / n;
  }

  // Bootstrap SE: Σ pn(1−pn) + 2·Σ_{j<k} [ (co-ausencias_jk / n)^n − pn_j·pn_k ]
  const obs = [];
  for (let j = 0; j < S; j++) if (freq[j] > 0) obs.push(j);
  const m = obs.length;
  const pn = obs.map((j) => Math.pow(1 - freq[j] / n, n));
  let varBoot = 0;
  for (let x = 0; x < m; x++) varBoot += pn[x] * (1 - pn[x]);
  for (let x = 0; x < m; x++) {
    for (let y = 0; y < x; y++) {
      let bothAbsent = 0;
      for (let si = 0; si < n; si++) {
        if (!(siteBySpecies[si][obs[x]] > 0) && !(siteBySpecies[si][obs[y]] > 0)) bothAbsent++;
      }
      varBoot += 2 * (Math.pow(bothAbsent / n, n) - pn[x] * pn[y]);
    }
  }

  return {
    n, sObs,
    chao2, chao2SE: Math.sqrt(Math.max(0, varChao)),
    jack1, jack1SE: Math.sqrt(Math.max(0, varJack1)),
    jack2,
    boot, bootSE: Math.sqrt(Math.max(0, varBoot)),
  };
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

// ---------- función beta incompleta (para el p-valor de correlación) ----------
// Mismo enfoque que la gamma incompleta de arriba (Numerical Recipes): fracción
// continua de Lentz + logGamma de Lanczos. Verificado contra valores de
// pbeta() de R y pt() de Student (ver README, "Notas de desarrollo").

function betacf(a, b, x) {
  const FPMIN = 1e-300, EPS = 1e-15;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Beta incompleta regularizada I_x(a, b). Devuelve un valor en [0, 1]. */
export function incompleteBeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lfront =
    logGamma(a + b) - logGamma(a) - logGamma(b) +
    a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lfront);
  return x < (a + 1) / (a + b + 2)
    ? (front * betacf(a, b, x)) / a
    : 1 - (front * betacf(b, a, 1 - x)) / b;
}

/** p-valor a dos colas de un estadístico t de Student con `df` grados de libertad. */
export function studentTwoTailedP(tval, df) {
  if (!(df > 0) || !isFinite(tval)) return NaN;
  const x = df / (df + tval * tval);
  return incompleteBeta(df / 2, 0.5, x);
}

// ---------- rangos (para Spearman y demás) ----------

/** Rangos 1..n con media en los empates. `arr` = array numérico. */
export function averageRanks(arr) {
  const order = arr.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
  const ranks = new Array(arr.length);
  let k = 0;
  while (k < order.length) {
    let j = k;
    while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
    const r = (k + j) / 2 + 1;
    for (let m = k; m <= j; m++) ranks[order[m].i] = r;
    k = j + 1;
  }
  return ranks;
}

// ---------- correlación de Pearson / Spearman con p-valor ----------

/**
 * Correlación de Pearson entre dos arrays numéricos ALINEADOS (misma longitud,
 * el llamador ya ha filtrado los pares con datos completos).
 * p-valor a dos colas vía t = r·sqrt((n-2)/(1-r²)) y la beta incompleta.
 * Devuelve { r, p, n }.
 */
export function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { r: NaN, p: NaN, n };
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { r: NaN, p: NaN, n };
  let r = sxy / Math.sqrt(sxx * syy);
  r = Math.max(-1, Math.min(1, r));
  const df = n - 2;
  let p;
  if (df <= 0) p = NaN;
  else if (r === 1 || r === -1) p = 0;
  else p = studentTwoTailedP(r * Math.sqrt(df / (1 - r * r)), df);
  return { r, p, n };
}

/**
 * Correlación de Spearman (rho): Pearson sobre los rangos de cada variable.
 * Mismo p-valor aproximado que Pearson sobre los rangos.
 */
export function spearman(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { r: NaN, p: NaN, n };
  return pearson(averageRanks(x.slice(0, n)), averageRanks(y.slice(0, n)));
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

/**
 * Corrección de Benjamini-Hochberg (FDR) de un vector de p-valores.
 * Equivalente a `p.adjust(p, method = "BH")` de R: ordena los p descendentes,
 * aplica m/i·p con i = m, m-1, …, 1, toma el mínimo acumulado y lo recorta a 1.
 * Asume p-valores finitos (quien llama filtra los NaN antes).
 * @param {number[]} pvals
 * @returns {number[]} q-valores en el orden original
 */
export function benjaminiHochberg(pvals) {
  const m = pvals.length;
  if (m === 0) return [];
  const idx = pvals.map((_, i) => i).sort((a, b) => pvals[b] - pvals[a]); // p descendente
  const adj = new Array(m);
  let running = Infinity;
  for (let k = 0; k < m; k++) {
    const i = idx[k];
    const rank = m - k; // m, m-1, …, 1
    running = Math.min(running, (m / rank) * pvals[i]);
    adj[i] = Math.min(1, running);
  }
  return adj;
}

/**
 * Delta de Cliff entre dos muestras: δ = (#{x>y} − #{x<y}) / (n_x · n_y).
 * Rango [−1, 1]; δ > 0 ⇒ `x` tiende a ser mayor que `y`. Es la misma
 * definición que `effsize::cliff.delta(x, y)` de R (no paramétrico, sin
 * supuestos de distribución).
 * @param {number[]} x @param {number[]} y
 * @returns {number} NaN si algún grupo está vacío
 */
export function cliffsDelta(x, y) {
  const nx = x.length, ny = y.length;
  if (nx === 0 || ny === 0) return NaN;
  let gt = 0, lt = 0;
  for (let i = 0; i < nx; i++) {
    const xi = x[i];
    for (let j = 0; j < ny; j++) {
      if (xi > y[j]) gt++;
      else if (xi < y[j]) lt++;
    }
  }
  return (gt - lt) / (nx * ny);
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
