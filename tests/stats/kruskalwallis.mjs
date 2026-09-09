// kruskalWallis(groups) → {H, df, p} vs kruskal.test() de R base (H con
// corrección por empates + p por aproximación chi-cuadrado).
import { stats, verify, tmp, done } from './_shared.mjs';

const { kruskalWallis } = await stats();

const CASES = [
  [[2.1, 3.4, 1.0, 2.9, 3.3], [5.5, 4.2, 6.1, 7.0, 5.8], [1.5, 2.0, 0.9, 2.2, 2.5]],
  [[1, 2, 2, 3], [2, 3, 3, 4, 5], [1, 1, 2]],                       // con empates
  [[0.1, 0.4, -0.2, 0.7, 0.3, -0.5, 0.9, 0.0], [0.6, 0.2, 1.1, 0.4, 0.8, -0.1, 1.3, 0.5]],
];

// GOLDEN de R: [H, df, p] por caso  (options(digits=17))
const GOLDEN = [
  10.220000000000006, 2, 0.0060360829235995492,
  6.2825870646766173, 2, 0.04322684639852839,
  2.3223490427098685, 1, 0.12752731335784562,
];

const js = CASES.flatMap((g) => { const k = kruskalWallis(g); return [k.H, k.df, k.p]; });

const ok = verify({
  name: 'Kruskal-Wallis H, df, p',
  js, golden: GOLDEN, tol: 1e-9,
  rScript: () => {
    const f = tmp('kw.json', JSON.stringify(CASES));
    return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(g) { k <- kruskal.test(lapply(g, function(v) as.numeric(unlist(v)))); c(as.numeric(k$statistic), as.numeric(k$parameter), k$p.value) }))
cat(jsonlite::toJSON(o, digits = 17))`;
  },
});

done('kruskal-wallis', ok);
