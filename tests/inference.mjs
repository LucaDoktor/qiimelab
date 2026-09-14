// tests/inference.mjs
// Suite de pruebas unitarias para el motor de inferencia funcional taxonómica
// y su integración con barplots y diagramas aluviales.
//
// Ejecución: node tests/inference.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

console.log('--- 1. Importación y API de inferencia funcional ---');
const inference = await import('../js/modules/inference.js');
const faprotax = await import('../js/lib/faprotax.js');
const taxaBarplot = await import('../js/modules/taxaBarplot.js');
const shell = await import('../js/modules/shell.js');
const i18n = await import('../js/lib/i18n.js');

check('inference.js exporta mapTaxonomyToFunction', typeof inference.mapTaxonomyToFunction === 'function');
check('inference.js exporta buildDatabaseIndex', typeof inference.buildDatabaseIndex === 'function');
check('inference.js exporta findFunctionsForTaxon', typeof inference.findFunctionsForTaxon === 'function');
check('inference.js exporta parseTaxaMatrix', typeof inference.parseTaxaMatrix === 'function');
check('inference.js exporta render', typeof inference.render === 'function');
check('faprotax.js exporta DEFAULT_FAPROTAX', typeof faprotax.DEFAULT_FAPROTAX === 'object' && faprotax.DEFAULT_FAPROTAX !== null);
check('DEFAULT_FAPROTAX contiene al menos 20 funciones metabólicas', Object.keys(faprotax.DEFAULT_FAPROTAX).length >= 20, `encontradas ${Object.keys(faprotax.DEFAULT_FAPROTAX).length}`);

console.log('\n--- 2. Mapeo estricto de taxones a múltiples funciones metabólicas ---');
const dbCustom = {
  nitrification: ['g__Nitrosomonas', 'Nitrospira'],
  denitrification: ['g__Pseudomonas', 'Paracoccus'],
  hydrocarbon_degradation: ['g__Pseudomonas', 'Acinetobacter'],
  chemoheterotrophy: ['g__Pseudomonas', 'g__Bacillus', 'Escherichia'],
  fermentation: ['Lactobacillus', 'Bifidobacterium']
};

const dbIndex = inference.buildDatabaseIndex(dbCustom);

// Mapeo múltiple: Pseudomonas pertenece a 3 funciones
const fnsPseudomonas = inference.findFunctionsForTaxon('g__Pseudomonas', dbIndex);
check('g__Pseudomonas se mapea a múltiples funciones', fnsPseudomonas.size === 3, `obtenido ${fnsPseudomonas.size}`);
check('g__Pseudomonas contiene denitrification', fnsPseudomonas.has('denitrification'));
check('g__Pseudomonas contiene hydrocarbon_degradation', fnsPseudomonas.has('hydrocarbon_degradation'));
check('g__Pseudomonas contiene chemoheterotrophy', fnsPseudomonas.has('chemoheterotrophy'));
check('g__Pseudomonas NO contiene nitrification', !fnsPseudomonas.has('nitrification'));

// Linaje completo de QIIME2 con prefijos
const fullLineagePseudo = 'k__Bacteria; p__Proteobacteria; c__Gammaproteobacteria; o__Pseudomonadales; f__Pseudomonadaceae; g__Pseudomonas';
const fnsFullLineage = inference.findFunctionsForTaxon(fullLineagePseudo, dbIndex);
check('Linaje completo de QIIME2 reconoce g__Pseudomonas', fnsFullLineage.size === 3);
check('Linaje completo de QIIME2 contiene denitrification', fnsFullLineage.has('denitrification'));

// Nombre sin prefijo 'g__'
const fnsNitrospira = inference.findFunctionsForTaxon('Nitrospira', dbIndex);
check('Nombre limpio sin prefijo (Nitrospira) se reconoce correctamente', fnsNitrospira.has('nitrification'));

// Linaje con prefijo que coincide con nombre limpio en DB
const fnsLacto = inference.findFunctionsForTaxon('g__Lactobacillus', dbIndex);
check('g__Lactobacillus coincide con entrada limpia en DB (Lactobacillus)', fnsLacto.has('fermentation'));

// Aislamiento estricto de taxones: género no mapea a especie diferente
const fnsNonExistent = inference.findFunctionsForTaxon('g__Streptomyces', dbIndex);
check('Taxón no registrado en DB retorna conjunto vacío', fnsNonExistent.size === 0);

console.log('\n--- 3. Agregación matemática exacta de abundancias relativas ---');
// Muestra 1: 1000 lecturas totales
// - g__Pseudomonas: 400 (40%) -> mapea a denitrification, hydrocarbon_degradation, chemoheterotrophy
// - g__Nitrosomonas: 300 (30%) -> mapea a nitrification
// - g__UnknownGenus: 300 (30%) -> sin función asignada
// Muestra 2: 500 lecturas totales
// - g__Pseudomonas: 100 (20%)
// - g__Nitrosomonas: 250 (50%)
// - g__UnknownGenus: 150 (30%)
const mockTaxaData = {
  headers: ['SampleID', 'g__Pseudomonas', 'g__Nitrosomonas', 'g__UnknownGenus'],
  rows: [
    { SampleID: 'Muestra_1', 'g__Pseudomonas': 400, 'g__Nitrosomonas': 300, 'g__UnknownGenus': 300 },
    { SampleID: 'Muestra_2', 'g__Pseudomonas': 100, 'g__Nitrosomonas': 250, 'g__UnknownGenus': 150 },
  ]
};

const result = inference.mapTaxonomyToFunction(mockTaxaData, dbCustom, {
  includeUnassigned: true,
  asPercentage: true,
  unassignedLabel: 'Sin función asignada'
});

check('Devuelve headers con SampleID y funciones', Array.isArray(result.headers) && result.headers[0] === 'SampleID');
check('Devuelve 2 filas de muestras', result.rows.length === 2);

const r1 = result.rows[0];
const r2 = result.rows[1];

// Verificación Muestra 1
check('Muestra 1 - Nitrificación es 30.0%', Math.abs(r1.nitrification - 30.0) < 1e-4, `got ${r1.nitrification}`);
check('Muestra 1 - Desnitrificación es 40.0%', Math.abs(r1.denitrification - 40.0) < 1e-4, `got ${r1.denitrification}`);
check('Muestra 1 - Degradación de hidrocarburos es 40.0%', Math.abs(r1.hydrocarbon_degradation - 40.0) < 1e-4, `got ${r1.hydrocarbon_degradation}`);
check('Muestra 1 - Quimioheterotrofia es 40.0%', Math.abs(r1.chemoheterotrophy - 40.0) < 1e-4, `got ${r1.chemoheterotrophy}`);
check('Muestra 1 - Sin función asignada es 30.0%', Math.abs(r1['Sin función asignada'] - 30.0) < 1e-4, `got ${r1['Sin función asignada']}`);

// Verificación Muestra 2
check('Muestra 2 - Nitrificación es 50.0%', Math.abs(r2.nitrification - 50.0) < 1e-4, `got ${r2.nitrification}`);
check('Muestra 2 - Desnitrificación es 20.0%', Math.abs(r2.denitrification - 20.0) < 1e-4, `got ${r2.denitrification}`);
check('Muestra 2 - Sin función asignada es 30.0%', Math.abs(r2['Sin función asignada'] - 30.0) < 1e-4, `got ${r2['Sin función asignada']}`);

console.log('\n--- 4. Manejo estricto de taxones desconocidos (includeUnassigned) ---');
// Opción includeUnassigned: false
const resultNoUnassigned = inference.mapTaxonomyToFunction(mockTaxaData, dbCustom, {
  includeUnassigned: false,
  asPercentage: true
});

check('Cuando includeUnassigned es false, no incluye columna "Sin función asignada"', !resultNoUnassigned.headers.includes('Sin función asignada'));
check('Las filas no contienen la clave unassigned', resultNoUnassigned.rows[0]['Sin función asignada'] === undefined);
check('Las abundancias de rutas identificadas se mantienen intactas (30.0%)', Math.abs(resultNoUnassigned.rows[0].nitrification - 30.0) < 1e-4);

// Taxones clasificados y no clasificados registrados en el objeto
check('Registra mappedTaxa correctamente', result.mappedTaxa.includes('g__Pseudomonas') && result.mappedTaxa.includes('g__Nitrosomonas'));
check('Registra unassignedTaxa correctamente', result.unassignedTaxa.includes('g__UnknownGenus') && result.unassignedTaxa.length === 1);
check('Estadística totalTaxa es 3', result.mappingStats.totalTaxa === 3);
check('Estadística mappedTaxaCount es 2', result.mappingStats.mappedTaxaCount === 2);
check('Estadística coveragePercent es 66.67%', Math.abs(result.mappingStats.coveragePercent - 66.67) < 0.1);

console.log('\n--- 5. Soporte para formatos inversos de diccionarios JSON ---');
// Formato Taxón -> [Funciones]
const dbInverted = {
  'g__Pseudomonas': ['denitrification', 'hydrocarbon_degradation'],
  'g__Nitrosomonas': ['nitrification']
};

const resultInverted = inference.mapTaxonomyToFunction(mockTaxaData, dbInverted, { asPercentage: true });
check('Diccionario invertido (Taxón -> [Funciones]) mapea correctamente', Math.abs(resultInverted.rows[0].denitrification - 40.0) < 1e-4);
check('Diccionario invertido mapea nitrificación', Math.abs(resultInverted.rows[0].nitrification - 30.0) < 1e-4);

// Formato Array de anotaciones
const dbArray = [
  { taxon: 'g__Pseudomonas', functions: ['denitrification', 'aromatic_degradation'] },
  { taxon: 'g__Nitrosomonas', functions: ['nitrification'] }
];

const resultArr = inference.mapTaxonomyToFunction(mockTaxaData, dbArray, { asPercentage: true });
check('Diccionario como Array de objetos [{ taxon, functions }] mapea correctamente', Math.abs(resultArr.rows[0].aromatic_degradation - 40.0) < 1e-4);

console.log('\n--- 6. Formato compatible con groupTaxaByAbundance (Barplot apilado) ---');
// La matriz generada debe pasar directamente por groupTaxaByAbundance
const grouped = taxaBarplot.groupTaxaByAbundance(result, 1, 15, { isPercentage: true, sampleKey: result.sampleKey });

check('groupTaxaByAbundance procesa la matriz funcional sin errores', grouped && typeof grouped === 'object');
check('grouped.headers contiene sampleKey', grouped.headers.includes('SampleID'));
check('grouped.rows tiene la misma cantidad de muestras', grouped.rows.length === 2);
check('grouped.series contiene entradas de funciones', grouped.series.length > 0);

// Prueba de agrupamiento en "Otros" con umbral estricto
const groupedWithOthers = taxaBarplot.groupTaxaByAbundance(result, 35, 1, { isPercentage: true, sampleKey: result.sampleKey });
check('Funciones minoritarias por debajo del umbral se agrupan en "Otros"', groupedWithOthers.hasOther === true);
check('groupedWithOthers.series contiene entrada para otros (__other__)', groupedWithOthers.series.some(s => s.isOther && s.key === '__other__'));
check('"Otros" tiene color fijo neutro #d3d3d3', groupedWithOthers.series.find(s => s.isOther).color === '#d3d3d3');

console.log('\n--- 7. Integración con el Enrutador y Shell de la aplicación ---');
check('shell.js ROUTES contiene inferencia', shell.ROUTES.some(r => r.id === 'inferencia'));
const inferRoute = shell.ROUTES.find(r => r.id === 'inferencia');
check('Ruta inferencia tiene icono inferencia', inferRoute && inferRoute.icon === 'inferencia');
check('Ruta inferencia pertenece al grupo stats', inferRoute && inferRoute.group === 'stats');

const esNav = i18n.t('nav.inference');
check('Traducción de nav.inference existe en ES', typeof esNav === 'string' && esNav.length > 0, esNav);
const esTitle = i18n.t('inference.title');
check('Traducción de inference.title existe en ES', typeof esTitle === 'string' && esTitle.length > 0, esTitle);
const esWarn = i18n.t('inference.warningText');
check('Aviso metodológico permanente presente en i18n', typeof esWarn === 'string' && esWarn.includes('predictiva'), esWarn);

if (failed) {
  console.error('\n❌ Algunos tests de inferencia funcional fallaron.');
  process.exit(1);
} else {
  console.log('\n✅ TODOS LOS TESTS DE INFERENCIA FUNCIONAL PASARON EXITOSAMENTE (100%).');
  process.exit(0);
}
