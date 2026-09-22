// pairwiseStats.js: mannWhitneyU, welchT, studentT, wilcoxonSignedRank,
// pairedT, dunnTest, pAdjust — contra fixtures ancladas a R.
//
// Los GOLDEN de este archivo vienen de Claude outputs/assets/pairwise_fixtures.json
// (gitignored, no se puede leer en CI): generadas con scipy/numpy en la
// sesión de auditoría del editor de gráficas, NO con R real, y ancladas a
// valores documentados de R donde los hay (ver los `note` de cada caso). Por
// eso, a diferencia del resto de tests/stats/*.mjs, aquí la comprobación
// «R vivo vs GOLDEN» importa más de lo habitual: si hay Rscript en la
// máquina, mannWhitneyU/welchT/studentT/wilcoxonSignedRank/pairedT/pAdjust
// se recalculan con funciones base de R (wilcox.test/t.test/p.adjust) — la
// única pieza sin ese cruce en vivo es dunnTest (el paquete `dunn.test` no
// está instalado aquí), que se queda en modo GOLDEN + un cruce de
// meanRanks/H/df/p con `kruskal.test` base.
import { stats, verify, tmp, hasR, done } from './_shared.mjs';
import {
  mannWhitneyU, welchT, studentT, wilcoxonSignedRank, pairedT, dunnTest, pAdjust,
} from '../../js/lib/pairwiseStats.js';

const { kruskalWallis } = await stats();
let allOk = true;

// ---------------------------------------------------------- Mann-Whitney U --
const CASES = [[[0.7,-1.6,-0.2,-1.2,-0.1,3.4,3.7,0.8,0,2],[1.9,0.8,1.1,0.1,-0.1,4.4,5.5,1.6,4.6,3.4]],[[1,2,3],[4,5,6]],[[1,2,3,4],[5,6,7,8]],[[0,0,1,1,1,2,2,3],[1,2,2,3,3,3,4,5,5]],[[2.243,4.953,4.594,5.558,3.608,6.584,6.015],[7.543,5.85,5.173,4.945,6.234,6.291,3.558,5.067,5.246,8.776,4.606]],[[10.73,12.85,9.89,6.5,9.46,8.58,7.41,9.66,8.47,8.61,10.55,12.48,9,8.75,9.2,10.82,8.51,13.88,8.49,9.96,10.71,13.12,11.85,8.2,9.51,8.36,4.85,10.06,10.78,10.74,8.57,11.19,8.25,13.97,15.68,9.93,12.55,8.96,8.59,8.88,10.26,13.18,11.76,9.57,10.24,11.74,9.94,10.92,6.29,9.9,11.52,13.04,8.46,7.84,10.77,8.89,11.23,8.51,7.35,9.84],[9.48,9.16,9.11,8.99,6.98,11.01,10.81,12.21,12.51,5.37,12.44,13.6,5.6,15.68,8.98,13.32,12.4,14.31,12.49,12.2,8.6,14.8,13.89,12.19,12.71,6.91,12.86,13.74,7.68,10.95,10.64,12.7,14.63,8.13,11.7,11.8,10.7,10.8,14.41,8.91,10.22,9.09,5.57,5.25,12.17,15.11,11.53,13.9,7.63,10.94,11.49,9.8,6.14,13.14,9.31]],[[2,2,2,2],[1,2,3,4]]];
const MW_GOLDEN = [25.5,0.06932757543362658,0,0.1,0,0.02857142857142857,10,0.012303628712335571,27,0.3283056812468577,1252.5,0.026230500831820214,6,0.6198391186854187];
const MW_METHOD_GOLDEN = ["asymptotic","exact","exact","asymptotic","exact","asymptotic","asymptotic"];

{
  const results = CASES.map(([x, y]) => mannWhitneyU(x, y));
  const js = results.flatMap((r) => [r.W, r.p]);
  const methodsOk = results.every((r, i) => r.method === MW_METHOD_GOLDEN[i]);
  console.log(`  método exacto/asintótico elegido igual que R en los ${CASES.length} casos: ${methodsOk ? 'OK' : 'FALLA'}`);
  const ok = verify({
    name: 'mannWhitneyU: W, p',
    js, golden: MW_GOLDEN, tol: 1e-7,
    rScript: () => {
      const f = tmp('mw.json', JSON.stringify(CASES));
      return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(p) { w <- suppressWarnings(wilcox.test(unlist(p[[1]]), unlist(p[[2]]))); c(as.numeric(w$statistic), w$p.value) }))
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });
  allOk = allOk && ok && methodsOk;
}

// -------------------------------------------------------------- Welch / Student --
const WELCH_GOLDEN = [-1.8608134674868526,17.776473516178495,0.0793941401873583,-3.6742346141747673,4,0.021311641128756713,-4.3817804600413295,6,0.004659214943993928,-3.1884111571268496,14.6805705581978,0.006246399220513633,-1.3521246927939712,12.60499934776002,0.20009774614029466,-1.893462586816188,98.9507235024279,0.061217819047863435,-0.7745966692414834,3,0.4950253460597111];
const STUDENT_GOLDEN = [-1.8608134674868524,18,0.07918671421593822,-3.6742346141747673,4,0.021311641128756713,-4.381780460041329,6,0.004659214943993934,-3.1350426138923586,15,0.006811542742447463,-1.362408466641759,16,0.19194067808538473,-1.9179533789661691,113,0.0576407307907676,-0.7745966692414834,6,0.46799444572435916];

{
  const js = CASES.flatMap(([x, y]) => { const r = welchT(x, y); return [r.t, r.df, r.p]; });
  const ok = verify({
    name: 'welchT: t, df, p',
    js, golden: WELCH_GOLDEN, tol: 1e-7,
    rScript: () => {
      const f = tmp('welch.json', JSON.stringify(CASES));
      return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(p) { w <- t.test(unlist(p[[1]]), unlist(p[[2]])); c(as.numeric(w$statistic), as.numeric(w$parameter), w$p.value) }))
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });
  allOk = allOk && ok;
}
{
  const js = CASES.flatMap(([x, y]) => { const r = studentT(x, y); return [r.t, r.df, r.p]; });
  const ok = verify({
    name: 'studentT: t, df, p',
    js, golden: STUDENT_GOLDEN, tol: 1e-7,
    rScript: () => {
      const f = tmp('student.json', JSON.stringify(CASES));
      return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(p) { w <- t.test(unlist(p[[1]]), unlist(p[[2]]), var.equal = TRUE); c(as.numeric(w$statistic), as.numeric(w$parameter), w$p.value) }))
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });
  allOk = allOk && ok;
}

// -------------------------------------------------- Wilcoxon con signo / t pareado --
const PAIRED_CASES = [[[1.83,0.5,1.62,2.48,1.68,1.88,1.55,3.06,1.3],[0.878,0.647,0.598,2.05,1.06,1.29,1.06,3.14,1.29]],[[0.7,-1.6,-0.2,-1.2,-0.1,3.4,3.7,0.8,0,2],[1.9,0.8,1.1,0.1,-0.1,4.4,5.5,1.6,4.6,3.4]]];
const WSR_GOLDEN = [40,0.0390625,0,0.009090698015925054];
const WSR_METHOD_GOLDEN = ["exact","asymptotic"];
const PAIREDT_GOLDEN = [3.0353754156485917,8,0.016176627434908088,-4.062127683382037,9,0.002832890197384273];

{
  const results = PAIRED_CASES.map(([x, y]) => wilcoxonSignedRank(x, y));
  const js = results.flatMap((r) => [r.V, r.p]);
  const methodsOk = results.every((r, i) => r.method === WSR_METHOD_GOLDEN[i]);
  console.log(`  método exacto/asintótico elegido igual que R en los ${PAIRED_CASES.length} casos pareados: ${methodsOk ? 'OK' : 'FALLA'}`);
  const ok = verify({
    name: 'wilcoxonSignedRank: V, p',
    js, golden: WSR_GOLDEN, tol: 1e-7,
    rScript: () => {
      const f = tmp('wsr.json', JSON.stringify(PAIRED_CASES));
      return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(p) { w <- suppressWarnings(wilcox.test(unlist(p[[1]]), unlist(p[[2]]), paired = TRUE)); c(as.numeric(w$statistic), w$p.value) }))
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });
  allOk = allOk && ok && methodsOk;
}
{
  const js = PAIRED_CASES.flatMap(([x, y]) => { const r = pairedT(x, y); return [r.t, r.df, r.p]; });
  const ok = verify({
    name: 'pairedT: t, df, p',
    js, golden: PAIREDT_GOLDEN, tol: 1e-7,
    rScript: () => {
      const f = tmp('pairedt.json', JSON.stringify(PAIRED_CASES));
      return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(p) { w <- t.test(unlist(p[[1]]), unlist(p[[2]]), paired = TRUE); c(as.numeric(w$statistic), as.numeric(w$parameter), w$p.value) }))
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });
  allOk = allOk && ok;
}

// ------------------------------------------------------------------ pAdjust --
const PADJUST_CASES = [[0.001,0.008,0.039,0.041,0.042,0.06,0.074,0.205,0.212,0.216,0.222,0.251,0.269,0.275,0.34,0.341,0.384,0.569,0.594,0.696,0.762,0.94,0.942,0.975,0.986],[0.01,0.02,0.03,0.04,0.05]];
const PADJUST_METHODS = ['none', 'bonferroni', 'holm', 'hochberg', 'BH', 'BY'];
const PADJUST_GOLDEN_NESTED = [[[0.001,0.008,0.039,0.041,0.042,0.06,0.074,0.205,0.212,0.216,0.222,0.251,0.269,0.275,0.34,0.341,0.384,0.569,0.594,0.696,0.762,0.94,0.942,0.975,0.986],[0.025,0.2,0.975,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[0.025,0.192,0.897,0.902,0.902,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[0.025,0.192,0.882,0.882,0.882,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986,0.986],[0.025,0.1,0.21000000000000002,0.21000000000000002,0.21000000000000002,0.25,0.2642857142857143,0.49107142857142866,0.49107142857142866,0.49107142857142866,0.49107142857142866,0.49107142857142866,0.49107142857142866,0.49107142857142866,0.5328125,0.5328125,0.5647058823529413,0.781578947368421,0.781578947368421,0.8699999999999999,0.9071428571428571,0.986,0.986,0.986,0.986],[0.09539895444383768,0.38159581777535073,0.8013512173282366,0.8013512173282366,0.8013512173282366,0.9539895444383768,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]],[[0.01,0.02,0.03,0.04,0.05],[0.05,0.1,0.15,0.2,0.25],[0.05,0.08,0.09,0.09,0.09],[0.05,0.05,0.05,0.05,0.05],[0.05,0.05,0.05,0.05,0.05],[0.11416666666666665,0.11416666666666665,0.11416666666666665,0.11416666666666667,0.11416666666666667]]];
const PADJUST_GOLDEN = PADJUST_GOLDEN_NESTED.flatMap((c) => c.flatMap((a) => a));

{
  const js = PADJUST_CASES.flatMap((p) => PADJUST_METHODS.flatMap((m) => pAdjust(p, m)));
  const ok = verify({
    name: 'pAdjust: none/bonferroni/holm/hochberg/BH/BY',
    js, golden: PADJUST_GOLDEN, tol: 1e-9,
    rScript: () => {
      const f = tmp('padj.json', JSON.stringify({ cases: PADJUST_CASES, methods: PADJUST_METHODS }));
      return `d <- jsonlite::fromJSON("${f}")
o <- unlist(lapply(d$cases, function(p) unlist(lapply(d$methods, function(m) p.adjust(p, method = m)))))
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });
  allOk = allOk && ok;
}

// --------------------------------------------------------------- Dunn post-hoc --
// dunn.test no está instalado en esta máquina → sin cruce en vivo para el
// post-hoc en sí (solo GOLDEN, scipy-derivado); meanRanks y H/df/p de
// Kruskal-Wallis sí se cruzan con funciones base de R (rank()/kruskal.test).
const DUNN_CASES = [{"labels":["A","B","C"],"groups":[[3,4,4,5,6,6,7],[6,7,7,8,9,9,10,11],[1,2,2,3,3,4]]},{"labels":["G1","G2","G3","G4"],"groups":[[5.752,6.255,7.109,5.451,5.18],[4.696,6.062,6.533,6.516,3.193,4.379,4.417],[5.961,5.044,4.068,5.136,4.428,5.754],[8.199,8.818,6.44,7.586,7.553,8.317,7.542,9.731]]},{"labels":["A","B","C","D"],"groups":[[3,4,4,5,6,6,7],[6,7,7,8,9,9,10,11],[1,2,2,3,3,4],[9,10,10,12,13]]}];
const KRUSKAL_GOLDEN = [15.798291721419195,2,0.00037106034236087266,15.931481481481498,3,0.001171259020062096,20.91077586206897,3,0.00010986465393502267];
const DUNN_MEANRANKS_GOLDEN = [[10,17.125,4],[12.8,9,7.833333333333333,22.125],[10,17.875,4,22.8]];
const DUNN_Z_GOLDEN = [[-2.231803334418533,1.7483440057257673,3.939839974871476],[0.8484945609389728,1.0723865674340343,-2.1385983477113375,0.2741711954247084,-3.3156582670096966,-3.4598840617566546],[-1.9979515371568917,1.416087935047749,-2.8703798459036944,3.373460239894311,-1.134359095273264,-4.076694216724761]];
const DUNN_ADJ_GOLDEN = [[[0.025627963862497664,0.076883891587493,0.05125592772499533,0.05125592772499533,0.0384419457937465,0.07047690062186858],[0.08040447753853577,0.24121343261560732,0.08040447753853577,0.08040447753853577,0.08040447753853577,0.14740820882064892],[0.00008153597898189162,0.00024460793694567484,0.00024460793694567484,0.00024460793694567484,0.00024460793694567484,0.0004484478844004039]],[[0.3961626002779627,1,0.8506393162332866,0.7839530629855969,0.4753951203335552,1],[0.28354643874442886,1,0.8506393162332866,0.7839530629855969,0.4253196581166433,1],[0.03246821144375136,0.19480926866250814,0.12987284577500544,0.12987284577500544,0.06493642288750272,0.15909423607438164],[0.7839530629855969,1,0.8506393162332866,0.7839530629855969,0.7839530629855969,1],[0.0009142755455630474,0.0054856532733782845,0.004571377727815237,0.004571377727815237,0.0027428266366891422,0.006719925259888398],[0.0005404080116366707,0.003242448069820024,0.003242448069820024,0.003242448069820024,0.0027428266366891422,0.006719925259888398]],[[0.04572191445193108,0.27433148671158647,0.13716574335579323,0.13716574335579323,0.06858287167789662,0.1680280356108467],[0.15674976006985983,0.9404985604191589,0.31349952013971966,0.2566439498978186,0.18809971208383178,0.4608442946053879],[0.004099789763079779,0.02459873857847867,0.016399159052319114,0.016399159052319114,0.008199579526159557,0.020088969839090913],[0.0007422976593741674,0.004453785956245004,0.003711488296870837,0.003711488296870837,0.002226892978122502,0.00545588779640013],[0.2566439498978186,1,0.31349952013971966,0.2566439498978186,0.2566439498978186,0.6287776772496555],[0.00004568050207088175,0.0002740830124252905,0.0002740830124252905,0.0002740830124252905,0.0002740830124252905,0.0006715033804419617]]];

{
  const kJs = DUNN_CASES.flatMap((c) => { const k = kruskalWallis(c.groups); return [k.H, k.df, k.p]; });
  const ok1 = verify({
    name: 'dunnTest: H, df, p de Kruskal-Wallis (kruskalWallis ya existente en stats.js)',
    js: kJs, golden: KRUSKAL_GOLDEN, tol: 1e-9,
    rScript: () => {
      const f = tmp('kd.json', JSON.stringify(DUNN_CASES.map((c) => c.groups)));
      return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(g) { k <- kruskal.test(lapply(g, function(v) as.numeric(unlist(v)))); c(as.numeric(k$statistic), as.numeric(k$parameter), k$p.value) }))
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });

  const results = DUNN_CASES.map((c) => dunnTest(c.groups.map((values, i) => ({ label: c.labels[i], values }))));
  const meanRanksJs = results.flatMap((r, i) => DUNN_CASES[i].labels.map((l) => r.meanRanks[l]));
  const meanRanksGolden = DUNN_MEANRANKS_GOLDEN.flat();
  const ok2 = verify({
    name: 'dunnTest: meanRanks',
    js: meanRanksJs, golden: meanRanksGolden, tol: 1e-9,
    rScript: () => {
      const f = tmp('kdmr.json', JSON.stringify(DUNN_CASES.map((c) => c.groups)));
      return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(g) { vals <- unlist(g); gi <- rep(seq_along(g), sapply(g, length)); r <- rank(vals); tapply(r, gi, mean) }))
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });

  const zJs = results.flatMap((r) => r.comparisons.map((c) => c.z));
  const zGolden = DUNN_Z_GOLDEN.flat();
  console.log('  (post-hoc de Dunn en sí — z y p ajustados: sin dunn.test instalado aquí, solo GOLDEN scipy-derivado)');
  const ok3 = verify({ name: 'dunnTest: z por pareja', js: zJs, golden: zGolden, tol: 1e-9 });

  const adjJs = results.flatMap((r) => r.comparisons.flatMap((c) => PADJUST_METHODS.map((m) => c.adj[m])));
  const adjGolden = DUNN_ADJ_GOLDEN.flat(2);
  const ok4 = verify({ name: 'dunnTest: p ajustado (6 métodos) por pareja', js: adjJs, golden: adjGolden, tol: 1e-9 });

  allOk = allOk && ok1 && ok2 && ok3 && ok4;
}

if (!hasR()) console.log('\n· sin Rscript → todo lo anterior corrió solo en modo GOLDEN');
done('pairwisestats', allOk);
