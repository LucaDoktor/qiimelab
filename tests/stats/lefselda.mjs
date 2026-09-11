// fisherDiscriminantCoefficient() / lefseLdaScore() (js/lib/stats.js) — la
// versión univariante-por-característica del LDA de LEfSe (Segata et al.
// 2011): coeficiente discriminante de Fisher (LDA 1D, 2 clases) entre el
// grupo "enriquecido" y "el resto", estabilizado con bootstrap.
//
// No existe un paquete de R que calcule EXACTAMENTE esto (ni siquiera
// `MASS::lda()`: su `$scaling` normaliza a varianza unitaria y por diseño no
// depende de qué clase tiene la media más alta — se comprobó a mano antes de
// descartarlo, ver comentario en stats.js). En vez de eso, se verifica la
// fórmula del coeficiente (SIN bootstrap) contra su relación EXACTA y
// conocida con el t de Student de varianzas iguales:
//   w = t · sqrt((1/n_A+1/n_B) / varianza_combinada)
// con `t` el estadístico de `t.test(a, b, var.equal=TRUE)` — así se ancla a
// una función de R real sin depender de ningún paquete de LDA.

import { APP_ROOT, hasR, verify, tmp, done } from './_shared.mjs';

const { fisherDiscriminantCoefficient, lefseLdaScore } = await import(APP_ROOT + '/js/lib/stats.js');

const A = [5.1, 5.5, 4.9, 5.3, 5.0, 5.4, 4.8, 5.2];
const B = [2.0, 2.3, 1.8, 2.1, 2.4, 1.9, 2.2, 2.0, 2.1, 1.7];

const w = fisherDiscriminantCoefficient(A, B);
// GOLDEN derivado de t.test(A,B,var.equal=TRUE)$statistic = 28.43819786768963
// vía w = t·sqrt((1/nA+1/nB)/pooled_var) — ver rScript de abajo.
const GOLDEN = [58.69822485207101];

let ok = verify({
  name: 'fisherDiscriminantCoefficient vs t.test(var.equal=TRUE) (misma relación exacta)',
  js: [w], golden: GOLDEN, tol: 1e-9, rPkg: null,
  rScript: () => {
    const f = tmp('ldaD.json', JSON.stringify({ A, B }));
    return `d <- jsonlite::fromJSON("${f}")
a <- d$A; b <- d$B
na <- length(a); nb <- length(b)
va <- var(a); vb <- var(b)
pooled <- ((na-1)*va + (nb-1)*vb) / (na+nb-2)
tt <- t.test(a, b, var.equal=TRUE)
w <- tt$statistic * sqrt((1/na+1/nb)/pooled)
cat(jsonlite::toJSON(unname(w), digits=16))`;
  },
});

const checks = [];
const note = (m, pass) => { checks.push(pass); console.log('  ' + (pass ? 'OK  ' : 'FALLA ') + m); };

note('coeficiente positivo cuando A tiene la media más alta', w > 0);
note('coeficiente cambia de signo si se invierten las clases', fisherDiscriminantCoefficient(B, A) === -w);
note('varianza combinada nula (ambas clases constantes) -> NaN', Number.isNaN(fisherDiscriminantCoefficient([5, 5, 5], [5, 5, 5])));
note('menos de 2 valores en una clase -> NaN', Number.isNaN(fisherDiscriminantCoefficient([1], [1, 2, 3])));

// --- lefseLdaScore: bootstrap determinista + orden de magnitud razonable ---
const boot1 = lefseLdaScore(A, B, { seed: 1 });
const boot2 = lefseLdaScore(A, B, { seed: 1 });
note('misma semilla -> mismo resultado (bootstrap determinista)', JSON.stringify(boot1) === JSON.stringify(boot2));
const boot3 = lefseLdaScore(A, B, { seed: 2 });
note('semilla distinta -> resultado distinto (hay remuestreo real)', JSON.stringify(boot1) !== JSON.stringify(boot3));
note('30 iteraciones por defecto', boot1.iterations === 30);
note('mediana del bootstrap positiva (A enriquecido)', boot1.coefficient > 0);
note('score = log10(|mediana|)', Math.abs(boot1.score - Math.log10(Math.abs(boot1.coefficient))) < 1e-12);
note('la mediana del bootstrap (submuestras al 66%) es del mismo orden de magnitud que el coeficiente con todos los datos',
  Math.abs(Math.log10(boot1.coefficient) - Math.log10(w)) < 1, 'boot=' + boot1.coefficient + ' full=' + w);
note('lefseLdaScore con <2 valores en una clase -> error', !!lefseLdaScore([1], [1, 2, 3]).error);

// caso realista: taxón claramente MÁS enriquecido debe dar |score| mayor que
// uno apenas diferente, con el mismo tamaño de muestra en ambos casos.
const enrichedStrong = lefseLdaScore([9, 9.5, 8.8, 9.2, 9.1], [1, 1.2, 0.9, 1.1, 1.0], { seed: 3 });
const enrichedWeak = lefseLdaScore([5.1, 5.3, 4.9, 5.2, 5.0], [4.9, 5.0, 4.8, 5.1, 4.95], { seed: 3 });
note('un taxón MUY enriquecido da un score claramente mayor que uno apenas distinto',
  enrichedStrong.score > enrichedWeak.score, 'strong=' + enrichedStrong.score + ' weak=' + enrichedWeak.score);

if (!hasR()) {
  console.log('  (Rscript no disponible: solo modo GOLDEN)');
}

done('lefselda', ok && checks.every(Boolean));
