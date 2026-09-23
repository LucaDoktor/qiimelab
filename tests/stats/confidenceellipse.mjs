// confidenceEllipsePoints (js/lib/stats.js) -- elipse de confianza normal
// bivariante para el PCoA (prompt "quick wins" del 22 sep 2026, punto 3),
// equivalente a car::dataEllipse/vegan::ordiellipse/ggplot2::stat_ellipse
// (type="norm"). Verificación GEOMÉTRICA, no de coordenadas exactas: los
// 72 vértices que devuelve la función no tienen por qué arrancar en el
// mismo ángulo que los de R, pero TODOS deben caer exactamente sobre la
// misma elipse -- se comprueba con la distancia de Mahalanobis de cada
// punto respecto a la media y la covarianza de R, que debe dar EXACTAMENTE
// qchisq(confianza, 2) en los 72 vértices (validado así en vivo, no solo
// con un golden estático, antes de fijar el fixture aquí).
//
//   node tests/stats/confidenceellipse.mjs

import { stats, verify, tmp, done, hasR } from './_shared.mjs';
import { rRun } from '../lib/env.mjs';

const { confidenceEllipsePoints } = await stats();

// datos de rnorm(20,5,2)/rnorm(20,3,1)+0.5x (semilla 5), redondeados a 6 decimales
const X = [3.318289, 7.768719, 2.489016, 5.140286, 8.422882, 3.794184, 4.055667, 3.729257, 4.428453, 5.276216, 7.455261, 3.396441, 2.839215, 4.684931, 2.85648, 4.722028, 3.805374, 0.632066, 5.481635, 4.481289];
const Y = [5.559656, 7.826229, 5.71247, 6.276904, 8.03045, 4.60361, 6.446423, 6.363403, 4.557144, 4.785313, 7.043545, 5.807915, 6.635068, 6.559569, 5.907462, 6.312588, 3.893154, 1.315561, 3.978631, 5.098036];

// -------- 1. centro y semiejes: golden estático + cruce en vivo con R --------
{
  const e = confidenceEllipsePoints(X, Y, 0.95, 72);
  const js = [e.center[0], e.center[1], e.semiMajor, e.semiMinor];
  const golden = [4.4388844499999998, 5.6356565500000002, 5.3618742217630686, 2.4285646840906638];
  const ok = verify({
    name: 'confidenceEllipsePoints: centro y semiejes (95%)',
    js, golden, tol: 1e-9,
    rScript: () => {
      const f = tmp('ellipse_xy.json', JSON.stringify({ x: X, y: Y }));
      return `d <- jsonlite::fromJSON("${f}")
S <- cov(cbind(d$x, d$y))
eig <- eigen(S)
q <- qchisq(0.95, 2)
semi <- sqrt(eig$values * q)
cat(jsonlite::toJSON(c(mean(d$x), mean(d$y), max(semi), min(semi)), digits = 17))`;
    },
  });

  // -------- 2. geometría: los 72 vértices caen EXACTOS sobre la elipse de R --------
  // (distancia de Mahalanobis == qchisq(0.95,2) para los 72, calculado con
  // la media/covarianza que R recalcula en vivo -- si Rscript no está
  // disponible, se salta silenciosamente igual que el resto de rScript de verify())
  let geomOk = true;
  if (hasR()) {
    const f = tmp('ellipse_pts.json', JSON.stringify({ x: X, y: Y, pts: e.points }));
    const rOut = rRun(`d <- jsonlite::fromJSON("${f}")
S <- cov(cbind(d$x, d$y)); Sinv <- solve(S)
mu <- c(mean(d$x), mean(d$y))
maha <- apply(d$pts, 1, function(p) { v <- p - mu; as.numeric(t(v) %*% Sinv %*% v) })
cat(jsonlite::toJSON(c(min(maha), max(maha), qchisq(0.95, 2)), digits = 17))`).trim();
    const start = rOut.indexOf('[');
    const [mahaMin, mahaMax, q95] = JSON.parse(rOut.slice(start));
    const err = Math.max(Math.abs(mahaMin - q95), Math.abs(mahaMax - q95));
    console.log(`  geometría (Mahalanobis de los 72 vértices vs qchisq(0.95,2)=${q95.toFixed(6)})  min=${mahaMin.toFixed(9)} max=${mahaMax.toFixed(9)}  ${err < 1e-6 ? 'OK' : 'FALLA'}`);
    if (!(err < 1e-6)) geomOk = false;
  } else {
    console.log('  geometría: Rscript no disponible -> se salta');
  }

  const edge = confidenceEllipsePoints([1, 2, 3], [1, 2, 3], 0.95);
  console.log('  n<4 -> null (elipse numéricamente inestable con pocos puntos):', edge === null ? 'OK' : 'FALLA');

  done('confidenceellipse', ok && geomOk && edge === null);
}
