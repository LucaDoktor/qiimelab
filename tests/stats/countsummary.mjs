// Recuento microbiano: media / desviación típica / error estándar por grupo
// (en log10) vs. mean() / sd() / sd()/sqrt(n) de R base.
//
// Verifica js/lib/countStats.js `summariseCountSeries` (que se apoya en
// mean / stdDev / standardError de js/lib/stats.js) sobre una tabla de
// réplicas con columnas de agrupación, incluida la exclusión de celdas
// 0 / negativas / no numéricas y la vía "el valor ya viene en log10".

import { verify, tmp, done, APP_ROOT } from './_shared.mjs';

const { summariseCountSeries } = await import(APP_ROOT + '/js/lib/countStats.js');

// 4 grupos (3 con n=3, uno con n=2) + 2 celdas rotas (#NUM! y un 0) que NO deben contar
const ROWS = [
  { Grupo: 'g1', UFC: 3772082 }, { Grupo: 'g1', UFC: 4537520 }, { Grupo: 'g1', UFC: 8648715 },
  { Grupo: 'g2', UFC: 275096 }, { Grupo: 'g2', UFC: 142294 }, { Grupo: 'g2', UFC: 114230 },
  { Grupo: 'g3', UFC: 42340 }, { Grupo: 'g3', UFC: 23021 }, { Grupo: 'g3', UFC: '#NUM!' }, { Grupo: 'g3', UFC: 0 },
  { Grupo: 'g4', UFC: 192000 }, { Grupo: 'g4', UFC: 212000 }, { Grupo: 'g4', UFC: 269000 },
];
const RAW_G = { g1: [3772082, 4537520, 8648715], g2: [275096, 142294, 114230], g3: [42340, 23021], g4: [192000, 212000, 269000] };

const seriesLog = {
  headers: ['Grupo', 'UFC'],
  rows: ROWS,
  mapping: { groupCols: [0], valueCol: 1, dilutionCol: null, alreadyLog: false },
};
const sumLog = summariseCountSeries(seriesLog);

// vía alreadyLog: valores usados tal cual (sin log10)
const Y = [6.2, 6.5, 6.1, 6.8, 6.3];
const seriesAlready = {
  headers: ['Grupo', 'logUFC'],
  rows: Y.map((v) => ({ Grupo: 'gL', logUFC: v })),
  mapping: { groupCols: [0], valueCol: 1, dilutionCol: null, alreadyLog: true },
};
const sumAlready = summariseCountSeries(seriesAlready);

// aplanado JS en el mismo orden que el GOLDEN: por grupo [n, mean, sd, se]
const byKey = {};
sumLog.groups.forEach((g) => { byKey[g.key] = g; });
const js = [];
['g1', 'g2', 'g3', 'g4'].forEach((k) => {
  const g = byKey[k];
  js.push(g.n, g.meanLog, g.sd, g.se);
});
const gL = sumAlready.groups[0];
js.push(gL.n, gL.meanLog, gL.sd, gL.se);

// R devolvió esto al escribir el test (options(digits=17))
const GOLDEN = [
  3, 6.7234504211752562, 0.18919981962045618, 0.10923456678849902,
  3, 5.2168170134459979, 0.19864825208608869, 0.11468962181595195,
  2, 4.4944375192654986, 0.18711931201659276, 0.13231333441789417,
  3, 5.3464631232115698, 0.075271559183307871, 0.043458054956805652,
  5, 6.3799999999999999, 0.27748873851023215, 0.12409673645990855,
];

// chequeos que no dependen de R
let extraOk = true;
const note = (m, ok) => { console.log('  ' + (ok ? 'OK  ' : 'FALLA ') + m); if (!ok) extraOk = false; };
note('g3 descarta 2 celdas (#NUM! + 0): excluded == 2', sumLog.excluded === 2);
note('g3 se queda con n=2', byKey.g3.n === 2);
note('modeN == 3', sumLog.modeN === 3);
note('unevenN == true (g3 n=2 frente a 3)', sumLog.unevenN === true);
note('groupColNames == ["Grupo"]', JSON.stringify(sumLog.groupColNames) === '["Grupo"]');

const ok = verify({
  name: 'recuento: media/SD/SE en log10 por grupo',
  js, golden: GOLDEN, tol: 1e-9,
  rScript: () => {
    const f = tmp('countsummary.json', JSON.stringify({ RAW_G, Y }));
    return `d <- jsonlite::fromJSON("${f}")
o <- c()
for (k in c("g1","g2","g3","g4")) {
  x <- as.numeric(d$RAW_G[[k]]); lx <- log10(x)
  o <- c(o, length(x), mean(lx), sd(lx), sd(lx)/sqrt(length(x)))
}
y <- as.numeric(d$Y)
o <- c(o, length(y), mean(y), sd(y), sd(y)/sqrt(length(y)))
cat(jsonlite::toJSON(o, digits = 17))`;
  },
});

done('countsummary', ok && extraOk);
