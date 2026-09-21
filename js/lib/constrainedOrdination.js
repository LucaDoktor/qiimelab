// RDA (Redundancy Analysis) y CCA (Canonical Correspondence Analysis) —
// ordenación restringida por variables explicativas (las mismas columnas de
// metadatos que ya se usan para agrupar en otras vistas). Implementación
// propia INSPIRADA en vegan::rda()/vegan::cca(), no un puerto de su código:
//
//   - Los AUTOVALORES (cuánta varianza/inercia explica cada eje restringido)
//     están verificados byte a byte contra vegan::rda()/cca() sobre el
//     dataset varespec/varechem — ver tests/stats/rda.mjs y cca.mjs.
//   - Las coordenadas de sitios/especies son la proyección estándar de
//     álgebra lineal (autovectores de la matriz ajustada, escalados por
//     sqrt(autovalor) para las especies) — proporcionales a las de vegan
//     (mismo sentido, mismo orden relativo) pero NO reproducen su sistema
//     interno de "scaling" (1/2/3), que usa otra normalización.
//   - Las flechas de las variables explicativas son un "biplot de
//     correlación" (r de Pearson entre cada variable y los ejes de sitios),
//     una convención estándar en ecología numérica y más fácil de explicar
//     que el escalado interno de vegan, pero con longitudes distintas a las
//     que dibujaría vegan.
//
// Alcance v1 (deliberado): sin partial RDA, sin selección de variables
// automática (forward selection), sin anova.cca (test de permutaciones de
// significancia del modelo restringido).
//
// RDA: Legendre & Legendre, "Numerical Ecology" §11.1 — regresión
// multivariante de Y sobre X seguida de PCA de los valores ajustados.
// CCA: ter Braak (1986) — lo mismo pero sobre residuos estandarizados de
// chi-cuadrado y con las muestras ponderadas por su abundancia total
// (la transformación clásica que reduce CCA a una RDA ponderada).

import { transpose, matMul, centerColumns, solveLinearSystem, jacobiEigenSymmetric } from './linalg.js';

function sumSquares(M) {
  let s = 0;
  for (const row of M) for (const v of row) s += v * v;
  return s;
}

function pearsonCorr(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  const denom = Math.sqrt(saa * sbb);
  return denom > 0 ? sab / denom : 0;
}

function checkDims(Y, X) {
  const n = Y.length;
  if (n < 3) throw new Error('Hacen falta al menos 3 muestras.');
  if (X.length !== n) throw new Error('La matriz de variables explicativas no tiene el mismo número de muestras que la de respuesta.');
  const q = X[0]?.length || 0;
  if (q < 1) throw new Error('No hay ninguna variable explicativa seleccionada.');
  if (q >= n - 1) throw new Error('Demasiadas variables explicativas para el número de muestras (hacen falta más muestras que variables + 1) — quita alguna variable.');
}

/** Empaqueta autovalores/autovectores ya calculados en el resultado público
 *  compartido por rda() y cca(). `siteProj`/`speciesProj` son las
 *  proyecciones YA hechas (Yc·v para sitios, v·sqrt(eig) para especies);
 *  esta función solo recorta a nAxes, calcula % de varianza y el biplot. */
function buildResult(method, { eigRaw, siteProj, siteFittedProj, speciesProj, X, totalInertia, speciesNames, varNames, sampleIds }) {
  const nAxes = Math.min(eigRaw.length, X[0].length);
  const eig = eigRaw.slice(0, nAxes).map((v) => Math.max(v, 0));
  const constrainedInertia = eig.reduce((a, b) => a + b, 0);
  const proportionExplained = eig.map((v) => (totalInertia > 0 ? v / totalInertia : 0));

  const siteScores = siteProj.map((row) => row.slice(0, nAxes));
  // "lc scores" (combinación lineal de las variables explicativas, sin la
  // parte no explicada) — mismo autovector, proyectando los valores
  // AJUSTADOS en vez de los observados. Se expone sobre todo porque permite
  // un invariante de verificación exacto: sum(lc_k^2) == eig[k] (ver
  // tests/stats/rda.mjs y cca.mjs), y de paso es una vista alternativa
  // legítima del biplot (la que vegan llama "lc" frente a "wa").
  const siteScoresFitted = siteFittedProj.map((row) => row.slice(0, nAxes));
  const speciesScores = speciesProj.slice(0, nAxes); // [axis][species] — se transpone abajo
  const speciesScoresBySpecies = speciesNames.map((_, j) => speciesScores.map((axis) => axis[j]));

  const biplotScores = varNames.map((_, j) => {
    const col = X.map((row) => row[j]);
    return Array.from({ length: nAxes }, (_, k) => pearsonCorr(col, siteScores.map((s) => s[k])));
  });

  return {
    method,
    nAxes,
    eig,
    totalInertia,
    constrainedInertia,
    proportionConstrained: totalInertia > 0 ? constrainedInertia / totalInertia : 0,
    proportionExplained,
    sampleIds,
    siteScores,                    // [nSamples][nAxes]
    siteScoresFitted,               // [nSamples][nAxes] — "lc scores"
    speciesNames,
    speciesScores: speciesScoresBySpecies, // [nSpecies][nAxes]
    varNames,
    biplotScores,                  // [nVars][nAxes]
  };
}

/**
 * RDA — ordenación restringida lineal.
 * @param {number[][]} Y  n muestras × p taxones/variables respuesta (p.ej. abundancia relativa; NO hace falta transformar antes, pero es habitual aplicar Hellinger a datos de comunidad — eso lo decide quien llama)
 * @param {number[][]} X  n muestras × q variables explicativas (numéricas; las categóricas ya dummy-codificadas por quien llama)
 * @param {string[]} speciesNames  nombres de columnas de Y, longitud p
 * @param {string[]} varNames      nombres de columnas de X, longitud q
 * @param {string[]} sampleIds
 */
export function rda(Y, X, speciesNames, varNames, sampleIds) {
  checkDims(Y, X);
  const n = Y.length;
  const { centered: Yc } = centerColumns(Y);
  const { centered: Xc } = centerColumns(X);

  const totalInertia = sumSquares(Yc) / (n - 1);

  const XtX = matMul(transpose(Xc), Xc);
  const XtY = matMul(transpose(Xc), Yc);
  const B = solveLinearSystem(XtX, XtY);
  const Yhat = matMul(Xc, B);

  const S = matMul(transpose(Yhat), Yhat).map((row) => row.map((v) => v / (n - 1)));
  const { values, vectors } = jacobiEigenSymmetric(S);

  const siteProj = Yc.map((row) => vectors.map((v) => row.reduce((s, x, i) => s + x * v[i], 0)));
  const siteFittedProj = Yhat.map((row) => vectors.map((v) => row.reduce((s, x, i) => s + x * v[i], 0)));
  const speciesProj = vectors.map((v, k) => v.map((x) => x * Math.sqrt(Math.max(values[k], 0))));

  return buildResult('rda', { eigRaw: values, siteProj, siteFittedProj, speciesProj, X, totalInertia, speciesNames, varNames, sampleIds });
}

/**
 * CCA — ordenación restringida por correspondencias (chi-cuadrado),
 * apropiada para tablas de abundancia/conteos no negativas.
 * Mismos parámetros que rda().
 */
export function cca(Y, X, speciesNames, varNames, sampleIds) {
  checkDims(Y, X);
  const n = Y.length;
  let total = 0;
  for (const row of Y) for (const v of row) {
    if (v < 0) throw new Error('CCA necesita valores no negativos (abundancias o conteos) — hay algún valor negativo en la tabla.');
    total += v;
  }
  if (total <= 0) throw new Error('La tabla de abundancias está vacía (todo ceros).');

  const rw = Y.map((row) => row.reduce((s, v) => s + v, 0) / total); // pesos de fila (muestra), suman 1
  const cw = speciesNames.map((_, j) => Y.reduce((s, row) => s + row[j], 0) / total); // pesos de columna (especie)

  const Q = Y.map((row, i) => row.map((v, j) => {
    const e = rw[i] * cw[j];
    return e > 0 ? (v / total - e) / Math.sqrt(e) : 0;
  }));
  const totalInertia = sumSquares(Q);

  const xbarW = X[0].map((_, j) => X.reduce((s, row, i) => s + row[j] * rw[i], 0));
  const Xc = X.map((row) => row.map((v, j) => v - xbarW[j]));
  const Z = Xc.map((row, i) => row.map((v) => v * Math.sqrt(rw[i])));

  const ZtZ = matMul(transpose(Z), Z);
  const ZtQ = matMul(transpose(Z), Q);
  const B = solveLinearSystem(ZtZ, ZtQ);
  const Qhat = matMul(Z, B);

  const S = matMul(transpose(Qhat), Qhat);
  const { values, vectors } = jacobiEigenSymmetric(S);

  // sitios: se proyecta Q (no Z) para que la escala de las coordenadas de
  // sitio no dependa del peso de fila, igual que el "wa" de vegan/CCA clásico
  const siteProj = Q.map((row) => vectors.map((v) => row.reduce((s, x, i) => s + x * v[i], 0)));
  const siteFittedProj = Qhat.map((row) => vectors.map((v) => row.reduce((s, x, i) => s + x * v[i], 0)));
  const speciesProj = vectors.map((v, k) => v.map((x) => x * Math.sqrt(Math.max(values[k], 0))));

  return buildResult('cca', { eigRaw: values, siteProj, siteFittedProj, speciesProj, X, totalInertia, speciesNames, varNames, sampleIds });
}
