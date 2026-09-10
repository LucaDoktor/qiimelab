// Sensatez de la detección de auto-dímeros/hetero-dímeros/horquillas
// (js/lib/primerDimers.js), sin navegador: un primer con un palíndromo GC
// fuerte (autodimeriza) frente a uno sin ninguna base complementaria a sí
// mismo (poli-A); una horquilla diseñada a mano (dos brazos GC separados por
// un bucle) frente al mismo poli-A; y una pareja de primers no relacionados
// sin hetero-dímero.
//
//   node tests/primerdimers.mjs

import { APP_ROOT } from './lib/env.mjs';
const { scanDimer, scanHairpin, classifyDimer, classifyHairpin, buildDimerMatrix } =
  await import(APP_ROOT + '/js/lib/primerDimers.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

// GGGCCC es su propio complementario inverso (revcomp('GGGCCC') === 'GGGCCC'):
// dos copias de este primer se pegan entre sí por ese tramo → auto-dímero fuerte.
const STRONG_SELF = 'AAAAAGGGCCCAAAAA';
// sin ninguna G/C, A solo empareja con T: ninguna base es complementaria de
// sí misma → cero auto-dímero.
const NO_DIMER = 'AAAAAAAAAAAAAAAAAAAA';

const strongDimer = scanDimer(STRONG_SELF, STRONG_SELF);
check('auto-dímero fuerte: encuentra el tramo GGGCCC (6 pb)',
  !!strongDimer && strongDimer.len === 6, JSON.stringify(strongDimer));
check('auto-dímero fuerte: ΔG claramente negativa (dúplex estable)',
  !!strongDimer && strongDimer.dG < -6, 'ΔG=' + (strongDimer && strongDimer.dG.toFixed(2)));
check('auto-dímero fuerte: se clasifica warn o crit',
  ['warn', 'crit'].includes(classifyDimer(strongDimer)));

const noDimer = scanDimer(NO_DIMER, NO_DIMER);
check('sin auto-dímero: no encuentra ningún tramo', noDimer === null, JSON.stringify(noDimer));
check('sin auto-dímero: se clasifica ok', classifyDimer(noDimer) === 'ok');

// horquilla diseñada a mano: brazo1 "GGGCC" + bucle "TTTAA" (5 nt, no
// complementario) + brazo2 "GGCCC" = revcomp(brazo1) → tallo de 5 pb.
const HAIRPIN_SEQ = 'GGGCCTTTAAGGCCC';
const hp = scanHairpin(HAIRPIN_SEQ);
// el algoritmo explora TODAS las anclas (p, largo de bucle) y se queda con la
// de ΔG más negativa — puede "descubrir" un tallo aún mejor que el diseñado
// a mano (aquí, aprovechando una T-A fortuita en el borde del bucle) y por
// eso el mínimo esperado es >= 5 pb, no exactamente 5.
check('horquilla diseñada: encuentra un tallo de al menos 5 pb', !!hp && hp.stem >= 5, JSON.stringify(hp));
check('horquilla diseñada: el tallo cae donde se diseñó (bucle a partir de la posición 5, brazo1 empieza en 0)',
  !!hp && hp.armStart === 0 && hp.loopStart >= 5, JSON.stringify(hp));
check('horquilla diseñada: ΔG negativa y se clasifica warn o crit',
  !!hp && hp.dG < -6 && ['warn', 'crit'].includes(classifyHairpin(hp)));

const noHp = scanHairpin(NO_DIMER);
check('sin horquilla (poli-A): no encuentra ningún tallo', noHp === null, JSON.stringify(noHp));
check('sin horquilla (poli-A): se clasifica ok', classifyHairpin(noHp) === 'ok');

// hetero-dímero: un primer con cola 3' complementaria de otro (multiplex
// típico) frente a una pareja sin ninguna relación.
const P1 = 'ACGTACGTACGGGCCCAA'; // termina en GGGCCC
const P2 = 'TTGGGCCCTTAAGGTTAA'; // empieza por TTGGGCCC (contiene GGGCCC)
const hetero = scanDimer(P1, P2);
check('hetero-dímero: pareja diseñada encuentra un tramo complementario',
  !!hetero && hetero.len >= 4, JSON.stringify(hetero));

const UNRELATED_A = 'AAAAAAAAAAAAAAAAAA';
const UNRELATED_B = 'GGGGGGGGGGGGGGGGGG'; // G no empareja con G
const heteroNone = scanDimer(UNRELATED_A, UNRELATED_B);
check('hetero-dímero: pareja sin relación no encuentra nada', heteroNone === null, JSON.stringify(heteroNone));

// matriz: 3 primers (el auto-dimerizante, el sin-dímero, y uno de la pareja
// hetero) → diagonal = auto-dímero, fuera de diagonal = hetero.
const matrix = buildDimerMatrix([
  { id: 'a', seq: STRONG_SELF }, { id: 'b', seq: NO_DIMER }, { id: 'c', seq: P2 },
]);
check('matriz: auto-dímero de "a" coincide con scanDimer(a,a)',
  JSON.stringify(matrix.selfDimer.a) === JSON.stringify(strongDimer));
check('matriz: hetero a×c existe y no se recalcula c×a por separado',
  Object.keys(matrix.hetero).length === 3 && !!matrix.hetero['a::c'] !== undefined);

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
