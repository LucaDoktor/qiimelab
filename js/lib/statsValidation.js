// Autocomprobación EN VIVO de js/lib/stats.js contra R.
//
// Cada fila ejecuta la función real de stats.js en el navegador sobre una
// entrada fija y compara el resultado con el valor de referencia que devolvió
// R al escribir los tests (los MISMOS "GOLDEN" que usa tests/stats/*.mjs).
// Así la validación no es una promesa: se recalcula cada vez que abres la
// página y se ve el error numérico.

import * as S from './stats.js';

const flat = (v) => (typeof v === 'number' ? [v] : Array.isArray(v) ? v.flatMap(flat) : Object.keys(v).sort().flatMap((k) => flat(v[k])));

// nameKey → clave i18n validacion.f.<key> (nombre visible)
// ref     → qué de R se comparó
// tol     → tolerancia de error relativo del test
// run()   → resultado JS aplanado
// golden  → referencia de R (aplanada, mismo orden)
const CASES = [
  {
    key: 'kw', ref: 'kruskal.test()', tol: 1e-9,
    run: () => { const k = S.kruskalWallis([[0.1, 0.4, -0.2, 0.7, 0.3, -0.5, 0.9, 0.0], [0.6, 0.2, 1.1, 0.4, 0.8, -0.1, 1.3, 0.5]]); return [k.H, k.df, k.p]; },
    golden: [2.3223490427098685, 1, 0.12752731335784562],
  },
  {
    key: 'bh', ref: 'p.adjust(method="BH")', tol: 1e-12,
    run: () => flat(S.benjaminiHochberg([0.001, 0.01, 0.03, 0.04, 0.2])),
    golden: [0.005, 0.025, 0.05, 0.05, 0.2],
  },
  {
    key: 'cliff', ref: 'effsize::cliff.delta()', tol: 1e-12,
    run: () => [S.cliffsDelta([1, 2, 3, 4, 5, 6], [3, 4, 5, 6, 7, 8]), S.cliffsDelta([10, 20, 30], [1, 2, 3])],
    golden: [-0.55555555555555558, 1],
  },
  {
    key: 'chisq', ref: 'pchisq(lower.tail=FALSE)', tol: 1e-9,
    run: () => [S.chiSquarePValue(5.99, 2), S.chiSquarePValue(11.07, 5)],
    golden: [0.05003662708658628, 0.050009618622405487],
  },
  {
    key: 'pearson', ref: 'cor.test(method="pearson")', tol: 1e-9,
    run: () => { const p = S.pearson([2.1, 3.4, 1.0, 5.5, 4.2, 6.1, 2.9, 7.0, 3.3, 5.8], [1.5, 2.0, 0.9, 4.1, 3.0, 5.5, 2.2, 6.8, 2.5, 4.9]); return [p.r, p.p]; },
    golden: [0.97246383970168127, 2.4331458403103151e-06],
  },
  {
    key: 'spearman', ref: 'cor.test sobre rangos', tol: 1e-9,
    run: () => { const s = S.spearman([2.1, 3.4, 1.0, 5.5, 4.2, 6.1, 2.9, 7.0, 3.3, 5.8], [1.5, 2.0, 0.9, 4.1, 3.0, 5.5, 2.2, 6.8, 2.5, 4.9]); return [s.r, s.p]; },
    golden: [0.96363636363636362, 7.3209748095298041e-06],
  },
  {
    key: 'ibeta', ref: 'pbeta()', tol: 1e-10,
    run: () => [S.incompleteBeta(2, 3, 0.3), S.incompleteBeta(10, 20, 0.35), S.incompleteBeta(2.5, 4.5, 0.65)],
    golden: [0.34829999999999989, 0.5923866636639048, 0.94450606594632147],
  },
  {
    key: 'tp', ref: '2·pt(-|t|, df)', tol: 1e-10,
    run: () => [S.studentTwoTailedP(2.0, 10), S.studentTwoTailedP(5.2, 20)],
    golden: [0.073388034770740393, 4.3474070541624575e-05],
  },
  {
    key: 'shannon', ref: 'vegan::diversity("shannon")', tol: 1e-10,
    run: () => [S.shannonIndex([50, 30, 20, 10, 5, 3, 2, 2, 1, 1, 1, 0, 8]), S.shannonIndex([1, 1, 1, 1, 2, 2, 3, 5, 8, 13, 21])],
    golden: [1.7976520184011107, 1.8530212808387441],
  },
  {
    key: 'simpson', ref: 'vegan::diversity("simpson")', tol: 1e-10,
    run: () => [S.simpsonIndex([50, 30, 20, 10, 5, 3, 2, 2, 1, 1, 1, 0, 8]), S.simpsonIndex([1, 1, 1, 1, 2, 2, 3, 5, 8, 13, 21])],
    golden: [0.77336197636949522, 0.7859690844233056],
  },
  {
    key: 'chao1', ref: 'vegan::estimateR()["S.chao1"]', tol: 1e-9,
    run: () => [S.chao1([50, 30, 20, 10, 5, 3, 2, 2, 1, 1, 1, 0, 8]), S.chao1([1, 1, 1, 1, 2, 2, 3, 5, 8, 13, 21])],
    golden: [13, 13],
  },
  {
    key: 'pielou', ref: 'shannon / log(S)', tol: 1e-10,
    run: () => [S.pielouEvenness([50, 30, 20, 10, 5, 3, 2, 2, 1, 1, 1, 0, 8]), S.pielouEvenness([1, 1, 1, 1, 2, 2, 3, 5, 8, 13, 21])],
    golden: [0.72342839058138353, 0.77276989610820135],
  },
  {
    key: 'permanova', ref: 'vegan::adonis2() — F, R²', tol: 1e-9,
    run: () => {
      const D = [
        [0, 0.2, 0.25, 0.3, 0.7, 0.75, 0.8, 0.72], [0.2, 0, 0.22, 0.28, 0.68, 0.7, 0.74, 0.69],
        [0.25, 0.22, 0, 0.2, 0.72, 0.73, 0.78, 0.71], [0.3, 0.28, 0.2, 0, 0.7, 0.72, 0.76, 0.7],
        [0.7, 0.68, 0.72, 0.7, 0, 0.18, 0.22, 0.2], [0.75, 0.7, 0.73, 0.72, 0.18, 0, 0.19, 0.21],
        [0.8, 0.74, 0.78, 0.76, 0.22, 0.19, 0, 0.17], [0.72, 0.69, 0.71, 0.7, 0.2, 0.21, 0.17, 0],
      ];
      const r = S.permanova(D, ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'], { permutations: 0 });
      return [r.F, r.R2];
    },
    golden: [39.906313645621175, 0.86929902395740899],
  },
  {
    key: 'meanlog', ref: 'mean / sd / sd·n^-0.5 (log10)', tol: 1e-9,
    run: () => {
      const x = [3772082, 4537520, 8648715].map((v) => Math.log10(v));
      return [S.mean(x), S.stdDev(x), S.standardError(x)];
    },
    golden: [6.7234504211752562, 0.18919981962045618, 0.10923456678849902],
  },
];

const maxRel = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i]) / (Math.abs(b[i]) || 1)));
const maxAbs = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/**
 * @returns {Array<{ key, ref, tol, n, maxRelErr, maxAbsErr, pass, error?:string }>}
 */
export function runValidation() {
  return CASES.map((c) => {
    try {
      const js = c.run().map(Number);
      if (js.length !== c.golden.length) return { key: c.key, ref: c.ref, tol: c.tol, pass: false, error: 'longitud' };
      const rel = maxRel(js, c.golden);
      const abs = maxAbs(js, c.golden);
      return { key: c.key, ref: c.ref, tol: c.tol, n: js.length, maxRelErr: rel, maxAbsErr: abs, pass: rel < c.tol };
    } catch (e) {
      return { key: c.key, ref: c.ref, tol: c.tol, pass: false, error: (e && e.message) || String(e) };
    }
  });
}
