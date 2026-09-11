// pDistance() / jukesCantorCorrection() (js/lib/phyloDistance.js) contra
// `ape::dist.dna(model="raw"|"JC69", pairwise.deletion=TRUE)` — mismo patrón
// JS vs GOLDEN / R vivo que el resto de tests/stats/.

import { APP_ROOT, hasR, hasRPackage, verify, tmp, done } from './_shared.mjs';

const { pDistance, jukesCantorCorrection, buildDistanceMatrix } = await import(APP_ROOT + '/js/lib/phyloDistance.js');

// s1/s2: 2 sustituciones en 10 -> p = 0.2. s3: mismas que s1 pero con 2 huecos
// (posiciones 3 y 8) -> pairwise deletion los excluye de TODAS las comparaciones.
const s1 = 'ACGTACGTAC';
const s2 = 'ACCTACGAAC';
const s3 = 'AC-TACG-AC';

const js = [pDistance(s1, s2), pDistance(s1, s3), pDistance(s2, s3)];
// GOLDEN de ape::dist.dna(model="raw", pairwise.deletion=TRUE) (ver rScript)
const GOLDEN = [0.2, 0, 0];

let ok = verify({
  name: 'pDistance vs ape::dist.dna(model="raw", pairwise.deletion=TRUE)',
  js, golden: GOLDEN, tol: 1e-9, rPkg: 'ape',
  rScript: () => {
    const f = tmp('pdist.json', JSON.stringify({ s1, s2, s3 }));
    return `suppressMessages(library(ape)); library(jsonlite)
d <- jsonlite::fromJSON("${f}")
seqs <- list(s1 = strsplit(d$s1, "")[[1]], s2 = strsplit(d$s2, "")[[1]], s3 = strsplit(d$s3, "")[[1]])
dna <- as.DNAbin(seqs)
m <- as.matrix(dist.dna(dna, model="raw", pairwise.deletion=TRUE))
cat(jsonlite::toJSON(c(m['s1','s2'], m['s1','s3'], m['s2','s3']), digits=16))`;
  },
});

// Jukes-Cantor: p=0.2 -> 0.2326161962 (verificado a mano contra ape::dist.dna(model="JC69"))
const jcJs = [jukesCantorCorrection(0.2), jukesCantorCorrection(0.5)];
const jcGolden = [0.2326161962278796, 0.8239592165010822];
let ok2 = verify({
  name: 'jukesCantorCorrection vs ape::dist.dna(model="JC69")',
  js: jcJs, golden: jcGolden, tol: 1e-9, rPkg: 'ape',
  rScript: () => {
    const f = tmp('jc.json', JSON.stringify({}));
    return `suppressMessages(library(ape)); library(jsonlite)
mkseqs <- function(p) {
  n <- 100
  a <- rep('A', n)
  b <- a
  nd <- round(p * n)
  if (nd > 0) b[1:nd] <- 'T'
  list(a=a, b=b)
}
res <- sapply(c(0.2, 0.5), function(p) {
  s <- mkseqs(p)
  dna <- as.DNAbin(list(a=s$a, b=s$b))
  as.matrix(dist.dna(dna, model="JC69", pairwise.deletion=TRUE))['a','b']
})
cat(jsonlite::toJSON(res, digits=16))`;
  },
});

const checks = [];
const note = (m, pass) => { checks.push(pass); console.log('  ' + (pass ? 'OK  ' : 'FALLA ') + m); };
note('JC69 satura (NaN) a p=0.75 exacto', Number.isNaN(jukesCantorCorrection(0.75)));
note('JC69 satura (NaN) por encima de 0.75', Number.isNaN(jukesCantorCorrection(0.9)));
note('JC69(0) = 0', jukesCantorCorrection(0) === 0);
note('pDistance secuencias idénticas = 0', pDistance('ACGT', 'ACGT') === 0);
note('pDistance sin columnas comparables (todo hueco en una) = NaN', Number.isNaN(pDistance('----', 'ACGT')));

const { matrix, saturated } = buildDistanceMatrix([s1, s2, 'TTTTTTTTTT'], { correction: 'jc' });
note('buildDistanceMatrix: diagonal cero', matrix[0][0] === 0 && matrix[1][1] === 0 && matrix[2][2] === 0);
note('buildDistanceMatrix: simétrica', matrix[0][1] === matrix[1][0] && matrix[0][2] === matrix[2][0]);
note('buildDistanceMatrix: par totalmente divergente marcado como saturado con el cap aplicado',
  saturated.some(([i, j]) => (i === 0 && j === 2) || (i === 2 && j === 0)) && matrix[0][2] > 1);

if (!hasR() || !hasRPackage('ape')) {
  console.log('  (R/ape no disponible: solo modo GOLDEN)');
}

done('phylodistance', ok && ok2 && checks.every(Boolean));
