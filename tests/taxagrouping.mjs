// tests/taxagrouping.mjs
// Suite de pruebas unitarias y de integración para el filtrado dinámico y
// agrupamiento de taxones en la categoría "Otros" (js/modules/taxaBarplot.js y taxa.js).
//
//   node tests/taxagrouping.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

console.log('--- 1. Importación y constantes exportadas ---');
const taxaBarplot = await import('../js/modules/taxaBarplot.js');
const taxa = await import('../js/modules/taxa.js');

check('taxaBarplot.js exporta groupTaxaByAbundance', typeof taxaBarplot.groupTaxaByAbundance === 'function');
check('taxa.js re-exporta groupTaxaByAbundance', typeof taxa.groupTaxaByAbundance === 'function');
check('taxaBarplot.js exporta render', typeof taxaBarplot.render === 'function');
check('taxa.js re-exporta render', typeof taxa.render === 'function');

check('TOP_N_DEFAULT es 15', taxaBarplot.TOP_N_DEFAULT === 15, `got ${taxaBarplot.TOP_N_DEFAULT}`);
check('TOP_N_MIN es 5', taxaBarplot.TOP_N_MIN === 5, `got ${taxaBarplot.TOP_N_MIN}`);
check('TOP_N_MAX es 50', taxaBarplot.TOP_N_MAX === 50, `got ${taxaBarplot.TOP_N_MAX}`);
check('MIN_ABUND_DEFAULT es 1', taxaBarplot.MIN_ABUND_DEFAULT === 1, `got ${taxaBarplot.MIN_ABUND_DEFAULT}`);
check('MIN_ABUND_MIN es 0', taxaBarplot.MIN_ABUND_MIN === 0, `got ${taxaBarplot.MIN_ABUND_MIN}`);
check('MIN_ABUND_MAX es 10', taxaBarplot.MIN_ABUND_MAX === 10, `got ${taxaBarplot.MIN_ABUND_MAX}`);
check('OTHER_COLOR es #d3d3d3 (gris neutro fijo)', taxaBarplot.OTHER_COLOR === '#d3d3d3', `got ${taxaBarplot.OTHER_COLOR}`);

console.log('\n--- 2. Cálculo matemático de abundancias y medias dataset-wide ---');
// Dataset de prueba: 2 muestras con conteos dispares para verificar normalización relativa
const mockTable = {
  headers: ['SampleID', 'TaxonA', 'TaxonB', 'TaxonC', 'TaxonD', 'TaxonE', 'TaxonF'],
  rows: [
    // S1 total = 1000
    // TaxonA: 500 (50%), TaxonB: 250 (25%), TaxonC: 150 (15%), TaxonD: 60 (6%), TaxonE: 30 (3%), TaxonF: 10 (1%)
    { SampleID: 'S1', TaxonA: 500, TaxonB: 250, TaxonC: 150, TaxonD: 60, TaxonE: 30, TaxonF: 10 },
    // S2 total = 500
    // TaxonA: 300 (60%), TaxonB: 100 (20%), TaxonC: 50 (10%), TaxonD: 30 (6%), TaxonE: 15 (3%), TaxonF: 5 (1%)
    { SampleID: 'S2', TaxonA: 300, TaxonB: 100, TaxonC: 50, TaxonD: 30, TaxonE: 15, TaxonF: 5 },
  ]
};

// Medias esperadas:
// TaxonA: (50% + 60%) / 2 = 55% (0.55)
// TaxonB: (25% + 20%) / 2 = 22.5% (0.225)
// TaxonC: (15% + 10%) / 2 = 12.5% (0.125)
// TaxonD: (6% + 6%) / 2 = 6% (0.06)
// TaxonE: (3% + 3%) / 2 = 3% (0.03)
// TaxonF: (1% + 1%) / 2 = 1% (0.01)

const res1 = taxaBarplot.groupTaxaByAbundance(mockTable, 5, 10); // minAbundance = 5%, topN = 10
check('res1 calcula las medias correctamente', Math.abs(res1.means.find((m) => m.header === 'TaxonA').mean - 0.55) < 1e-6);
check('res1 ordena medias en orden descendente', res1.means[0].header === 'TaxonA' && res1.means[1].header === 'TaxonB');
check('res1 filtra taxones con abundancia < 5% (TaxonE y TaxonF fuera de topTaxa)',
  res1.topTaxa.length === 4 && !res1.topTaxa.includes('TaxonE') && !res1.topTaxa.includes('TaxonF'));
check('res1 incluye TaxonA, TaxonB, TaxonC, TaxonD en topTaxa',
  ['TaxonA', 'TaxonB', 'TaxonC', 'TaxonD'].every((t) => res1.topTaxa.includes(t)));
check('res1 agrupa TaxonE y TaxonF en otherTaxa',
  res1.otherTaxa.includes('TaxonE') && res1.otherTaxa.includes('TaxonF') && res1.otherTaxa.length === 2);

console.log('\n--- 3. Suma muestra por muestra en "Otros" ---');
// En S1: TaxonE (30) + TaxonF (10) = 40 (4%)
// En S2: TaxonE (15) + TaxonF (5) = 20 (4%)
check('res1.rows[0]["Otros"] suma exactamente los taxones minoritarios de S1', res1.rows[0]['Otros'] === 40, `got ${res1.rows[0]['Otros']}`);
check('res1.rows[0]["__other__"] tiene el mismo valor que "Otros"', res1.rows[0]['__other__'] === 40);
check('res1.rows[1]["Otros"] suma exactamente los taxones minoritarios de S2', res1.rows[1]['Otros'] === 20, `got ${res1.rows[1]['Otros']}`);
check('res1.rows[0]._relative["Otros"] representa la fracción relativa exacta (40/1000 = 0.04)',
  Math.abs(res1.rows[0]._relative['Otros'] - 0.04) < 1e-6);
check('res1.rows[1]._relative["Otros"] representa la fracción relativa exacta (20/500 = 0.04)',
  Math.abs(res1.rows[1]._relative['Otros'] - 0.04) < 1e-6);

console.log('\n--- 4. Límite Top N restrictivo ---');
// Con minAbundance = 0% y topN = 2:
// TaxonA (55%) y TaxonB (22.5%) son Top 2
// TaxonC, TaxonD, TaxonE, TaxonF deben agruparse en "Otros"
const res2 = taxaBarplot.groupTaxaByAbundance(mockTable, 0, 2);
check('res2 conserva solo 2 taxones en topTaxa', res2.topTaxa.length === 2 && res2.topTaxa[0] === 'TaxonA' && res2.topTaxa[1] === 'TaxonB');
check('res2 agrupa los 4 restantes en otherTaxa', res2.otherTaxa.length === 4);
// S1: TaxonC (150) + TaxonD (60) + TaxonE (30) + TaxonF (10) = 250
check('res2 suma correctamente en S1 para topN=2 (250)', res2.rows[0]['Otros'] === 250, `got ${res2.rows[0]['Otros']}`);
// S2: TaxonC (50) + TaxonD (30) + TaxonE (15) + TaxonF (5) = 100
check('res2 suma correctamente en S2 para topN=2 (100)', res2.rows[1]['Otros'] === 100, `got ${res2.rows[1]['Otros']}`);

console.log('\n--- 5. Soporte de porcentajes y fracciones decimales ---');
// minAbundance = 0.05 (fracción) debe comportarse idéntico a minAbundance = 5 (%)
const resFrac = taxaBarplot.groupTaxaByAbundance(mockTable, 0.05, 10);
check('minAbundance como fracción 0.05 produce topTaxa idéntico a 5%',
  JSON.stringify(resFrac.topTaxa) === JSON.stringify(res1.topTaxa));
const resOpts = taxaBarplot.groupTaxaByAbundance(mockTable, { minAbundance: 5, topN: 10 });
check('llamada con objeto de opciones { minAbundance, topN } funciona correctamente',
  JSON.stringify(resOpts.topTaxa) === JSON.stringify(res1.topTaxa));

console.log('\n--- 6. Integración con columnas pre-existentes "Others" (QIIME2 TOP14) ---');
const qiimeTable = {
  headers: ['SampleID', 'Taxon1', 'Taxon2', 'Others'],
  rows: [
    { SampleID: 'S1', Taxon1: 60, Taxon2: 30, Others: 10 },
    { SampleID: 'S2', Taxon1: 50, Taxon2: 25, Others: 25 },
  ]
};
const resQiime = taxaBarplot.groupTaxaByAbundance(qiimeTable, 1, 15);
check('resQiime detecta columna pre-existente Others', resQiime.preAggOtherHeaders.includes('Others'));
check('resQiime no incluye Others en topTaxa', !resQiime.topTaxa.includes('Others'));
check('resQiime pliega la columna Others dentro de "Otros"', resQiime.rows[0]['Otros'] === 10 && resQiime.rows[1]['Otros'] === 25);

console.log('\n--- 7. Configuración de serie visual y color fijo #d3d3d3 para "Otros" ---');
check('res1.hasOther es true', res1.hasOther === true);
const lastSeries = res1.series[res1.series.length - 1];
check('"Otros" se renderiza al final de la pila (último elemento de series)', lastSeries.key === '__other__');
check('"Otros" recibe color gris neutro fijo #d3d3d3', lastSeries.color === '#d3d3d3', `got ${lastSeries.color}`);

console.log('\n--- 8. Auditoría de código de UI y reactividad a 60fps ---');
const content = readFileSync(join(DIR, '../js/modules/taxaBarplot.js'), 'utf8');

check('taxaBarplot.js incluye control de rango para Top N (#qlTopNr)', content.includes('id="qlTopNr"'));
check('taxaBarplot.js incluye control numérico para Top N (#qlTopN)', content.includes('id="qlTopN"'));
check('taxaBarplot.js incluye indicador badge para Top N (#qlTopNVal)', content.includes('id="qlTopNVal"'));
check('taxaBarplot.js incluye control de rango para Abundancia Mínima (#qlMinAbundR)', content.includes('id="qlMinAbundR"'));
check('taxaBarplot.js incluye control numérico para Abundancia Mínima (#qlMinAbund)', content.includes('id="qlMinAbund"'));
check('taxaBarplot.js incluye indicador badge para Abundancia Mínima (#qlMinAbundVal)', content.includes('id="qlMinAbundVal"'));
check('taxaBarplot.js programa re-renderizado reactivo con requestAnimationFrame a 60fps',
  content.includes('requestAnimationFrame') && content.includes('scheduleRender'));
check('taxaBarplot.js escucha eventos "input" en sliders para actualización instantánea sin destruir controles',
  content.includes("rInput.addEventListener('input'") && content.includes("rInput.addEventListener('change'"));
check('taxaBarplot.js aplica color OTHER_COLOR fijo a barras verticales para __other__',
  content.includes("(s.key === '__other__') ? OTHER_COLOR"));
check('taxaBarplot.js aplica color OTHER_COLOR fijo a barras horizontales para __other__',
  content.includes("(s.key === '__other__') ? OTHER_COLOR"));
check('taxaBarplot.js aplica color OTHER_COLOR fijo a enlaces y nodos aluviales para __other__',
  content.includes("(link.taxonKey === '__other__') ? OTHER_COLOR") &&
  content.includes("(node.taxonKey === '__other__') ? OTHER_COLOR"));

console.log('\n--- 9. Resumen de resultados ---');
if (failed) {
  console.error('❌ Fallaron algunos tests en taxagrouping.mjs');
  process.exit(1);
} else {
  console.log('✅ Todos los tests de taxagrouping pasaron exitosamente.');
  process.exit(0);
}

