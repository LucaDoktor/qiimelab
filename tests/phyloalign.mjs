// Sensatez del alineamiento (js/lib/phyloAlign.js), sin navegador:
// Needleman-Wunsch por pares con casos de huecos/identidad conocidos, y el
// alineamiento progresivo (perfil × perfil) sobre un árbol guía UPGMA real,
// comprobando que produce una MSA de anchura única y coherente.
//
//   node tests/phyloalign.mjs

import { APP_ROOT } from './lib/env.mjs';
const { needlemanWunsch, buildProgressiveAlignment } = await import(APP_ROOT + '/js/lib/phyloAlign.js');
const { pDistance } = await import(APP_ROOT + '/js/lib/phyloDistance.js');
const { upgma } = await import(APP_ROOT + '/js/lib/stats.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

// --- Needleman-Wunsch: casos de referencia a mano ---
{
  const { alignedA, alignedB, score } = needlemanWunsch('ACGTACGT', 'ACGTACGT', {});
  check('NW: secuencias idénticas -> sin huecos', alignedA === 'ACGTACGT' && alignedB === 'ACGTACGT');
  check('NW: secuencias idénticas -> score = longitud (match=1)', score === 8, 'score=' + score);
}
{
  // b tiene una G extra insertada en medio de a -> debe aparecer exactamente 1 hueco
  const { alignedA, alignedB } = needlemanWunsch('ACGTACGT', 'ACGTGACGT', {});
  check('NW: 1 inserción -> longitudes alineadas iguales', alignedA.length === alignedB.length);
  const gapsA = (alignedA.match(/-/g) || []).length, gapsB = (alignedB.match(/-/g) || []).length;
  check('NW: 1 inserción -> exactamente 1 hueco neto', Math.abs(gapsA - gapsB) === 1 || (gapsA === 1 && gapsB === 0) || (gapsB === 1 && gapsA === 0),
    'gapsA=' + gapsA + ' gapsB=' + gapsB);
}
{
  // completamente distintas, misma longitud -> alineamiento sin huecos (más barato
  // pagar mismatches que desplazar el marco con huecos)
  const { alignedA, alignedB } = needlemanWunsch('AAAAAAAA', 'TTTTTTTT', {});
  check('NW: máxima divergencia misma longitud -> sin huecos (más barato que desplazar)',
    !alignedA.includes('-') && !alignedB.includes('-'));
}

// --- alineamiento progresivo: MSA de anchura única y p-distance coherente ---
{
  // 4 secuencias: 2 casi idénticas, 1 con una inserción de 3nt, 1 bastante distinta
  const seqs = [
    'ACGTACGTACGTACGT',
    'ACGTACGAACGTACGT', // 1 sustitución
    'ACGTACGTAAACGTACGT', // 1 inserción de 3nt (AAA) en medio
    'TTTTACGTACGATTTTAC', // bastante distinta
  ];
  function guideDist(a, b) { const r = needlemanWunsch(a, b, {}); return pDistance(r.alignedA, r.alignedB); }
  const n = seqs.length;
  const gd = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = guideDist(seqs[i], seqs[j]); gd[i][j] = gd[j][i] = d; }
  const guideTree = upgma(gd, seqs.map((_, i) => String(i)));
  const alignedMap = buildProgressiveAlignment(seqs, guideTree, {});
  check('MSA: una secuencia alineada por cada entrada', alignedMap.size === n);
  const widths = new Set([...alignedMap.values()].map((s) => s.length));
  check('MSA: todas las secuencias alineadas comparten una única anchura', widths.size === 1, 'anchuras=' + [...widths]);
  const width = [...widths][0];
  check('MSA: la anchura es >= la secuencia más larga de entrada', width >= Math.max(...seqs.map((s) => s.length)));
  // reconstrucción sin huecos == secuencia original (el alineamiento no pierde ni inventa caracteres)
  seqs.forEach((orig, i) => {
    const reconstructed = alignedMap.get(i).replace(/-/g, '');
    check('MSA: secuencia ' + i + ' reconstruida (sin huecos) == original', reconstructed === orig);
  });
  // la pareja casi idéntica (0,1) debe salir con muchísima menos distancia que
  // la pareja bastante distinta (0,3), sobre el MISMO alineamiento final
  const alignedOrdered = seqs.map((_, i) => alignedMap.get(i));
  const dClose = pDistance(alignedOrdered[0], alignedOrdered[1]);
  const dFar = pDistance(alignedOrdered[0], alignedOrdered[3]);
  check('MSA: p-distance de la pareja casi idéntica << la de la pareja distinta',
    dClose < dFar * 0.3, 'dClose=' + dClose.toFixed(3) + ' dFar=' + dFar.toFixed(3));
}

// --- caso trivial: una sola secuencia ---
{
  const alignedMap = buildProgressiveAlignment(['ACGTACGT'], null, {});
  check('MSA de 1 secuencia: se devuelve tal cual', alignedMap.size === 1 && alignedMap.get(0) === 'ACGTACGT');
}

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
