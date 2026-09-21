// cca(Y, X) — ordenación restringida por correspondencias (chi-cuadrado),
// contra vegan::cca(). Mismo criterio que tests/stats/rda.mjs: autovalores e
// inercia total comparados exactos; sitios/especies/biplot son una
// convención de escalado propia, verificada con el invariante
// sum(lc_k^2) == eig[k] (aquí SIN dividir por n-1, a diferencia de RDA,
// porque la inercia de CCA se define como sum(Q^2) sin ese divisor — ver
// constrainedOrdination.js).

import { APP_ROOT, hasR, hasRPackage, verify, tmp, done } from './_shared.mjs';
import { Y, X, SPECIES, VARS, SAMPLES } from './_varespec.mjs';

const { cca } = await import(APP_ROOT + '/js/lib/constrainedOrdination.js');

const r = cca(Y, X, SPECIES, VARS, SAMPLES);

// GOLDEN de vegan::cca(varespec ~ N + P + K + Ca + pH, data = chem)$CCA$eig
// y $tot.chi (options(digits=16))
const GOLDEN_EIG = [0.30221939, 0.19017846, 0.11578683, 0.07694022, 0.02197437];
const GOLDEN_TOTAL_INERTIA = 2.083198;

const checks = [];
const note = (m, pass, extra) => { checks.push(pass); console.log('  ' + (pass ? 'OK  ' : 'FALLA ') + m, extra ?? ''); };

let ok = verify({
  name: 'CCA autovalores vs vegan::cca()$CCA$eig',
  js: r.eig,
  golden: GOLDEN_EIG,
  tol: 1e-5,
  rPkg: 'vegan',
  rScript: () => {
    const f = tmp('cca_input.json', JSON.stringify({ Y, X, species: SPECIES, vars: VARS }));
    return `suppressMessages(library(vegan)); library(jsonlite)
d <- jsonlite::fromJSON("${f}")
Y <- as.data.frame(d\$Y); colnames(Y) <- d\$species
X <- as.data.frame(d\$X); colnames(X) <- d\$vars
mod <- vegan::cca(Y ~ ., data = X)
cat(jsonlite::toJSON(as.numeric(mod$CCA$eig), digits = 16))`;
  },
});

note('inercia total == vegan tot.chi', Math.abs(r.totalInertia - GOLDEN_TOTAL_INERTIA) / GOLDEN_TOTAL_INERTIA < 1e-5, r.totalInertia);
note('proporción restringida ≈ ' + (0.7070993 / 2.083198).toFixed(6), Math.abs(r.proportionConstrained - 0.7070993 / 2.083198) < 1e-4, r.proportionConstrained);

// invariante exacto, independiente del escalado: sum(lc_k^2) == eig[k]
// (v_k autovector unitario de Qhat'Qhat ⇒ ||Qhat·v_k||² == eig[k]; SIN /(n-1),
// a diferencia de RDA, porque S = Qhat'Qhat sin dividir — ver cca() en
// constrainedOrdination.js)
for (let k = 0; k < r.nAxes; k++) {
  const ss = r.siteScoresFitted.reduce((s, row) => s + row[k] * row[k], 0);
  note(`invariante ||lc_${k}||² == eig[${k}]`, Math.abs(ss - r.eig[k]) / r.eig[k] < 1e-8, { ss, eig: r.eig[k] });
}

note('siteScores: n muestras × nAxes', r.siteScores.length === Y.length && r.siteScores.every((row) => row.length === r.nAxes));
note('speciesScores: p especies × nAxes', r.speciesScores.length === SPECIES.length && r.speciesScores.every((row) => row.length === r.nAxes));
note('biplotScores: q variables × nAxes, en [-1,1]', r.biplotScores.length === VARS.length && r.biplotScores.every((row) => row.every((v) => v >= -1.0001 && v <= 1.0001)));

// errores claros ante entradas degeneradas específicas de CCA
note('valor negativo en Y → error', (() => { const Yneg = Y.map((row) => row.slice()); Yneg[0][0] = -1; try { cca(Yneg, X, SPECIES, VARS, SAMPLES); return false; } catch (e) { return true; } })());
note('tabla toda a cero → error', (() => { const Yzero = Y.map((row) => row.map(() => 0)); try { cca(Yzero, X, SPECIES, VARS, SAMPLES); return false; } catch (e) { return true; } })());

if (!hasR() || !hasRPackage('vegan')) {
  console.log('  (R/vegan no disponible: solo modo GOLDEN para los autovalores)');
}

done('cca', ok && checks.every(Boolean));
