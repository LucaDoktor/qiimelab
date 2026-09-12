// Sensatez del diseño de novo (js/lib/primerDesign.js): sobre una plantilla
// con 515F/806R real embebido cerca (producto corto, ~129 pb) y un primer
// sintético limpio embebido lejos (producto ~749 pb), el modo qPCR debe
// encontrar solo parejas cortas y el modo PCR estándar debe aceptar
// parejas largas que qPCR rechazaría por tamaño — más un caso de
// especificidad (secuencia duplicada -> se descarta) y de "editable a
// mano" (cambiar el tope de tamaño a mano cambia lo que se acepta).
//
// La plantilla se construyó y se verificó contra la implementación real
// antes de fijarla aquí (script de la sesión, no persistido): con la
// semilla y las posiciones documentadas abajo, qPCR da tamaños 121-140 pb
// y estándar da 612-799 pb — disjuntos, como exige el propio diseño.
//
//   node tests/primerdesign.mjs

import { APP_ROOT } from './lib/env.mjs';
const { designPrimers, generateCandidates, evaluateCandidate, confirmSpecificity, MODES } =
  await import(APP_ROOT + '/js/lib/primerDesign.js');
const { gcClamp } = await import(APP_ROOT + '/js/lib/primerAnalysis.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

// flanco(30) + 515F(20, real) + flanco(90) + revcomp(806R)(20, real) →
// producto 129 pb + flanco(600) + revcomp(farR)(20, sintético limpio) →
// producto 749 pb + flanco(40). Generada con mulberry32(20260911).
const TEMPLATE =
  'CGGAGGGGCATCAGGTCGAGTCAGTAGTAGGTGCCAGCAGCCGCGGTAAACTGAGATAACCGTGGAGCACGATCACTTTGTTGAGTATGACTCGTTATGGGAAAATATCGACGCTTCAAAGAGCGGCCAGGTTAGTTACATTAGATACCCTTGTAGTCCTCCACGATCTAAACCGGAGATACACCCAGGCGAAGTGATTCAGCAAGGCCCAGCAGCGTGCGGAGCAGCCTCTACGAACTGGACAGTGTTTGTTTCGGAAAGTTCCTTGAATCGGCCGAATCGTAATGCTATATCTTCCCCAGCAGGCATTCGGATATTCTCGCGCAAGGCAATCCTGGAAATTGAGCGGTTATAAGAAGGTTAATTATGCGGAACCAAGCAGTGCAATGCAATTAGTGGATGTGGAGAAATCAAGCGGACATTGTCTCGGGAGTAGTGTCCACTAACTTCCAAAGAGACGACAATGAGTTCTCAGCGCCCGTGTGCCACACAGCGGCGCGGTGCCGCAAGAACAGACTGTCTGTGAGCCACCTAACCGTAGACTTGCGCGCGGATACCGGGGAACAGGATCTTGCAGCCACATGATACTCGATCGTAAGTACGGTTGTGCGGGGGAAACGCGCCAGCGTGTTACTGCGTTAGTCGGTAGACTGGGATCGACTATGTGTTAAATCAACCGACCACGGTTTTGGGACATCCTGTCAATATATCGTTTCCTTTTTATTACTTTGTTTCGAGCAGCAAATAGGTGGCCTTTACCCGCAATTACGAGTCGACCATTGCCAATCCCCGCACCGATTAGGATACAGCCTAGTGAGC';

// ---- 1. qPCR: solo parejas cortas y plausibles ----
const qpcr = designPrimers(TEMPLATE, 'qpcr', { topN: 10 });
check('qPCR: encuentra parejas', qpcr.pairs.length > 0, qpcr.pairs.length + ' parejas');
check('qPCR: todas dentro de [60,200] pb (su propio filtro)',
  qpcr.pairs.every((p) => p.size >= MODES.qpcr.ampliconMin && p.size <= MODES.qpcr.ampliconMax),
  qpcr.pairs.map((p) => p.size).join(','));
check('qPCR: da parejas de verdad cortas (≤150 pb), no solo "por debajo de 200"',
  qpcr.pairs.some((p) => p.size <= 150));
check('qPCR: ΔTm de la mejor pareja es pequeña (penaliza acercarse a 0)',
  qpcr.pairs[0].deltaTm < 1, 'ΔTm=' + qpcr.pairs[0].deltaTm.toFixed(2));
check('qPCR: las parejas vienen ordenadas de menor a mayor penalización',
  qpcr.pairs.every((p, i) => i === 0 || p.penalty >= qpcr.pairs[i - 1].penalty));

// ---- 2. PCR estándar: acepta productos largos que qPCR rechazaría ----
const std = designPrimers(TEMPLATE, 'standard', { topN: 10 });
check('estándar: encuentra parejas', std.pairs.length > 0, std.pairs.length + ' parejas');
check('estándar: todas dentro de [100,2000] pb', std.pairs.every((p) => p.size >= MODES.standard.ampliconMin && p.size <= MODES.standard.ampliconMax));
check('estándar: al menos una pareja supera el tope de qPCR (>200 pb) — esa la rechazaría qPCR',
  std.pairs.some((p) => p.size > MODES.qpcr.ampliconMax),
  std.pairs.map((p) => p.size).join(','));
check('qPCR de verdad no tiene ninguna pareja de ese tamaño (los rangos no se solapan en este resultado)',
  qpcr.pairs.every((p) => p.size <= MODES.qpcr.ampliconMax) && std.pairs.some((p) => p.size > MODES.qpcr.ampliconMax));

// ---- 3. especificidad: una secuencia duplicada en la plantilla se descarta ----
{
  const clean1 = 'CTACACGGCGAAAGCCTAAG'; // Tm/GC/horquilla/autodímero/homopolímero limpios
  const clean2 = 'ATTGGAACATGACAGAGTTG';
  const spacer = 'ACGTACGTACGTACGTACGTACGTACGTACGT';
  const dupTemplate = clean1 + spacer + clean1 + spacer + clean2; // clean1 aparece DOS veces
  // modo "standard" (rango de Tm más ancho, 50-60 °C): la especificidad es
  // el mismo filtro compartido en los dos modos, y así no depende de que
  // clean2 caiga justo en el borde del rango de Tm más estrecho de qPCR.
  const cands = generateCandidates(dupTemplate, MODES.standard);
  const dupFound = cands.some((c) => c.seq === clean1);
  check('especificidad: la secuencia duplicada NO aparece entre los candidatos',
    !dupFound, dupFound ? cands.map((c) => c.seq).join(' | ') : (cands.length + ' candidatos, ninguno es la duplicada'));
  check('especificidad: la secuencia única sí aparece', cands.some((c) => c.seq === clean2));
}

// ---- 4. "editable a mano": estrechar el tope de tamaño cambia lo aceptado ----
{
  const narrow = designPrimers(TEMPLATE, 'qpcr', { topN: 20, modeOverrides: { ampliconMax: 125 } });
  check('modo con tope de tamaño editado a mano: respeta el nuevo tope (≤125 pb)',
    narrow.pairs.length > 0 && narrow.pairs.every((p) => p.size <= 125),
    narrow.pairs.map((p) => p.size).join(','));
}

// ---- 5. confirmación final vía primerTemplate.js (misma función que la pestaña Plantilla) ----
{
  const top = qpcr.pairs[0];
  const conf = confirmSpecificity(TEMPLATE, top);
  check('confirmSpecificity(): cada primer de la mejor pareja aparece exactamente 1 vez',
    conf.forwardSites === 1 && conf.reverseSites === 1, JSON.stringify(conf));
}

// ---- 6. buenas prácticas de qPCR (IDT / PCR Biosystems / Bitesize Bio / MIQE): ----
// ΔTm ≤3 °C, y el extremo 3' en A/T penaliza más que en PCR estándar
// (regla más estricta para qPCR, no solo "recomendable" como en PCR
// convencional) — sin llegar a descartar el candidato (sigue sin ser un
// filtro `return null`).
{
  check('MODES.qpcr.maxDeltaTm es 3 °C (antes 5) — guía habitual para qPCR', MODES.qpcr.maxDeltaTm === 3);
  check('MODES.qpcr penaliza un 3\' fuera de G/C más que MODES.standard',
    MODES.qpcr.clampPenalty > MODES.standard.clampPenalty,
    'qpcr=' + MODES.qpcr.clampPenalty + ' standard=' + MODES.standard.clampPenalty);

  // candidato real (20 nt, Tm~59.4 dentro del rango de qPCR) con 3' en A/T
  const seq = 'GAAAGCGTCTGAGTCGTCCA';
  check('caso de prueba: su extremo 3\' es efectivamente A/T (clamp != ok)', gcClamp(seq).status !== 'ok', gcClamp(seq).status);

  const evQpcr = evaluateCandidate(seq, MODES.qpcr, {});
  const evQpcrNoClampPenalty = evaluateCandidate(seq, { ...MODES.qpcr, clampPenalty: 0 }, {});
  check('qPCR: el aviso de 3\' en A/T no descarta el candidato (evaluateCandidate no devuelve null)', !!evQpcr);
  check('qPCR: el aviso de 3\' en A/T añade exactamente mode.clampPenalty a la puntuación',
    !!evQpcr && !!evQpcrNoClampPenalty && Math.abs((evQpcr.penalty - evQpcrNoClampPenalty.penalty) - MODES.qpcr.clampPenalty) < 1e-9,
    evQpcr && evQpcrNoClampPenalty ? ('con=' + evQpcr.penalty.toFixed(3) + ' sin=' + evQpcrNoClampPenalty.penalty.toFixed(3)) : '');

  const evStd = evaluateCandidate(seq, MODES.standard, {});
  const evStdNoClampPenalty = evaluateCandidate(seq, { ...MODES.standard, clampPenalty: 0 }, {});
  check('PCR estándar: el mismo aviso pesa menos que en qPCR (guía menos estricta fuera de qPCR)',
    !!evStd && !!evStdNoClampPenalty && (evStd.penalty - evStdNoClampPenalty.penalty) < (evQpcr.penalty - evQpcrNoClampPenalty.penalty));
}

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
