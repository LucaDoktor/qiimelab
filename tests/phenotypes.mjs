// tests/phenotypes.mjs
// Suite de pruebas para js/lib/phenotypes.js: integridad estructural de la
// base de datos fenotípica ampliada (curación manual + The Microbe Directory
// v2 vía scripts/build-phenotypes-md2.mjs) y no-regresión de los géneros de
// control que ya usaba tests/inference.mjs antes de la ampliación.
//
// Ejecución: node tests/phenotypes.mjs

import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const PHENOTYPES_PATH = join(DIR, '../js/lib/phenotypes.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

const phenotypes = await import('../js/lib/phenotypes.js');
const { PHENOTYPE_CATEGORIES, DEFAULT_PHENOTYPES, PHENOTYPE_NAMES, PHENOTYPES_METADATA } = phenotypes;

console.log('--- 1. Integridad estructural: categorías, rasgos y nombres ---');

const categoryKeys = Object.keys(PHENOTYPE_CATEGORIES);
check('Existen 10 categorías', categoryKeys.length === 10, `encontradas ${categoryKeys.length}`);

let totalDeclaredTraits = 0;
for (const [catKey, cat] of Object.entries(PHENOTYPE_CATEGORIES)) {
  check(`Categoría ${catKey} declara name.es y name.en`, typeof cat.name?.es === 'string' && typeof cat.name?.en === 'string');
  check(`Categoría ${catKey} tiene DEFAULT_PHENOTYPES.${catKey}`, typeof DEFAULT_PHENOTYPES[catKey] === 'object' && DEFAULT_PHENOTYPES[catKey] !== null);
  for (const trait of cat.traits) {
    totalDeclaredTraits++;
    check(`Rasgo ${catKey}.${trait} existe como array en DEFAULT_PHENOTYPES`, Array.isArray(DEFAULT_PHENOTYPES[catKey]?.[trait]));
    check(`Rasgo ${trait} tiene entrada en PHENOTYPE_NAMES con es/en`, typeof PHENOTYPE_NAMES[trait]?.es === 'string' && typeof PHENOTYPE_NAMES[trait]?.en === 'string');
  }
  // Ningún rasgo fuera de lista debe colarse en la categoría
  const extraTraits = Object.keys(DEFAULT_PHENOTYPES[catKey] || {}).filter((k) => !cat.traits.includes(k));
  check(`Categoría ${catKey} no tiene rasgos fuera de PHENOTYPE_CATEGORIES`, extraTraits.length === 0, extraTraits.join(', '));
}
// El archivo original decía traitsCount:28 en sus metadatos, pero sumando
// los traits de las 10 categorías el recuento real siempre fue 29 (bug
// preexistente en los metadatos, corregido por scripts/build-phenotypes-md2.mjs).
check('El total de rasgos declarados es 29', totalDeclaredTraits === 29, `encontrados ${totalDeclaredTraits}`);
check('PHENOTYPES_METADATA.traitsCount coincide con el recuento real', PHENOTYPES_METADATA.traitsCount === totalDeclaredTraits, `metadata=${PHENOTYPES_METADATA.traitsCount} real=${totalDeclaredTraits}`);

// Todo taxón referenciado usa una convención de nombre reconocible
// (nombre plano, g__Genero, f__Familia o p__Filo) y ninguna entrada está vacía.
const namingPattern = /^(g__|f__|p__)?[A-Za-z][A-Za-z0-9_.\- ]*$/;
let badEntries = [];
for (const [catKey, traits] of Object.entries(DEFAULT_PHENOTYPES)) {
  if (!categoryKeys.includes(catKey)) continue; // salta las claves planas del Object.assign final
  for (const [trait, list] of Object.entries(traits)) {
    for (const entry of list) {
      if (typeof entry !== 'string' || !entry.trim() || !namingPattern.test(entry)) {
        badEntries.push(`${catKey}.${trait}: "${entry}"`);
      }
    }
  }
}
check('Todas las entradas de taxón usan una convención de nombre válida', badEntries.length === 0, badEntries.slice(0, 5).join(' | '));

console.log('\n--- 2. Compatibilidad plana (FLAT_PHENOTYPES / Object.assign) ---');
check('FLAT_PHENOTYPES existe y es objeto', typeof phenotypes.FLAT_PHENOTYPES === 'object' && phenotypes.FLAT_PHENOTYPES !== null);
check('DEFAULT_PHENOTYPES.gram_positive es accesible de forma plana', Array.isArray(DEFAULT_PHENOTYPES.gram_positive) && DEFAULT_PHENOTYPES.gram_positive.includes('Bacillus'));
check('FLAT_PHENOTYPES.halophile es accesible de forma plana', Array.isArray(phenotypes.FLAT_PHENOTYPES.halophile));

console.log('\n--- 3. Metadatos de procedencia (MD2 + curación manual) ---');
check('PHENOTYPES_METADATA.reference menciona The Microbe Directory', /Microbe Directory/i.test(PHENOTYPES_METADATA.reference));
check('PHENOTYPES_METADATA.reference menciona la licencia MIT', /MIT/i.test(PHENOTYPES_METADATA.reference));
check('PHENOTYPES_METADATA declara genusCoverage numérico', typeof PHENOTYPES_METADATA.genusCoverage === 'number' && PHENOTYPES_METADATA.genusCoverage > 0);

console.log('\n--- 4. Cobertura de géneros muy por encima de la curación manual original (~50-70) ---');
const genusSet = new Set();
for (const [catKey, traits] of Object.entries(DEFAULT_PHENOTYPES)) {
  if (!categoryKeys.includes(catKey)) continue;
  for (const list of Object.values(traits)) {
    for (const entry of list) {
      if (/^(g__|f__|p__)/.test(entry)) continue;
      genusSet.add(entry);
    }
  }
}
check('Cobertura de géneros distintos supera un orden de magnitud sobre la curación original (>=500)', genusSet.size >= 500, `encontrados ${genusSet.size}`);
check('PHENOTYPES_METADATA.genusCoverage coincide con el recuento real', PHENOTYPES_METADATA.genusCoverage === genusSet.size, `metadata=${PHENOTYPES_METADATA.genusCoverage} real=${genusSet.size}`);

console.log('\n--- 5. No-regresión: géneros de control no cambian de valor sin documentarlo ---');
// Estos son los mismos géneros/rasgos que ya verificaba tests/inference.mjs
// antes de la ampliación con MD2 (curación manual original) — deben seguir
// exactamente igual: la ampliación solo AÑADE géneros nuevos, nunca reescribe
// los ya curados a mano (ver scripts/build-phenotypes-md2.mjs: un conflicto
// entre MD2 y la curación existente se reporta pero nunca se sobrescribe).
const controlAssertions = [
  ['gram_stain', 'gram_negative', 'Pseudomonas'],
  ['cell_morphology', 'bacillus', 'Pseudomonas'],
  ['motility', 'motile', 'Pseudomonas'],
  ['oxygen_requirement', 'aerobe', 'Pseudomonas'],
  ['ecology', 'biofilm_forming', 'Pseudomonas'],
  ['ecology', 'pathogenic', 'Pseudomonas'],
  ['gram_stain', 'gram_positive', 'Clostridium'],
  ['sporulation', 'spore_forming', 'Clostridium'],
  ['oxygen_requirement', 'anaerobe', 'Clostridium'],
  ['gram_stain', 'gram_positive', 'Lactobacillus'],
  ['ph_range', 'acidophile', 'Lactobacillus'],
  ['temperature_range', 'thermophile', 'Thermus'],
  ['ecology', 'extremophile', 'Thermus'],
  ['temperature_range', 'psychrophile', 'Psychrobacter'],
  ['salinity', 'halotolerant', 'Halomonas'], // resuelto 2026-09-16, ver sección 8 — antes era halophile
];
for (const [cat, trait, genus] of controlAssertions) {
  check(`${genus} sigue en ${cat}.${trait}`, (DEFAULT_PHENOTYPES[cat]?.[trait] || []).includes(genus));
}

console.log('\n--- 6. Géneros nuevos aportados por MD2 (no estaban en la curación original) ---');
// Géneros que no formaban parte de las ~50-70 curadas a mano pero que MD2
// aporta con evidencia suficiente para superar el umbral de consenso.
const newGenusSamples = ['Bdellovibrio', 'Gluconacetobacter', 'Sphingomonas'];
let anyNewGenusFound = false;
for (const genus of newGenusSamples) {
  const found = genusSet.has(genus);
  if (found) anyNewGenusFound = true;
  console.log(`  · ${genus}: ${found ? 'presente' : 'no encontrado (evidencia MD2 insuficiente para el umbral)'}`);
}
check('Al menos uno de los géneros de muestra nuevos de MD2 está presente', anyNewGenusFound);

console.log('\n--- 7. Tamaño del archivo razonable para una PWA sin build step ---');
const sizeBytes = statSync(PHENOTYPES_PATH).size;
const sizeKB = sizeBytes / 1024;
check('js/lib/phenotypes.js pesa menos de 500 KB sin build step', sizeKB < 500, `${sizeKB.toFixed(0)} KB`);
console.log(`  (tamaño actual: ${sizeKB.toFixed(0)} KB)`);

console.log('\n--- 8. Resoluciones manuales de conflictos MD2 (18 géneros, 2026-09-16) ---');
// scripts/md2-conflicts-report.md listaba 18 géneros donde MD2 contradecía
// la curación manual en una categoría excluyente; cada uno se revisó a mano
// (ver qiimelab-prompt-resolver-conflictos-md2.md y el bloque de comentario
// en la cabecera de js/lib/phenotypes.js) y se fijó a UN valor concreto —
// que no vuelva a moverse sin que salte este test, sea por una regeneración
// accidental o por editar el género equivocado a mano.
const md2Resolutions = [
  ['sporulation', 'Actinomyces', 'non_spore_forming'],
  ['ph_range', 'Helicobacter', 'neutrophile'],
  ['ph_range', 'Enterococcus', 'alkaliphile'],
  ['salinity', 'Halobacterium', 'halophile'],
  ['salinity', 'Staphylococcus', 'halotolerant'],
  ['temperature_range', 'Campylobacter', 'thermophile'],
  ['temperature_range', 'Psychrobacter', 'psychrophile'],
  ['temperature_range', 'Pseudoalteromonas', 'psychrophile'],
  ['temperature_range', 'Shewanella', 'mesophile'],
  ['temperature_range', 'Flavobacterium', 'mesophile'],
  ['ph_range', 'Lactobacillus', 'acidophile'],
  ['ph_range', 'Gluconobacter', 'acidophile'],
  ['ph_range', 'Bifidobacterium', 'neutrophile'],
  ['ph_range', 'Streptococcus', 'neutrophile'],
  ['ph_range', 'Pediococcus', 'neutrophile'],
  ['salinity', 'Halobacillus', 'halophile'],
  ['salinity', 'Salinicoccus', 'halophile'],
  ['salinity', 'Halomonas', 'halotolerant'],
];
const EXCLUSIVE_TRAITS = {
  sporulation: ['spore_forming', 'non_spore_forming'],
  temperature_range: ['thermophile', 'mesophile', 'psychrophile'],
  ph_range: ['acidophile', 'neutrophile', 'alkaliphile'],
  salinity: ['halophile', 'halotolerant'],
};
for (const [cat, genus, value] of md2Resolutions) {
  check(`${genus} (${cat}) tiene el valor resuelto: ${value}`, (DEFAULT_PHENOTYPES[cat]?.[value] || []).includes(genus));
  // y en NINGÚN otro rasgo del mismo grupo excluyente (nunca duplicado tras el movimiento)
  const others = EXCLUSIVE_TRAITS[cat].filter((t) => t !== value);
  const inOther = others.filter((t) => (DEFAULT_PHENOTYPES[cat]?.[t] || []).includes(genus));
  check(`${genus} (${cat}) no sigue también en ${others.join('/')}`, inOther.length === 0, inOther.join(', '));
}

if (failed) {
  console.error('\n❌ Algunos tests de la base de datos fenotípica fallaron.');
  process.exit(1);
} else {
  console.log('\n✅ TODOS LOS TESTS DE LA BASE DE DATOS FENOTÍPICA (MD2 + CURACIÓN MANUAL) PASARON.');
  process.exit(0);
}
