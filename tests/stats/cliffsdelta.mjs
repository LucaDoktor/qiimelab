// cliffsDelta(x, y) vs effsize::cliff.delta(x, y)$estimate de R.
import { stats, verify, tmp, done } from './_shared.mjs';

const { cliffsDelta } = await stats();

// varios casos: solape parcial, disjuntos, empates, signo negativo
const CASES = [
  { x: [1, 2, 3, 4, 5, 6], y: [3, 4, 5, 6, 7, 8] },
  { x: [10, 20, 30], y: [1, 2, 3] },                 // disjunto → +1
  { x: [1, 2, 3], y: [10, 20, 30] },                 // disjunto → -1
  { x: [5, 5, 5, 5], y: [5, 5, 5] },                 // todo empate → 0
  { x: [1, 1, 2, 3, 8, 9], y: [2, 2, 4, 5, 6] },
  { x: [0.12, 0.44, 0.9, 0.03, 0.77, 0.51, 0.28], y: [0.6, 0.61, 0.59, 0.02, 0.4] },
];

// GOLDEN: cliff.delta(x, y)$estimate de R (effsize), options(digits=17)
const GOLDEN = [
  -0.55555555555555558, 1, -1, 0, -0.13333333333333333, -0.028571428571428564,
];

const js = CASES.map((c) => cliffsDelta(c.x, c.y));

const ok = verify({
  name: "Cliff's delta",
  js,
  golden: GOLDEN,
  tol: 1e-12,
  rPkg: 'effsize',
  rScript: () => {
    const f = tmp('cliff.json', JSON.stringify(CASES));
    return `suppressMessages(library(effsize))
d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
v <- sapply(d, function(e) as.numeric(cliff.delta(as.numeric(unlist(e$x)), as.numeric(unlist(e$y)))$estimate))
cat(jsonlite::toJSON(v, digits = 17))`;
  },
});

done('cliffs-delta', ok);
