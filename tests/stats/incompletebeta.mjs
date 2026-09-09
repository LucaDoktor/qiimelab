// incompleteBeta(a, b, x) vs pbeta(x, a, b) de R, y studentTwoTailedP(t, df)
// vs 2*pt(-|t|, df). Es la base del p-valor de correlación de Pearson/Spearman.
import { stats, verify, tmp, done } from './_shared.mjs';

const { incompleteBeta, studentTwoTailedP } = await stats();

const IB = [
  [2, 3, 0.3], [0.5, 0.5, 0.5], [5, 2, 0.8], [1, 1, 0.42],
  [10, 20, 0.35], [3, 7, 0.1], [50, 50, 0.5], [2.5, 4.5, 0.65],
];
// GOLDEN: pbeta(x, a, b) de R  (options(digits=17))
const IB_GOLDEN = [
  0.34829999999999989, 0.49999999999999956, 0.65536000000000005, 0.41999999999999998,
  0.5923866636639048, 0.052972138000000051, 0.50000000000000011, 0.94450606594632147,
];

const TP = [
  [2.0, 10], [0.5, 5], [3.5, 3], [1.0, 1], [5.2, 20], [0.0, 8], [-2.7, 15], [10, 4],
];
// GOLDEN: 2*pt(-abs(t), df) de R
const TP_GOLDEN = [
  0.073388034770740393, 0.63829887164092902, 0.039481037619282774, 0.49999999999999956,
  4.3474070541624575e-05, 1, 0.016458785565740642, 0.00056200362271599112,
];

let ok = true;

ok = verify({
  name: 'beta incompleta I_x(a,b)',
  js: IB.map(([a, b, x]) => incompleteBeta(a, b, x)),
  golden: IB_GOLDEN,
  tol: 1e-10,
  rScript: () => {
    const f = tmp('ib.json', JSON.stringify(IB));
    return `d <- jsonlite::fromJSON("${f}"); cat(jsonlite::toJSON(pbeta(d[,3], d[,1], d[,2]), digits = 17))`;
  },
}) && ok;

ok = verify({
  name: 't de Student a dos colas',
  js: TP.map(([t, df]) => studentTwoTailedP(t, df)),
  golden: TP_GOLDEN,
  tol: 1e-10,
  rScript: () => {
    const f = tmp('tp.json', JSON.stringify(TP));
    return `d <- jsonlite::fromJSON("${f}"); cat(jsonlite::toJSON(2 * pt(-abs(d[,1]), d[,2]), digits = 17))`;
  },
}) && ok;

done('incomplete-beta', ok);
