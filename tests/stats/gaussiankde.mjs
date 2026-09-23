// gaussianKDE (js/lib/stats.js) -- densidad por kernel gaussiano con ancho
// de banda de Silverman (bw.nrd0 de R), para el gráfico de violín (prompt
// "quick wins" del 22 sep 2026, punto 4).
//
//   node tests/stats/gaussiankde.mjs

import { stats, verify, tmp, done } from './_shared.mjs';

const { gaussianKDE } = await stats();

const X = [4.5, 6.2, 5.8, 7.1, 3.9, 5.5, 6.8, 4.2, 5.1, 6.5, 7.8, 4.8, 5.9, 6.1, 3.5];

const r = gaussianKDE(X, 20);
const js = [r.bandwidth, ...r.x, ...r.density];
const golden = [
  0.6480569, 1.5558292997286169, 1.9867946365992888, 2.4177599734699609, 2.8487253103406327, 3.2796906472113045, 3.7106559840819768, 4.1416213209526482, 4.5725866578233205, 5.0035519946939919, 5.4345173315646642, 5.8654826684353365, 6.2964480053060079, 6.7274133421766802, 7.1583786790473516, 7.5893440159180239, 8.0203093527886953, 8.4512746896593676, 8.8822400265300399, 9.3132053634007104, 9.7441707002713827,
  0.00052755203246754507, 0.0033657639987175955, 0.014411322276933952, 0.042610516486026394, 0.090202503798826883, 0.1441062176875291, 0.18565886934496037, 0.2095465367420139, 0.22832634153588727, 0.25432947753178781, 0.27572508522592326, 0.26637341088100502, 0.22185299816728779, 0.16297341529172368, 0.10891791516947323, 0.064935528836547018, 0.031667769632277694, 0.011413077046247904, 0.0028388104881868124, 0.00046823748223592544,
];
const ok = verify({
  name: 'gaussianKDE: ancho de banda (bw.nrd0) + densidad en 20 puntos',
  // tol algo más laxa que otras pruebas: R aproxima density() con binning
  // FFT internamente (no evalúa punto a punto como esta implementación),
  // así que hay una diferencia de aproximación de ~1e-3 relativa, no un
  // error de fórmula -- confirmado comparando ambas curvas, no solo un
  // ajuste ciego de tolerancia.
  js, golden, tol: 2e-3,
  rScript: () => {
    const f = tmp('kde.json', JSON.stringify(X));
    return `x <- jsonlite::fromJSON("${f}")
bw <- bw.nrd0(x)
d <- density(x, bw = "nrd0", n = 20, from = min(x) - 3*bw, to = max(x) + 3*bw)
cat(jsonlite::toJSON(c(bw, d$x, d$y), digits = 17))`;
  },
});

const edge = gaussianKDE([5], 10);
console.log('  n<2 -> null:', edge === null ? 'OK' : 'FALLA');

done('gaussiankde', ok && edge === null);
