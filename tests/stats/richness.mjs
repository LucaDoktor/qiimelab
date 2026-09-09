// incidenceRichnessEstimators(siteBySpecies) vs vegan::specpool()
// (smallsample = TRUE por defecto): Chao2, jackknife 1º/2º orden, bootstrap y
// sus errores estándar. Sobre grupos de muestras reales de datos-ejemplo/.
import { stats, verify, tmp, done, exampleCounts } from './_shared.mjs';

const { incidenceRichnessEstimators } = await stats();
const ex = await exampleCounts();

const GROUPS = [
  ['A-1', 'A-2', 'A-3'],
  ['D-1', 'D-2', 'D-3'],
  ['A-1', 'A-2', 'A-3', 'B-1', 'B-2', 'B-3'],
];

// siteBySpecies para un grupo: filas = muestras, columnas = taxones (conteos)
const siteBySpecies = (g) => g.map((s) => ex.bySample[s]);

// GOLDEN de specpool(): [chao2, chao2SE, jack1, jack1SE, jack2, boot, bootSE] por grupo
const GOLDEN = [
  230.7051282051282, 7.3061890733890014, 238.33333333333334, 17.726314400411109, 245.66666666666666, 226.33333333333334, 9.8807707001847529,
  212.85185185185185, 14.970335957997763, 206.33333333333334, 21.218440617119398, 218, 190.7037037037037, 10.476834462596646,
  260.01666666666665, 7.7057849841675594, 269.83333333333331, 12.839825197840939, 277.16666666666669, 257.20503257887515, 9.2842794574226417,
];

const jsFlat = GROUPS.flatMap((g) => {
  const e = incidenceRichnessEstimators(siteBySpecies(g));
  return [e.chao2, e.chao2SE, e.jack1, e.jack1SE, e.jack2, e.boot, e.bootSE];
});

// sanity: sObs coincide con vegan (215, 177, 244)
const sObs = GROUPS.map((g) => incidenceRichnessEstimators(siteBySpecies(g)).sObs);
console.log('  Sobs por grupo:', JSON.stringify(sObs), '(vegan: [215,177,244])');
const sObsOk = JSON.stringify(sObs) === JSON.stringify([215, 177, 244]);

const ok = verify({
  name: 'estimadores de riqueza por incidencia vs specpool',
  js: jsFlat, golden: GOLDEN, tol: 1e-9, rPkg: 'vegan',
  rScript: () => {
    const payload = GROUPS.map((g) => siteBySpecies(g));
    const f = tmp('rich.json', JSON.stringify(payload));
    return `suppressMessages(library(vegan))
grp <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- c()
for (m in grp) {
  mat <- do.call(rbind, lapply(m, function(v) as.numeric(unlist(v))))
  sp <- specpool(mat)
  o <- c(o, sp$chao, sp$chao.se, sp$jack1, sp$jack1.se, sp$jack2, sp$boot, sp$boot.se)
}
cat(jsonlite::toJSON(o, digits = 17))`;
  },
});

done('richness', ok && sObsOk);
