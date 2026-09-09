// permanova(distMatrix, groups) → PERMANOVA de un factor, contra
// vegan::adonis2(D ~ grupo). Los términos ANALÍTICOS (Df, sumas de cuadrados,
// pseudo-F, R²) se comparan EXACTOS; el p-valor es estocástico (PRNG distinto
// en JS y en R), así que se comprueba aparte que cae en un rango razonable.

import { stats, verify, tmp, done, hasR, hasRPackage } from './_shared.mjs';

const { permanova } = await stats();

// matriz de distancias 21×21 determinista (mulberry32), 3 grupos de 7 con
// centros separados en un espacio 4D + ruido.
function mb(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mb(20260910);
const N = 21;
const GRP = Array.from({ length: N }, (_, i) => 'G' + (Math.floor(i / 7) + 1));
const CEN = { G1: [0, 0, 0, 0], G2: [1.2, 0.3, 0, 0], G3: [0.2, 1.4, 0.5, 0] };
const P = GRP.map((g) => CEN[g].map((x) => x + (rnd() - 0.5) * 1.1));
const D = [];
for (let i = 0; i < N; i++) {
  D.push([]);
  for (let j = 0; j < N; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += (P[i][k] - P[j][k]) ** 2;
    D[i].push(Math.sqrt(s));
  }
}

const r = permanova(D, GRP, { permutations: 999, seed: 0x5152 });
const js = [r.df1, r.df2, r.SSa, r.SSw, r.SSt, r.F, r.R2];

// GOLDEN de vegan::adonis2 (options(digits=16))
const GOLDEN = [
  2, 18,
  12.07178861837599, 7.7561578305157646, 19.827946448891755,
  14.007721340832903, 0.60882697305502975,
];

let ok = verify({
  name: 'PERMANOVA Df / SS / pseudo-F / R² vs adonis2',
  js, golden: GOLDEN, tol: 1e-9, rPkg: 'vegan',
  rScript: () => {
    const f = tmp('permD.json', JSON.stringify({ D, grp: GRP }));
    return `suppressMessages(library(vegan)); library(jsonlite)
d <- jsonlite::fromJSON("${f}")
a <- vegan::adonis2(as.dist(d$D) ~ factor(d$grp), permutations = 999)
o <- c(a$Df[1], a$Df[2], a$SumOfSqs[1], a$SumOfSqs[2], a$SumOfSqs[1]+a$SumOfSqs[2], a$F[1], a$R2[1])
cat(jsonlite::toJSON(o, digits = 16))`;
  },
});

// p-valor: no comparable exacto; comprobaciones de cordura
const checks = [];
const note = (m, pass) => { checks.push(pass); console.log('  ' + (pass ? 'OK  ' : 'FALLA ') + m); };
note('p en (0, 1]', r.p > 0 && r.p <= 1);
note('p <= 1/(perms+1) o mayor', r.p >= 1 / (r.permutations + 1) - 1e-12);
note('grupos muy separados → p < 0.05', r.p < 0.05);
// caso nulo: mismos datos, etiquetas barajadas de forma que no separen nada
const nullGroups = Array.from({ length: N }, (_, i) => 'X' + (i % 3));
const rNull = permanova(D, nullGroups, { permutations: 999, seed: 7 });
note('grupos aleatorios → p claramente no significativo (> 0.1)', rNull.p > 0.1);
note('R² del caso nulo << R² del caso real', rNull.R2 < r.R2 * 0.5);
// determinismo: misma semilla → mismo p
const rB = permanova(D, GRP, { permutations: 999, seed: 0x5152 });
note('misma semilla → mismo p (determinista)', rB.p === r.p);

// errores
note('matriz y etiquetas de distinto tamaño → error', !!permanova(D, GRP.slice(1), {}).error);
note('un solo grupo → error', !!permanova(D, GRP.map(() => 'A'), {}).error);

if (!hasR() || !hasRPackage('vegan')) {
  console.log('  (R/vegan no disponible: solo modo GOLDEN para la parte analítica)');
}

done('permanova', ok && checks.every(Boolean));
