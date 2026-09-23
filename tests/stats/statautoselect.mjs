// js/lib/statAutoSelect.js (prompt "quick wins" del 22 sep 2026, punto 2):
// Shapiro-Wilk, Levene/Brown-Forsythe, ANOVA de Welch, Tukey HSD y Games-
// Howell -- todo nuevo, construido para este prompt (stats.js/pairwiseStats.js
// ya cubrían Student/Welch-t/Mann-Whitney/pareado/Kruskal-Wallis/Dunn, que
// se reutilizan directamente sin reimplementar). El árbol de decisión
// (recommendTest) se prueba aparte, determinista, sin necesitar R.
//
//   node tests/stats/statautoselect.mjs

import { verify, tmp, done, flat } from './_shared.mjs';
import {
  shapiroWilk, leveneTest, welchAnova, tukeyHSD, gamesHowell, recommendTest, ptukey,
} from '../../js/lib/statAutoSelect.js';

let allOk = true;

// -------------------------------------------------------------- Shapiro-Wilk --
// 16 casos deterministas (mulberry32, semilla 42): n=3..100 uniformes en
// [0,10.24), más una muestra log-normal (n=20) y una claramente NO normal
// (3 valores en 1, 3 en 2, 3 en 50 -- trimodal, para forzar p muy bajo).
const SW_CASES = [[6.011037519201636,4.482905589975417,8.524657934904099],[6.697340414393693,1.7481389874592423,5.265925421845168,2.7322799433022738],[6.247446539346129,8.654746483080089,4.723170551005751,2.499237342271954,8.820588334929198],[7.457375649828464,3.0700151342898607,1.9725383794866502,5.007294877432287,6.866120179183781,6.106208984274417],[0.03842951962724328,4.707819237373769,8.373374259099364,0.5120926629751921,5.923239905387163,0.3153795562684536,2.669559868518263],[0.6178139243274927,1.8568900716491044,7.835472931619734,5.3033560630865395,0.271236093249172,1.7300523445010185,8.426881253253669,4.877399173565209],[8.090229837689549,3.194617456756532,4.498957286123186,0.3743921360000968,0.5139273451641202,5.565997792873532,5.967295127920806,2.451746736187488,6.456944046076387,2.0951048866845667],[3.0362963443621993,7.386213727295399,8.587109192740172,5.079962892923504,2.041900979820639,2.8420698270201683,2.9299163701944053,0.7469462975859642,6.598597934935242,6.807689322158694,6.930881165899336],[9.27839900366962,0.8796802558936179,9.437352467793971,4.311374970711768,9.42294550826773,1.3729840773157775,1.1094316560775042,0.15842905268073082,3.604456859175116,4.817225176375359,6.11922019161284,8.995579732581973],[0.7758240564726293,7.195980150718242,9.34867731994018,2.782514716964215,7.065853946842253,1.796227190643549,5.203163539990783,8.218917581252754,1.2059257342480123,9.956386350095272,5.62800214625895,9.161201647948474,4.339903697837144,5.784530241508037,3.369620821904391],[5.962391037028283,3.229577951133251,7.294139908626676,2.952086783479899,4.497627364471555,8.431257682386786,6.950652054511011,9.940114878118038,8.901981303934008,4.31891469983384,5.452131326310337,2.9592951526865363,1.008774396032095,6.967215123586357,3.133056035730988,7.859425814822316,9.047754912171513,0.9364134701900184,4.753917986527085,8.219508074689656],[1.2997928191907704,9.727464164607227,1.7839484568685293,7.094296528957784,6.996912297327071,2.231821301393211,4.128619225230068,1.6343746590428054,6.546663893386722,3.359311551321298,2.069541229866445,6.289033892098814,8.868788662366569,3.26377963880077,7.924273079261184,3.929457871709019,1.3139280234463513,8.637021894101053,3.6971038905903697,0.09526386857032776,7.3742241761647165,6.352638187818229,8.759233558084816,9.08164479304105,2.089887810871005,6.039325492456555,4.892424452118576,1.840234447736293,0.4747406439855695,7.055517891421914],[7.083699631039053,2.9149211617186666,2.7548468415625393,3.3659987594000995,0.291067969519645,2.208954244852066,9.935202330816537,5.7235166523605585,9.885642686858773,1.6386616230010986,1.708340651821345,5.609641501214355,2.925037075765431,3.9465633244253695,4.344108561053872,4.183555513154715,6.861367903184146,3.9851358463056386,3.3612079988233745,8.956413997802883,3.2731674914248288,4.95262548327446,6.108698316384107,5.463620747905225,5.892979439813644,2.354070085566491,3.2536560855805874,2.987802312709391,3.2056565047241747,6.692956911865622,2.20891279168427,1.6930459369905293,6.949861962348223,3.1422443594783545,1.2491216510534286,3.1379480939358473,0.4241511062718928,5.77535840915516,2.076877362560481,4.815340982750058,3.799300773534924,7.120498463045806,9.126279500778764,8.116995377931744,4.393623252399266,1.5414247452281415,8.676303522661328,5.2567522041499615,8.4037536685355,8.945060151163489],[4.501027949154377,1.4659594092518091,6.187441770453006,8.075925302691758,2.084096565376967,3.896436111535877,5.456621272023767,9.844910413958132,4.919993488583714,8.594821768347174,8.431928174104542,7.43620659224689,0.5354462820105255,0.6934030912816525,1.6930135153234005,5.065426025539637,6.766568694729358,7.6079935021698475,9.91456612246111,8.159773605875671,6.31613785168156,8.369760557543486,8.529637337196618,5.993892117403448,3.5108228237368166,4.469067242462188,8.783801675308496,6.809888621792197,3.4924953151494265,9.375317494850606,6.259409356862307,3.2933135144412518,8.446698528714478,1.5159461623989046,3.65750020602718,0.19970092922449112,0.8550240960903466,6.476566062774509,7.26364437257871,9.559418882708997,8.794647145550698,4.662476917728782,7.074775809887797,1.4515250199474394,2.7310105762444437,1.3913862756453454,0.4767578421160579,2.9098459100350738,4.409842127934098,5.687639133539051,7.163710424210876,7.935714460909367,7.847909976262599,1.959251081570983,6.663568892981857,5.178047788795084,4.435437717474997,4.690279136411846,4.590600957162678,4.250535636674613,3.3192177582532167,3.075952830258757,1.4764547161757946,5.045972263906151,2.6739989616908133,5.3055737260729074,5.479571979958564,6.473744777031243,4.37189310323447,1.3482535374350846,0.03764573484659195,1.4817733434028924,9.432402313686907,0.6929818983189762,8.706553091760725,4.303987587336451,5.024660127237439,0.9879126981832087,8.216708614490926,0.5673493118956685,3.706116669345647,2.2970970324240625,7.027646386995912,5.640502437017858,0.9461726783774793,9.663927073124796,7.501086879055947,6.612005271017551,7.9638342768885195,5.488082428928465,8.048449731431901,5.270542602520436,1.7683243844658136,0.7808614405803382,0.9587609162554145,0.5957418773323298,2.6277509541250765,6.721404893323779,6.683649104088545,5.610013830009848],[18.726482045076573,1.0686526005666666,3.288039112306377,2.7552592650069387,2.345252066105673,12.174021968749328,5.002911032399968,1.8494681111227094,16.994543211754806,17.39692604809414,2.222783593543605,4.735469463468593,13.197763165321936,16.544272881650706,7.806383645701725,5.5047332700686145,11.3560706289643,2.549577779268528,4.402117107768112,9.49487076269853],[1,1,1,1,2,2,2,50,50,50]];
const SW_GOLDEN = [0.98056788279385809,0.73289740191769348,0.94242387994943722,0.6691605954429023,0.92195258334256003,0.54261368995385573,0.9318385128348553,0.5943729113543561,0.89966331887420281,0.32894735075186188,0.89548735014339131,0.26296129623232456,0.95462026952856383,0.72322249790850435,0.92392819116114011,0.35272640135486122,0.87438195236040483,0.074293402903318317,0.95070337186502107,0.53559720466031357,0.95255784867438387,0.40759237863416681,0.93309057325082634,0.059350925877475029,0.95444078332995452,0.052067506375969005,0.95403142153152454,0.0015441241556940241,0.87439148445683212,0.014046589793144817,0.60721132311966697,6.74183747790602e-05];

{
  const js = SW_CASES.flatMap((x) => { const r = shapiroWilk(x); return [r.W, r.p]; });
  const ok = verify({
    name: 'shapiroWilk: W, p (n=3..100, 16 casos)',
    // tol relativa laxa a propósito: varios p-valores son minúsculos
    // (1e-4..1e-15) y ahí un error absoluto de verdad diminuto (~1e-7,
    // acumulado por Φ(z) vía la aproximación erf en vez de la función
    // exacta que usa R) dispara un error RELATIVO grande sin que eso
    // signifique nada práctico para un panel de "qué test recomendar".
    js, golden: SW_GOLDEN, tol: 5e-4,
    rScript: () => {
      const f = tmp('sw.json', JSON.stringify(SW_CASES));
      return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(x) { r <- shapiro.test(unlist(x)); c(as.numeric(r$statistic), r$p.value) }))
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });
  allOk = allOk && ok;

  const edge = shapiroWilk([1, 2]);
  console.log('  n<3 -> {W:NaN,p:NaN,note}:', Number.isNaN(edge.W) && Number.isNaN(edge.p) && !!edge.note ? 'OK' : 'FALLA');
  if (!(Number.isNaN(edge.W) && Number.isNaN(edge.p) && !!edge.note)) allOk = false;
}

// ----------------------------------------------------- Levene / Brown-Forsythe --
const GROUPS3 = [[10.05852376576513,10.30979128787294,14.88453816389665,13.49514352856204,12.607226342661306,12.027608440257609,12.331163162598386,11.199625929584727],[18.29988405923359,20.94733134843409,13.867233415367082,12.339225459145382,21.46134829847142,17.776038185693324],[10.591411780333146,11.10387578024529,10.879742013756186,11.60421857656911,10.888990744715557,12.933838313445449,10.742600782774389,12.633338786661625,10.572375128045678,10.430972158210352]];
const GROUPS2 = [[5.618576120585203,6.1638048524037,7.191605726256967,8.047494780272245,5.29807236045599,8.651762831956148,7.214842991903424,7.486499335616827,7.720363630913198,8.86395881511271,7.497522576712072,8.684819440357387],[21.552569684572518,5.799569478258491,8.498830939643085,12.139620282687247,13.50631448905915,5.403522285632789,6.762124705128372,20.360317113809288,12.379386103712022]];

{
  const js3 = leveneTest(GROUPS3), js2 = leveneTest(GROUPS2);
  const js = [js3.F, js3.dfBetween, js3.dfWithin, js3.p, js2.F, js2.dfBetween, js2.dfWithin, js2.p];
  const golden = [5.5261687333060214, 2, 21, 0.011797111259193058, 13.231528339307252, 1, 19, 0.0017522447590755652];
  const ok = verify({
    name: 'leveneTest (Brown-Forsythe, centrado en mediana): F, df1, df2, p',
    js, golden, tol: 1e-7,
    rPkg: 'car',
    rScript: () => {
      const f = tmp('lev.json', JSON.stringify({ groups3: GROUPS3, groups2: GROUPS2 }));
      return `library(car)
d <- jsonlite::fromJSON("${f}")
mkdf <- function(gs) { y <- unlist(gs); g <- factor(rep(seq_along(gs), sapply(gs, length))); data.frame(y=y, g=g) }
o <- c()
for (gs in list(d$groups3, d$groups2)) {
  df <- mkdf(gs)
  r <- leveneTest(y ~ g, data=df, center=median)
  o <- c(o, r$"F value"[1], r$Df[1], r$Df[2], r$"Pr(>F)"[1])
}
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });
  allOk = allOk && ok;
}

// ------------------------------------------------------------- Welch ANOVA --
{
  const js3 = welchAnova(GROUPS3), js2 = welchAnova(GROUPS2);
  const js = [js3.F, js3.dfBetween, js3.dfWithin, js3.p, js2.F, js2.dfBetween, js2.dfWithin, js2.p];
  const golden = [8.1852813553131849, 2, 9.2334486238631097, 0.0090167354151171383, 4.8687425613976503, 1, 8.463597397193718, 0.056597631730751739];
  const ok = verify({
    name: 'welchAnova: F, df1, df2, p',
    js, golden, tol: 1e-6,
    rScript: () => {
      const f = tmp('welchanova.json', JSON.stringify({ groups3: GROUPS3, groups2: GROUPS2 }));
      return `d <- jsonlite::fromJSON("${f}")
mkdf <- function(gs) { y <- unlist(gs); g <- factor(rep(seq_along(gs), sapply(gs, length))); data.frame(y=y, g=g) }
o <- c()
for (gs in list(d$groups3, d$groups2)) {
  df <- mkdf(gs)
  r <- oneway.test(y~g, data=df, var.equal=FALSE)
  o <- c(o, r$statistic, r$parameter[1], r$parameter[2], r$p.value)
}
cat(jsonlite::toJSON(unname(o), digits = 17))`;
    },
  });
  allOk = allOk && ok;
}

// ------------------------------------------------------------- ptukey / Tukey HSD --
{
  // grilla de sanidad: monotonía en q y coincidencia con R en varios (k,ν)
  // -- cada caso es [k, ν, q]
  const PT_CASES = [[3, 20, 3], [4, 2, 3], [5, 6, 4.2], [6, 30, 5.1], [3, 100, 3.4], [8, 15, 4.9]];
  const js = PT_CASES.map(([k, nu, q]) => ptukey(q, k, nu));
  const golden = [0.88924320214649388, 0.6240214218138409, 0.87884635986869586, 0.98710991562889372, 0.95295566702251278, 0.94736793699224908];
  const ok = verify({
    name: 'ptukey(q,k,ν): CDF del rango studentizado',
    js, golden, tol: 5e-4, // integración numérica propia vs el algoritmo exacto de R (Gleason) -- ver comentario en statAutoSelect.js
    rScript: () => {
      const f = tmp('ptukey.json', JSON.stringify(PT_CASES));
      return `d <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- unlist(lapply(d, function(c) ptukey(c[[3]], c[[1]], c[[2]])))
cat(jsonlite::toJSON(o, digits = 17))`;
    },
  });
  allOk = allOk && ok;

  const th = tukeyHSD(GROUPS3);
  const jsTh = th.pairwise.map((p) => p.p);
  const goldenTh = [0.00035670495925388401, 0.66077060292768452, 3.3236343755627118e-05];
  const okTh = verify({
    name: 'tukeyHSD (3 grupos): p por pares',
    // mismo motivo que Shapiro-Wilk: p-valores minúsculos, tol relativa laxa
    js: jsTh, golden: goldenTh, tol: 5e-2,
    rScript: () => {
      const f = tmp('tukey3.json', JSON.stringify(GROUPS3));
      return `d <- jsonlite::fromJSON("${f}")
y <- unlist(d); g <- factor(rep(seq_along(d), sapply(d, length)))
r <- TukeyHSD(aov(y~g))
cat(jsonlite::toJSON(as.vector(r$g[,4]), digits = 17))`;
    },
  });
  allOk = allOk && okTh;
}

// -------------------------------------------------------------- Games-Howell --
{
  // rstatix::games_howell_test redondea p.adj a 3 decimales -- tolerancia
  // acorde (no es una pérdida de precisión de esta implementación, es el
  // propio redondeo de salida de rstatix, confirmado leyendo su resultado).
  const gh = gamesHowell(GROUPS3);
  const js = gh.pairwise.map((p) => p.p);
  const golden = [0.034, 0.386, 0.02];
  const ok = verify({
    name: 'gamesHowell (3 grupos, varianzas heterogéneas): p por pares',
    js, golden, tol: 2e-2,
    rPkg: 'rstatix',
    rScript: () => {
      const f = tmp('gh3.json', JSON.stringify(GROUPS3));
      return `library(rstatix)
d <- jsonlite::fromJSON("${f}")
y <- unlist(d); g <- factor(rep(seq_along(d), sapply(d, length)))
r <- games_howell_test(data.frame(y=y,g=g), y ~ g)
cat(jsonlite::toJSON(r$p.adj, digits = 17))`;
    },
  });
  allOk = allOk && ok;
}

// -------------------------------------------------------- árbol de decisión --
// Determinista, sin R: cada rama del árbol de decisión con datos construidos
// a mano para caer exactamente en el caso que se quiere probar.
console.log('\n-- árbol de decisión (recommendTest) --');
{
  const check = (name, ok, extra = '') => { console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + (extra ? '  ' + extra : '')); if (!ok) allOk = false; };

  // 2 grupos normales, varianzas similares -> Student
  const normalA = [9.8, 10.2, 10.5, 9.6, 10.1, 9.9, 10.3, 9.7, 10.0, 10.4, 9.5, 10.6];
  const normalB = [11.1, 11.5, 11.2, 10.9, 11.4, 11.0, 11.6, 10.8, 11.3, 11.7, 10.7, 11.9];
  check('2 grupos normales + varianzas homogéneas -> student', recommendTest([normalA, normalB]).recommended === 'student');

  // 2 grupos normales, varianzas MUY distintas -> Welch
  const wide = normalB.map((v) => (v - 11.3) * 8 + 11.3);
  check('2 grupos normales + varianzas heterogéneas -> welch', recommendTest([normalA, wide]).recommended === 'welch');

  // 2 grupos, uno no normal -> Mann-Whitney
  const skewed = [0.01, 0.02, 0.03, 0.05, 0.08, 0.13, 0.21, 0.34, 0.55, 0.89, 1.44, 30];
  check('2 grupos con uno no normal -> mannwhitney', recommendTest([normalA, skewed]).recommended === 'mannwhitney');

  // n<3 en un grupo -> por precaución, no paramétrico
  check('n<3 en un grupo (2 grupos) -> mannwhitney por precaución', recommendTest([[1, 2], normalB]).recommended === 'mannwhitney');
  check('n<3 en un grupo (3+ grupos) -> kruskal-dunn por precaución', recommendTest([[1, 2], normalA, normalB]).recommended === 'kruskal-dunn');

  // pareado
  const rP = recommendTest([normalA, normalA.map((v) => v + 0.3)], { paired: true });
  check('pareado + normal -> paired-t', rP.recommended === 'paired-t');
  const rPns = recommendTest([normalA, skewed], { paired: true });
  check('pareado + no normal -> wilcoxon-signed', rPns.recommended === 'wilcoxon-signed');

  // 3+ grupos
  const normalC = [12.1, 12.5, 12.2, 11.9, 12.4, 12.0, 12.6, 11.8, 12.3, 12.7, 11.7, 12.9];
  check('3 grupos normales + varianzas homogéneas -> anova-tukey', recommendTest([normalA, normalB, normalC]).recommended === 'anova-tukey');
  const wideC = normalC.map((v) => (v - 12.3) * 10 + 12.3);
  check('3 grupos normales + varianzas heterogéneas -> welch-anova-gh', recommendTest([normalA, normalB, wideC]).recommended === 'welch-anova-gh');
  check('3 grupos con uno no normal -> kruskal-dunn', recommendTest([normalA, normalB, skewed]).recommended === 'kruskal-dunn');

  // override manual: recommendTest en sí no aplica overrides (eso lo hace
  // groupBoxplot.js) -- aquí solo se confirma que el resultado trae
  // suficiente info para que el llamador decida
  const full = recommendTest([normalA, normalB]);
  check('devuelve normality.perGroup con 1 entrada por grupo', full.normality.perGroup.length === 2);
  check('devuelve variance con F/p/homogeneous', full.variance && Number.isFinite(full.variance.F) && Number.isFinite(full.variance.p));
  check('devuelve reason como texto no vacío', typeof full.reason === 'string' && full.reason.length > 10);
}

done('statautoselect', allOk);
