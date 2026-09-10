// Sensatez del parser FASTA + búsqueda de sitios/amplicón (js/lib/primerTemplate.js):
// una plantilla construida a mano con un primer directo insertado literalmente
// y otro insertado como su complementario inverso (como estaría en una
// plantilla real de doble cadena) → deben encontrarse en las hebras '+' y '-'
// respectivamente, en la posición exacta, con el amplicón correcto; y un
// mismatch introducido a propósito en el extremo 3' de una copia debe
// marcarse como crítico y desaparecer con tolerancia 0.
//
//   node tests/primertemplate.mjs

import { APP_ROOT } from './lib/env.mjs';
const { parseFasta, findPrimerSites, findAmplicons } = await import(APP_ROOT + '/js/lib/primerTemplate.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

// F insertado literal (sitio '+'), revcomp(R) insertado literal (sitio '-' de R)
const F = 'GTGCCAGCAGCCGCGGTAA';   // 515F resuelto, 19 nt
const R = 'GGACTACAAGGGTATCTAAT';  // 806R resuelto, 20 nt
const TEMPLATE = 'AAAAA' + F + 'CCCCCCCCCC' + 'ATTAGATACCCTTGTAGTCC' + 'TTTTT';
// (el tercer bloque es revcomp(R), calculado y verificado al escribir el test)

const fasta = parseFasta('>ref1 plantilla de prueba\n' + TEMPLATE.slice(0, 30) + '\n' + TEMPLATE.slice(30) + '\n>ref2 vacía\n');
check('parseFasta: 2 registros', fasta.length === 2);
check('parseFasta: reconstruye la secuencia partida en varias líneas',
  fasta[0].id === 'ref1' && fasta[0].seq === TEMPLATE, fasta[0].seq);
check('parseFasta: descripción tras el primer espacio', fasta[0].description === 'plantilla de prueba');
check('parseFasta: registro sin secuencia queda vacío', fasta[1].id === 'ref2' && fasta[1].seq === '');

const hitsF = findPrimerSites(TEMPLATE, F, { maxMismatches: 0 });
check('F: exactamente un sitio, en la hebra +, en la posición 5',
  hitsF.length === 1 && hitsF[0].strand === '+' && hitsF[0].pos === 5, JSON.stringify(hitsF));

const hitsR = findPrimerSites(TEMPLATE, R, { maxMismatches: 0 });
check('R: exactamente un sitio, en la hebra -, en la posición 34',
  hitsR.length === 1 && hitsR[0].strand === '-' && hitsR[0].pos === 34, JSON.stringify(hitsR));

const { amplicons } = findAmplicons(TEMPLATE, F, R, { maxMismatches: 0 });
check('amplicón F×R: exactamente uno, de 5 a 54 (49 pb)',
  amplicons.length === 1 && amplicons[0].start === 5 && amplicons[0].end === 54 && amplicons[0].size === 49,
  JSON.stringify(amplicons));

// mismatch a propósito en el ÚLTIMO nucleótido (extremo 3') de la copia de F:
// cambia la 'A' final por 'C' → con tolerancia 0 no debe encontrarse; con
// tolerancia 1 sí, y debe marcarse como mismatch crítico en el extremo 3'.
const mutPos = 5 + F.length - 1; // último nt de la copia de F en la plantilla
const MUT_TEMPLATE = TEMPLATE.slice(0, mutPos) + 'C' + TEMPLATE.slice(mutPos + 1);
const hitsExact = findPrimerSites(MUT_TEMPLATE, F, { maxMismatches: 0 });
check('mismatch 3\' introducido: desaparece con tolerancia 0', hitsExact.length === 0, JSON.stringify(hitsExact));
const hitsTol1 = findPrimerSites(MUT_TEMPLATE, F, { maxMismatches: 1 });
check('mismatch 3\' introducido: aparece con tolerancia 1, marcado como crítico en el 3\'',
  hitsTol1.length === 1 && hitsTol1[0].mismatchCount === 1 && hitsTol1[0].has3PrimeMismatch === true,
  JSON.stringify(hitsTol1));

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
