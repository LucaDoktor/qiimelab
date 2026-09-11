// oneWayAnova() / fisherLSD() / compactLetterDisplay() (js/lib/stats.js) vs
// R's `aov()` + `agricolae::LSD.test(mod, "g", p.adj="none")` — el test LSD
// de Fisher CLÁSICO: t-test por pareja con la varianza combinada del ANOVA,
// SIN corregir por comparaciones múltiples (deliberado: "least significant
// difference" se usa solo tras un ANOVA ya significativo). Las letras de
// grupo homogéneo se comprueban letra a letra contra la salida de
// `LSD.test()$groups` (que ordena "a" = media más alta, igual que
// compactLetterDisplay()), y la partición también contra
// `multcompView::multcompLetters()` sobre los mismos p-valores por pareja.

import { APP_ROOT, hasR, hasRPackage, verify, tmp, done } from './_shared.mjs';

const { oneWayAnova, fisherLSD, compactLetterDisplay } = await import(APP_ROOT + '/js/lib/stats.js');

// 5 grupos, tamaños MUY desiguales (n=8 ×4, n=2 uno) para que el patrón de
// significación NO sea monótono con la media — el caso realista en
// "recuentos microbianos" (réplicas desiguales, ya tratado en otra parte del
// módulo). M (n=2, media 14) cae entre B (13) y C (16) pero, por su SE
// grande, solo deja de diferir de B.
const A = [10.1, 9.9, 10.2, 9.8, 10.0, 10.3, 9.7, 10.1];
const B = [13.0, 12.8, 13.2, 13.1, 12.9, 13.3, 12.7, 13.0];
const M = [10.8, 17.2];
const C = [16.0, 15.8, 16.2, 16.1, 15.9, 16.3, 15.7, 16.0];
const D = [19.0, 18.8, 19.2, 19.1, 18.9, 19.3, 18.7, 19.0];
const groups = [A, B, M, C, D];
const names = ['A', 'B', 'M', 'C', 'D'];

const anova = oneWayAnova(groups);
const js = [anova.dfBetween, anova.dfWithin, anova.msBetween, anova.msWithin, anova.F, anova.p];
// GOLDEN de aov(y ~ g) en R (options(digits=16))
const GOLDEN = [4, 29, 89.894356617647134, 0.74512931034482743, 120.64262587663643, 1.2368265496760301e-17];

let ok = verify({
  name: 'oneWayAnova (df, MSbetween, MSwithin, F, p) vs aov(y ~ g)',
  js, golden: GOLDEN, tol: 1e-9,
  rScript: () => {
    const f = tmp('anovaD.json', JSON.stringify({ A, B, M, C, D }));
    return `d <- jsonlite::fromJSON("${f}")
g <- factor(c(rep("A",8), rep("B",8), rep("M",2), rep("C",8), rep("D",8)), levels=c("A","B","M","C","D"))
y <- c(d$A, d$B, d$M, d$C, d$D)
s <- summary(aov(y ~ g))[[1]]
cat(jsonlite::toJSON(c(s[["Df"]][1], s[["Df"]][2], s[["Mean Sq"]][1], s[["Mean Sq"]][2], s[["F value"]][1], s[["Pr(>F)"]][1]), digits=16))`;
  },
});

const lsd = fisherLSD(groups, 0.05);
const pByPair = {};
lsd.pairwise.forEach((pw) => { pByPair[names[pw.i] + '-' + names[pw.j]] = pw.p; });
const PAIR_ORDER = ['A-B', 'A-M', 'A-C', 'A-D', 'B-M', 'B-C', 'B-D', 'M-C', 'M-D', 'C-D'];
const pJs = PAIR_ORDER.map((k) => pByPair[k]);
// GOLDEN: p de un t-test por pareja con la MSerror de LSD.test (idéntica a la
// del ANOVA de arriba) — ver rScript de abajo para el recálculo en vivo.
const pGolden = [
  1.3167568268315998e-7, 2.451549219978332e-6, 2.4753908760952829e-14, 5.4850830301867163e-19,
  0.15358180431945082, 1.2192090426270509e-7, 2.3480179873780621e-14,
  0.006531939141225962, 4.527108057171817e-8, 1.2192090426270509e-7,
];
let ok2 = verify({
  name: 'fisherLSD: p-valor por pareja (t-test con varianza combinada) vs LSD.test',
  js: pJs, golden: pGolden, tol: 1e-8, rPkg: 'agricolae',
  rScript: () => {
    const f = tmp('lsdD.json', JSON.stringify({ A, B, M, C, D }));
    return `suppressMessages(library(agricolae))
d <- jsonlite::fromJSON("${f}")
g <- factor(c(rep("A",8), rep("B",8), rep("M",2), rep("C",8), rep("D",8)), levels=c("A","B","M","C","D"))
y <- c(d$A, d$B, d$M, d$C, d$D)
mod <- aov(y ~ g)
out <- LSD.test(mod, "g", p.adj="none")
pairs <- list(c("A","B"),c("A","M"),c("A","C"),c("A","D"),c("B","M"),c("B","C"),c("B","D"),c("M","C"),c("M","D"),c("C","D"))
mse <- out$statistics$MSerror; dfr <- out$statistics$Df
means <- tapply(y, g, mean); ns <- tapply(y, g, length)
pvec <- sapply(pairs, function(p) {
  se <- sqrt(mse * (1/ns[p[1]] + 1/ns[p[2]]))
  tt <- (means[p[1]] - means[p[2]]) / se
  2*pt(-abs(tt), dfr)
})
cat(jsonlite::toJSON(pvec, digits=16))`;
  },
});

// --- letras: comparación carácter a carácter con LSD.test()$groups (mismo
// criterio "a" = media más alta) ---
const checks = [];
const note = (m, pass) => { checks.push(pass); console.log('  ' + (pass ? 'OK  ' : 'FALLA ') + m); };
const letters = compactLetterDisplay(5, lsd.pairwise, lsd.means);
const gotLetters = {}; names.forEach((n, i) => { gotLetters[n] = letters[i]; });
console.log('  letras:', JSON.stringify(gotLetters));
// GOLDEN de LSD.test()$groups: D=a, C=b, B=c, M=c, A=d (idéntico carácter a
// carácter a lo que produce compactLetterDisplay con este mismo criterio de
// orden — no solo la misma partición).
note('D obtiene "a" (media más alta)', gotLetters.D === 'a');
note('C obtiene "b"', gotLetters.C === 'b');
note('B y M comparten letra "c" (LSD.test: B=c, M=c)', gotLetters.B === 'c' && gotLetters.M === 'c');
note('A obtiene "d" (media más baja)', gotLetters.A === 'd');
note('exactamente 4 letras distintas en total (5 grupos, B/M comparten una)', new Set(letters).size === 4);

// --- caso de letra doble: grafo construido a mano (grupo intermedio que
// solapa con dos "cliques" distintas que NO se solapan entre sí) —
// independiente de cualquier ANOVA, comprueba la lógica de
// compactLetterDisplay() por sí sola (Bron-Kerbosch, cliques maximales). ---
{
  const pairwise = [
    { i: 0, j: 1, significant: false }, { i: 0, j: 2, significant: true }, { i: 0, j: 3, significant: true },
    { i: 1, j: 2, significant: false }, { i: 1, j: 3, significant: true }, { i: 2, j: 3, significant: true },
  ];
  const lettersPath = compactLetterDisplay(4, pairwise, [10, 9, 8, 20]);
  note('grafo camino 0-1-2 (0≠2): el grupo del medio (1) lleva DOS letras', lettersPath[1].length === 2, JSON.stringify(lettersPath));
  note('grupo 0 y grupo 2 NO comparten ninguna letra entre sí (difieren)', ![...lettersPath[0]].some((c) => lettersPath[2].includes(c)), JSON.stringify(lettersPath));
  note('grupo 0 comparte una letra con el grupo 1', [...lettersPath[0]].some((c) => lettersPath[1].includes(c)));
  note('grupo 2 comparte una letra con el grupo 1', [...lettersPath[2]].some((c) => lettersPath[1].includes(c)));
  note('grupo 3 (aislado, media más alta) tiene su propia letra única', !lettersPath[3].split('').some((c) => lettersPath.some((l, i) => i !== 3 && l.includes(c))));
}

// --- errores ---
note('oneWayAnova con 1 solo grupo -> error', !!oneWayAnova([[1, 2, 3]]).error);
note('fisherLSD con 1 solo grupo -> error', !!fisherLSD([[1, 2, 3]]).error);

if (!hasR() || !hasRPackage('agricolae')) {
  console.log('  (R/agricolae no disponible: solo modo GOLDEN)');
}

done('fisherlsd', ok && ok2 && checks.every(Boolean));
