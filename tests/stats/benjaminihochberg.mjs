// benjaminiHochberg(p) vs p.adjust(p, method = "BH") de R base.
import { stats, verify, tmp, done, flat } from './_shared.mjs';

const { benjaminiHochberg } = await stats();

// vector conocido (mezcla de significativos, empates y no significativos)
const P = [0.001, 0.008, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212,
  0.216, 0.222, 0.436, 0.51, 0.583, 0.98, 0.99, 1.0];

// GOLDEN: p.adjust(P, "BH") de R  (options(digits=17))
const GOLDEN = [
  0.018000000000000002, 0.048000000000000001, 0.048000000000000001, 0.126, 0.126, 0.126,
  0.1542857142857143, 0.16649999999999998, 0.33300000000000002, 0.33300000000000002,
  0.33300000000000002, 0.33300000000000002, 0.60369230769230764, 0.65571428571428581,
  0.69959999999999989, 1, 1, 1,
];

const js = benjaminiHochberg(P);

const ok = verify({
  name: 'Benjamini-Hochberg',
  js: flat(js),
  golden: GOLDEN,
  tol: 1e-12,
  rScript: () => {
    const f = tmp('bh.json', JSON.stringify(P));
    return `p <- jsonlite::fromJSON("${f}"); cat(jsonlite::toJSON(p.adjust(p, "BH"), digits = 17))`;
  },
  rFlatten: (r) => flat(r),
});

done('benjamini-hochberg', ok);
