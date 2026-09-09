// chiSquarePValue(x, df) vs pchisq(x, df, lower.tail = FALSE) de R base.
// Es la cola que usa el p-valor de Kruskal-Wallis.
import { stats, verify, tmp, done } from './_shared.mjs';

const { chiSquarePValue } = await stats();

const CASES = [
  [0.5, 1], [3.84, 1], [10, 1], [1, 2], [5.99, 2], [20, 2],
  [7.81, 3], [2, 5], [11.07, 5], [30, 10], [0.001, 1], [50, 4], [100, 20],
];

// GOLDEN: pchisq(x, df, lower.tail = FALSE) de R  (options(digits=17))
const GOLDEN = [
  0.47950012218695348, 0.050043521248705224, 0.0015654022580025519,
  0.60653065971263342, 0.05003662708658628, 4.5399929762484854e-05,
  0.050106056350005944, 0.84914503608460967, 0.050009618622405487,
  0.00085664121077530053, 0.97477287936996038, 3.6108654048906463e-10,
  1.259608459166091e-12,
];

const js = CASES.map(([x, df]) => chiSquarePValue(x, df));

const ok = verify({
  name: 'chi-cuadrado (cola superior)',
  js,
  golden: GOLDEN,
  tol: 1e-9,
  rScript: () => {
    const f = tmp('chisq.json', JSON.stringify(CASES));
    return `d <- jsonlite::fromJSON("${f}"); cat(jsonlite::toJSON(pchisq(d[,1], d[,2], lower.tail = FALSE), digits = 17))`;
  },
});

done('chi-square', ok);
