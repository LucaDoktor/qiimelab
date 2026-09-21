// rda(Y, X) — ordenación restringida lineal (RDA), contra vegan::rda().
//
// Los AUTOVALORES y la inercia total son directamente comparables (misma
// definición matemática que vegan) y se verifican exactos. Las coordenadas
// de sitios/especies/biplot son una convención de escalado PROPIA (ver el
// comentario de cabecera de constrainedOrdination.js) — no comparables valor
// a valor contra vegan sin reproducir su sistema interno de "scaling", así
// que en su lugar se comprueba un invariante exacto que sí es independiente
// de cualquier convención de escalado: sum(lc_k^2) == autovalor_k, que se
// cumple si y solo si el autovector realmente diagonaliza Yhat'Yhat.

import { APP_ROOT, hasR, hasRPackage, verify, tmp, done } from './_shared.mjs';
import { Y, X, SPECIES, VARS, SAMPLES } from './_varespec.mjs';

const { rda } = await import(APP_ROOT + '/js/lib/constrainedOrdination.js');

const r = rda(Y, X, SPECIES, VARS, SAMPLES);

// GOLDEN de vegan::rda(varespec ~ N + P + K + Ca + pH, data = chem)$CCA$eig
// y $tot.chi (options(digits=16))
const GOLDEN_EIG = [480.065364, 220.235605, 47.288201, 28.787018, 6.790738];
const GOLDEN_TOTAL_INERTIA = 1825.659;

const checks = [];
const note = (m, pass, extra) => { checks.push(pass); console.log('  ' + (pass ? 'OK  ' : 'FALLA ') + m, extra ?? ''); };

let ok = verify({
  name: 'RDA autovalores vs vegan::rda()$CCA$eig',
  js: r.eig,
  golden: GOLDEN_EIG,
  tol: 1e-5, // GOLDEN embebido con 6 cifras significativas; el recálculo en vivo usa tol propia más abajo
  rPkg: 'vegan',
  rScript: () => {
    const f = tmp('rda_input.json', JSON.stringify({ Y, X, species: SPECIES, vars: VARS }));
    return `suppressMessages(library(vegan)); library(jsonlite)
d <- jsonlite::fromJSON("${f}")
Y <- as.data.frame(d\$Y); colnames(Y) <- d\$species
X <- as.data.frame(d\$X); colnames(X) <- d\$vars
mod <- vegan::rda(Y ~ ., data = X)
cat(jsonlite::toJSON(as.numeric(mod$CCA$eig), digits = 16))`;
  },
});
if (!ok) console.log('  (nota: si falla solo el modo GOLDEN por redondeo, revisar tol — el recálculo en vivo contra R es la referencia fuerte)');

note('inercia total == vegan tot.chi', Math.abs(r.totalInertia - GOLDEN_TOTAL_INERTIA) / GOLDEN_TOTAL_INERTIA < 1e-5, r.totalInertia);
note('proporción restringida ≈ ' + (783.1669 / 1825.659).toFixed(6), Math.abs(r.proportionConstrained - 783.1669 / 1825.659) < 1e-4, r.proportionConstrained);

// invariante exacto, independiente del escalado: sum(lc_k^2) == eig[k]
// (v_k es autovector unitario de Yhat'Yhat/(n-1) ⇒ v_k'(Yhat'Yhat/(n-1))v_k
// == eig[k] ⇒ ||Yhat·v_k||²/(n-1) == eig[k])
const n = Y.length;
for (let k = 0; k < r.nAxes; k++) {
  const ss = r.siteScoresFitted.reduce((s, row) => s + row[k] * row[k], 0) / (n - 1);
  note(`invariante ||lc_${k}||²/(n-1) == eig[${k}]`, Math.abs(ss - r.eig[k]) / r.eig[k] < 1e-9, { ss, eig: r.eig[k] });
}

// formas y rangos de salida
note('siteScores: n muestras × nAxes', r.siteScores.length === n && r.siteScores.every((row) => row.length === r.nAxes));
note('speciesScores: p especies × nAxes', r.speciesScores.length === SPECIES.length && r.speciesScores.every((row) => row.length === r.nAxes));
note('biplotScores: q variables × nAxes, en [-1,1]', r.biplotScores.length === VARS.length && r.biplotScores.every((row) => row.every((v) => v >= -1.0001 && v <= 1.0001)));
note('proportionExplained suma <= proportionConstrained + 1e-9', r.proportionExplained.reduce((a, b) => a + b, 0) <= r.proportionConstrained + 1e-9);

// errores claros ante entradas degeneradas
note('demasiadas variables para las muestras → error', (() => { try { rda(Y.slice(0, 4), X.slice(0, 4).map((r2) => [...r2, 1, 2]), SPECIES, [...VARS, 'a', 'b'], SAMPLES.slice(0, 4)); return false; } catch (e) { return true; } })());
note('nº de filas de X distinto de Y → error', (() => { try { rda(Y, X.slice(1), SPECIES, VARS, SAMPLES); return false; } catch (e) { return true; } })());

if (!hasR() || !hasRPackage('vegan')) {
  console.log('  (R/vegan no disponible: solo modo GOLDEN para los autovalores)');
}

done('rda', ok && checks.every(Boolean));
