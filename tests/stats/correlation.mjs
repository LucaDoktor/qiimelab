// pearson(x, y) y spearman(x, y) → {r, p, n} vs R.
//   · Pearson: cor.test(x, y, method = "pearson") (r y p exactos).
//   · Spearman: en stats.js es Pearson sobre los rangos con el mismo p-valor t,
//     así que la referencia es cor.test(rank(x), rank(y), method = "pearson").
import { stats, verify, tmp, done } from './_shared.mjs';

const { pearson, spearman } = await stats();

const X1 = [2.1, 3.4, 1.0, 5.5, 4.2, 6.1, 2.9, 7.0, 3.3, 5.8];
const Y1 = [1.5, 2.0, 0.9, 4.1, 3.0, 5.5, 2.2, 6.8, 2.5, 4.9];
const X2 = [10, 8, 6, 4, 2, 1, 3, 5, 7, 9];
const Y2 = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2];   // con empates → Spearman sobre rangos medios

// GOLDEN de R: [r, p] por caso
const P_GOLDEN = [
  0.97246383970168127, 2.4331458403103151e-06,   // Pearson X1,Y1
  -0.98644005041562111, 1.455210848294147e-07,    // Pearson X2,Y2
];
const S_GOLDEN = [
  0.96363636363636362, 7.3209748095298041e-06,   // Spearman X1,Y1
  -0.9878044218151566, 9.5371282240775195e-08,    // Spearman X2,Y2
];

const pJs = [pearson(X1, Y1), pearson(X2, Y2)].flatMap((o) => [o.r, o.p]);
const sJs = [spearman(X1, Y1), spearman(X2, Y2)].flatMap((o) => [o.r, o.p]);

let ok = true;
ok = verify({
  name: 'Pearson r, p',
  js: pJs, golden: P_GOLDEN, tol: 1e-9,
  rScript: () => {
    const f = tmp('corr-p.json', JSON.stringify([[X1, Y1], [X2, Y2]]));
    return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(e) { t <- cor.test(as.numeric(unlist(e[[1]])), as.numeric(unlist(e[[2]])), method = "pearson"); c(as.numeric(t$estimate), t$p.value) }))
cat(jsonlite::toJSON(o, digits = 17))`;
  },
}) && ok;

ok = verify({
  name: 'Spearman rho, p (Pearson sobre rangos)',
  js: sJs, golden: S_GOLDEN, tol: 1e-9,
  rScript: () => {
    const f = tmp('corr-s.json', JSON.stringify([[X1, Y1], [X2, Y2]]));
    return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(e) { x <- rank(as.numeric(unlist(e[[1]]))); y <- rank(as.numeric(unlist(e[[2]]))); t <- cor.test(x, y, method = "pearson"); c(as.numeric(t$estimate), t$p.value) }))
cat(jsonlite::toJSON(o, digits = 17))`;
  },
}) && ok;

const nOk = pearson(X1, Y1).n === 10 && spearman(X1, Y1).n === 10;
console.log('  n devuelto correcto:', nOk ? 'OK' : 'FALLA');

done('correlation', ok && nOk);
