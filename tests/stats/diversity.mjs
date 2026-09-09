// Índices de diversidad alfa por muestra vs vegan:
//   shannonIndex  → diversity(x, "shannon")   (log natural)
//   simpsonIndex  → diversity(x, "simpson")   (1 − D)
//   observedRichness → sum(x > 0)
//   pielouEvenness → shannon / log(observed)
//   chao1 → estimateR(x)["S.chao1"]           (Chao 1987, corregido por sesgo)
import { stats, verify, tmp, done, exampleCounts } from './_shared.mjs';

const S = await stats();
const ex = await exampleCounts();

// 6 muestras reales + 2 vectores sintéticos con singletons/doubletons (para
// que chao1 no sea trivial: las muestras curadas no tienen singletons).
const realSel = ['A-1', 'B-2', 'D-3', 'H-1', 'N-3', 'C-2'];
const vectors = realSel.map((s) => ex.bySample[s]);
vectors.push([50, 30, 20, 10, 5, 3, 2, 2, 1, 1, 1, 0, 8]);
vectors.push([1, 1, 1, 1, 2, 2, 3, 5, 8, 13, 21]);

const jsFor = (fn) => vectors.map(fn);

// GOLDEN de vegan  (options(digits=17))
const G = {
  shannon: [3.6330864051592195, 3.4319885804075989, 3.2670125090307733, 3.0830961675477115, 3.1235543990268755, 3.4731356911697517, 1.7976520184011107, 1.8530212808387441],
  simpson: [0.94492853923292486, 0.94129831219642268, 0.92951667305741614, 0.90102668239702643, 0.90742919152973422, 0.94846189577080231, 0.77336197636949522, 0.7859690844233056],
  observed: [192, 164, 151, 155, 159, 151, 12, 11],
  pielou: [0.69102988173586577, 0.67295656248624902, 0.65115214125763055, 0.61130999193480773, 0.61621886593530939, 0.69223479736672855, 0.72342839058138353, 0.77276989610820135],
  chao1: [192, 164, 151, 155, 159, 151, 13, 13],
};

function rScript() {
  const f = tmp('div.json', JSON.stringify(vectors));
  return `suppressMessages(library(vegan))
v <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- list(shannon=c(), simpson=c(), observed=c(), pielou=c(), chao1=c())
for (e in v) { x <- as.numeric(unlist(e))
  o$shannon <- c(o$shannon, diversity(x, "shannon"))
  o$simpson <- c(o$simpson, diversity(x, "simpson"))
  o$observed <- c(o$observed, sum(x > 0))
  o$pielou <- c(o$pielou, diversity(x, "shannon") / log(sum(x > 0)))
  o$chao1 <- c(o$chao1, as.numeric(estimateR(x)["S.chao1"])) }
cat(jsonlite::toJSON(o, digits = 17))`;
}

let ok = true;
for (const [name, fn] of [
  ['shannonIndex', (x) => S.shannonIndex(x)],
  ['simpsonIndex', (x) => S.simpsonIndex(x)],
  ['observedRichness', (x) => S.observedRichness(x)],
  ['pielouEvenness', (x) => S.pielouEvenness(x)],
  ['chao1', (x) => S.chao1(x)],
]) {
  const key = name === 'shannonIndex' ? 'shannon' : name === 'simpsonIndex' ? 'simpson'
    : name === 'observedRichness' ? 'observed' : name === 'pielouEvenness' ? 'pielou' : 'chao1';
  console.log('· ' + name);
  ok = verify({
    name, js: jsFor(fn), golden: G[key], tol: 1e-10, rPkg: 'vegan',
    rScript, rFlatten: (r) => (Array.isArray(r[key]) ? r[key] : [r[key]]),
  }) && ok;
}

done('diversity', ok);
