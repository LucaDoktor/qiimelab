// Sensatez de la cobertura contra referencia propia (js/lib/primerCoverage.js):
// 4 secuencias de referencia, 2 con el primer y 2 sin él, agrupadas en 2
// grupos taxonómicos (uno 100% cubierto, el otro 0%) → computeCoverage() y
// groupCoverageByTaxon() deben reproducir esos números exactamente.
//
//   node tests/primercoverage.mjs

import { APP_ROOT } from './lib/env.mjs';
const { computeCoverage, groupCoverageByTaxon, buildTaxonomyMap } =
  await import(APP_ROOT + '/js/lib/primerCoverage.js');
const { reverseComplementIUPAC } = await import(APP_ROOT + '/js/lib/primerAnalysis.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

const F = 'GTGCCAGCAGCCGCGGTAA';
const refs = [
  { id: 'r1', seq: 'AAAAA' + F + 'TTTTT' },
  { id: 'r2', seq: 'CCCCC' + F + 'GGGGG' },
  { id: 'r3', seq: 'A'.repeat(40) },
  { id: 'r4', seq: 'T'.repeat(40) },
];
const taxonomyMap = {
  r1: 'd__Bacteria;p__Firmicutes;g__Lactobacillus',
  r2: 'd__Bacteria;p__Firmicutes;g__Clostridium',
  r3: 'd__Bacteria;p__Proteobacteria;g__Escherichia',
  r4: 'd__Bacteria;p__Proteobacteria;g__Salmonella',
};

const cov = computeCoverage(refs, F, { maxMismatches: 0 });
check('cobertura: 2 de 4 (50%)', cov.total === 4 && cov.covered === 2 && cov.pct === 50, JSON.stringify(cov.pct));
check('cobertura: r1/r2 cubiertas, r3/r4 no', cov.uncovered.sort().join(',') === 'r3,r4', cov.uncovered.join(','));

const grouped = groupCoverageByTaxon(cov, taxonomyMap, 2);
check('agrupado por filo: 2 grupos', grouped.length === 2, JSON.stringify(grouped.map((g) => g.label)));
const firmicutes = grouped.find((g) => g.label.includes('Firmicutes'));
const proteo = grouped.find((g) => g.label.includes('Proteobacteria'));
check('Firmicutes: 100% cubierto (2/2)', !!firmicutes && firmicutes.covered === 2 && firmicutes.pct === 100);
check('Proteobacteria: 0% cubierto (0/2)', !!proteo && proteo.covered === 0 && proteo.pct === 0);

// pareja (amplicón) — reutiliza la misma pareja/plantilla que primertemplate.mjs
const R = 'GGACTACAAGGGTATCTAAT';
const revR = reverseComplementIUPAC(R);
const pairRefs = [
  { id: 'p1', seq: 'AAAAA' + F + 'CCCCCCCCCC' + revR + 'TTTTT' }, // amplicón completo
  { id: 'p2', seq: F + 'CCCCCCCCCC' }, // solo el directo, sin el inverso → sin amplicón
];
const covPair = computeCoverage(pairRefs, { forward: F, reverse: R }, { maxMismatches: 0 });
check('cobertura de pareja: solo p1 tiene amplicón',
  covPair.covered === 1 && covPair.uncovered[0] === 'p2', JSON.stringify(covPair));

// detección de columnas id/taxonomía por alias habituales
const { map, idCol, taxCol } = buildTaxonomyMap(
  ['Feature ID', 'Taxon'],
  [{ 'Feature ID': 'r1', Taxon: 'd__Bacteria' }, { 'Feature ID': 'r2', Taxon: 'd__Archaea' }],
);
check('buildTaxonomyMap: reconoce "Feature ID"/"Taxon"', idCol === 'Feature ID' && taxCol === 'Taxon');
check('buildTaxonomyMap: mapa correcto', map.r1 === 'd__Bacteria' && map.r2 === 'd__Archaea', JSON.stringify(map));

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
