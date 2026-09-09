// rarefactionCurve(counts) — esperanza de riqueza de Hurlbert 1971 — vs
// vegan::rarefy() evaluado en las mismas profundidades, sobre 3 muestras
// reales de datos-ejemplo/.
//
// El GOLDEN incluye las profundidades que devuelve la función: si su selección
// de puntos cambia, el test lo detecta (y hay que regenerar).
import { stats, verify, tmp, done, exampleCounts } from './_shared.mjs';

const { rarefactionCurve } = await stats();
const ex = await exampleCounts();

const SAMPLES = ['A-1', 'D-3', 'N-3'];
const N_POINTS = 12;

// GOLDEN: { depths, richness } de vegan::rarefy() por muestra
const GOLDEN = {
  'A-1': {
    depths: [0, 4398, 8797, 13195, 17593, 21991, 26390, 30788, 35186, 39584, 43983, 48381, 52779],
    richness: [0, 151.900474677, 171.630634689, 180.431506824, 185.188387149, 187.956918438, 189.617751018, 190.621406246, 191.22381094, 191.579377226, 191.786551736, 191.91118851, 192],
  },
  'D-3': {
    depths: [0, 4273, 8546, 12819, 17092, 21365, 25638, 29910, 34183, 38456, 42729, 47002, 51275],
    richness: [0, 115.171436985, 131.434701382, 139.13841762, 143.59038629, 146.360855723, 148.140793516, 149.297725797, 150.047531679, 150.522767912, 150.807621195, 150.955611707, 151],
  },
  'N-3': {
    depths: [0, 5138, 10276, 15414, 20551, 25689, 30827, 35965, 41103, 46241, 51378, 56516, 61654],
    richness: [0, 123.405545698, 140.939908517, 148.984487523, 153.269546965, 155.704638587, 157.133996567, 157.982449747, 158.481636812, 158.76566341, 158.91574567, 158.982905076, 159],
  },
};

const jsCurves = {};
let depthsOk = true;
for (const s of SAMPLES) {
  const c = rarefactionCurve(ex.bySample[s], N_POINTS);
  jsCurves[s] = c;
  if (JSON.stringify(c.depths) !== JSON.stringify(GOLDEN[s].depths)) {
    depthsOk = false;
    console.log(`  ✗ ${s}: las profundidades de la curva cambiaron\n    ${JSON.stringify(c.depths)}`);
  }
}
console.log('  profundidades de la curva == GOLDEN:', depthsOk ? 'OK' : 'FALLA (regenerar GOLDEN)');

const jsFlat = SAMPLES.flatMap((s) => jsCurves[s].richness);
const goldenFlat = SAMPLES.flatMap((s) => GOLDEN[s].richness);

const ok = verify({
  name: 'rarefacción (Hurlbert) vs vegan::rarefy',
  js: jsFlat, golden: goldenFlat, tol: 1e-9, rPkg: 'vegan',
  rScript: () => {
    const payload = Object.fromEntries(SAMPLES.map((s) => [s, { counts: ex.bySample[s], depths: GOLDEN[s].depths }]));
    const f = tmp('rare.json', JSON.stringify(payload));
    return `suppressMessages(library(vegan))
inp <- jsonlite::fromJSON("${f}", simplifyVector = FALSE)
o <- c()
for (s in names(inp)) { counts <- as.numeric(unlist(inp[[s]]$counts)); depths <- as.numeric(unlist(inp[[s]]$depths))
  o <- c(o, sapply(depths, function(d) { if (d <= 0) return(0); if (d >= sum(counts)) return(sum(counts > 0)); as.numeric(rarefy(counts, d)) })) }
cat(jsonlite::toJSON(o, digits = 15))`;
  },
});

done('rarefaction', ok && depthsOk);
