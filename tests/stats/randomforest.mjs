// randomForest(X, y) — bagging de árboles CART + importancia Mean Decrease
// Gini, contra randomForest::randomForest(importance=TRUE) de R.
//
// A diferencia de RDA/CCA (deterministas dado el álgebra lineal), un Random
// Forest depende del muestreo aleatorio (bootstrap + submuestreo de
// variables por corte) — el PRNG de R y el de aquí (mulberry32) no producen
// la misma secuencia, así que NO es razonable pedir que las importancias
// numéricas coincidan. El criterio correcto (y el que pedía el prompt que
// motivó este método) es que el RANKING resultante identifique las MISMAS
// variables como importantes: en tests/stats/_rfsynthetic.mjs, 3 de 12
// variables (inf1/inf2/inf3) llevan señal real (media distinta por grupo) y
// 9 son ruido puro — un bosque razonable debe separarlas con claridad.

import { APP_ROOT, done } from './_shared.mjs';
import { X, Y, FEATURES, R_IMPORTANCE, INFORMATIVE } from './_rfsynthetic.mjs';

const { randomForest } = await import(APP_ROOT + '/js/lib/randomForest.js');

const checks = [];
const note = (m, pass, extra) => { checks.push(pass); console.log('  ' + (pass ? 'OK  ' : 'FALLA ') + m, extra ?? ''); };

const res = randomForest(X, Y, { nTree: 500, seed: 42 });

function spearman(a, b) {
  const rankOf = (arr) => {
    const idx = arr.map((_, i) => i).sort((i, j) => arr[i] - arr[j]);
    const r = new Array(arr.length);
    idx.forEach((originalI, rank) => { r[originalI] = rank; });
    return r;
  };
  const ra = rankOf(a), rb = rankOf(b);
  const n = a.length;
  const dSq = ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0);
  return 1 - (6 * dSq) / (n * (n * n - 1));
}

const rho = spearman(res.importance, R_IMPORTANCE);
note('correlación de rango (Spearman) JS vs R >= 0.5', rho >= 0.5, rho.toFixed(3));

const byImportance = FEATURES.map((f, i) => ({ f, imp: res.importance[i] })).sort((a, b) => b.imp - a.imp);
const top3 = byImportance.slice(0, 3).map((x) => x.f).sort();
note('top-3 por importancia (JS) == las 3 variables informativas', JSON.stringify(top3) === JSON.stringify(INFORMATIVE.slice().sort()), top3);

const infImportances = FEATURES.map((f, i) => (INFORMATIVE.includes(f) ? res.importance[i] : null)).filter((v) => v != null);
const noiseImportances = FEATURES.map((f, i) => (INFORMATIVE.includes(f) ? null : res.importance[i])).filter((v) => v != null);
note('las 3 informativas superan a las 9 de ruido, sin solape', Math.min(...infImportances) > Math.max(...noiseImportances), { minInf: Math.min(...infImportances), maxNoise: Math.max(...noiseImportances) });

// mismo invariante en R, para confirmar que el dataset realmente separa así
// (si esto fallara sería un problema del fixture, no de randomForest.js)
const rInf = INFORMATIVE.map((f) => R_IMPORTANCE[FEATURES.indexOf(f)]);
const rNoise = FEATURES.map((f, i) => (INFORMATIVE.includes(f) ? null : R_IMPORTANCE[i])).filter((v) => v != null);
note('(referencia) R también las separa sin solape', Math.min(...rInf) > Math.max(...rNoise));

note('determinismo: misma semilla → misma importancia', JSON.stringify(randomForest(X, Y, { nTree: 50, seed: 7 }).importance) === JSON.stringify(randomForest(X, Y, { nTree: 50, seed: 7 }).importance));
note('oobAccuracy en (0,1]', res.oobAccuracy > 0 && res.oobAccuracy <= 1, res.oobAccuracy);

// criterio de significancia "Boruta-lite" (variables sombra barajadas)
const resShadow = randomForest(X, Y, { nTree: 300, seed: 3, shadows: true });
note('shadowMax es un número >= 0', typeof resShadow.shadowMax === 'number' && resShadow.shadowMax >= 0, resShadow.shadowMax);
const overShadow = FEATURES.filter((f, i) => resShadow.importance[i] > resShadow.shadowMax);
note('las 3 informativas superan el umbral de las sombras', INFORMATIVE.every((f) => overShadow.includes(f)), overShadow);
note('la mayoría del ruido NO supera el umbral de las sombras (<=3 de 9 falsos positivos)', overShadow.filter((f) => !INFORMATIVE.includes(f)).length <= 3, overShadow);

// errores claros ante entradas degeneradas
note('menos de 4 muestras → error', (() => { try { randomForest(X.slice(0, 3), Y.slice(0, 3)); return false; } catch (e) { return true; } })());
note('un solo grupo → error', (() => { try { randomForest(X, Y.map(() => 'A')); return false; } catch (e) { return true; } })());
note('sin variables → error', (() => { try { randomForest(X.map(() => []), Y); return false; } catch (e) { return true; } })());

done('randomforest', checks.every(Boolean));
